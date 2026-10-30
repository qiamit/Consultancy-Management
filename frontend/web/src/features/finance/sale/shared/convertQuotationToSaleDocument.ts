import { supabase } from '@/lib/supabaseClient'
import {
  fetchNextSaleDocumentNumber,
  formatSaleApiError,
  saveSaleDocument,
  type SaleDocumentKind,
} from './saleDocumentsApi'
import {
  formatMoney,
  normalizePaymentMethod,
  rowToForm,
  type QuotationRow,
  type QuotationStatus,
} from '../quotation/types'
import { listInvoiceOutstanding } from './invoiceBalanceApi'
import { withCurrencySymbol } from '@/lib/appCurrency'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Amount still due on a saved tax invoice, from the same `invoice_outstanding_for` RPC the
 * invoice list uses: grand total − receipts against it (net of refunds) − credit notes
 * + sales debit notes. Null when the invoice is not found (e.g. cancelled).
 */
async function savedInvoiceOutstanding(row: QuotationRow): Promise<number | null> {
  let invoiceId = UUID_RE.test(row.id) ? row.id : ''
  if (!invoiceId) {
    // Converted straight after a first save: the row has no id yet, so find it by number.
    let query = supabase
      .from('finance_tax_invoices')
      .select('id')
      .eq('tax_invoice_number', row.quotation_number.trim())
    if (row.client_id) query = query.eq('client_id', row.client_id)
    const { data, error } = await query.limit(1).maybeSingle()
    if (error) throw error
    invoiceId = String((data as { id?: string } | null)?.id ?? '')
  }
  if (!invoiceId) return null
  const [balance] = await listInvoiceOutstanding([invoiceId])
  return balance ? balance.outstanding : null
}

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

/**
 * Invoice → Payment Receipt convert. Creates a `transactions` receipt for the amount still
 * outstanding on the invoice (not its full total). A settled invoice gets no receipt.
 */
export async function convertInvoiceToPaymentReceiptIfNeeded(
  row: QuotationRow,
  status: QuotationStatus,
): Promise<string | null> {
  if (status !== 'Payment') return null
  try {
    if (!row.client_id && !row.client_name?.trim()) {
      throw new Error('Client is required before converting this document.')
    }
    const grandTotal = Number(row.grand_total ?? 0)
    if (!Number.isFinite(grandTotal) || grandTotal <= 0) {
      throw new Error('Invoice grand total must be greater than 0 to create a payment receipt.')
    }
    const outstanding = await savedInvoiceOutstanding(row)
    const amount = Math.round((outstanding ?? grandTotal) * 100) / 100
    if (amount <= 0.009) {
      return `Invoice ${row.quotation_number} is already fully settled (receipts / credit notes cover its total), so no Payment Receipt was created.`
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
    const partly = outstanding != null && amount < grandTotal - 0.009
    return partly
      ? `Created Payment Receipt ${documentNumber} for the outstanding ${withCurrencySymbol(formatMoney(amount))} on ${row.quotation_number}.`
      : `Created Payment Receipt ${documentNumber} from ${row.quotation_number}.`
  } catch (err) {
    throw new Error(formatSaleApiError(err))
  }
}

/** Purchase order → purchase bill. The order itself stores no GST; the bill starts at 18%. */
export async function convertPurchaseOrderToBillIfNeeded(
  row: QuotationRow,
  status: QuotationStatus,
): Promise<string | null> {
  if (status !== 'Converted') return null
  try {
    if (!row.client_id && !row.client_name?.trim()) {
      throw new Error('Vendor is required before converting this order.')
    }
    const year = new Date().getFullYear()
    const documentNumber = await fetchNextSaleDocumentNumber('purchase', `PU-${year}-`)
    const form = {
      ...rowToForm(row, true, documentNumber),
      status: 'Draft' as QuotationStatus,
      referenceNo: row.quotation_number,
      gstPercent: '18',
      lines: rowToForm(row, true, documentNumber).lines.map((line) => ({
        ...line,
        gstPercent: Number(line.gstPercent) > 0 ? line.gstPercent : '18',
      })),
    }
    if (!form.lines.some((line) => line.description.trim())) {
      const { data, error } = await supabase
        .from('finance_purchase_order_lines')
        .select('item_description, qty, unit_rate, unit_of_item, gst_rate, extra')
        .eq('purchase_order_id', row.id)
        .order('sort_order', { ascending: true })
      if (error) throw error
      form.lines = (data ?? []).map((raw, index) => {
        const line = raw as {
          item_description?: string | null
          qty?: number | null
          unit_rate?: number | null
          unit_of_item?: string | null
          gst_rate?: string | null
          extra?: { hsn_sac?: string | null } | null
        }
        return {
          key: `po-${index}`,
          description: String(line.item_description ?? ''),
          details: '',
          make: '',
          hsnSac: String(line.extra?.hsn_sac ?? ''),
          itemCode: '',
          quantity: String(line.qty ?? 1),
          unit: String(line.unit_of_item ?? ''),
          rate: String(line.unit_rate ?? 0),
          discountPercent: '',
          gstPercent: Number(line.gst_rate) > 0 ? String(line.gst_rate) : '18',
          lineRemarks: '',
          deliveryPeriod: '',
        }
      })
    }
    if (!form.lines.some((line) => line.description.trim())) {
      throw new Error('Add at least one line item before converting.')
    }
    await saveSaleDocument('purchase', form, null)
    return `Created Purchase Bill ${documentNumber} from ${row.quotation_number}.`
  } catch (err) {
    throw new Error(formatSaleApiError(err))
  }
}
