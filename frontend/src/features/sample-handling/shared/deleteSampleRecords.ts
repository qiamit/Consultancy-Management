import { supabase } from '@/lib/supabaseClient'
import { deleteTestAllocationsForSampleAllocations } from '@/features/sample-handling/referbackFlow'

function uniqueIds(ids: string[]): string[] {
  return [...new Set(ids.map((id) => id.trim()).filter(Boolean))]
}

export function confirmDestructiveDelete(count: number, noun: string): boolean {
  if (count <= 0) return false
  const label = count === 1 ? `this ${noun}` : `these ${count} ${noun}s`
  return window.confirm(`Delete ${label}? This cannot be undone.`)
}

/** Deletes SRF rows and cascades allocations, test allocations, and parameters. */
export async function deleteSamplesByIds(sampleIds: string[]): Promise<number> {
  const ids = uniqueIds(sampleIds)
  if (ids.length === 0) return 0
  const { error } = await supabase.from('samples').delete().in('id', ids)
  if (error) throw error
  return ids.length
}

/** Removes test allocation rows (and parameters) for section allocation ids. */
export async function deleteTestAllocationsForSections(
  sampleAllocationIds: string[],
): Promise<number> {
  const ids = uniqueIds(sampleAllocationIds)
  if (ids.length === 0) return 0
  await deleteTestAllocationsForSampleAllocations(ids)
  return ids.length
}
