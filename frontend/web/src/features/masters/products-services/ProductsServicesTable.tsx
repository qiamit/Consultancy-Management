import { ArrowDown, ArrowUp, ArrowUpDown, Copy, Package, Pencil } from 'lucide-react'
import { getCurrencySymbol } from '@/lib/appCurrency'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { limsPanelClass } from '@/lib/limsThemeUi'
import { cn } from '@/lib/utils'
import { formatMoney, type ProductServiceRow } from './types'

export type ProductServiceSortKey = 'itemIdentity' | 'typeCategory' | 'pricing' | 'stockUom'
export type ProductServiceSortDir = 'asc' | 'desc'

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
  columnKey: ProductServiceSortKey
  sortKey: ProductServiceSortKey
  sortDir: ProductServiceSortDir
  onSort: (key: ProductServiceSortKey) => void
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

const TABLE_MQ_SHOW = 'hidden xl:block'
const CARDS_MQ_SHOW = 'xl:hidden'

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

const actionBtnClass =
  'h-8 w-8 rounded-none p-0 text-[#92400e] hover:bg-[#f3e9d8] hover:text-[#78350f]'

function RowActions({
  row,
  onEdit,
  onCopy,
}: {
  row: ProductServiceRow
  onEdit: (row: ProductServiceRow) => void
  onCopy: (row: ProductServiceRow) => void
}) {
  return (
    <div className="flex shrink-0 items-center gap-0.5">
      <Button
        type="button"
        size="sm"
        variant="ghost"
        className={actionBtnClass}
        aria-label={`Edit ${row.item_code}`}
        onClick={() => onEdit(row)}
      >
        <Pencil size={16} />
      </Button>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        className={actionBtnClass}
        aria-label={`Copy ${row.item_code}`}
        onClick={() => onCopy(row)}
      >
        <Copy size={16} />
      </Button>
    </div>
  )
}

