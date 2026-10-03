import { Pencil } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { cn } from '@/lib/utils'
import {
  formatCmL,
  formatDisplayDate,
  formatInr,
  renewalClientName,
  renewalIsCodeLabel,
  renewalStatusClass,
  type BisRenewalRow,
} from './types'

const GRID_TABLE =
  'min-w-[1100px] w-full border-collapse [&_th]:border [&_td]:border [&_th]:border-border [&_td]:border-border'

const checkboxClass =
  'h-4 w-4 rounded border-muted-foreground/30 text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'

const headClass = 'text-center text-xs'

export function BisRenewalsTable({
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
  rows: BisRenewalRow[]
  loading: boolean
  error: string | null
  searchActive: boolean
  selectedIds: Set<string>
  onToggle: (id: string) => void
  onToggleAll: (checked: boolean) => void
  onEdit: (row: BisRenewalRow) => void
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
            {searchActive ? 'No renewals match your search.' : 'No renewal applications yet.'}
          </p>
          {!searchActive ? (
            <p className="mt-1 text-xs text-muted-foreground">
              Use &quot;Add Renewal&quot; to start a renewal for a BIS license.
            </p>
          ) : null}
        </div>
      ) : (
        <div className={cn('overflow-x-auto', loading && 'opacity-60 transition-opacity')}>
          <Table className={GRID_TABLE}>
            <TableHeader>
              <TableRow className="bg-stone-800 hover:bg-stone-800">
                <TableHead className="sticky left-0 z-10 w-12 bg-stone-800 text-center text-[11px] font-bold uppercase tracking-[0.14em] text-amber-200 sm:w-14">
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
                <TableHead className="sticky left-12 z-10 min-w-[220px] bg-stone-800 text-left text-[11px] font-bold uppercase tracking-[0.14em] text-amber-200 sm:left-14">
                  Name of the Client
                </TableHead>
                <TableHead className={cn(headClass, 'min-w-[160px]')}>IS Code / CM/L</TableHead>
                <TableHead className={cn(headClass, 'min-w-[150px]')}>Application</TableHead>
                <TableHead className={cn(headClass, 'min-w-[130px]')}>Marking Fee</TableHead>
                <TableHead className={cn(headClass, 'min-w-[150px]')}>Inspection</TableHead>
                <TableHead className={cn(headClass, 'min-w-[150px]')}>Validity</TableHead>
                <TableHead className={cn(headClass, 'min-w-[140px]')}>Status</TableHead>
                <TableHead className={cn(headClass, 'min-w-[80px]')}>Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => {
                const selected = selectedIds.has(r.id)
                const client = renewalClientName(r) || '—'
                const isLabel = renewalIsCodeLabel(r)
                const stickyCellBg = selected
                  ? 'bg-[#fde68a]/80 group-hover:bg-[#fde68a]/80'
                  : 'bg-white group-hover:bg-[#f3e9d8]'
                return (
                  <TableRow key={r.id} data-state={selected ? 'selected' : undefined} className="group">
                    <TableCell
                      className={cn(
                        'sticky left-0 z-10 text-center align-middle transition-colors',
                        stickyCellBg,
                      )}
                    >
                      <input
                        type="checkbox"
                        className={checkboxClass}
                        aria-label={`Select renewal for ${client}`}
                        checked={selected}
                        onChange={() => onToggle(r.id)}
                      />
                    </TableCell>
                    <TableCell
                      className={cn(
                        'sticky left-12 z-10 align-middle transition-colors sm:left-14',
                        stickyCellBg,
                      )}
                    >
                      <p
                        className="min-w-[200px] max-w-[300px] break-words font-medium leading-snug text-foreground"
                        title={client}
                      >
                        {client}
                      </p>
                    </TableCell>
                    <TableCell className="align-middle text-center text-sm">
                      <p className="font-medium text-foreground">{isLabel || '—'}</p>
                      <p className="font-mono text-xs tabular-nums text-muted-foreground">
                        {formatCmL(r.project?.cm_l_digits)}
                      </p>
                    </TableCell>
                    <TableCell className="align-middle text-center text-sm">
                      <p className="tabular-nums text-foreground">
                        {formatDisplayDate(r.application_date)}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {r.acknowledgment_number || r.submission_mode || '—'}
                      </p>
                    </TableCell>
                    <TableCell className="align-middle text-center text-sm">
                      <p className="tabular-nums text-foreground">{formatInr(r.marking_fee_total)}</p>
                      <p className="text-xs text-muted-foreground">
                        {r.fee_payment_date
                          ? `Paid ${formatDisplayDate(r.fee_payment_date)}`
                          : 'Not paid'}
                      </p>
                    </TableCell>
                    <TableCell className="align-middle text-center text-sm">
                      <p className="tabular-nums text-foreground">{formatDisplayDate(r.inspection_date)}</p>
                      <p className="text-xs text-muted-foreground">{r.inspection_result || '—'}</p>
                    </TableCell>
                    <TableCell className="align-middle text-center text-sm">
                      <p className="tabular-nums font-medium text-foreground">
                        {formatDisplayDate(r.new_validity_to ?? r.project?.license_validity_date)}
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        {r.new_validity_to ? 'Renewed till' : 'Current validity'}
                      </p>
                    </TableCell>
                    <TableCell className="align-middle text-center text-xs">
                      <span
                        className={cn(
                          'inline-flex rounded-full px-2 py-0.5 font-medium ring-1 ring-inset',
                          renewalStatusClass(r.renewal_status),
                        )}
                      >
                        {r.renewal_status}
                      </span>
                    </TableCell>
                    <TableCell className="align-middle text-center">
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        aria-label={`Edit renewal for ${client}`}
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
