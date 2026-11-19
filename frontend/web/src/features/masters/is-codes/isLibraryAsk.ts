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
    !ownPaths.length ? [] : ownPageCount <= SMALL_STANDARD_PAGES ? await allPages(ownPaths) : await searchPages(ownPaths, words, 14)
  // The Standard first, then its Amendments, then the Product Manual (the source chips follow this order).
  if (ownPageCount <= SMALL_STANDARD_PAGES) ownPages.sort((a, b) => ownPaths.indexOf(a.relpath) - ownPaths.indexOf(b.relpath) || a.page - b.page)
  const refPages = refPaths.length ? await searchPages(refPaths, words, ownPaths.length ? 6 : 14) : []

  const kindOf = new Map(own.map((f) => [f.relpath, f.kind]))
  let context = ''
  const sources: AskSource[] = []
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
  if (!context) {
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
      `STANDARD PAGES (the only source you may use):\n\n${context}`,
    message:
      `${input.question}\n\n` +
      'Rules: Answer only from the STANDARD PAGES above. Name the clause / table and the file and page for every fact, ' +
      'e.g. "(Clause 7.2, IS 2062 Part 1 2025 - 00.pdf p. 5)". If an Amendment changes a clause, give the amended text ' +
      'and say so. If the pages do not answer the question, say clearly that it is not in these standards — never use ' +
      'outside knowledge or guess. Reply in the language of the question (Hindi, Hinglish or English); keep numbers, ' +
      'units and clause numbers exactly as in the standard.',
    history: input.history.slice(-8),
  })
  return { answer: reply, sources, model: model ?? null }
}
