import QRCode from 'qrcode'
import { supabase } from '@/lib/supabaseClient'
import { todayLocalIso, addDaysIso } from '@/lib/localDate'
import { sendAppEmail } from '@/lib/sendAppEmail'
import { emptyQuotationForm } from '@/features/finance/sale/quotation/types'
import { fetchNextSaleDocumentNumber, saveSaleDocument } from '@/features/finance/sale/shared/saleDocumentsApi'
import { formatDisplayDate } from '@/features/bis/projects/types'
import { columnKeyFrom, type RecordColumn, type RecordColumnType } from '@/features/portal/recordLogic'

/* Admin side of Customer Portal records: the paid service of a licence and the formats (sections + columns). */

export const TRIAL_DAYS = 30

export type RecordsService = {
  project_id: string
  records_enabled: boolean
  trial_ends: string | null
  paid_until: string | null
  notes: string | null
}

export type AdminSection = { id: string; project_id: string; kind: string; name: string; sort_order: number; columns: AdminColumn[] }
export type AdminColumn = RecordColumn & { section_id: string; sort_order: number }

export async function getRecordsService(projectId: string): Promise<RecordsService | null> {
  const { data, error } = await supabase.from('portal_services').select('*').eq('project_id', projectId).maybeSingle()
  if (error) throw error
  return (data as RecordsService | null) ?? null
}

/** Switching on starts the 30-day trial the first time; later switch-ons keep the dates. */
/** Services of several licences, keyed by licence id (licences never switched on are missing). */
export async function listRecordsServices(projectIds: string[]): Promise<Map<string, RecordsService>> {
  if (projectIds.length === 0) return new Map()
  const { data, error } = await supabase.from('portal_services').select('*').in('project_id', projectIds)
  if (error) throw error
  return new Map(((data ?? []) as RecordsService[]).map((s) => [s.project_id, s]))
}

export function serviceStatus(s: RecordsService | null): { text: string; tone: string } {
  const today = todayLocalIso()
  if (!s?.records_enabled) return { text: 'Off', tone: 'border-stone-300 bg-stone-100 text-stone-700' }
  if (s.paid_until && s.paid_until >= today) return { text: `Paid · Valid Till ${formatDisplayDate(s.paid_until)}`, tone: 'border-emerald-300 bg-emerald-50 text-emerald-800' }
  if (s.trial_ends && s.trial_ends >= today) return { text: `Free Trial · Till ${formatDisplayDate(s.trial_ends)}`, tone: 'border-sky-300 bg-sky-50 text-sky-800' }
  return { text: 'Expired · Customer Can Only View', tone: 'border-red-300 bg-red-50 text-red-800' }
}

export async function setRecordsEnabled(projectId: string, enabled: boolean, current: RecordsService | null): Promise<void> {
  const { data: auth } = await supabase.auth.getUser()
  const row = {
    project_id: projectId,
    records_enabled: enabled,
    trial_ends: current?.trial_ends ?? (enabled ? addDaysIso(todayLocalIso(), TRIAL_DAYS) : null),
    paid_until: current?.paid_until ?? null,
    enabled_at: enabled ? new Date().toISOString() : undefined,
    enabled_by: enabled ? auth.user?.id ?? null : undefined,
    updated_at: new Date().toISOString(),
  }
  const { error } = await supabase.from('portal_services').upsert(row, { onConflict: 'project_id' })
  if (error) throw error
}

export async function setPaidUntil(projectId: string, paidUntil: string | null): Promise<void> {
  const { error } = await supabase
    .from('portal_services')
    .update({ paid_until: paidUntil || null, updated_at: new Date().toISOString() })
    .eq('project_id', projectId)
  if (error) throw error
}

export async function listSections(projectId: string): Promise<AdminSection[]> {
  const { data, error } = await supabase
    .from('portal_rec_sections')
    .select('id, project_id, kind, name, sort_order, columns:portal_rec_columns(*)')
    .eq('project_id', projectId)
    .order('sort_order')
  if (error) throw error
  return ((data ?? []) as unknown as AdminSection[]).map((s) => ({
    ...s,
    columns: [...(s.columns ?? [])].sort((a, b) => a.sort_order - b.sort_order),
  }))
}

export async function createSection(projectId: string, kind: string, name: string, sortOrder: number): Promise<string> {
  const { data, error } = await supabase
    .from('portal_rec_sections')
    .insert({ project_id: projectId, kind, name, sort_order: sortOrder })
    .select('id')
    .single()
  if (error) throw error
  return String(data.id)
}

export async function updateSection(id: string, patch: { name?: string; sort_order?: number }): Promise<void> {
  const { error } = await supabase.from('portal_rec_sections').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', id)
  if (error) throw error
}

