import type { BisPrintData, BisPrintIsCode } from './loadBisPrintData'
import { escapeHtml as esc } from './openPrintHtml'
import {
  buildPrintPage,
  CMPF_FORM_STYLES,
  dateOrNa,
  inspectionDateOrToday,
  letterheadHtml,
  signatoryHtml,
  toBlockHtml,
  type PrintApplicantContext,
} from './printDocumentShared'
import { parseCmpf310Payload } from '../projects/cmpf310Model'
import type { UndertakingMinimumMarkingFeeData } from './undertakingMinimumMarkingFeeHtml'

export type Cmpf310Data = { isNumber: string; feePerYear: string; unit: string }

export type Cmpf310AcceptanceLetterData = PrintApplicantContext & {
  referenceLetterNo: string
  referenceLetterDate: string
  minimumMarkingFee: string
  unit: string
  firmScale: string
  signatoryName: string
  signatoryDesignation: string
  signatureImageUrl?: string
}

export function minimumMarkingFeeForScale(isCode: BisPrintIsCode, firmScale: string): string {
  const scale = firmScale.toLowerCase().replace(/[^a-z]/g, '')
  if (scale.includes('micro')) return isCode.mmfMicroScale
  if (scale.includes('small')) return isCode.mmfSmallScale
  if (scale.includes('medium')) return isCode.mmfMediumScale
  if (scale.includes('large')) return isCode.mmfLargeScale
  return ''
}

function buildBody(data: Cmpf310Data): string {
  return `<main class="mf-report">
    <header class="mf-brand"><div class="mf-emblem">मानक: मापन, मूल्यांकन</div><div><div class="mf-hindi">भारतीय मानक ब्यूरो</div><h1>BUREAU OF INDIAN STANDARDS</h1><strong>iConnect</strong> <span>https://iconnect.manakonline.in/</span></div></header>
    <div class="mf-home">⌂ | Home (login)</div><h2>Product Certification</h2><div class="mf-category">Application/Licence Related</div>
    <h3>MARKING<br/>FEE</h3><section class="mf-form"><div class="mf-form-title">MarkingFee</div><label>IS Number *:<div class="mf-is">${esc(data.isNumber || '—')} <b>✓</b></div></label><button type="button">✚ Generate Report</button></section>
    <table class="mf-table"><thead><tr><th>S.No.</th><th>Marking Fee Per Year</th><th>Unit</th></tr></thead><tbody><tr><td>1</td><td class="mf-fee">${esc(data.feePerYear || '—')}</td><td>${esc(data.unit || '—')}</td></tr></tbody></table>
    <footer><span>https://www.manakonline.in/MANAK/ApplicationLicenceRelatedrpt</span><span>1/1</span></footer>
  </main>`
}

