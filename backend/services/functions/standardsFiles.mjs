import crypto from 'node:crypto'
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'

/**
 * Standards Library PDFs (the owner's "Oracle Database" folder, copied to the server by standards-sync.sh) opened from
 * the app. A browser tab cannot send the sign-in header, so it is two steps:
 *   POST /standards/file-link {relpath}  — signed-in staff; the file must be one the caller can read in standard_docs
 *                                          (RLS: staff only). Answers a link token valid for 10 minutes.
 *   GET  /standards/file?t=…[&download=1] — the PDF, shown in the tab (inline) or saved (attachment).
 * The folder is mounted read-only; a path outside it is never served.
 */
const LINK_TTL_MS = 10 * 60 * 1000

export function createStandardsFiles({ root, secret, requireActiveUser, userRestFor, callerJwt, readBody, corsJson, corsHeaders }) {
  const base = path.resolve(root || '/library')
  const key = crypto.createHash('sha256').update(`standards-file:${secret || ''}`).digest()

  const sign = (payload) => crypto.createHmac('sha256', key).update(payload).digest('base64url')

  function makeToken(relpath, ttlMs = LINK_TTL_MS) {
    const payload = Buffer.from(JSON.stringify({ p: relpath, e: Date.now() + ttlMs })).toString('base64url')
    return `${payload}.${sign(payload)}`
  }

  function readToken(token) {
    const [payload, mac] = String(token || '').split('.')
    if (!payload || !mac) return null
    const want = Buffer.from(sign(payload))
    const got = Buffer.from(mac)
    if (want.length !== got.length || !crypto.timingSafeEqual(want, got)) return null
    try {
      const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'))
      return typeof data?.p === 'string' && Number(data?.e) > Date.now() ? data.p : null
    } catch {
      return null
    }
  }

  /** Full path inside the library, or null for anything outside it (an attachment "a.pdf::b.pdf" is not a file). */
  function fullPath(relpath) {
    if (!relpath || relpath.includes('::') || relpath.includes('\0')) return null
    const full = path.resolve(base, relpath)
    return full.startsWith(`${base}${path.sep}`) && full.toLowerCase().endsWith('.pdf') ? full : null
  }

  async function handleLink(req, res) {
    if (!secret) return corsJson(res, 503, { error: 'Standards Files Are Not Set Up on the Server.' })
    await requireActiveUser(req)
    const body = await readBody(req, 16 * 1024)
    const relpath = String(body?.relpath ?? '').trim()
    if (!fullPath(relpath)) return corsJson(res, 400, { error: 'Not a Standards Library File.' })
    // The caller's own RLS decides: staff read standard_docs, customers do not.
    const userRest = userRestFor(callerJwt(req))
    const { data } = await userRest(`/standard_docs?relpath=eq.${encodeURIComponent(relpath)}&select=relpath&limit=1`)
    if (!Array.isArray(data) || !data.length) return corsJson(res, 404, { error: 'File Not Found in the Standards Library.' })
    return corsJson(res, 200, { token: makeToken(relpath), expiresInSeconds: LINK_TTL_MS / 1000 })
  }

  async function handleFile(req, res) {
    const url = new URL(req.url || '/', 'http://functions.local')
    const relpath = readToken(url.searchParams.get('t'))
    const full = relpath ? fullPath(relpath) : null
    if (!full) {
      res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' })
      res.end('This link has expired. Open the file again from the app.')
      return
    }
    let stat
    try {
      stat = await fsp.stat(full)
    } catch {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
      res.end('File not found on the server. Run a Standards Library sync.')
      return
    }
    const name = path.basename(full)
    const download = url.searchParams.get('download') === '1'
    res.writeHead(200, {
      ...corsHeaders(res, 'GET, OPTIONS'),
      'Content-Type': 'application/pdf',
      'Content-Length': stat.size,
      'Content-Disposition': `${download ? 'attachment' : 'inline'}; filename="${name.replace(/[^\x20-\x7e]|"/g, '_')}"; filename*=UTF-8''${encodeURIComponent(name)}`,
      'Cache-Control': 'private, max-age=600',
      'X-Content-Type-Options': 'nosniff',
    })
    fs.createReadStream(full)
      .on('error', () => res.destroy())
      .pipe(res)
  }

  /** POST /standards/embed {text}: the question's embedding for the meaning search (signed-in users only). */
  async function handleEmbed(req, res) {
    await requireActiveUser(req)
    const body = await readBody(req, 16 * 1024)
    const text = String(body?.text ?? '').trim().slice(0, 2000)
    if (!text) return corsJson(res, 400, { error: 'Text Required' })
    const url = process.env.STANDARDS_EMBED_URL || 'http://standards-embed:8000'
    let r
    try {
      r = await fetch(`${url}/embed`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ texts: [text] }),
        signal: AbortSignal.timeout(15_000),
      })
    } catch {
      return corsJson(res, 503, { error: 'Meaning Search Is Not Available Right Now.' })
    }
    const data = await r.json().catch(() => ({}))
    if (!r.ok || !Array.isArray(data?.vectors?.[0])) return corsJson(res, 503, { error: 'Meaning Search Is Not Available Right Now.' })
    return corsJson(res, 200, { model: data.model, vector: data.vectors[0] })
  }

  /**
   * A link token for the Library API (the caller's API key was checked): null when the path is not a library PDF.
   * The file must still be listed in standard_docs; the API looks it up first.
   */
  function apiLinkToken(relpath, ttlMs) {
    return secret && fullPath(relpath) ? makeToken(relpath, ttlMs) : null
  }

  return { handleLink, handleFile, handleEmbed, apiLinkToken }
}
