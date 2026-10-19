import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { createQiAssistantHandler } from './qiAssistant.mjs'

const PORT = Number(process.env.PORT || 8080)
const MANAK_INBOX_DIR = path.join('/tmp', 'qe-manak-pdf-inbox')
const MANAK_TTL_MS = 45 * 60 * 1000
const REST_URL = (process.env.REST_URL || 'http://rest.railway.internal:3000').replace(/\/$/, '')
const AUTH_URL = (process.env.AUTH_URL || 'http://auth.railway.internal:9999').replace(/\/$/, '')
const SERVICE_ROLE_KEY = process.env.SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || ''
const RESEND_API_KEY = process.env.RESEND_API_KEY || ''
const RESEND_API_URL = process.env.RESEND_API_URL || 'https://api.resend.com/emails' // override only for local tests
const EMAIL_FROM =
  process.env.RESEND_FROM_EMAIL || process.env.MRM_EMAIL_FROM || 'Q Engineering <info@qengineering.in>'

// Same origins as the gateway Caddyfile, which strips this service's CORS headers and sets its
// own. Kept here too so a direct call to this service never gets "*" (Batch D L7).
const CORS_ORIGIN_PATTERNS = [
  /^https:\/\/(www\.)?qengineering\.in$/,
  /^https?:\/\/(localhost|127\.0\.0\.1):(3000|517[3-9]|518[0-5])$/,
  /^https:\/\/frontend-production-[a-z0-9]+\.up\.railway\.app$/,
  /^https:\/\/consultancy-[a-z0-9-]+\.up\.railway\.app$/,
]

/** The request Origin when it is allowed, else the production site (the browser then blocks it). */
function corsOriginFor(origin) {
  const value = String(origin ?? '').trim()
  return CORS_ORIGIN_PATTERNS.some((re) => re.test(value)) ? value : 'https://qengineering.in'
}

function corsHeaders(res, methods = 'GET, POST, OPTIONS') {
  return {
    'Access-Control-Allow-Origin': res.qeCorsOrigin || 'https://qengineering.in',
    'Access-Control-Allow-Methods': methods,
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, apikey, X-User-Jwt, x-user-jwt, X-Client-Info',
    Vary: 'Origin',
  }
}

/** Admin = Access role 'admin' only (decision #45; matches public.app_is_admin()). */
function isAdminRole(role) {
  return String(role ?? '').trim().toLowerCase() === 'admin'
}

function corsJson(res, status, body) {
  const payload = JSON.stringify(body)
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(payload),
    ...corsHeaders(res),
  })
  res.end(payload)
}

function json(res, status, body) {
  const payload = JSON.stringify(body)
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(payload),
  })
  res.end(payload)
}

const MANAK_BODY_LIMIT = 1024 * 1024
const MANAK_CHUNK_MAX = 200_000 // the extension sends 160 000 base64 characters per chunk
const MANAK_CHUNKS_MAX = 300 // about 45 MB of PDF
const MANAK_TOKEN_RE = /^[\w-]{32,128}$/
const MANAK_PDF_DIR = path.join('/tmp', 'qe-manak-pdfs')

function manakSafeSampleId(value) {
  return String(value || 'sample')
    .replace(/[^\w.\-]+/g, '-')
    .slice(0, 80)
}

/** Drops inbox entries and assembled PDFs older than the TTL (they only bridge one Test Request hand-off). */
function sweepManakInbox() {
  const cutoff = Date.now() - MANAK_TTL_MS
  for (const dir of [MANAK_INBOX_DIR, MANAK_PDF_DIR]) {
    try {
      if (!fs.existsSync(dir)) continue
      for (const name of fs.readdirSync(dir)) {
        const full = path.join(dir, name)
        try {
          if (fs.statSync(full).mtimeMs < cutoff) fs.rmSync(full, { recursive: true, force: true })
        } catch {
          /* ignore */
        }
      }
    } catch {
      /* ignore */
    }
  }
}

function manakFile(token) {
  const safe = String(token || '')
    .replace(/[^\w.-]+/g, '_')
    .slice(0, 80)
  return path.join(MANAK_INBOX_DIR, `${safe}.json`)
}

