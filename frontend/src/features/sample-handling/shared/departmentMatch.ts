/** Normalize lab / allocation department labels for comparison. */
export function normalizeDepartmentName(value: string | null | undefined): string {
  return (value ?? '').trim().toLowerCase()
}

/** True when sample allocation department matches the logged-in user's department. */
export function departmentsMatch(
  allocationDepartment: string | null | undefined,
  userDepartment: string | null | undefined,
): boolean {
  const alloc = normalizeDepartmentName(allocationDepartment)
  const user = normalizeDepartmentName(userDepartment)
  if (!user) return false
  if (!alloc) return false
  return alloc === user
}

/** True when sample allocation designation matches the logged-in user's designation. */
export function designationsMatch(
  allocationDesignation: string | null | undefined,
  userDesignation: string | null | undefined,
): boolean {
  const alloc = normalizeDepartmentName(allocationDesignation)
  const user = normalizeDepartmentName(userDesignation)
  if (!user) return false
  if (!alloc) return false
  return alloc === user
}
