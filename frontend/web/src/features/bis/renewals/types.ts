import { formatIsCodeLabelFromParts } from '@/features/masters/is-codes/formatIsCodeLabel'

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
  } | null
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
  created_at?: string | null
  updated_at?: string | null
  client: { company_name: string | null } | null
  project: RenewalProjectJoin | null
}

export type BisRenewalForm = {
  projectId: string
  projectLabel: string
  clientId: string
  clientLabel: string
  currentValidity: string
  cmLDigits: string
  isCodeLabel: string
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
}

export function emptyRenewalForm(): BisRenewalForm {
  return {
    projectId: '',
    projectLabel: '',
    clientId: '',
    clientLabel: '',
    currentValidity: '',
    cmLDigits: '',
    isCodeLabel: '',
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
  }
}

export function renewalClientName(row: Pick<BisRenewalRow, 'client'>): string {
  return (row.client?.company_name ?? '').trim()
}

export function renewalIsCodeLabel(row: Pick<BisRenewalRow, 'project'>): string {
  const code = row.project?.is_code
  if (!code) return ''
  return formatIsCodeLabelFromParts(code.is_number, code.revision_year)
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
    currentValidity: row.project?.license_validity_date ?? '',
    cmLDigits: String(row.project?.cm_l_digits ?? '').replace(/\D/g, ''),
    isCodeLabel: renewalIsCodeLabel(row),
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
