import { supabase } from '@/lib/supabaseClient'
import { departmentsMatch } from './departmentMatch'
import { labelsForParameterIds, uniqueParameterIds } from './parameterIdLabelPairs'

/** Creates test_allocation_parameters rows from test_parameter_ids when missing. */
export async function ensureTestAllocationParameterRows(testAllocationId: string): Promise<void> {
  const taId = testAllocationId.trim()
  if (!taId) return

  const { data: existing, error } = await supabase
    .from('test_allocation_parameters')
    .select('id')
    .eq('test_allocation_id', taId)
    .limit(1)
  if (error) throw error
  if (Array.isArray(existing) && existing.length > 0) return

  const { data: ta, error: taErr } = await supabase
    .from('test_allocations')
    .select('test_parameter_ids')
    .eq('id', taId)
    .maybeSingle()
  if (taErr) throw taErr
  if (!ta) return

  const rawIds = (ta as { test_parameter_ids?: unknown }).test_parameter_ids
  const ids = uniqueParameterIds(
    Array.isArray(rawIds) ? (rawIds as Array<string | null | undefined>) : [],
  )
  if (ids.length === 0) return

  const { data: tpRows, error: tpErr } = await supabase
    .from('test_parameters')
    .select('id, item_name')
    .in('id', ids)
  if (tpErr) throw tpErr

  const nameById = new Map<string, string>()
  for (const row of Array.isArray(tpRows) ? tpRows : []) {
    const r = row as { id: string; item_name?: string | null }
    nameById.set(r.id, (r.item_name ?? '').trim() || r.id)
  }

  const labels = labelsForParameterIds(ids, nameById)
  for (let i = 0; i < ids.length; i += 1) {
    const { error: insErr } = await supabase.from('test_allocation_parameters').insert({
      test_allocation_id: taId,
      test_parameter_id: ids[i]!,
      test_label: labels[i]!,
    })
    if (insErr) throw insErr
  }
}

export async function allTestAllocationIdsForSample(
  sampleId: string,
  department?: string | null,
): Promise<string[]> {
  const { data: allocs, error: allocErr } = await supabase
    .from('sample_allocations')
    .select('id, department')
    .eq('sample_id', sampleId)
  if (allocErr) throw allocErr

  const allocIds = (Array.isArray(allocs) ? allocs : [])
    .filter((r) => {
      const id = String((r as { id?: string }).id ?? '').trim()
      if (!id) return false
      const dept = (r as { department?: string | null }).department
      if (department?.trim()) return departmentsMatch(dept, department)
      return true
    })
    .map((r) => String((r as { id?: string }).id ?? '').trim())
  if (allocIds.length === 0) return []

  const { data: tas, error: taErr } = await supabase
    .from('test_allocations')
    .select('id')
    .in('sample_allocation_id', allocIds)
  if (taErr) throw taErr

  return (Array.isArray(tas) ? tas : [])
    .map((r) => String((r as { id?: string }).id ?? '').trim())
    .filter(Boolean)
}
