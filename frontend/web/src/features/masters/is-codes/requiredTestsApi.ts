import { supabase } from '@/lib/supabaseClient'

export type RequiredTestedBy = 'Lab' | 'Factory'
export type RequiredTestSource = 'Manual Entry' | 'AI Suggestion' | 'Past Checks'

/**
 * One test of an IS Code: a row of public.test_parameters (the one list of tests per IS Code since 15 Nov 2026; the
 * Factory Test Report of BIS Applications / Licences and the Customer Portal records read the same rows).
 */
export type RequiredTest = {
  id?: string
  testName: string
  clause: string
  testMethod: string
  unit: string
  requirement: string
  appliesTo: string
  testedBy: RequiredTestedBy
  source: RequiredTestSource
  /** In the Product Manual's "possible tests in a day". */
  possibleInADay: boolean
}

export type RequiredTestList = {
  tests: RequiredTest[]
  lockedAt: string | null
  notes: string
}

type Row = {
  id: string
  item_name: string | null
  test_name: string
  clause_no: string | null
  test_method: string | null
  unit_value: string | null
  specific_requirement: string | null
  applies_to: string
  tested_by: RequiredTestedBy
  source: RequiredTestSource
  possible_in_a_day: boolean | null
}

export async function fetchRequiredTests(isCodeId: string): Promise<RequiredTestList> {
  const [{ data: rows, error }, { data: list, error: listError }] = await Promise.all([
    supabase
      .from('test_parameters')
      .select('id, item_name, test_name, clause_no, test_method, unit_value, specific_requirement, applies_to, tested_by, source, possible_in_a_day')
      .eq('is_code_id', isCodeId)
      .is('archived_at', null)
      .order('display_order', { ascending: true, nullsFirst: true })
      .order('item_name', { ascending: true }),
    supabase.from('is_code_required_test_lists').select('locked_at, notes').eq('is_code_id', isCodeId).maybeSingle(),
  ])
  if (error) throw error
  if (listError) throw listError
  return {
    tests: ((rows ?? []) as Row[]).map((r) => ({
      id: r.id,
      testName: (r.item_name ?? '').trim() || r.test_name,
      clause: r.clause_no ?? '',
      testMethod: r.test_method ?? '',
      unit: r.unit_value ?? '',
      requirement: r.specific_requirement ?? '',
      appliesTo: r.applies_to ?? '',
      testedBy: r.tested_by ?? 'Lab',
      source: r.source ?? 'Manual Entry',
      possibleInADay: Boolean(r.possible_in_a_day),
    })),
    lockedAt: (list?.locked_at as string | null) ?? null,
    notes: String(list?.notes ?? ''),
  }
}

/**
 * Saves the list in the order given: changed rows are updated, new ones added, removed ones deleted (a test still used
 * elsewhere is kept: delete_master_rows skips it). Fails while the list is locked. Returns the names not deleted.
 */
export async function saveRequiredTests(
  isCodeId: string,
  isCodeLabel: string,
  tests: RequiredTest[],
  notes: string,
): Promise<{ kept: string[] }> {
  const clean = tests.map((t) => ({ ...t, testName: t.testName.trim() })).filter((t) => t.testName)
  const { data: current, error: curError } = await supabase
    .from('test_parameters')
    .select('id, item_name, test_name')
    .eq('is_code_id', isCodeId)
    .is('archived_at', null)
  if (curError) throw curError
  const fields = (t: RequiredTest, i: number) => ({
    item_name: t.testName,
    test_name: t.testName,
    clause_no: t.clause.trim(),
    test_method: t.testMethod.trim(),
    unit_value: t.unit.trim(),
    unit: t.unit.trim(),
    specific_requirement: t.requirement.trim(),
    specified_value: t.requirement.trim(),
    applies_to: t.appliesTo.trim(),
    tested_by: t.testedBy,
    source: t.source,
    possible_in_a_day: Boolean(t.possibleInADay),
    display_order: i + 1,
  })
  const keep = new Set(clean.map((t) => t.id).filter(Boolean) as string[])
  const removed = ((current ?? []) as Array<{ id: string; item_name: string | null; test_name: string }>).filter((r) => !keep.has(r.id))
  let kept: string[] = []
  if (removed.length) {
    const { data, error } = await supabase.rpc('delete_master_rows', { p_table: 'test_parameters', p_ids: removed.map((r) => r.id) })
    if (error) throw error
    const deleted = new Set(((data as { deleted?: string[] | null } | null)?.deleted ?? []) as string[])
    kept = removed.filter((r) => !deleted.has(r.id)).map((r) => (r.item_name ?? '').trim() || r.test_name)
  }
  for (const [i, t] of clean.entries()) {
    if (!t.id) continue
    const { error } = await supabase.from('test_parameters').update(fields(t, i)).eq('id', t.id)
    if (error) throw error
  }
  const added = clean.map((t, i) => ({ t, i })).filter(({ t }) => !t.id)
  if (added.length) {
    const { error } = await supabase
      .from('test_parameters')
      .insert(added.map(({ t, i }) => ({ is_code_id: isCodeId, is_code_label: isCodeLabel || null, ...fields(t, i) })))
    if (error) throw error
  }
  const { error: listError } = await supabase
    .from('is_code_required_test_lists')
    .upsert({ is_code_id: isCodeId, notes: notes.trim(), updated_at: new Date().toISOString() }, { onConflict: 'is_code_id' })
  if (listError) throw listError
  return { kept }
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
 * Part 2 2026).
 */
