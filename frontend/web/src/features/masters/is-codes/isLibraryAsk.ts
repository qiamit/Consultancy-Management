import { sendQiAssistantMessage } from '@/components/qi-assistant/qiAssistantApi'
import { supabase } from '@/lib/supabaseClient'
import type { IsLibraryFiles, LibraryFile } from './isLibraryFiles'

/**
 * Ask AI in IS Files: answers only from this IS Code's Standards Library files (Main Standard, Amendments, Product
 * Manual; Reference Standards when the question needs them). Today the pages are found by word search in the index
 * (search_standard_pages); the RAG layer (chunks + embeddings) will replace that step, the rest stays.
 */
export type AskTurn = { role: 'user' | 'assistant'; content: string }
export type AskSource = { relpath: string; name: string; page: number }
export type AskAnswer = { answer: string; sources: AskSource[]; model: string | null }

type PageHit = { relpath: string; page: number; text: string }

const OWN_BUDGET = 70_000
const SMALL_STANDARD_PAGES = 30
const PAGE_CHARS = 6_000

const nameOf = (relpath: string) => relpath.split('/').pop() ?? relpath

/** English search words for the index (the question may be in Hindi / Hinglish). */
export async function searchWords(question: string, isLabel: string): Promise<string> {
  // A short English question searches with its own words; Hinglish goes through the model too ("IS 808 me ISMB 200 ka
  // weight kitna hai" searched for "me", "ka", "kitna", "hai" and missed the beam table; RAG testing, 20 Nov 2026).
  if (answerLanguage(question) === 'English' && question.split(/\s+/).length <= 12) return question
  const { reply } = await sendQiAssistantMessage({
    page: 'masters/is-files-ask',
    message:
      `Standard: ${isLabel}\nQuestion: ${question}\n\nGive 3 to 6 English words to search the standards' text for the ` +
      `answer: the product or material first (e.g. "steel tube"), then the property or topic (e.g. "tensile strength", ` +
      `"scale of sampling", "marking"). No general words such as standard, requirement, number, value, selected. ` +
      `Answer as JSON: {"words": ["...", "..."]}`,
    responseFormat: 'json_object',
    history: [],
  })
  try {
    const words = (JSON.parse(reply.match(/\{[\s\S]*\}/)?.[0] ?? '{}') as { words?: unknown }).words
    return Array.isArray(words) && words.length ? words.map(String).join(' ') : question
  } catch {
    return question
  }
}

async function allPages(relpaths: string[]): Promise<PageHit[]> {
  const { data: docs } = await supabase.from('standard_docs').select('id, relpath').in('relpath', relpaths)
  const list = (docs ?? []) as Array<{ id: number; relpath: string }>
  if (!list.length) return []
  const byId = new Map(list.map((d) => [d.id, d.relpath]))
  const { data } = await supabase
    .from('standard_pages')
    .select('doc_id, page, text')
    .in(
      'doc_id',
      list.map((d) => d.id),
    )
    .order('doc_id')
    .order('page')
    .limit(200)
  return ((data ?? []) as Array<{ doc_id: number; page: number; text: string }>).map((p) => ({
    relpath: byId.get(p.doc_id) ?? '',
    page: p.page,
    text: p.text,
  }))
}

async function searchPages(relpaths: string[], words: string, limit: number): Promise<PageHit[]> {
  if (!relpaths.length) return []
  const { data: docs } = await supabase.from('standard_docs').select('folder').in('relpath', relpaths)
  const folders = [...new Set(((docs ?? []) as Array<{ folder: string }>).map((d) => d.folder))]
  if (!folders.length) return []
  const { data, error } = await supabase.rpc('search_standard_pages', {
    p_folders: folders,
    p_query: words,
    p_limit: limit,
    p_relpaths: relpaths,
  })
  if (error) throw new Error(error.message)
  return ((data ?? []) as Array<{ relpath: string; page: number; text: string }>).map((p) => ({ relpath: p.relpath, page: p.page, text: p.text }))
}

type ChunkHit = { relpath: string; page: number; kind: string; heading: string; text: string }

const TABLE_BUDGET = 30_000

