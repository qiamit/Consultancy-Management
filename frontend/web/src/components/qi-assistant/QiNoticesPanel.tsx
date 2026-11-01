import { Bell, CalendarClock, CircleAlert, HelpCircle, Mail, MessageSquare, ShieldCheck, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { AssistantNotice, NoticeKind } from './assistantNotices'

const KIND_STYLE: Record<NoticeKind, { icon: typeof Bell; cls: string }> = {
  mail: { icon: Mail, cls: 'text-sky-700' },
  confirm: { icon: ShieldCheck, cls: 'text-amber-700' },
  question: { icon: HelpCircle, cls: 'text-amber-700' },
  reply: { icon: MessageSquare, cls: 'text-emerald-700' },
  failed: { icon: CircleAlert, cls: 'text-red-700' },
  task: { icon: CalendarClock, cls: 'text-emerald-700' },
  mailbox: { icon: CircleAlert, cls: 'text-red-700' },
}

const formatAt = (at: string) =>
  new Date(at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })

/** The notification list in the QE Assistant panel. */
export function QiNoticesPanel({
  notices,
  busy,
  onAct,
  onDismiss,
  onClearAll,
}: {
  notices: AssistantNotice[]
  busy: boolean
  onAct: (notice: AssistantNotice) => void
  onDismiss: (notice: AssistantNotice) => void
  onClearAll: () => void
}) {
  if (!notices.length) {
    return <p className="text-sm text-stone-500">No New Notifications. New Emails and Anything the AI Needs From You Will Show Here.</p>
  }
  return (
    <div className="space-y-2">
      {notices.map((n) => {
        const { icon: Icon, cls } = KIND_STYLE[n.kind]
        return (
          <div key={n.id} className="border border-stone-300 bg-white px-3 py-2">
            <div className="flex items-start gap-2">
              <Icon size={14} className={cn('mt-0.5 shrink-0', cls)} aria-hidden />
              <div className="min-w-0 flex-1">
                <p className="break-words text-sm font-semibold text-stone-800">{n.title}</p>
                <p className="line-clamp-2 break-words text-xs text-stone-600">{n.detail}</p>
                <p className="mt-0.5 text-[11px] text-stone-400">{formatAt(n.at)}</p>
              </div>
              <button type="button" className="inline-flex h-6 w-6 shrink-0 items-center justify-center text-stone-400 hover:bg-red-50 hover:text-red-700" title="Dismiss" aria-label={`Dismiss ${n.title}`} onClick={() => onDismiss(n)}>
                <X size={13} />
              </button>
            </div>
            <div className="mt-1.5 flex justify-end">
              <button
                type="button"
                className="inline-flex h-6 items-center border border-amber-800 bg-amber-700 px-2 text-[11px] font-semibold text-white hover:bg-amber-800 disabled:opacity-50"
                disabled={busy && n.kind === 'mail'}
                onClick={() => onAct(n)}
              >
                {n.kind === 'mail' ? 'Ask AI to Read' : 'Open'}
              </button>
            </div>
          </div>
        )
      })}
      {notices.length > 1 ? (
        <div className="flex justify-end">
          <button type="button" className="inline-flex h-7 items-center border border-stone-400 bg-white px-2 text-xs font-semibold text-stone-700 hover:bg-stone-100" onClick={onClearAll}>
            Clear All ({notices.length})
          </button>
        </div>
      ) : null}
    </div>
  )
}
