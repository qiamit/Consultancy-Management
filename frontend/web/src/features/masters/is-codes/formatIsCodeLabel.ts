/** Canonical IS Code display: `IS 10773: 2025` (no space before colon). */

function asText(value: unknown): string {
  if (value == null) return ''
  return String(value).trim()
}

export function formatIsCodeLabelFromParts(
  isNumber?: string | number | null,
  revisionYear?: string | number | null,
): string {
  const num = asText(isNumber)
  if (!num) return ''
  const rev = asText(revisionYear)
  return rev ? `${num}: ${rev}` : num
}

export function formatIsCodeLabel(row: {
  is_number?: string | number | null
  revision_year?: string | number | null
}): string {
  return formatIsCodeLabelFromParts(row.is_number, row.revision_year)
}

/** Normalize legacy labels like `IS 10773 : 2025` → `IS 10773: 2025`. */
export function normalizeIsCodeLabel(label: string | number | null | undefined): string {
  const s = asText(label)
  if (!s) return ''
  return s.replace(/\s*:\s*/g, ': ')
}

/**
 * Ensure Test Method shows revision year when linked IS Code has one
 * (e.g. stored `IS 277` + code `IS 277: 2018` → `IS 277: 2018`).
 */
export function formatTestMethodWithYear(
  testMethod: string | number | null | undefined,
  isCodeWithYear?: string | number | null,
): string {
  const method = normalizeIsCodeLabel(testMethod)
  if (!method) return ''
  if (/:\s*\d{4}\b/.test(method)) return method

  const code = normalizeIsCodeLabel(isCodeWithYear)
  if (!code) return method
  const yearMatch = code.match(/:\s*(\d{4})\b/)
  if (!yearMatch) return method

  const methodBase = method.split(':')[0].trim().toLowerCase()
  const codeBase = code.split(':')[0].trim().toLowerCase()
  if (methodBase !== codeBase) return method

  return `${method.split(':')[0].trim()}: ${yearMatch[1]}`
}
