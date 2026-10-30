import type { ElementType, ReactNode } from 'react'
import { AlertTriangle, ArrowRight, Inbox, RefreshCw } from 'lucide-react'
import { NavLink } from 'react-router-dom'
import { Skeleton } from '@/components/ui/skeleton'
import { limsPanelClass } from '@/lib/limsThemeUi'
import { cn } from '@/lib/utils'

export type Tone = 'neutral' | 'good' | 'warning' | 'serious' | 'critical'

const TONE_BAR: Record<Tone, string> = {
  neutral: 'bg-[var(--dash-accent)]',
  good: 'bg-[var(--dash-good)]',
  warning: 'bg-[var(--dash-warning)]',
  serious: 'bg-[var(--dash-serious)]',
  critical: 'bg-[var(--dash-critical)]',
}

const TONE_ICON: Record<Tone, string> = {
  neutral: 'text-amber-300',
  good: 'text-[var(--dash-good)]',
  warning: 'text-[var(--dash-warning)]',
  serious: 'text-[var(--dash-serious)]',
  critical: 'text-[#f87171]',
}

/** Tiny trend line (pure SVG, no chart library) — decorative; the tile text carries the value. */
export function Sparkline({ values, className }: { values: number[]; className?: string }) {
  if (values.length < 2 || values.every((v) => v === 0)) return null
  const w = 84
  const h = 28
  const max = Math.max(...values, 1)
  const step = w / (values.length - 1)
  const points = values.map((v, i) => [i * step, h - 2 - (v / max) * (h - 4)] as const)
  const line = points.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ')
  const area = `0,${h} ${line} ${w},${h}`
  const [lx, ly] = points[points.length - 1]
  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      width={w}
      height={h}
      className={cn('shrink-0 overflow-visible', className)}
      aria-hidden="true"
      focusable="false"
    >
      <polygon points={area} fill="var(--dash-accent-soft)" />
      <polyline
        points={line}
        fill="none"
        stroke="var(--dash-accent)"
        strokeWidth={2}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <circle cx={lx} cy={ly} r={2.5} fill="var(--dash-accent)" />
    </svg>
  )
}

export type KpiTileProps = {
  label: string
  value: string
  detail?: ReactNode
  icon: ElementType
  tone?: Tone
  href?: string | null
  spark?: number[]
  ariaLabel?: string
}

export function KpiTile({ label, value, detail, icon: Icon, tone = 'neutral', href, spark, ariaLabel }: KpiTileProps) {
  const body = (
    <>
      <span aria-hidden="true" className={cn('absolute inset-y-0 left-0 w-1', TONE_BAR[tone])} />
      <div className="flex min-w-0 items-start justify-between gap-2">
        <p className="min-w-0 text-[11px] font-semibold uppercase leading-tight tracking-wide text-muted-foreground">
          {label}
        </p>
        <span
          aria-hidden="true"
          className={cn('shrink-0 border border-stone-700 bg-stone-900 p-1.5', TONE_ICON[tone])}
        >
          <Icon className="h-4 w-4" />
        </span>
      </div>
      <div className="mt-1 flex min-w-0 items-end justify-between gap-2">
        <p className="min-w-0 truncate font-jakarta text-2xl font-bold tabular-nums text-foreground sm:text-[1.7rem]">
          {value}
        </p>
        {spark ? <Sparkline values={spark} className="mb-1" /> : null}
      </div>
      {detail ? <p className="mt-0.5 min-w-0 truncate text-xs text-muted-foreground">{detail}</p> : null}
    </>
  )
  const cls = cn(
    limsPanelClass,
    'relative block min-h-[7.25rem] py-3 pl-4 pr-3 transition',
    href && 'hover:border-amber-600/60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-600',
  )
  if (href) {
    return (
      <NavLink to={href} className={cls} aria-label={ariaLabel ?? `${label}: ${value}. Open list`}>
        {body}
      </NavLink>
    )
  }
  return (
    <div className={cls} aria-label={ariaLabel}>
      {body}
    </div>
  )
}

