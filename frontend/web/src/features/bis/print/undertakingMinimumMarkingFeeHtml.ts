import type { BisPrintData } from './loadBisPrintData'
import {
  parseUndertakingMinimumFeePayload,
  undertakingFirmStatusFromCompanyScale,
} from '../projects/undertakingPayloadModels'
import { printSignatoryDefaults } from './loadBisPrintData'
import { escapeHtml as esc } from './openPrintHtml'
import {
  applicantContextFromPrintData,
  buildPrintPage,
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
  testingChargeBasis: string
  factoryTestingBasis: string
  factoryMandays: string
  factoryVisitRate: string
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
const BIS_OVERHEAD_RUPEES = 37000

function numeric(value: string): number {
  const match = value.replace(/,/g, '').match(/-?\d+(?:\.\d+)?/)
  const parsed = match ? Number(match[0]) : 0
  return Number.isFinite(parsed) ? parsed : 0
}

function rupees(value: number): string {
  return `Rs. ${value.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}/-`
}

function calculateFee(data: UndertakingMinimumMarkingFeeData) {
  const basis = data.testingChargeBasis
  const labRate = basis === 'BIS Lab' ? numeric(data.bisLabTestingCharges) : numeric(data.oslAvgTestingCharges)
  const factoryRate = data.factoryTestingBasis === 'Yes'
    ? numeric(data.factoryMandays) * numeric(data.factoryVisitRate)
    : labRate
  const marketRate = data.factoryTestingBasis === 'Yes' ? 0 : labRate
  const factoryCount = 2
  const marketCount = 2
  const factoryAmount = factoryRate * factoryCount
  const marketTestingAmount = marketRate * marketCount
  const marketSampleAmount = numeric(data.marketSampleCost) * marketCount
  const capacity = numeric(data.annualProductionCapacity)
  const unitProductionCost = numeric(data.costOfProductionPerUnit)
  const complete = capacity > 0 && unitProductionCost > 0 && numeric(data.valueOfProductionPerUnit) > 0 &&
    Boolean(data.marketSampleQuantity.trim()) && Boolean(data.marketSampleCost.trim()) &&
    (data.factoryTestingBasis === 'Yes'
      ? numeric(data.factoryMandays) > 0 && numeric(data.factoryVisitRate) > 0
      : Boolean(basis) && labRate > 0)
  const total = complete ? factoryAmount + marketTestingAmount + marketSampleAmount + BIS_OVERHEAD_RUPEES : 0
  const minimumFee = total > 0 ? Math.ceil(total / 1000) * 1000 : 0
  const probableUnitRate = capacity > 0 ? minimumFee / capacity : 0
  const lowerBound = unitProductionCost * 0.0001
  const upperBound = unitProductionCost * 0.002
  const proposedUnitRate = lowerBound > 0 && upperBound >= lowerBound
    ? Math.round(Math.min(Math.max(probableUnitRate, lowerBound), upperBound) * 20) / 20
    : probableUnitRate
  return {
    factoryCount,
    marketCount,
    factoryRate,
    marketRate,
    factoryAmount,
    marketTestingAmount,
    marketSampleAmount,
    overhead: BIS_OVERHEAD_RUPEES,
    total,
    minimumFee,
    probableUnitRate,
    lowerBound,
    upperBound,
    proposedUnitRate,
    complete,
  }
}

function blankOr(value: string, fallback = BLANK): string {
  const v = value.trim()
  return v || fallback
}

function displayOr(value: string, fallback = DASH): string {
  const v = value.trim()
  return v || fallback
}

function line(label: string, value: string): string {
  return `<p class="mmf-sub">${label}&nbsp;${esc(value)}</p>`
}

function buildExpenditureTable(data: UndertakingMinimumMarkingFeeData): string {
  const calc = calculateFee(data)
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
      <td>${calc.factoryCount}</td>
      <td>${esc(rupees(calc.factoryRate))}</td>
      <td>${calc.complete ? esc(rupees(calc.factoryAmount)) : BLANK}</td>
    </tr>
    <tr>
      <td class="pd-left" style="padding-left:16px">ii) MARKET SAMPLES</td>
      <td>${calc.marketCount}</td>
      <td>${esc(rupees(calc.marketRate))}</td>
      <td>${calc.complete ? esc(rupees(calc.marketTestingAmount)) : BLANK}</td>
    </tr>
    <tr>
      <td class="pd-left">b) COST OF MARKET SAMPLES</td>
      <td>${calc.marketCount}</td>
      <td>${esc(displayOr(data.marketSampleCost))}</td>
      <td>${calc.complete ? esc(rupees(calc.marketSampleAmount)) : BLANK}</td>
    </tr>
    <tr>
      <td class="pd-left">c) Direct Cost of Overhead</td>
      <td>${DASH}</td>
      <td>${esc(rupees(calc.overhead))}</td>
      <td>${esc(rupees(calc.overhead))}</td>
    </tr>
    <tr>
      <td class="pd-left"><strong>TOTAL (in Rs.):</strong></td>
      <td colspan="3">${calc.complete ? `${esc(rupees(calc.total))} (Rounded up: ${esc(rupees(calc.minimumFee))})` : BLANK}</td>
    </tr>
  </tbody>
