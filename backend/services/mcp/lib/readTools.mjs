// Read tools for the whole app (owner's decision, 19 Nov 2026): any app table the user can open, the IS Code's
// Required Tests, and the Standards Library. Every call runs with the user's own JWT, so RLS decides the rows; the
// table's Module Access path is also checked, so a table of a module set to None is refused. Nothing here writes.
import * as z from 'zod/v4'
import { userRest, userRpc } from './backend.mjs'
import { resolveLibraryName } from './libraryFolders.mjs'
import { config } from './config.mjs'
import { asResult, moduleLevels, uuidSchema } from './tools.mjs'
import { describeColumns, tableDefinition } from './tableSchema.mjs'

const enc = encodeURIComponent

/**
 * Tables Claude may read, by the Module Access path that opens them in the app. Left out on purpose: the QE Assistant's
 * own conversations, memories and mail (personal), the connector's own mcp_* tables and the LIMS tables no menu opens.
 */
export const READ_TABLES = {
  // BIS
  bis_projects: { path: '/bis/projects', about: 'BIS applications and licences (all kinds), with stage, numbers, dates' },
  bis_project_module_data: { path: '/bis/projects', about: 'Saved module data of a project (payload JSON), e.g. osl-sample-requirements with each sample and its AI conformity check' },
  bis_project_files: { path: '/bis/projects', about: 'Files attached to BIS projects (names and storage paths; use get_file_link for a download link)' },
  license_surveillance: { path: '/bis/surveillance', about: 'Licence surveillance records' },
  bis_renewal_applications: { path: '/bis/license-renewals', about: 'Licence renewal applications' },
  bis_renewal_reminders: { path: '/bis/license-renewals', about: 'Renewal reminder emails sent / planned' },
  bis_renewal_reminder_settings: { path: '/bis/license-renewals', about: 'Renewal reminder settings' },
  bis_stop_marking_cases: { path: '/bis/stop-marking', about: 'License Non-Conformity (stop marking) cases' },
  // Masters
  clients: { path: '/masters/clients', about: 'Client Master' },
  client_sites: { path: '/masters/clients', about: 'Client factory / office sites' },
  client_contacts: { path: '/masters/clients', about: 'Client contact persons' },
  client_certificate_files: { path: '/masters/clients', about: 'Client certificate files' },
  client_master_options: { path: '/masters/clients', about: 'Dropdown options of the Client Master' },
  portal_customers: { path: '/masters/clients', about: 'Customer Portal logins' },
  portal_licence_access: { path: '/masters/clients', about: 'Licences a Customer Portal login can see' },
  portal_services: { path: '/masters/clients', about: 'Customer Portal services' },
  portal_service_payments: { path: '/masters/clients', about: 'Customer Portal service payments' },
  portal_rec_sections: { path: '/masters/clients', about: 'Customer Portal record sections' },
  portal_rec_columns: { path: '/masters/clients', about: 'Customer Portal record columns' },
  is_codes: { path: '/masters/is-codes', about: 'IS Code Master' },
  is_code_files: { path: '/masters/is-codes', about: 'Files of an IS Code (Standard, Product Manual …)' },
  is_code_amendments: { path: '/masters/is-codes', about: 'Amendments of an IS Code' },
  is_code_required_test_lists: { path: '/masters/is-codes', about: 'Lock state and notes of an IS Code\'s Required Tests list (tests are in test_parameters; or use get_required_tests)' },
  is_code_master_options: { path: '/masters/is-codes', about: 'Dropdown options of the IS Code Master' },
  test_parameters: { path: '/masters/is-codes', about: 'Tests of an IS Code (Required Tests: test name, clause, method, unit, requirement, applies to, tested by)' },
  test_parameter_units: { path: '/masters/is-codes', about: 'Units for tests' },
  certification_schemes: { path: '/masters/is-codes', about: 'Certification schemes' },
  products_services_master: { path: '/masters/product-services', about: 'Product & Services master' },
  product_makes: { path: '/masters/product-services', about: 'Product makes' },
  product_item_categories: { path: '/masters/product-services', about: 'Product item categories' },
  gst_rates: { path: '/masters/product-services', about: 'GST rates' },
  laboratories: { path: '/masters/laboratories', about: 'Laboratory Master' },
  lab_master_options: { path: '/masters/laboratories', about: 'Dropdown options of the Laboratory Master' },
  lab_accreditations: { path: '/masters/laboratories', about: 'Laboratory accreditations' },
  accreditation_bodies: { path: '/masters/laboratories', about: 'Accreditation bodies' },
  nabl_scope: { path: '/masters/laboratories', about: 'NABL scope of laboratories' },
  bis_offices: { path: '/masters/bis-branch-offices', about: 'BIS branch offices' },
  // Finance
  quotations: { path: '/finance/sale/quotation', about: 'Quotations (and other sale documents by kind)' },
  quotation_line_items: { path: '/finance/sale/quotation', about: 'Quotation line items' },
  quotation_terms_conditions: { path: '/finance/sale/quotation', about: 'Quotation terms and conditions' },
  quotation_remarks: { path: '/finance/sale/quotation', about: 'Quotation remarks' },
  quotation_notes: { path: '/finance/sale/quotation', about: 'Quotation notes' },
  sale_document_signature_defaults: { path: '/finance/sale/quotation', about: 'Default signatures of sale documents' },
  finance_tax_invoices: { path: '/finance/sale/invoice', about: 'Tax invoices' },
  finance_credit_notes: { path: '/finance/sale/credit-note', about: 'Credit notes' },
  finance_sales_debit_notes: { path: '/finance/sale/debit-note', about: 'Sales debit notes' },
  finance_sales_debit_note_lines: { path: '/finance/sale/debit-note', about: 'Sales debit note lines' },
  finance_purchase_orders: { path: '/finance/purchase/order', about: 'Purchase orders' },
  finance_purchase_order_lines: { path: '/finance/purchase/order', about: 'Purchase order lines' },
  finance_purchase_bills: { path: '/finance/purchase/bill', about: 'Purchase bills' },
  finance_purchase_bill_lines: { path: '/finance/purchase/bill', about: 'Purchase bill lines' },
  finance_debit_notes: { path: '/finance/purchase/debit-note', about: 'Purchase debit notes' },
  finance_debit_note_lines: { path: '/finance/purchase/debit-note', about: 'Purchase debit note lines' },
  finance_expenses: { path: '/finance/expense', about: 'Expenses' },
  expense_categories: { path: '/finance/expense', about: 'Expense categories' },
  transactions: { path: '/finance/ledger', about: 'Ledger transactions (receipts, payments, refunds …)' },
  finance_transaction_audit: { path: '/finance/ledger', about: 'Audit of ledger transactions' },
  finance_accounts: { path: '/finance/accounts', about: 'Chart of accounts' },
  finance_bank_accounts: { path: '/finance/accounts', about: 'Bank accounts' },
  finance_journals: { path: '/finance/journal', about: 'Manual journals' },
  finance_journal_lines: { path: '/finance/journal', about: 'Manual journal lines' },
  // Tools and settings
  website_settings: { path: '/tools/cms', about: 'Public website settings' },
  website_services: { path: '/tools/cms', about: 'Public website services' },
  website_news: { path: '/tools/cms', about: 'Public website news' },
  lab_settings: { path: '/settings/lab', about: 'Company / lab settings' },
  company_settings: { path: '/settings/lab', about: 'Company settings' },
  document_series: { path: '/settings/lab', about: 'Document number series (prefix, next number)' },
  lab_prefixes: { path: '/settings/lab', about: 'Number prefixes' },
  lab_letterheads: { path: '/settings/lab', about: 'Letterheads' },
  lab_documents: { path: '/settings/lab', about: 'Company documents' },
  user_profiles: { path: '/settings/users', about: 'Users (name, email, designation, role, status)' },
  module_access_rules: { path: '/settings/module-access', about: 'Module Access rules' },
  ai_settings: { path: '/settings/ai', about: 'AI settings (keys are never returned)' },
  ai_models: { path: '/settings/ai', about: 'AI models (keys are never returned)' },
  ai_skills: { path: '/settings/ai', about: 'AI skills' },
  email_send_log: { path: '/settings/email-log', about: 'Emails sent by the app' },
  standard_docs: { path: '/settings/standards-library', about: 'Standards Library documents (folder, relpath, kind, pages)' },
  standard_pages: { path: '/settings/standards-library', about: 'Text of each page of a Standards Library document (large: filter by doc_id and page)' },
  standard_list: { path: '/settings/standards-library', about: 'List of standards in the library' },
  standard_refs_status: { path: '/settings/standards-library', about: 'Referenced standards and whether the library has them' },
  standard_index_runs: { path: '/settings/standards-library', about: 'Indexing runs of the Standards Library' },
  standard_sync_requests: { path: '/settings/standards-library', about: '"Sync Now" requests of the Standards Library' },
}

