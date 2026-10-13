import { supabase } from '@/lib/supabaseClient'
import { allocateDocumentNumber } from '@/features/finance/sale/shared/documentSeriesApi'

export function currentFinancialYear(today = new Date()): { from: string; to: string } {
  const startYear = today.getMonth() >= 3 ? today.getFullYear() : today.getFullYear() - 1
  return { from: `${startYear}-04-01`, to: `${startYear + 1}-03-31` }
}

function missingRelation(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false
  return error.code === '42P01' || error.code === 'PGRST205' || /schema cache/i.test(error.message ?? '')
}

export type ExpenseCategory = { id: string; name: string }

export async function listExpenseCategories(): Promise<ExpenseCategory[]> {
  const { data, error } = await supabase.from('expense_categories').select('id, name').order('name')
  if (error) {
    if (missingRelation(error)) return []
    throw error
  }
  return (data ?? []).map((row) => ({
    id: String((row as { id: string }).id),
    name: String((row as { name: string }).name),
  }))
}

export async function addExpenseCategory(name: string): Promise<void> {
  const { error } = await supabase.from('expense_categories').insert({ name: name.trim() })
  if (error) throw error
}

export type ExpenseRow = {
  id: string
  expense_number: string
  expense_date: string
  category_name: string
  amount: number
  notes: string
}

export async function listExpenses(): Promise<ExpenseRow[]> {
  const { data, error } = await supabase
    .from('finance_expenses')
    .select('id, expense_number, expense_date, amount, notes, expense_categories(name)')
    .neq('expense_status', 'cancelled')
    .order('expense_date', { ascending: false })
    .limit(200)
  if (error) {
    if (missingRelation(error)) return []
    throw error
  }
  return (data ?? []).map((raw) => {
    const row = raw as {
      id: string
      expense_number: string
      expense_date: string
      amount: number
      notes: string | null
      expense_categories: { name?: string } | { name?: string }[] | null
    }
    const category = Array.isArray(row.expense_categories) ? row.expense_categories[0] : row.expense_categories
    return {
      id: row.id,
      expense_number: row.expense_number,
      expense_date: String(row.expense_date ?? '').slice(0, 10),
      category_name: category?.name ?? '',
      amount: Number(row.amount) || 0,
      notes: row.notes ?? '',
    }
  })
}

export async function saveExpense(input: {
  id?: string
  number: string
  date: string
  categoryId: string
  amount: number
  notes: string
}): Promise<void> {
  const body = {
    expense_number: input.number.trim(),
    expense_date: input.date,
    category_id: input.categoryId || null,
    amount: input.amount,
    notes: input.notes.trim() || null,
    expense_status: 'accepted',
  }
  const query = input.id
    ? supabase.from('finance_expenses').update(body).eq('id', input.id)
    : supabase.from('finance_expenses').insert(body)
  const { error } = await query
  if (error) throw error
}

export async function nextExpenseNumber(): Promise<string> {
  try {
    const allocated = await allocateDocumentNumber('expense')
    if (allocated) return allocated
  } catch {
    /* series is not live yet */
  }
  return `EX-${new Date().getFullYear()}-0001`
}

export type LedgerRow = {
  party_id: string
  party_name: string
  balance: number
  balance_side: string
  detail: string
}

export async function listLedger(tab: string): Promise<LedgerRow[]> {
  const { data, error } = await supabase.rpc('finance_ledger', { p_tab: tab })
  if (error) {
    if (missingRelation(error) || error.code === '42883' || error.code === 'PGRST202') return []
    throw error
  }
  return (Array.isArray(data) ? data : []).map((raw) => {
    const row = raw as Record<string, unknown>
    return {
      party_id: String(row.party_id ?? ''),
      party_name: String(row.party_name ?? ''),
      balance: Number(row.balance) || 0,
      balance_side: String(row.balance_side ?? ''),
      detail: String(row.detail ?? ''),
    }
  })
}

export type FinanceTdsReportRow = {
  txn_date: string
  pan: string
  party_name: string
  tds_section: string
  taxable_amount: number
  tds_amount: number
}

export async function listFinanceTdsReport(from: string, to: string): Promise<FinanceTdsReportRow[]> {
  const { data, error } = await supabase.rpc('finance_tds_report', { p_from: from, p_to: to })
  if (error) {
    if (missingRelation(error) || error.code === '42883' || error.code === 'PGRST202') return []
    throw error
  }
  return (Array.isArray(data) ? data : []).map((raw) => {
    const row = raw as Record<string, unknown>
    return {
      txn_date: String(row.txn_date ?? '').slice(0, 10),
      pan: String(row.pan ?? ''),
      party_name: String(row.party_name ?? ''),
      tds_section: String(row.tds_section ?? ''),
      taxable_amount: Number(row.taxable_amount) || 0,
      tds_amount: Number(row.tds_amount) || 0,
    }
  })
}

export type StockRow = {
  product_id: string
  item_name: string
  item_category: string
  hsn_code: string
  sale_price: number
  purchase_price: number
  stock_on_hand: number
  low_stock_alert: number
  low_stock: boolean
}

export async function listProductStock(): Promise<StockRow[]> {
  const { data, error } = await supabase.rpc('product_stock')
  if (error) {
    if (missingRelation(error) || error.code === '42883' || error.code === 'PGRST202') return []
    throw error
  }
  return (Array.isArray(data) ? data : []).map((raw) => {
    const row = raw as Record<string, unknown>
    return {
      product_id: String(row.product_id ?? ''),
      item_name: String(row.item_name ?? ''),
      item_category: String(row.item_category ?? ''),
      hsn_code: String(row.hsn_code ?? ''),
      sale_price: Number(row.sale_price) || 0,
      purchase_price: Number(row.purchase_price) || 0,
      stock_on_hand: Number(row.stock_on_hand) || 0,
      low_stock_alert: Number(row.low_stock_alert) || 0,
      low_stock: Boolean(row.low_stock),
    }
  })
}