/** The tables of these documents in column layout (each row keeps its grade and values); [] before chunks exist. */
async function tableChunks(relpaths: string[]): Promise<ChunkHit[]> {
  if (!relpaths.length) return []
  const { data: docs } = await supabase.from('standard_docs').select('id, relpath').in('relpath', relpaths)
  const byId = new Map(((docs ?? []) as Array<{ id: number; relpath: string }>).map((d) => [d.id, d.relpath]))
  if (!byId.size) return []
  const { data, error } = await supabase
    .from('standard_chunks')
    .select('doc_id, page, seq, kind, heading, text')
    .in('doc_id', [...byId.keys()])
    .eq('kind', 'table')
    .order('doc_id')
    .order('page')
    .order('seq')
    .limit(60)
  if (error) return []
  return ((data ?? []) as Array<{ doc_id: number; page: number; kind: string; heading: string; text: string }>).map((c) => ({
    relpath: byId.get(c.doc_id) ?? '',
    page: c.page,
    kind: c.kind,
    heading: c.heading,
    text: c.text,
  }))
}

/**
 * Best chunks of these files by words and meaning (the Library Ask search), with their pages' other chunks; null when
 * the meaning search is not there (the word search answers). RAG testing, 21 Nov 2026: by words alone IS Files' Ask
 * missed IS 14543 5.2.6 Aerobic Microbial Count, as the Product Manual's many pages came first.
 */
async function hybridChunks(relpaths: string[], words: string, question: string, limit: number): Promise<PageHit[] | null> {
  const { data: docs } = await supabase.from('standard_docs').select('folder').in('relpath', relpaths)
  const folders = [...new Set(((docs ?? []) as Array<{ folder: string }>).map((d) => d.folder))]
  if (!folders.length) return null
  const meaning = await embedQuestion(`${words} ${/^[\x20-\x7e]+$/.test(question) ? question : ''}`.trim())
  if (!meaning) return null
  const { data, error } = await supabase.rpc('search_library_hybrid', {
    p_query: words,
    p_embedding: meaning.vector,
    p_model: meaning.model,
    p_limit: 60,
    p_per_doc: 10,
    p_current_only: false,
    p_folders: folders,
  })
  if (error) return null
  const hits = ((data ?? []) as LibraryChunk[]).filter((c) => relpaths.includes(c.relpath)).slice(0, limit)
  if (!hits.length) return null
  withSamePage(hits, await samePageChunks(hits))
  return hits.map((c) => ({ relpath: c.relpath, page: c.page, text: `${c.heading ? `${c.heading}\n` : ''}${c.text}` }))
}

/** Best clause / table chunks for the words; null when chunk search is not there yet (the page search answers). */
async function searchChunks(relpaths: string[], words: string, limit: number): Promise<PageHit[] | null> {
  const { data, error } = await supabase.rpc('search_standard_chunks', { p_relpaths: relpaths, p_query: words, p_limit: limit })
  if (error) return null
  return ((data ?? []) as ChunkHit[]).map((c) => ({ relpath: c.relpath, page: c.page, text: `${c.heading ? `${c.heading}\n` : ''}${c.text}` }))
}

const HINGLISH = /\b(kya|hai|hain|ka|ki|ke|me|mein|kitna|kitni|kitne|hona|chahiye|batao|bataiye|kaun|kaise|kab|aur|nahi|kar|karna|liye)\b/i

/**
 * The answer's language, decided here: Haiku sometimes answered an English question in Hindi when the extracts
 * carried Hindi text (RAG testing, 20 Nov 2026, IS 3025 Part 11).
 */
export function answerLanguage(question: string): string {
  if (/[\u0900-\u097F]/.test(question)) return 'Hindi (Devanagari script)'
  if ((question.match(new RegExp(HINGLISH.source, 'gi')) ?? []).length >= 2) return 'Hinglish (Hindi in Latin letters)'
  return 'English'
}

function block(p: PageHit, label: string) {
  return `[${label} — ${nameOf(p.relpath)} — page ${p.page}]\n${p.text.replace(/[ \t]+/g, ' ').trim().slice(0, PAGE_CHARS)}\n\n`
}

