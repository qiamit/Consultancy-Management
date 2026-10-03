/** Sidebar / route modules that Laboratory Director can assign permissions to. */

import { flattenNavModules } from '@/lib/appNav'

export type ModuleAccessLevel = 'none' | 'view' | 'edit'

export type ModuleAccessSubjectType = 'division' | 'department' | 'designation' | 'user'

export type ModuleCatalogEntry = {
  key: string
  label: string
  section: string
}

export const MODULE_ACCESS_LEVELS: { value: ModuleAccessLevel; label: string }[] = [
  { value: 'none', label: 'None' },
  { value: 'view', label: 'View' },
  { value: 'edit', label: 'Edit' },
]

/** Flattened catalog — always follows the current sidebar tree in `appNav.ts`. */
export const MODULE_CATALOG: ModuleCatalogEntry[] = [
  { key: '/', label: 'Dashboard', section: 'General' },
  ...flattenNavModules(),
]

export function moduleSections(): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const m of MODULE_CATALOG) {
    if (seen.has(m.section)) continue
    seen.add(m.section)
    out.push(m.section)
  }
  return out
}

export function normalizeAccessKey(value: string | null | undefined): string {
  return value?.trim().toLowerCase() ?? ''
}

export function moduleKeyMatchesPath(moduleKey: string, pathname: string): boolean {
  const key = moduleKey.replace(/\/+$/, '') || '/'
  const path = pathname.replace(/\/+$/, '') || '/'
  if (key === '/') return path === '/'
  return path === key || path.startsWith(`${key}/`)
}

/** Longest matching grant wins (child override, otherwise parent). */
export function resolveLevelFromSubjectRules(
  pathname: string,
  rules: Array<{ module_key: string; access_level: ModuleAccessLevel }>,
): ModuleAccessLevel | undefined {
  let best: { len: number; level: ModuleAccessLevel } | null = null
  for (const row of rules) {
    if (!moduleKeyMatchesPath(row.module_key, pathname)) continue
    const len = (row.module_key.replace(/\/+$/, '') || '/').length
    if (!best || len > best.len) best = { len, level: row.access_level }
  }
  return best?.level
}
