import { BIS_PRINT_DOCUMENT_LABEL, type BisPrintDocumentKind } from '../print/printBisDocument'
import { inclusionAdditionRows } from '../print/inclusionRequestLetterHtml'
import type { BisApplicationStep } from './bisApplicationSteps'
import type { PreviewFile, Row } from './applicationDocuments'
import {
  INCLUSION_COMPONENTS_KIND,
  INCLUSION_DETAILS_KIND,
  INCLUSION_OTHER_DOCS_KIND,
  INCLUSION_SCOPE_FILES_KIND,
  inclusionQrCodes,
  inclusionRequired,
  parseInclusionVarieties,
} from './inclusionModel'
import { TEST_REPORT_COMPONENTS_KIND } from './manakModuleKinds'
import type { BisProjectRow } from './types'

type Rec = Record<string, unknown>

/** Steps mirror Manak "Application For Change in Scope (Inclusion)"; the last step is Preview (Submit / payment stays on Manak). */
export const BIS_INCLUSION_STEPS: BisApplicationStep[] = [
  {
    id: 'inc-licence',
    label: 'Licence & Existing Scope',
    title: 'Licence & Existing Scope',
    manakHint: 'Licence number and the existing scope Manak shows above "Add Varieties".',
    kinds: [],
  },
  {
    // Same module as the New Application's Test Reports step: samples, QR import / generation and the
    // test requests go through Manak (extension); the QR codes feed "Add Varieties".
    id: 'test-reports',
    label: 'Test Reports',
    title: 'Test Reports',
    manakHint: 'Sample offer letter and test request (QR codes from Manak), factory test report, long duration and raw material test reports.',
    kinds: ['osl-offer-and-test-request', 'factory-test-report', 'undertaking-long-duration', 'raw-material-test-reports', 'osl-sample-requirements', 'osl-sample-test-request'],
  },
  {
    id: 'inc-varieties',
    label: 'Add Varieties',
    title: 'Add Varieties',
    manakHint: 'Inclusion type, sample QR code(s), reason for an old test report and the variety — one row per variety.',
    kinds: [],
  },
  {
    id: 'inc-lists',
    label: 'Machinery & Testing Equipment',
    title: 'Declaration by the Licensee',
    manakHint: 'Additional machinery / testing equipment required for the new variety(s): only the added rows are uploaded.',
    kinds: ['inclusion-cmpf-305', 'inclusion-cmpf-306'],
  },
  {
    id: 'inc-documents',
    label: 'Request Letter & Documents',
    title: 'Request Letter & Other Documents',
    manakHint: 'The request letter and the uploaded documents are merged into the one "Any Other Document" PDF.',
    kinds: ['inclusion-request-letter'],
  },
]

export const BIS_INCLUSION_PREVIEW_LABEL = 'Preview Inclusion'

/** Module payloads the inclusion preview reads. */
export const INCLUSION_PREVIEW_KINDS: BisPrintDocumentKind[] = [INCLUSION_DETAILS_KIND, INCLUSION_COMPONENTS_KIND, 'cmpf-305', 'cmpf-306', TEST_REPORT_COMPONENTS_KIND, 'osl-sample-requirements']

/** Sample files that belong to the current sample rows (old uploads of removed / replaced samples are left out). */
export function currentSampleFiles(files: PreviewFile[], samples: Rec[], onlyQrCodes?: Set<string>) {
  const KEYS: Record<string, [string, string]> = {
    'osl-sample-test-request': ['testRequestStoragePath', 'Test Request'],
    'osl-sample-test-report': ['testReportStoragePath', 'Test Report'],
  }
  const out: Array<{ file: PreviewFile; label: string }> = []
  for (const file of files) {
    const meta = KEYS[file.doc_kind]
    if (!meta) continue
    const sample = samples.find((s) => String(s[meta[0]] ?? '').trim() === file.storage_path)
    if (!sample) continue
    if (onlyQrCodes && onlyQrCodes.size && !onlyQrCodes.has(String(sample.qrCode ?? '').replace(/\D/g, ''))) continue
    const batch = String(sample.batchNumber ?? '').trim()
    out.push({ file, label: batch ? `${meta[1]} - ${batch}` : meta[1] })
  }
  return out
}

