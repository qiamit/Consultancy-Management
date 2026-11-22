// Column facts of the app tables (name, type, required, default) from PostgREST's own OpenAPI description, read with
// the user's JWT, so it lists what that user's role can reach. Kept 10 minutes per user.
import { userRest } from './backend.mjs'

const TTL_MS = 10 * 60_000
const cache = new Map()

/** Columns nobody sets from Claude: keys and bookkeeping, and anything secret-looking. */
export const NO_WRITE_COLUMN = /^(id|created_at|updated_at|created_by|updated_by)$|password|secret|api_?key|token|otp|captcha|credential|_hash$|private_key|_set$/i

/** The OpenAPI definition of one table: { properties: { col: { format, type, default, enum, maxLength } }, required: [] }. */
export async function tableDefinition(ctx, table) {
  let entry = cache.get(ctx.userId)
  if (!entry || Date.now() - entry.at > TTL_MS) {
    const { data } = await userRest(ctx.jwt, '/', { headers: { Accept: 'application/openapi+json' } })
    entry = { at: Date.now(), defs: (data && typeof data === 'object' && data.definitions) || {} }
    cache.set(ctx.userId, entry)
    if (cache.size > 500) for (const [k, v] of cache) if (Date.now() - v.at > TTL_MS) cache.delete(k)
  }
  const def = entry.defs[table]
  if (!def || !def.properties) {
    const err = new Error(`${table} is not available to you.`)
    err.status = 403
    throw err
  }
  return def
}

/** Columns a new row must be given: required (NOT NULL) with no default, and not set by the app itself. */
export function mustGive(def) {
  return (def.required || []).filter((c) => def.properties[c] && def.properties[c].default === undefined && !NO_WRITE_COLUMN.test(c))
}

/** The columns of a table, for describe_table. */
export function describeColumns(def) {
  const required = new Set(mustGive(def))
  return Object.entries(def.properties).map(([name, p]) => ({
    column: name,
    type: String(p.format || p.type || ''),
    ...(p.enum ? { one_of: p.enum } : {}),
    ...(p.maxLength ? { max_length: p.maxLength } : {}),
    required_on_create: required.has(name),
    ...(p.default !== undefined ? { default: p.default } : {}),
    settable: !NO_WRITE_COLUMN.test(name),
    ...(p.description ? { note: String(p.description).slice(0, 200) } : {}),
  }))
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** A real calendar date with a year between 1900 and 2100. */
function isRealDate(value) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!m) return false
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])]
  if (y < 1900 || y > 2100 || mo < 1 || mo > 12 || d < 1) return false
  return d <= new Date(Date.UTC(y, mo, 0)).getUTCDate()
}

/**
 * Checks the values for a table against its columns: known, settable, and of the column's type. Returns the values
 * to send (numbers given as text become numbers); throws with every problem listed.
 */
export function checkValues(def, values) {
  const out = {}
  const problems = []
  for (const [col, raw] of Object.entries(values ?? {})) {
    const p = def.properties[col]
    if (!p) {
      problems.push(`${col}: no such column`)
      continue
    }
    if (NO_WRITE_COLUMN.test(col)) {
      problems.push(`${col}: set by the app, not editable here`)
      continue
    }
    if (raw === null || raw === undefined) {
      out[col] = null
      continue
    }
    const f = String(p.format || p.type || '')
    let v = raw
    if (f === 'uuid') {
      if (typeof v !== 'string' || !UUID.test(v)) problems.push(`${col}: expected a uuid`)
    } else if (f === 'date') {
      if (typeof v !== 'string' || !isRealDate(v)) problems.push(`${col}: expected a real date YYYY-MM-DD`)
    } else if (/timestamp/.test(f)) {
      if (typeof v !== 'string' || Number.isNaN(Date.parse(v))) problems.push(`${col}: expected a date-time (ISO 8601)`)
    } else if (/^(integer|bigint|smallint)$/.test(f)) {
      const n = typeof v === 'string' ? Number(v.replace(/,/g, '')) : v
      if (typeof n !== 'number' || !Number.isInteger(n)) problems.push(`${col}: expected a whole number`)
      else v = n
    } else if (/numeric|double|real|decimal/.test(f)) {
      const n = typeof v === 'string' ? Number(v.replace(/,/g, '')) : v
      if (typeof n !== 'number' || !Number.isFinite(n)) problems.push(`${col}: expected a number`)
      else v = n
    } else if (f === 'boolean') {
      if (typeof v !== 'boolean') problems.push(`${col}: expected true or false`)
    } else if (/json/.test(f)) {
      // Any JSON value.
    } else if (/\[\]$/.test(f) || p.type === 'array') {
      if (!Array.isArray(v)) problems.push(`${col}: expected a list`)
    } else if (typeof v === 'object') {
      problems.push(`${col}: expected text`)
    } else {
      v = String(v)
      if (p.maxLength && v.length > p.maxLength) problems.push(`${col}: at most ${p.maxLength} characters`)
      if (v.length > 20_000) problems.push(`${col}: too long (over 20,000 characters)`)
    }
    if (p.enum && !p.enum.includes(v)) problems.push(`${col}: one of ${p.enum.join(', ')}`)
    out[col] = v
  }
  if (problems.length) throw new Error(`Not prepared:\n- ${problems.join('\n- ')}`)
  return out
}
