/**
 * Post-Fase-K (pedido de Josecito 21/09/2026) — utilidades de exportación
 * para los 4 reportes de /analitica (general, casos, cocina, proyectos),
 * cada uno bajable en CSV o PDF, con encabezado y pie de página de Vida
 * Solidaria en ambos formatos.
 *
 * Todo corre en el navegador (sin endpoint de "generar reporte" en el
 * backend) — los datos ya vienen de /api/analytics/export/* o de lo que
 * la propia página /analitica ya tiene cargado en memoria; acá solo se
 * formatea y se dispara la descarga.
 *
 * CSV: delimitador `;` (no `,`) — Excel en configuración regional
 * Argentina usa coma como separador decimal, así que toma `;` como
 * separador de lista de forma nativa al abrir el archivo con doble clic
 * (con `,` como delimitador, Excel-AR mete todo en una sola columna).
 * Se antepone BOM UTF-8 para que tildes/ñ se vean bien.
 *
 * PDF: jsPDF + jspdf-autotable, formato A4 vertical, listo para
 * imprimir/exportar — logo + título en el header de cada página, pie con
 * "Vida Solidaria MDP" + fecha de generación + número de página.
 */
import jsPDF from "jspdf"
import autoTable from "jspdf-autotable"

const BRAND_PURPLE_DEEP: [number, number, number] = [58, 10, 92]
const BRAND_YELLOW: [number, number, number] = [255, 212, 0]

let cachedLogoDataUrl: string | null | undefined

async function loadLogoDataUrl(): Promise<string | null> {
  if (cachedLogoDataUrl !== undefined) return cachedLogoDataUrl
  try {
    const res = await fetch("/brand/logo.png")
    const blob = await res.blob()
    cachedLogoDataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result as string)
      reader.onerror = reject
      reader.readAsDataURL(blob)
    })
  } catch {
    cachedLogoDataUrl = null // sin logo, el PDF sale igual — solo sin la imagen
  }
  return cachedLogoDataUrl
}

