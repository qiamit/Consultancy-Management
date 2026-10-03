import type { BisProjectRow } from '../projects/types'
import { authorizationLetterDataFromPrintData, buildAuthorizationLetterHtml } from './authorizationLetterHtml'
import { bisForm1DataFromPrintData, buildBisForm1Html } from './bisForm1Html'
import { buildCmpf305Html, cmpf305DataFromPrintData } from './cmpf305Html'
import { loadBisPrintData, type BisPrintData } from './loadBisPrintData'
import { openPendingPrintWindow, openPrintHtml } from './openPrintHtml'
import { buildOslSampleRequirementsHtml, oslSampleRequirementsDataFromPrintData } from './oslSampleRequirementsHtml'
import { buildUndertakingGeneralHtml, undertakingGeneralDataFromPrintData } from './undertakingGeneralHtml'

export type BisPrintDocumentKind =
  | 'form1'
  | 'authorization-letter'
  | 'cmpf-305'
  | 'osl-sample-requirements'
  | 'undertaking-general'

export const BIS_PRINT_DOCUMENT_LABEL: Record<BisPrintDocumentKind, string> = {
  form1: 'BIS Form-I',
  'authorization-letter': 'Authorization Letter',
  'cmpf-305': 'CMPF-305 (Plant & Machinery)',
  'osl-sample-requirements': 'OSL Sample Requirements',
  'undertaking-general': 'Undertaking (General & ISS)',
}

/** Documents offered in the "More prints" menu (Form-I and Authorization Letter have their own buttons). */
export const EXTRA_PRINT_KINDS: BisPrintDocumentKind[] = [
  'cmpf-305',
  'osl-sample-requirements',
  'undertaking-general',
]

const HTML_BUILDERS: Record<BisPrintDocumentKind, (data: BisPrintData) => string> = {
  form1: (d) => buildBisForm1Html(bisForm1DataFromPrintData(d)),
  'authorization-letter': (d) => buildAuthorizationLetterHtml(authorizationLetterDataFromPrintData(d)),
  'cmpf-305': (d) => buildCmpf305Html(cmpf305DataFromPrintData(d)),
  'osl-sample-requirements': (d) => buildOslSampleRequirementsHtml(oslSampleRequirementsDataFromPrintData(d)),
  'undertaking-general': (d) => buildUndertakingGeneralHtml(undertakingGeneralDataFromPrintData(d)),
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
    const printData = await loadBisPrintData(row)
    return openPrintHtml(HTML_BUILDERS[kind](printData), { target })
  } catch (err) {
    target.close()
    const message = err instanceof Error ? err.message : 'Unknown error'
    return `Could not prepare ${label}: ${message}`
  }
}
