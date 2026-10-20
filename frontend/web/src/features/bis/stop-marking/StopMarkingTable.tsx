import { ExternalLink, FileText, Mail, Pencil } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { cn } from '@/lib/utils'
import { formatCmL, formatDisplayDate } from '../projects/types'
import {
  STOP_MARKING_STATUS_STYLES,
  stopMarkingClientName,
  stopMarkingIsCodeLabel,
  stopMarkingStatusLabel,
  type StopMarkingRow,
} from './types'

const GRID_TABLE = 'w-full border-collapse [&_th]:border [&_td]:border [&_th]:border-border [&_td]:border-border list-cards min-w-[900px]'
const checkboxClass = 'h-4 w-4 rounded border-muted-foreground/30 text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
const actionBtn = 'h-8 w-8 p-0 text-amber-800 hover:bg-amber-50'
const headClass = 'text-center text-[11px] font-bold uppercase tracking-[0.14em] text-amber-200'

export function StopMarkingTable({
  rows,
  loading,
  error,
  searchActive,
  selectedIds,
  onToggle,
  onToggleAll,
  onEdit,
  onModule,
  onManak,
  onEmail,
  emailBusy,
  onRetry,
}: {
  rows: StopMarkingRow[]
  loading: boolean
  error: string | null
  searchActive: boolean
  selectedIds: Set<string>
  onToggle: (id: string) => void
  onToggleAll: (checked: boolean) => void
  onEdit: (row: StopMarkingRow) => void
  onModule: (row: StopMarkingRow) => void
  onManak: (row: StopMarkingRow) => void
  onEmail: (row: StopMarkingRow) => void
  emailBusy?: boolean
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
            <Button type="button" variant="outline" size="sm" className="h-8 shrink-0 rounded-none border-stone-500" onClick={onRetry} disabled={loading}>
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
            {searchActive ? 'No stop marking cases match your search.' : 'No licence is in Stop Marking. Use Add to put one here.'}
          </p>
        </div>
      ) : (
        <div className={cn('overflow-x-auto', loading && 'opacity-60 transition-opacity')}>
          <Table className={GRID_TABLE}>
            <TableHeader>
              <TableRow className="bg-stone-800 hover:bg-stone-800">
                <TableHead className="w-12 bg-stone-800 text-center sm:w-14">
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
                <TableHead className={cn(headClass, 'min-w-[220px] text-left')}>Firm Name</TableHead>
                <TableHead className={cn(headClass, 'min-w-[150px]')}>IS Code</TableHead>
                <TableHead className={cn(headClass, 'min-w-[120px]')}>CM/L Number</TableHead>
                <TableHead className={cn(headClass, 'min-w-[150px]')}>Reason</TableHead>
                <TableHead className={cn(headClass, 'min-w-[110px]')}>Stopped On</TableHead>
                <TableHead className={cn(headClass, 'min-w-[110px]')}>Reply Due</TableHead>
                <TableHead className={cn(headClass, 'min-w-[120px]')}>Status</TableHead>
                <TableHead className={cn(headClass, 'min-w-[140px]')}>Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => {
                const selected = selectedIds.has(r.id)
                const client = stopMarkingClientName(r) || '—'
                const overdue = r.status !== 'closed' && r.status !== 'replied' && r.bis_deadline && r.bis_deadline.slice(0, 10) < new Date().toISOString().slice(0, 10)
                return (
                  <TableRow key={r.id} data-state={selected ? 'selected' : undefined} className="group cursor-pointer" onDoubleClick={() => onModule(r)}>
                    <TableCell className="lc-check text-center align-middle">
                      <input type="checkbox" className={checkboxClass} aria-label={`Select ${client}`} checked={selected} onChange={() => onToggle(r.id)} />
                    </TableCell>
                    <TableCell className="lc-title align-middle">
                      <p className="min-w-[200px] max-w-[300px] break-words font-medium leading-snug text-foreground">{client}</p>
                    </TableCell>
                    <TableCell data-label="IS Code" className="align-middle text-center text-sm font-medium">
                      {stopMarkingIsCodeLabel(r) || '—'}
                    </TableCell>
                    <TableCell data-label="CM/L" className="align-middle text-center">
                      <p className="font-mono text-xs tabular-nums">{formatCmL(r.cm_l_digits) || '—'}</p>
                    </TableCell>
                    <TableCell data-label="Reason" className="align-middle text-center text-sm">
                      {r.reason_type || '—'}
                    </TableCell>
                    <TableCell data-label="Stopped On" className="align-middle text-center text-sm tabular-nums">
                      {formatDisplayDate(r.stop_date)}
                    </TableCell>
                    <TableCell data-label="Reply Due" className={cn('align-middle text-center text-sm tabular-nums', overdue && 'font-semibold text-red-700')}>
                      {r.bis_deadline ? formatDisplayDate(r.bis_deadline) : '—'}
                    </TableCell>
                    <TableCell data-label="Status" className="align-middle text-center text-xs">
                      <span className={cn('inline-flex rounded-full px-2 py-0.5 font-medium ring-1 ring-inset', STOP_MARKING_STATUS_STYLES[r.status] ?? STOP_MARKING_STATUS_STYLES.open)}>
                        {stopMarkingStatusLabel(r.status)}
                      </span>
                    </TableCell>
                    <TableCell className="lc-actions align-middle text-center">
                      <div className="inline-flex shrink-0 items-center justify-center gap-0.5">
                        <Button type="button" size="sm" variant="ghost" className={actionBtn} aria-label={`Edit ${client}`} title="Edit — date, reason and BIS letter" onClick={() => onEdit(r)}>
                          <Pencil size={16} />
                        </Button>
                        <Button type="button" size="sm" variant="ghost" className={actionBtn} aria-label={`Open Stop Marking module for ${client}`} title="Stop Marking module — letter review, reply, Factory Test Report, submission" onClick={() => onModule(r)}>
                          <FileText size={16} />
                        </Button>
                        <Button type="button" size="sm" variant="ghost" className={actionBtn} aria-label={`Manak Assist for ${client}`} title="Manak Assist — open Manak eBIS" onClick={() => onManak(r)}>
                          <ExternalLink size={16} />
                        </Button>
                        <Button type="button" size="sm" variant="ghost" className={actionBtn} aria-label={`Email reply to ${client}`} title="Email the reply letter to the client" disabled={emailBusy || !r.reply_draft?.trim()} onClick={() => onEmail(r)}>
                          <Mail size={16} />
                        </Button>
                      </div>
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
