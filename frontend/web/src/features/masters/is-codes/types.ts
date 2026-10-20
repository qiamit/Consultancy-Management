export type IsAspect = string

export const IS_CODE_UNITS = [
  'Tonne',
  'Pcs',
  'Nos',
  'Kilo Litre',
  'Litre',
  'Kg',
] as const

export const DEFAULT_IS_CODE_UNIT = IS_CODE_UNITS[0]
export const DEFAULT_SLAB_1_QTY = 'All Quantities'
export const DEFAULT_SLAB_2_QTY = 'N/A'
export const DEFAULT_SLAB_3_QTY = 'N/A'
export const DEFAULT_MONEY_FIELD = '0.00'

export type IsCodeRow = {
  id: string
  is_number: string
  revision_year: string | number | null
  reaffirmation_year: string | number | null
  amendment_number: string | null
  title: string
  aspect: IsAspect
  testing_charges: number | null
  remarks: string | null
  product_manual_number: string | null
  unit_of_is: string | null
  mmf_large_scale: number | null
  mmf_medium_scale: number | null
  mmf_small_scale: number | null
  mmf_micro_scale: number | null
  slab_1_quantity: string | null
  slab_1_rate: number | null
  slab_2_quantity: string | null
  slab_2_rate: number | null
  slab_3_quantity: string | null
  slab_3_rate: number | null
  created_at?: string
  archived_at?: string | null
  standard_prefix?: string | null
  part_no?: string | null
  section_no?: string | null
  technical_department?: string | null
  technical_committee?: string | null
  ics_code?: string | null
  certification_category?: string | null
  standard_status?: string | null
}

type KindFile = File & { documentKind?: string }

export function isCodeFileDocumentKind(file: File): string {
  return (file as KindFile).documentKind ?? ''
}

/** `PM IS 2062.pdf` and `PM 15911 2010.pdf` are product manuals. */
export function inferIsCodeFileDocumentKind(fileName: string | null | undefined): string {
  const name = String(fileName ?? '').trim()
  if (/^PM([\s._-]|$)/i.test(name) || /product\s+manual/i.test(name)) return 'Product Manual'
  return 'Specification'
}

export function resolveIsCodeFileDocumentKind(
  stored: string | null | undefined,
  fileName: string | null | undefined,
): string {
  const text = String(stored ?? '').trim()
  if (text) return text
  return inferIsCodeFileDocumentKind(fileName)
}

export function setIsCodeFileDocumentKind(file: File, kind: string) {
  Object.defineProperty(file, 'documentKind', { value: kind, writable: true, configurable: true })
}

export type IsCodeFileRow = {
  id: string
  is_code_id: string
  file_name: string
  storage_path: string
  document_kind?: string | null
  created_at?: string
}

export type IsCodeForm = {
  isNumber: string
  revisionYear: string
  reaffirmationYear: string
  amendmentNumber: string
  title: string
  aspect: IsAspect
  testingCharges: string
  remarks: string
  productManualNumber: string
  unitOfIs: string
  mmfLargeScale: string
  mmfMediumScale: string
  mmfSmallScale: string
  mmfMicroScale: string
  slab1Quantity: string
  slab1Rate: string
  slab2Quantity: string
  slab2Rate: string
  slab3Quantity: string
  slab3Rate: string
  files: File[]
  standardPrefix: string
  partNo: string
  sectionNo: string
  technicalDepartment: string
  technicalCommittee: string
  icsCode: string
  certificationCategory: string
  standardStatus: string
  amendments: IsCodeAmendmentForm[]
}

export type IsCodeAmendmentForm = {
  id?: string
  amendmentNo: string
  issuedOn: string
  summary: string
}

