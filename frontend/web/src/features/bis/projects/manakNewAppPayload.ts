/**
 * Data for the QE Consultancy extension's "New Application" section (Manak Assist).
 * The extension fills Manak's Apply-for-new-licence steps from this
 * (frontend/extensions/qe-consultancy-chrome/newapp-fill.js — keep the shape in sync).
 */
import { mapPageSizeToPlaywrightFormat, renderPdfViaPlaywright } from '@/lib/playwrightPdfClient'
import { supabase } from '@/lib/supabaseClient'
import { paginateHtmlForDownload } from '../print/bisPreviewPagination'
import { applyBisDocumentPrintPageSettings, DEFAULT_BIS_DOCUMENT_PRINT_PAGE_SETTINGS } from '../print/bisDocumentPrintPageSettings'
import { loadBisPrintData } from '../print/loadBisPrintData'
import { packagingMarkingFieldsFrom } from '../print/manufacturingStepDocumentsHtml'
import { BIS_PRINT_DOCUMENT_LABEL, buildBisDocumentHtml, type BisPrintDocumentKind } from '../print/printBisDocument'
import { buildExcelWorkbook } from './bisExcelWorkbook'
import { fetchBisModulePayload } from './bisModuleDataApi'
import { BIS_PROJECT_FILES_BUCKET } from './bisProjectFilesApi'
import { loadBisProjectPrintPageSettings } from './bisPrintPageSettingsApi'
import { parseCmpf311Payload } from './cmpf311Model'
import { CORRESPONDENCE_KIND, MANUFACTURING_COMPONENTS_KIND, TESTING_COMPONENTS_KIND, TEST_REPORT_COMPONENTS_KIND } from './manakModuleKinds'
import type { BisProjectRow } from './types'

type Rec = Record<string, unknown>
type YesNo = 'Yes' | 'No'

export type ManakNewAppFileSlot =
  | 'own-sit'
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
  declaration: { name: string; designation: string; weeklyOffDays: string[] }
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
type GenerateWhen = { sitAccept: YesNo; outsourcing: YesNo; hygiene: YesNo; inHouse: YesNo }
const GENERATED_DOCS: Array<{ kind: BisPrintDocumentKind; slot: ManakNewAppFileSlot; label: string; step: string; excel?: boolean; when?: (p: GenerateWhen) => boolean }> = [
  // Manak's machinery / equipment uploads take .xlsx — same workbook as the Documents dialog "Download Excel".
  { kind: 'cmpf-305', slot: 'machinery', label: 'Manufacturing Machinery List', step: 'manufacturing', excel: true },
  // Manak asks for the equipment list on step 5 even when testing is sub-contracted.
  { kind: 'cmpf-306', slot: 'equipment', label: 'Testing Equipment List', step: 'testing', excel: true },
  { kind: 'cmpf-311', slot: 'own-sit', label: 'Own SIT (Acceptance of SIT, CMPF-311)', step: 'general', when: (p) => p.sitAccept === 'No' },
  { kind: 'manufacturing-subcontracting', slot: 'outsource-controls', label: 'Controls on outsourced process', step: 'manufacturing', when: (p) => p.outsourcing === 'Yes' },
  { kind: 'hygiene-conditions', slot: 'hygiene', label: 'Hygiene Conditions', step: 'manufacturing', when: (p) => p.hygiene === 'Yes' },
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

async function generateDocPdf(row: BisProjectRow, kind: BisPrintDocumentKind): Promise<string> {
  const settings = await loadBisProjectPrintPageSettings(row.id).catch(() => DEFAULT_BIS_DOCUMENT_PRINT_PAGE_SETTINGS)
  const html = await paginateHtmlForDownload(applyBisDocumentPrintPageSettings(await buildBisDocumentHtml(row, kind), settings))
  const blob = await renderPdfViaPlaywright({
    html,
    filename: `${kind}.pdf`,
    format: mapPageSizeToPlaywrightFormat(settings.pageSize),
    landscape: settings.orientation === 'landscape',
    margin: { top: '0mm', right: '0mm', bottom: '0mm', left: '0mm' },
  })
  const path = `${row.id}/manak-assist/${kind}.pdf`
  const { error } = await supabase.storage.from(BIS_PROJECT_FILES_BUCKET).upload(path, blob, { upsert: true, contentType: 'application/pdf' })
  if (error) throw error
  return path
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

  /* Step 1 — General */
  const samples = rowsOf(p['osl-sample-requirements'])
  const varietyNames = Array.from(new Set(samples.map((r) => str(r.gradeTypeVariety)).filter(Boolean)))
  const sit = parseCmpf311Payload(p['cmpf-311'])
  // Manufacturing-scope undertaking is the supporting document for the varieties.
  const scope = (Array.isArray(scopeFiles.data) ? scopeFiles.data : [])[0] as { file_name?: string; storage_path?: string } | undefined
  await Promise.all(varietyNames.map((_, i) => (scope ? addFile('variety', `Variety ${i + 1} supporting document`, scope.storage_path, scope.file_name, i) : null)))

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
      variety: str(r.gradeTypeVariety),
      qrCode: str(r.qrCode),
      sampleCode: str(r.sampleCode),
      complete: str(r.testReportStoragePath) ? 'Yes' : '',
      // Conformity is a judgement on the lab report — never assumed here.
      conformity: str(r.conformity),
    }))

  const missingFiles: ManakNewAppPayload['missingFiles'] = []
  const sitAccept: YesNo = sit.mode === 'bis-sit' ? 'Yes' : 'No'
  const outsourcing: YesNo = applicable.subcontracting === 'Yes' ? 'Yes' : 'No'
  const hygiene: YesNo = applicable.hygiene === 'Yes' ? 'Yes' : 'No'
  if (outsourcing === 'Yes') {
    missingFiles.push({ step: 'manufacturing', label: 'Agreement with manufacturing unit for outsourcing (signed PDF — not stored in Consultancy Pro)' })
  }
  // Generated one after another: the PDF service renders with a single browser.
  for (const doc of GENERATED_DOCS) {
    if (doc.when && !doc.when({ sitAccept, outsourcing, hygiene, inHouse })) continue
    try {
      const path = doc.excel ? await generateDocExcel(row, doc.kind) : await generateDocPdf(row, doc.kind)
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
    declaration: {
      weeklyOffDays: str(p['undertaking-general']?.weeklyOff)
        .split(/\s*(?:,|&|\band\b)\s*/i)
        .map((d) => d.trim())
        .filter((d) => /^(sun|mon|tues|wednes|thurs|fri|satur)day$/i.test(d)),
      name: str(p['top-management']?.signatoryName) || str(corr.name) || firstTm?.name || c.contactPerson,
      designation: str(p['top-management']?.signatoryDesignation) || str(corr.designation) || firstTm?.designation || '',
    },
    files,
    missingFiles,
    copiedAt: new Date().toISOString(),
  }
}
