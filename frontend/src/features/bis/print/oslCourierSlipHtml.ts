import type { OslSampleRequirementRow } from '../projects/oslSampleRequirementsModel'
import type { BisPrintData } from './loadBisPrintData'
import { escapeHtml as esc } from './openPrintHtml'
import {
  applicantContextFromPrintData,
  buildPrintPage,
  dateOrNa,
  type PrintApplicantContext,
} from './printDocumentShared'

export type OslCourierSlipPerPage = 1 | 2 | 3 | 4

export type OslCourierSlipData = PrintApplicantContext & {
  laboratoryName: string
  laboratoryAddress: string
  sampleCode: string
  qrCode: string
  qrDataUrl: string
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
  includeBlvCareOf: boolean
  includeMobile: boolean
}

const BLV_CARE_OF = 'BLV Testing Solutions C/o'
const BLV_MOBILE = 'Mobile: +919009413040'

export function normalizeCourierSlipPerPage(raw: unknown): OslCourierSlipPerPage {
  const n = Number(raw)
  if (n === 2 || n === 3 || n === 4) return n
  return 1
}

/** Pair row; omit empty sides; hide row when both empty. */
function pairRow(aLabel: string, aRaw: string, bLabel: string, bRaw: string): string {
  const a = aRaw.trim()
  const b = bRaw.trim()
  if (!a && !b) return ''
  if (a && b) {
    return `<tr>
    <th>${esc(aLabel)}</th><td>${esc(a)}</td>
    <th>${esc(bLabel)}</th><td>${esc(b)}</td>
  </tr>`
  }
  const label = a ? aLabel : bLabel
  const value = a || b
  return `<tr><th>${esc(label)}</th><td colspan="3">${esc(value)}</td></tr>`
}

/** Full-width row; omit when value empty. */
function fullRow(label: string, raw: string): string {
  const v = raw.trim()
  if (!v) return ''
  return `<tr><th>${esc(label)}</th><td colspan="3">${esc(v)}</td></tr>`
}

function pageHtml(data: OslCourierSlipData): string {
  const firm = data.laboratoryName.trim() || '________________'
  const address = data.laboratoryAddress.trim()
  const qr = data.qrCode.trim()
  const qrBlock = data.qrDataUrl.trim()
    ? `<img class="cs-qr-img" src="${esc(data.qrDataUrl)}" alt="QR ${esc(qr)}" />`
    : `<div class="cs-qr-empty">No QR</div>`

  return `
<article class="cs-page">
  <div class="cs-frame-outer">
  <div class="cs-frame-inner">
  <header class="cs-head"><h2>BIS SAMPLE TEST REQUEST</h2></header>

  <div class="cs-to-qr">
    <section class="cs-box cs-to">
      <span class="cs-k">To</span>
      <div class="cs-body">
        ${data.includeBlvCareOf ? `<div class="cs-blv">${esc(BLV_CARE_OF)}</div>` : ''}
        <div class="cs-firm">${esc(firm)}</div>
        ${address ? `<div class="cs-addr">${esc(address)}</div>` : ''}
        ${data.includeMobile ? `<div class="cs-mobile">${esc(BLV_MOBILE)}</div>` : ''}
      </div>
    </section>
    <aside class="cs-qr-card">
      ${qrBlock}
      ${qr ? `<p class="cs-qr-caption">${esc(qr)}</p>` : ''}
    </aside>
  </div>

  <section class="cs-box cs-details">
    <h3>Sample Details</h3>
    <table class="cs-grid">
      <tbody>
        ${pairRow('IS Number', data.isNumber, 'Shelf Life', data.shelfLife)}
        ${pairRow('Sample Code', data.sampleCode, 'QR Code', data.qrCode)}
        ${pairRow(
          'Batch Number',
          data.batchNumber,
          'DOM',
          data.dateOfManufacturing.trim() ? dateOrNa(data.dateOfManufacturing) : '',
        )}
        ${fullRow('Sample Quantity', data.sampleQuantity)}
        ${fullRow('Grade / Type / Variety', data.gradeTypeVariety)}
        ${fullRow('Declared Value', data.declaredValue)}
        ${fullRow('Sample Description', data.sampleDescription)}
        ${fullRow('Additional Information', data.additionalInformation)}
      </tbody>
    </table>
  </section>

  <section class="cs-box cs-from">
    <span class="cs-k">From</span>
    <div class="cs-body">
      <div class="cs-firm">${esc(data.applicantName || '—')}</div>
      ${data.applicantAddress ? `<div class="cs-addr">${esc(data.applicantAddress)}</div>` : ''}
    </div>
  </section>
  </div>
  </div>
</article>`
}

function chunkItems<T>(items: T[], size: number): T[][] {
  const n = Math.max(1, size)
  const out: T[][] = []
  for (let i = 0; i < items.length; i += n) out.push(items.slice(i, i + n))
  return out
}

