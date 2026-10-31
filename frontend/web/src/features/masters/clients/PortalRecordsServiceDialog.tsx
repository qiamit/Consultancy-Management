import { useEffect, useState, type ReactNode } from 'react'
import { BadgeCheck, CalendarClock, IndianRupee, Loader2, Power, Send, Sparkles } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useConfirmDialog } from '@/components/ui/useConfirmDialog'
import { formatDisplayDate } from '@/features/bis/projects/types'
import { limsDarkBarGlowStyle, limsDialogClass, limsOutlineBtnClass, limsPrimaryBtnClass } from '@/lib/limsThemeUi'
import { addDaysIso, todayLocalIso } from '@/lib/localDate'
import { cn } from '@/lib/utils'
import {
  PAYMENT_MODES,
  TRIAL_DAYS,
  getPaymentSettings,
  listServicePayments,
  nextPaidPeriod,
  recordPayment,
  sendPaymentRequest,
  setRecordsEnabled,
  startTrial,
  type PaymentSettings,
  type RecordsService,
  type ServicePayment,
} from './portalRecordsAdminApi'
import { CalendarDateField } from './CalendarDateField'

type Action = 'trial' | 'request' | 'payment'

const th = 'border border-stone-700 bg-stone-800 px-2 py-1.5 text-center text-[11px] font-bold uppercase tracking-[0.08em] text-amber-200'
const td = 'border border-[#e7e0d4] px-2 py-1.5 text-center text-[13px] text-stone-800'

function errText(err: unknown, fallback: string) {
  return err instanceof Error ? err.message : fallback
}

