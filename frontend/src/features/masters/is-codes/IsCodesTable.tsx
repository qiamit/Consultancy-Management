import { ArrowDown, ArrowUp, ArrowUpDown, BookOpen, FolderOpen, Pencil } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from '@/components/ui/table'
import { QiAssistant } from '@/components/qi-assistant/QiAssistant'
import { buildIsCodeAssistantContext, formatIsCodeLabel } from './buildIsCodeAssistantContext'
import type { IsCodeRow } from './types'
import { limsPanelClass } from '@/lib/limsThemeUi'
import { cn } from '@/lib/utils'

export type IsCodeSortKey = 'isDetails' | 'title' | 'reaffirmation' | 'aspectCharges'
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

const TABLE_MQ_SHOW = 'hidden lg:block'
const CARDS_MQ_SHOW = 'lg:hidden'

const GRID_TABLE =
  'min-w-[860px] w-full border-collapse font-jakarta [&_th]:border [&_td]:border [&_th]:border-stone-700 [&_td]:border-[#e7e0d4] [&_th]:p-[1mm] [&_td]:!p-[1mm] [&_th]:sticky [&_th]:top-0 [&_th]:z-[1] [&_td]:static'

const thBase =
  'bg-stone-800 text-center text-[11px] font-bold uppercase tracking-[0.14em] text-amber-200'

const cellInnerClass = 'w-full space-y-1 p-[1mm]'
const primaryLineClass = 'text-[12.5px] font-semibold tracking-tight text-[#292524]'
const secondaryLineClass = 'text-[11px] font-medium leading-snug text-[#78716c]'
const identityClass = 'truncate text-[13px] font-bold tracking-[-0.015em] text-[#1c1917]'
const metaLineClass = 'truncate font-mono text-[11px] font-medium tracking-normal text-[#b45309]'

const rowEvenClass = 'bg-[#f7f3eb] hover:bg-[#f3e9d8]'
const rowOddClass = 'bg-[#fffcf7] hover:bg-[#f3e9d8]'
const rowSelectedClass = 'bg-[#fde68a]/80 hover:bg-[#fde68a]/80'

