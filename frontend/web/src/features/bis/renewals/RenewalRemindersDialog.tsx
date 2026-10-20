import { useCallback, useEffect, useState } from 'react'
import { BellRing, LoaderCircle, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useIsLaboratoryDirector } from '@/components/lims/LaboratoryDirectorOnly'
import { cn } from '@/lib/utils'
import { limsDialogClass } from '@/lib/limsThemeUi'
import { formatDisplayDate } from '../projects/types'
import {
  enableRenewalReminders,
  fetchRenewalReminderPlan,
  setRenewalRemindersEnabled,
  setRenewalRemindersPaused,
  type RenewalReminderPlan,
  type RenewalReminderPlanItem,
} from './renewalRemindersApi'

const th = 'border border-stone-700 bg-stone-800 px-2 py-2 text-center text-[11px] font-bold uppercase tracking-wider text-amber-200'
const td = 'border border-stone-300 px-2 py-1.5 text-center align-middle'

const ACTION_STYLE: Record<RenewalReminderPlanItem['action'], string> = {
  send: 'bg-amber-100 text-amber-900 border-amber-300',
  done: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  wait: 'bg-stone-100 text-stone-600 border-stone-200',
  skip: 'bg-red-50 text-red-800 border-red-200',
}

function actionText(item: RenewalReminderPlanItem, enabled: boolean): string {
  if (item.action === 'send') return enabled ? `${item.stage}-day reminder goes today` : `${item.stage}-day due — skipped when turned on`
  return item.reason
}