const STYLES = `
  .cs-sheet {
    box-sizing: border-box;
    width: 100%;
    min-height: 277mm;
    page-break-after: always;
    break-after: page;
  }
  .cs-sheet:last-child { page-break-after: auto; break-after: auto; }
  .cs-page {
    font-family: "Times New Roman", Times, serif;
    color: #111;
    box-sizing: border-box;
    break-inside: avoid;
    page-break-inside: avoid;
  }
  .cs-frame-outer { border: 1.6pt solid #111; padding: 1.6mm; box-sizing: border-box; height: 100%; }
  .cs-frame-inner {
    border: 0.9pt solid #111; padding: 8mm 9mm; box-sizing: border-box;
    height: 100%; display: flex; flex-direction: column; gap: 2mm;
  }
  .cs-head { margin-bottom: 1mm; text-align: center; }
  .cs-head h2 { margin: 0; font-size: 22px; font-weight: 800; letter-spacing: .1em; text-decoration: underline; }
  .cs-to-qr { display: grid; grid-template-columns: minmax(0, 1fr) 52mm; gap: 4mm; align-items: stretch; margin-bottom: 0; }
  .cs-box { border: 0.75pt solid #9ca3af; border-radius: 2mm; padding: 3mm 3.5mm; }
  .cs-to { font-size: 12px; line-height: 1.45; }
  .cs-k { font-weight: 800; display: block; font-size: 12px; letter-spacing: .04em; text-transform: uppercase; }
  .cs-body { display: flex; flex-direction: column; gap: 0.6mm; margin-top: 1.2mm; }
  .cs-blv, .cs-firm { font-weight: 700; }
  .cs-mobile { font-weight: 700; margin-top: 0.3mm; }
  .cs-addr { white-space: pre-wrap; }
  .cs-qr-card {
    border: 0.75pt solid #d1d5db; padding: 2mm; background: #fff;
    display: flex; flex-direction: column; align-items: center; justify-content: center;
  }
  .cs-qr-img { width: 42mm; height: 42mm; object-fit: contain; }
  .cs-qr-empty {
    width: 100%; height: 42mm; display: flex; align-items: center; justify-content: center;
    border: 0.6pt dashed #9ca3af; font-size: 10px; color: #9ca3af;
  }
  .cs-qr-caption { margin: 1mm 0 0; text-align: center; font-size: 9px; font-weight: 700; letter-spacing: .03em; word-break: break-all; }
  /* Content-sized — do not flex-grow (that left a large empty gap above From). */
  .cs-details { margin: 0; flex: 0 0 auto; }
  .cs-details h3 { margin: 0 0 1.5mm; font-size: 12px; font-weight: 800; }
  .cs-grid { width: 100%; border-collapse: collapse; }
  .cs-grid th, .cs-grid td { border: 0.6pt solid #9ca3af; padding: 2mm; font-size: 11px; vertical-align: top; }
  .cs-grid th { background: #f3f4f6; font-weight: 800; text-align: left; white-space: nowrap; width: 1%; vertical-align: middle; }
  .cs-from { font-size: 12px; line-height: 1.45; flex: 0 0 auto; margin: 0; }

  /* 1 per page — full A4 slip */
  .cs-per-1 { display: block; }
  .cs-per-1 .cs-page { height: 277mm; }
  .cs-per-1 .cs-frame-outer { min-height: 277mm; }

  /* 2 per page — stacked halves */
  .cs-per-2 { display: flex; flex-direction: column; gap: 3mm; }
  .cs-per-2 .cs-page { flex: 1 1 0; min-height: 0; height: calc((277mm - 3mm) / 2); }
  .cs-per-2 .cs-frame-inner { padding: 4mm 5mm; gap: 1.5mm; }
  .cs-per-2 .cs-head h2 { font-size: 15px; letter-spacing: .06em; }
  .cs-per-2 .cs-to-qr { grid-template-columns: minmax(0, 1fr) 34mm; gap: 2.5mm; }
  .cs-per-2 .cs-to, .cs-per-2 .cs-from { font-size: 10px; }
  .cs-per-2 .cs-qr-img, .cs-per-2 .cs-qr-empty { width: 28mm; height: 28mm; }
  .cs-per-2 .cs-grid th, .cs-per-2 .cs-grid td { padding: 1.2mm 1.6mm; font-size: 9px; }
  .cs-per-2 .cs-box { padding: 1.8mm 2.2mm; }

  /* 3 per page — stacked thirds */
  .cs-per-3 { display: flex; flex-direction: column; gap: 2.5mm; }
  .cs-per-3 .cs-page { flex: 1 1 0; min-height: 0; height: calc((277mm - 5mm) / 3); }
  .cs-per-3 .cs-frame-inner { padding: 3mm 4mm; gap: 1.2mm; }
  .cs-per-3 .cs-head h2 { font-size: 12px; letter-spacing: .04em; }
  .cs-per-3 .cs-to-qr { grid-template-columns: minmax(0, 1fr) 26mm; gap: 2mm; }
  .cs-per-3 .cs-to, .cs-per-3 .cs-from { font-size: 8.5px; }
  .cs-per-3 .cs-k { font-size: 9px; }
  .cs-per-3 .cs-details h3 { font-size: 9px; margin-bottom: 1mm; }
  .cs-per-3 .cs-qr-img, .cs-per-3 .cs-qr-empty { width: 22mm; height: 22mm; }
  .cs-per-3 .cs-qr-caption { font-size: 7px; }
  .cs-per-3 .cs-grid th, .cs-per-3 .cs-grid td { padding: 0.8mm 1.2mm; font-size: 7.5px; }
  .cs-per-3 .cs-box { padding: 1.2mm 1.6mm; }

  /* 4 per page — 2×2 grid */
  .cs-per-4 {
    display: grid;
    grid-template-columns: 1fr 1fr;
    grid-template-rows: 1fr 1fr;
    gap: 2.5mm;
  }
  .cs-per-4 .cs-page { min-height: 0; height: calc((277mm - 2.5mm) / 2); }
  .cs-per-4 .cs-frame-inner { padding: 2.5mm 3mm; gap: 1mm; }
  .cs-per-4 .cs-head h2 { font-size: 11px; letter-spacing: .03em; }
  .cs-per-4 .cs-to-qr { grid-template-columns: minmax(0, 1fr) 22mm; gap: 1.5mm; }
  .cs-per-4 .cs-to, .cs-per-4 .cs-from { font-size: 7.5px; }
  .cs-per-4 .cs-k { font-size: 8px; }
  .cs-per-4 .cs-details h3 { font-size: 8px; margin-bottom: 0.8mm; }
  .cs-per-4 .cs-qr-img, .cs-per-4 .cs-qr-empty { width: 18mm; height: 18mm; }
  .cs-per-4 .cs-qr-caption { font-size: 6px; }
  .cs-per-4 .cs-grid th, .cs-per-4 .cs-grid td { padding: 0.6mm 1mm; font-size: 6.5px; }
  .cs-per-4 .cs-box { padding: 1mm 1.2mm; }
`

