export type UndertakingGeneralPayload = {
  markingClause: string
  packagingClause: string
  weeklyOff: string
  waterSupplySource: string
  electricSupplySource: string
  generatorBackup: string
  machineryOwnership: string
  pollutionControlArrangement: string
}

export type UndertakingLongDurationRow = {
  typeOfTest: string
  durationOfTest: string
  dateOfCompletion: string
}

export type UndertakingLongDurationPayload = {
  declarantName: string
  place: string
  testRows: UndertakingLongDurationRow[]
}

export type UndertakingMinimumFeePayload = {
  firmStatus: string
  annualProductionCapacity: string
  valueOfProductionPerUnit: string
  costOfProductionPerUnit: string
  marketSurveillancePlan: string
  bisLabTestingCharges: string
  oslAvgTestingCharges: string
  testingChargeBasis: string
  marketSampleQuantity: string
  marketSampleCost: string
  factoryTestingBasis: string
  factoryMandays: string
  factoryVisitRate: string
  factorySampleCount: string
  marketSampleCount: string
  factorySampleRate: string
  marketSampleRate: string
  overheadCost: string
  mmfLarge: string
  mmfMsme: string
  finalUnitRate: string
  slab1Text: string
  slab2Text: string
  slab3Text: string
}

/** Convert Company Master scale values to the firm-status codes used by MMF. */
export function undertakingFirmStatusFromCompanyScale(scale: unknown): string {
  const normalized = typeof scale === 'string' ? scale.trim().toUpperCase() : ''
  if (/\b(MSME|SME|MICRO|SMALL|MEDIUM)\b/.test(normalized)) return 'MSME'
  if (/\b(LS|LARGE)\b/.test(normalized)) return 'LS'
  return ''
}

export type SelfEvaluationPayload = {
  plantLayout: string
  packagingMarkingRows: Array<{ label: string; value: string }>
  brandsWithoutMarkReasons: string
}

export function emptySelfEvaluationPayload(): SelfEvaluationPayload {
  return {
    plantLayout: 'Enclosed',
    packagingMarkingRows: [
      ['Nature of Packaging', 'Pieces'],
      ['Quantity Per Package', 'As per Customer Requirement after GOL'],
      ['Marking on Article', 'As per Marking Clause after GOL'],
      ['Method of Marking', 'Marking by Tag after GOL'],
      ['Form of Label(s)', 'Attached after GOL'],
      ['Batch OR Code Number for Identification', 'Batch Number Will be Provided After GOL'],
      ['In What Manner Marking Differs from the Provisions in the IS Specification', 'Immediate Stop Marking & Take Corrective Action'],
    ].map(([label, value]) => ({ label, value })),
    brandsWithoutMarkReasons: '',
  }
}

export function parseSelfEvaluationPayload(raw: Record<string, unknown> | null): SelfEvaluationPayload {
  const defaults = emptySelfEvaluationPayload()
  const rows = Array.isArray(raw?.packagingMarkingRows) ? raw.packagingMarkingRows : []
  return {
    plantLayout: text(raw?.plantLayout) || defaults.plantLayout,
    packagingMarkingRows: rows.length
      ? rows.filter((row): row is Record<string, unknown> => Boolean(row) && typeof row === 'object')
        .map((row) => ({ label: text(row.label), value: text(row.value) }))
      : defaults.packagingMarkingRows,
    brandsWithoutMarkReasons: text(raw?.brandsWithoutMarkReasons),
  }
}

function text(value: unknown): string {
  return String(value ?? '').trim()
}

export function emptyUndertakingGeneralPayload(): UndertakingGeneralPayload {
  return {
    markingClause: '', packagingClause: '', weeklyOff: 'Sunday',
    waterSupplySource: 'Own', electricSupplySource: 'Electricity Board',
    generatorBackup: 'Yes', machineryOwnership: 'Owned by us',
    pollutionControlArrangement: 'Own',
  }
}

