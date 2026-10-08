#!/usr/bin/env node
// QE Tester DB runner: runs one .sql file inside a transaction that is ALWAYS rolled back.
//
//   node docs/agents/tests/db-run.mjs docs/agents/tests/S6_checks.sql            # BEGIN READ ONLY … ROLLBACK
//   node docs/agents/tests/db-run.mjs docs/agents/tests/S6_rls.sql --rollback    # BEGIN … ROLLBACK (writes allowed, never kept)
//
// - Never commits. Never prints the connection string.
// - Connection: DATABASE_URL env, else `railway variables --service Postgres-MC1Y --json`
//   (same as backend/scripts/apply-migrations.mjs; values are read in memory, never printed).
// - Columns whose name looks secret (password, secret, token, key…) are masked in the output.
// - The SQL file must not contain its own transaction control (BEGIN/COMMIT/ROLLBACK/END;).
//   Use SAVEPOINT if you need nested steps. For RLS tests:
//     SET LOCAL role authenticated;
//     SELECT set_config('request.jwt.claims', '{"sub":"<user-uuid>","role":"authenticated"}', true);
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { execSync } from 'node:child_process'
import pg from 'pg'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..')
const args = process.argv.slice(2)
const file = args.find((a) => !a.startsWith('--'))
const rollbackMode = args.includes('--rollback')
const maxRows = 200

if (!file) {
  console.error('Usage: node docs/agents/tests/db-run.mjs <file.sql> [--rollback]')
  process.exit(2)
}
const sql = fs.readFileSync(path.resolve(process.cwd(), file), 'utf8')

const forbidden = /(^|;)\s*(commit|rollback|end|begin|abort)(\s+(work|transaction))?\s*;|\bstart\s+transaction\b|\bset\s+(local\s+|session\s+)?transaction\s+read\s+write\b|\bsession\s+characteristics\b|default_transaction_read_only/im
if (forbidden.test(sql)) {
  console.error('Refused: the SQL file has its own transaction control (BEGIN;/COMMIT;/ROLLBACK;/END;/READ WRITE). Remove it.')
  process.exit(2)
}
if (/\b(alter\s+system|create\s+database|drop\s+database|copy\s+[^;]*\bprogram\b|dblink|pg_terminate_backend)\b/i.test(sql)) {
  console.error('Refused: statement not allowed in tester scripts.')
  process.exit(2)
}

function getDatabaseUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL
  const json = execSync('railway variables --service Postgres-MC1Y --json', {
    encoding: 'utf8',
    cwd: root,
    stdio: ['ignore', 'pipe', 'ignore'],
  })
  const v = JSON.parse(json)
  return v.POSTGRES_URL || v.DATABASE_URL || v.POSTGRES_PRIVATE_URL || v.DATABASE_PRIVATE_URL || v.DATABASE_PUBLIC_URL
}

async function connect(url) {
  const withSsl = url.includes('sslmode=') ? url : `${url}${url.includes('?') ? '&' : '?'}sslmode=require`
  const attempts = [
    { connectionString: url, ssl: false },
    { connectionString: url, ssl: { rejectUnauthorized: false } },
    { connectionString: withSsl, ssl: { rejectUnauthorized: false } },
  ]
  for (const cfg of attempts) {
    const c = new pg.Client(cfg)
    try {
      await c.connect()
      return c
    } catch {
      try { await c.end() } catch { /* ignore */ }
    }
  }
  throw new Error('Could not connect to Postgres (connection string not shown).')
}

const secretCol = /(pass(word)?|secret|token|api_?key|private|service_role|encrypted)/i
function mask(rows) {
  return rows.map((r) => {
    const o = {}
    for (const [k, v] of Object.entries(r)) o[k] = secretCol.test(k) && v != null ? '***' : v
    return o
  })
}

const url = getDatabaseUrl()
if (!url) {
  console.error('DATABASE_URL not found')
  process.exit(1)
}
const client = await connect(url)
let exitCode = 0
try {
  await client.query(rollbackMode ? 'BEGIN' : 'BEGIN READ ONLY')
  console.log(`# ${path.basename(file)} · mode: ${rollbackMode ? 'BEGIN … ROLLBACK' : 'READ ONLY'}`)
  const res = await client.query(sql)
  const results = Array.isArray(res) ? res : [res]
  results.forEach((r, i) => {
    if (!r.command) return
    const rows = r.rows ?? []
    console.log(`\n-- [${i + 1}] ${r.command} · rowCount=${r.rowCount ?? rows.length}`)
    if (rows.length) {
      console.table(mask(rows.slice(0, maxRows)))
      if (rows.length > maxRows) console.log(`(… ${rows.length - maxRows} more rows not shown)`)
    }
  })
} catch (err) {
  exitCode = 1
  console.error(`\nERROR: ${err.message}`)
  if (err.position) console.error(`at character ${err.position}`)
} finally {
  try { await client.query('ROLLBACK') } catch { /* ignore */ }
  await client.end()
  console.log('\n# rolled back (nothing kept)')
}
process.exit(exitCode)
