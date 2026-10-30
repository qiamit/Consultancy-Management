// MCP tools. Every call runs PostgREST / Storage with the user's own JWT, so RLS and
// Module Access decide what is returned; `path` only hides tools the user cannot use.
// v1 is read-only. Edit tools (preview → confirm → apply) come next, behind MCP_WRITE_ENABLED.
import * as z from 'zod/v4'
import { userRest, userRpc, userSignedUrl } from './backend.mjs'

const enc = encodeURIComponent
const BIS_FILES_BUCKET = 'bis-project-files'
const NC_FILES_BUCKET = 'bis-stop-marking-files'
const NC_PATH = '/bis/stop-marking'
const MAX_TEXT = 60_000

const SECRET_KEY = /password|secret|api_?key|token|otp|captcha/i

/** Drops secret-looking keys anywhere in the value. */
export function stripSecrets(value) {
  if (Array.isArray(value)) return value.map(stripSecrets)
  if (value && typeof value === 'object') {
    const out = {}
    for (const [k, v] of Object.entries(value)) {
      if (SECRET_KEY.test(k) && !/_set$/.test(k)) continue
      out[k] = stripSecrets(v)
    }
    return out
  }
  return value
}

/** Safe text for PostgREST ilike filters inside or=(...). */
/** Calendar date in India (UTC+05:30), optionally offset by ms — the app's "today", not the server's UTC day. */
function istDate(offsetMs = 0) {
  return new Date(Date.now() + offsetMs + 330 * 60 * 1000).toISOString().slice(0, 10)
}

