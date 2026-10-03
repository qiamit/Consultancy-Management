import { loadCompanyPrintContext } from '../print/loadCompanyPrintContext'
import { escapeHtml as esc, openPendingPrintWindow, openPrintHtml } from '../print/openPrintHtml'
import { formatDisplayDate } from '../projects/types'
import {
  surveillanceClientName,
  surveillanceIsCodeLabel,
  type SurveillanceRow,
} from './types'

function cell(label: string, value: string, wide = false): string {
  return `<div class="info-cell${wide ? ' wide' : ''}"><div class="info-label">${esc(label)}</div><div class="info-value">${esc(value || '—')}</div></div>`
}

function formatCmL(digits: string | null | undefined): string {
  const d = String(digits ?? '').replace(/\D/g, '')
  return d ? `CM/L-${d}` : ''
}

export async function buildSurveillanceFormHtml(row: SurveillanceRow): Promise<string> {
  const company = await loadCompanyPrintContext()
  const client = surveillanceClientName(row) || 'Applicant'
  const isLabel = surveillanceIsCodeLabel(row) || '—'
  const isTitle = (row.is_code?.title ?? '').trim() || '—'
  const cmL = formatCmL(row.cm_l_digits) || '—'
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
  ]
    .filter(Boolean)
    .join(' &nbsp;|&nbsp; ')

  const body = `
<div class="sheet">
  <div class="letterhead">
    <div class="firm">${esc(client)}</div>
    <div class="sub">${esc(cmL)} · ${esc(isLabel)}${isTitle !== '—' ? ` — ${esc(isTitle)}` : ''}</div>
  </div>

  <div class="doc-header">
    <div><h1>License Surveillance</h1></div>
    <div class="meta">
      <div>Generated ${esc(generatedAt)}</div>
      <div>Prepared via ${esc(company.companyName || 'Quality Engineering')}</div>
    </div>
  </div>

  <div class="section-title">Surveillance Details</div>
  <div class="info-grid">
    ${cell('Firm Name', client, true)}
    ${cell('CM/L Number', cmL)}
    ${cell('IS Code', `${isLabel}${isTitle !== '—' ? ` — ${isTitle}` : ''}`, true)}
    ${cell('Project / License', row.bis_project?.license_number || row.bis_project?.title || '—')}
    ${cell('Surveillance Date', row.surveillance_date ? formatDisplayDate(row.surveillance_date) : '—')}
    ${cell('Allotted Employee', row.allotted_employee_name || '—', true)}
    ${cell('Project Kind', row.project_kind || '—')}
  </div>

  <div class="footer-note">
    <div>
      <div><strong>${esc(company.companyName || 'Quality Engineering')}</strong></div>
      ${company.address ? `<div>${esc(company.address)}</div>` : ''}
      ${consultancyContact ? `<div>${consultancyContact}</div>` : ''}
    </div>
    <div class="footer-right">
      <div>BIS License Surveillance</div>
      <div>${esc(client)}</div>
    </div>
  </div>
</div>`

  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"/><title>${esc(`Surveillance — ${client}`)}</title>
<style>
  @page { size: A4 portrait; margin: 12mm; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; background: #fff; }
  body { font-family: "Segoe UI", Arial, Helvetica, sans-serif; color: #0f172a; font-size: 9pt; line-height: 1.3; }
  .sheet { width: 100%; padding: 2mm; }
  .letterhead { text-align: center; border-bottom: 2.5px solid #b45309; padding-bottom: 6px; margin-bottom: 8px; }
  .letterhead .firm { font-size: 13pt; font-weight: 700; letter-spacing: 0.03em; text-transform: uppercase; color: #292524; }
  .letterhead .sub { font-size: 8pt; color: #57534e; margin-top: 2px; }
  .doc-header { display: flex; justify-content: space-between; gap: 12px; margin-bottom: 6px; }
  .doc-header h1 { font-size: 14pt; margin: 0; color: #78350f; }
  .doc-header .meta { font-size: 8pt; color: #57534e; text-align: right; line-height: 1.35; }
  .section-title { font-size: 8.5pt; font-weight: 700; color: #78350f; background: linear-gradient(90deg, #fef3c7 0%, #fafaf9 100%); border-left: 3.5px solid #d97706; padding: 3px 8px; margin: 8px 0 5px; }
  .info-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 5px; }
  .info-cell { border: 1px solid #d6d3d1; border-radius: 3px; padding: 3px 6px; min-height: 30px; background: #fff; }
  .info-cell.wide { grid-column: span 2; }
  .info-label { font-size: 6.5pt; font-weight: 700; color: #78716c; text-transform: uppercase; letter-spacing: 0.04em; margin-bottom: 1px; }
  .info-value { font-size: 8.5pt; font-weight: 600; word-break: break-word; }
  .footer-note { margin-top: 16px; font-size: 6.5pt; color: #78716c; border-top: 1px solid #e7e5e4; padding-top: 4px; display: flex; justify-content: space-between; gap: 12px; }
  .footer-right { text-align: right; }
</style></head><body>${body}</body></html>`
}

export async function printSurveillanceForm(row: SurveillanceRow): Promise<string | null> {
  const target = openPendingPrintWindow('Preparing Surveillance Form…')
  if (!target) return 'Popup blocked. Allow popups to print.'
  try {
    const html = await buildSurveillanceFormHtml(row)
    return openPrintHtml(html, { target })
  } catch (err) {
    try {
      target.close()
    } catch {
      /* ignore */
    }
    return err instanceof Error ? err.message : 'Unable to prepare surveillance print.'
  }
}
