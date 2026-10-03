import { isLaboratoryDirector } from '@/lib/isLaboratoryDirector'
import {
  canAccessPath as legacyCanAccessPath,
  canAccessNavItem as legacyCanAccessNavItem,
  isPublicSupportPath,
  type UserAccessContext,
} from '@/lib/moduleAccess'
import {
  MODULE_CATALOG,
  normalizeAccessKey,
  resolveLevelFromSubjectRules,
  type ModuleAccessLevel,
  type ModuleAccessSubjectType,
} from './moduleCatalog'
import type { ModuleAccessRuleRow } from './moduleAccessApi'

export type ModuleAccessUserContext = UserAccessContext & {
  userId?: string | null
  division?: string
}

const SUBJECT_PRIORITY: ModuleAccessSubjectType[] = [
  'user',
  'designation',
  'department',
  'division',
]

function pathToModuleKey(pathname: string): string | null {
  const path = pathname.replace(/\/+$/, '') || '/'
  if (path === '/') return '/'

  // Prefer longest matching catalog key (covers nested result-validation routes).
  let best: string | null = null
  for (const entry of MODULE_CATALOG) {
    if (entry.key === '/') continue
    if (path === entry.key || path.startsWith(`${entry.key}/`)) {
      if (!best || entry.key.length > best.length) best = entry.key
    }
  }
  return best
}

function subjectKeyFor(
  type: ModuleAccessSubjectType,
  ctx: ModuleAccessUserContext,
): string {
  if (type === 'user') return (ctx.userId ?? '').trim()
  if (type === 'designation') return normalizeAccessKey(ctx.designation)
  if (type === 'department') return normalizeAccessKey(ctx.departmentName)
  return normalizeAccessKey(ctx.division)
}

/**
 * Resolve access from configurable rules.
 * Priority: user → designation → department → division.
 *
 * When a subject has any saved matrix rows, missing module keys are treated as
 * explicit None (UI "None" deletes grant rows — must not fall back to legacy allowlists).
 * Returns null only when no subject-level matrix applies (caller uses legacy logic).
 */
export function resolveConfiguredAccessLevel(
  pathname: string,
  ctx: ModuleAccessUserContext,
  rules: ModuleAccessRuleRow[],
): ModuleAccessLevel | null {
  if (isLaboratoryDirector(ctx.designation)) return 'edit'
  if (!rules.length) return null

  const moduleKey = pathToModuleKey(pathname)
  if (!moduleKey) return null

  for (const type of SUBJECT_PRIORITY) {
    const key = subjectKeyFor(type, ctx)
    if (!key) continue

    const subjectRules = rules.filter(
      (r) =>
        r.subject_type === type &&
        (type === 'user'
          ? r.subject_key === key
          : normalizeAccessKey(r.subject_key) === key),
    )
    if (subjectRules.length === 0) continue

    const matched = resolveLevelFromSubjectRules(pathname, subjectRules)
    if (matched !== undefined) return matched
    // Dashboard stays reachable when a matrix exists but `/` was not saved.
    if ((pathname.replace(/\/+$/, '') || '/') === '/') return 'view'
    return 'none'
  }

  return null
}

const CAPA_HUB_PATH = '/nonconforming-work/corrective-action'
const AUDIT_NC_PATH = '/audit-mrm/non-conformities'
const CUSTOMER_FEEDBACK_PATH = '/complaints/customer-feedback'
const FEEDBACK_EVALUATION_PATH = '/complaints/feedback-evaluation'

function accessLevelRank(level: ModuleAccessLevel): number {
  if (level === 'edit') return 2
  if (level === 'view') return 1
  return 0
}

function maxAccessLevel(a: ModuleAccessLevel, b: ModuleAccessLevel): ModuleAccessLevel {
  return accessLevelRank(a) >= accessLevelRank(b) ? a : b
}

function resolveSinglePathAccessLevel(
  pathname: string,
  ctx: ModuleAccessUserContext,
  rules: ModuleAccessRuleRow[],
): ModuleAccessLevel {
  const configured = resolveConfiguredAccessLevel(pathname, ctx, rules)
  if (configured !== null) return configured
  return legacyCanAccessPath(pathname, ctx) ? 'edit' : 'none'
}

export function resolveModuleAccessLevel(
  pathname: string,
  ctx: ModuleAccessUserContext,
  rules: ModuleAccessRuleRow[],
): ModuleAccessLevel {
  if (isLaboratoryDirector(ctx.designation)) return 'edit'
  if (isPublicSupportPath(pathname)) return 'view'

  const path = pathname.replace(/\/+$/, '') || '/'
  // Unified CAPA hub: allow if either NCW Corrective Action or Audit Non Conformities is granted.
  if (path === CAPA_HUB_PATH || path.startsWith(`${CAPA_HUB_PATH}/`)) {
    return maxAccessLevel(
      resolveSinglePathAccessLevel(CAPA_HUB_PATH, ctx, rules),
      resolveSinglePathAccessLevel(AUDIT_NC_PATH, ctx, rules),
    )
  }

  // Feedback Evaluation: also honor legacy combined Customer Feedback grant after the split.
  if (path === FEEDBACK_EVALUATION_PATH || path.startsWith(`${FEEDBACK_EVALUATION_PATH}/`)) {
    return maxAccessLevel(
      resolveSinglePathAccessLevel(FEEDBACK_EVALUATION_PATH, ctx, rules),
      resolveSinglePathAccessLevel(CUSTOMER_FEEDBACK_PATH, ctx, rules),
    )
  }

  return resolveSinglePathAccessLevel(pathname, ctx, rules)
}

export function canAccessPathWithRules(
  pathname: string,
  ctx: ModuleAccessUserContext,
  rules: ModuleAccessRuleRow[],
): boolean {
  return resolveModuleAccessLevel(pathname, ctx, rules) !== 'none'
}

export function canEditPathWithRules(
  pathname: string,
  ctx: ModuleAccessUserContext,
  rules: ModuleAccessRuleRow[],
): boolean {
  return resolveModuleAccessLevel(pathname, ctx, rules) === 'edit'
}

export function canAccessNavItemWithRules(
  requiredDesignations: string[] | undefined,
  to: string | undefined,
  ctx: ModuleAccessUserContext,
  rules: ModuleAccessRuleRow[],
): boolean {
  if (!to) return false
  if (isLaboratoryDirector(ctx.designation)) return true
  if (isPublicSupportPath(to)) return true

  const configured = resolveConfiguredAccessLevel(to, ctx, rules)
  if (configured !== null) return configured !== 'none'

  return legacyCanAccessNavItem(requiredDesignations, to, ctx)
}
