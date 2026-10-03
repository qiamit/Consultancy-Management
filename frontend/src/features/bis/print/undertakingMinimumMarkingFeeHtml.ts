import type { BisPrintData } from './loadBisPrintData'
import { escapeHtml as esc } from './openPrintHtml'
import {
  applicantContextFromPrintData,
  buildPrintPage,
  letterheadHtml,
  preparedByHtml,
  signatoryHtml,
  type PrintApplicantContext,
} from './printDocumentShared'

export type UndertakingMinimumMarkingFeeData = PrintApplicantContext & {
  firmStatus: string
  bisBranch: string
  isProductLine: string
  unitOfSale: string
  annualProductionCapacity: string
  valueOfProductionPerUnit: string
  costOfProductionPerUnit: string
  marketSurveillancePlan: string
  bisLabTestingCharges: string
  oslAvgTestingCharges: string
  marketSampleQuantity: string
  marketSampleCost: string
  factorySampleCount: string
  marketSampleCount: string
  factorySampleRate: string
  marketSampleRate: string
  overheadCost: string
  mmfLarge: string
  mmfMsme: string
  finalUnitRate: string
  slab1Text: string
  slab2Text: string
  slab3Text: string
  signatoryName: string
  signatoryDesignation: string
}

const BLANK = '________________'
const DASH = '—'

function blankOr(value: string, fallback = BLANK): string {
  const v = value.trim()
  return v || fallback
}

function displayOr(value: string, fallback = DASH): string {
  const v = value.trim()
  return v || fallback
}

function firmStatusFromScale(scale: string): string {
  const upper = scale.trim().toUpperCase()
  if (!upper) return ''
  if (/\bMSME\b|\bSME\b|\bMICRO\b|\bSMALL\b|\bMEDIUM\b/.test(upper)) return 'MSME'
  if (/\bLS\b|\bLARGE\b/.test(upper)) return 'LS'
  return scale.trim()
}

function line(label: string, value: string): string {
  return `<p class="mmf-sub">${label}&nbsp;${esc(value)}</p>`
}

function buildExpenditureTable(data: UndertakingMinimumMarkingFeeData): string {
  return `
<table class="pd-table mmf-table">
  <thead>
    <tr>
      <th class="pd-left" style="width:46%">ITEM OF EXPENDITURE</th>
      <th style="width:10%">NO.</th>
      <th style="width:22%">RATE</th>
      <th style="width:22%">AMOUNT</th>
    </tr>
  </thead>
  <tbody>
    <tr><td class="pd-left" colspan="4"><strong>a) TESTING CHARGES</strong></td></tr>
    <tr>
      <td class="pd-left" style="padding-left:16px">i) FACTORY SAMPLES</td>
      <td>${esc(displayOr(data.factorySampleCount, '2'))}</td>
      <td>${esc(displayOr(data.factorySampleRate))}</td>
      <td>&nbsp;</td>
    </tr>
    <tr>
      <td class="pd-left" style="padding-left:16px">ii) MARKET SAMPLES</td>
      <td>${esc(displayOr(data.marketSampleCount, '2'))}</td>
      <td>${esc(displayOr(data.marketSampleRate))}</td>
      <td>&nbsp;</td>
    </tr>
    <tr>
      <td class="pd-left">b) COST OF MARKET SAMPLES</td>
      <td>${esc(displayOr(data.marketSampleCount, '2'))}</td>
      <td>${esc(displayOr(data.marketSampleCost))}</td>
      <td>&nbsp;</td>
    </tr>
    <tr>
      <td class="pd-left">c) Direct Cost of Overhead</td>
      <td>${DASH}</td>
      <td>${esc(displayOr(data.overheadCost, 'Rs. 37,000/-'))}</td>
      <td>${esc(displayOr(data.overheadCost, 'Rs. 37,000/-'))}</td>
    </tr>
    <tr>
      <td class="pd-left"><strong>TOTAL (in Rs.):</strong></td>
      <td colspan="3">&nbsp;</td>
    </tr>
  </tbody>
</table>`
}

