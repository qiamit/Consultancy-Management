import { supabase } from '@/lib/supabaseClient'
import { editionOf, fetchIsCodeEdition, fetchStandardFolders, pickStandardDocs } from './requiredTestsApi'

/**
 * An IS Code's files from the Standards Library (the owner's "Oracle Database" folder, synced to the server): the
 * current Standard, its Amendments, the Product Manual, the Standards it refers to, and older editions. The PDFs
 * open from the server (functions: /standards/file-link → /standards/file), never from app storage.
 */
export type LibraryFile = {
  relpath: string
  name: string
  kind: string
  year: string
  pages: number | null
  /** Current / Superseded / Withdrawn / Included (indexer, from names and Standards List); null before it is worked out. */
  status: string | null
  supersededBy: string | null
}

export type LibraryReference = {
  key: string
  cites: number
  file: LibraryFile | null
  /** Added by hand (Add Reference), not found in the Standard's text. */
  manual: boolean
}

export type IsLibraryFiles = {
  standards: LibraryFile[]
  amendments: LibraryFile[]
  manuals: LibraryFile[]
  references: LibraryReference[]
  older: LibraryFile[]
}

type DocRow = {
  id: number
  folder: string
  relpath: string
  kind: string
  pages: number | null
  version_status?: string | null
  superseded_by?: string | null
}

// '*' and not a column list: the version columns exist only after their release, and a list naming them would fail before.
const DOC_COLUMNS = '*'

const toFile = (d: DocRow): LibraryFile => ({
  relpath: d.relpath,
  name: d.relpath.split('/').pop() ?? d.relpath,
  kind: d.kind,
  year: editionOf(d.relpath).year,
  pages: d.pages,
  status: d.version_status ?? null,
  supersededBy: d.superseded_by ?? null,
})

const byYearDesc = (a: LibraryFile, b: LibraryFile) => Number(b.year || 0) - Number(a.year || 0) || a.name.localeCompare(b.name)

const refKey = (base: string, part: string | null | undefined) => `${base}${part ? ` Part ${part}` : ''}`

/** References added by hand; none while the table is not there yet (before its release). */
async function manualReferences(isCodeId: string): Promise<Array<{ ref_base: string; ref_part: string }>> {
  const { data, error } = await supabase.from('is_code_reference_links').select('ref_base, ref_part').eq('is_code_id', isCodeId)
  return error ? [] : ((data ?? []) as Array<{ ref_base: string; ref_part: string }>)
}

/** Adds a Reference Standard to this IS Code for good (by number and Part: a newer edition is picked up by itself). */
export async function addReferenceLink(isCodeId: string, base: string, part: string): Promise<void> {
  const { error } = await supabase
    .from('is_code_reference_links')
    .upsert({ is_code_id: isCodeId, ref_base: base, ref_part: part }, { onConflict: 'is_code_id,ref_base,ref_part', ignoreDuplicates: true })
  if (error) throw new Error(error.message)
}

export type LibraryStandardHit = { base: string; part: string; key: string; file: LibraryFile; title: string }

/** Standards in the library whose number matches what was typed ("1608", "IS 1608 Part 1"), latest edition per Part. */
export async function searchLibraryStandards(text: string): Promise<LibraryStandardHit[]> {
  const num = text.match(/\d{2,5}/)?.[0]
  if (!num) return []
  const part = text.match(/\bpart\s*-?\s*(\d+)/i)?.[1] ?? ''
  const { data, error } = await supabase
    .from('standard_docs')
    .select(DOC_COLUMNS)
    .eq('kind', 'Standard')
    .ilike('folder', `%${num}%`)
    .limit(300)
  if (error) throw new Error(error.message)
  const best = new Map<string, LibraryStandardHit>()
  for (const d of ((data ?? []) as DocRow[]).filter((d) => !d.relpath.includes('::'))) {
    const e = editionOf(d.relpath)
    if (part && e.part !== part) continue
    const key = refKey(d.folder, e.part)
    const file = toFile(d)
    const have = best.get(key)
    if (!have || Number(file.year || 0) > Number(have.file.year || 0)) best.set(key, { base: d.folder, part: e.part, key, file, title: '' })
  }
  const hits = [...best.values()]
    .sort((a, b) => Number(!a.base.endsWith(` ${num}`)) - Number(!b.base.endsWith(` ${num}`)) || a.key.localeCompare(b.key, undefined, { numeric: true }))
    .slice(0, 30)
  if (hits.length) {
    const { data: list } = await supabase.from('standard_list').select('base, title').in('base', [...new Set(hits.map((h) => h.base))])
    const titles = new Map(((list ?? []) as Array<{ base: string; title: string | null }>).map((l) => [l.base, l.title ?? '']))
    for (const h of hits) h.title = titles.get(h.base) ?? ''
  }
  return hits
}

export const EMPTY_LIBRARY_FILES: IsLibraryFiles = { standards: [], amendments: [], manuals: [], references: [], older: [] }