export async function askStandards(input: {
  isLabel: string
  files: IsLibraryFiles
  question: string
  history: AskTurn[]
  useReferences: boolean
}): Promise<AskAnswer> {
  const own: LibraryFile[] = [...input.files.standards, ...input.files.amendments, ...input.files.manuals]
  const refPaths = input.useReferences ? input.files.references.flatMap((r) => (r.file ? [r.file.relpath] : [])) : []
  if (!own.length && !refPaths.length) throw new Error('No Standards Library File to Answer From.')
  const ownPaths = own.map((f) => f.relpath)
  const words = await searchWords(input.question, input.isLabel)

  // A short Standard is read whole; a long one by its best-matching pages.
  const ownPageCount = own.reduce((n, f) => n + (f.pages ?? 0), 0)
  const ownPages =
    !ownPaths.length
      ? []
      : ownPageCount <= SMALL_STANDARD_PAGES
        ? await allPages(ownPaths)
        : ((await hybridChunks(ownPaths, words, input.question, 18)) ??
          (await searchChunks(ownPaths, words, 18)) ??
          (await searchPages(ownPaths, words, 14)))
  // The Standard first, then its Amendments, then the Product Manual (the source chips follow this order).
  if (ownPageCount <= SMALL_STANDARD_PAGES) ownPages.sort((a, b) => ownPaths.indexOf(a.relpath) - ownPaths.indexOf(b.relpath) || a.page - b.page)
  const refPages = refPaths.length
    ? ((await searchChunks(refPaths, words, ownPaths.length ? 8 : 18)) ?? (await searchPages(refPaths, words, ownPaths.length ? 6 : 14)))
    : []
  // Tables in column layout: page text mixes a table's rows, so a limit is read from here.
  const tables = await tableChunks(ownPaths.length ? ownPaths : refPaths)

  const kindOf = new Map(own.map((f) => [f.relpath, f.kind]))
  let context = ''
  const sources: AskSource[] = []
  let tableText = ''
  for (const t of tables) {
    const b = `[Table — ${nameOf(t.relpath)} — page ${t.page} — ${t.heading}]\n${t.text}\n\n`
    if (tableText.length + b.length > TABLE_BUDGET) continue
    tableText += b
    sources.push({ relpath: t.relpath, name: nameOf(t.relpath), page: t.page })
  }
  for (const [list, ref] of [
    [ownPages, false],
    [refPages, true],
  ] as const) {
    for (const p of list) {
      const b = block(p, ref ? 'Reference Standard' : (kindOf.get(p.relpath) ?? 'Standard'))
      if (context.length + b.length > OWN_BUDGET) continue
      context += b
      sources.push({ relpath: p.relpath, name: nameOf(p.relpath), page: p.page })
    }
  }
  if (!context && !tableText) {
    return {
      answer: 'इन Standards के text में इस सवाल से जुड़ा कुछ नहीं मिला। सवाल दूसरे शब्दों में (Clause, Table या Test का नाम लेकर) पूछें।',
      sources: [],
      model: null,
    }
  }

  const { reply, model } = await sendQiAssistantMessage({
    page: 'masters/is-files-ask',
    context:
      `IS Code: ${input.isLabel}\n` +
      (tableText
        ? `TABLES (column layout: each line is one row; read a row's values from its own line; when a table has CELLS, ` +
          `take values from them — each CELLS line gives a row's columns as "Column name: text", read from the page by ` +
          `position):\n\n${tableText}\n`
        : '') +
      `STANDARD PAGES (the only source you may use, with the TABLES above; a table inside page text may have its rows mixed — use the TABLES for numbers):\n\n${context}`,
    message:
      `${input.question}\n\n` +
      'Rules: Answer only from the TABLES and STANDARD PAGES above. Name the clause / table and the file and page for every fact, ' +
      'e.g. "(Clause 7.2, IS 2062 Part 1 2025 - 00.pdf p. 5)". If an Amendment changes a clause, give the amended text ' +
      'and say so. If the pages do not answer the question, say clearly that it is not in these standards — never use ' +
      `outside knowledge or guess. Write the whole answer in ${answerLanguage(input.question)}, even where the pages ` +
      'are in another language; keep numbers, units and clause numbers exactly as in the standard.',
    history: input.history.slice(-8),
  })
  return { answer: reply, sources, model: model ?? null }
}

type LibraryChunk = {
  relpath: string
  folder: string
  doc_kind: string
  version_status: string | null
  kind: string
  page: number
  seq?: number
  heading: string
  text: string
}

const LIBRARY_BUDGET = 80_000
const SAME_PAGE_CHARS = 16_000

