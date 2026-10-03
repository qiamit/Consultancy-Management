import type { BisPrintData } from './loadBisPrintData'
import { escapeHtml as esc } from './openPrintHtml'
import {
  applicantContextFromPrintData,
  applicationNoDisplay,
  buildPrintPage,
  dateOrNa,
  letterheadHtml,
  preparedByHtml,
  type PrintApplicantContext,
} from './printDocumentShared'

export type FactoryTestReportData = PrintApplicantContext & {
  productTitle: string
  gradeType: string
  declaredValues: string
  batchHeatNumber: string
  dateOfManufacturing: string
  dateOfTestingStart: string
  dateOfTestingCompletion: string
  inspectionOfficerName: string
  inspectionOfficerDesignation: string
  authorisedName: string
  authorisedDesignation: string
  testedByName: string
  testedByDesignation: string
}

const TEST_BLANK_ROWS = 12

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
  return `<tr><td class="pd-lbl">${esc(label)}</td><td colspan="5">${content}</td></tr>`
}

function sigBlock(title: string, name: string, designation: string, org: string): string {
  return `
<div class="ftr-sig">
  <div class="ftr-sig-title">${esc(title)}</div>
  <div class="ftr-sig-space"></div>
  <div><strong>${esc(name.trim() || '—')}</strong></div>
  ${designation.trim() ? `<div>${esc(designation)}</div>` : ''}
  <div>${esc(org)}</div>
</div>`
}

function buildBody(data: FactoryTestReportData): string {
  const testRows = Array.from({ length: TEST_BLANK_ROWS }, () =>
    '<tr><td class="pd-left">&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td></tr>',
  ).join('')

  return `
<div class="pd-sheet">
  ${letterheadHtml(data)}
  <h1 class="pd-title">Factory Test Report</h1>
  <table class="pd-meta ftr-meta">
    <tr>
      <td class="pd-lbl">Application No.</td><td>${esc(applicationNoDisplay(data.applicationNumber))}</td>
      <td class="pd-lbl">Date of Application</td><td>${esc(dateOrNa(data.dateOfApplication))}</td>
      <td class="pd-lbl">Date of Inspection</td><td>${esc(dateOrNa(data.dateOfInspection))}</td>
    </tr>
    ${metaRow('Applicant Name', `<strong>${value(data.applicantName)}</strong>`)}
    ${metaRow('Applicant Address', value(data.applicantAddress))}
    ${metaRow('Specification', value(specification(data)))}
    ${metaRow('Grade / Type / Variety', value(data.gradeType))}
    ${metaRow('Declared Values, if any', value(data.declaredValues))}
    <tr>
      <td class="pd-lbl">Batch / Heat Number</td><td>${value(data.batchHeatNumber)}</td>
      <td class="pd-lbl">Date of Manufacturing</td><td colspan="3">${plainOrDate(data.dateOfManufacturing)}</td>
    </tr>
    <tr>
      <td class="pd-lbl">Date of Testing Start</td><td>${plainOrDate(data.dateOfTestingStart)}</td>
      <td class="pd-lbl">Date of Testing Completion</td><td colspan="3">${plainOrDate(data.dateOfTestingCompletion)}</td>
    </tr>
  </table>

  <table class="pd-table ftr-table">
    <colgroup><col style="width:30%"/><col style="width:9%"/><col style="width:25%"/><col style="width:18%"/><col style="width:18%"/></colgroup>
    <thead>
      <tr>
        <th>Test Name<br/><span class="ftr-sub">Clause No · IS Reference</span></th>
        <th>Unit</th><th>Specified Requirements</th><th>Observed Value</th><th>Remark</th>
      </tr>
    </thead>
    <tbody>${testRows}</tbody>
  </table>
  <p class="ftr-end">*** End of Report ***</p>

  <div class="ftr-sigs">
    ${sigBlock('Witnessed By', data.inspectionOfficerName, data.inspectionOfficerDesignation, 'Bureau of Indian Standards')}
    ${sigBlock('Authorised Signatory', data.authorisedName, data.authorisedDesignation, data.applicantName || '—')}
    ${sigBlock('Tested By', data.testedByName, data.testedByDesignation, data.applicantName || '—')}
  </div>
  ${preparedByHtml(data.preparedBy)}
</div>`
}

const STYLES = `
  .ftr-meta td.pd-lbl { width: 15%; }
  .ftr-table td { height: 8mm; }
  .ftr-sub { font-weight: 600; font-size: 9px; }
  .ftr-end { text-align: center; font-weight: 700; font-size: 11px; margin: 4px 0 8px; }
  .ftr-sigs { display: flex; justify-content: space-between; gap: 12px; margin-top: 8px; break-inside: avoid; page-break-inside: avoid; }
  .ftr-sig { flex: 1; text-align: center; font-size: 11px; line-height: 1.4; }
  .ftr-sig-title { font-weight: 700; text-decoration: underline; }
  .ftr-sig-space { height: 18mm; }
`

export function buildFactoryTestReportHtml(data: FactoryTestReportData): string {
  return buildPrintPage({
    title: `Factory Test Report — ${data.applicantName || 'Applicant'}`,
    styles: STYLES,
    body: buildBody(data),
  })
}

/** Maps a BIS project row + client + IS code + consultancy context into a blank Factory Test Report. */
export function factoryTestReportDataFromPrintData(printData: BisPrintData): FactoryTestReportData {
  return {
    ...applicantContextFromPrintData(printData),
    productTitle: printData.isCode.title,
    gradeType: '',
    declaredValues: '',
    batchHeatNumber: '',
    dateOfManufacturing: '',
    dateOfTestingStart: '',
    dateOfTestingCompletion: '',
    inspectionOfficerName: '',
    inspectionOfficerDesignation: '',
    authorisedName: printData.client.contactPerson,
    authorisedDesignation: '',
    testedByName: '',
    testedByDesignation: '',
  }
}
