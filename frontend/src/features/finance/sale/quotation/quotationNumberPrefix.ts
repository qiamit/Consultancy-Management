import { supabase } from '@/lib/supabaseClient'

/** Fallback when no Quotation prefix is configured in Lab Settings → Prefix's */
export function defaultQuotationPrefix(year = new Date().getFullYear()): string {
  return `QTN-${year}-`
}

/** Preferred prefix names in Lab Settings (Prefix's tab), checked in order */
export const QUOTATION_PREFIX_SETTING_NAMES = [
  'Quotation Number',
  'Quotation',
  'QTN',
] as const

export type PrefixRow = { name: string; prefix: string }

function normalizePrefixName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ')
}

/** Resolve Quotation prefix from lab_prefixes rows (Lab Settings → Prefix's). */
export function pickQuotationPrefixFromRows(rows: PrefixRow[]): string | null {
  const valid = rows
    .map((r) => ({ name: String(r.name ?? '').trim(), prefix: String(r.prefix ?? '').trim() }))
    .filter((r) => r.name && r.prefix)

  if (valid.length === 0) return null

  const byName = new Map(valid.map((r) => [normalizePrefixName(r.name), r.prefix]))

  for (const settingName of QUOTATION_PREFIX_SETTING_NAMES) {
    const hit = byName.get(normalizePrefixName(settingName))
    if (hit) return hit
  }

  const fuzzy = valid.find((r) => {
    const n = normalizePrefixName(r.name)
    return n.includes('quotation')
  })
  return fuzzy?.prefix ?? null
}

export async function fetchQuotationPrefix(): Promise<string> {
  const { data, error } = await supabase
    .from('lab_prefixes')
    .select('name, prefix')
    .order('name', { ascending: true })

  if (error) {
    console.warn('[fetchQuotationPrefix]', error.message)
    return defaultQuotationPrefix()
  }

  const picked = pickQuotationPrefixFromRows((Array.isArray(data) ? data : []) as PrefixRow[])
  return picked ?? defaultQuotationPrefix()
}
