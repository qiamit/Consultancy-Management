import { emailHtmlDocumentToClient } from '../shared/emailHtmlToClient'
import type { BisProjectRow } from '../projects/types'
import {
  BIS_PRINT_DOCUMENT_LABEL,
  buildBisDocumentHtml,
  type BisPrintDocumentKind,
} from './printBisDocument'

/** Emails one BIS print document (e.g. Form-I) to the project's client. */
export async function emailBisDocumentToClient(
  row: BisProjectRow,
  kind: BisPrintDocumentKind = 'form1',
): Promise<string> {
  const label = BIS_PRINT_DOCUMENT_LABEL[kind]
  const html = await buildBisDocumentHtml(row, kind)
  const cmL = (row.cm_l_digits ?? '').trim()
  const subject = cmL ? `${label} — CM/L ${cmL}` : label
  return emailHtmlDocumentToClient({
    clientId: row.client_id,
    title: label,
    subject,
    html,
    filenameBase: cmL ? `${kind}_${cmL}` : kind,
  })
}
