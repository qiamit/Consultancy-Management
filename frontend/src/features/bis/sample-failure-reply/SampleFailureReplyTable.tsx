import { Pencil } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { cn } from '@/lib/utils'
import { formatCmL, formatDisplayDate } from '../projects/types'
import {
  SAMPLE_FAILURE_STATUS_STYLES,
  sampleFailureClientName,
  sampleFailureIsCodeLabel,
  sampleFailureStatusLabel,
  sampleFailureTypeLabel,
  type SampleFailureReplyRow,
} from './types'

const GRID_TABLE =
  'min-w-[1040px] w-full border-collapse [&_th]:border [&_td]:border [&_th]:border-border [&_td]:border-border'

const checkboxClass =
  'h-4 w-4 rounded border-muted-foreground/30 text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'

const headClass = 'text-center text-xs'

export function SampleFailureReplyTable({
  rows,
  loading,
  error,
  searchActive,
  selectedIds,
  onToggle,
  onToggleAll,
  onEdit,
  onRetry,
}: {
  rows: SampleFailureReplyRow[]
  loading: boolean
  error: string | null
  searchActive: boolean
  selectedIds: Set<string>
  onToggle: (id: string) => void
  onToggleAll: (checked: boolean) => void
  onEdit: (row: SampleFailureReplyRow) => void
  onRetry?: () => void
}) {
  const allChecked = rows.length > 0 && rows.every((r) => selectedIds.has(r.id))
  const someChecked = rows.some((r) => selectedIds.has(r.id))

  return (
    <div className="overflow-hidden rounded-none border-2 border-stone-500 bg-white shadow-sm ring-1 ring-amber-700/20">
      {error ? (
        <div className="flex flex-wrap items-start justify-between gap-2 px-3 pt-3 sm:px-5 sm:pt-4">
          <p className="min-w-0 flex-1 text-sm text-destructive">{error}</p>
          {onRetry ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 shrink-0 rounded-none border-stone-500"
              onClick={onRetry}
              disabled={loading}
            >
              {loading ? 'Retrying…' : 'Retry'}
            </Button>
          ) : null}
        </div>
      ) : null}

      {loading && rows.length === 0 ? (
        <p className="px-5 py-8 text-center text-sm text-muted-foreground">Loading…</p>
      ) : rows.length === 0 ? (
        <div className="m-3 rounded-lg border border-dashed border-border p-4 text-center sm:m-4 sm:p-6">
          <p className="text-sm text-muted-foreground">
            {searchActive ? 'No sample failure replies match your search.' : 'No sample failure replies found.'}
          </p>
        </div>
      ) : (
        <div className={cn('overflow-x-auto', loading && 'opacity-60 transition-opacity')}>
          <Table className={GRID_TABLE}>
            <TableHeader>
              <TableRow className="bg-stone-800 hover:bg-stone-800">
                <TableHead className="z-10 w-12 bg-stone-800 text-center text-[11px] font-bold uppercase tracking-[0.14em] text-amber-200 sm:w-14">
                  <input
                    type="checkbox"
                    className={checkboxClass}
                    aria-label="Select all on this page"
                    checked={allChecked}
                    ref={(el) => {
                      if (el) el.indeterminate = !allChecked && someChecked
                    }}
                    onChange={(e) => onToggleAll(e.target.checked)}
                  />
                </TableHead>
                <TableHead className="z-10 min-w-[220px] bg-stone-800 text-left text-[11px] font-bold uppercase tracking-[0.14em] text-amber-200 ">
                  Firm Name
                </TableHead>
                <TableHead className={cn(headClass, 'min-w-[160px]')}>IS Code</TableHead>
                <TableHead className={cn(headClass, 'min-w-[130px]')}>CM/L Number</TableHead>
                <TableHead className={cn(headClass, 'min-w-[150px]')}>Failure Type</TableHead>
                <TableHead className={cn(headClass, 'min-w-[150px]')}>Sample Code / QR</TableHead>
                <TableHead className={cn(headClass, 'min-w-[100px]')}>Status</TableHead>
                <TableHead className={cn(headClass, 'min-w-[100px]')}>Created</TableHead>
                <TableHead className={cn(headClass, 'min-w-[80px]')}>Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => {
                const selected = selectedIds.has(r.id)
                const client = sampleFailureClientName(r) || '—'
                const isLabel = sampleFailureIsCodeLabel(r)
                const stickyCellBg = selected
                  ? 'bg-[#fde68a]/80 group-hover:bg-[#fde68a]/80'
                  : 'bg-white group-hover:bg-[#f3e9d8]'
                return (
                  <TableRow key={r.id} data-state={selected ? 'selected' : undefined} className="group">
                    <TableCell
                      className={cn('z-10 text-center align-middle transition-colors', stickyCellBg)}
                    >
                      <input
                        type="checkbox"
                        className={checkboxClass}
                        aria-label={`Select ${client}`}
                        checked={selected}
                        onChange={() => onToggle(r.id)}
                      />
                    </TableCell>
                    <TableCell
                      className={cn('z-10 align-middle transition-colors ', stickyCellBg)}
                    >
                      <p
                        className="min-w-[200px] max-w-[300px] break-words font-medium leading-snug text-foreground"
                        title={client}
                      >
                        {client}
                      </p>
                    </TableCell>
                    <TableCell className="align-middle text-center text-sm">
                      {isLabel ? (
                        <div className="space-y-0.5">
                          <p className="font-medium text-foreground">{isLabel}</p>
                          {r.is_code?.title ? (
                            <p
                              className="mx-auto max-w-[200px] truncate text-[11px] text-muted-foreground"
                              title={r.is_code.title}
                            >
                              {r.is_code.title}
                            </p>
                          ) : null}
                        </div>
                      ) : (
                        '—'
                      )}
                    </TableCell>
                    <TableCell className="align-middle text-center">
                      <p className="font-mono text-xs tabular-nums text-foreground">{formatCmL(r.cm_l_digits)}</p>
                      {r.project_kind ? (
                        <p className="text-[11px] text-muted-foreground">{r.project_kind}</p>
                      ) : null}
                    </TableCell>
                    <TableCell className="align-middle text-center text-sm font-medium text-foreground">
                      {sampleFailureTypeLabel(r.sample_failure_type)}
                    </TableCell>
                    <TableCell className="align-middle text-center text-sm">
                      <p className="text-foreground">{r.sample_code || '—'}</p>
                      {r.sample_qr_code ? (
                        <p className="text-[11px] text-muted-foreground">{r.sample_qr_code}</p>
                      ) : null}
                    </TableCell>
                    <TableCell className="align-middle text-center text-xs">
                      <span
                        className={cn(
                          'inline-flex rounded-full px-2 py-0.5 font-medium ring-1 ring-inset',
                          SAMPLE_FAILURE_STATUS_STYLES[r.status] ?? SAMPLE_FAILURE_STATUS_STYLES.open,
                        )}
                      >
                        {sampleFailureStatusLabel(r.status)}
                      </span>
                    </TableCell>
                    <TableCell className="align-middle text-center text-sm tabular-nums">
                      {formatDisplayDate(r.created_at)}
                    </TableCell>
                    <TableCell className="align-middle text-center">
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        aria-label={`Edit ${client}`}
                        title="Edit"
                        onClick={() => onEdit(r)}
                      >
                        <Pencil size={16} />
                      </Button>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  )
}
