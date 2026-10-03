/** Combined sample description and declared value for section-level table cells. */
export function formatSampleDescAndDeclared(
  desc: string | null | undefined,
  declared: string | null | undefined,
): string {
  const description = desc?.trim() ?? ''
  const declaredValue = declared?.trim() ?? ''
  if (description && declaredValue) return `${description}, ${declaredValue}`
  if (description) return description
  if (declaredValue) return declaredValue
  return '—'
}
