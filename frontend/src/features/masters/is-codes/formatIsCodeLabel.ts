/** Canonical IS Code display: `IS 10773: 2025` (no space before colon). */

export function formatIsCodeLabelFromParts(
  isNumber?: string | null,
  revisionYear?: string | null,
): string {
  const num = (isNumber ?? '').trim()
  if (!num) return ''
  const rev = (revisionYear ?? '').trim()
  return rev ? `${num}: ${rev}` : num
}

export function formatIsCodeLabel(row: {
  is_number?: string | null
  revision_year?: string | null
}): string {
  return formatIsCodeLabelFromParts(row.is_number, row.revision_year)
}

/** Normalize legacy labels like `IS 10773 : 2025` → `IS 10773: 2025`. */
export function normalizeIsCodeLabel(label: string | null | undefined): string {
  const s = (label ?? '').trim()
  if (!s) return ''
  return s.replace(/\s*:\s*/g, ': ')
}
