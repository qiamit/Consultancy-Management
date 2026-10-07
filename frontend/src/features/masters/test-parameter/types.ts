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
  department: 'Mechanical',
  designation: 'Testing Engineer',
})

export const normalizeText = (value: string) => value.trim()

export const normalizeNumberString = (value: string) => value.replace(/[^0-9.]/g, '')

/**
 * Title Case helpers: auto-capitalize words, but keep connectors / “unit(s)”
 * lowercase even when first or last (of, for, on, and, unit, units, …).
 */
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
  'unit',
  'units',
])

/** Keep scientific / unit tokens as typed (N/mm², MPa, H₂O, 10kg, …). */
function shouldPreserveToken(core: string): boolean {
  if (!core) return false
  if (/[⁰¹²³⁴⁵⁶⁷⁸⁹₀₁₂₃₄₅₆₇₈₉µμΩ℃℉‰]/.test(core)) return true
  if (core.includes('/')) return true
  if (core.includes('%')) return true
  if (/\d/.test(core) && /[A-Za-z]/.test(core)) return true
  // Short technical unit / grade codes: MPa, GPa, HRC, ksi…
  if (core.length <= 4 && /^[A-Za-z]+$/.test(core)) {
    const hasUpper = /[A-Z]/.test(core)
    const hasLower = /[a-z]/.test(core)
    if (hasUpper && hasLower) return true // MPa
    if (/^[A-Z]{2,4}$/.test(core)) return true // HRC, HV
  }
  return false
}

function capitalizeCore(core: string): string {
  if (!core) return core
  if (shouldPreserveToken(core)) return core
  if (/^\d+[a-z]?$/i.test(core)) return core
  return core.charAt(0).toUpperCase() + core.slice(1).toLowerCase()
}

function formatTitleSegment(segment: string, capitalize: boolean): string {
  const match = segment.match(/^([^A-Za-z0-9]*)(.*?)([^A-Za-z0-9]*)$/)
  if (!match) return capitalize ? capitalizeCore(segment) : segment.toLowerCase()
  const [, lead, core, trail] = match
  if (!core) return segment
  if (shouldPreserveToken(core)) return `${lead}${core}${trail}`
  if (!capitalize) return `${lead}${core.toLowerCase()}${trail}`
  return `${lead}${capitalizeCore(core)}${trail}`
}

export function toProperTitleCase(raw: string): string {
  const text = raw.trim().replace(/\s+/g, ' ')
  if (!text) return ''
  const words = text.split(' ')
  return words
    .map((word) => {
      const parts = word.split('-')
      return parts
        .map((part) => {
          const core = part.replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9]+$/g, '').toLowerCase()
          // Small words (of / for / on / and / unit / units / …) stay lowercase always.
          const capitalize = !TITLE_SMALL_WORDS.has(core)
          return formatTitleSegment(part, capitalize)
        })
        .join('-')
    })
    .join(' ')
}
