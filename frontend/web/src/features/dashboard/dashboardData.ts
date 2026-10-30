import { supabase } from '@/lib/supabaseClient'
import { fetchAllRows } from '@/lib/fetchAllRows'
import {
  LICENCE_KINDS,
  RENEWAL_DEFERRED_DAYS,
  RENEWAL_WINDOW_DAYS,
  dueSoonEndIsoDate,
  todayIsoDate,
} from '@/features/bis/projects/types'
import { formatIsCodeLabel } from '@/features/masters/is-codes/formatIsCodeLabel'
import { monthKeys, monthShortLabel, monthStartIso } from './dashboardFormat'

/**
 * Dashboard data. Every query goes through the normal Supabase client, so RLS (Module Access)
 * decides what comes back; sections the user cannot open are not queried at all.
 * Counts use `head: true`; distributions read a few small columns and group in the browser.
 */

/** Which dashboard sections the signed-in user may see (from Module Access). */
export type DashboardAccess = {
  licences: boolean
  applications: boolean
  inclusions: boolean
  nonConformity: boolean
  quotations: boolean
  invoices: boolean
  receipts: boolean
  clients: boolean
  isCodes: boolean
}

export type Section<T> = { data: T; error: null } | { data: null; error: string }

export type LicenceStatusCounts = {
  operative: number
  renewal: number
  deferred: number
  expired: number
  noValidity: number
}

export type StatusKey = keyof LicenceStatusCounts

export const STATUS_META: Array<{ key: StatusKey; label: string; color: string; hint: string }> = [
  { key: 'operative', label: 'Operative', color: 'var(--dash-good)', hint: 'Validity More Than 90 Days Away' },
  { key: 'renewal', label: 'Renewal Due', color: 'var(--dash-warning)', hint: 'Validity Within the Next 90 Days' },
  { key: 'deferred', label: 'Deferred', color: 'var(--dash-serious)', hint: 'Up to 90 Days Past Validity, ₹5,000 Late Fee' },
  { key: 'expired', label: 'Expired', color: 'var(--dash-critical)', hint: 'More Than 90 Days Past Validity' },
  { key: 'noValidity', label: 'No Validity', color: 'var(--dash-neutral)', hint: 'Validity Date Not Entered' },
]

export type MonthCount = { key: string; label: string; count: number }

export type IsCodeCount = { id: string; label: string; count: number }

export type LicenceSummary = {
  total: number
  /** True when more rows exist than the dashboard reads (distributions are then partial). */
  truncated: boolean
  status: LicenceStatusCounts
  /** Renewals falling due per month for the next 12 months (from today). */
  pipeline: MonthCount[]
  /** Licences granted per month over the last 12 months. */
  granted: MonthCount[]
  dueNext30: number
  topIsCodes: IsCodeCount[]
}

export type StageCount = { stage: string; count: number }

export type ApplicationSummary = {
  total: number
  inProgress: number
  updatedLast7Days: number
  byStage: StageCount[]
  /** Applications filed with BIS per month (application_date), last 12 months. */
  filed: MonthCount[]
}

export type IsCodeJoin = {
  is_number: string | null
  revision_year: string | null
  part_no: string | null
  section_no: string | null
  standard_prefix: string | null
} | null

export type DueRow = {
  id: string
  cmL: string
  client: string
  isCode: string
  validity: string
}

export type RecentApplicationRow = {
  id: string
  title: string
  client: string
  isCode: string
  stage: string
  updatedAt: string | null
}

export type NonConformityRow = {
  id: string
  caseType: string
  status: string
  client: string
  cmL: string
  stopDate: string | null
  deadline: string | null
}

export type FinanceMonth = {
  key: string
  label: string
  quotations: number
  invoices: number
  receipts: number
}

export type FinanceSummary = {
  months: FinanceMonth[]
  hasQuotations: boolean
  hasInvoices: boolean
  hasReceipts: boolean
  quotations12m: number
  quotationsCount12m: number
  receiptsThisMonth: number
  receiptsLastMonth: number
  invoicesThisMonth: number
}

