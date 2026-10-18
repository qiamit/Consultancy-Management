/**
 * Data for the QE Consultancy extension's "New Application" section (Manak Assist).
 * The extension fills Manak's Apply-for-new-licence steps from this
 * (frontend/extensions/qe-consultancy-chrome/newapp-fill.js — keep the shape in sync).
 */
import { supabase } from '@/lib/supabaseClient'
import { DEFAULT_BIS_DOCUMENT_PRINT_PAGE_SETTINGS } from '../print/bisDocumentPrintPageSettings'
import { loadBisPrintData } from '../print/loadBisPrintData'
import { packagingMarkingFieldsFrom } from '../print/manufacturingStepDocumentsHtml'
import { BIS_PRINT_DOCUMENT_LABEL, buildBisDocumentHtml, type BisPrintDocumentKind } from '../print/printBisDocument'
import { loadApplicationDocumentRows, otherInformationDocumentRows, otherInformationUploadChoice, otherInformationUploadOn } from './applicationDocuments'
import { buildBisDocumentPdfBlob } from './bisDocumentPdf'
import { buildExcelWorkbook } from './bisExcelWorkbook'
import { fetchBisModulePayload } from './bisModuleDataApi'
import { BIS_PROJECT_FILES_BUCKET } from './bisProjectFilesApi'
import { loadBisProjectPrintPageSettings } from './bisPrintPageSettingsApi'
import { parseCmpf311Payload } from './cmpf311Model'
import { APPLICATION_DECLARATION_KIND, CORRESPONDENCE_KIND, MANUFACTURING_COMPONENTS_KIND, TESTING_COMPONENTS_KIND, TEST_REPORT_COMPONENTS_KIND } from './manakModuleKinds'
import { parseBisNotesScope, type BisProjectRow } from './types'

type Rec = Record<string, unknown>
type YesNo = 'Yes' | 'No'

export type ManakNewAppFileSlot =
  | 'own-sit'
  | 'statutory'
  | 'other-info'
  | 'other-request'
  | 'auth-letter'
  | 'outsource-controls'
  | 'hygiene'
  | 'variety'
  | 'staff-education'
  | 'staff-photo'
  | 'label'
  | 'brand'
  | 'consent'
  | 'process-flow'
  | 'plant-layout'
  | 'machinery'
  | 'equipment'

export type ManakNewAppFile = {
  slot: ManakNewAppFileSlot
  /** Row index for files that belong to a table row (variety, staff, brand, sub-contracted test). */
  row?: number
  label: string
  url: string
  fileName: string
  mime: string
}

export type ManakNewAppPayload = {
  kind: 'QE_MANAK_NEWAPP_V1'
  projectId: string
  firmName: string
  isNumber: string
  isTitle: string
  applicationNumber: string
  /** isDigits / isLabel drive the step 1 IS search; procedureOption = Manak "Select Option". */
  general: { isDigits: string; isLabel: string; procedureOption: 'Option 1' | 'Option 2'; sitAccept: YesNo; varieties: Array<{ name: string }> }
  management: {
    topManagement: Array<{ name: string; designation: string; mobile: string; email: string; din: string }>
    correspondence: { addressType: string; name: string; designation: string; email: string; mobile: string }
    technicalStaff: Array<{ name: string; designation: string; qualification: string; experienceYears: string }>
  }
  manufacturing: {
    rawMaterials: Array<{ rawMaterial: string; supplierName: string; conformity: string; recordsMaintained: string; batches: string }>
    outsourcing: YesNo
    hygiene: YesNo
    productionUnit: string
    productionValue: string
    installedCapacity: string
  }
  packaging: {
    natureOfPackaging: string
    quantityPerPackage: string
    markingOnArticle: string
    methodOfMarking: string
    methodOfMarkingOther: string
    batchNumbering: string
    brands: Array<{ brandName: string; ownedBy: string; registeredStatus: string; registrationDate: string }>
  }
  /** laboratoryCode = OSL code from the Laboratory master; Manak's lab drop-down uses it as the option value. */
  testing: { inHouse: YesNo; subcontracted: Array<{ clauseNo: string; testName: string; laboratoryName: string; laboratoryCode: string }> }
  testReports: Array<{ variety: string; qrCode: string; sampleCode: string; complete: string; conformity: string }>
  /** Step 6 switches: long-duration tests and raw-material test reports (Test Reports step "applicable"). */
  testReportOptions: { longDuration: YesNo; rawMaterialReports: YesNo }
  /** weeklyOffDays: e.g. ["Sunday"]; empty = no weekly off. */
  /** Step 7 from the Declaration & Undertaking module (application-declaration). */
  declaration: {
    name: string
    designation: string
    weeklyOffDays: string[]
    statutoryPermissions: YesNo
    otherInformation: YesNo
    otherRequest: YesNo
    authorizationLetter: YesNo
  }
  files: ManakNewAppFile[]
  /** Uploads the portal asks for that are generated documents, not stored files — the user uploads these. */
  missingFiles: Array<{ step: string; label: string }>
  copiedAt: string
}