function money(n: number) {
  return `₹ ${n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

// Each action has its own colour: trial blue, payment link amber, payment received green.
const TONES = {
  sky: { on: 'border-sky-600 bg-sky-50 ring-1 ring-sky-600', off: 'border-sky-200 bg-white hover:border-sky-500 hover:bg-sky-50/60', iconOn: 'bg-sky-600 text-white', iconOff: 'bg-sky-100 text-sky-700', btn: 'bg-sky-700 hover:bg-sky-800' },
  amber: { on: 'border-amber-600 bg-amber-50 ring-1 ring-amber-600', off: 'border-amber-200 bg-white hover:border-amber-500 hover:bg-amber-50/60', iconOn: 'bg-amber-600 text-white', iconOff: 'bg-amber-100 text-amber-800', btn: 'bg-amber-700 hover:bg-amber-800' },
  emerald: { on: 'border-emerald-600 bg-emerald-50 ring-1 ring-emerald-600', off: 'border-emerald-200 bg-white hover:border-emerald-500 hover:bg-emerald-50/60', iconOn: 'bg-emerald-600 text-white', iconOff: 'bg-emerald-100 text-emerald-700', btn: 'bg-emerald-700 hover:bg-emerald-800' },
} as const

function ActionCard({ active, icon, title, tone, disabled, onClick }: { active: boolean; icon: ReactNode; title: string; tone: keyof typeof TONES; disabled?: boolean; onClick: () => void }) {
  const t = TONES[tone]
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn('flex min-w-0 items-center gap-2.5 border p-3 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-50', active ? t.on : t.off)}
    >
      <span className={cn('flex h-8 w-8 shrink-0 items-center justify-center', active ? t.iconOn : t.iconOff)}>{icon}</span>
      <span className="min-w-0 text-sm font-semibold text-stone-900">{title}</span>
    </button>
  )
}

/**
 * The records service of one licence: start the free trial, email a payment request (UPI link + QR + bank
 * details), or record a payment (makes the Finance Payment Receipt and sets Paid Till). History below.
 */
export function PortalRecordsServiceDialog({
  licence,
  clientId,
  company,
  service,
  emails,
  onClose,
  onChanged,
}: {
  licence: { id: string; label: string } | null
  clientId: string
  company: string
  service: RecordsService | null
  emails: string[]
  onClose: () => void
  onChanged: () => void
}) {
  const [confirm, confirmDialog] = useConfirmDialog({ layer: 'top' })
  const today = todayLocalIso()
  const period = nextPaidPeriod(service, today)
  const [settings, setSettings] = useState<PaymentSettings | null>(null)
  const [payments, setPayments] = useState<ServicePayment[] | null>(null)
  const [action, setAction] = useState<Action>(service?.trial_ends ? 'request' : 'trial')
  const [busy, setBusy] = useState(false)
  const [amount, setAmount] = useState('')
  const [to, setTo] = useState<string[]>(emails)
  const [extraTo, setExtraTo] = useState('')
  const [paidOn, setPaidOn] = useState(today)
  const [mode, setMode] = useState<(typeof PAYMENT_MODES)[number]>('UPI')
  const [reference, setReference] = useState('')
  // Service period: from today (or after a running paid period) for one year; both dates can be changed.
  const [periodFrom, setPeriodFrom] = useState(period.from)
  const [periodTo, setPeriodTo] = useState(period.to)
  const changeFrom = (v: string) => {
    setPeriodFrom(v)
    if (v) setPeriodTo(nextPaidPeriod(null, v).to)
  }
  const chosenPeriod = { from: periodFrom, to: periodTo }
  const periodProblem = !periodFrom || !periodTo ? 'Enter the Period From and To' : periodTo < periodFrom ? 'Period To must be after Period From' : ''

  const licenceId = licence?.id ?? ''
  // Current state of the service: status word, when it started and till when it runs.
  const lastPaid = (payments ?? []).find((p) => p.kind === 'payment')
  const paidActive = Boolean(service?.records_enabled && service.paid_until && service.paid_until >= today)
  const trialActive = Boolean(service?.records_enabled && !paidActive && service.trial_ends && service.trial_ends >= today)
  const state = !service?.records_enabled ? 'off' : paidActive ? 'paid' : trialActive ? 'trial' : 'expired'
  const STATE = {
    off: { word: 'Off', tone: 'border-stone-300 bg-stone-100 text-stone-700', bar: 'from-stone-400' },
    trial: { word: 'Free Trial', tone: 'border-sky-300 bg-sky-50 text-sky-800', bar: 'from-sky-500' },
    paid: { word: 'Paid', tone: 'border-emerald-300 bg-emerald-50 text-emerald-800', bar: 'from-emerald-500' },
    expired: { word: 'Expired', tone: 'border-red-300 bg-red-50 text-red-800', bar: 'from-red-500' },
  }[state]
  const startDate = paidActive
    ? lastPaid?.period_from ?? null
    : service?.trial_ends
      ? addDaysIso(service.trial_ends, -TRIAL_DAYS)
      : null
  const tillDate = paidActive ? service?.paid_until ?? null : service?.trial_ends ?? service?.paid_until ?? null

  useEffect(() => {
    if (!licenceId) return
    let cancelled = false
    void Promise.all([getPaymentSettings(), listServicePayments(licenceId)])
      .then(([s, p]) => {
        if (cancelled) return
        setSettings(s)
        setPayments(p)
        if (s.rate != null) setAmount((prev) => prev || String(s.rate))
      })
      .catch((err: unknown) => !cancelled && toast.error(errText(err, 'Could not load the records service')))
    return () => {
      cancelled = true
    }
  }, [licenceId])

  const act = async (work: () => Promise<string | void>, done: string) => {
    setBusy(true)
    try {
      const extra = await work()
      toast.success(extra ? `${done}: ${extra}` : done)
      onChanged()
      setPayments(await listServicePayments(licenceId))
    } catch (err) {
      toast.error(errText(err, 'Action failed'))
    } finally {
      setBusy(false)
    }
  }

  const recipients = [...new Set([...to, ...extraTo.split(/[,;\s]+/).map((e) => e.trim()).filter((e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e))])]
  const amountValue = Number(amount)
  const canPayUpi = Boolean(settings?.upi)
  const canPayBank = Boolean(settings?.accountNumber)

  return (
    <Dialog open={licence != null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        layer="nested"
        aria-describedby={undefined}
        className={cn(limsDialogClass, '[&>button]:top-[14px] sm:[&>button]:top-[18px]', 'flex max-h-[92dvh] w-[min(52rem,calc(100vw-1rem))] max-w-none flex-col gap-0 overflow-hidden bg-white p-0')}
      >
        {confirmDialog}
        <div className="relative flex min-h-16 shrink-0 items-center overflow-hidden bg-gradient-to-br from-stone-800 via-stone-900 to-stone-950 px-4 py-2 text-white sm:px-5">
          <div className="pointer-events-none absolute inset-0 opacity-[0.2]" style={limsDarkBarGlowStyle} />
          <div className="absolute bottom-0 left-0 h-[3px] w-full bg-gradient-to-r from-amber-500 via-amber-300 to-transparent" />
          <DialogHeader className="relative min-w-0 flex-1 pr-10 text-left">
            <DialogTitle className="truncate text-lg font-semibold tracking-tight text-white">Records Service of {licence?.label}</DialogTitle>
          </DialogHeader>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto bg-[#fffcf7] p-3 sm:p-4">
          <div className="relative flex flex-wrap items-stretch gap-2 overflow-hidden border border-stone-300 bg-white p-2 shadow-sm">
            <div className={cn('absolute left-0 top-0 h-full w-1 bg-gradient-to-b to-transparent', STATE.bar)} />
            {[
              { label: 'Status', value: <span className={cn('inline-block border px-2 py-0.5 text-sm font-bold', STATE.tone)}>{STATE.word}</span> },
              { label: 'Start Date', value: startDate ? formatDisplayDate(startDate) : '—' },
              { label: 'Paid Till', value: tillDate ? formatDisplayDate(tillDate) : '—' },
              { label: 'Amount', value: settings == null ? '…' : settings.rate != null ? `${money(settings.rate)} / Year` : 'Not Set' },
            ].map((t) => (
              <div key={t.label} className="min-w-[8.5rem] flex-1 border border-stone-200 bg-[#fffcf7] px-3 py-2">
                <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-stone-500">{t.label}</p>
                <div className="mt-1 text-sm font-semibold text-stone-900">{t.value}</div>
              </div>
            ))}
            <div className="flex items-center px-1">
            {service?.records_enabled ? (
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                className={cn(limsOutlineBtnClass, 'h-10 w-10 p-0 text-red-700')}
                title="Switch Off Records Service"
                aria-label="Switch Off Records Service"
                onClick={() => void (async () => {
                  if (!(await confirm('Switch the records service off? The customer no longer sees the record sections; nothing is deleted.', { title: 'Switch Off Records', confirmLabel: 'Switch Off', destructive: true }))) return
                  await act(() => setRecordsEnabled(licenceId, false, service), 'Records Switched Off')
                })()}
              >
                <Power size={17} aria-hidden />
              </Button>
            ) : service?.trial_ends ? (
              <Button type="button" variant="outline" disabled={busy} className={cn(limsOutlineBtnClass, 'h-10 w-10 p-0 text-emerald-700')}
                title="Switch On Records Service Again" aria-label="Switch On Records Service Again"
                onClick={() => void act(() => setRecordsEnabled(licenceId, true, service), 'Records Switched On')}>
                <Power size={17} aria-hidden />
              </Button>
            ) : null}
            </div>
          </div>

          <div className="grid gap-2 sm:grid-cols-3">
            <ActionCard active={action === 'trial'} icon={<Sparkles size={16} aria-hidden />} title="Start Free Trial" tone="sky" onClick={() => setAction('trial')} />
            <ActionCard active={action === 'request'} icon={<Send size={16} aria-hidden />} title="Send Payment Link" tone="amber" onClick={() => setAction('request')} />
            <ActionCard active={action === 'payment'} icon={<BadgeCheck size={16} aria-hidden />} title="Payment Received" tone="emerald" onClick={() => setAction('payment')} />
          </div>

          <section className="border border-stone-300 bg-white p-3 shadow-sm sm:p-4">
            {action === 'trial' ? (
              service?.trial_ends ? (
                <p className="text-sm text-stone-700">
                  The free trial of this licence was used till <strong>{formatDisplayDate(service.trial_ends)}</strong>. Send a payment link or record a payment to continue.
                </p>
              ) : (
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="text-sm text-stone-700">
                    The customer can use the records service free for {TRIAL_DAYS} days, from today till <strong>{formatDisplayDate(addDaysIso(today, TRIAL_DAYS))}</strong>.
                  </p>
                  <Button type="button" disabled={busy} className={cn(limsPrimaryBtnClass, TONES.sky.btn, 'gap-1.5')} onClick={() => void act(() => startTrial(licenceId, service), 'Free Trial Started')}>
                    {busy ? <Loader2 size={15} className="animate-spin" aria-hidden /> : <Sparkles size={15} aria-hidden />} Start Free Trial
                  </Button>
                </div>
              )
            ) : null}

            {action === 'request' ? (
              <div className="space-y-3">
                {settings && !canPayUpi && !canPayBank ? (
                  <p className="border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-800">Add the UPI ID or bank account in Lab Settings → Bank Details first.</p>
                ) : null}
                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="space-y-1">
                    <Label htmlFor="req-amount">Amount (₹)</Label>
                    <Input id="req-amount" type="number" inputMode="decimal" min={0} value={amount} placeholder="Yearly Amount" onChange={(e) => setAmount(e.target.value)} />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="req-from">Period From</Label>
                    <CalendarDateField id="req-from" label="Period From" value={periodFrom} onChange={changeFrom} />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="req-to">Period To</Label>
                    <CalendarDateField id="req-to" label="Period To" value={periodTo} onChange={setPeriodTo} />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label>Send To</Label>
                  {emails.length ? (
                    <div className="flex flex-wrap gap-1.5">
                      {emails.map((e) => {
                        const on = to.includes(e)
                        return (
                          <label key={e} className={cn('inline-flex cursor-pointer items-center gap-1.5 border px-2 py-1 text-xs', on ? 'border-amber-600 bg-amber-50 text-amber-950' : 'border-stone-300 bg-white text-stone-600')}>
                            <input type="checkbox" className="h-4 w-4 rounded-none border-stone-500 text-amber-700" checked={on}
                              onChange={(ev) => setTo((prev) => (ev.target.checked ? [...prev, e] : prev.filter((x) => x !== e)))} />
                            {e}
                          </label>
                        )
                      })}
                    </div>
                  ) : null}
                  <Input value={extraTo} placeholder="Other Emails (Comma Separated)" aria-label="Other Emails" onChange={(e) => setExtraTo(e.target.value)} />
                </div>
                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-stone-200 pt-3">
                  <Button type="button" disabled={busy || !settings} className={cn(limsPrimaryBtnClass, TONES.amber.btn, 'ml-auto gap-1.5')}
                    onClick={() => periodProblem ? toast.warning(periodProblem) : void act(() => sendPaymentRequest({ projectId: licenceId, licence: licence?.label ?? '', company, to: recipients, amount: amountValue, period: chosenPeriod, settings: settings! }), 'Payment Link Sent')}>
                    {busy ? <Loader2 size={15} className="animate-spin" aria-hidden /> : <Send size={15} aria-hidden />} Send Payment Link
                  </Button>
                </div>
              </div>
            ) : null}

            {action === 'payment' ? (
              <div className="space-y-3">
                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="space-y-1">
                    <Label htmlFor="pay-amount">Amount Received (₹)</Label>
                    <Input id="pay-amount" type="number" inputMode="decimal" min={0} value={amount} onChange={(e) => setAmount(e.target.value)} />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="pay-date">Received On</Label>
                    <CalendarDateField id="pay-date" label="Received On" value={paidOn} onChange={setPaidOn} />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="pay-mode">Mode</Label>
                    <select id="pay-mode" className="h-10 w-full border border-stone-500 bg-stone-50 px-2 text-sm" value={mode} onChange={(e) => setMode(e.target.value as (typeof PAYMENT_MODES)[number])}>
                      {PAYMENT_MODES.map((m) => <option key={m} value={m}>{m}</option>)}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="pay-ref">Transaction / UTR / Cheque No</Label>
                    <Input id="pay-ref" value={reference} placeholder="Reference" onChange={(e) => setReference(e.target.value)} />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="pay-from">Period From</Label>
                    <CalendarDateField id="pay-from" label="Period From" value={periodFrom} onChange={changeFrom} />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="pay-till">Paid Till</Label>
                    <CalendarDateField id="pay-till" label="Paid Till" value={periodTo} onChange={setPeriodTo} />
                  </div>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-stone-200 pt-3">
                  <p className="text-[11px] text-stone-500">
                    Service runs from {periodFrom ? formatDisplayDate(periodFrom) : '—'} to {periodTo ? formatDisplayDate(periodTo) : '—'}. A Payment Receipt is made in Finance → Payment Receipt.
                  </p>
                  <Button type="button" disabled={busy} className={cn(limsPrimaryBtnClass, TONES.emerald.btn, 'gap-1.5')}
                    onClick={() => periodProblem ? toast.warning(periodProblem) : void act(
                      () => recordPayment({ projectId: licenceId, clientId, licence: licence?.label ?? '', amount: amountValue, paidOn, mode, reference, period: chosenPeriod, current: service }),
                      'Payment Saved, Receipt',
                    )}>
                    {busy ? <Loader2 size={15} className="animate-spin" aria-hidden /> : <IndianRupee size={15} aria-hidden />} Save Payment
                  </Button>
                </div>
              </div>
            ) : null}
          </section>

          <section className="space-y-2">
            <h3 className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-[0.12em] text-stone-700"><CalendarClock size={14} aria-hidden /> History</h3>
            <div className="overflow-x-auto border border-stone-300 bg-white">
              <table className="w-full min-w-[40rem] border-collapse font-jakarta">
                <thead>
                  <tr>
                    <th className={th}>Date</th>
                    <th className={th}>Type</th>
                    <th className={th}>Amount</th>
                    <th className={th}>Period</th>
                    <th className={th}>Reference</th>
                  </tr>
                </thead>
                <tbody>
                  {payments == null ? (
                    <tr><td colSpan={5} className={cn(td, 'py-4 text-stone-500')}>Loading…</td></tr>
                  ) : payments.length === 0 ? (
                    <tr><td colSpan={5} className={cn(td, 'py-4 text-stone-500')}>No payment link or payment yet.</td></tr>
                  ) : (
                    payments.map((p, i) => (
                      <tr key={p.id} className={i % 2 ? 'bg-[#f7f3eb]' : 'bg-[#fffcf7]'}>
                        <td className={td}>{formatDisplayDate((p.paid_on ?? p.created_at).slice(0, 10))}</td>
                        <td className={td}>
                          <span className={cn('inline-block border px-1.5 py-px text-[10px] font-semibold uppercase tracking-wide', p.kind === 'payment' ? 'border-emerald-300 bg-emerald-50 text-emerald-800' : 'border-sky-300 bg-sky-50 text-sky-800')}>
                            {p.kind === 'payment' ? `Paid · ${p.mode ?? ''}` : 'Link Sent'}
                          </span>
                        </td>
                        <td className={td}>{money(p.amount)}</td>
                        <td className={td}>{p.period_from && p.period_to ? `${formatDisplayDate(p.period_from)} – ${formatDisplayDate(p.period_to)}` : '—'}</td>
                        <td className={cn(td, 'text-xs')}>
                          {p.kind === 'payment' ? [p.receipt_number, p.reference].filter(Boolean).join(' · ') || '—' : p.sent_to || '—'}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </DialogContent>
    </Dialog>
  )
}
