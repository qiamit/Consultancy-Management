import { ArrowDown, ArrowUp, ArrowUpDown, BookOpen, FolderOpen, Pencil } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from '@/components/ui/table'
import { QiAssistant } from '@/components/qi-assistant/QiAssistant'
import { buildIsCodeAssistantContext, formatIsCodeLabel } from './buildIsCodeAssistantContext'
import type { IsCodeRow } from './types'
import { formatInr } from './types'
import { limsPanelClass } from '@/lib/limsThemeUi'
import { cn } from '@/lib/utils'

export type IsCodeSortKey = 'isDetails' | 'slabRate' | 'title' | 'markingFee' | 'aspectCharges'
export type IsCodeSortDir = 'asc' | 'desc'

function SortableHeader({
  label,
  columnKey,
  sortKey,
  sortDir,
  onSort,
  className,
  align = 'center',
}: {
  label: string
  columnKey: IsCodeSortKey
  sortKey: IsCodeSortKey
  sortDir: IsCodeSortDir
  onSort: (key: IsCodeSortKey) => void
  className?: string
  align?: 'left' | 'center'
}) {
  const active = sortKey === columnKey
  const Icon = active ? (sortDir === 'asc' ? ArrowUp : ArrowDown) : ArrowUpDown

  return (
    <TableHead className={className}>
      <button
        type="button"
        className={cn(
          'inline-flex w-full items-center gap-1 text-amber-200 transition-colors hover:text-amber-100',
          align === 'left' ? 'justify-start text-left' : 'justify-center text-center',
        )}
        onClick={() => onSort(columnKey)}
        aria-label={`Sort by ${label}${active ? `, ${sortDir === 'asc' ? 'ascending' : 'descending'}` : ''}`}
      >
        <span>{label}</span>
        <Icon className={cn('h-3.5 w-3.5 shrink-0', active ? 'text-amber-300' : 'text-amber-200/60')} />
      </button>
    </TableHead>
  )
}

/** ~10″ / wide desktop: table. Narrower viewports: stacked cards. */
const TABLE_MQ_SHOW = 'hidden xl:block'
const CARDS_MQ_SHOW = 'xl:hidden'

const GRID_TABLE =
  'min-w-[1100px] w-full border-collapse font-jakarta [&_th]:border [&_td]:border [&_th]:border-stone-700 [&_td]:border-[#e7e0d4] [&_th]:p-[1mm] [&_td]:!p-[1mm] [&_th]:sticky [&_th]:top-0 [&_th]:z-[1] [&_td]:static'

const thBase =
  'bg-stone-800 text-center text-[11px] font-bold uppercase tracking-[0.14em] text-amber-200'

const cellInnerClass = 'w-full space-y-0.5 p-[1mm]'
const primaryLineClass = 'text-[12.5px] font-semibold tracking-tight text-[#292524]'
const secondaryLineClass = 'text-[11px] font-medium leading-snug text-[#78716c]'
const identityClass = 'truncate text-[13px] font-bold tracking-[-0.015em] text-[#1c1917]'
const metaLineClass = 'truncate font-mono text-[11px] font-medium tracking-normal text-[#b45309]'

const rowEvenClass = 'bg-[#f7f3eb] hover:bg-[#f3e9d8]'
const rowOddClass = 'bg-[#fffcf7] hover:bg-[#f3e9d8]'
const rowSelectedClass = 'bg-[#fde68a]/80 hover:bg-[#fde68a]/80'

const checkboxClass =
  'h-4 w-4 rounded-none border-stone-500 text-amber-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/30'

function dash(v: string | number | null | undefined): string {
  if (v == null) return '—'
  const t = String(v).trim()
  return t.length > 0 ? t : '—'
}

function formatReaffirmation(row: IsCodeRow): string {
  if (row.reaffirmation_year != null && String(row.reaffirmation_year).trim() !== '') {
    return String(row.reaffirmation_year).replace(/^RA(?=\d)/i, 'RA ')
  }
  return '—'
}

function formatAmendment(row: IsCodeRow): string {
  if (row.amendment_number != null && String(row.amendment_number).trim() !== '') {
    return String(row.amendment_number)
  }
  return '—'
}

function formatCharges(row: IsCodeRow): string {
  return `Rs ${Number(row.testing_charges ?? 0).toFixed(2)}`
}

