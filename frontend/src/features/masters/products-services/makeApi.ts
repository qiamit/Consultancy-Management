import { supabase } from '@/lib/supabaseClient'

export type ProductMakeRow = {
  id: string
  name: string
  created_at?: string | null
}

type Listener = () => void

const listeners = new Set<Listener>()
let cache: ProductMakeRow[] | null = null
let inflight: Promise<ProductMakeRow[]> | null = null

function notify() {
  listeners.forEach((listener) => listener())
}

export function subscribeProductMakes(listener: Listener) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function getCachedProductMakes(): ProductMakeRow[] {
  return cache ?? []
}

export async function loadProductMakes(force = false): Promise<ProductMakeRow[]> {
  if (!force && cache) return cache
  if (!force && inflight) return inflight

  inflight = (async () => {
    const { data, error } = await supabase
      .from('product_makes')
      .select('id, name, created_at')
      .order('name', { ascending: true })

    if (error) throw error
    cache = Array.isArray(data) ? (data as ProductMakeRow[]) : []
    inflight = null
    notify()
    return cache
  })()

  return inflight
}

export async function addProductMake(name: string): Promise<ProductMakeRow> {
  const trimmed = name.trim()
  if (!trimmed) throw new Error('Make name is required')

  const { data, error } = await supabase
    .from('product_makes')
    .insert({ name: trimmed })
    .select('id, name, created_at')
    .single()

  if (error) throw error
  const row = data as ProductMakeRow
  cache = [...(cache ?? []), row].sort((a, b) => a.name.localeCompare(b.name))
  notify()
  return row
}

export async function updateProductMake(id: string, name: string): Promise<ProductMakeRow> {
  const trimmed = name.trim()
  if (!trimmed) throw new Error('Make name is required')

  const prev = cache?.find((c) => c.id === id)
  const { data, error } = await supabase
    .from('product_makes')
    .update({ name: trimmed })
    .eq('id', id)
    .select('id, name, created_at')
    .single()

  if (error) throw error
  const row = data as ProductMakeRow

  if (prev && prev.name !== trimmed) {
    await supabase.from('products_services_master').update({ make: trimmed }).eq('make', prev.name)
  }

  cache = (cache ?? []).map((c) => (c.id === id ? row : c)).sort((a, b) => a.name.localeCompare(b.name))
  notify()
  return row
}

export async function deleteProductMake(id: string): Promise<string | undefined> {
  const removed = cache?.find((c) => c.id === id)
  if (removed) {
    const { count, error: countError } = await supabase
      .from('products_services_master')
      .select('id', { count: 'exact', head: true })
      .eq('make', removed.name)
    if (countError) throw countError
    if ((count ?? 0) > 0) {
      throw new Error(`Cannot delete "${removed.name}" — it is used by ${count} item(s)`)
    }
  }

  const { error } = await supabase.from('product_makes').delete().eq('id', id)
  if (error) throw error
  cache = (cache ?? []).filter((c) => c.id !== id)
  notify()
  return removed?.name
}
