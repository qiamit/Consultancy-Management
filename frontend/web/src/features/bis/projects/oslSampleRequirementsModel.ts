/** OSL Sample Requirements — QE data model, QI/LIMS UI persistence. */

export type OslSampleFor = 'osl' | 'ft' | 'it'
export type OslSamplePriority = 'Priority' | 'Non Priority'

export type OslSampleRequirementRow = {
  id: string
  sampleFor: OslSampleFor
  sampleCode: string
  qrCode: string
  priority: OslSamplePriority
  batchNumber: string
  dateOfManufacturing: string
  shelfLife: string
  sampleQuantity: string
  sampleType: string
  modeOfDisposal: string
  testRequired: string
  serialNumber: string
  gradeTypeVariety: string
  declaredValue: string
  batchQuantity: string
  laboratoryName: string
  destinationLab: string
  sampleDescription: string
  additionalInformation: string
  testingCharges: string
  paymentRef: string
  paymentDate: string
  paymentMode: string
  includeInPrint: boolean
  /** Attached Manak Test Request PDF (bis_project_files). */
  testRequestFileId: string
  testRequestFileName: string
  testRequestStoragePath: string
  /** Attached courier / dispatch slip PDF or image. */
  courierSlipFileId: string
  courierSlipFileName: string
  courierSlipStoragePath: string
  /** Attached lab / factory Test Report PDF. */
  testReportFileId: string
  testReportFileName: string
  testReportStoragePath: string
}

export type OslSampleRequirementsModulePayload = {
  rows: OslSampleRequirementRow[]
  /** Pool of Manak “Not Used” QR codes imported via QE extension. */
  importedQrCodes: string[]
  signatoryName: string
  signatoryDesignation: string
}

export function todayYmdLocal(d = new Date()): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function sampleForLabel(value: OslSampleFor): string {
  if (value === 'ft') return 'FT'
  if (value === 'it') return 'IT'
  return 'OSL'
}

export function parseSampleFor(raw: unknown, fallback: OslSampleFor = 'osl'): OslSampleFor {
  const v = String(raw ?? '')
    .trim()
    .toLowerCase()
  if (v === 'ft' || v === 'factory' || v === 'factory_test') return 'ft'
  if (
    v === 'it' ||
    v === 'pi' ||
    v === 'inspection' ||
    v === 'preliminary' ||
    v === 'preliminary_inspection'
  ) {
    return 'it'
  }
  if (v === 'osl' || v === 'outside' || v === 'outside_lab') return 'osl'
  return fallback
}

function parsePriority(raw: unknown): OslSamplePriority {
  return String(raw ?? '').trim() === 'Non Priority' ? 'Non Priority' : 'Priority'
}

let oslRowSeq = 0

function nextOslRowId(): string {
  oslRowSeq += 1
  return `osl-row-${Date.now()}-${oslRowSeq}`
}

export function emptyOslSampleRequirementRow(sampleFor: OslSampleFor = 'osl'): OslSampleRequirementRow {
  return {
    id: nextOslRowId(),
    sampleFor,
    sampleCode: '',
    qrCode: '',
    priority: 'Priority',
    batchNumber: '',
    dateOfManufacturing: todayYmdLocal(),
    shelfLife: 'Life Long',
    sampleQuantity: '1 Mtr X 2 Nos + 50 mm X 5 Nos',
    sampleType: 'AS',
    modeOfDisposal: 'To be Disposed',
    testRequired: 'All Test',
    serialNumber: '',
    gradeTypeVariety: '',
    declaredValue: '',
    batchQuantity: '0.50 Tonne Approx',
    laboratoryName: '',
    destinationLab: '',
    sampleDescription: '',
    additionalInformation: '',
    testingCharges: '',
    paymentRef: '654321',
    paymentDate: todayYmdLocal(),
    paymentMode: 'Cheque',
    includeInPrint: true,
    testRequestFileId: '',
    testRequestFileName: '',
    testRequestStoragePath: '',
    courierSlipFileId: '',
    courierSlipFileName: '',
    courierSlipStoragePath: '',
    testReportFileId: '',
    testReportFileName: '',
    testReportStoragePath: '',
  }
}

export function emptyOslSampleRequirementsPayload(): OslSampleRequirementsModulePayload {
  return {
    rows: [],
    importedQrCodes: [],
    signatoryName: '',
    signatoryDesignation: '',
  }
}

/** Unique 12-digit (or longer digit) QR codes, insertion order preserved. */
export function normalizeImportedQrCodes(raw: unknown): string[] {
  const list = Array.isArray(raw) ? raw : []
  const out: string[] = []
  const seen = new Set<string>()
  for (const item of list) {
    const code = String(item ?? '').replace(/\D/g, '')
    if (code.length < 12 || seen.has(code)) continue
    seen.add(code)
    out.push(code)
  }
  return out
}

/** Imported codes not yet assigned to a sample row. */
export function availableImportedQrCodes(payload: OslSampleRequirementsModulePayload): string[] {
  const used = new Set(
    (payload.rows ?? []).map((r) => r.qrCode.replace(/\D/g, '')).filter((c) => c.length >= 12),
  )
  return (payload.importedQrCodes ?? []).filter((code) => !used.has(code.replace(/\D/g, '')))
}

