import { supabase } from '@/lib/supabaseClient'
import type { DocumentTemplateKind } from '@/features/settings/lab-settings/documentTemplateTypes'
import {
  computeQuotationTotals,
  lineAmount,
  lineTaxableAmount,
  nextQuotationNumber,
  normalizePaymentMethod,
  parseMoney,
  type PaymentMethod,
  type QuotationForm,
  type QuotationLineRow,
  type QuotationRow,
  type QuotationStatus,
} from '../quotation/types'
import { setSaleDocumentCache } from './clientSaleBalance'

/** Sale modules persisted in Postgres through the finance_* tables / transactions. */
export type SaleDocumentKind = Exclude<DocumentTemplateKind, 'quotation'>

type DbStatus = 'pending' | 'accepted' | 'cancelled'

type HeaderTableConfig = {
  table: string
  linesTable: string
  parentFk: string
  numberCol: string
  dateCol: string
  statusCol: string
}

const HEADER_TABLES: Record<Exclude<SaleDocumentKind, 'paymentReceipt'>, HeaderTableConfig> = {
  proformaInvoice: {
    table: 'finance_proforma_invoices',
    linesTable: 'finance_proforma_invoice_lines',
    parentFk: 'proforma_invoice_id',
    numberCol: 'proforma_invoice_number',
    dateCol: 'proforma_date',
    statusCol: 'proforma_status',
  },
  invoice: {
    table: 'finance_tax_invoices',
    linesTable: 'finance_tax_invoice_lines',
    parentFk: 'tax_invoice_id',
    numberCol: 'tax_invoice_number',
    dateCol: 'tax_date',
    statusCol: 'tax_status',
  },
  creditNote: {
    table: 'finance_credit_notes',
    linesTable: 'finance_credit_note_lines',
    parentFk: 'credit_note_id',
    numberCol: 'credit_note_number',
    dateCol: 'credit_note_date',
    statusCol: 'credit_note_status',
  },
}

const CLIENT_JOIN = 'client:clients(company_name)'
const LOOKUP_ID_LIMIT = 100
const LEDGER_PAGE = 1000

const MODE_TO_DB: Record<PaymentMethod, string> = {
  Bank: 'bank',
  Cash: 'cash',
  UPI: 'upi',
  Cheque: 'cheque',
  Other: 'other',
}

const MODE_FROM_DB: Record<string, PaymentMethod> = {
  bank: 'Bank',
  neft_rtgs: 'Bank',
  cash: 'Cash',
  upi: 'UPI',
  cheque: 'Cheque',
  card: 'Other',
  other: 'Other',
}

type Extra = Record<string, unknown>

type RawRow = Record<string, unknown> & {
  id: string
  client?: { company_name: string | null } | null
  extra?: Extra | null
  lines?: RawLine[] | null
}

type RawLine = Record<string, unknown> & { id: string; extra?: Extra | null }

export function formatSaleApiError(err: unknown): string {
  if (!err) return 'Unknown error'
  if (typeof err === 'string') return err
  const e = err as { message?: string; details?: string; hint?: string; code?: string }
  if (e.code === '23505') return 'This document number already exists. Use a different number.'
  const message = (e.message ?? '').toLowerCase()
  if (message.includes('failed to fetch') || message.includes('network')) {
    return 'Network connection failed. Check your internet and try again.'
  }
  const parts = [e.message, e.details, e.hint]
    .map((p) => (typeof p === 'string' ? p.trim() : ''))
    .filter(Boolean)
  return parts.length ? parts.join(' | ') : 'Unknown error'
}

