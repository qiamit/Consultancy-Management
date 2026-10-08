import { ArrowDown, ArrowUp, ArrowUpDown, Building2, Copy, Mail, MapPin, Pencil, Phone, Wallet } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from '@/components/ui/table'
import type { ClientRow } from './types'
import { formatClientAddress, formatClientContact, formatClientContactLines } from './types'
import { clientPanelClass } from './clientsFormUi'
import { cn } from '@/lib/utils'
import { getCurrencySymbol } from '@/lib/appCurrency'

export type ClientSortKey =
  | 'companyIdentity'
  | 'typeScale'
  | 'contact'
  | 'address'
  | 'balance'

export type ClientSortDir = 'asc' | 'desc'

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
  columnKey: ClientSortKey
  sortKey: ClientSortKey
  sortDir: ClientSortDir
  onSort: (key: ClientSortKey) => void
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

/** ~10" / desktop: row table. Below that: cards. */
const TABLE_MQ_SHOW = 'hidden lg:block'
const CARDS_MQ_SHOW = 'lg:hidden'

const GRID_TABLE =
  'min-w-[860px] w-full border-collapse font-jakarta [&_th]:border [&_td]:border [&_th]:border-stone-700 [&_td]:border-[#e7e0d4] [&_th]:p-[1mm] [&_td]:!p-[1mm] [&_th]:sticky [&_th]:top-0 [&_th]:z-[1] [&_td]:static'

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
  sortKey,
  sortDir,
  onSort,
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
  sortKey: ClientSortKey
  sortDir: ClientSortDir
  onSort: (key: ClientSortKey) => void
}) {
  const allChecked = rows.length > 0 && rows.every((r) => selectedIds.has(r.id))
  const someChecked = rows.some((r) => selectedIds.has(r.id))

  return (
    <div className={cn(clientPanelClass, 'flex h-full min-h-0 flex-col bg-[#f7f3eb]')}>
      {error ? (
        <p className="shrink-0 px-3 pt-3 text-sm text-red-600 sm:px-5 sm:pt-4">{error}</p>
      ) : null}

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
                {selectedIds.size > 0 ? `${selectedIds.size} selected` : `${rows.length} clients`}
              </span>
            </div>

            {rows.map((r, index) => {
              const contact = formatClientContactLines(r)
              const contactTitle = formatClientContact(r)
              const selected = selectedIds.has(r.id)
              const even = index % 2 === 0
              const tone = selected ? 'bg-[#fde68a]/70' : even ? 'bg-[#fffcf7]' : 'bg-white'
              const balanceTone = balanceToneClass(r.balance_type)
              const address = formatClientAddress(r)

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
                          aria-label={`Select ${r.company_name}`}
                          checked={selected}
                          onChange={() => onToggle(r.id)}
                        />
                        <div className="min-w-0 flex-1 space-y-1">
                          <div className="flex items-start gap-2">
                            <Building2
                              className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-700"
                              aria-hidden
                            />
                            <div className="min-w-0 flex-1">
                              <p
                                className="text-[13px] font-bold leading-snug tracking-tight text-[#1c1917]"
                                title={r.company_name}
                              >
                                {r.company_name}
                              </p>
                              {r.gst_number?.trim() ? (
                                <p className={metaLineClass}>{r.gst_number}</p>
                              ) : null}
                            </div>
                          </div>

                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="border border-stone-400 bg-stone-100 px-1.5 py-0.5 text-[10px] font-semibold text-stone-700">
                              {r.company_type || '—'}
                            </span>
                            <span className="border border-amber-700/40 bg-amber-50 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.12em] text-amber-800">
                              {r.company_scale || '—'}
                            </span>
                            <span
                              className={cn(
                                'ml-auto border px-1.5 py-0.5 font-mono text-[10px] font-bold tabular-nums',
                                String(r.balance_type).toUpperCase() === 'CR'
                                  ? 'border-emerald-700/30 bg-emerald-50 text-emerald-800'
                                  : 'border-orange-700/30 bg-orange-50 text-orange-800',
                              )}
                            >
                              <span className={balanceTone}>{r.balance_type}</span>{' '}
                              {getCurrencySymbol()} {formatMoney(r.opening_balance)}
                            </span>
                          </div>
                        </div>
                        <ClientRowActions row={r} onEdit={onEdit} onCopy={onCopy} />
                      </div>

                      <div
                        className="space-y-1.5 border-t border-[#e7e0d4] bg-[#f7f3eb]/70 px-2.5 py-2"
                        title={contactTitle || undefined}
                      >
                        <div className="flex min-w-0 items-start gap-2 text-[11px]">
                          <Mail className="mt-0.5 h-3 w-3 shrink-0 text-amber-700" aria-hidden />
                          <div className="min-w-0 space-y-0.5">
                            {contact.name ? (
                              <p className="font-semibold text-[#292524]">{contact.name}</p>
                            ) : null}
                            {contact.email ? (
                              <p className="break-all font-medium text-[#92400e]">{contact.email}</p>
                            ) : null}
                            {!contact.name && !contact.email ? (
                              <p className="text-[#78716c]">No email</p>
                            ) : null}
                          </div>
                        </div>
                        <div className="flex min-w-0 items-center gap-2 text-[11px]">
                          <Phone className="h-3 w-3 shrink-0 text-amber-700" aria-hidden />
                          <p className="font-mono text-[#44403c]">{contact.mobile || '—'}</p>
                        </div>
                        <div className="flex min-w-0 items-start gap-2 text-[11px]">
                          <MapPin className="mt-0.5 h-3 w-3 shrink-0 text-amber-700" aria-hidden />
                          <p className="leading-snug text-[#57534e]">{address || '—'}</p>
                        </div>
                        <div className="flex min-w-0 items-center gap-2 text-[11px]">
                          <Wallet className="h-3 w-3 shrink-0 text-amber-700" aria-hidden />
                          <p className="font-medium text-[#57534e]">{r.payment_term || '—'}</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </article>
              )
            })}
          </div>

          {/* Table rows — ~10" / lg and above */}
          <div className={TABLE_MQ_SHOW}>
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
                  <SortableHeader
                    label="Company Identity"
                    columnKey="companyIdentity"
                    sortKey={sortKey}
                    sortDir={sortDir}
                    onSort={onSort}
                    className={cn('min-w-[12rem] text-left', thBase)}
                    align="left"
                  />
                  <SortableHeader
                    label="Type & Scale"
                    columnKey="typeScale"
                    sortKey={sortKey}
                    sortDir={sortDir}
                    onSort={onSort}
                    className={cn('min-w-[7rem]', thBase)}
                  />
                  <SortableHeader
                    label="Contact Details"
                    columnKey="contact"
                    sortKey={sortKey}
                    sortDir={sortDir}
                    onSort={onSort}
                    className={cn('min-w-[11rem]', thBase)}
                  />
                  <SortableHeader
                    label="Address"
                    columnKey="address"
                    sortKey={sortKey}
                    sortDir={sortDir}
                    onSort={onSort}
                    className={cn('min-w-[12rem]', thBase)}
                  />
                  <SortableHeader
                    label="Balance"
                    columnKey="balance"
                    sortKey={sortKey}
                    sortDir={sortDir}
                    onSort={onSort}
                    className={cn('min-w-[7.5rem]', thBase)}
                  />
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
        </div>
      )}
    </div>
  )
}
