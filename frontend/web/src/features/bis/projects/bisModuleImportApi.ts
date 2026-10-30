import { formatIsCodeLabel } from '@/features/masters/is-codes/formatIsCodeLabel'
import { isCodeDisplayLabel } from './types'
import { supabase } from '@/lib/supabaseClient'
import {
  ALL_BIS_PRINT_KINDS,
  BIS_PRINT_DOCUMENT_LABEL,
  printKindToStorageDocKind,
  type BisPrintDocumentKind,
} from '../print/printBisDocument'
import {
  BIS_PROJECT_FILES_BUCKET,
  docKindsForList,
  formatBisProjectFilesError,
  type BisProjectDocKind,
} from './bisProjectFilesApi'
import {
  copyBisModulePayload,
  fetchBisModulePayload,
  saveBisModulePayload,
} from './bisModuleDataApi'
import { fetchBisProjectById, saveBisApplicationDetails } from './bisProjectsApi'
import {
  formatDisplayDate,
  rowToBisApplicationDetailsForm,
  type BisProjectRow,
} from './types'

export type BisImportLookupOption = { id: string; label: string }

const IMPORT_PROJECT_SELECT =
  '*, client:clients(company_name), is_code:is_codes(is_number, title, revision_year, part_no, section_no, standard_prefix, unit_of_is)'

const STRUCTURED_MODULE_KINDS: BisPrintDocumentKind[] = [
  'top-management',
  'technical-staff',
  'osl-sample-requirements',
  'factory-test-report',
  'location-map',
  'plant-layout',
  'cmpf-305',
  'cmpf-306',
  'cmpf-307',
  'process-flow-chart',
]

export function isImportableBisModuleKind(kind: BisPrintDocumentKind): boolean {
  return (ALL_BIS_PRINT_KINDS as readonly string[]).includes(kind)
}

export function bisModuleDocKind(kind: BisPrintDocumentKind): BisProjectDocKind | null {
  if (!isImportableBisModuleKind(kind)) return null
  return printKindToStorageDocKind(kind)
}

type SourceFileRow = {
  id: string
  file_name: string
  storage_path: string
  file_size: number | null
  mime_type: string | null
  doc_kind: string
}

async function listSourceModuleFiles(
  projectId: string,
  docKind: BisProjectDocKind,
): Promise<SourceFileRow[]> {
  const kinds = docKindsForList(docKind)
  let query = supabase
    .from('bis_project_files')
    .select('id, file_name, storage_path, file_size, mime_type, doc_kind')
    .eq('bis_project_id', projectId)
    .order('created_at', { ascending: true })
  query = kinds.length === 1 ? query.eq('doc_kind', kinds[0]) : query.in('doc_kind', kinds)
  const { data, error } = await query
  if (error) throw new Error(formatBisProjectFilesError(error))
  return (Array.isArray(data) ? data : []) as SourceFileRow[]
}

async function deleteTargetModuleFiles(
  projectId: string,
  docKind: BisProjectDocKind,
): Promise<void> {
  const existing = await listSourceModuleFiles(projectId, docKind)
  if (existing.length === 0) return

  const { error: dbErr } = await supabase
    .from('bis_project_files')
    .delete()
    .in(
      'id',
      existing.map((f) => f.id),
    )
  if (dbErr) throw new Error(formatBisProjectFilesError(dbErr))

  const paths = existing.map((f) => f.storage_path).filter((p) => p.trim())
  if (paths.length > 0) {
    const { error: storageErr } = await supabase.storage
      .from(BIS_PROJECT_FILES_BUCKET)
      .remove(paths)
    if (storageErr && !/not found|no such|404/i.test(storageErr.message ?? '')) {
      throw new Error(formatBisProjectFilesError(storageErr))
    }
  }
}

async function copyOneFile(
  source: SourceFileRow,
  targetProjectId: string,
  targetDocKind: BisProjectDocKind,
): Promise<void> {
  const { data: blob, error: dlErr } = await supabase.storage
    .from(BIS_PROJECT_FILES_BUCKET)
    .download(source.storage_path)
  if (dlErr) throw new Error(formatBisProjectFilesError(dlErr))
  if (!blob) throw new Error(`Could not download file: ${source.file_name}`)

  const safeName = source.file_name.replace(/[^a-zA-Z0-9._-]/g, '_') || 'file'
  const path = `${targetProjectId}/${targetDocKind}/${crypto.randomUUID()}_${safeName}`
  const contentType = (source.mime_type ?? '').trim() || blob.type || 'application/octet-stream'

  const { error: upErr } = await supabase.storage
    .from(BIS_PROJECT_FILES_BUCKET)
    .upload(path, blob, { upsert: false, contentType })
  if (upErr) throw new Error(formatBisProjectFilesError(upErr))

  const writeKind =
    docKindsForList(targetDocKind).includes(source.doc_kind) && source.doc_kind
      ? source.doc_kind
      : targetDocKind

  const { error: metaErr } = await supabase.from('bis_project_files').insert({
    bis_project_id: targetProjectId,
    doc_kind: writeKind,
    file_name: source.file_name,
    storage_path: path,
    file_size: source.file_size ?? blob.size,
    mime_type: contentType,
  })
  if (metaErr) throw new Error(formatBisProjectFilesError(metaErr))
}

