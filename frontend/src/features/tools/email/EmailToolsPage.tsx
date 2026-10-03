import { useEffect, useState } from 'react'
import { Mail } from 'lucide-react'
import { limsPageShellClass, limsPanelClass } from '@/lib/limsThemeUi'
import { cn } from '@/lib/utils'
import { escapeHtml, sendAppEmail } from '@/lib/sendAppEmail'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'

type SentLogEntry = {
  id: string
  at: string
  to: string
  cc: string
  bcc: string
  subject: string
  resendId: string | null
}

const SENT_LOG_KEY = 'qe-email-sent-log-v1'
const MAX_LOG = 40

const QUICK_TEMPLATES: Array<{ id: string; label: string; subject: string; body: string }> = [
  {
    id: 'bis-follow-up',
    label: 'BIS follow-up',
    subject: 'BIS licence application — follow-up',
    body: 'Dear Sir/Madam,\n\nThis is a gentle follow-up regarding your BIS licence application currently under process with us.\n\nKindly share any pending documents or clarifications at the earliest so that we may proceed without delay.\n\nThanking you,\nQuality Engineering',
  },
  {
    id: 'quotation',
    label: 'Quotation',
    subject: 'Quotation for BIS consultancy services',
    body: 'Dear Sir/Madam,\n\nPlease find our quotation for BIS consultancy services as discussed. Kindly review and confirm so that we may proceed further.\n\nLooking forward to your response.\n\nThanking you,\nQuality Engineering',
  },
  {
    id: 'docs-request',
    label: 'Document request',
    subject: 'Documents required for BIS application',
    body: 'Dear Sir/Madam,\n\nFor processing your BIS application, kindly arrange and share the following documents at the earliest:\n\n1. \n2. \n3. \n\nPlease reply to this email with the attachments.\n\nThanking you,\nQuality Engineering',
  },
]

