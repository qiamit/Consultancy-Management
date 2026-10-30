import { useCallback, useEffect, useState } from 'react'
import { Mail, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { DateInput } from '@/components/ui/date-input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import {
  limsDarkBarAccentClass,
  limsDarkBarBtnClass,
  limsDarkBarClass,
  limsDarkBarFieldClass,
  limsDarkBarGlowStyle,
  limsPageShellClass,
  limsPanelClass,
  limsTableBodyToneClass,
  limsTableClass,
  limsTableHeadClass,
} from '@/lib/limsThemeUi'
import { cn } from '@/lib/utils'
import {
  fetchEmailLog,
  fetchEmailLogUsers,
  type EmailLogFilters,
  type EmailLogRow,
  type EmailLogStatus,
} from './emailLogApi'

const PAGE_SIZE = 50

const STATUS_TONE: Record<EmailLogStatus, string> = {
  sent: 'bg-emerald-50 text-emerald-700',
  failed: 'bg-red-50 text-red-700',
  blocked: 'bg-amber-50 text-amber-800',
}

function formatWhen(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })
}

function formatBytes(n: number): string {
  if (!n) return ''
  if (n < 1024 * 1024) return `${Math.max(1, Math.round(n / 1024))} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

function recipients(row: EmailLogRow): string {
  const parts = [row.to_addrs.join(', ')]
  if (row.cc_addrs.length) parts.push(`cc: ${row.cc_addrs.join(', ')}`)
  if (row.bcc_addrs.length) parts.push(`bcc: ${row.bcc_addrs.join(', ')}`)
  return parts.filter(Boolean).join(' · ')
}

/** Settings → Email Log (admin only): every /send-email attempt from email_send_log. */
export default function EmailLogPage() {
  const [filters, setFilters] = useState<EmailLogFilters>({ status: '', userId: '', from: '', to: '' })
  const [page, setPage] = useState(0)
  const [rows, setRows] = useState<EmailLogRow[]>([])
  const [total, setTotal] = useState(0)
  const [users, setUsers] = useState<Map<string, string>>(new Map())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)

  // loading is switched on by whatever changes filters, page or reloadKey.
  useEffect(() => {
    let cancelled = false
    fetchEmailLog(filters, page, PAGE_SIZE)
      .then((result) => {
        if (cancelled) return
        setRows(result.rows)
        setTotal(result.total)
        setError(null)
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setRows([])
        setTotal(0)
        setError(err instanceof Error ? err.message : 'Could not load the email log')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [filters, page, reloadKey])

  const reload = useCallback(() => {
    setLoading(true)
    setReloadKey((k) => k + 1)
  }, [])

  useEffect(() => {
    void fetchEmailLogUsers()
      .then(setUsers)
      .catch(() => setUsers(new Map()))
  }, [])

  const setFilter = (patch: Partial<EmailLogFilters>) => {
    setLoading(true)
    setPage(0)
    setFilters((prev) => ({ ...prev, ...patch }))
  }

  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const userOptions = Array.from(users.entries()).sort((a, b) => a[1].localeCompare(b[1]))

  return (
    <div className={limsPageShellClass}>
      <div className={cn(limsPanelClass, limsDarkBarClass, 'px-3 py-3 sm:px-4')}>
        <div className="pointer-events-none absolute inset-0 opacity-90" style={limsDarkBarGlowStyle} />
        <div className={limsDarkBarAccentClass} />
        <div className="relative flex flex-wrap items-center gap-2">
          <Mail className="h-5 w-5 text-amber-300" aria-hidden />
          <h1 className="mr-auto text-base font-semibold tracking-wide">Email Log</h1>
          <select
            aria-label="Status"
            className={cn(limsDarkBarFieldClass, 'px-2 text-sm')}
            value={filters.status}
            onChange={(e) => setFilter({ status: e.target.value as EmailLogFilters['status'] })}
          >
            <option value="">All Statuses</option>
            <option value="sent">Sent</option>
            <option value="failed">Failed</option>
            <option value="blocked">Blocked</option>
          </select>
          <select
            aria-label="User"
            className={cn(limsDarkBarFieldClass, 'max-w-[12rem] px-2 text-sm')}
            value={filters.userId}
            onChange={(e) => setFilter({ userId: e.target.value })}
          >
            <option value="">All Users</option>
            {userOptions.map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </select>
          <DateInput
            aria-label="From Date"
            className={cn(limsDarkBarFieldClass, 'px-2 text-sm')}
            value={filters.from}
            onChange={(e) => setFilter({ from: e.target.value })}
          />
          <DateInput
            aria-label="To Date"
            className={cn(limsDarkBarFieldClass, 'px-2 text-sm')}
            value={filters.to}
            onChange={(e) => setFilter({ to: e.target.value })}
          />
          <Button type="button" variant="outline" className={limsDarkBarBtnClass} onClick={reload}>
            <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} aria-hidden />
            Refresh
          </Button>
        </div>
      </div>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <div className={cn(limsPanelClass, 'overflow-x-auto')}>
        <Table className={cn(limsTableClass, 'list-cards')}>
          <TableHeader>
            <TableRow>
              <TableHead className={limsTableHeadClass}>When</TableHead>
              <TableHead className={limsTableHeadClass}>User</TableHead>
              <TableHead className={limsTableHeadClass}>Module</TableHead>
              <TableHead className={limsTableHeadClass}>Recipients</TableHead>
              <TableHead className={limsTableHeadClass}>Subject</TableHead>
              <TableHead className={limsTableHeadClass}>Attachments</TableHead>
              <TableHead className={limsTableHeadClass}>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody className={limsTableBodyToneClass}>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="py-6 text-center text-sm text-muted-foreground">
                  {loading ? 'Loading…' : 'No emails match these filters.'}
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell data-label="When" className="whitespace-nowrap text-xs">{formatWhen(row.created_at)}</TableCell>
                  <TableCell data-label="User" className="text-sm">
                    {(row.user_id && users.get(row.user_id)) || row.user_id || '—'}
                  </TableCell>
                  <TableCell data-label="Module" className="lc-wide break-all text-xs text-muted-foreground">{row.source_path || '—'}</TableCell>
                  <TableCell data-label="Recipients" className="lc-wide max-w-[22rem] break-words text-xs">{recipients(row) || '—'}</TableCell>
                  <TableCell className="lc-title max-w-[18rem] break-words text-sm">{row.subject || '—'}</TableCell>
                  <TableCell data-label="Attachments" className="whitespace-nowrap text-center text-xs">
                    {row.attachment_count ? `${row.attachment_count} · ${formatBytes(row.attachment_bytes)}` : '—'}
                  </TableCell>
                  <TableCell data-label="Status" className="text-center">
                    <span
                      className={cn('inline-flex rounded-md px-2 py-0.5 text-xs font-medium capitalize', STATUS_TONE[row.status])}
                      title={row.error || undefined}
                    >
                      {row.status}
                    </span>
                    {row.error ? (
                      <p className="mt-1 max-w-[16rem] break-words text-left text-[11px] text-muted-foreground">
                        {row.error}
                      </p>
                    ) : null}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-stone-700">
        <span>
          {total} email{total === 1 ? '' : 's'}
        </span>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            className="h-8 rounded-none"
            disabled={page === 0 || loading}
            onClick={() => {
              setLoading(true)
              setPage((p) => Math.max(0, p - 1))
            }}
          >
            Previous
          </Button>
          <span>
            Page {page + 1} of {pages}
          </span>
          <Button
            type="button"
            variant="outline"
            className="h-8 rounded-none"
            disabled={page + 1 >= pages || loading}
            onClick={() => {
              setLoading(true)
              setPage((p) => p + 1)
            }}
          >
            Next
          </Button>
        </div>
      </div>
    </div>
  )
}
