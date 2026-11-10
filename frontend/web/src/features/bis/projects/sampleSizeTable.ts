import { supabase } from '@/lib/supabaseClient'

/**
 * Size tables of a Standard (e.g. IS 4923 Table 1: "100x100x3  100  100  3.00 …"), read by the app, not the AI.
 * The AI only gets the matching pages of a Standard, and a size table page is easily left out — then a cheap model
 * guesses what the table holds ("100 × 100 is listed only in 4, 5 and 6 mm") and fails a good sample. The app finds
 * every table row of the sample's own size and of the next higher size, and sends those rows as a block.
 */

export type SampleSize = { depth: number; width: number }

const NUM = '(\\d+(?:\\.\\d+)?)'
const BY = '\\s*[x×X*]\\s*'
/** "100X100X3.60", "100 x 100 x 3.6", "50×25×2.50": depth × width (× thickness). */
const SIZE_RE = new RegExp(`(?<![\\d.])${NUM}${BY}${NUM}(?:${BY}${NUM})?`, 'g')
/** A table row that starts with a size designation: "100x100x3   100   100   3.00 …". */
const ROW_RE = new RegExp(`^\\s*${NUM}${BY}${NUM}(?:${BY}${NUM})?(?![\\d.])`)

/** Section sizes named in the sample's own text (description, variety, Test Request), each once. */
export function sampleSizes(text: string): SampleSize[] {
  const out: SampleSize[] = []
  for (const m of text.matchAll(SIZE_RE)) {
    const depth = Number(m[1])
    const width = Number(m[2])
    // A tiny pair is not a section size ("2 x 3 pieces"), nor are absurd ones.
    if (!(depth >= 5 && width >= 5 && depth <= 2000 && width <= 2000)) continue
    if (!out.some((s) => s.depth === depth && s.width === width)) out.push({ depth, width })
  }
  return out.slice(0, 3)
}

type Page = { relpath: string; page: number; text: string }

const same = (a: SampleSize, b: SampleSize) => (a.depth === b.depth && a.width === b.width) || (a.depth === b.width && a.width === b.depth)

/**
 * The table rows of this size and of the next higher standard size (by depth, as IS 4923 cl. 9.1 Note says), with each
 * table's heading. Identical pages (the same Standard in two files) give their rows once.
 */
export function pickSizeRows(pages: Page[], size: SampleSize): { text: string; rows: number } {
  type Row = { line: string; s: SampleSize; where: string; heading: string; amended: boolean }
  const rows: Row[] = []
  const seen = new Set<string>()
  for (const p of pages) {
    const lines = p.text.split('\n')
    // An amendment page ("Amendment No. 2 to IS 4923 : 2017 … Substitute the following for the existing Table") — its
    // table replaces the original one printed later in the same PDF.
    const amendment = p.text.slice(0, 300).match(/amendment\s+no\.?\s*(\d+)/i)
    let heading = ''
    lines.forEach((line, i) => {
      if (/^\s*table\s+\d+/i.test(line)) {
        heading = [line, ...lines.slice(i + 1, i + 4).filter((l) => !ROW_RE.test(l))]
          .map((l) => l.trim())
          .filter(Boolean)
          .join(' | ')
      }
      const m = ROW_RE.exec(line)
      if (!m) return
      const key = line.replace(/\s+/g, ' ').trim()
      if (seen.has(key)) return
      seen.add(key)
      rows.push({
        line: key,
        s: { depth: Number(m[1]), width: Number(m[2]) },
        where: `${p.relpath.split('/').pop()} page ${p.page}${amendment ? ` (Amendment No. ${amendment[1]})` : ''}`,
        heading,
        amended: Boolean(amendment),
      })
    })
  }
  // Rows from an amendment's substituted table win over the original table's rows for the same size.
  const current = (list: Row[]) => (list.some((r) => r.amended) ? list.filter((r) => r.amended) : list)
  const own = current(rows.filter((r) => same(r.s, size)))
  const bigger = current(rows.filter((r) => Math.max(r.s.depth, r.s.width) > Math.max(size.depth, size.width)))
  const nextDepth = bigger.length ? Math.min(...bigger.map((r) => Math.max(r.s.depth, r.s.width))) : null
  const next = nextDepth == null ? [] : bigger.filter((r) => Math.max(r.s.depth, r.s.width) === nextDepth)
  if (!own.length && !next.length) return { text: '', rows: 0 }
  const block = (title: string, list: Row[]) => {
    if (!list.length) return `${title}: none in the Standard's size tables.`
    const byHeading = new Map<string, Row[]>()
    list.forEach((r) => byHeading.set(r.heading, [...(byHeading.get(r.heading) ?? []), r]))
    return [
      `${title} (${list.length} rows):`,
      ...[...byHeading.entries()].flatMap(([h, rs]) => [`[${rs[0].where}${h ? ` — ${h}` : ''}]`, ...rs.map((r) => r.line)]),
    ].join('\n')
  }
  const label = `${size.depth} × ${size.width}`
  return {
    text: [
      block(`Rows for ${label} (this sample's size)`, own),
      block(`Rows for the next higher standard size${nextDepth ? ` (depth ${nextDepth})` : ''}`, next),
    ].join('\n\n'),
    rows: own.length + next.length,
  }
}

