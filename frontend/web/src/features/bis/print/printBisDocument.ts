import type { BisProjectRow } from '../projects/types'
import { listBisBranchOffices } from '@/features/masters/bis-branch-offices/bisBranchOfficesApi'
import {
  appointmentLetterDataForTechnicalStaff,
  appointmentLetterDataFromPrintData,
  buildAppointmentLetterHtml,
} from './appointmentLetterHtml'
import { authorizationLetterDataFromPrintData, buildAuthorizationLetterHtml } from './authorizationLetterHtml'
import { bisForm1DataFromPrintData, buildBisForm1Html } from './bisForm1Html'
import { buildCmpf305Html, cmpf305DataFromPrintData } from './cmpf305Html'
import { buildCmpf306Html, cmpf306DataFromPrintData } from './cmpf306Html'
import { buildCmpf307Html, cmpf307DataFromPrintData } from './cmpf307Html'
import { buildCmpf310AcceptanceLetterHtml, buildCmpf310Html, cmpf310DataFromPrintData, minimumMarkingFeeForScale } from './cmpf310Html'
import { buildCmpf311Html, cmpf311DataFromPrintData } from './cmpf311Html'
import {
  buildCertifiedReferenceMaterialsHtml,
  certifiedReferenceMaterialsDataFromPrintData,
} from './certifiedReferenceMaterialsHtml'
import { buildFactoryTestReportHtml, factoryTestReportDataFromPrintData } from './factoryTestReportHtml'
import { factoryTestReportHasContent, parseFactoryTestReportPayload } from '../projects/factoryTestReportModel'
import { loadBisPrintData, type BisPrintData } from './loadBisPrintData'
import {
  buildApplicationDetailsHtml,
  buildLegalDocumentsHtml,
  legalDocumentsDataFromPrintData,
} from './legalDocumentsHtml'
import {
  buildLocationMapHtml,
  enrichLocationMapRoute,
  locationMapDataFromPrintData,
} from './locationMapHtml'
import {
  buildManufacturingScopeHtml,
  manufacturingScopeDataFromPrintData,
} from './manufacturingScopeHtml'
import {
  applyBisDocumentPrintPageSettings,
  DEFAULT_BIS_DOCUMENT_PRINT_PAGE_SETTINGS,
} from './bisDocumentPrintPageSettings'
import { openPendingPrintWindow, openPrintHtml } from './openPrintHtml'
import {
  buildOslSampleRequirementsHtml,
  oslSampleRequirementsDataFromPrintData,
  printableOslSampleRows,
} from './oslSampleRequirementsHtml'
import { parseOslSampleRequirementsPayload } from '../projects/oslSampleRequirementsModel'
import {
  buildOslCourierLabelsHtml,
  oslCourierLabelsDataFromPrintData,
} from './oslCourierLabelsHtml'
import {
  buildOslSampleTestRequestHtml,
  oslSampleTestRequestDataFromPrintData,
} from './oslSampleTestRequestHtml'
import {
  buildPlantLayoutHtml,
  plantLayoutDataFromPrintData,
} from './plantLayoutHtml'
import {
  buildProcessDescriptionHtml,
  processDescriptionDataFromPrintData,
} from './processDescriptionHtml'
import {
  buildProcessFlowChartHtml,
  processFlowChartDataFromPrintData,
} from './processFlowChartHtml'
import {
  buildRawMaterialDetailsHtml,
  rawMaterialDetailsDataFromPrintData,
} from './rawMaterialDetailsHtml'
import {
  buildSelfEvaluationFormHtml,
  selfEvaluationFormDataFromPrintData,
} from './selfEvaluationFormHtml'
import {
  buildSubcontractedTestsHtml,
  subcontractedTestsDataFromPrintData,
} from './subcontractedTestsHtml'
import {
  buildTechnicalStaffHtml,
  technicalStaffDataFromPrintData,
} from './technicalStaffHtml'
import {
  buildTopManagementHtml,
  topManagementDataFromPrintData,
} from './topManagementHtml'
import { appendPrintHtmlDocument, injectBisDocumentPageFooters } from './printDocumentShared'
import { buildUndertakingGeneralHtml, undertakingGeneralDataFromPrintData } from './undertakingGeneralHtml'
import {
  buildUndertakingLongDurationHtml,
  undertakingLongDurationDataFromPrintData,
} from './undertakingLongDurationHtml'
import {
  buildUndertakingMinimumMarkingFeeHtml,
  undertakingMinimumMarkingFeeDataFromPrintData,
} from './undertakingMinimumMarkingFeeHtml'
import {
  buildUndertakingOption2Html,
  undertakingOption2DataFromPrintData,
} from './undertakingOption2Html'
import {
  buildUpdatedSchemeOfInspectionHtml,
  updatedSchemeOfInspectionDataFromPrintData,
} from './updatedSchemeOfInspectionHtml'
import {
  buildCalibrationCertificatesHtml,
  buildConsentLetterHtml,
} from './bisFileAnnexHtml'