function buildBody(data: UndertakingMinimumMarkingFeeData): string {
  const status = blankOr(data.firmStatus)
  const branch = blankOr(data.bisBranch || data.bisBranchState)
  const isLine = blankOr(data.isProductLine)
  const unit = blankOr(data.unitOfSale, 'unit')
  const sigName = data.signatoryName.trim() || data.contactPerson.trim()

  return `
<div class="pd-sheet">
  ${letterheadHtml(data)}
  <div class="mmf-annex">ANNEX 1</div>
  <div class="mmf-status">STATUS- ${esc(status)} BO- ${esc(branch)}</div>

  <p class="mmf-section"><strong>1</strong>&nbsp;&nbsp;&nbsp;&nbsp;${esc(isLine)}</p>

  <p class="mmf-section"><strong>2</strong>&nbsp;&nbsp;&nbsp;&nbsp;Installed capacity of the Plant:</p>
  ${line('a)&nbsp;&nbsp;Production:', '')}
  ${line('i)&nbsp;&nbsp;Annual Production Capacity:', blankOr(data.annualProductionCapacity))}
  ${line('ii)&nbsp;&nbsp;Value (Rs.):', blankOr(data.valueOfProductionPerUnit))}
  ${line('b)&nbsp;&nbsp;Cost of Production (Rs.):', blankOr(data.costOfProductionPerUnit))}

  <p class="mmf-section"><strong>3</strong>&nbsp;&nbsp;&nbsp;&nbsp;Market Surveillance Plan (proposed):</p>
  <p class="mmf-para">${esc(blankOr(data.marketSurveillancePlan, ' '))}</p>

  <p class="mmf-section"><strong>4</strong>&nbsp;&nbsp;&nbsp;&nbsp;Testing charges for complete testing per sample:</p>
  ${line('i)&nbsp;&nbsp;BIS Lab (Rs.):', displayOr(data.bisLabTestingCharges, 'None'))}
  ${line(
    'ii)&nbsp;&nbsp;If BIS testing charges are not available, the average of prevailing testing charges of OSLs (in Rs.):',
    displayOr(data.oslAvgTestingCharges),
  )}

  <p class="mmf-section"><strong>5</strong>&nbsp;&nbsp;&nbsp;&nbsp;Cost of Market Sample:</p>
  ${line('a)&nbsp;&nbsp;Quantity per Market Sample:', blankOr(data.marketSampleQuantity))}
  ${line('b)&nbsp;&nbsp;*Cost of market sample (Rs.):', blankOr(data.marketSampleCost))}

  <p class="mmf-section"><strong>6</strong>&nbsp;&nbsp;&nbsp;&nbsp;Estimated Expenditure in Operating License Per Year of One Operative Period</p>
  ${buildExpenditureTable(data)}

  <p class="mmf-section"><strong>7</strong>&nbsp;&nbsp;&nbsp;&nbsp;Final MMF proposal</p>
  ${line('i)&nbsp;&nbsp;LARGE SCALE (Rs.):', blankOr(data.mmfLarge))}
  ${line('ii)&nbsp;&nbsp;MSME (Rs.):', blankOr(data.mmfMsme))}

  <p class="mmf-section"><strong>8</strong>&nbsp;&nbsp;&nbsp;&nbsp;Calculation for unit rate:</p>
  ${line('i)&nbsp;&nbsp;Probable Unit Rate: (MMF of Large ÷ Production capacity)', BLANK)}
  ${line('ii)&nbsp;&nbsp;0.01% of cost of production (Rs.)', BLANK)}
  ${line('iii)&nbsp;&nbsp;0.2% of cost of production (Rs.)', BLANK)}

  <p class="mmf-section"><strong>9</strong>&nbsp;&nbsp;&nbsp;&nbsp;FINAL UNIT RATE:&nbsp;&nbsp;Unit– 1 ${esc(unit)}</p>
  ${line('Slab-1', displayOr(data.slab1Text))}
  ${line('Slab-2', displayOr(data.slab2Text, 'Rs. _______-_______ per unit for next _______-_______ units,'))}
  ${line('Slab-3', displayOr(data.slab3Text, 'Rs. ___-_____ per unit for remaining __-_____ units.'))}
  ${line('Final Unit Rate:', displayOr(data.finalUnitRate))}

  <p class="mmf-note">*authenticated through market survey</p>
  <p class="mmf-note">** in case of licence being operative on Factory testing basis, charges for mandays required for complete testing of the product twice in a year are to be considered</p>

  <div class="cmpf-sign-right">${signatoryHtml({ firmName: data.applicantName, name: sigName, designation: data.signatoryDesignation })}</div>
  ${preparedByHtml(data.preparedBy)}
</div>`
}

const STYLES = `
  .mmf-annex { text-align: center; font-size: 14px; font-weight: 800; letter-spacing: .08em; margin: 0 0 6px; }
  .mmf-status { text-align: center; font-size: 11px; font-weight: 700; margin: 0 0 12px; }
  .mmf-section { margin: 8px 0 4px; font-size: 11px; }
  .mmf-sub { margin: 2px 0; font-size: 10.5px; line-height: 1.45; }
  .mmf-para { margin: 2px 0 8px; font-size: 10.5px; min-height: 10mm; border-bottom: 1px dotted #a8a29e; }
  .mmf-table td { height: 7mm; font-size: 9.5px; }
  .mmf-note { font-size: 9px; margin: 4px 0 0; font-style: italic; }
  .cmpf-sign-right { margin-top: 14px; text-align: right; }
  .cmpf-sign-right .pd-signatory { text-align: left; }
`

export function buildUndertakingMinimumMarkingFeeHtml(data: UndertakingMinimumMarkingFeeData): string {
  return buildPrintPage({
    title: `Annex-1 Marking Fee — ${data.applicantName || 'Applicant'}`,
    styles: STYLES,
    body: buildBody(data),
  })
}

/** Maps a BIS project row + client + IS code + consultancy context into Annex-1 MMF fields. */
export function undertakingMinimumMarkingFeeDataFromPrintData(
  printData: BisPrintData,
): UndertakingMinimumMarkingFeeData {
  const ctx = applicantContextFromPrintData(printData)
  const num = printData.isCode.label || printData.isCode.isNumber
  const title = printData.isCode.title
  const isProductLine =
    num && title ? `${num} Product: ${title}` : num || title || (printData.row.title ?? '').trim()

  return {
    ...ctx,
    firmStatus: firmStatusFromScale(printData.client.scale),
    bisBranch: printData.client.state,
    isProductLine,
    unitOfSale: '',
    annualProductionCapacity: '',
    valueOfProductionPerUnit: '',
    costOfProductionPerUnit: '',
    marketSurveillancePlan: '',
    bisLabTestingCharges: '',
    oslAvgTestingCharges: '',
    marketSampleQuantity: '',
    marketSampleCost: '',
    factorySampleCount: '2',
    marketSampleCount: '2',
    factorySampleRate: '',
    marketSampleRate: '',
    overheadCost: 'Rs. 37,000/-',
    mmfLarge: '',
    mmfMsme: '',
    finalUnitRate: '',
    slab1Text: '',
    slab2Text: '',
    slab3Text: '',
    signatoryName: printData.client.contactPerson,
    signatoryDesignation: '',
  }
}
