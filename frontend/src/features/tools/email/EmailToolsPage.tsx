import { useState } from 'react'
import { Mail } from 'lucide-react'
import { limsPageShellClass, limsPanelClass } from '@/lib/limsThemeUi'
import { cn } from '@/lib/utils'
import { supabase } from '@/lib/supabaseClient'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'

/**
 * Outbound email via Railway functions → Resend (@qengineering.in).
 * Full IMAP inbox sync from Consultancy Pro can be layered next.
 */
export default function EmailToolsPage() {
  const [to, setTo] = useState('')
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [sending, setSending] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const send = async () => {
    setSending(true)
    setMessage(null)
    setError(null)
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession()
      if (!session?.access_token) throw new Error('Session expired. Please sign in again.')

      const apiBase = (import.meta.env.VITE_SUPABASE_URL || '').replace(/\/$/, '')
      const res = await fetch(`${apiBase}/functions/v1/send-email`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
          apikey: import.meta.env.VITE_SUPABASE_ANON_KEY || '',
          'X-User-Jwt': session.access_token,
        },
        body: JSON.stringify({
          to: to
            .split(/[,;\s]+/)
            .map((s) => s.trim())
            .filter(Boolean),
          subject: subject.trim(),
          html: `<div style="font-family:Segoe UI,Arial,sans-serif;white-space:pre-wrap;">${body
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')}</div>`,
          text: body,
        }),
      })
      const payload = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(
          typeof payload?.error === 'string' ? payload.error : `Send failed (${res.status})`,
        )
      }
      setMessage('Email queued via Resend.')
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
          IMAP inbox sync from Consultancy Pro will be wired next.
        </p>
      </div>

      <div className={cn(limsPanelClass, 'space-y-4 p-6')}>
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
    </div>
  )
}