/** Every Standard / Amendment page of these index folders that names the size, read straight from the index. */
async function sizePages(folders: string[], size: SampleSize, relpaths?: string[]): Promise<Page[]> {
  const { data: docs } = await supabase.from('standard_docs').select('id, relpath').in('folder', folders).in('kind', ['Standard', 'Amendment'])
  const list = ((docs ?? []) as Array<{ id: number; relpath: string }>).filter((d) => !relpaths?.length || relpaths.includes(d.relpath))
  if (!list.length) return []
  const n = (v: number) => String(v).replace('.', '\\.')
  const { data: pages } = await supabase
    .from('standard_pages')
    .select('doc_id, page, text')
    .in(
      'doc_id',
      list.map((d) => d.id),
    )
    .filter('text', 'imatch', `(^|[^0-9.])${n(size.depth)}[[:space:]]*[x×*][[:space:]]*${n(size.width)}([^0-9]|$)`)
    .limit(12)
  const byId = new Map(list.map((d) => [d.id, d.relpath]))
  return ((pages ?? []) as Array<{ doc_id: number; page: number; text: string }>).map((p) => ({ relpath: byId.get(p.doc_id) ?? '', page: p.page, text: p.text }))
}

/** The SIZE TABLE ROWS block for the sample's size(s), or '' when the Standard has no size table for it. */
export async function sizeTableRows(folders: string[], sampleText: string, relpaths?: string[]): Promise<{ text: string; rows: number }> {
  if (!folders.length) return { text: '', rows: 0 }
  let text = ''
  let rows = 0
  for (const size of sampleSizes(sampleText)) {
    // The next higher size sits on the same or the following table pages: read pages naming either size.
    const pages = await sizePages(folders, size, relpaths).catch(() => [] as Page[])
    const own = pickSizeRows(pages, size)
    let picked = own
    // When the next higher size is on another page, look at the pages of the size table that follow.
    if (pages.length && !/Rows for the next higher standard size \(depth/.test(own.text)) {
      const more = await morePages(folders, pages).catch(() => [] as Page[])
      picked = pickSizeRows([...pages, ...more], size)
    }
    if (!picked.text) continue
    text += `${text ? '\n\n' : ''}${picked.text}`
    rows += picked.rows
  }
  return { text, rows }
}

/** The page after each size-table page (a table often runs on to the next page). */
async function morePages(folders: string[], pages: Page[]): Promise<Page[]> {
  if (!pages.length) return []
  const { data: docs } = await supabase.from('standard_docs').select('id, relpath').in('folder', folders).in('kind', ['Standard', 'Amendment'])
  const list = (docs ?? []) as Array<{ id: number; relpath: string }>
  const out: Page[] = []
  for (const p of pages.slice(0, 4)) {
    const doc = list.find((d) => d.relpath === p.relpath)
    if (!doc) continue
    const { data } = await supabase.from('standard_pages').select('page, text').eq('doc_id', doc.id).eq('page', p.page + 1).maybeSingle()
    if (data) out.push({ relpath: p.relpath, page: Number(data.page), text: String(data.text ?? '') })
  }
  return out
}
