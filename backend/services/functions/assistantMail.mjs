// QE Assistant mail connector (Zoho Mail by default): IMAP sync of each admin's INBOX into assistant_mail_messages,
// and SMTP sending of replies the admin confirmed in the app. Passwords are read only here, through the
// service-only RPC assistant_mail_password_for_service, and never logged or returned.

import { ImapFlow } from 'imapflow'
import { simpleParser } from 'mailparser'
import nodemailer from 'nodemailer'

const FIRST_SYNC_DAYS = 7
const MAX_PER_SYNC = 50
const KEEP_DAYS = 60
const MAX_SOURCE_BYTES = 5 * 1024 * 1024
const MAX_BODY_CHARS = 20_000
const SYNC_EVERY_MS = 5 * 60 * 1000
const SEND_LIMIT_HOUR = 20
const EMAIL = /^[^\s@<>,;]+@[^\s@<>,;]+\.[^\s@<>,;]+$/

function htmlToText(html) {
  return String(html || '')
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|tr|li|h\d)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n\s*\n+/g, '\n\n')
    .trim()
}

/** A connection error without anything secret, short enough to show in the app. */
function safeError(err) {
  const text = String(err?.responseText || err?.response || err?.message || err || 'Unknown error')
  if (/auth|login|credential|password/i.test(text)) return 'Sign-in failed — check the user name and the Zoho App Password (and that IMAP is on in Zoho Mail settings).'
  return text.replace(/\s+/g, ' ').slice(0, 300)
}

