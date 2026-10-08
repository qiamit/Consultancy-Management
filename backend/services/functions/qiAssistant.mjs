/**
 * Railway Node QI Assistant (chat path). The old Deno version was removed on 2026-10-08; see git history at 4e28cc0.
 * Full Deno CRUD/PDF tooling is not ported yet — chat + generate (process description) work.
 */

const AI_SETTINGS_ID = '00000000-0000-0000-0000-000000000002'

function resolveApiBase(provider, apiBaseUrl) {
  if (apiBaseUrl?.trim()) return apiBaseUrl.trim().replace(/\/$/, '')
  if (provider === 'openrouter') return 'https://openrouter.ai/api/v1'
  if (provider === 'google') return 'https://generativelanguage.googleapis.com/v1beta/openai'
  if (provider === 'deepseek') return 'https://api.deepseek.com/v1'
  return 'https://api.openai.com/v1'
}

function normalizeModelId(provider, modelId) {
  const id = String(modelId || '').trim()
  if (provider === 'google' && id.startsWith('models/')) return id.slice('models/'.length)
  return id
}

function extractAiError(payload, status) {
  if (typeof payload !== 'object' || !payload) return `AI request failed (${status})`
  const err = payload.error
  if (typeof err === 'object' && err && 'message' in err) {
    return String(err.message ?? 'AI request failed')
  }
  if (typeof err === 'string') return err
  if (typeof payload.message === 'string') return payload.message
  return `AI request failed (${status})`
}

/**
 * @param {{
 *   requireUser: (req: import('node:http').IncomingMessage) => Promise<unknown>
 *   rest: (path: string, init?: RequestInit) => Promise<unknown>
 *   readBody: (req: import('node:http').IncomingMessage) => Promise<Record<string, unknown>>
 *   corsJson: (res: import('node:http').ServerResponse, status: number, body: unknown) => void
 * }} deps
 */
