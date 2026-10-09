import { supabase } from '@/lib/supabaseClient'
import type { IsCodeAmendmentForm } from './types'

function missingTable(error: { code?: string; message?: string } | null) {
  if (!error) return false
  return error.code === '42P01' || error.code === 'PGRST205' || /does not exist|schema cache/i.test(error.message ?? '')
}

export async function listIsCodeAmendments(isCodeId: string): Promise<IsCodeAmendmentForm[]> {
  const { data, error } = await supabase
    .from('is_code_amendments')
    .select('id, amendment_no, issued_on, summary')
    .eq('is_code_id', isCodeId)
    .order('amendment_no')
  if (error) {
    if (missingTable(error)) return []
    throw error
  }
  return (Array.isArray(data) ? data : []).map((raw) => {
    const row = raw as Record<string, unknown>
    return {
      id: String(row.id ?? ''),
      amendmentNo: String(row.amendment_no ?? ''),
      issuedOn: row.issued_on == null ? '' : String(row.issued_on).slice(0, 10),
      summary: row.summary == null ? '' : String(row.summary),
    }
  })
}

export async function saveIsCodeAmendments(isCodeId: string, rows: IsCodeAmendmentForm[]) {
  const kept = rows.filter((row) => row.amendmentNo.trim())
  const { error: deleteError } = await supabase.from('is_code_amendments').delete().eq('is_code_id', isCodeId)
  if (deleteError) {
    if (missingTable(deleteError)) return
    throw deleteError
  }
  if (kept.length === 0) return
  const { error } = await supabase.from('is_code_amendments').insert(
    kept.map((row) => ({
      is_code_id: isCodeId,
      amendment_no: row.amendmentNo.trim(),
      issued_on: row.issuedOn || null,
      summary: row.summary.trim() || null,
    })),
  )
  if (error) throw error
}
