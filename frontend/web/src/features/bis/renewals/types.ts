import { formatIsCodeLabel } from '@/features/masters/is-codes/formatIsCodeLabel'

export {
  formatCmL,
  formatDisplayDate,
  formatInr,
  licenseValidityState,
  sanitizeCurrencyInput,
  todayIsoDate,
} from '../projects/types'

export const RENEWAL_STATUSES = [
  'Initiated',
  'Application Filed',
  'Fee Paid',
  'Test Report Submitted',
  'Inspection Scheduled',
  'Inspection Done',
  'Renewal Granted',
  'Rejected',
] as const

export const SUBMISSION_MODES = ['Online (MANAK)', 'Offline', 'By Post', 'Email'] as const
export const FEE_PAYMENT_MODES = ['Online (NEFT/RTGS)', 'Demand Draft', 'Cheque', 'UPI'] as const
export const TEST_RESULTS = ['Conforming', 'Non-Conforming', 'Pending'] as const
export const INSPECTION_RESULTS = [
  'Satisfactory',
  'Unsatisfactory',
  'Conditionally Satisfactory',
  'Pending',
] as const

export type RenewalSlabRate = {
  quantity: string
  rate: string
}

export type RenewalProjectJoin = {
  id: string
  title: string | null
  cm_l_digits: string | null
  license_validity_date: string | null
  status: string | null
  client_id: string | null
  is_code: {
    is_number: string | null
    title: string | null
    revision_year: string | null
    part_no?: string | null
    section_no?: string | null
    standard_prefix?: string | null
    unit_of_is?: string | null
    slab_1_quantity?: string | null
    slab_1_rate?: number | string | null
    slab_2_quantity?: string | null
    slab_2_rate?: number | string | null
    slab_3_quantity?: string | null
    slab_3_rate?: number | string | null
    mmf_large_scale?: number | string | null
    mmf_medium_scale?: number | string | null
    mmf_small_scale?: number | string | null
    mmf_micro_scale?: number | string | null
  } | null
}

/** Minimum marking fee per year by firm scale (IS Code Master). */
export type RenewalMinimumFees = { Large: string; Medium: string; Small: string; Micro: string }

export const emptyMinimumFees = (): RenewalMinimumFees => ({ Large: '', Medium: '', Small: '', Micro: '' })

export function minimumFeesFromIsCode(code: {
  mmf_large_scale?: number | string | null
  mmf_medium_scale?: number | string | null
  mmf_small_scale?: number | string | null
  mmf_micro_scale?: number | string | null
} | null | undefined): RenewalMinimumFees {
  const v = (value: number | string | null | undefined) => (value == null ? '' : String(value))
  return {
    Large: v(code?.mmf_large_scale),
    Medium: v(code?.mmf_medium_scale),
    Small: v(code?.mmf_small_scale),
    Micro: v(code?.mmf_micro_scale),
  }
}

/** Client Master company scale → the IS Code Master minimum fee column ('' when not set). */
export function renewalFirmScale(value: string | null | undefined): keyof RenewalMinimumFees | '' {
  const text = String(value ?? '').toLowerCase()
  if (/micro/.test(text)) return 'Micro'
  if (/small/.test(text)) return 'Small'
  if (/medium/.test(text)) return 'Medium'
  if (/large/.test(text)) return 'Large'
  return ''
}

export type RenewalProductionRow = {
  id: string
  periodFrom: string
  periodTo: string
  productionUnit: string
  productionValue: string
  coveredUnit: string
  coveredValue: string
  coveredPercent: string
  markingFee: string
  stockMarkingBreak?: boolean
}

