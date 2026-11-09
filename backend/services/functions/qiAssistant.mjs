/**
 * Railway Node QI Assistant (chat path). The old Deno version was removed on 2026-10-08; see git history at 4e28cc0.
 * Full Deno CRUD/PDF tooling is not ported yet — chat + generate (process description) work.
 * Admins get the Admin Agent (body.mode = 'agent'): tool calling over the app's data, see qiAgent.mjs.
 */

import dns from 'node:dns/promises'
import net from 'node:net'
import { AGENT_SYSTEM_PROMPT, runAgent } from './qiAgent.mjs'

const AI_SETTINGS_ID = '00000000-0000-0000-0000-000000000002'

/** Per-user QE Assistant limits (in memory, per functions instance). */
const QI_LIMIT_HOUR = Number(process.env.QI_ASSISTANT_LIMIT_HOUR || 60)
const QI_IMAGE_LIMIT_HOUR = Number(process.env.QI_ASSISTANT_IMAGE_LIMIT_HOUR || 20)
const HOUR_MS = 60 * 60 * 1000
/** @type {Map<string, { all: number[]; images: number[] }>} */
const usage = new Map()

/** Records one request; returns an error message when the user is over a limit (nothing is recorded then). */
function takeQuota(userId, withImages) {
  const now = Date.now()
  const cutoff = now - HOUR_MS
  const entry = usage.get(userId) ?? { all: [], images: [] }
  entry.all = entry.all.filter((t) => t > cutoff)
  entry.images = entry.images.filter((t) => t > cutoff)
  usage.set(userId, entry)
  if (entry.all.length >= QI_LIMIT_HOUR) {
    return `QE Assistant limit reached: ${QI_LIMIT_HOUR} requests per hour. Try again later.`
  }
  if (withImages && entry.images.length >= QI_IMAGE_LIMIT_HOUR) {
    return `QE Assistant limit reached: ${QI_IMAGE_LIMIT_HOUR} picture requests per hour. Try again later.`
  }
  entry.all.push(now)
  if (withImages) entry.images.push(now)
  if (usage.size > 10_000) {
    for (const [id, e] of usage) if (!e.all.some((t) => t > cutoff)) usage.delete(id)
  }
  return ''
}

/** True for loopback, private, link-local, CGNAT, unique-local and other non-public addresses. */
function isPrivateAddress(address) {
  const ip = String(address || '').replace(/^\[|\]$/g, '').toLowerCase()
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number)
    return (
      a === 0 || a === 10 || a === 127 || a >= 224 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 192 && b === 0) ||
      (a === 198 && (b === 18 || b === 19))
    )
  }
  if (net.isIPv6(ip)) {
    if (ip === '::' || ip === '::1') return true
    const mapped = ip.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/)
    if (mapped) return isPrivateAddress(mapped[1])
    if (ip.startsWith('::ffff:')) return true
    return /^(fc|fd|fe[89ab]|ff)/.test(ip) || ip.startsWith('64:ff9b:') || ip.startsWith('2001:db8:')
  }
  return true
}

const BASE_URL_ERROR =
  "The AI model's API Base URL must be a public https:// address. Fix it in Settings → AI Settings → AI Models."

/**
 * A custom api_base_url must be https on a public host (no localhost, private, link-local or internal names,
 * also after DNS). Throws an Error with a user-facing message otherwise.
 */
async function assertPublicHttpsBase(base) {
  let u
  try {
    u = new URL(base)
  } catch {
    throw new Error(BASE_URL_ERROR)
  }
  if (u.protocol !== 'https:' || u.username || u.password) throw new Error(BASE_URL_ERROR)
  const host = u.hostname.replace(/^\[|\]$/g, '').toLowerCase()
  if (net.isIP(host)) {
    if (isPrivateAddress(host)) throw new Error(BASE_URL_ERROR)
    return
  }
  if (!host.includes('.') || host === 'localhost' || /\.(localhost|local|internal|lan|home|arpa)$/.test(host)) {
    throw new Error(BASE_URL_ERROR)
  }
  let addresses = []
  try {
    addresses = await dns.lookup(host, { all: true, verbatim: true })
  } catch {
    throw new Error("The AI model's API Base URL could not be found. Check it in Settings → AI Settings → AI Models.")
  }
  if (!addresses.length || addresses.some((a) => isPrivateAddress(a.address))) throw new Error(BASE_URL_ERROR)
}

