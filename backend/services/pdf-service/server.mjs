/**
 * Playwright PDF service — renders HTML with Chromium (same engine as Chrome print).
 * POST /pdf  JSON: { html, filename?, format?, landscape?, margin? }   (needs a signed-in user's access token)
 * GET  /health
 *
 * Security (see README.md):
 * - Every /pdf request needs `Authorization: Bearer <user access token>`, checked against GoTrue
 *   (`${AUTH_URL}/user` with AUTH_ANON_KEY); good tokens are cached for 60 s.
 * - The page can load only data:, blob:, about: and the allowlisted URL prefixes (PDF_ALLOWED_URL_PREFIXES,
 *   by default https://<API_DOMAIN>/storage/v1/object/). Everything else (other hosts, private IPs, cloud
 *   metadata, file:) is blocked. JavaScript stays on: the BIS templates fit / paginate themselves in the page.
 * - At most PDF_MAX_CONCURRENCY renders at once (2), PDF_MAX_QUEUE waiting (10, then 503), 30 s per render.
 * - Clients get generic errors; details go to the server log with a request id.
 */
import http from 'node:http'
import crypto from 'node:crypto'
import { chromium } from 'playwright'

const PORT = Number(process.env.PORT || process.env.PDF_SERVICE_PORT || 3847)
const HOST = process.env.PDF_SERVICE_HOST || '0.0.0.0'
// BIS packs embed logos, signatures and maps as data URLs; 12 MB leaves room for the largest real documents.
const MAX_HTML_BYTES = Number(process.env.PDF_MAX_HTML_BYTES || 12_000_000)
const RENDER_TIMEOUT_MS = Number(process.env.PDF_RENDER_TIMEOUT_MS || 30_000)
const MAX_CONCURRENCY = Math.max(1, Number(process.env.PDF_MAX_CONCURRENCY || 2))
const MAX_QUEUE = Math.max(0, Number(process.env.PDF_MAX_QUEUE ?? 10))

const AUTH_URL = String(process.env.AUTH_URL || '').trim().replace(/\/$/, '')
const AUTH_ANON_KEY = String(process.env.AUTH_ANON_KEY || process.env.ANON_KEY || '').trim()
// Local development only: lets `npm run pdf:dev` work without a GoTrue. Never set on a server.
const AUTH_DISABLED = process.env.PDF_AUTH_DISABLED === '1'
const AUTH_CACHE_MS = 60_000
const AUTH_CACHE_MAX = 2_000
const AUTH_TIMEOUT_MS = 5_000

/** Localhost Vite origins may call this service (the owner tests the SPA from localhost). 0 = off. */
const ALLOW_LOCALHOST_ORIGINS = String(process.env.ALLOW_LOCALHOST_ORIGINS ?? '1').trim() !== '0'

/**
 * URL prefixes the rendered page may fetch (besides data:, blob:, about:). Comma-separated.
 * Default: the API's storage objects (signed / public / authenticated file URLs used for logos and images).
 */
const ALLOWED_URL_PREFIXES = (() => {
  const raw = String(process.env.PDF_ALLOWED_URL_PREFIXES || '').trim()
  const apiDomain = String(process.env.API_DOMAIN || '').trim()
  const list = raw
    ? raw.split(',')
    : apiDomain
      ? [`https://${apiDomain}/storage/v1/object/`]
      : []
  return list
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => {
      try {
        const u = new URL(s)
        if (u.protocol !== 'https:' && u.protocol !== 'http:') return ''
        return u.href
      } catch {
        return ''
      }
    })
    .filter(Boolean)
})()

/** @type {import('playwright').Browser | null} */
let browser = null
/** @type {Promise<import('playwright').Browser> | null} */
let browserLaunch = null

async function getBrowser() {
  if (browser && browser.isConnected()) return browser
  if (browserLaunch) return browserLaunch
  // Chromium's sandbox needs user namespaces, which Docker's default seccomp profile (and Ubuntu's AppArmor
  // userns restriction on the host) block for an unprivileged container. Rather than giving the container
  // SYS_ADMIN / a custom seccomp profile, the service runs Chromium without its sandbox, as a non-root user,
  // with all page network access limited by the route allowlist below.
  const sandboxArgs =
    process.env.RAILWAY_ENVIRONMENT || process.env.PLAYWRIGHT_NO_SANDBOX === '1'
      ? ['--no-sandbox']
      : []
  browserLaunch = chromium
    .launch({
      headless: true,
      // Optional override, e.g. a pre-installed Chromium in cloud dev containers.
      executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined,
      args: [
        '--disable-dev-shm-usage',
        '--font-render-hinting=none',
        '--disable-background-networking',
        '--dns-prefetch-disable',
        '--force-webrtc-ip-handling-policy=disable_non_proxied_udp',
        ...sandboxArgs,
      ],
    })
    .then((b) => {
      browser = b
      return b
    })
    .finally(() => {
      browserLaunch = null
    })
  return browserLaunch
}

