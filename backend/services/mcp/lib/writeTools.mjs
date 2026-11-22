// MCP edit tools. Every write runs with the user's own JWT, so RLS and Module Access edit rights apply.
// - preview_* (project, client, Non-Conformity case) → user confirms → apply_change: a preview stores the exact change
//   and the values it was based on behind a single-use token (5 min, this user and this Claude connection only);
//   apply_change refuses if any of those values changed since the preview.
// - Any app table (owner, 22 Nov 2026: "Create, Update, Read, Delete … Save bhi auto kar de"): create_record and
//   update_record save at once (each kept with its before / after values in mcp_pending_changes as the history);
//   delete goes through preview_delete_record → apply_change, and master tables only through the app's safe delete.
import { randomUUID } from 'node:crypto'
import * as z from 'zod/v4'
import { config } from './config.mjs'
import { randomToken, sha256 } from './crypto.mjs'
import { svc, userRest, userRpc } from './backend.mjs'
import { READ_TABLES } from './readTools.mjs'
import { moduleLevels, stripSecrets } from './tools.mjs'
import { checkValues, mustGive, tableDefinition } from './tableSchema.mjs'

const enc = encodeURIComponent
const PENDING_TTL_SEC = 5 * 60

const uuid = (what) =>
  z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, 'Expected a uuid').describe(`${what} id (uuid)`)
const text = (max, what) => z.union([z.string().max(max), z.null()]).optional().describe(what)
/** A real calendar date with a year between 1900 and 2100 (rejects 0027-05-12, 2026-02-30). */
const isRealDate = (value) => {
  const [y, m, d] = value.split('-').map(Number)
  if (y < 1900 || y > 2100 || m < 1 || m > 12 || d < 1) return false
  return d <= new Date(Date.UTC(y, m, 0)).getUTCDate()
}

const date = (what) =>
  z
    .union([
      z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD')
        .refine(isRealDate, 'Use a real date with a year between 1900 and 2100'),
      z.null(),
    ])
    .optional()
    .describe(`${what} (YYYY-MM-DD, or null to clear)`)

const PROJECT_STATUSES = ['lead', 'in_progress', 'submitted', 'completed', 'on_hold', 'cancelled', 'stop_marking']

/** Editable BIS project fields. Client, IS code, portal credentials and notes are not here. */
const projectFields = z
  .object({
    title: text(200, 'Project title'),
    status: z.enum(PROJECT_STATUSES).optional().describe(`One of ${PROJECT_STATUSES.join(', ')}`),
    application_stage: text(80, 'Application stage, as used in the app (e.g. Under Preparation)'),
    application_number: text(40, 'BIS application number'),
    application_date: date('Application date'),
    license_number: text(40, 'Licence number'),
    cm_l_digits: text(20, 'CM/L digits of the licence'),
    granted_date: date('Licence grant date'),
    license_validity_date: date('Licence validity date'),
    start_date: date('Start date'),
    target_date: date('Target date'),
    branch_name: text(120, 'BIS branch office name'),
    branch_state: text(60, 'BIS branch state'),
    branch_head_name: text(120, 'Branch head name'),
    branch_head_designation: text(120, 'Branch head designation'),
    dealing_officer_name: text(120, 'Dealing officer name'),
    dealing_officer_designation: text(120, 'Dealing officer designation'),
    inspection_officer_name: text(120, 'Inspection officer name'),
    inspection_officer_designation: text(120, 'Inspection officer designation'),
    type_of_inspection: text(80, 'Type of inspection'),
    inspection_date: date('Inspection date'),
    case_handled_by: text(120, 'Case handled by'),
    case_referred_by: text(120, 'Case referred by'),
  })
  .strict()