function resolveApiBase(provider, apiBaseUrl) {
  if (apiBaseUrl?.trim()) return apiBaseUrl.trim().replace(/\/$/, '')
  if (provider === 'openrouter') return 'https://openrouter.ai/api/v1'
  if (provider === 'google') return 'https://generativelanguage.googleapis.com/v1beta/openai'
  if (provider === 'deepseek') return 'https://api.deepseek.com/v1'
  // Anthropic's OpenAI-compatible endpoint (used only for picture requests; see below).
  if (provider === 'anthropic') return 'https://api.anthropic.com/v1'
  return 'https://api.openai.com/v1'
}

/** Pictures sent for vision models: count, size of each, and total (the server body limit is 25 MB). */
const MAX_IMAGES = 8
const MAX_IMAGE_CHARS = 6 * 1024 * 1024
const MAX_IMAGES_TOTAL_CHARS = 20 * 1024 * 1024
const IMAGE_DATA_URL = /^data:image\/(?:jpeg|png|webp|gif);base64,[A-Za-z0-9+/=]+$/

const VISION_MISSING_ERROR =
  'Reading Photos Needs a Vision AI Model. Add Google Gemini or OpenAI GPT-4o in Settings → AI Settings → AI Models.'

/** OpenRouter / Custom model ids known to read pictures. */
const VISION_MODEL_HINT =
  /gpt-4o|gpt-4\.1|gpt-4-turbo|gpt-4-vision|gpt-5|chatgpt-4o|\bo[34]\b|gemini|gemma-?3|claude|vision|[-_/]vl\b|-vl-|qwen.*vl|pixtral|llava|llama-?4|grok-(?:2-vision|4)/i

/** True when the model can take image_url parts (by provider, and by model id where a provider mixes both kinds). */
function modelSupportsVision(model) {
  const provider = String(model?.provider ?? 'openai')
  const id = String(model?.model_id ?? '').toLowerCase()
  if (provider === 'google' || provider === 'anthropic') return true
  if (provider === 'openai') return !/gpt-3\.5|davinci|babbage|o1-mini|o3-mini|embedding|whisper|tts|audio/.test(id)
  if (provider === 'deepseek') return /vl/.test(id)
  return VISION_MODEL_HINT.test(id)
}

function modelHasKey(model) {
  return Boolean(String(model?.api_key || '').trim() || model?.api_key_set)
}

/** Validated picture data URLs from the request body (empty when none were sent). */
function readImages(raw) {
  if (raw === undefined || raw === null) return []
  if (!Array.isArray(raw)) throw new Error('images must be a list of picture data URLs')
  if (raw.length > MAX_IMAGES) throw new Error(`Send at most ${MAX_IMAGES} pictures at a time`)
  let total = 0
  return raw.map((url) => {
    const text = String(url ?? '')
    if (text.length > MAX_IMAGE_CHARS) throw new Error('A picture is too large (6 MB at most)')
    if (!IMAGE_DATA_URL.test(text)) throw new Error('Pictures must be JPG, PNG, WEBP or GIF data URLs')
    total += text.length
    if (total > MAX_IMAGES_TOTAL_CHARS) throw new Error('The pictures are too large together (20 MB at most)')
    return text
  })
}

function normalizeModelId(provider, modelId) {
  const id = String(modelId || '').trim()
  if (provider === 'google' && id.startsWith('models/')) return id.slice('models/'.length)
  return id
}

/**
 * The provider's own reason, safe to show in the app: one line, at most 300 characters, with anything that looks
 * like a key or token replaced. Empty when the provider gave no message of its own.
 */
export function providerReason(payload, status) {
  const raw = extractAiError(payload, status)
  if (!raw || raw === `AI request failed (${status})` || raw === 'AI request failed') return ''
  const oneLine = raw
    .replace(/\s+/g, ' ')
    .replace(/\b(?:sk|pk|rk|key|api|gsk|xai)[-_][A-Za-z0-9_-]{8,}/gi, '[hidden]')
    .replace(/\bAIza[0-9A-Za-z_-]{20,}/g, '[hidden]')
    .replace(/\bBearer\s+\S+/gi, 'Bearer [hidden]')
    .replace(/[A-Za-z0-9_+/=-]{40,}/g, '[hidden]')
    .trim()
  return oneLine.length > 300 ? `${oneLine.slice(0, 297)}...` : oneLine
}