const LAB_ID = '00000000-0000-0000-0000-000000000001'

export type InventorySettings = {
  trackFrom: 'none' | 'invoice'
  warnLowStock: boolean
}

export async function loadInventorySettings(): Promise<InventorySettings> {
  const { data, error } = await supabase
    .from('lab_settings')
    .select('inventory_track_from, inventory_warn_low_stock')
    .eq('id', LAB_ID)
    .maybeSingle()
  if (error) {
    if (missingRelation(error) || /inventory_track_from/i.test(error.message ?? '')) {
      return { trackFrom: 'none', warnLowStock: true }
    }
    throw error
  }
  const row = (data ?? {}) as { inventory_track_from?: string; inventory_warn_low_stock?: boolean }
  return {
    trackFrom: row.inventory_track_from === 'invoice' ? 'invoice' : 'none',
    warnLowStock: row.inventory_warn_low_stock !== false,
  }
}

export async function saveInventorySettings(settings: InventorySettings): Promise<void> {
  const { error } = await supabase
    .from('lab_settings')
    .update({
      inventory_track_from: settings.trackFrom,
      inventory_warn_low_stock: settings.warnLowStock,
    })
    .eq('id', LAB_ID)
  if (error) throw error
}

export type AccountRow = { id: string; account_name: string; account_type: string }

export type BankAccountRow = {
  id: string
  account_name: string
  bank_name: string
  account_number_last4: string
  ifsc: string
  is_active: boolean
}

export async function listBankAccounts(): Promise<BankAccountRow[]> {
  const { data, error } = await supabase
    .from('finance_bank_accounts')
    .select('id, account_name, bank_name, account_number_last4, ifsc, is_active')
    .eq('is_active', true)
    .order('account_name')
  if (error) {
    if (missingRelation(error)) return []
    throw error
  }
  return (data ?? []) as BankAccountRow[]
}

export async function addBankAccount(input: {
  accountName: string
  bankName: string
  accountNumberLast4: string
  ifsc: string
}): Promise<void> {
  const { error } = await supabase.from('finance_bank_accounts').insert({
    account_name: input.accountName.trim(),
    bank_name: input.bankName.trim(),
    account_number_last4: input.accountNumberLast4.trim(),
    ifsc: input.ifsc.trim().toUpperCase(),
  })
  if (error) throw error
}

export async function listAccounts(): Promise<AccountRow[]> {
  const { data, error } = await supabase.from('finance_accounts').select('id, account_name, account_type').order('account_name')
  if (error) {
    if (missingRelation(error)) return []
    throw error
  }
  return (data ?? []) as AccountRow[]
}

export async function addAccount(name: string, accountType: string): Promise<void> {
  const { error } = await supabase.from('finance_accounts').insert({
    account_name: name.trim(),
    account_type: accountType,
  })
  if (error) throw error
}

export type JournalLineInput = { account_id: string; debit: number; credit: number }

export async function saveJournal(input: {
  id?: string
  number: string
  date: string
  name: string
  lines: JournalLineInput[]
}): Promise<void> {
  const { error } = await supabase.rpc('save_journal_entry', {
    p_journal_id: input.id ?? null,
    p_number: input.number,
    p_date: input.date,
    p_name: input.name,
    p_lines: input.lines,
  })
  if (error) throw error
}

export async function nextJournalNumber(): Promise<string> {
  try {
    const allocated = await allocateDocumentNumber('journal')
    if (allocated) return allocated
  } catch {
    /* series is not live yet */
  }
  return `JN-${new Date().getFullYear()}-0001`
}

export type JournalRow = { id: string; journal_number: string; journal_date: string; journal_name: string }

export async function listJournals(): Promise<JournalRow[]> {
  const { data, error } = await supabase
    .from('finance_journals')
    .select('id, journal_number, journal_date, journal_name')
    .order('journal_date', { ascending: false })
    .limit(100)
  if (error) {
    if (missingRelation(error)) return []
    throw error
  }
  return (data ?? []).map((raw) => {
    const row = raw as JournalRow
    return { ...row, journal_date: String(row.journal_date ?? '').slice(0, 10) }
  })
}

export type StatementRow = { section: string; label: string; amount: number }

export async function listStatement(kind: 'profit_loss' | 'balance_sheet', from: string, to: string): Promise<StatementRow[]> {
  const { data, error } = await supabase.rpc('finance_statement', { p_kind: kind, p_from: from, p_to: to })
  if (error) {
    if (missingRelation(error) || error.code === '42883' || error.code === 'PGRST202') return []
    throw error
  }
  return (Array.isArray(data) ? data : []).map((raw) => {
    const row = raw as Record<string, unknown>
    return { section: String(row.section ?? ''), label: String(row.label ?? ''), amount: Number(row.amount) || 0 }
  })
}

export type ReportRow = {
  label: string
  party_name: string
  document_number: string
  amount: number
  tax_amount: number
}

export async function listFinanceReport(report: string, from: string, to: string): Promise<ReportRow[]> {
  const { data, error } = await supabase.rpc('finance_report', { p_report: report, p_from: from, p_to: to })
  if (error) {
    if (missingRelation(error) || error.code === '42883' || error.code === 'PGRST202') return []
    throw error
  }
  return (Array.isArray(data) ? data : []).map((raw) => {
    const row = raw as Record<string, unknown>
    return {
      label: String(row.label ?? ''),
      party_name: String(row.party_name ?? ''),
      document_number: String(row.document_number ?? ''),
      amount: Number(row.amount) || 0,
      tax_amount: Number(row.tax_amount) || 0,
    }
  })
}
