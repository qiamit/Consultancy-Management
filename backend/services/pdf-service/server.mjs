/**
 * Local Playwright PDF service — renders HTML with Chromium (same engine as Chrome print).
 * POST /pdf  JSON: { html, filename?, format?, landscape?, margin? }
 * GET  /health
 */
import http from 'node:http'
import { chromium } from 'playwright'

const PORT = Number(process.env.PORT || process.env.PDF_SERVICE_PORT || 3847)
const HOST = process.env.PDF_SERVICE_HOST || '0.0.0.0'
const MAX_HTML_BYTES = Number(process.env.PDF_MAX_HTML_BYTES || 12_000_000)

/** @type {import('playwright').Browser | null} */
let browser = null

async function getBrowser() {
  if (browser && browser.isConnected()) return browser
  const sandboxArgs =
    process.env.RAILWAY_ENVIRONMENT || process.env.PLAYWRIGHT_NO_SANDBOX === '1'
      ? ['--no-sandbox']
      : []
  browser = await chromium.launch({
    headless: true,
    args: ['--disable-dev-shm-usage', '--font-render-hinting=none', ...sandboxArgs],
  })
  return browser
}

/**
 * @param {unknown} body
 */
function parseBody(body) {
  if (!body || typeof body !== 'object') throw new Error('JSON body required')
  const o = /** @type {Record<string, unknown>} */ (body)
  const html = typeof o.html === 'string' ? o.html : ''
  if (!html.trim()) throw new Error('html is required')
  if (Buffer.byteLength(html, 'utf8') > MAX_HTML_BYTES) {
    throw new Error('HTML payload too large')
  }
  const filename =
    typeof o.filename === 'string' && o.filename.trim()
      ? o.filename.trim().replace(/[\\/:*?"<>|]+/g, '_')
      : 'document.pdf'
  const formatRaw = typeof o.format === 'string' ? o.format.toLowerCase() : 'a4'
  const format =
    formatRaw === 'letter' || formatRaw === 'legal' || formatRaw === 'a5' || formatRaw === 'a4'
      ? formatRaw
      : 'a4'
  const landscape = o.landscape === true
  const margin =
    o.margin && typeof o.margin === 'object'
      ? /** @type {Record<string, string>} */ (o.margin)
      : { top: '0mm', right: '0mm', bottom: '0mm', left: '0mm' }
  return { html, filename, format, landscape, margin }
}

/**
 * @param {string} html
 * @param {{ format: string; landscape: boolean; margin: Record<string, string> }} opts
 */
async function htmlToPdf(html, opts) {
  const b = await getBrowser()
  const page = await b.newPage()
  try {
    await page.setContent(html, {
      waitUntil: 'networkidle',
      timeout: 60_000,
    })
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

    const pdf = await page.pdf({
      format: opts.format,
      landscape: opts.landscape,
      printBackground: true,
      preferCSSPageSize: true,
      margin: {
        top: opts.margin.top ?? '0mm',
        right: opts.margin.right ?? '0mm',
        bottom: opts.margin.bottom ?? '0mm',
        left: opts.margin.left ?? '0mm',
      },
    })
    return pdf
  } finally {
    await page.close().catch(() => undefined)
  }
}

/**
 * @param {http.IncomingMessage} req
 */
function readJson(req) {
  return new Promise((resolve, reject) => {
    const chunks = []
    let size = 0
    req.on('data', (c) => {
      size += c.length
      if (size > MAX_HTML_BYTES + 64_000) {
        reject(new Error('Request body too large'))
        req.destroy()
        return
      }
      chunks.push(c)
    })
    req.on('end', () => {
      try {
        const raw = Buffer.concat(chunks).toString('utf8')
        resolve(raw ? JSON.parse(raw) : {})
      } catch {
        reject(new Error('Invalid JSON body'))
      }
    })
    req.on('error', reject)
  })
}

/**
 * @param {http.ServerResponse} res
 * @param {number} status
 * @param {unknown} payload
 */
function sendJson(res, status, payload) {
  const body = JSON.stringify(payload)
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  })
  res.end(body)
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || '/', `http://${HOST}:${PORT}`)

  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    })
    res.end()
    return
  }

  if (req.method === 'GET' && url.pathname === '/health') {
    sendJson(res, 200, { ok: true, service: 'playwright-pdf' })
    return
  }

  if (req.method === 'POST' && (url.pathname === '/pdf' || url.pathname === '/api/pdf')) {
    try {
      const json = await readJson(req)
      const opts = parseBody(json)
      const pdf = await htmlToPdf(opts.html, opts)
      const outName = opts.filename.toLowerCase().endsWith('.pdf')
        ? opts.filename
        : `${opts.filename}.pdf`
      res.writeHead(200, {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${outName.replace(/"/g, '')}"`,
        'Content-Length': pdf.length,
        'Access-Control-Allow-Origin': '*',
      })
      res.end(pdf)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'PDF generation failed'
      console.error('[pdf-service]', message)
      sendJson(res, 500, { error: message })
    }
    return
  }

  sendJson(res, 404, { error: 'Not found' })
})

server.listen(PORT, HOST, () => {
  console.log(`[pdf-service] Playwright PDF listening on http://${HOST}:${PORT}`)
  console.log(`[pdf-service] POST /pdf  |  GET /health`)
})

async function shutdown() {
  console.log('[pdf-service] shutting down…')
  server.close()
  if (browser) await browser.close().catch(() => undefined)
  process.exit(0)
}

process.on('SIGINT', () => void shutdown())
process.on('SIGTERM', () => void shutdown())
