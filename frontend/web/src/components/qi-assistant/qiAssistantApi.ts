import { supabase } from '@/lib/supabaseClient'

export type QiChatMessage = {
  id: string
  role: 'user' | 'assistant'
  content: string
}

export type QiAssistantActionResult = {
  operation: string
  table: string
  id?: string
  ok: boolean
  message: string
}

export type QiAssistantResponse = {
  reply: string
  actionsExecuted?: QiAssistantActionResult[]
  createdIsCodeId?: string
}

const MAX_PDF_BYTES = 5 * 1024 * 1024
const MAX_IMAGE_BYTES = 4 * 1024 * 1024
/** Pictures for vision requests: count and total base64 size (the functions service accepts 25 MB bodies). */
export const MAX_AI_IMAGES = 8
const MAX_AI_IMAGE_PAYLOAD = 16 * 1024 * 1024
const AI_IMAGE_DATA_URL = /^data:image\/(?:jpeg|png|webp|gif);base64,[A-Za-z0-9+/=]+$/
const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif'])

async function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const raw = String(reader.result ?? '')
      const comma = raw.indexOf(',')
      resolve(comma >= 0 ? raw.slice(comma + 1) : raw)
    }
    reader.onerror = () => reject(new Error('Failed to read file'))
    reader.readAsDataURL(file)
  })
}

async function postQiAssistant(body: Record<string, unknown>): Promise<QiAssistantResponse> {
  const {
    data: { session },
    error: sessionError,
  } = await supabase.auth.getSession()

  if (sessionError) {
    const msg = String(sessionError.message ?? '')
    if (msg.toLowerCase().includes('refresh token')) {
      await supabase.auth.signOut()
    }
    throw new Error('Session expired. Please log in again.')
  }

  const accessToken = session?.access_token
  if (!accessToken) {
    throw new Error('Session expired. Please log in again.')
  }

  const functionUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/qi-assistant`
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string

  const response = await fetch(functionUrl, {
    method: 'POST',
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${anonKey}`,
      'x-user-jwt': accessToken,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })

  const payload = (await response.json().catch(() => null)) as {
    reply?: string
    error?: string | { message?: string }
    actionsExecuted?: QiAssistantActionResult[]
    createdIsCodeId?: string
  } | null
  if (!response.ok) {
    const err = payload?.error
    const errText =
      typeof err === 'string'
        ? err
        : typeof err === 'object' && err && typeof err.message === 'string'
          ? err.message
          : `QE Assistant failed (${response.status})`
    throw new Error(errText)
  }

  return {
    reply: String(payload?.reply ?? '').trim() || 'No response.',
    actionsExecuted: payload?.actionsExecuted,
    createdIsCodeId: payload?.createdIsCodeId,
  }
}

/** True when the service says a vision model is needed to read pictures (none set up in AI Settings). */
export function isVisionModelMissingError(message: string): boolean {
  return /needs a vision ai model/i.test(message)
}

export function validateAssistantPdfFile(file: File): void {
  if (!file.name.toLowerCase().endsWith('.pdf')) {
    throw new Error('Only PDF files are supported.')
  }
  if (file.size > MAX_PDF_BYTES) {
    throw new Error('PDF must be 5 MB or smaller.')
  }
}

export function validateAssistantImageFile(file: File): void {
  const type = (file.type || '').toLowerCase()
  const name = file.name.toLowerCase()
  const okType =
    ALLOWED_IMAGE_TYPES.has(type) ||
    name.endsWith('.jpg') ||
    name.endsWith('.jpeg') ||
    name.endsWith('.png') ||
    name.endsWith('.webp') ||
    name.endsWith('.gif')
  if (!okType) {
    throw new Error('Only JPG, PNG, WEBP, or GIF images are supported.')
  }
  if (file.size > MAX_IMAGE_BYTES) {
    throw new Error('Image must be 4 MB or smaller.')
  }
}

function guessImageMime(file: File): string {
  if (file.type && ALLOWED_IMAGE_TYPES.has(file.type.toLowerCase())) return file.type.toLowerCase()
  const name = file.name.toLowerCase()
  if (name.endsWith('.png')) return 'image/png'
  if (name.endsWith('.webp')) return 'image/webp'
  if (name.endsWith('.gif')) return 'image/gif'
  return 'image/jpeg'
}

export async function sendQiAssistantMessage(input: {
  page: string
  message: string
  context?: string
  responseFormat?: 'json_object'
  /** When set, edge function loads this IS code + PDF files from DB/storage. */
  isCodeId?: string
  /** Row opened via per-row Ask AI (e.g. test parameter sparkle button). */
  activeRecordId?: string
  activeRecordTable?: string
  /** Skill chosen via ! picker in chat */
  activeSkillId?: string
  /** PDF attached in chat — processed only when user sends a message */
  attachedPdf?: File
  /** Multiple PDFs (preferred for document AI). Falls back to attachedPdf. */
  attachedPdfs?: File[]
  /** Business card / photo attached in chat (vision). */
  attachedImage?: File
  /**
   * Pictures for a vision model, as data URLs (`data:image/jpeg;base64,…`), already resized (see aiImages.ts).
   * The service then uses a vision-capable model from AI Settings, or explains that one is needed.
   */
  images?: string[]
  history: Array<{ role: 'user' | 'assistant'; content: string }>
}): Promise<QiAssistantResponse> {
  const body: Record<string, unknown> = {
    page: input.page,
    message: input.message,
    context: input.context,
    responseFormat: input.responseFormat,
    isCodeId: input.isCodeId,
    activeRecordId: input.activeRecordId,
    activeRecordTable: input.activeRecordTable,
    activeSkillId: input.activeSkillId,
    history: input.history,
  }

  if (input.images?.length) {
    const images = input.images.filter((url) => AI_IMAGE_DATA_URL.test(url))
    if (images.length !== input.images.length) throw new Error('Only JPG, PNG, WEBP or GIF Pictures Can Be Sent to the AI.')
    if (images.length > MAX_AI_IMAGES) throw new Error(`Send at Most ${MAX_AI_IMAGES} Pictures at a Time.`)
    const bytes = images.reduce((sum, url) => sum + url.length, 0)
    if (bytes > MAX_AI_IMAGE_PAYLOAD) throw new Error('The Pictures Are Too Large Together. Remove Some Pages or Photos.')
    body.images = images
  }

  const pdfs: File[] = []
  if (input.attachedPdfs?.length) {
    for (const f of input.attachedPdfs) {
      validateAssistantPdfFile(f)
      pdfs.push(f)
    }
  } else if (input.attachedPdf) {
    validateAssistantPdfFile(input.attachedPdf)
    pdfs.push(input.attachedPdf)
  }

  if (pdfs.length === 1) {
    const f = pdfs[0]!
    body.importPdf = {
      fileName: f.name,
      pdfBase64: await fileToBase64(f),
    }
  } else if (pdfs.length > 1) {
    body.importPdfs = await Promise.all(
      pdfs.map(async (f) => ({
        fileName: f.name,
        pdfBase64: await fileToBase64(f),
      })),
    )
  }

  if (input.attachedImage) {
    validateAssistantImageFile(input.attachedImage)
    body.importImage = {
      fileName: input.attachedImage.name,
      mimeType: guessImageMime(input.attachedImage),
      imageBase64: await fileToBase64(input.attachedImage),
    }
  }

  return postQiAssistant(body)
}
