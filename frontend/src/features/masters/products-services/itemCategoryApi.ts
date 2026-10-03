import { supabase } from '@/lib/supabaseClient'

export type ItemCategoryRow = {
  id: string
  name: string
  created_at?: string | null
}

type Listener = () => void

const listeners = new Set<Listener>()
let cache: ItemCategoryRow[] | null = null
let inflight: Promise<ItemCategoryRow[]> | null = null

function notify() {
  listeners.forEach((listener) => listener())
}

export function subscribeItemCategories(listener: Listener) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function getCachedItemCategories(): ItemCategoryRow[] {
  return cache ?? []
}

export async function loadItemCategories(force = false): Promise<ItemCategoryRow[]> {
  if (!force && cache) return cache
  if (!force && inflight) return inflight

  inflight = (async () => {
    const { data, error } = await supabase
      .from('product_item_categories')
      .select('id, name, created_at')
      .order('name', { ascending: true })

    if (error) throw error
    cache = Array.isArray(data) ? (data as ItemCategoryRow[]) : []
    inflight = null
    notify()
    return cache
  })()

  return inflight
}

export async function addItemCategory(name: string): Promise<ItemCategoryRow> {
  const trimmed = name.trim()
  if (!trimmed) throw new Error('Category name is required')

  const { data, error } = await supabase
    .from('product_item_categories')
    .insert({ name: trimmed })
    .select('id, name, created_at')
    .single()

  if (error) throw error
  const row = data as ItemCategoryRow
  cache = [...(cache ?? []), row].sort((a, b) => a.name.localeCompare(b.name))
  notify()
  return row
}

export async function updateItemCategory(id: string, name: string): Promise<ItemCategoryRow> {
  const trimmed = name.trim()
  if (!trimmed) throw new Error('Category name is required')

  const prev = cache?.find((c) => c.id === id)
  const { data, error } = await supabase
    .from('product_item_categories')
    .update({ name: trimmed })
    .eq('id', id)
    .select('id, name, created_at')
    .single()

  if (error) throw error
  const row = data as ItemCategoryRow

  if (prev && prev.name !== trimmed) {
    await supabase
      .from('products_services_master')
      .update({ item_category: trimmed })
      .eq('item_category', prev.name)
  }

  cache = (cache ?? []).map((c) => (c.id === id ? row : c)).sort((a, b) => a.name.localeCompare(b.name))
  notify()
  return row
}

export async function deleteItemCategory(id: string): Promise<string | undefined> {
  const removed = cache?.find((c) => c.id === id)
  if (removed) {
    const { count, error: countError } = await supabase
      .from('products_services_master')
      .select('id', { count: 'exact', head: true })
      .eq('item_category', removed.name)
    if (countError) throw countError
    if ((count ?? 0) > 0) {
      throw new Error(`Cannot delete "${removed.name}" — it is used by ${count} item(s)`)
    }
  }

  const { error } = await supabase.from('product_item_categories').delete().eq('id', id)
  if (error) throw error
  cache = (cache ?? []).filter((c) => c.id !== id)
  notify()
  return removed?.name
}
