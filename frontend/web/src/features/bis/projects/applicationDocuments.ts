/**
 * Every document of an application, in Step 8 order: generated documents marked Applicable on Steps 1–7
 * and every uploaded file (signatures, seals and other image assets left out). Used by Step 8 (Preview),
 * Step 7 Other Information and Manak Assist.
 */
import { supabase } from '@/lib/supabaseClient'
import { BIS_PRINT_DOCUMENT_LABEL, type BisPrintDocumentKind } from '../print/printBisDocument'
import { fetchBisModulePayload } from './bisModuleDataApi'
import type { BisProjectViewFile } from './bisProjectFilesApi'
import {
  APPLICATION_DECLARATION_KIND,
  MANUFACTURING_COMPONENTS_KIND,
  PACKAGING_COMPONENTS_KIND,
  TEST_REPORT_COMPONENTS_KIND,
  TESTING_COMPONENTS_KIND,
} from './manakModuleKinds'
import { rowToBisApplicationDetailsForm, type BisProjectRow } from './types'

type Rec = Record<string, unknown>
type YesNo = 'Yes' | 'No'
export type PreviewFile = BisProjectViewFile & { doc_kind: string }

export type PreviewSelection = {
  previewKinds: BisPrintDocumentKind[]
  previewFiles: PreviewFile[]
  printKinds: BisPrintDocumentKind[]
  printFiles: PreviewFile[]
  pdfKinds: BisPrintDocumentKind[]
  pdfFiles: PreviewFile[]
  wordKinds: BisPrintDocumentKind[]
  excelKinds: BisPrintDocumentKind[]
}

export type DocRow = { id: string; step: number; type: 'doc'; kind: BisPrintDocumentKind; label: string }
export type FileRow = { id: string; step: number; type: 'file'; file: PreviewFile; label: string }
export type Row = DocRow | FileRow

/** Generated documents per step; `when` decides if the row applies (Applicable choices on the step). */
type Entry = { step: number; kind: BisPrintDocumentKind; label?: string; when?: (ctx: Ctx) => boolean }
type Ctx = { applicable: (componentsKind: BisPrintDocumentKind, key: string, fallback: YesNo) => boolean; payloads: Partial<Record<string, Rec | null>>; option2: boolean }

