import { supabase } from '@/lib/supabaseClient'

export type RequiredTestedBy = 'Lab' | 'Factory'
export type RequiredTestSource = 'Manual Entry' | 'AI Suggestion' | 'Past Checks'

/** One required test of an IS Code (table is_code_required_tests). */
export type RequiredTest = {
  id?: string
  testName: string
  clause: string
  requirement: string
  appliesTo: string
  testedBy: RequiredTestedBy
  source: RequiredTestSource
}

export type RequiredTestList = {
  tests: RequiredTest[]
  lockedAt: string | null
  notes: string
}

type Row = {
  id: string
  test_name: string
  clause: string
  requirement: string
  applies_to: string
  tested_by: RequiredTestedBy
  source: RequiredTestSource
}

export async function fetchRequiredTests(isCodeId: string): Promise<RequiredTestList> {
  const [{ data: rows, error }, { data: list, error: listError }] = await Promise.all([
    supabase
      .from('is_code_required_tests')
      .select('id, test_name, clause, requirement, applies_to, tested_by, source')
      .eq('is_code_id', isCodeId)
      .order('sort_order', { ascending: true }),
    supabase.from('is_code_required_test_lists').select('locked_at, notes').eq('is_code_id', isCodeId).maybeSingle(),
  ])
  if (error) throw error
  if (listError) throw listError
  return {
    tests: ((rows ?? []) as Row[]).map((r) => ({
      id: r.id,
      testName: r.test_name,
      clause: r.clause,
      requirement: r.requirement,
      appliesTo: r.applies_to,
      testedBy: r.tested_by,
      source: r.source,
    })),
    lockedAt: (list?.locked_at as string | null) ?? null,
    notes: String(list?.notes ?? ''),
  }
}

/** Replaces the whole list (in the order given). Fails while the list is locked. */
export async function saveRequiredTests(isCodeId: string, tests: RequiredTest[], notes: string): Promise<void> {
  const clean = tests
    .map((t) => ({ ...t, testName: t.testName.trim() }))
    .filter((t) => t.testName)
  const { error: delError } = await supabase.from('is_code_required_tests').delete().eq('is_code_id', isCodeId)
  if (delError) throw delError
  if (clean.length) {
    const { error } = await supabase.from('is_code_required_tests').insert(
      clean.map((t, i) => ({
        is_code_id: isCodeId,
        test_name: t.testName,
        clause: t.clause.trim(),
        requirement: t.requirement.trim(),
        applies_to: t.appliesTo.trim(),
        tested_by: t.testedBy,
        source: t.source,
        sort_order: i,
      })),
    )
    if (error) throw error
  }
  const { error: listError } = await supabase
    .from('is_code_required_test_lists')
    .upsert({ is_code_id: isCodeId, notes: notes.trim(), updated_at: new Date().toISOString() }, { onConflict: 'is_code_id' })
  if (listError) throw listError
}

export async function setRequiredTestsLocked(isCodeId: string, locked: boolean): Promise<void> {
  const { data: auth } = await supabase.auth.getUser()
  const { error } = await supabase.from('is_code_required_test_lists').upsert(
    {
      is_code_id: isCodeId,
      locked_at: locked ? new Date().toISOString() : null,
      locked_by: locked ? (auth.user?.id ?? null) : null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'is_code_id' },
  )
  if (error) throw error
}

export type PastCheckTest = { testName: string; clause: string; requirement: string; checks: number }

/** Tests reported in past AI Conformity Checks of samples of this IS Code, most frequent first. */
export async function fetchTestsFromPastChecks(isCodeId: string): Promise<PastCheckTest[]> {
  const { data, error } = await supabase.rpc('required_tests_from_past_checks', { p_is_code_id: isCodeId })
  if (error) throw error
  return ((data ?? []) as Array<{ test_name: string; clause: string; requirement: string; checks: number }>).map((r) => ({
    testName: r.test_name,
    clause: r.clause,
    requirement: r.requirement,
    checks: Number(r.checks) || 0,
  }))
}

export type StandardPage = { folder: string; relpath: string; kind: string; page: number; text: string }

/** Index folders of the IS Code ("IS 302 Part 2", "IS 302"), most specific first. */
export async function fetchStandardFolders(isCodeId: string): Promise<string[]> {
  const { data, error } = await supabase.rpc('standard_folders_for_is_code', { p_is_code_id: isCodeId })
  if (error) throw error
  return Array.isArray(data) ? (data as string[]) : []
}

/** Best-matching pages of the standards index for these folders (any of the words). */
export async function searchStandardPages(
  folders: string[],
  words: string,
  limit = 12,
  kinds?: string[],
): Promise<StandardPage[]> {
  if (!folders.length) return []
  const { data, error } = await supabase.rpc('search_standard_pages', {
    p_folders: folders,
    p_query: words,
    p_limit: limit,
    ...(kinds ? { p_kinds: kinds } : {}),
  })
  if (error) throw error
  return (data ?? []) as StandardPage[]
}

/** Every page of the Product Manual(s) of these folders (manuals are short), in order. */
export async function fetchProductManualPages(folders: string[], maxPages = 40): Promise<StandardPage[]> {
  if (!folders.length) return []
  const { data: docs, error } = await supabase
    .from('standard_docs')
    .select('id, folder, relpath, kind')
    .in('folder', folders)
    .eq('kind', 'Product Manual')
  if (error) throw error
  const list = (docs ?? []) as Array<{ id: number; folder: string; relpath: string; kind: string }>
  if (!list.length) return []
  const { data: pages, error: pageError } = await supabase
    .from('standard_pages')
    .select('doc_id, page, text')
    .in(
      'doc_id',
      list.map((d) => d.id),
    )
    .order('doc_id')
    .order('page')
    .limit(maxPages)
  if (pageError) throw pageError
  const byId = new Map(list.map((d) => [d.id, d]))
  return ((pages ?? []) as Array<{ doc_id: number; page: number; text: string }>).map((p) => {
    const d = byId.get(p.doc_id)!
    return { folder: d.folder, relpath: d.relpath, kind: d.kind, page: p.page, text: p.text }
  })
}