export function createQiAssistantHandler(deps) {
  const { requireUser, rest, readBody, corsJson } = deps

  return async function handleQiAssistant(req, res) {
    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers':
          'Content-Type, Authorization, apikey, X-User-Jwt, x-user-jwt, X-Client-Info',
      })
      res.end()
      return
    }

    if (req.method !== 'POST') {
      corsJson(res, 405, { error: 'Method not allowed' })
      return
    }

    try {
      await requireUser(req)
    } catch (err) {
      corsJson(res, Number(err?.statusCode) || 401, {
        error: err instanceof Error ? err.message : 'Unauthorized',
      })
      return
    }

    let body = {}
    try {
      body = await readBody(req)
    } catch {
      corsJson(res, 400, { error: 'Invalid JSON' })
      return
    }

    const isPdfImport = body.action === 'import_is_code_pdf'
    if (isPdfImport) {
      corsJson(res, 501, {
        error:
          'PDF import via QI Assistant is not available on this Railway functions build yet. Use chat / generate without PDF import.',
      })
      return
    }

    if (!String(body.message || '').trim()) {
      corsJson(res, 400, { error: 'message is required' })
      return
    }

    /** @type {Record<string, unknown> | null} */
    let settings = null
    try {
      const rows = await rest(`/ai_settings?id=eq.${AI_SETTINGS_ID}&select=*`)
      settings = Array.isArray(rows) && rows[0] ? rows[0] : null
    } catch {
      settings = null
    }

    /** @type {Record<string, unknown> | null} */
    let model = null
    try {
      if (settings?.default_model_id) {
        const rows = await rest(
          `/ai_models?id=eq.${encodeURIComponent(String(settings.default_model_id))}&is_active=eq.true&select=*`,
        )
        model = Array.isArray(rows) && rows[0] ? rows[0] : null
      }
      if (!model) {
        const rows = await rest(
          `/ai_models?is_active=eq.true&is_default=eq.true&select=*&limit=1`,
        )
        model = Array.isArray(rows) && rows[0] ? rows[0] : null
      }
      if (!model) {
        const rows = await rest(
          `/ai_models?is_active=eq.true&select=*&order=created_at.asc&limit=1`,
        )
        model = Array.isArray(rows) && rows[0] ? rows[0] : null
      }
    } catch (err) {
      corsJson(res, 500, {
        error: err instanceof Error ? err.message : 'Failed to load AI models',
      })
      return
    }

    if (!String(model?.api_key || '').trim()) {
      corsJson(res, 400, {
        error:
          'No AI model with API key configured. Go to AI Settings → AI Models and add a default model.',
      })
      return
    }

    const provider = String(model.provider ?? 'openai')
    if (provider === 'anthropic') {
      corsJson(res, 400, {
        error:
          'Provider "anthropic" is not yet supported in QI Assistant. Use Google Gemini, OpenAI, DeepSeek, OpenRouter, or Custom with an OpenAI-compatible base URL.',
      })
      return
    }

    let skillsBlock = ''
    try {
      if (String(body.activeSkillId || '').trim()) {
        const rows = await rest(
          `/ai_skills?id=eq.${encodeURIComponent(String(body.activeSkillId).trim())}&is_enabled=eq.true&select=name,instructions`,
        )
        const activeSkill = Array.isArray(rows) && rows[0] ? rows[0] : null
        if (activeSkill) {
          skillsBlock = [
            'ACTIVE SKILL (user selected with ! in chat — follow these rules for this message):',
            `### ${activeSkill.name}`,
            String(activeSkill.instructions ?? ''),
          ].join('\n')
        }
      }
      if (!skillsBlock) {
        const rows = await rest(
          `/ai_skills?is_enabled=eq.true&select=name,instructions&order=sort_order.asc&limit=5`,
        )
        const skills = Array.isArray(rows) ? rows : []
        if (skills.length > 0) {
          skillsBlock = `Enabled skills:\n${skills
            .map((s) => `### ${s.name}\n${s.instructions}`)
            .join('\n\n')}`
        }
      }
    } catch {
      // Skills are optional
    }

    let pageData = String(body.context || '').trim()
    const isCodeId = String(body.isCodeId || '').trim()
    if (isCodeId) {
      try {
        const rows = await rest(`/is_codes?id=eq.${encodeURIComponent(isCodeId)}&select=*`)
        const row = Array.isArray(rows) && rows[0] ? rows[0] : null
        if (row) {
          const rev = row.revision_year ? String(row.revision_year) : ''
          const notebook = [
            '=== NOTEBOOK SOURCE: ONE INDIAN STANDARD (IS CODE) ===',
            `IS Number: ${row.is_number}`,
            `Revision year: ${rev || '-'}`,
            `Title: ${row.title}`,
            `Aspect: ${row.aspect ?? '-'}`,
            `Remarks: ${row.remarks ?? '-'}`,
            '',
            '(PDF text extraction is not available on this functions build; use IS metadata + page context.)',
          ].join('\n')
          pageData = pageData ? `${notebook}\n\n---\n\n${pageData}` : notebook
        }
      } catch {
        // IS context optional
      }
    }

    const systemParts = [
      settings?.system_prompt_prefix ? String(settings.system_prompt_prefix) : '',
      'You are QI Assistant, a helpful assistant inside Consultancy Pro / Q Engineering (BIS licensing & LIMS). Answer clearly and concisely in English unless the user writes in Hindi.',
      body.page ? `The user is on the "${body.page}" page.` : '',
      'You cannot modify database records in this build; only explain how the user can do it in the UI.',
      isCodeId
        ? 'When IS code metadata is provided, ground product/process answers in that standard.'
        : '',
      pageData ? `Page data:\n${pageData}` : '',
      skillsBlock,
    ].filter((p) => String(p).trim().length > 0)

    const userText = String(body.message).trim()
    const history = (Array.isArray(body.history) ? body.history : [])
      .filter(
        (m) =>
          m &&
          typeof m === 'object' &&
          String(m.content || '').trim() &&
          (m.role === 'user' || m.role === 'assistant'),
      )
      .slice(-10)
      .map((m) => ({ role: m.role, content: String(m.content).trim() }))
      .filter(
        (m, idx, arr) =>
          !(idx === arr.length - 1 && m.role === 'user' && m.content === userText),
      )

    const chatMessages = [
      { role: 'system', content: systemParts.join('\n\n') },
      ...history,
      { role: 'user', content: userText },
    ]

    const apiBase = resolveApiBase(provider, model.api_base_url ? String(model.api_base_url) : null)
    const modelId = normalizeModelId(provider, String(model.model_id || ''))
    const temperature = Number(model.temperature)
    const maxTokens = Number(model.max_tokens)
    const chatMaxTokens = Number.isFinite(maxTokens) ? Math.min(maxTokens, 8192) : 4096

    const aiRes = await fetch(`${apiBase}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${String(model.api_key).trim()}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: modelId,
        messages: chatMessages,
        temperature: Number.isFinite(temperature) ? temperature : 0.7,
        max_tokens: chatMaxTokens,
      }),
    })

    const aiPayload = await aiRes.json().catch(() => ({}))
    if (!aiRes.ok) {
      corsJson(res, 400, { error: extractAiError(aiPayload, aiRes.status) })
      return
    }

    const reply = String(
      aiPayload?.choices?.[0]?.message?.content ?? '',
    ).trim() || 'No response from model.'

    corsJson(res, 200, { reply })
  }
}
