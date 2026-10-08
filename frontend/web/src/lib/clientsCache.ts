import { fetchAllRows } from '@/lib/fetchAllRows'
import { supabase } from '@/lib/supabaseClient'

const PICKER_SELECT =
  'id, company_name, contact_person_name, email, country_code, mobile, gst_number, address, district, pin_code, state, country, opening_balance, balance_type'

const TTL_MS = 10 * 60 * 1000

export type PickerClientRow = {
  id: string
  company_name?: string | null
  contact_person_name?: string | null
  email?: string | null
  country_code?: string | null
  mobile?: string | null
  gst_number?: string | null
  address?: string | null
  district?: string | null
  pin_code?: string | null
  state?: string | null
  country?: string | null
  opening_balance?: number | null
  balance_type?: string | null
}

let cached: { at: number; rows: PickerClientRow[] } | null = null
let inflight: Promise<PickerClientRow[]> | null = null
let generation = 0

export function invalidateClientsCache(): void {
  cached = null
  inflight = null
  generation += 1
}

export function getPickerClients(): Promise<PickerClientRow[]> {
  if (cached && Date.now() - cached.at < TTL_MS) return Promise.resolve(cached.rows)
  if (inflight) return inflight

  const started = generation
  const promise = (async () => {
    await supabase.auth.getSession()
    const rows = await fetchAllRows<PickerClientRow>(
      (from, to) =>
        supabase
          .from('clients')
          .select(PICKER_SELECT)
          .order('company_name', { ascending: true })
          .order('id', { ascending: true })
          .range(from, to),
      {
        concurrency: 4,
        count: () => supabase.from('clients').select('id', { count: 'exact', head: true }),
      },
    )
    if (started === generation) cached = { at: Date.now(), rows }
    return rows
  })()
  inflight = promise
  void promise.finally(() => {
    if (inflight === promise) inflight = null
  })
  return promise
}