export async function deleteSection(id: string): Promise<void> {
  const { error } = await supabase.from('portal_rec_sections').delete().eq('id', id)
  if (error) throw error
}

export type ColumnDraft = {
  label: string
  col_type: RecordColumnType
  unit?: string | null
  spec_min?: number | null
  spec_max?: number | null
  config?: RecordColumn['config']
  required?: boolean
}

export async function saveColumn(sectionId: string, draft: ColumnDraft & { id?: string; key?: string; sort_order: number }): Promise<void> {
  const row = {
    section_id: sectionId,
    key: draft.key!,
    label: draft.label.trim(),
    col_type: draft.col_type,
    unit: draft.unit?.trim() || null,
    spec_min: draft.spec_min ?? null,
    spec_max: draft.spec_max ?? null,
    config: draft.config ?? {},
    required: Boolean(draft.required),
    sort_order: draft.sort_order,
    updated_at: new Date().toISOString(),
  }
  const { error } = draft.id
    ? await supabase.from('portal_rec_columns').update(row).eq('id', draft.id)
    : await supabase.from('portal_rec_columns').insert(row)
  if (error) throw error
}

export async function deleteColumn(id: string): Promise<void> {
  const { error } = await supabase.from('portal_rec_columns').delete().eq('id', id)
  if (error) throw error
}

export async function moveColumn(columns: AdminColumn[], index: number, dir: -1 | 1): Promise<void> {
  const j = index + dir
  if (j < 0 || j >= columns.length) return
  const a = columns[index]!
  const b = columns[j]!
  const results = await Promise.all([
    supabase.from('portal_rec_columns').update({ sort_order: j }).eq('id', a.id),
    supabase.from('portal_rec_columns').update({ sort_order: index }).eq('id', b.id),
  ])
  const failed = results.find((r) => r.error)
  if (failed?.error) throw failed.error
}

// ── Payments ─────────────────────────────────────────────────────────────────────────────────────────

export type PaymentSettings = {
  rate: number | null
  payee: string
  upi: string
  bankName: string
  branchName: string
  accountNumber: string
  ifsc: string
}

export type ServicePayment = {
  id: string
  kind: 'request' | 'payment'
  amount: number
  paid_on: string | null
  period_from: string | null
  period_to: string | null
  mode: string | null
  reference: string | null
  receipt_id: string | null
  sent_to: string | null
  created_at: string
  receipt_number?: string | null
}

export const PAYMENT_MODES = ['UPI', 'Bank', 'Cheque', 'Cash', 'Other'] as const

/** Rate and the company's bank / UPI details, all from Lab Settings. */
export async function getPaymentSettings(): Promise<PaymentSettings> {
  const { data, error } = await supabase
    .from('lab_settings')
    .select('lab_name, bank_name, branch_name, account_number, ifsc, upi, portal_records_yearly_rate')
    .limit(1)
    .maybeSingle()
  if (error) throw error
  const row = (data ?? {}) as Record<string, unknown>
  const text = (v: unknown) => String(v ?? '').trim()
  const rate = row.portal_records_yearly_rate == null ? null : Number(row.portal_records_yearly_rate)
  return {
    rate: rate != null && Number.isFinite(rate) ? rate : null,
    payee: text(row.lab_name) || 'Quality Engineering',
    upi: text(row.upi),
    bankName: text(row.bank_name),
    branchName: text(row.branch_name),
    accountNumber: text(row.account_number),
    ifsc: text(row.ifsc),
  }
}

export async function listServicePayments(projectId: string): Promise<ServicePayment[]> {
  const { data, error } = await supabase
    .from('portal_service_payments')
    .select('id, kind, amount, paid_on, period_from, period_to, mode, reference, receipt_id, sent_to, created_at, receipt:transactions(receipt_number)')
    .eq('project_id', projectId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return ((data ?? []) as unknown as Array<ServicePayment & { receipt?: { receipt_number?: string | null } | null }>).map(({ receipt, ...p }) => ({
    ...p,
    amount: Number(p.amount),
    receipt_number: receipt?.receipt_number ?? null,
  }))
}

/** The next paid year: from the day after a running paid period (or today) for one year. */
export function nextPaidPeriod(service: RecordsService | null, today = todayLocalIso()): { from: string; to: string } {
  const from = service?.paid_until && service.paid_until >= today ? addDaysIso(service.paid_until, 1) : today
  const [y, m, d] = from.split('-').map(Number)
  const end = new Date(Date.UTC(y! + 1, m! - 1, d!))
  end.setUTCDate(end.getUTCDate() - 1)
  return { from, to: end.toISOString().slice(0, 10) }
}

/** Starts the 30-day free trial (only once per licence). */
export async function startTrial(projectId: string, current: RecordsService | null): Promise<void> {
  if (current?.trial_ends) throw new Error('The free trial of this licence was already used')
  await setRecordsEnabled(projectId, true, current)
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)
}

