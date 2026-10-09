import { supabase } from '@/lib/supabaseClient'

export type InvoiceBalance = {
  invoice_id: string
  invoice_number: string
  grand_total: number
  received: number
  credited: number
  outstanding: number
}

function money(value: unknown): number {
  const n = Number(value)
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0
}

function mapBalance(raw: Record<string, unknown>): InvoiceBalance | null {
  const invoiceNumber = String(raw.invoice_number ?? '').trim()
  if (!invoiceNumber) return null
  const grand = money(raw.grand_total)
  const received = money(raw.received)
  const credited = money(raw.credited)
  return {
    invoice_id: String(raw.invoice_id ?? ''),
    invoice_number: invoiceNumber,
    grand_total: grand,
    received,
    credited,
    outstanding: money(raw.outstanding ?? Math.max(0, grand - received - credited)),
  }
}

async function listClientInvoiceBalancesLocal(clientId: string): Promise<InvoiceBalance[]> {
  const [invoices, credits, receipts] = await Promise.all([
    supabase
      .from('finance_tax_invoices')
      .select('id, tax_invoice_number, grand_total, tax_status')
      .eq('client_id', clientId),
    supabase
      .from('finance_credit_notes')
      .select('grand_total, credit_note_status, extra')
      .eq('client_id', clientId),
    supabase
      .from('transactions')
      .select('amount, extra')
      .eq('client_id', clientId)
      .eq('payment_flow', 'in'),
  ])
  if (invoices.error) throw invoices.error
  if (credits.error) throw credits.error
  if (receipts.error) throw receipts.error

  const receivedByNumber = new Map<string, number>()
  for (const raw of receipts.data ?? []) {
    const extra = (raw as { extra?: Record<string, unknown> | null }).extra ?? {}
    const number = String(extra.invoice_reference_no ?? extra.against_invoice_no ?? '').trim()
    if (!number) continue
    receivedByNumber.set(number, money((receivedByNumber.get(number) ?? 0) + money((raw as { amount?: unknown }).amount)))
  }
  const creditedByNumber = new Map<string, number>()
  for (const raw of credits.data ?? []) {
    const row = raw as { credit_note_status?: string | null; grand_total?: unknown; extra?: Record<string, unknown> | null }
    if (row.credit_note_status === 'cancelled') continue
    const number = String(row.extra?.reference_no ?? '').trim()
    if (!number) continue
    creditedByNumber.set(number, money((creditedByNumber.get(number) ?? 0) + money(row.grand_total)))
  }

  return (invoices.data ?? [])
    .map((raw) => {
      const row = raw as { id?: string; tax_invoice_number?: string | null; grand_total?: unknown; tax_status?: string | null }
      if (row.tax_status === 'cancelled') return null
      const invoiceNumber = String(row.tax_invoice_number ?? '').trim()
      if (!invoiceNumber) return null
      const grand = money(row.grand_total)
      const received = receivedByNumber.get(invoiceNumber) ?? 0
      const credited = creditedByNumber.get(invoiceNumber) ?? 0
      return {
        invoice_id: String(row.id ?? ''),
        invoice_number: invoiceNumber,
        grand_total: grand,
        received,
        credited,
        outstanding: money(Math.max(0, grand - received - credited)),
      }
    })
    .filter((row): row is InvoiceBalance => row !== null)
}

export function invoiceDueLabel(grand: number, outstanding: number): 'Paid' | 'Part' | 'Unpaid' {
  if (outstanding <= 0.009) return 'Paid'
  if (grand > 0.009 && outstanding < grand - 0.009) return 'Part'
  return 'Unpaid'
}

export const INVOICE_AGE_BUCKETS = [
  { id: 'current', label: '0–30 days' },
  { id: 'd31_60', label: '31–60 days' },
  { id: 'd61_90', label: '61–90 days' },
  { id: 'over_90', label: 'Over 90 days' },
] as const

export type InvoiceAgeBucket = (typeof INVOICE_AGE_BUCKETS)[number]['id']

export type InvoiceAgeingRow = {
  bucket: InvoiceAgeBucket
  invoice_count: number
  outstanding: number
}

const AGE_BUCKET_LABEL: Record<InvoiceAgeBucket, string> = {
  current: '0–30',
  d31_60: '31–60',
  d61_90: '61–90',
  over_90: 'Over 90',
}

