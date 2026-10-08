export type TypeAMeasurement = {
  key: string
  /** Editable reading label (e.g. Reading 01). */
  label: string
  value: string
  unit: string
}

export type UncertaintyContributor = {
  key: string
  sourceType: string
  sourceName: string
  equipmentId: string
  uncertaintyUnit: string
  uncertainty: string
  measurement: string
  relativeUncertainty: string
  divisor: string
}

export const TYPE_B_SOURCE_TYPE_OPTIONS = [
  'Calibration Certificate',
  'Resolution',
  'Reference Standard',
  'Repeatability',
  'Operator',
  'Environmental',
  'Equipment',
  'Method',
  'Other',
] as const

export function formatPlusMinusPercent(value: string): string {
  const raw = value.trim()
  if (!raw) return ''
  const numberPart = raw.replace(/[^0-9.]/g, '')
  if (!numberPart) return ''
  return `± ${numberPart} %`
}

export function extractNumberPart(value: string): string {
  return value.replace(/[^0-9.]/g, '')
}

export function newTypeAMeasurement(label = '', unit = ''): TypeAMeasurement {
  return {
    key: `mv-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    label,
    value: '',
    unit,
  }
}

export function defaultTypeAReadingLabel(index: number): string {
  return `Reading ${String(index + 1).padStart(2, '0')}`
}

export function newUncertaintyContributor(defaultUnit = ''): UncertaintyContributor {
  return {
    key: `u-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    sourceType: 'Calibration Certificate',
    sourceName: '',
    equipmentId: '',
    uncertaintyUnit: defaultUnit,
    uncertainty: '',
    measurement: '',
    relativeUncertainty: '',
    divisor: '1',
  }
}

export function formatToFourDecimals(value: string): string {
  const num = Number.parseFloat(value)
  if (!Number.isFinite(num)) return value
  return num.toFixed(4)
}

export function typeBContributorStandardUncertainty(contributor: UncertaintyContributor): number {
  const value = Number.parseFloat(contributor.uncertainty)
  const divisor = Number.parseFloat(contributor.divisor) || 1
  if (!Number.isFinite(value) || divisor <= 0) return 0
  return value / divisor
}

export function formatTypeBRelativeUncertainty(
  contributor: Pick<UncertaintyContributor, 'uncertainty' | 'measurement' | 'divisor'>,
): string {
  const ui = typeBContributorStandardUncertainty(contributor as UncertaintyContributor)
  const measurement = Number.parseFloat(contributor.measurement)
  if (ui <= 0 || !Number.isFinite(measurement) || measurement === 0) return ''
  return ((ui / measurement) * 100).toFixed(4)
}

export function typeBRelativeUncertaintyPercent(contributor: UncertaintyContributor): number | null {
  const stored = Number.parseFloat(contributor.relativeUncertainty)
  if (contributor.relativeUncertainty.trim() && Number.isFinite(stored) && stored > 0) {
    return stored
  }

  const ui = typeBContributorStandardUncertainty(contributor)
  const measurement = Number.parseFloat(contributor.measurement)
  if (ui <= 0 || !Number.isFinite(measurement) || measurement === 0) return null
  return (ui / measurement) * 100
}

export function typeAUncertaintyFromMeasurements(measurements: TypeAMeasurement[]): {
  n: number
  mean: number
  s: number
  uA: number
} {
  const nums = measurements
    .map((m) => Number.parseFloat(m.value))
    .filter((n) => Number.isFinite(n))
  const n = nums.length
  if (n === 0) return { n: 0, mean: 0, s: 0, uA: 0 }
  const mean = nums.reduce((sum, value) => sum + value, 0) / n
  if (n === 1) return { n, mean, s: 0, uA: 0 }
  const variance = nums.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (n - 1)
  const s = Math.sqrt(variance)
  return { n, mean, s, uA: s / Math.sqrt(n) }
}

export function typeARelativeUncertaintyPercent(uA: number, mean: number): number {
  if (!Number.isFinite(uA) || !Number.isFinite(mean) || mean === 0) return 0
  return (uA / mean) * 100
}

export function relativeUncertaintyFromContributors(contributors: UncertaintyContributor[]): number {
  const squares = contributors
    .map((row) => {
      const relative = typeBRelativeUncertaintyPercent(row)
      if (relative == null || relative <= 0) return 0
      return relative * relative
    })
    .filter((n) => n > 0)

  if (squares.length === 0) return 0
  return Math.sqrt(squares.reduce((sum, n) => sum + n, 0))
}

