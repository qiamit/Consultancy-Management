export type IsAspect = string

export type IsCodeRow = {
  id: string
  is_number: string
  revision_year: string | null
  reaffirmation_year: string | null
  amendment_number: string | null
  title: string
  aspect: IsAspect
  testing_charges: number | null
  remarks: string | null
  created_at?: string
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
  files: File[]
}

export const emptyIsCodeForm = (): IsCodeForm => ({
  isNumber: '',
  revisionYear: '',
  reaffirmationYear: 'RA',
  amendmentNumber: '',
  title: '',
  aspect: 'Specification',
  testingCharges: '',
  remarks: '',
  files: [],
})

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

export const normalizeText = (v: string) => v.trim()

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