const ENTRIES: Entry[] = [
  { step: 0, kind: 'application-copy', label: 'Application Copy' },
  { step: 0, kind: 'location-map', label: 'Location Map' },
  { step: 0, kind: 'manufacturing-scope', label: 'Undertaking for Manufacturing Scope' },
  { step: 0, kind: 'marking-fee-acceptance', label: 'Acceptance of Marking Fee' },
  { step: 0, kind: 'cmpf-311' },
  { step: 1, kind: 'top-management' },
  { step: 1, kind: 'technical-staff' },
  { step: 2, kind: 'raw-material-details', when: (c) => c.applicable(MANUFACTURING_COMPONENTS_KIND, 'raw-material', 'Yes') },
  { step: 2, kind: 'certified-reference-materials', when: (c) => c.applicable(MANUFACTURING_COMPONENTS_KIND, 'crm', 'No') },
  { step: 2, kind: 'process-flow-chart', when: (c) => c.applicable(MANUFACTURING_COMPONENTS_KIND, 'process-flow-chart', 'Yes') },
  { step: 2, kind: 'process-description', when: (c) => c.applicable(MANUFACTURING_COMPONENTS_KIND, 'process-description', 'Yes') },
  { step: 2, kind: 'plant-layout', when: (c) => c.applicable(MANUFACTURING_COMPONENTS_KIND, 'plant-layout', 'Yes') },
  { step: 2, kind: 'cmpf-305', when: (c) => c.applicable(MANUFACTURING_COMPONENTS_KIND, 'machinery', 'Yes') },
  { step: 2, kind: 'manufacturing-subcontracting', when: (c) => c.applicable(MANUFACTURING_COMPONENTS_KIND, 'subcontracting', 'No') },
  { step: 2, kind: 'hygiene-conditions', when: (c) => c.applicable(MANUFACTURING_COMPONENTS_KIND, 'hygiene', 'No') },
  { step: 3, kind: 'self-evaluation-form', when: (c) => c.applicable(PACKAGING_COMPONENTS_KIND, 'packaging', 'Yes') },
  { step: 3, kind: 'cmpf-307', when: (c) => c.applicable(PACKAGING_COMPONENTS_KIND, 'brand', 'Yes') },
  { step: 4, kind: 'cmpf-306', when: (c) => c.applicable(TESTING_COMPONENTS_KIND, 'equipment', 'Yes') },
  { step: 4, kind: 'subcontracted-tests', label: 'Tests Intended to be Sub-Contracted', when: (c) => c.payloads[TESTING_COMPONENTS_KIND]?.inHouseTesting === 'No' },
  { step: 5, kind: 'osl-offer-and-test-request', when: (c) => c.applicable(TEST_REPORT_COMPONENTS_KIND, 'sample-offer', 'Yes') },
  { step: 5, kind: 'factory-test-report', when: (c) => c.applicable(TEST_REPORT_COMPONENTS_KIND, 'factory-test-report', 'Yes') },
  { step: 5, kind: 'undertaking-long-duration', when: (c) => c.applicable(TEST_REPORT_COMPONENTS_KIND, 'long-duration', 'No') },
  { step: 5, kind: 'raw-material-test-reports', when: (c) => c.applicable(TEST_REPORT_COMPONENTS_KIND, 'raw-material-test-reports', 'No') },
  { step: 6, kind: 'authorization-letter', when: (c) => c.applicable(APPLICATION_DECLARATION_KIND, 'authorizationLetter', 'Yes') },
  { step: 6, kind: 'undertaking-option-2', when: (c) => c.applicable(APPLICATION_DECLARATION_KIND, 'undertakingOption2', c.option2 ? 'Yes' : 'No') },
  { step: 6, kind: 'undertaking-general', when: (c) => c.applicable(APPLICATION_DECLARATION_KIND, 'undertakingGeneral', 'Yes') },
  { step: 6, kind: 'undertaking-indian-standards', when: (c) => c.applicable(APPLICATION_DECLARATION_KIND, 'undertakingIndianStandards', 'No') },
  { step: 6, kind: 'undertaking-other', when: (c) => c.applicable(APPLICATION_DECLARATION_KIND, 'undertakingOther', 'No') },
]

/** Where each uploaded file kind belongs, and how it is named. Signatures, seals and other photos are images used inside documents. */
export const FILE_KINDS: Record<string, { step: number; label: string; fixed?: boolean; after?: BisPrintDocumentKind }> = {
  legal: { step: 0, label: 'Legal Document' },
  application: { step: 0, label: 'Application Document' },
  license: { step: 0, label: 'Licence Document' },
  branch: { step: 0, label: 'Branch Document' },
  'manufacturing-scope': { step: 0, label: 'Attach Copy of Manufacturing Scope (Drawings)', fixed: true, after: 'manufacturing-scope' },
  // QCI: Quality Control Incharge (Technical Staff).
  'technical-staff-appointment': { step: 1, label: 'Appointment Letter of QCI', fixed: true },
  'technical-staff-education-certificate': { step: 1, label: 'Educational Certificate of QCI', fixed: true },
  'technical-staff-photo': { step: 1, label: 'Passport Size Photo of QCI', fixed: true },
  'packaging-label': { step: 3, label: 'Form of Label' },
  'cmpf-307-agreement': { step: 3, label: 'Brand Agreement' },
  'cmpf-307-trademark-certificate': { step: 3, label: 'Trademark Certificate' },
  'calibration-certificates': { step: 4, label: 'Calibration Certificate' },
  'consent-letter': { step: 4, label: 'Consent Letter' },
  'osl-sample-test-request': { step: 5, label: 'Test Request' },
  'osl-sample-test-report': { step: 5, label: 'Test Report' },
  'osl-courier-slip': { step: 5, label: 'Courier Slip' },
  'long-duration-inhouse-report': { step: 5, label: 'In House / Old Test Report' },
  'long-duration-lab-report': { step: 5, label: 'Long Duration Test Report' },
  'raw-material-test-report': { step: 5, label: 'Raw Material Test Report' },
  'application-declaration': { step: 6, label: 'Declaration Attachment' },
}
// The QCI passport photo is a submission document; other photos, signatures and seals only appear inside documents.
export const isImageAsset = (docKind: string) => docKind !== 'technical-staff-photo' && /signature|photo|seal/i.test(docKind)


