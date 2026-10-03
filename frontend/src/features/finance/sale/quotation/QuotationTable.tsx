import { Copy, Download, Pencil, Printer } from 'lucide-react'
import { getCurrencySymbol } from '@/lib/appCurrency'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { cn } from '@/lib/utils'
import { receiptLedgerSnapshot } from '../shared/clientSaleBalance'
import {
  formatDate,
  formatMoney,
  QUOTATION_STATUS_LABELS,
  QUOTATION_STATUS_OPTIONS,
  quotationStatusLabel,
  type QuotationRow,
  type QuotationStatus,
} from './types'

const GRID_TABLE =
  'min-w-[820px] w-full border-collapse [&_th]:border [&_td]:border [&_th]:border-border [&_td]:border-border'

const checkboxClass =
  'h-4 w-4 rounded border-muted-foreground/30 text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'

function statusClass(status: string): string {
  switch (status) {
    case 'Finalized':
    case 'Accepted':
      return 'bg-emerald-50 text-emerald-800 ring-emerald-200'
    case 'Sent':
      return 'bg-sky-50 text-sky-800 ring-sky-200'
    case 'Proforma':
      return 'bg-amber-50 text-amber-900 ring-amber-200'
    case 'Invoice':
    case 'Converted':
      return 'bg-violet-50 text-violet-800 ring-violet-200'
    case 'Rejected':
    case 'Expired':
      return 'bg-rose-50 text-rose-800 ring-rose-200'
    default:
      return 'bg-slate-50 text-slate-700 ring-slate-200'
  }
}

