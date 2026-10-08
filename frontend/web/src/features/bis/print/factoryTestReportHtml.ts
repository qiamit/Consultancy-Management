import type { BisPrintData } from './loadBisPrintData'
import { printSignatoryDefaults } from './loadBisPrintData'
import { escapeHtml as esc } from './openPrintHtml'
import {
  applicantContextFromPrintData,
  applicationNoDisplay,
  buildPrintPage,
  dateOrNa,
  inspectionDateOrToday,
  preparedByHtml,
  type PrintApplicantContext,
} from './printDocumentShared'
import {
  parseFactoryTestReportPayload,
  type FactoryTestReportEntry,
  type FactoryTestReportParamRow,
} from '../projects/factoryTestReportModel'

export type FactoryTestReportData = PrintApplicantContext & {
  productTitle: string
  reports: FactoryTestReportEntry[]
  inspectionOfficerName: string
  inspectionOfficerDesignation: string
  authorisedName: string
  authorisedDesignation: string
  /** Optional signature image for Authorized Signatory (middle). */
  authorisedSignatureImageUrl?: string
  testedByName: string
  testedByDesignation: string
  /** Optional signature image for Tested By (right) — Technical Staff apply flag. */
  testedBySignatureImageUrl?: string
  applyWitnessedBy: boolean
  applyAuthorizedSignatory: boolean
  applyTestedBy: boolean
}

function value(raw: string): string {
  const v = raw.trim()
  return v ? esc(v) : '&nbsp;'
}

function plainOrDate(raw: string): string {
  return raw.trim() ? esc(dateOrNa(raw)) : '&nbsp;'
}

function specification(data: FactoryTestReportData): string {
  const code = data.isNumber.trim()
  const title = data.productTitle.trim()
  if (title && code) return `${title} as per ${code}`
  return title || (code ? `as per ${code}` : '')
}

function metaRow(label: string, content: string): string {
  return `<tr><td class="ftr-meta-cell" colspan="6"><strong>${esc(label)}</strong> :- ${content}</td></tr>`
}

function metaPairCell(
  label: string,
  content: string,
  align: 'left' | 'center' | 'right' = 'left',
  colSpan = 3,
): string {
  const alignClass =
    align === 'right' ? ' ftr-meta-right' : align === 'center' ? ' ftr-meta-center' : ' ftr-meta-left'
  return `<td class="ftr-meta-cell${alignClass}" colspan="${colSpan}"><strong>${esc(label)}</strong> :- ${content}</td>`
}

function sigBlock(
  title: string,
  name: string,
  designation: string,
  org: string,
  signatureImageUrl = '',
  titleAboveOrg = false,
  align: 'left' | 'center' | 'right' = 'center',
): string {
  const img = signatureImageUrl.trim()
    ? `<img class="ftr-sig-img" src="${esc(signatureImageUrl.trim())}" alt="${esc(title)} signature" />`
    : ''
  const titleHtml = titleAboveOrg
    ? `<div class="ftr-sig-label">${esc(title)}</div>`
    : `<div class="ftr-sig-title">${esc(title)}</div>`
  const alignClass =
    align === 'left' ? ' ftr-sig-left' : align === 'right' ? ' ftr-sig-right' : ''
  return `
<div class="ftr-sig${alignClass}">
  ${titleAboveOrg ? '' : titleHtml}
  <div class="ftr-sig-space">${img}</div>
  <div>${esc(name.trim() || '—')}</div>
  ${designation.trim() ? `<div>${esc(designation)}</div>` : ''}
  ${titleAboveOrg ? titleHtml : ''}
  <div>${esc(org)}</div>
</div>`
}

function signaturesHtml(data: FactoryTestReportData): string {
  return `
<div class="ftr-sigs">
  ${
    data.applyWitnessedBy
      ? sigBlock(
          'Witnessed By',
          data.inspectionOfficerName,
          data.inspectionOfficerDesignation,
          'Bureau of Indian Standards',
          '',
          false,
          'left',
        )
      : ''
  }
  ${
    data.applyAuthorizedSignatory
      ? sigBlock(
          'Authorized Signatory',
          data.authorisedName,
          data.authorisedDesignation,
          data.applicantName || '—',
          data.authorisedSignatureImageUrl ?? '',
          true,
        )
      : ''
  }
  ${
    data.applyTestedBy
      ? sigBlock(
          'Tested By',
          data.testedByName,
          data.testedByDesignation === 'Technical Staff / Quality Control Incharge'
            ? ''
            : data.testedByDesignation,
          data.applicantName || '—',
          data.testedBySignatureImageUrl ?? '',
          false,
          'right',
        )
      : ''
  }
</div>`
}

function testNameCell(param: FactoryTestReportParamRow): string {
  const name = param.testName.trim() || '—'
  const sub = [param.clauseNo.trim() ? `Cl. ${param.clauseNo.trim()}` : '', param.isReference.trim()]
    .filter(Boolean)
    .join(' · ')
  return `<td class="pd-left"><strong>${esc(name)}</strong>${
    sub ? `<br/><span class="ftr-sub">${esc(sub)}</span>` : ''
  }</td>`
}

