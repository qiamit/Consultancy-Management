import { Building2, Copy, Download, Mail, Pencil, Printer } from 'lucide-react'
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
import { limsPanelClass } from '@/lib/limsThemeUi'
import { cn } from '@/lib/utils'
import { receiptLedgerSnapshot } from '../shared/clientSaleBalance'
import { tdsAmount } from '../shared/financeRules'
import { invoiceAgeLabel, invoiceDueLabel } from '../shared/invoiceBalanceApi'
import {
  formatDate,
  formatMoney,
  statusOptionsForDocumentKind,
  quotationStatusLabel,
  type QuotationRow,
  type QuotationStatus,
} from './types'

function againstInvoiceText(row: QuotationRow, mode: 'receipt' | 'credit' | null): string | null {
  const number = row.reference_no?.trim()
  if (mode === 'receipt') return number ? `Against ${number}` : 'Not Linked'
  if (mode === 'credit' && number) return `Against ${number}`
  return null
}

function receiptTdsText(row: QuotationRow): string | null {
  const percent = row.tds_percent
  if (percent !== 2 && percent !== 10) return null
  const net = row.grand_total - tdsAmount(row.grand_total, String(percent))
  return `TDS ${percent}% · Net ${getCurrencySymbol()} ${formatMoney(net)}`
}

/** ~10" / desktop: row table. Below that: cards. */
const TABLE_MQ_SHOW = 'hidden lg:block'
const CARDS_MQ_SHOW = 'lg:hidden'

const GRID_TABLE =
  'min-w-[860px] w-full border-collapse font-jakarta [&_th]:border [&_td]:border [&_th]:border-stone-700 [&_td]:border-[#e7e0d4] [&_th]:p-[1mm] [&_td]:!p-[1mm] [&_th]:sticky [&_th]:top-0 [&_th]:z-[1] [&_td]:static'

const thBase =
  'bg-stone-800 text-center text-[11px] font-bold uppercase tracking-[0.14em] text-amber-200'

const tdClass = 'px-2 py-2 text-center align-middle text-sm text-[#292524]'

const rowEvenClass = 'bg-[#f7f3eb] hover:bg-[#f3e9d8]'
const rowOddClass = 'bg-[#fffcf7] hover:bg-[#f3e9d8]'
const rowSelectedClass = 'bg-[#fde68a]/80 hover:bg-[#fde68a]/80'

const checkboxClass =
  'h-4 w-4 rounded-none border-stone-500 text-amber-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/30'

const ghostBtnClass =
  'h-8 w-8 rounded-none p-0 text-[#92400e] hover:bg-[#f3e9d8] hover:text-[#78350f]'

function statusClass(status: string): string {
  switch (status) {
    case 'Finalized':
    case 'Accepted':
      return 'bg-emerald-50 text-emerald-800'
    case 'Sent':
      return 'bg-sky-50 text-sky-800'
    case 'Proforma':
      return 'bg-amber-50 text-amber-900'
    case 'Invoice':
    case 'Converted':
      return 'bg-violet-50 text-violet-800'
    case 'Rejected':
    case 'Expired':
      return 'bg-rose-50 text-rose-800'
    default:
      return 'bg-stone-100 text-stone-800'
  }
}

function RowActions({
  row,
  busy,
  loading,
  emailBusyId,
  onEdit,
  onCopy,
  onPrint,
  onDownloadPdf,
  onEmailClient,
}: {
  row: QuotationRow
  busy: boolean
  loading: boolean
  emailBusyId: string | null
  onEdit: (row: QuotationRow) => void
  onCopy: (row: QuotationRow) => void
  onPrint: (row: QuotationRow) => void
  onDownloadPdf: (row: QuotationRow) => void
  onEmailClient?: (row: QuotationRow) => void
}) {
  return (
    <div className="flex shrink-0 items-center gap-0.5">
      <Button
        type="button"
        size="sm"
        variant="ghost"
        className={ghostBtnClass}
        aria-label={`Edit ${row.quotation_number}`}
        title="Edit"
        onClick={() => onEdit(row)}
      >
        <Pencil size={16} />
      </Button>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        className={ghostBtnClass}
        aria-label={`Copy ${row.quotation_number}`}
        title="Copy"
        onClick={() => onCopy(row)}
      >
        <Copy size={16} />
      </Button>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        className={ghostBtnClass}
        aria-label={`Print ${row.quotation_number}`}
        title="Print"
        onClick={() => onPrint(row)}
      >
        <Printer size={16} />
      </Button>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        className={ghostBtnClass}
        aria-label={`Save PDF ${row.quotation_number}`}
        title="Save as PDF"
        onClick={() => onDownloadPdf(row)}
      >
        <Download size={16} />
      </Button>
      {onEmailClient ? (
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className={ghostBtnClass}
          aria-label={`Email ${row.quotation_number} to client`}
          title="Email to client"
          disabled={busy || loading || emailBusyId === row.id}
          onClick={() => onEmailClient(row)}
        >
          <Mail size={16} />
        </Button>
      ) : null}
    </div>
  )
}

