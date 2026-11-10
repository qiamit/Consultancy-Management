import { supabase } from '@/lib/supabaseClient'

/**
 * Grade table pages of a Standard, picked by the app: the chemistry / mechanical table pages that list the sample's
 * declared grade ("E 410 C", "YSt 310", "Fe 500D"), with the page before a continued table (its heading and thickness
 * bands). The AI otherwise gets only a Standard's best word matches, and a numbers-only table page is easily left out
 * — then a cheap model looks for the table of another revision ("Table 2" of 2011 instead of Table 3 of 2025).
 */

/** Size / shape prefixes and standard prefixes that look like grades but are not ("ISA 130", "IS 2062"). */
const NOT_GRADE = /^(is|isa|isa|ismb|ismc|isjc|islb|cfshs|cfrhs|shs|rhs|chs|nb|od|dn|mm|ss|cm|fml|no|sl|qr|lot|batch|ref|amd|part|sec|page|table|clause)$/i

/** Grade designations in the sample's own words: letters + 2–4 digits (+ quality letters), e.g. "E 450 BR". */
export function gradeDesignations(text: string): Array<{ letters: string; number: string; quality: string }> {
  const out: Array<{ letters: string; number: string; quality: string }> = []
  for (const m of text.matchAll(/\b([A-Za-z]{1,5})\s*-?\s*(\d{2,4})(?![\d.xX×*/])\s*([A-Z]{1,2}\d?)?\b/g)) {
    const [, letters, number, quality = ''] = m
    if (NOT_GRADE.test(letters) || /^(19|20)\d{2}$/.test(number)) continue
    if (!out.some((g) => g.letters.toLowerCase() === letters.toLowerCase() && g.number === number)) out.push({ letters, number, quality })
  }
  return out.slice(0, 3)
}

type Page = { doc_id: number; page: number; text: string }

/** The GRADE TABLE PAGES block for the declared grade(s), from these documents only; '' when none is found. */
export async function gradeTablePages(
  relpaths: string[],
  sampleText: string,
  skip: Set<string>,
  budget = 22_000,
): Promise<{ text: string; pages: string[] }> {
  const grades = gradeDesignations(sampleText)
  if (!relpaths.length || !grades.length) return { text: '', pages: [] }
  const { data: docs } = await supabase.from('standard_docs').select('id, relpath, kind').in('relpath', relpaths).in('kind', ['Standard', 'Amendment'])
  const list = (docs ?? []) as Array<{ id: number; relpath: string; kind: string }>
  if (!list.length) return { text: '', pages: [] }
  const byId = new Map(list.map((d) => [d.id, d]))
  const found: Page[] = []
  for (const g of grades) {
    const { data } = await supabase
      .from('standard_pages')
      .select('doc_id, page, text')
      .in(
        'doc_id',
        list.map((d) => d.id),
      )
      .filter('text', 'imatch', `(^|[^a-z])${g.letters}[[:space:]]*-?[[:space:]]*${g.number}([^0-9]|$)`)
      .filter('text', 'imatch', 'table')
      .order('page')
      .limit(6)
    for (const p of (data ?? []) as Page[]) if (!found.some((f) => f.doc_id === p.doc_id && f.page === p.page)) found.push(p)
  }
  // A continued table: the page before holds its heading and the thickness bands; a page after that continues or
  // concludes the table holds its notes (e.g. nitrogen, impact test optional for a quality).
  const extra: Page[] = []
  const have = (doc: number, page: number) => [...found, ...extra].some((f) => f.doc_id === doc && f.page === page)
  const CONT = /\((?:concluded|continued)\)/i
  for (const p of [...found]) {
    for (const page of [p.page - 1, p.page + 1]) {
      if (have(p.doc_id, page)) continue
      if (page < p.page && !CONT.test(p.text.slice(0, 600))) continue
      const { data } = await supabase.from('standard_pages').select('doc_id, page, text').eq('doc_id', p.doc_id).eq('page', page).maybeSingle()
      const next = data as Page | null
      if (next && (page < p.page || CONT.test(next.text.slice(0, 600)))) extra.push(next)
    }
  }
  const all = [...found, ...extra].sort((a, b) => a.doc_id - b.doc_id || a.page - b.page)
  let text = ''
  const pages: string[] = []
  for (const p of all) {
    const d = byId.get(p.doc_id)
    if (!d) continue
    const ref = `${d.relpath.split('/').pop()} p${p.page}`
    if (skip.has(ref)) continue
    const block = `[${d.kind} — ${d.relpath.split('/').pop()} — page ${p.page}]\n${p.text.replace(/[ \t]+/g, ' ').trim()}\n\n`
    if (text.length + block.length > budget) continue
    text += block
    pages.push(ref)
  }
  return { text: text.trim(), pages }
}
