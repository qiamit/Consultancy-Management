import { supabase } from '@/lib/supabaseClient'
import type { QiAgentResult, QiChatMessage } from './qiAssistantApi'
import { nextRunAt, type TaskSchedule } from './assistantSchedule'

/** Saved Admin Agent chats and memory (own rows only; RLS: the signed-in admin). */
export type AssistantConversation = { id: string; title: string; updated_at: string }
export type AssistantMemory = { id: string; kind: 'fact' | 'instruction'; content: string; created_at: string }

export async function listConversations(limit = 30): Promise<AssistantConversation[]> {
  const { data, error } = await supabase
    .from('assistant_conversations')
    .select('id, title, updated_at')
    .order('updated_at', { ascending: false })
    .limit(limit)
  if (error) throw new Error(error.message)
  return (data ?? []) as AssistantConversation[]
}

export async function createConversation(title: string): Promise<string> {
  const { data, error } = await supabase
    .from('assistant_conversations')
    .insert({ title: title.trim().slice(0, 80) || 'New Chat' })
    .select('id')
    .single()
  if (error) throw new Error(error.message)
  return String((data as { id: string }).id)
}

export async function deleteConversation(id: string): Promise<void> {
  const { error } = await supabase.from('assistant_conversations').delete().eq('id', id)
  if (error) throw new Error(error.message)
}

export async function loadConversationMessages(conversationId: string): Promise<QiChatMessage[]> {
  const { data, error } = await supabase
    .from('assistant_messages')
    .select('id, role, content, agent')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true })
    .limit(500)
  if (error) throw new Error(error.message)
  return (data ?? []).map((m) => ({
    id: String(m.id),
    role: m.role === 'user' ? 'user' : 'assistant',
    content: String(m.content ?? ''),
    agent: (m.agent as QiAgentResult | null) ?? undefined,
    // Changes from a saved chat are shown, but never confirmable again.
    fromHistory: true,
  }))
}

export async function saveMessage(conversationId: string, message: QiChatMessage): Promise<void> {
  const { error } = await supabase.from('assistant_messages').insert({
    conversation_id: conversationId,
    role: message.role,
    content: message.content,
    agent: message.agent ?? null,
  })
  if (error) throw new Error(error.message)
}

export async function listMemories(): Promise<AssistantMemory[]> {
  const { data, error } = await supabase
    .from('assistant_memories')
    .select('id, kind, content, created_at')
    .order('created_at', { ascending: true })
    .limit(200)
  if (error) throw new Error(error.message)
  return (data ?? []) as AssistantMemory[]
}

export async function deleteMemory(id: string): Promise<void> {
  const { error } = await supabase.from('assistant_memories').delete().eq('id', id)
  if (error) throw new Error(error.message)
}

/** Scheduled tasks and their runs (runs are written by the functions service; the admin reads them). */
export type AssistantTask = TaskSchedule & {
  id: string
  title: string
  instruction: string
  next_run_at: string | null
  enabled: boolean
  notify_email: string | null
  last_run_at: string | null
  last_status: string | null
}

export type AssistantTaskRun = {
  id: string
  task_id: string
  started_at: string
  status: 'running' | 'ok' | 'error'
  output: string | null
  agent: (QiAgentResult & { applied?: Record<string, string> }) | null
  emailed: boolean
  seen: boolean
}

export async function listTasks(): Promise<AssistantTask[]> {
  const { data, error } = await supabase
    .from('assistant_tasks')
    .select('id, title, instruction, schedule_kind, run_at, time_of_day, weekdays, every_hours, next_run_at, enabled, notify_email, last_run_at, last_status')
    .order('created_at', { ascending: true })
  if (error) throw new Error(error.message)
  return (data ?? []) as AssistantTask[]
}

/** Pause, or resume from now (the next run is worked out again). */
export async function setTaskEnabled(task: AssistantTask, enabled: boolean): Promise<AssistantTask> {
  const next = enabled ? nextRunAt(task) : null
  if (enabled && !next) throw new Error('This Task Has No Future Run — Ask the Assistant for a New Time.')
  const patch = enabled ? { enabled, next_run_at: next!.toISOString() } : { enabled }
  const { error } = await supabase.from('assistant_tasks').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', task.id)
  if (error) throw new Error(error.message)
  return { ...task, ...patch }
}