export function createAssistantMail({ rest }) {
  const sendLog = new Map()

  async function passwordFor(account) {
    const value = await rest('/rpc/assistant_mail_password_for_service', {
      method: 'POST',
      body: JSON.stringify({ p_account_id: account.id }),
    })
    const password = typeof value === 'string' ? value : ''
    if (!password) throw new Error('No app password saved for this mailbox.')
    return password
  }

  async function accountFor(userId) {
    const rows = await rest(`/assistant_mail_accounts?user_id=eq.${encodeURIComponent(userId)}&select=*`)
    return Array.isArray(rows) && rows[0] ? rows[0] : null
  }

  /** Fetches new INBOX mail of one account. Returns { added } or throws (the error is stored on the account). */
  async function syncAccount(account) {
    let client = null
    try {
      const pass = await passwordFor(account)
      client = new ImapFlow({
        host: account.imap_host,
        port: Number(account.imap_port) || 993,
        secure: Number(account.imap_port) !== 143,
        auth: { user: account.username, pass },
        logger: false,
        socketTimeout: 60_000,
      })
      await client.connect()
      const lock = await client.getMailboxLock('INBOX')
      let added = 0
      let maxUid = 0
      let validity = null
      try {
        validity = Number(client.mailbox?.uidValidity ?? 0) || null
        const lastUid = account.uid_validity && Number(account.uid_validity) === validity ? Number(account.last_uid) || 0 : 0
        let uids = lastUid
          ? await client.search({ uid: `${lastUid + 1}:*` }, { uid: true })
          : await client.search({ since: new Date(Date.now() - FIRST_SYNC_DAYS * 86_400_000) }, { uid: true })
        uids = (Array.isArray(uids) ? uids : []).filter((u) => u > lastUid).sort((a, b) => a - b).slice(-MAX_PER_SYNC)
        maxUid = lastUid
        const rows = []
        if (uids.length) {
          for await (const msg of client.fetch(uids.join(','), { uid: true, flags: true, envelope: true, size: true, source: true }, { uid: true })) {
            maxUid = Math.max(maxUid, Number(msg.uid) || 0)
            let parsed = null
            if (msg.source && (msg.size ?? 0) <= MAX_SOURCE_BYTES) parsed = await simpleParser(msg.source).catch(() => null)
            const env = msg.envelope || {}
            const text = (parsed?.text || htmlToText(parsed?.html) || '').trim()
            rows.push({
              account_id: account.id,
              user_id: account.user_id,
              uid: msg.uid,
              message_id: parsed?.messageId || env.messageId || null,
              from_addr: parsed?.from?.text || (env.from || []).map((a) => a.address).join(', ') || null,
              to_addr: parsed?.to ? [].concat(parsed.to).map((a) => a.text).join(', ') : null,
              cc_addr: parsed?.cc ? [].concat(parsed.cc).map((a) => a.text).join(', ') : null,
              subject: parsed?.subject || env.subject || '(No Subject)',
              sent_at: (parsed?.date || env.date || new Date()).toISOString(),
              snippet: text.replace(/\s+/g, ' ').slice(0, 300),
              body_text: text.slice(0, MAX_BODY_CHARS) || (parsed ? '' : '(Too large to read here — open it in Zoho Mail.)'),
              attachments: (parsed?.attachments || []).map((a) => a.filename).filter(Boolean).slice(0, 30),
              is_read: Boolean(msg.flags && msg.flags.has('\\Seen')),
            })
          }
        }
        if (rows.length) {
          await rest('/assistant_mail_messages?on_conflict=account_id,uid', {
            method: 'POST',
            headers: { Prefer: 'resolution=ignore-duplicates,return=minimal' },
            body: JSON.stringify(rows),
          })
          added = rows.length
        }
      } finally {
        lock.release()
      }
      await client.logout().catch(() => undefined)
      await rest(`/assistant_mail_accounts?id=eq.${account.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ uid_validity: validity, last_uid: maxUid, last_sync_at: new Date().toISOString(), last_error: null }),
      })
      // Keep about two months of mail in the app.
      await rest(`/assistant_mail_messages?account_id=eq.${account.id}&sent_at=lt.${encodeURIComponent(new Date(Date.now() - KEEP_DAYS * 86_400_000).toISOString())}`, {
        method: 'DELETE',
        headers: { Prefer: 'return=minimal' },
      }).catch(() => undefined)
      return { added }
    } catch (err) {
      const message = safeError(err)
      await rest(`/assistant_mail_accounts?id=eq.${account.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ last_error: message, last_sync_at: new Date().toISOString() }),
      }).catch(() => undefined)
      if (client) client.close?.()
      const e = new Error(message)
      e.statusCode = 400
      throw e
    }
  }

  /** Background sync of every connected mailbox (at most every 5 minutes each). */
  async function syncAll() {
    const rows = await rest('/assistant_mail_accounts?enabled=eq.true&password_set=eq.true&select=*')
    for (const account of Array.isArray(rows) ? rows : []) {
      const last = account.last_sync_at ? new Date(account.last_sync_at).getTime() : 0
      if (Date.now() - last < SYNC_EVERY_MS - 10_000) continue
      await syncAccount(account).catch((err) => console.warn('[assistant-mail] sync failed', account.id, err.message))
    }
  }

  /** Sends a reply / new mail from the admin's own mailbox (SMTP). The admin confirmed it in the app. */
  async function send(userId, body) {
    const account = await accountFor(userId)
    if (!account || !account.password_set) {
      const e = new Error('Connect your mailbox first (QE Assistant → Connectors).')
      e.statusCode = 400
      throw e
    }
    const list = (v) => (Array.isArray(v) ? v : String(v ?? '').split(/[,;]/)).map((s) => String(s).trim()).filter(Boolean)
    const to = list(body.to)
    const cc = list(body.cc)
    const subject = String(body.subject ?? '').trim().slice(0, 300)
    const text = String(body.body ?? body.text ?? '').trim().slice(0, 20_000)
    if (!to.length || !subject || !text) throw Object.assign(new Error('To, subject and message are needed.'), { statusCode: 400 })
    if ([...to, ...cc].length > 10 || ![...to, ...cc].every((a) => EMAIL.test(a))) {
      throw Object.assign(new Error('Check the email addresses (at most 10).'), { statusCode: 400 })
    }
    const now = Date.now()
    const recent = (sendLog.get(userId) || []).filter((t) => now - t < 3_600_000)
    if (recent.length >= SEND_LIMIT_HOUR) throw Object.assign(new Error('Too many emails this hour. Try again later.'), { statusCode: 429 })
    let inReplyTo = null
    const replyId = String(body.reply_to_mail_id ?? '').trim()
    if (/^[0-9a-f-]{36}$/i.test(replyId)) {
      const rows = await rest(`/assistant_mail_messages?id=eq.${replyId}&user_id=eq.${encodeURIComponent(userId)}&select=message_id`)
      inReplyTo = Array.isArray(rows) && rows[0] ? rows[0].message_id : null
    }
    const transport = nodemailer.createTransport({
      host: account.smtp_host,
      port: Number(account.smtp_port) || 465,
      secure: Number(account.smtp_port) !== 587,
      auth: { user: account.username, pass: await passwordFor(account) },
    })
    try {
      await transport.sendMail({
        from: account.email,
        to,
        cc: cc.length ? cc : undefined,
        subject,
        text,
        ...(inReplyTo ? { inReplyTo, references: [inReplyTo] } : {}),
      })
    } catch (err) {
      throw Object.assign(new Error(`Not sent: ${safeError(err)}`), { statusCode: 400 })
    }
    recent.push(now)
    sendLog.set(userId, recent)
    return { sent: true, from: account.email, to }
  }

  return { syncAccount, syncAll, send, accountFor }
}
