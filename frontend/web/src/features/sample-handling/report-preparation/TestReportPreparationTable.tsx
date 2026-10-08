import { ArrowDown, ArrowUp, ArrowUpDown, Eye, FileText, Undo2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import {
  limsPanelClass,
  limsTableClass,
  limsTableHeadClass,
} from '@/lib/limsThemeUi'
import { cn, formatDate } from '@/lib/utils'
import type { ReportPreparationListRow } from './buildTestReportPreparationAssistantContext'
import type { TestReportPreparationSortKey } from './sortTestReportPreparationRows'

const fmt = (v: string | null | undefined) => (v && String(v).trim() ? String(v).trim() : '—')

const thClass = cn(limsTableHeadClass, 'border border-stone-700 !p-2')
const tdClass = 'border border-[#e7e0d4] !p-2 align-middle text-xs text-[#292524]'
const rowEvenClass = 'bg-[#f7f3eb] hover:bg-[#f3e9d8]'
const rowOddClass = 'bg-[#fffcf7] hover:bg-[#f3e9d8]'
const checkboxClass =
  'h-4 w-4 rounded-none border-stone-500 text-amber-700 accent-amber-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/30'
const actionBtnClass =
  'h-8 w-8 rounded-none border border-amber-700/50 bg-[#fde68a]/70 text-[#78350f] shadow-none hover:bg-amber-700 hover:text-white hover:border-amber-800'
const eyeIconBtnClass =
  'h-7 w-7 shrink-0 rounded-none border border-amber-700/50 bg-[#fde68a]/70 text-[#78350f] shadow-none hover:bg-amber-700 hover:text-white hover:border-amber-800'

function SortableHead({
  label,
  columnKey,
  sortKey,
  sortDir,
  onSort,
  className,
}: {
  label: string
  columnKey: TestReportPreparationSortKey
  sortKey: TestReportPreparationSortKey
  sortDir: 'asc' | 'desc'
  onSort: (key: TestReportPreparationSortKey) => void
  className?: string
}) {
  const active = sortKey === columnKey
  const Icon = active ? (sortDir === 'asc' ? ArrowUp : ArrowDown) : ArrowUpDown

  return (
    <TableHead className={cn(thClass, className)}>
      <button
        type="button"
        className="inline-flex w-full items-center justify-center gap-1 text-[11px] font-bold uppercase tracking-[0.14em] text-amber-200 hover:text-amber-100"
        onClick={() => onSort(columnKey)}
        aria-label={`Sort by ${label}${active ? `, ${sortDir === 'asc' ? 'ascending' : 'descending'}` : ''}`}
      >
        <span>{label}</span>
        <Icon className={cn('h-3.5 w-3.5 shrink-0', active ? 'text-amber-300' : 'text-amber-200/60')} />
      </button>
    </TableHead>
  )
}

export function TestReportPreparationTable({
  rows,
  loading,
  error,
  selectedIds,
  onToggle,
  onToggleAll,
  onViewSrf,
  onViewResults,
  onPrepare,
  onReferback,
  referbackBusyId,
  canReferback,
  sortKey,
  sortDir,
  onSort,
}: {
  rows: ReportPreparationListRow[]
  loading: boolean
  error: string | null
  selectedIds: Set<string>
  onToggle: (id: string) => void
  onToggleAll: (checked: boolean) => void
  onViewSrf: (row: ReportPreparationListRow) => void
  onViewResults: (row: ReportPreparationListRow) => void
  onPrepare: (row: ReportPreparationListRow) => void
  onReferback: (row: ReportPreparationListRow) => void
  referbackBusyId: string | null
  canReferback: boolean
  sortKey: TestReportPreparationSortKey
  sortDir: 'asc' | 'desc'
  onSort: (key: TestReportPreparationSortKey) => void
}) {
  const allChecked = rows.length > 0 && rows.every((r) => selectedIds.has(r.id))
  const someChecked = rows.some((r) => selectedIds.has(r.id))

  return (
    <div className={cn(limsPanelClass, 'overflow-hidden bg-[#f7f3eb]')}>
      {error ? <p className="px-4 pt-4 text-sm text-red-700 sm:px-5">{error}</p> : null}

      {loading ? (
        <p className="px-4 py-6 text-sm text-[#78716c] sm:px-5">Loading…</p>
      ) : rows.length === 0 ? (
        <div className="m-3 border border-dashed border-[#d6d3d1] bg-[#fffcf7] p-4 text-center sm:m-4 sm:p-6">
          <p className="text-sm text-[#57534e]">
            No SRFs approved and ready for test report yet. Approve all sections in Results Under
            Review first.
          </p>
        </div>
      ) : (
        <Table className={cn(limsTableClass, 'min-w-[820px] table-fixed')}>
          <colgroup>
            <col className="w-[44px]" />
            <col className="w-[22%]" />
            <col className="w-[18%]" />
            <col className="w-[18%]" />
            <col className="w-[14%]" />
            <col className="w-[140px]" />
          </colgroup>
          <TableHeader>
            <TableRow className="border-stone-700 bg-stone-800 hover:bg-stone-800">
              <TableHead className={cn(thClass, 'w-[44px] text-center')}>
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
              <SortableHead
                label="SRF"
                columnKey="srfNumber"
                sortKey={sortKey}
                sortDir={sortDir}
                onSort={onSort}
                className="[&_button]:justify-start"
              />
              <SortableHead
                label="Client"
                columnKey="clientName"
                sortKey={sortKey}
                sortDir={sortDir}
                onSort={onSort}
              />
              <SortableHead
                label="IS Code"
                columnKey="isCode"
                sortKey={sortKey}
                sortDir={sortDir}
                onSort={onSort}
              />
              <SortableHead
                label="Received Date"
                columnKey="dateReceiving"
                sortKey={sortKey}
                sortDir={sortDir}
                onSort={onSort}
              />
              <TableHead className={cn(thClass, 'text-center')}>Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r, index) => (
              <TableRow key={r.id} className={index % 2 === 0 ? rowEvenClass : rowOddClass}>
                <TableCell className={cn(tdClass, 'text-center')}>
                  <input
                    type="checkbox"
                    className={checkboxClass}
                    aria-label={`Select ${fmt(r.srfNumber)}`}
                    checked={selectedIds.has(r.id)}
                    onChange={() => onToggle(r.id)}
                  />
                </TableCell>
                <TableCell className={cn(tdClass, 'pl-3 text-left font-medium')}>
                  <div className="flex min-w-0 items-center justify-between gap-2">
                    <div className="min-w-0 flex-1 line-clamp-2 break-words leading-snug">
                      {fmt(r.srfNumber)}
                    </div>
                    <Button
                      type="button"
                      size="icon"
                      variant="outline"
                      className={eyeIconBtnClass}
                      aria-label={`View sample details for ${fmt(r.srfNumber)}`}
                      title="View Sample Details"
                      onClick={() => onViewSrf(r)}
                    >
                      <Eye size={15} strokeWidth={2.35} />
                    </Button>
                  </div>
                </TableCell>
                <TableCell className={cn(tdClass, 'text-center')}>
                  <div className="line-clamp-2 break-words leading-snug">{fmt(r.clientName)}</div>
                </TableCell>
                <TableCell className={cn(tdClass, 'text-center')}>
                  <div className="line-clamp-2 break-words leading-snug">{fmt(r.isCodeLabel)}</div>
                </TableCell>
                <TableCell className={cn(tdClass, 'text-center text-[#78716c]')}>
                  {formatDate(r.dateReceiving ?? '')}
                </TableCell>
                <TableCell className={cn(tdClass, 'text-center')}>
                  <div className="inline-flex items-center justify-center gap-1.5">
                    <Button
                      type="button"
                      size="icon"
                      variant="outline"
                      className={actionBtnClass}
                      aria-label={`View test results for ${fmt(r.srfNumber)}`}
                      title="View Results"
                      onClick={() => onViewResults(r)}
                    >
                      <Eye size={17} strokeWidth={2.35} />
                    </Button>
                    <Button
                      type="button"
                      size="icon"
                      variant="outline"
                      className={actionBtnClass}
                      aria-label={`Prepare report for ${fmt(r.srfNumber)}`}
                      title="Prepare Report (Clause 7.8)"
                      onClick={() => onPrepare(r)}
                      disabled={referbackBusyId === r.id}
                    >
                      <FileText size={17} strokeWidth={2.35} />
                    </Button>
                    <Button
                      type="button"
                      size="icon"
                      variant="outline"
                      className={actionBtnClass}
                      aria-label={`Refer back ${fmt(r.srfNumber)}`}
                      title="Refer Back"
                      onClick={() => onReferback(r)}
                      disabled={!canReferback || referbackBusyId === r.id}
                    >
                      <Undo2 size={17} strokeWidth={2.35} />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  )
}