export type BisPrintDocumentKind =
  | 'legal-documents'
  | 'application-details'
  | 'license-details'
  | 'branch-details'
  | 'form1'
  | 'authorization-letter'
  | 'cmpf-305'
  | 'cmpf-306'
  | 'calibration-certificates'
  | 'consent-letter'
  | 'cmpf-307'
  | 'cmpf-310'
  | 'cmpf-311'
  | 'updated-sit'
  | 'factory-test-report'
  | 'osl-sample-requirements'
  | 'undertaking-general'
  | 'undertaking-option-2'
  | 'undertaking-long-duration'
  | 'undertaking-mmf'
  | 'appointment-letter'
  | 'manufacturing-scope'
  | 'process-description'
  | 'top-management'
  | 'technical-staff'
  | 'self-evaluation-form'
  | 'all-required-undertakings'
  | 'raw-material-reference'
  | 'certified-reference-materials'
  | 'raw-material-details'
  | 'subcontracted-tests'
  | 'osl-sample-test-request'
  | 'process-flow-chart'
  | 'plant-layout'
  | 'osl-courier-labels'
  | 'location-map'

export const BIS_PRINT_DOCUMENT_LABEL: Record<BisPrintDocumentKind, string> = {
  'legal-documents': 'Legal Documents',
  'application-details': 'Application Details & Location Map',
  'license-details': 'License Details',
  'branch-details': 'Branch Details',
  form1: 'BIS Form-I',
  'authorization-letter': 'Authorization Letter',
  'cmpf-305': 'CMPF-305 (Plant & Machinery)',
  'cmpf-306': 'CMPF-306 (Testing Equipment)',
  'calibration-certificates': 'Calibration Certificates',
  'consent-letter': 'Consent Letter',
  'cmpf-307': 'CMPF-307 (Brand Names)',
  'cmpf-310': 'CMPF-310 (Marking Fee)',
  'cmpf-311': 'CMPF - 310 & CMPF - 311',
  'updated-sit': 'Updated Scheme of Inspection',
  'factory-test-report': 'Factory Test Report',
  'osl-sample-requirements': 'Sample Requirements, Test Request, & Test Reports',
  'undertaking-general': 'Undertaking (General & ISS)',
  'undertaking-option-2': 'Undertaking for Option 2',
  'undertaking-long-duration': 'Undertaking (Long Duration Test)',
  'undertaking-mmf': 'Undertaking for Minimum Marking Fee',
  'appointment-letter': 'Appointment Letter',
  'manufacturing-scope': 'Manufacturing Scope Declaration',
  'process-description': 'Process Description',
  'top-management': 'Top Management Details',
  'technical-staff': 'Technical Staff Details',
  'self-evaluation-form': 'Self Evaluation Form',
  'all-required-undertakings': 'All Undertakings & Self Evaluation Form',
  'raw-material-reference': 'Raw Material & Reference Material',
  'certified-reference-materials': 'Certified Reference Materials',
  'raw-material-details': 'Raw Material Details',
  'subcontracted-tests': 'Subcontracted Tests Declaration',
  'osl-sample-test-request': 'OSL Sample Test Request',
  'process-flow-chart': 'Process Flow Chart',
  'plant-layout': 'Plant Layout',
  'osl-courier-labels': 'OSL Courier Labels',
  'location-map': 'Location Map',
}

/** Documents offered in the "More prints" menu (Form-I and Authorization Letter have their own buttons). */
export const EXTRA_PRINT_KINDS: BisPrintDocumentKind[] = [
  'cmpf-305',
  'cmpf-306',
  'cmpf-307',
  'calibration-certificates',
  'consent-letter',
  'cmpf-311',
  'updated-sit',
  'raw-material-reference',
  'all-required-undertakings',
  'self-evaluation-form',
  'manufacturing-scope',
  'osl-sample-requirements',
  'location-map',
  'plant-layout',
  'process-flow-chart',
  'subcontracted-tests',
  'osl-sample-test-request',
  'osl-courier-labels',
]

/** Documents managed inside their parent module instead of as separate View Documents rows. */
const EMBEDDED_BIS_DOCUMENT_KINDS: BisPrintDocumentKind[] = [
  'calibration-certificates',
  'consent-letter',
  'subcontracted-tests',
  'osl-sample-test-request',
  'osl-courier-labels',
]

/** Full license document pack for View Documents. */
export const ALL_BIS_PRINT_KINDS: BisPrintDocumentKind[] = [
  'legal-documents',
  'application-details',
  'top-management',
  'technical-staff',
  'plant-layout',
  'process-flow-chart',
  'manufacturing-scope',
  'osl-sample-requirements',
  // Authorization Letter → Top Management; Appointment Letter → Technical Staff annex.
  // Process Description is edited inside Process Flow Chart (not a separate list row).
  // Factory Test Report is generated per sample inside Sample Requirements (not a list row).
  ...EXTRA_PRINT_KINDS.filter(
    (kind) =>
      !EMBEDDED_BIS_DOCUMENT_KINDS.includes(kind) &&
      kind !== 'self-evaluation-form' &&
      kind !== 'manufacturing-scope' &&
      kind !== 'osl-sample-requirements' &&
      kind !== 'plant-layout' &&
      kind !== 'process-flow-chart',
  ),
]

