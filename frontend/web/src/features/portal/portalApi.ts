import { supabase } from '@/lib/supabaseClient'
import { formatIsCodeLabelFromParts } from '@/features/masters/is-codes/formatIsCodeLabel'
import { licenseValidityState } from '@/features/bis/projects/types'
import type { RecordColumn } from './recordLogic'

/* Customer Portal reads. A customer login is locked out of every table; these database functions return only the
   licences the owner assigned to this login, and only customer-safe fields (see migration 20261030235000). */

export const PORTAL_FILES_BUCKET = 'bis-project-files'

export type PortalLicence = {
  id: string
  cm_l_digits: string | null
  license_number: string | null
  license_validity_date: string | null
  granted_date: string | null
  is_number: string | null
  is_year: string | null
  is_title: string | null
  scheme_name: string | null
  licence_status: string | null
  company_name: string | null
}

export type PortalMachine = { name?: string; make?: string; number?: string; capacity_per_day?: string; remarks?: string }
export type PortalEquipment = {
  name?: string
  make?: string
  quantity?: string
  range?: string
  least_count?: string
  clause_no?: string
  calibration_status?: string
}
export type PortalFile = { id: string; file_name: string; storage_path: string }

export type PortalLicenceDetail = Omit<PortalLicence, 'licence_status'> & {
  licence_status: string | null
  scope: string | null
  installed_capacity: string | number | null
  production_unit: string | null
  bis_office: string | null
  factory: { address?: string; city?: string; district?: string; state?: string; pin_code?: string } | null
  machinery: PortalMachine[]
  test_equipment: PortalEquipment[]
  files: PortalFile[]
}

export async function fetchPortalLicences(): Promise<PortalLicence[]> {
  const { data, error } = await supabase.rpc('portal_my_licences')
  if (error) throw error
  return (Array.isArray(data) ? data : []) as PortalLicence[]
}

export async function fetchPortalLicence(id: string): Promise<PortalLicenceDetail> {
  const { data, error } = await supabase.rpc('portal_licence_detail', { p_project_id: id })
  if (error) throw new Error(error.code === '42501' ? 'This licence is not available.' : error.message)
  return data as PortalLicenceDetail
}

/** Short-lived link to a shared file; `download` adds Content-Disposition: attachment. */
export async function portalFileUrl(file: PortalFile, download = false): Promise<string> {
  const { data, error } = await supabase.storage
    .from(PORTAL_FILES_BUCKET)
    .createSignedUrl(file.storage_path, 60 * 10, download ? { download: file.file_name } : undefined)
  if (error || !data?.signedUrl) throw new Error('This file is not available.')
  return data.signedUrl
}

export function formatCmL(digits: string | null | undefined): string {
  const d = String(digits ?? '').replace(/\D/g, '')
  return d ? `CM/L-${d}` : '—'
}

export function isLabel(row: { is_number: string | null; is_year: string | null }): string {
  return formatIsCodeLabelFromParts(row.is_number, row.is_year) || '—'
}

/** Validity badge text and colours, from the same rules as the staff licence lists. */
export function validityBadge(date: string | null): { label: string; className: string } {
  const { state, daysLeft } = licenseValidityState(date)
  const days = daysLeft == null ? '' : Math.abs(daysLeft).toLocaleString('en-IN')
  switch (state) {
    case 'operative':
      return { label: `Operative · ${days} Days Left`, className: 'border-emerald-300 bg-emerald-50 text-emerald-800' }
    case 'expiring':
      return { label: `Renewal Due · ${days} Days Left`, className: 'border-amber-300 bg-amber-50 text-amber-900' }
    case 'deferred':
      return { label: `Renewal With Late Fee · Expired ${days} Days Ago`, className: 'border-orange-300 bg-orange-50 text-orange-900' }
    case 'expired':
      return { label: `Expired ${days} Days Ago`, className: 'border-red-300 bg-red-50 text-red-800' }
    default:
      return { label: 'Validity Not Set', className: 'border-stone-300 bg-stone-50 text-stone-600' }
  }
}

// ── Records (Phase 2) ────────────────────────────────────────────────────────────────────────────────

export type PortalServiceState = 'off' | 'trial' | 'active' | 'expired'

