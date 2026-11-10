import { supabase } from '@/lib/supabaseClient'

/**
 * Designation rows of a dimension standard (IS 808 for Indian rolled sections), read by the app: the row of the
 * sample's own section ("ISA 130X130X12", "ISMB 300", "ISMC 150") with its nominal mass and dimensions (t, R1, R2 …),
 * the table heading and column names, and the group's first row (IS 808 writes "∠ 130 × 130 × 8" once, then
 * "× 12 23.45 … 130 130 12 10.0 4.8"). The AI then has the nominal values that the tolerance standard (IS 1852) applies
 * its tolerances to.
 */

/** Indian rolled-section designations (IS 808 series). */
export const ROLLED_SECTION = /(?:\bIS(?!O)[A-Z]{1,3}|∠)\s*\d{2,4}/

type Section = { kind: 'dims'; a: string; b: string; t: string } | { kind: 'name'; prefix: string; size: string }

/** The section(s) the sample names: "ISA 130X130X12" (legs × thickness) or "ISMB 300" (series + depth). */
export function sampleSections(text: string): Section[] {
  const out: Section[] = []
  const num = (v: string) => String(Number(v))
  for (const m of text.matchAll(/(?:\bIS(?!O)[A-Z]{1,3}|∠)\s*(\d{2,4}(?:\.\d+)?)\s*[xX×*]\s*(\d{2,4}(?:\.\d+)?)\s*[xX×*]\s*(\d{1,3}(?:\.\d+)?)/g)) {
    const s: Section = { kind: 'dims', a: num(m[1]), b: num(m[2]), t: num(m[3]) }
    if (!out.some((o) => o.kind === 'dims' && o.a === s.a && o.b === s.b && o.t === s.t)) out.push(s)
  }
  for (const m of text.matchAll(/\b(IS(?:MB|LB|WB|HB|JB|MC|LC|JC|NT|ST|SC))\s*(\d{2,4})(?![\d.xX×*])/g)) {
    const s: Section = { kind: 'name', prefix: m[1].toUpperCase(), size: m[2] }
    if (!out.some((o) => o.kind === 'name' && o.prefix === s.prefix && o.size === s.size)) out.push(s)
  }
  return out.slice(0, 2)
}

const esc = (v: string) => v.replace(/\./g, '\\.')
/** A number as written in a table: 12 matches "12" and "12.0". */
const numRe = (v: string) => `${esc(v)}(?:\\.0+)?`

/** The lines of one page for a section: column headings, the group's first row and the section's row. */
export function pickDesignationLines(pageText: string, s: Section): string[] {
  const lines = pageText.split('\n')
  const rowRe =
    s.kind === 'dims'
      ? new RegExp(`(^|\\s)${numRe(s.a)}\\s+${numRe(s.b)}\\s+${numRe(s.t)}(\\s|$)|${numRe(s.a)}\\s*[x×X*]\\s*${numRe(s.b)}\\s*[x×X*]\\s*${numRe(s.t)}(?![\\d.])`)
      : new RegExp(`\\b${s.prefix}\\s*${s.size}(?![\\d.])`, 'i')
  const hits = lines.map((l, i) => (rowRe.test(l) ? i : -1)).filter((i) => i >= 0)
  if (!hits.length) return []
  const picked = new Set<number>()
  // Table title and column names: the lines naming the table, its designation / mass / dimension columns and units.
  lines.forEach((l, i) => {
    if (i < 40 && /\btable\s+\d+|designation|\bmass\b|dimensions|\bmm\b|kg\/m|\bcm/i.test(l) && l.trim().length > 3) picked.add(i)
  })
  for (const h of hits) {
    picked.add(h)
    // The group's first row ("∠ 130 × 130 × 8") above a continuation row ("× 12 …").
    if (/^\s*[x×X*]\s*\d/.test(lines[h])) {
      for (let j = h - 1; j >= 0 && j >= h - 12; j -= 1) {
        if (/(?:∠|IS[A-Z]{1,3})\s*\d/.test(lines[j])) {
          picked.add(j)
          break
        }
      }
    }
  }
  return [...picked].sort((x, y) => x - y).map((i) => lines[i].replace(/\s+/g, ' ').trim())
}

/**
 * The DESIGNATION ROW block for the sample's section(s) from these dimension-standard documents, or '' when the sample
 * names no rolled section or no row is found.
 */
export async function designationRows(relpaths: string[], sampleText: string, budget = 5_000): Promise<{ text: string; pages: string[] }> {
  const sections = sampleSections(sampleText)
  if (!relpaths.length || !sections.length) return { text: '', pages: [] }
  const { data: docs } = await supabase.from('standard_docs').select('id, relpath').in('relpath', relpaths)
  const list = (docs ?? []) as Array<{ id: number; relpath: string }>
  if (!list.length) return { text: '', pages: [] }
  const byId = new Map(list.map((d) => [d.id, d.relpath]))
  let text = ''
  const pages: string[] = []
  for (const s of sections) {
    const pattern =
      s.kind === 'dims'
        ? `(^|[^0-9.])${numRe(s.a)}[[:space:]]+${numRe(s.b)}[[:space:]]+${numRe(s.t)}([^0-9.]|$)`
        : `${s.prefix}[[:space:]]*${s.size}([^0-9.]|$)`
    const { data } = await supabase
      .from('standard_pages')
      .select('doc_id, page, text')
      .in(
        'doc_id',
        list.map((d) => d.id),
      )
      .filter('text', 'imatch', pattern)
      .order('page')
      .limit(4)
    for (const p of (data ?? []) as Array<{ doc_id: number; page: number; text: string }>) {
      const lines = pickDesignationLines(p.text, s)
      if (!lines.length) continue
      const file = (byId.get(p.doc_id) ?? '').split('/').pop()
      const block = `[${file} — page ${p.page}]\n${lines.join('\n')}\n\n`
      if (text.length + block.length > budget) continue
      text += block
      pages.push(`${file} p${p.page}`)
    }
  }
  return { text: text.trim(), pages }
}