export function parseUndertakingGeneralPayload(raw: Record<string, unknown> | null): UndertakingGeneralPayload {
  return {
    markingClause: text(raw?.markingClause ?? raw?.marking_clause),
    packagingClause: text(raw?.packagingClause ?? raw?.packaging_clause),
    weeklyOff: text(raw?.weeklyOff ?? raw?.weekly_off) || 'Sunday',
    waterSupplySource: text(raw?.waterSupplySource ?? raw?.water_supply_source) || 'Own',
    electricSupplySource: text(raw?.electricSupplySource ?? raw?.electric_supply_source) || 'Electricity Board',
    generatorBackup: text(raw?.generatorBackup ?? raw?.generator_backup) || 'Yes',
    machineryOwnership: text(raw?.machineryOwnership ?? raw?.machinery_ownership) || 'Owned by us',
    pollutionControlArrangement: text(raw?.pollutionControlArrangement ?? raw?.pollution_control_arrangement) || 'Own',
  }
}

export function emptyUndertakingLongDurationRow(): UndertakingLongDurationRow {
  return { typeOfTest: '', durationOfTest: '', dateOfCompletion: '' }
}

export function emptyUndertakingLongDurationPayload(): UndertakingLongDurationPayload {
  return {
    declarantName: '',
    place: '',
    testRows: [],
  }
}

export function parseUndertakingLongDurationPayload(raw: Record<string, unknown> | null): UndertakingLongDurationPayload {
  const sourceRows = Array.isArray(raw?.testRows) ? raw.testRows : []
  const testRows = sourceRows
    .filter((row): row is Record<string, unknown> => Boolean(row) && typeof row === 'object' && !Array.isArray(row))
    .map((row) => ({
      typeOfTest: text(row.typeOfTest ?? row.type_of_test),
      durationOfTest: text(row.durationOfTest ?? row.duration_of_test),
      dateOfCompletion: text(row.dateOfCompletion ?? row.date_of_completion),
    }))
    .filter((row) => row.typeOfTest || row.durationOfTest || row.dateOfCompletion)
  return {
    declarantName: text(raw?.declarantName ?? raw?.declarant_name),
    place: text(raw?.place),
    testRows: testRows.length ? testRows : emptyUndertakingLongDurationPayload().testRows,
  }
}

export function emptyUndertakingMinimumFeePayload(): UndertakingMinimumFeePayload {
  return {
    firmStatus: '',
    annualProductionCapacity: '',
    valueOfProductionPerUnit: '',
    costOfProductionPerUnit: '',
    marketSurveillancePlan: '',
    bisLabTestingCharges: '',
    oslAvgTestingCharges: '',
    testingChargeBasis: '',
    marketSampleQuantity: '',
    marketSampleCost: '',
    factoryTestingBasis: 'No',
    factoryMandays: '',
    factoryVisitRate: '',
    factorySampleCount: '2',
    marketSampleCount: '2',
    factorySampleRate: '',
    marketSampleRate: '',
    overheadCost: '37000',
    mmfLarge: '',
    mmfMsme: '',
    finalUnitRate: '',
    slab1Text: '',
    slab2Text: '',
    slab3Text: '',
  }
}

export function parseUndertakingMinimumFeePayload(raw: Record<string, unknown> | null): UndertakingMinimumFeePayload {
  const defaults = emptyUndertakingMinimumFeePayload()
  const parsed = { ...defaults }
  for (const key of Object.keys(defaults) as Array<keyof UndertakingMinimumFeePayload>) {
    parsed[key] = text(raw?.[key]) || defaults[key]
  }
  if (!parsed.testingChargeBasis) {
    if (parsed.bisLabTestingCharges && parsed.bisLabTestingCharges.toLowerCase() !== 'none') parsed.testingChargeBasis = 'BIS Lab'
    else if (parsed.oslAvgTestingCharges) parsed.testingChargeBasis = 'OSL Complete Testing'
  }
  return parsed
}
