import { getCurrencySymbol } from '@/lib/appCurrency'
import { blobToBase64, sendAppEmail } from '@/lib/sendAppEmail'
import { supabase } from '@/lib/supabaseClient'
import type { DocumentTemplateKind } from '@/features/settings/lab-settings/documentTemplateTypes'
import { prepareQuotationDocumentHtml } from '../quotation/buildQuotationDocumentHtml'
import { formatDate, formatMoney, type QuotationRow } from '../quotation/types'
import { invoiceNeedsReminder } from './invoiceBalanceApi'

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

async function sendDocumentMail(
  row: QuotationRow,
  documentKind: DocumentTemplateKind,
  subject: string,
  introHtml: string,
  text: string,
): Promise<{ to: string; id: string | null; title: string; number: string }> {
  const to = await resolveRecipientEmail(row)
  if (!to) {
    throw new Error('Client has no email on this document or in Client Master.')
  }
  const prepared = await prepareQuotationDocumentHtml([row], documentKind)
  const title = (prepared.template.documentTitle || 'Document').trim()
  const number = (row.quotation_number || '').trim()
  const filename = `${(number || title).replace(/[^\w.-]+/g, '_')}.html`
  const htmlBytes = new Blob([prepared.html], { type: 'text/html;charset=utf-8' })
  const content = await blobToBase64(htmlBytes)
  const { id } = await sendAppEmail({
    to,
    subject,
    html: `${introHtml}${prepared.html}`,
    text,
    attachments: [{ filename, content, contentType: 'text/html; charset=utf-8' }],
  })
  return { to, id, title, number }
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

/** One Over 90 invoice. Does not send when the invoice is settled or younger. */
export async function emailInvoiceReminder(row: QuotationRow, outstanding: number): Promise<void> {
  const allowed = await invoiceNeedsReminder(row.quotation_date, outstanding)
  if (!allowed) {
    throw new Error('Reminders are only for invoices open more than 90 days.')
  }
  const number = (row.quotation_number || 'Invoice').trim()
  const amount = `${getCurrencySymbol()} ${formatMoney(outstanding)}`
  const dated = formatDate(row.quotation_date)
  const subject = `Payment reminder ${number}`
  const intro = `<p style="font-family:Segoe UI,Arial,sans-serif;font-size:14px;line-height:1.5;color:#292524;">
Dear Sir/Madam,<br/><br/>
This is a reminder that invoice <strong>${escapeBasic(number)}</strong> dated ${escapeBasic(dated)} is still open.
The outstanding amount is <strong>${escapeBasic(amount)}</strong>. It is more than 90 days from the invoice date.<br/><br/>
Please find the invoice attached.<br/><br/>
Thanking you,<br/>
Quality Engineering
</p>
<hr style="border:none;border-top:1px solid #d6d3d1;margin:16px 0;" />`
  await sendDocumentMail(
    row,
    'invoice',
    subject,
    intro,
    `Payment reminder for invoice ${number} dated ${dated}. Outstanding ${amount}. The invoice is attached.`,
  )
}

/** Current page only. Returns before any mail when nothing on the page qualifies. */
export async function emailOverdueInvoiceReminders(
  items: Array<{ row: QuotationRow; outstanding: number }>,
): Promise<string> {
  const due: Array<{ row: QuotationRow; outstanding: number }> = []
  for (const item of items.slice(0, 50)) {
    if (await invoiceNeedsReminder(item.row.quotation_date, item.outstanding)) due.push(item)
  }
  if (due.length === 0) return 'No open invoices over 90 days on this page.'
  let sent = 0
  let skipped = 0
  for (const item of due) {
    try {
      await emailInvoiceReminder(item.row, item.outstanding)
      sent += 1
    } catch (err) {
      const message = err instanceof Error ? err.message : ''
      if (message.toLowerCase().includes('no email')) {
        skipped += 1
        continue
      }
      throw err
    }
  }
  if (sent === 0) return `No reminders sent. ${skipped} invoice(s) have no client email.`
  return skipped > 0
    ? `Sent ${sent} reminder(s). Skipped ${skipped} with no client email.`
    : `Sent ${sent} reminder(s).`
}

function escapeBasic(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
