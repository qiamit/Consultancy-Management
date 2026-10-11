/** Canonical IS Code display: `IS 10773: 2025`, or `IS 10773 (Part 2/Sec 2): 2025`. */

function asText(value: unknown): string {
  if (value == null) return ''
  return String(value).trim()
}

/** "Part-2" / "2" → "Part 2". "Part-0", "0", and blank stay empty. */
function partOrSectionPiece(kind: 'Part' | 'Sec', raw: unknown): string | null {
  const text = asText(raw)
  if (!text) return null
  const rest = text.replace(/^(part|sec)[-\s]*/i, '').trim()
  if (!rest || /^0+$/.test(rest)) return null
  return `${kind} ${rest}`
}

function partSectionClause(partNo: unknown, sectionNo: unknown): string {
  const part = partOrSectionPiece('Part', partNo)
  const section = partOrSectionPiece('Sec', sectionNo)
  if (part && section) return `(${part}/${section})`
  return part || section ? `(${part || section})` : ''
}

function prefixAndNumber(isNumber: string, standardPrefix?: string | null): string {
  const stored = asText(isNumber)
  const explicit = asText(standardPrefix)
  const match = stored.match(/^(IS\/ISO\/IEC|IS\/ISO|IS\/IEC|IS)\s+(.*)$/i)
  const number = match ? match[2].trim() : stored.replace(/^(IS\/ISO\/IEC|IS\/ISO|IS\/IEC|IS)\s*/i, '').trim()
  const prefix = explicit || (match ? match[1] : '') || (number ? 'IS' : '')
  const digits = number || stored
  if (!prefix) return digits
  if (!digits) return prefix
  const escaped = prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  if (new RegExp(`^${escaped}\\b`, 'i').test(digits)) return digits
  return `${prefix} ${digits}`
}

export function formatIsCodeLabelFromParts(
  isNumber?: string | number | null,
  revisionYear?: string | number | null,
  partNo?: string | number | null,
  sectionNo?: string | number | null,
  standardPrefix?: string | null,
): string {
  const headBase = prefixAndNumber(asText(isNumber), standardPrefix)
  if (!headBase) return ''
  const clause = partSectionClause(partNo, sectionNo)
  const head = clause ? `${headBase} ${clause}` : headBase
  const rev = asText(revisionYear)
  return rev ? `${head}: ${rev}` : head
}

export function formatIsCodeLabel(row: {
  is_number?: string | number | null
  revision_year?: string | number | null
  part_no?: string | number | null
  section_no?: string | number | null
  standard_prefix?: string | null
}): string {
  return formatIsCodeLabelFromParts(
    row.is_number,
    row.revision_year,
    row.part_no,
    row.section_no,
    row.standard_prefix,
  )
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