function rupees(amount: number) {
  return `₹ ${amount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function dmy(iso: string) {
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

/** Emails the customer the amount for the next paid year with a UPI link, a UPI QR (with the amount) and bank details. */
export async function sendPaymentRequest(input: {
  projectId: string
  licence: string
  company: string
  to: string[]
  amount: number
  period: { from: string; to: string }
  settings: PaymentSettings
}): Promise<void> {
  const { settings, amount, period } = input
  if (input.to.length === 0) throw new Error('Select at Least One Email')
  if (!(amount > 0)) throw new Error('Enter the Amount')
  if (!settings.upi && !settings.accountNumber) throw new Error('Add the UPI ID or Bank Account in Lab Settings → Bank Details First')
  const note = `Records Service ${input.licence}`.slice(0, 60)
  const upiLink = settings.upi
    ? `upi://pay?pa=${encodeURIComponent(settings.upi)}&pn=${encodeURIComponent(settings.payee)}&am=${amount.toFixed(2)}&cu=INR&tn=${encodeURIComponent(note)}`
    : ''
  const attachments = upiLink
    ? [{ filename: 'UPI-Payment-QR.png', content: (await QRCode.toDataURL(upiLink, { width: 480, margin: 2 })).split(',')[1]!, contentType: 'image/png' }]
    : []
  const row = (label: string, value: string) =>
    value ? `<tr><td style="padding:6px 10px;border:1px solid #e7e5e4;color:#57534e;">${label}</td><td style="padding:6px 10px;border:1px solid #e7e5e4;font-weight:600;">${escapeHtml(value)}</td></tr>` : ''
  const html = `<div style="font-family:Segoe UI,Arial,sans-serif;font-size:14px;line-height:1.55;color:#292524;max-width:560px;">
<p>Dear Sir/Madam,</p>
<p>Please pay for the <strong>Customer Portal Records Service</strong> of licence <strong>${escapeHtml(input.licence)}</strong> (${escapeHtml(input.company)}).</p>
<table style="border-collapse:collapse;margin:12px 0;">
${row('Amount', rupees(amount))}
${row('Period', `${dmy(period.from)} to ${dmy(period.to)}`)}
</table>
${upiLink ? `<p><a href="${upiLink}" style="display:inline-block;background:#b45309;color:#fff;text-decoration:none;padding:10px 18px;font-weight:600;">Pay ${rupees(amount)} by UPI</a></p>
<p style="color:#57534e;">The button opens a UPI app on the phone. On a computer, scan the attached QR (UPI-Payment-QR.png) with GPay, PhonePe, Paytm or a bank app. UPI ID: <strong>${escapeHtml(settings.upi)}</strong></p>` : ''}
${settings.accountNumber ? `<p style="margin-top:16px;font-weight:600;">Or Pay by Bank Transfer (NEFT / RTGS / IMPS)</p>
<table style="border-collapse:collapse;">
${row('Account Name', settings.payee)}
${row('Account No', settings.accountNumber)}
${row('IFSC', settings.ifsc)}
${row('Bank', [settings.bankName, settings.branchName].filter(Boolean).join(', '))}
</table>` : ''}
<p style="margin-top:16px;">After paying, please reply to this email with the transaction / UTR number.</p>
<p>Thanking you,<br/>${escapeHtml(settings.payee)}</p>
</div>`
  await sendAppEmail({
    to: input.to,
    subject: `Payment for Records Service: ${input.licence}`,
    html,
    text: `Please pay ${rupees(amount)} for the Records Service of ${input.licence} (${dmy(period.from)} to ${dmy(period.to)}).${settings.upi ? ` UPI ID: ${settings.upi}.` : ''}`,
    attachments,
  })
  const { error } = await supabase.from('portal_service_payments').insert({
    project_id: input.projectId,
    kind: 'request',
    amount,
    period_from: period.from,
    period_to: period.to,
    sent_to: input.to.join(', '),
  })
  if (error) throw error
}

/**
 * Records a received payment: makes the Payment Receipt in Finance, switches the service on with the new
 * paid date, and keeps the payment in the licence's history. Returns the receipt number.
 */
