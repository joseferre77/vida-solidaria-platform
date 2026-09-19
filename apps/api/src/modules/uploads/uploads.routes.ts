/**
 * Subida real de archivos para adjuntos de Proyectos/Tareas.
 *
 * Hasta ahora `ProjectAttachment`/`TaskAttachment` solo aceptaban un
 * `fileUrl` ya alojado en otro lado (el cliente tenía que subirlo a mano a
 * algún servicio externo y pegar el link) — no había ningún endpoint que
 * recibiera el archivo en sí. `@fastify/multipart` y `UPLOADS_DIR` ya
 * estaban en package.json/env.ts desde el Milestone 1 pero nunca se
 * conectaron a nada (`grep` no encuentra ningún uso real). Esta ruta cierra
 * ese hueco: recibe el archivo por multipart/form-data, lo valida (tipo y
 * tamaño), lo guarda en disco bajo UPLOADS_DIR/<año>/<mes>/<uuid>.<ext> y
 * devuelve `{ fileUrl, fileName, mimeType, size }` — el mismo shape que ya
 * esperan `POST /projects/:id/attachments` y `POST /tasks/:id/attachments`
 * (`attachmentSchema`/`taskAttachmentSchema` en projects.routes.ts), así que
 * el frontend hace 2 pasos (subir → adjuntar) sin tocar esas rutas.
 *
 * Servido de vuelta vía @fastify/static registrado en server.ts con prefix
 * "/uploads/" apuntando a la misma carpeta.
 */
import type { FastifyInstance } from "fastify"
import { randomUUID } from "node:crypto"
import { createWriteStream } from "node:fs"
import fs from "node:fs/promises"
import path from "node:path"
import { pipeline } from "node:stream/promises"
import { requireAuth } from "../../middleware/auth.middleware"
import { env } from "../../config/env"

/**
 * Whitelist deliberada por (mimetype → extensión de guardado). No se confía
 * en la extensión que manda el cliente ni se infiere del nombre original:
 * la extensión en disco sale SIEMPRE de acá, a partir del mimetype que
 * reporta el multipart parser. Cualquier tipo fuera de esta lista (en
 * particular ejecutables, scripts, HTML/SVG que podrían ejecutar JS) se
 * rechaza con 415.
 */
const ALLOWED_MIME_EXT: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/gif": ".gif",
  "image/webp": ".webp",
  "application/pdf": ".pdf",
  "application/msword": ".doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ".docx",
  "application/vnd.ms-excel": ".xls",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": ".xlsx",
  "application/vnd.ms-powerpoint": ".ppt",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": ".pptx",
  "text/csv": ".csv",
  "text/plain": ".txt",
  "application/zip": ".zip",
}

const MAX_FILE_SIZE = 20 * 1024 * 1024 // 20MB — generoso para PDFs escaneados/fotos de recibos, corta antes de convertirse en problema de disco/inodos en el hosting compartido.

export async function uploadsRoutes(app: FastifyInstance) {
  app.post("/uploads", { preHandler: [requireAuth] }, async (request, reply) => {
    const data = await request.file({ limits: { fileSize: MAX_FILE_SIZE, files: 1 } })
    if (!data) {
      return reply.code(400).send({ error: "No se envió ningún archivo (campo multipart esperado)" })
    }

    const ext = ALLOWED_MIME_EXT[data.mimetype]
    if (!ext) {
      return reply.code(415).send({ error: `Tipo de archivo no permitido: ${data.mimetype}` })
    }

    const now = new Date()
    const subdir = path.posix.join(String(now.getFullYear()), String(now.getMonth() + 1).padStart(2, "0"))
    const dir = path.resolve(env.UPLOADS_DIR, subdir)
    await fs.mkdir(dir, { recursive: true })

    const storedName = `${randomUUID()}${ext}`
    const absolutePath = path.join(dir, storedName)

    try {
      await pipeline(data.file, createWriteStream(absolutePath))
    } catch (err) {
      request.log.error(err, "Error al escribir archivo subido")
      return reply.code(500).send({ error: "Error al guardar el archivo" })
    }

    // @fastify/multipart trunca el stream (en vez de tirar error) cuando se
    // pasa el límite de tamaño — hay que chequear la bandera después de
    // consumir el stream entero, y si pasó, borrar el archivo parcial.
    if (data.file.truncated) {
      await fs.unlink(absolutePath).catch(() => {})
      return reply.code(413).send({ error: "El archivo supera el máximo permitido (20MB)" })
    }

    const stat = await fs.stat(absolutePath)
    const publicPath = `/uploads/${subdir}/${storedName}`

    return reply.code(201).send({
      fileUrl: `${env.PUBLIC_API_URL}${publicPath}`,
      fileName: data.filename,
      mimeType: data.mimetype,
      size: stat.size,
    })
  })
}