/**
 * Copies module files / structured fields / application details
 * from another Application / License into the current project.
 */
export async function importBisModuleFromProject(opts: {
  targetProjectId: string
  sourceProjectId: string
  kind: BisPrintDocumentKind
}): Promise<{ filesCopied: number; fieldsCopied: boolean }> {
  const { targetProjectId, sourceProjectId, kind } = opts
  if (targetProjectId === sourceProjectId) {
    throw new Error('Choose a different Application or License as the source.')
  }

  const docKind = bisModuleDocKind(kind)
  if (!docKind) {
    throw new Error(
      `${BIS_PRINT_DOCUMENT_LABEL[kind]} has no stored module data to import.`,
    )
  }

  const sourceProject = await fetchBisProjectById(sourceProjectId)
  if (!sourceProject) throw new Error('Source Application / License not found.')

  let filesCopied = 0
  let fieldsCopied = false

  if (kind === 'application-details') {
    const form = rowToBisApplicationDetailsForm(sourceProject)
    // CM/L, licence number, granted / validity and application number / date stay the target's own.
    await saveBisApplicationDetails(targetProjectId, form, { keepIdentity: true })
    fieldsCopied = true
  } else if (STRUCTURED_MODULE_KINDS.includes(kind)) {
    // Process Description shares Process Flow Chart payload.
    if (kind === 'process-flow-chart' || kind === 'process-description') {
      fieldsCopied = await copyBisModulePayload(
        sourceProjectId,
        targetProjectId,
        'process-flow-chart',
      )
      if (fieldsCopied) {
        const payload = await fetchBisModulePayload(targetProjectId, 'process-flow-chart')
        if (payload) {
          await saveBisModulePayload(targetProjectId, 'process-description', payload)
        }
      }
    } else {
      fieldsCopied = await copyBisModulePayload(sourceProjectId, targetProjectId, kind)
    }
  } else {
    await deleteTargetModuleFiles(targetProjectId, docKind)
    const sourceFiles = await listSourceModuleFiles(sourceProjectId, docKind)
    for (const file of sourceFiles) {
      await copyOneFile(file, targetProjectId, docKind)
    }
    filesCopied = sourceFiles.length
  }

  return { filesCopied, fieldsCopied }
}

export function formatImportSourceLabel(row: BisProjectRow): string {
  const kind = (row.project_kind ?? '').trim() || 'Project'
  const client = (row.client?.company_name ?? '').trim() || '—'
  const cmL = String(row.cm_l_digits ?? '').replace(/\D/g, '')
  const appNo = String(row.application_number ?? '').replace(/\D/g, '')
  const ref = cmL ? `CM/L-${cmL}` : appNo ? `CM/A-${appNo}` : ''
  const isCode = isCodeDisplayLabel(row)
  return [kind, client, ref, isCode].filter(Boolean).join(' · ')
}

/** Compact label once IS + Client are already chosen. */
export function formatImportDataLabel(row: BisProjectRow): string {
  const cmL = String(row.cm_l_digits ?? '').replace(/\D/g, '')
  const appNo = String(row.application_number ?? '').replace(/\D/g, '')
  const ref = cmL ? `CM/L-${cmL}` : appNo ? `CM/A-${appNo}` : ''
  const validity = row.license_validity_date
    ? `Valid till ${formatDisplayDate(row.license_validity_date)}`
    : null
  const title = (row.title ?? '').trim()
  const label = [ref, validity, title && title !== ref ? title : null].filter(Boolean).join(' · ')
  return label || (row.project_kind ?? '').trim() || 'Project'
}