/** Editable Client Master contact fields. Firm name, Manak credentials and finance fields are not here. */
const clientFields = z
  .object({
    contact_person_name: text(120, 'Contact person'),
    email: z.union([z.string().email().max(200), z.null()]).optional().describe('Email'),
    phone: text(40, 'Phone'),
    mobile: text(40, 'Mobile'),
    address: text(500, 'Address'),
    city: text(80, 'City'),
    district: text(80, 'District'),
    state: text(80, 'State'),
    pin_code: z.union([z.string().regex(/^\d{6}$/, 'PIN code is 6 digits'), z.null()]).optional().describe('PIN code'),
    gst_number: z
      .union([z.string().regex(/^[0-9A-Z]{15}$/, 'GSTIN is 15 characters, capitals and digits'), z.null()])
      .optional()
      .describe('GSTIN'),
    remark: text(1000, 'Remark'),
  })
  .strict()


const REPLY_SECTION_KEYS = ['ourRef', 'otherRefs', 'subject', 'general', 'rootCause', 'corrective', 'preventive', 'effectiveness', 'newSamples', 'stock', 'payments', 'request', 'signatoryName', 'signatoryDesignation']
const EMPTY_SECTIONS = Object.fromEntries(REPLY_SECTION_KEYS.map((k) => [k, '']))
const BODY_SECTIONS = [
  ['subject', 'Subject'], ['general', 'General Paragraph'], ['rootCause', 'Root Cause of the Failure'], ['corrective', 'Corrective Action'],
  ['preventive', 'Preventive Action'], ['effectiveness', 'Effectiveness of the Action'], ['newSamples', 'Details of the New Samples'],
  ['stock', 'Stock and Marking Details'], ['payments', 'Payment Details'], ['request', 'Request to BIS'],
]
/** The letter as plain text, the same as the app keeps in reply_draft. */
function sectionsText(sec) {
  return BODY_SECTIONS.map(([k, title]) => (String(sec[k] ?? '').trim() ? (k === 'subject' ? `Subject: ${String(sec[k]).trim()}` : `${title}:\n${String(sec[k]).trim()}`) : ''))
    .filter(Boolean)
    .join('\n\n')
}

const replySections = z
  .object({
    ourRef: text(120, 'Our letter number'),
    otherRefs: text(3000, 'Other references, one per line'),
    subject: text(500, 'Subject line of the letter (without the word "Subject:")'),
    general: text(6000, 'General opening paragraph'),
    rootCause: text(6000, 'Root cause of the failure, numbered points'),
    corrective: text(6000, 'Corrective action, numbered points'),
    preventive: text(6000, 'Preventive action, numbered points'),
    effectiveness: text(6000, 'Effectiveness of the action, numbered points'),
    newSamples: text(6000, 'Details of the new samples being sent'),
    stock: text(6000, 'Stock and marking details'),
    payments: text(6000, 'Payment details'),
    request: text(6000, 'Request to BIS'),
    signatoryName: text(120, 'Signatory name'),
    signatoryDesignation: text(120, 'Signatory designation'),
  })
  .strict()

const caseFields = z
  .object({
    bis_reference: text(300, 'BIS letter reference number and date'),
    bis_reason: text(2000, 'The non-conformity as stated by BIS'),
    review_notes: text(8000, 'Points raised by BIS / review notes, numbered'),
    bis_deadline: date('Reply due date'),
    reason_type: text(200, 'Non-conformity category'),
    status: z.enum(['open', 'reviewed', 'replied']).optional().describe('Case status (closing a case is done in the app)'),
    sample_code: text(60, 'Sample code of the failed sample'),
    sample_qr_code: text(60, 'QR code of the failed sample'),
    reply_date: date('Date of the reply letter'),
    report_details: z
      .object({
        batchNumber: text(120, 'Batch number'),
        manufactureDate: date('Date of manufacturing'),
        description: text(1500, 'Sample description'),
        declaredValue: text(500, 'Declared value'),
      })
      .strict()
      .optional()
      .describe('Test report sample details; only the keys to change'),
    report_findings: z
      .array(
        z
          .object({
            parameter: z.string().max(300),
            specified: z.string().max(300).optional(),
            observed: z.string().max(300).optional(),
            remark: z.string().max(80).optional().describe('Fail'),
          })
          .strict(),
      )
      .max(60)
      .optional()
      .describe('The FAILED parameters only (replaces the whole list)'),
    report_observations: text(8000, 'Observations on the failed parameters as per the Indian Standard'),
    reply_sections: replySections.optional().describe('The reply letter sections to change; others stay as they are'),
  })
  .strict()