function parseIsoDate(value: string | null | undefined): { y: number; m: number; d: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value ?? ''))
  if (!match) return null
  const y = Number(match[1])
  const m = Number(match[2])
  const d = Number(match[3])
  if (m < 1 || m > 12 || d < 1 || d > 31) return null
  return { y, m: m - 1, d }
}

/** Whole days from the invoice date to as-of. A missing or future date is 0. */
export function invoiceAgeDays(invoiceDate: string | null | undefined, asOf = new Date()): number {
  const from = parseIsoDate(invoiceDate)
  if (!from) return 0
  const days = Math.floor(
    (Date.UTC(asOf.getFullYear(), asOf.getMonth(), asOf.getDate()) - Date.UTC(from.y, from.m, from.d)) / 86400000,
  )
  return days < 0 ? 0 : days
}

export function invoiceAgeBucket(invoiceDate: string | null | undefined, asOf = new Date()): InvoiceAgeBucket {
  const days = invoiceAgeDays(invoiceDate, asOf)
  if (days <= 30) return 'current'
  if (days <= 60) return 'd31_60'
  if (days <= 90) return 'd61_90'
  return 'over_90'
}

/** Settled invoices have no age. Open invoices read like "12d · 0–30". */
export function invoiceAgeLabel(
  invoiceDate: string | null | undefined,
  outstanding: number,
  asOf = new Date(),
): string {
  if (outstanding <= 0.009) return '—'
  return `${invoiceAgeDays(invoiceDate, asOf)}d · ${AGE_BUCKET_LABEL[invoiceAgeBucket(invoiceDate, asOf)]}`
}

export function emptyInvoiceAgeing(): InvoiceAgeingRow[] {
  return INVOICE_AGE_BUCKETS.map((bucket) => ({
    bucket: bucket.id,
    invoice_count: 0,
    outstanding: 0,
  }))
}

function asOfIso(asOf: Date): string {
  const month = String(asOf.getMonth() + 1).padStart(2, '0')
  const day = String(asOf.getDate()).padStart(2, '0')
  return `${asOf.getFullYear()}-${month}-${day}`
}

function normalizeAgeing(raw: unknown[]): InvoiceAgeingRow[] {
  const byBucket = new Map<InvoiceAgeBucket, InvoiceAgeingRow>()
  for (const item of raw) {
    const row = item as { bucket?: unknown; invoice_count?: unknown; outstanding?: unknown }
    const bucket = String(row.bucket ?? '')
    if (bucket !== 'current' && bucket !== 'd31_60' && bucket !== 'd61_90' && bucket !== 'over_90') continue
    byBucket.set(bucket, {
      bucket,
      invoice_count: Math.max(0, Math.trunc(Number(row.invoice_count) || 0)),
      outstanding: money(row.outstanding),
    })
  }
  return INVOICE_AGE_BUCKETS.map(
    (bucket) => byBucket.get(bucket.id) ?? { bucket: bucket.id, invoice_count: 0, outstanding: 0 },
  )
}

type OpenInvoiceAge = {
  id: string
  invoiceNumber: string
  clientName: string
  taxDate: string | null
  outstanding: number
  bucket: InvoiceAgeBucket
}

function joinedClientName(client: unknown): string {
  const row = Array.isArray(client) ? client[0] : client
  if (!row || typeof row !== 'object') return ''
  return String((row as { company_name?: string | null }).company_name ?? '')
}

