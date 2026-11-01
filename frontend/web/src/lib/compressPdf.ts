import { PDFDocument } from 'pdf-lib'
import { loadPdfjs } from '@/lib/pdfjsLoader'

/** Below this a PDF is uploaded as it is. */
const SMALL_ENOUGH = 250 * 1024
/** Rendering resolution of the image copy: about 130 DPI keeps report text and tables clearly readable. */
const RENDER_DPI = 130
const MAX_SIDE_PX = 2000
const JPEG_QUALITY = 0.72
/** Very long PDFs are only re-saved (rendering every page would take too long in the browser). */
const MAX_RENDER_PAGES = 60
/** The image copy loses selectable text, so it is used only when it is clearly smaller. */
const IMAGE_COPY_MAX_RATIO = 0.7

export type CompressedPdf = { file: File; before: number; after: number; method: 'original' | 'resaved' | 'images' }

function asFile(bytes: Uint8Array, name: string): File {
  // Copy into a plain ArrayBuffer (File parts may not be SharedArrayBuffer views).
  return new File([bytes.slice().buffer as ArrayBuffer], name, { type: 'application/pdf' })
}

/** Lossless: the same PDF saved again with compressed object streams. */
async function resave(data: ArrayBuffer): Promise<Uint8Array | null> {
  try {
    const doc = await PDFDocument.load(data, { ignoreEncryption: true })
    return await doc.save({ useObjectStreams: true })
  } catch {
    return null
  }
}

/** Selectable text on the first pages: such a PDF keeps its text (the AI check and search read it). */
const TEXT_PDF_MIN_CHARS = 200

/**
 * Every page drawn as a JPEG at ~130 DPI into a new PDF of the same page sizes (scans shrink a lot). Only for scanned
 * PDFs: a PDF with selectable text is never turned into pictures.
 */
async function imageCopy(data: ArrayBuffer): Promise<Uint8Array | null> {
  const { getDocument } = await loadPdfjs()
  const task = getDocument({ data: new Uint8Array(data.slice(0)) })
  const pdf = await task.promise
  try {
    if (pdf.numPages > MAX_RENDER_PAGES) return null
    let chars = 0
    for (let n = 1; n <= Math.min(pdf.numPages, 3) && chars < TEXT_PDF_MIN_CHARS; n += 1) {
      const content = await (await pdf.getPage(n)).getTextContent()
      chars += content.items.reduce((sum, item) => sum + ('str' in item ? String(item.str ?? '').trim().length : 0), 0)
    }
    if (chars >= TEXT_PDF_MIN_CHARS) return null
    const out = await PDFDocument.create()
    for (let n = 1; n <= pdf.numPages; n += 1) {
      const page = await pdf.getPage(n)
      const base = page.getViewport({ scale: 1 })
      const scale = Math.min(RENDER_DPI / 72, MAX_SIDE_PX / Math.max(base.width, base.height, 1))
      const viewport = page.getViewport({ scale })
      const canvas = document.createElement('canvas')
      canvas.width = Math.max(1, Math.floor(viewport.width))
      canvas.height = Math.max(1, Math.floor(viewport.height))
      await page.render({ canvas, viewport, background: '#ffffff' }).promise
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY))
      page.cleanup()
      if (!blob) return null
      const image = await out.embedJpg(new Uint8Array(await blob.arrayBuffer()))
      const target = out.addPage([base.width, base.height])
      target.drawImage(image, { x: 0, y: 0, width: base.width, height: base.height })
      canvas.width = 0
      canvas.height = 0
    }
    return await out.save({ useObjectStreams: true })
  } catch {
    return null
  } finally {
    void task.destroy()
  }
}

/**
 * Makes a PDF as small as it can be while staying readable, before it is uploaded: a lossless re-save, and (scanned
 * PDFs only) an image copy at ~130 DPI that is used only when it is at least 30 % smaller. Anything that fails, or does not
 * shrink, keeps the original file. Non-PDF files are returned unchanged.
 */
export async function compressPdfForUpload(file: File): Promise<CompressedPdf> {
  const before = file.size
  const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name)
  if (!isPdf || before <= SMALL_ENOUGH) return { file, before, after: before, method: 'original' }
  const data = await file.arrayBuffer()
  let best: CompressedPdf = { file, before, after: before, method: 'original' }
  const saved = await resave(data)
  if (saved && saved.byteLength < best.after) best = { file: asFile(saved, file.name), before, after: saved.byteLength, method: 'resaved' }
  const images = await imageCopy(data)
  if (images && images.byteLength < best.after * IMAGE_COPY_MAX_RATIO) {
    best = { file: asFile(images, file.name), before, after: images.byteLength, method: 'images' }
  }
  return best
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}
