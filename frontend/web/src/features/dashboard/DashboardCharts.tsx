/**
 * Recharts-based dashboard charts. Loaded lazily from DashboardPage so the chart library
 * stays out of the main bundle.
 */
import { useMemo, useSyncExternalStore, type ReactNode } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import {
  STATUS_META,
  type FinanceMonth,
  type IsCodeCount,
  type LicenceStatusCounts,
  type MonthCount,
  type StageCount,
  type StatusKey,
} from './dashboardData'
import { formatCount, formatInr, formatInrCompact, monthLongLabel } from './dashboardFormat'

export type DashboardChartProps =
  | { kind: 'pipeline'; data: MonthCount[]; onSelect?: (key: string) => void; height: number }
  | {
      kind: 'status'
      counts: LicenceStatusCounts
      onSelect?: (key: StatusKey) => void
      height: number
    }
  | {
      kind: 'trend'
      data: Array<{ key: string; label: string; granted: number; filed?: number }>
      showFiled: boolean
      onSelect?: (key: string) => void
      height: number
    }
  | { kind: 'stages'; data: StageCount[]; onSelect?: (stage: string) => void; height: number }
  | { kind: 'isCodes'; data: IsCodeCount[]; onSelect?: (id: string) => void; height: number }
  | {
      kind: 'finance'
      data: FinanceMonth[]
      series: Array<'quotations' | 'invoices' | 'receipts'>
      onSelect?: (series: 'quotations' | 'invoices' | 'receipts') => void
      height: number
    }

const AXIS_TICK = { fill: 'var(--dash-axis)', fontSize: 11 }
const GRID_PROPS = { stroke: 'var(--dash-grid)', strokeDasharray: '3 3', vertical: false } as const

function subscribeReducedMotion(cb: () => void) {
  const mq = window.matchMedia?.('(prefers-reduced-motion: reduce)')
  mq?.addEventListener?.('change', cb)
  return () => mq?.removeEventListener?.('change', cb)
}

function useReducedMotion(): boolean {
  return useSyncExternalStore(
    subscribeReducedMotion,
    () => Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches),
    () => false,
  )
}

type TipItem = { name?: unknown; value?: unknown; color?: string; dataKey?: unknown; payload?: unknown }

