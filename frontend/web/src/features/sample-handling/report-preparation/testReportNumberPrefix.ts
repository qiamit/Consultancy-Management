import { supabase } from '@/lib/supabaseClient'

import { stripReportScopeSuffix } from './reportScope'

/** Fallback when no Test Report prefix is configured in Lab Settings → Prefix's */
export const DEFAULT_TEST_REPORT_PREFIX = 'QI/TR'

/** Preferred prefix names in Lab Settings (Prefix's tab), checked in order */
export const TEST_REPORT_PREFIX_SETTING_NAMES = ['Report Number', 'Test Report', 'TR'] as const

export type PrefixRow = { name: string; prefix: string }

function normalizePrefixName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ')
}

/** Resolve Test Report prefix from lab_prefixes rows (Lab Settings → Prefix's). */
export function pickTestReportPrefixFromRows(rows: PrefixRow[]): string | null {
  const valid = rows
    .map((r) => ({ name: String(r.name ?? '').trim(), prefix: String(r.prefix ?? '').trim() }))
    .filter((r) => r.name && r.prefix)

  if (valid.length === 0) return null

  const byName = new Map(valid.map((r) => [normalizePrefixName(r.name), r.prefix]))

  for (const settingName of TEST_REPORT_PREFIX_SETTING_NAMES) {
    const hit = byName.get(normalizePrefixName(settingName))
    if (hit) return hit
  }

  const reportNumber = valid.find((r) => {
    const n = normalizePrefixName(r.name)
    return n.includes('report') && n.includes('number')
  })
  if (reportNumber) return reportNumber.prefix

  const fuzzy = valid.find((r) => {
    const n = normalizePrefixName(r.name)
    if (n === 'tr') return true
    return n.includes('test') && n.includes('report')
  })
  if (fuzzy) return fuzzy.prefix

  return null
}

export async function fetchTestReportPrefix(): Promise<string> {
  const { data, error } = await supabase
    .from('lab_prefixes')
    .select('name, prefix')
    .order('name', { ascending: true })

  if (error) {
    console.warn('[fetchTestReportPrefix]', error.message)
    return DEFAULT_TEST_REPORT_PREFIX
  }

  const picked = pickTestReportPrefixFromRows((Array.isArray(data) ? data : []) as PrefixRow[])
  return picked ?? DEFAULT_TEST_REPORT_PREFIX
}

export function joinTestReportNumber(prefix: string, suffix: string): string {
  const p = prefix.trim()
  const s = suffix.trim()
  if (!s) return ''
  if (!p) return s
  if (p.endsWith('/') || s.startsWith('/')) return `${p}${s}`
  return `${p}/${s}`
}

export function splitTestReportNumber(full: string | null | undefined, prefix: string): string {
  const value = stripReportScopeSuffix((full ?? '').trim())
  const p = prefix.trim()
  if (!value) return ''
  if (p && value.startsWith(p)) {
    return value.slice(p.length).replace(/^\//, '')
  }
  const slashIdx = value.indexOf('/')
  if (slashIdx > 0 && !p) {
    return value.slice(slashIdx + 1)
  }
  return value
}