/** Signed links must outlive a full application walk. */
const LINK_SECONDS = 60 * 60 * 3

const validEmail = (v: string) => (/^[^@\s,;]+@[^@\s,;]+\.[a-z]{2,}$/i.test(v) ? v : '')
const str = (v: unknown) => (typeof v === 'string' ? v.trim() : v == null ? '' : String(v).trim())
const rowsOf = (p: Rec | null, key = 'rows'): Rec[] =>
  Array.isArray(p?.[key]) ? (p?.[key] as Rec[]).filter((r) => r && typeof r === 'object') : []

function mimeFor(name: string): string {
  const n = name.toLowerCase()
  if (n.endsWith('.pdf')) return 'application/pdf'
  if (n.endsWith('.png')) return 'image/png'
  if (n.endsWith('.jpg') || n.endsWith('.jpeg')) return 'image/jpeg'
  if (n.endsWith('.xlsx')) return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  if (n.endsWith('.xls')) return 'application/vnd.ms-excel'
  return 'application/octet-stream'
}

/**
 * Documents the app generates (not stored uploads) that Manak asks for. Rendered the same way as
 * the Documents dialog PDF download, saved under `<projectId>/manak-assist/` (overwritten each time).
 */
type GenerateWhen = { sitAccept: YesNo; outsourcing: YesNo; hygiene: YesNo; inHouse: YesNo; authorizationLetter: YesNo }
const GENERATED_DOCS: Array<{ kind: BisPrintDocumentKind; slot: ManakNewAppFileSlot; label: string; step: string; excel?: boolean; when?: (p: GenerateWhen) => boolean }> = [
  // Manak's machinery / equipment uploads take .xlsx — same workbook as the Documents dialog "Download Excel".
  { kind: 'cmpf-305', slot: 'machinery', label: 'Manufacturing Machinery List', step: 'manufacturing', excel: true },
  // Manak asks for the equipment list on step 5 even when testing is sub-contracted.
  { kind: 'cmpf-306', slot: 'equipment', label: 'Testing Equipment List', step: 'testing', excel: true },
  { kind: 'cmpf-311', slot: 'own-sit', label: 'Own SIT (Acceptance of SIT, CMPF-311)', step: 'general', when: (p) => p.sitAccept === 'No' },
  { kind: 'manufacturing-subcontracting', slot: 'outsource-controls', label: 'Controls on outsourced process', step: 'manufacturing', when: (p) => p.outsourcing === 'Yes' },
  { kind: 'hygiene-conditions', slot: 'hygiene', label: 'Hygiene Conditions', step: 'manufacturing', when: (p) => p.hygiene === 'Yes' },
  { kind: 'authorization-letter', slot: 'auth-letter', label: 'Authorization Letter', step: 'declaration', when: (p) => p.authorizationLetter === 'Yes' },
  { kind: 'process-flow-chart', slot: 'process-flow', label: 'Process Flow Chart', step: 'manufacturing' },
  { kind: 'plant-layout', slot: 'plant-layout', label: 'Plant Layout', step: 'manufacturing' },
]

