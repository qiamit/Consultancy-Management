// Prepares the local database after `docker compose up`: legacy tables, every
// migration (via backend/scripts/apply-migrations.mjs) and a first admin login.
// Safe to re-run.
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import pg from 'pg'

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(here, '../..')

const env = {}
for (const line of fs.readFileSync(path.join(here, '.env'), 'utf8').split('\n')) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
  if (m) env[m[1]] = m[2]
}
const adminEmail = process.env.LOCAL_ADMIN_EMAIL || 'admin@consultancy.local'
const adminPassword = process.env.LOCAL_ADMIN_PASSWORD || 'Admin@12345'
// supabase_admin is the superuser in the Supabase Postgres image (Railway runs migrations as superuser too).
const databaseUrl = `postgres://supabase_admin:${env.POSTGRES_PASSWORD}@localhost:${env.POSTGRES_PORT}/postgres`

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function waitFor(label, fn, tries = 60) {
  for (let i = 0; i < tries; i++) {
    try {
      if (await fn()) return
    } catch {
      /* not ready yet */
    }
    await sleep(2000)
  }
  throw new Error(`timed out waiting for ${label}`)
}

const api = env.API_URL
// GoTrue and storage-api create the auth/storage tables before they start serving.
await waitFor('auth', async () => (await fetch(`${api}/auth/v1/health`)).ok)
await waitFor('storage', async () => (await fetch(`${api}/storage/v1/status`)).ok)

const client = new pg.Client({ connectionString: databaseUrl })
await client.connect()

for (const file of ['legacy_schema.sql', 'legacy_functions.sql']) {
  console.log('APPLY local-dev/db/' + file)
  await client.query(fs.readFileSync(path.join(here, 'db', file), 'utf8'))
}
await client.end()

const migrate = spawnSync(process.execPath, [path.join(root, 'backend/scripts/apply-migrations.mjs')], {
  stdio: ['ignore', 'pipe', 'inherit'],
  encoding: 'utf8',
  env: { ...process.env, DATABASE_URL: databaseUrl },
})
const applied = (migrate.stdout.match(/^OK /gm) || []).length
console.log(`migrations: ${applied} applied this run`)
if (migrate.status !== 0) {
  console.error(migrate.stdout.split('\n').slice(-5).join('\n'))
  process.exit(1)
}

// PostgREST caches the schema; reload it now that tables changed.
const reload = new pg.Client({ connectionString: databaseUrl })
await reload.connect()
await reload.query("NOTIFY pgrst, 'reload schema'")

const headers = {
  apikey: env.SERVICE_ROLE_KEY,
  Authorization: `Bearer ${env.SERVICE_ROLE_KEY}`,
  'Content-Type': 'application/json',
}
const { rows: existing } = await reload.query('SELECT id FROM auth.users WHERE email = $1', [adminEmail])
let adminId = existing[0]?.id
if (!adminId) {
  const res = await fetch(`${api}/auth/v1/admin/users`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      email: adminEmail,
      password: adminPassword,
      email_confirm: true,
      role: 'authenticated',
      user_metadata: { full_name: 'Local Admin', designation: 'Administrator', status: 'Active' },
    }),
  })
  const body = await res.json()
  if (!res.ok) throw new Error(`create admin failed: ${JSON.stringify(body)}`)
  adminId = body.id
  console.log(`created admin user ${adminEmail}`)
}
await reload.query(
  `UPDATE public.user_profiles
      SET role = 'admin', designation = 'Administrator', status = 'Active'
    WHERE id = $1`,
  [adminId],
)
await reload.end()

console.log(`
Local stack ready.
  API gateway : ${api}
  Postgres    : postgres://postgres:<POSTGRES_PASSWORD>@localhost:${env.POSTGRES_PORT}/postgres
  Login       : ${adminEmail} / ${existing.length ? '(unchanged)' : adminPassword}
Run \`npm run dev\` and open ${env.SITE_URL}`)