/** True when the rendered page may load this URL. */
function urlAllowed(rawUrl) {
  const value = String(rawUrl || '')
  if (/^(data|blob):/i.test(value)) return true
  if (/^about:(blank|srcdoc)$/i.test(value)) return true
  let href = ''
  try {
    href = new URL(value).href
  } catch {
    return false
  }
  return ALLOWED_URL_PREFIXES.some((prefix) => href.startsWith(prefix))
}

class HttpError extends Error {
  /** @param {number} status @param {string} message */
  constructor(status, message) {
    super(message)
    this.statusCode = status
  }
}

/**
 * @param {unknown} body
 */
function parseBody(body) {
  if (!body || typeof body !== 'object') throw new HttpError(400, 'JSON body required')
  const o = /** @type {Record<string, unknown>} */ (body)
  const html = typeof o.html === 'string' ? o.html : ''
  if (!html.trim()) throw new HttpError(400, 'html is required')
  if (Buffer.byteLength(html, 'utf8') > MAX_HTML_BYTES) {
    throw new HttpError(413, 'HTML payload too large')
  }
  const filename =
    typeof o.filename === 'string' && o.filename.trim()
      ? o.filename.trim().replace(/[\\/:*?"<>|\r\n]+/g, '_').slice(0, 180)
      : 'document.pdf'
  const formatRaw = typeof o.format === 'string' ? o.format.toLowerCase() : 'a4'
  const format =
    formatRaw === 'letter' || formatRaw === 'legal' || formatRaw === 'a5' || formatRaw === 'a4'
      ? formatRaw
      : 'a4'
  const landscape = o.landscape === true
  /** @type {Record<string, string>} */
  const margin = {}
  const rawMargin = o.margin && typeof o.margin === 'object' ? /** @type {Record<string, unknown>} */ (o.margin) : {}
  for (const side of ['top', 'right', 'bottom', 'left']) {
    const v = rawMargin[side]
    margin[side] = typeof v === 'string' && /^\d{1,4}(\.\d{1,16})?(mm|cm|in|px)?$/.test(v.trim()) ? v.trim() : '0mm'
  }
  return { html, filename, format, landscape, margin }
}

/**
 * @param {string} html
 * @param {{ format: string; landscape: boolean; margin: Record<string, string> }} opts
 * @param {string} requestId
 */
async function htmlToPdf(html, opts, requestId) {
  const b = await getBrowser()
  const context = await b.newContext({
    javaScriptEnabled: true,
    serviceWorkers: 'block',
    acceptDownloads: false,
  })
  let timer
  try {
    const blocked = new Set()
    await context.route('**/*', (route) => {
      const request = route.request()
      const url = request.url()
      if (request.method() === 'GET' && urlAllowed(url)) return route.continue()
      if (blocked.size < 20) blocked.add(url.slice(0, 200))
      return route.abort('blockedbyclient')
    })
    // WebSockets are never needed by a document; close any the page opens.
    if (typeof context.routeWebSocket === 'function') {
      await context.routeWebSocket(/.*/, (ws) => ws.close())
    }
    const page = await context.newPage()
    page.setDefaultTimeout(RENDER_TIMEOUT_MS)
    page.setDefaultNavigationTimeout(RENDER_TIMEOUT_MS)

    const work = (async () => {
      await page.setContent(html, { waitUntil: 'networkidle', timeout: RENDER_TIMEOUT_MS })
      // Extra settle for fonts / late images
      await page.evaluate(async () => {
        if (document.fonts?.ready) await document.fonts.ready
        const imgs = Array.from(document.images)
        await Promise.all(
          imgs.map(
            (img) =>
              img.complete
                ? Promise.resolve()
                : new Promise((resolve) => {
                    img.addEventListener('load', () => resolve(undefined), { once: true })
                    img.addEventListener('error', () => resolve(undefined), { once: true })
                  }),
          ),
        )
      })
      await new Promise((r) => setTimeout(r, 200))

      return page.pdf({
        format: opts.format,
        landscape: opts.landscape,
        printBackground: true,
        preferCSSPageSize: true,
        margin: opts.margin,
      })
    })()
    // The timeout may win the race; the late rejection of `work` (page closed) is expected then.
    work.catch(() => undefined)
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`render timed out after ${RENDER_TIMEOUT_MS} ms`)), RENDER_TIMEOUT_MS)
    })
    const pdf = await Promise.race([work, timeout])
    if (blocked.size) {
      console.warn(`[pdf-service] ${requestId} blocked ${blocked.size} request(s):`, [...blocked].join(' | '))
    }
    return pdf
  } finally {
    clearTimeout(timer)
    await context.close().catch(() => undefined)
  }
}

