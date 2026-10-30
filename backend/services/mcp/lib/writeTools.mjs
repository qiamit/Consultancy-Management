// MCP edit tools: preview → user confirms → apply_change. A preview stores the exact change
// and the current values it was based on, behind a single-use token (5 min, this user and
// this Claude connection only). apply_change refuses if any of those values changed since
// the preview. Writes run with the user's own JWT, so RLS and Module Access edit rights apply.
// There are no delete tools.
import * as z from 'zod/v4'
import { config } from './config.mjs'
import { randomToken, sha256 } from './crypto.mjs'
import { svc, userRest } from './backend.mjs'

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
      'Save a change prepared by a preview_* tool. Call it ONLY after the user has seen the preview and clearly said yes. ' +
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

export function writesEnabled() {
  return config.writeEnabled
}