/**
 * Storage doc_kind for Module Edit uploads.
 * Keeps legacy slugs for Legal / Application / Form-I.
 */
export function printKindToStorageDocKind(kind: BisPrintDocumentKind): string {
  if (kind === 'legal-documents') return 'legal'
  if (kind === 'application-details') return 'application'
  if (kind === 'license-details') return 'license'
  if (kind === 'branch-details') return 'branch'
  return kind
}

/** Every View Documents row opens Module Edit. */
export const BIS_FILE_MODULE_KINDS: BisPrintDocumentKind[] = [...ALL_BIS_PRINT_KINDS, 'form1']

/**
 * Prefer merged uploaded PDFs when present.
 * Legal / Application always use merge path; others fall back to generated HTML if empty.
 */
export const BIS_MERGE_PDF_MODULE_KINDS: BisPrintDocumentKind[] = [
  'legal-documents',
  'application-details',
]

/** Kinds that try merged attachments first, then generated HTML. */
export const BIS_HYBRID_FILE_VIEW_KINDS: BisPrintDocumentKind[] = ALL_BIS_PRINT_KINDS.filter(
  (k) => k !== 'application-details',
)

/** Old module URL slugs redirect into Application Details. */
export const LEGACY_FILE_MODULE_ALIASES: Record<string, BisPrintDocumentKind> = {
  'license-details': 'application-details',
  'branch-details': 'application-details',
}

/** Shared tooltip text for the "More prints" trigger. */
export const MORE_PRINTS_TOOLTIP =
  'Full BIS application print pack (CMPF, undertakings, staff, SEF, OSL, plant layout, location map)'

function combinePrintHtmlDocuments(title: string, documents: string[]): string {
  const pageBodies = documents.map((html) => {
    const body = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i)?.[1] ?? html
    const style = html.match(/<style[^>]*>([\s\S]*?)<\/style>/i)?.[1] ?? ''
    return { body, style }
  })
  const first = pageBodies[0]
  if (!first) return ''
  const styles = pageBodies.map((page) => page.style).join('\n')
  const bodies = pageBodies.map((page, index) => `<section class="merged-print-section${index ? ' merged-print-next' : ''}">${page.body}</section>`).join('')
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"/><title>${title}</title><style>${styles}\n@media print{.merged-print-next{break-before:page;page-break-before:always}}</style></head><body>${bodies}</body></html>`
}

function allRequiredUndertakingsHtml(data: BisPrintData): string {
  const savedOptions = data.modulePayload?.previewOptions
  const options = savedOptions && typeof savedOptions === 'object'
    ? savedOptions as Record<string, unknown>
    : {}
  const defaults: Record<string, boolean> = {
    'self-evaluation-form': true,
    'undertaking-general': true,
    'undertaking-option-2': true,
    'undertaking-long-duration': false,
    'undertaking-mmf': false,
  }
  const show = (kind: string) => typeof options[kind] === 'boolean' ? options[kind] as boolean : defaults[kind] !== false
  const undertakingSources = data.modulePayload?.__undertakingSources
  const sources = undertakingSources && typeof undertakingSources === 'object'
    ? undertakingSources as Record<string, unknown>
    : {}
  const withPayload = (payload: unknown): BisPrintData => ({
    ...data,
    modulePayload: payload && typeof payload === 'object' && !Array.isArray(payload)
      ? payload as Record<string, unknown>
      : null,
  })
  const documents: string[] = []
  if (show('self-evaluation-form')) documents.push(buildSelfEvaluationFormHtml(selfEvaluationFormDataFromPrintData(data)))
  if (show('undertaking-general')) documents.push(buildUndertakingGeneralHtml(undertakingGeneralDataFromPrintData(withPayload(sources.general))))
  if (show('undertaking-option-2')) documents.push(buildUndertakingOption2Html(undertakingOption2DataFromPrintData(data)))
  if (show('undertaking-long-duration')) documents.push(buildUndertakingLongDurationHtml(undertakingLongDurationDataFromPrintData(withPayload(sources.longDuration))))
  if (show('undertaking-mmf')) documents.push(buildUndertakingMinimumMarkingFeeHtml(undertakingMinimumMarkingFeeDataFromPrintData(withPayload(sources.minimumFee))))
  if (documents.length) return combinePrintHtmlDocuments('All Undertakings', documents)
  return '<!doctype html><html lang="en"><head><meta charset="utf-8"/><title>All Undertakings</title></head><body><p style="font:14px Arial,sans-serif;padding:24px">No documents are selected to show in preview.</p></body></html>'
}