// ── Concurrency: MAX_CONCURRENCY renders at once, MAX_QUEUE waiting, then 503 ────────────────────
let active = 0
/** @type {Array<() => void>} */
const waiting = []

function acquireSlot() {
  if (active < MAX_CONCURRENCY) {
    active += 1
    return Promise.resolve()
  }
  if (waiting.length >= MAX_QUEUE) return null
  return new Promise((resolve) => {
    waiting.push(() => {
      active += 1
      resolve(undefined)
    })
  })
}

function releaseSlot() {
  active -= 1
  const next = waiting.shift()
  if (next) next()
}

// ── Auth: GoTrue /user with the caller's access token, cached 60 s ───────────────────────────────
/** @type {Map<string, { userId: string; expires: number }>} */
const authCache = new Map()

function bearerToken(req) {
  const auth = String(req.headers.authorization || '')
  if (!auth.toLowerCase().startsWith('bearer ')) return ''
  return auth.slice(7).trim()
}

/** The caller's user id; throws HttpError(401/503). */
async function requireUser(req) {
  if (AUTH_DISABLED) return 'dev'
  if (!AUTH_URL || !AUTH_ANON_KEY) throw new HttpError(503, 'PDF service auth is not configured')
  const token = bearerToken(req)
  if (!token || token.length > 8192) throw new HttpError(401, 'Unauthorized')
  const key = crypto.createHash('sha256').update(token).digest('hex')
  const now = Date.now()
  const hit = authCache.get(key)
  if (hit && hit.expires > now) return hit.userId
  if (hit) authCache.delete(key)

  let res
  try {
    res = await fetch(`${AUTH_URL}/user`, {
      headers: { Authorization: `Bearer ${token}`, apikey: AUTH_ANON_KEY },
      signal: AbortSignal.timeout(AUTH_TIMEOUT_MS),
    })
  } catch (err) {
    console.error('[pdf-service] auth check failed:', err instanceof Error ? err.message : err)
    throw new HttpError(503, 'Authentication service unavailable')
  }
  if (res.status === 401 || res.status === 403) throw new HttpError(401, 'Unauthorized')
  if (!res.ok) {
    console.error(`[pdf-service] auth check returned ${res.status}`)
    throw new HttpError(res.status >= 500 ? 503 : 401, res.status >= 500 ? 'Authentication service unavailable' : 'Unauthorized')
  }
  const user = await res.json().catch(() => null)
  const userId = String(user?.id || '')
  if (!userId) throw new HttpError(401, 'Unauthorized')

  if (authCache.size >= AUTH_CACHE_MAX) {
    for (const [k, v] of authCache) if (v.expires <= now) authCache.delete(k)
    while (authCache.size >= AUTH_CACHE_MAX) authCache.delete(authCache.keys().next().value)
  }
  authCache.set(key, { userId, expires: now + AUTH_CACHE_MS })
  return userId
}

/**
 * @param {http.IncomingMessage} req
 */
function readJson(req) {
  return new Promise((resolve, reject) => {
    const chunks = []
    let size = 0
    let tooLarge = false
    req.on('data', (c) => {
      if (tooLarge) return
      size += c.length
      if (size > MAX_HTML_BYTES + 64_000) {
        tooLarge = true
        chunks.length = 0
        reject(new HttpError(413, 'Request body too large'))
        return
      }
      chunks.push(c)
    })
    req.on('end', () => {
      if (tooLarge) return
      try {
        const raw = Buffer.concat(chunks).toString('utf8')
        resolve(raw ? JSON.parse(raw) : {})
      } catch {
        reject(new HttpError(400, 'Invalid JSON body'))
      }
    })
    req.on('error', reject)
  })
}

/**
 * Mirror the API gateway allowlist (Caddy). Never use *.
 * Optional PDF_CORS_ORIGINS=comma-separated extra origins.
 * @param {string | undefined} origin
 */
