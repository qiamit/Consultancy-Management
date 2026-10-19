import { useEffect, useState } from 'react'
import { LoaderCircle, Send } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { limsFieldClass, limsManageDialogClass, limsPrimaryBtnClass } from '@/lib/limsThemeUi'
import { formatCmL, formatDisplayDate, licenseValidityState, type BisProjectRow } from '../projects/types'
import { fetchRenewalReminderHistory, reminderStageLabel, sendRenewalReminderNow, type RenewalReminderRow } from './renewalRemindersApi'

/** Same period the server attaches: the 12 months ending 3 months before validity. */
function productionPeriod(validity: string): { from: string; to: string } | null {
  const date = /^\d{4}-\d{2}-\d{2}$/.test(validity) ? new Date(`${validity}T00:00:00Z`) : null
  if (!date) return null
  const shift = (months: number) => {
    const day = date.getUTCDate()
    const out = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1))
    out.setUTCDate(Math.min(day, new Date(Date.UTC(out.getUTCFullYear(), out.getUTCMonth() + 1, 0)).getUTCDate()))
    return out
  }
  const from = shift(-15)
  from.setUTCDate(from.getUTCDate() + 1)
  return { from: from.toISOString().slice(0, 10), to: shift(-3).toISOString().slice(0, 10) }
}

/** The row's mail button: send the renewal reminder (with the production sheet) now, through the app. */
export function RenewalReminderSendDialog({ row, onOpenChange }: { row: BisProjectRow | null; onOpenChange: (open: boolean) => void }) {
  // Keyed by licence so the recipient and history start fresh for each row.
  return <SendDialog key={row?.id ?? 'none'} row={row} onOpenChange={onOpenChange} />
}

function SendDialog({ row, onOpenChange }: { row: BisProjectRow | null; onOpenChange: (open: boolean) => void }) {
  const [to, setTo] = useState(() => String(row?.client?.email ?? '').split(/[,;\s]+/).filter(Boolean)[0] ?? '')
  const [busy, setBusy] = useState(false)
  const [history, setHistory] = useState<RenewalReminderRow[]>([])

  useEffect(() => {
    if (!row) return
    let active = true
    void fetchRenewalReminderHistory([row.id])
      .then((rows) => { if (active) setHistory(rows.slice(0, 6)) })
      .catch(() => undefined)
    return () => { active = false }
  }, [row])

  const validity = String(row?.license_validity_date ?? '').slice(0, 10)
  const period = productionPeriod(validity)
  const state = row ? licenseValidityState(row.license_validity_date) : null

  const send = async () => {
    if (!row) return
    setBusy(true)
    try {
      const result = await sendRenewalReminderNow(row.id, to.trim())
      toast.success(`Renewal reminder sent to ${result.recipient}.`)
      onOpenChange(false)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not send the reminder.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={row != null} onOpenChange={(next) => !busy && onOpenChange(next)}>
      <DialogContent persistOnFocusLoss aria-describedby={undefined} className={cn(limsManageDialogClass, 'w-[min(36rem,calc(100vw_-_var(--app-dialog-overlay-left,0px)_-_1.5rem))]')}>
        <DialogHeader className="bg-gradient-to-br from-stone-800 via-stone-900 to-stone-950 py-2.5 pl-4 pr-12 text-left">
          <DialogTitle className="text-base font-semibold text-white">Send Renewal Reminder</DialogTitle>
        </DialogHeader>
        {row ? (
          <div className="space-y-3 bg-[#fffcf7] p-4 text-sm">
            <div className="border border-stone-300 bg-white p-3">
              <div className="font-semibold">{row.client?.company_name || '—'}</div>
              <div className="text-xs text-stone-600">
                {formatCmL(row.cm_l_digits)} · valid till {formatDisplayDate(validity)}
                {state && state.daysLeft != null ? ` (${state.daysLeft} day${state.daysLeft === 1 ? '' : 's'} left)` : ''}
              </div>
            </div>
            <div className="space-y-1">
              <label htmlFor="renewal-reminder-to" className="text-xs font-semibold">To</label>
              <input id="renewal-reminder-to" type="email" className={cn(limsFieldClass, 'w-full px-2')} value={to} disabled={busy} onChange={(e) => setTo(e.target.value)} placeholder="client@company.com" />
            </div>
            <p className="text-xs text-stone-600">
              Attached Excel: Production Data{period ? ` (${formatDisplayDate(period.from)} to ${formatDisplayDate(period.to)})` : ''} and Consignee Details. The client fills the month-wise production and the buyers, and replies.
            </p>
            {history.length ? (
              <div className="text-xs">
                <div className="mb-1 font-semibold">Earlier reminders</div>
                <ul className="space-y-0.5 text-stone-700">
                  {history.map((h) => (
                    <li key={h.id}>
                      {formatDisplayDate(h.created_at.slice(0, 10))} · {reminderStageLabel(h.stage)} ·{' '}
                      <span className={h.status === 'sent' ? 'text-emerald-700' : 'text-red-700'}>{h.status}</span>
                      {h.recipient ? ` · ${h.recipient}` : ''}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        ) : null}
        <DialogFooter className="gap-2 border-t border-stone-200 bg-stone-50 px-4 py-3">
          <Button type="button" variant="outline" className="rounded-none" disabled={busy} onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button type="button" className={cn(limsPrimaryBtnClass, 'min-w-[7rem]')} disabled={busy || !to.trim()} onClick={() => void send()}>
            {busy ? <LoaderCircle className="mr-2 size-4 animate-spin" aria-hidden /> : <Send className="mr-2 size-4" aria-hidden />}
            Send
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