const checkboxClass =
  'h-4 w-4 rounded-none border-stone-500 text-amber-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/30'

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
  loading,
  error,
  searchActive,
  selectedIds,
  onToggle,
  onToggleAll,
  onEdit,
  onViewFiles,
  onAssistantDataChanged,
  idsWithFiles,
  sortKey,
  sortDir,
  onSort,
}: {
  rows: IsCodeRow[]
  loading: boolean
  error: string | null
  searchActive?: boolean
  selectedIds: Set<string>
  onToggle: (id: string) => void
  onToggleAll: (checked: boolean) => void
  onEdit: (row: IsCodeRow) => void
  onViewFiles: (row: IsCodeRow) => void
  onAssistantDataChanged?: () => void
  idsWithFiles: Set<string>
  sortKey: IsCodeSortKey
  sortDir: IsCodeSortDir
  onSort: (key: IsCodeSortKey) => void
}) {
  const allChecked = rows.length > 0 && rows.every((r) => selectedIds.has(r.id))
  const someChecked = rows.some((r) => selectedIds.has(r.id))

  return (
    <div className={cn(limsPanelClass, 'flex h-full min-h-0 flex-col bg-[#f7f3eb]')}>
      {error ? (
        <p className="shrink-0 px-3 pt-3 text-sm text-red-600 sm:px-5 sm:pt-4">{error}</p>
      ) : null}

      {loading ? (
        <p className="px-5 py-8 text-center text-sm text-[#78716c]">Loading…</p>
      ) : rows.length === 0 ? (
        <div className="m-3 border border-dashed border-[#d6d3d1] bg-[#fffcf7] p-4 text-center sm:m-4 sm:p-6">
          <p className="text-sm text-[#57534e]">
            {searchActive ? 'No IS codes match your search.' : 'No IS codes added yet.'}
          </p>
          {!searchActive ? (
            <p className="mt-1 text-xs text-[#78716c]">Use &quot;Add New IS Code&quot; to create your first record.</p>
          ) : null}
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto overflow-x-auto overscroll-contain [-webkit-overflow-scrolling:touch]">
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
                {selectedIds.size > 0 ? `${selectedIds.size} selected` : `${rows.length} IS codes`}
              </span>
            </div>

            {rows.map((r, index) => {
              const selected = selectedIds.has(r.id)
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
                      <div className="flex items-start gap-2 px-2.5 py-2.5">
                        <input
                          type="checkbox"
                          className={cn(checkboxClass, 'mt-1 shrink-0')}
                          aria-label={`Select ${formatIsCodeLabel(r)}`}
                          checked={selected}
                          onChange={() => onToggle(r.id)}
                        />
                        <div className="min-w-0 flex-1 space-y-1">
                          <div className="flex items-start gap-2">
                            <BookOpen className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-700" aria-hidden />
                            <div className="min-w-0 flex-1">
                              <p className={identityClass} title={formatIsCodeLabel(r)}>
                                {formatIsCodeLabel(r)}
                              </p>
                              <p className="text-[12px] font-semibold leading-snug text-[#292524]" title={r.title}>
                                {r.title}
                              </p>
                            </div>
                          </div>
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="border border-stone-400 bg-stone-100 px-1.5 py-0.5 text-[10px] font-semibold text-stone-700">
                              {r.aspect || '—'}
                            </span>
                            <span className="border border-amber-700/40 bg-amber-50 px-1.5 py-0.5 font-mono text-[10px] font-bold text-amber-800">
                              {formatCharges(r)}
                            </span>
                            <span className="border border-stone-400 bg-white px-1.5 py-0.5 text-[10px] text-stone-600">
                              {formatReaffirmation(r)} · Amd {formatAmendment(r)}
                            </span>
                          </div>
                        </div>
                        <RowActions
                          row={r}
                          hasFiles={idsWithFiles.has(r.id)}
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
                <col className="min-w-[11rem]" />
                <col className="min-w-[14rem]" />
                <col className="min-w-[9rem]" />
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
                    className={cn('min-w-[11rem] text-left', thBase)}
                    align="left"
                  />
                  <SortableHeader
                    label="IS Title"
                    columnKey="title"
                    sortKey={sortKey}
                    sortDir={sortDir}
                    onSort={onSort}
                    className={cn('min-w-[14rem]', thBase)}
                  />
                  <SortableHeader
                    label="Reaffirmation / Amendment"
                    columnKey="reaffirmation"
                    sortKey={sortKey}
                    sortDir={sortDir}
                    onSort={onSort}
                    className={cn('min-w-[9rem]', thBase)}
                  />
                  <SortableHeader
                    label="Aspect & Charges"
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
                      <TableCell className="min-w-[11rem] align-middle text-left">
                        <div className={cn(cellInnerClass, 'text-left')}>
                          <p className={identityClass} title={formatIsCodeLabel(r)}>
                            {formatIsCodeLabel(r)}
                          </p>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className={cn(
                              'mt-1 h-7 gap-1 rounded-none px-2 text-[11px]',
                              viewFilesBtnClass(idsWithFiles.has(r.id)),
                            )}
                            onClick={() => onViewFiles(r)}
                            aria-label={`View files for ${formatIsCodeLabel(r)}`}
                            title={idsWithFiles.has(r.id) ? 'Files available' : 'No files uploaded'}
                          >
                            View Files
                            <FolderOpen size={12} />
                          </Button>
                        </div>
                      </TableCell>
                      <TableCell className="min-w-[14rem] align-middle text-center">
                        <div className={cn(cellInnerClass, 'text-center')}>
                          <p className={primaryLineClass}>{r.title}</p>
                        </div>
                      </TableCell>
                      <TableCell className="min-w-[9rem] align-middle text-center">
                        <div className={cn(cellInnerClass, 'text-center')}>
                          <p className={primaryLineClass}>{formatReaffirmation(r)}</p>
                          <p className={secondaryLineClass}>Amendment: {formatAmendment(r)}</p>
                        </div>
                      </TableCell>
                      <TableCell className="min-w-[9rem] align-middle text-center">
                        <div className={cn(cellInnerClass, 'text-center')}>
                          <p className={primaryLineClass}>{r.aspect}</p>
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
