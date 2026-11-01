// Reads IS documents on the server for the Admin Agent: selectable text per page, and Tesseract OCR for scanned pages.

/** A page with less selectable text than this is a scanned picture. */
const SCANNED_PAGE_BELOW = 60
const DOC_CACHE_SIZE = 16
/** OCR is slow (seconds a page): at most this many pages in one call, the rest on the next call. */
const OCR_PAGES_PER_CALL = 12
const OCR_DPI = 250
const OCR_MAX_SIDE_PX = 3200
/** Darker than this (0–255 grey) counts as ink. */
const INK_BELOW = 165
/** Ink runs at least this share of the page width / height are table rules, not letters. */
const RULE_MIN_WIDTH = 0.08
const RULE_MIN_HEIGHT = 0.03

/** pdf.js with the native canvas when it loads (needed for OCR); without it only selectable text can be read. */
async function loadPdfjs() {
  const canvasLib = await import('@napi-rs/canvas').catch(() => null)
  if (!canvasLib) {
    // Drawing classes pdf.js expects at load; reading text never uses them.
    globalThis.DOMMatrix ??= class DOMMatrix {}
    globalThis.Path2D ??= class Path2D {}
    globalThis.ImageData ??= class ImageData {}
  }
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
  return { pdfjs, canvasLib }
}

/** Items in one line by height, with a gap kept between table cells. */
function pageText(items) {
  const lines = new Map()
  for (const item of items) {
    const str = String(item?.str ?? '')
    if (!str.trim()) continue
    const y = Math.round(Number(item.transform?.[5] ?? 0) / 3)
    if (!lines.has(y)) lines.set(y, [])
    const x = Number(item.transform?.[4] ?? 0)
    lines.get(y).push({ str: str.trim(), x, end: x + Number(item.width ?? 0) })
  }
  return [...lines.keys()].sort((a, b) => b - a).map((y) => {
    const cells = lines.get(y).sort((a, b) => a.x - b.x)
    return cells.reduce((acc, c, i) => acc + (i === 0 ? '' : c.x - cells[i - 1].end > 12 ? ' | ' : ' ') + c.str, '')
  }).join('\n')
}

/** Greys the page and wipes table rules: Tesseract reads bordered tables badly while the grid lines are there. */
function cleanForOcr(canvas) {
  const ctx = canvas.getContext('2d')
  const w = canvas.width
  const h = canvas.height
  const image = ctx.getImageData(0, 0, w, h)
  const px = image.data
  const grey = new Uint8Array(w * h)
  for (let p = 0, i = 0; p < w * h; p += 1, i += 4) grey[p] = 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2]
  const rule = new Uint8Array(w * h)
  const minRow = Math.round(w * RULE_MIN_WIDTH)
  const minCol = Math.round(h * RULE_MIN_HEIGHT)
  for (let y = 0; y < h; y += 1) {
    let start = -1
    for (let x = 0; x <= w; x += 1) {
      const on = x < w && grey[y * w + x] < INK_BELOW
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
      const on = y < h && grey[y * w + x] < INK_BELOW
      if (on && start < 0) start = y
      if (!on && start >= 0) {
        if (y - start >= minCol) for (let k = start; k < y; k += 1) rule[k * w + x] = 1
        start = -1
      }
    }
  }
  for (let p = 0, i = 0; p < w * h; p += 1, i += 4) {
    const v = rule[p] === 1 ? 255 : grey[p]
    px[i] = v
    px[i + 1] = v
    px[i + 2] = v
  }
  ctx.putImageData(image, 0, 0)
}

/** Text of chosen scanned pages by OCR. Returns page number → text; a page that fails is left out. */
async function ocrPages(bytes, pageNumbers) {
  const { pdfjs, canvasLib } = await loadPdfjs()
  if (!canvasLib) return new Map()
  const { createWorker, PSM } = await import('tesseract.js')
  const task = pdfjs.getDocument({ data: new Uint8Array(bytes), verbosity: 0 })
  const pdf = await task.promise
  // The server runs as an unprivileged user: only /tmp is writable for the language data.
  const worker = await createWorker('eng', 1, { cachePath: '/tmp/qe-tessdata' })
  const out = new Map()
  try {
    await worker.setParameters({ preserve_interword_spaces: '1', tessedit_pageseg_mode: PSM.AUTO })
    for (const n of pageNumbers) {
      const page = await pdf.getPage(n)
      const base = page.getViewport({ scale: 1 })
      const scale = Math.min(OCR_DPI / 72, OCR_MAX_SIDE_PX / Math.max(base.width, base.height, 1))
      const viewport = page.getViewport({ scale })
      const canvas = canvasLib.createCanvas(Math.max(1, Math.floor(viewport.width)), Math.max(1, Math.floor(viewport.height)))
      const ctx = canvas.getContext('2d')
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      await page.render({ canvas, canvasContext: ctx, viewport }).promise
      page.cleanup()
      cleanForOcr(canvas)
      const { data } = await worker.recognize(canvas.toBuffer('image/png'))
      const text = String(data.text ?? '').replace(/[ \t]{2,}/g, ' | ').replace(/\n{3,}/g, '\n\n').trim()
      if (text) out.set(n, text)
    }
  } finally {
    void worker.terminate()
    void task.destroy()
  }
  return out
}

/** Read documents stay in memory for a while: a standard is usually read in several calls. */
const docCache = new Map()

async function loadDocument(path, download) {
  if (docCache.has(path)) return docCache.get(path)
  const bytes = await download()
  const { pdfjs } = await loadPdfjs()
  const task = pdfjs.getDocument({ data: new Uint8Array(bytes.slice(0)), verbosity: 0 })
  try {
    const pdf = await task.promise
    const pages = []
    for (let n = 1; n <= pdf.numPages; n += 1) {
      const page = await pdf.getPage(n)
      pages.push(pageText((await page.getTextContent()).items))
      page.cleanup()
    }
    const scanned = new Set(pages.flatMap((p, i) => (p.replace(/\s/g, '').length < SCANNED_PAGE_BELOW ? [i + 1] : [])))
    const doc = { bytes, pages, scanned, ocrDone: new Set() }
    docCache.set(path, doc)
    if (docCache.size > DOC_CACHE_SIZE) docCache.delete(docCache.keys().next().value)
    return doc
  } finally {
    void task.destroy()
  }
}

/** Runs OCR on the wanted scanned pages not read yet. Failure only leaves them unread. */
async function ensureOcr(doc, wanted) {
  const todo = wanted.filter((n) => doc.scanned.has(n) && !doc.ocrDone.has(n)).slice(0, OCR_PAGES_PER_CALL)
  if (!todo.length) return
  const read = await ocrPages(doc.bytes.slice(0), todo).catch((err) => {
    console.warn('[qi-assistant] OCR failed', err instanceof Error ? err.message : err)
    return new Map()
  })
  for (const [n, text] of read) {
    doc.pages[n - 1] = `[Scanned page, read by OCR: figures can be misread, check them against the PDF]\n${text}`
    doc.ocrDone.add(n)
  }
}

/**
 * One document as { pages, unread }: text per page (1-based numbers = index + 1) and the scanned pages still unreadable.
 * `wantedPages` are the pages about to be used; pass null to read all of them (a word search).
 */
export async function readDocumentPages(path, download, wantedPages) {
  const doc = await loadDocument(path, download)
  const wanted = wantedPages ?? doc.pages.map((_, i) => i + 1)
  await ensureOcr(doc, wanted)
  return { pages: doc.pages, unread: [...doc.scanned].filter((n) => !doc.ocrDone.has(n)) }
}
