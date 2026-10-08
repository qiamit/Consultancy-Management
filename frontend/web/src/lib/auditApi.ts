import { supabase } from '@/lib/supabaseClient'

export type AuditHistoryEntry = {
  id: number
  action: string
  changed_at: string
  changed_by: string | null
  changed_by_name: string | null
  changed_via: string | null
  old_data: Record<string, unknown> | null
  new_data: Record<string, unknown> | null
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

export async function getAuditHistory(
  table: string,
  rowId: string,
  limit = 50,
): Promise<AuditHistoryEntry[]> {
  const { data, error } = await supabase.rpc('get_audit_history', {
    p_table: table,
    p_row_id: rowId,
    p_limit: limit,
  })
  if (error) throw error
  return (Array.isArray(data) ? data : []).map((raw) => {
    const row = raw as Record<string, unknown>
    return {
      id: Number(row.id ?? 0),
      action: String(row.action ?? ''),
      changed_at: String(row.changed_at ?? ''),
      changed_by: row.changed_by == null ? null : String(row.changed_by),
      changed_by_name: row.changed_by_name == null ? null : String(row.changed_by_name),
      changed_via: row.changed_via == null ? null : String(row.changed_via),
      old_data: asRecord(row.old_data),
      new_data: asRecord(row.new_data),
    }
  })
}