/** Run within a minute (the schedule continues as before afterwards). */
export async function runTaskNow(task: AssistantTask): Promise<AssistantTask> {
  const patch = { enabled: true, next_run_at: new Date().toISOString() }
  const { error } = await supabase.from('assistant_tasks').update(patch).eq('id', task.id)
  if (error) throw new Error(error.message)
  return { ...task, ...patch }
}

export async function deleteTask(id: string): Promise<void> {
  const { error } = await supabase.from('assistant_tasks').delete().eq('id', id)
  if (error) throw new Error(error.message)
}

export async function listTaskRuns(limit = 30): Promise<AssistantTaskRun[]> {
  const { data, error } = await supabase
    .from('assistant_task_runs')
    .select('id, task_id, started_at, status, output, agent, emailed, seen')
    .order('started_at', { ascending: false })
    .limit(limit)
  if (error) throw new Error(error.message)
  return (data ?? []) as AssistantTaskRun[]
}

export async function countUnseenRuns(): Promise<number> {
  const { count, error } = await supabase
    .from('assistant_task_runs')
    .select('id', { count: 'exact', head: true })
    .eq('seen', false)
    .neq('status', 'running')
  if (error) return 0
  return count ?? 0
}

export async function markRunsSeen(ids: string[]): Promise<void> {
  if (!ids.length) return
  await supabase.from('assistant_task_runs').update({ seen: true }).in('id', ids)
}

/** Records a confirmed change of a run, so it is not offered again. */
export async function saveRunAgent(runId: string, agent: AssistantTaskRun['agent']): Promise<void> {
  const { error } = await supabase.from('assistant_task_runs').update({ agent }).eq('id', runId)
  if (error) throw new Error(error.message)
}

/** The admin's connected mailbox (Zoho Mail by default). The app password is set once and never read back. */
export type AssistantMailAccount = {
  id: string
  email: string
  username: string
  imap_host: string
  imap_port: number
  smtp_host: string
  smtp_port: number
  enabled: boolean
  password_set: boolean
  last_sync_at: string | null
  last_error: string | null
}

export async function getMailAccount(): Promise<AssistantMailAccount | null> {
  const { data, error } = await supabase
    .from('assistant_mail_accounts')
    .select('id, email, username, imap_host, imap_port, smtp_host, smtp_port, enabled, password_set, last_sync_at, last_error')
    .maybeSingle()
  if (error) throw new Error(error.message)
  return (data as AssistantMailAccount | null) ?? null
}

export async function countMailMessages(): Promise<number> {
  const { count } = await supabase.from('assistant_mail_messages').select('id', { count: 'exact', head: true })
  return count ?? 0
}

export async function saveMailAccount(
  existing: AssistantMailAccount | null,
  fields: Pick<AssistantMailAccount, 'email' | 'username' | 'imap_host' | 'imap_port' | 'smtp_host' | 'smtp_port' | 'enabled'>,
  password: string,
): Promise<void> {
  const write = existing
    ? supabase.from('assistant_mail_accounts').update({ ...fields, updated_at: new Date().toISOString() }).eq('id', existing.id)
    : supabase.from('assistant_mail_accounts').insert(fields)
  const { error } = await write
  if (error) throw new Error(error.message)
  if (password) {
    const { error: pwError } = await supabase.rpc('assistant_mail_password_set', { p_password: password })
    if (pwError) throw new Error(pwError.message)
  }
}

export async function disconnectMailAccount(id: string): Promise<void> {
  const { error } = await supabase.from('assistant_mail_accounts').delete().eq('id', id)
  if (error) throw new Error(error.message)
}

/** Functions service call as the signed-in admin (same headers as QE Assistant). */
async function callFunction<T>(path: string, body: Record<string, unknown>): Promise<T> {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  if (!token) throw new Error('Session Expired. Please Log In Again.')
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string
  const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/${path}`, {
    method: 'POST',
    headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}`, 'x-user-jwt': token, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const payload = (await res.json().catch(() => null)) as (T & { error?: string }) | null
  if (!res.ok) throw new Error(String(payload?.error || `Request Failed (${res.status})`))
  return payload as T
}

export function syncMailNow(): Promise<{ added: number }> {
  return callFunction('assistant-mail/sync', {})
}

export function sendAssistantMail(values: Record<string, unknown>): Promise<{ sent: boolean; to: string[] }> {
  return callFunction('assistant-mail/send', values)
}
