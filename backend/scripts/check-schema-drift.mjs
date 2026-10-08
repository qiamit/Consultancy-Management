import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { execSync } from 'node:child_process'
import pg from 'pg'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '../..')
const jsonPath = path.join(root, 'backend/database/schema/public-columns.json')

function getDatabaseUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL
  const json = execSync('railway variables --service Postgres-MC1Y --json', {
    encoding: 'utf8',
    cwd: root,
  })
  const vars = JSON.parse(json)
  return (
    vars.POSTGRES_URL ||
    vars.DATABASE_URL ||
    vars.POSTGRES_PRIVATE_URL ||
    vars.DATABASE_PRIVATE_URL ||
    vars.DATABASE_PUBLIC_URL
  )
}

const url = getDatabaseUrl()
if (!url) {
  console.error('DATABASE_URL not found')
  process.exit(1)
}

async function connect() {
  const attempts = [
    { connectionString: url, ssl: false },
    { connectionString: url, ssl: { rejectUnauthorized: false } },
    {
      connectionString: url.includes('sslmode=')
        ? url
        : `${url}${url.includes('?') ? '&' : '?'}sslmode=require`,
      ssl: { rejectUnauthorized: false },
    },
  ]
  let lastErr
  for (const cfg of attempts) {
    const c = new pg.Client(cfg)
    try {
      await c.connect()
      return c
    } catch (err) {
      lastErr = err
      try {
        await c.end()
      } catch {
        /* ignore */
      }
    }
  }
  throw lastErr
}

const COLUMNS_SQL = `
  SELECT table_name, column_name, data_type, is_nullable, ordinal_position
  FROM information_schema.columns
  WHERE table_schema = 'public'
  ORDER BY table_name, ordinal_position
`

function signature(row) {
  return `${row.table_name}|${row.column_name}|${row.data_type}|${row.is_nullable}|${row.ordinal_position}`
}

function columnKey(row) {
  return `${row.table_name}.${row.column_name}`
}

if (!fs.existsSync(jsonPath)) {
  console.error('schema file missing')
  process.exit(1)
}

try {
  const saved = JSON.parse(fs.readFileSync(jsonPath, 'utf8'))
  const client = await connect()
  let live
  try {
    await client.query("SET statement_timeout = '30s'")
    const result = await client.query(COLUMNS_SQL)
    live = result.rows.map((row) => ({
      table_name: row.table_name,
      column_name: row.column_name,
      data_type: row.data_type,
      is_nullable: row.is_nullable,
      ordinal_position: Number(row.ordinal_position),
    }))
  } finally {
    await client.end()
  }

  const savedByKey = new Map(saved.map((row) => [columnKey(row), signature(row)]))
  const liveByKey = new Map(live.map((row) => [columnKey(row), signature(row)]))
  const changed = []
  for (const [key, sig] of liveByKey) {
    if (savedByKey.get(key) !== sig) changed.push(key)
  }
  for (const key of savedByKey.keys()) {
    if (!liveByKey.has(key)) changed.push(key)
  }
  changed.sort()
  for (const line of changed) console.log(line)
  process.exit(changed.length === 0 ? 0 : 1)
} catch {
  console.error('Schema query failed')
  process.exit(1)
}
