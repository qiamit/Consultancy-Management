import { forwardRef, useCallback, useEffect, useImperativeHandle, useState, type ReactNode } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Cpu, FlaskConical } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { AI_ASSISTANT_VISIBLE_QUERY_KEY } from '@/hooks/useShowAiAssistant'
import {
  limsDarkBarGlowStyle,
  limsFieldClass,
  limsPanelClass,
  limsRegistryFormClass,
} from '@/lib/limsThemeUi'
import { cn } from '@/lib/utils'
import { fetchAiModels, fetchAiSettings, upsertAiSettings } from './aiSettingsApi'
import type { AiModelRow } from './types'

function SettingSection({
  step,
  title,
  icon,
  children,
}: {
  step: string
  title: string
  icon: ReactNode
  children: ReactNode
}) {
  return (
    <section className="overflow-hidden rounded-none border border-stone-500 bg-white">
      <div className="relative overflow-hidden bg-gradient-to-br from-stone-800 via-stone-900 to-stone-950 px-4 py-2.5 text-white">
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.18]"
          style={limsDarkBarGlowStyle}
        />
        <div className="absolute bottom-0 left-0 h-[2px] w-full bg-gradient-to-r from-amber-500 via-amber-300 to-transparent" />
        <div className="relative flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center border border-amber-500/40 bg-stone-800/80 text-amber-200">
            {icon}
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-amber-200/90">{step}</p>
            <h3 className="text-sm font-semibold tracking-tight text-white">{title}</h3>
          </div>
        </div>
      </div>
      <div className="space-y-4 bg-gradient-to-b from-stone-100/80 to-white px-4 py-4 sm:px-5 sm:py-5">
        {children}
      </div>
    </section>
  )
}

function ToggleRow({
  checked,
  onChange,
  label,
  id,
}: {
  checked: boolean
  onChange: (checked: boolean) => void
  label: string
  id: string
}) {
  return (
    <label
      htmlFor={id}
      className="flex h-full min-h-[44px] cursor-pointer items-center justify-between gap-3 rounded-none border border-stone-500 bg-[#f7f3eb] px-3 py-2.5 transition-colors hover:bg-stone-100"
    >
      <span className="min-w-0 flex-1 text-xs font-medium leading-snug text-stone-800">{label}</span>
      <span className="relative inline-flex h-5 w-9 shrink-0 items-center">
        <input
          id={id}
          type="checkbox"
          className="peer sr-only"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
        />
        <span className="absolute inset-0 rounded-full bg-stone-400 transition-colors peer-checked:bg-amber-700 peer-focus-visible:ring-2 peer-focus-visible:ring-amber-500/40" />
        <span className="absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform peer-checked:translate-x-4" />
      </span>
    </label>
  )
}

export type AiGeneralPanelHandle = {
  save: () => void
}

type AiGeneralPanelProps = {
  onSavingChange?: (saving: boolean) => void
}

