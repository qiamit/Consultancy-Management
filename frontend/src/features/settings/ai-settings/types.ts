export const AI_SETTINGS_SINGLETON_ID = '00000000-0000-0000-0000-000000000002'

export const AI_PROVIDERS = [
  { value: 'openai', label: 'OpenAI' },
  { value: 'anthropic', label: 'Anthropic' },
  { value: 'google', label: 'Google Gemini' },
  { value: 'deepseek', label: 'DeepSeek' },
  { value: 'openrouter', label: 'OpenRouter' },
  { value: 'custom', label: 'Custom (OpenAI-compatible)' },
] as const

export type AiProvider = (typeof AI_PROVIDERS)[number]['value']

/** Suggested model IDs shown as placeholders per provider. */
export const AI_PROVIDER_MODEL_HINTS: Record<AiProvider, string> = {
  openai: 'gpt-4o',
  anthropic: 'claude-sonnet-4-20250514',
  google: 'gemini-2.0-flash',
  deepseek: 'deepseek-chat',
  openrouter: 'openai/gpt-4o',
  custom: 'model-id',
}

export const DEEPSEEK_MODEL_OPTIONS = [
  { id: 'deepseek-chat', label: 'DeepSeek Chat (V3)' },
  { id: 'deepseek-reasoner', label: 'DeepSeek Reasoner (R1)' },
] as const

export const DEEPSEEK_API_BASE = 'https://api.deepseek.com'

export type AiModelRow = {
  id: string
  provider: string
  model_id: string
  display_name: string
  api_key: string | null
  api_base_url: string | null
  is_default: boolean
  is_active: boolean
  created_at?: string
  updated_at?: string
}

export type AiModelForm = {
  provider: AiProvider
  modelId: string
  displayName: string
  apiKey: string
  apiBaseUrl: string
  isDefault: boolean
  isActive: boolean
}

export type AiSkillRow = {
  id: string
  name: string
  description: string | null
  instructions: string
  trigger_keywords: string[] | null
  is_enabled: boolean
  sort_order: number
  created_at?: string
  updated_at?: string
}

export type AiSkillForm = {
  name: string
  description: string
  instructions: string
  triggerKeywords: string
  isEnabled: boolean
  sortOrder: number
}

export type AiSettingsRow = {
  id: string
  default_model_id: string | null
  ai_enabled: boolean
  temperature: number
  max_tokens: number
  system_prompt_prefix: string | null
  log_requests: boolean
  agent_crud_enabled: boolean
  updated_at?: string
}

export const emptyAiModelForm = (): AiModelForm => ({
  provider: 'openai',
  modelId: '',
  displayName: '',
  apiKey: '',
  apiBaseUrl: '',
  isDefault: false,
  isActive: true,
})

export const emptyAiSkillForm = (): AiSkillForm => ({
  name: '',
  description: '',
  instructions: '',
  triggerKeywords: '',
  isEnabled: true,
  sortOrder: 0,
})

export function maskApiKey(key: string | null | undefined): string {
  if (!key?.trim()) return 'Not set'
  const t = key.trim()
  if (t.length <= 4) return '••••'
  return `••••••••${t.slice(-4)}`
}