function csvEscape(value: string | number): string {
  const s = String(value ?? "")
  if (s.includes(";") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`
  }
  return s
}

/** Dispara la descarga de un archivo CSV (bien formateado para Excel-AR). */
export function downloadCsv(filename: string, headers: string[], rows: (string | number)[][]) {
  const lines = [headers, ...rows].map((row) => row.map(csvEscape).join(";"))
  const csvContent = "﻿" + lines.join("\r\n")
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" })
  triggerDownload(blob, filename)
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

function formatDateTimeAR(d: Date) {
  return d.toLocaleString("es-AR", { dateStyle: "short", timeStyle: "short" })
}

/**
 * Arma un documento PDF con el header/footer de marca ya resuelto (se
 * repite en cada página vía el hook `didDrawPage` de autoTable). Devuelve
 * el `doc` de jsPDF listo para agregar tablas (`autoTable(doc, {...})`) o
 * texto libre, y una función `finish()` para guardar el archivo.
 */
export async function createBrandedPdf(reportTitle: string) {
  const doc = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" })
  const logo = await loadLogoDataUrl()
  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()
  const generatedAt = formatDateTimeAR(new Date())

  function drawHeaderFooter() {
    // Header: franja violeta + logo + título del reporte
    doc.setFillColor(...BRAND_PURPLE_DEEP)
    doc.rect(0, 0, pageWidth, 56, "F")
    if (logo) {
      try {
        doc.addImage(logo, "PNG", 24, 10, 36, 36)
      } catch {
        // si el logo no decodifica como PNG (ej. viene en otro formato),
        // seguimos sin imagen — no es motivo para no generar el reporte.
      }
    }
    doc.setTextColor(...BRAND_YELLOW)
    doc.setFont("helvetica", "bold")
    doc.setFontSize(14)
    doc.text("Vida Solidaria MDP", logo ? 68 : 24, 26)
    doc.setTextColor(255, 255, 255)
    doc.setFont("helvetica", "normal")
    doc.setFontSize(10)
    doc.text(reportTitle, logo ? 68 : 24, 42)

    // Footer: generado el ... + página X de Y
    const pageCount = doc.getNumberOfPages()
    const pageNum = doc.getCurrentPageInfo().pageNumber
    doc.setTextColor(120, 120, 120)
    doc.setFontSize(8)
    doc.text(`Generado ${generatedAt} · Vida Solidaria MDP`, 24, pageHeight - 20)
    doc.text(`Página ${pageNum} de ${pageCount}`, pageWidth - 90, pageHeight - 20)
  }

  return {
    doc,
    marginTop: 72,
    drawHeaderFooter,
    /** Guarda el archivo — repinta el footer de todas las páginas (el
     * total de páginas solo se sabe al final, autoTable ya dibujó cada
     * una con `didDrawPage`, así que acá solo se corrige el "de Y"). */
    finish(filename: string) {
      const total = doc.getNumberOfPages()
      for (let i = 1; i <= total; i++) {
        doc.setPage(i)
        doc.setFillColor(255, 255, 255)
        doc.rect(pageWidth - 100, pageHeight - 30, 100, 16, "F")
        doc.setTextColor(120, 120, 120)
        doc.setFontSize(8)
        doc.text(`Página ${i} de ${total}`, pageWidth - 90, pageHeight - 20)
      }
      doc.save(filename)
    },
  }
}

export interface PdfTableSection {
  heading?: string
  head: string[]
  body: (string | number)[][]
}

/** Reporte con una o más tablas (casos / cocina / proyectos / general). */
export async function downloadTablePdf(reportTitle: string, filename: string, sections: PdfTableSection[]) {
  const { doc, marginTop, drawHeaderFooter, finish } = await createBrandedPdf(reportTitle)
  let startY = marginTop
  for (const section of sections) {
    if (section.heading) {
      doc.setTextColor(40, 40, 40)
      doc.setFont("helvetica", "bold")
      doc.setFontSize(11)
      doc.text(section.heading, 24, startY)
      startY += 14
    }
    autoTable(doc, {
      head: [section.head],
      body: section.body,
      startY,
      margin: { top: marginTop },
      styles: { fontSize: 8, cellPadding: 4 },
      headStyles: { fillColor: BRAND_PURPLE_DEEP, textColor: 255 },
      didDrawPage: drawHeaderFooter,
    })
    // @ts-expect-error — jspdf-autotable cuelga esto del doc en runtime
    startY = doc.lastAutoTable.finalY + 24
  }
  finish(filename)
}

/** Reporte "general": lista de KPIs sueltos (sin tabla) por sección. */
export async function downloadKpiPdf(
  reportTitle: string,
  filename: string,
  sections: { heading: string; items: { label: string; value: string | number }[] }[],
) {
  const { doc, marginTop, drawHeaderFooter, finish } = await createBrandedPdf(reportTitle)
  drawHeaderFooter()
  let y = marginTop
  const pageHeight = doc.internal.pageSize.getHeight()
  for (const section of sections) {
    if (y > pageHeight - 80) {
      doc.addPage()
      drawHeaderFooter()
      y = marginTop
    }
    doc.setTextColor(40, 40, 40)
    doc.setFont("helvetica", "bold")
    doc.setFontSize(12)
    doc.text(section.heading, 24, y)
    y += 18
    doc.setFont("helvetica", "normal")
    doc.setFontSize(10)
    for (const item of section.items) {
      if (y > pageHeight - 60) {
        doc.addPage()
        drawHeaderFooter()
        y = marginTop
      }
      doc.setTextColor(90, 90, 90)
      doc.text(item.label, 32, y)
      doc.setTextColor(20, 20, 20)
      doc.setFont("helvetica", "bold")
      doc.text(String(item.value), 300, y)
      doc.setFont("helvetica", "normal")
      y += 16
    }
    y += 10
  }
  finish(filename)
}
