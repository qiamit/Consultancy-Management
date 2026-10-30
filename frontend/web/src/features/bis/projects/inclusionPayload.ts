/**
 * Data for the QE Consultancy extension's "Inclusion" section (Manak Assist on BIS New Inclusion).
 * The extension fills Manak "Application For Change in Scope (Inclusion)" from this
 * (frontend/extensions/QE-Extension-Dev/inclusion-fill.js — keep the shape in sync).
 */
import { PDFDocument } from 'pdf-lib'
import { supabase } from '@/lib/supabaseClient'
import { DEFAULT_BIS_DOCUMENT_PRINT_PAGE_SETTINGS } from '../print/bisDocumentPrintPageSettings'
import { inclusionAdditionRows } from '../print/inclusionRequestLetterHtml'
import { BIS_PRINT_DOCUMENT_LABEL, buildBisDocumentHtml, type BisPrintDocumentKind } from '../print/printBisDocument'
import { buildBisDocumentPdfBlob } from './bisDocumentPdf'
import { buildExcelWorkbook } from './bisExcelWorkbook'
import { fetchBisModulePayload } from './bisModuleDataApi'
import { BIS_PROJECT_FILES_BUCKET } from './bisProjectFilesApi'
import { loadBisProjectPrintPageSettings } from './bisPrintPageSettingsApi'
import {
  INCLUSION_COMPONENTS_KIND,
  INCLUSION_DETAILS_KIND,
  INCLUSION_OTHER_DOCS_KIND,
  inclusionQrCodes,
  inclusionRequired,
  parseInclusionVarieties,
} from './inclusionModel'
import { requireManakCmL } from './manakExtensionBridge'
import { buildMergedBisProjectFilesPdf } from './mergeBisProjectFilesPdf'
import type { BisProjectRow } from './types'

type Rec = Record<string, unknown>

export type ManakInclusionFile = { slot: 'machinery' | 'equipment' | 'other'; label: string; url: string; fileName: string; mime: string }

export type ManakInclusionPayload = {
  kind: 'QE_MANAK_INCLUSION_V1'
  projectId: string
  /** CM/L digits — the extension finds the licence row on Manak's "Granted Licenses" list by it. */
  cmlNo: string
  firmName: string
  isNumber: string
  /** inclusionType: Manak option value — "1" With Test Report, "0" Without Test Report. */
  varieties: Array<{ variety: string; inclusionType: '1' | '0'; qrCodes: string[]; delayReason: string }>
  machineryRequired: boolean
  equipmentRequired: boolean
  files: ManakInclusionFile[]
  copiedAt: string
}

const LINK_SECONDS = 60 * 60 * 3
const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

async function upload(path: string, blob: Blob, contentType: string): Promise<string> {
  const { error } = await supabase.storage.from(BIS_PROJECT_FILES_BUCKET).upload(path, blob, { upsert: true, contentType })
  if (error) throw error
  const { data, error: linkError } = await supabase.storage.from(BIS_PROJECT_FILES_BUCKET).createSignedUrl(path, LINK_SECONDS)
  if (linkError) throw linkError
  return data.signedUrl
}

function letterOn(components: Rec | null): boolean {
  const map = components?.applicable && typeof components.applicable === 'object' ? (components.applicable as Rec) : {}
  return map['request-letter'] !== 'No'
}

/**
 * Manak takes one "Any Other Document": the request letter (when applicable) followed by every uploaded
 * inclusion document, in upload order. Null when there is nothing to send.
 */
export async function buildInclusionOtherDocumentPdf(row: BisProjectRow): Promise<Blob | null> {
  const components = await fetchBisModulePayload(row.id, INCLUSION_COMPONENTS_KIND).catch(() => null)
  const merged = await PDFDocument.create()
  if (letterOn(components)) {
    const settings = await loadBisProjectPrintPageSettings(row.id).catch(() => DEFAULT_BIS_DOCUMENT_PRINT_PAGE_SETTINGS)
    const letter = await buildBisDocumentPdfBlob(row, 'inclusion-request-letter', settings)
    const src = await PDFDocument.load(await letter.arrayBuffer(), { ignoreEncryption: true })
    for (const page of await merged.copyPages(src, src.getPageIndices())) merged.addPage(page)
  }
  const uploads = await buildMergedBisProjectFilesPdf(row.id, [INCLUSION_OTHER_DOCS_KIND], { ignoreUnsupported: true })
  if (uploads) {
    const src = await PDFDocument.load(uploads, { ignoreEncryption: true })
    for (const page of await merged.copyPages(src, src.getPageIndices())) merged.addPage(page)
  }
  if (merged.getPageCount() === 0) return null
  const bytes = await merged.save()
  const copy = new Uint8Array(bytes.byteLength)
  copy.set(bytes)
  return new Blob([copy.buffer], { type: 'application/pdf' })
}

