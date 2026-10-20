import { supabase } from '@/lib/supabaseClient'

/** Open (not closed) License Non-Conformity cases per licence — drives the "Open Notices" badge on licence lists. */
export async function fetchOpenNoticeCounts(projectIds: string[]): Promise<Record<string, number>> {
  const ids = [...new Set(projectIds.filter(Boolean))]
  if (ids.length === 0) return {}
  const { data, error } = await supabase
    .from('bis_stop_marking_cases')
    .select('bis_project_id')
    .in('bis_project_id', ids)
    .neq('status', 'closed')
  if (error) throw error
  const counts: Record<string, number> = {}
  for (const row of data ?? []) {
    const id = String((row as { bis_project_id: string | null }).bis_project_id ?? '')
    if (id) counts[id] = (counts[id] ?? 0) + 1
  }
  return counts
}

/** Every licence that has at least one open case (for the "With Open Notice" filter). */
export async function fetchProjectIdsWithOpenNotices(): Promise<string[]> {
  const { data, error } = await supabase.from('bis_stop_marking_cases').select('bis_project_id').neq('status', 'closed').not('bis_project_id', 'is', null).limit(1000)
  if (error) throw error
  return [...new Set((data ?? []).map((r) => String((r as { bis_project_id: string }).bis_project_id)))]
}
