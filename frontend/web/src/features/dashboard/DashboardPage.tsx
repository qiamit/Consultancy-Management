import {
  createContext,
  lazy,
  Suspense,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Ban,
  BadgeCheck,
  CalendarClock,
  CalendarX2,
  FilePlus2,
  Hourglass,
  Layers,
  RefreshCw,
  Wallet,
  AlertTriangle,
} from 'lucide-react'
import { NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { useModuleAccessOptional } from '@/features/settings/module-access/ModuleAccessProvider'
import { canAccessPath as legacyCanAccessPath } from '@/lib/moduleAccess'
import {
  limsDarkBarAccentClass,
  limsDarkBarClass,
  limsDarkBarGlowStyle,
  limsPageShellClass,
  limsPanelClass,
} from '@/lib/limsThemeUi'
import { cn } from '@/lib/utils'
import { formatDisplayDate } from '@/features/bis/projects/types'
import { NOTICE_TYPE_OPTIONS, STOP_MARKING_STATUS_OPTIONS } from '@/features/bis/stop-marking/types'
import {
  allSectionsFailed,
  loadDashboardData,
  STATUS_META,
  type DashboardAccess,
  type DashboardData,
  type Section,
  type StatusKey,
} from './dashboardData'
import {
  daysBetween,
  daysLeftLabel,
  formatCount,
  formatInr,
  formatInrCompact,
  relativeTimeLabel,
} from './dashboardFormat'
import {
  CardHeader,
  ChartSkeleton,
  DashCard,
  EmptyState,
  KpiTile,
  KpiTileSkeleton,
  ListSkeleton,
  SectionError,
  SrDataTable,
  type KpiTileProps,
  type SrTable,
} from './DashboardWidgets'
import type { DashboardChartProps } from './DashboardCharts'
import './dashboard.css'

/** Recharts lives in its own chunk; the page shell, tiles and lists render without it. */
const DashboardChart = lazy(() => import('./DashboardCharts'))

const PATHS = {
  licences: '/bis/projects',
  renewals: '/bis/license-renewals',
  expired: '/bis/expired-licenses',
  applications: '/bis/new-applications',
  inclusions: '/bis/new-inclusion',
  nonConformity: '/bis/stop-marking',
  quotations: '/finance/sale/quotation',
  invoices: '/finance/sale/invoice',
  receipts: '/finance/sale/payment-receipt',
  clients: '/masters/clients',
  isCodes: '/masters/is-codes',
} as const

type PathKey = keyof typeof PATHS

/**
 * Fit to screen (owner, 24 Nov 2026): on a desktop screen the whole dashboard shows at once, without scrolling the
 * page: a slim title bar, the eight figures in one row, and the cards in three rows that share the rest of the height
 * (charts take their card's height, long lists scroll inside their card). Smaller screens scroll as before.
 */
// From 780px of height: below that three rows of cards are too short for their charts (1280 × 720: axis labels ran
// into each other), so such screens scroll as before.
const FIT_QUERY = '(min-width: 1280px) and (min-height: 780px)'

function subscribeFit(onChange: () => void) {
  const mq = window.matchMedia(FIT_QUERY)
  mq.addEventListener('change', onChange)
  return () => mq.removeEventListener('change', onChange)
}

function useDashFit(): boolean {
  return useSyncExternalStore(subscribeFit, () => window.matchMedia(FIT_QUERY).matches, () => false)
}

const DashFitContext = createContext(false)
/** Fit to screen with room for all eight figures in one row (no pinned sidebar beside a mid-size screen). */
const DashWideContext = createContext(false)
const WIDE_PX = 1300

/** Width of an element, kept up to date (0 until measured). A callback ref: the page's element appears only once
 * the data has loaded. */
function useBoxWidth() {
  const [el, setEl] = useState<HTMLDivElement | null>(null)
  const [width, setWidth] = useState(0)
  useEffect(() => {
    if (!el) return
    const ro = new ResizeObserver(([entry]) => setWidth(Math.floor(entry.contentRect.width)))
    ro.observe(el)
    return () => ro.disconnect()
  }, [el])
  return { ref: setEl, width }
}

/** Height of an element, kept up to date (0 until measured). */
function useBoxHeight(active: boolean) {
  const ref = useRef<HTMLDivElement>(null)
  const [height, setHeight] = useState(0)
  useEffect(() => {
    const el = ref.current
    if (!active || !el) return
    const ro = new ResizeObserver(([entry]) => setHeight(Math.floor(entry.contentRect.height)))
    ro.observe(el)
    return () => ro.disconnect()
  }, [active])
  return { ref, height }
}

function useDashboardAccess() {
  const moduleAccess = useModuleAccessOptional()
  const { user, designation, departmentName, role, profileReady } = useAuth()
  const ready = Boolean(user) && profileReady && !moduleAccess?.loading

  const can = useCallback(
    (path: string) =>
      moduleAccess && !moduleAccess.loading
        ? moduleAccess.canAccessPath(path)
        : legacyCanAccessPath(path, { designation, departmentName, role }),
    [moduleAccess, designation, departmentName, role],
  )

  const access = useMemo<DashboardAccess>(
    () => ({
      // bis_projects RLS accepts any BIS module; the licence widgets follow the licence lists.
      licences: can(PATHS.licences) || can(PATHS.renewals),
      applications: can(PATHS.applications),
      inclusions: can(PATHS.inclusions),
      nonConformity: can(PATHS.nonConformity),
      quotations: can(PATHS.quotations),
      invoices: can(PATHS.invoices),
      receipts: can(PATHS.receipts),
      clients: can(PATHS.clients),
      isCodes: can(PATHS.isCodes),
    }),
    [can],
  )

  /** Route for a widget when the user may open it, else null (widget is then not a link). */
  const href = useCallback(
    (key: PathKey, search = ''): string | null => (can(PATHS[key]) ? `${PATHS[key]}${search}` : null),
    [can],
  )

  return { ready, access, href, userId: user?.id ?? null }
}

/* Literal class strings so Tailwind keeps them. */
const XL_SPAN: Record<number, string> = {
  4: 'xl:col-span-4',
  5: 'xl:col-span-5',
  6: 'xl:col-span-6',
  7: 'xl:col-span-7',
  8: 'xl:col-span-8',
  12: 'xl:col-span-12',
}

function ChartBody({
  section,
  height,
  onRetry,
  empty,
  chart,
  table,
}: {
  section: Section<unknown> | undefined
  height: number
  onRetry: () => void
  empty?: { title: string; hint?: string } | null
  chart: DashboardChartProps | null
  table: SrTable | null
}) {
  const fit = useContext(DashFitContext)
  const box = useBoxHeight(fit && !section?.error && !empty && Boolean(chart))
  if (section?.error) return <SectionError message={section.error} onRetry={onRetry} height={fit ? undefined : height} />
  if (empty || !chart) return <EmptyState title={empty?.title ?? 'No Data Yet'} hint={empty?.hint} height={fit ? undefined : height} />
  if (fit) {
    return (
      <div className="flex min-h-0 flex-1 flex-col px-2 pb-1.5 pt-1">
        <div ref={box.ref} role="img" aria-label={table?.caption} className="min-h-0 flex-1">
          {box.height > 40 ? (
            <Suspense fallback={<ChartSkeleton height={box.height} />}>
              <DashboardChart {...chart} height={box.height} />
            </Suspense>
          ) : null}
        </div>
        {table ? <SrDataTable table={table} /> : null}
      </div>
    )
  }
  return (
    <div className="px-2 pb-3 pt-2 sm:px-3">
      <div role="img" aria-label={table?.caption}>
        <Suspense fallback={<ChartSkeleton height={height} />}>
          <DashboardChart {...chart} />
        </Suspense>
      </div>
      {table ? <SrDataTable table={table} /> : null}
    </div>
  )
}

type ListItem = {
  id: string
  href: string | null
  primary: string
  secondary: string
  badge: ReactNode
  meta?: ReactNode
}

function ListBody({
  section,
  items,
  onRetry,
  emptyTitle,
  emptyHint,
  footer,
}: {
  section: Section<unknown> | undefined
  items: ListItem[]
  onRetry: () => void
  emptyTitle: string
  emptyHint?: string
  footer?: ReactNode
}) {
  const fit = useContext(DashFitContext)
  if (section?.error) return <SectionError message={section.error} onRetry={onRetry} />
  if (!items.length) return <EmptyState title={emptyTitle} hint={emptyHint} />
  return (
    <>
      <ul className={cn('divide-y divide-[rgb(var(--lims-paper-border))]', fit && 'min-h-0 flex-1 overflow-y-auto')}>
        {items.map((item) => {
          const content = (
            <>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-foreground">{item.primary}</p>
                <p className="truncate text-xs text-muted-foreground">{item.secondary}</p>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-0.5 text-right">
                {item.badge}
                {item.meta ? <span className="text-[11px] text-muted-foreground">{item.meta}</span> : null}
              </div>
            </>
          )
          return (
            <li key={item.id}>
              {item.href ? (
                <NavLink
                  to={item.href}
                  className={cn(
                    'flex items-center gap-3 px-4 transition hover:bg-amber-500/10 focus-visible:bg-amber-500/10 focus-visible:outline-none',
                    fit ? 'min-h-11 py-1.5' : 'min-h-[3.25rem] py-2.5',
                  )}
                >
                  {content}
                </NavLink>
              ) : (
                <div className={cn('flex items-center gap-3 px-4', fit ? 'min-h-11 py-1.5' : 'min-h-[3.25rem] py-2.5')}>{content}</div>
              )}
            </li>
          )
        })}
      </ul>
      {footer ? (
        <div className={cn('mt-auto shrink-0 border-t border-[rgb(var(--lims-paper-border))] px-4 text-xs text-muted-foreground', fit ? 'py-1' : 'py-2')}>
          {footer}
        </div>
      ) : null}
    </>
  )
}

type RankRow = { id: string; label: string; count: number }

/**
 * A ranked list with a bar under each row, like iPhone's Screen Time (owner, 24 Nov 2026): the full name on the
 * left, the count on the right and a rounded bar showing its share of the largest. Replaces the horizontal bar
 * charts of Applications by Stage and Top 10 IS Codes, whose names were cut ("Test Request Submi…") and whose ten
 * rows crowded together. On the fit-to-screen dashboard the rows run in two columns, so all of them show.
 */
function RankBody({
  section,
  rows,
  onRetry,
  empty,
  numbered = false,
  hrefFor,
  unit,
  table,
}: {
  section: Section<unknown> | undefined
  rows: RankRow[]
  onRetry: () => void
  empty: string
  numbered?: boolean
  hrefFor: (row: RankRow) => string | null
  unit: string
  table: SrTable
}) {
  const fit = useContext(DashFitContext)
  if (section?.error) return <SectionError message={section.error} onRetry={onRetry} />
  if (!rows.length) return <EmptyState title={empty} />
  const max = Math.max(1, ...rows.map((r) => r.count))
  const twoColumns = fit && rows.length >= 5
  return (
    <>
      <ol
        className={cn(
          'grid gap-x-5 px-4',
          fit ? 'min-h-0 flex-1 content-evenly gap-y-0 overflow-y-auto py-1.5' : 'gap-y-2 py-3',
          twoColumns && 'grid-flow-col grid-cols-2',
        )}
        style={twoColumns ? { gridTemplateRows: `repeat(${Math.ceil(rows.length / 2)}, auto)` } : undefined}
      >
        {rows.map((row, i) => {
          const to = hrefFor(row)
          const inner = (
            <>
              <span className="flex min-w-0 items-baseline gap-2">
                {numbered ? (
                  <span className="w-4 shrink-0 text-right text-[11px] font-semibold tabular-nums text-muted-foreground">
                    {i + 1}
                  </span>
                ) : null}
                <span className={cn('min-w-0 flex-1 truncate font-medium text-foreground', fit ? 'text-xs' : 'text-[13px]')} title={row.label}>
                  {row.label}
                </span>
                <span className={cn('shrink-0 font-semibold tabular-nums text-foreground', fit ? 'text-xs' : 'text-[13px]')}>
                  {formatCount(row.count)}
                </span>
              </span>
              <span
                className={cn(
                  'block overflow-hidden rounded-full bg-[var(--dash-accent-soft)]',
                  fit ? 'mt-0.5 h-1' : 'mt-1 h-1.5',
                  numbered && 'ml-6',
                )}
              >
                <span
                  className="block h-full rounded-full bg-[var(--dash-accent)]"
                  style={{ width: `${Math.max(3, Math.round((row.count / max) * 100))}%` }}
                />
              </span>
            </>
          )
          return (
            <li key={row.id} className="min-w-0">
              {to ? (
                <NavLink
                  to={to}
                  className={cn(
                    '-mx-1.5 block rounded-lg px-1.5 transition hover:bg-amber-500/10 focus-visible:bg-amber-500/10 focus-visible:outline-none',
                    fit ? 'py-0.5' : 'py-1',
                  )}
                  aria-label={`${row.label}: ${formatCount(row.count)} ${unit}`}
                >
                  {inner}
                </NavLink>
              ) : (
                <div className={fit ? 'py-0.5' : 'py-1'}>{inner}</div>
              )}
            </li>
          )
        })}
      </ol>
      <SrDataTable table={table} />
    </>
  )
}

function Badge({ tone, children }: { tone: 'warning' | 'critical' | 'serious' | 'neutral' | 'good'; children: ReactNode }) {
  const cls = {
    warning: 'border-[var(--dash-warning)] text-foreground',
    serious: 'border-[var(--dash-serious)] text-foreground',
    critical: 'border-[var(--dash-critical)] text-foreground',
    good: 'border-[var(--dash-good)] text-foreground',
    neutral: 'border-stone-400 text-muted-foreground',
  }[tone]
  return (
    <span className={cn('inline-flex items-center whitespace-nowrap border-l-4 bg-stone-50 px-1.5 py-0.5 text-[11px] font-semibold', cls)}>
      {children}
    </span>
  )
}

const noticeLabel = (value: string) =>
  NOTICE_TYPE_OPTIONS.find((o) => o.value === value)?.label ?? value.replace(/_/g, ' ')
const ncStatusLabel = (value: string) =>
  STOP_MARKING_STATUS_OPTIONS.find((o) => o.value === value)?.label ?? value.replace(/_/g, ' ')

export default function DashboardPage() {
  const { profileName, user } = useAuth()
  const navigate = useNavigate()
  const { ready, access, href, userId } = useDashboardAccess()
  const fit = useDashFit()
  const pageBox = useBoxWidth()

  const accessKey = useMemo(() => JSON.stringify(access), [access])
  const query = useQuery({
    queryKey: ['dashboard', userId, accessKey],
    queryFn: () => loadDashboardData(access),
    enabled: ready,
    staleTime: 60_000,
  })
  const { data, isPending, isFetching, refetch } = query
  const retry = useCallback(() => void refetch(), [refetch])
  const go = useCallback((to: string | null) => {
    if (to) navigate(to)
  }, [navigate])

  const greetingName = profileName || user?.email || ''
  const todayLabel = new Date().toLocaleDateString('en-IN', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })

  const header = (
    <header className={cn(limsDarkBarClass, 'border-2 border-stone-700', fit ? 'shrink-0 px-4 py-1.5' : 'px-4 py-4 sm:px-6 sm:py-5')}>
      <div className="pointer-events-none absolute inset-0 opacity-70" style={limsDarkBarGlowStyle} aria-hidden="true" />
      <div className={limsDarkBarAccentClass} aria-hidden="true" />
      <div className={cn('relative flex min-w-0 gap-3', fit ? 'flex-row items-center justify-between' : 'flex-col lg:flex-row lg:items-end lg:justify-between')}>
        <div className={cn('min-w-0', fit && 'flex items-baseline gap-3')}>
          <h1 className="break-words font-jakarta text-xl font-bold tracking-tight text-white sm:text-2xl">
            Welcome{greetingName ? `, ${greetingName}` : ''}
          </h1>
          <p className={cn('text-xs text-white/70 sm:text-sm', !fit && 'mt-0.5')}>{todayLabel}</p>
        </div>
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          {data ? <HeaderStats data={data} href={href} /> : null}
          <button
            type="button"
            onClick={retry}
            disabled={!ready || isFetching}
            className="inline-flex h-10 min-h-10 w-10 items-center justify-center border border-amber-500/40 bg-stone-800/80 text-amber-100 hover:bg-amber-500/20 disabled:opacity-60"
            aria-label="Refresh Dashboard"
            title={isFetching ? 'Refreshing' : data && !allSectionsFailed(data) ? `Refresh — Updated ${relativeTimeLabel(new Date(data.loadedAt).toISOString())}` : 'Refresh'}
          >
            <RefreshCw className={cn('h-4 w-4', isFetching && 'animate-spin')} aria-hidden="true" />
          </button>
        </div>
      </div>
    </header>
  )

  if (!ready || isPending) {
    return (
      <div className={cn(limsPageShellClass, 'dash-root')} aria-busy="true">
        {header}
        <span className="sr-only" role="status">Loading Dashboard</span>
        <div className="grid grid-cols-1 gap-3 min-[480px]:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 8 }, (_, i) => (
            <KpiTileSkeleton key={i} />
          ))}
        </div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-12 xl:gap-4">
          {[8, 4, 4, 4, 4].map((span, i) => (
            <div key={i} className={cn(limsPanelClass, i === 0 ? 'md:col-span-2' : '', XL_SPAN[span])}>
              <div className="border-b border-[rgb(var(--lims-paper-border))] px-4 py-3">
                <div className="h-4 w-40 animate-pulse bg-muted" />
              </div>
              {i < 2 ? <ChartSkeleton height={240} /> : <ListSkeleton />}
            </div>
          ))}
        </div>
      </div>
    )
  }

  if (query.isError || !data || allSectionsFailed(data)) {
    const message = query.error
      ? query.error instanceof Error
        ? query.error.message
        : String(query.error)
      : 'Every Dashboard Section Failed to Load. Check the Connection and Try Again.'
    return (
      <div className={cn(limsPageShellClass, 'dash-root')}>
        {header}
        <div className={limsPanelClass}>
          <SectionError message={message} onRetry={retry} height={260} />
        </div>
      </div>
    )
  }

  return (
    <DashFitContext.Provider value={fit}>
      <DashWideContext.Provider value={fit && pageBox.width >= WIDE_PX}>
      <div
        ref={pageBox.ref}
        className={cn(
          limsPageShellClass,
          'dash-root',
          fit && 'dash-fit flex h-full flex-col gap-2 space-y-0 overflow-hidden sm:space-y-0 lg:space-y-0 xl:p-2.5',
        )}
      >
        {header}
        <DashboardBody data={data} href={href} go={go} retry={retry} />
      </div>
      </DashWideContext.Provider>
    </DashFitContext.Provider>
  )
}

