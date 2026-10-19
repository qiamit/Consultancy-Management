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
 * Every module gets a row, including 'none'. Deleting rows would leave the subject
 * with no matrix, and no matrix falls back to the default (decision #44).
 */
export async function saveModuleAccessMatrix(params: {
  subjectType: ModuleAccessSubjectType
  subjectKey: string
  subjectLabel: string
  levelsByModule: Record<string, ModuleAccessLevel>
  updatedBy: string | null
}): Promise<void> {
  const now = new Date().toISOString()
  const payload = Object.entries(params.levelsByModule).map(([moduleKey, accessLevel]) => ({
    subject_type: params.subjectType,
    subject_key: params.subjectKey,
    subject_label: params.subjectLabel,
    module_key: moduleKey,
    access_level: accessLevel,
    updated_by: params.updatedBy,
    updated_at: now,
  }))
  if (payload.length === 0) return

  const { error } = await supabase
    .from('module_access_rules')
    .upsert(payload, { onConflict: 'subject_type,subject_key,module_key' })
  if (error) throw new Error(error.message)
}
