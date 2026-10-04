import { Copy, Pencil } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from '@/components/ui/table'
import type { ClientRow } from './types'
import { formatClientAddress, formatClientContact, formatClientContactLines } from './types'
import { clientPanelClass } from './clientsFormUi'
import { cn } from '@/lib/utils'
import { getCurrencySymbol } from '@/lib/appCurrency'

const GRID_TABLE =
  'min-w-[860px] w-full border-collapse font-jakarta [&_th]:border [&_td]:border [&_th]:border-stone-700 [&_td]:border-[#e7e0d4] [&_th]:p-[1mm] [&_td]:!p-[1mm] [&_th]:static [&_td]:static'

const thBase =
  'bg-stone-800 text-center text-[11px] font-bold uppercase tracking-[0.14em] text-amber-200'

const cellInnerClass = 'w-full space-y-1 p-[1mm]'

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

const checkboxClass =
  'h-4 w-4 rounded-none border-stone-500 text-amber-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/30'

const formatMoney = (value: number | null | undefined) => {
  const v = typeof value === 'number' && Number.isFinite(value) ? value : 0
  return v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function balanceToneClass(balanceType: string) {
  return String(balanceType).toUpperCase() === 'CR' ? 'text-[#047857]' : 'text-[#c2410c]'
}

function ClientRowActions({
  row,
  onEdit,
  onCopy,
}: {
  row: ClientRow
  onEdit: (row: ClientRow) => void
  onCopy: (row: ClientRow) => void
}) {
  return (
    <div className="flex shrink-0 items-center gap-0.5">
      <Button
        type="button"
        size="sm"
        variant="ghost"
        className="h-8 w-8 rounded-none p-0 text-[#92400e] hover:bg-[#f3e9d8] hover:text-[#78350f]"
        aria-label={`Edit ${row.company_name}`}
        onClick={() => onEdit(row)}
      >
        <Pencil size={16} />
      </Button>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        className="h-8 w-8 rounded-none p-0 text-[#92400e] hover:bg-[#f3e9d8] hover:text-[#78350f]"
        aria-label={`Copy ${row.company_name}`}
        onClick={() => onCopy(row)}
      >
        <Copy size={16} />
      </Button>
    </div>
  )
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
    <div className={cn(clientPanelClass, '@container bg-[#f7f3eb]')}>
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
        <>
          {/* Card list — when panel is narrower than the table needs */}
          <div className="space-y-2 p-2 sm:p-3 @[860px]:hidden">
            <div className="flex items-center gap-2 border border-stone-500 bg-stone-800 px-2.5 py-2 text-amber-200">
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
                {selectedIds.size > 0 ? `${selectedIds.size} selected` : `${rows.length} clients`}
              </span>
            </div>

            {rows.map((r, index) => {
              const contact = formatClientContactLines(r)
              const contactTitle = formatClientContact(r)
              const selected = selectedIds.has(r.id)
              const even = index % 2 === 0
              const tone = selected ? rowSelectedClass : even ? rowEvenClass : rowOddClass
              const balanceTone = balanceToneClass(r.balance_type)

              return (
                <article
                  key={r.id}
                  className={cn(
                    'border border-stone-500 font-jakarta shadow-sm ring-1 ring-amber-700/15',
                    tone,
                  )}
                >
                  <div className="flex items-start gap-2 border-b border-[#e7e0d4] px-2.5 py-2">
                    <input
                      type="checkbox"
                      className={cn(checkboxClass, 'mt-1 shrink-0')}
                      aria-label={`Select ${r.company_name}`}
                      checked={selected}
                      onChange={() => onToggle(r.id)}
                    />
                    <div className="min-w-0 flex-1">
                      <p className={cn(companyNameClass, 'whitespace-normal break-words')} title={r.company_name}>
                        {r.company_name}
                      </p>
                      {r.gst_number?.trim() ? <p className={metaLineClass}>{r.gst_number}</p> : null}
                    </div>
                    <ClientRowActions row={r} onEdit={onEdit} onCopy={onCopy} />
                  </div>

                  <dl className="grid gap-2 px-2.5 py-2 text-left sm:grid-cols-2">
                    <div>
                      <dt className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#a16207]">
                        Type &amp; Scale
                      </dt>
                      <dd className={primaryLineClass}>{r.company_type}</dd>
                      <dd className={scaleClass}>{r.company_scale}</dd>
                    </div>
                    <div title={contactTitle || undefined}>
                      <dt className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#a16207]">
                        Contact
                      </dt>
                      {contact.name ? <dd className={primaryLineClass}>{contact.name}</dd> : null}
                      {contact.email ? (
                        <dd className={cn(secondaryLineClass, 'break-all text-[#92400e]')}>{contact.email}</dd>
                      ) : null}
                      {contact.mobile ? (
                        <dd className={cn(secondaryLineClass, 'font-mono text-[#44403c]')}>{contact.mobile}</dd>
                      ) : null}
                      {!contact.name && !contact.email && !contact.mobile ? (
                        <dd className={secondaryLineClass}>—</dd>
                      ) : null}
                    </div>
                    <div className="sm:col-span-2">
                      <dt className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#a16207]">
                        Address
                      </dt>
                      <dd className={cn(secondaryLineClass, 'text-[#57534e]')}>{formatClientAddress(r) || '—'}</dd>
                    </div>
                    <div className="sm:col-span-2">
                      <dt className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#a16207]">
                        Balance
                      </dt>
                      <dd className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                        <span className={cn('text-[11px] font-bold uppercase tracking-[0.12em]', balanceTone)}>
                          {r.balance_type}
                        </span>
                        <span className={moneyClass}>
                          {getCurrencySymbol()} {formatMoney(r.opening_balance)}
                        </span>
                        <span className={secondaryLineClass}>{r.payment_term}</span>
                      </dd>
                    </div>
                  </dl>
                </article>
              )
            })}
          </div>

          {/* Table — when panel is wide enough */}
          <div className="hidden @[860px]:block">
            <Table className={GRID_TABLE}>
              <colgroup>
                <col className="w-11" />
                <col className="min-w-[12rem]" />
                <col className="min-w-[7rem]" />
                <col className="min-w-[11rem]" />
                <col className="min-w-[12rem]" />
                <col className="min-w-[7.5rem]" />
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
                  <TableHead className={cn('min-w-[12rem] text-left', thBase)}>Company Identity</TableHead>
                  <TableHead className={cn('min-w-[7rem]', thBase)}>Type &amp; Scale</TableHead>
                  <TableHead className={cn('min-w-[11rem]', thBase)}>Contact Details</TableHead>
                  <TableHead className={cn('min-w-[12rem]', thBase)}>Address</TableHead>
                  <TableHead className={cn('min-w-[7.5rem]', thBase)}>Balance</TableHead>
                  <TableHead className={cn('w-[5.5rem]', thBase)}>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r, index) => {
                  const contact = formatClientContactLines(r)
                  const contactTitle = formatClientContact(r)
                  const selected = selectedIds.has(r.id)
                  const even = index % 2 === 0
                  const rowTone = selected ? rowSelectedClass : even ? rowEvenClass : rowOddClass
                  const balanceTone = balanceToneClass(r.balance_type)

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
                          aria-label={`Select ${r.company_name}`}
                          checked={selected}
                          onChange={() => onToggle(r.id)}
                        />
                      </TableCell>
                      <TableCell className="min-w-[12rem] align-middle text-left">
                        <div className={cn(cellInnerClass, 'text-left')}>
                          <p className={companyNameClass} title={r.company_name}>
                            {r.company_name}
                          </p>
                          {r.gst_number?.trim() ? <p className={metaLineClass}>{r.gst_number}</p> : null}
                        </div>
                      </TableCell>
                      <TableCell className="min-w-[7rem] align-middle text-center">
                        <div className={cn(cellInnerClass, 'text-center')}>
                          <p className={primaryLineClass}>{r.company_type}</p>
                          <p className={scaleClass}>{r.company_scale}</p>
                        </div>
                      </TableCell>
                      <TableCell className="min-w-[11rem] align-middle text-center">
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
                      <TableCell className="min-w-[12rem] align-middle text-center">
                        <div
                          className={cn(cellInnerClass, secondaryLineClass, 'text-center text-[#57534e] line-clamp-3')}
                          title={formatClientAddress(r)}
                        >
                          {formatClientAddress(r)}
                        </div>
                      </TableCell>
                      <TableCell className="min-w-[7.5rem] align-middle text-center">
                        <div className={cn(cellInnerClass, 'text-center')}>
                          <p className={cn('text-[11px] font-bold uppercase tracking-[0.12em]', balanceTone)}>
                            {r.balance_type}
                          </p>
                          <p className={moneyClass}>
                            {getCurrencySymbol()} {formatMoney(r.opening_balance)}
                          </p>
                          <p className={secondaryLineClass}>{r.payment_term}</p>
                        </div>
                      </TableCell>
                      <TableCell className="w-[5.5rem] align-middle text-center">
                        <div className="flex w-full items-center justify-center gap-0.5 p-[1mm]">
                          <ClientRowActions row={r} onEdit={onEdit} onCopy={onCopy} />
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        </>
      )}
    </div>
  )
}
