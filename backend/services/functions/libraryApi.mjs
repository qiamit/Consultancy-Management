import crypto from 'node:crypto'

/**
 * Library API for the owner's own apps (qirlpl.com; owner, 21 Nov 2026). A server-to-server API with a key made in
 * Settings -> API Keys (header "X-API-Key: qelib_..."). It returns passages of the Standards Library (IS, document,
 * clause / table, page, text) and PDF links; it writes no answer (the calling app does that with its own AI).
 *
 *   POST /library/search     {query, folders?, include_old?, limit?, per_doc?}  -> passages + PDF links
 *   POST /library/documents  {query, extra_references?}                          -> documents of a standard, grouped
 *                                                                                   as IS Files, with references + title
 *   POST /library/standards  {query}                                             -> standards matching a number
 *   POST /library/file-link  {relpath, page?}                                    -> fresh PDF links
 *
 * PDF links work without a key for LINK_TTL_MS (anyone holding the link can open the file until then), so the calling
 * app should hand them only to its own signed-in users. Keys are checked by SHA-256 hash; each key may make
 * PER_MINUTE requests a minute.
 */
const LINK_TTL_MS = 60 * 60 * 1000
const PER_MINUTE = 120

// Letters and digits only; "ISO/IEC 17025" is also asked as "ISO 17025".
const compact = (s) => String(s).toUpperCase().replace(/[^A-Z0-9]/g, '').replace(/^ISOIEC/, 'ISO')

/**
 * A standard's name as asked -> its library folder, Part and Sec; null when the library has no folder for it.
 * IS standards: "IS:1786", "is 1786", "1786", "IS 3025 (Part 11)" -> folder "IS 1786" / "IS 3025" (+ Part).
 * Other standards (ASTM, ISO, ISO-IEC, JIS, EN … one folder each): matched on letters and digits only, the edition
 * year left out, so "ASTM E415-21", "ISO/IEC 17025:2017" and "JIS B7184" find "ASTM E415", "ISO-IEC 17025", "JIS B 7184".
 * `otherFolders`: the library's folders that are not "IS <number>".
 */
export function resolveLibraryName(name, otherFolders = []) {
  const text = String(name ?? '').trim()
  if (!text) return null
  const part = text.match(/\bpart\s*[-:]?\s*(\d+)/i)?.[1] ?? ''
  const section = text.match(/\bsec(?:tion)?\s*[-:]?\s*(\d+)/i)?.[1] ?? ''
  const is = text.match(/\bIS\s*[:/-]?\s*(\d{1,5})\b/i) || text.match(/^\s*(\d{1,5})\s*$/)
  if (is) return { folder: `IS ${Number(is[1])}`, part: String(Number(part) || ''), section: String(Number(section) || '') }
  const key = compact(
    text
      .replace(/\(\s*(part|sec)[^)]*\)/gi, ' ')
      .replace(/\b(part|sec(tion)?)\s*[-:]?\s*\d+.*$/i, ' ')
      .replace(/\s*[:-]\s*(19|20)?\d{2}[a-z]?(\s*\(\s*\d{4}\s*\))?\s*$/i, '')
      .replace(/\(\s*\d{4}\s*\)\s*$/, ''),
  )
  if (key.length < 3) return null
  let best = null
  for (const folder of otherFolders) {
    const f = compact(folder)
    if (!f) continue
    // A longer number never matches a shorter folder ("ASTM D445" is not "ASTM D44").
    if (f === key || (key.startsWith(f) && !/\d/.test(key[f.length]) && /\d$/.test(f))) {
      if (!best || f.length > compact(best).length) best = folder
    }
  }
  return best ? { folder: best, part: '', section: '' } : null
}

/** Part / Sec / year written in a library file name: "IS 2062 Part 1 2025 - 00.pdf" (same as the app's editionOf). */
export function editionOf(relpath) {
  const name = String(relpath).split('/').pop() ?? String(relpath)
  const years = name.match(/\b(?:19|20)\d{2}\b/g) ?? []
  return {
    part: name.match(/\bPart\s*-?\s*(\d+)/i)?.[1] ?? '',
    section: name.match(/\bSec(?:tion)?\s*-?\s*(\d+)/i)?.[1] ?? '',
    year: years[years.length - 1] ?? '',
  }
}

