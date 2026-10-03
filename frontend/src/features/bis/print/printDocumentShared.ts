import { formatCmL, formatDisplayDate } from '../projects/types'
import type { BisPrintData } from './loadBisPrintData'
import { escapeHtml as esc } from './openPrintHtml'

export type PrintApplicantContext = {
  applicantName: string
  applicantAddress: string
  applicantEmail: string
  applicantPhone: string
  applicantGst: string
  contactPerson: string
  bisBranchName: string
  bisBranchState: string
  applicationNumber: string
  dateOfApplication: string
  dateOfInspection: string
  isNumber: string
  isTitle: string
  preparedBy: string
}

export function applicantContextFromPrintData({ row, client, isCode, company }: BisPrintData): PrintApplicantContext {
  const address = [client.address, client.district, client.state, client.pinCode]
    .map((p) => p.trim())
    .filter(Boolean)
    .join(', ')

  return {
    applicantName: client.companyName,
    applicantAddress: address,
    applicantEmail: client.email,
    applicantPhone: client.mobile,
    applicantGst: client.gstNumber,
    contactPerson: client.contactPerson,
    bisBranchName: '',
    bisBranchState: client.state,
    applicationNumber: (row.license_number ?? '').trim() || (row.cm_l_digits ? formatCmL(row.cm_l_digits) : ''),
    dateOfApplication: row.start_date ?? row.created_at ?? '',
    dateOfInspection: '',
    isNumber: isCode.label,
    isTitle: isCode.title,
    preparedBy: company.companyName,
  }
}

export function applicationNoDisplay(raw: string): string {
  const v = (raw ?? '').trim()
  if (!v || v.toUpperCase() === 'N/A' || v === '—') return 'CM/A - N/A'
  return v
}

export function addressWithIndia(address: string): string {
  const line = (address ?? '').trim()
  if (!line) return '______________________________, INDIA'
  return /\bindia\b/i.test(line) ? line : `${line}, INDIA`
}

export function bisBranchLine(branchName: string, state: string): string {
  const branch = branchName.trim() || '________________'
  const st = state.trim() || '________________'
  return `${esc(branch)}, ${esc(st)}, INDIA`
}

export function toBlockHtml(branchName: string, state: string): string {
  return `To<br/>The Director &amp; Head<br/>Bureau of Indian Standards<br/>${bisBranchLine(branchName, state)}`
}

export function isStandardRefHtml(isNumber: string, isTitle: string): string {
  const num = (isNumber ?? '').trim()
  const title = (isTitle ?? '').trim()
  if (num && title) return `<strong>${esc(num)}</strong> — ${esc(title)}`
  if (num) return `<strong>${esc(num)}</strong>`
  if (title) return `<strong>${esc(title)}</strong>`
  return ''
}

export function letterheadHtml(ctx: PrintApplicantContext): string {
  const contact = [
    ctx.applicantPhone ? `Tel: ${esc(ctx.applicantPhone)}` : '',
    ctx.applicantEmail ? `Email: ${esc(ctx.applicantEmail)}` : '',
    ctx.applicantGst ? `GSTIN: ${esc(ctx.applicantGst)}` : '',
  ]
    .filter(Boolean)
    .join(' &nbsp;|&nbsp; ')

  return `
<div class="pd-letterhead">
  <div class="pd-firm">${esc(ctx.applicantName || 'Applicant Firm')}</div>
  ${ctx.applicantAddress ? `<div class="pd-firm-addr">${esc(ctx.applicantAddress)}</div>` : ''}
  ${contact ? `<div class="pd-firm-contact">${contact}</div>` : ''}
</div>`
}

export function signatoryHtml(opts: { firmName: string; name: string; designation: string; dateLine?: string }): string {
  return `
<div class="pd-signatory">
  <div class="pd-for">For <strong>${esc(opts.firmName)}</strong></div>
  <div class="pd-sign-space"></div>
  <div class="pd-sign-line"></div>
  <div><strong>${esc(opts.name || '—')}</strong></div>
  <div>${esc(opts.designation || '—')}</div>
  ${opts.dateLine ? `<div>${opts.dateLine}</div>` : ''}
  <div class="pd-seal-note">(Signature &amp; Seal of the Firm)</div>
</div>`
}