function term(value) {
  return String(value ?? '')
    .replace(/[,()*%\\"'.:]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80)
}

function asResult(value, note) {
  let text = JSON.stringify(stripSecrets(value), null, 1)
  if (text.length > MAX_TEXT) text = `${text.slice(0, MAX_TEXT)}\n…(truncated; narrow the request)`
  return { content: [{ type: 'text', text: note ? `${note}\n${text}` : text }] }
}

const limitSchema = z.number().int().min(1).max(50).optional().describe('Rows to return (default 20, max 50)')
// Any 8-4-4-4-12 hex id: some rows use fixed ids that are not RFC version-4 UUIDs.
const uuidSchema = (what) =>
  z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, 'Expected a uuid').describe(`${what} id (uuid)`)

const PROJECT_LIST =
  'id,title,project_kind,status,application_stage,license_number,cm_l_digits,application_number,application_date,granted_date,license_validity_date,branch_name,updated_at,client:clients(id,company_name),is_code:is_codes(id,is_number,revision_year,title)'

async function clientIdsMatching(jwt, q) {
  const { data } = await userRest(
    jwt,
    `/clients?select=id&archived_at=is.null&company_name=ilike.*${enc(q)}*&limit=50`,
  )
  return (Array.isArray(data) ? data : []).map((r) => r.id)
}

/** Tool table: name → { path (Module Access key), title, description, inputSchema, run }. */
export const TOOLS = [
  {
    name: 'whoami',
    path: null,
    title: 'Who am I',
    description: 'The signed-in Consultancy Pro user (name, designation, access role) and their access level for each area this connector covers.',
    inputSchema: {},
    run: async (_args, ctx) => {
      const { data } = await userRest(
        ctx.jwt,
        `/user_profiles?id=eq.${enc(ctx.userId)}&select=full_name,email,designation,department_name,division,role,status`,
      )
      return asResult({ user: Array.isArray(data) ? data[0] ?? null : null, access: ctx.levels })
    },
  },
  {
    name: 'search_clients',
    path: '/masters/clients',
    title: 'Search clients',
    description: 'Find client firms (Client Master) by company name, contact person, city, GST number or email. Returns basic contact fields.',
    inputSchema: { query: z.string().max(80).optional().describe('Text to search for; empty lists recent clients'), limit: limitSchema },
    run: async ({ query, limit }, ctx) => {
      const q = term(query)
      const filter = q
        ? `&or=(company_name.ilike.*${enc(q)}*,contact_person_name.ilike.*${enc(q)}*,city.ilike.*${enc(q)}*,gst_number.ilike.*${enc(q)}*,email.ilike.*${enc(q)}*)`
        : ''
      const { data, total } = await userRest(
        ctx.jwt,
        `/clients?select=id,company_name,contact_person_name,email,mobile,city,state,gst_number,manak_user_id&archived_at=is.null${filter}&order=updated_at.desc&limit=${limit ?? 20}`,
        { headers: { Prefer: 'count=exact' } },
      )
      return asResult({ total, clients: data })
    },
  },
  {
    name: 'get_client',
    path: '/masters/clients',
    title: 'Get client',
    description: 'One client firm with all Client Master fields (portal passwords are never returned) and its BIS licences / applications.',
    inputSchema: { client_id: uuidSchema('Client') },
    run: async ({ client_id }, ctx) => {
      const { data } = await userRest(ctx.jwt, `/clients?id=eq.${enc(client_id)}&select=*`)
      const client = Array.isArray(data) ? data[0] : null
      if (!client) return asResult({ error: 'Client not found or not visible to you.' })
      let projects = []
      try {
        const res = await userRest(ctx.jwt, `/bis_projects?client_id=eq.${enc(client_id)}&select=${PROJECT_LIST}&order=updated_at.desc&limit=50`)
        projects = res.data
      } catch {
        projects = 'not visible with your BIS access'
      }
      return asResult({ client, projects })
    },
  },
  {
    name: 'search_projects',
    path: '/bis/projects',
    title: 'Search BIS projects',
    description: 'Find BIS licences and applications by licence number (CM/L), application number, title or client name. Optional filters: client, status, project kind.',
    inputSchema: {
      query: z.string().max(80).optional().describe('Licence / application number, title or client name'),
      client_id: uuidSchema('Client').optional(),
      status: z.string().max(40).optional().describe('Exact project status'),
      project_kind: z.string().max(40).optional().describe('Exact project kind, e.g. New Application'),
      limit: limitSchema,
    },
    run: async ({ query, client_id, status, project_kind, limit }, ctx) => {
      const q = term(query)
      let filter = ''
      if (q) {
        const ids = await clientIdsMatching(ctx.jwt, q)
        const parts = [
          `license_number.ilike.*${enc(q)}*`,
          `application_number.ilike.*${enc(q)}*`,
          `title.ilike.*${enc(q)}*`,
          `cm_l_digits.ilike.*${enc(q)}*`,
        ]
        if (ids.length) parts.push(`client_id.in.(${ids.join(',')})`)
        filter += `&or=(${parts.join(',')})`
      }
      if (client_id) filter += `&client_id=eq.${enc(client_id)}`
      if (status) filter += `&status=eq.${enc(status)}`
      if (project_kind) filter += `&project_kind=eq.${enc(project_kind)}`
      const { data, total } = await userRest(
        ctx.jwt,
        `/bis_projects?select=${PROJECT_LIST}${filter}&order=updated_at.desc&limit=${limit ?? 20}`,
        { headers: { Prefer: 'count=exact' } },
      )
      return asResult({ total, projects: data })
    },
  },
  {
    name: 'get_project',
    path: '/bis/projects',
    title: 'Get BIS project',
    description: 'One BIS licence / application with client, IS code, branch and officer details, the list of filled modules and the file list.',
    inputSchema: { project_id: uuidSchema('BIS project') },
    run: async ({ project_id }, ctx) => {
      const { data } = await userRest(
        ctx.jwt,
        `/bis_projects?id=eq.${enc(project_id)}&select=*,client:clients(id,company_name,manak_user_id),is_code:is_codes(id,is_number,revision_year,title)`,
      )
      const project = Array.isArray(data) ? data[0] : null
      if (!project) return asResult({ error: 'Project not found or not visible to you.' })
      const [modules, files] = await Promise.all([
        userRest(ctx.jwt, `/bis_project_module_data?bis_project_id=eq.${enc(project_id)}&select=module_kind,updated_at&order=module_kind`),
        userRest(ctx.jwt, `/bis_project_files?bis_project_id=eq.${enc(project_id)}&select=id,doc_kind,file_name,file_size,created_at&order=created_at.desc&limit=100`),
      ])
      return asResult({ project, modules: modules.data, files: files.data })
    },
  },
  {
    name: 'get_project_module',
    path: '/bis/projects',
    title: 'Get project module data',
    description: 'The saved data of one module of a BIS project (for example osl-sample-requirements). Use get_project to see which modules exist.',
    inputSchema: { project_id: uuidSchema('BIS project'), module_kind: z.string().min(1).max(80).describe('Module kind from get_project') },
    run: async ({ project_id, module_kind }, ctx) => {
      const { data } = await userRest(
        ctx.jwt,
        `/bis_project_module_data?bis_project_id=eq.${enc(project_id)}&module_kind=eq.${enc(module_kind)}&select=module_kind,payload,updated_at`,
      )
      const row = Array.isArray(data) ? data[0] : null
      return asResult(row ?? { error: 'No data saved for this module.' })
    },
  },
  {
    name: 'get_file_link',
    path: '/bis/projects',
    title: 'Get project file link',
    description: 'A download link (valid 5 minutes) for one BIS project file from get_project.',
    inputSchema: { file_id: uuidSchema('Project file') },
    run: async ({ file_id }, ctx) => {
      const { data } = await userRest(ctx.jwt, `/bis_project_files?id=eq.${enc(file_id)}&select=file_name,storage_path`)
      const file = Array.isArray(data) ? data[0] : null
      if (!file) return asResult({ error: 'File not found or not visible to you.' })
      const url = await userSignedUrl(ctx.jwt, BIS_FILES_BUCKET, file.storage_path, 300)
      return asResult({ file_name: file.file_name, url, expires_in_seconds: 300 })
    },
  },
  {
    name: 'search_noncompliance_cases',
    path: NC_PATH,
    title: 'Search License Non-Conformity cases',
    description:
      'Find License Non-Conformity cases (one case per BIS notice to a licensee: sample failure, show cause, stop marking, suspension …) by firm name, licence number (CM/L), BIS reference or IS number. ' +
      'Optional filters: status (open, reviewed, replied, closed) and notice type (sample_failure, consecutive_nc, show_cause, product_recall, stop_marking, suspension, cancellation, warning, other).',
    inputSchema: {
      query: z.string().max(80).optional().describe('Firm name, CM/L digits, BIS reference'),
      status: z.enum(['open', 'reviewed', 'replied', 'closed']).optional(),
      case_type: z.string().max(40).optional().describe('Notice type, e.g. sample_failure'),
      limit: limitSchema,
    },
    run: async ({ query, status, case_type, limit }, ctx) => {
      const q = term(query)
      let filter = ''
      if (q) {
        const ids = await clientIdsMatching(ctx.jwt, q)
        const parts = [`cm_l_digits.ilike.*${enc(q)}*`, `bis_reference.ilike.*${enc(q)}*`]
        if (ids.length) parts.push(`client_id.in.(${ids.join(',')})`)
        filter += `&or=(${parts.join(',')})`
      }
      if (status) filter += `&status=eq.${enc(status)}`
      if (case_type) filter += `&case_type=eq.${enc(case_type)}`
      const { data, total } = await userRest(
        ctx.jwt,
        `/bis_stop_marking_cases?select=id,client_id,bis_project_id,cm_l_digits,case_type,reason_type,stop_date,status,bis_reference,bis_deadline,reply_date,updated_at,client:clients(id,company_name),is_code:is_codes(id,is_number,revision_year,title)${filter}&order=updated_at.desc&limit=${limit ?? 20}`,
        { headers: { Prefer: 'count=exact' } },
      )
      return asResult({ total, cases: data })
    },
  },
  {
    name: 'get_noncompliance_case',
    path: NC_PATH,
    title: 'Get License Non-Conformity case',
    description:
      'One License Non-Conformity case with everything the five steps hold: (1) the BIS letter facts (bis_reference, bis_reason, review_notes = the points BIS raised, bis_deadline), ' +
      '(2) the test report review (report_details, report_findings = failed parameters with specified / observed values, report_observations = checked against the standard), ' +
      '(3) test_report_module (the case\'s own Sample Offer Letter samples and Factory Test Reports), (4) reply_sections = the reply letter section by section, ' +
      '(5) the supporting documents. Also the licence (branch office, signatory) and the file lists. Use get_noncompliance_file_link to open the BIS letter, test reports or documents.',
    inputSchema: { case_id: uuidSchema('Non-Conformity case') },
    run: async ({ case_id }, ctx) => {
      const { data } = await userRest(
        ctx.jwt,
        `/bis_stop_marking_cases?id=eq.${enc(case_id)}&select=*,client:clients(id,company_name,address,city,state,email,phone),is_code:is_codes(id,is_number,revision_year,title)`,
      )
      const c = Array.isArray(data) ? data[0] : null
      if (!c) return asResult({ error: 'Case not found or not visible to you.' })
      let project = null
      if (c.bis_project_id) {
        try {
          const res = await userRest(
            ctx.jwt,
            `/bis_projects?id=eq.${enc(c.bis_project_id)}&select=id,title,license_number,cm_l_digits,status,branch_name,branch_state,branch_head_name,branch_head_designation,license_validity_date`,
          )
          project = Array.isArray(res.data) ? res.data[0] ?? null : null
        } catch {
          project = 'not visible with your BIS access'
        }
      }
      const files = {
        bis_letter: c.report_path ? { name: c.report_name } : null,
        test_reports: (c.test_reports ?? []).map((d) => ({ id: d.id, name: d.name })),
        documents: (c.documents ?? []).map((d) => ({ id: d.id, label: d.label, name: d.name })),
      }
      const { report_path, test_report_path, ...rest } = c
      return asResult({ case: rest, licence: project, files })
    },
  },
  {
    name: 'get_noncompliance_file_link',
    path: NC_PATH,
    title: 'Get Non-Conformity file link',
    description: 'A download link (valid 5 minutes) for a file of a Non-Conformity case: the BIS letter (which: "letter"), a test report ("test_report" + file_id) or a supporting document ("document" + file_id). File ids come from get_noncompliance_case.',
    inputSchema: {
      case_id: uuidSchema('Non-Conformity case'),
      which: z.enum(['letter', 'test_report', 'document']),
      file_id: z.string().max(60).optional().describe('Id of the test report or document (not needed for the letter)'),
    },
    run: async ({ case_id, which, file_id }, ctx) => {
      const { data } = await userRest(ctx.jwt, `/bis_stop_marking_cases?id=eq.${enc(case_id)}&select=report_path,report_name,test_reports,documents`)
      const c = Array.isArray(data) ? data[0] : null
      if (!c) return asResult({ error: 'Case not found or not visible to you.' })
      let path = ''
      let name = ''
      if (which === 'letter') ({ report_path: path, report_name: name } = { report_path: c.report_path ?? '', report_name: c.report_name ?? '' })
      else {
        const list = which === 'test_report' ? c.test_reports ?? [] : c.documents ?? []
        const f = list.find((d) => d.id === file_id)
        if (f) ({ path, name } = { path: f.path, name: f.name })
      }
      if (!path) return asResult({ error: 'File not found.' })
      const url = await userSignedUrl(ctx.jwt, NC_FILES_BUCKET, path, 300)
      return asResult({ file_name: name, url, expires_in_seconds: 300 })
    },
  },
  {
    name: 'search_is_codes',
    path: '/masters/is-codes',
    title: 'Search IS codes',
    description: 'Find Indian Standards in the IS Code Master by IS number or title.',
    inputSchema: { query: z.string().min(1).max(80).describe('IS number (e.g. 17635) or words from the title'), limit: limitSchema },
    run: async ({ query, limit }, ctx) => {
      const q = term(query)
      const { data } = await userRest(
        ctx.jwt,
        `/is_codes?select=id,is_number,revision_year,title,is_code_title,product_manual_number,amendment_number,testing_charges&archived_at=is.null&or=(is_number.ilike.*${enc(q)}*,title.ilike.*${enc(q)}*,is_code_title.ilike.*${enc(q)}*)&order=is_number&limit=${limit ?? 20}`,
      )
      return asResult({ is_codes: data })
    },
  },
  {
    name: 'get_is_code',
    path: '/masters/is-codes',
    title: 'Get IS code',
    description: 'One IS code with all IS Code Master fields (fees, slabs, product manual, remarks).',
    inputSchema: { is_code_id: uuidSchema('IS code') },
    run: async ({ is_code_id }, ctx) => {
      const { data } = await userRest(ctx.jwt, `/is_codes?id=eq.${enc(is_code_id)}&select=*`)
      return asResult(Array.isArray(data) && data[0] ? data[0] : { error: 'IS code not found or not visible to you.' })
    },
  },
  {
    name: 'search_laboratories',
    path: '/masters/laboratories',
    title: 'Search laboratories',
    description: 'Find testing laboratories in the Laboratory Master by name, OSL code or state.',
    inputSchema: { query: z.string().max(80).optional().describe('Name, OSL code or state'), limit: limitSchema },
    run: async ({ query, limit }, ctx) => {
      const q = term(query)
      const filter = q ? `&or=(name.ilike.*${enc(q)}*,osl_code.ilike.*${enc(q)}*,state.ilike.*${enc(q)}*)` : ''
      const { data } = await userRest(
        ctx.jwt,
        `/laboratories?select=id,name,lab_type,osl_code,state,address,contact_name,email,mobile&archived_at=is.null${filter}&order=name&limit=${limit ?? 20}`,
      )
      return asResult({ laboratories: data })
    },
  },
  {
    name: 'licences_due',
    path: '/bis/projects',
    title: 'Licences due for renewal',
    description: 'BIS licences whose validity ends within the next N days (default 60), oldest first. Set include_expired to also list licences already past validity.',
    inputSchema: {
      days: z.number().int().min(1).max(365).optional().describe('Look-ahead window in days (default 60)'),
      include_expired: z.boolean().optional().describe('Also list licences already expired'),
      limit: limitSchema,
    },
    run: async ({ days, include_expired, limit }, ctx) => {
      const today = istDate()
      const until = istDate((days ?? 60) * 86_400_000)
      const from = include_expired ? '' : `&license_validity_date=gte.${today}`
      const { data } = await userRest(
        ctx.jwt,
        `/bis_projects?select=${PROJECT_LIST}&license_validity_date=lte.${until}${from}&order=license_validity_date.asc&limit=${limit ?? 50}`,
      )
      return asResult({ today, until, licences: data })
    },
  },
]

/** Access level per Module Access path for this user ('none' | 'view' | 'edit'). */
export async function moduleLevels(jwt, paths) {
  const unique = [...new Set(paths.filter(Boolean))]
  const levels = {}
  await Promise.all(
    unique.map(async (p) => {
      try {
        levels[p] = String((await userRpc(jwt, 'app_module_level', { p_path: p })) || 'none')
      } catch {
        levels[p] = 'none'
      }
    }),
  )
  return levels
}
