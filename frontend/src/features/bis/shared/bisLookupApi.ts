import { supabase } from '@/lib/supabaseClient'
import { formatIsCodeLabelFromParts } from '@/features/masters/is-codes/formatIsCodeLabel'
import type { FilterComboboxOption } from '@/features/sample-handling/receiving/FilterCombobox'

export type BisLicenseOption = {
  id: string
  cmLDigits: string
  projectKind: string
  title: string
}

type IsCodeJoin = {
  is_number: string | null
  title: string | null
  revision_year: string | null
}

/** IS codes that already have a (non-application) BIS project for this client. */
export async function searchClientIsCodeOptions(
  clientId: string,
  term: string,
): Promise<FilterComboboxOption[]> {
  if (!clientId) return []
  const { data, error } = await supabase
    .from('bis_projects')
    .select('is_code_id, project_kind, is_code:is_codes(is_number, title, revision_year)')
    .eq('client_id', clientId)
    .not('is_code_id', 'is', null)
    .order('created_at', { ascending: false })
    .limit(500)
  if (error) throw error

  const needle = term.trim().toLowerCase()
  const seen = new Set<string>()
  const options: FilterComboboxOption[] = []
  for (const raw of data ?? []) {
    const row = raw as unknown as {
      is_code_id: string | null
      project_kind: string | null
      is_code: IsCodeJoin | IsCodeJoin[] | null
    }
    if (!row.is_code_id || seen.has(row.is_code_id)) continue
    if ((row.project_kind ?? '').trim().toLowerCase() === 'application') continue
    const code = Array.isArray(row.is_code) ? row.is_code[0] : row.is_code
    const label = formatIsCodeLabelFromParts(code?.is_number, code?.revision_year) || 'Unnamed'
    const title = (code?.title ?? '').trim()
    if (needle && !`${label} ${title}`.toLowerCase().includes(needle)) continue
    seen.add(row.is_code_id)
    options.push({ id: row.is_code_id, label, secondaryLabel: title || undefined })
  }
  return options
}

/** Licenses (CM/L) for a client + IS code pair; used to link `bis_project_id`. */
export async function fetchLicenseOptions(
  clientId: string,
  isCodeId: string,
): Promise<BisLicenseOption[]> {
  if (!clientId || !isCodeId) return []
  const { data, error } = await supabase
    .from('bis_projects')
    .select('id, cm_l_digits, project_kind, title')
    .eq('client_id', clientId)
    .eq('is_code_id', isCodeId)
    .order('created_at', { ascending: false })
    .limit(100)
  if (error) throw error

  return (data ?? [])
    .map((raw) => {
      const r = raw as {
        id: string
        cm_l_digits: string | null
        project_kind: string | null
        title: string | null
      }
      return {
        id: String(r.id),
        cmLDigits: String(r.cm_l_digits ?? '').replace(/\D/g, ''),
        projectKind: (r.project_kind ?? '').trim(),
        title: (r.title ?? '').trim(),
      }
    })
    .filter((r) => r.projectKind.toLowerCase() !== 'application' && r.cmLDigits.length > 0)
}

export async function fetchEmployeeNames(): Promise<string[]> {
  const { data, error } = await supabase
    .from('user_profiles')
    .select('full_name')
    .not('full_name', 'is', null)
    .order('full_name', { ascending: true })
  if (error) throw error
  const names = (data ?? [])
    .map((r) => String((r as { full_name: string | null }).full_name ?? '').trim())
    .filter(Boolean)
  return [...new Set(names)]
}

export async function currentUserId(): Promise<string | null> {
  const { data } = await supabase.auth.getSession()
  return data.session?.user?.id ?? null
}
