import type { BisPrintDocumentKind } from '../print/printBisDocument'

/* Module-data kinds that are stored per application but are not printed documents.
   Kept apart from the step components so they can be read at import time without a cycle. */

/** Step 2: correspondence contact. */
export const CORRESPONDENCE_KIND = 'application-correspondence' as BisPrintDocumentKind

/** Step 3: Applicable Yes / No per manufacturing component. */
export const MANUFACTURING_COMPONENTS_KIND = 'manufacturing-components' as BisPrintDocumentKind

/** Step 4: Applicable Yes / No per packaging component. */
export const PACKAGING_COMPONENTS_KIND = 'packaging-components' as BisPrintDocumentKind

/** Step 5: in-house testing facility and Applicable Yes / No per testing component. */
export const TESTING_COMPONENTS_KIND = 'testing-components' as BisPrintDocumentKind

/** Step 6: Applicable Yes / No per test report component. */
export const TEST_REPORT_COMPONENTS_KIND = 'test-report-components' as BisPrintDocumentKind

/** Step 6: long duration tests in progress (with the relaxation choice). */
export const LONG_DURATION_TESTS_KIND = 'long-duration-tests' as BisPrintDocumentKind

/** Step 7: Manak Online declaration answers, supporting uploads and weekly off days. */
export const APPLICATION_DECLARATION_KIND = 'application-declaration' as BisPrintDocumentKind
