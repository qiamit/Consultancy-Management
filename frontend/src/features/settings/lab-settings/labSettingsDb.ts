/** Maps LabSettingsPage fields ↔ public.lab_settings and related lab tables */

import type { SupabaseClient } from '@/lib/supabaseClient'

export const LAB_SETTINGS_SINGLETON_ID = '00000000-0000-0000-0000-000000000001'

/** Same row resolution as Lab Settings page — singleton first, else newest row. */
export async function resolveLabSettingsRowId(client: SupabaseClient): Promise<string> {
  const singleton = await client
    .from('lab_settings')
    .select('id')
    .eq('id', LAB_SETTINGS_SINGLETON_ID)
    .maybeSingle()

  if (!singleton.error && singleton.data?.id) {
    return LAB_SETTINGS_SINGLETON_ID
  }

  const latest = await client
    .from('lab_settings')
    .select('id')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!latest.error && latest.data?.id) {
    return String(latest.data.id)
  }

  return LAB_SETTINGS_SINGLETON_ID
}

export type LabSettingsRow = Record<string, unknown>

export function parseLabSettingsRow(row: LabSettingsRow) {
  return {
    labName: String(row.lab_name ?? ''),
    gstNumber: String(row.gst_number ?? ''),
    contactPersonName: String(row.contact_person ?? row.contact_person_name ?? ''),
    mobile: String(row.phone ?? row.lab_phone ?? ''),
    email: String(row.email ?? row.lab_email ?? ''),
    website: String(row.website ?? row.lab_website ?? ''),
    address: String(row.address ?? row.lab_address ?? ''),
    pinCode: String(row.pin_code ?? ''),
    district: String(row.district ?? 'Raipur'),
    companyLogoPath: typeof row.logo_path === 'string' ? row.logo_path : typeof row.company_logo_path === 'string' ? row.company_logo_path : null,
    sealSignPath: typeof row.seal_sign_path === 'string' ? row.seal_sign_path : null,
    bankName: String(row.bank_name ?? ''),
    branchName: String(row.branch_name ?? ''),
    accountNumber: String(row.account_number ?? ''),
    ifsc: String(row.ifsc ?? ''),
    upi: String(row.upi ?? ''),
    chequeCopyPath: typeof row.cheque_copy_path === 'string' ? row.cheque_copy_path : null,
    qrCodePath: typeof row.qr_code_path === 'string' ? row.qr_code_path : null,
    labType: String(row.lab_type ?? row.laboratory_type ?? ''),
    labScale: String(row.lab_scale ?? row.laboratory_scale ?? ''),
    designation: String(row.designation ?? row.contact_designation ?? ''),
    state: String(row.state ?? ''),
    country: String(row.country ?? ''),
    currency: String(row.currency ?? ''),
    dateFormat: String(row.date_format ?? ''),
    timeFormat: String(row.time_format ?? ''),
    theme: String(row.theme ?? '').trim(),
    generateReportEnabled:
      row.generate_report_enabled == null ? true : Boolean(row.generate_report_enabled),
  }
}

/** Company Setting: Generate Report Format / Conduct Generate Report visibility. Default true. */
export async function fetchGenerateReportFeatureEnabled(
  client: SupabaseClient,
): Promise<boolean> {
  const id = await resolveLabSettingsRowId(client)
  const { data, error } = await client
    .from('lab_settings')
    .select('generate_report_enabled')
    .eq('id', id)
    .maybeSingle()

  if (error || !data) return true
  return data.generate_report_enabled !== false
}

export function labDetailsPayload(input: {
  labName: string
  gstNumber: string
  address: string
  mobile: string
  email: string
  website: string
  labType: string
  labScale: string
  contactPersonName: string
  designation: string
  pinCode: string
  district: string
  state: string
  country: string
  companyLogoPath: string | null
  sealSignPath: string | null
}): LabSettingsRow {
  return {
    id: LAB_SETTINGS_SINGLETON_ID,
    lab_name: input.labName,
    gst_number: input.gstNumber.trim() || null,
    address: input.address,
    phone: input.mobile,
    email: input.email,
    website: input.website,
    lab_type: input.labType,
    lab_scale: input.labScale,
    contact_person: input.contactPersonName,
    designation: input.designation,
    pin_code: input.pinCode,
    district: input.district,
    state: input.state,
    country: input.country,
    logo_path: input.companyLogoPath,
    seal_sign_path: input.sealSignPath,
  }
}

