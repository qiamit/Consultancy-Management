import { supabase } from '@/lib/supabaseClient'
import type { OptionItem } from './types'

export type LabMasterOptionCategory =
  | 'laboratory_type'
  | 'laboratory_scale'
  | 'designation'
  | 'department'
  | 'division'
  | 'state'
  | 'country'
  | 'country_code'
  | 'currency'
  | 'date_format'
  | 'time_format'

export const LAB_MASTER_OPTION_CATEGORIES: LabMasterOptionCategory[] = [
  'laboratory_type',
  'laboratory_scale',
  'designation',
  'department',
  'division',
  'state',
  'country',
  'country_code',
  'currency',
  'date_format',
  'time_format',
]

export const PROTECTED_DEPARTMENT_LABEL = 'Administration'

export function isProtectedDepartmentLabel(label: string): boolean {
  return label.trim().toLowerCase() === PROTECTED_DEPARTMENT_LABEL.toLowerCase()
}

export const PROTECTED_DIVISION_LABEL = 'Management'

export function isProtectedDivisionLabel(label: string): boolean {
  return label.trim().toLowerCase() === PROTECTED_DIVISION_LABEL.toLowerCase()
}

export const PROTECTED_DESIGNATION_LABEL = 'Laboratory Director'

export function isProtectedDesignationLabel(label: string): boolean {
  return label.trim().toLowerCase() === PROTECTED_DESIGNATION_LABEL.toLowerCase()
}

export const LAB_MASTER_OPTION_DEFAULTS: Record<LabMasterOptionCategory, OptionItem[]> = {
  laboratory_type: [
    { value: 'testing', label: 'Testing Laboratory' },
    { value: 'calibration', label: 'Calibration Laboratory' },
    { value: 'research', label: 'Research Laboratory' },
    { value: 'other', label: 'Other' },
  ],
  laboratory_scale: [
    { value: 'small', label: 'Small Scale' },
    { value: 'medium', label: 'Medium Scale' },
    { value: 'large', label: 'Large Scale' },
    { value: 'enterprise', label: 'Enterprise / Multi-location' },
  ],
  designation: [
    { value: 'lab-director', label: PROTECTED_DESIGNATION_LABEL },
    { value: 'quality-manager', label: 'Quality Manager' },
    { value: 'technical-manager', label: 'Technical Manager' },
    { value: 'testing-engineer', label: 'Testing Engineer' },
  ],
  department: [
    { value: 'administration', label: PROTECTED_DEPARTMENT_LABEL },
    { value: 'mechanical', label: 'Mechanical' },
    { value: 'chemical', label: 'Chemical' },
    { value: 'sample-cell', label: 'Sample Cell' },
    { value: 'quality-assurance', label: 'Quality Assurance' },
  ],
  division: [
    { value: 'management', label: PROTECTED_DIVISION_LABEL },
    { value: 'calibration-division', label: 'Calibration Division' },
    { value: 'testing-division', label: 'Testing Division' },
    { value: 'pt-division', label: 'PT Division' },
  ],
  state: [
    { value: 'chhattisgarh', label: 'Chhattisgarh' },
    { value: 'maharashtra', label: 'Maharashtra' },
    { value: 'telangana', label: 'Telangana' },
  ],
  country: [
    { value: 'india', label: 'India' },
    { value: 'nepal', label: 'Nepal' },
    { value: 'bhutan', label: 'Bhutan' },
  ],
  country_code: [
    { value: '+91', label: '+91 (IN)' },
    { value: '+977', label: '+977 (NP)' },
    { value: '+975', label: '+975 (BT)' },
  ],
  currency: [
    { value: 'inr', label: '₹ (INR) — Indian Rupee' },
    { value: 'usd', label: '$ (USD) — US Dollar' },
    { value: 'eur', label: '€ (EUR) — Euro' },
    { value: 'gbp', label: '£ (GBP) — British Pound' },
    { value: 'aed', label: 'د.إ (AED) — UAE Dirham' },
    { value: 'sar', label: '﷼ (SAR) — Saudi Riyal' },
    { value: 'jpy', label: '¥ (JPY) — Japanese Yen' },
    { value: 'cny', label: '¥ (CNY) — Chinese Yuan' },
    { value: 'aud', label: 'A$ (AUD) — Australian Dollar' },
    { value: 'cad', label: 'C$ (CAD) — Canadian Dollar' },
    { value: 'sgd', label: 'S$ (SGD) — Singapore Dollar' },
    { value: 'chf', label: 'CHF — Swiss Franc' },
  ],
  date_format: [
    { value: 'dd-mmm-yy', label: 'DD-Mmm-YY' },
    { value: 'dd-mmm-yyyy', label: 'DD-Mmm-YYYY' },
    { value: 'dd/mm/yyyy', label: 'DD/MM/YYYY' },
    { value: 'dd-mm-yyyy', label: 'DD-MM-YYYY' },
    { value: 'dd.mm.yyyy', label: 'DD.MM.YYYY' },
    { value: 'mm/dd/yyyy', label: 'MM/DD/YYYY' },
    { value: 'mm-dd-yyyy', label: 'MM-DD-YYYY' },
    { value: 'yyyy-mm-dd', label: 'YYYY-MM-DD' },
    { value: 'yyyy/mm/dd', label: 'YYYY/MM/DD' },
    { value: 'mmm dd, yyyy', label: 'Mmm DD, YYYY' },
  ],
  time_format: [
    { value: '24h', label: '24 Hour (HH:MM)' },
    { value: '12h', label: '12 Hour (hh:MM AM/PM)' },
  ],
}

