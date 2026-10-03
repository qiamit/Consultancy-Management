import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { extractText, getDocumentProxy } from 'https://esm.sh/unpdf@0.12.1'
import {
  executeLimsCrud,
  getAllowedTables,
  LIMS_CRUD_TOOL,
  type CrudActionInput,
  type CrudActionResult,
} from './limsCrud.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-user-jwt',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

type ChatMessage = { role: 'user' | 'assistant'; content: string }

type QiAssistantBody = {
  page?: string
  message?: string
  context?: string
  history?: ChatMessage[]
  /** IS Code Master row — loads metadata + PDF text from is-code-files bucket */
  isCodeId?: string
  /** Row opened via per-row Ask AI (e.g. test parameter sparkle) */
  activeRecordId?: string
  activeRecordTable?: string
  /** Skill selected with ! in chat — only this skill's instructions apply */
  activeSkillId?: string
  action?: 'chat' | 'import_is_code_pdf'
  importPdf?: { fileName: string; pdfBase64: string }
  /** Multiple chat-attached PDFs (text extracted into context). */
  importPdfs?: Array<{ fileName: string; pdfBase64: string }>
}

const MAX_IMPORT_PDF_BYTES = 5 * 1024 * 1024

const AI_SETTINGS_ID = '00000000-0000-0000-0000-000000000002'
const IS_CODE_FILES_BUCKET = 'is-code-files'
const SAMPLE_CLIENT_REFERENCES_BUCKET = 'sample-client-references'
const MAX_IS_CODE_PDFS = 5
const MAX_CHARS_PER_PDF = 28_000

function resolveApiBase(provider: string, apiBaseUrl: string | null): string {
  if (apiBaseUrl?.trim()) return apiBaseUrl.trim().replace(/\/$/, '')
  if (provider === 'openrouter') return 'https://openrouter.ai/api/v1'
  if (provider === 'google') return 'https://generativelanguage.googleapis.com/v1beta/openai'
  // DeepSeek is OpenAI-compatible; /v1 is appended by chat completions path
  if (provider === 'deepseek') return 'https://api.deepseek.com/v1'
  return 'https://api.openai.com/v1'
}

function normalizeModelId(provider: string, modelId: string): string {
  const id = modelId.trim()
  if (provider === 'google' && id.startsWith('models/')) {
    return id.slice('models/'.length)
  }
  return id
}

function isPdfFile(fileName: string, storagePath: string): boolean {
  const n = fileName.toLowerCase()
  const p = storagePath.toLowerCase()
  return n.endsWith('.pdf') || p.endsWith('.pdf')
}

async function extractPdfText(bytes: Uint8Array): Promise<string> {
  const pdf = await getDocumentProxy(bytes)
  const { text } = await extractText(pdf, { mergePages: true })
  return typeof text === 'string' ? text : String(text ?? '')
}

