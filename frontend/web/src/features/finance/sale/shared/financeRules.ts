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

/**
 * Sale documents that charge GST default missing line rates to 18% (consultancy SAC).
 * Payment receipts and purchase orders stay without GST on the lines.
 */
export function linesForDocumentKind(kind: string, lines: QuotationLineForm[]): QuotationLineForm[] {
  if (
    kind === 'invoice' ||
    kind === 'quotation' ||
    kind === 'proformaInvoice' ||
    kind === 'creditNote' ||
    kind === 'salesDebitNote'
  ) {
    return lines.map((line) => ({
      ...line,
      hsnSac: line.hsnSac.trim() || DEFAULT_CONSULTANCY_SAC,
      gstPercent: Number(line.gstPercent) > 0 ? line.gstPercent : DEFAULT_CONSULTANCY_GST,
    }))
  }
  if (kind === 'purchase' || kind === 'debitNote') return lines
  if (kind === 'paymentReceipt' || kind === 'purchaseOrder') {
    return lines.map((line) => ({ ...line, gstPercent: '0' }))
  }
  return lines
}

export function tdsAmount(gross: number, percent: string): number {
  const rate = Number(percent)
  if (!Number.isFinite(rate) || rate < 0 || rate > 100) return 0
  return Math.round(gross * (rate / 100) * 100) / 100
}