export function buildCmpf310Html(data: Cmpf310Data): string {
  return buildPrintPage({
    title: `Marking Fee — ${data.isNumber || 'IS Number'}`,
    body: buildBody(data),
    styles: `.mf-report{font:12px/1.4 'Times New Roman',serif;color:#111;min-height:270mm;position:relative;padding:4mm 6mm 10mm}.mf-brand{display:flex;gap:22px;align-items:center;min-height:34mm}.mf-emblem,.mf-hindi{font-family:"Noto Sans Devanagari","Nirmala UI",Mangal,"Noto Sans",sans-serif}.mf-emblem{width:42mm;height:28mm;border:4px solid #1616db;border-radius:45% 45% 12% 12%;display:flex;align-items:flex-end;justify-content:center;text-align:center;color:#e11d48;font-weight:bold;font-size:9px}.mf-hindi{font-size:16px;font-weight:bold}.mf-brand h1{font-size:20px;margin:0}.mf-brand strong{font-size:16px;color:#c2410c}.mf-brand span{font-size:12px}.mf-home{text-align:center;margin-top:10mm;font-size:15px;font-weight:bold}.mf-report h2{text-align:center;font-size:22px;margin:2mm 0 4mm}.mf-category{border:1px solid #aaa;border-radius:4px;text-align:center;font-size:15px;font-weight:bold;padding:4mm}.mf-report h3{text-align:center;font-size:15px;margin:8mm 0}.mf-form{border:1px solid #aaa;border-radius:4px;padding:5mm 7mm;position:relative;margin:0 2mm 2mm}.mf-form-title{position:absolute;top:-4mm;left:0;background:#fff;padding:0 2mm;font-size:15px}.mf-form label{display:block;font-weight:bold;font-size:14px}.mf-is{border:1px solid #39834b;border-radius:4px;margin-top:3mm;padding:3mm 4mm;font-size:17px;font-weight:normal}.mf-is b{float:right}.mf-form button{display:block;margin:5mm auto 0;border:1px solid #1671b8;border-radius:4px;background:white;padding:2mm 5mm;font:14px 'Times New Roman',serif}.mf-table{border-collapse:collapse;width:94%;margin:0 auto}.mf-table th,.mf-table td{border:1px solid #aaa;padding:3mm 2mm;font-size:14px;text-align:left;vertical-align:top}.mf-table th{font-weight:bold}.mf-table th:first-child,.mf-table td:first-child{width:9%}.mf-table th:last-child,.mf-table td:last-child{width:11%}.mf-fee{white-space:pre-wrap}.mf-report footer{position:absolute;bottom:0;left:6mm;right:6mm;display:flex;justify-content:space-between;font-size:10px}`,
  })
}

const ACCEPTANCE_STYLES = `${CMPF_FORM_STYLES}\n.mf-acceptance-page{font-size:11pt}.mf-acceptance-page .pd-title{text-decoration:none;margin-bottom:9px}.mf-acceptance-page .pd-to-row{margin-bottom:8px}.mf-acceptance-page .pd-body{text-align:justify;line-height:1.45;margin-bottom:8px}.mf-accept-summary{width:100%;border-collapse:collapse;margin:8px 0}.mf-accept-summary th,.mf-accept-summary td{border:1px solid #222;padding:5px 7px;text-align:left}.mf-accept-summary th{width:45%}.mf-accept-term{display:flex;gap:7px;margin:5px 0;text-align:justify;line-height:1.35}.mf-accept-closing{margin:9px 0;text-align:justify}.mf-accept-sign{width:78mm;margin:6mm 0 0 auto;text-align:right;page-break-inside:avoid;break-inside:avoid}.mf-accept-sign .pd-signatory{width:100%;text-align:right;margin-left:auto}.mf-accept-sign .pd-sign-space{justify-content:flex-end}.mf-accept-sign .pd-sign-line{margin-left:auto}`

