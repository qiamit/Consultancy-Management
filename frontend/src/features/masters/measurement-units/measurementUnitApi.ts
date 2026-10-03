import { supabase } from '@/lib/supabaseClient'
import type { UnitRow } from '@/features/masters/test-parameter/types'

type Listener = () => void

const listeners = new Set<Listener>()
let cache: UnitRow[] | null = null
let inflight: Promise<UnitRow[]> | null = null

function notify() {
  listeners.forEach((listener) => listener())
}

export function subscribeMeasurementUnits(listener: Listener) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function getCachedMeasurementUnits(): UnitRow[] {
  return cache ?? []
}

export async function loadMeasurementUnits(force = false): Promise<UnitRow[]> {
  if (!force && cache) return cache
  if (!force && inflight) return inflight

  inflight = (async () => {
    const { data, error } = await supabase
      .from('test_parameter_units')
      .select('id, name, created_at')
      .order('name', { ascending: true })

    if (error) throw error
    cache = Array.isArray(data) ? (data as UnitRow[]) : []
    inflight = null
    notify()
    return cache
  })()

  return inflight
}

export async function addMeasurementUnit(name: string): Promise<UnitRow> {
  const trimmed = name.trim()
  if (!trimmed) throw new Error('Unit name is required')

  const { data, error } = await supabase
    .from('test_parameter_units')
    .insert({ name: trimmed })
    .select('id, name, created_at')
    .single()

  if (error) throw error
  const row = data as UnitRow
  cache = [...(cache ?? []), row].sort((a, b) => a.name.localeCompare(b.name))
  notify()
  return row
}

export async function updateMeasurementUnit(id: string, name: string): Promise<UnitRow> {
  const trimmed = name.trim()
  if (!trimmed) throw new Error('Unit name is required')

  const { data, error } = await supabase
    .from('test_parameter_units')
    .update({ name: trimmed })
    .eq('id', id)
    .select('id, name, created_at')
    .single()

  if (error) throw error
  const row = data as UnitRow
  cache = (cache ?? []).map((unit) => (unit.id === id ? row : unit)).sort((a, b) => a.name.localeCompare(b.name))
  notify()
  return row
}

export async function deleteMeasurementUnit(id: string): Promise<string | undefined> {
  const removed = cache?.find((unit) => unit.id === id)
  const { error } = await supabase.from('test_parameter_units').delete().eq('id', id)
  if (error) throw error
  cache = (cache ?? []).filter((unit) => unit.id !== id)
  notify()
  return removed?.name
}
