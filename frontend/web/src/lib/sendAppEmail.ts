import { supabase } from '@/lib/supabaseClient'

export async function blobToBase64(blob: Blob): Promise<string> {
  const buffer = await blob.arrayBuffer()
  const bytes = new Uint8Array(buffer)
  const chunk = 0x2000
  let binary = ''
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return btoa(binary)
}

export function parseEmailList(raw: string | string[] | undefined | null): string[] {
  if (raw == null) return []
  if (Array.isArray(raw)) return raw.map((s) => String(s).trim()).filter(Boolean)
  return String(raw)
    .split(/[,;\s]+/)
    .map((s) => s.trim())
    .filter(Boolean)
}

export async function sendAppEmail(payload: {
  to: string | string[]
  cc?: string | string[]
  bcc?: string | string[]
  subject: string
  html: string
  text?: string
  attachments?: Array<{ filename: string; content: string; contentType?: string }>
}): Promise<{ id: string | null }> {
  const { data: sessionData } = await supabase.auth.getSession()
  const accessToken = sessionData.session?.access_token
  if (!accessToken) throw new Error('Session expired. Please sign in again.')

  const to = parseEmailList(payload.to)
  const cc = parseEmailList(payload.cc)
  const bcc = parseEmailList(payload.bcc)
  if (to.length === 0) throw new Error('At least one recipient is required.')

  const functionUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-email`
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string
  let response: Response
  try {
    response = await fetch(functionUrl, {
      method: 'POST',
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'X-User-Jwt': accessToken,
      },
      body: JSON.stringify({
        to,
        ...(cc.length > 0 ? { cc } : {}),
        ...(bcc.length > 0 ? { bcc } : {}),
        subject: payload.subject,
        html: payload.html,
        text: payload.text,
        attachments: payload.attachments,
      }),
    })
  } catch (err) {
    const detail = err instanceof Error ? err.message : 'Failed to fetch'
    throw new Error(
      detail.toLowerCase().includes('fetch')
        ? 'Unable to reach the email service. Confirm the Railway functions service is running.'
        : detail,
    )
  }
  const body = (await response.json().catch(() => null)) as { error?: string; id?: string | null } | null
  if (!response.ok) {
    throw new Error(
      body?.error ||
        (response.status === 503
          ? 'Email service is not configured (RESEND_API_KEY).'
          : `Email failed (${response.status})`),
    )
  }
  return { id: body?.id ?? null }
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
