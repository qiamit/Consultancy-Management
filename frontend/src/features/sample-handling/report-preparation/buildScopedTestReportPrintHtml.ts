import type { TestReportCoverDetails } from './fetchTestReportCoverDetails'
import { groupReportRowsBySectionCode, type ReportResultRow } from './reportResultRows'
import { PART_D_HEADING } from './TestReportRemarksSection'
import { formatPartDRemarksLine1, splitPartDRemarks } from './testReportPartDRemarks'
import {
  formatTestReportEndNotesText,
  TEST_REPORT_END_MARKER,
} from './testReportEndNotes'
import type { ResolvedScopeTemplate } from './reportScopeConfig'
import { type ReportScopeKind } from './reportScope'
import { PART_B_ROW_LABELS, partBValuesList } from './testReportPartB'
import {
  DEFAULT_TEST_REPORT_PRINT_SETTINGS,
  formatSignatureDesignationLine,
  signaturesApplyAfterPart,
  signaturesForPart,
  type TestReportPrintSettings,
  type TestReportSignatureAfterPart,
} from '@/features/settings/lab-settings/printSettingsTypes'
import { buildPrintStylesCss, buildWatermarkStyleCss } from './buildPrintStylesCss'
import {
  DEFAULT_PART_C_REPORT_COLUMNS,
  partCColumnWidthPercents,
  partCColumnsForScope,
  type PartCReportColumnKey,
  type PartCReportColumnVisibility,
  visiblePartCReportColumns,
} from './partCReportColumns'
import { waitForPrintDocumentReady } from './waitForPrintDocumentReady'
import { digitalSignatureStampFields } from './digitalSignatureStamp'

function escapeHtml(s: string) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

const displayPart = (v: string | null | undefined) => (v && String(v).trim() ? String(v).trim() : '—')

function testNameCell(row: ReportResultRow): string {
  const methodLine = row.testMethodClause
    ? `<br/><span class="sub">${escapeHtml(row.testMethodClause)}</span>`
    : ''
  return `<span class="name">${escapeHtml(row.testName)}</span>${methodLine}`
}

function partAKv(label: string, value: string | null | undefined): string {
  return `<td class="part-a-k">${escapeHtml(label)}</td><td class="part-a-c">-</td><td class="part-a-v">${escapeHtml(displayPart(value))}</td>`
}

function partAFullRow(label: string, value: string | null | undefined): string {
  return `<tr class="part-a-full"><td class="part-a-k">${escapeHtml(label)}</td><td class="part-a-c">-</td><td class="part-a-v" colspan="4">${escapeHtml(displayPart(value)).replace(/\n/g, '<br/>')}</td></tr>`
}

function partAPairRow(
  left: { label: string; value: string | null | undefined },
  right: { label: string; value: string | null | undefined },
): string {
  return `<tr>${partAKv(left.label, left.value)}${partAKv(right.label, right.value)}</tr>`
}

function wrapPartATable(rowsHtml: string): string {
  return `<table class="part-a-table">
  <colgroup>
    <col class="part-a-col-k" /><col class="part-a-col-c" /><col class="part-a-col-v" />
    <col class="part-a-col-k" /><col class="part-a-col-c" /><col class="part-a-col-v" />
  </colgroup>
  <thead>
    <tr><th colspan="6">Part A. Particulars of Sample Submitted</th></tr>
  </thead>
  <tbody>
    ${rowsHtml}
  </tbody>
</table>`
}