export function preparedByHtml(preparedBy: string): string {
  return preparedBy ? `<div class="pd-prepared">Prepared by ${esc(preparedBy)}</div>` : ''
}

export function dateOrNa(raw: string): string {
  const v = (raw ?? '').trim()
  return v ? formatDisplayDate(v) : 'N/A'
}

/** Applicant / application meta grid used at the top of CMPF Form-style documents. */
export function applicationMetaTableHtml(ctx: PrintApplicantContext): string {
  return `
<table class="pd-meta">
  <tr><td class="pd-lbl">Applicant Name</td><td colspan="3"><strong>${esc(ctx.applicantName || '—')}</strong></td></tr>
  <tr><td class="pd-lbl">Applicant Address</td><td colspan="3">${esc(addressWithIndia(ctx.applicantAddress))}</td></tr>
  <tr>
    <td class="pd-lbl">Application No.</td><td>${esc(applicationNoDisplay(ctx.applicationNumber))}</td>
    <td class="pd-lbl">Date of Application</td><td>${esc(dateOrNa(ctx.dateOfApplication))}</td>
  </tr>
  <tr>
    <td class="pd-lbl">IS Code</td><td>${esc(ctx.isNumber || '—')}</td>
    <td class="pd-lbl">Date of Inspection</td><td>${esc(dateOrNa(ctx.dateOfInspection))}</td>
  </tr>
</table>`
}

export function blankTableRows(
  count: number,
  columns: number,
  opts?: { leftColumn?: number; unnumbered?: boolean },
): string {
  const rows: string[] = []
  for (let i = 0; i < count; i += 1) {
    const cells = [`<td>${opts?.unnumbered ? '&nbsp;' : i + 1}</td>`]
    for (let c = 1; c < columns; c += 1) {
      cells.push(`<td${opts?.leftColumn === c ? ' class="pd-left"' : ''}>&nbsp;</td>`)
    }
    rows.push(`<tr>${cells.join('')}</tr>`)
  }
  return rows.join('')
}

export function cmpfDeclarationHtml(opts: {
  firmParagraphs: string[]
  bisParagraphs: string[]
  repName: string
  repDesignation: string
  officerName: string
  officerDesignation: string
  date: string
}): string {
  const paras = (list: string[], align = 'justify') =>
    list.map((p) => `<p style="text-align:${align}">${esc(p)}</p>`).join('')
  return `
<table class="cmpf-decl">
  <tr>
    <td>
      ${paras(opts.firmParagraphs)}
      <div class="cmpf-sig">
        <div>Sig. of Firm's Representative :-</div>
        <div class="cmpf-sig-gap"></div>
        <div>Name :- ${esc(opts.repName.trim() || '—')}</div>
        <div>Designation :- ${esc(opts.repDesignation.trim() || '—')}</div>
        <div>Date :- ${esc(opts.date)}</div>
      </div>
    </td>
    <td>
      ${paras(opts.bisParagraphs, 'right')}
      <div class="cmpf-sig" style="text-align:right">
        <div>Sig. of BIS Certification Officer :-</div>
        <div class="cmpf-sig-gap"></div>
        <div>Name :- ${esc(opts.officerName.trim() || '----')}</div>
        <div>Designation :- ${esc(opts.officerDesignation.trim() || '----')}</div>
        <div>Date :- ${esc(opts.date)}</div>
      </div>
    </td>
  </tr>
</table>`
}