export function oslSampleRowHasContent(row: OslSampleRequirementRow): boolean {
  return Boolean(
    row.sampleDescription.trim() ||
      row.gradeTypeVariety.trim() ||
      row.declaredValue.trim() ||
      row.batchNumber.trim() ||
      row.sampleCode.trim() ||
      row.qrCode.trim() ||
      row.laboratoryName.trim() ||
      row.additionalInformation.trim(),
  )
}

function str(raw: unknown): string {
  return String(raw ?? '').trim()
}

/** Accepts camelCase (QI) and snake_case (QE) keys. */
export function parseOslSampleRequirementRow(
  raw: Record<string, unknown>,
  fallbackFor: OslSampleFor = 'osl',
): OslSampleRequirementRow {
  const grade = str(raw.gradeTypeVariety ?? raw.grade_type_variety)
  const description = str(raw.sampleDescription ?? raw.sample_description)
  const resolvedGrade = grade || description
  const resolvedDescription = grade ? description : ''

  const id = str(raw.id ?? raw.row_id) || nextOslRowId()
  return {
    id,
    sampleFor: parseSampleFor(raw.sampleFor ?? raw.sample_for, fallbackFor),
    sampleCode: str(raw.sampleCode ?? raw.sample_code),
    qrCode: str(raw.qrCode ?? raw.qr_code),
    priority: parsePriority(raw.priority),
    batchNumber: str(raw.batchNumber ?? raw.batch_number),
    dateOfManufacturing: str(raw.dateOfManufacturing ?? raw.date_of_manufacturing),
    shelfLife: str(raw.shelfLife ?? raw.shelf_life) || 'Life Long',
    sampleQuantity:
      str(raw.sampleQuantity ?? raw.sample_quantity) || '1 Mtr X 2 Nos + 50 mm X 5 Nos',
    sampleType: str(raw.sampleType ?? raw.sample_type) || 'AS',
    modeOfDisposal: str(raw.modeOfDisposal ?? raw.mode_of_disposal) || 'To be Disposed',
    testRequired: str(raw.testRequired ?? raw.test_required) || 'All Test',
    serialNumber: str(raw.serialNumber ?? raw.serial_number),
    gradeTypeVariety: resolvedGrade,
    declaredValue: str(raw.declaredValue ?? raw.declared_value),
    batchQuantity: str(raw.batchQuantity ?? raw.batch_quantity) || '0.50 Tonne Approx',
    laboratoryName: str(raw.laboratoryName ?? raw.laboratory_name),
    destinationLab: str(raw.destinationLab ?? raw.destination_lab),
    sampleDescription: resolvedDescription,
    additionalInformation: str(raw.additionalInformation ?? raw.additional_information),
    testingCharges: str(raw.testingCharges ?? raw.testing_charges),
    paymentRef: str(raw.paymentRef ?? raw.payment_ref) || '654321',
    paymentDate: str(raw.paymentDate ?? raw.payment_date) || todayYmdLocal(),
    paymentMode: str(raw.paymentMode ?? raw.payment_mode) || 'Cheque',
    includeInPrint: raw.includeInPrint !== false && raw.include_in_print !== false,
    testRequestFileId: str(raw.testRequestFileId ?? raw.test_request_file_id),
    testRequestFileName: str(raw.testRequestFileName ?? raw.test_request_file_name),
    testRequestStoragePath: str(
      raw.testRequestStoragePath ?? raw.test_request_storage_path,
    ),
    courierSlipFileId: str(raw.courierSlipFileId ?? raw.courier_slip_file_id),
    courierSlipFileName: str(raw.courierSlipFileName ?? raw.courier_slip_file_name),
    courierSlipStoragePath: str(
      raw.courierSlipStoragePath ?? raw.courier_slip_storage_path,
    ),
    testReportFileId: str(raw.testReportFileId ?? raw.test_report_file_id),
    testReportFileName: str(raw.testReportFileName ?? raw.test_report_file_name),
    testReportStoragePath: str(
      raw.testReportStoragePath ?? raw.test_report_storage_path,
    ),
  }
}

/** Row highlight for Sample Requirements list (Sample Code + Test Request status). */
export type OslSampleRowStatusTone = 'blank' | 'waiting-tr' | 'complete'

export function oslSampleRowStatusTone(row: OslSampleRequirementRow): OslSampleRowStatusTone {
  const hasCode = Boolean(row.sampleCode.trim())
  const hasTr = Boolean(row.testRequestStoragePath.trim())
  if (!hasCode) return 'blank'
  if (!hasTr) return 'waiting-tr'
  return 'complete'
}

export function parseOslSampleRequirementsPayload(
  payload: Record<string, unknown> | null,
): OslSampleRequirementsModulePayload {
  const rawRows = Array.isArray(payload?.rows) ? payload.rows : []
  const rows = rawRows
    .map((item) =>
      item && typeof item === 'object' && !Array.isArray(item)
        ? parseOslSampleRequirementRow(item as Record<string, unknown>)
        : emptyOslSampleRequirementRow(),
    )
    .filter(Boolean)

  return {
    rows,
    importedQrCodes: normalizeImportedQrCodes(
      payload?.importedQrCodes ?? payload?.imported_qr_codes,
    ),
    signatoryName: str(payload?.signatoryName),
    signatoryDesignation: str(payload?.signatoryDesignation),
  }
}
