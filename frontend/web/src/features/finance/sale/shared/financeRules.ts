import { gstinStateCode, isValidGstin } from '@/lib/indiaValidators'
import type { QuotationLineForm } from '../quotation/types'

export type GstSupplyMode = 'intra' | 'inter'

/** Same GST state is CGST + SGST. A different state is IGST. A missing or invalid GSTIN stays intra-state. */
export function gstSupplyMode(supplierGstin: string, recipientGstin: string): GstSupplyMode {
  const supplier = supplierGstin.trim()
  const recipient = recipientGstin.trim()
  if (!supplier || !recipient || !isValidGstin(supplier) || !isValidGstin(recipient)) return 'intra'
  return gstinStateCode(supplier) === gstinStateCode(recipient) ? 'intra' : 'inter'
}

export const DEFAULT_CONSULTANCY_SAC = '998393'
export const DEFAULT_CONSULTANCY_GST = '18'

/** GST is charged when the tax invoice is issued. Quotations, proforma invoices, and receipts stay without GST. */
export function linesForDocumentKind(kind: string, lines: QuotationLineForm[]): QuotationLineForm[] {
  if (kind === 'invoice') {
    return lines.map((line) => ({
      ...line,
      hsnSac: line.hsnSac.trim() || DEFAULT_CONSULTANCY_SAC,
      gstPercent: Number(line.gstPercent) > 0 ? line.gstPercent : DEFAULT_CONSULTANCY_GST,
    }))
  }
  if (kind === 'quotation' || kind === 'proformaInvoice' || kind === 'paymentReceipt') {
    return lines.map((line) => ({ ...line, gstPercent: '0' }))
  }
  return lines
}

export function tdsAmount(gross: number, percent: string): number {
  if (percent !== '2' && percent !== '10') return 0
  const rate = Number(percent)
  return Math.round(gross * (rate / 100) * 100) / 100
}
