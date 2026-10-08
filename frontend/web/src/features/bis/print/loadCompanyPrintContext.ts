import { supabase } from '@/lib/supabaseClient'
import { parseLabSettingsRow, resolveLabSettingsRowId } from '@/features/settings/lab-settings/labSettingsDb'

const FILES_BUCKET = 'laboratory-files'

export type CompanyPrintContext = {
  companyName: string
  address: string
  pinCode: string
  district: string
  state: string
  country: string
  phone: string
  email: string
  website: string
  gstNumber: string
  contactPerson: string
  designation: string
  logoUrl: string | null
}

export const DEFAULT_COMPANY_PRINT_CONTEXT: CompanyPrintContext = {
  companyName: 'Q Engineering',
  address: '',
  pinCode: '',
  district: '',
  state: '',
  country: 'India',
  phone: '',
  email: '',
  website: '',
  gstNumber: '',
  contactPerson: '',
  designation: '',
  logoUrl: null,
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

async function resolveLogoUrl(path: string | null | undefined): Promise<string | null> {
  const p = (path ?? '').trim()
  if (!p) return null
  if (/^(https?:|data:)/i.test(p)) return p
  try {
    const { data, error } = await supabase.storage.from(FILES_BUCKET).createSignedUrl(p, 60 * 60)
    if (error || !data?.signedUrl) return null
    return data.signedUrl
  } catch {
    return null
  }
}

async function loadFromLabSettings(): Promise<Partial<CompanyPrintContext> | null> {
  const rowId = await resolveLabSettingsRowId(supabase)
  const { data, error } = await supabase.from('lab_settings').select('*').eq('id', rowId).maybeSingle()
  if (error || !data) return null

  const parsed = parseLabSettingsRow(data as Record<string, unknown>)
  if (!parsed.labName.trim() && !parsed.address.trim()) return null

  return {
    companyName: parsed.labName.trim(),
    address: parsed.address.trim(),
    pinCode: parsed.pinCode.trim(),
    district: parsed.district.trim(),
    state: parsed.state.trim(),
    country: parsed.country.trim(),
    phone: parsed.mobile.trim(),
    email: parsed.email.trim(),
    website: parsed.website.trim(),
    gstNumber: parsed.gstNumber.trim(),
    contactPerson: parsed.contactPersonName.trim(),
    designation: parsed.designation.trim(),
    logoUrl: await resolveLogoUrl(parsed.companyLogoPath),
  }
}

async function loadFromCompanySettings(): Promise<Partial<CompanyPrintContext> | null> {
  const { data, error } = await supabase.from('company_settings').select('*').eq('id', 1).maybeSingle()
  if (error || !data) return null
  const row = data as Record<string, unknown>
  return {
    companyName: text(row.company_name),
    address: text(row.address),
    phone: text(row.phone),
    email: text(row.email),
    gstNumber: text(row.gst_number),
    logoUrl: await resolveLogoUrl(text(row.logo_path)),
  }
}

/**
 * Consultancy (Q Engineering) details used for print footers / prepared-by lines.
 * Reads `lab_settings` first, falls back to `company_settings`, never throws.
 */
export async function loadCompanyPrintContext(): Promise<CompanyPrintContext> {
  let primary: Partial<CompanyPrintContext> | null = null
  let fallback: Partial<CompanyPrintContext> | null = null

  try {
    primary = await loadFromLabSettings()
  } catch {
    primary = null
  }

  if (!primary || !primary.companyName) {
    try {
      fallback = await loadFromCompanySettings()
    } catch {
      fallback = null
    }
  }

  const merged: CompanyPrintContext = { ...DEFAULT_COMPANY_PRINT_CONTEXT }
  for (const source of [fallback, primary]) {
    if (!source) continue
    for (const key of Object.keys(source) as Array<keyof CompanyPrintContext>) {
      const value = source[key]
      if (value != null && value !== '') {
        ;(merged as Record<string, unknown>)[key] = value
      }
    }
  }
  return merged
}
