import { Copy, Pencil } from 'lucide-react'
import { getCurrencySymbol } from '@/lib/appCurrency'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { cn } from '@/lib/utils'
import { formatMoney, type ProductServiceRow } from './types'

const GRID_TABLE =
  'min-w-[960px] w-full border-collapse [&_th]:border [&_td]:border [&_th]:border-border [&_td]:border-border'

const checkboxClass =
  'h-4 w-4 rounded border-muted-foreground/30 text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'

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
}) {
  const allChecked = rows.length > 0 && rows.every((r) => selectedIds.has(r.id))
  const someChecked = rows.some((r) => selectedIds.has(r.id))

  return (
    <div className="overflow-hidden overflow-hidden rounded-none border-2 border-stone-500 bg-white shadow-sm ring-1 ring-amber-700/20">
      {error ? <p className="px-3 pt-3 text-sm text-destructive sm:px-5 sm:pt-4">{error}</p> : null}

      {loading ? (
        <p className="px-5 py-8 text-center text-sm text-muted-foreground">Loading…</p>
      ) : rows.length === 0 ? (
        <div className="m-3 rounded-lg border border-dashed border-border p-4 text-center sm:m-4 sm:p-6">
          <p className="text-sm text-muted-foreground">
            {searchActive ? 'No items match your search.' : 'No products or services added yet.'}
          </p>
          {!searchActive ? (
            <p className="mt-1 text-xs text-muted-foreground">
              Use &quot;Add New Item&quot; to create your first record.
            </p>
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
              <TableHead className="sticky left-12 z-10 min-w-[160px] bg-stone-800 text-left text-[11px] font-bold uppercase tracking-[0.14em] text-amber-200 sm:left-14">
                Item Identity
              </TableHead>
              <TableHead className="min-w-[110px] text-center text-xs">Type &amp; Category</TableHead>
              <TableHead className="min-w-[140px] text-center text-xs">Pricing</TableHead>
              <TableHead className="min-w-[120px] text-center text-xs">Stock / UOM</TableHead>
              <TableHead className="min-w-[96px] text-center text-xs">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => {
              const selected = selectedIds.has(r.id)
              const lowStock =
                r.item_type === 'Product' &&
                Number(r.opening_stock) <= Number(r.low_stock_alert)

              return (
                <TableRow key={r.id} data-state={selected ? 'selected' : undefined}>
                  <TableCell
                    className={cn(
                      'sticky left-0 z-10 text-center align-middle',
                      selected ? 'bg-muted' : 'bg-card',
                    )}
                  >
                    <input
                      type="checkbox"
                      className={checkboxClass}
                      aria-label={`Select ${r.item_code}`}
                      checked={selected}
                      onChange={() => onToggle(r.id)}
                    />
                  </TableCell>
                  <TableCell
                    className={cn(
                      'sticky left-12 z-10 align-middle text-left sm:left-14',
                      selected ? 'bg-muted' : 'bg-card',
                    )}
                  >
                    <div className="min-w-[140px] max-w-[260px] space-y-0.5">
                      <p className="truncate font-medium text-foreground" title={r.item_name}>
                        {r.item_name}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        <span className="font-mono">{r.item_code}</span>
                        {r.hsn_code ? (
                          <>
                            <span className="mx-1.5 text-stone-300" aria-hidden>
                              ·
                            </span>
                            <span>HSN: {r.hsn_code}</span>
                          </>
                        ) : null}
                      </p>
                    </div>
                  </TableCell>
                  <TableCell className="align-middle text-center">
                    <div className="space-y-0.5">
                      <p className="text-sm text-foreground">{r.item_type}</p>
                      <p className="text-xs text-muted-foreground">{r.item_category}</p>
                    </div>
                  </TableCell>
                  <TableCell className="align-middle text-center">
                    <div className="space-y-0.5">
                      <p className="text-sm text-foreground">Sale: {getCurrencySymbol()} {formatMoney(r.sale_price)}</p>
                      <p className="text-xs text-muted-foreground">
                        GST {formatMoney(r.gst_percent)}% · Disc {getCurrencySymbol()} {formatMoney(r.discount)}
                      </p>
                    </div>
                  </TableCell>
                  <TableCell className="align-middle text-center">
                    <div className="space-y-0.5">
                      <p className="text-sm text-foreground">{r.unit_of_measurement || '—'}</p>
                      {r.item_type === 'Product' ? (
                        <p
                          className={cn(
                            'text-xs',
                            lowStock ? 'font-semibold text-destructive' : 'text-muted-foreground',
                          )}
                        >
                          Stock: {r.opening_stock}
                          {lowStock ? ' · Low' : ''}
                        </p>
                      ) : (
                        <p className="text-xs text-muted-foreground">No Stock</p>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="align-middle text-center">
                    <div className="inline-flex items-center justify-center gap-0.5">
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        aria-label={`Edit ${r.item_code}`}
                        onClick={() => onEdit(r)}
                      >
                        <Pencil size={16} />
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        aria-label={`Copy ${r.item_code}`}
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
      )}
    </div>
  )
}