function paramRowsHtml(params: FactoryTestReportParamRow[]): string {
  if (params.length === 0) {
    return Array.from({ length: 8 }, () =>
      '<tr><td class="pd-left">&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td></tr>',
    ).join('')
  }
  return params
    .map(
      (p) => `<tr>
      ${testNameCell(p)}
      <td class="ftr-td-center">${value(p.unit)}</td>
      <td class="ftr-td-center">${value(p.specifiedRequirement)}</td>
      <td class="ftr-td-center">${value(p.observedValue)}</td>
      <td class="ftr-td-center">${value(p.remark.trim() || 'Pass')}</td>
    </tr>`,
    )
    .join('')
}

function applicantDetails(data: FactoryTestReportData): string {
  const parts = [data.applicantName.trim(), data.applicantAddress.trim()].filter(Boolean)
  return parts.join(', ')
}

/** Header block (title + meta) — same layout as on-screen preview MetaCell table. */
function metaHeaderHtml(data: FactoryTestReportData, report: FactoryTestReportEntry): string {
  return `
<h1 class="pd-title ftr-title">Factory Test Report</h1>
<table class="ftr-meta">
  <colgroup>
    <col style="width:16.66%"/><col style="width:16.66%"/><col style="width:16.66%"/>
    <col style="width:16.66%"/><col style="width:16.66%"/><col style="width:16.66%"/>
  </colgroup>
  <tr>
    ${metaPairCell('Application No.', esc(applicationNoDisplay(data.applicationNumber)), 'left', 2)}
    ${metaPairCell('Date of Application', esc(dateOrNa(data.dateOfApplication)), 'center', 2)}
    ${metaPairCell('Date of Inspection', esc(inspectionDateOrToday(data.dateOfInspection)), 'right', 2)}
  </tr>
  ${metaRow('Applicant Details', `<strong>${value(applicantDetails(data))}</strong>`)}
  ${metaRow('Product Details', value(specification(data)))}
  ${metaRow('Grade/Type/Variety/Class', value(report.gradeTypeVariety))}
  ${metaRow('Declared Values, if any', value(report.declaredValue))}
  <tr>
    ${metaPairCell('Batch / Heat Number', value(report.batchNumber), 'left', 3)}
    ${metaPairCell('Date of Manufacturing', plainOrDate(report.dateOfManufacturing), 'right', 3)}
  </tr>
  <tr>
    ${metaPairCell('Date of Testing Start', plainOrDate(report.dateOfTestingStart), 'left', 3)}
    ${metaPairCell('Date of Testing Completion', plainOrDate(report.dateOfTestingFinish), 'right', 3)}
  </tr>
</table>`
}

function reportSheetHtml(data: FactoryTestReportData, report: FactoryTestReportEntry): string {
  // One master table: thead (meta + column titles) and tfoot (signatures) repeat on every
  // printed page; "*** End of Report ***" stays in tbody so it only appears after the last row.
  return `
<div class="pd-sheet ftr-sheet">
  <table class="pd-table ftr-main">
    <colgroup>
      <col style="width:25%"/><col style="width:10%"/><col style="width:35%"/>
      <col style="width:20%"/><col style="width:10%"/>
    </colgroup>
    <thead>
      <tr class="ftr-repeat-head">
        <td colspan="5" class="ftr-repeat-head-cell">${metaHeaderHtml(data, report)}</td>
      </tr>
      <tr>
        <th>Test Name</th>
        <th>Unit</th>
        <th>Specified Requirements</th>
        <th>Observed Value</th>
        <th>Remark</th>
      </tr>
    </thead>
    <tbody>
      ${paramRowsHtml(report.parameters)}
      <tr class="ftr-end-row">
        <td colspan="5" class="ftr-end">*** End of Report ***</td>
      </tr>
    </tbody>
    <tfoot>
      <tr class="ftr-repeat-foot">
        <td colspan="5" class="ftr-repeat-foot-cell">${signaturesHtml(data)}</td>
      </tr>
    </tfoot>
  </table>
  ${preparedByHtml(data.preparedBy)}
</div>`
}

function blankReport(): FactoryTestReportEntry {
  return {
    id: 'blank',
    sampleRowId: '',
    sampleFor: 'ft',
    batchNumber: '',
    dateOfManufacturing: '',
    gradeTypeVariety: '',
    declaredValue: '',
    dateOfTestingStart: '',
    dateOfTestingFinish: '',
    parameters: [],
  }
}

function buildBody(data: FactoryTestReportData): string {
  const reports = data.reports.length > 0 ? data.reports : [blankReport()]
  return reports.map((report) => reportSheetHtml(data, report)).join('')
}

