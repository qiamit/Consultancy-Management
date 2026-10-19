import { supabase } from '@/lib/supabaseClient'

export type EmailLogStatus = 'sent' | 'failed' | 'blocked'

export type EmailLogRow = {
  id: number
  user_id: string | null
  source_path: string | null
  to_addrs: string[]
  cc_addrs: string[]
  bcc_addrs: string[]
  subject: string | null
  attachment_count: number
  attachment_bytes: number
  status: EmailLogStatus
  error: string | null
  resend_id: string | null
  created_at: string
}

export type EmailLogFilters = {
  status: '' | EmailLogStatus
  userId: string
  /** yyyy-mm-dd, inclusive, local day */
  from: string
  to: string
}

function localDayStart(day: string, addDays = 0): string {
  const [y, m, d] = day.split('-').map(Number)
  return new Date(y, (m || 1) - 1, (d || 1) + addDays).toISOString()
}

/** One page of email_send_log, newest first. RLS lets only admins read it. */
export async function fetchEmailLog(
  filters: EmailLogFilters,
  page: number,
  pageSize: number,
): Promise<{ rows: EmailLogRow[]; total: number }> {
  let query = supabase
    .from('email_send_log')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(page * pageSize, page * pageSize + pageSize - 1)
  if (filters.status) query = query.eq('status', filters.status)
  if (filters.userId) query = query.eq('user_id', filters.userId)
  if (filters.from) query = query.gte('created_at', localDayStart(filters.from))
  if (filters.to) query = query.lt('created_at', localDayStart(filters.to, 1))
  const { data, error, count } = await query
  if (error) throw error
  const rows = (data ?? []).map((raw) => {
    const r = raw as Record<string, unknown>
    return {
      ...(r as EmailLogRow),
      to_addrs: Array.isArray(r.to_addrs) ? (r.to_addrs as string[]) : [],
      cc_addrs: Array.isArray(r.cc_addrs) ? (r.cc_addrs as string[]) : [],
      bcc_addrs: Array.isArray(r.bcc_addrs) ? (r.bcc_addrs as string[]) : [],
      attachment_count: Number(r.attachment_count) || 0,
      attachment_bytes: Number(r.attachment_bytes) || 0,
    }
  })
  return { rows, total: count ?? rows.length }
}

/** id → name for the user filter and the User column. */
export async function fetchEmailLogUsers(): Promise<Map<string, string>> {
  const { data, error } = await supabase.from('user_profiles').select('id, full_name, email')
  if (error) throw error
  const out = new Map<string, string>()
  for (const raw of data ?? []) {
    const r = raw as { id?: string; full_name?: string | null; email?: string | null }
    const id = String(r.id ?? '').trim()
    if (!id) continue
    out.set(id, String(r.full_name ?? '').trim() || String(r.email ?? '').trim() || id)
  }
  return out
}