export function buildInclusionDocumentRows(_row: BisProjectRow, payloads: Partial<Record<string, Rec | null>>, files: PreviewFile[]): Row[] {
  const components = payloads[INCLUSION_COMPONENTS_KIND] ?? null
  const rows: Row[] = []
  const doc = (step: number, kind: BisPrintDocumentKind, label?: string) =>
    rows.push({ id: `doc:${kind}`, step, type: 'doc', kind, label: label ?? BIS_PRINT_DOCUMENT_LABEL[kind] })
  const fileRow = (step: number, file: PreviewFile, label: string) => rows.push({ id: `file:${file.id}`, step, type: 'file', file, label })
  const ofKind = (kind: string) => files.filter((f) => f.doc_kind === kind)

  /* Step 1 — files attached to the New Scope rows. */
  for (const f of ofKind(INCLUSION_SCOPE_FILES_KIND)) fileRow(0, f, `New Scope Attachment — ${f.file_name.replace(/^\[(draft|r\d+)\] /, '')}`)

  /* Step 2 — Test Reports, with the same Applicable choices (and keys) as the New Application's step. */
  const testReports = payloads[TEST_REPORT_COMPONENTS_KIND]
  const applicable = (key: string, fallback: 'Yes' | 'No') => {
    const map = testReports?.applicable && typeof testReports.applicable === 'object' ? (testReports.applicable as Rec) : {}
    return (map[key] ?? fallback) === 'Yes'
  }
  if (applicable('sample-offer', 'Yes')) doc(1, 'osl-offer-and-test-request', 'Sample Offer Letter')
  if (applicable('factory-test-report', 'Yes')) doc(1, 'factory-test-report')
  // Test requests / reports of the samples whose QR codes are picked on "Add Varieties" (all samples until one is picked).
  const samples = Array.isArray(payloads['osl-sample-requirements']?.rows) ? (payloads['osl-sample-requirements']!.rows as Rec[]) : []
  const picked = new Set(parseInclusionVarieties(payloads[INCLUSION_DETAILS_KIND]).flatMap((v) => inclusionQrCodes(v.qrCode)))
  for (const { file, label } of currentSampleFiles(files, samples, picked)) fileRow(1, file, label)
  if (applicable('long-duration', 'No')) {
    doc(1, 'undertaking-long-duration')
    for (const f of [...ofKind('long-duration-inhouse-report'), ...ofKind('long-duration-lab-report')]) fileRow(1, f, f.file_name)
  }
  if (applicable('raw-material-test-reports', 'No')) {
    doc(1, 'raw-material-test-reports')
    for (const f of ofKind('raw-material-test-report')) fileRow(1, f, `Raw Material Test Report — ${f.file_name}`)
  }

  /* Step 4 — the modified lists Manak asks for. */
  if (inclusionRequired(components, 'machinery', inclusionAdditionRows(payloads['cmpf-305']).length)) doc(3, 'inclusion-cmpf-305')
  if (inclusionRequired(components, 'equipment', inclusionAdditionRows(payloads['cmpf-306']).length)) doc(3, 'inclusion-cmpf-306')

  /* Step 5 — request letter (when Applicable) and the uploaded documents, in upload order. */
  const map = components?.applicable && typeof components.applicable === 'object' ? (components.applicable as Rec) : {}
  if (map['request-letter'] !== 'No') doc(4, 'inclusion-request-letter')
  for (const f of ofKind(INCLUSION_OTHER_DOCS_KIND)) fileRow(4, f, f.file_name)
  return rows
}

export const inclusionStepTitle = (step: number) => BIS_INCLUSION_STEPS[step]?.title ?? 'Other'