/** Module payloads whose Applicable choices decide which documents apply. */
export const APPLICATION_DOCUMENT_COMPONENT_KINDS = [
  MANUFACTURING_COMPONENTS_KIND,
  PACKAGING_COMPONENTS_KIND,
  TESTING_COMPONENTS_KIND,
  TEST_REPORT_COMPONENTS_KIND,
  APPLICATION_DECLARATION_KIND,
]

export function buildApplicationDocumentRows(
  row: BisProjectRow,
  payloads: Partial<Record<string, Rec | null>>,
  files: PreviewFile[],
): Row[] {
    const ctx: Ctx = {
      payloads,
      option2: rowToBisApplicationDetailsForm(row).applicationProcess === 'simplified',
      applicable: (componentsKind, key, fallback) => {
        const p = payloads[componentsKind]
        const map = p?.applicable && typeof p.applicable === 'object' ? (p.applicable as Rec) : {}
        const legacy = p?.[key]
        const value = map[key] ?? (legacy === 'Yes' || legacy === 'No' ? legacy : undefined) ?? fallback
        return value === 'Yes'
      },
    }
    const docs: Row[] = ENTRIES.filter((e) => !e.when || e.when(ctx)).map((e) => ({
      id: `doc:${e.kind}`,
      step: e.step,
      type: 'doc',
      kind: e.kind,
      label: e.label ?? BIS_PRINT_DOCUMENT_LABEL[e.kind],
    }))
    const placed = new Map<string, Row[]>()
    const loose: Row[] = []
    files.forEach((file) => {
      const meta = FILE_KINDS[file.doc_kind] ?? { step: 6, label: 'Uploaded File' }
      const r: Row = { id: `file:${file.id}`, step: meta.step, type: 'file', file, label: meta.fixed ? meta.label : `${meta.label} — ${file.file_name}` }
      if (meta.after && docs.some((d) => d.type === 'doc' && d.kind === meta.after)) placed.set(meta.after, [...(placed.get(meta.after) ?? []), r])
      else loose.push(r)
    })
    // Files tied to a document sit right below it; other files close their step.
    const ordered: Row[] = []
    for (let step = 0; step <= 6; step++) {
      for (const d of docs.filter((x) => x.step === step)) {
        ordered.push(d)
        if (d.type === 'doc') ordered.push(...(placed.get(d.kind) ?? []))
      }
      ordered.push(...loose.filter((x) => x.step === step))
    }
    return ordered
}

export async function loadApplicationDocumentRows(row: BisProjectRow): Promise<Row[]> {
  const kinds = APPLICATION_DOCUMENT_COMPONENT_KINDS
  const [loaded, filesRes] = await Promise.all([
    Promise.all(kinds.map((k) => fetchBisModulePayload(row.id, k).catch(() => null))),
    supabase.from('bis_project_files').select('id, file_name, storage_path, doc_kind').eq('bis_project_id', row.id).order('created_at', { ascending: true }),
  ])
  const payloads = Object.fromEntries(kinds.map((k, i) => [k, loaded[i] as Rec | null]))
  const files = ((filesRes.data ?? []) as PreviewFile[]).filter((f) => f.storage_path && !isImageAsset(f.doc_kind))
  return buildApplicationDocumentRows(row, payloads, files)
}

/**
 * Step 7 Other Information carries every application document as a PDF: all generated documents, and uploaded
 * files that are PDFs (images / spreadsheets left out), except Step 7's own declaration attachments.
 */
export function otherInformationDocumentRows(rows: Row[]): Row[] {
  const seen = new Set<string>()
  return rows.filter((r) => {
    if (r.type === 'file' && (!/\.pdf$/i.test(r.file.storage_path) || r.file.doc_kind === 'application-declaration')) return false
    // The same file uploaded twice (same name) goes once.
    const key = r.label.trim().toLowerCase()
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}
