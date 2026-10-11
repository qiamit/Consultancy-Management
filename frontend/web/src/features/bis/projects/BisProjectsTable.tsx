import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Building2,
  Calendar,
  ExternalLink,
  FileText,
  Mail,
  Pencil,
  Wallet,
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { limsPanelClass, limsPrimaryBtnClass } from '@/lib/limsThemeUi'
import { cn } from '@/lib/utils'
import type { BisProjectSortDir, BisProjectSortKey } from './bisProjectsApi'
import {
  BIS_PRINT_DOCUMENT_LABEL,
  EXTRA_PRINT_KINDS,
  type BisPrintDocumentKind,
} from '../print/printBisDocument'
import {
  clientDisplayName,
  formatCmL,
  formatDisplayDate,
  formatInr,
  isCodeDisplayLabel,
  licenseValidityState,
  manakLoginFromProject,
  todayIsoDate,
  type BisProjectRow,
  type LicenseValidityState,
} from './types'
import {
  cmLDigitsOnly,
  openManakEbisAssist,
  openManakLicenceRelatedRpt,
} from './manakExtensionBridge'

export type { BisProjectSortDir, BisProjectSortKey }

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
  columnKey: BisProjectSortKey
  sortKey: BisProjectSortKey
  sortDir: BisProjectSortDir
  onSort: (key: BisProjectSortKey) => void
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

const EXTENSION_MISSING_MSG =
  'QE Consultancy extension is not loaded. Open this app in Chrome or Edge, then reload the extension from chrome://extensions.'

const GRID_TABLE =
  'w-full min-w-0 table-fixed border-collapse font-jakarta [&_th]:border [&_td]:border [&_th]:border-stone-700 [&_td]:border-[#e7e0d4] [&_th]:p-[1mm] [&_td]:!p-[1mm] [&_th]:sticky [&_th]:top-0 [&_th]:z-[1] [&_td]:break-words'

const thBase =
  'bg-stone-800 text-center text-[11px] font-bold uppercase tracking-[0.14em] text-amber-200'

const checkboxClass =
  'h-4 w-4 rounded-none border-stone-500 text-amber-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/30'

const rowEvenClass = 'bg-[#f7f3eb] hover:bg-[#f3e9d8]'
const rowOddClass = 'bg-[#fffcf7] hover:bg-[#f3e9d8]'
const rowSelectedClass = 'bg-[#fde68a]/80 hover:bg-[#fde68a]/80'

const LICENSE_STATE_STYLES: Record<LicenseValidityState, { label: string; className: string }> = {
  operative: { label: 'Operative', className: 'text-emerald-700' },
  expiring: { label: 'Renewal Due', className: 'text-amber-700' },
  expired: { label: 'Expired', className: 'text-red-700' },
  unknown: { label: 'No Validity', className: 'text-stone-500' },
}

const actionGhostBtnClass =
  'h-[2.3rem] w-[2.3rem] rounded-none border border-stone-400 bg-white/70 p-0 text-amber-800 shadow-sm hover:border-amber-600 hover:bg-amber-50 hover:text-amber-950 focus-visible:ring-2 focus-visible:ring-amber-500/40'

