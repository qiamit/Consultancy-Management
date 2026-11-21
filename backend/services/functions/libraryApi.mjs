import crypto from 'node:crypto'

/**
 * Library API for the owner's own apps (qirlpl.com; owner, 21 Nov 2026). A server-to-server API with a key made in
 * Settings -> API Keys (header "X-API-Key: qelib_..."). It returns passages of the Standards Library (IS, document,
 * clause / table, page, text) and PDF links; it writes no answer (the calling app does that with its own AI).
 *
 *   POST /library/search     {query, folders?, include_old?, limit?, per_doc?}  -> passages + PDF links
 *   POST /library/documents  {query}                                             -> documents of a standard
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

  async function handleDocuments(req, res) {
    await checkKey(req)
    const body = (await readBody(req, 8 * 1024)) || {}
    const asked = String(body.query ?? '').trim().slice(0, 120)
    if (!/\d/.test(asked)) throw fail(400, 'Give "query": a standard number, e.g. "IS 1786", "IS 3025 Part 11" or "ASTM D445".')
    const pick = await resolve(asked)
    if (!pick) {
      json(res, 200, { query: asked, is: null, count: 0, documents: [], note: 'Not in the Standards Library.' })
      return
    }
    const folder = pick.folder
    const rows = await rest(
      `/standard_docs?folder=eq.${encodeURIComponent(folder)}&source=eq.library&active=eq.true` +
        '&select=relpath,kind,pages,edition_year,part,section,amendment_no,version_status,superseded_by&order=relpath.asc&limit=200',
    )
    // Asked with a Part ("IS 3025 Part 11"): only that Part's documents (and Sec, when asked).
    const documents = (Array.isArray(rows) ? rows : [])
      .filter((d) => !pick.part || (String(d.part ?? '') === pick.part && (!pick.section || String(d.section ?? '') === pick.section)))
      .map((d) => ({
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
    }))
    json(res, 200, { is: folder, ...(pick.part ? { part: pick.part } : {}), ...(pick.section ? { section: pick.section } : {}), count: documents.length, documents })
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

  return { handleSearch, handleDocuments, handleFileLink }
}
