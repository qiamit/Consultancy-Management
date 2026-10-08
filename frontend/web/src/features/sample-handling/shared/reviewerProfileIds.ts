import { supabase } from '@/lib/supabaseClient'
import { departmentsMatch } from './departmentMatch'

/**
 * All user_profiles IDs that share the same mobile as the logged-in user.
 * Handles duplicate profiles for one person (e.g. Sample Incharge + Quality Manager logins).
 */
export async function fetchLinkedReviewerProfileIds(
  authUserId: string,
  userDepartment?: string | null,
): Promise<string[]> {
  const rootId = authUserId.trim()
  if (!rootId) return []

  const ids = new Set<string>([rootId])

  const { data: profile, error: profileErr } = await supabase
    .from('user_profiles')
    .select('mobile')
    .eq('id', rootId)
    .maybeSingle()
  if (profileErr) throw profileErr

  const mobile = String((profile as { mobile?: string | null } | null)?.mobile ?? '').trim()
  if (!mobile) return [...ids]

  const { data: linked, error: linkedErr } = await supabase
    .from('user_profiles')
    .select('id, department_name')
    .eq('mobile', mobile)
  if (linkedErr) throw linkedErr

  const userDept = (userDepartment ?? '').trim()
  // Same mobile can map to Mechanical + Chemical + other roles — never merge without a known department.
  if (!userDept) return [...ids]

  for (const row of Array.isArray(linked) ? linked : []) {
    const id = String((row as { id?: string }).id ?? '').trim()
    if (!id) continue
    const profileDept = String((row as { department_name?: string | null }).department_name ?? '')
    if (profileDept && !departmentsMatch(profileDept, userDept)) continue
    ids.add(id)
  }

  return [...ids]
}