</table>`
}

function buildBody(data: UndertakingMinimumMarkingFeeData): string {
  const calc = calculateFee(data)
  const status = blankOr(data.firmStatus)
  const branch = blankOr(data.bisBranch || data.bisBranchState)
  const isLine = blankOr(data.isProductLine)
  const unit = blankOr(data.unitOfSale, 'unit')
  const sigName = data.signatoryName.trim() || data.contactPerson.trim()

  return `
<div class="pd-sheet">
  <div class="mmf-annex">ANNEX 1</div>
  <div class="mmf-status">STATUS- ${esc(status)} BO- ${esc(branch)}</div>

  <p class="mmf-section"><strong>1</strong>&nbsp;&nbsp;&nbsp;&nbsp;${esc(isLine)}</p>

  <p class="mmf-section"><strong>2</strong>&nbsp;&nbsp;&nbsp;&nbsp;Installed capacity of the Plant:</p>
  ${line('a)&nbsp;&nbsp;Production:', '')}
  ${line('i)&nbsp;&nbsp;Annual Production Capacity:', blankOr(data.annualProductionCapacity))}
  ${line('ii)&nbsp;&nbsp;Value (Rs.):', data.valueOfProductionPerUnit.trim() ? `${rupees(numeric(data.valueOfProductionPerUnit))} per ${unit}` : BLANK)}
  ${line('b)&nbsp;&nbsp;Cost of Production (Rs.):', data.costOfProductionPerUnit.trim() ? `${rupees(numeric(data.costOfProductionPerUnit))} per ${unit}` : BLANK)}

  <p class="mmf-section"><strong>3</strong>&nbsp;&nbsp;&nbsp;&nbsp;Market Surveillance Plan (proposed):</p>
  <p class="mmf-para">${esc(blankOr(data.marketSurveillancePlan, ' '))}</p>

  <p class="mmf-section"><strong>4</strong>&nbsp;&nbsp;&nbsp;&nbsp;Testing charges for complete testing per sample:</p>
  ${line('i)&nbsp;&nbsp;BIS Lab (Rs.):', data.factoryTestingBasis === 'Yes' ? 'Not applicable — factory testing basis' : data.testingChargeBasis === 'BIS Lab' ? displayOr(data.bisLabTestingCharges) : 'None')}
  ${line(
    'ii)&nbsp;&nbsp;If BIS testing charges are not available, the average of prevailing testing charges of OSLs (in Rs.):',
    data.factoryTestingBasis === 'Yes' ? 'Not applicable — factory testing basis' : data.testingChargeBasis.startsWith('OSL') ? displayOr(data.oslAvgTestingCharges) : '—',
  )}

  <p class="mmf-section"><strong>5</strong>&nbsp;&nbsp;&nbsp;&nbsp;Cost of Market Sample:</p>
  ${line('a)&nbsp;&nbsp;Quantity per Market Sample:', blankOr(data.marketSampleQuantity))}
  ${line('b)&nbsp;&nbsp;*Cost of market sample (Rs.):', data.marketSampleCost.trim() ? rupees(numeric(data.marketSampleCost)) : BLANK)}