export type DashboardData = {
  today: string
  loadedAt: number
  /** Undefined = hidden for this user (no Module Access). */
  licences?: Section<LicenceSummary>
  dueSoon?: Section<{ total: number; rows: DueRow[] }>
  applications?: Section<ApplicationSummary>
  recentApplications?: Section<RecentApplicationRow[]>
  inclusionsInProgress?: Section<number>
  nonConformity?: Section<{ total: number; overdue: number; rows: NonConformityRow[] }>
  finance?: Section<FinanceSummary>
  clientsCount?: Section<number>
  isCodesCount?: Section<number>
}

/** Rows read for distributions are capped; head counts stay exact. */
const ROW_CAP = 10_000
const APPLICATION_KINDS_OR = 'project_kind.eq.Application,project_kind.eq.application'
const INCLUSION_OR = 'inclusion_in_progress.eq.true,project_kind.eq.Inclusion,project_kind.eq.inclusion'
const CLOSED_APPLICATION_STATUSES = new Set(['completed', 'cancelled'])
const IS_CODE_JOIN = 'is_code:is_codes(is_number, revision_year, part_no, section_no, standard_prefix)'

function errorText(err: unknown): string {
  if (!err) return 'Unknown error'
  if (typeof err === 'string') return err
  if (err instanceof Error) return err.message
  if (typeof err === 'object' && 'message' in err) return String((err as { message: unknown }).message)
  return 'Unknown error'
}

async function section<T>(run: () => Promise<T>): Promise<Section<T>> {
  try {
    return { data: await run(), error: null }
  } catch (err) {
    return { data: null, error: errorText(err) }
  }
}

function maybe<T>(allowed: boolean, run: () => Promise<T>): Promise<Section<T> | undefined> {
  return allowed ? section(run) : Promise.resolve(undefined)
}

async function headCount(build: () => PromiseLike<{ count: number | null; error: unknown }>): Promise<number> {
  const { count, error } = await build()
  if (error) throw error
  return count ?? 0
}

function one<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null
  return value ?? null
}

function cmL(digits: string | null | undefined): string {
  const d = String(digits ?? '').replace(/\D/g, '')
  return d ? `CM/L-${d}` : '—'
}

function isCodeText(join: unknown): string {
  const row = one(join as IsCodeJoin | IsCodeJoin[])
  return row ? formatIsCodeLabel(row) || '—' : '—'
}

function companyName(join: unknown): string {
  const row = one(join as { company_name?: string | null } | null)
  return String(row?.company_name ?? '').trim() || '—'
}

function toNumber(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(n) ? n : 0
}

// ---------------------------------------------------------------------------
// Pure aggregation helpers (exported for reuse / tests)
// ---------------------------------------------------------------------------

export function licenceStatusCounts(validities: Array<string | null>, today: string): LicenceStatusCounts {
  const deferredFrom = dueSoonEndIsoDate(today, -RENEWAL_DEFERRED_DAYS)
  const renewalEnd = dueSoonEndIsoDate(today, RENEWAL_WINDOW_DAYS)
  const out: LicenceStatusCounts = { operative: 0, renewal: 0, deferred: 0, expired: 0, noValidity: 0 }
  for (const raw of validities) {
    const v = (raw ?? '').slice(0, 10)
    if (!v) out.noValidity += 1
    else if (v < deferredFrom) out.expired += 1
    else if (v < today) out.deferred += 1
    else if (v <= renewalEnd) out.renewal += 1
    else out.operative += 1
  }
  return out
}