function readManakEntry(token) {
  try {
    if (!fs.existsSync(MANAK_INBOX_DIR)) fs.mkdirSync(MANAK_INBOX_DIR, { recursive: true })
    const raw = fs.readFileSync(manakFile(token), 'utf8')
    const entry = JSON.parse(raw)
    if (!entry || entry.token !== token) return null
    if (Date.now() - Number(entry.createdAt || 0) > MANAK_TTL_MS) return null
    return entry
  } catch {
    return null
  }
}

function writeManakEntry(entry) {
  if (!fs.existsSync(MANAK_INBOX_DIR)) fs.mkdirSync(MANAK_INBOX_DIR, { recursive: true })
  fs.writeFileSync(manakFile(entry.token), JSON.stringify(entry))
}

async function handleManakPdf(req, res) {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, corsHeaders(res))
    res.end()
    return
  }

  const url = new URL(req.url || '/', 'http://functions.local')

  if (req.method === 'GET') {
    const token = String(url.searchParams.get('token') || '').trim()
    if (!token) return corsJson(res, 400, { ready: false, error: 'token required' })
    let caller
    try {
      caller = await requireUser(req)
    } catch (err) {
      return corsJson(res, Number(err?.statusCode) || 401, { ready: false, error: 'Unauthorized' })
    }
    const entry = readManakEntry(token)
    if (!entry) return corsJson(res, 200, { ready: false })
    // Only the user who opened the Test Request may collect the PDF.
    if (!entry.userId || entry.userId !== String(caller?.id ?? '')) {
      return corsJson(res, 403, { ready: false, error: 'Forbidden' })
    }
    if (!entry.ref) return corsJson(res, 200, { ready: false, sampleId: entry.sampleId })
    let pdfBase64 = ''
    try {
      const sampleId = manakSafeSampleId(entry.sampleId)
      const pdfName = String(entry.pdfName || 'Test_Request.pdf').replace(/[^\w.\-]+/g, '_')
      const pdfPath = path.join(MANAK_PDF_DIR, sampleId, pdfName)
      if (fs.existsSync(pdfPath)) {
        pdfBase64 = fs.readFileSync(pdfPath).toString('base64')
      }
    } catch {
      /* ignore missing file */
    }
    return corsJson(res, 200, {
      ready: true,
      sampleId: entry.sampleId,
      sample_code: entry.sample_code || '',
      ref: entry.ref,
      pdfName: entry.pdfName || 'Test_Request.pdf',
      pdfBase64,
    })
  }

  if (req.method !== 'POST') {
    return corsJson(res, 405, { ok: false, error: 'Method not allowed' })
  }

  let body = {}
  try {
    body = await readBody(req, MANAK_BODY_LIMIT)
  } catch (err) {
    const status = Number(err?.statusCode) === 413 ? 413 : 400
    return corsJson(res, status, { ok: false, error: status === 413 ? 'Request too large' : 'Invalid JSON' })
  }

  const action = String(body.action || '').trim()
  const token = String(body.token || '').trim()
  if (!token) return corsJson(res, 400, { ok: false, error: 'token required' })
  if (!MANAK_TOKEN_RE.test(token)) return corsJson(res, 400, { ok: false, error: 'Invalid token' })

  if (action === 'register') {
    let caller
    try {
      caller = await requireUser(req)
    } catch (err) {
      return corsJson(res, Number(err?.statusCode) || 401, { ok: false, error: 'Unauthorized' })
    }
    const sampleId = String(body.sampleId || '').trim()
    if (!sampleId) return corsJson(res, 400, { ok: false, error: 'sampleId required' })
    sweepManakInbox()
    writeManakEntry({
      token,
      userId: String(caller?.id ?? ''),
      sampleId,
      createdAt: Date.now(),
      chunks: [],
      chunkTotal: 0,
    })
    return corsJson(res, 200, { ok: true })
  }

  if (action === 'chunk') {
    const entry = readManakEntry(token)
    if (!entry) {
      return corsJson(res, 404, {
        ok: false,
        error: 'Unknown token. Open Test Request from the app again.',
      })
    }
    const total = Number(body.total)
    const index = Number(body.index)
    const chunk = String(body.chunk || '')
    if (!Number.isInteger(total) || total < 1 || total > MANAK_CHUNKS_MAX) {
      return corsJson(res, 400, { ok: false, error: 'Invalid chunk total' })
    }
    if (!Number.isInteger(index) || index < 0 || index >= total) {
      return corsJson(res, 400, { ok: false, error: 'Invalid chunk index' })
    }
    if (!chunk || chunk.length > MANAK_CHUNK_MAX || !/^[A-Za-z0-9+/=]+$/.test(chunk)) {
      return corsJson(res, 400, { ok: false, error: 'Invalid chunk' })
    }
    if (entry.chunkTotal && entry.chunkTotal !== total) {
      return corsJson(res, 400, { ok: false, error: 'Chunk total changed' })
    }
    entry.chunkTotal = total
    entry.chunks[index] = chunk
    entry.createdAt = Date.now()
    writeManakEntry(entry)
    return corsJson(res, 200, { ok: true })
  }

  if (action === 'finish') {
    const entry = readManakEntry(token)
    if (!entry) return corsJson(res, 404, { ok: false, error: 'Unknown token.' })
    const filled = entry.chunks.filter((part) => typeof part === 'string').length
    if (!entry.chunkTotal || filled < entry.chunkTotal) {
      return corsJson(res, 400, { ok: false, error: 'PDF chunks are incomplete.' })
    }
    const pdfName = String(body.pdfName || entry.pdfName || 'Test_Request.pdf').replace(
      /[^\w.\-]+/g,
      '_',
    )
    // Always the sample the app registered, never one from the (unauthenticated) request body.
    const sampleId = manakSafeSampleId(entry.sampleId)
    const ref = `osl-sample-test-requests/${sampleId}/${Date.now()}-${pdfName.slice(0, 120)}`
    // Persist assembled PDF bytes under /tmp until Storage upload is wired for OSL paths.
    try {
      const bin = Buffer.from(entry.chunks.join(''), 'base64')
      const outDir = path.join(MANAK_PDF_DIR, sampleId)
      fs.mkdirSync(outDir, { recursive: true })
      fs.writeFileSync(path.join(outDir, pdfName), bin)
    } catch (err) {
      return corsJson(res, 500, {
        ok: false,
        error: err instanceof Error ? err.message : 'PDF write failed',
      })
    }
    entry.ref = ref
    entry.pdfName = pdfName
    entry.sample_code = String(body.sample_code || entry.sample_code || '')
    entry.chunks = []
    entry.createdAt = Date.now()
    writeManakEntry(entry)
    return corsJson(res, 200, { ok: true, ref, pdfName })
  }

  return corsJson(res, 400, { ok: false, error: 'Unknown action' })
}