function loadSentLog(): SentLogEntry[] {
  try {
    const raw = localStorage.getItem(SENT_LOG_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as SentLogEntry[]
    return Array.isArray(parsed) ? parsed.slice(0, MAX_LOG) : []
  } catch {
    return []
  }
}

function saveSentLog(entries: SentLogEntry[]) {
  try {
    localStorage.setItem(SENT_LOG_KEY, JSON.stringify(entries.slice(0, MAX_LOG)))
  } catch {
    /* ignore quota */
  }
}

/**
 * Outbound email via Railway functions → Resend (@qengineering.in).
 * CC/BCC + local sent log; full IMAP inbox sync from Consultancy Pro can follow when credentials are ready.
 */
export default function EmailToolsPage() {
  const [to, setTo] = useState('')
  const [cc, setCc] = useState('')
  const [bcc, setBcc] = useState('')
  const [showCcBcc, setShowCcBcc] = useState(false)
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [sending, setSending] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [sentLog, setSentLog] = useState<SentLogEntry[]>([])

  useEffect(() => {
    setSentLog(loadSentLog())
  }, [])

  const applyTemplate = (id: string) => {
    const tpl = QUICK_TEMPLATES.find((t) => t.id === id)
    if (!tpl) return
    setSubject(tpl.subject)
    setBody(tpl.body)
    setMessage(null)
    setError(null)
  }

  const send = async () => {
    setSending(true)
    setMessage(null)
    setError(null)
    try {
      const html = `<div style="font-family:Segoe UI,Arial,sans-serif;white-space:pre-wrap;">${escapeHtml(body)}</div>`
      const { id } = await sendAppEmail({
        to,
        cc: showCcBcc ? cc : undefined,
        bcc: showCcBcc ? bcc : undefined,
        subject: subject.trim(),
        html,
        text: body,
      })

      const entry: SentLogEntry = {
        id: crypto.randomUUID(),
        at: new Date().toISOString(),
        to: to.trim(),
        cc: showCcBcc ? cc.trim() : '',
        bcc: showCcBcc ? bcc.trim() : '',
        subject: subject.trim(),
        resendId: id,
      }
      const next = [entry, ...sentLog].slice(0, MAX_LOG)
      setSentLog(next)
      saveSentLog(next)

      setMessage(id ? `Email queued via Resend (${id}).` : 'Email queued via Resend.')
      setSubject('')
      setBody('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to send email')
    } finally {
      setSending(false)
    }
  }

  return (
    <div className={cn(limsPageShellClass, 'space-y-4 p-4 md:p-6')}>
      <div className={cn(limsPanelClass, 'p-6')}>
        <div className="flex items-center gap-2">
          <Mail className="h-5 w-5 text-amber-700" />
          <h1 className="font-jakarta text-2xl font-bold tracking-tight text-foreground">Email</h1>
        </div>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          Send outbound mail through Resend (<span className="font-medium">@qengineering.in</span>).
          Supports Cc/Bcc and quick templates. IMAP inbox sync can be added when account credentials are
          configured.
        </p>
      </div>

      <div className={cn(limsPanelClass, 'space-y-4 p-6')}>
        <div className="flex flex-wrap gap-2">
          {QUICK_TEMPLATES.map((tpl) => (
            <Button
              key={tpl.id}
              type="button"
              variant="outline"
              size="sm"
              className="rounded-none text-xs"
              onClick={() => applyTemplate(tpl.id)}
            >
              {tpl.label}
            </Button>
          ))}
        </div>

        <div className="space-y-2">
          <Label htmlFor="email-to">To</Label>
          <Input
            id="email-to"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            placeholder="client@example.com"
            autoComplete="email"
          />
        </div>

        <div>
          <button
            type="button"
            className="text-xs font-medium text-amber-800 underline-offset-2 hover:underline"
            onClick={() => setShowCcBcc((v) => !v)}
          >
            {showCcBcc ? 'Hide Cc/Bcc' : 'Show Cc/Bcc'}
          </button>
        </div>

        {showCcBcc ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="email-cc">Cc</Label>
              <Input
                id="email-cc"
                value={cc}
                onChange={(e) => setCc(e.target.value)}
                placeholder="optional@example.com"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email-bcc">Bcc</Label>
              <Input
                id="email-bcc"
                value={bcc}
                onChange={(e) => setBcc(e.target.value)}
                placeholder="optional@example.com"
              />
            </div>
          </div>
        ) : null}

        <div className="space-y-2">
          <Label htmlFor="email-subject">Subject</Label>
          <Input
            id="email-subject"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="Subject"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="email-body">Message</Label>
          <Textarea
            id="email-body"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={10}
            placeholder="Write your message…"
          />
        </div>
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        {message ? <p className="text-sm text-emerald-700">{message}</p> : null}
        <Button
          type="button"
          disabled={sending || !to.trim() || !subject.trim() || !body.trim()}
          onClick={() => void send()}
          className="rounded-none bg-amber-700 text-white hover:bg-amber-800"
        >
          {sending ? 'Sending…' : 'Send Email'}
        </Button>
      </div>

      {sentLog.length > 0 ? (
        <div className={cn(limsPanelClass, 'overflow-x-auto p-6')}>
          <h2 className="mb-3 text-sm font-semibold text-foreground">Recent sent (this browser)</h2>
          <table className="w-full min-w-[36rem] border-collapse text-left text-xs">
            <thead>
              <tr className="border-b border-border text-muted-foreground">
                <th className="py-2 pr-3 font-medium">When</th>
                <th className="py-2 pr-3 font-medium">To</th>
                <th className="py-2 pr-3 font-medium">Subject</th>
                <th className="py-2 font-medium">Resend ID</th>
              </tr>
            </thead>
            <tbody>
              {sentLog.map((entry) => (
                <tr key={entry.id} className="border-b border-border/60">
                  <td className="py-2 pr-3 whitespace-nowrap text-muted-foreground">
                    {new Date(entry.at).toLocaleString('en-IN')}
                  </td>
                  <td className="py-2 pr-3">{entry.to}</td>
                  <td className="py-2 pr-3">{entry.subject}</td>
                  <td className="py-2 font-mono text-[10px] text-muted-foreground">
                    {entry.resendId || '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  )
}