function corsOrigin(origin) {
  const o = String(origin || '').trim()
  if (!o) return null
  if (
    o === 'https://www.qengineering.in' ||
    o === 'https://qengineering.in' ||
    (ALLOW_LOCALHOST_ORIGINS && /^https?:\/\/(localhost|127\.0\.0\.1):(3000|517[3-9]|518[0-5])$/.test(o)) ||
    /^https:\/\/frontend-production-[a-z0-9]+\.up\.railway\.app$/.test(o) ||
    /^https:\/\/consultancy-[a-z0-9-]+\.up\.railway\.app$/.test(o)
  ) {
    return o
  }
  const extra = String(process.env.PDF_CORS_ORIGINS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  if (extra.includes(o)) return o
  return null
}

/**
 * @param {http.IncomingMessage} req
 * @param {Record<string, string | number>} [extra]
 */
function corsHeaders(req, extra = {}) {
  const allowed = corsOrigin(req.headers.origin)
  /** @type {Record<string, string | number>} */
  const headers = {
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    Vary: 'Origin',
    'X-Content-Type-Options': 'nosniff',
    ...extra,
  }
  if (allowed) {
    headers['Access-Control-Allow-Origin'] = allowed
    headers['Access-Control-Allow-Credentials'] = 'true'
  }
  return headers
}

/**
 * @param {http.IncomingMessage} req
 * @param {http.ServerResponse} res
 * @param {number} status
 * @param {unknown} payload
 */
function sendJson(req, res, status, payload) {
  const body = JSON.stringify(payload)
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    ...corsHeaders(req),
  })
  res.end(body)
}

/** attachment; filename="ascii"; filename*=UTF-8''utf8 — never throws on non-Latin names. */
function contentDisposition(name) {
  const ascii = name.replace(/[^\x20-\x7e]+/g, '_').replace(/["\\]/g, '')
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || '/', `http://${HOST}:${PORT}`)

  if (req.method === 'OPTIONS') {
    const allowed = corsOrigin(req.headers.origin)
    if (!allowed && req.headers.origin) {
      res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' })
      res.end('Origin not allowed')
      return
    }
    res.writeHead(204, corsHeaders(req, { 'Access-Control-Max-Age': 600 }))
    res.end()
    return
  }

  if (req.method === 'GET' && url.pathname === '/health') {
    sendJson(req, res, 200, { ok: true, service: 'playwright-pdf' })
    return
  }

  if (req.method === 'POST' && (url.pathname === '/pdf' || url.pathname === '/api/pdf')) {
    const requestId = crypto.randomUUID()
    let slotHeld = false
    try {
      const userId = await requireUser(req)
      const json = await readJson(req)
      const opts = parseBody(json)
      const slot = acquireSlot()
      if (!slot) throw new HttpError(503, 'PDF service is busy. Try again in a minute.')
      await slot
      slotHeld = true
      const started = Date.now()
      const pdf = await htmlToPdf(opts.html, opts, requestId)
      console.log(
        `[pdf-service] ${requestId} user=${userId} html=${Buffer.byteLength(opts.html, 'utf8')}B pdf=${pdf.length}B ${Date.now() - started}ms`,
      )
      const outName = opts.filename.toLowerCase().endsWith('.pdf')
        ? opts.filename
        : `${opts.filename}.pdf`
      res.writeHead(200, {
        'Content-Type': 'application/pdf',
        'Content-Disposition': contentDisposition(outName),
        'Content-Length': pdf.length,
        'Cache-Control': 'no-store',
        ...corsHeaders(req),
      })
      res.end(pdf)
    } catch (err) {
      const status = err instanceof HttpError ? err.statusCode : 500
      if (status >= 500 && !(err instanceof HttpError)) {
        console.error(`[pdf-service] ${requestId} render failed:`, err instanceof Error ? err.stack || err.message : err)
      } else if (status !== 401) {
        console.warn(`[pdf-service] ${requestId} ${status}: ${err instanceof Error ? err.message : err}`)
      }
      const message =
        err instanceof HttpError ? err.message : 'PDF generation failed. Try again, or contact the administrator.'
      if (!res.headersSent) sendJson(req, res, status, { error: message, requestId })
      else res.destroy()
      // Drain an unread body so the socket can be reused / closed cleanly.
      if (!req.complete) req.resume()
    } finally {
      if (slotHeld) releaseSlot()
    }
    return
  }

  sendJson(req, res, 404, { error: 'Not found' })
})

server.listen(PORT, HOST, () => {
  console.log(`[pdf-service] Playwright PDF listening on http://${HOST}:${PORT}`)
  console.log(`[pdf-service] POST /pdf  |  GET /health`)
  if (AUTH_DISABLED) console.warn('[pdf-service] PDF_AUTH_DISABLED=1 — no sign-in check (local development only)')
  else if (!AUTH_URL || !AUTH_ANON_KEY) console.warn('[pdf-service] AUTH_URL / AUTH_ANON_KEY not set — /pdf answers 503')
  console.log(`[pdf-service] page may load: data:, blob:, about:${ALLOWED_URL_PREFIXES.length ? `, ${ALLOWED_URL_PREFIXES.join(', ')}` : ''}`)
})

async function shutdown() {
  console.log('[pdf-service] shutting down…')
  server.close()
  if (browser) await browser.close().catch(() => undefined)
  process.exit(0)
}

process.on('SIGINT', () => void shutdown())
process.on('SIGTERM', () => void shutdown())