const handleQiAssistant = createQiAssistantHandler({
  requireUser,
  rest,
  readBody,
  corsJson,
})

const BODY_LIMIT_DEFAULT = 25 * 1024 * 1024

/** JSON body, refused with 413 once it passes maxBytes (the request is not buffered further). */
function readBody(req, maxBytes = BODY_LIMIT_DEFAULT) {
  return new Promise((resolve, reject) => {
    const chunks = []
    let size = 0
    let tooLarge = false
    req.on('data', (c) => {
      if (tooLarge) return
      size += c.length
      if (size > maxBytes) {
        tooLarge = true
        chunks.length = 0
        const err = new Error('Request body is too large')
        err.statusCode = 413
        reject(err)
        return
      }
      chunks.push(c)
    })
    req.on('end', () => {
      if (tooLarge) return
      const raw = Buffer.concat(chunks).toString('utf8')
      if (!raw) return resolve({})
      try {
        resolve(JSON.parse(raw))
      } catch {
        reject(new Error('Invalid JSON body'))
      }
    })
    req.on('error', reject)
  })
}

function callerJwt(req) {
  const userJwt = String(req.headers['x-user-jwt'] || '').trim()
  if (userJwt) return userJwt
  const auth = String(req.headers.authorization || '')
  if (auth.toLowerCase().startsWith('bearer ')) return auth.slice(7).trim()
  return ''
}