function StatusSelect({
  row,
  busy,
  loading,
  statusOptions,
  onStatusChange,
}: {
  row: QuotationRow
  busy: boolean
  loading: boolean
  statusOptions: Array<{ value: QuotationStatus; label: string }>
  onStatusChange: (row: QuotationRow, status: QuotationStatus) => void
}) {
  const inOptions = statusOptions.some((o) => o.value === row.status)
  return (
    <Select
      value={row.status}
      disabled={busy || loading}
      onValueChange={(v) => onStatusChange(row, v as QuotationStatus)}
    >
      <SelectTrigger
        className={cn(
          'relative mx-auto h-8 w-full max-w-[15rem] justify-center rounded-none border-stone-500 px-2 pr-7 text-center text-xs font-medium shadow-none',
          'focus:ring-amber-500/20',
          '[&>span]:block [&>span]:w-full [&>span]:truncate [&>span]:text-center',
          '[&>svg]:absolute [&>svg]:right-2 [&>svg]:top-1/2 [&>svg]:-translate-y-1/2',
          statusClass(row.status),
        )}
        aria-label={`Status for ${row.quotation_number}`}
      >
        <SelectValue placeholder="Status">
          {quotationStatusLabel(row.status)}
        </SelectValue>
      </SelectTrigger>
      <SelectContent className="rounded-none border-stone-500">
        {statusOptions.map((opt) => (
          <SelectItem key={opt.value} value={opt.value} className="text-sm">
            {opt.label}
          </SelectItem>
        ))}
        {!inOptions ? (
          <SelectItem value={row.status} className="text-sm">
            {quotationStatusLabel(row.status)}
          </SelectItem>
        ) : null}
      </SelectContent>
    </Select>
  )
}