async function buildIsCodeNotebookContext(admin: SupabaseClient, isCodeId: string): Promise<string> {
  const { data: row, error: rowErr } = await admin.from('is_codes').select('*').eq('id', isCodeId).maybeSingle()
  if (rowErr || !row) {
    return `IS code id ${isCodeId} was not found.`
  }

  const rev = row.revision_year ? String(row.revision_year) : ''
  const label = rev ? `${row.is_number}: ${rev}` : String(row.is_number)

  const lines: string[] = [
    '=== NOTEBOOK SOURCE: ONE INDIAN STANDARD (IS CODE) ===',
    `IS Number: ${row.is_number}`,
    `Revision year: ${rev || '-'}`,
    `Display: ${label}`,
    `Title: ${row.title}`,
    `Aspect: ${row.aspect}`,
    `Reaffirmation year: ${row.reaffirmation_year ?? '-'}`,
    `Amendment: ${row.amendment_number ?? '-'}`,
    `Testing charges (Rs): ${row.testing_charges ?? '-'}`,
    `Remarks: ${row.remarks ?? '-'}`,
    '',
    '=== UPLOADED PDF DOCUMENTS (text extracted from storage) ===',
  ]

  const { data: files } = await admin
    .from('is_code_files')
    .select('file_name, storage_path')
    .eq('is_code_id', isCodeId)
    .order('created_at', { ascending: false })
    .limit(MAX_IS_CODE_PDFS)

  let fileList = Array.isArray(files) ? files : []

  if (fileList.length === 0) {
    const { data: objects } = await admin.storage.from(IS_CODE_FILES_BUCKET).list(isCodeId, {
      limit: MAX_IS_CODE_PDFS,
    })
    const fromStorage = (Array.isArray(objects) ? objects : [])
      .map((o) => {
        const name = String((o as { name?: string }).name ?? '')
        if (!name) return null
        return { file_name: name, storage_path: `${isCodeId}/${name}` }
      })
      .filter((x): x is { file_name: string; storage_path: string } => x !== null)
    fileList = fromStorage
  }

  if (fileList.length === 0) {
    lines.push('(No PDF files for this IS code. Upload via View Files on IS Code Master.)')
    return lines.join('\n')
  }

  for (const f of fileList) {
    const fileName = String(f.file_name ?? 'document')
    const storagePath = String(f.storage_path ?? '')
    if (!storagePath) continue

    if (!isPdfFile(fileName, storagePath)) {
      lines.push(`\n--- File: ${fileName} ---\n(Skipped: not a PDF.)`)
      continue
    }

    const { data: blob, error: dlErr } = await admin.storage.from(IS_CODE_FILES_BUCKET).download(storagePath)
    if (dlErr || !blob) {
      lines.push(`\n--- File: ${fileName} ---\n(Could not download from storage: ${dlErr?.message ?? 'unknown error'})`)
      continue
    }

    try {
      const bytes = new Uint8Array(await blob.arrayBuffer())
      const raw = await extractPdfText(bytes)
      const text = raw.trim().slice(0, MAX_CHARS_PER_PDF)
      lines.push(
        `\n--- File: ${fileName} ---\n${text.length > 0 ? text : '(PDF had no extractable text — may be scanned images.)'}`,
      )
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'extract failed'
      lines.push(`\n--- File: ${fileName} ---\n(Could not read PDF: ${msg})`)
    }
  }

  return lines.join('\n')
}

