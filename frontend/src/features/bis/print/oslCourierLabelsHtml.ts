import type { BisPrintData } from './loadBisPrintData'
import { escapeHtml as esc } from './openPrintHtml'
import {
  applicantContextFromPrintData,
  applicationNoDisplay,
  buildPrintPage,
  type PrintApplicantContext,
} from './printDocumentShared'

export type CourierLabelRow = {
  laboratoryName: string
  laboratoryAddress: string
  sampleCode: string
  qrCode: string
}

export type OslCourierLabelsData = PrintApplicantContext & {
  rows: CourierLabelRow[]
  includeBlvCareOf: boolean
}

const BLV_CARE_OF = 'BLV Testing Solutions C/o'
const LAB_MOBILE = 'Mobile: +919009413040'

function labelCard(row: CourierLabelRow, data: OslCourierLabelsData): string {
  const labName = row.laboratoryName.trim() || '________________'
  const labAddress = row.laboratoryAddress.trim()
  const sampleCode = row.sampleCode.trim()
  const qrCode = row.qrCode.trim() || sampleCode

  return `
<article class="sample-label">
  <div class="cols-2">
    <section class="col col-lab">
      <div class="to-block">
        <div class="block-kicker">To · Laboratory</div>
        ${data.includeBlvCareOf ? `<div class="to-blv">${esc(BLV_CARE_OF)}</div>` : ''}
        <div class="to-name">${esc(labName)}</div>
        <div class="to-address">${labAddress ? esc(labAddress).replace(/\n/g, '<br/>') : '—'}</div>
        <div class="to-mobile">${esc(LAB_MOBILE)}</div>
      </div>
      <div class="from-block">
        <div class="block-kicker">From · Applicant</div>
        <div class="from-name">${esc(data.applicantName || '—')}</div>
        ${data.applicantAddress ? `<div class="from-address">${esc(data.applicantAddress)}</div>` : ''}
        <div class="from-meta">App No.: ${esc(applicationNoDisplay(data.applicationNumber))}</div>
        <div class="from-meta">IS: ${esc(data.isNumber || '—')}</div>
      </div>
    </section>
    <section class="col col-qr">
      <div class="block-kicker">Scan QR for Sample Details</div>
      <div class="qr-panel">
        <div class="label-qr-empty">No QR</div>
        <div class="code-block">
          <div class="code-row"><span class="code-label">Sample Code</span><span class="code-value">${esc(sampleCode || '—')}</span></div>
          <div class="code-row"><span class="code-label">Sample QR Code</span><span class="code-value">${esc(qrCode || '—')}</span></div>
        </div>
        <div class="qr-hint">Scan QR · full details inside</div>
      </div>
    </section>
  </div>
</article>`
}

function buildBody(data: OslCourierLabelsData): string {
  const rows =
    data.rows.length > 0
      ? data.rows
      : [
          { laboratoryName: '', laboratoryAddress: '', sampleCode: '', qrCode: '' },
          { laboratoryName: '', laboratoryAddress: '', sampleCode: '', qrCode: '' },
        ]

  const cards = rows.map((row) => labelCard(row, data)).join('')
  return `<div class="sheet">${cards}</div>`
}

const STYLES = `
  @page { size: A4 portrait; margin: 10mm; }
  .sheet { display: flex; flex-direction: column; gap: 6mm; }
  .sample-label {
    border: 1px solid #111;
    padding: 4mm;
    min-height: 120mm;
    break-inside: avoid;
    page-break-inside: avoid;
  }
  .cols-2 { display: grid; grid-template-columns: 1.2fr 0.9fr; gap: 4mm; height: 100%; }
  .block-kicker { font-size: 9px; font-weight: 800; text-transform: uppercase; letter-spacing: .06em; color: #57534e; margin-bottom: 2mm; }
  .to-block, .from-block { border: 0.6pt solid #a8a29e; padding: 3mm; margin-bottom: 3mm; }
  .to-blv, .to-name, .from-name { font-weight: 700; font-size: 12px; }
  .to-address, .from-address, .to-mobile, .from-meta { font-size: 10.5px; margin-top: 1mm; line-height: 1.4; }
  .qr-panel { border: 0.6pt solid #a8a29e; padding: 3mm; text-align: center; }
  .label-qr-empty {
    width: 48mm; height: 48mm; margin: 0 auto;
    border: 0.6pt dashed #9ca3af; display: flex; align-items: center; justify-content: center;
    font-size: 10px; color: #9ca3af;
  }
  .code-block { margin-top: 3mm; text-align: left; }
  .code-row { display: flex; justify-content: space-between; gap: 2mm; font-size: 10px; margin: 1mm 0; }
  .code-label { color: #57534e; font-weight: 700; }
  .code-value { font-weight: 700; }
  .qr-hint { margin-top: 2mm; font-size: 8px; font-weight: 700; letter-spacing: .04em; text-transform: uppercase; color: #78716c; }
`

export function buildOslCourierLabelsHtml(data: OslCourierLabelsData): string {
  return buildPrintPage({
    title: `OSL Courier Labels — ${data.applicantName || 'Applicant'}`,
    styles: STYLES,
    body: buildBody(data),
  })
}

/** Maps a BIS project row + client + consultancy context into courier label fields. */
export function oslCourierLabelsDataFromPrintData(printData: BisPrintData): OslCourierLabelsData {
  const ctx = applicantContextFromPrintData(printData)
  return {
    ...ctx,
    rows: [],
    includeBlvCareOf: true,
  }
}
