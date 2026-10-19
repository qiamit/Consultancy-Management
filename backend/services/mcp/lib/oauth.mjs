// OAuth 2.1 facade over GoTrue for Claude custom connectors (the self-hosted GoTrue v2.174
// has no OAuth server of its own). Claude gets opaque tokens from us; each maps to an
// encrypted GoTrue session that we refresh, so every data call runs as the real user.
import { InvalidClientMetadataError, InvalidGrantError, InvalidTokenError } from '@modelcontextprotocol/sdk/server/auth/errors.js'
import { config } from './config.mjs'
import { decryptJson, encryptJson, randomToken, sha256, signState } from './crypto.mjs'
import { gotrueLogout, gotrueRefresh, HttpError, svc } from './backend.mjs'
import { renderLoginPage } from './loginPage.mjs'

const ALLOWED_REDIRECTS = [
  /^https:\/\/claude\.ai\/api\/mcp\/auth_callback$/,
  /^https:\/\/claude\.com\/api\/mcp\/auth_callback$/,
  // Claude Code and MCP Inspector listen on a loopback port.
  /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?\/[^\s]*$/,
]

export function redirectAllowed(uri) {
  return ALLOWED_REDIRECTS.some((re) => re.test(String(uri)))
}

const enc = encodeURIComponent

function iso(secondsFromNow) {
  return new Date(Date.now() + secondsFromNow * 1000).toISOString()
}

/** GoTrue session → the part we keep (encrypted at rest). */
export function sessionFromGotrue(data) {
  const expiresAt = Number(data?.expires_at) || Math.floor(Date.now() / 1000) + Number(data?.expires_in || 3600)
  return {
    access_token: String(data?.access_token || ''),
    refresh_token: String(data?.refresh_token || ''),
    expires_at: expiresAt,
    user_id: String(data?.user?.id || ''),
    email: String(data?.user?.email || ''),
  }
}

export const clientsStore = {
  async getClient(clientId) {
    const rows = await svc(`/mcp_oauth_clients?client_id=eq.${enc(clientId)}&select=client_info`)
    return Array.isArray(rows) && rows[0] ? rows[0].client_info : undefined
  },
  async registerClient(client) {
    const uris = Array.isArray(client.redirect_uris) ? client.redirect_uris : []
    if (!uris.length || !uris.every(redirectAllowed)) {
      throw new InvalidClientMetadataError(
        'Only Claude (claude.ai / claude.com) and local loopback redirect URIs can register with this server.',
      )
    }
    const info = { ...client, client_name: String(client.client_name || 'MCP client').slice(0, 100) }
    await svc('/mcp_oauth_clients', {
      method: 'POST',
      body: JSON.stringify({ client_id: info.client_id, client_info: info }),
    })
    return info
  },
}

async function issueTokens({ clientId, userId, scopes, resource, session, rowId }) {
  const access = randomToken('qea')
  const refresh = randomToken('qer')
  const row = {
    client_id: clientId,
    user_id: userId,
    scopes,
    resource: resource || null,
    access_hash: sha256(access),
    access_expires_at: iso(config.accessTtlSec),
    refresh_hash: sha256(refresh),
    refresh_expires_at: iso(config.refreshTtlSec),
    session_enc: encryptJson(session),
  }
  if (rowId) {
    await svc(`/mcp_oauth_tokens?id=eq.${enc(rowId)}`, { method: 'PATCH', body: JSON.stringify(row) })
  } else {
    await svc('/mcp_oauth_tokens', { method: 'POST', body: JSON.stringify(row) })
  }
  return {
    access_token: access,
    token_type: 'bearer',
    expires_in: config.accessTtlSec,
    refresh_token: refresh,
    scope: scopes.join(' '),
  }
}

async function loadCode(client, code) {
  const rows = await svc(`/mcp_oauth_codes?code_hash=eq.${enc(sha256(code))}&select=*`)
  const row = Array.isArray(rows) ? rows[0] : null
  if (!row || row.client_id !== client.client_id || row.used_at || Date.parse(row.expires_at) < Date.now()) {
    throw new InvalidGrantError('Invalid or expired authorization code')
  }
  return row
}