function TooltipBox({
  title,
  items,
  format,
}: {
  title: ReactNode
  items: ReadonlyArray<TipItem>
  format: (value: number) => string
}) {
  if (!items.length) return null
  return (
    <div className="min-w-[9rem] border border-stone-500 bg-card px-3 py-2 text-xs text-foreground shadow-lg">
      <p className="mb-1 font-semibold">{title}</p>
      <ul className="space-y-0.5">
        {items.map((item, i) => (
          <li key={i} className="flex items-center justify-between gap-3">
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <span aria-hidden="true" className="inline-block h-2 w-2" style={{ background: item.color }} />
              {String(item.name ?? '')}
            </span>
            <span className="font-semibold tabular-nums">{format(Number(item.value ?? 0))}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

function monthKeyFromPayload(payload: unknown): string {
  return payload && typeof payload === 'object' && 'key' in payload ? String((payload as { key: unknown }).key) : ''
}

/** Legend text stays in the text colour; the swatch beside it carries the series colour. */
function legendText(value: unknown) {
  return <span style={{ color: 'hsl(var(--foreground))' }}>{String(value ?? '')}</span>
}

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text
}

function CategoryTick({ x, y, payload, max }: { x?: number; y?: number; payload?: { value?: unknown }; max: number }) {
  const full = String(payload?.value ?? '')
  return (
    <text x={x} y={y} dy={4} textAnchor="end" fill="var(--dash-axis)" fontSize={11}>
      <title>{full}</title>
      {truncate(full, max)}
    </text>
  )
}

export default function DashboardChart(props: DashboardChartProps) {
  const reduced = useReducedMotion()
  const animate = !reduced
  const clickable = Boolean(props.onSelect)
  const cursor = clickable ? 'pointer' : undefined

  if (props.kind === 'pipeline') {
    const { data, onSelect, height } = props
    return (
      <ResponsiveContainer width="100%" height={height}>
        <BarChart data={data} margin={{ top: 12, right: 12, bottom: 0, left: -12 }}>
          <CartesianGrid {...GRID_PROPS} />
          <XAxis dataKey="label" tick={AXIS_TICK} tickLine={false} axisLine={{ stroke: 'var(--dash-grid)' }} interval="preserveStartEnd" minTickGap={4} />
          <YAxis allowDecimals={false} tick={AXIS_TICK} tickLine={false} axisLine={false} width={44} />
          <Tooltip
            cursor={{ fill: 'var(--dash-accent-soft)' }}
            content={({ active, payload }) =>
              active && payload?.length ? (
                <TooltipBox
                  title={monthLongLabel(monthKeyFromPayload(payload[0]?.payload))}
                  items={payload.map((p) => ({ ...p, name: 'Renewals Due', color: 'var(--dash-accent)' }))}
                  format={formatCount}
                />
              ) : null
            }
          />
          <Bar
            dataKey="count"
            name="Renewals Due"
            fill="var(--dash-accent)"
            radius={[4, 4, 0, 0]}
            maxBarSize={40}
            isAnimationActive={animate}
            cursor={cursor}
            onClick={(entry) => onSelect?.(monthKeyFromPayload((entry as { payload?: unknown }).payload))}
          />
        </BarChart>
      </ResponsiveContainer>
    )
  }

  if (props.kind === 'status') {
    return <StatusDonut {...props} animate={animate} />
  }

  if (props.kind === 'trend') {
    const { data, showFiled, onSelect, height } = props
    return (
      <ResponsiveContainer width="100%" height={height}>
        <LineChart
          data={data}
          margin={{ top: 12, right: 16, bottom: 0, left: -12 }}
          onClick={(state) => {
            const idx = Number((state as { activeTooltipIndex?: unknown } | null)?.activeTooltipIndex)
            if (Number.isInteger(idx) && data[idx]) onSelect?.(data[idx].key)
          }}
          style={clickable ? { cursor: 'pointer' } : undefined}
        >
          <CartesianGrid {...GRID_PROPS} />
          <XAxis dataKey="label" tick={AXIS_TICK} tickLine={false} axisLine={{ stroke: 'var(--dash-grid)' }} interval="preserveStartEnd" minTickGap={4} />
          <YAxis allowDecimals={false} tick={AXIS_TICK} tickLine={false} axisLine={false} width={44} />
          <Tooltip
            cursor={{ stroke: 'var(--dash-axis)', strokeDasharray: '3 3' }}
            content={({ active, payload }) =>
              active && payload?.length ? (
                <TooltipBox
                  title={monthLongLabel(monthKeyFromPayload(payload[0]?.payload))}
                  items={payload}
                  format={formatCount}
                />
              ) : null
            }
          />
          {showFiled ? <Legend itemSorter={null} formatter={legendText} verticalAlign="top" align="right" height={28} iconType="plainline" wrapperStyle={{ fontSize: 12 }} /> : null}
          <Line
            type="linear"
            dataKey="granted"
            name="Licences Granted"
            stroke="var(--dash-series-1)"
            strokeWidth={2}
            dot={{ r: 3, strokeWidth: 2, fill: 'var(--dash-surface)' }}
            activeDot={{ r: 5, stroke: 'var(--dash-surface)', strokeWidth: 2 }}
            isAnimationActive={animate}
          />
          {showFiled ? (
            <Line
              type="linear"
              dataKey="filed"
              name="Applications Filed"
              stroke="var(--dash-series-2)"
              strokeWidth={2}
              strokeDasharray="6 3"
              dot={{ r: 3, strokeWidth: 2, fill: 'var(--dash-surface)' }}
              activeDot={{ r: 5, stroke: 'var(--dash-surface)', strokeWidth: 2 }}
              isAnimationActive={animate}
            />
          ) : null}
        </LineChart>
      </ResponsiveContainer>
    )
  }

  if (props.kind === 'stages' || props.kind === 'isCodes') {
    const rows =
      props.kind === 'stages'
        ? props.data.map((d) => ({ id: d.stage, label: d.stage, count: d.count }))
        : props.data.map((d) => ({ id: d.id, label: d.label, count: d.count }))
    const seriesName = props.kind === 'stages' ? 'Applications' : 'Licences'
    const onSelect = props.onSelect as ((id: string) => void) | undefined
    return (
      <ResponsiveContainer width="100%" height={props.height}>
        <BarChart data={rows} layout="vertical" margin={{ top: 4, right: 36, bottom: 4, left: 4 }} barCategoryGap={6}>
          <CartesianGrid stroke="var(--dash-grid)" strokeDasharray="3 3" horizontal={false} />
          <XAxis type="number" allowDecimals={false} tick={AXIS_TICK} tickLine={false} axisLine={false} />
          <YAxis
            type="category"
            dataKey="label"
            width={128}
            tickLine={false}
            axisLine={{ stroke: 'var(--dash-grid)' }}
            interval={0}
            tick={<CategoryTick max={19} />}
          />
          <Tooltip
            cursor={{ fill: 'var(--dash-accent-soft)' }}
            content={({ active, payload }) =>
              active && payload?.length ? (
                <TooltipBox
                  title={String((payload[0]?.payload as { label?: unknown } | undefined)?.label ?? '')}
                  items={payload.map((p) => ({ ...p, name: seriesName, color: 'var(--dash-accent)' }))}
                  format={formatCount}
                />
              ) : null
            }
          />
          <Bar
            dataKey="count"
            name={seriesName}
            fill="var(--dash-accent)"
            radius={[0, 4, 4, 0]}
            maxBarSize={22}
            isAnimationActive={animate}
            cursor={cursor}
            label={{ position: 'right', fill: 'var(--dash-axis)', fontSize: 11 }}
            onClick={(entry) => {
              const id = (entry as { payload?: { id?: unknown } }).payload?.id
              if (id != null) onSelect?.(String(id))
            }}
          />
        </BarChart>
      </ResponsiveContainer>
    )
  }

  // finance
  const { data, series, onSelect, height } = props
  const SERIES = {
    quotations: { name: 'Quotations', color: 'var(--dash-series-1)' },
    invoices: { name: 'Invoices', color: 'var(--dash-series-2)' },
    receipts: { name: 'Receipts', color: 'var(--dash-series-3)' },
  } as const
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 4, right: 12, bottom: 0, left: 4 }} barGap={2}>
        <CartesianGrid {...GRID_PROPS} />
        <XAxis dataKey="label" tick={AXIS_TICK} tickLine={false} axisLine={{ stroke: 'var(--dash-grid)' }} interval="preserveStartEnd" minTickGap={4} />
        <YAxis tick={AXIS_TICK} tickLine={false} axisLine={false} width={56} tickFormatter={(v: number) => formatInrCompact(v)} />
        <Tooltip
          cursor={{ fill: 'var(--dash-accent-soft)' }}
          content={({ active, payload }) =>
            active && payload?.length ? (
              <TooltipBox
                title={monthLongLabel(monthKeyFromPayload(payload[0]?.payload))}
                items={payload}
                format={formatInr}
              />
            ) : null
          }
        />
        {series.length > 1 ? (
          <Legend itemSorter={null} formatter={legendText} verticalAlign="top" align="right" height={28} iconType="square" wrapperStyle={{ fontSize: 12 }} />
        ) : null}
        {series.map((key) => (
          <Bar
            key={key}
            dataKey={key}
            name={SERIES[key].name}
            fill={SERIES[key].color}
            stroke="var(--dash-surface)"
            strokeWidth={1}
            radius={[4, 4, 0, 0]}
            maxBarSize={18}
            isAnimationActive={animate}
            cursor={cursor}
            onClick={() => onSelect?.(key)}
          />
        ))}
      </BarChart>
    </ResponsiveContainer>
  )
}

function StatusDonut({
  counts,
  onSelect,
  height,
  animate,
}: {
  counts: LicenceStatusCounts
  onSelect?: (key: StatusKey) => void
  height: number
  animate: boolean
}) {
  const data = useMemo(
    () => STATUS_META.map((m) => ({ ...m, value: counts[m.key] })).filter((d) => d.value > 0),
    [counts],
  )
  const total = data.reduce((a, d) => a + d.value, 0)
  return (
    <div className="relative" style={{ height }}>
      <ResponsiveContainer width="100%" height={height}>
        <PieChart>
          <Tooltip
            content={({ active, payload }) =>
              active && payload?.length ? (
                <TooltipBox
                  title={String(payload[0]?.name ?? '')}
                  items={payload.map((p) => ({
                    ...p,
                    name: 'Licences',
                    color: (p.payload as { color?: string } | undefined)?.color,
                  }))}
                  format={(v) => `${formatCount(v)} (${total ? Math.round((v / total) * 100) : 0}%)`}
                />
              ) : null
            }
          />
          <Pie
            data={data}
            dataKey="value"
            nameKey="label"
            innerRadius="62%"
            outerRadius="92%"
            startAngle={90}
            endAngle={-270}
            stroke="var(--dash-surface)"
            strokeWidth={2}
            isAnimationActive={animate}
            cursor={onSelect ? 'pointer' : undefined}
            onClick={(entry) => {
              const key = (entry as { payload?: { key?: unknown } }).payload?.key
              if (key) onSelect?.(key as StatusKey)
            }}
          >
            {data.map((d) => (
              <Cell key={d.key} fill={d.color} />
            ))}
          </Pie>
        </PieChart>
      </ResponsiveContainer>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center" aria-hidden="true">
        <span className="font-jakarta text-2xl font-bold tabular-nums text-foreground">{formatCount(total)}</span>
        <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Licences</span>
      </div>
    </div>
  )
}
