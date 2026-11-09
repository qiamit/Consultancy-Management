import { loadPdfjs } from '@/lib/pdfjsLoader'

/** Longest side of an image sent to the AI (vision models scale larger pictures down anyway). */
export const AI_IMAGE_MAX_SIDE = 1600
export const AI_IMAGE_QUALITY = 0.85

const IMAGE_NAME = /\.(jpe?g|png|webp|gif|heic|heif|bmp)$/i

export function isAiImageFile(file: File): boolean {
  return file.type.startsWith('image/') || IMAGE_NAME.test(file.name)
}

export function isAiPdfFile(file: File): boolean {
  return file.type === 'application/pdf' || /\.pdf$/i.test(file.name)
}

type Drawable = { source: CanvasImageSource; width: number; height: number; release: () => void }

/** Decodes a photo; the browser's own decoder decides what works (HEIC only where the browser can show it, e.g. Safari). */
async function decodeImage(file: Blob): Promise<Drawable> {
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
    return { source: bitmap, width: bitmap.width, height: bitmap.height, release: () => bitmap.close() }
  } catch {
    // Fall back to an <img>, which some browsers decode more formats with.
  }
  const url = URL.createObjectURL(file)
  try {
    const img = new Image()
    img.decoding = 'async'
    img.src = url
    await img.decode()
    return { source: img, width: img.naturalWidth, height: img.naturalHeight, release: () => URL.revokeObjectURL(url) }
  } catch {
    URL.revokeObjectURL(url)
    throw new Error('This Photo Format Cannot Be Read in This Browser. Save It as JPG or PNG and Add It Again.')
  }
}

function canvasToJpeg(canvas: HTMLCanvasElement): string {
  return canvas.toDataURL('image/jpeg', AI_IMAGE_QUALITY)
}

function sizedCanvas(width: number, height: number, maxSide: number): HTMLCanvasElement {
  const scale = Math.min(1, maxSide / Math.max(width, height, 1))
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(width * scale))
  canvas.height = Math.max(1, Math.round(height * scale))
  return canvas
}

/** Photo / scan → JPEG data URL, longest side at most 1600 px (keeps the request small and fast). */
export async function imageFileToAiDataUrl(file: Blob, maxSide = AI_IMAGE_MAX_SIDE): Promise<string> {
  const img = await decodeImage(file)
  try {
    const canvas = sizedCanvas(img.width, img.height, maxSide)
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Canvas Is Not Available')
    // White behind transparent PNGs (JPEG has no transparency and would turn it black).
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(img.source, 0, 0, canvas.width, canvas.height)
    return canvasToJpeg(canvas)
  } finally {
    img.release()
  }
}

export type AiPdfRead = {
  /** First pages drawn as JPEG data URLs (for vision models). */
  images: string[]
  /** Selectable text of the read pages (empty for scanned drawings). */
  text: string
  pageCount: number
}

/** Renders the first pages of a PDF to images and reads their text, so a drawing PDF reaches the AI as a picture too. */
export async function pdfFileToAiPages(file: File, maxPages = 3, maxSide = AI_IMAGE_MAX_SIDE): Promise<AiPdfRead> {
  const { getDocument } = await loadPdfjs()
  const task = getDocument({ data: new Uint8Array(await file.arrayBuffer()) })
  const pdf = await task.promise
  try {
    const images: string[] = []
    const texts: string[] = []
    const last = Math.min(pdf.numPages, maxPages)
    for (let n = 1; n <= last; n += 1) {
      const page = await pdf.getPage(n)
      const base = page.getViewport({ scale: 1 })
      const scale = Math.min(4, maxSide / Math.max(base.width, base.height, 1))
      const viewport = page.getViewport({ scale })
      const canvas = document.createElement('canvas')
      canvas.width = Math.max(1, Math.floor(viewport.width))
      canvas.height = Math.max(1, Math.floor(viewport.height))
      await page.render({ canvas, viewport, background: '#ffffff' }).promise
      images.push(canvasToJpeg(canvas))
      const content = await page.getTextContent()
      const text = content.items
        .map((item) => ('str' in item ? String(item.str ?? '') : ''))
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim()
      if (text) texts.push(`PAGE ${n}: ${text}`)
      page.cleanup()
    }
    return { images, text: texts.join('\n'), pageCount: pdf.numPages }
  } finally {
    void task.destroy()
  }
}

/**
 * Pictures of chosen PDF pages (1-based) for a vision AI model. With `halves`, each page goes as its top and bottom
 * half (a little overlap), each at full picture size: small table figures of a scanned report stay readable.
 */
export async function pdfPagesToAiPictures(
  file: File,
  pages: number[],
  opts: { halves?: boolean; maxPictures?: number; maxSide?: number } = {},
): Promise<string[]> {
  const maxSide = opts.maxSide ?? AI_IMAGE_MAX_SIDE
  const maxPictures = opts.maxPictures ?? 8
  const { getDocument } = await loadPdfjs()
  const task = getDocument({ data: new Uint8Array(await file.arrayBuffer()) })
  const pdf = await task.promise
  try {
    const out: string[] = []
    for (const n of pages) {
      if (out.length >= maxPictures || n < 1 || n > pdf.numPages) continue
      const page = await pdf.getPage(n)
      const base = page.getViewport({ scale: 1 })
      // Halves: the page width becomes the picture's long side; whole page: the longer side does.
      const scale = Math.min(4, maxSide / (opts.halves ? base.width : Math.max(base.width, base.height, 1)))
      const viewport = page.getViewport({ scale })
      const canvas = document.createElement('canvas')
      canvas.width = Math.max(1, Math.floor(viewport.width))
      canvas.height = Math.max(1, Math.floor(viewport.height))
      await page.render({ canvas, viewport, background: '#ffffff' }).promise
      if (opts.halves && canvas.height > canvas.width * 0.9 && out.length + 2 <= maxPictures) {
        const overlap = Math.round(canvas.height * 0.04)
        const half = Math.ceil(canvas.height / 2)
        for (const [top, height] of [
          [0, half + overlap],
          [half - overlap, canvas.height - (half - overlap)],
        ]) {
          const part = document.createElement('canvas')
          part.width = canvas.width
          part.height = height
          const ctx = part.getContext('2d')
          if (!ctx) continue
          ctx.drawImage(canvas, 0, top, canvas.width, height, 0, 0, canvas.width, height)
          out.push(canvasToJpeg(part))
        }
      } else {
        out.push(canvasToJpeg(canvas))
      }
      page.cleanup()
    }
    return out
  } finally {
    void task.destroy()
  }
}
