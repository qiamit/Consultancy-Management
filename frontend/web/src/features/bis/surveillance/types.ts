import { formatIsCodeLabelFromParts } from '@/features/masters/is-codes/formatIsCodeLabel'
import {
  EMPTY_CLIENT_IS_LICENSE,
  type ClientIsLicenseValue,
} from '../shared/ClientIsLicenseFields'

export type SurveillanceRow = {
  id: string
  bis_project_id: string | null
  client_id: string
  is_code_id: string
  cm_l_digits: string | null
  project_kind: string | null
  surveillance_date: string
  allotted_employee_name: string
  created_at?: string | null
  updated_at?: string | null
  client: { company_name: string | null } | null
  is_code: { is_number: string | null; title: string | null; revision_year: string | null } | null
  bis_project: { title: string | null; license_number: string | null } | null
}

export type SurveillanceForm = ClientIsLicenseValue & {
  surveillanceDate: string
  allottedEmployeeName: string
}

export function emptySurveillanceForm(): SurveillanceForm {
  return { ...EMPTY_CLIENT_IS_LICENSE, surveillanceDate: '', allottedEmployeeName: '' }
}

export function rowToSurveillanceForm(row: SurveillanceRow): SurveillanceForm {
  return {
    clientId: row.client_id,
    clientLabel: surveillanceClientName(row),
    isCodeId: row.is_code_id,
    isCodeLabel: surveillanceIsCodeLabel(row),
    bisProjectId: row.bis_project_id ?? '',
    cmLDigits: String(row.cm_l_digits ?? '').replace(/\D/g, '').slice(0, 10),
    projectKind: row.project_kind ?? '',
    surveillanceDate: row.surveillance_date?.slice(0, 10) ?? '',
    allottedEmployeeName: row.allotted_employee_name ?? '',
  }
}

export function surveillanceClientName(row: Pick<SurveillanceRow, 'client'>): string {
  return (row.client?.company_name ?? '').trim()
}

export function surveillanceIsCodeLabel(row: Pick<SurveillanceRow, 'is_code'>): string {
  const code = row.is_code
  if (!code) return ''
  return formatIsCodeLabelFromParts(code.is_number, code.revision_year)
}