/**
 * User-facing text for a failed provider call. For a request the provider refused as wrong (400, 422) the
 * provider's own reason is shown, since trying again will not help; the full message also goes to the log.
 */
export function providerErrorMessage(status, payload) {
  if (status === 401 || status === 403) {
    return 'The AI provider rejected the API key. Check Settings → AI Settings → AI Models.'
  }
  if (status === 404) return 'The AI provider does not know this model. Check Settings → AI Settings → AI Models.'
  if (status === 402) return 'The AI provider account has no credit left. Check the provider billing.'
  if (status === 413) return 'The request is too large for the AI provider. Send less text or fewer pictures.'
  if (status === 429) return 'The AI provider is busy or rate-limiting requests. Try again in a minute.'
  if (status === 400 || status === 422) {
    const reason = providerReason(payload, status)
    if (reason) {
      return `The AI provider refused the request (error ${status}): ${reason}${/[.!?]$/.test(reason) ? '' : '.'} Check Settings → AI Settings → AI Models.`
    }
  }
  return `The AI provider could not answer (error ${status}). Try again later.`
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
/** Chat completions with tools (OpenAI-compatible); returns the provider's choice.message. */
export function createToolCaller({ apiBase, apiKey, modelId, provider, maxTokens, temperature, reasoning = false }) {
  return async (messages, tools, { final = false } = {}) => {
    const r = await fetch(`${apiBase}/chat/completions`, {
      method: 'POST',
      redirect: 'error',
      signal: AbortSignal.timeout(180_000),
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: modelId,
        messages,
        tools,
        tool_choice: final ? 'none' : 'auto',
        ...(reasoning ? { max_completion_tokens: maxTokens } : { temperature, max_tokens: maxTokens }),
      }),
    })
    const payload = await r.json().catch(() => ({}))
    if (!r.ok) {
      console.warn(
        `[qi-assistant] agent provider error ${r.status} (provider ${provider}, model ${modelId}): ${extractAiError(payload, r.status).slice(0, 500)}`,
      )
      const err = new Error(providerErrorMessage(r.status, payload))
      err.statusCode = 400
      throw err
    }
    return payload?.choices?.[0]?.message ?? {}
  }
}

/**
 * The default active AI model with its key, ready for createToolCaller (scheduled runs). Throws when none is set up
 * or the provider is not OpenAI-compatible for text.
 */
export async function loadAgentModel(rest) {
  const settingsRows = await rest(`/ai_settings?id=eq.${AI_SETTINGS_ID}&select=*`)
  const settings = Array.isArray(settingsRows) && settingsRows[0] ? settingsRows[0] : null
  let model = null
  if (settings?.default_model_id) {
    const rows = await rest(`/ai_models?id=eq.${encodeURIComponent(String(settings.default_model_id))}&is_active=eq.true&select=*`)
    model = Array.isArray(rows) && rows[0] ? rows[0] : null
  }
  if (!model) {
    const rows = await rest('/ai_models?is_active=eq.true&select=*&order=is_default.desc,created_at.asc&limit=1')
    model = Array.isArray(rows) && rows[0] ? rows[0] : null
  }
  if (!model) throw new Error('No active AI model. Add one in Settings → AI Settings → AI Models.')
  if (!String(model.api_key || '').trim() && model.api_key_set) {
    const key = await rest('/rpc/ai_model_key_for_service', { method: 'POST', body: JSON.stringify({ p_model_id: model.id }) })
    model = { ...model, api_key: typeof key === 'string' ? key : '' }
  }
  if (!String(model.api_key || '').trim()) throw new Error('The default AI model has no API key.')
  const provider = String(model.provider ?? 'openai')
  const apiBase = resolveApiBase(provider, model.api_base_url ? String(model.api_base_url) : null)
  if (String(model.api_base_url ?? '').trim()) await assertPublicHttpsBase(apiBase)
  const maxTokens = Number(model.max_tokens)
  return {
    settings,
    callModel: createToolCaller({
      apiBase,
      apiKey: String(model.api_key).trim(),
      modelId: normalizeModelId(provider, String(model.model_id || '')),
      provider,
      maxTokens: Number.isFinite(maxTokens) ? Math.min(maxTokens, 8192) : 4096,
      temperature: 0.2,
    }),
  }
}

