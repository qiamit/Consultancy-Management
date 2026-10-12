import type { BisPrintData } from './loadBisPrintData'
import { escapeHtml as esc } from './openPrintHtml'
import { buildPrintPage } from './printDocumentShared'
import { parseCmpf310Payload } from '../projects/cmpf310Model'

export type Cmpf310Data = { isNumber: string; feePerYear: string; unit: string }

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
    styles: `.mf-report{font:12px/1.4 'Times New Roman',serif;color:#111;min-height:270mm;position:relative;padding:4mm 6mm 10mm}.mf-brand{display:flex;gap:22px;align-items:center;min-height:34mm}.mf-emblem{width:42mm;height:28mm;border:4px solid #1616db;border-radius:45% 45% 12% 12%;display:flex;align-items:flex-end;justify-content:center;text-align:center;color:#e11d48;font-weight:bold;font-size:9px}.mf-hindi{font-size:16px;font-weight:bold}.mf-brand h1{font-size:20px;margin:0}.mf-brand strong{font-size:16px;color:#c2410c}.mf-brand span{font-size:12px}.mf-home{text-align:center;margin-top:10mm;font-size:15px;font-weight:bold}.mf-report h2{text-align:center;font-size:22px;margin:2mm 0 4mm}.mf-category{border:1px solid #aaa;border-radius:4px;text-align:center;font-size:15px;font-weight:bold;padding:4mm}.mf-report h3{text-align:center;font-size:15px;margin:8mm 0}.mf-form{border:1px solid #aaa;border-radius:4px;padding:5mm 7mm;position:relative;margin:0 2mm 2mm}.mf-form-title{position:absolute;top:-4mm;left:0;background:#fff;padding:0 2mm;font-size:15px}.mf-form label{display:block;font-weight:bold;font-size:14px}.mf-is{border:1px solid #39834b;border-radius:4px;margin-top:3mm;padding:3mm 4mm;font-size:17px;font-weight:normal}.mf-is b{float:right}.mf-form button{display:block;margin:5mm auto 0;border:1px solid #1671b8;border-radius:4px;background:white;padding:2mm 5mm;font:14px 'Times New Roman',serif}.mf-table{border-collapse:collapse;width:94%;margin:0 auto}.mf-table th,.mf-table td{border:1px solid #aaa;padding:3mm 2mm;font-size:14px;text-align:left;vertical-align:top}.mf-table th{font-weight:bold}.mf-table th:first-child,.mf-table td:first-child{width:9%}.mf-table th:last-child,.mf-table td:last-child{width:11%}.mf-fee{white-space:pre-wrap}.mf-report footer{position:absolute;bottom:0;left:6mm;right:6mm;display:flex;justify-content:space-between;font-size:10px}`,
  })
}

export function cmpf310DataFromPrintData(printData: BisPrintData): Cmpf310Data {
  const saved = parseCmpf310Payload(printData.modulePayload ?? null)
  const isNumber = [printData.isCode.isNumber, printData.isCode.partNo ? `Part ${printData.isCode.partNo}` : '', printData.isCode.sectionNo ? `Section ${printData.isCode.sectionNo}` : ''].filter(Boolean).join(' ')
  return { isNumber, feePerYear: saved.feePerYear, unit: saved.unit || printData.isCode.unitOfIs }
}