async function locationMapPayloadWithBranchOffice(
  row: BisProjectRow,
  payload: Record<string, unknown> | null | undefined,
): Promise<Record<string, unknown>> {
  const saved = payload ?? {}
  const offices = await listBisBranchOffices().catch(() => [])
  const normalize = (value: string | null | undefined) =>
    String(value ?? '').toLowerCase().replace(/[^a-z0-9]/g, '')
  const branchName = normalize(row.branch_name)
  const branchState = normalize(row.branch_state)
  const office = offices.find((candidate) => normalize(candidate.name) === branchName &&
    (!branchState || normalize(candidate.state) === branchState)) ??
    offices.find((candidate) => candidate.id === row.bis_office_id)
  if (!office) return saved

  const officeAddress = [office.address, office.city, office.state, office.pinCode, office.country]
    .filter(Boolean)
    .join(', ')
  return {
    ...saved,
    bisLatitude: office.latitude || saved.bisLatitude,
    bisLongitude: office.longitude || saved.bisLongitude,
    toLocation: row.branch_name || saved.toLocation,
    toLocationAddress: officeAddress || saved.toLocationAddress,
  }
}

const HTML_BUILDERS: Record<BisPrintDocumentKind, (data: BisPrintData) => string> = {
  'legal-documents': (d) => buildLegalDocumentsHtml(legalDocumentsDataFromPrintData(d)),
  'application-details': (d) => buildBisForm1Html(bisForm1DataFromPrintData(d)),
  // Kept for typed builders / legacy callers; UI list uses Application Details only.
  'license-details': (d) => buildApplicationDetailsHtml(legalDocumentsDataFromPrintData(d)),
  'branch-details': (d) => buildApplicationDetailsHtml(legalDocumentsDataFromPrintData(d)),
  form1: (d) => buildBisForm1Html(bisForm1DataFromPrintData(d)),
  'authorization-letter': (d) => buildAuthorizationLetterHtml(authorizationLetterDataFromPrintData(d)),
  'cmpf-305': (d) => buildCmpf305Html(cmpf305DataFromPrintData(d)),
  'cmpf-306': (d) => buildCmpf306Html(cmpf306DataFromPrintData(d)),
  'calibration-certificates': (d) => buildCalibrationCertificatesHtml(d),
  'consent-letter': (d) => buildConsentLetterHtml(d),
  'cmpf-307': (d) => buildCmpf307Html(cmpf307DataFromPrintData(d)),
  'cmpf-310': (d) => buildCmpf310Html(cmpf310DataFromPrintData(d)),
  'cmpf-311': (d) => buildCmpf311Html(cmpf311DataFromPrintData(d)),
  'updated-sit': (d) => buildUpdatedSchemeOfInspectionHtml(updatedSchemeOfInspectionDataFromPrintData(d)),
  'factory-test-report': (d) => buildFactoryTestReportHtml(factoryTestReportDataFromPrintData(d)),
  'osl-sample-requirements': (d) => buildOslSampleRequirementsHtml(oslSampleRequirementsDataFromPrintData(d)),
  'undertaking-general': (d) => buildUndertakingGeneralHtml(undertakingGeneralDataFromPrintData(d)),
  'undertaking-option-2': (d) => buildUndertakingOption2Html(undertakingOption2DataFromPrintData(d)),
  'undertaking-long-duration': (d) =>
    buildUndertakingLongDurationHtml(undertakingLongDurationDataFromPrintData(d)),
  'undertaking-mmf': (d) =>
    buildUndertakingMinimumMarkingFeeHtml(undertakingMinimumMarkingFeeDataFromPrintData(d)),
  'appointment-letter': (d) => buildAppointmentLetterHtml(appointmentLetterDataFromPrintData(d)),
  'manufacturing-scope': (d) => buildManufacturingScopeHtml(manufacturingScopeDataFromPrintData(d)),
  'process-description': (d) => buildProcessDescriptionHtml(processDescriptionDataFromPrintData(d)),
  'top-management': (d) => buildTopManagementHtml(topManagementDataFromPrintData(d)),
  'technical-staff': (d) => buildTechnicalStaffHtml(technicalStaffDataFromPrintData(d)),
  'self-evaluation-form': (d) => buildSelfEvaluationFormHtml(selfEvaluationFormDataFromPrintData(d)),
  'certified-reference-materials': (d) =>
    buildCertifiedReferenceMaterialsHtml(certifiedReferenceMaterialsDataFromPrintData(d)),
  'raw-material-details': (d) => buildRawMaterialDetailsHtml(rawMaterialDetailsDataFromPrintData(d)),
  'subcontracted-tests': (d) => buildSubcontractedTestsHtml(subcontractedTestsDataFromPrintData(d)),
  'osl-sample-test-request': (d) =>
    buildOslSampleTestRequestHtml(oslSampleTestRequestDataFromPrintData(d)),
  'process-flow-chart': (d) => buildProcessFlowChartHtml(processFlowChartDataFromPrintData(d)),
  'plant-layout': (d) => buildPlantLayoutHtml(plantLayoutDataFromPrintData(d)),
  'osl-courier-labels': (d) => buildOslCourierLabelsHtml(oslCourierLabelsDataFromPrintData(d)),
  'location-map': (d) => buildLocationMapHtml(locationMapDataFromPrintData(d)),
  'all-required-undertakings': (d) => allRequiredUndertakingsHtml(d),
  'raw-material-reference': (d) => combinePrintHtmlDocuments('Raw Material & Reference Material', [
    buildRawMaterialDetailsHtml(rawMaterialDetailsDataFromPrintData(d)),
    buildCertifiedReferenceMaterialsHtml(certifiedReferenceMaterialsDataFromPrintData(d)),
  ]),
}