function buildPartAPrintHtml(
  cover: TestReportCoverDetails | null | undefined,
  fallback: {
    scope: ReportScopeKind
    srf: string
    client: string
    isStandard: string
    dateReceiving: string
    reportNumber: string
    ulrNumber?: string
  },
): string {
  if (!cover) {
    return `<section class="report-part part-a">${wrapPartATable(`
      ${partAPairRow(
        { label: 'Report Type', value: null },
        { label: 'Date of Reporting', value: null },
      )}
      ${
        fallback.scope === 'nabl'
          ? partAPairRow(
              { label: 'Report Number', value: fallback.reportNumber },
              { label: 'ULR Number', value: fallback.ulrNumber },
            )
          : partAFullRow('Report Number', fallback.reportNumber)
      }
      ${partAFullRow('Customer Name', fallback.client)}
      ${partAFullRow('Customer Address', null)}
      ${partAFullRow('Product IS Code Title', fallback.isStandard)}
      ${partAFullRow('Sample Description', null)}
      ${partAFullRow('Declared Values', null)}
      ${partAFullRow('Batch Number', null)}
      ${partAFullRow('Date of Manufacturing', null)}
      ${partAFullRow('Sample Code', fallback.srf)}
      ${partAFullRow('QR Code / Bar Code', null)}
      ${partAPairRow(
        { label: 'BIS Seal', value: null },
        { label: "IO's Signature", value: null },
      )}
      ${partAFullRow('Date of Sample Receipt', fallback.dateReceiving)}
      ${partAFullRow('Sample Quantity', null)}
      ${partAFullRow('Nature of Sample', null)}
      ${partAFullRow('Section Code', null)}
      ${partAFullRow('Section Report No', null)}
      ${partAFullRow('Date of Test Started', null)}
      ${partAFullRow('Date of Test Completed', null)}
      ${partAFullRow('Party Reference No', null)}
      ${partAFullRow('Reference Report No', null)}
      ${partAFullRow('Any Other Information', null)}
    `)}</section>`
  }

  const ulrValue =
    fallback.scope === 'nabl' && fallback.ulrNumber?.trim() ? fallback.ulrNumber : null

  return `<section class="report-part part-a">${wrapPartATable(`
    ${partAPairRow(
      { label: 'Report Type', value: cover.reportType },
      { label: 'Date of Reporting', value: cover.dateOfReporting },
    )}
    ${
      fallback.scope === 'nabl'
        ? partAPairRow(
            { label: 'Report Number', value: fallback.reportNumber || null },
            { label: 'ULR Number', value: ulrValue },
          )
        : partAFullRow('Report Number', fallback.reportNumber || null)
    }
    ${partAFullRow('Customer Name', cover.customerName ?? fallback.client)}
    ${partAFullRow('Customer Address', cover.customerAddress)}
    ${partAFullRow('Product IS Code Title', cover.isDetails ?? cover.productTitle)}
    ${partAFullRow('Sample Description', cover.sampleDescription)}
    ${partAFullRow('Declared Values', cover.declaredValue)}
    ${partAFullRow('Batch Number', cover.batchNumber)}
    ${partAFullRow('Date of Manufacturing', cover.dateOfManufacturing?.trim() ? cover.dateOfManufacturing : '---')}
    ${partAFullRow('Sample Code', cover.sampleCode)}
    ${partAFullRow('QR Code / Bar Code', cover.sampleQrCode)}
    ${partAPairRow(
      { label: 'BIS Seal', value: cover.bisSeal },
      { label: "IO's Signature", value: cover.ioSignature },
    )}
    ${partAFullRow('Date of Sample Receipt', cover.dateOfSampleReceipt)}
    ${partAFullRow('Sample Quantity', cover.sampleQuantity)}
    ${partAFullRow('Nature of Sample', cover.natureOfSample)}
    ${partAFullRow('Section Code', cover.sectionCodes)}
    ${partAFullRow('Section Report No', cover.sectionReportNo)}
    ${partAFullRow('Date of Test Started', cover.dateOfTestingStarted)}
    ${partAFullRow('Date of Test Completed', cover.dateOfTestingCompleted)}
    ${partAFullRow('Party Reference No', cover.partyReferenceNo)}
    ${partAFullRow('Reference Report No', cover.referenceReportNo)}
    ${partAFullRow('Any Other Information', cover.anyOtherInformation)}
  `)}</section>`
}

function buildPartBPrintHtml(cover: TestReportCoverDetails): string {
  const values = partBValuesList(cover.partB)
  const rows = PART_B_ROW_LABELS.map(
    (label, i) =>
      `<tr><td class="part-b-k">${i + 1}. ${escapeHtml(label)}</td><td class="part-b-c">:</td><td class="part-b-v">${escapeHtml(values[i] ?? '—')}</td></tr>`,
  ).join('')
  return `<section class="report-part part-b"><table class="part-b-table">
  <colgroup>
    <col class="part-b-col-k" /><col class="part-b-col-c" /><col class="part-b-col-v" />
  </colgroup>
  <thead>
    <tr><th colspan="3">Part B. Supplementary Information</th></tr>
  </thead>
  <tbody>
    ${rows}
  </tbody>
</table></section>`
}

