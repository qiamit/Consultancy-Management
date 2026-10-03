export type TestParameterRow = {
  id: string
  is_code_id: string | null
  is_code_label: string | null
  clause_no: string | null
  unit_value: string | null
  test_method: string | null
  item_name: string
  specific_requirement: string | null
  under_accreditation_ids: string[]
  uncertainty_mu: string | null
  uncertainty_calculation_data: unknown | null
  uncertainty_mu_history: unknown | null
  department: string | null
  designation: string | null
  acceptance_criteria: string | null
  created_at?: string
}

export type AccreditationBodyRow = {
  id: string
  name: string
  created_at?: string
}

export type UnitRow = {
  id: string
  name: string
  created_at?: string
}

export type TestParameterForm = {
  isCodeId: string
  isCodeLabel: string
  clauseNo: string
  unitValue: string
  testMethod: string
  itemName: string
  specificRequirement: string
  underAccreditationIds: string[]
  uncertaintyMu: string
  department: string
  designation: string
}

export const emptyTestParameterForm = (): TestParameterForm => ({
  isCodeId: '',
  isCodeLabel: '',
  clauseNo: '',
  unitValue: '',
  testMethod: '',
  itemName: '',
  specificRequirement: '',
  underAccreditationIds: [],
  uncertaintyMu: '',
  department: 'Mechanical',
  designation: 'Testing Engineer',
})

export const normalizeText = (value: string) => value.trim()

export const normalizeNumberString = (value: string) => value.replace(/[^0-9.]/g, '')

/** Title Case; keep short connectors lowercase (of, for, in, end, …) except first/last word. */
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
  'end',
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
