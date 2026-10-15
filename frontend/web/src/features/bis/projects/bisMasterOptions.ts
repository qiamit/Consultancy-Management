import { supabase } from '@/lib/supabaseClient'
import { slugifyLabOptionValue } from '@/features/settings/lab-settings/labMasterOptions'
import { normalizeIsUnitLabel } from '@/features/masters/is-codes/unitLabels'

export type BisMasterOptionCategory =
  | 'state'
  | 'designation'
  | 'education'
  | 'experience'
  | 'bis_branch_name'
  /** Shared list for Branch Head / Inspection / Dealing Officer Name. */
  | 'bis_officer_name'
  | 'bis_branch_head_name'
  | 'bis_inspection_officer_name'
  | 'bis_dealing_officer_name'
  | 'bis_type_of_inspection'
  | 'unit_of_is'
  | 'osl_sample_for'
  | 'osl_sample_priority'
  | 'osl_sample_type'
  | 'osl_sample_shelf_life'
  | 'osl_sample_mode_of_disposal'
  | 'osl_sample_test_required'

/** Legacy name categories are merged into one shared officer-name list. */
const OFFICER_NAME_CATEGORIES: BisMasterOptionCategory[] = [
  'bis_officer_name',
  'bis_branch_head_name',
  'bis_inspection_officer_name',
  'bis_dealing_officer_name',
]

function isOfficerNameCategory(category: BisMasterOptionCategory): boolean {
  return OFFICER_NAME_CATEGORIES.includes(category)
}

function fetchCategoriesFor(category: BisMasterOptionCategory): BisMasterOptionCategory[] {
  return isOfficerNameCategory(category) ? OFFICER_NAME_CATEGORIES : [category]
}

function writeCategoryFor(category: BisMasterOptionCategory): BisMasterOptionCategory {
  return isOfficerNameCategory(category) ? 'bis_officer_name' : category
}

export type BisMasterOption = { value: string; label: string }

/** No built-in suggestions — dropdown shows only + button values. */
export function isBuiltinBisMasterOption(
  _category: BisMasterOptionCategory,
  _labelOrValue: string,
): boolean {
  void _category
  void _labelOrValue
  return false
}

function sortMasterOptions(dbRows: BisMasterOption[]): BisMasterOption[] {
  const byKey = new Map<string, BisMasterOption>()
  for (const opt of dbRows) {
    byKey.set(opt.label.toLowerCase(), opt)
  }
  return [...byKey.values()].sort((a, b) =>
    a.label.localeCompare(b.label, 'en', { sensitivity: 'base' }),
  )
}

type MasterOptionsListener = (
  category: BisMasterOptionCategory,
  options: BisMasterOption[],
) => void

const masterOptionListeners = new Set<MasterOptionsListener>()
const masterOptionsCache = new Map<BisMasterOptionCategory, BisMasterOption[]>()

/** Same category fields (e.g. all Designation) share one option list. */
export function subscribeBisMasterOptions(listener: MasterOptionsListener): () => void {
  masterOptionListeners.add(listener)
  return () => {
    masterOptionListeners.delete(listener)
  }
}

function publishBisMasterOptions(
  category: BisMasterOptionCategory,
  options: BisMasterOption[],
): void {
  masterOptionsCache.set(category, options)
  for (const listener of masterOptionListeners) {
    listener(category, options)
  }
}

export function getCachedBisMasterOptions(
  category: BisMasterOptionCategory,
): BisMasterOption[] | null {
  return masterOptionsCache.get(category) ?? null
}