function partCDataCell(key: PartCReportColumnKey, row: ReportResultRow): string {
  switch (key) {
    case 'srNo':
      return `<td class="c">${row.srNo}</td>`
    case 'testName':
      return `<td class="l">${testNameCell(row)}</td>`
    case 'unit':
      return `<td class="c">${escapeHtml(row.unit)}</td>`
    case 'specifiedRequirement':
      return `<td class="c">${escapeHtml(row.specifiedRequirement)}</td>`
    case 'observedValue':
      return `<td class="c strong">${escapeHtml(row.observedValue)}</td>`
    case 'uncertainty':
      return `<td class="c">${escapeHtml(row.uncertainty)}</td>`
    case 'remark':
      return `<td class="c">${escapeHtml(row.remark)}</td>`
    default:
      return ''
  }
}

function partCColgroupHtml(
  visibleCols: Array<{ key: PartCReportColumnKey }>,
  columns: PartCReportColumnVisibility,
): string {
  const widths = partCColumnWidthPercents(columns)
  const cols = visibleCols
    .map((col) => `<col style="width:${widths[col.key]}" />`)
    .join('')
  return `<colgroup>${cols}</colgroup>`
}

function partCHeaderCellHtml(col: { key: PartCReportColumnKey; label: string }): string {
  if (col.key === 'srNo') return `<th class="part-c-h-sr">Sr<br/>No</th>`
  if (col.key === 'observedValue') return `<th>Observed<br/>Value</th>`
  if (col.key === 'specifiedRequirement') return `<th>Specified<br/>Requirements</th>`
  return `<th>${escapeHtml(col.label)}</th>`
}

function buildPartCResultsHtml(
  rows: ReportResultRow[],
  columns: PartCReportColumnVisibility = DEFAULT_PART_C_REPORT_COLUMNS,
  options?: { showEndNotes?: boolean; showSectionRows?: boolean },
): { tableHtml: string; endNotesBlock: string } {
  const showEndNotes = options?.showEndNotes !== false
  const showSectionRows = options?.showSectionRows !== false
  const visibleCols = visiblePartCReportColumns(columns)
  const colCount = Math.max(visibleCols.length, 1)
  const colgroup = partCColgroupHtml(visibleCols, columns)
  const headerCells = visibleCols.map((col) => partCHeaderCellHtml(col)).join('')

  const sections = groupReportRowsBySectionCode(rows)
  if (sections.length === 0) {
    return {
      tableHtml: `<table class="part-c-table">
      ${colgroup}
      <thead>
        <tr class="part-c-title"><th colspan="${colCount}">Part C. Test Results</th></tr>
        <tr class="part-c-col-heads">${headerCells}</tr>
      </thead>
      <tbody><tr><td colspan="${colCount}" class="c">No results for this scope</td></tr></tbody>
    </table>`,
      endNotesBlock: '',
    }
  }

  const rowsHtml = sections
    .flatMap((section) => [
      ...(showSectionRows
        ? [
            `<tr class="section-code"><td colspan="${colCount}">Section Code - ${escapeHtml(section.sectionCode)}</td></tr>`,
          ]
        : []),
      ...section.rows.map(
        (r) => `<tr>${visibleCols.map((col) => partCDataCell(col.key, r)).join('')}</tr>`,
      ),
    ])
    .join('')

  const tableHtml = `<table class="part-c-table">
    ${colgroup}
    <thead>
      <tr class="part-c-title"><th colspan="${colCount}">Part C. Test Results</th></tr>
      <tr class="part-c-col-heads">${headerCells}</tr>
    </thead>
    <tbody>${rowsHtml}</tbody>
  </table>`

  const endNotesBlock = showEndNotes
    ? `
    <div class="part-c-end-notes">
      <p class="end-marker">${escapeHtml(TEST_REPORT_END_MARKER)}</p>
      <p class="end-notes-body">${escapeHtml(formatTestReportEndNotesText())}</p>
    </div>`
    : ''

  return { tableHtml, endNotesBlock }
}

function buildPartCPrintHtml(
  rows: ReportResultRow[],
  columns: PartCReportColumnVisibility = DEFAULT_PART_C_REPORT_COLUMNS,
  printSettings?: TestReportPrintSettings,
): string {
  const { tableHtml, endNotesBlock } = buildPartCResultsHtml(rows, columns, {
    showEndNotes: printSettings?.showPartCEndNotes !== false,
    showSectionRows: printSettings?.showPartCSectionRows !== false,
  })
  return `<section class="report-part part-c">
  ${tableHtml}
  ${endNotesBlock}
</section>`
}