const TARGETS = {
  noncompliance: { table: 'bis_stop_marking_cases', path: '/bis/stop-marking', label: 'Non-Conformity case' },
  project: { table: 'bis_projects', path: '/bis/projects', label: 'BIS project' },
  client: { table: 'clients', path: '/masters/clients', label: 'client' },
}

function same(a, b) {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null)
}

function asText(text) {
  return { content: [{ type: 'text', text }] }
}

function show(v) {
  if (v === null || v === undefined || v === '') return '(empty)'
  const s = String(v)
  return s.length > 160 ? `${s.slice(0, 160)}…` : s
}

async function loadRow(ctx, target, id, columns) {
  const { data } = await userRest(ctx.jwt, `/${TARGETS[target].table}?id=eq.${enc(id)}&select=${['id', ...columns].join(',')}`)
  return Array.isArray(data) ? data[0] ?? null : null
}

/** Stores the pending change and returns the preview text with its confirm token. */
async function stage(ctx, { kind, target, targetId, title, changes, before, lines: customLines }) {
  const lines = customLines ?? Object.keys(changes).map((k) => `- ${k}: ${show(before[k])} → ${show(changes[k])}`)
  const summary = `${title}\n${lines.join('\n')}`
  const token = randomToken('qep')
  await svc('/mcp_pending_changes', {
    method: 'POST',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({
      token_hash: sha256(token),
      user_id: ctx.userId,
      client_id: ctx.clientId,
      kind,
      target_id: targetId,
      changes,
      before,
      summary,
      expires_at: new Date(Date.now() + PENDING_TTL_SEC * 1000).toISOString(),
    }),
  })
  return asText(
    `PREVIEW — nothing has been saved yet.\n${summary}\n\n` +
      `Show this to the user. Only after they clearly confirm, call apply_change with confirm_token "${token}" ` +
      `(valid 5 minutes, single use). If they want something different, make a new preview instead.`,
  )
}

async function previewUpdate(ctx, target, id, fields, title) {
  const keys = Object.keys(fields)
  if (!keys.length) return asText('No fields given, nothing to preview.')
  const row = await loadRow(ctx, target, id, keys)
  if (!row) return asText(`That ${TARGETS[target].label} was not found or is not visible to you.`)
  const changes = {}
  const before = {}
  for (const k of keys) {
    const next = fields[k] === '' ? null : fields[k]
    if (!same(row[k], next)) {
      changes[k] = next
      before[k] = row[k] ?? null
    }
  }
  if (!Object.keys(changes).length) return asText('Every value already matches; nothing would change.')
  return stage(ctx, { kind: `update_${target}`, target, targetId: id, title, changes, before })
}

/**
 * Tables Claude may change: every app table it can read, except these (owner, 22 Nov 2026).
 */
