/**
 * Full-access roles for Consultancy Pro (settings, user management, module access).
 * Matches designations stored in user_profiles.
 */
export function isLaboratoryDirector(designation: string | null | undefined): boolean {
  const d = designation?.trim().toLowerCase() ?? ''
  return (
    d === 'laboratory director' ||
    d === 'admin' ||
    d === 'administrator' ||
    d === 'director' ||
    d === 'super admin' ||
    d === 'managing director'
  )
}

/** Alias kept for shared footer/delete helpers copied from LIMS. */
export function canDeleteSampleHandlingRecords(designation: string | null | undefined): boolean {
  return isLaboratoryDirector(designation)
}
