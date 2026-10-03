import { supabase } from '@/lib/supabaseClient'
import type { ModuleAccessLevel, ModuleAccessSubjectType } from './moduleCatalog'

export type ModuleAccessRuleRow = {
  id: string
  subject_type: ModuleAccessSubjectType
  subject_key: string
  subject_label: string
  module_key: string
  access_level: ModuleAccessLevel
  updated_at: string
}

export type ModuleAccessRuleInput = {
  subjectType: ModuleAccessSubjectType
  subjectKey: string
  subjectLabel: string
  moduleKey: string
  accessLevel: ModuleAccessLevel
}

const RULES_PAGE_SIZE = 1000

/** Fetch all rules with pagination (PostgREST default max is 1000 rows). */
export async function fetchModuleAccessRules(): Promise<ModuleAccessRuleRow[]> {
  const all: ModuleAccessRuleRow[] = []
  let from = 0

  for (;;) {
    const { data, error } = await supabase
      .from('module_access_rules')
      .select('id, subject_type, subject_key, subject_label, module_key, access_level, updated_at')
      .order('subject_type')
      .order('subject_key')
      .order('module_key')
      .range(from, from + RULES_PAGE_SIZE - 1)

    if (error) throw new Error(error.message)
    const batch = (data ?? []) as ModuleAccessRuleRow[]
    all.push(...batch)
    if (batch.length < RULES_PAGE_SIZE) break
    from += RULES_PAGE_SIZE
  }

  return all
}

export async function fetchModuleAccessRulesForSubject(
  subjectType: ModuleAccessSubjectType,
  subjectKey: string,
): Promise<ModuleAccessRuleRow[]> {
  const { data, error } = await supabase
    .from('module_access_rules')
    .select('id, subject_type, subject_key, subject_label, module_key, access_level, updated_at')
    .eq('subject_type', subjectType)
    .eq('subject_key', subjectKey)

  if (error) throw new Error(error.message)
  return (data ?? []) as ModuleAccessRuleRow[]
}

/**
 * Upsert access for one subject.
 * Only view/edit rows are stored; none is represented by deleting the row (keeps table small).
 */
export async function saveModuleAccessMatrix(params: {
  subjectType: ModuleAccessSubjectType
  subjectKey: string
  subjectLabel: string
  levelsByModule: Record<string, ModuleAccessLevel>
  updatedBy: string | null
}): Promise<void> {
  const entries = Object.entries(params.levelsByModule)
  const granted = entries.filter(([, level]) => level !== 'none')
  const clearedKeys = entries.filter(([, level]) => level === 'none').map(([key]) => key)
  const now = new Date().toISOString()

  if (clearedKeys.length > 0) {
    const { error: deleteError } = await supabase
      .from('module_access_rules')
      .delete()
      .eq('subject_type', params.subjectType)
      .eq('subject_key', params.subjectKey)
      .in('module_key', clearedKeys)

    if (deleteError) throw new Error(deleteError.message)
  }

  if (granted.length === 0) return

  const existing = await fetchModuleAccessRulesForSubject(params.subjectType, params.subjectKey)
  const existingIdByModule = new Map(existing.map((row) => [row.module_key, row.id]))

  for (const [moduleKey, accessLevel] of granted) {
    const payload = {
      subject_type: params.subjectType,
      subject_key: params.subjectKey,
      subject_label: params.subjectLabel,
      module_key: moduleKey,
      access_level: accessLevel,
      updated_by: params.updatedBy,
      updated_at: now,
    }

    const existingId = existingIdByModule.get(moduleKey)
    if (existingId) {
      const { error: updateError } = await supabase
        .from('module_access_rules')
        .update(payload)
        .eq('id', existingId)
      if (updateError) throw new Error(updateError.message)
      continue
    }

    const { error: insertError } = await supabase.from('module_access_rules').insert(payload)
    if (insertError) throw new Error(insertError.message)
  }
}
