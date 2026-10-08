import { supabase } from '@/lib/supabaseClient'
import { resolveLabSettingsRowId } from './labSettingsDb'
import {
  DEFAULT_LAB_DOCUMENT_TEMPLATES,
  labDocumentTemplatesToJson,
  parseLabDocumentTemplates,
  type LabDocumentTemplates,
} from './documentTemplateTypes'

async function requireAuthSession(): Promise<void> {
  const {
    data: { session },
  } = await supabase.auth.getSession()
  if (!session) {
    throw new Error('You must be signed in to load or save document templates.')
  }
}

export async function fetchLabDocumentTemplates(): Promise<LabDocumentTemplates> {
  await requireAuthSession()
  const rowId = await resolveLabSettingsRowId(supabase)
  const { data, error } = await supabase
    .from('lab_settings')
    .select('document_templates')
    .eq('id', rowId)
    .maybeSingle()

  if (error) {
    throw new Error(error.message || 'Failed to load document templates.')
  }

  const raw = data?.document_templates
  if (raw != null && typeof raw === 'object') {
    return parseLabDocumentTemplates(raw)
  }
  return { ...DEFAULT_LAB_DOCUMENT_TEMPLATES }
}

export async function saveLabDocumentTemplates(
  templates: LabDocumentTemplates,
): Promise<LabDocumentTemplates> {
  await requireAuthSession()
  const rowId = await resolveLabSettingsRowId(supabase)
  const json = labDocumentTemplatesToJson(templates)

  const { data, error } = await supabase
    .from('lab_settings')
    .update({ document_templates: json })
    .eq('id', rowId)
    .select('document_templates')

  if (error) {
    throw new Error(error.message || 'Failed to save document templates.')
  }
  const row = Array.isArray(data) ? data[0] : null
  if (!row) {
    throw new Error('Only Admin can change document templates.')
  }
  return parseLabDocumentTemplates(row.document_templates ?? json)
}