function buildPartDPrintHtml(notes: string, isLabel: string): string {
  const { line1, line2 } = splitPartDRemarks(notes, isLabel)
  const line1Text = line1 || formatPartDRemarksLine1(isLabel)
  const line2Text = line2.trim()
  const line2Html = line2Text
    ? escapeHtml(line2Text).replace(/\n/g, '<br/>')
    : '&nbsp;'
  return `<section class="report-part part-d"><table class="part-d-table">
  <thead>
    <tr><th>${escapeHtml(PART_D_HEADING)}</th></tr>
  </thead>
  <tbody>
    <tr><td class="part-d-line">${escapeHtml(line1Text)}</td></tr>
    <tr><td class="part-d-line">${line2Html}</td></tr>
  </tbody>
</table></section>`
}

function buildSignatureCellHtml(
  sig: {
    roleLabel: string
    name: string
    designation: string
    department: string
  },
  _issuedAtIso: string | null,
): string {
  const stamp = digitalSignatureStampFields({
    roleLabel: sig.roleLabel,
    name: sig.name,
    designation: formatSignatureDesignationLine(sig),
  })
  const roleHtml = stamp.roleLabel
    ? `<div class="report-signature-role">${escapeHtml(stamp.roleLabel)}</div>`
    : ''
  return `<div class="report-signature-cell">
    ${roleHtml}
    <div class="report-signature-line" aria-hidden="true"></div>
    <div class="report-signature-name">${escapeHtml(stamp.name)}</div>
    <div class="report-signature-designation">${escapeHtml(stamp.designation)}</div>
  </div>`
}

function buildSignaturesPrintHtml(
  printSettings: TestReportPrintSettings,
  part: TestReportSignatureAfterPart,
  issuedAtIso: string | null,
): string {
  const signatures = signaturesForPart(printSettings, part)
  if (signatures.length === 0) return ''

  const count = signatures.length
  const countClass =
    count === 1
      ? 'report-signatures-count-1'
      : count === 2
        ? 'report-signatures-count-2'
        : count === 3
          ? 'report-signatures-count-3'
          : count === 4
            ? 'report-signatures-count-4'
            : 'report-signatures-count-many'

  let cellsHtml: string
  if (count === 4) {
    const [left, c1, c2, right] = signatures
    cellsHtml = `${buildSignatureCellHtml(left, issuedAtIso)}<div class="report-signatures-center-pair">${buildSignatureCellHtml(c1, issuedAtIso)}${buildSignatureCellHtml(c2, issuedAtIso)}</div>${buildSignatureCellHtml(right, issuedAtIso)}`
  } else {
    cellsHtml = signatures.map((sig) => buildSignatureCellHtml(sig, issuedAtIso)).join('')
  }

  return `<section class="report-signatures report-signatures-flow" aria-label="Report signatures after ${part}">
    <div class="report-signatures-grid ${countClass}">${cellsHtml}</div>
  </section>`
}

function withSignaturesAfterPart(
  partHtml: string,
  part: TestReportSignatureAfterPart,
  printSettings: TestReportPrintSettings,
  issuedAtIso: string | null,
): string {
  if (!partHtml.trim()) return partHtml
  if (!signaturesApplyAfterPart(printSettings, part)) return partHtml
  const signatureBlock = buildSignaturesPrintHtml(printSettings, part, issuedAtIso)
  if (!signatureBlock) return partHtml
  return `${partHtml}\n${signatureBlock}`
}