export type PortalSectionRef = { id: string; name: string; kind: string }

export type PortalDashboardLicence = {
  id: string
  cm_l_digits: string | null
  is_number: string | null
  is_year: string | null
  is_title: string | null
  license_validity_date: string | null
  company_name: string | null
  service: PortalServiceState
  service_valid_till: string | null
  entries_month: number
  fails_month: number
  last_entry: string | null
  sections: PortalSectionRef[]
}

export type PortalRecentEntry = {
  id: string
  section: string
  project_id: string
  entry_date: string
  ref_no: string | null
  result: 'pass' | 'fail' | null
  created_at: string
}

export type PortalDashboard = { licences: PortalDashboardLicence[]; recent: PortalRecentEntry[] }

export async function fetchPortalDashboard(): Promise<PortalDashboard> {
  const { data, error } = await supabase.rpc('portal_dashboard')
  if (error) throw error
  const d = (data ?? {}) as Partial<PortalDashboard>
  return { licences: d.licences ?? [], recent: d.recent ?? [] }
}

export function serviceLabel(state: PortalServiceState, validTill: string | null): { label: string; className: string } {
  const days = validTill ? Math.ceil((new Date(`${validTill}T23:59:59`).getTime() - Date.now()) / 86400000) : null
  switch (state) {
    case 'trial':
      return { label: `Records: Free Trial · ${days ?? 0} Days Left`, className: 'border-sky-300 bg-sky-50 text-sky-800' }
    case 'active':
      return { label: `Records: Active${days != null && days <= 30 ? ` · ${days} Days Left` : ''}`, className: 'border-emerald-300 bg-emerald-50 text-emerald-800' }
    case 'expired':
      return { label: 'Records: Expired · View Only', className: 'border-red-300 bg-red-50 text-red-800' }
    default:
      return { label: 'Records: Not Started', className: 'border-stone-300 bg-stone-50 text-stone-600' }
  }
}

export type PortalSection = {
  id: string
  project_id: string
  name: string
  kind: string
  service: { state: PortalServiceState; valid_till: string | null }
  columns: RecordColumn[]
}

export type PortalEntry = {
  id: string
  entry_date: string
  ref_no: string | null
  data: Record<string, unknown>
  result: 'pass' | 'fail' | null
  created_at: string
  updated_at: string
}

export type PortalLinkOption = { id: string; entry_date: string; ref_no: string | null; result: 'pass' | 'fail' | null }

function notAvailable(error: { code?: string; message: string }): Error {
  return new Error(error.code === '42501' ? error.message.replace(/^Not found$/, 'This section is not available.') : error.message)
}

export async function fetchPortalSection(sectionId: string): Promise<PortalSection> {
  const { data, error } = await supabase.rpc('portal_section', { p_section_id: sectionId })
  if (error) throw notAvailable(error)
  return data as PortalSection
}

export async function fetchPortalEntries(sectionId: string, from?: string, to?: string): Promise<PortalEntry[]> {
  const { data, error } = await supabase.rpc('portal_entries', { p_section_id: sectionId, p_from: from || null, p_to: to || null })
  if (error) throw notAvailable(error)
  return (data ?? []) as PortalEntry[]
}

export async function fetchLinkOptions(sectionId: string): Promise<PortalLinkOption[]> {
  const { data, error } = await supabase.rpc('portal_link_options', { p_section_id: sectionId })
  if (error) throw notAvailable(error)
  return (data ?? []) as PortalLinkOption[]
}

export async function savePortalEntry(input: {
  sectionId: string
  entryId: string | null
  entryDate: string
  refNo: string
  values: Record<string, unknown>
  result: 'pass' | 'fail' | null
}): Promise<string> {
  const { data, error } = await supabase.rpc('portal_entry_save', {
    p_section_id: input.sectionId,
    p_entry_id: input.entryId,
    p_entry_date: input.entryDate,
    p_ref_no: input.refNo,
    p_values: input.values,
    p_result: input.result,
  })
  if (error) throw notAvailable(error)
  return String(data)
}

export async function deletePortalEntry(entryId: string): Promise<void> {
  const { error } = await supabase.rpc('portal_entry_delete', { p_entry_id: entryId })
  if (error) throw notAvailable(error)
}