const byYearDesc = (a, b) =>
  Number(editionOf(b.relpath).year || 0) - Number(editionOf(a.relpath).year || 0) ||
  String(a.relpath).split('/').pop().localeCompare(String(b.relpath).split('/').pop())

/**
 * The IS Files grouping of one standard's folder, as the app's IS Files window shows it (isLibraryFiles.ts:
 * loadIsLibraryFiles + requiredTestsApi.ts: pickStandardDocs): the latest readable edition of the asked Part / Sec,
 * the amendments of that edition, the Product Manual, and the older editions of the same Part.
 */
export function groupStandardDocs(rows, edition) {
  const docs = rows.filter((d) => !String(d.relpath).includes('::'))
  const ask = { part: edition?.part ?? '', section: edition?.section ?? '' }
  const partScore = (e) =>
    (ask.part ? (e.part === ask.part ? 3 : e.part ? -10 : -1) : e.part ? -10 : 0) +
    (ask.section ? (e.section === ask.section ? 2 : e.section ? -10 : -1) : e.section ? -10 : 0)
  const best = (list) => {
    const ok = list.filter((d) => d.score > -5)
    if (!ok.length) return list.map((d) => d.relpath)
    const top = Math.max(...ok.map((d) => d.score))
    return ok.filter((d) => d.score === top).map((d) => d.relpath)
  }
  const allStandards = docs.filter((d) => d.kind === 'Standard')
  // A file no page could be read from (DRM, damaged) is not the edition to read while a readable one exists.
  const readable = allStandards.filter((d) => (d.pages ?? 0) > 0)
  const standardDocs = readable.length ? readable : allStandards
  const topPart = Math.max(-5, ...standardDocs.map((d) => partScore(editionOf(d.relpath))))
  const latestYear = Math.max(
    0,
    ...standardDocs.filter((d) => partScore(editionOf(d.relpath)) === topPart).map((d) => Number(editionOf(d.relpath).year) || 0),
  )
  const pickedStandards = new Set(
    best(standardDocs.map((d) => ({ relpath: d.relpath, score: partScore(editionOf(d.relpath)) + (Number(editionOf(d.relpath).year) === latestYear ? 1 : 0) }))),
  )
  const manualDocs = docs.filter((d) => d.kind === 'Product Manual')
  const mains = manualDocs.filter((d) => !/\/_Extra\//.test(d.relpath))
  const pool = (mains.length ? mains : manualDocs).map((d) => ({ relpath: d.relpath, e: editionOf(d.relpath) }))
  const topManualPart = Math.max(-5, ...pool.map((m) => partScore(m.e)))
  const latestManual = Math.max(0, ...pool.filter((m) => partScore(m.e) === topManualPart).map((m) => Number(m.e.year) || 0))
  const pickedManuals = new Set(best(pool.map((m) => ({ relpath: m.relpath, score: partScore(m.e) + (Number(m.e.year) === latestManual ? 0.3 : 0) }))))

  const standards = docs.filter((d) => d.kind === 'Standard' && pickedStandards.has(d.relpath)).sort(byYearDesc)
  const mainYears = new Set(standards.map((d) => editionOf(d.relpath).year))
  const main = standards[0] ? editionOf(standards[0].relpath) : ask
  const samePart = (relpath) => {
    const e = editionOf(relpath)
    return e.part === (main.part ?? '') && e.section === (main.section ?? '')
  }
  const amendments = docs
    .filter((d) => d.kind === 'Amendment' && samePart(d.relpath) && mainYears.has(editionOf(d.relpath).year))
    .sort((a, b) => String(a.relpath).localeCompare(String(b.relpath), undefined, { numeric: true }))
  const manuals = docs.filter((d) => d.kind === 'Product Manual' && pickedManuals.has(d.relpath)).sort(byYearDesc)
  const shown = new Set([...standards, ...amendments, ...manuals].map((d) => d.relpath))
  const older = docs.filter((d) => !shown.has(d.relpath) && samePart(d.relpath) && !/\/_Extra\//.test(d.relpath)).sort(byYearDesc)
  return { standards, amendments, manuals, older }
}

export function createLibraryApi({ rest, readBody, json, standardsFiles, publicFunctionsUrl, embedUrl }) {
  const calls = new Map()
  let otherFolders = { at: 0, list: [] }

  /** The library's folders that are not "IS <number>" (ASTM, ISO, JIS, EN …), read again every 10 minutes. */
  async function nonIsFolders() {
    if (Date.now() - otherFolders.at < 10 * 60_000) return otherFolders.list
    try {
      const rows = await rest(
        `/standard_docs?source=eq.library&active=eq.true&folder=not.match.${encodeURIComponent('^IS [0-9]')}&select=folder&limit=5000`,
      )
      otherFolders = { at: Date.now(), list: [...new Set((Array.isArray(rows) ? rows : []).map((r) => String(r.folder)))] }
    } catch {
      otherFolders = { at: Date.now() - 9 * 60_000, list: otherFolders.list } // try again in a minute
    }
    return otherFolders.list
  }

  async function resolve(name) {
    const quick = resolveLibraryName(name)
    return quick ?? resolveLibraryName(name, await nonIsFolders())
  }

  /** Part, Sec and edition year of each document (search rows carry only the relpath). */
  async function docFacts(relpaths) {
    const list = [...new Set(relpaths)].slice(0, 200)
    if (!list.length) return new Map()
    const inList = list.map((r) => `"${String(r).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`).join(',')
    const rows = await rest(`/standard_docs?relpath=in.(${encodeURIComponent(inList)})&select=relpath,part,section,edition_year`)
    return new Map((Array.isArray(rows) ? rows : []).map((d) => [d.relpath, d]))
  }

  function overLimit(keyId) {
    const now = Date.now()
    const recent = (calls.get(keyId) ?? []).filter((t) => t > now - 60_000)
    recent.push(now)
    calls.set(keyId, recent)
    if (calls.size > 1000) for (const [id, list] of calls) if (!list.some((t) => t > now - 60_000)) calls.delete(id)
    return recent.length > PER_MINUTE
  }

  function fail(status, message) {
    const err = new Error(message)
    err.statusCode = status
    return err
  }

  /** The key's row, or a 401. Counts the use. */
  async function checkKey(req) {
    const header = String(req.headers['x-api-key'] || '').trim() ||
      String(req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim()
    if (!/^qelib_[0-9a-f]{48}$/.test(header)) throw fail(401, 'Missing or invalid API key (header X-API-Key).')
    const hash = crypto.createHash('sha256').update(header).digest('hex')
    const rows = await rest(`/library_api_keys?key_hash=eq.${hash}&active=eq.true&select=id,name,use_count`)
    const key = Array.isArray(rows) ? rows[0] : null
    if (!key) throw fail(401, 'Missing or invalid API key (header X-API-Key).')
    if (overLimit(key.id)) throw fail(429, `Too many requests: at most ${PER_MINUTE} a minute per key.`)
    rest(`/library_api_keys?id=eq.${key.id}`, {
      method: 'PATCH',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({ last_used_at: new Date().toISOString(), use_count: Number(key.use_count || 0) + 1 }),
    }).catch(() => {})
    return key
  }

  function links(relpath, page) {
    const token = standardsFiles.apiLinkToken(relpath, LINK_TTL_MS)
    if (!token) return null
    const base = `${publicFunctionsUrl}/standards/file?t=${encodeURIComponent(token)}`
    return {
      view: `${base}${page ? `#page=${page}` : ''}`,
      download: `${base}&download=1`,
      expires_at: new Date(Date.now() + LINK_TTL_MS).toISOString(),
    }
  }

  async function embed(text) {
    try {
      const r = await fetch(`${embedUrl}/embed`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ texts: [text] }),
        signal: AbortSignal.timeout(15_000),
      })
      const data = await r.json().catch(() => ({}))
      if (!r.ok || !Array.isArray(data?.vectors?.[0]) || !data.model) return null
      return { vector: `[${data.vectors[0].join(',')}]`, model: String(data.model) }
    } catch {
      return null
    }
  }

  async function handleSearch(req, res) {
    const key = await checkKey(req)
    const body = (await readBody(req, 32 * 1024)) || {}
    const query = String(body.query ?? '').trim().slice(0, 500)
    if (query.length < 2) throw fail(400, 'Give "query": English search words or the question (2 to 500 characters).')
    const asked = (Array.isArray(body.folders) ? body.folders : []).slice(0, 10).map((x) => String(x ?? '').trim()).filter(Boolean)
    const resolved = await Promise.all(asked.map(resolve))
    const notFound = asked.filter((_, i) => !resolved[i])
    const picks = resolved.filter(Boolean)
    if (asked.length && !picks.length) {
      json(res, 200, { query, folders: [], not_found: notFound, count: 0, results: [], note: 'None of these standards is in the Standards Library.' })
      return
    }
    const folders = [...new Set(picks.map((p) => p.folder))]
    // A folder asked with a Part ("IS 3025 Part 11") keeps only that Part's documents; asked without one, all of them.
    const wholeFolder = new Set(picks.filter((p) => !p.part).map((p) => p.folder))
    const partsAsked = picks.filter((p) => p.part && !wholeFolder.has(p.folder))
    const limit = Math.min(40, Math.max(1, Math.round(Number(body.limit) || 20)))
    const perDoc = Math.min(10, Math.max(1, Math.round(Number(body.per_doc) || (folders.length ? 6 : 3))))
    const common = {
      p_query: query,
      p_limit: partsAsked.length ? Math.min(150, limit * 4) : limit,
      p_per_doc: perDoc,
      p_current_only: body.include_old !== true,
      ...(folders.length ? { p_folders: folders } : {}),
    }
    const meaning = await embed(query)
    const rows = meaning
      ? await rest('/rpc/search_library_hybrid', { method: 'POST', body: JSON.stringify({ ...common, p_embedding: meaning.vector, p_model: meaning.model }) })
      : await rest('/rpc/search_library_chunks', { method: 'POST', body: JSON.stringify(common) })
    const list = Array.isArray(rows) ? rows : []
    const facts = await docFacts(list.map((c) => c.relpath)).catch(() => new Map())
    const keep = (c) => {
      if (!partsAsked.length || wholeFolder.has(c.folder)) return true
      const d = facts.get(c.relpath) ?? {}
      return partsAsked.some((p) => p.folder === c.folder && String(d.part ?? '') === p.part && (!p.section || String(d.section ?? '') === p.section))
    }
    const results = list
      .filter(keep)
      .slice(0, limit)
      .map((c) => {
        const d = facts.get(c.relpath) ?? {}
        return {
          is: c.folder,
          document: String(c.relpath).split('/').pop(),
          relpath: c.relpath,
          document_kind: c.doc_kind,
          part: d.part || null,
          section: d.section || null,
          edition_year: d.edition_year ?? null,
          edition_status: c.version_status ?? 'Current',
          passage_kind: c.kind,
          page: c.page,
          heading: c.heading || null,
          text: String(c.text ?? ''),
          pdf: links(c.relpath, c.page),
        }
      })
    console.log(`[library-api] search by key ${key.name}: ${results.length} passages`)
    json(res, 200, {
      query,
      folders: picks.map((p) => `${p.folder}${p.part ? ` Part ${p.part}` : ''}${p.section ? ` Sec ${p.section}` : ''}`),
      ...(notFound.length ? { not_found: notFound } : {}),
      search: meaning ? 'words + meaning' : 'words only',
      count: results.length,
      results,
    })
  }

  const DOC_SELECT = 'id,folder,relpath,kind,pages,edition_year,part,section,amendment_no,version_status,superseded_by'
  const inList = (values) => values.map((v) => `"${String(v).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`).join(',')

  function docOut(d) {
    return {
      document: String(d.relpath).split('/').pop(),
      relpath: d.relpath,
      document_kind: d.kind,
      pages: d.pages,
      edition_year: d.edition_year,
      part: d.part || null,
      section: d.section || null,
      amendment_no: d.amendment_no,
      edition_status: d.version_status ?? 'Current',
      superseded_by: d.superseded_by,
      pdf: links(d.relpath, null),
    }
  }

  /** Titles from the Standards List, by number and Part (else by number). */
  async function titlesFor(keys) {
    const bases = [...new Set(keys.map((k) => k.base))].slice(0, 200)
    if (!bases.length) return () => ''
    const rows = await rest(`/standard_list?base=in.(${encodeURIComponent(inList(bases))})&select=base,part,title&limit=2000`).catch(() => [])
    const list = Array.isArray(rows) ? rows : []
    return (base, part) => {
      const digits = (v) => String(v ?? '').match(/\d+/)?.[0] ?? ''
      const same = list.filter((r) => r.base === base)
      return String((same.find((r) => digits(r.part) === (part ?? '')) ?? same.find((r) => !digits(r.part)) ?? same[0])?.title ?? '')
    }
  }

  /**
   * The standards the main Standard names (standard_refs, most cited first) and the ones the caller links by hand
   * (`extra`), each with its latest readable edition of that Part in the library, or file null.
   */
  async function referencesOf(mainIds, extra) {
    const merged = new Map()
    const key = (base, part) => `${base}${part ? ` Part ${part}` : ''}`
    if (mainIds.length) {
      const rows = await rest(`/standard_refs?doc_id=in.(${mainIds.join(',')})&select=ref_base,ref_part,cites&limit=2000`)
      for (const r of Array.isArray(rows) ? rows : []) {
        const k = key(r.ref_base, r.ref_part)
        const m = merged.get(k) ?? { base: r.ref_base, part: r.ref_part ?? '', cites: 0, manual: false }
        m.cites += r.cites ?? 1
        merged.set(k, m)
      }
    }
    for (const r of extra) {
      const k = key(r.base, r.part)
      merged.set(k, { ...(merged.get(k) ?? { base: r.base, part: r.part, cites: 0 }), manual: true })
    }
    if (!merged.size) return []
    // A non-IS reference is found by its library folder ("ISO 17025" -> "ISO-IEC 17025"); IS numbers are the folder.
    const others = await nonIsFolders()
    for (const m of merged.values()) {
      m.folder = /^IS \d/.test(m.base) ? m.base : (resolveLibraryName(m.base, others)?.folder ?? m.base)
    }
    const bases = [...new Set([...merged.values()].map((m) => m.folder))]
    const refDocs = []
    for (let i = 0; i < bases.length; i += 80) {
      const rows = await rest(
        `/standard_docs?folder=in.(${encodeURIComponent(inList(bases.slice(i, i + 80)))})&kind=eq.Standard&source=eq.library&active=eq.true&select=${DOC_SELECT}&limit=5000`,
      )
      refDocs.push(...(Array.isArray(rows) ? rows : []).filter((d) => !String(d.relpath).includes('::')))
    }
    const title = await titlesFor([...merged.values()])
    return [...merged.entries()]
      .map(([k, m]) => {
        const candidates = refDocs
          .filter((d) => d.folder === m.folder && (m.part ? editionOf(d.relpath).part === m.part : !editionOf(d.relpath).part))
          .sort((a, b) => (Number(b.pages ?? 0) > 0 ? 1 : 0) - (Number(a.pages ?? 0) > 0 ? 1 : 0) || byYearDesc(a, b))
        return { key: k, base: m.base, part: m.part || null, cites: m.cites, manual: m.manual, title: title(m.base, m.part), file: candidates[0] ? docOut(candidates[0]) : null }
      })
      .sort(
        (a, b) =>
          Number(b.manual) - Number(a.manual) ||
          Number(Boolean(b.file)) - Number(Boolean(a.file)) ||
          b.cites - a.cites ||
          a.key.localeCompare(b.key, undefined, { numeric: true }),
      )
  }

  async function handleDocuments(req, res) {
    await checkKey(req)
    const body = (await readBody(req, 16 * 1024)) || {}
    const asked = String(body.query ?? '').trim().slice(0, 120)
    if (!/\d/.test(asked)) throw fail(400, 'Give "query": a standard number, e.g. "IS 1786", "IS 3025 Part 11" or "ASTM D445".')
    const pick = await resolve(asked)
    if (!pick) {
      json(res, 200, { query: asked, is: null, count: 0, documents: [], groups: null, note: 'Not in the Standards Library.' })
      return
    }
    const folder = pick.folder
    const rows = await rest(
      `/standard_docs?folder=eq.${encodeURIComponent(folder)}&source=eq.library&active=eq.true&select=${DOC_SELECT}&order=relpath.asc&limit=500`,
    )
    const all = (Array.isArray(rows) ? rows : []).filter((d) => !String(d.relpath).includes('::'))
    // Asked with a Part ("IS 3025 Part 11"): only that Part's documents (and Sec, when asked).
    const documents = all
      .filter((d) => !pick.part || (String(d.part ?? '') === pick.part && (!pick.section || String(d.section ?? '') === pick.section)))
      .map(docOut)
    // The IS Files grouping (as the app's IS Files window) with the Reference Standards and the title.
    const g = groupStandardDocs(all, pick)
    const extra = []
    for (const x of (Array.isArray(body.extra_references) ? body.extra_references : []).slice(0, 50)) {
      const name = typeof x === 'string' ? x : `${x?.base ?? ''}${x?.part ? ` Part ${x.part}` : ''}${x?.section ? ` Sec ${x.section}` : ''}`
      const r = await resolve(name)
      if (r) extra.push({ base: r.folder, part: r.part })
    }
    const references = await referencesOf(g.standards.map((d) => d.id), extra)
    const title = (await titlesFor([{ base: folder }]))(folder, pick.part)
    json(res, 200, {
      is: folder,
      ...(pick.part ? { part: pick.part } : {}),
      ...(pick.section ? { section: pick.section } : {}),
      title: title || null,
      count: documents.length,
      documents,
      groups: {
        standards: g.standards.map(docOut),
        amendments: g.amendments.map(docOut),
        manuals: g.manuals.map(docOut),
        older: g.older.map(docOut),
        references,
      },
    })
  }

  /** Standards whose number matches what was typed ("1608", "IS 1608 Part 1"): latest edition per Part, with title. */
  async function handleStandards(req, res) {
    await checkKey(req)
    const body = (await readBody(req, 8 * 1024)) || {}
    const text = String(body.query ?? '').trim().slice(0, 80)
    const num = text.match(/\d{2,5}/)?.[0]
    if (!num) throw fail(400, 'Give "query": a standard number, e.g. "1608" or "IS 1608 Part 1".')
    const part = text.match(/\bpart\s*-?\s*(\d+)/i)?.[1] ?? ''
    const rows = await rest(
      `/standard_docs?folder=ilike.${encodeURIComponent(`*${num}*`)}&kind=eq.Standard&source=eq.library&active=eq.true&select=${DOC_SELECT}&limit=300`,
    )
    const bestOf = new Map()
    for (const d of (Array.isArray(rows) ? rows : []).filter((x) => !String(x.relpath).includes('::'))) {
      const e = editionOf(d.relpath)
      if (part && e.part !== part) continue
      const key = `${d.folder}${e.part ? ` Part ${e.part}` : ''}`
      const have = bestOf.get(key)
      if (!have || Number(e.year || 0) > Number(editionOf(have.doc.relpath).year || 0)) bestOf.set(key, { base: d.folder, part: e.part, key, doc: d })
    }
    const hits = [...bestOf.values()]
      .sort((a, b) => Number(!a.base.endsWith(` ${num}`)) - Number(!b.base.endsWith(` ${num}`)) || a.key.localeCompare(b.key, undefined, { numeric: true }))
      .slice(0, 30)
    const title = await titlesFor(hits)
    json(res, 200, {
      query: text,
      count: hits.length,
      standards: hits.map((h) => ({ key: h.key, base: h.base, part: h.part || null, title: title(h.base, h.part) || null, file: docOut(h.doc) })),
    })
  }

  async function handleFileLink(req, res) {
    await checkKey(req)
    const body = (await readBody(req, 8 * 1024)) || {}
    const relpath = String(body.relpath ?? '').trim()
    const rows = relpath
      ? await rest(`/standard_docs?relpath=eq.${encodeURIComponent(relpath)}&source=eq.library&active=eq.true&select=relpath&limit=1`)
      : []
    const pdf = Array.isArray(rows) && rows.length ? links(relpath, Number(body.page) || null) : null
    if (!pdf) throw fail(404, 'Not a Standards Library file (use a relpath from /library/search or /library/documents).')
    json(res, 200, { relpath, pdf })
  }

  return { handleSearch, handleDocuments, handleStandards, handleFileLink }
}
