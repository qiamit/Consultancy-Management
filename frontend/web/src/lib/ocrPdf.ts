import { loadPdfjs } from '@/lib/pdfjsLoader'

/** Rendering resolution for OCR: about 200 DPI reads small table text well without very large pictures. */
const OCR_DPI = 200
const OCR_MAX_SIDE_PX = 3000

/**
 * Reads the text of a scanned PDF (pages that are pictures) in the browser with Tesseract OCR, so a text-only AI
 * model can still check it. Page markers are kept so the AI can cite pages. Slow (a few seconds a page): call it
 * only when the PDF has no selectable text.
 */
export async function ocrPdfText(
  file: File,
  options: { maxPages?: number; onPage?: (page: number, total: number) => void } = {},
): Promise<string> {
  const { getDocument } = await loadPdfjs()
  const { createWorker } = await import('tesseract.js')
  const task = getDocument({ data: new Uint8Array(await file.arrayBuffer()) })
  const pdf = await task.promise
  const worker = await createWorker('eng')
  try {
    const total = Math.min(pdf.numPages, options.maxPages ?? 30)
    const parts: string[] = []
    for (let n = 1; n <= total; n += 1) {
      options.onPage?.(n, total)
      const page = await pdf.getPage(n)
      const base = page.getViewport({ scale: 1 })
      const scale = Math.min(OCR_DPI / 72, OCR_MAX_SIDE_PX / Math.max(base.width, base.height, 1))
      const viewport = page.getViewport({ scale })
      const canvas = document.createElement('canvas')
      canvas.width = Math.max(1, Math.floor(viewport.width))
      canvas.height = Math.max(1, Math.floor(viewport.height))
      await page.render({ canvas, viewport, background: '#ffffff' }).promise
      page.cleanup()
      const { data } = await worker.recognize(canvas)
      canvas.width = 0
      canvas.height = 0
      const text = String(data.text ?? '')
        .replace(/[ \t]+/g, ' ')
        .replace(/\n{3,}/g, '\n\n')
        .trim()
      if (text) parts.push(`[Page ${n}]\n${text}`)
    }
    return parts.join('\n')
  } finally {
    void worker.terminate()
    void task.destroy()
  }
}
