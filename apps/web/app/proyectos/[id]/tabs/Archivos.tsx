"use client"

import { useRef, useState } from "react"
import { addProjectAttachment, deleteProjectAttachment, uploadFile, type ProjectAttachmentItem } from "../../../../lib/projects"
import { formatDateTime } from "../../../../lib/format"

function extensionIcon(fileName: string) {
  const ext = fileName.split(".").pop()?.toLowerCase() ?? ""
  if (["jpg", "jpeg", "png", "gif", "webp"].includes(ext)) return "🖼️"
  if (ext === "pdf") return "📄"
  if (["doc", "docx"].includes(ext)) return "📝"
  if (["xls", "xlsx", "csv"].includes(ext)) return "📊"
  if (["ppt", "pptx"].includes(ext)) return "📽️"
  if (ext === "zip") return "🗜️"
  return "📎"
}

/** Fase E — "Archivos": usa el endpoint real de subida (POST /api/uploads) construido en la "cañería" anterior. */
export function Archivos({
  projectId,
  attachments,
  canWrite,
  onChanged,
}: {
  projectId: string
  attachments: ProjectAttachmentItem[]
  canWrite: boolean
  onChanged: () => void
}) {
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return
    setUploading(true)
    setError(null)
    try {
      for (const file of Array.from(files)) {
        const uploaded = await uploadFile(file)
        await addProjectAttachment(projectId, { fileUrl: uploaded.fileUrl, fileName: uploaded.fileName })
      }
      onChanged()
    } catch (e: any) {
      setError(e.message ?? "No se pudo subir el archivo")
    } finally {
      setUploading(false)
      if (inputRef.current) inputRef.current.value = ""
    }
  }

  return (
    <div className="max-w-3xl">
      {canWrite && (
        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault()
            handleFiles(e.dataTransfer.files)
          }}
          className="mb-5 flex flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-white/20 p-8 text-center hover:border-yellow/40"
        >
          <p className="text-sm text-cream/70">Arrastrá archivos acá, o</p>
          <button
            onClick={() => inputRef.current?.click()}
            disabled={uploading}
            className="rounded-xl bg-yellow px-4 py-2 text-sm font-semibold text-purple-deep hover:opacity-90 disabled:opacity-50"
          >
            {uploading ? "Subiendo..." : "Elegir archivo"}
          </button>
          <input ref={inputRef} type="file" multiple className="hidden" onChange={(e) => handleFiles(e.target.files)} />
          <p className="text-[11px] text-cream/40">Imágenes, PDF, Word/Excel/PowerPoint, CSV, TXT o ZIP — máx. 20MB</p>
          {error && <p className="text-xs text-orange">{error}</p>}
        </div>
      )}

      <div className="space-y-2">
        {attachments.map((a) => (
          <a
            key={a.id}
            href={a.fileUrl}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 px-3 py-2 hover:border-yellow/30"
          >
            <span className="text-lg">{extensionIcon(a.fileName)}</span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm text-cream">{a.fileName}</p>
              <p className="text-[11px] text-cream/40">{formatDateTime(a.createdAt)}</p>
            </div>
            {canWrite && (
              <button
                onClick={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  if (!confirm(`¿Eliminar "${a.fileName}"?`)) return
                  deleteProjectAttachment(a.id).then(onChanged)
                }}
                className="shrink-0 text-cream/30 hover:text-orange"
              >
                ✕
              </button>
            )}
          </a>
        ))}
        {attachments.length === 0 && <p className="text-sm text-cream/50">Todavía no hay archivos.</p>}
      </div>
    </div>
  )
}
