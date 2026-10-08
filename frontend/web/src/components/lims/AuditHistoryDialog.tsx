import { useEffect, useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { limsDialogClass } from '@/lib/limsThemeUi'
import { getAuditHistory, type AuditHistoryEntry } from '@/lib/auditApi'
import { cn } from '@/lib/utils'

const TRUNCATE_AT = 80

function formatIst(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso || '—'
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kolkata',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date)
  const pick = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? ''
  return `${pick('day')}-${pick('month')}-${pick('year')} ${pick('hour')}:${pick('minute')} IST`
}

function formatValue(value: unknown): string {
  if (value == null) return '—'
  if (typeof value === 'string') return value.trim() ? value : '—'
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

function actionLabel(entry: AuditHistoryEntry): string {
  const action = entry.action.trim().toUpperCase()
  const oldArchived = entry.old_data?.archived_at
  const newArchived = entry.new_data?.archived_at
  const hadArchive = oldArchived != null && String(oldArchived) !== ''
  const hasArchive = newArchived != null && String(newArchived) !== ''
  if (action === 'U' || action === 'UPDATE') {
    if (!hadArchive && hasArchive) return 'Archived'
    if (hadArchive && !hasArchive) return 'Restored'
    return 'Changed'
  }
  if (action === 'I' || action === 'INSERT') return 'Added'
  if (action === 'D' || action === 'DELETE') return 'Deleted'
  return entry.action || 'Changed'
}

function badgeClass(label: string): string {
  if (label === 'Added') return 'bg-emerald-100 text-emerald-900'
  if (label === 'Deleted') return 'bg-red-100 text-red-900'
  if (label === 'Archived') return 'bg-stone-200 text-stone-800'
  if (label === 'Restored') return 'bg-sky-100 text-sky-900'
  return 'bg-amber-100 text-amber-950'
}

function isForbidden(err: unknown): boolean {
  const anyErr = err as { code?: string; message?: string }
  const code = String(anyErr?.code ?? '')
  const message = String(anyErr?.message ?? err ?? '')
  return code === '42501' || message.includes('42501') || /only laboratory director\/admin/i.test(message)
}

function FieldChange({ name, from, to }: { name: string; from: string; to: string }) {
  const [open, setOpen] = useState(false)
  const long = from.length > TRUNCATE_AT || to.length > TRUNCATE_AT
  const showFrom = !long || open ? from : `${from.slice(0, TRUNCATE_AT)}…`
  const showTo = !long || open ? to : `${to.slice(0, TRUNCATE_AT)}…`
  return (
    <p className="break-words text-xs text-stone-800">
      <span className="font-semibold">{name}</span>
      {': '}
      <span className="text-stone-600">{showFrom}</span>
      {' → '}
      <span>{showTo}</span>
      {long ? (
        <button
          type="button"
          className="ml-2 inline-flex min-h-10 items-center text-xs font-semibold text-amber-900 underline"
          onClick={() => setOpen((value) => !value)}
        >
          {open ? 'Show less' : 'Show more'}
        </button>
      ) : null}
    </p>
  )
}

function changedFields(entry: AuditHistoryEntry): Array<{ name: string; from: string; to: string }> {
  const label = actionLabel(entry)
  if (label !== 'Changed' && label !== 'Archived' && label !== 'Restored') return []
  const keys = new Set([
    ...Object.keys(entry.old_data ?? {}),
    ...Object.keys(entry.new_data ?? {}),
  ])
  return [...keys].map((name) => ({
    name,
    from: formatValue(entry.old_data?.[name]),
    to: formatValue(entry.new_data?.[name]),
  }))
}

function HistoryBody({ entry }: { entry: AuditHistoryEntry }) {
  const label = actionLabel(entry)
  const who = entry.changed_by_name?.trim() || 'System'
  const fields = changedFields(entry)
  return (
    <div className="space-y-1">
      <div className="flex flex-wrap items-center gap-2">
        <span className={cn('inline-flex min-h-6 items-center px-2 text-[11px] font-bold uppercase', badgeClass(label))}>
          {label}
        </span>
        <span className="text-sm font-medium text-stone-900">{who}</span>
      </div>
      <p className="text-xs text-stone-600">{formatIst(entry.changed_at)}</p>
      {entry.changed_via ? <p className="text-xs text-stone-500">via {entry.changed_via}</p> : null}
      {fields.length > 0 ? (
        <div className="space-y-1 pt-1">
          {fields.map((field) => (
            <FieldChange key={field.name} name={field.name} from={field.from} to={field.to} />
          ))}
        </div>
      ) : null}
    </div>
  )
}

export function AuditHistoryDialog({
  open,
  onOpenChange,
  table,
  rowId,
  recordLabel,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  table: string
  rowId: string | null
  recordLabel: string
}) {
  const requestKey = open && rowId ? `${table}:${rowId}` : ''
  const [rows, setRows] = useState<AuditHistoryEntry[]>([])
  const [loadedKey, setLoadedKey] = useState('')
  const [error, setError] = useState<string | null>(null)
  const loading = Boolean(requestKey) && loadedKey !== requestKey

  useEffect(() => {
    if (!requestKey || !rowId) return
    let cancelled = false
    void getAuditHistory(table, rowId)
      .then((next) => {
        if (cancelled) return
        setRows(next)
        setError(null)
        setLoadedKey(requestKey)
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setRows([])
        setError(isForbidden(err) ? 'Only Admin can view history.' : 'Could not load change history.')
        setLoadedKey(requestKey)
      })
    return () => {
      cancelled = true
    }
  }, [requestKey, table, rowId])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          limsDialogClass,
          'flex max-h-[85vh] w-[min(42rem,calc(100vw-1rem))] flex-col overflow-hidden p-0',
        )}
        aria-describedby={undefined}
      >
        <DialogHeader className="shrink-0 border-b border-stone-300 bg-stone-900 px-4 py-3 text-left">
          <DialogTitle className="pr-8 text-base text-white">
            Change history — {recordLabel || 'record'}
          </DialogTitle>
        </DialogHeader>
        <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3 sm:px-4">
          {loading ? <p className="text-sm text-stone-600">Loading…</p> : null}
          {!loading && error ? <p className="text-sm text-red-700">{error}</p> : null}
          {!loading && !error && rows.length === 0 ? (
            <p className="text-sm text-stone-600">
              No changes recorded yet (history starts from S5, 08-Oct-2026).
            </p>
          ) : null}
          {!loading && !error && rows.length > 0 ? (
            <>
              <div className="hidden sm:block">
                <table className="w-full border-collapse text-left text-sm">
                  <thead>
                    <tr className="border-b border-stone-300 text-[11px] uppercase tracking-wide text-stone-500">
                      <th className="py-2 pr-3 font-semibold">When</th>
                      <th className="py-2 pr-3 font-semibold">What</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((entry) => (
                      <tr key={entry.id} className="border-b border-stone-200 align-top">
                        <td className="w-44 py-2 pr-3 text-xs text-stone-600">{formatIst(entry.changed_at)}</td>
                        <td className="py-2">
                          <HistoryBody entry={entry} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="space-y-2 sm:hidden">
                {rows.map((entry) => (
                  <article key={entry.id} className="border border-stone-300 bg-white p-3">
                    <HistoryBody entry={entry} />
                  </article>
                ))}
              </div>
            </>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  )
}
