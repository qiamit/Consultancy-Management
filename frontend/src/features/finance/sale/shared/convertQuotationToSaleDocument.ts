import {
  fetchNextSaleDocumentNumber,
  formatSaleApiError,
  saveSaleDocument,
  type SaleDocumentKind,
} from './saleDocumentsApi'
import { rowToForm, type QuotationRow, type QuotationStatus } from '../quotation/types'

export type QuotationConvertTarget = 'proformaInvoice' | 'invoice'

function defaultPrefix(kind: QuotationConvertTarget): string {
  const year = new Date().getFullYear()
  return kind === 'proformaInvoice' ? `PI-${year}-` : `INV-${year}-`
}

function targetKind(status: QuotationStatus): QuotationConvertTarget | null {
  if (status === 'Proforma') return 'proformaInvoice'
  if (status === 'Invoice' || status === 'Converted') return 'invoice'
  return null
}

/**
 * Creates a Proforma Invoice or Tax Invoice from a quotation (lines + client snapshot),
 * then returns the new document number. Does not mutate the quotation row itself.
 */
export async function convertQuotationToSaleDocument(
  row: QuotationRow,
  target: QuotationConvertTarget,
): Promise<{ kind: SaleDocumentKind; documentNumber: string }> {
  if (!row.client_id && !row.client_name?.trim()) {
    throw new Error('Client is required before converting this quotation.')
  }
  if (!row.line_items?.some((l) => (l.description ?? '').trim())) {
    throw new Error('Add at least one line item before converting this quotation.')
  }

  const prefix = defaultPrefix(target)
  const documentNumber = await fetchNextSaleDocumentNumber(target, prefix)
  const form = {
    ...rowToForm(row, true, documentNumber),
    status: (target === 'proformaInvoice' ? 'Proforma' : 'Invoice') as QuotationStatus,
    referenceNo: row.quotation_number,
  }

  await saveSaleDocument(target, form, null)
  return { kind: target, documentNumber }
}

/** If the chosen quotation status is a convert action, create the matching finance document. */
export async function convertQuotationIfNeeded(
  row: QuotationRow,
  status: QuotationStatus,
): Promise<string | null> {
  const target = targetKind(status)
  if (!target) return null
  try {
    const { documentNumber, kind } = await convertQuotationToSaleDocument(row, target)
    const label = kind === 'proformaInvoice' ? 'Proforma Invoice' : 'Tax Invoice'
    return `Created ${label} ${documentNumber} from ${row.quotation_number}.`
  } catch (err) {
    throw new Error(formatSaleApiError(err))
  }
}
