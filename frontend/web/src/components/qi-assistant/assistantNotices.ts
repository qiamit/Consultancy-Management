import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabaseClient'
import { markRunsSeen, type AssistantTaskRun } from './assistantStore'

/** What the QE Assistant tells the admin about: new mail, and anything where the AI needs them. */
export type NoticeKind = 'mail' | 'confirm' | 'question' | 'reply' | 'failed' | 'task' | 'mailbox'

export type AssistantNotice = {
  id: string
  kind: NoticeKind
  title: string
  detail: string
  /** Shorter text for the popup, when the detail is long. */
  brief?: string
  at: string
  /** Mail notices: the mail the AI can read. */
  mailId?: string
  /** Scheduled task notices: the result. */
  runId?: string
}

const POLL_MS = 60 * 1000
const MAX_TOASTS_PER_CHECK = 3
const TOAST_MS = 8000
const TOAST_TEXT_CHARS = 140
/** A mailbox connected later syncs a week of old mail at once: only recent mail counts as new. */
const NEW_MAIL_GRACE_MS = 24 * 60 * 60 * 1000
const MAX_DISMISSED = 200
const SEEN_KEY = 'qe-assistant-mail-seen-at'
const DISMISSED_KEY = 'qe-assistant-dismissed-notices'

/** This browser's marks. Storage can be blocked, so a failure only means notices may show again. */
function readStored(key: string): string | null {
  try {
    return window.localStorage.getItem(key)
  } catch {
    return null
  }
}

function writeStored(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value)
  } catch {
    /* see readStored */
  }
}

function readDismissed(): string[] {
  try {
    const list = JSON.parse(readStored(DISMISSED_KEY) ?? '[]') as unknown
    return Array.isArray(list) ? list.map(String) : []
  } catch {
    return []
  }
}

function mailSeenAt(): string {
  const saved = readStored(SEEN_KEY)
  if (saved) return saved
  // First use on this browser: start from now, older mail is not "new".
  const now = new Date().toISOString()
  writeStored(SEEN_KEY, now)
  return now
}

/** Mail snippets can still hold HTML codes such as &#39;. */
const plainText = (text: unknown) =>
  String(text ?? '')
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .trim()

const senderName = (from: string | null) => {
  const text = String(from ?? '').trim()
  return text.replace(/\s*<[^>]*>\s*$/, '').replace(/^"|"$/g, '') || text || 'Unknown Sender'
}

async function fetchMailNotices(dismissed: Set<string>): Promise<AssistantNotice[]> {
  const seen = mailSeenAt()
  const since = new Date(new Date(seen).getTime() - NEW_MAIL_GRACE_MS).toISOString()
  const { data, error } = await supabase
    .from('assistant_mail_messages')
    .select('id, from_addr, subject, snippet, sent_at')
    .eq('is_read', false)
    .gt('synced_at', seen)
    .gte('sent_at', since)
    .order('sent_at', { ascending: false })
    .limit(30)
  if (error) return []
  return (data ?? [])
    .filter((m) => !dismissed.has(`mail:${String(m.id)}`))
    .map((m) => ({
      id: `mail:${String(m.id)}`,
      kind: 'mail' as const,
      title: plainText(m.subject) || 'No Subject',
      detail: `${senderName(m.from_addr as string | null)}${m.snippet ? ` · ${plainText(m.snippet)}` : ''}`,
      brief: senderName(m.from_addr as string | null),
      at: String(m.sent_at ?? new Date().toISOString()),
      mailId: String(m.id),
    }))
}

async function fetchRunNotices(): Promise<AssistantNotice[]> {
  const { data, error } = await supabase
    .from('assistant_task_runs')
    .select('id, task_id, started_at, status, agent')
    .eq('seen', false)
    .neq('status', 'running')
    .order('started_at', { ascending: false })
    .limit(30)
  if (error || !data?.length) return []
  const runs = data as Array<Pick<AssistantTaskRun, 'id' | 'task_id' | 'started_at' | 'status' | 'agent'>>
  const { data: tasks } = await supabase.from('assistant_tasks').select('id, title').in('id', [...new Set(runs.map((r) => r.task_id))])
  const titles = new Map((tasks ?? []).map((t) => [String(t.id), String(t.title)]))
  return runs.map((r) => {
    const title = titles.get(r.task_id) ?? 'Scheduled Task'
    const waiting = (r.agent?.proposals ?? []).filter((p) => !r.agent?.applied?.[p.key]).length
    const base = { id: `run:${r.id}`, at: r.started_at, runId: r.id }
    if (r.status === 'error') return { ...base, kind: 'failed' as const, title: `Task Failed: ${title}`, detail: 'Open Tasks to See What Went Wrong.' }
    if (waiting) return { ...base, kind: 'confirm' as const, title: `Needs Your Confirmation: ${title}`, detail: `${waiting} Change${waiting === 1 ? '' : 's'} Waiting in Tasks.` }
    return { ...base, kind: 'task' as const, title: `Result Ready: ${title}`, detail: 'Open Tasks to Read It.' }
  })
}