async function rest(path, init = {}) {
  const res = await fetch(`${REST_URL}${path}`, {
    ...init,
    headers: {
      apikey: SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
      ...(init.headers || {}),
    },
  })
  const text = await res.text()
  let data = null
  try {
    data = text ? JSON.parse(text) : null
  } catch {
    data = text
  }
  if (!res.ok) {
    const message =
      data && typeof data === 'object' && 'message' in data
        ? String(data.message)
        : `REST ${res.status}`
    throw new Error(message)
  }
  return data
}

async function requireUser(req) {
  const token = callerJwt(req)
  if (!token) {
    const err = new Error('Missing caller session')
    err.statusCode = 401
    throw err
  }
  const res = await fetch(`${AUTH_URL}/user`, {
    headers: { Authorization: `Bearer ${token}`, apikey: SERVICE_ROLE_KEY },
  })
  if (!res.ok) {
    const err = new Error('Invalid caller session')
    err.statusCode = 401
    throw err
  }
  return res.json()
}

async function requireFullAccess(req) {
  const caller = await requireUser(req)
  const callerId = String(caller?.id ?? '')
  let role = ''
  let status = ''
  let found = false
  try {
    const profiles = await rest(
      `/user_profiles?id=eq.${encodeURIComponent(callerId)}&select=role,status`,
    )
    const row = Array.isArray(profiles) ? profiles[0] : null
    if (row) {
      found = true
      role = String(row.role ?? '')
      status = row.status == null ? '' : String(row.status)
    }
  } catch {
    const err = new Error('Forbidden')
    err.statusCode = 403
    throw err
  }
  const statusNorm = status.trim().toLowerCase()
  const active = found && (statusNorm === '' || statusNorm === 'active')
  if (!active || !isAdminRole(role)) {
    const err = new Error('Forbidden')
    err.statusCode = 403
    throw err
  }
  return caller
}

