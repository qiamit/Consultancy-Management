import { supabase } from '@/lib/supabaseClient'

/** One row from `search_clients` (SECURITY INVOKER; archived hidden unless asked). */
export type ClientSearchRow = {
  id: string
  company_name: string | null
  gst_number: string | null
  company_type: string | null
  company_scale: string | null
  contact_person_name: string | null
  email: string | null
  country_code: string | null
  mobile: string | null
  address: string | null
  district: string | null
  city: string | null
  state: string | null
  pin_code: string | null
  country: string | null
  opening_balance: number | null
  balance_type: string | null
  archived_at: string | null
  total_count: number
  payment_term: string | null
  remark: string | null
}

export async function searchClients(opts: {
  search?: string
  limit?: number
  offset?: number
  includeArchived?: boolean
  companyType?: string | null
}): Promise<{ rows: ClientSearchRow[]; total: number }> {
  const { data, error } = await supabase.rpc('search_clients', {
    p_search: opts.search ?? '',
    p_limit: opts.limit ?? 30,
    p_offset: opts.offset ?? 0,
    p_include_archived: opts.includeArchived ?? false,
    p_company_type: opts.companyType ?? null,
  })
  if (error) throw error
  const rows = (Array.isArray(data) ? data : []).map((raw) => {
    const row = raw as Record<string, unknown>
    const balance = row.opening_balance
    return {
      id: String(row.id ?? ''),
      company_name: row.company_name == null ? null : String(row.company_name),
      gst_number: row.gst_number == null ? null : String(row.gst_number),
      company_type: row.company_type == null ? null : String(row.company_type),
      company_scale: row.company_scale == null ? null : String(row.company_scale),
      contact_person_name:
        row.contact_person_name == null ? null : String(row.contact_person_name),
      email: row.email == null ? null : String(row.email),
      country_code: row.country_code == null ? null : String(row.country_code),
      mobile: row.mobile == null ? null : String(row.mobile),
      address: row.address == null ? null : String(row.address),
      district: row.district == null ? null : String(row.district),
      city: row.city == null ? null : String(row.city),
      state: row.state == null ? null : String(row.state),
      pin_code: row.pin_code == null ? null : String(row.pin_code),
      country: row.country == null ? null : String(row.country),
      opening_balance:
        balance == null || balance === '' || Number.isNaN(Number(balance)) ? null : Number(balance),
      balance_type: row.balance_type == null ? null : String(row.balance_type),
      archived_at: row.archived_at == null ? null : String(row.archived_at),
      total_count: Number(row.total_count ?? 0) || 0,
      payment_term: row.payment_term == null ? null : String(row.payment_term),
      remark: row.remark == null ? null : String(row.remark),
    } satisfies ClientSearchRow
  })
  return { rows, total: rows[0]?.total_count ?? 0 }
}