function RowActions({
  row,
  client,
  emailBusy,
  onEdit,
  onViewDocuments,
  onEmailDocument,
}: {
  row: BisProjectRow
  client: string
  emailBusy?: boolean
  onEdit: (row: BisProjectRow) => void
  onViewDocuments: (row: BisProjectRow) => void
  onEmailDocument?: (row: BisProjectRow, kind: BisPrintDocumentKind) => void
}) {
  return (
    <div className="bis-project-row-actions inline-flex shrink-0 items-center gap-0.5">
      <Button
        type="button"
        size="sm"
        variant="ghost"
        className={actionGhostBtnClass}
        aria-label={`Edit ${client}`}
        title="Edit license"
        onClick={() => onEdit(row)}
      >
        <Pencil size={16} />
      </Button>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        className={actionGhostBtnClass}
        aria-label={`View documents for ${client}`}
        title="View Documents"
        onClick={() => onViewDocuments(row)}
      >
        <FileText size={16} />
      </Button>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        className={actionGhostBtnClass}
        aria-label={`Manak Assist for ${client}`}
        title="Manak Assist"
        onClick={() => {
          void openManakEbisAssist({
            portalUserId: manakLoginFromProject(row).userId,
            projectId: row.id,
          })
            .then(({ extensionUsed }) => {
              if (extensionUsed) {
                toast.success('Opening Manak eBIS via extension')
              } else {
                toast.warning('Extension not detected — opened Manak eBIS in a new tab', {
                  description: EXTENSION_MISSING_MSG,
                })
              }
            })
            .catch((err: unknown) => {
              toast.error(err instanceof Error ? err.message : 'Could not open Manak')
            })
        }}
      >
        <ExternalLink size={16} />
      </Button>
      {onEmailDocument ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className={actionGhostBtnClass}
              disabled={emailBusy}
              aria-label={`Email documents for ${client}`}
              title="Email docs to client"
            >
              <Mail size={16} />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="max-h-80 overflow-y-auto">
            <DropdownMenuItem
              disabled={emailBusy}
              onSelect={() => onEmailDocument(row, 'form1')}
            >
              {BIS_PRINT_DOCUMENT_LABEL.form1}
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={emailBusy}
              onSelect={() => onEmailDocument(row, 'authorization-letter')}
            >
              {BIS_PRINT_DOCUMENT_LABEL['authorization-letter']}
            </DropdownMenuItem>
            {EXTRA_PRINT_KINDS.map((kind) => (
              <DropdownMenuItem
                key={`email-${kind}`}
                disabled={emailBusy}
                onSelect={() => onEmailDocument(row, kind)}
              >
                {BIS_PRINT_DOCUMENT_LABEL[kind]}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
    </div>
  )
}

function CmLNumberLink({
  digits,
  className,
}: {
  digits: string | null | undefined
  className?: string
}) {
  const display = formatCmL(digits)
  const rawDigits = cmLDigitsOnly(digits)
  if (!rawDigits || display === '—') {
    return <span className={className}>{display}</span>
  }
  return (
    <button
      type="button"
      className={cn(
        'font-mono text-xs tabular-nums text-amber-800 underline decoration-amber-700/50 underline-offset-2 transition-colors hover:text-amber-950 hover:decoration-amber-900',
        className,
      )}
      title={`Open Manak Licence Report & copy ${rawDigits}`}
      aria-label={`Open Manak Licence Report for CM/L-${rawDigits}`}
      onClick={(e) => {
        e.stopPropagation()
        void openManakLicenceRelatedRpt(rawDigits).then(({ digits: copiedDigits, copied }) => {
          if (copied) {
            toast.success(`Copied ${copiedDigits}`, {
              description: 'Manak Licence Related Report opened.',
            })
          } else {
            toast.warning('Manak page opened', {
              description: copiedDigits
                ? `Copy manually: ${copiedDigits}`
                : 'Could not copy CM/L number.',
            })
          }
        })
      }}
    >
      {display}
    </button>
  )
}

function TableTextLink({
  label,
  recordId,
  onOpen,
  kind,
  className,
}: {
  label: string
  recordId: string | null
  onOpen?: (id: string) => void
  kind: 'IS Code' | 'Client'
  className?: string
}) {
  if (!label || label === '—') return <span>—</span>
  if (!recordId || !onOpen) {
    return (
      <p className={cn('font-medium text-amber-900', className)} title={label}>
        {label}
      </p>
    )
  }
  return (
    <button
      type="button"
      className={cn(
        'text-left font-medium text-amber-800 underline decoration-amber-700/50 underline-offset-2 transition-colors hover:text-amber-950 hover:decoration-amber-900',
        className,
      )}
      title={`View ${kind} — ${label}`}
      aria-label={`View ${kind} ${label}`}
      onClick={(e) => {
        e.stopPropagation()
        onOpen(recordId)
      }}
    >
      {label}
    </button>
  )
}

export function BisProjectsTable({
  rows,
  loading,
  error,
  searchActive,
  selectedIds,
  onToggle,
  onToggleAll,
  onEdit,
  onViewDocuments,
  onEmailDocument,
  emailBusy = false,
  onOpenIsCode,
  onOpenClient,
  onRetry,
  sortKey,
  sortDir,
  onSort,
}: {
  rows: BisProjectRow[]
  loading: boolean
  error: string | null
  searchActive: boolean
  selectedIds: Set<string>
  onToggle: (id: string) => void
  onToggleAll: (checked: boolean) => void
  onEdit: (row: BisProjectRow) => void
  onViewDocuments: (row: BisProjectRow) => void
  onEmailDocument?: (row: BisProjectRow, kind: BisPrintDocumentKind) => void
  emailBusy?: boolean
  onOpenIsCode?: (isCodeId: string) => void
  onOpenClient?: (clientId: string) => void
  onRetry?: () => void
  sortKey: BisProjectSortKey
  sortDir: BisProjectSortDir
  onSort: (key: BisProjectSortKey) => void
}) {
  const today = todayIsoDate()
  const allChecked = rows.length > 0 && rows.every((r) => selectedIds.has(r.id))
  const someChecked = rows.some((r) => selectedIds.has(r.id))

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
              className={cn('h-8 shrink-0 rounded-none border-stone-500', limsPrimaryBtnClass)}
              onClick={onRetry}
              disabled={loading}
            >
              {loading ? 'Retrying…' : 'Retry'}
            </Button>
          ) : null}
        </div>
      ) : null}

      {loading && rows.length === 0 ? (
        <p className="shrink-0 px-3 py-8 text-center text-sm text-[#78716c] sm:px-5">Loading…</p>
      ) : null}

      {!loading && rows.length === 0 ? (
        <div className="m-3 rounded-none border border-dashed border-stone-400 p-4 text-center sm:m-4 sm:p-6">
          <p className="text-sm text-[#78716c]">
            {searchActive ? 'No licenses match your search.' : 'No licenses found.'}
          </p>
        </div>
      ) : null}

      {rows.length > 0 ? (
        <div
          className={cn(
            'bis-projects-list-viewport min-h-0 flex-1 overflow-y-auto overflow-x-hidden',
            loading && 'opacity-60 transition-opacity',
          )}
        >
          {/* Cards — below ~10″ / lg */}
          <div className="bis-projects-card-view space-y-2 p-2 sm:space-y-2.5 sm:p-3">
            <div className="sticky top-0 z-[1] flex items-center gap-2 rounded-lg border border-stone-600 bg-stone-900 px-3 py-2.5 text-amber-200 shadow-sm">
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
                {selectedIds.size > 0 ? `${selectedIds.size} selected` : `${rows.length} licenses`}
              </span>
            </div>

            {rows.map((r, index) => {
              const selected = selectedIds.has(r.id)
              const client = clientDisplayName(r) || '—'
              const isLabel = isCodeDisplayLabel(r)
              const validity = licenseValidityState(r.license_validity_date, today)
              const licStyle = LICENSE_STATE_STYLES[validity.state]
              const even = index % 2 === 0
              const tone = selected ? 'bg-[#fde68a]/70' : even ? 'bg-[#fffcf7]' : 'bg-white'

              return (
                <article
                  key={r.id}
                  className={cn(
                    'overflow-hidden rounded-xl border border-stone-300 font-jakarta shadow-[0_2px_8px_rgba(41,37,36,0.08)] transition-shadow hover:shadow-md',
                    tone,
                    selected && 'ring-2 ring-amber-500/40',
                  )}
                >
                  <div className="min-w-0">
                    <div className="flex items-start gap-2.5 px-3 py-3 sm:px-4">
                      <input
                        type="checkbox"
                        className={cn(checkboxClass, 'mt-1 shrink-0')}
                        aria-label={`Select ${client}`}
                        checked={selected}
                        onChange={() => onToggle(r.id)}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start gap-2.5">
                          <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-100 text-amber-800">
                            <Building2 className="h-4 w-4" aria-hidden />
                          </span>
                          <div className="min-w-0 flex-1">
                            <TableTextLink
                              label={client}
                              recordId={r.client_id}
                              onOpen={onOpenClient}
                              kind="Client"
                              className="break-words text-[14px] font-bold leading-snug tracking-tight text-stone-900"
                            />
                            <div className="mt-0.5 text-xs font-semibold text-amber-800">
                              <TableTextLink
                                label={isLabel}
                                recordId={r.is_code_id}
                                onOpen={onOpenIsCode}
                                kind="IS Code"
                              />
                            </div>
                          </div>
                          <RowActions
                            row={r}
                            client={client}
                            emailBusy={emailBusy}
                            onEdit={onEdit}
                            onViewDocuments={onViewDocuments}
                            onEmailDocument={onEmailDocument}
                          />
                        </div>

                        <div className="mt-3 flex flex-wrap items-center gap-2 pl-10">
                          <span className="text-[9px] font-bold uppercase tracking-[0.12em] text-stone-500">CM/L</span>
                          <CmLNumberLink
                            digits={r.cm_l_digits}
                            className="rounded-md border border-stone-300 bg-stone-50 px-2 py-1 font-mono text-[11px] font-semibold text-stone-700 no-underline hover:underline"
                          />
                          <span
                            className={cn(
                              'ml-auto rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.08em]',
                              validity.state === 'operative' &&
                                'border-emerald-700/20 bg-emerald-50 text-emerald-800',
                              validity.state === 'expiring' &&
                                'border-amber-700/20 bg-amber-50 text-amber-800',
                              validity.state === 'expired' &&
                                'border-red-700/20 bg-red-50 text-red-800',
                              validity.state === 'unknown' &&
                                'border-stone-300 bg-stone-100 text-stone-600',
                            )}
                          >
                            {licStyle.label}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3 border-t border-stone-200 bg-[#faf8f3] px-3 py-2.5 sm:px-4">
                      <div className="min-w-0">
                        <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-stone-500">Validity</p>
                        <div className="mt-1 flex min-w-0 items-center gap-1.5 text-xs">
                          <Calendar className="h-3.5 w-3.5 shrink-0 text-amber-700" aria-hidden />
                          <p className="truncate tabular-nums text-stone-700">
                            {formatDisplayDate(r.license_validity_date)}
                            {validity.daysLeft != null && validity.state === 'expiring'
                              ? ` · ${validity.daysLeft}d left`
                              : ''}
                          </p>
                        </div>
                      </div>
                      <div className="min-w-0">
                        <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-stone-500">Billing</p>
                        <div className="mt-1 flex min-w-0 items-center gap-1.5 text-xs">
                          <Wallet className="h-3.5 w-3.5 shrink-0 text-amber-700" aria-hidden />
                          <p className="truncate text-stone-700">
                            {formatInr(r.billing_amount)}
                            {r.billing_frequency ? ` · ${r.billing_frequency}` : ''}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                </article>
              )
            })}
          </div>

          {/* Table — ~10″ / lg+ */}
          <div className="bis-projects-table-view min-w-0">
            <Table className={GRID_TABLE}>
              <colgroup>
                <col className="w-10" />
                <col className="w-[29%]" />
                <col className="w-[15%]" />
                <col className="w-[15%]" />
                <col className="w-[16%]" />
                <col className="w-[11%]" />
                <col className="bis-projects-action-column" />
              </colgroup>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className={cn(thBase, 'w-[4%]')}>
                    <input
                      type="checkbox"
                      className={checkboxClass}
                      aria-label="Select all on this page"
                      checked={allChecked}
                      ref={(el) => {
                        if (el) el.indeterminate = !allChecked && someChecked
                      }}
                      onChange={(e) => onToggleAll(e.target.checked)}
                    />
                  </TableHead>
                  <SortableHeader
                    label="Name of the Client"
                    columnKey="client"
                    sortKey={sortKey}
                    sortDir={sortDir}
                    onSort={onSort}
                    className={cn(thBase, 'text-left')}
                    align="left"
                  />
                  <SortableHeader
                    label="IS Code"
                    columnKey="isCode"
                    sortKey={sortKey}
                    sortDir={sortDir}
                    onSort={onSort}
                    className={cn(thBase, 'w-[12%]')}
                  />
                  <SortableHeader
                    label="CM/L Number"
                    columnKey="cmL"
                    sortKey={sortKey}
                    sortDir={sortDir}
                    onSort={onSort}
                    className={cn(thBase, 'w-[12%]')}
                  />
                  <SortableHeader
                    label="License Validity"
                    columnKey="validity"
                    sortKey={sortKey}
                    sortDir={sortDir}
                    onSort={onSort}
                    className={cn(thBase, 'w-[12%]')}
                  />
                  <SortableHeader
                    label="Billing"
                    columnKey="billing"
                    sortKey={sortKey}
                    sortDir={sortDir}
                    onSort={onSort}
                    className={cn(thBase, 'w-[12%]')}
                  />
                  <TableHead className={cn('bis-projects-action-column', thBase)}>Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r, index) => {
                  const selected = selectedIds.has(r.id)
                  const client = clientDisplayName(r) || '—'
                  const isLabel = isCodeDisplayLabel(r)
                  const validity = licenseValidityState(r.license_validity_date, today)
                  const licStyle = LICENSE_STATE_STYLES[validity.state]
                  return (
                    <TableRow
                      key={r.id}
                      data-state={selected ? 'selected' : undefined}
                      className={cn(
                        'border-b border-[#e7e0d4]',
                        selected ? rowSelectedClass : index % 2 === 0 ? rowEvenClass : rowOddClass,
                      )}
                    >
                      <TableCell className="bis-projects-action-column px-2 py-2 text-center align-middle">
                        <input
                          type="checkbox"
                          className={checkboxClass}
                          aria-label={`Select ${client}`}
                          checked={selected}
                          onChange={() => onToggle(r.id)}
                        />
                      </TableCell>
                      <TableCell className="px-2 py-2 text-left align-middle">
                        <TableTextLink
                          label={client}
                          recordId={r.client_id}
                          onOpen={onOpenClient}
                          kind="Client"
                          className="break-all text-sm font-semibold leading-snug"
                        />
                      </TableCell>
                      <TableCell className="px-2 py-2 text-center align-middle text-sm">
                        <TableTextLink
                          label={isLabel}
                          recordId={r.is_code_id}
                          onOpen={onOpenIsCode}
                          kind="IS Code"
                          className="block w-full text-center"
                        />
                      </TableCell>
                      <TableCell className="px-2 py-2 text-center align-middle">
                        <CmLNumberLink digits={r.cm_l_digits} />
                        <p className={cn('text-xs font-medium', licStyle.className)}>{licStyle.label}</p>
                      </TableCell>
                      <TableCell className="px-2 py-2 text-center align-middle text-sm">
                        <p className="tabular-nums font-medium text-[#292524]">
                          {formatDisplayDate(r.license_validity_date)}
                        </p>
                        {validity.daysLeft != null && validity.state === 'expiring' ? (
                          <p className="text-[11px] text-amber-700">{validity.daysLeft} day(s) left</p>
                        ) : null}
                        {validity.state === 'expired' ? (
                          <p className="text-[11px] text-red-700">
                            Expired {Math.abs(validity.daysLeft ?? 0)} day(s) ago
                          </p>
                        ) : null}
                      </TableCell>
                      <TableCell className="px-2 py-2 text-center align-middle text-sm">
                        <p className="tabular-nums text-[#292524]">{formatInr(r.billing_amount)}</p>
                        <p className="text-xs text-[#78716c]">{r.billing_frequency || '—'}</p>
                      </TableCell>
                      <TableCell className="px-2 py-2 text-center align-middle">
                        <RowActions
                          row={r}
                          client={client}
                          emailBusy={emailBusy}
                          onEdit={onEdit}
                          onViewDocuments={onViewDocuments}
                          onEmailDocument={onEmailDocument}
                        />
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        </div>
      ) : null}
    </div>
  )
}