export function emptyRenewalProductionRow(): RenewalProductionRow {
  return {
    id: `production-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    periodFrom: '',
    periodTo: '',
    productionUnit: '',
    productionValue: '',
    coveredUnit: '',
    coveredValue: '',
    coveredPercent: '',
    markingFee: '',
  }
}

function parseIsoUtcDate(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
  const date = new Date(`${value}T00:00:00.000Z`)
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value ? null : date
}

function isoUtcDate(date: Date): string {
  return date.toISOString().slice(0, 10)
}

/**
 * Production period BIS asks for at renewal (Manak Production Return): the last 3 months of the previous
 * operative year plus the first 9 months of the current one — the 12 months ending 3 months before validity.
 */
export function defaultRenewalProductionPeriod(validity: string): { from: string; to: string } | null {
  const date = parseIsoUtcDate(validity.slice(0, 10))
  if (!date) return null
  const shift = (months: number) => {
    const out = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1))
    out.setUTCDate(Math.min(date.getUTCDate(), new Date(Date.UTC(out.getUTCFullYear(), out.getUTCMonth() + 1, 0)).getUTCDate()))
    return out
  }
  const from = shift(-15)
  from.setUTCDate(from.getUTCDate() + 1)
  return { from: isoUtcDate(from), to: isoUtcDate(shift(-3)) }
}

/**
 * Monthly rows for the period. With the licence validity date, the month holding the licence anniversary
 * is split there (e.g. 01–20 Oct / 21–31 Oct), as Manak's Production Return lists it.
 */
export function generateMonthlyRenewalRows(
  periodStart: string,
  periodEnd: string,
  currentRows: RenewalProductionRow[],
  validity = '',
): RenewalProductionRow[] {
  const start = parseIsoUtcDate(periodStart)
  const end = parseIsoUtcDate(periodEnd)
  if (!start || !end || start > end) return currentRows
  const anniversary = parseIsoUtcDate(validity.slice(0, 10))

  const existingByStart = new Map(currentRows.map((row) => [row.periodFrom, row]))
  const generated: RenewalProductionRow[] = []
  const cursor = new Date(start)
  while (cursor <= end && generated.length < 1200) {
    const periodFrom = isoUtcDate(cursor)
    const monthEnd = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 0))
    let rowEnd = monthEnd < end ? monthEnd : end
    if (anniversary && cursor.getUTCMonth() === anniversary.getUTCMonth()) {
      const split = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth(), anniversary.getUTCDate()))
      if (split >= cursor && split < rowEnd) rowEnd = split
    }
    const periodTo = isoUtcDate(rowEnd)
    const existingSegments = currentRows
      .filter((row) => row.periodFrom >= periodFrom && row.periodFrom <= periodTo && row.periodTo <= periodTo)
      .sort((a, b) => a.periodFrom.localeCompare(b.periodFrom))
    const hasStockBreak = existingSegments.some((row) => row.stockMarkingBreak)
    const isContiguous = existingSegments.every((row, index) => (
      index === 0 || existingSegments[index - 1].periodTo < row.periodFrom
        && isoUtcDate(new Date(Date.parse(`${existingSegments[index - 1].periodTo}T00:00:00.000Z`) + 24 * 60 * 60 * 1000)) === row.periodFrom
    ))
    if (hasStockBreak && existingSegments[0]?.periodFrom === periodFrom
      && existingSegments.at(-1)?.periodTo === periodTo && isContiguous) {
      generated.push(...existingSegments)
      cursor.setTime(Date.parse(`${periodTo}T00:00:00.000Z`))
      cursor.setUTCDate(cursor.getUTCDate() + 1)
      continue
    }
    const previous = existingByStart.get(periodFrom)
    generated.push(previous
      ? { ...previous, periodTo }
      : { ...emptyRenewalProductionRow(), periodFrom, periodTo })
    cursor.setTime(Date.parse(`${periodTo}T00:00:00.000Z`))
    cursor.setUTCDate(cursor.getUTCDate() + 1)
  }
  return generated
}

function shiftIsoDate(value: string, days: number): string {
  const date = parseIsoUtcDate(value)
  if (!date) return ''
  date.setUTCDate(date.getUTCDate() + days)
  return isoUtcDate(date)
}

export function splitProductionRowForStockMarking(
  rows: RenewalProductionRow[],
  rowId: string,
  breakFrom: string,
  breakTo: string,
): RenewalProductionRow[] {
  const index = rows.findIndex((row) => row.id === rowId)
  const row = rows[index]
  if (!row) throw new Error('Production period could not be found.')
  if (!parseIsoUtcDate(row.periodFrom) || !parseIsoUtcDate(row.periodTo)) {
    throw new Error('Set valid period start and end dates before adding a stock-marking break.')
  }
  if (!parseIsoUtcDate(breakFrom) || !parseIsoUtcDate(breakTo) || breakFrom > breakTo) {
    throw new Error('Enter a valid stock-marking start and end date.')
  }
  if (breakFrom < row.periodFrom || breakTo > row.periodTo) {
    throw new Error('Stock-marking dates must stay inside this production period.')
  }
  if (row.stockMarkingBreak) throw new Error('This period is already marked as a stock-marking break.')
  const beforeExists = breakFrom > row.periodFrom
  const afterExists = breakTo < row.periodTo
  const hasProduction = Number(row.productionUnit.replace(/,/g, '')) > 0
    || Number(row.coveredUnit.replace(/,/g, '')) > 0
  if (!beforeExists && !afterExists && hasProduction) {
    throw new Error('This break covers the whole period. Clear its production quantities before marking the full period as stock-marking.')
  }

  const blank = (periodFrom: string, periodTo: string): RenewalProductionRow => ({
    ...emptyRenewalProductionRow(), periodFrom, periodTo,
  })
  const activeWithExistingValues = (periodFrom: string, periodTo: string): RenewalProductionRow => ({
    ...row,
    periodFrom,
    periodTo,
    productionValue: '',
    coveredValue: '',
    coveredPercent: '',
    markingFee: '',
    stockMarkingBreak: undefined,
  })

  const segments: RenewalProductionRow[] = []
  if (beforeExists) segments.push(activeWithExistingValues(row.periodFrom, shiftIsoDate(breakFrom, -1)))
  segments.push({
    ...blank(breakFrom, breakTo),
    id: !beforeExists ? row.id : emptyRenewalProductionRow().id,
    productionUnit: '0',
    coveredUnit: '0',
    stockMarkingBreak: true,
  })
  if (afterExists) {
    const after = blank(shiftIsoDate(breakTo, 1), row.periodTo)
    if (!beforeExists) {
      segments.push({ ...after, id: row.id, productionUnit: row.productionUnit, coveredUnit: row.coveredUnit })
    } else {
      segments.push(after)
    }
  }
  return [...rows.slice(0, index), ...segments, ...rows.slice(index + 1)]
}

function finiteNumber(value: string): number | null {
  if (!value.trim()) return null
  const parsed = Number.parseFloat(value.replace(/,/g, ''))
  return Number.isFinite(parsed) ? parsed : null
}

export function coveredProductionExceedsTotal(row: RenewalProductionRow): boolean {
  const totalProduction = finiteNumber(row.productionUnit)
  const coveredProduction = finiteNumber(row.coveredUnit)
  return totalProduction !== null && coveredProduction !== null && coveredProduction > totalProduction
}

export function renewalSlabForQuantity(
  quantityValue: string,
  slabs: RenewalSlabRate[],
): RenewalSlabRate | null {
  const quantity = finiteNumber(quantityValue)
  if (quantity === null) return null
  const active = slabs.flatMap((slab, index) => {
    const rate = finiteNumber(slab.rate)
    const label = slab.quantity.trim().toLowerCase()
    return rate !== null && label && label !== 'n/a' ? [{ slab, index, rate, label }] : []
  })
  if (active.length === 0) return null

  const allQuantities = active.find((slab) => /\ball\s+quantit(?:y|ies)\b/.test(slab.label))
  if (allQuantities) return allQuantities.slab

  const numberPattern = '(\\d[\\d,]*(?:\\.\\d+)?)'
  let sawExplicitBand = false
  for (const slab of active) {
    const nums = [...slab.label.matchAll(new RegExp(numberPattern, 'g'))]
      .map((match) => Number(match[0].replace(/,/g, '')))
      .filter(Number.isFinite)
    if (nums.length >= 2 && /-|–|—|\bto\b|\bbetween\b/.test(slab.label)) {
      sawExplicitBand = true
      if (quantity >= Math.min(nums[0], nums[1]) && quantity <= Math.max(nums[0], nums[1])) return slab.slab
    } else if (nums.length >= 1 && /\b(up\s*to|upto|below|under|less\s+than|max(?:imum)?)\b|<=|</.test(slab.label)) {
      sawExplicitBand = true
      if (quantity <= nums[0]) return slab.slab
    } else if (nums.length >= 1 && /\b(above|over|more\s+than|greater\s+than|min(?:imum)?)\b|>=|>/.test(slab.label)) {
      sawExplicitBand = true
      if (quantity >= nums[0]) return slab.slab
    }
  }
  if (sawExplicitBand) return null

  const thresholds = active.flatMap((slab) => {
    const nums = [...slab.label.matchAll(new RegExp(numberPattern, 'g'))]
      .map((match) => Number(match[0].replace(/,/g, '')))
      .filter(Number.isFinite)
    return nums.length === 1 ? [{ threshold: nums[0], slab: slab.slab, index: slab.index }] : []
  }).sort((a, b) => a.threshold - b.threshold || a.index - b.index)
  if (thresholds.length === active.length) {
    return thresholds.find((slab) => quantity <= slab.threshold)?.slab ?? thresholds.at(-1)?.slab ?? null
  }
  return active.length === 1 ? active[0].slab : null
}

export function calculateRenewalProductionRow(
  row: RenewalProductionRow,
  basicUnitRate: string,
  slabRates: RenewalSlabRate[],
): RenewalProductionRow {
  const basicRate = finiteNumber(basicUnitRate)
  const production = finiteNumber(row.productionUnit)
  const covered = finiteNumber(row.coveredUnit)
  const slabRate = finiteNumber(renewalSlabForQuantity(row.coveredUnit, slabRates)?.rate ?? '')
  const coveredPercent = production !== null && production > 0 && covered !== null
    ? ((covered / production) * 100).toFixed(2)
    : ''
  const money = (quantity: number | null, rate: number | null) => (
    quantity === null || rate === null ? '' : (quantity * rate).toFixed(2)
  )
  return {
    ...row,
    productionValue: money(production, basicRate),
    coveredValue: money(covered, basicRate),
    coveredPercent,
    markingFee: money(covered, slabRate),
  }
}

export type BisRenewalRow = {
  id: string
  project_id: string
  client_id: string | null
  application_date: string | null
  submission_mode: string | null
  acknowledgment_number: string | null
  bis_office: string | null
  bis_desk_officer: string | null
  marking_fee_rate: number | string | null
  renewal_period_from: string | null
  renewal_period_to: string | null
  renewal_term_years: number | string | null
  basic_unit_rate: number | string | null
  marking_fee_quantity: number | string | null
  marking_fee_total: number | string | null
  fee_challan_number: string | null
  fee_payment_date: string | null
  fee_payment_mode: string | null
  test_report_number: string | null
  test_report_date: string | null
  test_lab_name: string | null
  test_lab_nabl_no: string | null
  test_result: string | null
  inspection_notice_date: string | null
  inspection_date: string | null
  bis_inspector_name: string | null
  inspection_result: string | null
  renewal_granted_date: string | null
  new_validity_from: string | null
  new_validity_to: string | null
  renewal_status: string
  notes: string | null
  production_details: RenewalProductionRow[] | null
  created_at?: string | null
  updated_at?: string | null
  client: { company_name: string | null; address?: string | null; email?: string | null; company_scale?: string | null } | null
  project: RenewalProjectJoin | null
}

export type BisRenewalForm = {
  projectId: string
  projectLabel: string
  clientId: string
  clientLabel: string
  clientAddress: string
  clientEmail: string
  currentValidity: string
  cmLDigits: string
  isCodeLabel: string
  unitOfIs: string
  slabRates: RenewalSlabRate[]
  /** Client Master company scale (Large / Medium / Small / Micro). */
  firmScale: string
  minimumFees: RenewalMinimumFees
  renewalPeriodFrom: string
  renewalPeriodTo: string
  renewalTermYears: string
  basicUnitRate: string
  applicationDate: string
  submissionMode: string
  acknowledgmentNumber: string
  bisOffice: string
  bisDeskOfficer: string
  markingFeeRate: string
  markingFeeQuantity: string
  markingFeeTotal: string
  feeChallanNumber: string
  feePaymentDate: string
  feePaymentMode: string
  testReportNumber: string
  testReportDate: string
  testLabName: string
  testLabNablNo: string
  testResult: string
  inspectionNoticeDate: string
  inspectionDate: string
  bisInspectorName: string
  inspectionResult: string
  renewalGrantedDate: string
  newValidityFrom: string
  newValidityTo: string
  renewalStatus: string
  notes: string
  productionRows: RenewalProductionRow[]
}

export function emptyRenewalForm(): BisRenewalForm {
  return {
    projectId: '',
    projectLabel: '',
    clientId: '',
    clientLabel: '',
    clientAddress: '',
    clientEmail: '',
    currentValidity: '',
    cmLDigits: '',
    isCodeLabel: '',
    unitOfIs: '',
    slabRates: [],
    firmScale: '',
    minimumFees: emptyMinimumFees(),
    renewalPeriodFrom: '',
    renewalPeriodTo: '',
    renewalTermYears: '5',
    basicUnitRate: '',
    applicationDate: '',
    submissionMode: '',
    acknowledgmentNumber: '',
    bisOffice: '',
    bisDeskOfficer: '',
    markingFeeRate: '',
    markingFeeQuantity: '',
    markingFeeTotal: '',
    feeChallanNumber: '',
    feePaymentDate: '',
    feePaymentMode: '',
    testReportNumber: '',
    testReportDate: '',
    testLabName: '',
    testLabNablNo: '',
    testResult: '',
    inspectionNoticeDate: '',
    inspectionDate: '',
    bisInspectorName: '',
    inspectionResult: '',
    renewalGrantedDate: '',
    newValidityFrom: '',
    newValidityTo: '',
    renewalStatus: 'Initiated',
    notes: '',
    productionRows: [emptyRenewalProductionRow()],
  }
}

export function renewalClientName(row: Pick<BisRenewalRow, 'client'>): string {
  return (row.client?.company_name ?? '').trim()
}

export function renewalIsCodeLabel(row: Pick<BisRenewalRow, 'project'>): string {
  const code = row.project?.is_code
  if (!code) return ''
  return formatIsCodeLabel(code)
}

function moneyToString(value: number | string | null | undefined): string {
  if (value == null || value === '') return ''
  const n = Number(value)
  return Number.isFinite(n) ? String(n) : ''
}

export function rowToRenewalForm(row: BisRenewalRow): BisRenewalForm {
  return {
    projectId: row.project_id,
    projectLabel: row.project?.title?.trim() || 'BIS License',
    clientId: row.client_id ?? row.project?.client_id ?? '',
    clientLabel: renewalClientName(row),
    clientAddress: row.client?.address?.trim() ?? '',
    clientEmail: row.client?.email?.trim() ?? '',
    currentValidity: row.project?.license_validity_date ?? '',
    cmLDigits: String(row.project?.cm_l_digits ?? '').replace(/\D/g, ''),
    isCodeLabel: renewalIsCodeLabel(row),
    unitOfIs: row.project?.is_code?.unit_of_is?.trim() ?? '',
    slabRates: row.project?.is_code ? [
      { quantity: row.project.is_code.slab_1_quantity ?? '', rate: moneyToString(row.project.is_code.slab_1_rate) },
      { quantity: row.project.is_code.slab_2_quantity ?? '', rate: moneyToString(row.project.is_code.slab_2_rate) },
      { quantity: row.project.is_code.slab_3_quantity ?? '', rate: moneyToString(row.project.is_code.slab_3_rate) },
    ] : [],
    firmScale: row.client?.company_scale?.trim() ?? '',
    minimumFees: minimumFeesFromIsCode(row.project?.is_code),
    renewalPeriodFrom: row.renewal_period_from ?? '',
    renewalPeriodTo: row.renewal_period_to ?? '',
    renewalTermYears: String(row.renewal_term_years ?? 5),
    basicUnitRate: moneyToString(row.basic_unit_rate),
    applicationDate: row.application_date ?? '',
    submissionMode: row.submission_mode ?? '',
    acknowledgmentNumber: row.acknowledgment_number ?? '',
    bisOffice: row.bis_office ?? '',
    bisDeskOfficer: row.bis_desk_officer ?? '',
    markingFeeRate: moneyToString(row.marking_fee_rate),
    markingFeeQuantity: moneyToString(row.marking_fee_quantity),
    markingFeeTotal: moneyToString(row.marking_fee_total),
    feeChallanNumber: row.fee_challan_number ?? '',
    feePaymentDate: row.fee_payment_date ?? '',
    feePaymentMode: row.fee_payment_mode ?? '',
    testReportNumber: row.test_report_number ?? '',
    testReportDate: row.test_report_date ?? '',
    testLabName: row.test_lab_name ?? '',
    testLabNablNo: row.test_lab_nabl_no ?? '',
    testResult: row.test_result ?? '',
    inspectionNoticeDate: row.inspection_notice_date ?? '',
    inspectionDate: row.inspection_date ?? '',
    bisInspectorName: row.bis_inspector_name ?? '',
    inspectionResult: row.inspection_result ?? '',
    renewalGrantedDate: row.renewal_granted_date ?? '',
    newValidityFrom: row.new_validity_from ?? '',
    newValidityTo: row.new_validity_to ?? '',
    renewalStatus: row.renewal_status?.trim() || 'Initiated',
    notes: row.notes ?? '',
    productionRows: row.production_details?.length
      ? row.production_details.map((productionRow) => ({
          id: productionRow.id,
          periodFrom: productionRow.periodFrom ?? '',
          periodTo: productionRow.periodTo ?? '',
          productionUnit: productionRow.productionUnit ?? '',
          productionValue: productionRow.productionValue ?? '',
          coveredUnit: productionRow.coveredUnit ?? '',
          coveredValue: productionRow.coveredValue ?? '',
          coveredPercent: productionRow.coveredPercent ?? '',
          markingFee: productionRow.markingFee ?? '',
          stockMarkingBreak: productionRow.stockMarkingBreak === true,
        }))
      : [emptyRenewalProductionRow()],
  }
}

export function computeMarkingFeeTotal(rate: string, quantity: string): string {
  const r = Number.parseFloat(rate)
  const q = Number.parseFloat(quantity)
  if (!Number.isFinite(r) || !Number.isFinite(q) || r <= 0 || q <= 0) return ''
  return (Math.round(r * q * 100) / 100).toFixed(2)
}

export function renewalStatusClass(status: string | null | undefined): string {
  switch (status) {
    case 'Renewal Granted':
      return 'bg-emerald-50 text-emerald-800 ring-emerald-200'
    case 'Rejected':
      return 'bg-red-50 text-red-800 ring-red-200'
    case 'Initiated':
      return 'bg-slate-50 text-slate-700 ring-slate-200'
    default:
      return 'bg-amber-50 text-amber-900 ring-amber-200'
  }
}

export type RenewalMarkingFeeSummary = {
  /** Σ covered production × slab rate. */
  calculated: number
  scale: keyof RenewalMinimumFees | ''
  /** Minimum marking fee per year for the firm scale (null when the scale or the IS Code fee is not set). */
  minimumPerYear: number | null
  /** Years of production the statement covers (the minimum is charged per year). */
  years: number
  minimumTotal: number
  /** The fee payable: the higher of the calculated fee and the minimum. */
  payable: number
  basis: 'calculated' | 'minimum'
  /** BIS renewal application fee (₹1,000 per licence). */
  applicationFee: number
  /** BIS annual licence fee (₹1,000 per year). */
  licenceFee: number
  /** Marking fee payable + application fee + licence fee. */
  subtotal: number
  gstRate: number
  gst: number
  /** Subtotal + GST: the total to pay BIS. */
  total: number
}

/** BIS Conformity Assessment Regulations, Scheme-I: renewal application fee and annual licence fee. */
export const RENEWAL_APPLICATION_FEE = 1000
export const ANNUAL_LICENCE_FEE = 1000
export const RENEWAL_GST_RATE = 18

/**
 * BIS marking fee for the production statement: the production-based fee, or the minimum marking fee for the
 * firm's scale (IS Code Master) for each year covered, whichever is higher — so it is never 0 with no production.
 */
export function renewalMarkingFeeSummary(
  rows: RenewalProductionRow[],
  form: Pick<BisRenewalForm, 'firmScale' | 'minimumFees' | 'renewalPeriodFrom' | 'renewalPeriodTo'>,
): RenewalMarkingFeeSummary {
  const calculated = rows.reduce((sum, row) => sum + (finiteNumber(row.markingFee) ?? 0), 0)
  const scale = renewalFirmScale(form.firmScale)
  const minimumPerYear = scale ? finiteNumber(form.minimumFees?.[scale] ?? '') : null
  const from = parseIsoUtcDate(form.renewalPeriodFrom)
  const to = parseIsoUtcDate(form.renewalPeriodTo)
  const days = from && to && to >= from ? (to.getTime() - from.getTime()) / 86_400_000 + 1 : 0
  const years = Math.max(1, Math.round(days / 365.25))
  const minimumTotal = minimumPerYear !== null ? minimumPerYear * years : 0
  const payable = Math.max(calculated, minimumTotal)
  const applicationFee = RENEWAL_APPLICATION_FEE
  const licenceFee = ANNUAL_LICENCE_FEE * years
  const subtotal = payable + applicationFee + licenceFee
  const gst = Math.round(subtotal * RENEWAL_GST_RATE) / 100
  return {
    calculated,
    scale,
    minimumPerYear,
    years,
    minimumTotal,
    payable,
    basis: minimumTotal > calculated ? 'minimum' : 'calculated',
    applicationFee,
    licenceFee,
    subtotal,
    gstRate: RENEWAL_GST_RATE,
    gst,
    total: subtotal + gst,
  }
}
