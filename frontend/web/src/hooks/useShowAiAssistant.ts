import { useQuery } from '@tanstack/react-query'
import { fetchAiSettings } from '@/features/settings/ai-settings/aiSettingsApi'

/** Query key — invalidate after General Setting “Show / Hide All AI Buttons” changes. */
export const AI_ASSISTANT_VISIBLE_QUERY_KEY = ['ai-assistant-visible'] as const

/**
 * Global UI Show/Hide for all in-app AI buttons (QI Assistant, AI Fill, polish sparkles, etc.).
 * Driven by `ai_settings.ai_enabled` (Lab Settings → AI Settings → General).
 * Server-side AI remains available regardless of this flag.
 */
export function useShowAiAssistant(): boolean {
  const { data } = useQuery({
    queryKey: AI_ASSISTANT_VISIBLE_QUERY_KEY,
    queryFn: async () => {
      const settings = await fetchAiSettings()
      return settings?.ai_enabled !== false
    },
    staleTime: 30_000,
  })
  return data ?? true
}

/** Alias — same as useShowAiAssistant (show/hide every AI button in the app). */
export const useShowAiButtons = useShowAiAssistant