function MoneyLine({
  amount,
  type,
}: {
  amount: number
  type?: 'Dr' | 'Cr'
}) {
  return (
    <span className="tabular-nums">
      <span className="font-semibold">
        {getCurrencySymbol()} {formatMoney(amount)}
      </span>
      {type ? (
        <span
          className={cn(
            'ml-1 text-[11px] font-bold uppercase',
            type === 'Cr' ? 'text-emerald-700' : 'text-amber-800',
          )}
        >
          {type}
        </span>
      ) : null}
    </span>
  )
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
  onEmailClient,
  emailBusyId = null,
  onStatusChange,
  onRetry,
  emptyPrimary,
  emptySecondary,
  hideValidUntil = false,
  paymentLedger = false,
  paymentOpeningByClientId,
  documentKind,
  outstandingById,
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
  onEmailClient?: (row: QuotationRow) => void
  emailBusyId?: string | null
  onStatusChange: (row: QuotationRow, status: QuotationStatus) => void
  onRetry?: () => void
  emptyPrimary?: string
  emptySecondary?: string
  hideValidUntil?: boolean
  /** Payment Receipt list: Opening / Received / Balance instead of Status / Grand Total. */
  paymentLedger?: boolean
  paymentOpeningByClientId?: Record<string, { amount: number; type: 'Dr' | 'Cr' }>
  /** Filters status convert actions (e.g. Invoice → Credit Note). */
  documentKind?: string
  /** Tax invoice list: outstanding by invoice id. */
  outstandingById?: Record<string, number>
}) {
  const showDue = documentKind === 'invoice'
  const againstMode = paymentLedger ? 'receipt' : documentKind === 'creditNote' ? 'credit' : null
  const statusOptions = statusOptionsForDocumentKind(documentKind)
  const allChecked = rows.length > 0 && rows.every((r) => selectedIds.has(r.id))
  const someChecked = rows.some((r) => selectedIds.has(r.id))

  const emptyMain =
    emptyPrimary ??
    (searchActive ? 'No quotations match your search.' : 'No quotations added yet.')
  const emptyHint =
    emptySecondary ??
    (searchActive ? undefined : 'Use "Add New Quotation" to create your first record.')

  return (
    <div className={cn(limsPanelClass, 'flex h-full min-h-0 flex-col bg-[#f7f3eb]')}>
      {error ? (
        <div className="flex shrink-0 flex-wrap items-start justify-between gap-2 px-3 pt-3 sm:px-5 sm:pt-4">
          <p className="min-w-0 flex-1 text-sm text-red-600">{error}</p>
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
        <p className="px-5 py-8 text-center text-sm text-[#78716c]">Loading…</p>
      ) : rows.length === 0 ? (
        <div className="m-3 border border-dashed border-[#d6d3d1] bg-[#fffcf7] p-4 text-center sm:m-4 sm:p-6">
          <p className="text-sm text-[#57534e]">{emptyMain}</p>
          {emptyHint ? <p className="mt-1 text-xs text-[#78716c]">{emptyHint}</p> : null}
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto overflow-x-auto overscroll-contain [-webkit-overflow-scrolling:touch]">
          {/* Cards — below ~10" / lg */}
          <div className={cn('space-y-2.5 p-2 sm:p-3', CARDS_MQ_SHOW)}>
            <div className="sticky top-0 z-[1] flex items-center gap-2 border border-stone-500 bg-stone-800 px-2.5 py-2 text-amber-200 shadow-sm">
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
              <span className="text-[11px] font-bold uppercase tracking-[0.14em]">
                {selectedIds.size > 0 ? `${selectedIds.size} selected` : `${rows.length} records`}
              </span>
            </div>

            {rows.map((r, index) => {
              const selected = selectedIds.has(r.id)
              const busy = statusUpdatingId === r.id
              const even = index % 2 === 0
              const tone = selected ? 'bg-[#fde68a]/70' : even ? 'bg-[#fffcf7]' : 'bg-white'
              const ledger = paymentLedger
                ? receiptLedgerSnapshot(
                    r,
                    r.client_id ? paymentOpeningByClientId?.[r.client_id] : undefined,
                  )
                : null

              return (
                <article
                  key={r.id}
                  className={cn(
                    'overflow-hidden border-2 border-stone-500 font-jakarta shadow-sm ring-1 ring-amber-700/20',
                    tone,
                    selected && 'ring-2 ring-amber-500/40',
                  )}
                >
                  <div className="flex items-stretch">
                    <div className="w-1 shrink-0 bg-gradient-to-b from-amber-500 via-amber-600 to-stone-700" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start gap-2 border-b border-[#e7e0d4] px-2.5 py-2.5">
                        <input
                          type="checkbox"
                          className={cn(checkboxClass, 'mt-1 shrink-0')}
                          aria-label={`Select ${r.quotation_number}`}
                          checked={selected}
                          onChange={() => onToggle(r.id)}
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <Building2 className="h-3.5 w-3.5 shrink-0 text-amber-700" aria-hidden />
                            <p className="truncate text-[14px] font-bold tracking-tight text-[#1c1917]">
                              {r.client_name || '—'}
                            </p>
                          </div>
                          <p className="mt-1 font-mono text-[11px] font-medium text-[#b45309]">
                            {r.quotation_number}
                          </p>
                          {againstInvoiceText(r, againstMode) ? (
                            <p className="mt-0.5 truncate text-[11px] text-stone-600">
                              {againstInvoiceText(r, againstMode)}
                            </p>
                          ) : null}
                        </div>
                        <div className="shrink-0 text-right text-[12px] font-semibold tabular-nums text-[#292524]">
                          {formatDate(r.quotation_date)}
                          {!hideValidUntil && r.valid_until ? (
                            <p className="mt-0.5 text-[10px] font-normal text-[#78716c]">
                              Valid {formatDate(r.valid_until)}
                            </p>
                          ) : null}
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-px border-b border-[#e7e0d4] bg-[#e7e0d4]">
                        {paymentLedger && ledger ? (
                          <>
                            <div className="bg-[#fffcf7] px-2.5 py-2">
                              <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-stone-500">
                                Opening
                              </p>
                              <p className="mt-0.5 text-[12px]">
                                <MoneyLine amount={ledger.opening.amount} type={ledger.opening.type} />
                              </p>
                            </div>
                            <div className="bg-[#fffcf7] px-2.5 py-2">
                              <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-stone-500">
                                Received
                              </p>
                              <p className="mt-0.5 text-[12px]">
                                <MoneyLine amount={ledger.received} />
                              </p>
                              {receiptTdsText(r) ? (
                                <p className="mt-0.5 text-[11px] font-semibold text-stone-600">{receiptTdsText(r)}</p>
                              ) : null}
                            </div>
                            <div className="col-span-2 bg-[#fffcf7] px-2.5 py-2">
                              <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-stone-500">
                                Balance
                              </p>
                              <p className="mt-0.5 text-[12px]">
                                <MoneyLine amount={ledger.after.amount} type={ledger.after.type} />
                              </p>
                            </div>
                          </>
                        ) : (
                          <>
                            <div className="bg-[#fffcf7] px-2.5 py-2">
                              <p className="mb-1 text-[9px] font-bold uppercase tracking-[0.12em] text-stone-500">
                                Status
                              </p>
                              <StatusSelect
                                row={r}
                                busy={busy}
                                loading={loading}
                                statusOptions={statusOptions}
                                onStatusChange={onStatusChange}
                              />
                            </div>
                            <div className="bg-[#fffcf7] px-2.5 py-2">
                              <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-stone-500">
                                Grand Total
                              </p>
                              <p className="mt-1 text-[13px] font-bold tabular-nums text-[#1c1917]">
                                {getCurrencySymbol()} {formatMoney(r.grand_total)}
                              </p>
                            </div>
                            {showDue ? (
                              <div className="col-span-2 bg-[#fffcf7] px-2.5 py-2">
                                <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-stone-500">
                                  Outstanding
                                </p>
                                <p className="mt-0.5 text-[12px] font-semibold tabular-nums">
                                  {getCurrencySymbol()} {formatMoney(outstandingById?.[r.id] ?? r.grand_total)}
                                  <span className="ml-1 text-[11px] font-bold uppercase text-stone-600">
                                    {invoiceDueLabel(r.grand_total, outstandingById?.[r.id] ?? r.grand_total)}
                                  </span>
                                </p>
                                <p className="mt-0.5 text-[11px] font-semibold text-stone-600">
                                  {invoiceAgeLabel(
                                    r.quotation_date,
                                    outstandingById?.[r.id] ?? r.grand_total,
                                  )}
                                </p>
                              </div>
                            ) : null}
                          </>
                        )}
                      </div>

                      <div className="flex items-center justify-between gap-2 bg-[#f7f3eb]/80 px-2.5 py-1.5">
                        <span className="text-[10px] font-medium uppercase tracking-[0.1em] text-stone-500">
                          Actions
                        </span>
                        <RowActions
                          row={r}
                          busy={busy}
                          loading={loading}
                          emailBusyId={emailBusyId}
                          onEdit={onEdit}
                          onCopy={onCopy}
                          onPrint={onPrint}
                          onDownloadPdf={onDownloadPdf}
                          onEmailClient={onEmailClient}
                        />
                      </div>
                    </div>
                  </div>
                </article>
              )
            })}
          </div>

          <div className={TABLE_MQ_SHOW}>
            <Table className={GRID_TABLE}>
              <colgroup>
                <col className="w-11" />
                <col className="min-w-[12rem]" />
                <col className="min-w-[7rem]" />
                {paymentLedger ? (
                  <>
                    <col className="min-w-[8rem]" />
                    <col className="min-w-[8rem]" />
                    <col className="min-w-[8rem]" />
                  </>
                ) : (
                  <>
                    <col className="min-w-[10rem]" />
                    <col className="min-w-[7rem]" />
                    {showDue ? <col className="min-w-[8rem]" /> : null}
                  </>
                )}
                <col className="w-[9rem]" />
              </colgroup>
              <TableHeader>
                <TableRow className="border-stone-700 bg-stone-800 hover:bg-stone-800">
                  <TableHead className={cn('w-11', thBase)}>
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
                  <TableHead className={cn(thBase, 'text-left')}>Client</TableHead>
                  <TableHead className={thBase}>Date</TableHead>
                  {paymentLedger ? (
                    <>
                      <TableHead className={thBase}>Opening Balance</TableHead>
                      <TableHead className={thBase}>Payment Received</TableHead>
                      <TableHead className={thBase}>Balance Payment</TableHead>
                    </>
                  ) : (
                    <>
                      <TableHead className={thBase}>Status</TableHead>
                      <TableHead className={thBase}>Grand Total</TableHead>
                      {showDue ? <TableHead className={thBase}>Outstanding</TableHead> : null}
                    </>
                  )}
                  <TableHead className={thBase}>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r, index) => {
                  const selected = selectedIds.has(r.id)
                  const busy = statusUpdatingId === r.id
                  const ledger = paymentLedger
                    ? receiptLedgerSnapshot(
                        r,
                        r.client_id ? paymentOpeningByClientId?.[r.client_id] : undefined,
                      )
                    : null
                  return (
                    <TableRow
                      key={r.id}
                      className={cn(
                        selected ? rowSelectedClass : index % 2 === 0 ? rowEvenClass : rowOddClass,
                      )}
                    >
                      <TableCell className={tdClass}>
                        <input
                          type="checkbox"
                          className={checkboxClass}
                          aria-label={`Select ${r.quotation_number}`}
                          checked={selected}
                          onChange={() => onToggle(r.id)}
                        />
                      </TableCell>
                      <TableCell className={cn(tdClass, 'text-left')}>
                        <div className="min-w-0 space-y-0.5">
                          <p className="truncate text-[13px] font-bold text-[#1c1917]" title={r.client_name || undefined}>
                            {r.client_name || '—'}
                          </p>
                          <p className="truncate font-mono text-[11px] font-medium text-[#b45309]">
                            {r.quotation_number}
                          </p>
                          {againstInvoiceText(r, againstMode) ? (
                            <p className="truncate text-[11px] text-stone-600">{againstInvoiceText(r, againstMode)}</p>
                          ) : null}
                        </div>
                      </TableCell>
                      <TableCell className={tdClass}>
                        <div className="space-y-0.5">
                          <p className="font-semibold">{formatDate(r.quotation_date)}</p>
                          {!hideValidUntil && r.valid_until ? (
                            <p className="text-[11px] text-[#78716c]">Valid: {formatDate(r.valid_until)}</p>
                          ) : null}
                        </div>
                      </TableCell>
                      {paymentLedger && ledger ? (
                        <>
                          <TableCell className={tdClass}>
                            <MoneyLine amount={ledger.opening.amount} type={ledger.opening.type} />
                          </TableCell>
                          <TableCell className={tdClass}>
                            <MoneyLine amount={ledger.received} />
                            {receiptTdsText(r) ? (
                              <p className="mt-0.5 text-[11px] font-semibold text-stone-600">{receiptTdsText(r)}</p>
                            ) : null}
                          </TableCell>
                          <TableCell className={tdClass}>
                            <MoneyLine amount={ledger.after.amount} type={ledger.after.type} />
                          </TableCell>
                        </>
                      ) : (
                        <>
                          <TableCell className={tdClass}>
                            <StatusSelect
                              row={r}
                              busy={busy}
                              loading={loading}
                              statusOptions={statusOptions}
                              onStatusChange={onStatusChange}
                            />
                          </TableCell>
                          <TableCell className={cn(tdClass, 'font-semibold tabular-nums')}>
                            {getCurrencySymbol()} {formatMoney(r.grand_total)}
                          </TableCell>
                          {showDue ? (
                            <TableCell className={cn(tdClass, 'font-semibold tabular-nums')}>
                              {getCurrencySymbol()} {formatMoney(outstandingById?.[r.id] ?? r.grand_total)}
                              <span className="mt-0.5 block text-[11px] font-bold uppercase text-stone-600">
                                {invoiceDueLabel(r.grand_total, outstandingById?.[r.id] ?? r.grand_total)}
                              </span>
                              <span className="mt-0.5 block text-[11px] font-semibold text-stone-600">
                                {invoiceAgeLabel(
                                  r.quotation_date,
                                  outstandingById?.[r.id] ?? r.grand_total,
                                )}
                              </span>
                            </TableCell>
                          ) : null}
                        </>
                      )}
                      <TableCell className={tdClass}>
                        <div className="flex justify-center">
                          <RowActions
                            row={r}
                            busy={busy}
                            loading={loading}
                            emailBusyId={emailBusyId}
                            onEdit={onEdit}
                            onCopy={onCopy}
                            onPrint={onPrint}
                            onDownloadPdf={onDownloadPdf}
                            onEmailClient={onEmailClient}
                          />
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        </div>
      )}
    </div>
  )
}
