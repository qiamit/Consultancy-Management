import { PDFDocument } from 'pdf-lib'
import { loadPdfjs } from '@/lib/pdfjsLoader'

/** Below this a PDF is uploaded as it is. */
const SMALL_ENOUGH = 250 * 1024
/** Size the compression aims for. */
const TARGET_BYTES = 1024 * 1024
/**
 * Picture steps for scanned pages, best first: the first step that brings the file under TARGET_BYTES is used.
 * Resolution matters more than JPEG quality for reading small table figures (people and OCR), so 150 DPI is kept
 * while the quality steps down; 130 DPI is the last resort.
 */
const STEPS = [
  { dpi: 150, quality: 0.6 },
  { dpi: 150, quality: 0.48 },
  { dpi: 150, quality: 0.38 },
  { dpi: 150, quality: 0.3 },
  { dpi: 130, quality: 0.35 },
]
const MAX_SIDE_PX = 2200
/** Very long PDFs are only re-saved (rendering every page would take too long in the browser). */
const MAX_RENDER_PAGES = 60
/** A page with at least this much selectable text is a text page: it is kept exactly as it is. */
const TEXT_PAGE_MIN_CHARS = 60
/** The rebuilt copy is used only when it is clearly smaller. */
const REBUILD_MAX_RATIO = 0.85

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

type PdfJsDoc = Awaited<ReturnType<Awaited<ReturnType<typeof loadPdfjs>>['getDocument']>['promise']>
type Step = (typeof STEPS)[number]

/** Page numbers (1-based) that are pictures: too little selectable text to be a text page. */
async function scannedPages(pdf: PdfJsDoc): Promise<number[]> {
  const pages: number[] = []
  for (let n = 1; n <= pdf.numPages; n += 1) {
    const content = await (await pdf.getPage(n)).getTextContent()
    const chars = content.items.reduce((sum, item) => sum + ('str' in item ? String(item.str ?? '').replace(/\s/g, '').length : 0), 0)
    if (chars < TEXT_PAGE_MIN_CHARS) pages.push(n)
  }
  return pages
}

/** One scanned page drawn as a JPEG at the step's resolution and quality. */
async function pageJpeg(pdf: PdfJsDoc, n: number, step: Step): Promise<{ jpg: Uint8Array; width: number; height: number } | null> {
  const page = await pdf.getPage(n)
  const base = page.getViewport({ scale: 1 })
  const scale = Math.min(step.dpi / 72, MAX_SIDE_PX / Math.max(base.width, base.height, 1))
  const viewport = page.getViewport({ scale })
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.floor(viewport.width))
  canvas.height = Math.max(1, Math.floor(viewport.height))
  await page.render({ canvas, viewport, background: '#ffffff' }).promise
  page.cleanup()
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', step.quality))
  canvas.width = 0
  canvas.height = 0
  return blob ? { jpg: new Uint8Array(await blob.arrayBuffer()), width: base.width, height: base.height } : null
}

/**
 * The PDF rebuilt page by page: text pages copied unchanged (their text stays selectable for search and the AI
 * check), scanned pages replaced by a JPEG of the same page size. A Manak Test Report is such a mix — Manak's own
 * pages are text, the laboratory's attached report is scanned.
 */
async function rebuild(data: ArrayBuffer, pdf: PdfJsDoc, scanned: Set<number>, step: Step): Promise<Uint8Array | null> {
  const source = await PDFDocument.load(data, { ignoreEncryption: true })
  const out = await PDFDocument.create()
  for (let n = 1; n <= pdf.numPages; n += 1) {
    if (!scanned.has(n)) {
      const [copied] = await out.copyPages(source, [n - 1])
      out.addPage(copied)
      continue
    }
    const picture = await pageJpeg(pdf, n, step)
    if (!picture) return null
    const image = await out.embedJpg(picture.jpg)
    out.addPage([picture.width, picture.height]).drawImage(image, { x: 0, y: 0, width: picture.width, height: picture.height })
  }
  return out.save({ useObjectStreams: true })
}

/**
 * Makes a PDF as small as it can be while staying readable, before it is uploaded: a lossless re-save, then — when
 * it has scanned pages — a rebuild with those pages as JPEGs at 150 DPI, stepping the JPEG quality down until the
 * file is under 1 MB. Text pages are never turned into pictures. Anything that fails, or does not shrink,
 * keeps the original file. Non-PDF files are returned unchanged.
 */
export async function compressPdfForUpload(file: File): Promise<CompressedPdf> {
  const before = file.size
  const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name)
  if (!isPdf || before <= SMALL_ENOUGH) return { file, before, after: before, method: 'original' }
  const data = await file.arrayBuffer()
  let best: CompressedPdf = { file, before, after: before, method: 'original' }
  const saved = await resave(data)
  if (saved && saved.byteLength < best.after) best = { file: asFile(saved, file.name), before, after: saved.byteLength, method: 'resaved' }
  if (best.after <= TARGET_BYTES) return best

  const { getDocument } = await loadPdfjs()
  const task = getDocument({ data: new Uint8Array(data.slice(0)) })
  try {
    const pdf = await task.promise
    if (pdf.numPages > MAX_RENDER_PAGES) return best
    const scanned = new Set(await scannedPages(pdf))
    if (!scanned.size) return best
    for (const step of STEPS) {
      const bytes = await rebuild(data, pdf, scanned, step).catch(() => null)
      if (!bytes) break
      // The first rebuild must clearly beat the re-save; after that any smaller step wins.
      if (bytes.byteLength < (best.method === 'images' ? best.after : best.after * REBUILD_MAX_RATIO)) {
        best = { file: asFile(bytes, file.name), before, after: bytes.byteLength, method: 'images' }
      }
      if (bytes.byteLength <= TARGET_BYTES) break
    }
  } catch {
    // Keep the best copy found so far.
  } finally {
    void task.destroy()
  }
  return best
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}