export const provider = {
  clientsStore,

  async authorize(client, params, res) {
    const form = signState({
      client_id: client.client_id,
      redirect_uri: params.redirectUri,
      code_challenge: params.codeChallenge,
      state: params.state ?? null,
      scopes: params.scopes?.length ? params.scopes : ['qe'],
      resource: params.resource ? params.resource.href : null,
      exp: Date.now() + 15 * 60 * 1000,
    })
    res.status(200).type('html').send(renderLoginPage({ form, clientName: client.client_name || 'Claude' }))
  },

  async challengeForAuthorizationCode(client, authorizationCode) {
    return (await loadCode(client, authorizationCode)).code_challenge
  },

  async exchangeAuthorizationCode(client, authorizationCode, _codeVerifier, redirectUri) {
    const row = await loadCode(client, authorizationCode)
    if (redirectUri && redirectUri !== row.redirect_uri) {
      throw new InvalidGrantError('redirect_uri does not match the authorization request')
    }
    // Single use: only the first exchange flips used_at.
    const claimed = await svc(
      `/mcp_oauth_codes?code_hash=eq.${enc(row.code_hash)}&used_at=is.null`,
      { method: 'PATCH', body: JSON.stringify({ used_at: new Date().toISOString() }) },
    )
    if (!Array.isArray(claimed) || claimed.length !== 1) throw new InvalidGrantError('Authorization code already used')
    return issueTokens({
      clientId: client.client_id,
      userId: row.user_id,
      scopes: row.scopes?.length ? row.scopes : ['qe'],
      resource: row.resource,
      session: decryptJson(row.session_enc),
    })
  },

  async exchangeRefreshToken(client, refreshToken) {
    const rows = await svc(`/mcp_oauth_tokens?refresh_hash=eq.${enc(sha256(refreshToken))}&select=*`)
    const row = Array.isArray(rows) ? rows[0] : null
    if (
      !row ||
      row.client_id !== client.client_id ||
      row.revoked_at ||
      Date.parse(row.refresh_expires_at) < Date.now()
    ) {
      throw new InvalidGrantError('Invalid or expired refresh token')
    }
    // Rotate both tokens on the same row; the old refresh token stops working.
    return issueTokens({
      clientId: row.client_id,
      userId: row.user_id,
      scopes: row.scopes?.length ? row.scopes : ['qe'],
      resource: row.resource,
      session: decryptJson(row.session_enc),
      rowId: row.id,
    })
  },

  async verifyAccessToken(token) {
    const rows = await svc(`/mcp_oauth_tokens?access_hash=eq.${enc(sha256(token))}&select=id,client_id,user_id,scopes,access_expires_at,revoked_at`)
    const row = Array.isArray(rows) ? rows[0] : null
    if (!row || row.revoked_at || Date.parse(row.access_expires_at) < Date.now()) {
      throw new InvalidTokenError('Invalid or expired access token')
    }
    return {
      token,
      clientId: row.client_id,
      scopes: row.scopes?.length ? row.scopes : ['qe'],
      expiresAt: Math.floor(Date.parse(row.access_expires_at) / 1000),
      extra: { tokenId: row.id, userId: row.user_id },
    }
  },

  async revokeToken(client, request) {
    const hash = sha256(request.token)
    const filter = `client_id=eq.${enc(client.client_id)}&or=(access_hash.eq.${hash},refresh_hash.eq.${hash})`
    const rows = await svc(`/mcp_oauth_tokens?${filter}&revoked_at=is.null`, {
      method: 'PATCH',
      body: JSON.stringify({ revoked_at: new Date().toISOString() }),
    })
    for (const row of Array.isArray(rows) ? rows : []) {
      try {
        await gotrueLogout(decryptJson(row.session_enc).access_token)
      } catch {
        /* ignore */
      }
    }
  },
}

/** Stores a one-time code for a signed-in user and returns it. */
export async function createAuthorizationCode(form, session) {
  const code = randomToken('qec')
  await svc('/mcp_oauth_codes', {
    method: 'POST',
    body: JSON.stringify({
      code_hash: sha256(code),
      client_id: form.client_id,
      user_id: session.user_id,
      redirect_uri: form.redirect_uri,
      code_challenge: form.code_challenge,
      scopes: form.scopes,
      resource: form.resource,
      session_enc: encryptJson(session),
      expires_at: iso(config.codeTtlSec),
    }),
  })
  return code
}

const refreshing = new Map()

/**
 * A current GoTrue access token for this MCP token row, refreshing it when it is close to
 * expiry. A failed refresh (user banned, session revoked) revokes the MCP token too.
 */
export async function userJwtFor(tokenId) {
  if (refreshing.has(tokenId)) return refreshing.get(tokenId)
  const job = (async () => {
    const rows = await svc(`/mcp_oauth_tokens?id=eq.${enc(tokenId)}&select=session_enc,revoked_at`)
    const row = Array.isArray(rows) ? rows[0] : null
    if (!row || row.revoked_at) throw new InvalidTokenError('Connection revoked')
    const session = decryptJson(row.session_enc)
    if (Number(session.expires_at) - 60 > Date.now() / 1000) return session.access_token
    let fresh
    try {
      fresh = sessionFromGotrue(await gotrueRefresh(session.refresh_token))
    } catch (err) {
      if (err instanceof HttpError && err.status >= 400 && err.status < 500) {
        await svc(`/mcp_oauth_tokens?id=eq.${enc(tokenId)}`, {
          method: 'PATCH',
          body: JSON.stringify({ revoked_at: new Date().toISOString() }),
        })
        throw new InvalidTokenError('Your Consultancy Pro session ended. Reconnect the connector.')
      }
      throw err
    }
    await svc(`/mcp_oauth_tokens?id=eq.${enc(tokenId)}`, {
      method: 'PATCH',
      body: JSON.stringify({ session_enc: encryptJson({ ...session, ...fresh }), last_used_at: new Date().toISOString() }),
    })
    return fresh.access_token
  })()
  refreshing.set(tokenId, job)
  try {
    return await job
  } finally {
    refreshing.delete(tokenId)
  }
}
