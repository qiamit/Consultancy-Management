// QE Assistant "Admin Agent": tool calling over the app's data for admins (checked by the caller: active admin
// profile + Two-Step Login). Every read runs through PostgREST with the admin's own JWT, so RLS still applies.
// The agent never writes: create / update / delete come back as proposals that the admin confirms in the app,
// and the app performs them with the admin's own session. Page opens come back as navigation actions.

const MAX_ROUNDS = 8
const MAX_ROWS = 50
const MAX_RESULT_CHARS = 14_000
const MAX_CELL_CHARS = 600
const SCHEMA_TTL_MS = 10 * 60 * 1000

// Tables the agent never sees: credentials, sessions, audit / access logs and the MCP bookkeeping.
const BLOCKED_TABLE = /(secret|token|oauth|password|passwd|session|audit|access_log|^mcp_|api_key|_keys?$|webhook|otp|mfa|vault|pending_change)/i
// Columns stripped from results and refused in writes.
const SECRET_COLUMN = /(password|passwd|secret|api_?key|access_?token|refresh_?token|private_?key|otp|totp|recovery)/i
const FILTER_OPS = new Set(['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'like', 'ilike', 'is', 'in'])
const IDENT = /^[a-z_][a-z0-9_]{0,62}$/

let schemaCache = { at: 0, tables: /** @type {Record<string, Record<string, { type?: string; format?: string; description?: string }>>} */ ({}) }

/** Table → column definitions from PostgREST's OpenAPI root (as the admin), cached for all admins. */
async function loadSchema(userRest) {
  if (Date.now() - schemaCache.at < SCHEMA_TTL_MS && Object.keys(schemaCache.tables).length) return schemaCache.tables
  const { data: doc } = await userRest('/', { headers: { Accept: 'application/openapi+json' } })
  const defs = (doc && typeof doc === 'object' && (doc.definitions || doc.components?.schemas)) || {}
  const tables = {}
  for (const [name, def] of Object.entries(defs)) {
    if (!IDENT.test(name) || BLOCKED_TABLE.test(name)) continue
    const props = def && typeof def === 'object' && def.properties ? def.properties : {}
    const cols = {}
    for (const [col, spec] of Object.entries(props)) {
      if (SECRET_COLUMN.test(col)) continue
      cols[col] = {
        type: spec?.type,
        format: spec?.format,
        description: typeof spec?.description === 'string' ? spec.description.slice(0, 160) : undefined,
      }
    }
    tables[name] = cols
  }
  schemaCache = { at: Date.now(), tables }
  return tables
}

function cleanRow(row) {
  if (!row || typeof row !== 'object') return row
  const out = {}
  for (const [k, v] of Object.entries(row)) {
    if (SECRET_COLUMN.test(k)) continue
    if (typeof v === 'string' && v.length > MAX_CELL_CHARS) out[k] = `${v.slice(0, MAX_CELL_CHARS)}… (${v.length} chars)`
    else if (v && typeof v === 'object') {
      const s = JSON.stringify(v)
      out[k] = s.length > MAX_CELL_CHARS ? `${s.slice(0, MAX_CELL_CHARS)}… (JSON, ${s.length} chars)` : v
    } else out[k] = v
  }
  return out
}

function capJson(value) {
  const s = JSON.stringify(value)
  return s.length > MAX_RESULT_CHARS ? `${s.slice(0, MAX_RESULT_CHARS)}… (truncated — ask for fewer columns or rows)` : s
}

function filterValue(op, value) {
  if (op === 'in') {
    const list = (Array.isArray(value) ? value : String(value).split(','))
      .map((v) => `"${String(v).trim().replace(/"/g, '\\"')}"`)
    return `(${list.join(',')})`
  }
  if (op === 'is') {
    const v = String(value).toLowerCase()
    return ['null', 'true', 'false'].includes(v) ? v : 'null'
  }
  if (op === 'like' || op === 'ilike') return String(value).replace(/%/g, '*')
  return String(value)
}

function buildQuery(columns, args) {
  const params = []
  const select = String(args.select || '*').trim()
  if (select !== '*') {
    const wanted = select.split(',').map((c) => c.trim()).filter(Boolean)
    const bad = wanted.filter((c) => !columns[c])
    if (bad.length) throw new Error(`Unknown columns: ${bad.join(', ')}`)
    params.push(`select=${wanted.join(',')}`)
  } else params.push('select=*')
  for (const f of Array.isArray(args.filters) ? args.filters : []) {
    const column = String(f?.column || '')
    const op = String(f?.op || 'eq')
    if (!columns[column]) throw new Error(`Unknown filter column: ${column}`)
    if (!FILTER_OPS.has(op)) throw new Error(`Unsupported filter op: ${op}`)
    params.push(`${column}=${op}.${encodeURIComponent(filterValue(op, f?.value ?? ''))}`)
  }
  if (args.order) {
    const [col, dir] = String(args.order).split(/\s+|\./)
    if (!columns[col]) throw new Error(`Unknown order column: ${col}`)
    params.push(`order=${col}.${/^asc$/i.test(dir || '') ? 'asc' : 'desc'}.nullslast`)
  }
  return params
}

export const AGENT_TOOLS = [
  {
    type: 'function',
    function: {
      name: 'list_tables',
      description: 'List the data tables of the app (optionally only names containing a word). Use before querying an unfamiliar area.',
      parameters: { type: 'object', properties: { search: { type: 'string' } } },
    },
  },
  {
    type: 'function',
    function: {
      name: 'describe_table',
      description: 'Columns of one table with their types.',
      parameters: { type: 'object', properties: { table: { type: 'string' } }, required: ['table'] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'query_rows',
      description:
        'Read rows from a table. filters: [{column, op (eq|neq|gt|gte|lt|lte|like|ilike|is|in), value}]; use ilike with %word% for text search. order: "column asc|desc". limit ≤ 50. Set count=true to get the total matching rows.',
      parameters: {
        type: 'object',
        properties: {
          table: { type: 'string' },
          select: { type: 'string', description: 'Comma-separated columns, or * (default).' },
          filters: {
            type: 'array',
            items: {
              type: 'object',
              properties: { column: { type: 'string' }, op: { type: 'string' }, value: {} },
              required: ['column', 'op'],
            },
          },
          order: { type: 'string' },
          limit: { type: 'integer' },
          count: { type: 'boolean' },
        },
        required: ['table'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'propose_changes',
      description:
        'Prepare record changes (create / update / delete). Nothing is saved: the admin sees each change with before → after and confirms it in the app. Look the record up first and use its real id. Only send the columns that change.',
      parameters: {
        type: 'object',
        properties: {
          changes: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                action: { type: 'string', enum: ['create', 'update', 'delete'] },
                table: { type: 'string' },
                id: { type: 'string', description: 'Row id (update / delete).' },
                values: { type: 'object', description: 'Column → new value (create / update).' },
                summary: { type: 'string', description: 'One line describing the change.' },
              },
              required: ['action', 'table', 'summary'],
            },
          },
        },
        required: ['changes'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'open_page',
      description: 'Open a page of the app for the admin (path from the App Pages list, optionally with ?query).',
      parameters: {
        type: 'object',
        properties: { path: { type: 'string' }, label: { type: 'string' } },
        required: ['path'],
      },
    },
  },
]

/**
 * Runs the tool loop. callModel(messages, tools) returns the provider's choice.message.
 * Returns { reply, steps, proposals, navigation }.
 */
export async function runAgent({ callModel, messages, userRest, routes }) {
  const steps = []
  const proposals = []
  const navigation = []
  const allowedPaths = new Set((routes || []).map((r) => String(r.path || '')).filter((p) => p.startsWith('/')))
  let schema = null
  const tables = async () => (schema ??= await loadSchema(userRest))

  const tool = {
    async list_tables(args) {
      const all = Object.keys(await tables()).sort()
      const word = String(args.search || '').toLowerCase().trim()
      const names = word ? all.filter((n) => n.includes(word)) : all
      steps.push({ tool: 'list_tables', summary: word ? `Listed tables matching “${word}”` : 'Listed tables' })
      return capJson(names)
    },
    async describe_table(args) {
      const name = String(args.table || '')
      const cols = (await tables())[name]
      if (!cols) throw new Error(`Unknown table: ${name}`)
      steps.push({ tool: 'describe_table', summary: `Read the columns of ${name}` })
      return capJson(cols)
    },
    async query_rows(args) {
      const name = String(args.table || '')
      const cols = (await tables())[name]
      if (!cols) throw new Error(`Unknown table: ${name}`)
      const params = buildQuery(cols, args)
      const limit = Math.max(1, Math.min(MAX_ROWS, Number(args.limit) || 20))
      params.push(`limit=${limit}`)
      const { data, total } = await userRest(`/${name}?${params.join('&')}`, {
        headers: args.count ? { Prefer: 'count=exact' } : {},
        withCount: Boolean(args.count),
      })
      const rows = (Array.isArray(data) ? data : []).map(cleanRow)
      steps.push({ tool: 'query_rows', summary: `Read ${name} — ${rows.length} row${rows.length === 1 ? '' : 's'}${total != null ? ` of ${total}` : ''}` })
      return capJson({ rows, ...(total != null ? { total } : {}) })
    },
    async propose_changes(args) {
      // All or nothing: one invalid change rejects the batch, so the model never thinks a change is pending when it is not.
      const batch = []
      for (const raw of Array.isArray(args.changes) ? args.changes.slice(0, 20) : []) {
        const action = String(raw?.action || '')
        const name = String(raw?.table || '')
        const cols = (await tables())[name]
        if (!cols) throw new Error(`Unknown table: ${name}`)
        if (!['create', 'update', 'delete'].includes(action)) throw new Error(`Unknown action: ${action}`)
        const values = raw?.values && typeof raw.values === 'object' ? raw.values : {}
        const badCols = Object.keys(values).filter((c) => !cols[c] || SECRET_COLUMN.test(c) || c === 'id')
        if (badCols.length) throw new Error(`These columns cannot be set: ${badCols.join(', ')}`)
        let before = null
        const id = String(raw?.id || '').trim()
        if (action !== 'create') {
          if (!id || !cols.id) throw new Error(`${action} needs the row id`)
          const { data } = await userRest(`/${name}?id=eq.${encodeURIComponent(id)}&select=*&limit=1`)
          before = Array.isArray(data) && data[0] ? cleanRow(data[0]) : null
          if (!before) throw new Error(`No ${name} row with id ${id} (or no access)`)
        } else if (!Object.keys(values).length) throw new Error('create needs values')
        batch.push({
          key: `p${proposals.length + batch.length + 1}-${Date.now().toString(36)}`,
          action,
          table: name,
          id: id || null,
          values: action === 'delete' ? {} : values,
          before: before && action === 'update' ? Object.fromEntries(Object.keys(values).map((k) => [k, before[k] ?? null])) : before,
          summary: String(raw?.summary || `${action} ${name}`).slice(0, 240),
        })
      }
      proposals.push(...batch)
      const out = batch.map((p) => ({ key: p.key, summary: p.summary }))
      steps.push({ tool: 'propose_changes', summary: `Prepared ${out.length} change${out.length === 1 ? '' : 's'} for confirmation` })
      return capJson({ status: 'waiting for the admin to confirm in the app — not saved yet', changes: out })
    },
    async open_page(args) {
      const path = String(args.path || '').trim()
      const base = path.split('?')[0]
      if (!path.startsWith('/') || path.startsWith('//') || (allowedPaths.size && !allowedPaths.has(base))) {
        throw new Error(`Not an app page: ${path}. Use a path from the App Pages list.`)
      }
      navigation.push({ path, label: String(args.label || base).slice(0, 80) })
      steps.push({ tool: 'open_page', summary: `Opened ${String(args.label || base)}` })
      return 'Page opened for the admin.'
    },
  }

  const convo = [...messages]
  for (let round = 0; round < MAX_ROUNDS; round += 1) {
    const message = await callModel(convo, AGENT_TOOLS)
    const calls = Array.isArray(message?.tool_calls) ? message.tool_calls : []
    if (!calls.length) {
      const content = message?.content
      const reply = typeof content === 'string'
        ? content
        : Array.isArray(content) ? content.map((p) => (typeof p === 'string' ? p : String(p?.text ?? ''))).join('\n') : ''
      return { reply: reply.trim() || (proposals.length ? 'Check the changes below and confirm them.' : 'Done.'), steps, proposals, navigation }
    }
    convo.push({ role: 'assistant', content: message.content ?? null, tool_calls: calls })
    for (const call of calls) {
      const name = String(call?.function?.name || '')
      let result
      try {
        const args = JSON.parse(String(call?.function?.arguments || '{}') || '{}')
        if (!tool[name]) throw new Error(`Unknown tool: ${name}`)
        result = await tool[name](args)
      } catch (err) {
        result = `Error: ${err instanceof Error ? err.message : String(err)}`
        steps.push({ tool: name, summary: `${name} failed: ${String(err instanceof Error ? err.message : err).slice(0, 120)}`, error: true })
      }
      convo.push({ role: 'tool', tool_call_id: call.id, content: result })
    }
  }
  return {
    reply: 'I stopped after several steps. Ask me to continue, or narrow the request.',
    steps,
    proposals,
    navigation,
  }
}

export const AGENT_SYSTEM_PROMPT = [
  'ADMIN AGENT MODE. You can work across the whole app for this admin with tools:',
  '- list_tables / describe_table / query_rows to find and report any data (clients, BIS licences = bis_projects, IS codes, renewals, finance documents, users, settings …).',
  '- propose_changes to create, update or delete records. Nothing is saved until the admin confirms each change in the app, so say so. Always look the record up first, use real ids and existing column names, and send only the columns that change.',
  '- open_page to take the admin to a page (use paths from the App Pages list).',
  'Work step by step: search, then answer with the facts you found (counts, names, dates). Never invent data, ids or columns.',
  'Keep replies short and clear; use simple lists or tables. Answer in Hindi when the admin writes in Hindi.',
].join('\n')