export function buildCmpf310AcceptanceLetterHtml(data: Cmpf310AcceptanceLetterData): string {
  const letterDate = inspectionDateOrToday(data.dateOfInspection)
  const referenceNumber = data.referenceLetterNo.trim() || '________________'
  const referenceDate = data.referenceLetterDate.trim() ? dateOrNa(data.referenceLetterDate) : '________________'
  const fee = data.minimumMarkingFee.trim()
  const unit = data.unit.trim() || '________________'
  const signatory = signatoryHtml({
    firmName: data.applicantName,
    name: data.signatoryName || data.contactPerson,
    designation: data.signatoryDesignation,
    signatureImageUrl: data.signatureImageUrl,
  })

  const body = `<div class="pd-sheet mf-acceptance-page">
    ${letterheadHtml(data)}
    <h1 class="pd-title">Acceptance of Marking Fee</h1>
    <div class="pd-to-row"><div class="pd-to-block">${toBlockHtml(data.bisBranchName, data.bisBranchState)}</div><div class="pd-date-block"><div><strong>Date:</strong> ${esc(letterDate)}</div><div><strong>Application No.:</strong> ${esc(data.applicationNumber || '—')}</div></div></div>
    <p class="pd-body">This is with reference to your letter No. <strong>${esc(referenceNumber)}</strong>, dated <strong>${esc(referenceDate)}</strong>. We, <strong>M/s. ${esc(data.applicantName || '________________')}</strong>, having our manufacturing premises at <strong>${esc(data.applicantAddress || '________________')}</strong>, hereby accept the minimum marking fee applicable to <strong>${esc(data.isNumber || 'the applicable Indian Standard')}</strong>${data.isTitle.trim() ? ` — ${esc(data.isTitle.trim())}` : ''}. Upon grant of the BIS licence, we agree to pay the prescribed marking fee and comply with the applicable provisions of Scheme-I of Schedule-II to the Bureau of Indian Standards (Conformity Assessment) Regulations, 2018, as amended from time to time.</p>
    <table class="mf-accept-summary"><tbody><tr><th>Production Unit</th><td>${esc(unit)}</td></tr><tr><th>Firm Scale</th><td>${esc(data.firmScale || 'As per application')}</td></tr><tr><th>Minimum Marking Fee</th><td>${fee ? `Rs. ${esc(fee)} per Year` : 'Not set in IS Code Master'}</td></tr></tbody></table>
    <p class="mf-accept-term"><strong>A.</strong> The minimum marking fee stated above shall be paid in advance for the applicable licence validity period.</p>
    <p class="mf-accept-term"><strong>B.</strong> The actual marking fee for the first year shall be calculated by multiplying the applicable unit rate by the quantity marked during the first nine months.</p>
    <p class="mf-accept-term"><strong>C.</strong> The actual marking fee for each subsequent year shall be calculated on a year-to-year basis after the first nine months.</p>
    <p class="mf-accept-term"><strong>D.</strong> If the actual marking fee for the operative period exceeds the advance minimum fee paid, we shall pay the difference to BIS annually, including at licence renewal as applicable.</p>
    <p class="mf-accept-term"><strong>E.</strong> Any variation in the marking fee notified under the applicable regulations shall be accepted and paid from its effective date, without contest.</p>
    <p class="mf-accept-term"><strong>F.</strong> If the actual marking fee is less than the minimum fee paid, we shall not claim a refund for the elapsed period.</p>
    <p class="mf-accept-closing">We confirm that this acceptance is submitted for the above application and undertake to make payments in accordance with BIS instructions and the terms applicable to the licence.</p>
    <div class="mf-accept-sign">${signatory}</div>
  </div>`

  return buildPrintPage({
    title: `Acceptance of Marking Fee — ${data.applicantName || 'Applicant'}`,
    body,
    styles: ACCEPTANCE_STYLES,
  })
}

