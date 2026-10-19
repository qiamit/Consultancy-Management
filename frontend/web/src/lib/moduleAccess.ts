import { isLaboratoryDirector } from '@/lib/isLaboratoryDirector'

export interface UserAccessContext {
  designation: string
  departmentName: string
  role?: string | null
}

const PUBLIC_SUPPORT_PATHS = ['/help', '/contact'] as const

export function isPublicSupportPath(pathname: string | undefined): boolean {
  if (!pathname) return false
  const path = pathname.replace(/\/+$/, '') || '/'
  return (PUBLIC_SUPPORT_PATHS as readonly string[]).some(
    (p) => path === p || path.startsWith(`${p}/`),
  )
}

/**
 * Fallback when no Module Access rows apply (decision #44): admins get everything,
 * everyone else only the Dashboard and Help / Contact. Matches public.app_module_level().
 */
export function canAccessPath(
  path: string,
  ctx: UserAccessContext | null | undefined,
): boolean {
  if (!ctx) return false
  if (isLaboratoryDirector(ctx.role)) return true
  if (isPublicSupportPath(path)) return true
  return (path.replace(/\/+$/, '') || '/') === '/'
}

/** Signature matches LIMS GlobalLayout / ModuleAccessProvider. */
export function canAccessNavItem(
  requiredDesignations: string[] | undefined,
  to: string | undefined,
  ctx: UserAccessContext | null | undefined,
): boolean {
  if (!to) return false
  if (!ctx) return false
  if (requiredDesignations?.length) {
    const d = String(ctx.designation ?? '')
      .trim()
      .toLowerCase()
    const allowed = requiredDesignations.some(
      (x) =>
        String(x ?? '')
          .trim()
          .toLowerCase() === d,
    )
    if (!allowed && !isLaboratoryDirector(ctx.role)) return false
  }
  return canAccessPath(to, ctx)
}

// Keep legacy helpers used by older LIMS-copied screens (always false for consultancy staff roles).
export function isSampleCellReceptionist(_ctx?: UserAccessContext | null) {
  return false
}
export function isSampleCellSampleIncharge(_ctx?: UserAccessContext | null) {
  return false
}
export function isMechanicalTechnicalManager(_ctx?: UserAccessContext | null) {
  return false
}
export function isChemicalTechnicalManager(_ctx?: UserAccessContext | null) {
  return false
}
export function isMechanicalTestingEngineer(_ctx?: UserAccessContext | null) {
  return false
}
export function isChemicalTestingEngineer(_ctx?: UserAccessContext | null) {
  return false
}
export function isQualityAssuranceQualityManager(_ctx?: UserAccessContext | null) {
  return false
}

export function canAccessSampleReceiving(_ctx?: UserAccessContext | null) {
  return true
}
export function canAccessSampleAllocation(_ctx?: UserAccessContext | null) {
  return true
}
export function canAccessTestAllocation(_ctx?: UserAccessContext | null) {
  return true
}