const STYLES = `
  .ftr-sheet + .ftr-sheet { page-break-before: always; break-before: page; }
  /* No letterhead on Factory Test Report */
  .ftr-sheet .pd-letterhead { display: none !important; }
  .ftr-title { margin: 0 0 6px; }
  .ftr-main { width: 100%; border-collapse: collapse; table-layout: fixed; margin: 0; }
  .ftr-main > thead { display: table-header-group; }
  .ftr-main > tfoot { display: table-footer-group; }
  .ftr-main > tbody { display: table-row-group; }
  .ftr-repeat-head-cell, .ftr-repeat-foot-cell {
    border: none !important;
    padding: 0 !important;
    background: #fff !important;
    text-align: left !important;
    vertical-align: top !important;
  }
  .ftr-repeat-foot-cell { padding-top: 4px !important; }
  /* Match on-screen preview: label :- value in one cell (no separate grey label columns). */
  .ftr-meta { width: 100%; border-collapse: collapse; margin: 0 0 6px; table-layout: fixed; }
  .ftr-meta td.ftr-meta-cell {
    border: 1.25px solid #000;
    padding: 4px 6px;
    font-size: 12px;
    vertical-align: middle;
    text-align: left;
    color: #000;
    background: #fff;
    white-space: normal;
  }
  .ftr-meta td.ftr-meta-left { text-align: left; }
  .ftr-meta td.ftr-meta-center { text-align: center; }
  .ftr-meta td.ftr-meta-right { text-align: right; }
  .ftr-meta td.ftr-meta-cell strong { font-weight: 700; }
  .ftr-main > tbody > tr > td { height: 7mm; }
  .ftr-main > thead > tr > th { text-align: center; }
  .ftr-main td.ftr-td-center { text-align: center; white-space: pre-wrap; }
  .ftr-sub { font-weight: 600; font-size: 9px; }
  .ftr-end {
    text-align: center !important;
    font-weight: 700;
    font-size: 11px;
    border: none !important;
    padding: 6px 4px !important;
    background: #fff !important;
  }
  .ftr-end-row { break-inside: avoid; page-break-inside: avoid; }
  .ftr-sigs {
    display: flex;
    justify-content: space-between;
    gap: 10px;
    margin: 2px 0 0;
    break-inside: avoid;
    page-break-inside: avoid;
  }
  .ftr-sig { flex: 1; text-align: center; font-size: 11px; font-weight: 700; line-height: 1.3; }
  .ftr-sig.ftr-sig-left { text-align: left; }
  .ftr-sig.ftr-sig-left .ftr-sig-space { justify-content: flex-start; }
  .ftr-sig.ftr-sig-right { text-align: right; }
  .ftr-sig.ftr-sig-right .ftr-sig-space { justify-content: flex-end; }
  .ftr-sig-title { font-size: 11px; font-weight: 700; text-decoration: underline; }
  .ftr-sig-label { font-size: 11px; font-weight: 700; text-decoration: none; }
  .ftr-sig-space { height: 10mm; display: flex; align-items: flex-end; justify-content: center; }
  .ftr-sig-img { max-height: 9mm; max-width: 36mm; object-fit: contain; }
  .ftr-sheet .pd-page-num {
    left: auto !important;
    right: 3mm !important;
    bottom: 3mm !important;
    text-align: right !important;
    border-top: none !important;
    padding-top: 0 !important;
    background: transparent !important;
  }
`

export function buildFactoryTestReportHtml(data: FactoryTestReportData): string {
  return buildPrintPage({
    title: `Factory Test Report — ${data.applicantName || 'Applicant'}`,
    styles: STYLES,
    body: buildBody(data),
  })
}

/** Maps project + saved Factory Test Report module payload into print fields. */
export function factoryTestReportDataFromPrintData(printData: BisPrintData): FactoryTestReportData {
  const raw =
    printData.modulePayload && typeof printData.modulePayload === 'object'
      ? (printData.modulePayload as Record<string, unknown>)
      : null
  const parsed = parseFactoryTestReportPayload(raw)
  const sig = printSignatoryDefaults(printData)
  const testedByDesignation =
    parsed.testedByDesignation === 'Technical Staff / Quality Control Incharge'
      ? ''
      : parsed.testedByDesignation
  const testedBySignatureImageUrl = String(
    raw?.testedBySignatureImageUrl ?? raw?.tested_by_signature_image_url ?? '',
  ).trim()
  return {
    ...applicantContextFromPrintData(printData),
    productTitle: printData.isCode.title,
    reports: parsed.reports,
    authorisedName: parsed.authorisedName || sig.signatoryName || printData.client.contactPerson,
    authorisedDesignation: parsed.authorisedDesignation || sig.signatoryDesignation,
    // Witnessed By — always from BIS Application Details when present.
    inspectionOfficerName:
      (printData.row.inspection_officer_name ?? '').trim() || parsed.inspectionOfficerName,
    inspectionOfficerDesignation:
      (printData.row.inspection_officer_designation ?? '').trim() ||
      parsed.inspectionOfficerDesignation,
    testedByName: parsed.testedByName,
    testedByDesignation,
    applyWitnessedBy: parsed.applyWitnessedBy,
    applyAuthorizedSignatory: parsed.applyAuthorizedSignatory,
    applyTestedBy: parsed.applyTestedBy,
    ...(testedBySignatureImageUrl ? { testedBySignatureImageUrl } : {}),
  }
}
