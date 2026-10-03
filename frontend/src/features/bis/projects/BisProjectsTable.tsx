import { ExternalLink, Pencil } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { cn } from '@/lib/utils'
import {
  clientDisplayName,
  formatCmL,
  formatDisplayDate,
  formatInr,
  isCodeDisplayLabel,
  licenseValidityState,
  projectStatusLabel,
  todayIsoDate,
  type BisProjectRow,
  type LicenseValidityState,
} from './types'
import { openManakEbisAssist } from './manakExtensionBridge'

const EXTENSION_MISSING_MSG =
  'QE Consultancy extension is not loaded. Open this app in Chrome or Edge, then reload the extension from chrome://extensions.'

const GRID_TABLE =
  'min-w-[1040px] w-full border-collapse [&_th]:border [&_td]:border [&_th]:border-border [&_td]:border-border'

const checkboxClass =
  'h-4 w-4 rounded border-muted-foreground/30 text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'

const headClass = 'text-center text-xs'

const LICENSE_STATE_STYLES: Record<LicenseValidityState, { label: string; className: string }> = {
  operative: { label: 'Operative', className: 'text-emerald-700' },
  expiring: { label: 'Renewal Due', className: 'text-amber-700' },
  expired: { label: 'Expired', className: 'text-red-700' },
  unknown: { label: 'No Validity', className: 'text-stone-500' },
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
  onRetry,
}: {
  rows: BisProjectRow[]
  loading: boolean
  error: string | null
  searchActive: boolean
  selectedIds: Set<string>
  onToggle: (id: string) => void
  onToggleAll: (checked: boolean) => void
  onEdit: (row: BisProjectRow) => void
  onRetry?: () => void
}) {
  const today = todayIsoDate()
  const allChecked = rows.length > 0 && rows.every((r) => selectedIds.has(r.id))
  const someChecked = rows.some((r) => selectedIds.has(r.id))

  return (
    <div className="overflow-hidden rounded-none border-2 border-stone-500 bg-white shadow-sm ring-1 ring-amber-700/20">
      {error ? (
        <div className="flex flex-wrap items-start justify-between gap-2 px-3 pt-3 sm:px-5 sm:pt-4">
          <p className="min-w-0 flex-1 text-sm text-destructive">{error}</p>
          {onRetry ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 shrink-0 rounded-none border-stone-500"
              onClick={onRetry}
              disabled={loading}
            >
              {loading ? 'Retrying…' : 'Retry'}
            </Button>
          ) : null}
        </div>
      ) : null}

      {loading && rows.length === 0 ? (
        <p className="px-5 py-8 text-center text-sm text-muted-foreground">Loading…</p>
      ) : rows.length === 0 ? (
        <div className="m-3 rounded-lg border border-dashed border-border p-4 text-center sm:m-4 sm:p-6">
          <p className="text-sm text-muted-foreground">
            {searchActive ? 'No licenses match your search.' : 'No licenses found.'}
          </p>
        </div>
      ) : (
        <div className={cn('overflow-x-auto', loading && 'opacity-60 transition-opacity')}>
          <Table className={GRID_TABLE}>
            <TableHeader>
              <TableRow className="bg-stone-800 hover:bg-stone-800">
                <TableHead className="sticky left-0 z-10 w-12 bg-stone-800 text-center text-[11px] font-bold uppercase tracking-[0.14em] text-amber-200 sm:w-14">
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
                <TableHead className="sticky left-12 z-10 min-w-[220px] bg-stone-800 text-left text-[11px] font-bold uppercase tracking-[0.14em] text-amber-200 sm:left-14">
                  Name of the Client
                </TableHead>
                <TableHead className={cn(headClass, 'min-w-[160px]')}>IS Code</TableHead>
                <TableHead className={cn(headClass, 'min-w-[140px]')}>CM/L Number</TableHead>
                <TableHead className={cn(headClass, 'min-w-[130px]')}>License Validity</TableHead>
                <TableHead className={cn(headClass, 'min-w-[130px]')}>Billing</TableHead>
                <TableHead className={cn(headClass, 'min-w-[140px]')}>Status / Stage</TableHead>
                <TableHead className={cn(headClass, 'min-w-[110px]')}>Managed By</TableHead>
                <TableHead className={cn(headClass, 'min-w-[100px]')}>Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => {
                const selected = selectedIds.has(r.id)
                const client = clientDisplayName(r) || '—'
                const isLabel = isCodeDisplayLabel(r)
                const validity = licenseValidityState(r.license_validity_date, today)
                const licStyle = LICENSE_STATE_STYLES[validity.state]
                const stickyCellBg = selected
                  ? 'bg-[#fde68a]/80 group-hover:bg-[#fde68a]/80'
                  : 'bg-white group-hover:bg-[#f3e9d8]'
                return (
                  <TableRow key={r.id} data-state={selected ? 'selected' : undefined} className="group">
                    <TableCell
                      className={cn(
                        'sticky left-0 z-10 text-center align-middle transition-colors',
                        stickyCellBg,
                      )}
                    >
                      <input
                        type="checkbox"
                        className={checkboxClass}
                        aria-label={`Select ${client}`}
                        checked={selected}
                        onChange={() => onToggle(r.id)}
                      />
                    </TableCell>
                    <TableCell
                      className={cn(
                        'sticky left-12 z-10 align-middle transition-colors sm:left-14',
                        stickyCellBg,
                      )}
                    >
                      <p
                        className="min-w-[200px] max-w-[300px] break-words font-medium leading-snug text-foreground"
                        title={client}
                      >
                        {client}
                      </p>
                    </TableCell>
                    <TableCell className="align-middle text-center text-sm">
                      {isLabel ? (
                        <div className="space-y-0.5">
                          <p className="font-medium text-foreground">{isLabel}</p>
                          {r.is_code?.title ? (
                            <p
                              className="mx-auto max-w-[200px] truncate text-[11px] text-muted-foreground"
                              title={r.is_code.title}
                            >
                              {r.is_code.title}
                            </p>
                          ) : null}
                        </div>
                      ) : (
                        '—'
                      )}
                    </TableCell>
                    <TableCell className="align-middle text-center">
                      <p className="font-mono text-xs tabular-nums text-foreground">
                        {formatCmL(r.cm_l_digits)}
                      </p>
                      <p className={cn('text-xs font-medium', licStyle.className)}>{licStyle.label}</p>
                    </TableCell>
                    <TableCell className="align-middle text-center text-sm">
                      <p className="tabular-nums font-medium text-foreground">
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
                    <TableCell className="align-middle text-center text-sm">
                      <p className="tabular-nums text-foreground">{formatInr(r.billing_amount)}</p>
                      <p className="text-xs text-muted-foreground">{r.billing_frequency || '—'}</p>
                    </TableCell>
                    <TableCell className="align-middle text-center text-sm">
                      <p className="font-medium text-foreground">{projectStatusLabel(r.status)}</p>
                      {r.application_stage ? (
                        <p className="text-xs text-muted-foreground">{r.application_stage}</p>
                      ) : null}
                    </TableCell>
                    <TableCell className="align-middle text-center text-xs">
                      <span
                        className={cn(
                          'inline-flex rounded-full px-2 py-0.5 font-medium ring-1 ring-inset',
                          r.is_qe_managed !== false
                            ? 'bg-amber-50 text-amber-900 ring-amber-200'
                            : 'bg-slate-50 text-slate-700 ring-slate-200',
                        )}
                      >
                        {r.is_qe_managed !== false ? 'QE' : 'Not QE'}
                      </span>
                    </TableCell>
                    <TableCell className="align-middle text-center">
                      <div className="inline-flex items-center gap-0.5">
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          aria-label={`Manak Assist for ${client}`}
                          title="Manak Assist"
                          onClick={() => {
                            void openManakEbisAssist({
                              portalUserId: r.portal_user_id,
                              portalPassword: r.portal_password,
                            }).then(({ extensionUsed }) => {
                              if (extensionUsed) {
                                toast.success('Opening Manak eBIS via extension')
                              } else {
                                toast.warning('Extension not detected — opened Manak eBIS in a new tab', {
                                  description: EXTENSION_MISSING_MSG,
                                })
                              }
                            })
                          }}
                        >
                          <ExternalLink size={16} />
                        </Button>
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          aria-label={`Edit ${client}`}
                          title="Edit"
                          onClick={() => onEdit(r)}
                        >
                          <Pencil size={16} />
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
