/**
 * Full-access (admin) check for Consultancy Pro: settings, user management, module access.
 * Only the Access role grants admin (decision #45). Designation is a job title only.
 * Matches public.app_is_admin() in the database.
 */
export function isLaboratoryDirector(role: string | null | undefined): boolean {
  return String(role ?? '').trim().toLowerCase() === 'admin'
}

/** Alias kept for shared footer/delete helpers copied from LIMS. */
export function canDeleteSampleHandlingRecords(role: string | null | undefined): boolean {
  return isLaboratoryDirector(role)
}