function viewFilesBtnClass(hasFiles: boolean) {
  return hasFiles
    ? 'border-emerald-700/60 bg-emerald-600 text-white hover:bg-emerald-700 hover:text-white'
    : 'border-red-700/60 bg-red-600 text-white hover:bg-red-700 hover:text-white'
}

function RowActions({
  row,
  hasFiles,
  onEdit,
  onViewFiles,
  onAssistantDataChanged,
}: {
  row: IsCodeRow
  hasFiles: boolean
  onEdit: (row: IsCodeRow) => void
  onViewFiles: (row: IsCodeRow) => void
  onAssistantDataChanged?: () => void
}) {
  return (
    <div className="flex shrink-0 items-center gap-0.5">
      <Button
        type="button"
        size="sm"
        variant="ghost"
        className="h-8 w-8 rounded-none p-0 text-[#92400e] hover:bg-[#f3e9d8] hover:text-[#78350f]"
        aria-label={`Edit ${formatIsCodeLabel(row)}`}
        onClick={() => onEdit(row)}
      >
        <Pencil size={16} />
      </Button>
      <QiAssistant
        page="is-codes"
        pageTitle={formatIsCodeLabel(row)}
        contextSummary={buildIsCodeAssistantContext(row)}
        isCodeId={row.id}
        triggerVariant="icon"
        welcomeMessage=""
        suggestedQuestions={[]}
        onDataChanged={onAssistantDataChanged}
        enablePdfImport={false}
        triggerClassName="h-8 w-8 shrink-0 rounded-none border-stone-400 bg-transparent text-[#92400e] hover:bg-[#f3e9d8]"
      />
      <Button
        type="button"
        size="sm"
        variant="outline"
        className={cn(
          'h-8 gap-1 rounded-none px-1.5 text-[11px] lg:hidden',
          viewFilesBtnClass(hasFiles),
        )}
        aria-label={`View files for ${formatIsCodeLabel(row)}`}
        title={hasFiles ? 'Files available' : 'No files uploaded'}
        onClick={() => onViewFiles(row)}
      >
        <FolderOpen size={14} />
        Files
      </Button>
    </div>
  )
}

