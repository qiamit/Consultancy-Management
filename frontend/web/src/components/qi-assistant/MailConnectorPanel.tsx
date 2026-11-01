import { useEffect, useState } from 'react'
import { CheckCircle2, Loader2, Mail, RefreshCw, Unplug } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  countMailMessages,
  disconnectMailAccount,
  getMailAccount,
  saveMailAccount,
  syncMailNow,
  type AssistantMailAccount,
} from './assistantStore'
import { formatIst } from './assistantSchedule'

const field = 'h-8 w-full border border-stone-400 bg-white px-2 text-sm focus:border-amber-600 focus:outline-none'
const label = 'text-[11px] font-semibold text-stone-600'

/**
 * Connectors → Zoho Mail: the admin's mailbox for QE Assistant (read the INBOX, send confirmed replies).
 * The App Password is typed here only; it is stored encrypted and never shown again.
 */
export function MailConnectorPanel() {
  const [account, setAccount] = useState<AssistantMailAccount | null>(null)
  const [messages, setMessages] = useState(0)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<'save' | 'sync' | 'disconnect' | null>(null)
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null)
  const [form, setForm] = useState({
    email: '',
    username: '',
    imap_host: 'imap.zoho.in',
    imap_port: 993,
    smtp_host: 'smtp.zoho.in',
    smtp_port: 465,
    enabled: true,
  })
  const [password, setPassword] = useState('')

  const fetchState = () => Promise.all([getMailAccount(), countMailMessages().catch(() => 0)])

  const applyState = ([a, n]: [AssistantMailAccount | null, number]) => {
    setAccount(a)
    setMessages(n)
    if (a) {
      setForm({
        email: a.email,
        username: a.username,
        imap_host: a.imap_host,
        imap_port: a.imap_port,
        smtp_host: a.smtp_host,
        smtp_port: a.smtp_port,
        enabled: a.enabled,
      })
    }
  }

  const reload = () => fetchState().then(applyState)

  useEffect(() => {
    let cancelled = false
    fetchState()
      .then((loaded) => {
        if (!cancelled) applyState(loaded)
      })
      .catch((err: unknown) => {
        if (!cancelled) setStatus({ ok: false, text: err instanceof Error ? err.message : 'Could Not Load.' })
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const saveAndTest = async () => {
    const email = form.email.trim()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setStatus({ ok: false, text: 'Enter the Mailbox Email Address.' })
      return
    }
    if (!account?.password_set && !password) {
      setStatus({ ok: false, text: 'Enter the Zoho App Password.' })
      return
    }
    setBusy('save')
    setStatus(null)
    try {
      await saveMailAccount(account, { ...form, email, username: form.username.trim() || email }, password)
      setPassword('')
      const { added } = await syncMailNow()
      await reload()
      setStatus({ ok: true, text: `Connected — ${added} New Mail${added === 1 ? '' : 's'} Read.` })
    } catch (err) {
      await reload().catch(() => undefined)
      setStatus({ ok: false, text: err instanceof Error ? err.message : 'Could Not Connect.' })
    } finally {
      setBusy(null)
    }
  }

  const syncNow = async () => {
    setBusy('sync')
    setStatus(null)
    try {
      const { added } = await syncMailNow()
      await reload()
      setStatus({ ok: true, text: `${added} New Mail${added === 1 ? '' : 's'}.` })
    } catch (err) {
      setStatus({ ok: false, text: err instanceof Error ? err.message : 'Could Not Sync.' })
    } finally {
      setBusy(null)
    }
  }

  const disconnect = async () => {
    if (!account) return
    setBusy('disconnect')
    try {
      await disconnectMailAccount(account.id)
      setAccount(null)
      setMessages(0)
      setForm((f) => ({ ...f, email: '', username: '' }))
      setStatus({ ok: true, text: 'Mailbox Disconnected. Its Copied Mails Were Removed From the App.' })
    } catch (err) {
      setStatus({ ok: false, text: err instanceof Error ? err.message : 'Could Not Disconnect.' })
    } finally {
      setBusy(null)
    }
  }

  if (loading) {
    return <p className="flex items-center gap-2 text-sm text-stone-500"><Loader2 size={14} className="animate-spin" /> Loading…</p>
  }

  const connected = Boolean(account?.password_set)
  return (
    <div className="space-y-3 border border-stone-300 bg-white p-3">
      <div className="flex items-center gap-2">
        <span className="flex h-8 w-8 items-center justify-center border border-amber-600 bg-amber-50 text-amber-800"><Mail size={16} aria-hidden /></span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-stone-800">Zoho Mail</p>
          <p className="text-[11px] text-stone-500">
            {connected
              ? `${account?.last_error ? 'Error' : 'Connected'} · ${messages} Mail${messages === 1 ? '' : 's'} · Last Sync ${formatIst(account?.last_sync_at)}`
              : 'Not Connected — Lets QE Assistant Read Your Inbox and Send Replies You Confirm.'}
          </p>
        </div>
        {connected ? <CheckCircle2 size={16} className={account?.last_error ? 'text-red-600' : 'text-emerald-600'} aria-hidden /> : null}
      </div>
      {account?.last_error ? <p className="border border-red-300 bg-red-50 px-2 py-1 text-xs text-red-700">{account.last_error}</p> : null}
      <div className="grid grid-cols-2 gap-2">
        <label className="col-span-2 space-y-0.5">
          <span className={label}>Email Address</span>
          <input className={field} value={form.email} placeholder="info@qengineering.in" onChange={(e) => setForm({ ...form, email: e.target.value })} />
        </label>
        <label className="space-y-0.5">
          <span className={label}>User Name</span>
          <input className={field} value={form.username} placeholder="Same as Email" onChange={(e) => setForm({ ...form, username: e.target.value })} />
        </label>
        <label className="space-y-0.5">
          <span className={label}>App Password {connected ? '(Saved)' : ''}</span>
          <input
            className={field}
            type="password"
            autoComplete="new-password"
            value={password}
            placeholder={connected ? 'Leave Blank to Keep' : 'Zoho App Password'}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        <label className="space-y-0.5">
          <span className={label}>IMAP Server</span>
          <input className={field} value={form.imap_host} onChange={(e) => setForm({ ...form, imap_host: e.target.value.trim() })} />
        </label>
        <label className="space-y-0.5">
          <span className={label}>SMTP Server</span>
          <input className={field} value={form.smtp_host} onChange={(e) => setForm({ ...form, smtp_host: e.target.value.trim() })} />
        </label>
      </div>
      <p className="text-[11px] leading-snug text-stone-500">
        In Zoho Mail: Settings → Mail Accounts → IMAP Access On; then Zoho Accounts → Security → App Passwords → Generate.
        The Password Is Stored Encrypted and Never Shown Again.
      </p>
      {status ? <p className={cn('text-xs', status.ok ? 'text-emerald-700' : 'text-red-700')}>{status.text}</p> : null}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          className="inline-flex h-8 items-center gap-1.5 bg-amber-700 px-3 text-xs font-semibold text-white hover:bg-amber-800 disabled:opacity-50"
          disabled={busy !== null}
          onClick={() => void saveAndTest()}
        >
          {busy === 'save' ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle2 size={13} />} {connected ? 'Save' : 'Connect'}
        </button>
        {connected ? (
          <>
            <button type="button" className="inline-flex h-8 items-center gap-1.5 border border-stone-400 bg-white px-3 text-xs font-semibold text-stone-700 hover:bg-amber-50 disabled:opacity-50" disabled={busy !== null} onClick={() => void syncNow()}>
              {busy === 'sync' ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />} Sync Now
            </button>
            <button type="button" className="ml-auto inline-flex h-8 items-center gap-1.5 border border-stone-400 bg-white px-3 text-xs font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50" disabled={busy !== null} onClick={() => void disconnect()}>
              <Unplug size={13} /> Disconnect
            </button>
          </>
        ) : null}
      </div>
    </div>
  )
}