/** Builds full HTML for one BIS print document (no popup). */
export async function buildBisDocumentHtml(
  row: BisProjectRow,
  kind: BisPrintDocumentKind,
): Promise<string> {
  const { fetchBisModulePayload } = await import('../projects/bisModuleDataApi')
  const { createBisProjectFileUrls } = await import('../projects/bisProjectFilesApi')
  // Process Description shares merged payload stored under process-flow-chart.
  const modulePayloadKind =
    kind === 'process-description'
      ? 'process-flow-chart'
      : kind === 'osl-sample-test-request' || kind === 'osl-courier-labels'
        ? 'osl-sample-requirements'
        : kind
  const [
    printData,
    modulePayload,
    topManagementPayload,
    technicalManagementPayload,
    factoryTestReportPayload,
    locationMapPayload,
    markingFeePayload,
  ] = await Promise.all([
    loadBisPrintData(row),
    fetchBisModulePayload(row.id, modulePayloadKind).catch(() => null),
    kind === 'top-management'
      ? Promise.resolve(null)
      : fetchBisModulePayload(row.id, 'top-management').catch(() => null),
    kind === 'application-details'
      ? fetchBisModulePayload(row.id, 'technical-staff').catch(() => null)
      : Promise.resolve(null),
    kind === 'osl-sample-requirements'
      ? fetchBisModulePayload(row.id, 'factory-test-report').catch(() => null)
      : Promise.resolve(null),
    kind === 'application-details'
      ? fetchBisModulePayload(row.id, 'location-map').catch(() => null)
      : Promise.resolve(null),
    kind === 'cmpf-311'
      ? fetchBisModulePayload(row.id, 'cmpf-310').catch(() => null)
      : Promise.resolve(null),
  ])

  const tm =
    kind === 'top-management'
      ? modulePayload
      : topManagementPayload

  let data: BisPrintData = {
    ...printData,
    modulePayload,
    topManagement: tm,
    technicalManagement: technicalManagementPayload,
  }

  if (kind === 'self-evaluation-form' || kind === 'all-required-undertakings') {
    const [rawMaterials, technicalStaff, brandData, selfEvaluation, generalUndertaking, longDurationUndertaking, minimumFeeUndertaking] = await Promise.all([
      fetchBisModulePayload(row.id, 'raw-material-reference').catch(() => null),
      fetchBisModulePayload(row.id, 'technical-staff').catch(() => null),
      fetchBisModulePayload(row.id, 'cmpf-307').catch(() => null),
      kind === 'all-required-undertakings'
        ? fetchBisModulePayload(row.id, 'self-evaluation-form').catch(() => null)
        : Promise.resolve(modulePayload),
      kind === 'all-required-undertakings'
        ? fetchBisModulePayload(row.id, 'undertaking-general').catch(() => null)
        : Promise.resolve(null),
      kind === 'all-required-undertakings'
        ? fetchBisModulePayload(row.id, 'undertaking-long-duration').catch(() => null)
        : Promise.resolve(null),
      kind === 'all-required-undertakings'
        ? fetchBisModulePayload(row.id, 'undertaking-mmf').catch(() => null)
        : Promise.resolve(null),
    ])
    data = {
      ...data,
      modulePayload: {
        ...(data.modulePayload ?? {}),
        __sefSources: {
          rawMaterials: rawMaterials?.rawMaterials,
          technicalStaff: technicalStaff?.rows,
          brands: brandData?.rows,
          brandsWithoutMarkReasons: brandData?.brandsWithoutMarkReasons,
          selfEvaluation,
        },
        __undertakingSources: {
          general: generalUndertaking,
          longDuration: longDurationUndertaking,
          minimumFee: minimumFeeUndertaking,
        },
      },
    }
  }

  if (kind === 'location-map') {
    data = {
      ...data,
      modulePayload: await locationMapPayloadWithBranchOffice(row, modulePayload),
    }
  }

  if (kind === 'factory-test-report') {
    const techRaw = await fetchBisModulePayload(row.id, 'technical-staff').catch(() => null)
    const { resolveTechnicalStaffForTestedBy } = await import('../projects/bisModuleDataApi')
    const techPerson = resolveTechnicalStaffForTestedBy(techRaw)
    if (techPerson) {
      let testedBySignatureImageUrl = ''
      if (techPerson.applySignatureToDocuments && techPerson.signatureStoragePath) {
        try {
          const urls = await createBisProjectFileUrls(
            techPerson.signatureStoragePath,
            techPerson.signatureFileName || 'signature',
          )
          testedBySignatureImageUrl = urls.viewUrl?.trim() || ''
        } catch {
          testedBySignatureImageUrl = ''
        }
      }
      data = {
        ...data,
        modulePayload: {
          ...(data.modulePayload ?? {}),
          testedByName: techPerson.personName,
          testedByDesignation: techPerson.designation,
          ...(testedBySignatureImageUrl ? { testedBySignatureImageUrl } : {}),
        },
      }
    }
  }

  if (tm) {
    let name = ''
    let designation = ''
    let path = ''
    let fileName = 'signature'

    // Whichever signature checkbox is on (Authorized Signatory OR a TM person)
    // — that signature is applied on all BIS documents.
    if (Boolean(tm.applyAuthorizedSignatureToDocuments)) {
      name = String(tm.authorizedSignatoryName ?? '').trim()
      designation = String(tm.authorizedSignatoryDesignation ?? '').trim()
      path = String(tm.authorizedSignatureStoragePath ?? '').trim()
      fileName =
        String(tm.authorizedSignatureFileName ?? '').trim() || 'authorized-signature'
    } else if (Array.isArray(tm.rows)) {
      const selected = tm.rows.find(
        (item) =>
          item &&
          typeof item === 'object' &&
          Boolean((item as Record<string, unknown>).applySignatureToDocuments),
      ) as Record<string, unknown> | undefined
      if (selected) {
        name = String(selected.personName ?? '').trim()
        designation = String(selected.designation ?? '').trim()
        path = String(selected.signatureStoragePath ?? '').trim()
        fileName = String(selected.signatureFileName ?? '').trim() || 'signature'
      }
    }

    let signatureImageUrl: string | undefined
    if (path) {
      try {
        const urls = await createBisProjectFileUrls(path, fileName)
        signatureImageUrl = urls.viewUrl
      } catch {
        signatureImageUrl = undefined
      }
    }
    if (name || designation || signatureImageUrl) {
      data = {
        ...data,
        client: name ? { ...data.client, contactPerson: name } : data.client,
        documentSignatory: {
          name: name || data.client.contactPerson,
          designation,
          signatureImageUrl,
        },
        modulePayload: {
          ...(data.modulePayload ?? {}),
          ...(name ? { signatoryName: name } : {}),
          ...(designation ? { signatoryDesignation: designation } : {}),
        },
      }
    }
  }

  let html =
    kind === 'location-map'
      ? buildLocationMapHtml(await enrichLocationMapRoute(locationMapDataFromPrintData(data)))
      : HTML_BUILDERS[kind](data)

  if (kind === 'cmpf-311') {
    const sitData = cmpf311DataFromPrintData(data)
    const markingFeeData = cmpf310DataFromPrintData({
      ...data,
      modulePayload: markingFeePayload,
    })
    const acceptanceLetterHtml = buildCmpf310AcceptanceLetterHtml({
      ...sitData,
      minimumMarkingFee: minimumMarkingFeeForScale(data.isCode, data.client.scale),
      unit: markingFeeData.unit,
      firmScale: data.client.scale,
    })
    html = combinePrintHtmlDocuments('CMPF - 310 & CMPF - 311', [html, acceptanceLetterHtml])
  }

  if (kind === 'application-details') {
    const resolvedLocationMapPayload = await locationMapPayloadWithBranchOffice(row, locationMapPayload)
    const locationData = locationMapDataFromPrintData({
      ...data,
      modulePayload: resolvedLocationMapPayload,
    })
    html = appendPrintHtmlDocument(
      html,
      buildLocationMapHtml(await enrichLocationMapRoute(locationData)),
    )
  }

  // The Sample Offer Letter preview also includes generated FTRs for its printable samples.
  if (kind === 'osl-sample-requirements' && factoryTestReportPayload) {
    const samplePayload = parseOslSampleRequirementsPayload(
      modulePayload && typeof modulePayload === 'object' ? modulePayload : null,
    )
    const printableSampleIds = new Set(
      printableOslSampleRows(samplePayload.rows).map((sample) => sample.id),
    )
    const reports = parseFactoryTestReportPayload(factoryTestReportPayload).reports.filter(
      (report) => printableSampleIds.has(report.sampleRowId) && factoryTestReportHasContent(report),
    )

    if (reports.length > 0) {
      let reportPrintData: BisPrintData = {
        ...data,
        modulePayload: { ...factoryTestReportPayload, reports },
      }
      const techRaw = await fetchBisModulePayload(row.id, 'technical-staff').catch(() => null)
      const { resolveTechnicalStaffForTestedBy } = await import('../projects/bisModuleDataApi')
      const techPerson = resolveTechnicalStaffForTestedBy(techRaw)
      if (techPerson) {
        let testedBySignatureImageUrl = ''
        if (techPerson.applySignatureToDocuments && techPerson.signatureStoragePath) {
          try {
            const urls = await createBisProjectFileUrls(
              techPerson.signatureStoragePath,
              techPerson.signatureFileName || 'signature',
            )
            testedBySignatureImageUrl = urls.viewUrl?.trim() || ''
          } catch {
            testedBySignatureImageUrl = ''
          }
        }
        reportPrintData = {
          ...reportPrintData,
          modulePayload: {
            ...(reportPrintData.modulePayload ?? {}),
            testedByName: techPerson.personName,
            testedByDesignation: techPerson.designation,
            ...(testedBySignatureImageUrl ? { testedBySignatureImageUrl } : {}),
          },
        }
      }
      html = appendPrintHtmlDocument(
        html,
        buildFactoryTestReportHtml(factoryTestReportDataFromPrintData(reportPrintData)),
      )
    }
  }

  // Top Management + Authorized Signatory ON → also generate Authorization Letter (2nd page).
  if (kind === 'top-management' && tm && shouldIncludeAuthorizationLetter(tm)) {
    const authHtml = buildAuthorizationLetterHtml(authorizationLetterDataFromPrintData(data))
    html = appendPrintHtmlDocument(html, authHtml)
  }

  // Technical Staff preview includes generated letters, but uploaded files remain download-only.
  if (kind === 'technical-staff') {
    html = appendGeneratedTechnicalStaffLetters(html, data)
  }

  const toSafeImg = (src: string, alt: string) => {
    const safeSrc = src.replace(/&/g, '&amp;').replace(/"/g, '&quot;')
    return `<img class="pd-sign-img" src="${safeSrc}" alt="${alt}" />`
  }

  const resolveSignatureUrl = async (
    path: string,
    fileName: string,
  ): Promise<string | undefined> => {
    const p = path.trim()
    if (!p) return undefined
    try {
      const urls = await createBisProjectFileUrls(p, fileName.trim() || 'signature')
      return urls.viewUrl
    } catch {
      return undefined
    }
  }

  // Authorization Letter: two signatures — Authorized Person + Authorized By.
  if (tm && (kind === 'top-management' || kind === 'authorization-letter')) {
    const personPath = String(tm.authorizedSignatureStoragePath ?? '').trim()
    const personFile =
      String(tm.authorizedSignatureFileName ?? '').trim() || 'authorized-signature'
    const personUrl = await resolveSignatureUrl(personPath, personFile)

    const authorizedByName = String(tm.authorizedBy ?? '').trim()
    const byRow = Array.isArray(tm.rows)
      ? (tm.rows.find(
          (item) =>
            item &&
            typeof item === 'object' &&
            String((item as Record<string, unknown>).personName ?? '').trim() ===
              authorizedByName,
        ) as Record<string, unknown> | undefined)
      : undefined
    const byPath = String(byRow?.signatureStoragePath ?? '').trim()
    const byFile = String(byRow?.signatureFileName ?? '').trim() || 'signature'
    const byUrl =
      (await resolveSignatureUrl(byPath, byFile)) ||
      // Fallback: if Authorized By is the same person currently applied to documents.
      (data.documentSignatory?.name.trim() === authorizedByName
        ? data.documentSignatory.signatureImageUrl
        : undefined)

    if (personUrl) {
      const imgTag = toSafeImg(personUrl, 'Authorized person signature')
      html = html.replace(
        /<div class="al-sign-space al-sign-space-person"><\/div>/g,
        `<div class="al-sign-space al-sign-space-person">${imgTag}</div>`,
      )
    }
    if (byUrl) {
      const imgTag = toSafeImg(byUrl, 'Authorized by signature')
      html = html.replace(
        /<div class="al-sign-space al-sign-space-by"><\/div>/g,
        `<div class="al-sign-space al-sign-space-by">${imgTag}</div>`,
      )
    }
  }

  const img = data.documentSignatory?.signatureImageUrl?.trim()
  if (img) {
    const imgTag = toSafeImg(img, 'Authorized signature')
    html = html.replace(
      /<div class="pd-sign-space"><\/div>/g,
      `<div class="pd-sign-space">${imgTag}</div>`,
    )
  }
  return injectBisDocumentPageFooters(html)
}

function appendGeneratedTechnicalStaffLetters(
  baseHtml: string,
  data: BisPrintData,
): string {
  const staffData = technicalStaffDataFromPrintData(data)
  let html = baseHtml
  for (const person of staffData.rows) {
    // Generated appointment letters may appear; uploaded appointment files do not.
    if (!person.appointmentLetterStoragePath.trim() && person.appointmentDate.trim()) {
      html = appendPrintHtmlDocument(
        html,
        buildAppointmentLetterHtml(appointmentLetterDataForTechnicalStaff(data, person)),
      )
    }
  }

  return html
}

function shouldIncludeAuthorizationLetter(tm: Record<string, unknown>): boolean {
  if (Boolean(tm.includeAuthorizedSignatory)) return true
  return Boolean(
    String(tm.authorizedSignatoryName ?? '').trim() ||
      String(tm.authorizedSignatoryDesignation ?? '').trim() ||
      String(tm.authorizedBy ?? '').trim() ||
      String(tm.authorizedSignatureStoragePath ?? '').trim() ||
      Boolean(tm.applyAuthorizedSignatureToDocuments),
  )
}

/**
 * Loads client / IS code / company context and opens the printable document.
 * Must be called directly from a user click so the pre-opened tab is not blocked.
 * Returns an error message, or null on success.
 */
export async function printBisDocument(
  row: BisProjectRow,
  kind: BisPrintDocumentKind,
): Promise<string | null> {
  const label = BIS_PRINT_DOCUMENT_LABEL[kind]
  const target = openPendingPrintWindow(`Preparing ${label}…`)
  if (!target) return 'Popup blocked. Allow popups to print.'

  try {
    const { loadBisProjectPrintPageSettings } = await import(
      '../projects/bisPrintPageSettingsApi'
    )
    const [html, settings] = await Promise.all([
      buildBisDocumentHtml(row, kind),
      loadBisProjectPrintPageSettings(row.id).catch(
        () => DEFAULT_BIS_DOCUMENT_PRINT_PAGE_SETTINGS,
      ),
    ])
    return openPrintHtml(applyBisDocumentPrintPageSettings(html, settings), { target })
  } catch (err) {
    target.close()
    const message = err instanceof Error ? err.message : 'Unknown error'
    return `Could not prepare ${label}: ${message}`
  }
}

export type TechnicalStaffAppointmentInput = {
  personName: string
  designation: string
  educationalQualification: string
  experienceYears: string
  appointmentDate: string
  appointmentReferenceNo: string
}

/** Builds Appointment Letter HTML for one Technical Staff person (preview / print). */
export async function buildAppointmentLetterHtmlForTechnicalStaff(
  row: BisProjectRow,
  staff: TechnicalStaffAppointmentInput,
): Promise<string> {
  const { fetchBisModulePayload } = await import('../projects/bisModuleDataApi')
  const { createBisProjectFileUrls } = await import('../projects/bisProjectFilesApi')
  const [printData, tm] = await Promise.all([
    loadBisPrintData(row),
    fetchBisModulePayload(row.id, 'top-management').catch(() => null),
  ])

  let data: BisPrintData = { ...printData, topManagement: tm }
  if (tm) {
    let name = ''
    let designation = ''
    let path = ''
    let fileName = 'signature'
    if (Boolean(tm.applyAuthorizedSignatureToDocuments)) {
      name = String(tm.authorizedSignatoryName ?? '').trim()
      designation = String(tm.authorizedSignatoryDesignation ?? '').trim()
      path = String(tm.authorizedSignatureStoragePath ?? '').trim()
      fileName =
        String(tm.authorizedSignatureFileName ?? '').trim() || 'authorized-signature'
    } else if (Array.isArray(tm.rows)) {
      const selected = tm.rows.find(
        (item) =>
          item &&
          typeof item === 'object' &&
          Boolean((item as Record<string, unknown>).applySignatureToDocuments),
      ) as Record<string, unknown> | undefined
      if (selected) {
        name = String(selected.personName ?? '').trim()
        designation = String(selected.designation ?? '').trim()
        path = String(selected.signatureStoragePath ?? '').trim()
        fileName = String(selected.signatureFileName ?? '').trim() || 'signature'
      }
    }
    let signatureImageUrl: string | undefined
    if (path) {
      try {
        const urls = await createBisProjectFileUrls(path, fileName)
        signatureImageUrl = urls.viewUrl
      } catch {
        signatureImageUrl = undefined
      }
    }
    if (name || designation || signatureImageUrl) {
      data = {
        ...data,
        documentSignatory: {
          name: name || data.client.contactPerson,
          designation,
          signatureImageUrl,
        },
      }
    }
  }

  let html = buildAppointmentLetterHtml(appointmentLetterDataForTechnicalStaff(data, staff))
  const img = data.documentSignatory?.signatureImageUrl?.trim()
  if (img) {
    const safeSrc = img.replace(/&/g, '&amp;').replace(/"/g, '&quot;')
    const imgTag = `<img class="pd-sign-img" src="${safeSrc}" alt="Authorized signature" />`
    html = html.replace(
      /<div class="pd-sign-space"><\/div>/g,
      `<div class="pd-sign-space">${imgTag}</div>`,
    )
  }
  return injectBisDocumentPageFooters(html)
}

/** Creates / prints Appointment Letter for one Technical Staff person. */
export async function printAppointmentLetterForTechnicalStaff(
  row: BisProjectRow,
  staff: TechnicalStaffAppointmentInput,
): Promise<string | null> {
  const target = openPendingPrintWindow('Preparing Appointment Letter…')
  if (!target) return 'Popup blocked. Allow popups to print.'

  try {
    return openPrintHtml(await buildAppointmentLetterHtmlForTechnicalStaff(row, staff), {
      target,
    })
  } catch (err) {
    target.close()
    const message = err instanceof Error ? err.message : 'Unknown error'
    return `Could not prepare Appointment Letter: ${message}`
  }
}