/** Clients that already have at least one Application / License. */
export async function fetchImportClientOptions(
  search = '',
): Promise<BisImportLookupOption[]> {
  const { data, error } = await supabase
    .from('bis_projects')
    .select('client_id, client:clients(company_name)')
    .not('client_id', 'is', null)
    .limit(800)
  if (error) throw error

  const byId = new Map<string, BisImportLookupOption>()
  for (const raw of Array.isArray(data) ? data : []) {
    const row = raw as {
      client_id?: string | null
      client?: { company_name?: string | null } | null
    }
    const id = String(row.client_id ?? '').trim()
    if (!id || byId.has(id)) continue
    const label = (row.client?.company_name ?? '').trim() || 'Unnamed client'
    byId.set(id, { id, label })
  }

  const q = search.trim().toLowerCase()
  const rows = [...byId.values()].sort((a, b) =>
    a.label.localeCompare(b.label, 'en', { sensitivity: 'base' }),
  )
  if (!q) return rows
  return rows.filter((r) => r.label.toLowerCase().includes(q))
}

/** IS codes that the selected client already has Applications / Licenses for. */
export async function fetchImportIsCodeOptions(
  clientId: string,
  search = '',
): Promise<BisImportLookupOption[]> {
  const cId = clientId.trim()
  if (!cId) return []

  const { data, error } = await supabase
    .from('bis_projects')
    .select('is_code_id, is_code:is_codes(is_number, revision_year, title, part_no, section_no, standard_prefix)')
    .eq('client_id', cId)
    .not('is_code_id', 'is', null)
    .limit(800)
  if (error) throw error

  const byId = new Map<string, BisImportLookupOption>()
  for (const raw of Array.isArray(data) ? data : []) {
    const row = raw as {
      is_code_id?: string | null
      is_code?: {
        is_number?: string | null
        revision_year?: string | null
        title?: string | null
      } | null
    }
    const id = String(row.is_code_id ?? '').trim()
    if (!id || byId.has(id)) continue
    const label =
      (row.is_code ? formatIsCodeLabel(row.is_code) : '') ||
      (row.is_code?.title ?? '').trim() ||
      'IS Code'
    byId.set(id, { id, label })
  }

  const q = search.trim().toLowerCase()
  const rows = [...byId.values()].sort((a, b) =>
    a.label.localeCompare(b.label, 'en', { sensitivity: 'base' }),
  )
  if (!q) return rows
  return rows.filter((r) => r.label.toLowerCase().includes(q))
}

/** Applications / Licenses for selected Client + IS (import sources). */
export async function fetchImportSourceProjects(opts: {
  isCodeId: string
  clientId: string
  excludeProjectId?: string | null
}): Promise<BisProjectRow[]> {
  const isId = opts.isCodeId.trim()
  const clientId = opts.clientId.trim()
  if (!isId || !clientId) return []

  let query = supabase
    .from('bis_projects')
    .select(IMPORT_PROJECT_SELECT)
    .eq('is_code_id', isId)
    .eq('client_id', clientId)
    .order('updated_at', { ascending: false })
    .limit(100)

  const exclude = (opts.excludeProjectId ?? '').trim()
  if (exclude) query = query.neq('id', exclude)

  const { data, error } = await query
  if (error) throw error
  return (Array.isArray(data) ? data : []) as unknown as BisProjectRow[]
}

type FileRef = { id: string; name: string; path: string }

/** File references stored inside Top Management / Technical Staff rows and payloads. */
const PERSON_FILE_KEYS: FileRef[] = [
  { id: 'signatureFileId', name: 'signatureFileName', path: 'signatureStoragePath' },
  { id: 'appointmentLetterFileId', name: 'appointmentLetterFileName', path: 'appointmentLetterStoragePath' },
  { id: 'educationCertificateFileId', name: 'educationCertificateFileName', path: 'educationCertificateStoragePath' },
  { id: 'photoFileId', name: 'photoFileName', path: 'photoStoragePath' },
  { id: 'authorizedSignatureFileId', name: 'authorizedSignatureFileName', path: 'authorizedSignatureStoragePath' },
]

const text = (v: unknown) => (typeof v === 'string' ? v.trim() : v == null ? '' : String(v).trim())

/**
 * Copies one referenced file into the target project so the imported record owns its own copy
 * (deleting it later must never remove the source application's file).
 */
/** Copies one project file into another application (new storage object + bis_project_files row). */
export async function copyProjectFileToProject(
  sourceProjectId: string,
  targetProjectId: string,
  file: { id: string; file_name: string; storage_path: string },
  fallbackDocKind: string,
): Promise<{ id: string; file_name: string; storage_path: string } | null> {
  const copy = await duplicateReferencedFile(sourceProjectId, targetProjectId, { id: file.id, name: file.file_name, path: file.storage_path }, fallbackDocKind)
  return copy ? { id: copy.id, file_name: file.file_name, storage_path: copy.path } : null
}

