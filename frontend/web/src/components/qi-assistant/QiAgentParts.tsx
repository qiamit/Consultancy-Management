import { useState } from 'react'
import { Check, CircleAlert, Database, ExternalLink, Loader2, Mail, Search, Send, Table2, Trash2, X } from 'lucide-react'
import { supabase } from '@/lib/supabaseClient'
import { sendAssistantMail } from './assistantStore'
import { cn } from '@/lib/utils'
import type { QiAgentProposal, QiAgentStep } from './qiAssistantApi'

const ACTION_STYLE: Record<QiAgentProposal['action'], { label: string; cls: string }> = {
  create: { label: 'Create', cls: 'border-emerald-700 bg-emerald-50 text-emerald-800' },
  update: { label: 'Update', cls: 'border-amber-700 bg-amber-50 text-amber-900' },
  delete: { label: 'Delete', cls: 'border-red-700 bg-red-50 text-red-700' },
  send_email: { label: 'Email', cls: 'border-sky-700 bg-sky-50 text-sky-800' },
}

function show(value: unknown): string {
  if (value == null || value === '') return '—'
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

/** What the agent did to answer (searches, reads, pages opened), one compact line each. */
export function AgentSteps({ steps }: { steps: QiAgentStep[] }) {
  if (!steps.length) return null
  return (
    <ul className="mt-2 space-y-0.5 border-t border-stone-200 pt-1.5">
      {steps.map((s, i) => {
        const Icon = s.error
          ? CircleAlert
          : s.tool === 'open_page'
            ? ExternalLink
            : s.tool === 'propose_changes'
              ? Database
              : /mail/.test(s.tool)
                ? Mail
                : s.tool === 'query_rows'
                  ? Search
                  : Table2
        return (
          <li key={i} className={cn('flex items-start gap-1.5 text-[11px] leading-snug', s.error ? 'text-red-700' : 'text-stone-500')}>
            <Icon className="mt-px h-3 w-3 shrink-0" aria-hidden />
            <span className="min-w-0 break-words">{s.summary}</span>
          </li>
        )
      })}
    </ul>
  )
}

type ApplyState = { status: 'pending' | 'saving' | 'saved' | 'cancelled' | 'error'; message?: string }

/** Performs one confirmed change with the admin's own session (RLS applies). Returns a short result line. */
async function applyProposal(p: QiAgentProposal): Promise<string> {
  if (p.action === 'send_email') {
    const result = await sendAssistantMail(p.values)
    return `Sent to ${result.to.join(', ')}`
  }
  const table = supabase.from(p.table)
  const { data, error } =
    p.action === 'create'
      ? await table.insert(p.values).select('id')
      : p.action === 'update'
        ? await table.update(p.values).eq('id', p.id ?? '').select('id')
        : await table.delete().eq('id', p.id ?? '').select('id')
  if (error) throw new Error(error.message)
  if (!Array.isArray(data) || data.length === 0) throw new Error('Not Saved — No Access to This Record, or It No Longer Exists.')
  const id = (data[0] as { id?: unknown }).id
  return `${p.action === 'create' ? 'Created' : p.action === 'update' ? 'Updated' : 'Deleted'} ${p.table}${id ? ` (${String(id)})` : ''}`
}

/**
 * Changes the agent prepared: each shows before → after and saves only when the admin confirms it.
 * onApplied gets one line per saved change, so the chat (and the agent's next turn) knows what happened.
 */
export function AgentProposals({
  proposals,
  onApplied,
  readOnly = false,
  done,
  onSaved,
}: {
  proposals: QiAgentProposal[]
  onApplied: (lines: string[]) => void
  /** From a saved chat: shown for reference, never confirmable again (ask the agent again to redo). */
  readOnly?: boolean
  /** Changes already saved earlier (key → result line), e.g. confirmed from a scheduled run. */
  done?: Record<string, string>
  /** Called for each change saved now, so its owner can remember it. */
  onSaved?: (key: string, line: string) => void
}) {
  const [state, setState] = useState<Record<string, ApplyState>>(() =>
    Object.fromEntries(Object.entries(done ?? {}).map(([key, message]) => [key, { status: 'saved' as const, message }])),
  )
  if (!proposals.length) return null
  const statusOf = (key: string) => state[key]?.status ?? 'pending'
  const pending = proposals.filter((p) => statusOf(p.key) === 'pending')

  const run = async (list: QiAgentProposal[]) => {
    const lines: string[] = []
    for (const p of list) {
      setState((prev) => ({ ...prev, [p.key]: { status: 'saving' } }))
      try {
        const line = await applyProposal(p)
        lines.push(`Saved: ${p.summary} — ${line}`)
        setState((prev) => ({ ...prev, [p.key]: { status: 'saved', message: line } }))
        onSaved?.(p.key, line)
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Could Not Save'
        lines.push(`Not saved: ${p.summary} — ${message}`)
        setState((prev) => ({ ...prev, [p.key]: { status: 'error', message } }))
      }
    }
    if (lines.length) onApplied(lines)
  }

  return (
    <div className="mt-2 space-y-2">
      {proposals.map((p) => {
        const st = state[p.key] ?? { status: 'pending' as const }
        const style = ACTION_STYLE[p.action]
        const cols = p.action === 'delete' ? Object.keys(p.before ?? {}).slice(0, 8) : Object.keys(p.values).filter((c) => c !== 'reply_to_mail_id')
        const hasBefore = p.action === 'update' || p.action === 'delete'
        const hasAfter = p.action !== 'delete'
        return (
          <div key={p.key} className={cn('border bg-white text-xs', st.status === 'saved' ? 'border-emerald-600' : st.status === 'error' ? 'border-red-500' : 'border-stone-400')}>
            <div className="flex items-center gap-2 border-b border-stone-200 bg-stone-50 px-2 py-1.5">
              <span className={cn('border px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide', style.cls)}>{style.label}</span>
              <span className="font-mono text-[11px] text-stone-600">{p.table}</span>
              <span className="min-w-0 flex-1 truncate font-medium text-stone-800" title={p.summary}>{p.summary}</span>
            </div>
            {cols.length ? (
              <table className="w-full border-collapse">
                <thead>
                  <tr className="text-[10px] uppercase tracking-wide text-stone-500">
                    <th className="px-2 py-1 text-left font-semibold">Field</th>
                    {hasBefore ? <th className="px-2 py-1 text-left font-semibold">{p.action === 'delete' ? 'Value' : 'Before'}</th> : null}
                    {hasAfter ? <th className="px-2 py-1 text-left font-semibold">{p.action === 'update' ? 'After' : 'Value'}</th> : null}
                  </tr>
                </thead>
                <tbody>
                  {cols.map((c) => (
                    <tr key={c} className="border-t border-stone-100 align-top">
                      <td className="px-2 py-1 font-mono text-[11px] text-stone-600">{c}</td>
                      {hasBefore ? <td className="break-all px-2 py-1 text-stone-500 line-through decoration-stone-300">{show(p.before?.[c])}</td> : null}
                      {hasAfter ? <td className={cn('break-words px-2 py-1 font-medium text-stone-900', p.action === 'send_email' && c === 'body' && 'whitespace-pre-wrap font-normal')}>{show(p.values[c])}</td> : null}
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : null}
            <div className="flex items-center justify-end gap-1.5 border-t border-stone-200 px-2 py-1.5">
              {readOnly && st.status === 'pending' ? (
                <span className="text-stone-500">From an Earlier Chat — Ask Again to Redo</span>
              ) : st.status === 'pending' ? (
                <>
                  <button type="button" className="inline-flex h-7 items-center gap-1 border border-stone-400 bg-white px-2 font-semibold text-stone-700 hover:bg-stone-100" onClick={() => setState((prev) => ({ ...prev, [p.key]: { status: 'cancelled' } }))}>
                    <X className="h-3.5 w-3.5" aria-hidden /> Cancel
                  </button>
                  <button
                    type="button"
                    className={cn('inline-flex h-7 items-center gap-1 border px-2 font-semibold text-white', p.action === 'delete' ? 'border-red-700 bg-red-600 hover:bg-red-700' : 'border-amber-800 bg-amber-700 hover:bg-amber-800')}
                    onClick={() => void run([p])}
                  >
                    {p.action === 'delete' ? <Trash2 className="h-3.5 w-3.5" aria-hidden /> : p.action === 'send_email' ? <Send className="h-3.5 w-3.5" aria-hidden /> : <Check className="h-3.5 w-3.5" aria-hidden />}
                    {p.action === 'send_email' ? 'Send' : 'Confirm'}
                  </button>
                </>
              ) : st.status === 'saving' ? (
                <span className="inline-flex items-center gap-1 text-stone-500"><Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> Saving…</span>
              ) : st.status === 'saved' ? (
                <span className="inline-flex items-center gap-1 font-semibold text-emerald-700"><Check className="h-3.5 w-3.5" aria-hidden /> Saved</span>
              ) : st.status === 'cancelled' ? (
                <span className="text-stone-500">Cancelled</span>
              ) : (
                <span className="text-red-700">{st.message}</span>
              )}
            </div>
          </div>
        )
      })}
      {!readOnly && pending.length > 1 ? (
        <div className="flex justify-end">
          <button type="button" className="inline-flex h-7 items-center gap-1 border border-amber-800 bg-amber-700 px-2.5 text-xs font-semibold text-white hover:bg-amber-800" onClick={() => void run(pending)}>
            <Check className="h-3.5 w-3.5" aria-hidden /> Confirm All ({pending.length})
          </button>
        </div>
      ) : null}
    </div>
  )
}
