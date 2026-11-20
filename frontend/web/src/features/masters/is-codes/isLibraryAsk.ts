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
async function searchWords(question: string, isLabel: string): Promise<string> {
  if (/^[\x20-\x7e]+$/.test(question) && question.split(/\s+/).length <= 12) return question
  const { reply } = await sendQiAssistantMessage({
    page: 'masters/is-files-ask',
    message:
      `Standard: ${isLabel}\nQuestion: ${question}\n\nGive 4 to 10 English words or short technical terms to search ` +
      `this standard's text for the answer (e.g. "tensile strength", "chemical composition", "marking", "sampling"). ` +
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

/** Best clause / table chunks for the words; null when chunk search is not there yet (the page search answers). */
async function searchChunks(relpaths: string[], words: string, limit: number): Promise<PageHit[] | null> {
  const { data, error } = await supabase.rpc('search_standard_chunks', { p_relpaths: relpaths, p_query: words, p_limit: limit })
  if (error) return null
  return ((data ?? []) as ChunkHit[]).map((c) => ({ relpath: c.relpath, page: c.page, text: `${c.heading ? `${c.heading}\n` : ''}${c.text}` }))
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
        : ((await searchChunks(ownPaths, words, 18)) ?? (await searchPages(ownPaths, words, 14)))
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
      (tableText ? `TABLES (column layout: each line is one row; read a row's values from its own line):\n\n${tableText}\n` : '') +
      `STANDARD PAGES (the only source you may use, with the TABLES above; a table inside page text may have its rows mixed — use the TABLES for numbers):\n\n${context}`,
    message:
      `${input.question}\n\n` +
      'Rules: Answer only from the TABLES and STANDARD PAGES above. Name the clause / table and the file and page for every fact, ' +
      'e.g. "(Clause 7.2, IS 2062 Part 1 2025 - 00.pdf p. 5)". If an Amendment changes a clause, give the amended text ' +
      'and say so. If the pages do not answer the question, say clearly that it is not in these standards — never use ' +
      'outside knowledge or guess. Reply in the language of the question (Hindi, Hinglish or English); keep numbers, ' +
      'units and clause numbers exactly as in the standard.',
    history: input.history.slice(-8),
  })
  return { answer: reply, sources, model: model ?? null }
}
