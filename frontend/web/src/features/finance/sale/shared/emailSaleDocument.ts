import { blobToBase64, sendAppEmail } from '@/lib/sendAppEmail'
import { supabase } from '@/lib/supabaseClient'
import type { DocumentTemplateKind } from '@/features/settings/lab-settings/documentTemplateTypes'
import { prepareQuotationDocumentHtml } from '../quotation/buildQuotationDocumentHtml'
import type { QuotationRow } from '../quotation/types'

async function resolveRecipientEmail(row: QuotationRow): Promise<string> {
  const fromRow = (row.contact_email ?? '').trim()
  if (fromRow) return fromRow
  const clientId = (row.client_id ?? '').trim()
  if (!clientId) return ''
  const { data, error } = await supabase
    .from('clients')
    .select('email')
    .eq('id', clientId)
    .maybeSingle()
  if (error || !data) return ''
  return String((data as { email?: string | null }).email ?? '').trim()
}

/**
 * Emails one sale document HTML to the client (document body + .html attachment).
 */
export async function emailSaleDocumentToClient(
  row: QuotationRow,
  documentKind: DocumentTemplateKind = 'quotation',
): Promise<string> {
  const to = await resolveRecipientEmail(row)
  if (!to) {
    throw new Error('Client has no email on this document or in Client Master.')
  }

  const prepared = await prepareQuotationDocumentHtml([row], documentKind)
  const title = (prepared.template.documentTitle || 'Document').trim()
  const number = (row.quotation_number || '').trim()
  const subject = number ? `${title} ${number}` : title
  const filename = `${(number || title).replace(/[^\w.-]+/g, '_')}.html`
  const htmlBytes = new Blob([prepared.html], { type: 'text/html;charset=utf-8' })
  const content = await blobToBase64(htmlBytes)

  const intro = `<p style="font-family:Segoe UI,Arial,sans-serif;font-size:14px;line-height:1.5;color:#292524;">
Dear Sir/Madam,<br/><br/>
Please find attached <strong>${escapeBasic(title)}${number ? ` ${escapeBasic(number)}` : ''}</strong>.<br/><br/>
Thanking you,<br/>
Quality Engineering
</p>
<hr style="border:none;border-top:1px solid #d6d3d1;margin:16px 0;" />`

  const { id } = await sendAppEmail({
    to,
    subject,
    html: `${intro}${prepared.html}`,
    text: `Please find ${title}${number ? ` ${number}` : ''} attached.`,
    attachments: [{ filename, content, contentType: 'text/html; charset=utf-8' }],
  })

  return id
    ? `Emailed ${title}${number ? ` ${number}` : ''} to ${to} (${id}).`
    : `Emailed ${title}${number ? ` ${number}` : ''} to ${to}.`
}

function escapeBasic(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