/** Count ISO dates per month for the given month keys; dates before `from` are ignored. */
export function countByMonth(dates: Array<string | null>, keys: string[], from?: string): MonthCount[] {
  const counts = new Map(keys.map((k) => [k, 0]))
  for (const raw of dates) {
    const d = (raw ?? '').slice(0, 10)
    if (!d || (from && d < from)) continue
    const key = d.slice(0, 7)
    if (counts.has(key)) counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  return keys.map((key) => ({ key, label: monthShortLabel(key), count: counts.get(key) ?? 0 }))
}

export function sumByMonth<T>(
  rows: T[],
  keys: string[],
  dateOf: (row: T) => string | null | undefined,
  amountOf: (row: T) => number,
): Map<string, number> {
  const sums = new Map(keys.map((k) => [k, 0]))
  for (const row of rows) {
    const key = (dateOf(row) ?? '').slice(0, 7)
    if (!sums.has(key)) continue
    sums.set(key, (sums.get(key) ?? 0) + amountOf(row))
  }
  return sums
}

export function topCounts(ids: Array<string | null>, limit: number): Array<{ id: string; count: number }> {
  const counts = new Map<string, number>()
  for (const id of ids) {
    if (!id) continue
    counts.set(id, (counts.get(id) ?? 0) + 1)
  }
  return [...counts.entries()]
    .map(([id, count]) => ({ id, count }))
    .sort((a, b) => b.count - a.count || a.id.localeCompare(b.id))
    .slice(0, limit)
}

// ---------------------------------------------------------------------------
// Loaders
// ---------------------------------------------------------------------------

type LicenceLightRow = {
  id: string
  license_validity_date: string | null
  granted_date: string | null
  is_code_id: string | null
}

/*
 * Licence base set everywhere below: QE-managed licence rows (not applications, not old inclusion rows),
 * i.e. `.in('project_kind', LICENCE_KINDS).eq('is_qe_managed', true)` — same as the licence list pages.
 */

async function loadLicences(today: string): Promise<LicenceSummary> {
  const total = await headCount(() =>
    supabase
      .from('bis_projects')
      .select('id', { count: 'exact', head: true })
      .in('project_kind', LICENCE_KINDS)
      .eq('is_qe_managed', true),
  )
  const rows = await fetchAllRows<LicenceLightRow>(
    (from, to) =>
      supabase
        .from('bis_projects')
        .select('id, license_validity_date, granted_date, is_code_id')
        .in('project_kind', LICENCE_KINDS)
        .eq('is_qe_managed', true)
        .order('id', { ascending: true })
        .range(from, to),
    { max: ROW_CAP, count: async () => ({ count: total, error: null }) },
  )

  const validities = rows.map((r) => r.license_validity_date)
  const pipelineKeys = monthKeys(today, 0, 12)
  const lastYearKeys = monthKeys(today, -11, 12)
  const in30 = dueSoonEndIsoDate(today, 30)

  const top = topCounts(rows.map((r) => r.is_code_id), 10)
  let labels = new Map<string, string>()
  if (top.length) {
    const { data, error } = await supabase
      .from('is_codes')
      .select('id, is_number, revision_year, part_no, section_no, standard_prefix')
      .in('id', top.map((t) => t.id))
    if (!error && Array.isArray(data)) {
      labels = new Map(
        data.map((row) => [String(row.id), formatIsCodeLabel(row) || String(row.is_number ?? '—')]),
      )
    }
  }

  return {
    total,
    truncated: rows.length < total,
    status: licenceStatusCounts(validities, today),
    pipeline: countByMonth(validities, pipelineKeys, today),
    granted: countByMonth(
      rows.map((r) => r.granted_date),
      lastYearKeys,
    ),
    dueNext30: validities.filter((v) => {
      const d = (v ?? '').slice(0, 10)
      return d >= today && d <= in30
    }).length,
    topIsCodes: top.map((t) => ({ id: t.id, label: labels.get(t.id) ?? 'IS Code', count: t.count })),
  }
}

async function loadDueSoon(today: string): Promise<{ total: number; rows: DueRow[] }> {
  const { data, error, count } = await supabase
    .from('bis_projects')
    .select(`id, cm_l_digits, license_validity_date, client:clients(company_name), ${IS_CODE_JOIN}`, {
      count: 'exact',
    })
    .in('project_kind', LICENCE_KINDS)
    .eq('is_qe_managed', true)
    .gte('license_validity_date', today)
    .lte('license_validity_date', dueSoonEndIsoDate(today, 30))
    .order('license_validity_date', { ascending: true })
    .order('id', { ascending: true })
    .limit(8)
  if (error) throw error
  const rows = (data ?? []).map((row) => ({
    id: String(row.id),
    cmL: cmL(row.cm_l_digits as string | null),
    client: companyName(row.client),
    isCode: isCodeText(row.is_code),
    validity: String(row.license_validity_date ?? ''),
  }))
  return { total: count ?? rows.length, rows }
}

type ApplicationLightRow = {
  id: string
  status: string | null
  application_stage: string | null
  application_date: string | null
  updated_at: string | null
}

async function loadApplications(today: string): Promise<ApplicationSummary> {
  const rows = await fetchAllRows<ApplicationLightRow>(
    (from, to) =>
      supabase
        .from('bis_projects')
        .select('id, status, application_stage, application_date, updated_at')
        .or(APPLICATION_KINDS_OR)
        .order('id', { ascending: true })
        .range(from, to),
    { max: ROW_CAP },
  )
  const open = rows.filter((r) => !CLOSED_APPLICATION_STATUSES.has(String(r.status ?? '').trim().toLowerCase()))
  const stageCounts = new Map<string, number>()
  for (const row of open) {
    const stage = String(row.application_stage ?? '').trim() || 'Not Set'
    stageCounts.set(stage, (stageCounts.get(stage) ?? 0) + 1)
  }
  const weekAgo = Date.now() - 7 * 86_400_000
  return {
    total: rows.length,
    inProgress: open.length,
    updatedLast7Days: open.filter((r) => r.updated_at && new Date(r.updated_at).getTime() >= weekAgo).length,
    byStage: [...stageCounts.entries()]
      .map(([stage, count]) => ({ stage, count }))
      .sort((a, b) => b.count - a.count || a.stage.localeCompare(b.stage)),
    filed: countByMonth(
      rows.map((r) => r.application_date),
      monthKeys(today, -11, 12),
    ),
  }
}

async function loadRecentApplications(): Promise<RecentApplicationRow[]> {
  const { data, error } = await supabase
    .from('bis_projects')
    .select(`id, title, application_stage, updated_at, client:clients(company_name), ${IS_CODE_JOIN}`)
    .or(APPLICATION_KINDS_OR)
    .order('updated_at', { ascending: false, nullsFirst: false })
    .order('id', { ascending: true })
    .limit(6)
  if (error) throw error
  return (data ?? []).map((row) => ({
    id: String(row.id),
    title: String(row.title ?? '').trim(),
    client: companyName(row.client),
    isCode: isCodeText(row.is_code),
    stage: String(row.application_stage ?? '').trim() || 'Not Set',
    updatedAt: (row.updated_at as string | null) ?? null,
  }))
}

async function loadNonConformity(today: string) {
  const [list, overdue] = await Promise.all([
    supabase
      .from('bis_stop_marking_cases')
      .select('id, case_type, status, stop_date, bis_deadline, cm_l_digits, client:clients(company_name)', {
        count: 'exact',
      })
      .neq('status', 'closed')
      .order('stop_date', { ascending: false, nullsFirst: false })
      .order('id', { ascending: true })
      .limit(8),
    headCount(() =>
      supabase
        .from('bis_stop_marking_cases')
        .select('id', { count: 'exact', head: true })
        .neq('status', 'closed')
        .lt('bis_deadline', today),
    ),
  ])
  if (list.error) throw list.error
  const rows: NonConformityRow[] = (list.data ?? []).map((row) => ({
    id: String(row.id),
    caseType: String(row.case_type ?? '').trim() || 'stop_marking',
    status: String(row.status ?? '').trim() || 'open',
    client: companyName(row.client),
    cmL: cmL(row.cm_l_digits as string | null),
    stopDate: (row.stop_date as string | null) ?? null,
    deadline: (row.bis_deadline as string | null) ?? null,
  }))
  return { total: list.count ?? rows.length, overdue, rows }
}

const CANCELLED = /cancel|void|reject|fail/i

async function loadFinance(today: string, access: DashboardAccess): Promise<FinanceSummary> {
  const keys = monthKeys(today, -11, 12)
  const from = monthStartIso(keys[0])
  const thisMonth = keys[keys.length - 1]
  const lastMonth = keys[keys.length - 2]

  const [quotes, invoices, receipts] = await Promise.all([
    access.quotations
      ? fetchAllRows<{ id: string; quotation_date: string | null; grand_total: unknown; status: string | null }>(
          (f, t) =>
            supabase
              .from('quotations')
              .select('id, quotation_date, grand_total, status')
              .gte('quotation_date', from)
              .order('id', { ascending: true })
              .range(f, t),
          { max: ROW_CAP },
        )
      : Promise.resolve(null),
    access.invoices
      ? fetchAllRows<{ id: string; tax_date: string | null; grand_total: unknown; tax_status: string | null }>(
          (f, t) =>
            supabase
              .from('finance_tax_invoices')
              .select('id, tax_date, grand_total, tax_status')
              .gte('tax_date', from)
              .order('id', { ascending: true })
              .range(f, t),
          { max: ROW_CAP },
        )
      : Promise.resolve(null),
    access.receipts
      ? fetchAllRows<{ id: string; txn_date: string | null; amount: unknown; status: string | null }>(
          (f, t) =>
            supabase
              .from('transactions')
              .select('id, txn_date, amount, status')
              .eq('payment_flow', 'in')
              .gte('txn_date', from)
              .order('id', { ascending: true })
              .range(f, t),
          { max: ROW_CAP },
        )
      : Promise.resolve(null),
  ])

  const liveQuotes = (quotes ?? []).filter((r) => !CANCELLED.test(r.status ?? ''))
  const liveInvoices = (invoices ?? []).filter((r) => !CANCELLED.test(r.tax_status ?? ''))
  const liveReceipts = (receipts ?? []).filter((r) => !CANCELLED.test(r.status ?? ''))

  const q = sumByMonth(liveQuotes, keys, (r) => r.quotation_date, (r) => toNumber(r.grand_total))
  const inv = sumByMonth(liveInvoices, keys, (r) => r.tax_date, (r) => toNumber(r.grand_total))
  const rec = sumByMonth(liveReceipts, keys, (r) => r.txn_date, (r) => toNumber(r.amount))

  return {
    months: keys.map((key) => ({
      key,
      label: monthShortLabel(key),
      quotations: q.get(key) ?? 0,
      invoices: inv.get(key) ?? 0,
      receipts: rec.get(key) ?? 0,
    })),
    hasQuotations: quotes != null,
    hasInvoices: invoices != null,
    hasReceipts: receipts != null,
    quotations12m: [...q.values()].reduce((a, b) => a + b, 0),
    quotationsCount12m: liveQuotes.length,
    receiptsThisMonth: rec.get(thisMonth) ?? 0,
    receiptsLastMonth: rec.get(lastMonth) ?? 0,
    invoicesThisMonth: inv.get(thisMonth) ?? 0,
  }
}

export async function loadDashboardData(access: DashboardAccess): Promise<DashboardData> {
  // Make sure the auth token is loaded once before parallel requests (see fetchAllRows).
  await supabase.auth.getSession()
  const today = todayIsoDate()
  const anyFinance = access.quotations || access.invoices || access.receipts

  const [
    licences,
    dueSoon,
    applications,
    recentApplications,
    inclusionsInProgress,
    nonConformity,
    finance,
    clientsCount,
    isCodesCount,
  ] = await Promise.all([
    maybe(access.licences, () => loadLicences(today)),
    maybe(access.licences, () => loadDueSoon(today)),
    maybe(access.applications, () => loadApplications(today)),
    maybe(access.applications, () => loadRecentApplications()),
    maybe(access.inclusions, () =>
      headCount(() =>
        supabase.from('bis_projects').select('id', { count: 'exact', head: true }).or(INCLUSION_OR),
      ),
    ),
    maybe(access.nonConformity, () => loadNonConformity(today)),
    maybe(anyFinance, () => loadFinance(today, access)),
    maybe(access.clients, () =>
      headCount(() => supabase.from('clients').select('id', { count: 'exact', head: true })),
    ),
    maybe(access.isCodes, () =>
      headCount(() => supabase.from('is_codes').select('id', { count: 'exact', head: true })),
    ),
  ])

  return {
    today,
    loadedAt: Date.now(),
    licences,
    dueSoon,
    applications,
    recentApplications,
    inclusionsInProgress,
    nonConformity,
    finance,
    clientsCount,
    isCodesCount,
  }
}

/** True when every visible section failed — the page then shows one error with Retry. */
export function allSectionsFailed(data: DashboardData): boolean {
  const sections = [
    data.licences,
    data.dueSoon,
    data.applications,
    data.recentApplications,
    data.inclusionsInProgress,
    data.nonConformity,
    data.finance,
    data.clientsCount,
    data.isCodesCount,
  ].filter((s) => s != null)
  return sections.length > 0 && sections.every((s) => s?.error != null)
}