async function generateDocExcel(row: BisProjectRow, kind: BisPrintDocumentKind): Promise<string> {
  const blob = buildExcelWorkbook([{ title: BIS_PRINT_DOCUMENT_LABEL[kind], html: await buildBisDocumentHtml(row, kind) }])
  const path = `${row.id}/manak-assist/${kind}.xlsx`
  const { error } = await supabase.storage.from(BIS_PROJECT_FILES_BUCKET).upload(path, blob, {
    upsert: true,
    contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
  if (error) throw error
  return path
}

/** Same PDF as the app's PDF button; one render per kind per Manak Assist click. */
async function generateDocPdf(row: BisProjectRow, kind: BisPrintDocumentKind, cache: Map<string, Promise<string>>): Promise<string> {
  const cached = cache.get(kind)
  if (cached) return cached
  const job = (async () => {
    const settings = await loadBisProjectPrintPageSettings(row.id).catch(() => DEFAULT_BIS_DOCUMENT_PRINT_PAGE_SETTINGS)
    const blob = await buildBisDocumentPdfBlob(row, kind, settings)
    const path = `${row.id}/manak-assist/${kind}.pdf`
    const { error } = await supabase.storage.from(BIS_PROJECT_FILES_BUCKET).upload(path, blob, { upsert: true, contentType: 'application/pdf' })
    if (error) throw error
    return path
  })()
  cache.set(kind, job)
  return job
}

async function link(storagePath: string): Promise<string> {
  const path = storagePath.trim()
  if (!path) return ''
  const { data, error } = await supabase.storage.from(BIS_PROJECT_FILES_BUCKET).createSignedUrl(path, LINK_SECONDS)
  return error ? '' : data.signedUrl
}

export async function buildManakNewAppPayload(row: BisProjectRow): Promise<ManakNewAppPayload> {
  const kinds: BisPrintDocumentKind[] = [
    'top-management',
    'technical-staff',
    'raw-material-reference',
    'cmpf-307',
    'cmpf-311',
    'osl-sample-requirements',
    'packaging-marking',
    'subcontracted-tests',
    'raw-material-test-reports',
    CORRESPONDENCE_KIND,
    MANUFACTURING_COMPONENTS_KIND,
    TESTING_COMPONENTS_KIND,
    TEST_REPORT_COMPONENTS_KIND,
    'undertaking-general',
    APPLICATION_DECLARATION_KIND,
  ]
  const [print, projectRes, scopeFiles, consentFiles, ...loaded] = await Promise.all([
    loadBisPrintData(row),
    supabase.from('bis_projects').select('*').eq('id', row.id).maybeSingle(),
    supabase.from('bis_project_files').select('file_name, storage_path').eq('bis_project_id', row.id).eq('doc_kind', 'manufacturing-scope'),
    supabase.from('bis_project_files').select('file_name, storage_path').eq('bis_project_id', row.id).eq('doc_kind', 'consent-letter'),
    ...kinds.map((k) => fetchBisModulePayload(row.id, k).catch(() => null)),
  ])
  const p = Object.fromEntries(kinds.map((k, i) => [k, loaded[i] as Rec | null])) as Record<string, Rec | null>
  const project = (projectRes.data ?? {}) as Rec
  const c = print.client

  const files: ManakNewAppFile[] = []
  const addFile = async (slot: ManakNewAppFileSlot, label: string, storagePath: unknown, fileName: unknown, rowIndex?: number) => {
    const path = str(storagePath)
    if (!path) return
    const url = await link(path)
    if (!url) return
    // Manak validates uploads by file-name extension; app display names often have none
    // ("Photo — Pratik Baisware"), so take it from the stored object path.
    const stored = path.split('/').pop() || 'document'
    const ext = /\.[a-z0-9]{2,5}$/i.exec(stored)?.[0] ?? ''
    let name = (str(fileName) || stored).replace(/^[0-9a-f-]{36}_/i, '')
    if (ext && !/\.[a-z0-9]{2,5}$/i.test(name)) name += ext
    files.push({ slot, row: rowIndex, label, url, fileName: name, mime: mimeFor(name) })
  }

  /* Step 1 — General: "Variety applied for" comes from the Varieties table (project License Scope), as shown on Step 1. */
  const samples = rowsOf(p['osl-sample-requirements'])
  const sampleVarieties = Array.from(new Set(samples.map((r) => str(r.gradeTypeVariety)).filter(Boolean)))
  const notes = str(project.notes ?? row.notes)
  const scopeTable = parseBisNotesScope(notes.trim() ? notes : sampleVarieties.join('\n'))
  // Keep each row's index: scope files are tagged "[r<index>] " with that index (untagged = row 0).
  const varietyRows: Array<{ index: number; value: string }> =
    scopeTable.mode === 'plain'
      ? scopeTable.text.split('\n').map((line, index) => ({ index, value: line.trim() }))
      : scopeTable.rows.map((cells, index) => {
          const rest = cells.slice(1).map((c) => c.trim()).filter(Boolean)
          // 2 columns (Component | Value) → Value; 3+ columns → the columns after the first, joined.
          return { index, value: (rest.length ? rest.join(' - ') : str(cells[0])).trim() }
        })
  const varietyList = varietyRows.filter((v) => v.value)
  const varietyNames = varietyList.map((v) => v.value)
  const sit = parseCmpf311Payload(p['cmpf-311'])
  // Supporting document = the row's own attachment (prefer "Copy of Scope"), from the Varieties Action column.
  const scopeFileRows = (Array.isArray(scopeFiles.data) ? scopeFiles.data : []) as Array<{ file_name?: string; storage_path?: string }>
  const SCOPE_TAG = /^\[(draft|r(\d+))\] /
  const scopeRowOf = (name: string) => {
    const m = SCOPE_TAG.exec(name)
    return m ? (m[1] === 'draft' ? -1 : Number(m[2])) : 0
  }
  await Promise.all(
    varietyList.map((v, i) => {
      const own = scopeFileRows.filter((f) => scopeRowOf(str(f.file_name)) === v.index)
      const pick = own.find((f) => str(f.file_name).replace(SCOPE_TAG, '').startsWith('Copy of Scope')) ?? own[0]
      return pick ? addFile('variety', `Variety ${i + 1} supporting document`, pick.storage_path, str(pick.file_name).replace(SCOPE_TAG, ''), i) : null
    }),
  )
  const varietyDocMissing = varietyList.length > 0 && !files.some((f) => f.slot === 'variety')

  /* Step 2 — Management */
  const topManagement = rowsOf(p['top-management'])
    .filter((r) => str(r.personName))
    // Manak rejects a malformed email and blocks Next; fall back to the firm's email.
    .map((r) => ({ name: str(r.personName), designation: str(r.designation), mobile: str(r.mobile), email: validEmail(str(r.email)) || c.email, din: str(r.din) }))
  const corr = p[CORRESPONDENCE_KIND] ?? {}
  const firstTm = topManagement[0]
  const staffRows = rowsOf(p['technical-staff']).filter((r) => str(r.personName))
  await Promise.all(
    staffRows.flatMap((r, i) => [
      addFile('staff-education', `${str(r.personName)} — qualification document`, r.educationCertificateStoragePath, r.educationCertificateFileName, i),
      addFile('staff-photo', `${str(r.personName)} — photo`, r.photoStoragePath, r.photoFileName, i),
    ]),
  )

  /* Step 3 — Manufacturing */
  const applicable = ((p[MANUFACTURING_COMPONENTS_KIND]?.applicable ?? {}) as Partial<Record<string, YesNo>>) || {}
  const rawMaterials = rowsOf(p['raw-material-reference'], 'rawMaterials')
    .filter((r) => str(r.rawMaterial))
    .map((r) => ({
      rawMaterial: str(r.rawMaterial),
      supplierName: str(r.supplierName),
      conformity: str(r.bisCertificationMark),
      recordsMaintained: str(r.testCertificate),
      batches: str(r.batchesPackaging),
    }))

  /* Step 4 — Packaging / Brand */
  const pk = p['packaging-marking'] ?? {}
  // Unsaved Packaging step = the defaults the app shows and prints ("… after GOL").
  const pkf = packagingMarkingFieldsFrom(pk)
  await addFile('label', 'Form of label', pk.labelStoragePath, pk.labelFileName)
  const brandRows = rowsOf(p['cmpf-307']).filter((r) => str(r.brandName))
  await Promise.all(
    brandRows.map((r, i) =>
      str(r.trademarkStoragePath)
        ? addFile('brand', `${str(r.brandName)} — trademark certificate`, r.trademarkStoragePath, r.trademarkFileName, i)
        : addFile('brand', `${str(r.brandName)} — agreement`, r.agreementStoragePath, r.agreementFileName, i),
    ),
  )

  /* Step 5 — Testing */
  const inHouse: YesNo = p[TESTING_COMPONENTS_KIND]?.inHouseTesting === 'No' ? 'No' : 'Yes'
  const subRows = rowsOf(p['subcontracted-tests']).filter((r) => str(r.testName) || str(r.clauseNo))
  // Lab names differ between our master and Manak (two "Alpha Test House Private Limited" entries), so match by OSL code.
  const labIds = subRows.map((r) => str(r.laboratoryId)).filter(Boolean)
  const { data: labRows } = labIds.length
    ? await supabase.from('laboratories').select('id, osl_code').in('id', labIds)
    : { data: [] as Array<{ id: string; osl_code: string | null }> }
  const oslById = new Map((labRows ?? []).map((l) => [String(l.id), str(l.osl_code)]))
  const subcontracted = subRows.map((r) => ({
    clauseNo: str(r.clauseNo),
    testName: str(r.testName),
    laboratoryName: str(r.laboratoryName),
    laboratoryCode: oslById.get(str(r.laboratoryId)) ?? '',
  }))
  const consent = (Array.isArray(consentFiles.data) ? consentFiles.data : [])[0] as { file_name?: string; storage_path?: string } | undefined
  if (inHouse === 'No' && consent) {
    await Promise.all(subcontracted.map((_, i) => addFile('consent', `Consent letter (test ${i + 1})`, consent.storage_path, consent.file_name, i)))
  }

  /* Step 6 — Test reports: one row per sample with a QR code (the portal pulls the lab report by QR). */
  const trApplicable = ((p[TEST_REPORT_COMPONENTS_KIND]?.applicable ?? {}) as Partial<Record<string, YesNo>>) || {}
  const testReports = samples
    .filter((r) => str(r.qrCode))
    .map((r) => ({
      // Manak's step 6 variety list is built from step 1's "Variety applied for" values.
      variety: varietyNames.length === 1 ? varietyNames[0] : str(r.gradeTypeVariety),
      qrCode: str(r.qrCode),
      sampleCode: str(r.sampleCode),
      complete: str(r.testReportStoragePath) ? 'Yes' : '',
      // Conformity is a judgement on the lab report — never assumed here.
      conformity: str(r.conformity),
    }))

  const missingFiles: ManakNewAppPayload['missingFiles'] = []
  if (varietyDocMissing) missingFiles.push({ step: 'general', label: 'Variety supporting document (attach it on the Varieties row)' })
  const sitAccept: YesNo = sit.mode === 'bis-sit' ? 'Yes' : 'No'
  const outsourcing: YesNo = applicable.subcontracting === 'Yes' ? 'Yes' : 'No'
  const hygiene: YesNo = applicable.hygiene === 'Yes' ? 'Yes' : 'No'
  if (outsourcing === 'Yes') {
    missingFiles.push({ step: 'manufacturing', label: 'Agreement with manufacturing unit for outsourcing (signed PDF — not stored in Consultancy Pro)' })
  }
  /* Step 7 — Declaration & Undertaking (same defaults the app's Step 7 shows). */
  const decl = p[APPLICATION_DECLARATION_KIND] ?? {}
  const declApplicable = (decl.applicable && typeof decl.applicable === 'object' ? decl.applicable : {}) as Partial<Record<string, YesNo>>
  const yn = (key: string, fallback: YesNo): YesNo => {
    const v = declApplicable[key] ?? decl[key]
    return v === 'Yes' || v === 'No' ? v : fallback
  }
  const tmPayload = p['top-management']
  const defaultName = str(tmPayload?.signatoryName) || c.contactPerson
  const sameName = (v: unknown) => str(v).toLowerCase() === defaultName.toLowerCase()
  const submitterName = str(decl.submitterName) || defaultName
  // Manak rejects a blank designation: fall back to Top Management / correspondence when Step 7 has none.
  const submitterDesignation =
    str(decl.submitterDesignation) ||
    str(tmPayload?.signatoryDesignation) ||
    str(rowsOf(tmPayload).find((r) => sameName(r.personName))?.designation) ||
    str(c.topManagement.find((t) => sameName(t.name))?.designation) ||
    str(corr.designation) ||
    firstTm?.designation ||
    ''
  const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
  const savedDays = Array.isArray(decl.offDays) ? DAYS.filter((d) => (decl.offDays as unknown[]).includes(d)) : []
  const weeklyOffDays =
    decl.weeklyOffs === 'Yes'
      ? savedDays.length ? savedDays : ['Sunday']
      : decl.weeklyOffs === 'No'
        ? []
        : str(p['undertaking-general']?.weeklyOff)
            .split(/\s*(?:,|&|\band\b)\s*/i)
            .map((d) => d.trim())
            .filter((d) => /^(sun|mon|tues|wednes|thurs|fri|satur)day$/i.test(d))
  const declaration = {
    name: submitterName,
    designation: submitterDesignation,
    weeklyOffDays,
    statutoryPermissions: yn('statutoryPermissions', 'No'),
    otherInformation: yn('otherInformation', 'Yes'),
    otherRequest: yn('otherRequest', 'No'),
    authorizationLetter: yn('authorizationLetter', 'Yes'),
  }
  const declFile = (v: unknown): { storagePath: string; fileName: string } | null => {
    if (!v || typeof v !== 'object') return null
    const f = v as Rec
    const path = str(f.storagePath ?? f.storage_path)
    return path ? { storagePath: path, fileName: str(f.fileName ?? f.file_name) } : null
  }
  if (declaration.statutoryPermissions === 'Yes') {
    const f = declFile(decl.statutoryPermissionFile)
    if (f) await addFile('statutory', 'Statutory permissions', f.storagePath, f.fileName)
    else missingFiles.push({ step: 'declaration', label: 'Statutory permissions file (not attached in Step 7)' })
  }
  const pdfCache = new Map<string, Promise<string>>()
  for (const [key, slot, label] of [
    ['otherInformation', 'other-info', 'Other information'],
    ['otherRequest', 'other-request', 'Other request'],
  ] as const) {
    if (declaration[key] !== 'Yes') continue
    const rows = Array.isArray(decl[`${key}Rows`]) ? (decl[`${key}Rows`] as Rec[]) : []
    let i = 0
    if (key === 'otherInformation') {
      // Every application document as a PDF (Step 8 list), then the files added by hand.
      // Only the documents switched ON in Step 7 Other Information.
      const choice = otherInformationUploadChoice(decl)
      const docs = otherInformationDocumentRows(await loadApplicationDocumentRows(row).catch(() => [])).filter((d) => otherInformationUploadOn(d, choice))
      // Render three at a time (the PDF service handles parallel pages), keep Step 8 order for the rows.
      const paths: Array<{ path: string; fileName: string } | Error> = new Array(docs.length)
      let next = 0
      await Promise.all(
        Array.from({ length: 3 }, async () => {
          while (next < docs.length) {
            const at = next++
            const d = docs[at]
            try {
              paths[at] =
                d.type === 'doc'
                  ? { path: await generateDocPdf(row, d.kind, pdfCache), fileName: `${d.label}.pdf` }
                  : { path: d.file.storage_path, fileName: d.file.file_name }
            } catch (err) {
              paths[at] = err instanceof Error ? err : new Error('error')
            }
          }
        }),
      )
      for (const [at, d] of docs.entries()) {
        const got = paths[at]
        if (got instanceof Error) {
          missingFiles.push({ step: 'declaration', label: `${d.label} (could not generate: ${got.message})` })
          continue
        }
        await addFile(slot, d.label, got.path, got.fileName, i)
        i += 1
      }
    }
    for (const r of rows) {
      const f = declFile(r.file) ?? declFile(r.upload)
      if (!f) continue
      await addFile(slot, str(r.fileName) || label, f.storagePath, f.fileName || str(r.fileName), i)
      i += 1
    }
    if (!i) missingFiles.push({ step: 'declaration', label: `${label} files (none attached in Step 7)` })
  }

  // Generated one after another: the PDF service renders with a single browser.
  for (const doc of GENERATED_DOCS) {
    if (doc.when && !doc.when({ sitAccept, outsourcing, hygiene, inHouse, authorizationLetter: declaration.authorizationLetter })) continue
    try {
      const path = doc.excel ? await generateDocExcel(row, doc.kind) : await generateDocPdf(row, doc.kind, pdfCache)
      await addFile(doc.slot, doc.label, path, `${doc.label}.${doc.excel ? 'xlsx' : 'pdf'}`)
    } catch (err) {
      missingFiles.push({ step: doc.step, label: `${doc.label} (could not generate: ${err instanceof Error ? err.message : 'error'})` })
    }
  }
  if (!str(pk.labelStoragePath)) missingFiles.push({ step: 'packaging', label: 'Form of label (not uploaded in Packaging step)' })

  return {
    kind: 'QE_MANAK_NEWAPP_V1',
    projectId: row.id,
    firmName: c.companyName,
    isNumber: print.isCode.label || print.isCode.isNumber,
    isTitle: print.isCode.title,
    applicationNumber: str(project.application_number ?? row.application_number).replace(/\D/g, ''),
    general: {
      isDigits: str(print.isCode.isNumber || print.isCode.label).replace(/^IS\s*/i, '').split(/[:\s(]/)[0].replace(/\D/g, ''),
      isLabel: print.isCode.label || print.isCode.isNumber,
      // Consultancy Pro "simplified" = Manak Option 2 (OSL test report); "normal" = Option 1.
      procedureOption: str(project.application_process ?? row.application_process).toLowerCase() === 'normal' ? 'Option 1' : 'Option 2',
      sitAccept,
      varieties: varietyNames.map((name) => ({ name })) },
    management: {
      topManagement,
      correspondence: {
        addressType: str(corr.addressType) || 'Factory',
        name: str(corr.name) || firstTm?.name || c.contactPerson,
        designation: str(corr.designation) || firstTm?.designation || '',
        email: str(corr.email) || firstTm?.email || c.email,
        mobile: str(corr.mobile) || firstTm?.mobile || c.mobile,
      },
      technicalStaff: staffRows.map((r) => ({
        name: str(r.personName),
        designation: str(r.designation),
        qualification: str(r.educationalQualification),
        experienceYears: str(r.experienceYears),
      })),
    },
    manufacturing: {
      rawMaterials,
      outsourcing,
      hygiene,
      productionUnit: str(project.production_unit) || print.isCode.unitOfIs,
      productionValue: str(project.production_value),
      installedCapacity: str(project.installed_capacity),
    },
    packaging: {
      natureOfPackaging: str(pkf.natureOfPackaging),
      quantityPerPackage: str(pkf.quantityPerPackage),
      markingOnArticle: str(pkf.markingOnArticle),
      methodOfMarking: str(pkf.methodOfMarking),
      methodOfMarkingOther: str(pkf.methodOfMarkingOther),
      batchNumbering: str(pkf.batchNumbering),
      brands: brandRows.map((r) => ({
        brandName: str(r.brandName),
        ownedBy: str(r.ownedBy),
        registeredStatus: str(r.registeredStatus),
        registrationDate: str(r.registrationDate),
      })),
    },
    testing: { inHouse, subcontracted },
    testReports,
    testReportOptions: {
      longDuration: trApplicable['long-duration'] === 'Yes' ? 'Yes' : 'No',
      rawMaterialReports: trApplicable['raw-material-test-reports'] === 'Yes' ? 'Yes' : 'No',
    },
    declaration,
    files,
    missingFiles,
    copiedAt: new Date().toISOString(),
  }
}
