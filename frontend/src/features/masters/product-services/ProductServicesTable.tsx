import { Copy, Pencil } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from '@/components/ui/table'
import { limsPanelClass } from '@/lib/limsThemeUi'
import { cn } from '@/lib/utils'
import { formatScopeNumber, formatUncertaintyDisplay, type NablScopeRow } from './types'

const GRID_TABLE =
  'table-fixed min-w-[980px] w-full border-collapse font-jakarta [&_th]:border [&_td]:border [&_th]:border-stone-700 [&_td]:border-[#e7e0d4] [&_th]:p-[1mm] [&_td]:!p-[1mm]'

const thBase =
  'bg-stone-800 text-center text-[11px] font-bold uppercase tracking-[0.14em] text-amber-200'

const cellInnerClass = 'w-full space-y-0.5 p-[1mm]'

const primaryLineClass =
  'break-words text-[12.5px] font-semibold tracking-tight text-[#292524]'

const secondaryLineClass = 'break-words text-[11px] font-medium leading-snug text-[#78716c]'

const monoLineClass =
  'break-words font-mono text-[12px] font-semibold tabular-nums tracking-tight text-[#1c1917]'

const rowEvenClass = 'bg-[#f7f3eb] hover:bg-[#f3e9d8]'
const rowOddClass = 'bg-[#fffcf7] hover:bg-[#f3e9d8]'
const rowSelectedClass = 'bg-[#fde68a]/80 hover:bg-[#fde68a]/80'

const checkboxClass =
  'h-4 w-4 rounded-none border-stone-500 text-amber-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/30'

const actionBtnClass =
  'rounded-none text-[#92400e] hover:bg-[#f3e9d8] hover:text-[#78350f]'

export function ProductServicesTable({
  rows,
  loading,
  error,
  searchActive,
  selectedIds,
  onToggle,
  onToggleAll,
  onEdit,
  onCopy,
}: {
  rows: NablScopeRow[]
  loading: boolean
  error: string | null
  searchActive?: boolean
  selectedIds: Set<string>
  onToggle: (id: string) => void
  onToggleAll: (checked: boolean) => void
  onEdit: (row: NablScopeRow) => void
  onCopy: (row: NablScopeRow) => void
}) {
  const allChecked = rows.length > 0 && rows.every((r) => selectedIds.has(r.id))
  const someChecked = rows.some((r) => selectedIds.has(r.id))

  return (
    <div className={cn(limsPanelClass, 'bg-[#f7f3eb]')}>
      {error ? <p className="px-3 pt-3 text-sm text-red-600 sm:px-5 sm:pt-4">{error}</p> : null}

      {loading ? (
        <p className="px-5 py-8 text-center text-sm text-[#78716c]">Loading…</p>
      ) : rows.length === 0 ? (
        <div className="m-3 border border-dashed border-[#d6d3d1] bg-[#fffcf7] p-4 text-center sm:m-4 sm:p-6">
          <p className="text-sm text-[#57534e]">
            {searchActive ? 'No scope entries match your search.' : 'No scope entries yet.'}
          </p>
          {!searchActive ? (
            <p className="mt-1 text-xs text-[#78716c]">
              Use &quot;Add Scope Entry&quot; to create your first record.
            </p>
          ) : null}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <Table className={GRID_TABLE}>
            <colgroup>
              <col className="w-[3%]" />
              <col className="w-[24%]" />
              <col className="w-[20%]" />
              <col className="w-[15%]" />
              <col className="w-[18%]" />
              <col className="w-[12%]" />
              <col className="w-[8%]" />
            </colgroup>
            <TableHeader>
              <TableRow className="border-stone-700 bg-stone-800 hover:bg-stone-800">
                <TableHead className={cn('w-[3%]', thBase)}>
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
                <TableHead className={cn('w-[24%]', thBase)}>Discipline / Materials</TableHead>
                <TableHead className={cn('w-[20%]', thBase)}>Test Parameter</TableHead>
                <TableHead className={cn('w-[15%]', thBase)}>Test Method</TableHead>
                <TableHead className={cn('w-[18%]', thBase)}>Range</TableHead>
                <TableHead className={cn('w-[12%]', thBase)}>Uncertainty</TableHead>
                <TableHead className={cn('w-[8%]', thBase)}>Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r, index) => {
                const selected = selectedIds.has(r.id)
                const even = index % 2 === 0
                const rowTone = selected ? rowSelectedClass : even ? rowEvenClass : rowOddClass
                const typeOfTest = r.type_of_test?.trim() || ''
                const scopeStatus = r.scope_status?.trim() || 'Draft Scope'
                const typeAndStatus = [typeOfTest || '—', scopeStatus].join(' · ')

                return (
                  <TableRow
                    key={r.id}
                    data-state={selected ? 'selected' : undefined}
                    className={cn('group border-[#e7e0d4] transition-colors', rowTone)}
                  >
                    <TableCell className="w-[3%] text-center align-middle">
                      <input
                        type="checkbox"
                        className={checkboxClass}
                        aria-label={`Select ${r.discipline_group || 'scope entry'}`}
                        checked={selected}
                        onChange={() => onToggle(r.id)}
                      />
                    </TableCell>

                    <TableCell className="w-[24%] align-middle text-left">
                      <div className={cn(cellInnerClass, 'text-left')}>
                        <p className={primaryLineClass}>{r.discipline_group?.trim() || '—'}</p>
                        <p className={secondaryLineClass}>{r.materials_products?.trim() || '—'}</p>
                      </div>
                    </TableCell>

                    <TableCell className="w-[20%] align-middle text-center">
                      <div className={cn(cellInnerClass, 'text-center')}>
                        <p className={primaryLineClass}>{r.component_parameter?.trim() || '—'}</p>
                        <p className={secondaryLineClass}>{typeAndStatus}</p>
                      </div>
                    </TableCell>

                    <TableCell className="w-[15%] align-middle text-center">
                      <div className={cn(cellInnerClass, 'text-center')}>
                        <p className={primaryLineClass}>{r.test_method_specification?.trim() || '—'}</p>
                      </div>
                    </TableCell>

                    <TableCell className="w-[18%] align-middle text-center">
                      <div className={cn(cellInnerClass, 'text-center')}>
                        <p className={monoLineClass}>
                          {formatScopeNumber(r.range_minimum)} - {formatScopeNumber(r.range_maximum)}
                          {r.unit?.trim() ? ` ${r.unit.trim()}` : ''}
                        </p>
                      </div>
                    </TableCell>

                    <TableCell className="w-[12%] align-middle text-center">
                      <div className={cn(cellInnerClass, 'text-center')}>
                        <p className={monoLineClass}>{formatUncertaintyDisplay(r.uncertainty)}</p>
                      </div>
                    </TableCell>

                    <TableCell className="w-[8%] align-middle text-center">
                      <div className="flex w-full items-center justify-center gap-0.5 p-[1mm]">
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className={actionBtnClass}
                          aria-label="Edit"
                          onClick={() => onEdit(r)}
                        >
                          <Pencil size={16} />
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className={actionBtnClass}
                          aria-label="Copy"
                          onClick={() => onCopy(r)}
                        >
                          <Copy size={16} />
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