export function ProductsServicesTable({
  rows,
  loading,
  error,
  searchActive,
  selectedIds,
  onToggle,
  onToggleAll,
  onEdit,
  onCopy,
  sortKey,
  sortDir,
  onSort,
}: {
  rows: ProductServiceRow[]
  loading: boolean
  error: string | null
  searchActive?: boolean
  selectedIds: Set<string>
  onToggle: (id: string) => void
  onToggleAll: (checked: boolean) => void
  onEdit: (row: ProductServiceRow) => void
  onCopy: (row: ProductServiceRow) => void
  sortKey: ProductServiceSortKey
  sortDir: ProductServiceSortDir
  onSort: (key: ProductServiceSortKey) => void
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
            {searchActive ? 'No items match your search.' : 'No products or services added yet.'}
          </p>
          {!searchActive ? (
            <p className="mt-1 text-xs text-[#78716c]">Use &quot;Add New Item&quot; to create your first record.</p>
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
                {selectedIds.size > 0 ? `${selectedIds.size} selected` : `${rows.length} items`}
              </span>
            </div>

            {rows.map((r, index) => {
              const selected = selectedIds.has(r.id)
              const even = index % 2 === 0
              const tone = selected ? 'bg-[#fde68a]/70' : even ? 'bg-[#fffcf7]' : 'bg-white'
              const lowStock =
                r.item_type === 'Product' && Number(r.opening_stock) <= Number(r.low_stock_alert)

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
                          aria-label={`Select ${r.item_code}`}
                          checked={selected}
                          onChange={() => onToggle(r.id)}
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <Package className="h-3.5 w-3.5 shrink-0 text-amber-700" aria-hidden />
                            <p className="truncate text-[14px] font-bold tracking-tight text-[#1c1917]" title={r.item_name}>
                              {r.item_name}
                              {r.archived_at ? (
                                <span className="ml-1 bg-stone-200 px-1 text-[9px] font-semibold uppercase text-stone-600">
                                  Archived
                                </span>
                              ) : null}
                            </p>
                          </div>
                          <p className={cn(metaLineClass, 'mt-0.5')}>
                            {r.item_code}
                            {r.hsn_code ? ` · HSN: ${r.hsn_code}` : ''}
                          </p>
                        </div>
                        <RowActions row={r} onEdit={onEdit} onCopy={onCopy} />
                      </div>

                      <div className="grid grid-cols-2 gap-px border-b border-[#e7e0d4] bg-[#e7e0d4] sm:grid-cols-3">
                        <div className="bg-[#fffcf7] px-2.5 py-2">
                          <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-stone-500">
                            Type / Category
                          </p>
                          <p className="mt-0.5 text-[12px] font-semibold text-[#292524]">{r.item_type}</p>
                          <p className="text-[11px] text-[#78716c]">{r.item_category}</p>
                        </div>
                        <div className="bg-[#fffcf7] px-2.5 py-2">
                          <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-stone-500">
                            Pricing
                          </p>
                          <p className="mt-0.5 text-[12px] font-semibold text-[#292524]">
                            Sale: {getCurrencySymbol()} {formatMoney(r.sale_price)}
                          </p>
                          <p className="text-[11px] text-[#78716c]">
                            GST {formatMoney(r.gst_percent)}% · Disc {getCurrencySymbol()}{' '}
                            {formatMoney(r.discount)}
                          </p>
                        </div>
                        <div className="col-span-2 bg-[#fffcf7] px-2.5 py-2 sm:col-span-1">
                          <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-stone-500">
                            Stock / UOM
                          </p>
                          <p className="mt-0.5 text-[12px] font-semibold text-[#292524]">
                            {r.unit_of_measurement || '—'}
                          </p>
                          {r.item_type === 'Product' ? (
                            <p
                              className={cn(
                                'text-[11px]',
                                lowStock ? 'font-semibold text-red-700' : 'text-[#78716c]',
                              )}
                            >
                              Stock: {r.opening_stock}
                              {lowStock ? ' · Low' : ''}
                            </p>
                          ) : (
                            <p className="text-[11px] text-[#78716c]">No Stock</p>
                          )}
                        </div>
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
                <col className="min-w-[8rem]" />
                <col className="min-w-[9rem]" />
                <col className="min-w-[8rem]" />
                <col className="w-[5.5rem]" />
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
                    label="Item Identity"
                    columnKey="itemIdentity"
                    sortKey={sortKey}
                    sortDir={sortDir}
                    onSort={onSort}
                    className={cn('min-w-[12rem] text-left', thBase)}
                    align="left"
                  />
                  <SortableHeader
                    label="Type & Category"
                    columnKey="typeCategory"
                    sortKey={sortKey}
                    sortDir={sortDir}
                    onSort={onSort}
                    className={cn('min-w-[8rem]', thBase)}
                  />
                  <SortableHeader
                    label="Pricing"
                    columnKey="pricing"
                    sortKey={sortKey}
                    sortDir={sortDir}
                    onSort={onSort}
                    className={cn('min-w-[9rem]', thBase)}
                  />
                  <SortableHeader
                    label="Stock / UOM"
                    columnKey="stockUom"
                    sortKey={sortKey}
                    sortDir={sortDir}
                    onSort={onSort}
                    className={cn('min-w-[8rem]', thBase)}
                  />
                  <TableHead className={cn('w-[5.5rem]', thBase)}>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r, index) => {
                  const selected = selectedIds.has(r.id)
                  const even = index % 2 === 0
                  const rowTone = selected ? rowSelectedClass : even ? rowEvenClass : rowOddClass
                  const lowStock =
                    r.item_type === 'Product' && Number(r.opening_stock) <= Number(r.low_stock_alert)

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
                          aria-label={`Select ${r.item_code}`}
                          checked={selected}
                          onChange={() => onToggle(r.id)}
                        />
                      </TableCell>
                      <TableCell className="min-w-[12rem] align-middle text-left">
                        <div className={cn(cellInnerClass, 'text-left')}>
                          <p className={identityClass} title={r.item_name}>
                            {r.item_name}
                            {r.archived_at ? (
                              <span className="ml-1 bg-stone-200 px-1 text-[9px] font-semibold uppercase text-stone-600">
                                Archived
                              </span>
                            ) : null}
                          </p>
                          <p className={metaLineClass}>
                            {r.item_code}
                            {r.hsn_code ? ` · HSN: ${r.hsn_code}` : ''}
                          </p>
                        </div>
                      </TableCell>
                      <TableCell className="min-w-[8rem] align-middle text-center">
                        <div className={cn(cellInnerClass, 'text-center')}>
                          <p className={primaryLineClass}>{r.item_type}</p>
                          <p className={secondaryLineClass}>{r.item_category}</p>
                        </div>
                      </TableCell>
                      <TableCell className="min-w-[9rem] align-middle text-center">
                        <div className={cn(cellInnerClass, 'text-center')}>
                          <p className={primaryLineClass}>
                            Sale: {getCurrencySymbol()} {formatMoney(r.sale_price)}
                          </p>
                          <p className={secondaryLineClass}>
                            GST {formatMoney(r.gst_percent)}% · Disc {getCurrencySymbol()}{' '}
                            {formatMoney(r.discount)}
                          </p>
                        </div>
                      </TableCell>
                      <TableCell className="min-w-[8rem] align-middle text-center">
                        <div className={cn(cellInnerClass, 'text-center')}>
                          <p className={primaryLineClass}>{r.unit_of_measurement || '—'}</p>
                          {r.item_type === 'Product' ? (
                            <p
                              className={cn(
                                secondaryLineClass,
                                lowStock && 'font-semibold text-red-700',
                              )}
                            >
                              Stock: {r.opening_stock}
                              {lowStock ? ' · Low' : ''}
                            </p>
                          ) : (
                            <p className={secondaryLineClass}>No Stock</p>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="w-[5.5rem] align-middle text-center">
                        <div className="flex w-full items-center justify-center gap-0.5 p-[1mm]">
                          <RowActions row={r} onEdit={onEdit} onCopy={onCopy} />
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
