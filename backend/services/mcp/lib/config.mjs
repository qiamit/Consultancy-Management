// Runtime configuration from Railway variables. Secrets never have defaults.

function url(value, fallback) {
  return String(value || fallback || '').trim().replace(/\/$/, '')
}

export const config = {
  port: Number(process.env.PORT || 8090),
  /** Public origin of this service; the OAuth issuer and the /mcp resource live here. */
  publicUrl: url(process.env.MCP_PUBLIC_URL, 'https://mcp.qengineering.in'),
  /** Public API gateway, used to turn Storage signed paths into links a user can open. */
  publicApiUrl: url(process.env.PUBLIC_API_URL, 'https://api-production-a87f8.up.railway.app'),
  appUrl: url(process.env.APP_URL, 'https://qengineering.in'),
  authUrl: url(process.env.AUTH_URL, 'http://auth.railway.internal:9999'),
  restUrl: url(process.env.REST_URL, 'http://rest.railway.internal:3000'),
  storageUrl: url(process.env.STORAGE_URL, 'http://storage.railway.internal:5000'),
  serviceRoleKey: String(process.env.SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || ''),
  anonKey: String(process.env.ANON_KEY || process.env.SUPABASE_ANON_KEY || ''),
  /** 32+ random bytes (hex or base64). Encrypts stored GoTrue sessions and signs login forms. */
  tokenKey: String(process.env.MCP_TOKEN_KEY || ''),
  /** Kill switches. Writes stay off until edit tools ship. */
  enabled: String(process.env.MCP_ENABLED ?? 'true').toLowerCase() !== 'false',
  writeEnabled: String(process.env.MCP_WRITE_ENABLED ?? 'false').toLowerCase() === 'true',
  accessTtlSec: 60 * 60,
  refreshTtlSec: 30 * 24 * 60 * 60,
  codeTtlSec: 5 * 60,
  /** Module Access key that lets a user connect Claude at all. */
  mcpModulePath: '/tools/mcp',
}

export function assertConfig() {
  const missing = []
  if (!config.serviceRoleKey) missing.push('SERVICE_ROLE_KEY')
  if (config.tokenKey.length < 32) missing.push('MCP_TOKEN_KEY (32+ characters)')
  if (missing.length) throw new Error(`MCP service is missing: ${missing.join(', ')}`)
}
