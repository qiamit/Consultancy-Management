import { blobToBase64, sendAppEmail } from '@/lib/sendAppEmail'
import { supabase } from '@/lib/supabaseClient'

export async function resolveClientEmail(clientId: string | null | undefined): Promise<string> {
  const id = (clientId ?? '').trim()
  if (!id) return ''
  const { data, error } = await supabase.from('clients').select('email').eq('id', id).maybeSingle()
  if (error || !data) return ''
  return String((data as { email?: string | null }).email ?? '').trim()
}

/**
 * Emails a prepared HTML document to the client's master email (body + .html attachment).
 */
export async function emailHtmlDocumentToClient(opts: {
  clientId: string | null | undefined
  title: string
  subject?: string
  html: string
  filenameBase: string
}): Promise<string> {
  const to = await resolveClientEmail(opts.clientId)
  if (!to) {
    throw new Error('Client has no email in Client Master.')
  }

  const title = opts.title.trim() || 'Document'
  const subject = (opts.subject ?? title).trim()
  const filename = `${opts.filenameBase.replace(/[^\w.-]+/g, '_') || 'document'}.html`
  const content = await blobToBase64(new Blob([opts.html], { type: 'text/html;charset=utf-8' }))

  const intro = `<p style="font-family:Segoe UI,Arial,sans-serif;font-size:14px;line-height:1.5;color:#292524;">
Dear Sir/Madam,<br/><br/>
Please find attached <strong>${escapeBasic(title)}</strong>.<br/><br/>
Thanking you,<br/>
Quality Engineering
</p>
<hr style="border:none;border-top:1px solid #d6d3d1;margin:16px 0;" />`

  const { id } = await sendAppEmail({
    to,
    subject,
    html: `${intro}${opts.html}`,
    text: `Please find ${title} attached.`,
    attachments: [{ filename, content, contentType: 'text/html; charset=utf-8' }],
  })

  return id ? `Emailed ${title} to ${to} (${id}).` : `Emailed ${title} to ${to}.`
}

function escapeBasic(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
