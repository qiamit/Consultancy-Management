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

/**
 * Best-matching pages of the standards index for these folders (any of the words). With `relpaths`, only pages of
 * those documents (the IS Code's own part and revision — a folder such as "IS 2062" also holds 2011, Part 1 2025 and
 * Part 2 2026), so more are asked for and the rest dropped.
 */
export async function searchStandardPages(
  folders: string[],
  words: string,
  limit = 12,
  kinds?: string[],
  relpaths?: string[],
): Promise<StandardPage[]> {
  if (!folders.length) return []
  const { data, error } = await supabase.rpc('search_standard_pages', {
    p_folders: folders,
    p_query: words,
    p_limit: relpaths ? 60 : limit,
    ...(kinds ? { p_kinds: kinds } : {}),
  })
  if (error) throw error
  const pages = (data ?? []) as StandardPage[]
  if (!relpaths) return pages
  const allowed = new Set(relpaths)
  return pages.filter((p) => allowed.has(p.relpath)).slice(0, limit)
}

/** One page of an index document (null when there is no such page). */
export async function fetchStandardPage(relpath: string, page: number): Promise<StandardPage | null> {
  const { data: doc } = await supabase.from('standard_docs').select('id, folder, relpath, kind').eq('relpath', relpath).maybeSingle()
  if (!doc) return null
  const d = doc as { id: number; folder: string; relpath: string; kind: string }
  const { data } = await supabase.from('standard_pages').select('page, text').eq('doc_id', d.id).eq('page', page).maybeSingle()
  return data ? { folder: d.folder, relpath: d.relpath, kind: d.kind, page: Number((data as { page: number }).page), text: String((data as { text: string }).text ?? '') } : null
}

export type IsCodeEdition = { part: string; section: string; year: string }

/** Part, section and revision year of an IS Code (IS Code Master), digits only: "Part-1" → "1". */
export async function fetchIsCodeEdition(isCodeId: string): Promise<IsCodeEdition | null> {
  const { data } = await supabase.from('is_codes').select('part_no, section_no, revision_year').eq('id', isCodeId).maybeSingle()
  if (!data) return null
  const digits = (v: unknown) => String(v ?? '').match(/\d+/)?.[0] ?? ''
  const row = data as { part_no: string | null; section_no: string | null; revision_year: string | number | null }
  return { part: digits(row.part_no), section: digits(row.section_no), year: String(row.revision_year ?? '').match(/(19|20)\d{2}/)?.[0] ?? '' }
}

/** Part / section / year written in an index file name: "IS 2062 Part 1 2025 - 00.pdf". */
function editionOf(relpath: string): IsCodeEdition {
  const name = relpath.split('/').pop() ?? relpath
  const years = name.match(/\b(?:19|20)\d{2}\b/g) ?? []
  return {
    part: name.match(/\bPart\s*-?\s*(\d+)/i)?.[1] ?? '',
    section: name.match(/\bSec(?:tion)?\s*-?\s*(\d+)/i)?.[1] ?? '',
    year: years[years.length - 1] ?? '',
  }
}

/**
 * The documents of the index folders that belong to this IS Code's own part, section and revision: the matching
 * Standard and its Amendments, and the Product Manual of the same part (a main copy before an `_Extra/` duplicate).
 * Without an edition (a referenced standard), the latest revision. When nothing matches, every document is kept.
 */
export async function pickStandardDocs(folders: string[], edition: IsCodeEdition | null): Promise<{ standards: string[]; manuals: string[] }> {
  if (!folders.length) return { standards: [], manuals: [] }
  const { data } = await supabase.from('standard_docs').select('relpath, kind').in('folder', folders)
  const docs = (data ?? []) as Array<{ relpath: string; kind: string }>
  const partScore = (e: IsCodeEdition) =>
    (edition?.part ? (e.part === edition.part ? 3 : e.part ? -10 : -1) : e.part ? -10 : 0) +
    (edition?.section ? (e.section === edition.section ? 2 : e.section ? -10 : -1) : e.section ? -10 : 0)
  const best = (list: Array<{ relpath: string; score: number }>) => {
    const ok = list.filter((d) => d.score > -5)
    if (!ok.length) return list.map((d) => d.relpath)
    const top = Math.max(...ok.map((d) => d.score))
    return ok.filter((d) => d.score === top).map((d) => d.relpath)
  }
  const standardDocs = docs.filter((d) => d.kind === 'Standard')
  const latestYear = Math.max(0, ...standardDocs.map((d) => Number(editionOf(d.relpath).year) || 0))
  const standards = best(
    standardDocs.map((d) => {
      const e = editionOf(d.relpath)
      const year = edition?.year ? (e.year === edition.year ? 2 : e.year ? -1 : 0) : Number(e.year) === latestYear ? 1 : 0
      return { relpath: d.relpath, score: partScore(e) + year }
    }),
  )
  // Amendments of another part are another Standard's.
  const amendments = docs.filter((d) => d.kind === 'Amendment' && partScore(editionOf(d.relpath)) > -5).map((d) => d.relpath)
  const manualDocs = docs.filter((d) => d.kind === 'Product Manual')
  const mains = manualDocs.filter((d) => !/\/_Extra\//.test(d.relpath))
  const manuals = best((mains.length ? mains : manualDocs).map((d) => ({ relpath: d.relpath, score: partScore(editionOf(d.relpath)) })))
  return { standards: [...standards, ...amendments], manuals }
}

/** Every page of the Product Manual(s) of these folders (manuals are short), in order. */
export async function fetchProductManualPages(folders: string[], maxPages = 40, relpaths?: string[]): Promise<StandardPage[]> {
  if (!folders.length) return []
  const { data: docs, error } = await supabase
    .from('standard_docs')
    .select('id, folder, relpath, kind')
    .in('folder', folders)
    .eq('kind', 'Product Manual')
  if (error) throw error
  const list = ((docs ?? []) as Array<{ id: number; folder: string; relpath: string; kind: string }>).filter(
    (d) => !relpaths || relpaths.includes(d.relpath),
  )
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
