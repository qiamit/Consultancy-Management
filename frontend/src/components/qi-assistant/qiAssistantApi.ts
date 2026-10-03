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
    error?: string
    actionsExecuted?: QiAssistantActionResult[]
    createdIsCodeId?: string
  } | null
  if (!response.ok) {
    throw new Error(payload?.error ?? `QI Assistant failed (${response.status})`)
  }

  return {
    reply: String(payload?.reply ?? '').trim() || 'No response.',
    actionsExecuted: payload?.actionsExecuted,
    createdIsCodeId: payload?.createdIsCodeId,
  }
}

export function validateAssistantPdfFile(file: File): void {
  if (!file.name.toLowerCase().endsWith('.pdf')) {
    throw new Error('Only PDF files are supported.')
  }
  if (file.size > MAX_PDF_BYTES) {
    throw new Error('PDF must be 5 MB or smaller.')
  }
}

export async function sendQiAssistantMessage(input: {
  page: string
  message: string
  context?: string
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
  history: Array<{ role: 'user' | 'assistant'; content: string }>
}): Promise<QiAssistantResponse> {
  const body: Record<string, unknown> = {
    page: input.page,
    message: input.message,
    context: input.context,
    isCodeId: input.isCodeId,
    activeRecordId: input.activeRecordId,
    activeRecordTable: input.activeRecordTable,
    activeSkillId: input.activeSkillId,
    history: input.history,
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

  return postQiAssistant(body)
}
