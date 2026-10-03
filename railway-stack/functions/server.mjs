import http from 'node:http'

const PORT = Number(process.env.PORT || 8080)
const REST_URL = (process.env.REST_URL || 'http://rest.railway.internal:3000').replace(/\/$/, '')
const AUTH_URL = (process.env.AUTH_URL || 'http://auth.railway.internal:9999').replace(/\/$/, '')
const SERVICE_ROLE_KEY = process.env.SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || ''
const RESEND_API_KEY = process.env.RESEND_API_KEY || ''
const EMAIL_FROM =
  process.env.RESEND_FROM_EMAIL || process.env.MRM_EMAIL_FROM || 'Q Engineering <info@qengineering.in>'

function json(res, status, body) {
  const payload = JSON.stringify(body)
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(payload),
  })
  res.end(payload)
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []
    req.on('data', (c) => chunks.push(c))
    req.on('end', () => {
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

function esc(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function buildMrmHtml(opts) {
  const rows = opts.agenda
    .map(
      (a) =>
        `<tr><td style="padding:6px 8px;border:1px solid #78716c;width:28px;text-align:center;font-weight:600;">${esc(a.letter)})</td><td style="padding:6px 8px;border:1px solid #78716c;">${esc(a.title)}${a.remarks ? `<div style="color:#78716c;font-size:12px;margin-top:4px;">${esc(a.remarks)}</div>` : ''}</td></tr>`,
    )
    .join('')
  return `<!doctype html>
<html><body style="font-family:Segoe UI,Arial,sans-serif;color:#1c1917;line-height:1.45;">
  <h2 style="margin:0 0 8px;">Management Review Meeting — Agenda</h2>
  <p style="margin:0 0 12px;color:#57534e;font-size:13px;">ISO/IEC 17025 Clause 8.9.2 · Plan <strong>${esc(opts.planCode)}</strong></p>
  <p style="margin:0 0 4px;font-size:13px;"><strong>Dates:</strong> ${esc(opts.plannedFrom)} – ${esc(opts.plannedTo)}</p>
  <p style="margin:0 0 4px;font-size:13px;"><strong>Venue:</strong> ${esc(opts.venue || '—')}</p>
  <p style="margin:0 0 16px;font-size:13px;"><strong>Chairperson:</strong> ${esc(opts.chairperson || '—')}</p>
  <table style="border-collapse:collapse;width:100%;font-size:13px;">
    <thead>
      <tr>
        <th style="background:#292524;color:#fde68a;text-align:left;padding:6px 8px;border:1px solid #78716c;">Ref</th>
        <th style="background:#292524;color:#fde68a;text-align:left;padding:6px 8px;border:1px solid #78716c;">Agenda point</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>
  <p style="margin-top:16px;font-size:12px;color:#78716c;">Please review the agenda before the meeting. Contact laboratory management with any questions.</p>
</body></html>`
}

async function sendResendEmail({ to, subject, html, text, attachments }) {
  if (!RESEND_API_KEY) {
    const err = new Error('Email service not configured. Set RESEND_API_KEY on the functions service.')
    err.statusCode = 503
    throw err
  }
  const payloadBody = {
    from: EMAIL_FROM,
    to: Array.isArray(to) ? to : [to],
    subject,
    html,
    ...(text ? { text } : {}),
    ...(Array.isArray(attachments) && attachments.length > 0 ? { attachments } : {}),
  }
  const res = await fetch('https://api.resend.com/emails', {
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

async function handleSendEmail(req, res) {
  await requireUser(req)
  const body = await readBody(req)
  const to = body.to
  const subject = String(body.subject ?? '').trim()
  const html = String(body.html ?? body.text ?? '').trim()
  if (!to || !subject || !html) {
    json(res, 400, { error: 'to, subject, and html are required' })
    return
  }
  const attachments = normalizeAttachments(body.attachments)
  const sent = await sendResendEmail({ to, subject, html, text: body.text, attachments })
  json(res, 200, { ok: true, id: sent.id ?? null })
}

async function handleSendMrmAgenda(req, res) {
  await requireUser(req)
  const body = await readBody(req)
  const planId = String(body.planId ?? '').trim()
  if (!planId) {
    json(res, 400, { error: 'planId is required' })
    return
  }

  const plans = await rest(`/mrm_plans?id=eq.${encodeURIComponent(planId)}&select=*`)
  const plan = Array.isArray(plans) ? plans[0] : null
  if (!plan) {
    json(res, 404, { error: 'Plan not found' })
    return
  }

  const [agendaData, recipData] = await Promise.all([
    rest(
      `/mrm_agenda_items?plan_id=eq.${encodeURIComponent(planId)}&included=eq.true&select=*&order=sort_order.asc`,
    ),
    rest(`/mrm_plan_recipients?plan_id=eq.${encodeURIComponent(planId)}&select=*`),
  ])
  const recipients = Array.isArray(recipData) ? recipData : []
  if (recipients.length === 0) {
    json(res, 400, { error: 'No recipients on this plan' })
    return
  }

  const agenda = (Array.isArray(agendaData) ? agendaData : []).map((row) => ({
    letter: String(row.clause_letter ?? ''),
    title: String(row.title ?? ''),
    remarks: String(row.remarks ?? ''),
  }))
  const html = buildMrmHtml({
    planCode: String(plan.plan_code ?? ''),
    plannedFrom: String(plan.planned_from ?? ''),
    plannedTo: String(plan.planned_to ?? ''),
    venue: String(plan.venue ?? ''),
    chairperson: String(plan.chairperson ?? ''),
    agenda,
  })
  const subject = `MRM Agenda — ${String(plan.plan_code ?? planId)}`

  let sent = 0
  let failed = 0
  const results = []

  for (const r of recipients) {
    const recipientId = String(r.id ?? '')
    const userId = String(r.user_id ?? '')
    let email = String(r.email ?? '').trim()
    if (!email && userId) {
      try {
        const profiles = await rest(
          `/user_profiles?id=eq.${encodeURIComponent(userId)}&select=email`,
        )
        email = String(profiles?.[0]?.email ?? '').trim()
      } catch {
        /* ignore */
      }
    }

    if (!email) {
      failed += 1
      await rest(`/mrm_plan_recipients?id=eq.${encodeURIComponent(recipientId)}`, {
        method: 'PATCH',
        body: JSON.stringify({
          email_status: 'skipped',
          email_error: 'No email address',
          email_sent_at: null,
        }),
      })
      results.push({ userId, emailStatus: 'skipped', emailError: 'No email address', emailSentAt: null })
      continue
    }

    try {
      await sendResendEmail({ to: email, subject, html })
      const sentAt = new Date().toISOString()
      sent += 1
      await rest(`/mrm_plan_recipients?id=eq.${encodeURIComponent(recipientId)}`, {
        method: 'PATCH',
        body: JSON.stringify({
          email,
          email_status: 'sent',
          email_error: '',
          email_sent_at: sentAt,
        }),
      })
      results.push({ userId, emailStatus: 'sent', emailError: '', emailSentAt: sentAt })
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : 'Send failed'
      failed += 1
      await rest(`/mrm_plan_recipients?id=eq.${encodeURIComponent(recipientId)}`, {
        method: 'PATCH',
        body: JSON.stringify({
          email,
          email_status: 'failed',
          email_error: errMsg.slice(0, 500),
          email_sent_at: null,
        }),
      })
      results.push({ userId, emailStatus: 'failed', emailError: errMsg.slice(0, 500), emailSentAt: null })
    }
  }

  if (sent > 0) {
    await rest(`/mrm_plans?id=eq.${encodeURIComponent(planId)}`, {
      method: 'PATCH',
      body: JSON.stringify({
        status: 'communicated',
        communicated_at: new Date().toISOString(),
      }),
    })
  }

  json(res, 200, { sent, failed, recipients: results })
}

async function handleCreateUser(req, res) {
  const caller = await requireUser(req)
  const body = await readBody(req)

  const email = String(body.email ?? '').trim()
  const password = String(body.password ?? '').trim()
  if (!email || !password) {
    json(res, 400, { error: 'email and password are required' })
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
      await rest('/user_profiles?on_conflict=id', {
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
        }),
      })
    } catch (err) {
      json(res, 400, { error: err instanceof Error ? err.message : 'Profile upsert failed' })
      return
    }
  }

  json(res, 200, { user: createdUser })
}

async function handleDeleteUser(req, res) {
  const caller = await requireUser(req)
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

  let callerDesignation = ''
  try {
    const profiles = await rest(
      `/user_profiles?id=eq.${encodeURIComponent(callerId)}&select=designation`,
    )
    callerDesignation = String(profiles?.[0]?.designation ?? '').trim()
  } catch {
    /* ignore */
  }
  if (!callerDesignation) {
    callerDesignation = String(caller?.user_metadata?.designation ?? '').trim()
  }
  if (callerDesignation.toLowerCase() !== 'laboratory director') {
    json(res, 403, { error: 'Forbidden' })
    return
  }

  try {
    await rest(`/user_profiles?id=eq.${encodeURIComponent(userId)}`, { method: 'DELETE' })
  } catch (err) {
    json(res, 400, { error: err instanceof Error ? err.message : 'Profile delete failed' })
    return
  }

  const deleteResult = await authAdmin(`/admin/users/${encodeURIComponent(userId)}`, {
    method: 'DELETE',
  })
  if (!deleteResult.ok) {
    json(res, 400, {
      error: authErrorMessage(deleteResult.data, `Auth ${deleteResult.status}`),
    })
    return
  }

  json(res, 200, { ok: true })
}

const routes = {
  'GET /health': async (_req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' })
    res.end('ok')
  },
  'POST /send-mrm-agenda': handleSendMrmAgenda,
  'POST /send-email': handleSendEmail,
  'POST /create-user': handleCreateUser,
  'POST /delete-user': handleDeleteUser,
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || '/', 'http://functions.local')
  const key = `${req.method} ${url.pathname.replace(/\/$/, '') || '/'}`
  const handler = routes[key] || (key === 'GET /' ? routes['GET /health'] : null)
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
