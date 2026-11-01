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
