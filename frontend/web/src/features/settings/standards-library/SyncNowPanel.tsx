import { useCallback, useEffect, useRef, useState } from 'react'
import { CloudDownload, X } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { limsOutlineBtnClass, limsPanelClass, limsPrimaryBtnClass } from '@/lib/limsThemeUi'
import { cn } from '@/lib/utils'
import {
  cancelStandardsSync,
  fetchSyncState,
  requestStandardsSync,
  type SyncRequestStatus,
  type SyncState,
} from './standardsLibraryApi'

/** The Mac checks every 10 minutes; a check older than this means it is off, asleep or offline. */
const MAC_AWAY_MIN = 25
const POLL_MS = 20_000

const TONE: Record<SyncRequestStatus, string> = {
  pending: 'bg-amber-50 text-amber-800',
  running: 'bg-sky-50 text-sky-700',
  done: 'bg-emerald-50 text-emerald-700',
  failed: 'bg-red-50 text-red-700',
  cancelled: 'bg-stone-100 text-stone-600',
}

const LABEL: Record<SyncRequestStatus, string> = {
  pending: 'Waiting for the Mac',
  running: 'Mac Is Syncing',
  done: 'Done',
  failed: 'Failed',
  cancelled: 'Cancelled',
}

function when(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })
}

function minutesAgo(iso: string | null): number | null {
  if (!iso) return null
  const t = new Date(iso).getTime()
  return Number.isNaN(t) ? null : Math.max(0, Math.round((Date.now() - t) / 60000))
}

/**
 * "Sync Now" (Standards Library page): asks the Mac that holds the Oracle Database folder to copy it to the server
 * and index what is new or changed. The app only records the request; the Mac picks it up within 10 minutes.
 */
export function SyncNowPanel({ onFinished }: { onFinished: () => void }) {
  const [state, setState] = useState<SyncState | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const lastStatus = useRef<SyncRequestStatus | null>(null)

  const load = useCallback(async () => {
    try {
      const next = await fetchSyncState()
      setState(next)
      setError(null)
      const status = next.request?.status ?? null
      const was = lastStatus.current
      lastStatus.current = status
      if ((was === 'pending' || was === 'running') && (status === 'done' || status === 'failed')) {
        if (status === 'done') toast.success('Standards Sync Done.')
        else toast.error('Standards Sync Failed. See the Note on the Page.')
        onFinished()
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could Not Read the Sync State')
    }
  }, [onFinished])

  const request = state?.request ?? null
  const open = request?.status === 'pending' || request?.status === 'running'

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    if (!open) return
    const t = window.setInterval(() => void load(), POLL_MS)
    return () => window.clearInterval(t)
  }, [open, load])

  const start = async () => {
    setBusy(true)
    try {
      await requestStandardsSync()
      toast.success('Sync Asked. The Mac Starts It Within 10 Minutes.')
      await load()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could Not Ask for a Sync')
    } finally {
      setBusy(false)
    }
  }

  const cancel = async () => {
    if (!request) return
    setBusy(true)
    try {
      const ok = await cancelStandardsSync(request.id)
      toast[ok ? 'success' : 'error'](ok ? 'Sync Cancelled.' : 'The Mac Has Already Started This Sync.')
      await load()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could Not Cancel')
    } finally {
      setBusy(false)
    }
  }

  const ago = minutesAgo(state?.macLastSeen ?? null)
  const macAway = ago === null || ago > MAC_AWAY_MIN
  const macText =
    ago === null
      ? 'The Mac Has Not Checked Yet. Run "standards-sync.sh install-schedule" on the Mac Once.'
      : `${state?.macHost || 'Mac'} Last Checked ${ago < 1 ? 'Just Now' : `${ago} Min Ago`}${
          macAway ? ': It Seems Off, Asleep or Offline. The Sync Starts When It Is Back.' : ''
        }`

  return (
    <div className={cn(limsPanelClass, 'flex flex-wrap items-center gap-x-4 gap-y-2 px-3 py-2')}>
      <div className="mr-auto min-w-0 space-y-0.5">
        <p className="text-sm font-semibold">Sync Now</p>
        <p className="text-xs text-muted-foreground">
          Added or Replaced PDFs in the Oracle Database Folder? Press Sync Now. The Mac Copies the Folder to the Server
          and Indexes Only New and Changed Files.
        </p>
        <p className={cn('text-xs', macAway ? 'text-amber-700' : 'text-muted-foreground')}>{macText}</p>
        {request ? (
          <p className="flex flex-wrap items-center gap-2 text-xs">
            <span className={cn('inline-flex rounded-md px-2 py-0.5 font-medium', TONE[request.status])}>
              {LABEL[request.status]}
            </span>
            <span className="text-muted-foreground">
              Asked {when(request.requested_at)}
              {request.finished_at ? ` · Finished ${when(request.finished_at)}` : ''}
            </span>
            {request.message && !open ? <span className="text-muted-foreground">· {request.message}</span> : null}
          </p>
        ) : null}
        {error ? <p className="text-xs text-destructive">{error}</p> : null}
      </div>
      <div className="flex gap-2">
        {request?.status === 'pending' ? (
          <Button type="button" variant="outline" className={limsOutlineBtnClass} onClick={cancel} disabled={busy}>
            <X className="h-4 w-4" aria-hidden />
            Cancel
          </Button>
        ) : null}
        <Button type="button" className={limsPrimaryBtnClass} onClick={start} disabled={busy || open}>
          <CloudDownload className="h-4 w-4" aria-hidden />
          {open ? LABEL[request!.status] : 'Sync Now'}
        </Button>
      </div>
    </div>
  )
}