export async function recordPayment(input: {
  projectId: string
  clientId: string
  licence: string
  amount: number
  paidOn: string
  mode: (typeof PAYMENT_MODES)[number]
  reference: string
  period: { from: string; to: string }
  current: RecordsService | null
}): Promise<string> {
  const { amount, period } = input
  if (!(amount > 0)) throw new Error('Enter the Amount Received')
  if (!input.paidOn) throw new Error('Enter the Date Received')
  if (!period.to || period.to < period.from) throw new Error('Paid Till must be after the start of the period')

  const { data: client, error: clientError } = await supabase
    .from('clients')
    .select('company_name, email, mobile, address, gst_number')
    .eq('id', input.clientId)
    .single()
  if (clientError) throw clientError

  // Same numbering as Finance → Payment Receipt (PR-<year>-0001 unless a series is set up).
  const number = await fetchNextSaleDocumentNumber('paymentReceipt', `PR-${new Date().getFullYear()}-`)
  const form = emptyQuotationForm(number)
  form.quotationDate = input.paidOn
  form.clientId = input.clientId
  form.clientName = String(client.company_name ?? '')
  form.contactEmail = String(client.email ?? '')
  form.contactMobile = String(client.mobile ?? '')
  form.clientAddress = String(client.address ?? '')
  form.clientGstNumber = String(client.gst_number ?? '')
  form.paymentAmount = String(amount)
  form.paymentMethod = input.mode
  form.subject = `Customer Portal Records Service: ${input.licence} (${dmy(period.from)} to ${dmy(period.to)})`
  form.remarks = input.reference.trim() ? `Ref / UTR: ${input.reference.trim()}` : ''
  await saveSaleDocument('paymentReceipt', form, null)

  const { data: receipt } = await supabase
    .from('transactions')
    .select('id')
    .eq('receipt_number', number)
    .eq('payment_flow', 'in')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  const { data: auth } = await supabase.auth.getUser()
  const { error: svcError } = await supabase.from('portal_services').upsert(
    {
      project_id: input.projectId,
      records_enabled: true,
      trial_ends: input.current?.trial_ends ?? null,
      paid_until: period.to,
      enabled_at: input.current?.records_enabled ? undefined : new Date().toISOString(),
      enabled_by: input.current?.records_enabled ? undefined : auth.user?.id ?? null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'project_id' },
  )
  if (svcError) throw svcError

  const { error } = await supabase.from('portal_service_payments').insert({
    project_id: input.projectId,
    kind: 'payment',
    amount,
    paid_on: input.paidOn,
    period_from: period.from,
    period_to: period.to,
    mode: input.mode,
    reference: input.reference.trim() || null,
    receipt_id: (receipt as { id?: string } | null)?.id ?? null,
  })
  if (error) throw error
  return number
}

// ── Standard formats ─────────────────────────────────────────────────────────────────────────────────

/** "0.040 % Maximum" -> max 0.04; "Min 25 mm" -> min 25; "0.30 % - 0.70 %" -> 0.3..0.7; "90 ± 1" -> 89..91. */
export function limitsFromSpec(text: string | null | undefined): { min: number | null; max: number | null } | null {
  const s = String(text ?? '').replace(/,/g, '')
  const nums = [...s.matchAll(/-?\d+(?:\.\d+)?/g)].map((m) => Number(m[0]))
  if (nums.length === 0) return null
  if (/±|\+\/-/.test(s) && nums.length >= 2) return { min: nums[0]! - Math.abs(nums[1]!), max: nums[0]! + Math.abs(nums[1]!) }
  if (/\b(max|maximum)\b|not more than|≤|<=/i.test(s)) return { min: null, max: nums[0]! }
  if (/\b(min|minimum)\b|not less than|≥|>=/i.test(s)) return { min: nums[0]!, max: null }
  if (nums.length === 2 && /\d\s*(?:%|[a-z]+)?\s*(?:-|–|to)\s*\d/i.test(s)) return { min: Math.min(nums[0]!, nums[1]!), max: Math.max(nums[0]!, nums[1]!) }
  return null
}

async function licenceSources(projectId: string) {
  const { data: project, error } = await supabase.from('bis_projects').select('is_code_id').eq('id', projectId).single()
  if (error) throw error
  const [params, rm] = await Promise.all([
    project.is_code_id
      ? supabase
          .from('test_parameters')
          .select('test_name, specified_value, unit, display_order')
          .eq('is_code_id', project.is_code_id)
          .is('archived_at', null)
          .order('display_order', { ascending: true, nullsFirst: false })
      : Promise.resolve({ data: [], error: null }),
    supabase.from('bis_project_module_data').select('payload').eq('bis_project_id', projectId).eq('module_kind', 'raw-material-reference').maybeSingle(),
  ])
  if (params.error) throw params.error
  const rawRows = ((rm.data?.payload as { rawMaterials?: Array<{ rawMaterial?: string; supplierName?: string }> } | null)?.rawMaterials ?? [])
  const uniq = (list: Array<string | undefined>) => [...new Set(list.map((v) => (v ?? '').trim()).filter(Boolean))]
  return {
    tests: (params.data ?? []) as Array<{ test_name: string; specified_value: string | null; unit: string | null }>,
    materials: uniq(rawRows.map((r) => r.rawMaterial)),
    suppliers: uniq(rawRows.map((r) => r.supplierName)),
  }
}

