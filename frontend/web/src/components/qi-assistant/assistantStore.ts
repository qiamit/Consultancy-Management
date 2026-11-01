import { supabase } from '@/lib/supabaseClient'
import type { QiAgentResult, QiChatMessage } from './qiAssistantApi'

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
