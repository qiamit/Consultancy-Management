import { supabase } from '@/lib/supabaseClient'

export type DocumentSeriesRow = {
  doc_type: string
  prefix: string
  next_number: number
  pad_width: number
}

const DOC_TYPE_BY_KIND: Record<string, string> = {
  quotation: 'QUOTATION',
  proformaInvoice: 'PROFORMA',
  invoice: 'TAX_INVOICE',
  creditNote: 'CREDIT_NOTE',
  paymentReceipt: 'PAYMENT_RECEIPT',
}

export function seriesDocType(kind: string): string | null {
  return DOC_TYPE_BY_KIND[kind] ?? null
}

export function sampleDocumentNumber(prefix: string, padWidth: number, nextNumber = 1): string {
  const width = Math.min(8, Math.max(1, padWidth))
  return `${prefix}${String(nextNumber).padStart(width, '0')}`
}

export async function allocateDocumentNumber(kind: string): Promise<string | null> {
  const docType = seriesDocType(kind)
  if (!docType) return null
  const { data, error } = await supabase.rpc('next_document_number', { p_doc_type: docType })
  if (error) {
    if (error.code === '42883' || error.code === 'PGRST202') return null
    throw error
  }
  const number = String(data ?? '').trim()
  return number || null
}

export async function listDocumentSeries(): Promise<DocumentSeriesRow[]> {
  const { data, error } = await supabase
    .from('document_series')
    .select('doc_type, prefix, next_number, pad_width')
    .order('doc_type')
  if (error) throw error
  return (Array.isArray(data) ? data : []).map((raw) => {
    const row = raw as Record<string, unknown>
    return {
      doc_type: String(row.doc_type ?? ''),
      prefix: String(row.prefix ?? ''),
      next_number: Number(row.next_number ?? 1) || 1,
      pad_width: Number(row.pad_width ?? 4) || 4,
    }
  })
}

export async function saveDocumentSeriesPrefix(docType: string, prefix: string) {
  const { error } = await supabase.from('document_series').update({ prefix: prefix.trim() }).eq('doc_type', docType)
  if (error) throw error
}
