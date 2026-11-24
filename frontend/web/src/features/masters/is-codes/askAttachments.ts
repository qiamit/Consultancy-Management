import { pdfFileToAiPages } from '@/components/qi-assistant/aiImages'
import { readAttachments, type ChatAttachment } from '@/components/qi-assistant/chatAttachments'
import { ocrPdfPages } from '@/lib/ocrPdf'

/*
 * Files attached to an Ask AI question (owner, 21 Nov 2026): the user's own documents (a test report, a drawing, a
 * photo of a label) to check against the standard. Everything is read in the browser and goes to the AI as text, so
 * the Model for Document Checks (it may read no pictures) answers: PDFs by their text, scanned PDFs and
 * photos by OCR, spreadsheets and text files as text.
 */

const MAX_FILE_BYTES = 15 * 1024 * 1024
const MAX_FILE_TEXT = 15_000
const MAX_TOTAL_TEXT = 40_000
const PDF_PAGES = 10
const OCR_PAGES = 5

const clip = (text: string, max: number) =>
  text.length > max ? `${text.slice(0, max)}\n… (cut, ${text.length} characters in all)` : text

async function ocrImage(file: File): Promise<string> {
  const mod = await import('tesseract.js')
  // CommonJS package: the named exports may only be on `default`, depending on the bundler.
  const tesseract = 'createWorker' in mod && typeof mod.createWorker === 'function' ? mod : (mod as unknown as { default: typeof mod }).default
  const worker = await tesseract.createWorker('eng')
  try {
    return (await worker.recognize(file)).data.text ?? ''
  } finally {
    void worker.terminate()
  }
}

/** The attached files as one text block for the AI (empty when nothing could be read). */
export async function readAskAttachments(list: ChatAttachment[], onStep?: (step: string) => void): Promise<string> {
  const parts: string[] = []
  const notes: string[] = []
  const others: ChatAttachment[] = []
  let total = 0
  const add = (title: string, body: string) => {
    const room = MAX_TOTAL_TEXT - total
    if (room <= 0) {
      notes.push(`${title}: not read (attachment text limit reached)`)
      return
    }
    const piece = clip(body.trim(), Math.min(MAX_FILE_TEXT, room))
    total += piece.length
    parts.push(`### ${title}\n${piece || '(no text found)'}`)
  }
  for (const a of list) {
    if (a.file.size > MAX_FILE_BYTES) {
      notes.push(`${a.path}: too large (over 15 MB)`)
      continue
    }
    try {
      if (a.kind === 'image') {
        onStep?.(`Reading ${a.path} (OCR)…`)
        add(`${a.path} (photo, read by OCR)`, await ocrImage(a.file))
      } else if (a.kind === 'pdf') {
        onStep?.(`Reading ${a.path}…`)
        const read = await pdfFileToAiPages(a.file, PDF_PAGES, 600)
        if (read.text.replace(/PAGE \d+:/g, '').trim().length >= 200) {
          add(`${a.path} (${read.pageCount} pages${read.pageCount > PDF_PAGES ? `, first ${PDF_PAGES} read` : ''})`, read.text)
        } else {
          // A scanned PDF: its first pages by OCR.
          const pages = Array.from({ length: Math.min(OCR_PAGES, read.pageCount) }, (_, i) => i + 1)
          const ocr = await ocrPdfPages(a.file, { pages, onPage: (done, all) => onStep?.(`Reading ${a.path} (OCR, page ${done} of ${all})…`) })
          const text = pages.map((n) => (ocr.get(n)?.[0] ? `PAGE ${n}: ${ocr.get(n)![0]}` : '')).filter(Boolean).join('\n')
          add(`${a.path} (${read.pageCount} pages, scanned, ${pages.length} read by OCR)`, text)
        }
      } else {
        others.push(a)
      }
    } catch {
      notes.push(`${a.path}: could not be read`)
    }
  }
  if (others.length) {
    const r = await readAttachments(others)
    if (r.text) parts.push(r.text.replace(/^ATTACHED FILES \(read in the browser\):\n\n/, ''))
  }
  return [parts.join('\n\n'), notes.length ? `Attachment notes:\n- ${notes.join('\n- ')}` : ''].filter(Boolean).join('\n\n')
}
