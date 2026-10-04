import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { execSync } from 'node:child_process'
import pg from 'pg'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')
const migrationsDir = path.join(root, 'backend/supabase/migrations')

const SKIP_FILES = new Set([
  // Full LIMS baseline conflicts with existing Consultancy Pro tables (ai_models PK, etc.)
  '20260501000000_baseline_schema.sql',
  // LIMS-only finance/product stack — use Consultancy finance_* tables instead for now
  '20260721000000_products_services_master.sql',
  '20260724000001_finance_quotations.sql',
  '20260809000003_product_item_categories.sql',
  '20260809000004_seed_quotation_prefix.sql',
  '20260809000005_quotation_line_make.sql',
  '20260809000006_quotation_line_details.sql',
  '20260809000007_quotation_client_snapshot.sql',
  '20260809000008_quotation_line_gst_percent.sql',
  '20260809000009_quotation_line_extra_columns.sql',
  '20260809000010_quotation_terms_conditions.sql',
  '20260809000011_quotation_terms_label.sql',
  '20260809000012_quotation_notes.sql',
  '20260809000013_product_makes.sql',
  '20260809000014_quotation_notes_and_remarks.sql',
  '20260809000015_seed_product_make_qirlpl.sql',
  '20260809000016_quotation_signature.sql',
  '20260809000017_quotation_status_options.sql',
  '20260810000002_quotation_extra_charges.sql',
  '20260811000001_sale_document_kind_defaults.sql',
  '20260820000002_lab_master_management_division.sql',
  '20261003190000_consultancy_bis_domain.sql', // tables already exist from old app
])

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

const client = await connect()
console.log('Connected')

// Keep app migration history off public.schema_migrations — GoTrue/pop also uses
// that name (expects a `version` column) and will fail healthchecks if ours wins.
await client.query(`
  CREATE TABLE IF NOT EXISTS public.app_schema_migrations (
    filename text PRIMARY KEY,
    applied_at timestamptz NOT NULL DEFAULT now()
  );
`)
await client.query(`
  DO $$
  BEGIN
    IF EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'schema_migrations'
    ) AND EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'schema_migrations' AND column_name = 'filename'
    ) THEN
      ALTER TABLE public.schema_migrations RENAME TO app_schema_migrations;
    END IF;
  EXCEPTION WHEN duplicate_table THEN
    NULL;
  END $$;
`)

for (const file of SKIP_FILES) {
  await client.query(
    `INSERT INTO public.app_schema_migrations (filename) VALUES ($1) ON CONFLICT DO NOTHING`,
    [file],
  )
  console.log('MARK SKIPPED', file)
}

const files = fs
  .readdirSync(migrationsDir)
  .filter((f) => f.endsWith('.sql'))
  .sort()
  .filter((f) => !SKIP_FILES.has(f))

let failed = false
for (const file of files) {
  const { rows } = await client.query(
    'SELECT 1 FROM public.app_schema_migrations WHERE filename = $1',
    [file],
  )
  if (rows.length) {
    console.log('SKIP', file)
    continue
  }
  const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8')
  console.log('APPLY', file)
  try {
    await client.query('BEGIN')
    await client.query(sql)
    await client.query('INSERT INTO public.app_schema_migrations (filename) VALUES ($1)', [file])
    await client.query('COMMIT')
    console.log('OK', file)
  } catch (err) {
    await client.query('ROLLBACK')
    console.error('FAIL', file, err.message)
    failed = true
    break
  }
}

const tables = await client.query(`
  SELECT tablename FROM pg_tables
  WHERE schemaname = 'public'
    AND tablename IN (
      'user_profiles','lab_settings','module_access_rules','ai_settings',
      'clients','profiles','client_master_options','is_code_master_options'
    )
  ORDER BY 1
`)
console.log('key tables:', tables.rows.map((r) => r.tablename).join(', ') || '(none)')
await client.end()
if (failed) process.exit(1)