const NO_WRITE = new Set([
  // Users, permissions and AI keys
  'user_profiles', 'module_access_rules', 'ai_settings', 'ai_models', 'ai_skills',
  // Logs and audit trails
  'email_send_log', 'finance_transaction_audit',
  // The Standards Library index (written by the indexer from the owner's folder)
  'standard_docs', 'standard_pages', 'standard_list', 'standard_refs_status', 'standard_index_runs', 'standard_sync_requests',
  // Customer Portal logins and what each login sees
  'portal_customers', 'portal_licence_access',
  // File rows (files are uploaded in the app) and document numbering
  'bis_project_files', 'client_certificate_files', 'is_code_files', 'lab_documents', 'lab_letterheads', 'document_series', 'lab_prefixes',
])
/** Settings: changed only, never created or deleted from here. */
const UPDATE_ONLY = new Set(['lab_settings', 'company_settings', 'website_settings', 'bis_renewal_reminder_settings', 'sale_document_signature_defaults'])
/** Masters are deleted only through the app's own safe delete: admins only, and a row still used elsewhere is kept. */
const MASTER_DELETE = new Set(['clients', 'is_codes', 'test_parameters', 'products_services_master'])

export const RECORD_TABLES = Object.fromEntries(
  Object.entries(READ_TABLES)
    .filter(([name]) => !NO_WRITE.has(name))
    .map(([name, spec]) => [name, { ...spec, ops: UPDATE_ONLY.has(name) ? ['update'] : ['create', 'update', 'delete'] }]),
)
const RECORD_NAMES = Object.keys(RECORD_TABLES)
export const RECORD_PATHS = [...new Set(Object.values(RECORD_TABLES).map((t) => t.path))]

const valuesSchema = z
  .record(z.string().regex(/^[a-z_][a-z0-9_]*$/, 'Column names are lower case'), z.any())
  .describe('Column → value (see describe_table for the columns, their types and which are required). Dates as YYYY-MM-DD.')

/** The table's spec for this operation, after checking the user has edit on its module. */
async function recordTable(ctx, table, op) {
  const spec = RECORD_TABLES[table]
  if (!spec) throw new Error(`${table} cannot be changed from Claude.`)
  if (!spec.ops.includes(op)) throw new Error(`${table} can only be ${spec.ops.join(' / ')}d from Claude.`)
  const level = (await moduleLevels(ctx.jwt, [spec.path]))[spec.path] || 'none'
  if (level !== 'edit') {
    const err = new Error(`Your Module Access for ${spec.path} is ${level}: edit is needed to change ${table}.`)
    err.status = 403
    throw err
  }
  return spec
}

/** History of an automatic save: the same table as the previews, already used, with the before / after values. */
async function keepHistory(ctx, kind, targetId, changes, before, summary) {
  await svc('/mcp_pending_changes', {
    method: 'POST',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({
      token_hash: sha256(randomToken('qeh')),
      user_id: ctx.userId,
      client_id: ctx.clientId,
      kind,
      target_id: targetId,
      changes,
      before,
      summary: summary.slice(0, 4000),
      expires_at: new Date().toISOString(),
      used_at: new Date().toISOString(),
    }),
  }).catch(() => {})
}

/** The few columns that name a row in a summary. */
function rowLabel(row) {
  const keys = ['title', 'name', 'company_name', 'is_number', 'test_name', 'item_name', 'quotation_number', 'invoice_number', 'document_number', 'label', 'code']
  const k = keys.find((x) => row?.[x])
  return k ? `${k} "${show(row[k])}"` : ''
}

async function applyRecord(pending, ctx) {
  const table = pending.changes?.table
  if (pending.kind !== 'delete_record' || !RECORD_TABLES[table]) return asText('Unknown change type.')
  await recordTable(ctx, table, 'delete')
  const id = pending.target_id
  const { data: rows } = await userRest(ctx.jwt, `/${table}?id=eq.${enc(id)}&select=*`)
  const row = Array.isArray(rows) ? rows[0] : null
  if (!row) return asText(`That ${table} row is no longer there or not visible to you. Nothing was deleted.`)
  if (!same(stripSecrets(row), pending.before)) return asText('Not deleted: the row changed after the preview. Make a new preview.')
  if (MASTER_DELETE.has(table)) {
    const result = await userRpc(ctx.jwt, 'delete_master_rows', { p_table: table, p_ids: [id] })
    const deleted = Array.isArray(result?.deleted) ? result.deleted.map(String) : []
    if (deleted.includes(id)) return asText(`Deleted.\n${pending.summary}`)
    const refs = (Array.isArray(result?.blocked) ? result.blocked : []).find((b) => String(b.id) === id)?.refs
    return asText(
      `Not deleted: this ${table} row is still used${refs ? ` (${Object.entries(refs).map(([t, n]) => `${n} in ${t}`).join(', ')})` : ''}. ` +
        'Remove or move those first, or keep the row.',
    )
  }
  const { data } = await userRest(ctx.jwt, `/${table}?id=eq.${enc(id)}`, { method: 'DELETE', headers: { Prefer: 'return=representation' } })
  if (!Array.isArray(data) || !data.length) return asText('Not deleted: the database refused (no delete permission on this row).')
  return asText(`Deleted.\n${pending.summary}`)
}