function sanitizeSearchTerm(raw: string): string {
  return raw.replace(/[,()"\\*%_]/g, ' ').replace(/\s+/g, ' ').trim()
}

async function matchingClientIds(term: string): Promise<string[]> {
  const { data, error } = await supabase
    .from('clients')
    .select('id')
    .ilike('company_name', `%${term}%`)
    .limit(LOOKUP_ID_LIMIT)
  if (error) throw error
  return (data ?? []).map((r) => String((r as { id: string }).id))
}

function str(value: unknown): string {
  return typeof value === 'string' ? value : value == null ? '' : String(value)
}

function strOrNull(value: unknown): string | null {
  const s = str(value).trim()
  return s ? s : null
}

function num(value: unknown): number {
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

function dbStatusFor(status: string): DbStatus {
  if (status === 'Rejected' || status === 'Expired') return 'cancelled'
  if (status === 'Finalized' || status === 'Accepted' || status === 'Converted') return 'accepted'
  return 'pending'
}

function defaultUiStatus(kind: SaleDocumentKind): QuotationStatus {
  if (kind === 'proformaInvoice') return 'Proforma'
  if (kind === 'invoice') return 'Invoice'
  return 'Draft'
}

function uiStatusFor(kind: SaleDocumentKind, dbStatus: string, label: unknown): QuotationStatus {
  const saved = str(label)
  if (saved && dbStatusFor(saved) === dbStatus) return saved as QuotationStatus
  if (dbStatus === 'accepted') return 'Finalized'
  if (dbStatus === 'cancelled') return 'Rejected'
  return defaultUiStatus(kind)
}

function lineFromRaw(parentId: string, raw: RawLine): QuotationLineRow {
  const extra = raw.extra ?? {}
  const quantity = num(raw.qty)
  const rate = num(raw.unit_rate)
  return {
    id: raw.id,
    quotation_id: parentId,
    line_no: num(raw.sort_order),
    description: str(raw.item_description),
    details: strOrNull(extra.details),
    make: strOrNull(extra.make),
    hsn_sac: strOrNull(extra.hsn_sac),
    item_code: strOrNull(extra.item_code),
    quantity,
    unit: str(raw.unit_of_item) || 'Nos',
    rate,
    amount: round2(quantity * rate),
    discount_percent: num(raw.line_discount),
    gst_percent: num(raw.gst_rate),
    line_remarks: strOrNull(extra.line_remarks),
    delivery_period: strOrNull(extra.delivery_period),
  }
}

function headerFromRaw(
  kind: Exclude<SaleDocumentKind, 'paymentReceipt'>,
  raw: RawRow,
): QuotationRow {
  const cfg = HEADER_TABLES[kind]
  const extra = raw.extra ?? {}
  const dbStatus = str(raw[cfg.statusCol])
  const lines = (raw.lines ?? []).map((l) => lineFromRaw(raw.id, l))
  lines.sort((a, b) => a.line_no - b.line_no)
  return {
    id: raw.id,
    quotation_number: str(raw[cfg.numberCol]),
    quotation_date: str(raw[cfg.dateCol]).slice(0, 10),
    valid_until: strOrNull(raw.valid_until_date)?.slice(0, 10) ?? null,
    client_id: strOrNull(raw.client_id),
    client_name: (raw.client?.company_name ?? '').trim() || str(extra.client_name),
    contact_person: strOrNull(extra.contact_person),
    contact_email: strOrNull(extra.contact_email),
    contact_mobile: strOrNull(extra.contact_mobile),
    client_address: strOrNull(extra.client_address),
    client_gst_number: strOrNull(extra.client_gst_number),
    subject: strOrNull(raw.scope_of_work),
    reference_no: strOrNull(extra.reference_no),
    status: uiStatusFor(kind, dbStatus, extra.status_label),
    payment_terms: strOrNull(raw.terms_and_conditions),
    notes: strOrNull(raw.notes),
    remarks: strOrNull(extra.remarks),
    signature_text: strOrNull(raw.seal_and_sign),
    signature_image_path: strOrNull(extra.signature_image_path),
    discount_percent: num(extra.discount_percent),
    discount_amount: num(extra.discount_amount),
    transportation_charges: num(extra.transportation_charges),
    packaging_charges: num(extra.packaging_charges),
    gst_percent: num(extra.gst_percent),
    gst_amount: num(raw.tax_total),
    subtotal: num(raw.subtotal),
    grand_total: num(raw.grand_total),
    created_at: str(raw.created_at) || undefined,
    updated_at: str(raw.updated_at) || undefined,
    line_items: lines,
  }
}

function receiptFromRaw(raw: RawRow): QuotationRow {
  const extra = raw.extra ?? {}
  const amount = num(raw.amount)
  const receiptNumber = strOrNull(raw.receipt_number) ?? `PR-${raw.id.slice(0, 8).toUpperCase()}`
  const paymentMethod =
    MODE_FROM_DB[str(raw.mode_of_payment)] ??
    (strOrNull(extra.payment_method) as PaymentMethod | null) ??
    'Bank'
  const invoiceRef =
    strOrNull(extra.invoice_reference_no) ??
    strOrNull(extra.against_invoice_no) ??
    strOrNull(extra.tax_invoice_number) ??
    // Older rows may have stored the invoice number in extra.reference_no
    strOrNull(extra.reference_no)
  return {
    id: raw.id,
    quotation_number: receiptNumber,
    quotation_date: str(raw.txn_date).slice(0, 10),
    valid_until: null,
    client_id: strOrNull(raw.client_id),
    client_name: (raw.client?.company_name ?? '').trim() || str(extra.client_name),
    contact_person: strOrNull(extra.contact_person),
    contact_email: strOrNull(extra.contact_email),
    contact_mobile: strOrNull(extra.contact_mobile),
    client_address: strOrNull(extra.client_address),
    client_gst_number: strOrNull(extra.client_gst_number),
    subject: strOrNull(raw.description),
    reference_no: invoiceRef,
    status: (strOrNull(extra.status_label) as QuotationStatus | null) ?? 'Draft',
    payment_terms: strOrNull(extra.payment_terms),
    notes: strOrNull(raw.notes),
    remarks: strOrNull(extra.remarks),
    signature_text: strOrNull(extra.signature_text),
    signature_image_path: strOrNull(extra.signature_image_path),
    payment_method: paymentMethod,
    discount_percent: 0,
    discount_amount: 0,
    transportation_charges: 0,
    packaging_charges: 0,
    gst_percent: 0,
    gst_amount: 0,
    subtotal: amount,
    grand_total: amount,
    created_at: str(raw.created_at) || undefined,
    updated_at: str(raw.updated_at) || undefined,
    line_items: [],
  }
}

export type FetchSaleDocumentsParams = {
  kind: SaleDocumentKind
  search: string
  page: number
  pageSize: number
}

export async function fetchSaleDocumentsPage({
  kind,
  search,
  page,
  pageSize,
}: FetchSaleDocumentsParams): Promise<{ rows: QuotationRow[]; total: number }> {
  const term = sanitizeSearchTerm(search)
  const from = (Math.max(1, page) - 1) * pageSize
  const to = from + pageSize - 1

  let clientIds: string[] = []
  if (term) clientIds = await matchingClientIds(term)

  if (kind === 'paymentReceipt') {
    let query = supabase
      .from('transactions')
      .select(`*, ${CLIENT_JOIN}`, { count: 'exact' })
      .eq('payment_flow', 'in')
    if (term) {
      const parts = [`receipt_number.ilike.*${term}*`, `description.ilike.*${term}*`]
      if (clientIds.length > 0) parts.push(`client_id.in.(${clientIds.join(',')})`)
      query = query.or(parts.join(','))
    }
    const { data, error, count } = await query
      .order('txn_date', { ascending: false })
      .order('created_at', { ascending: false })
      .range(from, to)
    if (error) throw error
    return {
      rows: ((data ?? []) as unknown as RawRow[]).map(receiptFromRaw),
      total: count ?? 0,
    }
  }

  const cfg = HEADER_TABLES[kind]
  let query = supabase
    .from(cfg.table)
    .select(`*, ${CLIENT_JOIN}, lines:${cfg.linesTable}(*)`, { count: 'exact' })
  if (term) {
    const parts = [`${cfg.numberCol}.ilike.*${term}*`]
    if (clientIds.length > 0) parts.push(`client_id.in.(${clientIds.join(',')})`)
    query = query.or(parts.join(','))
  }
  const { data, error, count } = await query
    .order(cfg.dateCol, { ascending: false })
    .order('created_at', { ascending: false })
    .range(from, to)
  if (error) throw error
  return {
    rows: ((data ?? []) as unknown as RawRow[]).map((r) => headerFromRaw(kind, r)),
    total: count ?? 0,
  }
}

export async function fetchNextSaleDocumentNumber(
  kind: SaleDocumentKind,
  prefix: string,
): Promise<string> {
  const numberCol =
    kind === 'paymentReceipt' ? 'receipt_number' : HEADER_TABLES[kind].numberCol
  const table = kind === 'paymentReceipt' ? 'transactions' : HEADER_TABLES[kind].table
  let query = supabase
    .from(table)
    .select(numberCol)
    .ilike(numberCol, `${prefix.replace(/[\\%_]/g, (c) => `\\${c}`)}%`)
  if (kind === 'paymentReceipt') query = query.eq('payment_flow', 'in')
  const { data, error } = await query.order(numberCol, { ascending: false }).limit(500)
  if (error) throw error
  const numbers = ((data ?? []) as unknown as Array<Record<string, unknown>>).map((r) =>
    str(r[numberCol]),
  )
  return nextQuotationNumber(numbers, prefix)
}

function buildLines(
  form: QuotationForm,
  parentFk: string,
  parentId: string,
): Array<Record<string, unknown>> {
  return form.lines
    .filter((l) => l.description.trim().length > 0)
    .map((l, index) => {
      const taxable = lineTaxableAmount(l)
      const gstPercent = Math.max(0, parseMoney(l.gstPercent))
      const tax = round2(taxable * (gstPercent / 100))
      return {
        id: crypto.randomUUID(),
        [parentFk]: parentId,
        sort_order: index + 1,
        item_description: l.description.trim(),
        unit_of_item: l.unit.trim() || 'Nos',
        qty: parseMoney(l.quantity) || 1,
        unit_rate: parseMoney(l.rate),
        line_discount: String(parseMoney(l.discountPercent)),
        gst_rate: String(gstPercent),
        line_subtotal: taxable,
        line_tax: tax,
        line_total: round2(taxable + tax),
        extra: {
          details: l.details.trim() || null,
          make: l.make.trim() || null,
          hsn_sac: l.hsnSac.trim() || null,
          item_code: l.itemCode.trim() || null,
          line_remarks: l.lineRemarks.trim() || null,
          delivery_period: l.deliveryPeriod.trim() || null,
          gross_amount: lineAmount(l),
        },
      }
    })
}

function clientSnapshot(form: QuotationForm): Extra {
  return {
    client_name: form.clientName.trim() || null,
    contact_person: form.contactPerson.trim() || null,
    contact_email: form.contactEmail.trim() || null,
    contact_mobile: form.contactMobile.trim() || null,
    client_address: form.clientAddress.trim() || null,
    client_gst_number: form.clientGstNumber.trim() || null,
  }
}

async function saveHeaderDocument(
  kind: Exclude<SaleDocumentKind, 'paymentReceipt'>,
  form: QuotationForm,
  editingId: string | null,
): Promise<void> {
  const cfg = HEADER_TABLES[kind]
  const totals = computeQuotationTotals(form)
  const date = form.quotationDate || new Date().toISOString().slice(0, 10)
  const id = editingId ?? crypto.randomUUID()

  const payload: Record<string, unknown> = {
    [cfg.numberCol]: form.quotationNumber.trim(),
    [cfg.dateCol]: date,
    valid_until_date: form.validUntil || date,
    client_id: form.clientId || null,
    [cfg.statusCol]: dbStatusFor(form.status),
    notes: form.notes.trim() || null,
    terms_and_conditions: form.paymentTerms.trim() || null,
    scope_of_work: form.subject.trim() || null,
    seal_and_sign: form.signatureText.trim() || null,
    subtotal: totals.subtotal,
    tax_total: totals.gstAmount,
    grand_total: totals.grandTotal,
    extra: {
      ...clientSnapshot(form),
      reference_no: form.referenceNo.trim() || null,
      remarks: form.remarks.trim() || null,
      signature_image_path: form.signatureImagePath.trim() || null,
      status_label: form.status,
      discount_percent: 0,
      discount_amount: totals.discountAmount,
      transportation_charges: totals.transportationCharges,
      packaging_charges: totals.packagingCharges,
      gst_percent: totals.effectiveGstPercent,
    },
    updated_at: new Date().toISOString(),
  }

  if (editingId) {
    const { error } = await supabase.from(cfg.table).update(payload).eq('id', id)
    if (error) throw error
  } else {
    const { error } = await supabase
      .from(cfg.table)
      .insert({ ...payload, id, invoice_type: 'service' })
    if (error) throw error
  }

  const lines = buildLines(form, cfg.parentFk, id)
  if (lines.length > 0) {
    const { error } = await supabase.from(cfg.linesTable).insert(lines)
    if (error) throw error
  }
  // Remove superseded lines only after the replacements are stored.
  const keepIds = lines.map((l) => String(l.id))
  let cleanup = supabase.from(cfg.linesTable).delete().eq(cfg.parentFk, id)
  if (keepIds.length > 0) cleanup = cleanup.not('id', 'in', `(${keepIds.join(',')})`)
  const { error: cleanupError } = await cleanup
  if (cleanupError) throw cleanupError
}

async function saveReceipt(form: QuotationForm, editingId: string | null): Promise<void> {
  const amount = Math.max(0, parseMoney(String(form.paymentAmount ?? '')))
  const method = normalizePaymentMethod(form.paymentMethod)
  const againstInvoice = form.referenceNo.trim() || null
  const payload: Record<string, unknown> = {
    payment_flow: 'in',
    receipt_number: form.quotationNumber.trim(),
    client_id: form.clientId || null,
    amount,
    currency: 'INR',
    txn_date: form.quotationDate || new Date().toISOString().slice(0, 10),
    status: 'completed',
    mode_of_payment: MODE_TO_DB[method],
    description: form.subject.trim() || null,
    notes: form.notes.trim() || null,
    extra: {
      ...clientSnapshot(form),
      remarks: form.remarks.trim() || null,
      payment_terms: form.paymentTerms.trim() || null,
      signature_text: form.signatureText.trim() || null,
      signature_image_path: form.signatureImagePath.trim() || null,
      status_label: form.status,
      payment_method: method,
      /** Invoice / document this receipt is against (kept separate from mode_of_payment). */
      invoice_reference_no: againstInvoice,
      against_invoice_no: againstInvoice,
      allocated_amount: amount,
    },
    updated_at: new Date().toISOString(),
  }
  if (editingId) {
    const { error } = await supabase
      .from('transactions')
      .update(payload)
      .eq('id', editingId)
      .eq('payment_flow', 'in')
    if (error) throw error
    return
  }
  const { error } = await supabase.from('transactions').insert(payload)
  if (error) throw error
}

export async function saveSaleDocument(
  kind: SaleDocumentKind,
  form: QuotationForm,
  editingId: string | null,
): Promise<void> {
  if (kind === 'paymentReceipt') return saveReceipt(form, editingId)
  return saveHeaderDocument(kind, form, editingId)
}

export async function deleteSaleDocuments(kind: SaleDocumentKind, ids: string[]): Promise<void> {
  if (ids.length === 0) return
  if (kind === 'paymentReceipt') {
    const { error } = await supabase
      .from('transactions')
      .delete()
      .in('id', ids)
      .eq('payment_flow', 'in')
    if (error) throw error
    return
  }
  const { error } = await supabase.from(HEADER_TABLES[kind].table).delete().in('id', ids)
  if (error) throw error
}

export async function updateSaleDocumentStatus(
  kind: SaleDocumentKind,
  row: QuotationRow,
  status: QuotationStatus,
): Promise<void> {
  if (kind === 'paymentReceipt') {
    const { data, error: readError } = await supabase
      .from('transactions')
      .select('extra')
      .eq('id', row.id)
      .maybeSingle()
    if (readError) throw readError
    const extra = ((data as { extra?: Extra } | null)?.extra ?? {}) as Extra
    const { error } = await supabase
      .from('transactions')
      .update({ extra: { ...extra, status_label: status }, updated_at: new Date().toISOString() })
      .eq('id', row.id)
    if (error) throw error
    return
  }
  const cfg = HEADER_TABLES[kind]
  const { data, error: readError } = await supabase
    .from(cfg.table)
    .select('extra')
    .eq('id', row.id)
    .maybeSingle()
  if (readError) throw readError
  const extra = ((data as { extra?: Extra } | null)?.extra ?? {}) as Extra
  const { error } = await supabase
    .from(cfg.table)
    .update({
      [cfg.statusCol]: dbStatusFor(status),
      extra: { ...extra, status_label: status },
      updated_at: new Date().toISOString(),
    })
    .eq('id', row.id)
  if (error) throw error
}

type LedgerSource = {
  kind: 'invoice' | 'creditNote' | 'paymentReceipt'
  table: string
  amountCol: string
  statusCol?: string
}

const LEDGER_SOURCES: LedgerSource[] = [
  { kind: 'invoice', table: 'finance_tax_invoices', amountCol: 'grand_total', statusCol: 'tax_status' },
  {
    kind: 'creditNote',
    table: 'finance_credit_notes',
    amountCol: 'grand_total',
    statusCol: 'credit_note_status',
  },
  { kind: 'paymentReceipt', table: 'transactions', amountCol: 'amount' },
]

async function fetchLedgerRows(source: LedgerSource): Promise<QuotationRow[]> {
  const out: QuotationRow[] = []
  for (let from = 0; ; from += LEDGER_PAGE) {
    let query = supabase
      .from(source.table)
      .select(`id, client_id, ${source.amountCol}, ${CLIENT_JOIN}`)
    if (source.statusCol) query = query.neq(source.statusCol, 'cancelled')
    if (source.kind === 'paymentReceipt') query = query.eq('payment_flow', 'in')
    const { data, error } = await query
      .order('id', { ascending: true })
      .range(from, from + LEDGER_PAGE - 1)
    if (error) throw error
    const batch = (data ?? []) as unknown as RawRow[]
    for (const r of batch) {
      out.push({
        id: r.id,
        client_id: strOrNull(r.client_id),
        client_name: (r.client?.company_name ?? '').trim(),
        grand_total: num(r[source.amountCol]),
      } as QuotationRow)
    }
    if (batch.length < LEDGER_PAGE) break
  }
  return out
}

/** Reloads invoice / credit note / receipt totals used for client outstanding balances. */
export async function refreshSaleLedgerCache(): Promise<void> {
  const results = await Promise.all(
    LEDGER_SOURCES.map(async (source) => ({
      kind: source.kind,
      rows: await fetchLedgerRows(source),
    })),
  )
  for (const { kind, rows } of results) setSaleDocumentCache(kind, rows)
}