function HeaderStats({ data, href }: { data: DashboardData; href: (k: PathKey) => string | null }) {
  const stats: Array<{ label: string; value: number; to: string | null }> = []
  if (data.clientsCount?.data != null) stats.push({ label: 'Clients', value: data.clientsCount.data, to: href('clients') })
  if (data.licences?.data) stats.push({ label: 'Licences', value: data.licences.data.total, to: href('licences') })
  if (data.isCodesCount?.data != null) stats.push({ label: 'IS Codes', value: data.isCodesCount.data, to: href('isCodes') })
  if (!stats.length) return null
  return (
    <ul className="flex min-w-0 flex-wrap items-center gap-2" aria-label="Totals">
      {stats.map((s) => {
        const inner = (
          <>
            <span className="font-jakarta text-sm font-bold tabular-nums text-white">{formatCount(s.value)}</span>
            <span className="text-[11px] uppercase tracking-wide text-white/70">{s.label}</span>
          </>
        )
        return (
          <li key={s.label}>
            {s.to ? (
              <NavLink
                to={s.to}
                className="inline-flex h-10 min-h-10 items-center gap-1.5 border border-stone-600 bg-stone-900/60 px-3 hover:border-amber-500/60"
              >
                {inner}
              </NavLink>
            ) : (
              <span className="inline-flex h-10 items-center gap-1.5 border border-stone-600 bg-stone-900/60 px-3">{inner}</span>
            )}
          </li>
        )
      })}
    </ul>
  )
}

