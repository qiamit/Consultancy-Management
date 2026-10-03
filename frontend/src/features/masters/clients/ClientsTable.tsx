import { Copy, Pencil } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from '@/components/ui/table'
import type { ClientRow } from './types'
import { formatClientAddress, formatClientContact, formatClientContactLines } from './types'
import { clientPanelClass } from './clientsFormUi'
import { cn } from '@/lib/utils'
import { getCurrencySymbol } from '@/lib/appCurrency'

const GRID_TABLE =
  'table-fixed min-w-[920px] w-full border-collapse font-jakarta [&_th]:border [&_td]:border [&_th]:border-stone-700 [&_td]:border-[#e7e0d4] [&_th]:p-[1mm] [&_td]:!p-[1mm]'

const thBase =
  'bg-stone-800 text-center text-[11px] font-bold uppercase tracking-[0.14em] text-amber-200'

const cellInnerClass = 'w-full space-y-1 p-[1mm]'

/** Light ledger palette — warm paper + high-contrast ink */
const companyNameClass =
  'truncate text-[13px] font-bold tracking-[-0.015em] text-[#1c1917]'

const metaLineClass =
  'truncate font-mono text-[11px] font-medium tracking-normal text-[#b45309]'

const primaryLineClass = 'text-[12.5px] font-semibold tracking-tight text-[#292524]'

const secondaryLineClass = 'text-[11px] font-medium leading-snug text-[#78716c]'

const moneyClass =
  'font-mono text-[12px] font-bold tabular-nums tracking-tight text-[#1c1917]'

const scaleClass =
  'text-[10px] font-bold uppercase tracking-[0.14em] text-[#a16207]'

const rowEvenClass = 'bg-[#f7f3eb] hover:bg-[#f3e9d8]'
const rowOddClass = 'bg-[#fffcf7] hover:bg-[#f3e9d8]'
const rowSelectedClass = 'bg-[#fde68a]/80 hover:bg-[#fde68a]/80'

const stickyEven = 'bg-[#f7f3eb]'
const stickyOdd = 'bg-[#fffcf7]'
const stickySelected = 'bg-[#fde68a]/80'
const stickyHover = 'group-hover:bg-[#f3e9d8]'

const checkboxClass =
  'h-4 w-4 rounded-none border-stone-500 text-amber-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/30'

