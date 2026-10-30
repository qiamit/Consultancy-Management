#!/usr/bin/env node
/**
 * Writes deploy/oracle/.env from the live Railway settings (run on the Mac, Railway CLI logged in and the repo
 * linked to the "Consultancy Management" project). Secrets are copied, never printed.
 *
 *   node deploy/oracle/scripts/make-env-from-railway.mjs --ip 1.2.3.4          # test names: app.1-2-3-4.sslip.io …
 *   node deploy/oracle/scripts/make-env-from-railway.mjs --domain qengineering.in   # cutover names
 *
 * The same JWT secret keeps the anon / service keys, user sessions, MCP tokens and the extension working.
 * POSTGRES_PASSWORD is generated once and kept on later runs (the server database is initialised with it).
 */
import { execSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync, chmodSync } from 'node:fs'
import { randomBytes } from 'node:crypto'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const envPath = join(here, '..', '.env')
const repoRoot = join(here, '..', '..', '..')

const args = process.argv.slice(2)
const arg = (name) => {
  const i = args.indexOf(name)
  return i >= 0 ? args[i + 1] : undefined
}
const ip = arg('--ip')
const domain = arg('--domain')
if (!ip && !domain) {
  console.error('Pass --ip <server IP> (test names) or --domain <domain> (cutover).')
  process.exit(1)
}

const railway = (service) =>
  JSON.parse(execSync(`railway variables --service ${service} --json`, { encoding: 'utf8', cwd: repoRoot }))

const auth = railway('auth')
const rest = railway('rest')
const storage = railway('storage-api')
const functions = railway('functions')
const mcp = railway('mcp')
const db = railway('Postgres-MC1Y')

const previous = existsSync(envPath)
  ? Object.fromEntries(
      readFileSync(envPath, 'utf8')
        .split('\n')
        .filter((line) => /^[A-Z0-9_]+=/.test(line))
        .map((line) => [line.slice(0, line.indexOf('=')), line.slice(line.indexOf('=') + 1)]),
    )
  : {}

const dashed = ip ? ip.trim().replace(/\./g, '-') : ''
const names = domain
  ? { app: domain, api: `api.${domain}`, mcp: `mcp.${domain}`, pdf: `pdf.${domain}` }
  : { app: `app.${dashed}.sslip.io`, api: `api.${dashed}.sslip.io`, mcp: `mcp.${dashed}.sslip.io`, pdf: `pdf.${dashed}.sslip.io` }

const pick = (...values) => values.find((v) => v != null && String(v).trim() !== '') ?? ''
const required = (label, value) => {
  if (!value) {
    console.error(`Missing on Railway: ${label}`)
    process.exit(1)
  }
  return value
}