/** Annex-4 of the Marking Fee SOP: acceptance of the tentative marking fee for an All India First application. */
export function buildTentativeMarkingFeeAcceptanceHtml(
  data: Cmpf310AcceptanceLetterData & { productTitle: string; isLabel: string; fee: UndertakingMinimumMarkingFeeData },
): string {
  const letterDate = inspectionDateOrToday(data.dateOfInspection)
  const referenceNumber = data.referenceLetterNo.trim() || '………………………'
  const referenceDate = data.referenceLetterDate.trim() ? dateOrNa(data.referenceLetterDate) : '………………………'
  const blank = '________________'
  const unit = (data.fee.unitOfSale || '').trim() || 'unit'
  const minimumFeeRows = [
    ['Minimum marking fee — Large Scale', data.fee.mmfLarge.trim() || blank],
    ['Minimum marking fee — MSME', data.fee.mmfMsme.trim() ? (/^\D*\d[\d,.]*$/.test(data.fee.mmfMsme.trim()) ? `Rs. ${esc(data.fee.mmfMsme.trim())}` : esc(data.fee.mmfMsme.trim())) : blank],
    ['Unit of marking', `1 ${esc(unit)}`],
    ['Slab-1', esc(data.fee.slab1Text.trim() || blank)],
    ['Slab-2', esc(data.fee.slab2Text.trim() || 'Rs. ______ per unit for next ______ units')],
    ['Slab-3', esc(data.fee.slab3Text.trim() || 'Rs. ______ per unit for remaining ______ units')],
  ]
    .map(([label, value]) => `<tr><th>${label}</th><td>${value}</td></tr>`)
    .join('')
  const signatory = signatoryHtml({
    firmName: data.applicantName,
    name: data.signatoryName || data.contactPerson,
    designation: data.signatoryDesignation,
    signatureImageUrl: data.signatureImageUrl,
  })
  const terms = [
    ['a', 'The minimum marking fee shall be paid in advance for the validity period of the licence.'],
    ['b', 'Actual marking fee for the first year shall be calculated by multiplying the unit rate with the quantity (units) marked during the first nine months.'],
    ['c', 'Actual marking fee for subsequent years shall be calculated on year-to-year basis after the first nine months.'],
    ['d', 'In case actual marking fee of the operative period exceeds advance minimum marking fee paid, difference between the actual marking fee calculated on the basis of quantum of production marked and minimum marking fee shall be paid to BIS by the licensee annually during renewal of licence.'],
    ['e', 'After the marking fee against the above mentioned Indian Standard is specified under Scheme-I of Schedule-II in Bureau of Indian Standards (Conformity Assessment) Regulations, 2018, variation, if any, between the values specified and the above tentative marking fee will also be accepted and increase, if any, therein shall also be borne by us from its effective date without any contestation.'],
    ['f', 'In case the marking fee is less than tentative marking fee no request for refund for the elapsed period will be raised by us.'],
  ]
    .map(([n, t]) => `<p class="mf-accept-term"><strong>(${n})</strong> ${t}</p>`)
    .join('')
  const body = `<div class="pd-sheet mf-acceptance-page">
    ${letterheadHtml(data)}
    <h1 class="pd-title">ACCEPTANCE OF RATE OF TENTATIVE MARKING FEE</h1>
    <div class="pd-to-row"><div class="pd-to-block">${toBlockHtml(data.bisBranchName, data.bisBranchState)}</div><div class="pd-date-block"><div><strong>Date:</strong> ${esc(letterDate)}</div><div><strong>Application No.:</strong> ${esc(data.applicationNumber || '—')}</div></div></div>
    <p class="pd-body">This is with reference to your letter No. <strong>${esc(referenceNumber)}</strong> dated <strong>${esc(referenceDate)}</strong> on the subject mentioned above. We hereby agree to pay the tentative marking fee to Bureau of Indian Standards after grant of licence to use the Standard Mark on <strong>${esc(data.productTitle || blank)}</strong> according to <strong>${esc(data.isLabel || blank)}</strong> at the following rates and in the manner stipulated as under till the time Marking Fee is specified under Scheme-I of Schedule-II in Bureau of Indian Standards (Conformity Assessment) Regulations, 2018:</p>
    <p class="mf-accept-term"><strong>i)</strong> Rate of marking fee:</p>
    <table class="mf-accept-summary"><tbody>${minimumFeeRows}</tbody></table>
    <p class="mf-accept-term"><strong>ii)</strong> The marking fee is payable as follows:</p>
    ${terms}
    <div class="mf-accept-sign">${signatory}</div>
    <p class="mf-accept-closing">Place: ${blank}&nbsp;&nbsp;&nbsp;&nbsp;Date: ${esc(letterDate)}&nbsp;&nbsp;&nbsp;&nbsp;Seal:</p>
  </div>`
  return buildPrintPage({
    title: `Acceptance of Rate of Tentative Marking Fee — ${data.applicantName || 'Applicant'}`,
    body,
    styles: ACCEPTANCE_STYLES,
  })
}

export function cmpf310DataFromPrintData(printData: BisPrintData): Cmpf310Data {
  const saved = parseCmpf310Payload(printData.modulePayload ?? null)
  const isNumber = [printData.isCode.isNumber, printData.isCode.partNo ? `Part ${printData.isCode.partNo}` : '', printData.isCode.sectionNo ? `Section ${printData.isCode.sectionNo}` : ''].filter(Boolean).join(' ')
  return { isNumber, feePerYear: saved.feePerYear, unit: saved.unit || printData.isCode.unitOfIs }
}