const TABLE_NAMES = Object.keys(READ_TABLES)
const IDENT = /^[a-z_][a-z0-9_]*$/
const OPS = ['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'like', 'ilike', 'is', 'in']

/** "id,title,client:clients(company_name)" — column names, `*`, and one level of embedded tables. */
const SELECT = /^(\*|[a-z_][a-z0-9_]*(:[a-z_][a-z0-9_]*\([a-z0-9_,*]+\))?)(,\s*(\*|[a-z_][a-z0-9_]*(:[a-z_][a-z0-9_]*\([a-z0-9_,*]+\))?))*$/

/** One PostgREST filter, values URL-encoded; `in` takes a comma separated list, `is` only null / true / false. */
export function filterParam(f) {
  if (!IDENT.test(f.column)) throw new Error(`Invalid column name: ${f.column}`)
  const value = String(f.value ?? '')
  if (f.op === 'is') {
    if (!/^(null|true|false)$/i.test(value)) throw new Error('"is" takes null, true or false.')
    return `${f.column}=is.${value.toLowerCase()}`
  }
  if (f.op === 'in') {
    const items = value
      .split(',')
      .map((v) => v.trim())
      .filter(Boolean)
      .map((v) => `"${v.replace(/["\\]/g, '')}"`)
    if (!items.length) throw new Error('"in" needs at least one value.')
    return `${f.column}=in.(${enc(items.join(','))})`
  }
  return `${f.column}=${f.op}.${enc(value)}`
}

async function requireLevel(ctx, table) {
  const spec = READ_TABLES[table]
  if (!spec) throw new Error(`Unknown table: ${table}`)
  const level = (await moduleLevels(ctx.jwt, [spec.path]))[spec.path] || 'none'
  if (level === 'none') {
    const err = new Error(`Your Module Access for ${spec.path} is None, so ${table} cannot be read.`)
    err.status = 403
    throw err
  }
  return spec
}

const filtersSchema = z
  .array(
    z.object({
      column: z.string().min(1).max(63),
      op: z.enum(OPS),
      value: z.string().max(500).describe('For ilike / like use * as the wildcard (e.g. *aluminium*); for in, a comma separated list; for is, null / true / false'),
    }),
  )
  .max(10)
  .optional()

/** The Standards Library folders of an IS Code ("IS 17682", "IS 302 Part 2" …). */
async function foldersFor(ctx, isCodeId) {
  const data = await userRpc(ctx.jwt, 'standard_folders_for_is_code', { p_is_code_id: isCodeId })
  return Array.isArray(data) ? data.map(String) : []
}

let otherFolders = { at: 0, list: [] }

/** "IS:1786", "IS 3025 Part 11" -> "IS 1786" / "IS 3025"; "ASTM E415-21", "ISO/IEC 17025:2017" -> their library folder. */
async function libraryFolder(ctx, name) {
  const quick = resolveLibraryName(name)
  if (quick) return quick.folder
  if (Date.now() - otherFolders.at > 10 * 60_000) {
    try {
      const { data } = await userRest(
        ctx.jwt,
        `/standard_docs?source=eq.library&folder=not.match.${enc('^IS [0-9]')}&select=folder&limit=5000`,
      )
      otherFolders = { at: Date.now(), list: [...new Set((Array.isArray(data) ? data : []).map((r) => String(r.folder)))] }
    } catch {
      /* the name as given is tried */
    }
  }
  return resolveLibraryName(name, otherFolders.list)?.folder ?? String(name).trim()
}

/** The query's embedding from the standards-embed service; null when it is not there (word search only then). */
async function embedQuery(text) {
  try {
    const r = await fetch(`${config.embedUrl}/embed`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ texts: [String(text).slice(0, 2000)] }),
      signal: AbortSignal.timeout(15_000),
    })
    const data = await r.json().catch(() => ({}))
    if (!r.ok || !Array.isArray(data?.vectors?.[0]) || !data.model) return null
    return { vector: `[${data.vectors[0].join(',')}]`, model: String(data.model) }
  } catch {
    return null
  }
}