export function labBankPayload(input: {
  bankName: string
  branchName: string
  accountNumber: string
  ifsc: string
  upi: string
  chequeCopyPath: string | null
  qrCodePath: string | null
}): LabSettingsRow {
  return {
    id: LAB_SETTINGS_SINGLETON_ID,
    bank_name: input.bankName,
    branch_name: input.branchName,
    account_number: input.accountNumber,
    ifsc: input.ifsc,
    upi: input.upi,
    cheque_copy_path: input.chequeCopyPath,
    qr_code_path: input.qrCodePath,
  }
}

export function labSystemPayload(input: {
  currency: string
  dateFormat: string
  timeFormat: string
  theme: string
  generateReportEnabled: boolean
}): LabSettingsRow {
  return {
    id: LAB_SETTINGS_SINGLETON_ID,
    currency: input.currency,
    date_format: input.dateFormat,
    time_format: input.timeFormat,
    theme: input.theme,
    generate_report_enabled: input.generateReportEnabled,
  }
}

export type RegistrationDocInput = { name: string; number: string; fileUrl: string | null }

export function registrationDocsToRows(docs: RegistrationDocInput[]) {
  return docs
    .filter((doc) => doc.name.trim())
    .map((doc) => ({
      category: 'registration',
      name: doc.name.trim(),
      remarks: doc.number ?? '',
      file_path: doc.fileUrl ?? null,
    }))
}

export function registrationDocFromRow(row: { name?: unknown; remarks?: unknown; file_path?: unknown }) {
  return {
    name: String(row.name ?? row.title ?? ''),
    number: String(row.remarks ?? row.notes ?? ''),
    fileUrl: typeof row.file_path === 'string' ? row.file_path : null,
  }
}

export type AccreditationCardInput = {
  inputLabel: string
  certificateNo: string
  certificateFilePath: string | null
  scopeFilePath: string | null
  logoFilePath: string | null
  validityStart: string | null
  validityEnd: string | null
}

export function accreditationsToRows(cards: AccreditationCardInput[]) {
  return cards
    .filter((card) => card.inputLabel.trim())
    .map((card) => ({
      accreditation_body: card.inputLabel.trim(),
      accreditation_number: card.certificateNo ?? '',
      certificate_file_path: card.certificateFilePath ?? null,
      scope_document_path: card.scopeFilePath ?? null,
      logo_file_path: card.logoFilePath ?? null,
      valid_from: card.validityStart ?? null,
      valid_until: card.validityEnd ?? null,
    }))
}

export function accreditationFromRow(row: {
  accreditation_body?: unknown
  title?: unknown
  accreditation_number?: unknown
  certificate_no?: unknown
  certificate_file_path?: unknown
  scope_document_path?: unknown
  scope_file_path?: unknown
  logo_file_path?: unknown
  valid_from?: unknown
  valid_until?: unknown
  valid_to?: unknown
}): AccreditationCardInput {
  return {
    inputLabel: String(row.accreditation_body ?? row.title ?? '').trim(),
    certificateNo: String(row.accreditation_number ?? row.certificate_no ?? ''),
    certificateFilePath: typeof row.certificate_file_path === 'string' ? row.certificate_file_path : null,
    scopeFilePath:
      typeof row.scope_document_path === 'string'
        ? row.scope_document_path
        : typeof row.scope_file_path === 'string'
          ? row.scope_file_path
          : null,
    logoFilePath: typeof row.logo_file_path === 'string' ? row.logo_file_path : null,
    validityStart: typeof row.valid_from === 'string' ? row.valid_from : null,
    validityEnd: typeof row.valid_until === 'string' ? row.valid_until : typeof row.valid_to === 'string' ? row.valid_to : null,
  }
}

export type LetterheadPayload = {
  template_type: string
  title: string
  file_path?: string | null
  content_text?: string | null
  is_default: boolean
}

export function letterheadFromRow(row: {
  template_type?: unknown
  title?: unknown
  name?: unknown
  file_path?: unknown
  content_text?: unknown
  header_html?: unknown
  footer_html?: unknown
}) {
  const type = String(row.template_type ?? '')
  const title = String(row.title ?? row.name ?? '')
  const fileUrl = typeof row.file_path === 'string' ? row.file_path : null
  const text = String(row.content_text ?? row.footer_html ?? row.header_html ?? '')
  return { type, title, fileUrl, text }
}