const env = {
  APP_DOMAIN: names.app,
  API_DOMAIN: names.api,
  MCP_DOMAIN: names.mcp,
  PDF_DOMAIN: names.pdf,
  ACME_EMAIL: pick(previous.ACME_EMAIL, 'info@qengineering.in'),

  DATA_DIR: pick(previous.DATA_DIR, '/opt/qe/data'),
  BACKUP_DIR: pick(previous.BACKUP_DIR, '/opt/qe/backups'),
  STORAGE_BUCKET_DIR: pick(previous.STORAGE_BUCKET_DIR, 'qe-files'),

  POSTGRES_PASSWORD: pick(previous.POSTGRES_PASSWORD, randomBytes(24).toString('hex')),
  JWT_SECRET: required('auth.GOTRUE_JWT_SECRET', pick(auth.GOTRUE_JWT_SECRET, auth.JWT_SECRET)),
  JWT_EXPIRY: pick(auth.GOTRUE_JWT_EXP, '3600'),
  ANON_KEY: required('auth.ANON_KEY', pick(auth.ANON_KEY, rest.ANON_KEY)),
  SERVICE_ROLE_KEY: required('auth.SERVICE_ROLE_KEY', pick(auth.SERVICE_ROLE_KEY, functions.SERVICE_ROLE_KEY)),
  MCP_TOKEN_KEY: pick(mcp.MCP_TOKEN_KEY),
  MCP_ENABLED: pick(mcp.MCP_ENABLED, 'true'),
  MCP_WRITE_ENABLED: pick(mcp.MCP_WRITE_ENABLED, 'false'),

  GOTRUE_DISABLE_SIGNUP: pick(auth.GOTRUE_DISABLE_SIGNUP, 'true'),
  GOTRUE_MAILER_AUTOCONFIRM: pick(auth.GOTRUE_MAILER_AUTOCONFIRM, 'true'),
  GOTRUE_URI_ALLOW_LIST: `https://${names.app}/**,https://www.${names.app}/**`,
  GOTRUE_PASSWORD_MIN_LENGTH: pick(auth.GOTRUE_PASSWORD_MIN_LENGTH, '8'),
  GOTRUE_MAILER_SUBJECTS_RECOVERY: pick(auth.GOTRUE_MAILER_SUBJECTS_RECOVERY, 'Reset Your Password'),
  GOTRUE_SMTP_ADMIN_EMAIL: pick(auth.GOTRUE_SMTP_ADMIN_EMAIL),
  GOTRUE_SMTP_HOST: pick(auth.GOTRUE_SMTP_HOST),
  GOTRUE_SMTP_PORT: pick(auth.GOTRUE_SMTP_PORT, '587'),
  GOTRUE_SMTP_USER: pick(auth.GOTRUE_SMTP_USER),
  GOTRUE_SMTP_PASS: pick(auth.GOTRUE_SMTP_PASS),
  GOTRUE_SMTP_SENDER_NAME: pick(auth.GOTRUE_SMTP_SENDER_NAME),
  GOTRUE_RATE_LIMIT_HEADER: pick(previous.GOTRUE_RATE_LIMIT_HEADER, 'X-Forwarded-For'),
  // 1 while the SPA is tested from localhost against this server (see env.template).
  ALLOW_LOCALHOST_ORIGINS: pick(previous.ALLOW_LOCALHOST_ORIGINS, '1'),

  PGRST_DB_SCHEMAS: pick(rest.PGRST_DB_SCHEMAS, 'public,storage,graphql_public'),
  PGRST_DB_MAX_ROWS: pick(rest.PGRST_DB_MAX_ROWS),
  FILE_SIZE_LIMIT: pick(storage.FILE_SIZE_LIMIT, '52428800'),

  RESEND_API_KEY: pick(functions.RESEND_API_KEY),
  RESEND_FROM_EMAIL: pick(functions.RESEND_FROM_EMAIL),
  // Railway keeps sending reminders until cutover; the cutover run (--domain) switches them on here.
  RENEWAL_REMINDERS_DISABLED: domain ? '0' : '1',

  SOURCE_DATABASE_URL: required('Postgres-MC1Y.DATABASE_URL', pick(db.DATABASE_PUBLIC_URL, db.DATABASE_URL)),
  SOURCE_S3_ENDPOINT: pick(storage.GLOBAL_S3_ENDPOINT),
  SOURCE_S3_REGION: pick(storage.AWS_DEFAULT_REGION, storage.REGION, 'auto'),
  SOURCE_S3_BUCKET: pick(storage.GLOBAL_S3_BUCKET),
  SOURCE_S3_ACCESS_KEY_ID: pick(storage.AWS_ACCESS_KEY_ID),
  SOURCE_S3_SECRET_ACCESS_KEY: pick(storage.AWS_SECRET_ACCESS_KEY),
  SOURCE_S3_FORCE_PATH_STYLE: pick(storage.GLOBAL_S3_FORCE_PATH_STYLE, 'true'),

  BACKUP_RCLONE_REMOTE: pick(previous.BACKUP_RCLONE_REMOTE),
}

// Docker Compose reads .env literally; values with spaces or # are quoted.
const line = ([k, v]) => {
  const value = String(v)
  return /[\s#"'$]/.test(value) ? `${k}='${value.replace(/'/g, "'\\''")}'` : `${k}=${value}`
}
writeFileSync(envPath, `# Written by make-env-from-railway.mjs on ${new Date().toISOString()} — do not commit.\n${Object.entries(env).map(line).join('\n')}\n`)
chmodSync(envPath, 0o600)

const empty = Object.entries(env).filter(([, v]) => !String(v)).map(([k]) => k)
console.log(`Wrote ${envPath}`)
console.log(`Domains: app=${names.app} api=${names.api} mcp=${names.mcp} pdf=${names.pdf}`)
console.log(`Empty (optional) values: ${empty.length ? empty.join(', ') : 'none'}`)
