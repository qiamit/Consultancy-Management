import { supabase } from '@/lib/supabaseClient'
import {
  DEFAULT_BIS_DOCUMENT_PRINT_PAGE_SETTINGS,
  parseBisDocumentPrintPageSettings,
  type BisDocumentPrintPageSettings,
} from '../print/bisDocumentPrintPageSettings'

/** Stored once per Application / Licence; shared by all View Documents modules. */
export const BIS_PRINT_PAGE_SETTINGS_MODULE_KIND = 'print-page-settings'

const settingsCache = new Map<string, BisDocumentPrintPageSettings>()
type SettingsListener = (projectId: string, settings: BisDocumentPrintPageSettings) => void
const listeners = new Set<SettingsListener>()

function formatApiError(err: unknown): string {
  if (err instanceof Error && err.message.trim()) return err.message
  if (err && typeof err === 'object' && 'message' in err) {
    const msg = String((err as { message?: unknown }).message ?? '').trim()
    if (msg) return msg
  }
  return 'Something went wrong'
}

function publish(projectId: string, settings: BisDocumentPrintPageSettings): void {
  settingsCache.set(projectId, settings)
  for (const listener of listeners) listener(projectId, settings)
}

/** Live updates so every preview dialog for this Application / Licence stays in sync. */
export function subscribeBisProjectPrintPageSettings(listener: SettingsListener): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function getCachedBisProjectPrintPageSettings(
  projectId: string,
): BisDocumentPrintPageSettings | null {
  return settingsCache.get(projectId) ?? null
}

/** Update in-memory settings immediately (all modules share this). */
export function setCachedBisProjectPrintPageSettings(
  projectId: string,
  settings: BisDocumentPrintPageSettings,
): BisDocumentPrintPageSettings {
  const next = parseBisDocumentPrintPageSettings(settings)
  publish(projectId, next)
  return next
}

/** Loads Page & Print Settings for one Application / Licence (all modules share it). */
export async function loadBisProjectPrintPageSettings(
  projectId: string,
  options?: { preferCache?: boolean },
): Promise<BisDocumentPrintPageSettings> {
  if (options?.preferCache !== false) {
    const cached = settingsCache.get(projectId)
    if (cached) return cached
  }

  const { data, error } = await supabase
    .from('bis_project_module_data')
    .select('payload')
    .eq('bis_project_id', projectId)
    .eq('module_kind', BIS_PRINT_PAGE_SETTINGS_MODULE_KIND)
    .maybeSingle()
  if (error) throw new Error(formatApiError(error))

  const payload = (data as { payload?: unknown } | null)?.payload
  const settings = parseBisDocumentPrintPageSettings(payload)
  publish(projectId, settings)
  return settings
}

/** Persists Page & Print Settings for one Application / Licence. */
export async function saveBisProjectPrintPageSettings(
  projectId: string,
  settings: BisDocumentPrintPageSettings,
): Promise<void> {
  const next = setCachedBisProjectPrintPageSettings(projectId, settings)
  const { error } = await supabase.from('bis_project_module_data').upsert(
    {
      bis_project_id: projectId,
      module_kind: BIS_PRINT_PAGE_SETTINGS_MODULE_KIND,
      payload: next,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'bis_project_id,module_kind' },
  )
  if (error) throw new Error(formatApiError(error))
}

export function clearBisProjectPrintPageSettingsCache(projectId?: string): void {
  if (projectId) settingsCache.delete(projectId)
  else settingsCache.clear()
}

export function resetBisProjectPrintPageSettingsLocal(
  projectId: string,
): BisDocumentPrintPageSettings {
  return setCachedBisProjectPrintPageSettings(
    projectId,
    DEFAULT_BIS_DOCUMENT_PRINT_PAGE_SETTINGS,
  )
}
