// PostgREST, GoTrue and Storage calls. `svc*` use the service role and touch only the MCP
// bookkeeping tables; `user*` carry the signed-in user's own GoTrue JWT, so RLS and
// Module Access decide what Claude can see.
import { config } from './config.mjs'

export class HttpError extends Error {
  constructor(status, message, data) {
    super(message)
    this.status = status
    this.data = data
  }
}

async function call(url, init, label) {
  const res = await fetch(url, init)
  const text = await res.text()
  let data = null
  try {
    data = text ? JSON.parse(text) : null
  } catch {
    data = text
  }
  if (!res.ok) {
    const message =
      data && typeof data === 'object'
        ? String(data.message || data.msg || data.error_description || data.error || `${label} ${res.status}`)
        : `${label} ${res.status}`
    throw new HttpError(res.status, message, data)
  }
  return { data, headers: res.headers }
}

export async function svc(path, init = {}) {
  const { data } = await call(
    `${config.restUrl}${path}`,
    {
      ...init,
      headers: {
        apikey: config.serviceRoleKey,
        Authorization: `Bearer ${config.serviceRoleKey}`,
        'Content-Type': 'application/json',
        Prefer: 'return=representation',
        ...(init.headers || {}),
      },
    },
    'REST',
  )
  return data
}

/** PostgREST as the user. Returns { data, total } (total only when count was requested). */
export async function userRest(jwt, path, init = {}) {
  const { data, headers } = await call(
    `${config.restUrl}${path}`,
    {
      ...init,
      headers: {
        ...(config.anonKey ? { apikey: config.anonKey } : {}),
        Authorization: `Bearer ${jwt}`,
        'Content-Type': 'application/json',
        'X-Client-Info': 'qe-mcp',
        ...(init.headers || {}),
      },
    },
    'REST',
  )
  const range = headers.get('content-range') || ''
  const total = range.includes('/') ? Number(range.split('/')[1]) : undefined
  return { data, total: Number.isFinite(total) ? total : undefined }
}

export async function userRpc(jwt, name, args = {}) {
  const { data } = await userRest(jwt, `/rpc/${name}`, { method: 'POST', body: JSON.stringify(args) })
  return data
}

export async function gotruePassword(email, password) {
  const { data } = await call(
    `${config.authUrl}/token?grant_type=password`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(config.anonKey ? { apikey: config.anonKey } : {}) },
      body: JSON.stringify({ email, password }),
    },
    'Auth',
  )
  return data
}

export async function gotrueRefresh(refreshToken) {
  const { data } = await call(
    `${config.authUrl}/token?grant_type=refresh_token`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(config.anonKey ? { apikey: config.anonKey } : {}) },
      body: JSON.stringify({ refresh_token: refreshToken }),
    },
    'Auth',
  )
  return data
}

export async function gotrueLogout(accessToken) {
  try {
    await call(
      `${config.authUrl}/logout?scope=local`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}`, ...(config.anonKey ? { apikey: config.anonKey } : {}) },
      },
      'Auth',
    )
  } catch {
    /* the session may already be gone */
  }
}

/** Short-lived signed download link, made with the user's JWT so Storage RLS applies. */
export async function userSignedUrl(jwt, bucket, objectPath, expiresIn = 300) {
  const encoded = objectPath.split('/').map(encodeURIComponent).join('/')
  const { data } = await call(
    `${config.storageUrl}/object/sign/${encodeURIComponent(bucket)}/${encoded}`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${jwt}`,
        ...(config.anonKey ? { apikey: config.anonKey } : {}),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ expiresIn }),
    },
    'Storage',
  )
  const signed = String(data?.signedURL || data?.signedUrl || '')
  if (!signed) throw new HttpError(404, 'File not found')
  return `${config.publicApiUrl}/storage/v1${signed.startsWith('/') ? '' : '/'}${signed}`
}