export function KpiTileSkeleton() {
  return (
    <div className={cn(limsPanelClass, 'min-h-[7.25rem] space-y-3 p-3 pl-4')} aria-hidden="true">
      <Skeleton className="h-3 w-24" />
      <Skeleton className="h-7 w-20" />
      <Skeleton className="h-3 w-32" />
    </div>
  )
}

export type SrTable = {
  caption: string
  columns: string[]
  rows: Array<Array<string | number>>
}

/** Screen-reader copy of a chart's data (a 1px clipped box: tables ignore `width` on themselves). */
export function SrDataTable({ table }: { table: SrTable }) {
  return (
    <div className="sr-only">
      <table>
        <caption>{table.caption}</caption>
        <thead>
          <tr>
            {table.columns.map((c) => (
              <th key={c} scope="col">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {table.rows.map((row, i) => (
            <tr key={i}>
              {row.map((cell, j) => (
                <td key={j}>{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function CardHeader({
  title,
  subtitle,
  href,
  linkLabel = 'Open',
  right,
}: {
  title: string
  subtitle?: ReactNode
  href?: string | null
  linkLabel?: string
  right?: ReactNode
}) {
  return (
    <div className="flex min-w-0 flex-wrap items-start justify-between gap-x-3 gap-y-1 border-b border-[rgb(var(--lims-paper-border))] px-4 py-3">
      <div className="min-w-0">
        <h2 className="font-jakarta text-sm font-bold text-foreground sm:text-base">{title}</h2>
        {subtitle ? <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p> : null}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {right}
        {href ? (
          <NavLink
            to={href}
            className="inline-flex min-h-8 items-center gap-1 text-xs font-semibold text-amber-700 hover:text-amber-800 hover:underline"
            aria-label={`${linkLabel}: ${title}`}
          >
            {linkLabel} <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
          </NavLink>
        ) : null}
      </div>
    </div>
  )
}

export function DashCard({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <section className={cn(limsPanelClass, 'flex min-w-0 flex-col', className)}>
      {children}
    </section>
  )
}

export function ChartSkeleton({ height }: { height: number }) {
  return (
    <div className="flex items-end gap-2 px-4 pb-4 pt-6" style={{ height }} aria-hidden="true">
      {[45, 70, 55, 85, 40, 65, 75, 50, 60, 35].map((h, i) => (
        <Skeleton key={i} className="flex-1" style={{ height: `${h}%` }} />
      ))}
    </div>
  )
}

export function EmptyState({ title, hint, height }: { title: string; hint?: string; height?: number }) {
  return (
    <div
      className="flex flex-col items-center justify-center gap-1 px-4 py-8 text-center"
      style={height ? { minHeight: height } : undefined}
    >
      <Inbox className="h-6 w-6 text-muted-foreground" aria-hidden="true" />
      <p className="text-sm font-semibold text-foreground">{title}</p>
      {hint ? <p className="max-w-xs text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  )
}

export function SectionError({ message, onRetry, height }: { message: string; onRetry?: () => void; height?: number }) {
  return (
    <div
      role="alert"
      className="flex flex-col items-center justify-center gap-2 px-4 py-8 text-center"
      style={height ? { minHeight: height } : undefined}
    >
      <AlertTriangle className="h-6 w-6 text-[var(--dash-critical)]" aria-hidden="true" />
      <p className="text-sm font-semibold text-foreground">Could Not Load This Section</p>
      <p className="max-w-sm break-words text-xs text-muted-foreground">{message}</p>
      {onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          className="mt-1 inline-flex h-10 min-h-10 items-center gap-1.5 border border-stone-500 bg-stone-50 px-3 text-xs font-semibold text-foreground hover:bg-stone-100"
        >
          <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" /> Retry
        </button>
      ) : null}
    </div>
  )
}

export function ListSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="divide-y divide-[rgb(var(--lims-paper-border))]" aria-hidden="true">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center justify-between gap-3 px-4 py-3">
          <div className="min-w-0 flex-1 space-y-1.5">
            <Skeleton className="h-3.5 w-3/4" />
            <Skeleton className="h-3 w-1/2" />
          </div>
          <Skeleton className="h-5 w-14" />
        </div>
      ))}
    </div>
  )
}