export function createQiAssistantHandler(deps) {
  const { requireUser, requireAdmin, userRestFor, storageFor, rest, readBody, corsJson } = deps

  return async function handleQiAssistant(req, res) {
    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'Access-Control-Allow-Origin': res.qeCorsOrigin || 'https://qengineering.in',
        Vary: 'Origin',
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

    let caller
    try {
      caller = await requireUser(req)
    } catch (err) {
      const status = Number(err?.statusCode) || 401
      corsJson(res, status, {
        error: status === 403 || status === 503 ? String(err?.message || 'Forbidden') : 'Unauthorized',
      })
      return
    }
    const userId = String(caller?.id ?? '')

    let body = {}
    try {
      body = await readBody(req)
    } catch {
      corsJson(res, 400, { error: 'Invalid JSON' })
      return
    }

    // Admin Agent (tools over the whole app): active admin with Two-Step Login only.
    const agentMode = body.mode === 'agent'
    if (agentMode) {
      try {
        await requireAdmin(req)
      } catch (err) {
        corsJson(res, Number(err?.statusCode) || 403, {
          error: String(err?.message || 'QE Assistant Agent Is for Admins Only.'),
        })
        return
      }
    }

    const isPdfImport = body.action === 'import_is_code_pdf'
    if (isPdfImport) {
      corsJson(res, 501, {
        error:
          'PDF import via QE Assistant is not available on this Railway functions build yet. Use chat / generate without PDF import.',
      })
      return
    }

    if (!String(body.message || '').trim()) {
      corsJson(res, 400, { error: 'message is required' })
      return
    }

    /** @type {string[]} */
    let images = []
    try {
      images = readImages(body.images)
    } catch (err) {
      corsJson(res, 400, { error: err instanceof Error ? err.message : 'Invalid pictures' })
      return
    }

    const overLimit = takeQuota(userId, images.length > 0)
    if (overLimit) {
      corsJson(res, 429, { error: overLimit })
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
      // Pictures need a model that can see: keep the default when it can, else the first active vision model.
      if (images.length > 0 && !(model && modelSupportsVision(model) && modelHasKey(model))) {
        const rows = await rest(
          `/ai_models?is_active=eq.true&select=*&order=is_default.desc,created_at.asc`,
        )
        const vision = (Array.isArray(rows) ? rows : []).find(
          (row) => modelSupportsVision(row) && modelHasKey(row),
        )
        if (!vision) {
          corsJson(res, 400, { error: VISION_MISSING_ERROR })
          return
        }
        model = vision
      }
    } catch (err) {
      console.error('[qi-assistant] loading AI models failed', err)
      corsJson(res, 500, { error: 'Failed to load AI models. Try again later.' })
      return
    }

    // Keys are encrypted at rest (Batch D L6); ai_models.api_key is always NULL now.
    if (model && !String(model.api_key || '').trim() && model.api_key_set) {
      try {
        const key = await rest('/rpc/ai_model_key_for_service', {
          method: 'POST',
          body: JSON.stringify({ p_model_id: model.id }),
        })
        model = { ...model, api_key: typeof key === 'string' ? key : '' }
      } catch (err) {
        console.error('[qi-assistant] reading the AI model key failed', model.id, err)
        corsJson(res, 500, { error: 'Failed to read the AI model API key. Check Settings → AI Settings → AI Models.' })
        return
      }
    }

    if (!String(model?.api_key || '').trim()) {
      corsJson(res, 400, {
        error:
          'No AI model with API key configured. Go to AI Settings → AI Models and add a default model.',
      })
      return
    }

    const provider = String(model.provider ?? 'openai')
    // Text chat stays on the providers it always used; picture requests and the Admin Agent may use Anthropic's OpenAI-compatible endpoint.
    if (provider === 'anthropic' && images.length === 0 && !agentMode) {
      corsJson(res, 400, {
        error:
          'Provider "anthropic" is not yet supported in QE Assistant. Use Google Gemini, OpenAI, DeepSeek, OpenRouter, or Custom with an OpenAI-compatible base URL.',
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

    // Admin Agent: the admin's saved facts and standing instructions (own rows only, via their JWT).
    let agentMemory = ''
    if (agentMode) {
      try {
        const { data } = await userRestFor(req)('/assistant_memories?select=id,kind,content&order=created_at.asc&limit=100')
        const rows = Array.isArray(data) ? data : []
        if (rows.length) {
          agentMemory = `ADMIN MEMORY (saved by the admin — follow the instructions, use the facts):\n${rows
            .map((m) => `- [${m.id}] (${m.kind}) ${String(m.content).slice(0, 600)}`)
            .join('\n')}`
        }
      } catch {
        // Memory is optional (e.g. before the migration runs).
      }
    }

    const systemParts = [
      settings?.system_prompt_prefix ? String(settings.system_prompt_prefix) : '',
      'You are QE Assistant, a helpful assistant inside Consultancy Pro / Q Engineering (BIS licensing & LIMS). Answer clearly and concisely in English unless the user writes in Hindi.',
      body.page ? `The user is on the "${body.page}" page.` : '',
      agentMode
        ? AGENT_SYSTEM_PROMPT
        : 'You cannot modify database records in this build; only explain how the user can do it in the UI.',
      agentMemory,
      agentMode && Array.isArray(body.routes) && body.routes.length
        ? `App Pages (path — name):\n${body.routes
            .slice(0, 200)
            .map((r) => `${String(r?.path ?? '')} — ${String(r?.label ?? '')}`)
            .join('\n')}`
        : '',
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

    // With pictures the user turn is OpenAI-style multimodal content: the text, then one image_url part per picture.
    const userContent = images.length
      ? [
          { type: 'text', text: userText },
          ...images.map((url) => ({ type: 'image_url', image_url: { url } })),
        ]
      : userText
    const chatMessages = [
      { role: 'system', content: systemParts.join('\n\n') },
      ...history,
      { role: 'user', content: userContent },
    ]

    const apiBase = resolveApiBase(provider, model.api_base_url ? String(model.api_base_url) : null)
    if (String(model.api_base_url ?? '').trim()) {
      try {
        await assertPublicHttpsBase(apiBase)
      } catch (err) {
        console.warn('[qi-assistant] refused api_base_url for model', model.id)
        corsJson(res, 400, { error: err instanceof Error ? err.message : BASE_URL_ERROR })
        return
      }
    }
    const modelId = normalizeModelId(provider, String(model.model_id || ''))
    const temperature = Number(model.temperature)
    const maxTokens = Number(model.max_tokens)
    const isCmpf311Request = body.page === 'bis/cmpf-311-on-sit'
    // Long source-PDF extractions: full output budget and no hidden reasoning, which can otherwise use up the tokens.
    const isLongExtraction = isCmpf311Request || body.page === 'bis/undertaking-indian-standards' || body.page === 'bis/undertaking-other' || String(body.page || '').startsWith('bis/non-conformity') || body.page === 'masters/test-parameters-ai' || body.page === 'bis/process-flow-chart' || body.page === 'bis/plant-layout' || body.page === 'bis/sample-conformity'
    // Sample conformity is a judgement over long documents: DeepSeek reasons first (its reasoning counts towards
    // max_tokens, so the budget is larger), at a low temperature, with more time.
    const reasonedCheck = body.page === 'bis/sample-conformity' && provider === 'deepseek'
    const chatMaxTokens = reasonedCheck ? 32768 : isLongExtraction || agentMode ? 8192 : Number.isFinite(maxTokens) ? Math.min(maxTokens, 8192) : 4096
    // Drawing a layout from a sketch wants faithful positions, not creative variety.
    const chatTemperature = body.page === 'bis/plant-layout' || body.page === 'bis/sample-conformity'
      ? 0.2
      : Number.isFinite(temperature) ? temperature : 0.7
    // OpenAI reasoning models (o-series, GPT-5) take max_completion_tokens and only their default temperature
    // (applied to picture requests, which may pick such a model as the vision fallback; text chat is unchanged).
    const openAiReasoning = images.length > 0 && provider === 'openai' && /^(?:o\d|gpt-5)/i.test(modelId)

    const requestChatCompletion = (jsonMode) => fetch(`${apiBase}/chat/completions`, {
      method: 'POST',
      // A provider must not bounce the request (and the API key) somewhere else.
      redirect: 'error',
      signal: AbortSignal.timeout(reasonedCheck ? 420_000 : 180_000),
      headers: {
        Authorization: `Bearer ${String(model.api_key).trim()}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: modelId,
        messages: chatMessages,
        ...(openAiReasoning
          ? { max_completion_tokens: chatMaxTokens }
          : { temperature: chatTemperature, max_tokens: chatMaxTokens }),
        ...(jsonMode ? { response_format: { type: 'json_object' } } : {}),
        ...(provider === 'deepseek' && isLongExtraction ? { thinking: { type: reasonedCheck ? 'enabled' : 'disabled' } } : {}),
      }),
    })

    if (agentMode) {
      const callModel = createToolCaller({
        apiBase,
        apiKey: String(model.api_key).trim(),
        modelId,
        provider,
        maxTokens: chatMaxTokens,
        temperature: Math.min(chatTemperature, 0.3),
        reasoning: openAiReasoning,
      })
      try {
        const result = await runAgent({
          callModel,
          messages: chatMessages,
          userRest: userRestFor(req),
          routes: body.routes,
          userEmail: String(caller?.email ?? ''),
          ownerId: userId,
          readStorage: storageFor(req),
        })
        corsJson(res, 200, {
          reply: result.reply,
          agent: { steps: result.steps, proposals: result.proposals, navigation: result.navigation },
        })
      } catch (err) {
        console.error(`[qi-assistant] agent failed (provider ${provider}, model ${modelId})`, err)
        const timedOut = Boolean(err && typeof err === 'object' && 'name' in err && err.name === 'TimeoutError')
        corsJson(res, Number(err?.statusCode) || 502, {
          error: timedOut
            ? 'The AI provider took too long to answer. Try again, or send a shorter request.'
            : err instanceof Error && err.message ? err.message : 'The agent could not finish. Try again.',
        })
      }
      return
    }

    const requestJson = body.responseFormat === 'json_object'
    let aiRes
    let aiPayload
    try {
      aiRes = await requestChatCompletion(requestJson)
      aiPayload = await aiRes.json().catch(() => ({}))
      const aiError = aiRes.ok ? '' : extractAiError(aiPayload, aiRes.status)
      if (
        requestJson &&
        !aiRes.ok &&
        aiRes.status === 400 &&
        /response[_ -]?format|json[_ -]?object|json mode|structured output/i.test(aiError)
      ) {
        // Some OpenAI-compatible providers do not implement response_format; retry with prompt-only formatting.
        aiRes = await requestChatCompletion(false)
        aiPayload = await aiRes.json().catch(() => ({}))
      }
    } catch (err) {
      console.error(`[qi-assistant] provider request failed (provider ${provider}, model ${modelId})`, err)
      const timedOut = Boolean(err && typeof err === 'object' && 'name' in err && err.name === 'TimeoutError')
      corsJson(res, 502, {
        error: timedOut
          ? 'The AI provider took too long to answer. Try again, or send a shorter request.'
          : 'The AI provider could not be reached. Try again later.',
      })
      return
    }
    if (!aiRes.ok) {
      console.warn(
        `[qi-assistant] provider error ${aiRes.status} (provider ${provider}, model ${modelId}): ${extractAiError(aiPayload, aiRes.status).slice(0, 500)}`,
      )
      corsJson(res, 400, { error: providerErrorMessage(aiRes.status, aiPayload) })
      return
    }

    const choice = aiPayload?.choices?.[0]
    const content = choice?.message?.content
    const reply = (typeof content === 'string'
      ? content
      : Array.isArray(content)
        ? content.map((part) => typeof part === 'string' ? part : String(part?.text ?? '')).join('\n')
        : '').trim()
    if (!reply) {
      const messageFields = choice?.message && typeof choice.message === 'object'
        ? Object.keys(choice.message).slice(0, 8).join(', ') || 'none'
        : 'none'
      const finishReason = String(choice?.finish_reason ?? 'unknown')
      const diagnostic = isCmpf311Request
        ? `AI provider returned an empty response for CMPF-311 (provider: ${provider}, model: ${modelId || 'unspecified'}, finish reason: ${finishReason}, message fields: ${messageFields}). Check the active model's output limit and provider response format in AI Settings.`
        : 'No response from model.'
      corsJson(res, isCmpf311Request ? 502 : 200, isCmpf311Request ? { error: diagnostic } : { reply: diagnostic })
      return
    }

    corsJson(res, 200, { reply })
  }
}