const formatMoney = (value: number | null | undefined) => {
  const v = typeof value === 'number' && Number.isFinite(value) ? value : 0
  return v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export function ClientsTable({
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
  rows: ClientRow[]
  loading: boolean
  error: string | null
  searchActive?: boolean
  selectedIds: Set<string>
  onToggle: (id: string) => void
  onToggleAll: (checked: boolean) => void
  onEdit: (row: ClientRow) => void
  onCopy: (row: ClientRow) => void
}) {
  const allChecked = rows.length > 0 && rows.every((r) => selectedIds.has(r.id))
  const someChecked = rows.some((r) => selectedIds.has(r.id))

  return (
    <div className={cn(clientPanelClass, 'bg-[#f7f3eb]')}>
      {error ? <p className="px-3 pt-3 text-sm text-red-600 sm:px-5 sm:pt-4">{error}</p> : null}

      {loading ? (
        <p className="px-5 py-8 text-center text-sm text-[#78716c]">Loading…</p>
      ) : rows.length === 0 ? (
        <div className="m-3 border border-dashed border-[#d6d3d1] bg-[#fffcf7] p-4 text-center sm:m-4 sm:p-6">
          <p className="text-sm text-[#57534e]">
            {searchActive ? 'No clients match your search.' : 'No clients added yet.'}
          </p>
          {!searchActive ? (
            <p className="mt-1 text-xs text-[#78716c]">Use &quot;Add New Client&quot; to create your first record.</p>
          ) : null}
        </div>
      ) : (
        <Table className={GRID_TABLE}>
          <colgroup>
            <col className="w-[3%]" />
            <col className="w-[25%]" />
            <col className="w-[10%]" />
            <col className="w-[20%]" />
            <col className="w-[25%]" />
            <col className="w-[10%]" />
            <col className="w-[7%]" />
          </colgroup>
          <TableHeader>
            <TableRow className="border-stone-700 bg-stone-800 hover:bg-stone-800">
              <TableHead className={cn('sticky left-0 z-10 w-[3%]', thBase)}>
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
              <TableHead className={cn('sticky left-[3%] z-10 w-[25%]', thBase)}>
                Company Identity
              </TableHead>
              <TableHead className={cn('w-[10%]', thBase)}>Type &amp; Scale</TableHead>
              <TableHead className={cn('w-[20%]', thBase)}>Contact Details</TableHead>
              <TableHead className={cn('w-[25%]', thBase)}>Address</TableHead>
              <TableHead className={cn('w-[10%]', thBase)}>Balance</TableHead>
              <TableHead className={cn('w-[7%]', thBase)}>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r, index) => {
              const contact = formatClientContactLines(r)
              const contactTitle = formatClientContact(r)
              const selected = selectedIds.has(r.id)
              const even = index % 2 === 0
              const rowTone = selected ? rowSelectedClass : even ? rowEvenClass : rowOddClass
              const stickyBg = selected ? stickySelected : even ? stickyEven : stickyOdd
              const balanceTone =
                String(r.balance_type).toUpperCase() === 'CR' ? 'text-[#047857]' : 'text-[#c2410c]'

              return (
                <TableRow
                  key={r.id}
                  data-state={selected ? 'selected' : undefined}
                  className={cn('group border-[#e7e0d4] transition-colors', rowTone)}
                >
                  <TableCell
                    className={cn(
                      'sticky left-0 z-10 w-[3%] text-center align-middle',
                      stickyBg,
                      !selected && stickyHover,
                    )}
                  >
                    <input
                      type="checkbox"
                      className={checkboxClass}
                      aria-label={`Select ${r.company_name}`}
                      checked={selected}
                      onChange={() => onToggle(r.id)}
                    />
                  </TableCell>
                  <TableCell
                    className={cn(
                      'sticky left-[3%] z-10 w-[25%] align-middle text-left',
                      stickyBg,
                      !selected && stickyHover,
                    )}
                  >
                    <div className={cn(cellInnerClass, 'text-left')}>
                      <p className={companyNameClass} title={r.company_name}>
                        {r.company_name}
                      </p>
                      {r.gst_number?.trim() ? <p className={metaLineClass}>{r.gst_number}</p> : null}
                    </div>
                  </TableCell>
                  <TableCell className="w-[10%] align-middle text-center">
                    <div className={cn(cellInnerClass, 'text-center')}>
                      <p className={primaryLineClass}>{r.company_type}</p>
                      <p className={scaleClass}>{r.company_scale}</p>
                    </div>
                  </TableCell>
                  <TableCell className="w-[20%] align-middle text-center">
                    <div className={cn(cellInnerClass, 'text-center')} title={contactTitle || undefined}>
                      {contact.name ? <p className={primaryLineClass}>{contact.name}</p> : null}
                      {contact.email ? (
                        <p className={cn(secondaryLineClass, 'break-all text-[#92400e]')}>{contact.email}</p>
                      ) : null}
                      {contact.mobile ? (
                        <p className={cn(secondaryLineClass, 'font-mono tracking-normal text-[#44403c]')}>
                          {contact.mobile}
                        </p>
                      ) : null}
                    </div>
                  </TableCell>
                  <TableCell className="w-[25%] align-middle text-center">
                    <div
                      className={cn(cellInnerClass, secondaryLineClass, 'text-center text-[#57534e] line-clamp-3')}
                      title={formatClientAddress(r)}
                    >
                      {formatClientAddress(r)}
                    </div>
                  </TableCell>
                  <TableCell className="w-[10%] align-middle text-center">
                    <div className={cn(cellInnerClass, 'text-center')}>
                      <p className={cn('text-[11px] font-bold uppercase tracking-[0.12em]', balanceTone)}>
                        {r.balance_type}
                      </p>
                      <p className={moneyClass}>{getCurrencySymbol()} {formatMoney(r.opening_balance)}</p>
                      <p className={secondaryLineClass}>{r.payment_term}</p>
                    </div>
                  </TableCell>
                  <TableCell className="w-[7%] align-middle text-center">
                    <div className="flex w-full items-center justify-center gap-0.5 p-[1mm]">
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="rounded-none text-[#92400e] hover:bg-[#f3e9d8] hover:text-[#78350f]"
                        aria-label={`Edit ${r.company_name}`}
                        onClick={() => onEdit(r)}
                      >
                        <Pencil size={16} />
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="rounded-none text-[#92400e] hover:bg-[#f3e9d8] hover:text-[#78350f]"
                        aria-label={`Copy ${r.company_name}`}
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
