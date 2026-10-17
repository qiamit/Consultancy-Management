import type { BisPrintDocumentKind } from '../print/printBisDocument'

/** Step layout mirrors Manak Online "Online Application for Grant of License" (steps 1–8; step 9 Pay Fee is done on Manak). */
export type BisApplicationStep = {
  id: string
  /** Short label shown under the stepper circle. */
  label: string
  /** Page heading — same wording Manak uses. */
  title: string
  /** What Manak asks on this step (shown as a hint). */
  manakHint: string
  kinds: BisPrintDocumentKind[]
}

export const BIS_APPLICATION_STEPS: BisApplicationStep[] = [
  {
    id: 'general',
    label: 'Application General Information',
    title: 'Application General Information',
    manakHint:
      'Registration, factory and office details, Indian Standard, SIT acceptance and product varieties.',
    kinds: ['application-details'],
  },
  {
    id: 'management',
    label: 'Management Details',
    title: 'Management Details',
    manakHint:
      'Top management, correspondence contact, technical / quality assurance personnel with qualification and photo.',
    kinds: ['top-management', 'technical-staff'],
  },
  {
    id: 'manufacturing',
    label: 'Manufacturing Process',
    title: 'Manufacturing Process',
    manakHint:
      'Raw materials, process flow chart, factory layout plan, machinery list, production value and capacity.',
    kinds: [
      'raw-material-reference',
      'process-flow-chart',
      'plant-layout',
      'cmpf-305',
      'manufacturing-scope',
    ],
  },
  {
    id: 'packaging',
    label: 'Packaging Marking Branding',
    title: 'Packaging & Brand Details',
    manakHint: 'Packaging and marking details, label form, brand names / trademarks with registration.',
    kinds: ['cmpf-307'],
  },
  {
    id: 'testing',
    label: 'Testing and Inspection',
    title: 'Testing & Inspection Details',
    manakHint: 'In-house testing facility, list of testing equipment, sub-contracted tests with consent letters.',
    kinds: ['cmpf-306', 'cmpf-311'],
  },
  {
    id: 'test-reports',
    label: 'Test Reports',
    title: 'Test Reports',
    manakHint:
      'Independent test report per variety: QR code, sample code, issue date, report, completeness and conformity.',
    kinds: ['osl-sample-requirements'],
  },
  {
    id: 'declaration',
    label: 'Declaration / Undertaking',
    title: 'Declaration & Undertaking',
    manakHint: 'Miscellaneous declaration, person submitting the application, weekly offs and undertakings.',
    kinds: ['all-required-undertakings'],
  },
]

export const BIS_PREVIEW_STEP_LABEL = 'Preview Application'

/** Total steps in the wizard including the final Preview step. */
export const BIS_WIZARD_STEP_COUNT = BIS_APPLICATION_STEPS.length + 1

/**
 * Kinds present in the document pack but not assigned to a step above
 * (kept visible on the Declaration step so nothing disappears).
 */
export function unassignedKinds(all: BisPrintDocumentKind[]): BisPrintDocumentKind[] {
  const assigned = new Set(BIS_APPLICATION_STEPS.flatMap((s) => s.kinds))
  return all.filter((k) => !assigned.has(k))
}
