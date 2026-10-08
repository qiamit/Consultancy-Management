import { supabase } from '@/lib/supabaseClient'
import {
  AI_SETTINGS_SINGLETON_ID,
  type AiModelRow,
  type AiSettingsRow,
  type AiSkillRow,
} from './types'

export async function fetchAiModels(): Promise<AiModelRow[]> {
  const { data, error } = await supabase
    .from('ai_models')
    .select('*')
    .order('is_default', { ascending: false })
    .order('display_name', { ascending: true })
  if (error) throw error
  return (data ?? []) as AiModelRow[]
}

export async function upsertAiModel(
  payload: Record<string, unknown>,
  editId: string | null,
  keepExistingKey: boolean,
): Promise<void> {
  const row = { ...payload }
  if (editId && keepExistingKey) {
    delete row.api_key
  }
  if (!String(row.api_key ?? '').trim()) {
    delete row.api_key
  }

  if (row.is_default) {
    await supabase.from('ai_models').update({ is_default: false }).neq('id', editId ?? '00000000-0000-0000-0000-000000000000')
  }

  if (editId) {
    const { error } = await supabase.from('ai_models').update(row).eq('id', editId)
    if (error) throw error
    return
  }

  const { error } = await supabase.from('ai_models').insert(row)
  if (error) throw error
}

export async function deleteAiModel(id: string): Promise<void> {
  const { error } = await supabase.from('ai_models').delete().eq('id', id)
  if (error) throw error
}

export async function fetchAiSkills(): Promise<AiSkillRow[]> {
  const { data, error } = await supabase
    .from('ai_skills')
    .select('*')
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true })
  if (error) throw error
  return (data ?? []) as AiSkillRow[]
}

export async function upsertAiSkill(payload: Record<string, unknown>, editId: string | null): Promise<void> {
  if (editId) {
    const { error } = await supabase.from('ai_skills').update(payload).eq('id', editId)
    if (error) throw error
    return
  }
  const { error } = await supabase.from('ai_skills').insert(payload)
  if (error) throw error
}

export async function deleteAiSkill(id: string): Promise<void> {
  const { error } = await supabase.from('ai_skills').delete().eq('id', id)
  if (error) throw error
}

export async function fetchAiSettings(): Promise<AiSettingsRow | null> {
  const { data, error } = await supabase
    .from('ai_settings')
    .select('*')
    .eq('id', AI_SETTINGS_SINGLETON_ID)
    .maybeSingle()
  if (error) throw error
  return (data as AiSettingsRow | null) ?? null
}

export async function upsertAiSettings(partial: Record<string, unknown>): Promise<void> {
  const { error } = await supabase
    .from('ai_settings')
    .upsert({ id: AI_SETTINGS_SINGLETON_ID, ...partial }, { onConflict: 'id' })
  if (error) throw error
}