export const AiGeneralPanel = forwardRef<AiGeneralPanelHandle, AiGeneralPanelProps>(function AiGeneralPanel(
  { onSavingChange },
  ref,
) {
  const [models, setModels] = useState<AiModelRow[]>([])
  const [defaultModelId, setDefaultModelId] = useState<string>('')
  const [showAiAssistant, setShowAiAssistant] = useState(true)
  const [temperature, setTemperature] = useState('0.7')
  const [maxTokens, setMaxTokens] = useState('4096')
  const [systemPromptPrefix, setSystemPromptPrefix] = useState('')
  const [logRequests, setLogRequests] = useState(false)
  const [agentCrudEnabled, setAgentCrudEnabled] = useState(true)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const queryClient = useQueryClient()

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [modelRows, settings] = await Promise.all([fetchAiModels(), fetchAiSettings()])
      setModels(modelRows.filter((m) => m.is_active))
      if (settings) {
        setDefaultModelId(settings.default_model_id ?? '')
        setShowAiAssistant(settings.ai_enabled)
        setTemperature(String(settings.temperature ?? 0.7))
        setMaxTokens(String(settings.max_tokens ?? 4096))
        setSystemPromptPrefix(settings.system_prompt_prefix ?? '')
        setLogRequests(settings.log_requests)
        setAgentCrudEnabled(settings.agent_crud_enabled ?? true)
      }
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Failed to load settings')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    onSavingChange?.(saving)
  }, [saving, onSavingChange])

  const handleSave = useCallback(() => {
    void (async () => {
      setSaving(true)
      setMessage(null)
      try {
        const temp = Number(temperature)
        const tokens = Number(maxTokens)
        if (!Number.isFinite(temp) || temp < 0 || temp > 2) {
          throw new Error('Temperature must be between 0 and 2')
        }
        if (!Number.isFinite(tokens) || tokens < 256 || tokens > 128000) {
          throw new Error('Max tokens must be between 256 and 128000')
        }

        await upsertAiSettings({
          default_model_id: defaultModelId || null,
          ai_enabled: showAiAssistant,
          temperature: temp,
          max_tokens: Math.round(tokens),
          system_prompt_prefix: systemPromptPrefix.trim() || null,
          log_requests: logRequests,
          agent_crud_enabled: agentCrudEnabled,
        })

        await queryClient.invalidateQueries({ queryKey: AI_ASSISTANT_VISIBLE_QUERY_KEY })
        setMessage('Settings saved.')
      } catch (err) {
        setMessage(err instanceof Error ? err.message : 'Unable to save settings')
      } finally {
        setSaving(false)
      }
    })()
  }, [
    agentCrudEnabled,
    showAiAssistant,
    defaultModelId,
    logRequests,
    maxTokens,
    queryClient,
    systemPromptPrefix,
    temperature,
  ])

  useImperativeHandle(ref, () => ({ save: handleSave }), [handleSave])

  if (loading) {
    return (
      <div className={cn(limsPanelClass, 'px-5 py-8 text-center')}>
        <p className="text-sm text-muted-foreground">Loading settings…</p>
      </div>
    )
  }

  const messageIsError =
    !!message &&
    (message.toLowerCase().includes('unable') ||
      message.toLowerCase().includes('failed') ||
      message.toLowerCase().includes('must'))

  return (
    <div className={cn(limsPanelClass)}>
      <div className="relative overflow-hidden bg-gradient-to-br from-stone-800 via-stone-900 to-stone-950 px-4 py-2.5 text-white sm:px-5 sm:py-3">
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.18]"
          style={limsDarkBarGlowStyle}
        />
        <div className="absolute bottom-0 left-0 h-[2px] w-full bg-gradient-to-r from-amber-500 via-amber-300 to-transparent" />
        <div className="relative">
          <h2 className="text-base font-semibold tracking-tight text-white sm:text-lg">General Setting</h2>
        </div>
      </div>

      <div className={cn('space-y-5 bg-gradient-to-b from-stone-100/80 to-white p-4 sm:p-5', limsRegistryFormClass)}>
        {message && (
          <p
            className={
              messageIsError
                ? 'border-l-2 border-destructive bg-destructive/5 px-3 py-2 text-sm text-destructive'
                : 'border-l-2 border-emerald-600 bg-emerald-50 px-3 py-2 text-sm text-emerald-800'
            }
          >
            {message}
          </p>
        )}

        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <ToggleRow
            id="ai-enabled"
            checked={showAiAssistant}
            onChange={setShowAiAssistant}
            label="Show / Hide All AI Buttons"
          />
          <ToggleRow
            id="ai-agent-crud"
            checked={agentCrudEnabled}
            onChange={setAgentCrudEnabled}
            label="Allow QI Assistant to Edit LIMS Data"
          />
          <ToggleRow
            id="ai-log-requests"
            checked={logRequests}
            onChange={setLogRequests}
            label="Log AI Request"
          />
        </div>

        <SettingSection step="01" title="Core Settings" icon={<Cpu className="h-4 w-4" />}>
          <div className="grid grid-cols-1 gap-x-5 gap-y-4 md:grid-cols-3">
            <div className="space-y-0.5">
              <Label>Default AI Model</Label>
              <Select
                value={defaultModelId || '_none'}
                onValueChange={(v) => setDefaultModelId(v === '_none' ? '' : v)}
              >
                <SelectTrigger className={cn(limsFieldClass, 'h-8 w-full')}>
                  <SelectValue placeholder="Select Default Model" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="_none">— None —</SelectItem>
                  {models.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.display_name} ({m.provider})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-0.5">
              <Label htmlFor="ai-temperature">Temperature (0–2)</Label>
              <Input
                id="ai-temperature"
                type="number"
                step="0.1"
                min={0}
                max={2}
                className={limsFieldClass}
                value={temperature}
                onChange={(e) => setTemperature(e.target.value)}
              />
            </div>
            <div className="space-y-0.5">
              <Label htmlFor="ai-max-tokens">Max Tokens</Label>
              <Input
                id="ai-max-tokens"
                type="number"
                min={256}
                max={128000}
                className={limsFieldClass}
                value={maxTokens}
                onChange={(e) => setMaxTokens(e.target.value)}
              />
            </div>
          </div>
        </SettingSection>

        <SettingSection step="02" title="Lab Context" icon={<FlaskConical className="h-4 w-4" />}>
          <div className="space-y-0.5">
            <Label htmlFor="ai-system-prefix">System Prompt Prefix</Label>
            <Textarea
              id="ai-system-prefix"
              className="min-h-[140px] rounded-none border border-stone-500 bg-stone-50 shadow-none focus-visible:border-amber-600 focus-visible:bg-white focus-visible:ring-2 focus-visible:ring-amber-500/20"
              value={systemPromptPrefix}
              onChange={(e) => setSystemPromptPrefix(e.target.value)}
              placeholder="You are an assistant for an ISO 17025 testing laboratory…"
            />
          </div>
        </SettingSection>
      </div>
    </div>
  )
})