async function authAdmin(path, init = {}) {
  const res = await fetch(`${AUTH_URL}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      apikey: SERVICE_ROLE_KEY,
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
  })
  const text = await res.text()
  let data = null
  try {
    data = text ? JSON.parse(text) : null
  } catch {
    data = text
  }
  return { ok: res.ok, status: res.status, data }
}

function authErrorMessage(payload, fallback) {
  if (payload && typeof payload === 'object') {
    if ('msg' in payload && payload.msg) return String(payload.msg)
    if ('message' in payload && payload.message) return String(payload.message)
    if ('error_description' in payload && payload.error_description) {
      return String(payload.error_description)
    }
    if ('error' in payload && payload.error) return String(payload.error)
  }
  return fallback
}

function normalizeEmailList(raw) {
  if (raw == null || raw === '') return []
  const list = Array.isArray(raw)
    ? raw
    : String(raw)
        .split(/[,;\s]+/)
        .map((s) => s.trim())
        .filter(Boolean)
  return list.map((s) => String(s).trim()).filter(Boolean)
}

async function sendResendEmail({ to, subject, html, text, attachments, cc, bcc }) {
  if (!RESEND_API_KEY) {
    const err = new Error('Email service not configured. Set RESEND_API_KEY on the functions service.')
    err.statusCode = 503
    throw err
  }
  const toList = normalizeEmailList(to)
  const ccList = normalizeEmailList(cc)
  const bccList = normalizeEmailList(bcc)
  if (toList.length === 0) {
    const err = new Error('At least one recipient (to) is required')
    err.statusCode = 400
    throw err
  }
  const payloadBody = {
    from: EMAIL_FROM,
    to: toList,
    subject,
    html,
    ...(text ? { text } : {}),
    ...(ccList.length > 0 ? { cc: ccList } : {}),
    ...(bccList.length > 0 ? { bcc: bccList } : {}),
    ...(Array.isArray(attachments) && attachments.length > 0 ? { attachments } : {}),
  }
  const res = await fetch(RESEND_API_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payloadBody),
  })
  const payload = await res.json().catch(() => ({}))
  if (!res.ok) {
    const message =
      payload && typeof payload === 'object' && 'message' in payload
        ? String(payload.message)
        : `Resend error ${res.status}`
    const err = new Error(message)
    err.statusCode = 400
    throw err
  }
  return payload
}

function normalizeAttachments(raw) {
  if (!Array.isArray(raw) || raw.length === 0) return []
  if (raw.length > 4) {
    const err = new Error('Too many email attachments')
    err.statusCode = 400
    throw err
  }
  return raw.map((item) => {
    const filename = String(item?.filename ?? '').trim()
    const content = String(item?.content ?? '').replace(/\s+/g, '')
    const contentType = String(item?.contentType ?? item?.content_type ?? '').trim()
    if (!filename || !content) {
      const err = new Error('Each attachment needs filename and content')
      err.statusCode = 400
      throw err
    }
    if (content.length > 12_000_000) {
      const err = new Error(`Attachment ${filename} is too large`)
      err.statusCode = 400
      throw err
    }
    return {
      filename,
      content,
      ...(contentType ? { content_type: contentType } : {}),
    }
  })
}

const EMAIL_BODY_LIMIT = 55 * 1024 * 1024 // 4 attachments x 12 MB of base64, plus the HTML
const EMAIL_MAX_RECIPIENTS = 20
const EMAIL_LIMIT_HOUR = 60
const EMAIL_LIMIT_DAY = 300

/** Module path the email is sent from, e.g. /finance/sale/invoice. '' when missing or malformed. */
function normalizeSourcePath(raw) {
  const value = String(raw ?? '').trim().split(/[?#]/)[0].replace(/\/+$/, '')
  if (!value.startsWith('/') || value.length > 200 || !/^[\w\-/]+$/.test(value)) return ''
  return value
}

/** The caller's own Module Access level for a path (RLS-side app_module_level, run with their JWT). */
async function callerModuleLevel(req, modulePath) {
  const res = await fetch(`${REST_URL}/rpc/app_module_level`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${callerJwt(req)}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ p_path: modulePath }),
  })
  if (!res.ok) return 'none'
  const level = await res.json().catch(() => 'none')
  return typeof level === 'string' ? level : 'none'
}

/** email_send_log row. Best effort: a failed log write never changes the response. */
async function logEmail(entry) {
  try {
    await rest('/email_send_log', {
      method: 'POST',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({
        user_id: entry.userId || null,
        source_path: entry.sourcePath || null,
        to_addrs: entry.to ?? [],
        cc_addrs: entry.cc ?? [],
        bcc_addrs: entry.bcc ?? [],
        subject: String(entry.subject ?? '').slice(0, 500),
        attachment_count: entry.attachmentCount ?? 0,
        attachment_bytes: entry.attachmentBytes ?? 0,
        status: entry.status,
        error: entry.error ? String(entry.error).slice(0, 1000) : null,
        resend_id: entry.resendId ?? null,
      }),
    })
  } catch (err) {
    console.error('[email] email_send_log write failed', err)
  }
}

async function handleSendEmail(req, res) {
  const caller = await requireUser(req)
  const body = await readBody(req, EMAIL_BODY_LIMIT)
  const userId = String(caller?.id ?? '')
  const to = normalizeEmailList(body.to)
  const cc = normalizeEmailList(body.cc)
  const bcc = normalizeEmailList(body.bcc)
  const subject = String(body.subject ?? '').trim()
  const html = String(body.html ?? body.text ?? '').trim()
  const sourcePath = normalizeSourcePath(body.source_path)
  if (to.length === 0 || !subject || !html) {
    json(res, 400, { error: 'to, subject, and html are required' })
    return
  }
  const attachments = normalizeAttachments(body.attachments)
  const logBase = {
    userId,
    sourcePath,
    to,
    cc,
    bcc,
    subject,
    attachmentCount: attachments.length,
    // base64 length -> approximate decoded bytes
    attachmentBytes: attachments.reduce((sum, a) => sum + Math.floor((a.content.length * 3) / 4), 0),
  }
  const block = async (status, error) => {
    await logEmail({ ...logBase, status: 'blocked', error })
    json(res, status, { error })
  }

  if (!sourcePath) {
    await block(400, 'Email must be sent from an app module. Reload the page and try again.')
    return
  }
  if ((await callerModuleLevel(req, sourcePath)) !== 'edit') {
    await block(403, 'You need edit access to this module to send email from it.')
    return
  }
  if (to.length + cc.length + bcc.length > EMAIL_MAX_RECIPIENTS) {
    await block(400, `An email can have at most ${EMAIL_MAX_RECIPIENTS} recipients (to, cc and bcc together).`)
    return
  }
  let quota = { hour: 0, day: 0 }
  try {
    quota = (await rest('/rpc/app_email_quota', {
      method: 'POST',
      body: JSON.stringify({ p_user_id: userId }),
    })) ?? quota
  } catch (err) {
    console.error('[email] quota check failed', err)
    json(res, 503, { error: 'Email limit check is unavailable. Try again shortly.' })
    return
  }
  if (Number(quota.hour) >= EMAIL_LIMIT_HOUR) {
    await block(429, `Email limit reached: ${EMAIL_LIMIT_HOUR} emails per hour. Try again later.`)
    return
  }
  if (Number(quota.day) >= EMAIL_LIMIT_DAY) {
    await block(429, `Email limit reached: ${EMAIL_LIMIT_DAY} emails per day. Try again tomorrow.`)
    return
  }

  let sent
  try {
    sent = await sendResendEmail({ to, cc, bcc, subject, html, text: body.text, attachments })
  } catch (err) {
    await logEmail({ ...logBase, status: 'failed', error: err instanceof Error ? err.message : 'Send failed' })
    throw err
  }
  await logEmail({ ...logBase, status: 'sent', resendId: sent.id ?? null })
  json(res, 200, { ok: true, id: sent.id ?? null })
}

const ACCESS_ROLES = new Set(['admin', 'staff', 'viewer'])
const PASSWORD_MIN = 8
const PASSWORD_MAX = 72 // bcrypt ignores anything longer

/** Returns an error message, or '' when the password is acceptable. Passwords are never trimmed. */
function passwordProblem(password) {
  if (typeof password !== 'string' || !password) return 'Password is required'
  if (password.length < PASSWORD_MIN) return `Password must be at least ${PASSWORD_MIN} characters`
  if (password.length > PASSWORD_MAX) return `Password must be at most ${PASSWORD_MAX} characters`
  if (password.trim() !== password) return 'Password cannot start or end with a space'
  return ''
}

/** Service-role REST call that records the calling admin as audit_log.changed_by. */
function restAs(actorId, path, init = {}) {
  return rest(path, { ...init, headers: { 'X-Actor-Id': actorId, ...(init.headers || {}) } })
}

/** audit_log row for a GoTrue-side event. Best effort: a failed audit write never undoes the action. */
async function auditUserEvent(actorId, userId, action, event, data = {}) {
  try {
    await rest('/rpc/app_audit_user_event', {
      method: 'POST',
      body: JSON.stringify({
        p_actor: actorId,
        p_user_id: userId,
        p_action: action,
        p_event: event,
        p_data: data,
      }),
    })
  } catch (err) {
    console.error('[audit] app_audit_user_event failed', event, userId, err)
  }
}

async function fetchProfile(userId) {
  const rows = await rest(
    `/user_profiles?id=eq.${encodeURIComponent(userId)}&select=id,email,full_name,designation,role,status`,
  )
  return Array.isArray(rows) ? rows[0] ?? null : null
}

function isActiveStatus(status) {
  const s = String(status ?? '').trim().toLowerCase()
  return s === '' || s === 'active'
}

async function handleCreateUser(req, res) {
  const caller = await requireFullAccess(req)
  const body = await readBody(req)

  const email = String(body.email ?? '').trim()
  const password = typeof body.password === 'string' ? body.password : ''
  if (!email || !password) {
    json(res, 400, { error: 'email and password are required' })
    return
  }
  const problem = passwordProblem(password)
  if (problem) {
    json(res, 400, { error: problem })
    return
  }
  const role = String(body.role ?? 'staff').trim().toLowerCase()
  if (!ACCESS_ROLES.has(role)) {
    json(res, 400, { error: 'role must be admin, staff or viewer' })
    return
  }

  const mobileRaw = String(body.mobile ?? '')
  const fullName = String(body.full_name ?? '')
  const designation = String(body.designation ?? '')
  const departmentName = String(body.department_name ?? '')
  const division = String(body.division ?? '')
  const status = String(body.status ?? 'Active')
  const callerId = String(caller?.id ?? '')

  const createResult = await authAdmin('/admin/users', {
    method: 'POST',
    body: JSON.stringify({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        full_name: fullName,
        mobile: mobileRaw,
        designation,
        department_name: departmentName,
        division,
        status,
        created_by: callerId,
      },
    }),
  })

  if (!createResult.ok) {
    json(res, 400, {
      error: authErrorMessage(createResult.data, `Auth ${createResult.status}`),
    })
    return
  }

  const createdUser = createResult.data?.user ?? createResult.data
  const userId = String(createdUser?.id ?? '')
  if (userId) {
    try {
      await restAs(callerId, '/user_profiles?on_conflict=id', {
        method: 'POST',
        headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
        body: JSON.stringify({
          id: userId,
          email,
          full_name: fullName,
          mobile: mobileRaw,
          designation,
          department_name: departmentName,
          division,
          status,
          role,
          must_change_password: true,
        }),
      })
    } catch (err) {
      // No login without a profile: undo the GoTrue user.
      await authAdmin(`/admin/users/${encodeURIComponent(userId)}`, { method: 'DELETE' })
      json(res, 400, { error: err instanceof Error ? err.message : 'Profile upsert failed' })
      return
    }
    await auditUserEvent(callerId, userId, 'I', 'user_created', { email, role })
  }

  json(res, 200, { user: createdUser })
}

async function handleSetUserPassword(req, res) {
  const caller = await requireFullAccess(req)
  const body = await readBody(req)
  const userId = String(body.user_id ?? '').trim()
  const password = typeof body.password === 'string' ? body.password : ''
  const callerId = String(caller?.id ?? '')

  if (!userId) {
    json(res, 400, { error: 'user_id is required' })
    return
  }
  const problem = passwordProblem(password)
  if (problem) {
    json(res, 400, { error: problem })
    return
  }
  const isSelf = userId === callerId
  const mustChange = isSelf ? false : body.must_change !== false

  const profile = await fetchProfile(userId)
  if (!profile) {
    json(res, 404, { error: 'User not found' })
    return
  }

  const updateResult = await authAdmin(`/admin/users/${encodeURIComponent(userId)}`, {
    method: 'PUT',
    body: JSON.stringify({ password }),
  })
  if (!updateResult.ok) {
    json(res, 400, {
      error: authErrorMessage(updateResult.data, `Auth ${updateResult.status}`),
    })
    return
  }

  try {
    await restAs(callerId, `/user_profiles?id=eq.${encodeURIComponent(userId)}`, {
      method: 'PATCH',
      body: JSON.stringify({ must_change_password: mustChange }),
    })
  } catch (err) {
    console.error('[set-user-password] must_change_password update failed', userId, err)
  }

  let sessionsRevoked = 0
  if (!isSelf) {
    try {
      const revoked = await rest('/rpc/app_revoke_user_sessions', {
        method: 'POST',
        body: JSON.stringify({ p_user_id: userId }),
      })
      sessionsRevoked = Number(revoked) || 0
    } catch (err) {
      console.error('[set-user-password] session revoke failed', userId, err)
    }
  }

  await auditUserEvent(callerId, userId, 'U', 'password_set_by_admin', {
    email: profile.email ?? '',
    must_change_password: mustChange,
    sessions_revoked: sessionsRevoked,
  })

  json(res, 200, { ok: true, must_change_password: mustChange })
}

/** Postgres FK violation text GoTrue passes through when the profile is still referenced. */
function looksLikeReferenceError(message) {
  const m = String(message || '').toLowerCase()
  return m.includes('foreign key') || m.includes('violates') || m.includes('database error deleting user')
}

async function handleDeleteUser(req, res) {
  const caller = await requireFullAccess(req)
  const body = await readBody(req)
  const userId = String(body.user_id ?? '').trim()

  if (!userId) {
    json(res, 400, { error: 'user_id is required' })
    return
  }

  const callerId = String(caller?.id ?? '')
  if (userId === callerId) {
    json(res, 400, { error: 'You cannot delete your own account.' })
    return
  }

  const profile = await fetchProfile(userId)
  if (profile && isActiveStatus(profile.status)) {
    json(res, 400, { error: 'Deactivate the user before deleting them permanently.' })
    return
  }

  // GoTrue first: auth.users -> user_profiles is ON DELETE CASCADE, so the profile goes in the
  // same transaction. If anything still references the profile (or it is the last admin), the
  // whole delete fails and the login and profile both stay as they were.
  const deleteResult = await authAdmin(`/admin/users/${encodeURIComponent(userId)}`, {
    method: 'DELETE',
  })
  if (!deleteResult.ok && deleteResult.status !== 404) {
    const message = authErrorMessage(deleteResult.data, `Auth ${deleteResult.status}`)
    json(res, 400, {
      error: looksLikeReferenceError(message)
        ? 'This user is linked to existing records (for example equipment or projects), so they cannot be deleted. Keep them Inactive instead.'
        : message,
    })
    return
  }
  if (!profile && deleteResult.status === 404) {
    json(res, 404, { error: 'User not found' })
    return
  }

  if (profile && deleteResult.status === 404) {
    // 404 = no GoTrue user (an old orphan profile); the cascade did not run, so remove it here.
    try {
      await restAs(callerId, `/user_profiles?id=eq.${encodeURIComponent(userId)}`, { method: 'DELETE' })
    } catch (err) {
      json(res, 400, { error: err instanceof Error ? err.message : 'Profile delete failed' })
      return
    }
  }

  await auditUserEvent(callerId, userId, 'D', 'user_deleted', {
    email: profile?.email ?? '',
    full_name: profile?.full_name ?? '',
    designation: profile?.designation ?? '',
    role: profile?.role ?? '',
  })

  json(res, 200, { ok: true })
}

const routes = {
  'GET /health': async (_req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' })
    res.end('ok')
  },
  'POST /send-email': handleSendEmail,
  'POST /create-user': handleCreateUser,
  'POST /delete-user': handleDeleteUser,
  'POST /set-user-password': handleSetUserPassword,
  'POST /qi-assistant': handleQiAssistant,
  'OPTIONS /qi-assistant': handleQiAssistant,
  'GET /osl/manak-pdf': handleManakPdf,
  'POST /osl/manak-pdf': handleManakPdf,
  'OPTIONS /osl/manak-pdf': handleManakPdf,
  'GET /api/osl/manak-pdf': handleManakPdf,
  'POST /api/osl/manak-pdf': handleManakPdf,
  'OPTIONS /api/osl/manak-pdf': handleManakPdf,
}

const server = http.createServer(async (req, res) => {
  res.qeCorsOrigin = corsOriginFor(req.headers.origin)
  const url = new URL(req.url || '/', 'http://functions.local')
  const pathname = url.pathname.replace(/\/$/, '') || '/'
  const key = `${req.method} ${pathname}`
  const handler =
    routes[key] ||
    (key === 'GET /' ? routes['GET /health'] : null) ||
    (pathname.endsWith('/osl/manak-pdf') || pathname.endsWith('/api/osl/manak-pdf')
      ? handleManakPdf
      : null)
  if (!handler) {
    json(res, 404, { error: 'Not Found' })
    return
  }
  try {
    await handler(req, res)
  } catch (err) {
    const status = Number(err?.statusCode) || 500
    json(res, status, { error: err instanceof Error ? err.message : 'Internal error' })
  }
})

server.listen(PORT, '0.0.0.0', () => {
  console.log(`functions listening on ${PORT}`)
})