/** Common styles for CMPF-style forms (form id, intro blocks, declaration boxes). */
export const CMPF_FORM_STYLES = `
  .cmpf-form-id { text-align: right; font-weight: 700; font-size: 11px; margin-bottom: 4px; }
  .cmpf-to { font-size: 11.5px; line-height: 1.45; margin: 6px 0 4px; }
  .cmpf-heading { margin: 10px 0 6px; font-size: 11px; font-weight: 700; }
  .cmpf-terms p, .cmpf-decls p { margin: 5px 0; font-size: 10.5px; line-height: 1.45; text-align: justify; break-inside: avoid; page-break-inside: avoid; }
  .cmpf-box { border: 1px solid #111; min-height: 14mm; padding: 6px 8px; font-size: 11px; margin-bottom: 8px; }
  .cmpf-decl { width: 100%; border-collapse: collapse; table-layout: fixed; margin-top: 6px; page-break-inside: avoid; break-inside: avoid; }
  .cmpf-decl td { border: 1px solid #111; vertical-align: top; padding: 6px 8px; width: 50%; font-size: 11px; line-height: 1.4; }
  .cmpf-decl p { margin: 0 0 6px; }
  .cmpf-sig { margin-top: 10px; font-size: 11px; line-height: 1.5; }
  .cmpf-sig-gap { height: 14mm; }
  .cmpf-footnote { font-size: 10px; font-weight: 700; line-height: 1.4; text-align: justify; margin: 6px 0 0; }
  .cmpf-sign-right { margin-top: 14px; text-align: right; }
  .cmpf-sign-right .pd-signatory { text-align: left; }
  .cmpf-table td { height: 7mm; }
`

export function buildPrintPage(opts: { title: string; styles: string; body: string; landscape?: boolean }): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <title>${esc(opts.title)}</title>
  <style>
    @page { size: A4 ${opts.landscape ? 'landscape' : 'portrait'}; margin: 12mm 15mm; }
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; background: #fff; }
    .pd-sheet {
      font-family: "Times New Roman", Times, serif;
      color: #111;
      font-size: 12px;
      line-height: 1.5;
      max-width: ${opts.landscape ? '267mm' : '180mm'};
      margin: 0 auto;
      padding: 10mm 8mm;
    }
    @media print { .pd-sheet { max-width: none; padding: 0; } }
    .pd-sheet + .pd-sheet { page-break-before: always; break-before: page; }
    .pd-letterhead { text-align: center; border-bottom: 2px solid #b45309; padding-bottom: 8px; margin-bottom: 12px; }
    .pd-firm { font-size: 19px; font-weight: 700; letter-spacing: 0.03em; color: #292524; text-transform: uppercase; }
    .pd-firm-addr { font-size: 11px; margin-top: 3px; color: #44403c; }
    .pd-firm-contact { font-size: 10.5px; margin-top: 3px; color: #57534e; }
    .pd-title { text-align: center; font-size: 15px; font-weight: 700; text-decoration: underline; margin: 0 0 12px; }
    .pd-to-row { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; margin-bottom: 12px; }
    .pd-to-block { line-height: 1.5; }
    .pd-date-block { text-align: right; line-height: 1.6; white-space: nowrap; }
    .pd-meta { width: 100%; border-collapse: collapse; margin: 0 0 10px; table-layout: fixed; }
    .pd-meta td { border: 1px solid #111; padding: 4px 6px; font-size: 11px; vertical-align: middle; }
    .pd-meta td.pd-lbl { font-weight: 700; background: #f5f5f4; width: 18%; }
    .pd-body { margin: 0 0 10px; text-align: justify; }
    .pd-table { width: 100%; border-collapse: collapse; table-layout: auto; margin: 6px 0 10px; }
    .pd-table th, .pd-table td { border: 1px solid #111; padding: 3px 5px; font-size: 10.5px; vertical-align: middle; text-align: center; }
    .pd-table th { background: #f5f5f4; font-weight: 700; line-height: 1.25; }
    .pd-table td.pd-left { text-align: left; }
    .pd-table tr { page-break-inside: avoid; break-inside: avoid; }
    .pd-table thead { display: table-header-group; }
    .pd-note { font-size: 10.5px; font-style: italic; margin: 4px 0 8px; }
    .pd-signatory { margin-top: 6px; min-width: 70mm; display: inline-block; }
    .pd-sign-row { text-align: right; }
    .pd-sign-space { height: 20mm; }
    .pd-sign-line { border-top: 1px solid #111; width: 60mm; margin-bottom: 3px; }
    .pd-seal-note { font-size: 10px; color: #57534e; margin-top: 2px; }
    .pd-prepared { margin-top: 16px; font-size: 9px; color: #78716c; text-align: right; border-top: 1px solid #e7e5e4; padding-top: 4px; }
    .pd-signatory, .pd-body { break-inside: avoid; page-break-inside: avoid; }
    ${opts.styles}
  </style>
</head>
<body>
${opts.body}
</body>
</html>`
}
