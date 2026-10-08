import { formatIsCodeLabelFromParts } from '@/features/masters/is-codes/formatIsCodeLabel'
import { loadCompanyPrintContext } from '../print/loadCompanyPrintContext'
import { escapeHtml as esc, openPendingPrintWindow, openPrintHtml } from '../print/openPrintHtml'
import { emailHtmlDocumentToClient } from '../shared/emailHtmlToClient'
import { formatCmL, formatDisplayDate, formatInr, type BisRenewalRow } from './types'

function cell(label: string, value: string, wide = false): string {
  return `<div class="info-cell${wide ? ' wide' : ''}"><div class="info-label">${esc(label)}</div><div class="info-value">${esc(value || '—')}</div></div>`
}

function money(value: number | string | null | undefined): string {
  const n = Number(value)
  return Number.isFinite(n) ? formatInr(n) : '—'
}

function dateVal(raw: string | null | undefined): string {
  const v = (raw ?? '').trim()
  return v ? formatDisplayDate(v) : '—'
}

export async function buildRenewalFormHtml(row: BisRenewalRow): Promise<string> {
  const company = await loadCompanyPrintContext()
  const client = (row.client?.company_name ?? '').trim() || 'Applicant'
  const project = row.project
  const isCode = project?.is_code
  const isLabel =
    formatIsCodeLabelFromParts(isCode?.is_number, isCode?.revision_year) ||
    (isCode?.is_number ?? '').trim() ||
    '—'
  const isTitle = (isCode?.title ?? '').trim() || '—'
  const cmL = formatCmL(project?.cm_l_digits) || '—'
  const generatedAt = new Date().toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
  const consultancyContact = [
    company.phone ? `Tel: ${company.phone}` : '',
    company.email ? `Email: ${company.email}` : '',
    company.gstNumber ? `GSTIN: ${company.gstNumber}` : '',
  ]
    .filter(Boolean)
    .join(' &nbsp;|&nbsp; ')

  const body = `
<div class="sheet">
  <div class="letterhead">
    <div class="firm">${esc(client)}</div>
    <div class="sub">CM/L ${esc(cmL)} · ${esc(isLabel)}${isTitle !== '—' ? ` — ${esc(isTitle)}` : ''}</div>
  </div>

  <div class="doc-header">
    <div><h1>Apply for Renewal</h1></div>
    <div class="meta">
      <div>Status: ${esc(row.renewal_status || '—')}</div>
      <div>Generated ${esc(generatedAt)}</div>
      <div>Prepared via ${esc(company.companyName || 'Quality Engineering')}</div>
    </div>
  </div>

  <div class="section-title">License Information</div>
  <div class="info-grid">
    ${cell('Firm Name', client, true)}
    ${cell('CM/L Number', cmL)}
    ${cell('Title of IS', `${isLabel}${isTitle !== '—' ? ` — ${isTitle}` : ''}`, true)}
    ${cell('Current Validity', dateVal(project?.license_validity_date))}
    ${cell('Application Date', dateVal(row.application_date))}
    ${cell('Submission Mode', row.submission_mode ?? '')}
    ${cell('Acknowledgment No.', row.acknowledgment_number ?? '')}
    ${cell('BIS Office', row.bis_office ?? '')}
    ${cell('BIS Desk Officer', row.bis_desk_officer ?? '', true)}
  </div>

  <div class="section-title">Marking Fee &amp; Payment</div>
  <div class="info-grid">
    ${cell('Marking Fee Rate', money(row.marking_fee_rate))}
    ${cell('Quantity', String(row.marking_fee_quantity ?? '—'))}
    ${cell('Marking Fee Total', money(row.marking_fee_total))}
    ${cell('Challan / Ref. No.', row.fee_challan_number ?? '')}
    ${cell('Payment Date', dateVal(row.fee_payment_date))}
    ${cell('Payment Mode', row.fee_payment_mode ?? '')}
  </div>

  <div class="two-col">
    <div>
      <div class="section-title">Test Report</div>
      <div class="info-grid two">
        ${cell('Report No.', row.test_report_number ?? '')}
        ${cell('Report Date', dateVal(row.test_report_date))}
        ${cell('Laboratory', row.test_lab_name ?? '', true)}
        ${cell('NABL No.', row.test_lab_nabl_no ?? '')}
        ${cell('Result', row.test_result ?? '')}
      </div>
    </div>
    <div>
      <div class="section-title">Inspection</div>
      <div class="info-grid two">
        ${cell('Notice Date', dateVal(row.inspection_notice_date))}
        ${cell('Inspection Date', dateVal(row.inspection_date))}
        ${cell('BIS Inspector', row.bis_inspector_name ?? '', true)}
        ${cell('Result', row.inspection_result ?? '')}
      </div>
    </div>
  </div>

  <div class="section-title">Renewal Grant</div>
  <div class="info-grid">
    ${cell('Granted Date', dateVal(row.renewal_granted_date))}
    ${cell('New Validity From', dateVal(row.new_validity_from))}
    ${cell('New Validity To', dateVal(row.new_validity_to))}
    ${cell('Renewal Status', row.renewal_status || '')}
  </div>

  ${
    (row.notes ?? '').trim()
      ? `<div class="section-title">Notes</div><p class="notes">${esc(row.notes ?? '')}</p>`
      : ''
  }

  <div class="footer-note">
    <div>
      <div><strong>${esc(company.companyName || 'Quality Engineering')}</strong></div>
      ${company.address ? `<div>${esc(company.address)}</div>` : ''}
      ${consultancyContact ? `<div>${consultancyContact}</div>` : ''}
    </div>
    <div class="footer-right">
      <div>BIS License Renewal</div>
      <div>${esc(client)}</div>
    </div>
  </div>
</div>`

  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"/><title>${esc(`Renewal — ${client}`)}</title>
<style>
  @page { size: A4 landscape; margin: 8mm; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; background: #fff; }
  body { font-family: "Segoe UI", Arial, Helvetica, sans-serif; color: #0f172a; font-size: 8.5pt; line-height: 1.25; }
  .sheet { width: 100%; padding: 2mm; }
  .letterhead { text-align: center; border-bottom: 2.5px solid #b45309; padding-bottom: 6px; margin-bottom: 8px; }
  .letterhead .firm { font-size: 13pt; font-weight: 700; letter-spacing: 0.03em; text-transform: uppercase; color: #292524; }
  .letterhead .sub { font-size: 8pt; color: #57534e; margin-top: 2px; }
  .doc-header { display: flex; justify-content: space-between; gap: 12px; margin-bottom: 6px; }
  .doc-header h1 { font-size: 14pt; margin: 0; color: #78350f; }
  .doc-header .meta { font-size: 8pt; color: #57534e; text-align: right; line-height: 1.35; }
  .section-title { font-size: 8.5pt; font-weight: 700; color: #78350f; background: linear-gradient(90deg, #fef3c7 0%, #fafaf9 100%); border-left: 3.5px solid #d97706; padding: 3px 8px; margin: 8px 0 5px; }
  .info-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 5px; }
  .info-grid.two { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .info-cell { border: 1px solid #d6d3d1; border-radius: 3px; padding: 3px 6px; min-height: 30px; background: #fff; }
  .info-cell.wide { grid-column: span 2; }
  .info-label { font-size: 6.5pt; font-weight: 700; color: #78716c; text-transform: uppercase; letter-spacing: 0.04em; margin-bottom: 1px; }
  .info-value { font-size: 8pt; font-weight: 600; word-break: break-word; }
  .two-col { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
  .notes { margin: 0; white-space: pre-wrap; font-size: 8pt; }
  .footer-note { margin-top: 10px; font-size: 6.5pt; color: #78716c; border-top: 1px solid #e7e5e4; padding-top: 4px; display: flex; justify-content: space-between; gap: 12px; }
  .footer-right { text-align: right; }
  @media print { .sheet { page-break-inside: avoid; } }
</style></head><body>${body}</body></html>`
}

/** Emails the renewal form HTML to the client's master email. */
export async function emailRenewalFormToClient(row: BisRenewalRow): Promise<string> {
  const html = await buildRenewalFormHtml(row)
  const cmL = (row.project?.cm_l_digits ?? '').trim()
  const title = 'BIS License Renewal Form'
  return emailHtmlDocumentToClient({
    clientId: row.client_id ?? row.project?.client_id,
    title,
    subject: cmL ? `${title} — CM/L ${cmL}` : title,
    html,
    filenameBase: cmL ? `renewal_${cmL}` : 'renewal_form',
  })
}

/** Opens the renewal form print for one row. Call from a user click. */
export async function printRenewalForm(row: BisRenewalRow): Promise<string | null> {
  const target = openPendingPrintWindow('Preparing Renewal Form…')
  if (!target) return 'Popup blocked. Allow popups to print.'
  try {
    const html = await buildRenewalFormHtml(row)
    return openPrintHtml(html, { target })
  } catch (err) {
    try {
      target.close()
    } catch {
      /* ignore */
    }
    return err instanceof Error ? err.message : 'Unable to prepare renewal print.'
  }
}
