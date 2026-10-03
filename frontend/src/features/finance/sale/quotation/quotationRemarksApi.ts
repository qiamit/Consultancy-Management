import { supabase } from '@/lib/supabaseClient'

export type QuotationRemarkRow = {
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

function mapRow(row: DbRow): QuotationRemarkRow {
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

export async function fetchQuotationRemarks(): Promise<QuotationRemarkRow[]> {
  const { data, error } = await supabase
    .from('quotation_remarks')
    .select('id, label, content, is_default, sort_order')
    .order('sort_order', { ascending: true })
    .order('label', { ascending: true })
  if (error) throw error
  return (Array.isArray(data) ? data : []).map((r) => mapRow(r as DbRow))
}

export async function fetchDefaultQuotationRemark(): Promise<string> {
  const { data, error } = await supabase
    .from('quotation_remarks')
    .select('content')
    .eq('is_default', true)
    .maybeSingle()
  if (error) throw error
  const content = String((data as { content?: string } | null)?.content ?? '').trim()
  return content
}

export async function insertQuotationRemark(
  label: string,
  content: string,
  asDefault = false,
): Promise<QuotationRemarkRow> {
  const trimmedLabel = label.trim()
  const trimmedContent = content.trim()
  if (!trimmedLabel) throw new Error('Remark label is required')
  if (!trimmedContent) throw new Error('Remark text is required')

  if (asDefault) {
    const { error: clearErr } = await supabase
      .from('quotation_remarks')
      .update({ is_default: false })
      .eq('is_default', true)
    if (clearErr) throw clearErr
  }

  const { data, error } = await supabase
    .from('quotation_remarks')
    .insert({
      label: trimmedLabel,
      content: trimmedContent,
      is_default: asDefault,
    })
    .select('id, label, content, is_default, sort_order')
    .single()
  if (error) throw error
  return mapRow(data as DbRow)
}

export async function updateQuotationRemark(
  id: string,
  label: string,
  content: string,
): Promise<void> {
  const trimmedLabel = label.trim()
  const trimmedContent = content.trim()
  if (!trimmedLabel) throw new Error('Remark label is required')
  if (!trimmedContent) throw new Error('Remark text is required')
  const { error } = await supabase
    .from('quotation_remarks')
    .update({ label: trimmedLabel, content: trimmedContent })
    .eq('id', id)
  if (error) throw error
}

export async function setDefaultQuotationRemark(id: string): Promise<void> {
  const { error: clearErr } = await supabase
    .from('quotation_remarks')
    .update({ is_default: false })
    .eq('is_default', true)
  if (clearErr) throw clearErr

  const { error } = await supabase
    .from('quotation_remarks')
    .update({ is_default: true })
    .eq('id', id)
  if (error) throw error
}

export async function deleteQuotationRemark(id: string): Promise<void> {
  const { error } = await supabase.from('quotation_remarks').delete().eq('id', id)
  if (error) throw error
}
