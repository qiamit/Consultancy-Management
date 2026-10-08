/** Prefer section override on test_allocation_parameters; fall back to Test Parameter master. */
export function resolveSectionSpecificRequirement(
  sectionOverride: string | null | undefined,
  masterValue: string | null | undefined,
): string | null {
  const section = sectionOverride?.trim()
  if (section) return section
  const master = masterValue?.trim()
  return master || null
}
