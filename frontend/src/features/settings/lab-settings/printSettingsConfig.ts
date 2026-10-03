import { supabase } from '@/lib/supabaseClient'
import { LAB_SETTINGS_SINGLETON_ID, resolveLabSettingsRowId } from './labSettingsDb'
import {
  DEFAULT_LAB_PRINT_SETTINGS,
  DEFAULT_SRF_PRINT_SETTINGS,
  DEFAULT_TEST_REPORT_PRINT_SETTINGS,
  labPrintSettingsToJson,
  parseLabPrintSettings,
  parseSrfPrintSettings,
  parseTestReportPrintSettings,
  type LabPrintSettingsDocument,
  type SrfPrintSettings,
  type TestReportPrintSettings,
} from './printSettingsTypes'

const TEST_REPORT_PRINT_CACHE_KEY = 'qirlpl-lims.testReportPrintSettings.v2'

function readTestReportPrintCache(): TestReportPrintSettings | null {
  try {
    const raw = localStorage.getItem(TEST_REPORT_PRINT_CACHE_KEY)
    if (!raw) return null
    return parseTestReportPrintSettings(JSON.parse(raw))
  } catch {
    return null
  }
}

function writeTestReportPrintCache(settings: TestReportPrintSettings): void {
  try {
    localStorage.setItem(
      TEST_REPORT_PRINT_CACHE_KEY,
      JSON.stringify(parseTestReportPrintSettings(settings)),
    )
  } catch {
    // ignore quota / private mode
  }
}

function hasStoredPrintSettings(raw: unknown): boolean {
  if (!raw || typeof raw !== 'object') return false
  const o = raw as Record<string, unknown>
  if (o.testReport && typeof o.testReport === 'object' && Object.keys(o.testReport).length > 0) {
    return true
  }
  if (o.srf && typeof o.srf === 'object' && Object.keys(o.srf).length > 0) {
    return true
  }
  if ('pageSize' in o || 'bodyPaddingTopMm' in o || 'pdfOutputMode' in o) {
    return true
  }
  return Object.keys(o).length > 0
}

async function requireAuthSession(): Promise<void> {
  const {
    data: { session },
  } = await supabase.auth.getSession()
  if (!session) {
    throw new Error('You must be signed in to load or save print settings.')
  }
}

async function fetchPrintSettingsRaw(): Promise<unknown | null> {
  await requireAuthSession()
  const rowId = await resolveLabSettingsRowId(supabase)

  const { data, error } = await supabase
    .from('lab_settings')
    .select('print_settings')
    .eq('id', rowId)
    .maybeSingle()

  if (error) {
    throw new Error(error.message || 'Failed to load print settings.')
  }

  const raw = data?.print_settings
  if (raw != null && typeof raw === 'object' && hasStoredPrintSettings(raw)) {
    return raw
  }

  return null
}

export async function fetchLabPrintSettings(): Promise<LabPrintSettingsDocument> {
  try {
    const raw = await fetchPrintSettingsRaw()
    if (raw != null) {
      const doc = parseLabPrintSettings(raw)
      writeTestReportPrintCache(doc.testReport)
      return doc
    }
  } catch (err) {
    // Prefer a fresh session retry once — auth can be briefly null on first paint.
    try {
      await new Promise((r) => setTimeout(r, 250))
      const raw = await fetchPrintSettingsRaw()
      if (raw != null) {
        const doc = parseLabPrintSettings(raw)
        writeTestReportPrintCache(doc.testReport)
        return doc
      }
    } catch {
      // fall through to cache
    }
    const cached = readTestReportPrintCache()
    if (cached) {
      return {
        testReport: cached,
        srf: { ...DEFAULT_SRF_PRINT_SETTINGS },
      }
    }
    throw err
  }

  const cached = readTestReportPrintCache()
  if (cached) {
    return {
      testReport: cached,
      srf: { ...DEFAULT_SRF_PRINT_SETTINGS },
    }
  }

  return {
    testReport: parseTestReportPrintSettings(DEFAULT_TEST_REPORT_PRINT_SETTINGS),
    srf: parseSrfPrintSettings(DEFAULT_SRF_PRINT_SETTINGS),
  }
}

export async function fetchTestReportPrintSettings(): Promise<TestReportPrintSettings> {
  const doc = await fetchLabPrintSettings()
  return doc.testReport
}

export async function fetchSrfPrintSettings(): Promise<SrfPrintSettings> {
  const doc = await fetchLabPrintSettings()
  return doc.srf
}

export async function saveLabPrintSettings(settings: LabPrintSettingsDocument): Promise<void> {
  await requireAuthSession()
  const rowId = await resolveLabSettingsRowId(supabase)
  const json = labPrintSettingsToJson(settings)

  const { data: existing, error: existsError } = await supabase
    .from('lab_settings')
    .select('id')
    .eq('id', rowId)
    .maybeSingle()

  if (existsError) {
    throw new Error(existsError.message || 'Failed to verify lab settings row.')
  }

  let savedRaw: unknown

  if (existing?.id) {
    const { data, error } = await supabase
      .from('lab_settings')
      .update({ print_settings: json })
      .eq('id', rowId)
      .select('print_settings')
      .single()

    if (error) {
      throw new Error(error.message || 'Failed to save print settings.')
    }
    savedRaw = data?.print_settings
  } else {
    const { data, error } = await supabase
      .from('lab_settings')
      .upsert(
        {
          id: LAB_SETTINGS_SINGLETON_ID,
          print_settings: json,
          lab_name: '',
        },
        { onConflict: 'id' },
      )
      .select('print_settings')
      .single()

    if (error) {
      throw new Error(error.message || 'Failed to save print settings.')
    }
    savedRaw = data?.print_settings
  }

  if (savedRaw == null || typeof savedRaw !== 'object') {
    throw new Error('Print settings were not saved. Check your permissions and try again.')
  }

  const saved = parseLabPrintSettings(savedRaw)
  writeTestReportPrintCache(saved.testReport)
}

export async function saveTestReportPrintSettings(
  settings: TestReportPrintSettings,
): Promise<void> {
  const normalized = parseTestReportPrintSettings(settings)
  // Always write local cache first so a refresh still sees the latest values
  // even if a subsequent DB read races with auth.
  writeTestReportPrintCache(normalized)

  let existingDoc: LabPrintSettingsDocument = {
    testReport: normalized,
    srf: parseSrfPrintSettings(DEFAULT_SRF_PRINT_SETTINGS),
  }

  try {
    const raw = await fetchPrintSettingsRaw()
    if (raw != null) {
      existingDoc = parseLabPrintSettings(raw)
    } else {
      const cached = readTestReportPrintCache()
      if (cached) {
        existingDoc = { ...existingDoc, testReport: cached }
      }
    }
  } catch {
    const cached = readTestReportPrintCache()
    if (cached) {
      existingDoc = { ...existingDoc, testReport: cached }
    }
  }

  await saveLabPrintSettings({ ...existingDoc, testReport: normalized })
}

export {
  DEFAULT_LAB_PRINT_SETTINGS,
  DEFAULT_SRF_PRINT_SETTINGS,
  DEFAULT_TEST_REPORT_PRINT_SETTINGS,
  parseLabPrintSettings,
  parseSrfPrintSettings,
  parseTestReportPrintSettings,
}
