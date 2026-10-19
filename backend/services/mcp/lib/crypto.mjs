import crypto from 'node:crypto'
import { config } from './config.mjs'

function keyFor(purpose) {
  return crypto.createHash('sha256').update(`${purpose}:${config.tokenKey}`).digest()
}

export function sha256(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex')
}

/** URL-safe random token with the given prefix (prefixes make leaked tokens easy to spot). */
export function randomToken(prefix) {
  return `${prefix}_${crypto.randomBytes(32).toString('base64url')}`
}

/** AES-256-GCM over JSON. Output: iv.tag.ciphertext (base64url). */
export function encryptJson(value) {
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', keyFor('session'), iv)
  const data = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()])
  return [iv, cipher.getAuthTag(), data].map((b) => b.toString('base64url')).join('.')
}

export function decryptJson(sealed) {
  const [iv, tag, data] = String(sealed).split('.').map((p) => Buffer.from(p, 'base64url'))
  const decipher = crypto.createDecipheriv('aes-256-gcm', keyFor('session'), iv)
  decipher.setAuthTag(tag)
  return JSON.parse(Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8'))
}

/** Signed, expiring blob for the login form's hidden OAuth parameters. */
export function signState(value) {
  const body = Buffer.from(JSON.stringify(value)).toString('base64url')
  const mac = crypto.createHmac('sha256', keyFor('login-form')).update(body).digest('base64url')
  return `${body}.${mac}`
}

export function verifyState(signed) {
  const [body, mac] = String(signed || '').split('.')
  if (!body || !mac) return null
  const expected = crypto.createHmac('sha256', keyFor('login-form')).update(body).digest('base64url')
  const a = Buffer.from(mac)
  const b = Buffer.from(expected)
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null
  try {
    const value = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'))
    if (!value || typeof value !== 'object' || Number(value.exp) < Date.now()) return null
    return value
  } catch {
    return null
  }
}