export const emptyIsCodeForm = (): IsCodeForm => ({
  isNumber: '',
  revisionYear: '',
  reaffirmationYear: 'RA-',
  amendmentNumber: '00',
  title: '',
  aspect: 'Specification',
  testingCharges: DEFAULT_MONEY_FIELD,
  remarks: '',
  productManualNumber: '',
  unitOfIs: DEFAULT_IS_CODE_UNIT,
  mmfLargeScale: DEFAULT_MONEY_FIELD,
  mmfMediumScale: DEFAULT_MONEY_FIELD,
  mmfSmallScale: DEFAULT_MONEY_FIELD,
  mmfMicroScale: DEFAULT_MONEY_FIELD,
  slab1Quantity: DEFAULT_SLAB_1_QTY,
  slab1Rate: DEFAULT_MONEY_FIELD,
  slab2Quantity: DEFAULT_SLAB_2_QTY,
  slab2Rate: DEFAULT_MONEY_FIELD,
  slab3Quantity: DEFAULT_SLAB_3_QTY,
  slab3Rate: DEFAULT_MONEY_FIELD,
  files: [],
  standardPrefix: 'IS',
  partNo: 'Part-0',
  sectionNo: 'Sec-0',
  technicalDepartment: '',
  technicalCommittee: '',
  icsCode: '',
  certificationCategory: '',
  standardStatus: '',
  amendments: [],
})

/** IS Number box: digits only, at most 5. */
export function isCodeNumberDigits(raw: string): string {
  return String(raw ?? '').replace(/\D/g, '').slice(0, 5)
}

export function isValidIsNumberDigits(value: string): boolean {
  return /^[0-9]{1,5}$/.test(value.trim())
}

export function canonicalIsNumber(raw: string): string {
  const compact = raw.trim().replace(/\s+/g, ' ')
  const dual = compact
    .replace(/^IS\s*\/\s*ISO\s*\/\s*IEC\b/i, 'IS/ISO/IEC')
    .replace(/^IS\s*\/\s*IEC\b/i, 'IS/IEC')
    .replace(/^IS\s*\/\s*ISO\b/i, 'IS/ISO')
  if (/^IS\/(ISO\/IEC|ISO|IEC)\b/i.test(dual)) return dual
  const rest = dual.replace(/^IS\s*/i, '').trim()
  return rest ? `IS ${rest}` : ''
}

export function moneyToFormStr(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(Number(n))) return DEFAULT_MONEY_FIELD
  return (Math.round(Number(n) * 100) / 100).toFixed(2)
}

