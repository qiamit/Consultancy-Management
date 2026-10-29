import { supabase } from '@/lib/supabaseClient'
import { deleteTestAllocationsForSampleAllocations } from '@/features/sample-handling/referbackFlow'

function uniqueIds(ids: string[]): string[] {
  return [...new Set(ids.map((id) => id.trim()).filter(Boolean))]
}

type ConfirmFn = (message: string, options?: { title?: string; confirmLabel?: string; destructive?: boolean }) => Promise<boolean>

/** Asks through the caller's in-app confirm (from useConfirmDialog); browser confirm() is blocked in embedded browsers. */
export async function confirmDestructiveDelete(count: number, noun: string, confirm: ConfirmFn): Promise<boolean> {
  if (count <= 0) return false
  const label = count === 1 ? `This ${noun}` : `These ${count} ${noun}s`
  return confirm(`Delete ${label}? This Cannot Be Undone.`, { title: `Delete ${noun}${count === 1 ? '' : 's'}`, confirmLabel: 'Delete', destructive: true })
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