</div>

<div class="pd-sheet mmf-continuation">
  <div class="mmf-annex">ANNEX 1 (Continued)</div>
  <div class="mmf-status">STATUS- ${esc(status)} BO- ${esc(branch)}</div>

  <p class="mmf-section"><strong>6</strong>&nbsp;&nbsp;&nbsp;&nbsp;Estimated Expenditure in Operating License Per Year of One Operative Period</p>
  ${buildExpenditureTable(data)}

  <p class="mmf-section"><strong>7</strong>&nbsp;&nbsp;&nbsp;&nbsp;Final MMF proposal</p>
  ${line('i)&nbsp;&nbsp;LARGE SCALE (Rs.):', data.mmfLarge.trim() ? rupees(numeric(data.mmfLarge)) : BLANK)}
  ${line('ii)&nbsp;&nbsp;MSME (Rs.):', data.mmfMsme.trim() ? (/^\D*\d[\d,.]*$/.test(data.mmfMsme.trim()) ? rupees(numeric(data.mmfMsme)) : data.mmfMsme) : BLANK)}

  <p class="mmf-section"><strong>8</strong>&nbsp;&nbsp;&nbsp;&nbsp;Calculation for unit rate:</p>
  ${line('i)&nbsp;&nbsp;Probable Unit Rate: (MMF of Large ÷ Production capacity)', calc.complete && calc.probableUnitRate ? `${calc.probableUnitRate.toFixed(4)} per ${unit}` : BLANK)}
  ${line('ii)&nbsp;&nbsp;0.01% of cost of production (Rs.)', calc.complete && calc.lowerBound ? `${calc.lowerBound.toFixed(4)} per ${unit}` : BLANK)}
  ${line('iii)&nbsp;&nbsp;0.2% of cost of production (Rs.)', calc.complete && calc.upperBound ? `${calc.upperBound.toFixed(4)} per ${unit}` : BLANK)}

  <p class="mmf-section"><strong>9</strong>&nbsp;&nbsp;&nbsp;&nbsp;FINAL UNIT RATE:&nbsp;&nbsp;Unit– 1 ${esc(unit)}</p>
  ${line('Slab-1', displayOr(data.slab1Text))}
  ${line('Slab-2', displayOr(data.slab2Text, 'Rs. _______-_______ per unit for next _______-_______ units,'))}
  ${line('Slab-3', displayOr(data.slab3Text, 'Rs. ___-_____ per unit for remaining __-_____ units.'))}
  ${line('Final Unit Rate:', calc.complete && calc.proposedUnitRate ? `${calc.proposedUnitRate.toFixed(2)} per ${unit}` : BLANK)}

  <p class="mmf-note">*authenticated through market survey</p>
  <p class="mmf-note">** in case of licence being operative on Factory testing basis, charges for mandays required for complete testing of the product twice in a year are to be considered</p>

  <div class="cmpf-sign-right">${signatoryHtml({ firmName: data.applicantName, name: sigName, designation: data.signatoryDesignation })}</div>
  ${preparedByHtml(data.preparedBy)}
