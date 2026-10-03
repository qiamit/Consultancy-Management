import type { User } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabaseClient'

function metaDepartment(user: User | null): string {
  if (!user) return ''
  const meta = user.user_metadata as Record<string, unknown>
  if (typeof meta.department_name === 'string') return meta.department_name.trim()
  if (typeof meta.department === 'string') return meta.department.trim()
  return ''
}

/** Infer lab department from sections currently assigned to this reviewer. */
async function inferDepartmentFromReviewAssignments(authUserId: string): Promise<string> {
  const { data: paramRows, error: paramErr } = await supabase
    .from('test_allocation_parameters')
    .select('test_allocation_id')
    .eq('results_reviewer_id', authUserId)
  if (paramErr) throw paramErr

  const taIds = [
    ...new Set(
      (Array.isArray(paramRows) ? paramRows : [])
        .map((r) => String((r as { test_allocation_id?: string }).test_allocation_id ?? '').trim())
        .filter(Boolean),
    ),
  ]
  if (taIds.length === 0) return ''

  const { data: taRows, error: taErr } = await supabase
    .from('test_allocations')
    .select('sample_allocation_id')
    .in('id', taIds)
  if (taErr) throw taErr

  const allocIds = [
    ...new Set(
      (Array.isArray(taRows) ? taRows : [])
        .map((r) => String((r as { sample_allocation_id?: string }).sample_allocation_id ?? '').trim())
        .filter(Boolean),
    ),
  ]
  if (allocIds.length === 0) return ''

  const { data: allocRows, error: allocErr } = await supabase
    .from('sample_allocations')
    .select('department')
    .in('id', allocIds)
  if (allocErr) throw allocErr

  const counts = new Map<string, number>()
  for (const row of Array.isArray(allocRows) ? allocRows : []) {
    const dept = String((row as { department?: string | null }).department ?? '').trim()
    if (!dept) continue
    counts.set(dept, (counts.get(dept) ?? 0) + 1)
  }
  if (counts.size === 0) return ''

  let best = ''
  let bestCount = 0
  for (const [dept, count] of counts) {
    if (count > bestCount) {
      best = dept
      bestCount = count
    }
  }
  return best
}

/**
 * Resolves the logged-in user's lab department (Mechanical, Chemical, …).
 * Order: hook/cache → user_profiles → auth metadata → infer from review assignments.
 */
export async function resolveUserDepartment(
  authUser: User,
  hookDepartment?: string,
): Promise<string> {
  const fromHook = (hookDepartment ?? '').trim()
  if (fromHook) return fromHook

  try {
    const cached = localStorage.getItem('userDepartment')?.trim()
    if (cached) return cached
  } catch {
    /* ignore */
  }

  const fromMeta = metaDepartment(authUser)
  if (fromMeta) {
    try {
      localStorage.setItem('userDepartment', fromMeta)
    } catch {
      /* ignore */
    }
    return fromMeta
  }

  const { data: profile, error } = await supabase
    .from('user_profiles')
    .select('department_name')
    .eq('id', authUser.id)
    .maybeSingle()

  if (error) throw error

  const fromProfile = String(
    (profile as { department_name?: string | null } | null)?.department_name ?? '',
  ).trim()
  if (fromProfile) {
    try {
      localStorage.setItem('userDepartment', fromProfile)
    } catch {
      /* ignore */
    }
    return fromProfile
  }

  const inferred = await inferDepartmentFromReviewAssignments(authUser.id)
  if (inferred) {
    try {
      localStorage.setItem('userDepartment', inferred)
    } catch {
      /* ignore */
    }
    return inferred
  }

  return ''
}