export function standardUncertaintyFromContributors(contributors: UncertaintyContributor[]): number {
  const squares = contributors
    .map((row) => {
      const ui = typeBContributorStandardUncertainty(row)
      if (ui <= 0) return 0
      return ui * ui
    })
    .filter((n) => n > 0)

  return Math.sqrt(squares.reduce((sum, n) => sum + n, 0))
}

export function combineUncertaintyBudget(
  typeAMeasurements: TypeAMeasurement[],
  typeB: UncertaintyContributor[],
  coverageFactor: number,
): {
  uTypeA: number
  uTypeB: number
  uc: number
  expanded: number
  typeAStats: ReturnType<typeof typeAUncertaintyFromMeasurements>
} {
  const typeAStats = typeAUncertaintyFromMeasurements(typeAMeasurements)
  const uTypeA = typeAStats.uA
  const uTypeB = standardUncertaintyFromContributors(typeB)
  const uc = Math.sqrt(uTypeA * uTypeA + uTypeB * uTypeB)
  const k = Number.isFinite(coverageFactor) && coverageFactor > 0 ? coverageFactor : 2
  return { uTypeA, uTypeB, uc, expanded: uc * k, typeAStats }
}

export function combineUncertainty(
  contributors: UncertaintyContributor[],
  coverageFactor: number,
): { uc: number; expanded: number } {
  const { uc, expanded } = combineUncertaintyBudget([], contributors, coverageFactor)
  return { uc, expanded }
}

/**
 * Lab convention (1σ / 2σ / 3σ) as commonly used for expanded uncertainty:
 * ~68% → k=1, ~95% → k=2, ~99.7% → k=3
 */
export const CONFIDENCE_LEVEL_OPTIONS = [
  { label: '~68%', value: '68', coverageFactor: '1' },
  { label: '~95%', value: '95', coverageFactor: '2' },
  { label: '~99.7%', value: '99.7', coverageFactor: '3' },
] as const

export function coverageFactorFromConfidencePercent(percent: number): string {
  if (!Number.isFinite(percent)) return '2'
  if (percent <= 80) return '1'
  if (percent <= 97) return '2'
  return '3'
}

export function coverageFactorForConfidenceLevel(level: string): string {
  const match = CONFIDENCE_LEVEL_OPTIONS.find((option) => option.value === level)
  if (match) return match.coverageFactor
  const percent = Number.parseFloat(level)
  if (!Number.isFinite(percent)) return '2'
  return coverageFactorFromConfidencePercent(percent)
}

/** Keep known lab presets or any valid 0–100 percentage; default 95. */
export function normalizeConfidenceLevel(level: string | null | undefined): string {
  const raw = level?.trim() || '95'
  if (CONFIDENCE_LEVEL_OPTIONS.some((option) => option.value === raw)) return raw
  const cleaned = raw.replace(/[^0-9.]/g, '')
  const percent = Number.parseFloat(cleaned)
  if (!Number.isFinite(percent) || percent <= 0 || percent > 100) return '95'
  // Prefer original cleaned string when it matches the parsed number (keeps "99.7")
  if (cleaned && Number.parseFloat(cleaned) === percent) return cleaned
  return String(percent)
}

export function confidenceLevelForCoverageFactor(factor: string): string {
  const normalized = factor.trim()
  const match = CONFIDENCE_LEVEL_OPTIONS.find((option) => option.coverageFactor === normalized)
  return match?.value ?? '95'
}

export function totalRelativeUncertaintyPercent(
  uTypeA: number,
  typeAStats: { n: number; mean: number },
  uTypeBRelative: number,
): number {
  const uARel =
    typeAStats.n >= 2 && typeAStats.mean !== 0 && uTypeA > 0
      ? typeARelativeUncertaintyPercent(uTypeA, typeAStats.mean)
      : 0
  if (uARel <= 0 && uTypeBRelative <= 0) return 0
  return Math.sqrt(uARel * uARel + uTypeBRelative * uTypeBRelative)
}

export function formatUncertaintyOfTestMu(
  unit: string | null | undefined,
  expanded: number,
  totalRelative: number,
): string {
  const unitLabel = unit?.trim() ?? ''
  if (unitLabel === '%') {
    if (totalRelative <= 0) return ''
    return formatPlusMinusPercent(totalRelative.toFixed(4))
  }
  if (expanded <= 0) return ''
  return unitLabel ? `± ${expanded.toFixed(4)} ${unitLabel}` : `± ${expanded.toFixed(4)}`
}