export async function searchStandardPages(
  folders: string[],
  words: string,
  limit = 12,
  kinds?: string[],
  relpaths?: string[],
): Promise<StandardPage[]> {
  if (!folders.length) return []
  // The search runs inside the chosen documents only, so the best pages of another part never push theirs out.
  const { data, error } = await supabase.rpc('search_standard_pages', {
    p_folders: folders,
    p_query: words,
    p_limit: limit,
    ...(kinds ? { p_kinds: kinds } : {}),
    ...(relpaths ? { p_relpaths: relpaths } : {}),
  })
  if (error) throw error
  return (data ?? []) as StandardPage[]
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
export function editionOf(relpath: string): IsCodeEdition {
  const name = relpath.split('/').pop() ?? relpath
  const years = name.match(/\b(?:19|20)\d{2}\b/g) ?? []
  return {
    part: name.match(/\bPart\s*-?\s*(\d+)/i)?.[1] ?? '',
    section: name.match(/\bSec(?:tion)?\s*-?\s*(\d+)/i)?.[1] ?? '',
    year: years[years.length - 1] ?? '',
  }
}

/** The Part a referenced standard's key names: "IS 1608 Part 1" → part "1", no year (its latest revision is read). */
export function editionOfKey(key: string): IsCodeEdition {
  return { part: key.match(/\bPart\s*(\d+)/i)?.[1] ?? '', section: key.match(/\bSec\s*(\d+)/i)?.[1] ?? '', year: '' }
}

/**
 * The documents of the index folders that belong to this IS Code's own part, section and revision: the matching
 * Standard and its Amendments, and the Product Manual of the same part (a main copy before an `_Extra/` duplicate).
 * Without a year, the latest revision. When nothing matches, every document is kept — except with `strict` (a
 * referenced standard): then a Part the library does not have gives nothing, never another Part's pages.
 */
export async function pickStandardDocs(
  folders: string[],
  edition: IsCodeEdition | null,
  opts: { strict?: boolean } = {},
): Promise<{ standards: string[]; manuals: string[] }> {
  if (!folders.length) return { standards: [], manuals: [] }
  const { data } = await supabase.from('standard_docs').select('relpath, kind, pages').in('folder', folders)
  const docs = (data ?? []) as Array<{ relpath: string; kind: string; pages: number | null }>
  // A reference that names no Section ("IS 1367 Part 9") is also answered by the Part's sections ("Part 9 Sec 1").
  const otherSection = opts.strict ? -1 : -10
  const partScore = (e: IsCodeEdition) =>
    (edition?.part ? (e.part === edition.part ? 3 : e.part ? -10 : -1) : e.part ? -10 : 0) +
    (edition?.section ? (e.section === edition.section ? 2 : e.section ? -10 : -1) : e.section ? otherSection : 0)
  const best = (list: Array<{ relpath: string; score: number }>) => {
    const ok = list.filter((d) => d.score > -5)
    if (!ok.length) return opts.strict ? [] : list.map((d) => d.relpath)
    const top = Math.max(...ok.map((d) => d.score))
    return ok.filter((d) => d.score === top).map((d) => d.relpath)
  }
  const allStandards = docs.filter((d) => d.kind === 'Standard')
  // A file no page could be read from (locked by DRM, damaged) is not the revision to read while a readable one exists:
  // an older readable revision answers until a readable copy of the latest is added.
  const readable = allStandards.filter((d) => (d.pages ?? 0) > 0)
  const standardDocs = readable.length ? readable : allStandards
  // The latest revision of the Part asked for (a folder holds every Part, each with its own years).
  const topStandardPart = Math.max(-5, ...standardDocs.map((d) => partScore(editionOf(d.relpath))))
  const latestYear = Math.max(
    0,
    ...standardDocs.filter((d) => partScore(editionOf(d.relpath)) === topStandardPart).map((d) => Number(editionOf(d.relpath).year) || 0),
  )
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
  // One Product Manual per part: the one of the IS Code's revision year, else the latest (a folder can hold the
  // manuals of 1998 and 2023).
  const manualPool = (mains.length ? mains : manualDocs).map((d) => ({ relpath: d.relpath, e: editionOf(d.relpath) }))
  const topPart = Math.max(-5, ...manualPool.map((m) => partScore(m.e)))
  const latestManual = Math.max(0, ...manualPool.filter((m) => partScore(m.e) === topPart).map((m) => Number(m.e.year) || 0))
  const manuals = best(
    manualPool.map((m) => ({
      relpath: m.relpath,
      score:
        partScore(m.e) +
        (edition?.year && m.e.year === edition.year ? 0.6 : 0) +
        (Number(m.e.year) === latestManual ? 0.3 : 0),
    })),
  )
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