export function IsCodesTable({
  rows,
  selectedIds,
  idsWithFiles,
  sortKey,
  sortDir,
  onSort,
  onToggle,
  onToggleAll,
  onEdit,
  onViewFiles,
  onAssistantDataChanged,
}: {
  rows: IsCodeRow[]
  selectedIds: Set<string>
  idsWithFiles: Set<string>
  sortKey: IsCodeSortKey
  sortDir: IsCodeSortDir
  onSort: (key: IsCodeSortKey) => void
  onToggle: (id: string) => void
  onToggleAll: (checked: boolean) => void
  onEdit: (row: IsCodeRow) => void
  onViewFiles: (row: IsCodeRow) => void
  onAssistantDataChanged?: () => void
}) {
  const allChecked = rows.length > 0 && rows.every((r) => selectedIds.has(r.id))
  const someChecked = rows.some((r) => selectedIds.has(r.id))

  return (
    <div className={cn(limsPanelClass, 'flex h-full min-h-0 flex-col bg-[#f7f3eb]')}>
      {rows.length === 0 ? (
        <div className="flex flex-1 items-center justify-center px-4 py-16 text-sm text-stone-500">
          No IS codes found.
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto overflow-x-auto overscroll-contain [-webkit-overflow-scrolling:touch]">
          <div className={cn(CARDS_MQ_SHOW, 'space-y-2 p-2')}>
            <div className="flex items-center justify-between gap-2 border-b border-stone-400 px-1 pb-2 text-stone-600">
              <label className="inline-flex items-center gap-2 text-[12px] font-semibold">
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
                Select page
              </label>
              <span className="text-[11px] font-bold uppercase tracking-[0.14em]">
                {selectedIds.size > 0 ? `${selectedIds.size} selected` : `${rows.length} IS codes`}
              </span>
            </div>

            {rows.map((r, index) => {
              const selected = selectedIds.has(r.id)
              const hasFiles = idsWithFiles.has(r.id)
              const even = index % 2 === 0
              const tone = selected ? 'bg-[#fde68a]/70' : even ? 'bg-[#fffcf7]' : 'bg-white'

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
                          aria-label={`Select ${formatIsCodeLabel(r)}`}
                          checked={selected}
                          onChange={() => onToggle(r.id)}
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <BookOpen className="h-3.5 w-3.5 shrink-0 text-amber-700" aria-hidden />
                            <p className="truncate text-[14px] font-bold tracking-tight text-[#1c1917]">
                              {formatIsCodeLabel(r)}
                            </p>
                          </div>
                          <p className="mt-1 text-[12.5px] font-semibold leading-snug text-[#292524]">
                            {r.title}
                          </p>
                          <p className="mt-0.5 text-[11px] text-[#78716c]">
                            PM: {dash(r.product_manual_number)} · {dash(r.unit_of_is)}
                          </p>
                        </div>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className={cn(
                            'h-8 shrink-0 gap-1 rounded-none px-2 text-[11px]',
                            viewFilesBtnClass(hasFiles),
                          )}
                          onClick={() => onViewFiles(r)}
                          aria-label={`View files for ${formatIsCodeLabel(r)}`}
                          title={hasFiles ? 'Files available' : 'No files uploaded'}
                        >
                          <FolderOpen size={13} />
                          Files
                        </Button>
                      </div>

                      <div className="grid grid-cols-2 gap-px border-b border-[#e7e0d4] bg-[#e7e0d4] sm:grid-cols-3">
                        <div className="bg-[#fffcf7] px-2.5 py-2">
                          <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-stone-500">
                            Aspect / Charges
                          </p>
                          <p className="mt-0.5 text-[12px] font-semibold text-[#292524]">
                            {r.aspect || '—'}
                          </p>
                          <p className="mt-0.5 font-mono text-[12px] font-bold text-[#b45309]">
                            {formatCharges(r)}
                          </p>
                        </div>
                        <div className="bg-[#fffcf7] px-2.5 py-2">
                          <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-stone-500">
                            Marking Fee
                          </p>
                          <p className="mt-0.5 text-[11px] font-medium tabular-nums text-[#292524]">
                            L {formatInr(r.mmf_large_scale)} · M {formatInr(r.mmf_medium_scale)}
                          </p>
                          <p className="text-[11px] font-medium tabular-nums text-[#292524]">
                            S {formatInr(r.mmf_small_scale)} · µ {formatInr(r.mmf_micro_scale)}
                          </p>
                        </div>
                        <div className="col-span-2 bg-[#fffcf7] px-2.5 py-2 sm:col-span-1">
                          <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-stone-500">
                            Slab Rate
                          </p>
                          <p className="mt-0.5 text-[11px] tabular-nums text-[#292524]">
                            {dash(r.slab_1_quantity)} / {formatInr(r.slab_1_rate)}
                          </p>
                          <p className="text-[11px] tabular-nums text-[#78716c]">
                            {dash(r.slab_2_quantity)} / {formatInr(r.slab_2_rate)}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center justify-between gap-2 bg-[#f7f3eb]/80 px-2.5 py-1.5">
                        <span className="text-[10px] font-medium uppercase tracking-[0.1em] text-stone-500">
                          RA {formatReaffirmation(r)} · Amd {formatAmendment(r)}
                        </span>
                        <RowActions
                          row={r}
                          hasFiles={hasFiles}
                          onEdit={onEdit}
                          onViewFiles={onViewFiles}
                          onAssistantDataChanged={onAssistantDataChanged}
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
                <col className="min-w-[10rem]" />
                <col className="min-w-[11rem]" />
                <col className="min-w-[12rem]" />
                <col className="min-w-[11rem]" />
                <col className="min-w-[9rem]" />
                <col className="w-[6.5rem]" />
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
                  <SortableHeader
                    label="IS Details"
                    columnKey="isDetails"
                    sortKey={sortKey}
                    sortDir={sortDir}
                    onSort={onSort}
                    className={cn('min-w-[10rem] text-left', thBase)}
                    align="left"
                  />
                  <SortableHeader
                    label="Slab Rate"
                    columnKey="slabRate"
                    sortKey={sortKey}
                    sortDir={sortDir}
                    onSort={onSort}
                    className={cn('min-w-[11rem]', thBase)}
                  />
                  <SortableHeader
                    label="Title & Manual"
                    columnKey="title"
                    sortKey={sortKey}
                    sortDir={sortDir}
                    onSort={onSort}
                    className={cn('min-w-[12rem]', thBase)}
                  />
                  <SortableHeader
                    label="Marking Fee"
                    columnKey="markingFee"
                    sortKey={sortKey}
                    sortDir={sortDir}
                    onSort={onSort}
                    className={cn('min-w-[11rem]', thBase)}
                  />
                  <SortableHeader
                    label="Files & Charges"
                    columnKey="aspectCharges"
                    sortKey={sortKey}
                    sortDir={sortDir}
                    onSort={onSort}
                    className={cn('min-w-[9rem]', thBase)}
                  />
                  <TableHead className={cn('w-[6.5rem]', thBase)}>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r, index) => {
                  const selected = selectedIds.has(r.id)
                  const even = index % 2 === 0
                  const rowTone = selected ? rowSelectedClass : even ? rowEvenClass : rowOddClass

                  return (
                    <TableRow
                      key={r.id}
                      data-state={selected ? 'selected' : undefined}
                      className={cn('group border-[#e7e0d4] transition-colors', rowTone)}
                    >
                      <TableCell className="w-11 text-center align-middle">
                        <input
                          type="checkbox"
                          className={checkboxClass}
                          aria-label={`Select ${formatIsCodeLabel(r)}`}
                          checked={selected}
                          onChange={() => onToggle(r.id)}
                        />
                      </TableCell>
                      <TableCell className="min-w-[10rem] align-middle text-left">
                        <div className={cn(cellInnerClass, 'text-left')}>
                          <p className={identityClass} title={formatIsCodeLabel(r)}>
                            {formatIsCodeLabel(r)}
                          </p>
                          <p className={secondaryLineClass}>
                            {formatReaffirmation(r)} | Amd {formatAmendment(r)}
                          </p>
                          <p className={secondaryLineClass}>{dash(r.aspect)}</p>
                        </div>
                      </TableCell>
                      <TableCell className="min-w-[11rem] align-middle text-center">
                        <div className={cn(cellInnerClass, 'text-center')}>
                          <p className={cn(secondaryLineClass, 'tabular-nums')}>
                            {dash(r.slab_1_quantity)} / {formatInr(r.slab_1_rate)}
                          </p>
                          <p className={cn(secondaryLineClass, 'tabular-nums')}>
                            {dash(r.slab_2_quantity)} / {formatInr(r.slab_2_rate)}
                          </p>
                          <p className={cn(secondaryLineClass, 'tabular-nums')}>
                            {dash(r.slab_3_quantity)} / {formatInr(r.slab_3_rate)}
                          </p>
                        </div>
                      </TableCell>
                      <TableCell className="min-w-[12rem] align-middle text-center">
                        <div className={cn(cellInnerClass, 'text-center')}>
                          <p className={primaryLineClass}>{r.title}</p>
                          <p className={secondaryLineClass}>{dash(r.product_manual_number)}</p>
                        </div>
                      </TableCell>
                      <TableCell className="min-w-[11rem] align-middle text-center">
                        <div className={cn(cellInnerClass, 'text-center')}>
                          <p className={cn(secondaryLineClass, 'tabular-nums')}>
                            L - {formatInr(r.mmf_large_scale)} | M - {formatInr(r.mmf_medium_scale)}
                          </p>
                          <p className={cn(secondaryLineClass, 'tabular-nums')}>
                            S - {formatInr(r.mmf_small_scale)} | µ - {formatInr(r.mmf_micro_scale)}
                          </p>
                          <p className={secondaryLineClass}>Unit: {dash(r.unit_of_is)}</p>
                        </div>
                      </TableCell>
                      <TableCell className="min-w-[9rem] align-middle text-center">
                        <div className={cn(cellInnerClass, 'items-center text-center')}>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className={cn(
                              'mx-auto h-7 gap-1 rounded-none px-2 text-[11px]',
                              viewFilesBtnClass(idsWithFiles.has(r.id)),
                            )}
                            onClick={() => onViewFiles(r)}
                            aria-label={`View files for ${formatIsCodeLabel(r)}`}
                            title={idsWithFiles.has(r.id) ? 'Files available' : 'No files uploaded'}
                          >
                            View Files
                            <FolderOpen size={12} />
                          </Button>
                          <p className={cn(metaLineClass, 'text-center')}>{formatCharges(r)}</p>
                        </div>
                      </TableCell>
                      <TableCell className="w-[6.5rem] align-middle text-center">
                        <div className="flex w-full items-center justify-center gap-0.5 p-[1mm]">
                          <RowActions
                            row={r}
                            hasFiles={idsWithFiles.has(r.id)}
                            onEdit={onEdit}
                            onViewFiles={onViewFiles}
                            onAssistantDataChanged={onAssistantDataChanged}
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
