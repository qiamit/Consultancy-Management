import { supabase } from '@/lib/supabaseClient'

export type ReportPrepSectionOption = {
  testAllocationId: string
  sampleAllocationId: string
  sectionCode: string
  department: string | null
  designation: string | null
  assignedEmployeeId: string | null
  assignedEmployeeName: string | null
}

/**
 * All section codes on this SRF (with department) for refer-back from Test Report Preparation.
 */
export async function fetchReportPrepSectionsForReferback(
  sampleId: string,
): Promise<ReportPrepSectionOption[]> {
  const sid = sampleId.trim()
  if (!sid) return []

  const { data: allocRows, error: allocErr } = await supabase
    .from('sample_allocations')
    .select('id, section_code, department, designation')
    .eq('sample_id', sid)
    .order('section_code')
  if (allocErr) throw allocErr

  const allocations = Array.isArray(allocRows) ? allocRows : []
  if (allocations.length === 0) return []

  const allocById = new Map(
    allocations.map((a) => [
      String((a as { id: string }).id),
      a as { id: string; section_code?: string; department?: string | null; designation?: string | null },
    ]),
  )
  const allocIds = [...allocById.keys()]

  const { data: taRows, error: taErr } = await supabase
    .from('test_allocations')
    .select('id, sample_allocation_id, assigned_employee_id, assigned_employee_name')
    .in('sample_allocation_id', allocIds)
  if (taErr) throw taErr

  const testAllocs = Array.isArray(taRows) ? taRows : []
  const taByAllocId = new Map<
    string,
    { id: string; assignedEmployeeId: string | null; assignedEmployeeName: string | null }
  >()
  for (const t of testAllocs) {
    const allocId = String((t as { sample_allocation_id: string }).sample_allocation_id)
    taByAllocId.set(allocId, {
      id: String((t as { id: string }).id),
      assignedEmployeeId: String((t as { assigned_employee_id?: string | null }).assigned_employee_id ?? '').trim() || null,
      assignedEmployeeName:
        String((t as { assigned_employee_name?: string | null }).assigned_employee_name ?? '').trim() || null,
    })
  }

  const out: ReportPrepSectionOption[] = []

  for (const [allocId, alloc] of allocById) {
    const ta = taByAllocId.get(allocId)
    out.push({
      testAllocationId: ta?.id ?? '',
      sampleAllocationId: allocId,
      sectionCode: String(alloc.section_code ?? '').trim() || '—',
      department: alloc.department ?? null,
      designation: alloc.designation ?? null,
      assignedEmployeeId: ta?.assignedEmployeeId ?? null,
      assignedEmployeeName: ta?.assignedEmployeeName ?? null,
    })
  }

  return out.sort((a, b) => a.sectionCode.localeCompare(b.sectionCode))
}
