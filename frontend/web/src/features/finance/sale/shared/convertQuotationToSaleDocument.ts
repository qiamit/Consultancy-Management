import {
  fetchNextSaleDocumentNumber,
  formatSaleApiError,
  saveSaleDocument,
  type SaleDocumentKind,
} from './saleDocumentsApi'
import {
  normalizePaymentMethod,
  rowToForm,
  type QuotationRow,
  type QuotationStatus,
} from '../quotation/types'

export type QuotationConvertTarget = 'proformaInvoice' | 'invoice' | 'creditNote'

function defaultPrefix(kind: QuotationConvertTarget): string {
  const year = new Date().getFullYear()
  if (kind === 'proformaInvoice') return `PI-${year}-`
  if (kind === 'creditNote') return `CN-${year}-`
  return `INV-${year}-`
}

function targetKindFromQuotationStatus(status: QuotationStatus): QuotationConvertTarget | null {
  if (status === 'Proforma') return 'proformaInvoice'
  if (status === 'Invoice' || status === 'Converted') return 'invoice'
  if (status === 'CreditNote') return 'creditNote'
  return null
}

function statusAfterConvert(target: QuotationConvertTarget): QuotationStatus {
  if (target === 'proformaInvoice') return 'Proforma'
  if (target === 'creditNote') return 'Finalized'
  return 'Invoice'
}

function labelForKind(kind: SaleDocumentKind): string {
  if (kind === 'proformaInvoice') return 'Proforma Invoice'
  if (kind === 'creditNote') return 'Credit Note'
  if (kind === 'invoice') return 'Tax Invoice'
  return 'Document'
}

/**
 * Creates a Proforma Invoice, Tax Invoice, or Credit Note from a source sale document
 * (lines + client snapshot), then returns the new document number.
 */
export async function convertQuotationToSaleDocument(
  row: QuotationRow,
  target: QuotationConvertTarget,
): Promise<{ kind: SaleDocumentKind; documentNumber: string }> {
  if (!row.client_id && !row.client_name?.trim()) {
    throw new Error('Client is required before converting this document.')
  }
  if (!row.line_items?.some((l) => (l.description ?? '').trim())) {
    throw new Error('Add at least one line item before converting.')
  }

  const prefix = defaultPrefix(target)
  const documentNumber = await fetchNextSaleDocumentNumber(target, prefix)
  const form = {
    ...rowToForm(row, true, documentNumber),
    status: statusAfterConvert(target),
    referenceNo: row.quotation_number,
  }

  await saveSaleDocument(target, form, null)
  return { kind: target, documentNumber }
}

/** Quotation / Proforma / Invoice status convert actions. */
export async function convertQuotationIfNeeded(
  row: QuotationRow,
  status: QuotationStatus,
): Promise<string | null> {
  const target = targetKindFromQuotationStatus(status)
  if (!target) return null
  // Credit Note convert is only valid from Invoice module (caller gates).
  if (target === 'creditNote') return null
  try {
    const { documentNumber, kind } = await convertQuotationToSaleDocument(row, target)
    return `Created ${labelForKind(kind)} ${documentNumber} from ${row.quotation_number}.`
  } catch (err) {
    throw new Error(formatSaleApiError(err))
  }
}

/** Invoice → Credit Note convert (status action or explicit call). */
export async function convertInvoiceToCreditNoteIfNeeded(
  row: QuotationRow,
  status: QuotationStatus,
): Promise<string | null> {
  if (status !== 'CreditNote') return null
  try {
    const { documentNumber } = await convertQuotationToSaleDocument(row, 'creditNote')
    return `Created Credit Note ${documentNumber} from ${row.quotation_number}.`
  } catch (err) {
    throw new Error(formatSaleApiError(err))
  }
}

/** Invoice → Payment Receipt convert (creates a `transactions` receipt for the invoice total). */
export async function convertInvoiceToPaymentReceiptIfNeeded(
  row: QuotationRow,
  status: QuotationStatus,
): Promise<string | null> {
  if (status !== 'Payment') return null
  try {
    if (!row.client_id && !row.client_name?.trim()) {
      throw new Error('Client is required before converting this document.')
    }
    const amount = Number(row.grand_total ?? 0)
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new Error('Invoice grand total must be greater than 0 to create a payment receipt.')
    }
    const year = new Date().getFullYear()
    const documentNumber = await fetchNextSaleDocumentNumber('paymentReceipt', `PR-${year}-`)
    const form = {
      ...rowToForm(row, true, documentNumber),
      status: 'Finalized' as QuotationStatus,
      referenceNo: row.quotation_number,
      paymentAmount: String(amount),
      paymentMethod: normalizePaymentMethod(null),
      subject: (row.subject ?? '').trim() || `Payment against ${row.quotation_number}`,
    }
    await saveSaleDocument('paymentReceipt', form, null)
    return `Created Payment Receipt ${documentNumber} from ${row.quotation_number}.`
  } catch (err) {
    throw new Error(formatSaleApiError(err))
  }
}
