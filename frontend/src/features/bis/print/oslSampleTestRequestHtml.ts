import type { OslSampleRequirementRow } from '../projects/oslSampleRequirementsModel'
import { parseOslSampleRequirementsPayload } from '../projects/oslSampleRequirementsModel'
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

export type OslSampleTestRequestRow = {
  laboratoryName: string
  laboratoryAddress: string
  laboratoryMobile: string
  sampleCode: string
  qrCode: string
  sampleType: string
  priority: string
  shelfLife: string
  serialNumber: string
  testRequired: string
  testingCharges: string
  batchNumber: string
  dateOfManufacturing: string
  gradeTypeVariety: string
  declaredValue: string
  sampleDescription: string
  additionalInformation: string
  sampleQuantity: string
}

export type OslSampleTestRequestData = PrintApplicantContext & {
  rows: OslSampleTestRequestRow[]
  includeBlvCareOf: boolean
}

const BLV_CARE_OF = 'BLV Testing Solutions C/o'
/** Shared lab contact printed on Sample Sent To / courier slip. */
const BLV_MOBILE = 'Mobile: +91 90094 13040'

function pairRow(aLabel: string, aValue: string, bLabel: string, bValue: string): string {
  return `<tr>
    <th>${esc(aLabel)}</th><td>${aValue || '&nbsp;'}</td>
    <th>${esc(bLabel)}</th><td>${bValue || '&nbsp;'}</td>
  </tr>`
}

function fullRow(label: string, value: string): string {
  return `<tr><th>${esc(label)}</th><td colspan="3">${value || '&nbsp;'}</td></tr>`
}

function cell(value: string): string {
  const v = value.trim()
  return v ? esc(v) : '&nbsp;'
}

export function oslSampleRowToTestRequestRow(
  row: OslSampleRequirementRow,
): OslSampleTestRequestRow {
  const labName = row.laboratoryName.trim() || row.destinationLab.trim()
  const dest = row.destinationLab.trim()
  const address =
    dest && dest.toLowerCase() !== labName.toLowerCase() ? dest : ''
  return {
    laboratoryName: labName,
    laboratoryAddress: address,
    laboratoryMobile: BLV_MOBILE,
    sampleCode: row.sampleCode,
    qrCode: row.qrCode,
    sampleType: row.sampleType,
    priority: row.priority,
    shelfLife: row.shelfLife,
    serialNumber: row.serialNumber,
    testRequired: row.testRequired,
    testingCharges: row.testingCharges,
    batchNumber: row.batchNumber,
    dateOfManufacturing: row.dateOfManufacturing,
    gradeTypeVariety: row.gradeTypeVariety,
    declaredValue: row.declaredValue,
    sampleDescription: row.sampleDescription || row.gradeTypeVariety,
    additionalInformation: row.additionalInformation,
    sampleQuantity: row.sampleQuantity,
  }
}

function pageHtml(data: OslSampleTestRequestData, row: OslSampleTestRequestRow, index: number): string {
  const firm = row.laboratoryName.trim() || '________________'
  const address = row.laboratoryAddress.trim()
  const mobile = row.laboratoryMobile.trim() || BLV_MOBILE
  const today = dateOrNa(new Date().toISOString().slice(0, 10))
  const isNo = data.isNumber.trim() || '—'
  const firmFrom = [data.applicantName, data.applicantAddress].filter(Boolean).join(', ') || '—'

  return `
<article class="tr-page">
  ${index === 0 ? letterheadHtml(data) : ''}
  <header class="tr-head"><h2>TEST REQUEST</h2></header>

  <div class="tr-to-qr">
    <section class="tr-sent tr-sent-to">
      <span class="tr-k">Sample Sent To:</span>
      <div class="tr-sent-body">
        ${data.includeBlvCareOf ? `<div class="tr-sent-blv">${esc(BLV_CARE_OF)}</div>` : ''}
        <div class="tr-sent-firm">${esc(firm)}</div>
        ${address ? `<div class="tr-sent-addr">${esc(address)}</div>` : ''}
        <div class="tr-sent-mobile">${esc(mobile)}</div>
      </div>
    </section>
    <aside class="tr-head-qr-card">
      <div class="tr-head-qr-empty">No QR</div>
      <p class="tr-head-qr-caption">Scan for complete sample details</p>
    </aside>
  </div>

  <section class="tr-box">
    <h3>Sample Details</h3>
    <table class="tr-grid">
      <tbody>
        ${pairRow('IS Number', esc(isNo), 'Test Request Date', esc(today))}
        ${pairRow('Sample Code', cell(row.sampleCode), 'QR Code', cell(row.qrCode))}
        ${pairRow('Sample Type', cell(row.sampleType), 'Priority', cell(row.priority))}
        ${pairRow('Shelf Life', cell(row.shelfLife), 'Serial Number', cell(row.serialNumber))}
        ${pairRow('Test Required', cell(row.testRequired), 'Testing Charges', cell(row.testingCharges))}
        ${pairRow(
          'Batch Number',
          cell(row.batchNumber),
          'Manufacturing Date',
          row.dateOfManufacturing.trim() ? esc(dateOrNa(row.dateOfManufacturing)) : '&nbsp;',
        )}
        ${fullRow('Grade / Type / Variety', cell(row.gradeTypeVariety))}
        ${fullRow('Declared Value', cell(row.declaredValue))}
        ${fullRow('Sample Description', cell(row.sampleDescription))}
        ${fullRow('Additional Information', cell(row.additionalInformation))}
        ${fullRow('Sample Quantity', cell(row.sampleQuantity))}
        ${fullRow('Application No.', esc(applicationNoDisplay(data.applicationNumber)))}
      </tbody>
    </table>
  </section>

  <section class="tr-sent tr-sent-from">
    <span class="tr-k">Sample Sent From :</span>
    <div class="tr-sent-body">
      <div class="tr-sent-firm">${esc(data.applicantName || '—')}</div>
      ${data.applicantAddress ? `<div class="tr-sent-addr">${esc(data.applicantAddress)}</div>` : ''}
      ${!data.applicantName && !data.applicantAddress ? `<div>${esc(firmFrom)}</div>` : ''}
    </div>
  </section>
  ${preparedByHtml(data.preparedBy)}
</article>`
}

