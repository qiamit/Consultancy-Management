import { supabase } from '@/lib/supabaseClient'

/** Persist section-only specified requirement on test_allocation_parameters (never test_parameters master). */
export async function saveSectionSpecificRequirement(opts: {
  testAllocationId: string
  testParameterId: string
  testLabel: string
  paramRowId?: string | null
  specificRequirement: string | null
}): Promise<string | null> {
  const testAllocationId = opts.testAllocationId.trim()
  const testParameterId = opts.testParameterId.trim()
  const testLabel = opts.testLabel.trim()
  if (!testAllocationId || !testParameterId) {
    throw new Error('Section allocation or test parameter is missing.')
  }

  const nextValue = opts.specificRequirement?.trim() || null
  const paramRowId =
    opts.paramRowId && !opts.paramRowId.startsWith('local-') ? opts.paramRowId.trim() : null

  if (paramRowId) {
    const { error } = await supabase
      .from('test_allocation_parameters')
      .update({ specific_requirement: nextValue })
      .eq('id', paramRowId)
      .eq('test_allocation_id', testAllocationId)
    if (error) throw error
    return paramRowId
  }

  const { data: existing } = await supabase
    .from('test_allocation_parameters')
    .select('id')
    .eq('test_allocation_id', testAllocationId)
    .eq('test_parameter_id', testParameterId)
    .maybeSingle()

  if (existing?.id) {
    const { error } = await supabase
      .from('test_allocation_parameters')
      .update({ specific_requirement: nextValue })
      .eq('id', existing.id)
    if (error) throw error
    return String(existing.id)
  }

  const { data: inserted, error } = await supabase
    .from('test_allocation_parameters')
    .insert({
      test_allocation_id: testAllocationId,
      test_parameter_id: testParameterId,
      test_label: testLabel || testParameterId,
      specific_requirement: nextValue,
    })
    .select('id')
    .single()

  if (error) throw error
  return (inserted as { id?: string } | null)?.id ?? null
}