async function loadOpenInvoiceAges(asOf: Date): Promise<OpenInvoiceAge[]> {
  const [invoices, credits, receipts] = await Promise.all([
    supabase
      .from('finance_tax_invoices')
      .select('id, tax_invoice_number, grand_total, client_id, tax_status, tax_date, client:clients(company_name)')
      .limit(2000),
    supabase.from('finance_credit_notes').select('client_id, grand_total, credit_note_status, extra').limit(2000),
    supabase.from('transactions').select('client_id, amount, extra').eq('payment_flow', 'in').limit(2000),
  ])
  if (invoices.error) throw invoices.error
  if (credits.error) throw credits.error
  if (receipts.error) throw receipts.error

  const received = new Map<string, number>()
  for (const raw of receipts.data ?? []) {
    const row = raw as { client_id?: string | null; amount?: unknown; extra?: Record<string, unknown> | null }
    const number = String(row.extra?.invoice_reference_no ?? row.extra?.against_invoice_no ?? '').trim()
    if (!number) continue
    const key = `${row.client_id ?? ''}|${number}`
    received.set(key, money((received.get(key) ?? 0) + money(row.amount)))
  }
  const credited = new Map<string, number>()
  for (const raw of credits.data ?? []) {
    const row = raw as {
      client_id?: string | null
      grand_total?: unknown
      credit_note_status?: string | null
      extra?: Record<string, unknown> | null
    }
    if (row.credit_note_status === 'cancelled') continue
    const number = String(row.extra?.reference_no ?? '').trim()
    if (!number) continue
    const key = `${row.client_id ?? ''}|${number}`
    credited.set(key, money((credited.get(key) ?? 0) + money(row.grand_total)))
  }

  const open: OpenInvoiceAge[] = []
  for (const raw of invoices.data ?? []) {
    const row = raw as {
      id?: string
      tax_invoice_number?: string | null
      grand_total?: unknown
      client_id?: string | null
      tax_status?: string | null
      tax_date?: string | null
      client?: unknown
    }
    if (!row.id || row.tax_status === 'cancelled') continue
    const invoiceNumber = String(row.tax_invoice_number ?? '').trim()
    if (!invoiceNumber) continue
    const key = `${row.client_id ?? ''}|${invoiceNumber}`
    const outstanding = money(
      Math.max(0, money(row.grand_total) - (received.get(key) ?? 0) - (credited.get(key) ?? 0)),
    )
    if (outstanding <= 0.009) continue
    open.push({
      id: String(row.id),
      invoiceNumber,
      clientName: joinedClientName(row.client),
      taxDate: row.tax_date ?? null,
      outstanding,
      bucket: invoiceAgeBucket(row.tax_date, asOf),
    })
  }
  return open
}

async function listInvoiceAgeingLocal(asOf: Date): Promise<InvoiceAgeingRow[]> {
  const totals = emptyInvoiceAgeing()
  const index = new Map(totals.map((row, i) => [row.bucket, i]))
  for (const row of await loadOpenInvoiceAges(asOf)) {
    const slot = totals[index.get(row.bucket) ?? 0]
    slot.invoice_count += 1
    slot.outstanding = money(slot.outstanding + row.outstanding)
  }
  return totals
}

export async function listInvoiceAgeBucketPage(args: {
  bucket: InvoiceAgeBucket
  search?: string
  page: number
  pageSize: number
  asOf?: Date
}): Promise<{ ids: string[]; total: number }> {
  const asOf = args.asOf ?? new Date()
  const limit = Math.min(50, Math.max(1, args.pageSize))
  const offset = (Math.max(1, args.page) - 1) * limit
  const search = (args.search ?? '').trim().slice(0, 80)
  const { data, error } = await supabase.rpc('invoice_ids_for_age_bucket', {
    p_bucket: args.bucket,
    p_as_of: asOfIso(asOf),
    p_search: search,
    p_limit: limit,
    p_offset: offset,
  })
  if (!error && Array.isArray(data)) {
    const ids = data
      .map((raw) => String((raw as { invoice_id?: unknown }).invoice_id ?? '').trim())
      .filter(Boolean)
    const total =
      data.length === 0
        ? 0
        : Math.max(0, Math.trunc(Number((data[0] as { total_count?: unknown }).total_count) || 0))
    return { ids, total }
  }
  const term = search.toLowerCase()
  const matched = (await loadOpenInvoiceAges(asOf))
    .filter((row) => row.bucket === args.bucket)
    .filter((row) => {
      if (!term) return true
      return (
        row.invoiceNumber.toLowerCase().includes(term) || row.clientName.toLowerCase().includes(term)
      )
    })
    .sort((a, b) => String(b.taxDate ?? '').localeCompare(String(a.taxDate ?? '')))
  return {
    ids: matched.slice(offset, offset + limit).map((row) => row.id),
    total: matched.length,
  }
}

/** True only for an open invoice older than 90 days. */
export async function invoiceNeedsReminder(
  invoiceDate: string | null | undefined,
  outstanding: number,
  asOf = new Date(),
): Promise<boolean> {
  const iso = /^(\d{4}-\d{2}-\d{2})/.exec(String(invoiceDate ?? ''))?.[1] ?? null
  const { data, error } = await supabase.rpc('invoice_needs_reminder', {
    p_invoice_date: iso,
    p_outstanding: outstanding,
    p_as_of: asOfIso(asOf),
  })
  if (!error && typeof data === 'boolean') return data
  return outstanding > 0.009 && invoiceAgeBucket(invoiceDate, asOf) === 'over_90'
}

