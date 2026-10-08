import { supabase } from '@/lib/supabaseClient'

export type NablLookupKind =
  | 'discipline_group'
  | 'materials_products'
  | 'discipline_name'
  | 'group_name'

export type NablLookupRow = {
  id: string
  kind: NablLookupKind
  name: string
  created_at?: string | null
}

type Listener = () => void

const listeners = new Map<NablLookupKind, Set<Listener>>()
const cache = new Map<NablLookupKind, NablLookupRow[]>()
const inflight = new Map<NablLookupKind, Promise<NablLookupRow[]>>()

type ScopeRenameTarget = {
  table: 'nabl_scope' | 'calibration_nabl_scope'
  column: string
}

const SCOPE_RENAME: Record<NablLookupKind, ScopeRenameTarget> = {
  discipline_group: { table: 'nabl_scope', column: 'discipline_group' },
  materials_products: { table: 'nabl_scope', column: 'materials_products' },
  discipline_name: { table: 'calibration_nabl_scope', column: 'discipline_name' },
  group_name: { table: 'calibration_nabl_scope', column: 'group_name' },
}

function notify(kind: NablLookupKind) {
  listeners.get(kind)?.forEach((listener) => listener())
}

export function subscribeNablLookups(kind: NablLookupKind, listener: Listener) {
  if (!listeners.has(kind)) listeners.set(kind, new Set())
  listeners.get(kind)!.add(listener)
  return () => listeners.get(kind)?.delete(listener)
}

export function getCachedNablLookups(kind: NablLookupKind): NablLookupRow[] {
  return cache.get(kind) ?? []
}

export async function loadNablLookups(
  kind: NablLookupKind,
  force = false,
): Promise<NablLookupRow[]> {
  if (!force && cache.has(kind)) return cache.get(kind)!
  if (!force && inflight.has(kind)) return inflight.get(kind)!

  const promise = (async () => {
    const { data, error } = await supabase
      .from('nabl_scope_lookups')
      .select('id, kind, name, created_at')
      .eq('kind', kind)
      .order('name', { ascending: true })

    if (error) throw error
    const rows = Array.isArray(data) ? (data as NablLookupRow[]) : []
    cache.set(kind, rows)
    inflight.delete(kind)
    notify(kind)
    return rows
  })()

  inflight.set(kind, promise)
  return promise
}

export async function addNablLookup(
  kind: NablLookupKind,
  name: string,
): Promise<NablLookupRow> {
  const trimmed = name.trim()
  if (!trimmed) throw new Error('Name is required')

  const { data, error } = await supabase
    .from('nabl_scope_lookups')
    .insert({ kind, name: trimmed })
    .select('id, kind, name, created_at')
    .single()

  if (error) throw error
  const row = data as NablLookupRow
  const next = [...(cache.get(kind) ?? []), row].sort((a, b) => a.name.localeCompare(b.name))
  cache.set(kind, next)
  notify(kind)
  return row
}

export async function updateNablLookup(
  kind: NablLookupKind,
  id: string,
  name: string,
): Promise<NablLookupRow> {
  const trimmed = name.trim()
  if (!trimmed) throw new Error('Name is required')

  const prev = cache.get(kind)?.find((r) => r.id === id)
  const { data, error } = await supabase
    .from('nabl_scope_lookups')
    .update({ name: trimmed })
    .eq('id', id)
    .eq('kind', kind)
    .select('id, kind, name, created_at')
    .single()

  if (error) throw error
  const row = data as NablLookupRow

  if (prev && prev.name !== trimmed) {
    const target = SCOPE_RENAME[kind]
    await supabase.from(target.table).update({ [target.column]: trimmed }).eq(target.column, prev.name)
  }

  const next = (cache.get(kind) ?? [])
    .map((r) => (r.id === id ? row : r))
    .sort((a, b) => a.name.localeCompare(b.name))
  cache.set(kind, next)
  notify(kind)
  return row
}

export async function deleteNablLookup(
  kind: NablLookupKind,
  id: string,
): Promise<string | undefined> {
  const removed = cache.get(kind)?.find((r) => r.id === id)
  if (removed) {
    const target = SCOPE_RENAME[kind]
    const { count, error: countError } = await supabase
      .from(target.table)
      .select('id', { count: 'exact', head: true })
      .eq(target.column, removed.name)
    if (countError) throw countError
    if ((count ?? 0) > 0) {
      throw new Error(`Cannot delete "${removed.name}" — it is used by ${count} scope entr${count === 1 ? 'y' : 'ies'}`)
    }
  }

  const { error } = await supabase
    .from('nabl_scope_lookups')
    .delete()
    .eq('id', id)
    .eq('kind', kind)
  if (error) throw error

  cache.set(
    kind,
    (cache.get(kind) ?? []).filter((r) => r.id !== id),
  )
  notify(kind)
  return removed?.name
}
