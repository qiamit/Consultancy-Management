import { loadCompanyPrintContext } from '../print/loadCompanyPrintContext'
import { escapeHtml as esc, openPendingPrintWindow, openPrintHtml } from '../print/openPrintHtml'
import { emailHtmlDocumentToClient } from '../shared/emailHtmlToClient'
import { noticeTypeLabel, stopMarkingClientName, stopMarkingIsCodeLabel, type StopMarkingRow } from './types'

const longDate = (iso: string | null | undefined) =>
  iso ? new Date(`${iso.slice(0, 10)}T00:00:00`).toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' }) : ''

/** The reply letter to BIS on the licensee's letterhead: the editable draft below a short reference block. */
export async function buildStopMarkingReplyHtml(row: StopMarkingRow): Promise<string> {
  const company = await loadCompanyPrintContext()
  const client = stopMarkingClientName(row) || 'Licensee'
  const isLabel = stopMarkingIsCodeLabel(row)
  const cmL = row.cm_l_digits ? `CM/L-${row.cm_l_digits}` : ''
  const date = longDate(row.reply_date) || longDate(new Date().toISOString())
  const contact = [company.phone ? `Tel: ${company.phone}` : '', company.email ? `Email: ${company.email}` : ''].filter(Boolean).join(' | ')
  const reference = [
    cmL ? `Licence No.: ${cmL}` : '',
    isLabel ? `Indian Standard: ${isLabel}` : '',
    row.bis_reference ? `Your reference: ${row.bis_reference}` : '',
  ].filter(Boolean)
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"/><title>${esc(`Reply to BIS — ${client}`)}</title>
<style>
  @page { size: A4 portrait; margin: 16mm 16mm 14mm; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; background: #fff; }
  body { font-family: "Times New Roman", Georgia, serif; color: #111; font-size: 11.5pt; line-height: 1.5; }
  .head { text-align: center; border-bottom: 2px solid #b45309; padding-bottom: 6px; margin-bottom: 14px; }
  .head .name { font-size: 16pt; font-weight: 700; letter-spacing: 0.03em; text-transform: uppercase; }
  .head .sub { font-size: 9.5pt; color: #444; }
  .meta { display: flex; justify-content: space-between; gap: 16px; font-size: 10.5pt; margin-bottom: 12px; }
  .ref div { margin: 1px 0; }
  .body { white-space: pre-wrap; text-align: justify; }
  .sign { margin-top: 34px; }
</style></head><body>
  <div class="head">
    <div class="name">${esc(company.companyName || client)}</div>
    ${company.address ? `<div class="sub">${esc(company.address)}</div>` : ''}
    ${contact ? `<div class="sub">${esc(contact)}</div>` : ''}
  </div>
  <div class="meta"><div class="ref">${reference.map((r) => `<div>${esc(r)}</div>`).join('')}</div><div>Date: ${esc(date)}</div></div>
  <div class="body">${esc((row.reply_draft ?? '').trim() || '—')}</div>
  <div class="sign"><strong>${esc(client)}</strong></div>
</body></html>`
}

export async function printStopMarkingReply(row: StopMarkingRow): Promise<string | null> {
  const target = openPendingPrintWindow('Preparing reply…')
  if (!target) return 'Popup blocked. Allow popups to print.'
  try {
    return openPrintHtml(await buildStopMarkingReplyHtml(row), { target })
  } catch (err) {
    try { target.close() } catch { /* ignore */ }
    return err instanceof Error ? err.message : 'Unable to prepare the reply.'
  }
}

/** Word opens an HTML .doc, so the same letter becomes an editable Word file. */
export async function downloadStopMarkingReplyWord(row: StopMarkingRow): Promise<void> {
  const html = await buildStopMarkingReplyHtml(row)
  const url = URL.createObjectURL(new Blob(['﻿', html], { type: 'application/msword' }))
  const a = document.createElement('a')
  a.href = url
  a.download = `Reply_to_BIS_${(row.cm_l_digits ?? 'licence').replace(/\W+/g, '')}.doc`
  document.body.appendChild(a)
  a.click()
  a.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

/** Emails the reply letter to the client's master email. */
export async function emailStopMarkingReplyToClient(row: StopMarkingRow): Promise<string> {
  const html = await buildStopMarkingReplyHtml(row)
  const title = `Reply to BIS — ${noticeTypeLabel(row.case_type)}`
  return emailHtmlDocumentToClient({
    clientId: row.client_id,
    title,
    subject: `${title}${row.cm_l_digits ? ` — CM/L-${row.cm_l_digits}` : ''}`,
    html,
    filenameBase: `stop_marking_reply_${row.cm_l_digits ?? 'licence'}`,
  })
}