export function moneyFromFormStr(raw: string | null | undefined): number | null {
  const v = String(raw ?? '').trim()
  if (!v) return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

/** DB columns are numeric NOT NULL — never send null for money fields. */
export function moneyOrZero(raw: string | null | undefined): number {
  return moneyFromFormStr(raw) ?? 0
}

/**
 * Parse year fields for Postgres int columns.
 * Accepts "2026", "RA-2026", "RA2026", "RA-" / "RA" → null (optional reaffirmation).
 */
export function yearIntFromForm(raw: string | null | undefined): number | null {
  const digits = String(raw ?? '').replace(/\D/g, '')
  if (!digits) return null
  const n = Number(digits)
  return Number.isFinite(n) ? n : null
}

/** While typing, keep "Part-" so the user can replace the number. Blur restores "Part-0". */
export function partWhileTyping(raw: string | null | undefined): string {
  const text = String(raw ?? '')
  if (!text.trim() || /^part-?$/i.test(text.trim())) return 'Part-'
  if (/^part-/i.test(text)) {
    const rest = text.replace(/^part-/i, '')
    return rest ? `Part-${rest}` : 'Part-'
  }
  if (/^part\s+/i.test(text)) {
    const rest = text.replace(/^part\s+/i, '').trim()
    return rest ? `Part-${rest}` : 'Part-'
  }
  if (/^part/i.test(text)) return text
  return `Part-${text.trim()}`
}

/** Form display: empty or "Part-" → "Part-0". "24" → "Part-24". */
export function partToFormStr(raw: string | null | undefined): string {
  const text = String(raw ?? '').trim()
  if (!text || /^part-?$/i.test(text)) return 'Part-0'
  const rest = text.replace(/^part-?\s*/i, '').trim()
  return rest ? `Part-${rest}` : 'Part-0'
}

/** While typing, keep "Sec-" so the user can replace the number. Blur restores "Sec-0". */
export function sectionWhileTyping(raw: string | null | undefined): string {
  const text = String(raw ?? '')
  if (!text.trim() || /^sec-?$/i.test(text.trim())) return 'Sec-'
  if (/^sec-/i.test(text)) {
    const rest = text.replace(/^sec-/i, '')
    return rest ? `Sec-${rest}` : 'Sec-'
  }
  if (/^sec\s+/i.test(text)) {
    const rest = text.replace(/^sec\s+/i, '').trim()
    return rest ? `Sec-${rest}` : 'Sec-'
  }
  if (/^sec/i.test(text)) return text
  return `Sec-${text.trim()}`
}

/** Form display: empty or "Sec-" → "Sec-0". "10" → "Sec-10". */
export function sectionToFormStr(raw: string | null | undefined): string {
  const text = String(raw ?? '').trim()
  if (!text || /^sec-?$/i.test(text)) return 'Sec-0'
  const rest = text.replace(/^sec-\s*/i, '').replace(/^sec\s+/i, '').trim()
  return rest ? `Sec-${rest}` : 'Sec-0'
}

/** While typing, keep a short digit draft. "00" plus a new digit keeps the new digit. Blur restores "00". */
export function amendmentWhileTyping(previous: string, raw: string | null | undefined): string {
  const digits = String(raw ?? '').replace(/\D/g, '')
  if (previous === '00' && digits.startsWith('00') && digits.length > 2) return digits.slice(2, 4)
  if (previous === '00' && (digits === '0' || digits === '')) return digits
  return digits.slice(0, 2)
}

/** Form display: empty, "0", or "00" → "00". "10" stays "10". */
export function amendmentToFormStr(raw: string | number | null | undefined): string {
  const digits = String(raw ?? '').replace(/\D/g, '').slice(0, 2)
  if (!digits || digits === '0' || digits === '00') return '00'
  return digits
}

/** Form display: null → "RA-"; 2026 → "RA-2026". */
export function reaffirmationToFormStr(raw: string | number | null | undefined): string {
  if (raw == null || String(raw).trim() === '') return 'RA-'
  const text = String(raw).trim().toUpperCase()
  if (text === 'RA' || text === 'RA-') return 'RA-'
  const digits = text.replace(/^RA-?/, '').replace(/\D/g, '').slice(0, 4)
  return digits ? `RA-${digits}` : 'RA-'
}

export const isValidYear4 = (value: string) => {
  const v = value.trim()
  if (!v) return true
  return /^[0-9]{1,4}$/.test(v)
}

export const isValidAmendment2 = (value: string) => {
  const v = value.trim()
  if (!v) return true
  return /^[0-9]{1,2}$/.test(v)
}

export const normalizeText = (v: string | null | undefined) => String(v ?? '').trim()

/** Title Case; keep short connectors lowercase (of, for, and, …) except first/last word. */
const TITLE_SMALL_WORDS = new Set([
  'a',
  'an',
  'the',
  'and',
  'but',
  'or',
  'nor',
  'for',
  'of',
  'on',
  'at',
  'to',
  'from',
  'by',
  'in',
  'into',
  'onto',
  'with',
  'as',
  'over',
  'per',
  'via',
  'vs',
  'vs.',
])

function capitalizeCore(core: string): string {
  if (!core) return core
  // A word the user typed with a capital letter (A, AA, SY, A1, McD …) is kept exactly as typed.
  if (/[A-Z]/.test(core)) return core
  if (/^\d+[a-z]?$/i.test(core)) return core
  return core.charAt(0).toUpperCase() + core.slice(1).toLowerCase()
}

function formatTitleSegment(segment: string, capitalize: boolean): string {
  const match = segment.match(/^([^A-Za-z0-9]*)(.*?)([^A-Za-z0-9]*)$/)
  if (!match) return capitalize ? capitalizeCore(segment) : segment.toLowerCase()
  const [, lead, core, trail] = match
  if (!core) return segment
  if (/[A-Z]/.test(core)) return `${lead}${core}${trail}`
  if (!capitalize) return `${lead}${core.toLowerCase()}${trail}`
  return `${lead}${capitalizeCore(core)}${trail}`
}

export function toProperTitleCase(raw: string): string {
  const text = raw.trim().replace(/\s+/g, ' ')
  if (!text) return ''
  const words = text.split(' ')
  return words
    .map((word, wordIndex) => {
      const parts = word.split('-')
      return parts
        .map((part, partIndex) => {
          const isFirst = wordIndex === 0 && partIndex === 0
          const isLast = wordIndex === words.length - 1 && partIndex === parts.length - 1
          const core = part.replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9]+$/g, '').toLowerCase()
          const capitalize = isFirst || isLast || !TITLE_SMALL_WORDS.has(core)
          return formatTitleSegment(part, capitalize)
        })
        .join('-')
    })
    .join(' ')
}

export function formatInr(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(Number(n))) return '—'
  return Number(n).toLocaleString('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}
