import { MAX_AI_IMAGES } from './qiAssistantApi'
import { imageFileToAiDataUrl, isAiImageFile, isAiPdfFile, pdfFileToAiPages } from './aiImages'

/** Files attached to a QE Assistant message from the computer (one by one, or a whole folder). */
export type ChatAttachment = {
  id: string
  file: File
  /** Name, or the folder path for files from an attached folder. */
  path: string
  kind: 'image' | 'pdf' | 'text' | 'sheet' | 'other'
}

export const MAX_ATTACH_FILES = 30
const MAX_FILE_BYTES = 15 * 1024 * 1024
const MAX_FILE_TEXT = 20_000
const MAX_TOTAL_TEXT = 80_000
const TEXT_NAME = /\.(txt|csv|tsv|json|md|xml|html?|log|ya?ml|ini|sql|rtf)$/i
const SHEET_NAME = /\.(xlsx|xls|xlsm|ods)$/i
// Folder uploads bring system files too; never send them.
const SKIP_NAME = /(^|\/)(\.ds_store|thumbs\.db|desktop\.ini|\.git\/)|(^|\/)\./i

export function classifyAttachment(file: File): ChatAttachment['kind'] {
  if (isAiImageFile(file)) return 'image'
  if (isAiPdfFile(file)) return 'pdf'
  if (SHEET_NAME.test(file.name)) return 'sheet'
  if (file.type.startsWith('text/') || TEXT_NAME.test(file.name)) return 'text'
  return 'other'
}

/** New attachments from a file input (files or a folder), skipping hidden / system files and duplicates. */
export function toAttachments(files: FileList | File[], existing: ChatAttachment[]): ChatAttachment[] {
  const seen = new Set(existing.map((a) => `${a.path}|${a.file.size}`))
  const out: ChatAttachment[] = []
  for (const file of Array.from(files)) {
    const path = (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name
    if (SKIP_NAME.test(path) || seen.has(`${path}|${file.size}`)) continue
    seen.add(`${path}|${file.size}`)
    out.push({ id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, file, path, kind: classifyAttachment(file) })
  }
  return out
}

function clip(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max)}\n… (cut, ${text.length} characters in all)` : text
}

/**
 * Reads the attachments in the browser for the AI: text of PDFs, text files and spreadsheets (as CSV), and pictures
 * (photos, and the pages of scanned PDFs) for a vision model. Unreadable files are listed by name.
 */
export async function readAttachments(list: ChatAttachment[]): Promise<{ text: string; images: string[]; notes: string[] }> {
  const parts: string[] = []
  const images: string[] = []
  const notes: string[] = []
  let total = 0
  const addText = (path: string, body: string) => {
    const room = MAX_TOTAL_TEXT - total
    if (room <= 0) {
      notes.push(`${path}: not read (attachment text limit reached)`)
      return
    }
    const piece = clip(body.trim(), Math.min(MAX_FILE_TEXT, room))
    total += piece.length
    parts.push(`### ${path}\n${piece || '(empty)'}`)
  }
  for (const a of list.slice(0, MAX_ATTACH_FILES)) {
    if (a.file.size > MAX_FILE_BYTES) {
      notes.push(`${a.path}: too large (over 15 MB)`)
      continue
    }
    try {
      if (a.kind === 'image') {
        if (images.length >= MAX_AI_IMAGES) notes.push(`${a.path}: not sent (at most ${MAX_AI_IMAGES} pictures)`)
        else images.push(await imageFileToAiDataUrl(a.file))
      } else if (a.kind === 'pdf') {
        const read = await pdfFileToAiPages(a.file, 6)
        if (read.text.trim()) addText(`${a.path} (${read.pageCount} pages)`, read.text)
        else {
          // A scanned PDF has no text: its first pages go as pictures.
          const room = MAX_AI_IMAGES - images.length
          images.push(...read.images.slice(0, Math.max(0, Math.min(2, room))))
          parts.push(`### ${a.path} (${read.pageCount} pages, scanned — first pages sent as pictures)`)
        }
      } else if (a.kind === 'text') {
        addText(a.path, await a.file.text())
      } else if (a.kind === 'sheet') {
        const XLSX = await import('xlsx')
        const book = XLSX.read(await a.file.arrayBuffer(), { type: 'array' })
        const sheets = book.SheetNames.slice(0, 4).map((name) => `Sheet "${name}":\n${XLSX.utils.sheet_to_csv(book.Sheets[name]!)}`)
        addText(a.path, sheets.join('\n\n'))
      } else {
        notes.push(`${a.path}: attached, but this file type cannot be read`)
      }
    } catch {
      notes.push(`${a.path}: could not be read`)
    }
  }
  if (list.length > MAX_ATTACH_FILES) notes.push(`${list.length - MAX_ATTACH_FILES} more files were not read (at most ${MAX_ATTACH_FILES})`)
  const text = [
    parts.length ? `ATTACHED FILES (read in the browser):\n\n${parts.join('\n\n')}` : '',
    notes.length ? `Attachment notes:\n- ${notes.join('\n- ')}` : '',
  ]
    .filter(Boolean)
    .join('\n\n')
  return { text, images, notes }
}
