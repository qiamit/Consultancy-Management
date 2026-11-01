import { loadPdfjs } from '@/lib/pdfjsLoader'

/** Rendering resolution for OCR: 300 DPI reads small table figures reliably. */
const OCR_DPI = 300
const OCR_MAX_SIDE_PX = 3600
/** Darker than this (0–255 grey) counts as ink. */
const INK_BELOW = 165
/** Ink runs at least this share of the page width / height are table rules, not letters. */
const RULE_MIN_WIDTH = 0.08
const RULE_MIN_HEIGHT = 0.03

/**
 * Black-and-white copy of the page with the table rules wiped out: Tesseract reads bordered tables (test results)
 * badly while the grid lines are there.
 */
function cleanForOcr(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) return
  const w = canvas.width
  const h = canvas.height
  const image = ctx.getImageData(0, 0, w, h)
  const px = image.data
  const ink = new Uint8Array(w * h)
  for (let p = 0, i = 0; p < w * h; p += 1, i += 4) {
    ink[p] = 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2] < INK_BELOW ? 1 : 0
  }
  const rule = new Uint8Array(w * h)
  const minRow = Math.round(w * RULE_MIN_WIDTH)
  const minCol = Math.round(h * RULE_MIN_HEIGHT)
  for (let y = 0; y < h; y += 1) {
    let start = -1
    for (let x = 0; x <= w; x += 1) {
      const on = x < w && ink[y * w + x] === 1
      if (on && start < 0) start = x
      if (!on && start >= 0) {
        if (x - start >= minRow) rule.fill(1, y * w + start, y * w + x)
        start = -1
      }
    }
  }
  for (let x = 0; x < w; x += 1) {
    let start = -1
    for (let y = 0; y <= h; y += 1) {
      const on = y < h && ink[y * w + x] === 1
      if (on && start < 0) start = y
      if (!on && start >= 0) {
        if (y - start >= minCol) for (let k = start; k < y; k += 1) rule[k * w + x] = 1
        start = -1
      }
    }
  }
  for (let p = 0, i = 0; p < w * h; p += 1, i += 4) {
    const v = ink[p] === 1 && rule[p] === 0 ? 0 : 255
    px[i] = v
    px[i + 1] = v
    px[i + 2] = v
  }
  ctx.putImageData(image, 0, 0)
}

const tidy = (text: string) =>
  String(text ?? '')
    .replace(/[ \t]{2,}/g, ' | ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()

/**
 * Reads the text of a scanned PDF (pages that are pictures) in the browser with Tesseract OCR, so a text-only AI
 * model can still check it. Each page is read twice (as a text block, and as columns) because each way misses or
 * misreads different table cells; both readings go to the AI with page markers. Slow (a few seconds a page): call
 * it only when the PDF has no selectable text.
 */
export async function ocrPdfText(
  file: File,
  options: { maxPages?: number; onPage?: (page: number, total: number) => void } = {},
): Promise<string> {
  const { getDocument } = await loadPdfjs()
  const mod = await import('tesseract.js')
  // CommonJS package: the named exports may only be on `default`, depending on the bundler.
  const tesseract = 'createWorker' in mod && typeof mod.createWorker === 'function' ? mod : (mod as unknown as { default: typeof mod }).default
  const task = getDocument({ data: new Uint8Array(await file.arrayBuffer()) })
  const pdf = await task.promise
  const worker = await tesseract.createWorker('eng')
  try {
    await worker.setParameters({ preserve_interword_spaces: '1' })
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
      cleanForOcr(canvas)
      const reads: string[] = []
      for (const mode of [tesseract.PSM.SINGLE_BLOCK, tesseract.PSM.SINGLE_COLUMN]) {
        await worker.setParameters({ tessedit_pageseg_mode: mode })
        const { data } = await worker.recognize(canvas)
        reads.push(tidy(data.text))
      }
      canvas.width = 0
      canvas.height = 0
      const [a, b] = reads
      if (a && b && a !== b) parts.push(`[Page ${n} — OCR read 1]\n${a}\n[Page ${n} — OCR read 2]\n${b}`)
      else if (a || b) parts.push(`[Page ${n}]\n${a || b}`)
    }
    return parts.join('\n')
  } finally {
    void worker.terminate()
    void task.destroy()
  }
}
