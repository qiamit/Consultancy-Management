import type { BisProjectRow } from '../projects/types'
import { authorizationLetterDataFromPrintData, buildAuthorizationLetterHtml } from './authorizationLetterHtml'
import { bisForm1DataFromPrintData, buildBisForm1Html } from './bisForm1Html'
import { loadBisPrintData } from './loadBisPrintData'
import { openPendingPrintWindow, openPrintHtml } from './openPrintHtml'

export type BisPrintDocumentKind = 'form1' | 'authorization-letter'

const KIND_LABEL: Record<BisPrintDocumentKind, string> = {
  form1: 'BIS Form-I',
  'authorization-letter': 'Authorization Letter',
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
  const target = openPendingPrintWindow(`Preparing ${KIND_LABEL[kind]}…`)
  if (!target) return 'Popup blocked. Allow popups to print.'

  try {
    const printData = await loadBisPrintData(row)
    const html =
      kind === 'form1'
        ? buildBisForm1Html(bisForm1DataFromPrintData(printData))
        : buildAuthorizationLetterHtml(authorizationLetterDataFromPrintData(printData))
    return openPrintHtml(html, { target })
  } catch (err) {
    target.close()
    const message = err instanceof Error ? err.message : 'Unknown error'
    return `Could not prepare ${KIND_LABEL[kind]}: ${message}`
  }
}