/** Automatic renewal reminders: on / off, today's plan and a per-licence pause. */
export function RenewalRemindersDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const isAdmin = useIsLaboratoryDirector()
  const [plan, setPlan] = useState<RenewalReminderPlan | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setPlan(await fetchRenewalReminderPlan())
      setError('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load the reminder plan.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!open) return
    let active = true
    fetchRenewalReminderPlan()
      .then((next) => { if (active) { setPlan(next); setError('') } })
      .catch((err: unknown) => { if (active) setError(err instanceof Error ? err.message : 'Could not load the reminder plan.') })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [open])

  const settings = plan?.settings
  const sendCount = plan?.items.filter((i) => i.action === 'send').length ?? 0

  const toggleEnabled = async () => {
    if (!settings) return
    const next = !settings.enabled
    if (next && !window.confirm(`Turn on automatic reminders?${sendCount ? ` The ${sendCount} reminder(s) already due today will be marked skipped (no email).` : ''} Emails go out as licences reach the next stage.`)) return
    setBusy(true)
    try {
      if (next) {
        const { skipped } = await enableRenewalReminders()
        toast.success(`Automatic renewal reminders are on.${skipped ? ` ${skipped} already-due reminder(s) skipped.` : ''}`)
      } else {
        await setRenewalRemindersEnabled(false)
        toast.success('Automatic Renewal Reminders Are Off.')
      }
      await load()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not change the setting.')
    } finally {
      setBusy(false)
    }
  }

  const togglePaused = async (item: RenewalReminderPlanItem) => {
    setBusy(true)
    try {
      await setRenewalRemindersPaused(item.projectId, !item.paused)
      await load()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not change reminders for this licence.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !busy && onOpenChange(next)}>
      <DialogContent
        persistOnFocusLoss
        aria-describedby={undefined}
        className={cn(limsDialogClass, 'flex max-h-[90vh] w-[min(72rem,calc(100vw_-_var(--app-dialog-overlay-left,0px)_-_1.5rem))] min-w-0 max-w-6xl flex-col p-0')}
      >
        <DialogHeader className="bg-gradient-to-br from-stone-800 via-stone-900 to-stone-950 py-2.5 pl-4 pr-12 text-left">
          <DialogTitle className="flex items-center gap-2 text-base font-semibold text-white">
            <BellRing className="size-4 text-amber-300" aria-hidden />
            Automatic Renewal Reminders
          </DialogTitle>
        </DialogHeader>
        <div className="min-h-0 flex-1 space-y-3 overflow-auto bg-[#fffcf7] p-4 text-sm">
          <div className="flex flex-wrap items-center justify-between gap-3 border border-stone-300 bg-white p-3">
            <div className="space-y-1">
              <p className="font-semibold">
                Status:{' '}
                <span className={settings?.enabled ? 'text-emerald-700' : 'text-red-700'}>{settings ? (settings.enabled ? 'ON' : 'OFF') : '—'}</span>
              </p>
              <p className="text-xs text-stone-600">
                Email to the client at {settings ? settings.stages.join(' / ') : '85 / 50 / 10'} days before validity, every day after{' '}
                {settings?.sendHourIst ?? 9}:00 AM IST, with the Excel for month-wise production and consignee details.
                {settings?.lastRunOn ? ` Last run: ${formatDisplayDate(settings.lastRunOn)}.` : ''}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button type="button" variant="outline" className="h-8 rounded-none" disabled={loading || busy} onClick={() => void load()}>
                <RefreshCw className={cn('mr-2 size-4', loading && 'animate-spin')} aria-hidden />
                Refresh
              </Button>
              {isAdmin ? (
                <Button
                  type="button"
                  className={cn('h-8 min-w-[9rem] rounded-none text-white', settings?.enabled ? 'bg-red-700 hover:bg-red-800' : 'bg-amber-700 hover:bg-amber-800')}
                  disabled={!settings || busy}
                  onClick={() => void toggleEnabled()}
                >
                  {busy ? <LoaderCircle className="mr-2 size-4 animate-spin" aria-hidden /> : null}
                  {settings?.enabled ? 'Turn Off' : 'Turn On'}
                </Button>
              ) : null}
            </div>
          </div>

          {error ? <p role="alert" className="text-red-700">{error}</p> : null}
          {plan && !plan.items.length ? <p className="text-stone-600">No licence is within {settings?.stages[0] ?? 85} days of validity.</p> : null}

          {plan?.items.length ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] border-collapse">
                <thead>
                  <tr>
                    <th className={th}>Firm / Licence</th>
                    <th className={th}>Valid Till</th>
                    <th className={th}>Days Left</th>
                    <th className={th}>Today</th>
                    <th className={th}>Sent</th>
                    <th className={th}>Client Email</th>
                    <th className={th}>Reminders</th>
                  </tr>
                </thead>
                <tbody>
                  {plan.items.map((item) => (
                    <tr key={item.projectId} className="odd:bg-white even:bg-[#faf7f1]">
                      <td className={cn(td, 'text-left')}>
                        <div className="font-semibold">{item.firm || '—'}</div>
                        <div className="text-xs text-stone-600">CM/L-{item.cml} · {item.isLabel}</div>
                      </td>
                      <td className={cn(td, 'whitespace-nowrap')}>{formatDisplayDate(item.validity)}</td>
                      <td className={cn(td, 'tabular-nums', item.daysLeft <= 10 && 'font-bold text-red-700')}>{item.daysLeft}</td>
                      <td className={td}>
                        <span className={cn('inline-block border px-2 py-0.5 text-xs', ACTION_STYLE[item.action])}>{actionText(item, Boolean(settings?.enabled))}</span>
                      </td>
                      <td className={cn(td, 'whitespace-nowrap text-xs')}>{item.sentStages.length ? item.sentStages.map((s) => `${s}-day`).join(', ') : '—'}</td>
                      <td className={cn(td, 'max-w-[14rem] truncate text-xs')} title={item.email}>{item.email || '—'}</td>
                      <td className={td}>
                        <label className="inline-flex cursor-pointer items-center gap-1.5 text-xs">
                          <input type="checkbox" className="size-4 accent-amber-700" checked={!item.paused} disabled={busy} onChange={() => void togglePaused(item)} />
                          {item.paused ? 'Paused' : 'On'}
                        </label>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </div>
        <DialogFooter className="border-t border-stone-200 bg-stone-50 px-4 py-3">
          <Button type="button" variant="outline" className="rounded-none" disabled={busy} onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