export async function listInvoiceAgeing(asOf = new Date()): Promise<InvoiceAgeingRow[]> {
  const { data, error } = await supabase.rpc('invoice_ageing_summary', { p_as_of: asOfIso(asOf) })
  if (!error && Array.isArray(data)) return normalizeAgeing(data)
  return listInvoiceAgeingLocal(asOf)
}

function quotedInList(values: string[]): string {
  return `(${values.map((value) => `"${value.replace(/"/g, '')}"`).join(',')})`
}

async function listInvoiceOutstandingLocal(ids: string[]): Promise<InvoiceBalance[]> {
  const { data: invoices, error } = await supabase
    .from('finance_tax_invoices')
    .select('id, tax_invoice_number, grand_total, client_id, tax_status')
    .in('id', ids)
  if (error) throw error
  const rows = (invoices ?? [])
    .map((raw) => {
      const row = raw as {
        id?: string
        tax_invoice_number?: string | null
        grand_total?: unknown
        client_id?: string | null
        tax_status?: string | null
      }
      const invoiceNumber = String(row.tax_invoice_number ?? '').trim()
      if (!row.id || !invoiceNumber || row.tax_status === 'cancelled') return null
      return {
        invoice_id: String(row.id),
        invoice_number: invoiceNumber,
        client_id: String(row.client_id ?? ''),
        grand_total: money(row.grand_total),
      }
    })
    .filter((row): row is { invoice_id: string; invoice_number: string; client_id: string; grand_total: number } => row !== null)
  const numbers = rows.map((row) => row.invoice_number)
  if (numbers.length === 0) return []
  const numberList = quotedInList(numbers)
  const [credits, receipts, receiptsAlt] = await Promise.all([
    supabase
      .from('finance_credit_notes')
      .select('client_id, grand_total, credit_note_status, extra')
      .filter('extra->>reference_no', 'in', numberList),
    supabase
      .from('transactions')
      .select('client_id, amount, extra')
      .eq('payment_flow', 'in')
      .filter('extra->>invoice_reference_no', 'in', numberList),
    supabase
      .from('transactions')
      .select('client_id, amount, extra')
      .eq('payment_flow', 'in')
      .filter('extra->>against_invoice_no', 'in', numberList),
  ])
  if (credits.error) throw credits.error
  if (receipts.error) throw receipts.error
  if (receiptsAlt.error) throw receiptsAlt.error

  const received = new Map<string, number>()
  for (const raw of [...(receipts.data ?? []), ...(receiptsAlt.data ?? [])]) {
    const row = raw as { client_id?: string | null; amount?: unknown; extra?: Record<string, unknown> | null }
    const number = String(row.extra?.invoice_reference_no ?? row.extra?.against_invoice_no ?? '').trim()
    if (!number) continue
    const key = `${row.client_id ?? ''}|${number}`
    received.set(key, money((received.get(key) ?? 0) + money(row.amount)))
  }
  const credited = new Map<string, number>()
  for (const raw of credits.data ?? []) {
    const row = raw as {
      client_id?: string | null
      grand_total?: unknown
      credit_note_status?: string | null
      extra?: Record<string, unknown> | null
    }
    if (row.credit_note_status === 'cancelled') continue
    const number = String(row.extra?.reference_no ?? '').trim()
    if (!number) continue
    const key = `${row.client_id ?? ''}|${number}`
    credited.set(key, money((credited.get(key) ?? 0) + money(row.grand_total)))
  }
  return rows.map((row) => {
    const key = `${row.client_id}|${row.invoice_number}`
    const got = received.get(key) ?? 0
    const cut = credited.get(key) ?? 0
    return {
      invoice_id: row.invoice_id,
      invoice_number: row.invoice_number,
      grand_total: row.grand_total,
      received: got,
      credited: cut,
      outstanding: money(Math.max(0, row.grand_total - got - cut)),
    }
  })
}

export async function listInvoiceOutstanding(ids: string[]): Promise<InvoiceBalance[]> {
  const unique = [...new Set(ids.map((id) => id.trim()).filter(Boolean))].slice(0, 200)
  if (unique.length === 0) return []
  const { data, error } = await supabase.rpc('invoice_outstanding_for', { p_invoice_ids: unique })
  if (!error && Array.isArray(data)) {
    return data
      .map((raw) => mapBalance(raw as Record<string, unknown>))
      .filter((row): row is InvoiceBalance => row !== null)
  }
  return listInvoiceOutstandingLocal(unique)
}