export function buildOslCourierSlipHtml(
  data: OslCourierSlipData,
  options?: { perPage?: OslCourierSlipPerPage },
): string {
  return buildOslCourierSlipsHtml([data], options)
}

/** One PDF packing slips according to Test Requests per page (1–4). */
export function buildOslCourierSlipsHtml(
  items: OslCourierSlipData[],
  options?: { perPage?: OslCourierSlipPerPage },
): string {
  const list = items.length > 0 ? items : []
  const perPage = normalizeCourierSlipPerPage(options?.perPage)
  const first = list[0]
  const titleSample =
    first?.sampleCode.trim() ||
    first?.qrCode.trim() ||
    (list.length > 1 ? `${list.length} samples` : 'Sample')
  const sheets = chunkItems(list, perPage)
    .map(
      (group) =>
        `<div class="cs-sheet cs-per-${perPage}">${group.map((d) => pageHtml(d)).join('\n')}</div>`,
    )
    .join('\n')
  return buildPrintPage({
    title: `BIS Sample Test Request — ${titleSample}`,
    styles: STYLES,
    body: sheets,
  })
}

/** Build Courier Slip print data for one live sample row. */
export function oslCourierSlipDataForSample(
  printData: BisPrintData,
  sample: OslSampleRequirementRow,
  options?: { includeBlvCareOf?: boolean; includeMobile?: boolean; qrDataUrl?: string },
): OslCourierSlipData {
  const ctx = applicantContextFromPrintData(printData)
  const labName = sample.laboratoryName.trim() || sample.destinationLab.trim()
  const dest = sample.destinationLab.trim()
  // Skip address when it is only a duplicate of the laboratory name.
  const address = dest && dest.toLowerCase() !== labName.toLowerCase() ? dest : ''

  return {
    ...ctx,
    laboratoryName: labName,
    laboratoryAddress: address,
    sampleCode: sample.sampleCode,
    qrCode: sample.qrCode,
    qrDataUrl: (options?.qrDataUrl ?? '').trim(),
    sampleType: sample.sampleType,
    priority: sample.priority,
    shelfLife: sample.shelfLife,
    serialNumber: sample.serialNumber,
    testRequired: sample.testRequired,
    testingCharges: sample.testingCharges,
    batchNumber: sample.batchNumber,
    dateOfManufacturing: sample.dateOfManufacturing,
    gradeTypeVariety: sample.gradeTypeVariety,
    declaredValue: sample.declaredValue,
    sampleDescription: sample.sampleDescription || sample.gradeTypeVariety,
    additionalInformation: sample.additionalInformation,
    sampleQuantity: sample.sampleQuantity,
    includeBlvCareOf: options?.includeBlvCareOf ?? true,
    includeMobile: options?.includeMobile ?? true,
  }
}
