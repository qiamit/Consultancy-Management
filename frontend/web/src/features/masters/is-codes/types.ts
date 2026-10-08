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
}

export type IsCodeFileRow = {
  id: string
  is_code_id: string
  file_name: string
  storage_path: string
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
}

export const emptyIsCodeForm = (): IsCodeForm => ({
  isNumber: 'IS ',
  revisionYear: '',
  reaffirmationYear: 'RA-',
  amendmentNumber: '',
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
})

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
  if (/^\d+[a-z]?$/i.test(core)) return core
  return core.charAt(0).toUpperCase() + core.slice(1).toLowerCase()
}

function formatTitleSegment(segment: string, capitalize: boolean): string {
  const match = segment.match(/^([^A-Za-z0-9]*)(.*?)([^A-Za-z0-9]*)$/)
  if (!match) return capitalize ? capitalizeCore(segment) : segment.toLowerCase()
  const [, lead, core, trail] = match
  if (!core) return segment
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