export type UncertaintyCalculationData = {
  version: 1
  typeAMeasurements: TypeAMeasurement[]
  typeBContributors: UncertaintyContributor[]
  confidenceLevel: string
  coverageFactor: string
  referenceValue: string
  resultMu: string
}

function normalizeContributor(raw: unknown, defaultUnit = ''): UncertaintyContributor | null {
  if (!raw || typeof raw !== 'object') return null
  const row = raw as Partial<UncertaintyContributor>
  if (!row.key || typeof row.key !== 'string') return null
  return {
    key: row.key,
    sourceType: typeof row.sourceType === 'string' ? row.sourceType : 'Calibration Certificate',
    sourceName: typeof row.sourceName === 'string' ? row.sourceName : '',
    equipmentId: typeof row.equipmentId === 'string' ? row.equipmentId : '',
    uncertaintyUnit: typeof row.uncertaintyUnit === 'string' ? row.uncertaintyUnit : defaultUnit,
    uncertainty: typeof row.uncertainty === 'string' ? row.uncertainty : '',
    measurement: typeof row.measurement === 'string' ? row.measurement : '',
    relativeUncertainty: typeof row.relativeUncertainty === 'string' ? row.relativeUncertainty : '',
    divisor: typeof row.divisor === 'string' ? row.divisor : '1',
  }
}

function normalizeMeasurement(raw: unknown): TypeAMeasurement | null {
  if (!raw || typeof raw !== 'object') return null
  const row = raw as Partial<TypeAMeasurement> & { reading?: string }
  if (!row.key || typeof row.key !== 'string') return null
  const labelRaw =
    typeof row.label === 'string'
      ? row.label
      : typeof row.reading === 'string'
        ? row.reading
        : ''
  return {
    key: row.key,
    label: labelRaw.trim(),
    value: typeof row.value === 'string' ? row.value : '',
    unit: typeof row.unit === 'string' ? row.unit.trim() : '',
  }
}

export function buildUncertaintyCalculationData(input: {
  typeAMeasurements: TypeAMeasurement[]
  typeBContributors: UncertaintyContributor[]
  confidenceLevel: string
  coverageFactor: string
  referenceValue: string
  resultMu: string
}): UncertaintyCalculationData {
  return {
    version: 1,
    typeAMeasurements: input.typeAMeasurements,
    typeBContributors: input.typeBContributors,
    confidenceLevel: normalizeConfidenceLevel(input.confidenceLevel),
    coverageFactor:
      input.coverageFactor.trim() ||
      coverageFactorForConfidenceLevel(normalizeConfidenceLevel(input.confidenceLevel)),
    referenceValue: input.referenceValue,
    resultMu: input.resultMu.trim(),
  }
}

export function parseUncertaintyCalculationData(
  raw: unknown,
  defaultUnit = '',
): UncertaintyCalculationData | null {
  if (!raw || typeof raw !== 'object') return null
  const data = raw as Partial<UncertaintyCalculationData>
  if (data.version !== 1) return null

  const typeAMeasurements = Array.isArray(data.typeAMeasurements)
    ? data.typeAMeasurements.map(normalizeMeasurement).filter((row): row is TypeAMeasurement => row != null)
    : []
  const typeBContributors = Array.isArray(data.typeBContributors)
    ? data.typeBContributors
        .map((row) => normalizeContributor(row, defaultUnit))
        .filter((row): row is UncertaintyContributor => row != null)
    : []

  return {
    version: 1,
    typeAMeasurements,
    typeBContributors,
    confidenceLevel: normalizeConfidenceLevel(
      typeof data.confidenceLevel === 'string'
        ? data.confidenceLevel
        : confidenceLevelForCoverageFactor(
            typeof data.coverageFactor === 'string' ? data.coverageFactor : '2',
          ),
    ),
    coverageFactor:
      typeof data.coverageFactor === 'string'
        ? data.coverageFactor
        : coverageFactorForConfidenceLevel(
            normalizeConfidenceLevel(
              typeof data.confidenceLevel === 'string' ? data.confidenceLevel : '95',
            ),
          ),
    referenceValue: typeof data.referenceValue === 'string' ? data.referenceValue : '',
    resultMu: typeof data.resultMu === 'string' ? data.resultMu : '',
  }
}