</div>`
}

const STYLES = `
  .mmf-continuation { break-before: page; page-break-before: always; }
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
  const payload = parseUndertakingMinimumFeePayload(printData.modulePayload ?? null)
  const num = printData.isCode.label || printData.isCode.isNumber
  const title = printData.isCode.title
  const isProductLine =
    num && title ? `${num} Product: ${title}` : num || title || (printData.row.title ?? '').trim()

  const bisCharge = payload.testingChargeBasis === 'BIS Lab' ? payload.bisLabTestingCharges : ''
  const oslCharge = payload.testingChargeBasis.startsWith('OSL') ? payload.oslAvgTestingCharges : ''
  const base: UndertakingMinimumMarkingFeeData = {
    ...ctx,
    firmStatus: undertakingFirmStatusFromCompanyScale(printData.client.scale)
      || undertakingFirmStatusFromCompanyScale(payload.firmStatus),
    bisBranch: printData.client.state,
    isProductLine,
    unitOfSale: printData.isCode.unitOfIs,
    annualProductionCapacity: payload.annualProductionCapacity,
    valueOfProductionPerUnit: payload.valueOfProductionPerUnit,
    costOfProductionPerUnit: payload.costOfProductionPerUnit,
    marketSurveillancePlan: payload.marketSurveillancePlan,
    bisLabTestingCharges: bisCharge || 'None',
    oslAvgTestingCharges: oslCharge,
    testingChargeBasis: payload.testingChargeBasis,
    factoryTestingBasis: payload.factoryTestingBasis,
    factoryMandays: payload.factoryMandays,
    factoryVisitRate: payload.factoryVisitRate,
    marketSampleQuantity: payload.marketSampleQuantity,
    marketSampleCost: payload.marketSampleCost,
    factorySampleCount: '2',
    marketSampleCount: '2',
    factorySampleRate: '',
    marketSampleRate: '',
    overheadCost: `Rs. ${BIS_OVERHEAD_RUPEES.toLocaleString('en-IN')}/-`,
    mmfLarge: '',
    mmfMsme: '',
    finalUnitRate: '',
    slab1Text: '',
    slab2Text: '',
    slab3Text: '',
    signatoryName: printSignatoryDefaults(printData).signatoryName,
    signatoryDesignation: printSignatoryDefaults(printData).signatoryDesignation,
  }
  const selectedTestingRate = payload.testingChargeBasis === 'BIS Lab' ? numeric(payload.bisLabTestingCharges) : numeric(payload.oslAvgTestingCharges)
  const basisRate = payload.factoryTestingBasis === 'Yes' ? 0 : selectedTestingRate
  const factoryRate = payload.factoryTestingBasis === 'Yes'
    ? numeric(payload.factoryMandays) * numeric(payload.factoryVisitRate)
    : basisRate
  const capacity = numeric(payload.annualProductionCapacity)
  const cost = numeric(payload.costOfProductionPerUnit)
  const sampleCost = numeric(payload.marketSampleCost)
  const complete = capacity > 0 && cost > 0 && numeric(payload.valueOfProductionPerUnit) > 0 &&
    Boolean(payload.marketSampleQuantity.trim()) && Boolean(payload.marketSampleCost.trim()) &&
    (payload.factoryTestingBasis === 'Yes'
      ? numeric(payload.factoryMandays) > 0 && numeric(payload.factoryVisitRate) > 0
      : Boolean(payload.testingChargeBasis) && selectedTestingRate > 0)
  const total = complete ? (factoryRate * 2) + (basisRate * 2) + (sampleCost * 2) + BIS_OVERHEAD_RUPEES : 0
  const minimumFee = total > 0 ? Math.ceil(total / 1000) * 1000 : 0
  const probableRate = capacity > 0 ? minimumFee / capacity : 0
  const lower = cost * 0.0001
  const upper = cost * 0.002
  const proposed = lower > 0 && upper >= lower
    ? Math.round(Math.min(Math.max(probableRate, lower), upper) * 20) / 20
    : probableRate
  const msmeFee = printData.isCode.mmfMediumScale || printData.isCode.mmfSmallScale || printData.isCode.mmfMicroScale
  return {
    ...base,
    factorySampleRate: factoryRate ? rupees(factoryRate) : '',
    marketSampleRate: basisRate ? rupees(basisRate) : '',
    mmfLarge: complete ? rupees(minimumFee) : '',
    mmfMsme: msmeFee,
    finalUnitRate: complete && proposed ? `${proposed.toFixed(2)} per ${base.unitOfSale || 'unit'}` : '',
    slab1Text: complete && proposed ? `Rs. ${proposed.toFixed(2)} per unit for ALL UNITS` : '',
  }
}