const RECORD_TOOLS = [
  {
    name: 'create_record',
    path: null,
    title: 'Create a record in any app table',
    description:
      'Add one row to a Consultancy Pro table (any module you have edit on; see list_app_tables and describe_table for the columns). ' +
      'Saved at once, as you — Module Access and row-level security apply. Give every required column; ids, created / updated stamps ' +
      'and secret fields are set by the app. Prefer the dedicated tools (e.g. preview_update_project) where one exists. ' +
      'Read first to avoid duplicates, and never invent facts: ask the user for missing values.',
    inputSchema: { table: z.enum(RECORD_NAMES).describe('Table name'), values: valuesSchema },
    run: async ({ table, values }, ctx) => {
      await recordTable(ctx, table, 'create')
      const def = await tableDefinition(ctx, table)
      const clean = checkValues(def, values)
      const missing = mustGive(def).filter((c) => clean[c] === undefined || clean[c] === null || clean[c] === '')
      if (missing.length) return asText(`Not saved: give ${missing.join(', ')} (required for a new ${table} row).`)
      if (!Object.keys(clean).length) return asText('No values given, nothing to save.')
      const id = def.properties.id && String(def.properties.id.format) === 'uuid' ? randomUUID() : null
      const body = { ...(id ? { id } : {}), ...clean }
      const createdBy = def.properties.created_by
      if (createdBy && String(createdBy.format) === 'uuid') body.created_by = ctx.userId
      const { data } = await userRest(ctx.jwt, `/${table}`, { method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify(body) })
      const row = Array.isArray(data) ? data[0] : null
      if (!row) return asText('Not saved: the database refused the new row (no permission).')
      const summary = `Created ${table} ${row.id ?? ''} ${rowLabel(row)}\n${Object.keys(clean).map((k) => `- ${k}: ${show(clean[k])}`).join('\n')}`
      await keepHistory(ctx, 'create_record', row.id && /^[0-9a-f-]{36}$/i.test(String(row.id)) ? row.id : randomUUID(), { table, values: clean }, {}, summary)
      return asText(`Saved.\n${summary}\n\nNew row: ${JSON.stringify(stripSecrets(row)).slice(0, 3000)}`)
    },
  },
  {
    name: 'update_record',
    path: null,
    title: 'Update a record in any app table',
    description:
      'Change columns of one row (by id) of a Consultancy Pro table you have edit on. Saved at once, as you — Module Access and ' +
      'row-level security apply; the reply shows before → after. Only the columns given change. Read the row first (read_table) ' +
      'and never invent facts.',
    inputSchema: { table: z.enum(RECORD_NAMES).describe('Table name'), id: uuid('Row'), values: valuesSchema },
    run: async ({ table, id, values }, ctx) => {
      await recordTable(ctx, table, 'update')
      const def = await tableDefinition(ctx, table)
      if (!def.properties.id) return asText(`${table} has no id column, so its rows cannot be changed here.`)
      const clean = checkValues(def, values)
      const keys = Object.keys(clean)
      if (!keys.length) return asText('No values given, nothing to change.')
      const { data: rows } = await userRest(ctx.jwt, `/${table}?id=eq.${enc(id)}&select=${['id', ...keys].join(',')}`)
      const row = Array.isArray(rows) ? rows[0] : null
      if (!row) return asText(`That ${table} row was not found or is not visible to you.`)
      const changes = {}
      const before = {}
      for (const k of keys) {
        if (!same(row[k], clean[k])) {
          changes[k] = clean[k]
          before[k] = row[k] ?? null
        }
      }
      if (!Object.keys(changes).length) return asText('Every value already matches; nothing changed.')
      const { data } = await userRest(ctx.jwt, `/${table}?id=eq.${enc(id)}`, {
        method: 'PATCH',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify(changes),
      })
      if (!Array.isArray(data) || !data.length) return asText('Not saved: the database refused the change (no edit permission on this row).')
      const summary = `Updated ${table} ${id} ${rowLabel(data[0])}\n${Object.keys(changes).map((k) => `- ${k}: ${show(before[k])} → ${show(changes[k])}`).join('\n')}`
      await keepHistory(ctx, 'update_record', id, { table, values: changes }, before, summary)
      return asText(`Saved.\n${summary}`)
    },
  },
  {
    name: 'preview_delete_record',
    path: null,
    title: 'Preview deleting a record',
    description:
      'Prepare the PERMANENT delete of one row (by id) of a Consultancy Pro table you have edit on. Nothing is deleted: it shows the ' +
      'row and returns a confirm token; call apply_change only after the user clearly confirms the delete. Client, IS Code, test and ' +
      'product masters use the app\'s safe delete (admins only; a row still used elsewhere is kept).',
    inputSchema: { table: z.enum(RECORD_NAMES).describe('Table name'), id: uuid('Row') },
    run: async ({ table, id }, ctx) => {
      await recordTable(ctx, table, 'delete')
      const { data: rows } = await userRest(ctx.jwt, `/${table}?id=eq.${enc(id)}&select=*`)
      const row = Array.isArray(rows) ? rows[0] : null
      if (!row) return asText(`That ${table} row was not found or is not visible to you.`)
      const before = stripSecrets(row)
      const lines = Object.entries(before)
        .filter(([, v]) => v !== null && v !== '' && typeof v !== 'object')
        .slice(0, 14)
        .map(([k, v]) => `- ${k}: ${show(v)}`)
      return stage(ctx, {
        kind: 'delete_record',
        target: null,
        targetId: id,
        title: `DELETE ${table} ${id} ${rowLabel(row)} — permanent, cannot be undone${MASTER_DELETE.has(table) ? ' (admins only; kept if still used elsewhere)' : ''}:`,
        changes: { table },
        before,
        lines,
      })
    },
  },
]

