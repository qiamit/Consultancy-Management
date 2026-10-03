import type { DocumentTemplateKind } from '@/features/settings/lab-settings/documentTemplateTypes'
import type { QuotationRow } from '../quotation/types'

function storageKey(kind: DocumentTemplateKind): string {
  return `lims.saleDocuments.${kind}`
}

export function loadSaleDocumentRows(kind: DocumentTemplateKind): QuotationRow[] {
  try {
    const raw = localStorage.getItem(storageKey(kind))
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    return Array.isArray(parsed) ? (parsed as QuotationRow[]) : []
  } catch {
    return []
  }
}

function sameClient(row: QuotationRow, clientId: string, clientName: string): boolean {
  const id = clientId.trim()
  if (id && row.client_id && row.client_id === id) return true
  const name = clientName.trim().toLowerCase()
  if (!name) return false
  return String(row.client_name ?? '').trim().toLowerCase() === name
}

function rowAmount(row: QuotationRow): number {
  const n = Number(row.grand_total)
  return Number.isFinite(n) ? Math.max(0, n) : 0
}

export type ClientLedgerBalance = {
  amount: number
  type: 'Dr' | 'Cr'
}

/**
 * Client outstanding = opening (Masters) + Invoices − Credit Notes − Payment Receipts.
 * Proforma is excluded (not booked).
 */
export function computeClientSaleBalance(opts: {
  clientId: string
  clientName: string
  openingBalance?: number
  openingType?: 'Dr' | 'Cr'
  excludeReceiptId?: string | null
  /** Extra debit (e.g. quotations converted to Invoice in DB). */
  extraDebit?: number
}): ClientLedgerBalance {
  const opening = Math.max(0, Number(opts.openingBalance ?? 0) || 0)
  let signed = opts.openingType === 'Cr' ? -opening : opening
  signed += Math.max(0, Number(opts.extraDebit ?? 0) || 0)

  for (const row of loadSaleDocumentRows('invoice')) {
    if (sameClient(row, opts.clientId, opts.clientName)) signed += rowAmount(row)
  }
  for (const row of loadSaleDocumentRows('creditNote')) {
    if (sameClient(row, opts.clientId, opts.clientName)) signed -= rowAmount(row)
  }
  for (const row of loadSaleDocumentRows('paymentReceipt')) {
    if (opts.excludeReceiptId && row.id === opts.excludeReceiptId) continue
    if (sameClient(row, opts.clientId, opts.clientName)) signed -= rowAmount(row)
  }

  const rounded = Math.round(signed * 100) / 100
  if (rounded < 0) return { amount: Math.abs(rounded), type: 'Cr' }
  return { amount: Math.abs(rounded), type: 'Dr' }
}

export type ReceiptLedgerSnapshot = {
  opening: ClientLedgerBalance
  received: number
  after: ClientLedgerBalance
}

export function receiptLedgerSnapshot(
  row: QuotationRow,
  openingFromMaster?: { amount: number; type: 'Dr' | 'Cr' },
): ReceiptLedgerSnapshot {
  const opening = computeClientSaleBalance({
    clientId: row.client_id ?? '',
    clientName: row.client_name ?? '',
    openingBalance: openingFromMaster?.amount ?? 0,
    openingType: openingFromMaster?.type === 'Cr' ? 'Cr' : 'Dr',
    excludeReceiptId: row.id,
  })
  const received = rowAmount(row)
  const signed =
    (opening.type === 'Cr' ? -opening.amount : opening.amount) - received
  const rounded = Math.round(signed * 100) / 100
  const after: ClientLedgerBalance =
    rounded < 0
      ? { amount: Math.abs(rounded), type: 'Cr' }
      : { amount: Math.abs(rounded), type: 'Dr' }
  return { opening, received, after }
}