export const READ_TOOLS = [
  {
    name: 'list_app_tables',
    path: null,
    title: 'List app tables',
    description:
      'Every Consultancy Pro table read_table can read, with what it holds, the menu (Module Access path) it belongs to and what you can change in it (can_change: create / update / delete); tables of a module set to None for you are left out.',
    inputSchema: {},
    run: async (_args, ctx) => {
      const levels = await moduleLevels(ctx.jwt, Object.values(READ_TABLES).map((t) => t.path))
      // Loaded here: writeTools imports this file.
      const { RECORD_TABLES } = config.writeEnabled ? await import('./writeTools.mjs') : { RECORD_TABLES: {} }
      const tables = TABLE_NAMES.filter((n) => (levels[READ_TABLES[n].path] || 'none') !== 'none').map((n) => ({
        table: n,
        module: READ_TABLES[n].path,
        access: levels[READ_TABLES[n].path],
        about: READ_TABLES[n].about,
        can_change: levels[READ_TABLES[n].path] === 'edit' && RECORD_TABLES[n] ? RECORD_TABLES[n].ops : [],
      }))
      return asResult({ tables })
    },
  },
  {
    name: 'describe_table',
    path: null,
    title: 'Describe an app table',
    description:
      'The columns of one Consultancy Pro table (see list_app_tables): type, allowed values, which are required for a new row, ' +
      'defaults and which can be set. Use it before create_record / update_record.',
    inputSchema: { table: z.enum(TABLE_NAMES).describe('Table name from list_app_tables') },
    run: async ({ table }, ctx) => {
      const spec = await requireLevel(ctx, table)
      const def = await tableDefinition(ctx, table)
      return asResult({ table, module: spec.path, about: spec.about, columns: describeColumns(def) })
    },
  },
  {
    name: 'read_table',
    path: null,
    title: 'Read an app table',
    description:
      'Rows of one Consultancy Pro table (see list_app_tables), read as you — Module Access and row-level security apply. Pick columns with select, narrow with filters, sort with order. Read-only.',
    inputSchema: {
      table: z.enum(TABLE_NAMES).describe('Table name from list_app_tables'),
      select: z.string().max(400).optional().describe('Columns, e.g. "id,title,status" or "*" (default), or an embedded table "client:clients(company_name)"'),
      filters: filtersSchema,
      order: z.string().max(63).optional().describe('Column to sort by'),
      ascending: z.boolean().optional().describe('Sort ascending (default false: newest / largest first)'),
      limit: z.number().int().min(1).max(100).optional().describe('Rows (default 20, max 100)'),
      offset: z.number().int().min(0).max(100_000).optional().describe('Rows to skip, for the next page'),
    },
    run: async ({ table, select, filters, order, ascending, limit, offset }, ctx) => {
      await requireLevel(ctx, table)
      const cols = (select ?? '*').replace(/\s+/g, '')
      if (!SELECT.test(cols)) throw new Error('select takes column names separated by commas, * or one embedded table such as client:clients(company_name).')
      if (order && !IDENT.test(order)) throw new Error(`Invalid order column: ${order}`)
      const params = [`select=${enc(cols)}`, ...(filters ?? []).map(filterParam)]
      if (order) params.push(`order=${order}.${ascending ? 'asc' : 'desc'}`)
      params.push(`limit=${limit ?? 20}`, `offset=${offset ?? 0}`)
      const { data, total } = await userRest(ctx.jwt, `/${table}?${params.join('&')}`, { headers: { Prefer: 'count=exact' } })
      return asResult({ table, total, offset: offset ?? 0, rows: data })
    },
  },
  {
    name: 'get_required_tests',
    path: '/masters/is-codes',
    title: 'Get Required Tests of an IS Code',
    description:
      'The IS Code\'s Required Tests list (the one list of tests per IS Code): each test with clause, method, unit, requirement, applies to and tested by (Lab / Factory), and whether the list is locked — the AI Conformity Check uses only a locked list.',
    inputSchema: { is_code_id: uuidSchema('IS code') },
    run: async ({ is_code_id }, ctx) => {
      const [tests, list] = await Promise.all([
        userRest(
          ctx.jwt,
          `/test_parameters?is_code_id=eq.${enc(is_code_id)}&archived_at=is.null&select=id,item_name,test_name,clause_no,test_method,unit_value,specific_requirement,applies_to,tested_by,source,possible_in_a_day&order=display_order.asc.nullsfirst,item_name.asc`,
        ),
        userRest(ctx.jwt, `/is_code_required_test_lists?is_code_id=eq.${enc(is_code_id)}&select=locked_at,notes`),
      ])
      const meta = Array.isArray(list.data) ? list.data[0] ?? null : null
      return asResult({ locked: Boolean(meta?.locked_at), locked_at: meta?.locked_at ?? null, notes: meta?.notes ?? '', tests: tests.data })
    },
  },
  {
    name: 'search_library',
    path: '/settings/standards-library',
    title: 'Search the Standards Library (words + meaning)',
    description:
      'The search behind the app\'s Ask AI: best-matching passages (clauses, table rows, page text) of the whole ' +
      'Standards Library, found by words and by meaning together. Put the IS numbers the question names in "folders" ' +
      'to stay within those standards; leave it out for questions without an IS number. Current editions only unless ' +
      'include_old. A table passage may hold CELLS lines (each row\'s columns as "Column: value", read by position): ' +
      'take numbers from them. Use English words in the standard\'s own terms (e.g. "high strength deformed steel ' +
      'bars elongation", not "TMT"). Answer only from the passages and name the IS, clause / table and page; read a ' +
      'whole page with get_standard_page when a passage is cut.',
    inputSchema: {
      query: z.string().min(2).max(500).describe('English search words or the question, e.g. "Fe 500D elongation TS/YS ratio"'),
      folders: z.array(z.string().max(80)).max(10).optional().describe('Standard numbers, e.g. ["IS 1786"], ["IS 3025 Part 11"], ["ASTM D445"], ["ISO/IEC 17025"]'),
      include_old: z.boolean().optional().describe('Also Superseded / Withdrawn editions'),
      limit: z.number().int().min(1).max(40).optional().describe('Passages (default 20)'),
      per_doc: z.number().int().min(1).max(10).optional().describe('At most this many per document (default 6 with folders, 3 without)'),
    },
    run: async ({ query, folders, include_old, limit, per_doc }, ctx) => {
      const list = [...new Set((await Promise.all((folders ?? []).map((f) => libraryFolder(ctx, f)))).filter(Boolean))]
      const common = {
        p_query: query,
        p_limit: limit ?? 20,
        p_per_doc: per_doc ?? (list.length ? 6 : 3),
        p_current_only: !include_old,
        ...(list.length ? { p_folders: list } : {}),
      }
      const meaning = await embedQuery(query)
      const data = meaning
        ? await userRpc(ctx.jwt, 'search_library_hybrid', { ...common, p_embedding: meaning.vector, p_model: meaning.model })
        : await userRpc(ctx.jwt, 'search_library_chunks', common)
      const passages = (Array.isArray(data) ? data : []).map((c) => ({
        folder: c.folder,
        relpath: c.relpath,
        document: c.doc_kind,
        edition: c.version_status ?? 'Current',
        kind: c.kind,
        page: c.page,
        heading: c.heading || undefined,
        text: String(c.text ?? '').slice(0, 4000),
      }))
      return asResult({ search: meaning ? 'words + meaning' : 'words only', folders: list, passages })
    },
  },
  {
    name: 'find_standards',
    path: '/settings/standards-library',
    title: 'Find standards in the Standards Library',
    description:
      'Documents of the Standards Library whose folder or file name matches (e.g. "IS 737", "17682"), or the folders and documents of an IS Code — to see whether a standard, its revision, amendments and Product Manual are in the library.',
    inputSchema: {
      query: z.string().max(80).optional().describe('IS number or words of the folder / file name'),
      is_code_id: uuidSchema('IS code').optional(),
      limit: z.number().int().min(1).max(100).optional(),
    },
    run: async ({ query, is_code_id, limit }, ctx) => {
      const folders = is_code_id ? await foldersFor(ctx, is_code_id) : []
      const q = String(query ?? '').replace(/[,()*%\\"']/g, ' ').trim()
      if (!folders.length && !q) return asResult({ error: 'Give a query or an IS code id (the IS code has no library folder).' })
      const filter = folders.length
        ? `folder=in.(${enc(folders.map((f) => `"${f.replace(/"/g, '')}"`).join(','))})`
        : `or=(folder.ilike.*${enc(q)}*,relpath.ilike.*${enc(q)}*)`
      const { data } = await userRest(ctx.jwt, `/standard_docs?select=id,folder,relpath,kind,pages&${filter}&order=folder.asc,relpath.asc&limit=${limit ?? 50}`)
      return asResult({ folders, documents: data })
    },
  },
  {
    name: 'search_standard_pages',
    path: '/settings/standards-library',
    title: 'Search Standards Library pages',
    description:
      'Best-matching page texts of the Standards Library for some words (the same search the AI Conformity Check uses), within an IS Code\'s folders or the given folders; optionally only some documents (relpaths) or kinds (Standard, Amendment, Product Manual).',
    inputSchema: {
      words: z.string().min(2).max(500).describe('Words to look for, e.g. "aluminium sheet thickness tolerance"'),
      is_code_id: uuidSchema('IS code').optional(),
      folders: z.array(z.string().max(80)).max(10).optional().describe('Library folders, e.g. ["IS 737"]'),
      relpaths: z.array(z.string().max(300)).max(10).optional().describe('Only these documents (relpath from find_standards)'),
      kinds: z.array(z.string().max(40)).max(5).optional().describe('e.g. ["Standard","Amendment"]'),
      limit: z.number().int().min(1).max(20).optional().describe('Pages (default 8)'),
    },
    run: async ({ words, is_code_id, folders, relpaths, kinds, limit }, ctx) => {
      const list = [...(folders ?? []), ...(is_code_id ? await foldersFor(ctx, is_code_id) : [])]
      if (!list.length) return asResult({ error: 'Give folders or an IS code id that has library folders.' })
      const data = await userRpc(ctx.jwt, 'search_standard_pages', {
        p_folders: list,
        p_query: words,
        p_limit: limit ?? 8,
        ...(kinds?.length ? { p_kinds: kinds } : {}),
        ...(relpaths?.length ? { p_relpaths: relpaths } : {}),
      })
      return asResult({ folders: list, pages: data })
    },
  },
  {
    name: 'get_standard_page',
    path: '/settings/standards-library',
    title: 'Get one Standards Library page',
    description: 'The text of one page of a Standards Library document (relpath from find_standards or search_standard_pages).',
    inputSchema: { relpath: z.string().min(3).max(300), page: z.number().int().min(1).max(2000) },
    run: async ({ relpath, page }, ctx) => {
      const { data: docs } = await userRest(ctx.jwt, `/standard_docs?relpath=eq.${enc(relpath)}&select=id,folder,relpath,kind,pages`)
      const doc = Array.isArray(docs) ? docs[0] : null
      if (!doc) return asResult({ error: 'No such document in the Standards Library.' })
      const { data } = await userRest(ctx.jwt, `/standard_pages?doc_id=eq.${enc(doc.id)}&page=eq.${page}&select=page,text`)
      return asResult({ ...doc, page, text: Array.isArray(data) && data[0] ? data[0].text : null })
    },
  },
]