function emptyTestRequestRow(isTitle: string): OslSampleTestRequestRow {
  return {
    laboratoryName: '',
    laboratoryAddress: '',
    laboratoryMobile: BLV_MOBILE,
    sampleCode: '',
    qrCode: '',
    sampleType: '',
    priority: '',
    shelfLife: '',
    serialNumber: '',
    testRequired: '',
    testingCharges: '',
    batchNumber: '',
    dateOfManufacturing: '',
    gradeTypeVariety: isTitle,
    declaredValue: '',
    sampleDescription: '',
    additionalInformation: '',
    sampleQuantity: '',
  }
}

function buildBody(data: OslSampleTestRequestData): string {
  const rows = data.rows.length > 0 ? data.rows : [emptyTestRequestRow(data.isTitle)]
  return rows.map((row, i) => pageHtml(data, row, i)).join('')
}

const STYLES = `
  .tr-page { font-family: "Times New Roman", Times, serif; color: #111; margin-bottom: 8mm; }
  .tr-page + .tr-page { page-break-before: always; break-before: page; }
  .tr-head { margin-bottom: 4mm; text-align: center; }
  .tr-head h2 { margin: 0; font-size: 22px; font-weight: 800; letter-spacing: .08em; text-decoration: underline; }
  .tr-to-qr { display: grid; grid-template-columns: minmax(0, 1fr) 58mm; gap: 4mm; align-items: stretch; margin-bottom: 3mm; }
  .tr-head-qr-card { border: 0.75pt solid #d1d5db; padding: 3mm; background: #fff; }
  .tr-head-qr-empty { width: 100%; height: 46mm; display: flex; align-items: center; justify-content: center; border: 0.6pt dashed #9ca3af; font-size: 10px; color: #9ca3af; }
  .tr-head-qr-caption { margin: 1.5mm 0 0; text-align: center; font-size: 8px; font-weight: 700; letter-spacing: .04em; text-transform: uppercase; color: #6b7280; }
  .tr-sent { border: 0.75pt solid #9ca3af; border-radius: 2mm; padding: 2.5mm 3mm; font-size: 12px; line-height: 1.5; margin-bottom: 2mm; }
  .tr-sent-body { display: flex; flex-direction: column; gap: 0.6mm; margin-top: 1.2mm; }
  .tr-sent-blv, .tr-sent-firm { font-weight: 700; }
  .tr-sent-mobile { font-weight: 700; margin-top: 0.4mm; }
  .tr-sent-from { margin-top: 3.5mm; margin-bottom: 0; }
  .tr-k { font-weight: 800; display: block; }
  .tr-box { border: 0.75pt solid #d1d5db; border-radius: 2mm; padding: 3mm; }
  .tr-box h3 { margin: 0 0 1.5mm; font-size: 13px; font-weight: 800; }
  .tr-grid { width: 100%; border-collapse: collapse; }
  .tr-grid th, .tr-grid td { border: 0.6pt solid #9ca3af; padding: 2.2mm; font-size: 11px; vertical-align: top; }
  .tr-grid th { background: #f3f4f6; font-weight: 800; text-align: left; white-space: nowrap; width: 18%; }
`

export function buildOslSampleTestRequestHtml(data: OslSampleTestRequestData): string {
  return buildPrintPage({
    title: `OSL Test Request — ${data.applicantName || 'Applicant'}`,
    styles: STYLES,
    body: buildBody(data),
  })
}

/** Maps a BIS project + Sample Requirements module payload into Test Request / Courier Slip pages. */
export function oslSampleTestRequestDataFromPrintData(printData: BisPrintData): OslSampleTestRequestData {
  const ctx = applicantContextFromPrintData(printData)
  const parsed = parseOslSampleRequirementsPayload(
    printData.modulePayload && typeof printData.modulePayload === 'object'
      ? (printData.modulePayload as Record<string, unknown>)
      : null,
  )
  return {
    ...ctx,
    rows: parsed.rows.map(oslSampleRowToTestRequestRow),
    includeBlvCareOf: true,
  }
}

/** Build print data for one live sample row (Courier Slip from Sample Requirements table). */
export function oslSampleTestRequestDataForSample(
  printData: BisPrintData,
  sample: OslSampleRequirementRow,
): OslSampleTestRequestData {
  const ctx = applicantContextFromPrintData(printData)
  return {
    ...ctx,
    rows: [oslSampleRowToTestRequestRow(sample)],
    includeBlvCareOf: true,
  }
}