export type InvoiceSettlement = {
  kind: 'receipt' | 'credit_note'
  document_id: string
  document_number: string
  document_date: string
  amount: number
}

function mapSettlement(raw: Record<string, unknown>): InvoiceSettlement | null {
  const kind = raw.kind === 'credit_note' || raw.kind === 'receipt' ? raw.kind : null
  const documentNumber = String(raw.document_number ?? '').trim()
  if (!kind || !documentNumber) return null
  return {
    kind,
    document_id: String(raw.document_id ?? ''),
    document_number: documentNumber,
    document_date: String(raw.document_date ?? '').slice(0, 10),
    amount: money(raw.amount),
  }
}

function sameInvoiceNumber(extra: Record<string, unknown> | null | undefined, invoiceNumber: string): boolean {
  const named = String(extra?.invoice_reference_no ?? extra?.against_invoice_no ?? '').trim()
  return named.length > 0 && named === invoiceNumber
}

async function listInvoiceSettlementsLocal(clientId: string, invoiceNumber: string): Promise<InvoiceSettlement[]> {
  const [receipts, credits] = await Promise.all([
    supabase
      .from('transactions')
      .select('id, receipt_number, txn_date, amount, extra')
      .eq('client_id', clientId)
      .eq('payment_flow', 'in')
      .limit(200),
    supabase
      .from('finance_credit_notes')
      .select('id, credit_note_number, credit_note_date, grand_total, credit_note_status, extra')
      .eq('client_id', clientId)
      .limit(200),
  ])
  if (receipts.error) throw receipts.error
  if (credits.error) throw credits.error
  const rows: InvoiceSettlement[] = []
  for (const raw of receipts.data ?? []) {
    const row = raw as {
      id?: string
      receipt_number?: string | null
      txn_date?: string | null
      amount?: unknown
      extra?: Record<string, unknown> | null
    }
    const documentNumber = String(row.receipt_number ?? '').trim()
    if (!row.id || !documentNumber || !sameInvoiceNumber(row.extra, invoiceNumber)) continue
    rows.push({
      kind: 'receipt',
      document_id: String(row.id),
      document_number: documentNumber,
      document_date: String(row.txn_date ?? '').slice(0, 10),
      amount: money(row.amount),
    })
  }
  for (const raw of credits.data ?? []) {
    const row = raw as {
      id?: string
      credit_note_number?: string | null
      credit_note_date?: string | null
      grand_total?: unknown
      credit_note_status?: string | null
      extra?: Record<string, unknown> | null
    }
    if (row.credit_note_status === 'cancelled') continue
    const named = String(row.extra?.reference_no ?? '').trim()
    const documentNumber = String(row.credit_note_number ?? '').trim()
    if (!row.id || !documentNumber || named !== invoiceNumber) continue
    rows.push({
      kind: 'credit_note',
      document_id: String(row.id),
      document_number: documentNumber,
      document_date: String(row.credit_note_date ?? '').slice(0, 10),
      amount: money(row.grand_total),
    })
  }
  rows.sort((a, b) => b.document_date.localeCompare(a.document_date) || b.document_number.localeCompare(a.document_number))
  return rows.slice(0, 50)
}

export async function listInvoiceSettlements(clientId: string, invoiceNumber: string): Promise<InvoiceSettlement[]> {
  const id = clientId.trim()
  const number = invoiceNumber.trim()
  if (!id || !number) return []
  const { data, error } = await supabase.rpc('invoice_settlements', {
    p_client_id: id,
    p_invoice_number: number,
  })
  if (!error && Array.isArray(data)) {
    return data
      .map((raw) => mapSettlement(raw as Record<string, unknown>))
      .filter((row): row is InvoiceSettlement => row !== null)
      .slice(0, 50)
  }
  return listInvoiceSettlementsLocal(id, number)
}

export async function listClientInvoiceBalances(clientId: string): Promise<InvoiceBalance[]> {
  const id = clientId.trim()
  if (!id) return []
  const { data, error } = await supabase.rpc('client_invoice_balances', { p_client_id: id })
  if (!error && Array.isArray(data)) {
    return data
      .map((raw) => mapBalance(raw as Record<string, unknown>))
      .filter((row): row is InvoiceBalance => row !== null)
  }
  if (error && error.code !== '42883' && error.code !== 'PGRST202') {
    return listClientInvoiceBalancesLocal(id)
  }
  return listClientInvoiceBalancesLocal(id)
}