export function buildScopedTestReportPrintHtml(opts: {
  scope: ReportScopeKind
  labName: string
  srf: string
  client: string
  isStandard: string
  dateReceiving: string
  reportNumber: string
  ulrNumber?: string
  notes: string
  rows: ReportResultRow[]
  template: ResolvedScopeTemplate
  coverDetails?: TestReportCoverDetails | null
  printSettings?: TestReportPrintSettings
  /** ISO timestamp used on digital signature stamps (Report Issue Date). */
  signatureIssuedAt?: string | null
}): string {
  const printSettings = opts.printSettings ?? DEFAULT_TEST_REPORT_PRINT_SETTINGS
  const signatureIssuedAt =
    opts.signatureIssuedAt?.trim() ||
    opts.coverDetails?.issuedAtIso?.trim() ||
    new Date().toISOString()
  const printStyles = buildPrintStylesCss(printSettings)
  const watermarkStyle = buildWatermarkStyleCss(printSettings, opts.template, escapeHtml)

  const headerInner = opts.template.omitHeader
    ? ''
    : opts.template.headerUrl
      ? `<img src="${escapeHtml(opts.template.headerUrl)}" alt="Letterhead"/>`
      : `<strong>${escapeHtml(opts.labName)}</strong>`

  const footerInner =
    opts.template.omitFooter || !opts.template.footerUrl
      ? ''
      : `<img src="${escapeHtml(opts.template.footerUrl)}" alt="Footer"/>`

  const headerHtml =
    printSettings.showPrintHeader && headerInner && !opts.template.omitHeader
      ? `<header class="print-header${opts.template.headerUrl ? '' : ' fallback'}">${headerInner}</header>`
      : ''

  const footerHtml =
    printSettings.showPrintFooter && footerInner && !opts.template.omitFooter
      ? `<footer class="print-footer">${footerInner}</footer>`
      : ''

  const pageBorderHtml =
    printSettings.pageBorderType !== 'none'
      ? `<div class="print-page-border" aria-hidden="true"></div>`
      : ''

  const termsBlock =
    printSettings.showTermsAndConditions && opts.template.termsText.trim()
      ? `<div class="terms"><h3>Terms &amp; Conditions</h3><div class="terms-body">${escapeHtml(opts.template.termsText).replace(/\n/g, '<br/>')}</div></div>`
      : ''

  const titleBlock = printSettings.showReportTitle
    ? `<div class="report-title-block"><h1>** Test Report **</h1></div>`
    : ''

  const isLabel = opts.coverDetails?.isCode ?? opts.isStandard
  const partAHtml = buildPartAPrintHtml(opts.coverDetails, {
    scope: opts.scope,
    srf: opts.srf,
    client: opts.client,
    isStandard: opts.isStandard,
    dateReceiving: opts.dateReceiving,
    reportNumber: opts.reportNumber,
    ulrNumber: opts.scope === 'nabl' ? opts.ulrNumber : undefined,
  })
  const partBHtml = opts.coverDetails?.partB ? buildPartBPrintHtml(opts.coverDetails) : ''
  const partCHtml = buildPartCPrintHtml(
    opts.rows,
    partCColumnsForScope(printSettings.partCColumns, opts.scope),
    printSettings,
  )
  const partDHtml = buildPartDPrintHtml(opts.notes, isLabel)
  const partAWithSignatures = withSignaturesAfterPart(
    partAHtml,
    'part_a',
    printSettings,
    signatureIssuedAt,
  )
  const partBWithSignatures = withSignaturesAfterPart(
    partBHtml,
    'part_b',
    printSettings,
    signatureIssuedAt,
  )
  const partCWithSignatures = withSignaturesAfterPart(
    partCHtml,
    'part_c',
    printSettings,
    signatureIssuedAt,
  )
  const partDWithSignatures = withSignaturesAfterPart(
    partDHtml,
    'part_d',
    printSettings,
    signatureIssuedAt,
  )

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"/><title></title>
<style>${printStyles}${watermarkStyle}</style></head><body>
${headerHtml}
${footerHtml}
${pageBorderHtml}
<main class="print-body">
  ${titleBlock}
  ${partAWithSignatures}
  ${partBWithSignatures}
  ${partCWithSignatures}
  ${partDWithSignatures}
  ${termsBlock}
</main>
</body></html>`
}

export async function printHtmlDocument(html: string): Promise<void> {
  const iframe = document.createElement('iframe')
  iframe.style.position = 'fixed'
  iframe.style.right = '0'
  iframe.style.bottom = '0'
  iframe.style.width = '0'
  iframe.style.height = '0'
  iframe.style.border = '0'
  iframe.setAttribute('aria-hidden', 'true')
  document.body.appendChild(iframe)
  const doc = iframe.contentDocument
  const win = iframe.contentWindow
  if (!doc || !win) {
    document.body.removeChild(iframe)
    throw new Error('Unable to open print preview. Please try again or allow pop-ups for this site.')
  }
  doc.open()
  doc.write(html)
  doc.close()
  doc.title = ''
  await waitForPrintDocumentReady(doc)
  try {
    win.focus()
    win.print()
  } finally {
    window.setTimeout(() => {
      try {
        document.body.removeChild(iframe)
      } catch {
        /* ignore */
      }
    }, 500)
  }
}