async function additionsWorkbook(row: BisProjectRow, kind: BisPrintDocumentKind): Promise<Blob> {
  return buildExcelWorkbook([{ title: BIS_PRINT_DOCUMENT_LABEL[kind], html: await buildBisDocumentHtml(row, kind) }])
}

export async function buildManakInclusionPayload(row: BisProjectRow): Promise<ManakInclusionPayload> {
  // Without a 10-digit CM/L the extension cannot tell this licence's row apart on Manak.
  const cmlNo = requireManakCmL(row.cm_l_digits, 'Inclusion')
  const [details, components, machinery, equipment] = await Promise.all([
    fetchBisModulePayload(row.id, INCLUSION_DETAILS_KIND).catch(() => null),
    fetchBisModulePayload(row.id, INCLUSION_COMPONENTS_KIND).catch(() => null),
    fetchBisModulePayload(row.id, 'cmpf-305').catch(() => null),
    fetchBisModulePayload(row.id, 'cmpf-306').catch(() => null),
  ])
  const varieties = parseInclusionVarieties(details)
  if (!varieties.length) {
    throw new Error('Add at least one variety under New Scope (Licence step) before Manak Assist.')
  }
  const machineryRequired = inclusionRequired(components, 'machinery', inclusionAdditionRows(machinery).length)
  const equipmentRequired = inclusionRequired(components, 'equipment', inclusionAdditionRows(equipment).length)
  // "Required" uploads the added rows only; with none marked the list Manak gets would be empty.
  if (machineryRequired && !inclusionAdditionRows(machinery).length) {
    throw new Error('Additional machinery is set to Yes, but no CMPF-305 row is marked "Added for Inclusion" (Machinery step).')
  }
  if (equipmentRequired && !inclusionAdditionRows(equipment).length) {
    throw new Error('Additional testing equipment is set to Yes, but no CMPF-306 row is marked "Added for Inclusion" (Machinery step).')
  }

  const base = `${row.id}/manak-assist`
  const files: ManakInclusionFile[] = []
  const [machineryUrl, equipmentUrl, other] = await Promise.all([
    machineryRequired ? upload(`${base}/inclusion-machinery.xlsx`, await additionsWorkbook(row, 'inclusion-cmpf-305'), XLSX) : Promise.resolve(''),
    equipmentRequired ? upload(`${base}/inclusion-testing-equipment.xlsx`, await additionsWorkbook(row, 'inclusion-cmpf-306'), XLSX) : Promise.resolve(''),
    buildInclusionOtherDocumentPdf(row),
  ])
  if (machineryUrl) files.push({ slot: 'machinery', label: 'Modified Machinery List', url: machineryUrl, fileName: 'Additional-Machinery-List.xlsx', mime: XLSX })
  if (equipmentUrl) files.push({ slot: 'equipment', label: 'Modified Testing Equipment List', url: equipmentUrl, fileName: 'Additional-Testing-Equipment-List.xlsx', mime: XLSX })
  if (other) {
    const url = await upload(`${base}/inclusion-other-document.pdf`, other, 'application/pdf')
    files.push({ slot: 'other', label: 'Any Other Document', url, fileName: 'Inclusion-Request-and-Documents.pdf', mime: 'application/pdf' })
  }

  return {
    kind: 'QE_MANAK_INCLUSION_V1',
    projectId: row.id,
    cmlNo,
    firmName: String(row.client?.company_name ?? '').trim(),
    isNumber: String(row.is_code?.is_number ?? '').trim(),
    varieties: varieties.map((v) => ({
      variety: v.variety,
      inclusionType: v.inclusionType === 'Without Test Report' ? '0' : '1',
      qrCodes: v.inclusionType === 'Without Test Report' ? [] : inclusionQrCodes(v.qrCode),
      delayReason: v.delayReason,
    })),
    machineryRequired,
    equipmentRequired,
    files,
    copiedAt: new Date().toISOString(),
  }
}