async function addColumns(sectionId: string, drafts: ColumnDraft[], startOrder = 0): Promise<void> {
  const taken: string[] = []
  const rows = drafts.map((d, i) => {
    const key = columnKeyFrom(d.label, taken)
    taken.push(key)
    return {
      section_id: sectionId,
      key,
      label: d.label,
      col_type: d.col_type,
      unit: d.unit ?? null,
      spec_min: d.spec_min ?? null,
      spec_max: d.spec_max ?? null,
      config: d.config ?? {},
      required: Boolean(d.required),
      sort_order: startOrder + i,
    }
  })
  if (rows.length === 0) return
  const { error } = await supabase.from('portal_rec_columns').insert(rows)
  if (error) throw error
}

/** Final-test columns from the IS Code's test parameters: numeric limits become auto Pass / Fail, the rest Pass / Fail. */
export function testColumns(tests: Array<{ test_name: string; specified_value: string | null; unit: string | null }>): ColumnDraft[] {
  return tests.map((t) => {
    const unit = t.unit && t.unit !== '--' ? t.unit : null
    const limits = limitsFromSpec(t.specified_value)
    return limits
      ? { label: t.test_name, col_type: 'spec' as const, unit, spec_min: limits.min, spec_max: limits.max }
      : { label: t.test_name, col_type: 'pass_fail' as const, unit: null }
  })
}

/** Creates Raw Material, In-Process, Final Testing and Batch / Lot with starting columns from the licence's data. */
export async function createStandardSections(projectId: string, existingCount: number): Promise<void> {
  const src = await licenceSources(projectId)
  const rmId = await createSection(projectId, 'raw_material', 'Raw Material', existingCount)
  await addColumns(rmId, [
    src.materials.length ? { label: 'Material', col_type: 'select', config: { options: src.materials }, required: true } : { label: 'Material', col_type: 'text', required: true },
    src.suppliers.length ? { label: 'Supplier', col_type: 'select', config: { options: src.suppliers } } : { label: 'Supplier', col_type: 'text' },
    { label: 'Invoice No', col_type: 'text' },
    { label: 'Quantity', col_type: 'number', unit: 'MT' },
    { label: 'Test Certificate No', col_type: 'text' },
    { label: 'Result', col_type: 'pass_fail' },
  ])
  const ipId = await createSection(projectId, 'in_process', 'In-Process', existingCount + 1)
  await addColumns(ipId, [
    { label: 'Stage', col_type: 'text', required: true },
    { label: 'Parameter', col_type: 'text' },
    { label: 'Observed Value', col_type: 'number' },
    { label: 'Result', col_type: 'pass_fail' },
    { label: 'Remarks', col_type: 'text' },
  ])
  const ftId = await createSection(projectId, 'final_test', 'Final Testing', existingCount + 2)
  await addColumns(ftId, testColumns(src.tests))
  const btId = await createSection(projectId, 'batch', 'Batch / Lot', existingCount + 3)
  await addColumns(btId, [
    { label: 'Batch Size', col_type: 'number', unit: 'MT' },
    { label: 'Raw Material Lots', col_type: 'link', config: { section_id: rmId } },
    { label: 'Final Test', col_type: 'link', config: { section_id: ftId } },
    { label: 'Dispatched To', col_type: 'text' },
  ])
}

export async function addTestParameterColumns(projectId: string, sectionId: string, startOrder: number, existingKeys: string[]): Promise<number> {
  const src = await licenceSources(projectId)
  const drafts = testColumns(src.tests)
  const taken = [...existingKeys]
  const rows = drafts.map((d, i) => {
    const key = columnKeyFrom(d.label, taken)
    taken.push(key)
    return { section_id: sectionId, key, label: d.label, col_type: d.col_type, unit: d.unit ?? null, spec_min: d.spec_min ?? null, spec_max: d.spec_max ?? null, config: {}, required: false, sort_order: startOrder + i }
  })
  if (rows.length) {
    const { error } = await supabase.from('portal_rec_columns').insert(rows)
    if (error) throw error
  }
  return rows.length
}
