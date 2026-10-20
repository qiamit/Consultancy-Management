import { fetchBisProjectById } from '../projects/bisProjectsApi'
import { formatDisplayDate } from '../projects/types'
import { oslSampleRowHasContent, parseOslSampleRequirementsPayload } from '../projects/oslSampleRequirementsModel'
import { loadBisPrintData, printSignatoryDefaults } from '../print/loadBisPrintData'
import { printableOslSampleRows } from '../print/oslSampleRequirementsHtml'
import { applicantContextFromPrintData, buildPrintPage, letterheadHtml, signatoryHtml, toBlockHtml } from '../print/printDocumentShared'
import { loadCompanyPrintContext } from '../print/loadCompanyPrintContext'
import { escapeHtml as esc, openPendingPrintWindow, openPrintHtml } from '../print/openPrintHtml'
import { emailHtmlDocumentToClient } from '../shared/emailHtmlToClient'
import { EMPTY_REPLY_SECTIONS, noticeTypeLabel, REPLY_BODY_SECTIONS, stopMarkingClientName, stopMarkingIsCodeLabel, type StopMarkingReplySections, type StopMarkingRow } from './types'

const longDate = (iso: string | null | undefined) =>
  iso ? new Date(`${iso.slice(0, 10)}T00:00:00`).toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' }) : ''

/** The plain reply letter (no structured sections yet): the editable draft below a short reference block. */
async function buildPlainReplyHtml(row: StopMarkingRow): Promise<string> {
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

/** The default "Our Ref." of the letter: licence number and reply date. */
export function defaultReplyRef(row: Pick<StopMarkingRow, 'cm_l_digits' | 'reply_date'>): string {
  const d = (row.reply_date ?? new Date().toISOString()).slice(0, 10)
  return `${row.cm_l_digits ? `CM/L-${row.cm_l_digits}` : 'BIS'}/NC/${d.slice(8, 10)}${d.slice(5, 7)}${d.slice(0, 4)}`
}

const para = (text: string) => esc(text.trim()).replace(/\n/g, '<br/>')

/**
 * The reply letter to BIS as a formal letter: letterhead, BIS branch office address, our reference and date,
 * references, subject, the sections, a table of the new samples, closing, seal and signature.
 */
export async function buildStopMarkingReplyHtml(row: StopMarkingRow): Promise<string> {
  const sections: StopMarkingReplySections = { ...EMPTY_REPLY_SECTIONS, ...(row.reply_sections ?? {}) }
  const hasSections = REPLY_BODY_SECTIONS.some(({ key }) => sections[key].trim())
  const project = row.bis_project_id ? await fetchBisProjectById(row.bis_project_id).catch(() => null) : null
  if (!hasSections || !project) return buildPlainReplyHtml(row)

  const printData = await loadBisPrintData(project)
  const ctx = applicantContextFromPrintData(printData)
  const sig = printSignatoryDefaults(printData)
  const date = longDate(row.reply_date) || longDate(new Date().toISOString())
  const ourRef = sections.ourRef.trim() || defaultReplyRef(row)
  const isLabel = stopMarkingIsCodeLabel(row)
  const cmL = row.cm_l_digits ? `CM/L-${row.cm_l_digits}` : ''
  const refRows: Array<[string, string]> = [
    ['Our Ref.', ourRef],
    ['Your Ref.', [row.bis_reference].filter(Boolean).join(' ')],
    ['Licence No.', cmL],
    ['Indian Standard', isLabel],
  ]
  const otherRefs = sections.otherRefs.trim()
  const samples = printableOslSampleRows(parseOslSampleRequirementsPayload((row.test_report_module?.osl ?? null) as Record<string, unknown> | null).rows.filter(oslSampleRowHasContent))
  const sampleTable = samples.length
    ? `<table class="rl-table"><thead><tr><th>S.No.</th><th>Grade / Type / Variety</th><th>Declared Value</th><th>Batch No.</th><th>Date of Mfg.</th><th>Quantity</th></tr></thead><tbody>${samples
        .map((r, i) => `<tr><td>${i + 1}</td><td>${esc(r.gradeTypeVariety.trim() || r.sampleDescription.trim())}</td><td>${esc(r.declaredValue)}</td><td>${esc(r.batchNumber)}</td><td>${esc(r.dateOfManufacturing ? formatDisplayDate(r.dateOfManufacturing) : '')}</td><td>${esc(r.sampleQuantity || r.batchQuantity)}</td></tr>`)
        .join('')}</tbody></table>`
    : ''
  const headed = REPLY_BODY_SECTIONS.filter(({ key }) => !['subject', 'general'].includes(key) && (sections[key].trim() || (key === 'newSamples' && sampleTable)))
  const bodyHtml = headed
    .map(({ key, title }, i) => `<div class="rl-sec"><div class="rl-h">${i + 1}. ${esc(title)}</div>${sections[key].trim() ? `<div class="rl-p">${para(sections[key])}</div>` : ''}${key === 'newSamples' ? sampleTable : ''}</div>`)
    .join('')
  const styles = `
    .rl-top { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; margin-bottom: 10px; }
    .rl-ref { font-size: 12.5px; }
    .rl-ref td { padding: 1px 8px 1px 0; vertical-align: top; }
    .rl-subject { font-weight: 700; margin: 10px 0; }
    .rl-p { text-align: justify; margin: 3px 0 0; }
    .rl-sec { margin-top: 9px; }
    .rl-h { font-weight: 700; }
    .rl-table { width: 100%; border-collapse: collapse; margin-top: 5px; font-size: 12px; }
    .rl-table th, .rl-table td { border: 1px solid #000; padding: 3px 5px; text-align: left; }
    .rl-close { margin-top: 12px; }
    .rl-seal { margin-top: 6px; min-height: 22mm; display: flex; justify-content: space-between; align-items: flex-end; }
    .rl-seal span { font-size: 11px; color: #555; }
  `
  const body = `<div class="pd-sheet">
    ${letterheadHtml(ctx)}
    <div class="rl-top">
      <div>${toBlockHtml(ctx.bisBranchName, ctx.bisBranchState)}</div>
      <div class="rl-ref"><table><tbody>${refRows.filter(([, v]) => v).map(([k, v]) => `<tr><td>${esc(k)}</td><td>: ${esc(v)}</td></tr>`).join('')}<tr><td>Date</td><td>: ${esc(date)}</td></tr></tbody></table></div>
    </div>
    ${otherRefs ? `<div class="rl-p"><strong>Other references:</strong><br/>${para(otherRefs)}</div>` : ''}
    ${sections.subject.trim() ? `<div class="rl-subject">Subject: ${esc(sections.subject.replace(/^subject\s*:\s*/i, '').trim())}</div>` : ''}
    <div class="rl-p">Sir / Madam,</div>
    ${sections.general.trim() ? `<div class="rl-p">${para(sections.general)}</div>` : ''}
    ${bodyHtml}
    <div class="rl-close">Yours faithfully,</div>
    <div class="rl-seal"><span>(Seal)</span></div>
    ${signatoryHtml({ firmName: ctx.applicantName, name: sections.signatoryName.trim() || sig.signatoryName, designation: sections.signatoryDesignation.trim() || sig.signatoryDesignation, signatureImageUrl: sig.signatureImageUrl })}
  </div>`
  return buildPrintPage({ title: `Reply to BIS — ${ctx.applicantName}`, styles, body })
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
