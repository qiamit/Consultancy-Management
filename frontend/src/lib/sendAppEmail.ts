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

export async function sendAppEmail(payload: {
  to: string
  subject: string
  html: string
  text?: string
  attachments?: Array<{ filename: string; content: string; contentType?: string }>
}): Promise<void> {
  const { data: sessionData } = await supabase.auth.getSession()
  const accessToken = sessionData.session?.access_token
  if (!accessToken) throw new Error('Session expired. Please sign in again.')

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
      },
      body: JSON.stringify(payload),
    })
  } catch (err) {
    const detail = err instanceof Error ? err.message : 'Failed to fetch'
    throw new Error(
      detail.toLowerCase().includes('fetch')
        ? 'Unable to reach the email service. Confirm the Railway functions service is running.'
        : detail,
    )
  }
  const body = (await response.json().catch(() => null)) as { error?: string } | null
  if (!response.ok) {
    throw new Error(
      body?.error ||
        (response.status === 503
          ? 'Email service is not configured (RESEND_API_KEY).'
          : `Email failed (${response.status})`),
    )
  }
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