async function duplicateReferencedFile(
  sourceProjectId: string,
  targetProjectId: string,
  ref: { id: string; name: string; path: string },
  fallbackDocKind: string,
): Promise<{ id: string; path: string } | null> {
  const { data: meta } = ref.id
    ? await supabase
        .from('bis_project_files')
        .select('doc_kind, mime_type, file_size')
        .eq('id', ref.id)
        .eq('bis_project_id', sourceProjectId)
        .maybeSingle()
    : { data: null }
  const { data: blob, error: dlErr } = await supabase.storage.from(BIS_PROJECT_FILES_BUCKET).download(ref.path)
  if (dlErr || !blob) return null

  const docKind = text((meta as { doc_kind?: unknown } | null)?.doc_kind) || fallbackDocKind
  const fileName = ref.name || ref.path.split('/').pop() || 'file'
  const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_') || 'file'
  const path = `${targetProjectId}/${docKind}/${crypto.randomUUID()}_${safeName}`
  const contentType = text((meta as { mime_type?: unknown } | null)?.mime_type) || blob.type || 'application/octet-stream'

  const { error: upErr } = await supabase.storage.from(BIS_PROJECT_FILES_BUCKET).upload(path, blob, { upsert: false, contentType })
  if (upErr) throw new Error(formatBisProjectFilesError(upErr))
  const { data: inserted, error: metaErr } = await supabase
    .from('bis_project_files')
    .insert({
      bis_project_id: targetProjectId,
      doc_kind: docKind,
      file_name: fileName,
      storage_path: path,
      file_size: blob.size,
      mime_type: contentType,
    })
    .select('id')
    .single()
  if (metaErr) throw new Error(formatBisProjectFilesError(metaErr))
  return { id: String((inserted as { id: unknown }).id), path }
}

/** Re-points every file reference in one record at a fresh copy in the target project. */
async function withCopiedFiles(
  record: Record<string, unknown>,
  sourceProjectId: string,
  targetProjectId: string,
  fallbackDocKind: string,
): Promise<{ record: Record<string, unknown>; files: number }> {
  const next = { ...record }
  let files = 0
  for (const keys of PERSON_FILE_KEYS) {
    const path = text(next[keys.path])
    if (!path) continue
    const copy = await duplicateReferencedFile(
      sourceProjectId,
      targetProjectId,
      { id: text(next[keys.id]), name: text(next[keys.name]), path },
      fallbackDocKind,
    )
    if (copy) {
      next[keys.id] = copy.id
      next[keys.path] = copy.path
      files += 1
    } else {
      // Source file is gone: drop the dangling reference instead of pointing at nothing.
      next[keys.id] = ''
      next[keys.name] = ''
      next[keys.path] = ''
    }
  }
  return { record: next, files }
}

/**
 * Imports Step 2 data (Top Management, Correspondence, Technical Staff) from any other
 * Application / License — same or another manufacturer. Replaces the target's data for each kind
 * that the source has, and copies signatures / documents so the two applications never share files.
 */
export async function importModulesWithFilesFromProject(opts: {
  targetProjectId: string
  sourceProjectId: string
  kinds: BisPrintDocumentKind[]
}): Promise<{ kindsCopied: number; recordsCopied: number; filesCopied: number }> {
  const { targetProjectId, sourceProjectId, kinds } = opts
  if (targetProjectId === sourceProjectId) {
    throw new Error('Choose a different Application or License as the source.')
  }
  let kindsCopied = 0
  let recordsCopied = 0
  let filesCopied = 0
  for (const kind of kinds) {
    const payload = await fetchBisModulePayload(sourceProjectId, kind)
    if (!payload) continue
    const fallbackDocKind = kind === 'top-management' ? 'top-management-signature' : `${kind}-document`
    const top = await withCopiedFiles(payload, sourceProjectId, targetProjectId, fallbackDocKind)
    const next = top.record
    filesCopied += top.files
    if (Array.isArray(payload.rows)) {
      const rows: Array<Record<string, unknown>> = []
      for (const row of payload.rows as Array<Record<string, unknown>>) {
        const copied = await withCopiedFiles(row && typeof row === 'object' ? row : {}, sourceProjectId, targetProjectId, fallbackDocKind)
        rows.push(copied.record)
        filesCopied += copied.files
        if (Object.values(copied.record).some((v) => typeof v === 'string' && v.trim())) recordsCopied += 1
      }
      next.rows = rows
    }
    await saveBisModulePayload(targetProjectId, kind, next)
    kindsCopied += 1
  }
  return { kindsCopied, recordsCopied, filesCopied }
}