export function QuotationTable({
  rows,
  loading,
  error,
  searchActive,
  selectedIds,
  statusUpdatingId,
  onToggle,
  onToggleAll,
  onEdit,
  onCopy,
  onPrint,
  onDownloadPdf,
  onStatusChange,
  onRetry,
  emptyPrimary,
  emptySecondary,
  hideValidUntil = false,
  paymentLedger = false,
  paymentOpeningByClientId,
}: {
  rows: QuotationRow[]
  loading: boolean
  error: string | null
  searchActive?: boolean
  selectedIds: Set<string>
  statusUpdatingId?: string | null
  onToggle: (id: string) => void
  onToggleAll: (checked: boolean) => void
  onEdit: (row: QuotationRow) => void
  onCopy: (row: QuotationRow) => void
  onPrint: (row: QuotationRow) => void
  onDownloadPdf: (row: QuotationRow) => void
  onStatusChange: (row: QuotationRow, status: QuotationStatus) => void
  onRetry?: () => void
  emptyPrimary?: string
  emptySecondary?: string
  hideValidUntil?: boolean
  /** Payment Receipt list: Opening / Received / Balance instead of Status / Grand Total. */
  paymentLedger?: boolean
  paymentOpeningByClientId?: Record<string, { amount: number; type: 'Dr' | 'Cr' }>
}) {
  const allChecked = rows.length > 0 && rows.every((r) => selectedIds.has(r.id))
  const someChecked = rows.some((r) => selectedIds.has(r.id))

  const emptyMain =
    emptyPrimary ??
    (searchActive ? 'No quotations match your search.' : 'No quotations added yet.')
  const emptyHint =
    emptySecondary ??
    (searchActive ? undefined : 'Use "Add New Quotation" to create your first record.')

  return (
    <div className="overflow-hidden overflow-hidden rounded-none border-2 border-stone-500 bg-white shadow-sm ring-1 ring-amber-700/20">
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

      {loading ? (
        <p className="px-5 py-8 text-center text-sm text-muted-foreground">Loading…</p>
      ) : rows.length === 0 ? (
        <div className="m-3 rounded-lg border border-dashed border-border p-4 text-center sm:m-4 sm:p-6">
          <p className="text-sm text-muted-foreground">{emptyMain}</p>
          {emptyHint ? (
            <p className="mt-1 text-xs text-muted-foreground">{emptyHint}</p>
          ) : null}
        </div>
      ) : (
        <Table className={GRID_TABLE}>
          <TableHeader>
            <TableRow className="bg-stone-800 hover:bg-stone-800">
              <TableHead className="sticky left-0 z-10 w-12 bg-stone-800 text-center text-[11px] font-bold uppercase tracking-[0.14em] text-amber-200 sm:w-14">
                <input
                  type="checkbox"
                  className={checkboxClass}
                  aria-label="Select all"
                  checked={allChecked}
                  ref={(el) => {
                    if (el) el.indeterminate = !allChecked && someChecked
                  }}
                  onChange={(e) => onToggleAll(e.target.checked)}
                />
              </TableHead>
              <TableHead className="sticky left-12 z-10 min-w-[200px] bg-stone-800 text-left text-[11px] font-bold uppercase tracking-[0.14em] text-amber-200 sm:left-14">
                Client
              </TableHead>
              <TableHead className="min-w-[120px] text-center text-xs">Date</TableHead>
              {paymentLedger ? (
                <>
                  <TableHead className="min-w-[130px] text-center text-xs">
                    Opening Balance
                  </TableHead>
                  <TableHead className="min-w-[130px] text-center text-xs">
                    Payment Received
                  </TableHead>
                  <TableHead className="min-w-[130px] text-center text-xs">
                    Balance Payment
                  </TableHead>
                </>
              ) : (
                <>
                  <TableHead className="min-w-[170px] text-center text-xs">Status</TableHead>
                  <TableHead className="min-w-[110px] text-center text-xs">Grand Total</TableHead>
                </>
              )}
              <TableHead className="min-w-[140px] text-center text-xs">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => {
              const selected = selectedIds.has(r.id)
              const busy = statusUpdatingId === r.id
              const inOptions = QUOTATION_STATUS_OPTIONS.some((o) => o.value === r.status)
              const ledger = paymentLedger
                ? receiptLedgerSnapshot(
                    r,
                    r.client_id ? paymentOpeningByClientId?.[r.client_id] : undefined,
                  )
                : null
              const stickyCellBg = selected
                ? 'bg-[#fde68a]/80 group-hover:bg-[#fde68a]/80'
                : 'bg-white group-hover:bg-[#f3e9d8]'
              return (
                <TableRow
                  key={r.id}
                  data-state={selected ? 'selected' : undefined}
                  className="group"
                >
                  <TableCell
                    className={cn(
                      'sticky left-0 z-10 text-center align-middle transition-colors',
                      stickyCellBg,
                    )}
                  >
                    <input
                      type="checkbox"
                      className={checkboxClass}
                      aria-label={`Select ${r.quotation_number}`}
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
                    <div className="min-w-[180px] max-w-[280px] space-y-0.5">
                      <p
                        className="truncate font-medium text-foreground"
                        title={r.client_name || undefined}
                      >
                        {r.client_name || '—'}
                      </p>
                      <p
                        className="truncate font-mono text-xs text-muted-foreground"
                        title={r.quotation_number}
                      >
                        {r.quotation_number}
                      </p>
                    </div>
                  </TableCell>
                  <TableCell className="text-center align-middle text-sm">
                    <div className="space-y-0.5">
                      <p className="text-foreground">{formatDate(r.quotation_date)}</p>
                      {!hideValidUntil && r.valid_until ? (
                        <p className="text-[11px] text-muted-foreground">
                          Valid: {formatDate(r.valid_until)}
                        </p>
                      ) : null}
                    </div>
                  </TableCell>
                  {paymentLedger && ledger ? (
                    <>
                      <TableCell className="text-center align-middle text-sm tabular-nums">
                        <span className="font-medium">{getCurrencySymbol()} {formatMoney(ledger.opening.amount)}</span>
                        <span
                          className={cn(
                            'ml-1 text-[11px] font-bold uppercase',
                            ledger.opening.type === 'Cr' ? 'text-emerald-700' : 'text-amber-800',
                          )}
                        >
                          {ledger.opening.type}
                        </span>
                      </TableCell>
                      <TableCell className="text-center align-middle text-sm font-medium tabular-nums">
                        {getCurrencySymbol()} {formatMoney(ledger.received)}
                      </TableCell>
                      <TableCell className="text-center align-middle text-sm tabular-nums">
                        <span className="font-medium">{getCurrencySymbol()} {formatMoney(ledger.after.amount)}</span>
                        <span
                          className={cn(
                            'ml-1 text-[11px] font-bold uppercase',
                            ledger.after.type === 'Cr' ? 'text-emerald-700' : 'text-amber-800',
                          )}
                        >
                          {ledger.after.type}
                        </span>
                      </TableCell>
                    </>
                  ) : (
                    <>
                  <TableCell className="text-center align-middle">
                    <Select
                      value={r.status}
                      disabled={busy || loading}
                      onValueChange={(v) => onStatusChange(r, v as QuotationStatus)}
                    >
                      <SelectTrigger
                        className={cn(
                          'mx-auto h-8 w-full max-w-[15rem] rounded-none border-stone-500 bg-white px-2 text-xs shadow-none',
                          'focus:ring-amber-500/20',
                        )}
                        aria-label={`Status for ${r.quotation_number}`}
                      >
                        <SelectValue>
                          <span
                            className={cn(
                              'inline-flex max-w-full truncate rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset',
                              statusClass(r.status),
                            )}
                          >
                            {quotationStatusLabel(r.status)}
                          </span>
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent className="rounded-none border-stone-500">
                        {QUOTATION_STATUS_OPTIONS.map((opt) => (
                          <SelectItem key={opt.value} value={opt.value} className="text-sm">
                            {opt.label}
                          </SelectItem>
                        ))}
                        {!inOptions ? (
                          <SelectItem value={r.status} className="text-sm">
                            {QUOTATION_STATUS_LABELS[r.status] ?? r.status}
                          </SelectItem>
                        ) : null}
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell className="text-center align-middle text-sm font-medium tabular-nums">
                    {getCurrencySymbol()} {formatMoney(r.grand_total)}
                  </TableCell>
                    </>
                  )}
                  <TableCell className="text-center align-middle">
                    <div className="flex items-center justify-center gap-0.5">
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        aria-label={`Edit ${r.quotation_number}`}
                        title="Edit"
                        onClick={() => onEdit(r)}
                      >
                        <Pencil size={16} />
                      </Button>
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        aria-label={`Copy ${r.quotation_number}`}
                        title="Copy"
                        onClick={() => onCopy(r)}
                      >
                        <Copy size={16} />
                      </Button>
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        aria-label={`Print ${r.quotation_number}`}
                        title="Print"
                        onClick={() => onPrint(r)}
                      >
                        <Printer size={16} />
                      </Button>
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        aria-label={`Save PDF ${r.quotation_number}`}
                        title="Save as PDF (Print → Save as PDF)"
                        onClick={() => onDownloadPdf(r)}
                      >
                        <Download size={16} />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      )}
    </div>
  )
}