export async function fetchBisMasterOptions(
  category: BisMasterOptionCategory,
): Promise<BisMasterOption[]> {
  if (category === 'unit_of_is') {
    const { data, error } = await supabase
      .from('is_code_master_options')
      .select('id, label')
      .eq('category', 'unit_of_is')
      .order('label', { ascending: true })
    if (error) throw error
    const rows = (Array.isArray(data) ? data : []).map((row) => ({
      value: String((row as { id?: unknown }).id ?? '').trim(),
      label: String((row as { label?: unknown }).label ?? '').trim(),
    }))
    return sortMasterOptions(rows.filter((row) => row.value && row.label))
  }
  const categories = fetchCategoriesFor(category)
  let query = supabase.from('lab_master_options').select('label, value').order('label', {
    ascending: true,
  })
  query =
    categories.length === 1
      ? query.eq('category', categories[0]!)
      : query.in('category', categories)
  const { data, error } = await query
  if (error) throw error
  const rows = (Array.isArray(data) ? data : []).map((row) => ({
    value: String((row as { value?: unknown }).value ?? '').trim(),
    label: String((row as { label?: unknown }).label ?? '').trim(),
  }))
  return sortMasterOptions(rows.filter((r) => r.value && r.label))
}

/** Fetch + push the shared list to every linked field of this category. */
export async function refreshBisMasterOptions(
  category: BisMasterOptionCategory,
): Promise<BisMasterOption[]> {
  const options = await fetchBisMasterOptions(category)
  // Officer-name fields all subscribe as bis_officer_name — publish once there.
  // Also publish under the requested category so any legacy subscriber still updates.
  const publishTo = new Set<BisMasterOptionCategory>([writeCategoryFor(category), category])
  for (const key of publishTo) {
    publishBisMasterOptions(key, options)
  }
  return options
}

export async function ensureBisMasterOption(
  category: BisMasterOptionCategory,
  label: string,
): Promise<void> {
  const trimmed = category === 'unit_of_is' ? normalizeIsUnitLabel(label) : label.trim()
  if (!trimmed) return
  if (category === 'unit_of_is') {
    const existing = await fetchBisMasterOptions(category)
    if (existing.some((option) => option.label.toLowerCase() === trimmed.toLowerCase())) return
    const { error } = await supabase
      .from('is_code_master_options')
      .insert({ category, label: trimmed, value: trimmed })
    if (error) throw error
    return
  }
  const writeCategory = writeCategoryFor(category)
  const existing = await fetchBisMasterOptions(writeCategory)
  if (existing.some((o) => o.label.toLowerCase() === trimmed.toLowerCase())) return
  const value = slugifyLabOptionValue(trimmed, writeCategory)
  const { error } = await supabase.from('lab_master_options').insert({
    category: writeCategory,
    label: trimmed,
    value,
  })
  if (error) throw error
}

export async function updateBisMasterOption(
  category: BisMasterOptionCategory,
  oldValue: string,
  label: string,
): Promise<void> {
  const trimmed = category === 'unit_of_is' ? normalizeIsUnitLabel(label) : label.trim()
  if (!trimmed) return
  if (category === 'unit_of_is') {
    const { error } = await supabase
      .from('is_code_master_options')
      .update({ label: trimmed, value: trimmed })
      .eq('id', oldValue)
    if (error) throw error
    return
  }
  const categories = fetchCategoriesFor(category)
  const writeCategory = writeCategoryFor(category)
  const { data, error } = await supabase
    .from('lab_master_options')
    .update({ label: trimmed })
    .in('category', categories)
    .eq('value', oldValue)
    .select('id')
  if (error) throw error
  // Built-in / missing row: persist rename as a new shared option.
  if (!Array.isArray(data) || data.length === 0) {
    const value = slugifyLabOptionValue(trimmed, writeCategory)
    const { error: insertError } = await supabase.from('lab_master_options').insert({
      category: writeCategory,
      label: trimmed,
      value,
    })
    if (insertError) throw insertError
  }
}

export async function deleteBisMasterOption(
  category: BisMasterOptionCategory,
  value: string,
): Promise<void> {
  if (category === 'unit_of_is') {
    const { error } = await supabase
      .from('is_code_master_options')
      .delete()
      .eq('id', value)
    if (error) throw error
    return
  }
  const categories = fetchCategoriesFor(category)
  const { error } = await supabase
    .from('lab_master_options')
    .delete()
    .in('category', categories)
    .eq('value', value)
  if (error) throw error
}