function DashboardBody({
  data,
  href,
  go,
  retry,
}: {
  data: DashboardData
  href: (k: PathKey, search?: string) => string | null
  go: (to: string | null) => void
  retry: () => void
}) {
  const fit = useContext(DashFitContext)
  const wide = useContext(DashWideContext)
  const lic = data.licences
  const apps = data.applications
  const fin = data.finance
  const nc = data.nonConformity
  const renewalsHref = href('renewals') ?? href('licences')

  // ---------------------------------------------------------------- KPI tiles
  const kpis: KpiTileProps[] = []
  if (lic) {
    const s = lic.data?.status
    const granted = lic.data?.granted ?? []
    kpis.push(
      {
        label: 'Active Licences',
        value: s ? formatCount(s.operative + s.renewal) : '—',
        icon: BadgeCheck,
        tone: 'good',
        href: href('licences'),
        spark: granted.map((g) => g.count),
      },
      {
        label: 'Due Soon (≤ 90 Days)',
        value: s ? formatCount(s.renewal) : '—',
        icon: CalendarClock,
        tone: 'warning',
        href: renewalsHref,
        spark: lic.data?.pipeline.map((p) => p.count),
      },
      {
        label: 'Deferred (Late Fee)',
        value: s ? formatCount(s.deferred) : '—',
        icon: Hourglass,
        tone: 'serious',
        href: renewalsHref,
      },
      {
        label: 'Expired',
        value: s ? formatCount(s.expired) : '—',
        icon: CalendarX2,
        tone: 'critical',
        href: href('expired') ?? href('licences'),
      },
    )
  }
  if (apps) {
    kpis.push({
      label: 'Applications In Progress',
      value: apps.data ? formatCount(apps.data.inProgress) : '—',
      icon: FilePlus2,
      href: href('applications'),
      spark: apps.data && apps.data.filed.some((f) => f.count) ? apps.data.filed.map((f) => f.count) : undefined,
    })
  }
  if (data.inclusionsInProgress) {
    const n = data.inclusionsInProgress.data
    kpis.push({
      label: 'Inclusions In Progress',
      value: n != null ? formatCount(n) : '—',
      icon: Layers,
      href: href('inclusions'),
    })
  }
  if (nc) {
    const d = nc.data
    kpis.push({
      label: 'Open Non-Conformity',
      value: d ? formatCount(d.total) : '—',
      icon: d && d.overdue ? AlertTriangle : Ban,
      tone: !d ? 'neutral' : d.total > 0 ? 'critical' : 'good',
      href: href('nonConformity'),
    })
  }
  if (fin) {
    const f = fin.data
    if (!f || f.hasReceipts) {
      kpis.push({
        label: 'Receipts This Month',
        value: f ? formatInrCompact(f.receiptsThisMonth) : '—',
        icon: Wallet,
        href: href('receipts'),
        spark: f?.months.map((m) => m.receipts),
        ariaLabel: f ? `Receipts this month: ${formatInr(f.receiptsThisMonth)}. Open payment receipts` : undefined,
      })
    } else if (f.hasQuotations) {
      kpis.push({
        label: 'Quotations (12 Months)',
        value: formatInrCompact(f.quotations12m),
        icon: Wallet,
        href: href('quotations'),
        spark: f.months.map((m) => m.quotations),
        ariaLabel: `Quotations in the last 12 months: ${formatInr(f.quotations12m)}. Open quotations`,
      })
    }
  }

  // ---------------------------------------------------------------- Lists
  const dueItems: ListItem[] = (data.dueSoon?.data?.rows ?? []).map((row) => {
    const days = daysBetween(data.today, row.validity)
    return {
      id: row.id,
      href: href('renewals', `?edit=${encodeURIComponent(row.id)}`) ?? href('licences', `?edit=${encodeURIComponent(row.id)}`),
      primary: row.client,
      secondary: `${row.cmL} · ${row.isCode}`,
      badge: <Badge tone={days <= 7 ? 'critical' : days <= 15 ? 'serious' : 'warning'}>{daysLeftLabel(days)}</Badge>,
      meta: formatDisplayDate(row.validity),
    }
  })
  const recentItems: ListItem[] = (data.recentApplications?.data ?? []).map((row) => ({
    id: row.id,
    href: href('applications', `?edit=${encodeURIComponent(row.id)}`),
    primary: row.client !== '—' ? row.client : row.title || 'Application',
    secondary: row.isCode,
    badge: <Badge tone="neutral">{row.stage}</Badge>,
    meta: relativeTimeLabel(row.updatedAt),
  }))
  const ncItems: ListItem[] = (nc?.data?.rows ?? []).map((row) => {
    const overdue = row.deadline ? daysBetween(data.today, row.deadline) < 0 : false
    return {
      id: row.id,
      href: href('nonConformity', `?edit=${encodeURIComponent(row.id)}`),
      primary: row.client,
      secondary: `${noticeLabel(row.caseType)} · ${row.cmL}`,
      badge: <Badge tone={overdue ? 'critical' : 'serious'}>{ncStatusLabel(row.status)}</Badge>,
      meta: row.deadline ? `${overdue ? 'Overdue' : 'Reply By'} ${formatDisplayDate(row.deadline)}` : row.stopDate ? `Since ${formatDisplayDate(row.stopDate)}` : undefined,
    }
  })

  const listCards: ReactNode[] = []
  if (data.dueSoon) {
    const total = data.dueSoon.data?.total ?? 0
    listCards.push(
      <DashCard key="due">
        <CardHeader title="Due in Next 30 Days" href={renewalsHref} linkLabel="Renewals" />
        <ListBody
          section={data.dueSoon}
          items={dueItems}
          onRetry={retry}
          emptyTitle="Nothing Due in 30 Days"
          emptyHint="No QE-Managed Licence Reaches Its Validity Date in the Next 30 Days."
          footer={total > dueItems.length ? `Showing ${dueItems.length} of ${formatCount(total)}` : null}
        />
      </DashCard>,
    )
  }
  if (data.recentApplications) {
    listCards.push(
      <DashCard key="recent">
        <CardHeader title="Recently Edited Applications" href={href('applications')} />
        <ListBody
          section={data.recentApplications}
          items={recentItems}
          onRetry={retry}
          emptyTitle="No Applications Yet"
          emptyHint="New BIS Applications Appear Here as They Are Edited."
        />
      </DashCard>,
    )
  }
  if (nc) {
    const total = nc.data?.total ?? 0
    listCards.push(
      <DashCard key="nc">
        <CardHeader title="Open Non-Conformity / Stop Marking" href={href('nonConformity')} />
        <ListBody
          section={nc}
          items={ncItems}
          onRetry={retry}
          emptyTitle="No Open Notices"
          emptyHint="Every BIS Notice to Licensees Is Closed."
          footer={total > ncItems.length ? `Showing ${ncItems.length} of ${formatCount(total)}` : null}
        />
      </DashCard>,
    )
  }
  const listSpan = XL_SPAN[listCards.length === 1 ? 12 : listCards.length === 2 ? 6 : 4]

  // ---------------------------------------------------------------- Charts
  const statusHref = (key: StatusKey) =>
    key === 'expired'
      ? href('expired') ?? href('licences')
      : key === 'renewal' || key === 'deferred'
        ? renewalsHref
        : href('licences')

  const licData = lic?.data
  const pipelineTotal = licData?.pipeline.reduce((a, p) => a + p.count, 0) ?? 0
  const statusTotal = licData ? Object.values(licData.status).reduce((a, b) => a + b, 0) : 0
  const filedAny = Boolean(apps?.data?.filed.some((f) => f.count > 0))
  const trendRows = licData
    ? licData.granted.map((g, i) => ({
        key: g.key,
        label: g.label,
        granted: g.count,
        filed: apps?.data?.filed[i]?.count ?? 0,
      }))
    : []
  const grantedTotal = trendRows.reduce((a, r) => a + r.granted, 0)
  const financeSeries = fin?.data
    ? ([
        fin.data.hasQuotations ? 'quotations' : null,
        fin.data.hasInvoices ? 'invoices' : null,
        fin.data.hasReceipts ? 'receipts' : null,
      ].filter(Boolean) as Array<'quotations' | 'invoices' | 'receipts'>)
    : []
  const financeHasValues = Boolean(
    fin?.data?.months.some((m) => m.quotations || m.invoices || m.receipts),
  )
  const showFinance = Boolean(fin && (fin.error || financeHasValues))

  const stageRows = apps?.data?.byStage ?? []
  const isRows = licData?.topIsCodes ?? []

  return (
    <>
      {kpis.length ? (
        <section
          aria-label="Key Figures"
          className={cn('grid grid-cols-1 gap-3 min-[480px]:grid-cols-2 lg:grid-cols-4', fit && 'shrink-0 xl:gap-2', wide && 'xl:grid-cols-8')}
        >
          {kpis.map((k) => (
            <KpiTile key={k.label} {...k} compact={fit} />
          ))}
        </section>
      ) : null}

      {!kpis.length && !listCards.length && !fin ? (
        <div className={limsPanelClass}>
          <EmptyState
            title="No Dashboard Sections Available"
            hint="Your Module Access Does Not Include BIS, Finance or Master Modules. Ask an Admin to Grant Access in Settings → Module Access."
            height={220}
          />
        </div>
      ) : null}

      <div
        className={cn(
          'grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-12 xl:gap-4',
          // Three rows sharing the height; each card fills its cell.
          fit && 'min-h-0 flex-1 xl:grid-rows-3 xl:gap-2 [&>*]:min-h-0',
        )}
      >
        {lic ? (
          <>
            <DashCard className={cn('md:col-span-2', fit ? (wide ? 'xl:col-span-5' : 'xl:col-span-4') : XL_SPAN[8])}>
              <CardHeader
                title="Renewal Pipeline — Next 12 Months"
                href={renewalsHref}
                linkLabel="Renewals"
              />
              <ChartBody
                section={lic}
                height={300}
                onRetry={retry}
                empty={licData && pipelineTotal === 0 ? { title: 'No Renewals in the Next 12 Months' } : null}
                chart={licData ? { kind: 'pipeline', data: licData.pipeline, height: 300, onSelect: renewalsHref ? () => go(renewalsHref) : undefined } : null}
                table={licData ? {
                  caption: `Renewals due per month for the next 12 months, ${pipelineTotal} in total`,
                  columns: ['Month', 'Renewals Due'],
                  rows: licData.pipeline.map((p) => [p.label, p.count]),
                } : null}
              />
            </DashCard>

            <DashCard className={cn('md:col-span-1', fit ? (wide ? 'xl:col-span-3' : 'xl:col-span-4') : XL_SPAN[4])}>
              <CardHeader title="Licence Status" href={href('licences')} />
              {/* Fit to screen: the legend sits beside the donut, so the donut keeps its size in a short card. */}
              <div className={cn(fit && 'flex min-h-0 flex-1 items-stretch')}>
              <ChartBody
                section={lic}
                height={200}
                onRetry={retry}
                empty={licData && statusTotal === 0 ? { title: 'No Licences Yet' } : null}
                chart={licData ? { kind: 'status', counts: licData.status, height: 200, onSelect: (k) => go(statusHref(k)) } : null}
                table={licData ? {
                  caption: `Licence status of ${statusTotal} licences`,
                  columns: ['Status', 'Licences'],
                  rows: STATUS_META.map((m) => [m.label, licData.status[m.key]]),
                } : null}
              />
              {licData && statusTotal > 0 ? (
                <ul
                  className={cn(
                    'grid grid-cols-1 gap-x-3 border-t border-[rgb(var(--lims-paper-border))] px-3 min-[420px]:grid-cols-2 md:grid-cols-1 xl:grid-cols-2',
                    fit ? 'w-44 shrink-0 self-center border-l border-t-0 !grid-cols-1 py-1' : 'py-2',
                  )}
                >
                  {STATUS_META.map((m) => {
                    const n = licData.status[m.key]
                    const pct = statusTotal ? Math.round((n / statusTotal) * 100) : 0
                    const to = statusHref(m.key)
                    const inner = (
                      <>
                        <span aria-hidden="true" className="h-3 w-3 shrink-0" style={{ background: m.color }} />
                        <span className="min-w-0 flex-1 truncate text-xs text-foreground" title={m.hint}>{m.label}</span>
                        <span className="text-xs font-semibold tabular-nums text-foreground">{formatCount(n)}</span>
                        <span className="w-9 text-right text-[11px] tabular-nums text-muted-foreground">{pct}%</span>
                      </>
                    )
                    return (
                      <li key={m.key}>
                        {to ? (
                          <NavLink to={to} className={cn('flex items-center gap-2 px-1 hover:bg-amber-500/10', fit ? 'min-h-7' : 'min-h-9')} aria-label={`${m.label}: ${n} licences (${pct}%). ${m.hint}`}>
                            {inner}
                          </NavLink>
                        ) : (
                          <div className={cn('flex items-center gap-2 px-1', fit ? 'min-h-7' : 'min-h-9')}>{inner}</div>
                        )}
                      </li>
                    )
                  })}
                </ul>
              ) : null}
              </div>
            </DashCard>
          </>
        ) : null}

        {listCards.map((card, i) => (
          <div
            key={i}
            className={cn(
              'flex min-w-0 [&>section]:min-h-0 [&>section]:flex-1',
              fit ? 'xl:col-span-4' : listSpan,
              // Tablet: 2 columns; the last card spans both when the donut + lists leave it alone.
              i === listCards.length - 1 && ((lic ? 1 : 0) + listCards.length) % 2 === 1 && 'md:col-span-2',
            )}
          >
            {card}
          </div>
        ))}

        {apps ? (
          <DashCard className={cn('md:col-span-1', fit ? 'xl:col-span-4' : XL_SPAN[lic ? 6 : 12])}>
            <CardHeader title="Applications by Stage" href={href('applications')} />
            <RankBody
              section={apps}
              rows={stageRows.map((r) => ({ id: r.stage, label: r.stage, count: r.count }))}
              onRetry={retry}
              empty="No Open Applications"
              hrefFor={() => href('applications')}
              unit="applications"
              table={{
                caption: 'Open applications by stage',
                columns: ['Stage', 'Applications'],
                rows: stageRows.map((r) => [r.stage, r.count]),
              }}
            />
          </DashCard>
        ) : null}

        {lic ? (
          <DashCard className={cn('md:col-span-1', fit ? 'xl:col-span-4' : XL_SPAN[apps ? 6 : 12])}>
            <CardHeader title="Top 10 IS Codes" href={href('licences')} linkLabel="Licences" />
            <RankBody
              section={lic}
              rows={isRows}
              onRetry={retry}
              empty="No IS Codes Linked Yet"
              numbered
              hrefFor={() => href('licences')}
              unit="licences"
              table={{
                caption: 'Top 10 IS codes by number of licences',
                columns: ['IS Code', 'Licences'],
                rows: isRows.map((r) => [r.label, r.count]),
              }}
            />
          </DashCard>
        ) : null}

        {lic ? (
          <DashCard className={cn('md:col-span-2', fit ? (showFinance ? 'xl:col-span-4' : 'xl:col-span-8') : XL_SPAN[showFinance ? 6 : 12])}>
            <CardHeader
              title={filedAny ? 'Licences Granted & Applications Filed' : 'Licences Granted per Month'}
              href={href('licences')}
            />
            <ChartBody
              section={lic}
              height={250}
              onRetry={retry}
              empty={licData && grantedTotal === 0 && !filedAny ? { title: 'No Grants in the Last 12 Months' } : null}
              chart={licData ? {
                kind: 'trend',
                data: trendRows,
                showFiled: filedAny,
                height: 250,
                onSelect: href('licences') ? () => go(href('licences')) : undefined,
              } : null}
              table={licData ? {
                caption: 'Licences granted per month over the last 12 months',
                columns: filedAny ? ['Month', 'Licences Granted', 'Applications Filed'] : ['Month', 'Licences Granted'],
                rows: trendRows.map((r) => (filedAny ? [r.label, r.granted, r.filed] : [r.label, r.granted])),
              } : null}
            />
          </DashCard>
        ) : null}

        {fin && showFinance ? (
          <DashCard className={cn('md:col-span-2', fit ? 'xl:col-span-4' : XL_SPAN[lic ? 6 : 12])}>
            <CardHeader
              title="Finance — Last 12 Months"
              href={href('quotations') ?? href('invoices') ?? href('receipts')}
            />
            <ChartBody
              section={fin}
              height={250}
              onRetry={retry}
              chart={fin.data ? {
                kind: 'finance',
                data: fin.data.months,
                series: financeSeries,
                height: 250,
                onSelect: (s) => go(href(s)),
              } : null}
              table={fin.data ? {
                caption: 'Quotation, invoice and receipt value per month (₹)',
                columns: ['Month', ...financeSeries.map((s) => s[0].toUpperCase() + s.slice(1))],
                rows: fin.data.months.map((m) => [m.label, ...financeSeries.map((s) => formatInr(m[s]))]),
              } : null}
            />
          </DashCard>
        ) : null}
      </div>

      {licData?.truncated ? (
        <p className="text-xs text-muted-foreground">
          Charts Use the First {formatCount(10_000)} Licences; Totals Are Exact.
        </p>
      ) : null}
    </>
  )
}