/** IS numbers the question names ("IS 2062", "IS:1786", "IS 2062 Part 1"): their folders in the index. */
/** The question's embedding from the server (local model); null when the service is not there or fails. */
async function embedQuestion(text: string): Promise<{ vector: string; model: string } | null> {
  try {
    const { data: sessionData } = await supabase.auth.getSession()
    const token = sessionData.session?.access_token
    if (!token || !text) return null
    const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/standards/embed`, {
      method: 'POST',
      headers: {
        apikey: import.meta.env.VITE_SUPABASE_ANON_KEY as string,
        Authorization: `Bearer ${token}`,
        'X-User-Jwt': token,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ text }),
    })
    const body = (await res.json().catch(() => ({}))) as { vector?: number[]; model?: string }
    if (!res.ok || !Array.isArray(body.vector) || !body.model) return null
    return { vector: `[${body.vector.join(',')}]`, model: body.model }
  } catch {
    return null
  }
}

/**
 * A question without an IS number: English search words in the standards' own terms ("TMT bars" -> "high strength
 * deformed steel bars") and the IS numbers that most likely cover it. The numbers are only where to look: the
 * answer still comes from the extracts (RAG testing, 20 Nov 2026: "scale of sampling for TMT bars" missed IS 1786).
 */
async function libraryPlan(question: string, previous: string): Promise<{ words: string; standards: string[] }> {
  try {
    const { reply } = await sendQiAssistantMessage({
      page: 'masters/is-files-ask',
      message:
        (previous ? `Earlier question in this chat: ${previous}\n` : '') +
        `Question about Indian Standards: ${question}\n\n` +
        (previous ? 'If the question is a follow-up ("and for Fe 600?"), read it together with the earlier question.\n' : '') +
        'Give (1) 3 to 7 English words to search the standards\' text for the answer, using the words an Indian ' +
        'Standard itself uses: the product or material first (trade names turned into the standard\'s name, e.g. ' +
        '"TMT bars" -> "high strength deformed steel bars", "LPG cylinder" -> "welded low carbon steel cylinders ' +
        'liquefied petroleum gases"), then the property or topic; no general words such as standard, requirement, ' +
        'value; and (2) up to 3 IS numbers that most likely cover this product or test (e.g. "IS 1786"), or none if ' +
        'unsure. Answer as JSON: {"words": ["..."], "standards": ["IS ..."]}',
      responseFormat: 'json_object',
      history: [],
    })
    const plan = JSON.parse(reply.match(/\{[\s\S]*\}/)?.[0] ?? '{}') as { words?: unknown; standards?: unknown }
    const words = Array.isArray(plan.words) && plan.words.length ? plan.words.map(String).join(' ') : question
    const standards = Array.isArray(plan.standards) ? namedStandards(plan.standards.map(String).join(' ')).slice(0, 3) : []
    return { words, standards }
  } catch {
    return { words: question, standards: [] }
  }
}

const SMALL_DOC_PAGES = 12
const AMENDMENT_WORDS = /\b(amd|amendment|amended|amendments)\b|संशोधन/i

/**
 * Short documents of these standards read whole (as in IS Files' Ask AI): a 10-page scanned standard's table may hold
 * none of the question's words ("carbon" printed "c" by OCR in IS 2879 Table 1), and a one-page amendment is split
 * into chunks of which the search found only the first (RAG testing, 20 Nov 2026). The documents the hits came from
 * come first; amendments only when the question asks about one. At most 3 documents.
 */
async function wholeSmallDocs(folders: string[], hits: LibraryChunk[], question: string, includeOld: boolean): Promise<LibraryChunk[]> {
  if (!folders.length) return []
  const { data } = await supabase
    .from('standard_docs')
    .select('id, relpath, folder, kind, pages, version_status')
    .in('folder', folders)
    .in('kind', AMENDMENT_WORDS.test(question) ? ['Standard', 'Amendment'] : ['Standard'])
    .lte('pages', SMALL_DOC_PAGES)
  const hitRank = new Map<string, number>()
  hits.forEach((c, i) => {
    if (!hitRank.has(c.relpath)) hitRank.set(c.relpath, i)
  })
  type Doc = { id: number; relpath: string; folder: string; kind: string; pages: number; version_status: string | null }
  const docs = ((data ?? []) as Doc[])
    .filter((d) => includeOld || ['Current', 'Included'].includes(d.version_status ?? 'Current'))
    // A named standard with no hits at all ("Compare IS 7863 1975 and 2025") still gets its short Standards read.
    .filter((d) => d.kind === 'Amendment' || hitRank.has(d.relpath) || !hits.some((c) => c.folder === d.folder))
    // Asked about an amendment: the newest amendments first (the question names "Amendment 4", not the base text).
    .sort((a, b) => (a.kind === b.kind ? (hitRank.get(a.relpath) ?? 99) - (hitRank.get(b.relpath) ?? 99) || b.relpath.localeCompare(a.relpath) : a.kind === 'Amendment' ? -1 : 1))
    .slice(0, 3)
  if (!docs.length) return []
  const byId = new Map(docs.map((d) => [d.id, d]))
  const { data: rows } = await supabase
    .from('standard_chunks')
    .select('doc_id, page, seq, kind, heading, text')
    .in('doc_id', [...byId.keys()])
    .order('doc_id')
    .order('page')
    .order('seq')
    .limit(150)
  return ((rows ?? []) as Array<{ doc_id: number; page: number; seq: number; kind: string; heading: string; text: string }>).map((c) => {
    const d = byId.get(c.doc_id)!
    return { relpath: d.relpath, folder: d.folder, doc_kind: d.kind, version_status: d.version_status, kind: c.kind, page: c.page, seq: c.seq, heading: c.heading, text: c.text }
  })
}

/**
 * The other chunks of the best pages: a table page is cut into several chunks and the search often found only one
 * (RAG testing, 21 Nov 2026: IS 10500 p. 17 seq 1 came, the Lead row in seq 0 did not). Up to 10 pages.
 */
async function samePageChunks(hits: LibraryChunk[]): Promise<LibraryChunk[]> {
  const pages: Array<{ relpath: string; page: number; c: LibraryChunk }> = []
  for (const c of hits) {
    if (pages.length >= 10) break
    if (!pages.some((p) => p.relpath === c.relpath && p.page === c.page)) pages.push({ relpath: c.relpath, page: c.page, c })
  }
  if (!pages.length) return []
  const { data: docs } = await supabase.from('standard_docs').select('id, relpath').in('relpath', [...new Set(pages.map((p) => p.relpath))])
  const idOf = new Map(((docs ?? []) as Array<{ id: number; relpath: string }>).map((d) => [d.relpath, d.id]))
  const relOf = new Map([...idOf].map(([r, id]) => [id, r]))
  if (!idOf.size) return []
  const { data: rows } = await supabase
    .from('standard_chunks')
    .select('doc_id, page, seq, kind, heading, text')
    .in('doc_id', [...idOf.values()])
    .in('page', [...new Set(pages.map((p) => p.page))])
    .order('doc_id')
    .order('page')
    .order('seq')
    .limit(150)
  // At most SAME_PAGE_CHARS of new text, best pages first: more crowded the tables out of the budget (RAG testing,
  // 21 Nov 2026: IS 14543 arsenic, Table 3, was dropped).
  const have = new Set(hits.map((c) => `${c.relpath}#${c.page}#${c.seq ?? c.heading}`))
  const byPage = new Map<string, LibraryChunk[]>()
  for (const r of (rows ?? []) as Array<{ doc_id: number; page: number; seq: number; kind: string; heading: string; text: string }>) {
    const relpath = relOf.get(r.doc_id) ?? ''
    const p = pages.find((x) => x.relpath === relpath && x.page === r.page)
    if (!p || have.has(`${relpath}#${r.page}#${r.seq}`)) continue
    const k = `${relpath}#${r.page}`
    byPage.set(k, [...(byPage.get(k) ?? []), { ...p.c, kind: r.kind, seq: r.seq, heading: r.heading, text: r.text }])
  }
  const out: LibraryChunk[] = []
  let used = 0
  for (const p of pages) {
    for (const c of byPage.get(`${p.relpath}#${p.page}`) ?? []) {
      const n = Math.min(c.text.length, PAGE_CHARS)
      if (used + n > SAME_PAGE_CHARS) continue
      used += n
      out.push(c)
    }
  }
  return out
}

/** Puts each page's other chunks right after the first hit on that page (in place), skipping ones already there. */
function withSamePage(chunks: LibraryChunk[], extra: LibraryChunk[]) {
  const key = (c: LibraryChunk) => `${c.relpath}#${c.page}#${c.seq ?? c.heading}`
  const have = new Set(chunks.map(key))
  const out: LibraryChunk[] = []
  const placed = new Set<string>()
  for (const c of chunks) {
    out.push(c)
    const pk = `${c.relpath}#${c.page}`
    if (placed.has(pk)) continue
    placed.add(pk)
    for (const e of extra) {
      if (e.relpath !== c.relpath || e.page !== c.page || have.has(key(e))) continue
      have.add(key(e))
      out.push(e)
    }
  }
  chunks.splice(0, chunks.length, ...out)
}

/**
 * The Part a question names for a standard ("IS 3025 Part 11", "IS 1239 (Part 1)"): folder -> part. A folder such as
 * IS 3025 holds some 60 Parts; without this the search spread over all of them (RAG testing, 20 Nov 2026).
 */
export function namedParts(question: string): Map<string, string> {
  const out = new Map<string, string>()
  for (const m of question.matchAll(/\bIS\s*[:/-]?\s*(\d{2,5})\s*\(?\s*(?:Part|Pt\.?|भाग)\s*[-:]?\s*(\d{1,3})\b/gi)) {
    out.set(`IS ${Number(m[1])}`, String(Number(m[2])))
  }
  return out
}

/** True when the file is of the named Part, or the folder has no Part named, or the file names no Part at all. */
function inNamedPart(relpath: string, folder: string, parts: Map<string, string>): boolean {
  const part = parts.get(folder)
  if (!part) return true
  const name = nameOf(relpath)
  return new RegExp(`\\bPart ${part}\\b`, 'i').test(name) || !/\bParts?\b/i.test(name)
}

export function namedStandards(question: string): string[] {
  const out = new Set<string>()
  for (const m of question.matchAll(/\bIS\s*[:/-]?\s*(\d{2,5})(?!\d)/gi)) out.add(`IS ${Number(m[1])}`)
  return [...out].slice(0, 8)
}

/**
 * Ask AI over the whole Standards Library: the best chunks from every current standard (a few each, so several
 * standards answer together), or — when the question names IS numbers — the chunks and tables of those standards.
 */
export async function askLibrary(input: { question: string; history: AskTurn[]; includeOld: boolean }): Promise<AskAnswer> {
  const folders = namedStandards(input.question)
  // A follow-up without an IS number ("and for Fe 600?") keeps the standards of the earlier questions as hints.
  const earlier = input.history.filter((t) => t.role === 'user').slice(-3).map((t) => t.content)
  const earlierStandards = folders.length ? [] : namedStandards(earlier.join(' '))
  const plan = folders.length ? null : await libraryPlan(input.question, earlier[earlier.length - 1] ?? '')
  const words = plan ? plan.words : await searchWords(input.question, folders.join(', '))
  // Meaning search (embeddings) with the word search when the embed service answers; words alone otherwise.
  const meaning = await embedQuestion(`${words} ${/^[\x20-\x7e]+$/.test(input.question) ? input.question : ''}`.trim())
  const call = async (limit: number, perDoc: number, only: string[] | null) => {
    const common = { p_query: words, p_limit: limit, p_per_doc: perDoc, p_current_only: !input.includeOld, ...(only ? { p_folders: only } : {}) }
    if (meaning) {
      const r = await supabase.rpc('search_library_hybrid', { ...common, p_embedding: meaning.vector, p_model: meaning.model })
      if (!r.error) return r
    }
    return supabase.rpc('search_library_chunks', common)
  }
  const chunks: LibraryChunk[] = []
  if (folders.length) {
    // Each named standard gets its own share, so one long standard does not crowd the others out.
    const parts = namedParts(input.question)
    const share = Math.max(6, Math.floor(30 / folders.length))
    // A named Part: more hits asked for, then only that Part's files kept.
    // One named standard may give up to 10 chunks per file (the search's own limit), several get 8 each.
    const perDoc = folders.length === 1 ? 10 : 8
    const each = await Promise.all(folders.map((f) => call(parts.has(f) ? Math.min(80, share * 4) : share, perDoc, [f])))
    for (const [n, r] of each.entries()) {
      if (r.error) throw new Error(r.error.message)
      const f = folders[n]
      chunks.push(...((r.data ?? []) as LibraryChunk[]).filter((c) => inNamedPart(c.relpath, f, parts)).slice(0, share))
    }
    withSamePage(chunks, await samePageChunks(chunks))
    // Their tables in column layout, for numbers.
    const { data: docs } = await supabase
      .from('standard_docs')
      .select('relpath, version_status, kind, folder')
      .in('folder', folders)
      .eq('kind', 'Standard')
    const current = ((docs ?? []) as Array<{ relpath: string; version_status: string | null; folder: string }>)
      .filter((d) => input.includeOld || (d.version_status ?? 'Current') === 'Current')
      .filter((d) => inNamedPart(d.relpath, d.folder, parts))
      .map((d) => d.relpath)
    const have = new Set(chunks.map((c) => `${c.relpath}#${c.page}#${c.seq ?? c.heading}`))
    for (const t of await tableChunks(current)) {
      const key = `${t.relpath}#${t.page}#${t.heading}`
      if (have.has(key)) continue
      have.add(key)
      chunks.push({ relpath: t.relpath, folder: '', doc_kind: 'Standard', version_status: null, kind: 'table', page: t.page, heading: t.heading, text: t.text })
    }
    for (const c of await wholeSmallDocs(folders, chunks, input.question, input.includeOld)) {
      const key = `${c.relpath}#${c.page}#${c.seq ?? c.heading}`
      if (have.has(key)) continue
      have.add(key)
      chunks.push(c)
    }
  } else {
    const r = await call(28, 3, null)
    if (r.error) throw new Error(r.error.message)
    const found = (r.data ?? []) as LibraryChunk[]
    // The best 8 hits first; the rest go after the lead standards' own chunks and tables, which otherwise lost their
    // place in the budget to forewords of other standards (RAG testing, 21 Nov 2026: IS 14543 arsenic, Table 3).
    chunks.push(...found.slice(0, 8))
    // No IS number named: the standards the best hits come from are read once more on their own, with their tables,
    // so "which standard covers X and what is its limit" gets the limit too (RAG testing, 20 Nov 2026: the first
    // pass found IS 14543 for packaged drinking water but not its pH row).
    const score = new Map<string, number>()
    found.slice(0, 10).forEach((c, i) => {
      if (c.folder) score.set(c.folder, (score.get(c.folder) ?? 0) + 1 / (i + 1))
    })
    const best = Math.max(0, ...score.values())
    const fromHits = [...score.entries()]
      .filter(([, v]) => v >= best / 2)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 2)
      .map(([f]) => f)
    // The planner's IS numbers first, when the library has them; then the standards the hits point to.
    const hinted = plan?.standards.length
      ? [...new Set(((await supabase.from('standard_docs').select('folder').in('folder', plan.standards)).data ?? []).map((d) => (d as { folder: string }).folder))]
      : []
    const lead = [...new Set([...earlierStandards, ...hinted, ...fromHits])].slice(0, 3)
    const have = new Set(chunks.map((c) => `${c.relpath}#${c.page}#${c.seq ?? c.heading}`))
    const add = (c: LibraryChunk) => {
      const key = `${c.relpath}#${c.page}#${c.seq ?? c.heading}`
      if (have.has(key)) return
      have.add(key)
      chunks.push(c)
    }
    if (lead.length) {
      const more = await Promise.all(lead.map((f) => call(10, 6, [f])))
      for (const m of more) if (!m.error) ((m.data ?? []) as LibraryChunk[]).forEach(add)
      const samePage = await samePageChunks(chunks.filter((c) => lead.includes(c.folder)))
      const { data: docs } = await supabase.from('standard_docs').select('relpath, version_status, folder').in('folder', lead).eq('kind', 'Standard')
      // The lead standards' tables in lead order (the best standard's first), not by file id: IS 13428's tables
      // filled the budget before IS 14543's Table 3 (RAG testing, 21 Nov 2026).
      const current = ((docs ?? []) as Array<{ relpath: string; version_status: string | null; folder: string }>)
        .filter((d) => input.includeOld || (d.version_status ?? 'Current') === 'Current')
        .sort((a, b) => lead.indexOf(a.folder) - lead.indexOf(b.folder))
        .map((d) => d.relpath)
      const tables = (await tableChunks(current)).sort((a, b) => current.indexOf(a.relpath) - current.indexOf(b.relpath))
      for (const t of tables) {
        add({ relpath: t.relpath, folder: '', doc_kind: 'Standard', version_status: null, kind: 'table', page: t.page, heading: t.heading, text: t.text })
      }
      for (const c of await wholeSmallDocs(lead, chunks, input.question, input.includeOld)) add(c)
      // After the tables, so they keep their place in the budget.
      samePage.forEach(add)
    }
    found.slice(8).forEach(add)
  }
  if (!chunks.length && folders.length && !input.includeOld) {
    // A named standard with no current edition (RAG testing, 20 Nov 2026: "IS 8052" answered "nothing matches"
    // though the library has it, Withdrawn): say so and point to the Include Older Editions tick.
    const { data: old } = await supabase.from('standard_docs').select('relpath, version_status, superseded_by').in('folder', folders).in('version_status', ['Withdrawn', 'Superseded'])
    const rows = (old ?? []) as Array<{ relpath: string; version_status: string; superseded_by: string | null }>
    if (rows.length) {
      const list = rows
        .slice(0, 6)
        .map((r) => `${nameOf(r.relpath).replace(/\.pdf$/i, '')} — ${r.version_status}${r.superseded_by ? ` (by ${r.superseded_by})` : ''}`)
        .join('\n')
      const english = answerLanguage(input.question) === 'English'
      return {
        answer: english
          ? `${folders.join(', ')} has no current edition in the Standards Library. The library holds:\n${list}\n\nTick “Include Older Editions (Superseded / Withdrawn)” and ask again to get the answer from these editions.`
          : `${folders.join(', ')} का कोई current edition Standards Library में नहीं है। Library में ये हैं:\n${list}\n\n“Include Older Editions (Superseded / Withdrawn)” पर tick करके फिर पूछें, तो जवाब इन्हीं editions से मिलेगा।`,
        sources: rows.slice(0, 6).map((r) => ({ relpath: r.relpath, name: nameOf(r.relpath), page: 1 })),
        model: null,
      }
    }
  }
  if (!chunks.length) {
    return {
      answer: answerLanguage(input.question) === 'English'
        ? 'Nothing in the Standards Library matches this question. Ask again with the IS number, or the name of the test or property (e.g. "tensile strength", "marking").'
        : 'Standards Library में इस सवाल से मिलता कुछ नहीं मिला। सवाल में IS नंबर, test या property का नाम (जैसे "tensile strength", "marking") लिखकर पूछें।',
      sources: [],
      model: null,
    }
  }
  let context = ''
  const sources: AskSource[] = []
  for (const c of chunks) {
    const tag = c.version_status && c.version_status !== 'Current' ? ` (${c.version_status})` : ''
    const b = `[${c.kind === 'table' ? 'Table' : c.doc_kind} — ${nameOf(c.relpath)}${tag} — page ${c.page}${c.heading ? ` — ${c.heading.slice(0, 80)}` : ''}]\n${c.text.slice(0, PAGE_CHARS)}\n\n`
    if (context.length + b.length > LIBRARY_BUDGET) continue
    context += b
    sources.push({ relpath: c.relpath, name: nameOf(c.relpath), page: c.page })
  }
  const { reply, model } = await sendQiAssistantMessage({
    page: 'standards/library-ask',
    context: `STANDARDS LIBRARY EXTRACTS (the only source you may use; each block names its file and page):\n\n${context}`,
    message:
      `${input.question}\n\n` +
      'Rules: Answer only from the STANDARDS LIBRARY EXTRACTS above. For every fact name the standard, the clause or ' +
      'table and the page, e.g. "(IS 1786 2008, Table 3, p. 8)". When several standards answer, give each one ' +
      'separately and compare them in a short table if that helps. A "Table" block keeps one row per line: read a ' +
      "row's values from its own line (ROWS lines join the grade / quality names). When a Table block has CELLS, take " +
      "a value from its CELLS line: each gives a row's columns as 'Column name: text', read from the page by position " +
      '(the printed layout below it can shift a value into the next column). Mention when a block is from a ' +
      'Superseded or Withdrawn edition. If the extracts do not answer the question, say so plainly — never use outside ' +
      'knowledge or guess. Do not suggest uploading files or app features; when something is missing, name the ' +
      'standard, clause or table to open in the library. ' +
      `Write the whole answer in ${answerLanguage(input.question)}, even where the extracts are in another language; ` +
      'keep numbers, units and clause numbers exactly as written.',
    history: input.history.slice(-8),
  })
  return { answer: reply, sources, model: model ?? null }
}
