import { supabase } from '@/lib/supabaseClient'
import { parseGstRateValue, type GstRateRow } from './types'

type Listener = () => void

const listeners = new Set<Listener>()
let cache: GstRateRow[] | null = null
let inflight: Promise<GstRateRow[]> | null = null

function notify() {
  listeners.forEach((listener) => listener())
}

function toRow(data: { id: string; rate: number | string; created_at?: string | null }): GstRateRow {
  return {
    id: data.id,
    rate: Number(data.rate),
    created_at: data.created_at ?? null,
  }
}

export function subscribeGstRates(listener: Listener) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function getCachedGstRates(): GstRateRow[] {
  return cache ?? []
}

export async function loadGstRates(force = false): Promise<GstRateRow[]> {
  if (!force && cache) return cache
  if (!force && inflight) return inflight

  inflight = (async () => {
    const { data, error } = await supabase
      .from('gst_rates')
      .select('id, rate, created_at')
      .order('rate', { ascending: true })

    if (error) throw error
    cache = Array.isArray(data) ? data.map((row) => toRow(row as GstRateRow)) : []
    inflight = null
    notify()
    return cache
  })()

  return inflight
}

export async function addGstRate(rateInput: string | number): Promise<GstRateRow> {
  const rate = typeof rateInput === 'number' ? rateInput : parseGstRateValue(String(rateInput))
  if (rate == null) throw new Error('Enter a valid GST rate between 0 and 100')

  const { data, error } = await supabase
    .from('gst_rates')
    .insert({ rate })
    .select('id, rate, created_at')
    .single()

  if (error) throw error
  const row = toRow(data as GstRateRow)
  cache = [...(cache ?? []), row].sort((a, b) => a.rate - b.rate)
  notify()
  return row
}

export async function updateGstRate(id: string, rateInput: string | number): Promise<GstRateRow> {
  const rate = typeof rateInput === 'number' ? rateInput : parseGstRateValue(String(rateInput))
  if (rate == null) throw new Error('Enter a valid GST rate between 0 and 100')

  const { data, error } = await supabase
    .from('gst_rates')
    .update({ rate })
    .eq('id', id)
    .select('id, rate, created_at')
    .single()

  if (error) throw error
  const row = toRow(data as GstRateRow)
  cache = (cache ?? []).map((item) => (item.id === id ? row : item)).sort((a, b) => a.rate - b.rate)
  notify()
  return row
}

export async function deleteGstRate(id: string): Promise<number | undefined> {
  const removed = cache?.find((item) => item.id === id)
  const { error } = await supabase.from('gst_rates').delete().eq('id', id)
  if (error) throw error
  cache = (cache ?? []).filter((item) => item.id !== id)
  notify()
  return removed?.rate
}