export const WRITE_TOOLS = [
  {
    name: 'preview_update_project',
    path: '/bis/projects',
    title: 'Preview a BIS project edit',
    description:
      'Prepare changes to one BIS licence / application (stage, numbers, dates, branch and officer details, status). ' +
      'Nothing is saved: it returns a before → after preview and a confirm token for apply_change.',
    inputSchema: { project_id: uuid('BIS project'), fields: projectFields.describe('Only the fields to change') },
    run: async ({ project_id, fields }, ctx) => previewUpdate(ctx, 'project', project_id, fields, `Edit BIS project ${project_id}:`),
  },
  {
    name: 'preview_add_project_note',
    path: '/bis/projects',
    title: 'Preview adding a project note',
    description:
      'Prepare a dated note appended to a BIS project\'s notes (existing notes are kept). Nothing is saved until apply_change.',
    inputSchema: { project_id: uuid('BIS project'), note: z.string().min(1).max(1000).describe('The note text') },
    run: async ({ project_id, note }, ctx) => {
      const row = await loadRow(ctx, 'project', project_id, ['notes', 'title'])
      if (!row) return asText('That BIS project was not found or is not visible to you.')
      const stamp = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' })
      const line = `[${stamp} · via Claude] ${note.trim()}`
      const current = String(row.notes ?? '').trim()
      return stage(ctx, {
        kind: 'update_project',
        target: 'project',
        targetId: project_id,
        title: `Add a note to ${row.title || project_id}:`,
        changes: { notes: current ? `${current}\n${line}` : line },
        before: { notes: row.notes ?? null },
      })
    },
  },
  {
    name: 'preview_update_client',
    path: '/masters/clients',
    title: 'Preview a client contact edit',
    description:
      'Prepare changes to a client firm\'s contact details in Client Master (contact person, email, phone, address, GSTIN, remark). ' +
      'Nothing is saved: it returns a before → after preview and a confirm token for apply_change.',
    inputSchema: { client_id: uuid('Client'), fields: clientFields.describe('Only the fields to change') },
    run: async ({ client_id, fields }, ctx) => previewUpdate(ctx, 'client', client_id, fields, `Edit client ${client_id}:`),
  },
  {
    name: 'preview_update_noncompliance_case',
    path: '/bis/stop-marking',
    title: 'Preview a Non-Conformity case edit',
    description:
      'Prepare changes to one License Non-Conformity case: the BIS letter facts, the test report details / failed parameters / observations, and the reply letter section by section ' +
      '(reply_sections: subject, general, rootCause, corrective, preventive, effectiveness, newSamples, stock, payments, request, signatory). ' +
      'Read the case first with get_noncompliance_case (and open the BIS letter and test reports with get_noncompliance_file_link). ' +
      'Write the reply in formal Indian business English, numbered points, no greeting or sign-off; never invent test results, dates or quantities: leave a [square-bracket placeholder] for what the licensee must supply. ' +
      'Only report_findings that FAIL belong in the list. Nothing is saved: it returns a before → after preview and a confirm token for apply_change.',
    inputSchema: { case_id: uuid('Non-Conformity case'), fields: caseFields.describe('Only the fields to change') },
    run: async ({ case_id, fields }, ctx) => {
      const keys = Object.keys(fields)
      if (!keys.length) return asText('No fields given, nothing to preview.')
      const cols = new Set()
      for (const k of keys) cols.add(k)
      if (fields.reply_sections) cols.add('reply_draft')
      if (fields.report_findings) cols.add('report_review')
      const row = await loadRow(ctx, 'noncompliance', case_id, [...cols])
      if (!row) return asText('That Non-Conformity case was not found or is not visible to you.')
      const changes = {}
      const before = {}
      const lines = []
      const put = (col, next, label) => {
        if (same(row[col], next)) return
        changes[col] = next
        before[col] = row[col] ?? null
        if (label) lines.push(label)
      }
      for (const k of keys) {
        const v = fields[k]
        if (k === 'reply_sections') {
          const merged = { ...EMPTY_SECTIONS, ...(row.reply_sections ?? {}) }
          const edited = []
          for (const [sk, sv] of Object.entries(v)) {
            const next = sv === null || sv === undefined ? '' : String(sv)
            if (String(merged[sk] ?? '') !== next) {
              lines.push(`- reply_sections.${sk}: ${show(merged[sk])} → ${show(next)}`)
              merged[sk] = next
              edited.push(sk)
            }
          }
          if (edited.length) {
            put('reply_sections', merged)
            put('reply_draft', sectionsText(merged))
          }
        } else if (k === 'report_details') {
          const merged = { ...(row.report_details ?? {}) }
          for (const [dk, dv] of Object.entries(v)) {
            const next = dv ?? ''
            if (String(merged[dk] ?? '') !== String(next)) {
              lines.push(`- report_details.${dk}: ${show(merged[dk])} → ${show(next)}`)
              merged[dk] = next
            }
          }
          put('report_details', merged)
        } else if (k === 'report_findings') {
          const next = v.map((f, i) => ({ id: `mcp-${Date.now().toString(36)}-${i}`, selected: true, parameter: f.parameter, specified: f.specified ?? '', observed: f.observed ?? '', remark: f.remark ?? 'Fail' }))
          lines.push(`- report_findings: ${(row.report_findings ?? []).length} row(s) → ${next.length} failed parameter(s): ${next.map((f) => f.parameter).join('; ').slice(0, 300)}`)
          put('report_findings', next)
          put('report_review', next.map((f, i) => `${i + 1}. ${f.parameter} — Specified: ${f.specified || '—'}; Observed: ${f.observed || '—'}; ${f.remark || '—'}`).join('\n'))
        } else {
          const next = v === '' ? null : v
          if (!same(row[k], next)) lines.push(`- ${k}: ${show(row[k])} → ${show(next)}`)
          put(k, next)
        }
      }
      if (!Object.keys(changes).length) return asText('Every value already matches; nothing would change.')
      return stage(ctx, { kind: 'update_noncompliance', target: 'noncompliance', targetId: case_id, title: `Edit Non-Conformity case ${case_id}:`, changes, before, lines })
    },
  },
  {
    name: 'apply_change',
    path: null,
    title: 'Apply a confirmed change',
    description:
      'Save a change prepared by a preview_* tool (including preview_delete_record). Call it ONLY after the user has seen the preview and clearly said yes. ' +
      'It fails if the token expired, was used, or the record changed since the preview.',
    inputSchema: { confirm_token: z.string().regex(/^qep_[A-Za-z0-9_-]{20,}$/, 'Use the confirm_token from the preview') },
    destructive: true,
    run: async ({ confirm_token }, ctx) => {
      const hash = sha256(confirm_token)
      // Claim the token first so it can only ever be applied once.
      const claimed = await svc(
        `/mcp_pending_changes?token_hash=eq.${enc(hash)}&user_id=eq.${enc(ctx.userId)}&client_id=eq.${enc(ctx.clientId)}&used_at=is.null&expires_at=gt.${enc(new Date().toISOString())}`,
        { method: 'PATCH', body: JSON.stringify({ used_at: new Date().toISOString() }) },
      )
      const pending = Array.isArray(claimed) ? claimed[0] : null
      if (!pending) return asText('This confirm token is invalid, expired or already used. Make a new preview.')
      if (pending.kind === 'delete_record') return applyRecord(pending, ctx)
      const target = pending.kind === 'update_project' ? 'project' : pending.kind === 'update_client' ? 'client' : pending.kind === 'update_noncompliance' ? 'noncompliance' : null
      if (!target) return asText('Unknown change type.')
      if ((ctx.levels[TARGETS[target].path] || 'none') !== 'edit') {
        return asText(`You do not have edit access to ${TARGETS[target].label}s.`)
      }
      const keys = Object.keys(pending.changes)
      const row = await loadRow(ctx, target, pending.target_id, keys)
      if (!row) return asText(`That ${TARGETS[target].label} is no longer visible to you. Nothing was saved.`)
      const moved = keys.filter((k) => !same(row[k], pending.before[k]))
      if (moved.length) {
        return asText(`Not saved: ${moved.join(', ')} changed after the preview. Make a new preview with the current values.`)
      }
      const { data } = await userRest(ctx.jwt, `/${TARGETS[target].table}?id=eq.${enc(pending.target_id)}`, {
        method: 'PATCH',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify(pending.changes),
      })
      if (!Array.isArray(data) || !data.length) {
        return asText('Not saved: the database refused the change (no edit permission on this record).')
      }
      return asText(`Saved.\n${pending.summary}`)
    },
  },
]

WRITE_TOOLS.push(...RECORD_TOOLS)

export function writesEnabled() {
  return config.writeEnabled
}
