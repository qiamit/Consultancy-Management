import type { DocumentTemplateKind } from '@/features/settings/lab-settings/documentTemplateTypes'
import { supabase } from '@/lib/supabaseClient'

export type QuotationNoteRow = {
  id: string
  label: string
  content: string
  isDefault: boolean
  sortOrder: number
}

type DbRow = {
  id: string
  label: string | null
  content: string
  is_default: boolean
  sort_order: number
}

function mapRow(row: DbRow): QuotationNoteRow {
  const content = String(row.content ?? '').trim()
  const label = String(row.label ?? '').trim() || content.slice(0, 80)
  return {
    id: row.id,
    label,
    content,
    isDefault: Boolean(row.is_default),
    sortOrder: Number(row.sort_order) || 0,
  }
}

export async function fetchQuotationNotes(
  documentKind: DocumentTemplateKind = 'quotation',
): Promise<QuotationNoteRow[]> {
  const { data, error } = await supabase
    .from('quotation_notes')
    .select('id, label, content, is_default, sort_order')
    .eq('document_kind', documentKind)
    .order('sort_order', { ascending: true })
    .order('label', { ascending: true })
  if (error) throw error
  return (Array.isArray(data) ? data : []).map((r) => mapRow(r as DbRow))
}

export async function fetchDefaultQuotationNote(
  documentKind: DocumentTemplateKind = 'quotation',
): Promise<string> {
  const { data, error } = await supabase
    .from('quotation_notes')
    .select('content')
    .eq('document_kind', documentKind)
    .eq('is_default', true)
    .maybeSingle()
  if (error) throw error
  return String((data as { content?: string } | null)?.content ?? '').trim()
}

export async function insertQuotationNote(
  label: string,
  content: string,
  asDefault = false,
  documentKind: DocumentTemplateKind = 'quotation',
): Promise<QuotationNoteRow> {
  const trimmedLabel = label.trim()
  const trimmedContent = content.trim()
  if (!trimmedLabel) throw new Error('Note label is required')
  if (!trimmedContent) throw new Error('Note text is required')

  if (asDefault) {
    const { error: clearErr } = await supabase
      .from('quotation_notes')
      .update({ is_default: false })
      .eq('document_kind', documentKind)
      .eq('is_default', true)
    if (clearErr) throw clearErr
  }

  const { data, error } = await supabase
    .from('quotation_notes')
    .insert({
      label: trimmedLabel,
      content: trimmedContent,
      is_default: asDefault,
      document_kind: documentKind,
    })
    .select('id, label, content, is_default, sort_order')
    .single()
  if (error) throw error
  return mapRow(data as DbRow)
}

export async function updateQuotationNote(
  id: string,
  label: string,
  content: string,
): Promise<void> {
  const trimmedLabel = label.trim()
  const trimmedContent = content.trim()
  if (!trimmedLabel) throw new Error('Note label is required')
  if (!trimmedContent) throw new Error('Note text is required')
  const { error } = await supabase
    .from('quotation_notes')
    .update({ label: trimmedLabel, content: trimmedContent })
    .eq('id', id)
  if (error) throw error
}

export async function setDefaultQuotationNote(
  id: string,
  documentKind: DocumentTemplateKind = 'quotation',
): Promise<void> {
  const { error: clearErr } = await supabase
    .from('quotation_notes')
    .update({ is_default: false })
    .eq('document_kind', documentKind)
    .eq('is_default', true)
  if (clearErr) throw clearErr

  const { error } = await supabase
    .from('quotation_notes')
    .update({ is_default: true })
    .eq('id', id)
  if (error) throw error
}

export async function deleteQuotationNote(id: string): Promise<void> {
  const { error } = await supabase.from('quotation_notes').delete().eq('id', id)
  if (error) throw error
}