async function fetchMailboxNotice(dismissed: Set<string>): Promise<AssistantNotice[]> {
  const { data, error } = await supabase.from('assistant_mail_accounts').select('last_error, last_sync_at, enabled').maybeSingle()
  const problem = String(data?.last_error ?? '').trim()
  if (error || !problem || data?.enabled === false) return []
  const id = `mailbox:${problem}`
  if (dismissed.has(id)) return []
  return [{ id, kind: 'mailbox', title: 'Mailbox Needs Attention', detail: problem, at: String(data?.last_sync_at ?? new Date().toISOString()) }]
}

/**
 * The admin's notices: checked every minute (mail itself syncs on the server every few minutes), plus what the chat
 * reports while the panel is not in view. Each new one also shows as a toast; `onOpen` opens the list from it.
 */
export function useAssistantNotices(enabled: boolean, onOpen: () => void) {
  const [saved, setSaved] = useState<AssistantNotice[]>([])
  const [chat, setChat] = useState<AssistantNotice[]>([])
  const shown = useRef<Set<string> | null>(null)
  const onOpenRef = useRef(onOpen)
  useEffect(() => {
    onOpenRef.current = onOpen
  }, [onOpen])

  const announce = useCallback((fresh: AssistantNotice[]) => {
    const action = {
      label: 'Open',
      onClick: () => {
        // The list shows them all now.
        for (const n of fresh) toast.dismiss(n.id)
        onOpenRef.current()
      },
    }
    if (fresh.length > MAX_TOASTS_PER_CHECK) {
      toast(`${fresh.length} New Notifications`, { description: 'QE Assistant', action, duration: TOAST_MS })
      return
    }
    for (const n of fresh) {
      toast(n.kind === 'mail' ? `New Email: ${n.title}` : n.title, { id: n.id, description: (n.brief ?? n.detail).slice(0, TOAST_TEXT_CHARS), action, duration: TOAST_MS })
    }
  }, [])

  const refresh = useCallback(async () => {
    const dismissed = new Set(readDismissed())
    const [mail, runs, mailbox] = await Promise.all([fetchMailNotices(dismissed), fetchRunNotices(), fetchMailboxNotice(dismissed)])
    const next = [...mailbox, ...runs, ...mail]
    setSaved(next)
    // The first check of a visit only sets the starting point: what was already there shows in the list, without toasts.
    if (shown.current) announce(next.filter((n) => !shown.current?.has(n.id)))
    shown.current = new Set([...(shown.current ?? []), ...next.map((n) => n.id)])
  }, [announce])

  useEffect(() => {
    if (!enabled) return
    const check = () => {
      if (document.visibilityState === 'visible') void refresh().catch(() => undefined)
    }
    check()
    const timer = window.setInterval(check, POLL_MS)
    document.addEventListener('visibilitychange', check)
    return () => {
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', check)
    }
  }, [enabled, refresh])

  /** From the chat, when the admin is not looking at it. */
  const addChatNotice = useCallback(
    (notice: Pick<AssistantNotice, 'kind' | 'title' | 'detail'>) => {
      const full: AssistantNotice = { ...notice, id: `chat:${Date.now()}`, at: new Date().toISOString() }
      setChat((prev) => [full, ...prev])
      announce([full])
    },
    [announce],
  )

  const clearChatNotices = useCallback(() => setChat([]), [])

  const dismiss = useCallback((notice: AssistantNotice) => {
    if (notice.id.startsWith('chat:')) {
      setChat((prev) => prev.filter((n) => n.id !== notice.id))
      return
    }
    setSaved((prev) => prev.filter((n) => n.id !== notice.id))
    if (notice.runId) {
      void markRunsSeen([notice.runId])
      return
    }
    writeStored(DISMISSED_KEY, JSON.stringify([notice.id, ...readDismissed()].slice(0, MAX_DISMISSED)))
  }, [])

  const clearAll = useCallback(() => {
    setSaved((prev) => {
      void markRunsSeen(prev.flatMap((n) => (n.runId ? [n.runId] : [])))
      const mailbox = prev.filter((n) => n.kind === 'mailbox').map((n) => n.id)
      if (mailbox.length) writeStored(DISMISSED_KEY, JSON.stringify([...mailbox, ...readDismissed()].slice(0, MAX_DISMISSED)))
      return []
    })
    setChat([])
    writeStored(SEEN_KEY, new Date().toISOString())
  }, [])

  return { notices: [...chat, ...saved], refresh, addChatNotice, clearChatNotices, dismiss, clearAll }
}
