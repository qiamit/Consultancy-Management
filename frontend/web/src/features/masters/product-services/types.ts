export const NABL_TYPE_OF_TEST_OPTIONS = ['Quantitative', 'Qualitative'] as const
export type NablTypeOfTest = (typeof NABL_TYPE_OF_TEST_OPTIONS)[number]

export const NABL_SCOPE_STATUS_OPTIONS = ['Accredited', 'Draft Scope'] as const
export type NablScopeStatus = (typeof NABL_SCOPE_STATUS_OPTIONS)[number]

export const DEFAULT_NABL_SCOPE_STATUS: NablScopeStatus = 'Draft Scope'

export function normalizeNablScopeStatus(value: string | null | undefined): NablScopeStatus {
  const v = String(value ?? '').trim()
  if (v === 'Accredited' || v === 'Draft Scope') return v
  return DEFAULT_NABL_SCOPE_STATUS
}

export type NablScopeRow = {
  id: string
  s_no: number
  discipline_group: string
  materials_products: string
  component_parameter: string
  test_method_specification: string
  permanent_testing: string
  scope_status: string
  type_of_test: string | null
  range_minimum: number | null
  range_maximum: number | null
  unit: string | null
  uncertainty: string | null
  created_at?: string
}

export type NablScopeForm = {
  sNo: string
  disciplineGroup: string
  materialsProducts: string
  componentParameter: string
  testMethodSpecification: string
  permanentTesting: string
  scopeStatus: NablScopeStatus
  typeOfTest: string
  rangeMinimum: string
  rangeMaximum: string
  unit: string
  uncertainty: string
}

export const emptyNablScopeForm = (): NablScopeForm => ({
  sNo: '',
  disciplineGroup: '',
  materialsProducts: '',
  componentParameter: '',
  testMethodSpecification: '',
  permanentTesting: 'Permanent Testing',
  scopeStatus: DEFAULT_NABL_SCOPE_STATUS,
  typeOfTest: '',
  rangeMinimum: '',
  rangeMaximum: '',
  unit: '',
  uncertainty: '',
})

export const normalizeText = (value: string) => value.trim()

export const isValidIntegerOrEmpty = (value: string) => {
  const v = value.trim()
  if (!v) return true
  const n = Number(v)
  return Number.isInteger(n) && n > 0
}

export const isValidNumberOrEmpty = (value: string) => {
  const v = value.trim()
  if (!v) return true
  const n = Number(v)
  return Number.isFinite(n)
}

export function parseOptionalNumber(value: string): number | null {
  const v = value.trim()
  if (!v) return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

export function formatScopeNumber(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '—'
  return String(value)
}

/** Structured Uncertainty UI parts: ± MU @ Test */
export type UncertaintyParts = {
  muValue: string
  muUnit: string
  testValue: string
  testUnit: string
}

export function emptyUncertaintyParts(): UncertaintyParts {
  return { muValue: '', muUnit: '', testValue: '', testUnit: '' }
}

/** Encode as: ± {muValue} {muUnit} @ {testValue} {testUnit} */
export function joinUncertaintyParts(parts: UncertaintyParts): string {
  const muValue = parts.muValue.replace(/[^0-9.]/g, '').trim()
  const muUnit = parts.muUnit.trim()
  const testValue = parts.testValue.replace(/[^0-9.]/g, '').trim()
  const testUnit = parts.testUnit.trim()
  if (!muValue && !muUnit && !testValue && !testUnit) return ''

  const muSide = [muValue, muUnit].filter(Boolean).join(' ')
  const testSide = [testValue, testUnit].filter(Boolean).join(' ')
  if (muSide && testSide) return `± ${muSide} @ ${testSide}`
  if (muSide) return `± ${muSide}`
  if (testSide) return `@ ${testSide}`
  return ''
}

/** Parse stored uncertainty text back into structured parts (best-effort). */
export function splitUncertaintyParts(raw: string): UncertaintyParts {
  const text = raw.trim()
  if (!text) return emptyUncertaintyParts()

  const cleaned = text.replace(/^±\s*/, '').trim()
  let muSide = cleaned
  let testSide = ''
  const match = cleaned.match(/^(.*?)\s*@\s*(.*)$/)
  if (match) {
    muSide = match[1].trim()
    testSide = match[2].trim()
  }

  const splitValueUnit = (side: string): { value: string; unit: string } => {
    const s = side.trim()
    if (!s) return { value: '', unit: '' }
    const m = s.match(/^([0-9]*\.?[0-9]+)\s*(.*)$/)
    if (m) return { value: m[1], unit: m[2].trim() }
    return { value: '', unit: s }
  }

  const mu = splitValueUnit(muSide)
  const test = splitValueUnit(testSide)
  return {
    muValue: mu.value,
    muUnit: mu.unit,
    testValue: test.value,
    testUnit: test.unit,
  }
}

/** Table / print display: ± 0.0130 % @ 0.3560 % */
export function formatUncertaintyDisplay(raw: string | null | undefined): string {
  const text = String(raw ?? '').trim()
  if (!text) return '—'
  const parts = splitUncertaintyParts(text)
  const hasStructured =
    parts.muValue || parts.muUnit || parts.testValue || parts.testUnit
  if (!hasStructured) return text
  return joinUncertaintyParts(parts) || text
}