export function emptyOptionsByCategory(): Record<LabMasterOptionCategory, OptionItem[]> {
  return {
    laboratory_type: [],
    laboratory_scale: [],
    designation: [],
    department: [],
    division: [],
    state: [],
    country: [],
    country_code: [],
    currency: [],
    date_format: [],
    time_format: [],
  }
}

export function slugifyLabOptionValue(label: string, fallbackPrefix: string): string {
  const slug = label
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9+-]+/g, '')
    .replace(/^-+|-+$/g, '')
  return slug || `${fallbackPrefix}-${Date.now()}`
}

function sortOptions(items: OptionItem[]): OptionItem[] {
  return [...items].sort((a, b) => a.label.localeCompare(b.label))
}

export async function fetchLabMasterOptionsGrouped(): Promise<Record<LabMasterOptionCategory, OptionItem[]>> {
  const grouped = emptyOptionsByCategory()

  const { data, error } = await supabase
    .from('lab_master_options')
    .select('category, label, value')
    .order('label', { ascending: true })

  if (error) throw error

  for (const row of data ?? []) {
    const category = String((row as { category?: unknown }).category ?? '') as LabMasterOptionCategory
    if (!LAB_MASTER_OPTION_CATEGORIES.includes(category)) continue
    const value = String((row as { value?: unknown }).value ?? '').trim()
    const label = String((row as { label?: unknown }).label ?? '').trim()
    if (!value || !label) continue
    if (grouped[category].some((o) => o.value === value)) continue
    grouped[category].push({ value, label })
  }

  for (const category of LAB_MASTER_OPTION_CATEGORIES) {
    if (grouped[category].length === 0) {
      grouped[category] = [...LAB_MASTER_OPTION_DEFAULTS[category]]
    } else {
      grouped[category] = sortOptions(grouped[category])
    }
  }

  return grouped
}

export async function insertLabMasterOption(
  category: LabMasterOptionCategory,
  label: string,
  value: string,
): Promise<void> {
  const { error } = await supabase.from('lab_master_options').insert({
    category,
    label: label.trim(),
    value: value.trim(),
  })
  if (error) throw error
}

export async function deleteLabMasterOption(
  category: LabMasterOptionCategory,
  value: string,
): Promise<void> {
  const { error } = await supabase
    .from('lab_master_options')
    .delete()
    .eq('category', category)
    .eq('value', value)
  if (error) throw error
}

/** Update label (and value when provided). Keeps value stable when newValue omitted. */
export async function updateLabMasterOption(
  category: LabMasterOptionCategory,
  oldValue: string,
  label: string,
  newValue?: string,
): Promise<void> {
  const payload: { label: string; value?: string } = { label: label.trim() }
  if (newValue !== undefined) {
    payload.value = newValue.trim()
  }
  const { error } = await supabase
    .from('lab_master_options')
    .update(payload)
    .eq('category', category)
    .eq('value', oldValue)
  if (error) throw error
}

/** Insert designation/department/division label if not already in lab_master_options */
export async function ensureLabMasterOptionByLabel(
  category: 'designation' | 'department' | 'division',
  label: string,
): Promise<void> {
  const trimmed = label.trim()
  if (!trimmed) return

  const { data, error } = await supabase
    .from('lab_master_options')
    .select('id, label, value')
    .eq('category', category)

  if (error) throw error

  const rows = Array.isArray(data) ? data : []
  const exists = rows.some(
    (r) => String((r as { label?: unknown }).label ?? '').trim().toLowerCase() === trimmed.toLowerCase(),
  )
  if (exists) return

  const value = slugifyLabOptionValue(trimmed, category)
  await insertLabMasterOption(category, trimmed, value)
}

export async function fetchDesignationAndDepartmentLabels(): Promise<{
  designations: string[]
  departments: string[]
  divisions: string[]
}> {
  const grouped = await fetchLabMasterOptionsGrouped()
  return {
    designations: grouped.designation.map((o) => o.label),
    departments: grouped.department.map((o) => o.label),
    divisions: grouped.division.map((o) => o.label),
  }
}
