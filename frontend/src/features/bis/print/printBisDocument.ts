import type { BisProjectRow } from '../projects/types'
import {
  appointmentLetterDataFromPrintData,
  buildAppointmentLetterHtml,
} from './appointmentLetterHtml'
import { authorizationLetterDataFromPrintData, buildAuthorizationLetterHtml } from './authorizationLetterHtml'
import { bisForm1DataFromPrintData, buildBisForm1Html } from './bisForm1Html'
import { buildCmpf305Html, cmpf305DataFromPrintData } from './cmpf305Html'
import { buildCmpf306Html, cmpf306DataFromPrintData } from './cmpf306Html'
import { buildCmpf307Html, cmpf307DataFromPrintData } from './cmpf307Html'
import { buildCmpf310Html, cmpf310DataFromPrintData } from './cmpf310Html'
import { buildCmpf311Html, cmpf311DataFromPrintData } from './cmpf311Html'
import {
  buildCertifiedReferenceMaterialsHtml,
  certifiedReferenceMaterialsDataFromPrintData,
} from './certifiedReferenceMaterialsHtml'
import { buildFactoryTestReportHtml, factoryTestReportDataFromPrintData } from './factoryTestReportHtml'
import { loadBisPrintData, type BisPrintData } from './loadBisPrintData'
import {
  buildLocationMapHtml,
  locationMapDataFromPrintData,
} from './locationMapHtml'
import {
  buildManufacturingScopeHtml,
  manufacturingScopeDataFromPrintData,
} from './manufacturingScopeHtml'
import { openPendingPrintWindow, openPrintHtml } from './openPrintHtml'
import { buildOslSampleRequirementsHtml, oslSampleRequirementsDataFromPrintData } from './oslSampleRequirementsHtml'
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

export type BisPrintDocumentKind =
  | 'form1'
  | 'authorization-letter'
  | 'cmpf-305'
  | 'cmpf-306'
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
  | 'certified-reference-materials'
  | 'raw-material-details'
  | 'subcontracted-tests'
  | 'osl-sample-test-request'
  | 'process-flow-chart'
  | 'plant-layout'
  | 'osl-courier-labels'
  | 'location-map'

export const BIS_PRINT_DOCUMENT_LABEL: Record<BisPrintDocumentKind, string> = {
  form1: 'BIS Form-I',
  'authorization-letter': 'Authorization Letter',
  'cmpf-305': 'CMPF-305 (Plant & Machinery)',
  'cmpf-306': 'CMPF-306 (Testing Equipment)',
  'cmpf-307': 'CMPF-307 (Brand Names)',
  'cmpf-310': 'CMPF-310 (Marking Fee)',
  'cmpf-311': 'CMPF-311 (Acceptance of SIT)',
  'updated-sit': 'Updated Scheme of Inspection',
  'factory-test-report': 'Factory Test Report',
  'osl-sample-requirements': 'OSL Sample Requirements',
  'undertaking-general': 'Undertaking (General & ISS)',
  'undertaking-option-2': 'Undertaking (Option 2)',
  'undertaking-long-duration': 'Undertaking (Long Duration Test)',
  'undertaking-mmf': 'Annex-1 Marking Fee Calculation',
  'appointment-letter': 'Appointment Letter',
  'manufacturing-scope': 'Manufacturing Scope Declaration',
  'process-description': 'Process Description',
  'top-management': 'Top Management Details',
  'technical-staff': 'Technical Staff Details',
  'self-evaluation-form': 'Self Evaluation Form',
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
  'cmpf-310',
  'cmpf-311',
  'updated-sit',
  'factory-test-report',
  'osl-sample-requirements',
  'undertaking-general',
  'undertaking-option-2',
  'undertaking-long-duration',
  'undertaking-mmf',
  'appointment-letter',
  'manufacturing-scope',
  'process-description',
  'top-management',
  'technical-staff',
  'self-evaluation-form',
  'certified-reference-materials',
  'raw-material-details',
  'subcontracted-tests',
  'osl-sample-test-request',
  'process-flow-chart',
  'plant-layout',
  'osl-courier-labels',
  'location-map',
]

/** Shared tooltip text for the "More prints" trigger. */
export const MORE_PRINTS_TOOLTIP =
  'Full BIS application print pack (CMPF, undertakings, staff, SEF, OSL, plant layout, location map)'

const HTML_BUILDERS: Record<BisPrintDocumentKind, (data: BisPrintData) => string> = {
  form1: (d) => buildBisForm1Html(bisForm1DataFromPrintData(d)),
  'authorization-letter': (d) => buildAuthorizationLetterHtml(authorizationLetterDataFromPrintData(d)),
  'cmpf-305': (d) => buildCmpf305Html(cmpf305DataFromPrintData(d)),
  'cmpf-306': (d) => buildCmpf306Html(cmpf306DataFromPrintData(d)),
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
}

/** Builds full HTML for one BIS print document (no popup). */
export async function buildBisDocumentHtml(
  row: BisProjectRow,
  kind: BisPrintDocumentKind,
): Promise<string> {
  const printData = await loadBisPrintData(row)
  return HTML_BUILDERS[kind](printData)
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
    return openPrintHtml(await buildBisDocumentHtml(row, kind), { target })
  } catch (err) {
    target.close()
    const message = err instanceof Error ? err.message : 'Unknown error'
    return `Could not prepare ${label}: ${message}`
  }
}