export async function loadIsLibraryFiles(isCodeId: string): Promise<IsLibraryFiles> {
  const [folders, edition] = await Promise.all([fetchStandardFolders(isCodeId), fetchIsCodeEdition(isCodeId)])
  if (!folders.length) return EMPTY_LIBRARY_FILES
  const { data, error } = await supabase.from('standard_docs').select(DOC_COLUMNS).in('folder', folders)
  if (error) throw new Error(error.message)
  const docs = ((data ?? []) as DocRow[]).filter((d) => !d.relpath.includes('::'))
  // The latest edition of the IS Code's own Part / Section (the Master's revision year may be an older one).
  const picked = await pickStandardDocs(folders, edition ? { ...edition, year: '' } : null)
  const pickedSet = new Set([...picked.standards, ...picked.manuals])
  const standards = docs.filter((d) => d.kind === 'Standard' && pickedSet.has(d.relpath)).map(toFile).sort(byYearDesc)
  const mainYears = new Set(standards.map((s) => s.year))
  const samePart = (relpath: string) => {
    const e = editionOf(relpath)
    const main = standards[0] ? editionOf(standards[0].relpath) : edition
    return !main || (e.part === (main.part ?? '') && e.section === (main.section ?? ''))
  }
  const amendmentDocs = docs.filter((d) => d.kind === 'Amendment' && samePart(d.relpath))
  const amendments = amendmentDocs.filter((d) => mainYears.has(editionOf(d.relpath).year)).map(toFile).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))
  const manuals = docs.filter((d) => d.kind === 'Product Manual' && pickedSet.has(d.relpath)).map(toFile).sort(byYearDesc)
  const shown = new Set([...standards, ...amendments, ...manuals].map((f) => f.relpath))
  const older = docs
    .filter((d) => !shown.has(d.relpath) && samePart(d.relpath) && !/\/_Extra\//.test(d.relpath))
    .map(toFile)
    .sort(byYearDesc)

  // Standards the current Standard names, most cited first, each with its latest edition in the library (same Part),
  // and the ones staff added by hand.
  const mainIds = docs.filter((d) => standards.some((s) => s.relpath === d.relpath)).map((d) => d.id)
  let references: LibraryReference[] = []
  const merged = new Map<string, { base: string; part: string; cites: number; manual: boolean }>()
  if (mainIds.length) {
    const { data: refRows } = await supabase.from('standard_refs').select('ref_base, ref_part, cites').in('doc_id', mainIds)
    for (const r of (refRows ?? []) as Array<{ ref_base: string; ref_part: string; cites: number }>) {
      const key = refKey(r.ref_base, r.ref_part)
      const m = merged.get(key) ?? { base: r.ref_base, part: r.ref_part ?? '', cites: 0, manual: false }
      m.cites += r.cites ?? 1
      merged.set(key, m)
    }
  }
  for (const r of await manualReferences(isCodeId)) {
    const key = refKey(r.ref_base, r.ref_part)
    merged.set(key, { ...(merged.get(key) ?? { base: r.ref_base, part: r.ref_part, cites: 0 }), manual: true })
  }
  if (merged.size) {
    const bases = [...new Set([...merged.values()].map((m) => m.base))]
    const refDocs: DocRow[] = []
    for (let i = 0; i < bases.length; i += 80) {
      const { data: rd } = await supabase
        .from('standard_docs')
        .select(DOC_COLUMNS)
        .in('folder', bases.slice(i, i + 80))
        .eq('kind', 'Standard')
      refDocs.push(...(((rd ?? []) as DocRow[]).filter((d) => !d.relpath.includes('::'))))
    }
    references = [...merged.entries()]
      .map(([key, m]) => {
        const candidates = refDocs
          .filter((d) => d.folder === m.base)
          .filter((d) => {
            const e = editionOf(d.relpath)
            return m.part ? e.part === m.part : !e.part
          })
          .map(toFile)
          .sort((a, b) => (Number(b.pages ?? 0) > 0 ? 1 : 0) - (Number(a.pages ?? 0) > 0 ? 1 : 0) || byYearDesc(a, b))
        return { key, cites: m.cites, file: candidates[0] ?? null, manual: m.manual }
      })
      .sort(
        (a, b) =>
          Number(b.manual) - Number(a.manual) ||
          Number(Boolean(b.file)) - Number(Boolean(a.file)) ||
          b.cites - a.cites ||
          a.key.localeCompare(b.key, undefined, { numeric: true }),
      )
  }
  return { standards, amendments, manuals, references, older }
}

/** Opens a library PDF in a new browser tab, or downloads it. */
export async function openLibraryFile(relpath: string, download = false, page?: number): Promise<void> {
  // The tab is opened at once (inside the click), else the browser blocks it as a pop-up.
  const tab = download ? null : window.open('', '_blank')
  try {
    const { data: sessionData } = await supabase.auth.getSession()
    const accessToken = sessionData.session?.access_token
    if (!accessToken) throw new Error('Session Expired. Please Sign In Again.')
    const base = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`
    const res = await fetch(`${base}/standards/file-link`, {
      method: 'POST',
      headers: {
        apikey: import.meta.env.VITE_SUPABASE_ANON_KEY as string,
        Authorization: `Bearer ${accessToken}`,
        'X-User-Jwt': accessToken,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ relpath }),
    })
    const body = (await res.json().catch(() => ({}))) as { token?: string; error?: string }
    if (!res.ok || !body.token) throw new Error(body.error || 'Could Not Open the File.')
    const url = `${base}/standards/file?t=${encodeURIComponent(body.token)}${download ? '&download=1' : ''}${!download && page ? `#page=${page}` : ''}`
    if (tab) {
      tab.location.href = url
      return
    }
    const a = document.createElement('a')
    a.href = url
    a.rel = 'noopener'
    document.body.appendChild(a)
    a.click()
    a.remove()
  } catch (err) {
    tab?.close()
    throw err
  }
}
