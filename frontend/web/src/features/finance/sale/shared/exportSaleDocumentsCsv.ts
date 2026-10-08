import { downloadCsv } from '@/features/bis/shared/downloadCsv'
import { quotationStatusLabel, type QuotationRow } from '../quotation/types'

export function exportSaleDocumentsCsv(
  rows: QuotationRow[],
  opts: { filename: string; numberLabel?: string },
): number {
  if (rows.length === 0) return 0
  const numberKey = opts.numberLabel?.trim() || 'document_number'
  downloadCsv(
    opts.filename,
    [numberKey, 'date', 'client', 'status', 'subtotal', 'gst_amount', 'grand_total', 'reference_no'],
    rows.map((r) => ({
      [numberKey]: r.quotation_number ?? '',
      date: r.quotation_date ?? '',
      client: r.client_name ?? '',
      status: quotationStatusLabel(r.status),
      subtotal: String(r.subtotal ?? ''),
      gst_amount: String(r.gst_amount ?? ''),
      grand_total: String(r.grand_total ?? ''),
      reference_no: r.reference_no ?? '',
    })),
  )
  return rows.length
}