function decodeBase64Pdf(b64: string): Uint8Array {
  const clean = b64.replace(/\s/g, '')
  const binary = atob(clean)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

async function attachIsCodePdf(
  client: SupabaseClient,
  isCodeId: string,
  fileName: string,
  bytes: Uint8Array,
): Promise<{ ok: boolean; message: string }> {
  const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_')
  const path = `${isCodeId}/${crypto.randomUUID()}_${safeName}`
  const blob = new Blob([bytes], { type: 'application/pdf' })
  const { error: upErr } = await client.storage.from(IS_CODE_FILES_BUCKET).upload(path, blob, {
    upsert: false,
    contentType: 'application/pdf',
  })
  if (upErr) return { ok: false, message: upErr.message }
  const { error: metaErr } = await client.from('is_code_files').insert({
    is_code_id: isCodeId,
    file_name: fileName,
    storage_path: path,
  })
  if (metaErr) return { ok: false, message: metaErr.message }
  return { ok: true, message: 'PDF attached to IS code.' }
}

async function attachSampleClientReference(
  client: SupabaseClient,
  sampleId: string,
  fileName: string,
  bytes: Uint8Array,
): Promise<{ ok: boolean; message: string; path?: string }> {
  const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_')
  const path = `${sampleId}/${crypto.randomUUID()}_${safeName}`
  const blob = new Blob([bytes], { type: 'application/pdf' })
  const { error: upErr } = await client.storage.from(SAMPLE_CLIENT_REFERENCES_BUCKET).upload(path, blob, {
    upsert: false,
    contentType: 'application/pdf',
  })
  if (upErr) return { ok: false, message: upErr.message }
  const { error: metaErr } = await client.from('samples').update({ client_references_path: path }).eq('id', sampleId)
  if (metaErr) return { ok: false, message: metaErr.message }
  return { ok: true, message: 'Test request PDF linked to sample.', path }
}

function extractAiError(payload: unknown, status: number): string {
  if (typeof payload !== 'object' || !payload) return `AI request failed (${status})`
  const p = payload as Record<string, unknown>
  const err = p.error
  if (typeof err === 'object' && err && 'message' in err) {
    return String((err as { message?: unknown }).message ?? 'AI request failed')
  }
  if (typeof err === 'string') return err
  if (typeof p.message === 'string') return p.message
  return `AI request failed (${status})`
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405, headers: corsHeaders })
  }

  const userJwt = req.headers.get('x-user-jwt')
  if (!userJwt) {
    return new Response(JSON.stringify({ error: 'Missing x-user-jwt header' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const url = Deno.env.get('SUPABASE_URL')
  const serviceRoleKey = Deno.env.get('SERVICE_ROLE_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!url || !serviceRoleKey) {
    return new Response(JSON.stringify({ error: 'Missing Supabase configuration' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const admin = createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const { data: callerData, error: callerError } = await admin.auth.getUser(userJwt)
  if (callerError || !callerData?.user) {
    return new Response(JSON.stringify({ error: 'Invalid session' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const body = (await req.json().catch(() => null)) as QiAssistantBody | null
  const isPdfImport = body?.action === 'import_is_code_pdf'
  if (!body || (!isPdfImport && !body.message?.trim())) {
    return new Response(JSON.stringify({ error: 'message is required' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
  if (isPdfImport && !body.importPdf?.pdfBase64?.trim()) {
    return new Response(JSON.stringify({ error: 'importPdf.pdfBase64 is required' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const { data: settings } = await admin.from('ai_settings').select('*').eq('id', AI_SETTINGS_ID).maybeSingle()

  // AI is always available when models are configured; Show/Hide is UI-only (frontend).
  // `ai_enabled` in ai_settings controls button visibility, not API access.
  let modelQuery = admin.from('ai_models').select('*').eq('is_active', true)
  if (settings?.default_model_id) {
    modelQuery = modelQuery.eq('id', settings.default_model_id)
  } else {
    modelQuery = modelQuery.eq('is_default', true)
  }

  let { data: model } = await modelQuery.maybeSingle()

  if (!model) {
    const fallback = await admin
      .from('ai_models')
      .select('*')
      .eq('is_active', true)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle()
    model = fallback.data
  }

  if (!model?.api_key?.trim()) {
    return new Response(
      JSON.stringify({
        error: 'No AI model with API key configured. Go to AI Settings → AI Models and add a default model.',
      }),
      {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    )
  }

  const provider = String(model.provider ?? 'openai')
  if (provider === 'anthropic') {
    return new Response(
      JSON.stringify({
        error:
          'Provider "anthropic" is not yet supported in QI Assistant. Use Google Gemini, OpenAI, DeepSeek, OpenRouter, or Custom with an OpenAI-compatible base URL.',
      }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }

  let skillsBlock = ''
  if (body.activeSkillId?.trim()) {
    const { data: activeSkill } = await admin
      .from('ai_skills')
      .select('name, instructions')
      .eq('id', body.activeSkillId.trim())
      .eq('is_enabled', true)
      .maybeSingle()
    if (activeSkill) {
      skillsBlock = [
        'ACTIVE SKILL (user selected with ! in chat — follow these rules for this message):',
        `### ${activeSkill.name}`,
        String(activeSkill.instructions ?? ''),
      ].join('\n')
    }
  }

  if (!skillsBlock) {
    const { data: skills } = await admin
      .from('ai_skills')
      .select('name, instructions')
      .eq('is_enabled', true)
      .order('sort_order', { ascending: true })
      .limit(5)

    skillsBlock =
      skills && skills.length > 0
        ? `Enabled skills:\n${skills.map((s) => `### ${s.name}\n${s.instructions}`).join('\n\n')}`
        : ''
  }

  const agentCrudEnabled = settings?.agent_crud_enabled !== false
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
  const userClient =
    anonKey && agentCrudEnabled
      ? createClient(url, anonKey, {
          global: { headers: { Authorization: `Bearer ${userJwt}` } },
          auth: { persistSession: false, autoRefreshToken: false },
        })
      : null

  const apiBase = resolveApiBase(provider, model.api_base_url)
  const modelId = normalizeModelId(provider, String(model.model_id ?? ''))
  const temperature = Number(settings?.temperature ?? 0.7)
  const maxTokens = Number(settings?.max_tokens ?? 4096)

  if (isPdfImport) {
    if (!agentCrudEnabled || !userClient) {
      return new Response(JSON.stringify({ error: 'AI data changes are disabled in AI Settings.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    let pdfBytes: Uint8Array
    try {
      pdfBytes = decodeBase64Pdf(body.importPdf!.pdfBase64)
    } catch {
      return new Response(JSON.stringify({ error: 'Invalid PDF data' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    if (pdfBytes.length > MAX_IMPORT_PDF_BYTES) {
      return new Response(JSON.stringify({ error: 'PDF must be 5 MB or smaller' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const fileName = String(body.importPdf!.fileName || 'standard.pdf')
    let pdfText = ''
    try {
      pdfText = (await extractPdfText(pdfBytes)).trim().slice(0, MAX_CHARS_PER_PDF)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'PDF read failed'
      return new Response(JSON.stringify({ error: `Could not read PDF: ${msg}` }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const importPrompt = [
      'The user uploaded an Indian Standard (IS) PDF to create a NEW is_codes record in Qirlpl LIMS.',
      `PDF file name: ${fileName}`,
      '',
      '=== PDF TEXT (extracted) ===',
      pdfText.length > 0 ? pdfText : '(No extractable text — use file name and ask user to verify fields.)',
      '',
      'TASK: Use lims_crud with operation create on table is_codes.',
      'Required columns: is_number, title, aspect (use "Specification" if unclear).',
      'Optional: revision_year, reaffirmation_year, amendment_number, testing_charges, remarks.',
      'Extract values from the PDF text. Then briefly confirm what you created.',
    ].join('\n')

    type ChatMsg = Record<string, unknown>
    const chatMessages: ChatMsg[] = [
      {
        role: 'system',
        content: [
          settings?.system_prompt_prefix ? String(settings.system_prompt_prefix) : '',
          'You create LIMS data from uploaded IS standard PDFs. Always call lims_crud to insert is_codes.',
          skillsBlock,
        ]
          .filter((p) => p.trim().length > 0)
          .join('\n\n'),
      },
      { role: 'user', content: importPrompt },
    ]

    const actionsExecuted: CrudActionResult[] = []
    let reply = ''

    for (let round = 0; round < 6; round++) {
      const aiRes = await fetch(`${apiBase}/chat/completions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${model.api_key}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: modelId,
          messages: chatMessages,
          tools: [LIMS_CRUD_TOOL],
          tool_choice: 'auto',
          temperature: Number.isFinite(temperature) ? Math.min(temperature, 0.5) : 0.4,
          max_tokens: Number.isFinite(maxTokens) ? Math.min(maxTokens, 8192) : 4096,
        }),
      })

      const aiPayload = await aiRes.json().catch(() => ({}))
      if (!aiRes.ok) {
        const errMsg = extractAiError(aiPayload, aiRes.status)
        return new Response(JSON.stringify({ error: errMsg }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      const choice = (aiPayload as { choices?: Array<{ message?: Record<string, unknown> }> }).choices?.[0]
        ?.message
      if (!choice) break

      const toolCalls = choice.tool_calls as Array<{
        id: string
        function: { name: string; arguments: string }
      }> | undefined

      if (!toolCalls?.length) {
        reply = String(choice.content ?? '').trim()
        break
      }

      chatMessages.push(choice)
      for (const tc of toolCalls) {
        if (tc.function?.name !== 'lims_crud') continue
        let parsed: CrudActionInput
        try {
          parsed = JSON.parse(tc.function.arguments || '{}') as CrudActionInput
        } catch {
          continue
        }
        const result = await executeLimsCrud(userClient, 'is-codes', parsed)
        actionsExecuted.push(result)
        chatMessages.push({ role: 'tool', tool_call_id: tc.id, content: JSON.stringify(result) })
      }
    }

    const created = actionsExecuted.find(
      (a) => a.ok && a.table === 'is_codes' && a.operation === 'create' && a.id,
    )
    if (created?.id) {
      const attach = await attachIsCodePdf(userClient, created.id, fileName, pdfBytes)
      actionsExecuted.push({
        operation: 'create',
        table: 'is_code_files',
        id: created.id,
        ok: attach.ok,
        message: attach.message,
      })
    }

    if (!reply) {
      reply = created?.id
        ? `Created IS code from PDF (id: ${created.id}).`
        : 'Could not create IS code from PDF. Check fields and try again.'
    }

    return new Response(
      JSON.stringify({
        reply,
        actionsExecuted: actionsExecuted.length > 0 ? actionsExecuted : undefined,
        createdIsCodeId: created?.id,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    )
  }

  let attachedPdfBytes: Uint8Array | null = null
  let attachedPdfFileName = ''

  const pdfAttachments: Array<{ fileName: string; pdfBase64: string }> = []
  if (Array.isArray(body.importPdfs)) {
    for (const item of body.importPdfs) {
      if (item?.pdfBase64?.trim()) {
        pdfAttachments.push({
          fileName: String(item.fileName || 'attached.pdf'),
          pdfBase64: item.pdfBase64,
        })
      }
    }
  }
  if (pdfAttachments.length === 0 && body.importPdf?.pdfBase64?.trim()) {
    pdfAttachments.push({
      fileName: String(body.importPdf.fileName || 'attached.pdf'),
      pdfBase64: body.importPdf.pdfBase64,
    })
  }

  if (pdfAttachments.length > 0 && body.message?.trim()) {
    const attachBlocks: string[] = []
    try {
      for (let i = 0; i < pdfAttachments.length; i++) {
        const item = pdfAttachments[i]!
        const bytes = decodeBase64Pdf(item.pdfBase64)
        if (bytes.length > MAX_IMPORT_PDF_BYTES) {
          return new Response(
            JSON.stringify({ error: `PDF "${item.fileName}" must be 5 MB or smaller` }),
            {
              status: 400,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            },
          )
        }
        if (i === 0) {
          attachedPdfBytes = bytes
          attachedPdfFileName = item.fileName
        }
        let pdfText = ''
        try {
          pdfText = (await extractPdfText(bytes)).trim().slice(0, MAX_CHARS_PER_PDF)
        } catch {
          pdfText = '(Could not extract text from attached PDF.)'
        }
        attachBlocks.push(
          [
            `=== USER-ATTACHED PDF ${i + 1}/${pdfAttachments.length} ===`,
            `File: ${item.fileName}`,
            pdfText,
          ].join('\n'),
        )
      }
      const attachBlock = [
        ...attachBlocks,
        'Follow the user message below. Use attached PDF text as reference only when asked.',
        'Do not invent content that contradicts the PDFs.',
      ].join('\n\n')
      const ctx = body.context?.trim() ?? ''
      body.context = ctx ? `${ctx}\n\n${attachBlock}` : attachBlock
    } catch {
      return new Response(JSON.stringify({ error: 'Invalid attached PDF data' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
  }

  let pageData = body.context?.trim() ?? ''
  if (body.isCodeId?.trim()) {
    const notebookContext = await buildIsCodeNotebookContext(admin, body.isCodeId.trim())
    pageData = pageData ? `${notebookContext}\n\n---\n\n${pageData}` : notebookContext
  }

  const isDraftReportReview =
    body.page?.trim() === 'samples/report-preparation' &&
    (pageData.includes('DRAFT TEST REPORT') || pageData.includes('Test Report Review Assistant'))

  const isIssuedReportReview =
    body.page?.trim() === 'samples/issued-test-report' &&
    (pageData.includes('Issued Test Report Assistant') ||
      pageData.includes('ISSUED TEST REPORT CONTENT'))

  const isCodeNotebookPrimary =
    Boolean(body.isCodeId?.trim()) &&
    !isDraftReportReview &&
    !isIssuedReportReview &&
    (!body.activeRecordTable?.trim() || body.activeRecordTable.trim() === 'is_codes')

  const isTestParamImportMode =
    body.page?.trim() === 'test-parameter' &&
    Boolean(body.isCodeId?.trim()) &&
    body.activeRecordTable?.trim() !== 'test_parameters'

  const isSampleReceivingImportMode =
    body.page?.trim() === 'samples/receiving' &&
    Boolean(attachedPdfBytes && attachedPdfBytes.length > 0)

  const isCodeNotebookRules = isDraftReportReview
    ? [
        'TEST REPORT REVIEW (draft, pre-issue): IS standard PDF excerpts below are reference for Part C cross-check only.',
        'Follow the **Test Report Review Assistant** instructions in Page data — they take priority over notebook-style IS-only answers.',
        'When the user asks for full review, complete review, pre-issue review, or Final Verdict, you MUST cover all four steps: (1) IS codes & test methods, (2) Part A customer/sample, (3) complete report Parts B–D and results, (4) ## Final Verdict with **Status:** OK | NOT OK.',
        'Use Part A, B, C, and D from Page data. Do not limit your answer to IS PDF content only.',
      ].join(' ')
    : isIssuedReportReview
      ? [
          'ISSUED TEST REPORT REVIEW: IS PDF excerpts are reference material for cross-checking results and methods.',
          'Follow the **Issued Test Report Assistant** instructions in Page data.',
          'For full or complete review, cover customer/sample info, results vs requirements, and end with ## Review Outcome (**Status:** OK | NEEDS ATTENTION).',
        ].join(' ')
      : isTestParamImportMode
    ? [
        'TEST PARAMETER IMPORT (Test Parameter Master + selected IS Code): Read the IS standard PDF excerpts below.',
        `When the user asks to import, extract, or add test parameters, use lims_crud with operation create on table test_parameters for each distinct test/clause found in the PDF.`,
        `Always set is_code_id to "${body.isCodeId!.trim()}" and is_code_label from the IS metadata display label in the notebook context.`,
        'Required column: item_name (e.g. Carbon, Yield Strength). Optional: clause_no, unit_value, test_method, specific_requirement, uncertainty_mu, department, designation.',
        'test_method may default to the IS code label if not specified in the PDF.',
        'Skip creating a row if Page data already lists the same item_name + clause_no for this IS.',
        'Call lims_crud once per test parameter. After all creates, summarize count and names added.',
        'Ground every field in the PDF; if unclear, use best effort and mention uncertainty in the reply.',
      ].join(' ')
    : isSampleReceivingImportMode
      ? [
          'SAMPLE RECEIVING IMPORT: The user attached a Test Request PDF (text is in Page data).',
          'When they ask to register, add, or import the sample, use lims_crud with operation create on table samples.',
          'Extract customer, sample details, IS standard, tests required, quantities, references, and dates from the PDF.',
          'Omit srf_number — the system auto-generates it. Set stage=receiving and sample_receiving_status=Received unless PDF says otherwise.',
          'Use client_id from Page data clients list (match company name). Use test_report_is_code_id from IS codes list.',
          'If client is missing, create clients row first then create sample with returned client_id.',
          'Set review defaults: competent_person_available, equipment_available, can_complete_within_time, testing_method_available, sampling_procedure_ref = true unless PDF indicates otherwise.',
          'tentative_date_required and tentative_date_by_lab default to receiving date + 10 days if not in PDF.',
          'One PDF usually means one sample; create multiple samples only if the PDF clearly lists separate items.',
          'After create, the system links the uploaded PDF as client reference on the sample.',
        ].join(' ')
      : isCodeNotebookPrimary
      ? [
          'NOTEBOOK MODE (IS Code row): Answer ONLY about this single Indian Standard using the metadata and PDF excerpts below.',
          'Behave like NotebookLM: ground every answer in the provided documents; do not use outside knowledge for technical requirements.',
          'If the answer is not in the documents, say clearly that it was not found in the uploaded PDFs.',
          'When possible, mention which file name the information came from.',
          'Do not mix requirements from other IS standards.',
        ].join(' ')
      : body.isCodeId?.trim() && body.activeRecordTable?.trim() === 'test_parameters'
        ? 'Linked IS standard PDFs are provided for reference when discussing this test parameter. Ground technical answers in those PDFs when relevant; CRUD updates apply to test_parameters using the active record id.'
        : ''

  const allowedTables = [...getAllowedTables(body.page)]

  const crudActiveId = body.activeRecordId?.trim() || (isCodeNotebookPrimary ? body.isCodeId?.trim() : undefined)
  const crudActiveTable =
    body.activeRecordTable?.trim() || (isCodeNotebookPrimary ? 'is_codes' : undefined)

  const activeRecordHint =
    crudActiveId && crudActiveTable
      ? `ACTIVE RECORD (use for updates to this row unless user names another): table=${crudActiveTable}, id=${crudActiveId}.`
      : ''

  const agentCrudRules = agentCrudEnabled
    ? [
        'DATA AGENT: You may create, update, and delete LIMS records using the lims_crud tool when the user asks to change data.',
        `Allowed tables on this page: ${allowedTables.join(', ')}.`,
        'Page data lists each row with id=<UUID>. Always pass that id in lims_crud for update/delete — you have search access via this context; never tell the user you cannot look up ids.',
        activeRecordHint,
        'If id is missing, use match (is_number + revision_year for is_codes, company_name for clients).',
        'After each successful tool call, summarize what changed. On errors, explain and suggest a fix.',
        'Use delete only when the user clearly requests removal.',
      ]
        .filter((p) => p.length > 0)
        .join(' ')
    : 'You cannot modify database records; only explain how the user can do it in the UI.'

  const systemParts = [
    settings?.system_prompt_prefix ? String(settings.system_prompt_prefix) : '',
    'You are QI Assistant, a helpful assistant inside Qirlpl LIMS (ISO 17025 laboratory software). Answer clearly and concisely in English unless the user writes in Hindi.',
    body.page ? `The user is on the "${body.page}" page.` : '',
    agentCrudRules,
    isCodeNotebookRules,
    pageData ? `Page data:\n${pageData}` : '',
    skillsBlock,
  ].filter((p) => p.trim().length > 0)

  const history = (body.history ?? [])
    .filter((m) => m?.content?.trim() && (m.role === 'user' || m.role === 'assistant'))
    .slice(-10)
    .map((m) => ({ role: m.role, content: m.content.trim() }))

  type ChatMsg = Record<string, unknown>
  const chatMessages: ChatMsg[] = [
    { role: 'system', content: systemParts.join('\n\n') },
    ...history,
    { role: 'user', content: body.message!.trim() },
  ]

  const actionsExecuted: CrudActionResult[] = []
  let reply = ''
  const maxToolRounds = isTestParamImportMode ? 24 : isSampleReceivingImportMode ? 10 : 6
  const chatMaxTokens =
    isDraftReportReview || isIssuedReportReview
      ? Math.min(Number.isFinite(maxTokens) ? maxTokens : 8192, 8192)
      : Number.isFinite(maxTokens)
        ? Math.min(maxTokens, 8192)
        : 4096

  for (let round = 0; round < maxToolRounds; round++) {
    const bodyPayload: Record<string, unknown> = {
      model: modelId,
      messages: chatMessages,
      temperature: Number.isFinite(temperature) ? temperature : 0.7,
      max_tokens: chatMaxTokens,
    }
    if (agentCrudEnabled && userClient) {
      bodyPayload.tools = [LIMS_CRUD_TOOL]
      bodyPayload.tool_choice = 'auto'
    }

    const aiRes = await fetch(`${apiBase}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${model.api_key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(bodyPayload),
    })

    const aiPayload = await aiRes.json().catch(() => ({}))
    if (!aiRes.ok) {
      const errMsg = extractAiError(aiPayload, aiRes.status)
      return new Response(JSON.stringify({ error: errMsg }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const choice = (aiPayload as { choices?: Array<{ message?: Record<string, unknown> }> }).choices?.[0]?.message
    if (!choice) {
      reply = 'No response from model.'
      break
    }

    const toolCalls = choice.tool_calls as Array<{
      id: string
      type: string
      function: { name: string; arguments: string }
    }> | undefined

    if (!agentCrudEnabled || !userClient || !toolCalls?.length) {
      reply = String(choice.content ?? '').trim() || 'No response from model.'
      break
    }

    chatMessages.push(choice)

    for (const tc of toolCalls) {
      if (tc.function?.name !== 'lims_crud') {
        chatMessages.push({
          role: 'tool',
          tool_call_id: tc.id,
          content: JSON.stringify({ ok: false, message: 'Unknown tool' }),
        })
        continue
      }

      let parsed: CrudActionInput
      try {
        parsed = JSON.parse(tc.function.arguments || '{}') as CrudActionInput
      } catch {
        const bad: CrudActionResult = {
          operation: 'create',
          table: '',
          ok: false,
          message: 'Invalid tool arguments JSON',
        }
        actionsExecuted.push(bad)
        chatMessages.push({ role: 'tool', tool_call_id: tc.id, content: JSON.stringify(bad) })
        continue
      }

      const result = await executeLimsCrud(userClient, body.page, parsed, {
        activeRecordId: crudActiveId,
        activeRecordTable: crudActiveTable,
      })
      actionsExecuted.push(result)
      chatMessages.push({ role: 'tool', tool_call_id: tc.id, content: JSON.stringify(result) })
    }
  }

  if (!reply && actionsExecuted.length > 0) {
    const summary = actionsExecuted
      .map((a) => `${a.ok ? '✓' : '✗'} ${a.operation} ${a.table}${a.id ? ` (${a.id})` : ''}: ${a.message}`)
      .join('\n')
    reply = `Done. Database actions:\n${summary}`
  }

  let createdIsCodeId: string | undefined
  if (attachedPdfBytes && userClient) {
    const createdSample = actionsExecuted.find(
      (a) => a.ok && a.table === 'samples' && a.operation === 'create' && a.id,
    )
    if (createdSample?.id && body.page?.trim() === 'samples/receiving') {
      const attach = await attachSampleClientReference(
        userClient,
        createdSample.id,
        attachedPdfFileName,
        attachedPdfBytes,
      )
      actionsExecuted.push({
        operation: 'update',
        table: 'samples',
        id: createdSample.id,
        ok: attach.ok,
        message: attach.message,
      })
      if (attach.ok && !reply.includes('PDF') && !reply.includes('Test request')) {
        reply = `${reply.trim()}\n\nTest request PDF "${attachedPdfFileName}" saved on sample.`.trim()
      }
    }

    const created = actionsExecuted.find(
      (a) => a.ok && a.table === 'is_codes' && a.operation === 'create' && a.id,
    )
    const targetId = created?.id ?? body.isCodeId?.trim()
    if (targetId && body.page?.trim() !== 'samples/receiving') {
      createdIsCodeId = created?.id
      const attach = await attachIsCodePdf(userClient, targetId, attachedPdfFileName, attachedPdfBytes)
      actionsExecuted.push({
        operation: 'create',
        table: 'is_code_files',
        id: targetId,
        ok: attach.ok,
        message: attach.message,
      })
      if (attach.ok && !reply.includes('PDF')) {
        reply = `${reply.trim()}\n\nPDF "${attachedPdfFileName}" linked to IS code.`.trim()
      }
    }
  }

  return new Response(
    JSON.stringify({
      reply: reply.trim() || 'No response from model.',
      actionsExecuted: actionsExecuted.length > 0 ? actionsExecuted : undefined,
      createdIsCodeId,
    }),
    {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    },
  )
})
