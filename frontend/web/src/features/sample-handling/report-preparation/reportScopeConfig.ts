import { supabase } from '@/lib/supabaseClient'
import { LAB_SETTINGS_SINGLETON_ID, letterheadFromRow } from '@/features/settings/lab-settings/labSettingsDb'
import {
  DEFAULT_LETTERHEAD_TEMPLATE_NAMES,
  EMPTY_REPORT_SCOPE_TEMPLATES,
  LETTERHEAD_TEMPLATE_NAME_ALIASES,
  parseReportScopeTemplates,
  type ReportScopeKind,
  type ReportScopeTemplateBinding,
  type ReportScopeTemplatesConfig,
} from '@/features/settings/lab-settings/reportScopeTemplateTypes'

import { isLetterheadNotApplicable } from './reportPrepLetterhead'

export type ResolvedScopeTemplate = {
  headerUrl: string | null
  footerUrl: string | null
  termsText: string
  watermarkUrl: string | null
  watermarkText: string
  /** User chose N/A — do not render header block or lab-name fallback. */
  omitHeader?: boolean
  /** User chose N/A — do not render footer block. */
  omitFooter?: boolean
}

const LETTERHEAD_BUCKET = 'laboratory-files'

function lookupLetterheadPath(map: Map<string, string>, name: string): string | null {
  const key = name.trim()
  if (!key) return null
  const direct = map.get(key)
  if (direct) return direct

  const lower = key.toLowerCase()
  for (const [title, path] of map) {
    if (title.toLowerCase() === lower) return path
  }

  const aliases = LETTERHEAD_TEMPLATE_NAME_ALIASES[key] ?? []
  for (const alias of aliases) {
    const hit =
      map.get(alias) ??
      [...map.entries()].find(([t]) => t.toLowerCase() === alias.toLowerCase())?.[1]
    if (hit) return hit
  }

  // Soft match: stored "NABL Letter Head" → "NABL Letter Header - Testing"
  for (const [title, path] of map) {
    if (title.toLowerCase().includes(lower) || lower.includes(title.toLowerCase())) return path
  }

  return null
}

function lookupLetterheadText(map: Map<string, string>, name: string): string {
  return lookupLetterheadPath(map, name) ?? ''
}

async function signedUrl(path: string | null | undefined): Promise<string | null> {
  const p = (path ?? '').trim()
  if (!p) return null
  if (/^https?:\/\//i.test(p)) return p
  const { data, error } = await supabase.storage.from(LETTERHEAD_BUCKET).createSignedUrl(p, 60 * 60)
  if (error || !data?.signedUrl) return null
  return data.signedUrl
}

export async function fetchReportScopeTemplatesConfig(): Promise<ReportScopeTemplatesConfig> {
  const { data, error } = await supabase
    .from('lab_settings')
    .select('report_scope_templates')
    .eq('id', LAB_SETTINGS_SINGLETON_ID)
    .maybeSingle()

  if (error || !data) {
    const fallback = await supabase
      .from('lab_settings')
      .select('report_scope_templates')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    return parseReportScopeTemplates(fallback.data?.report_scope_templates)
  }

  return parseReportScopeTemplates(data.report_scope_templates)
}

type LetterheadIndex = {
  headers: Map<string, string>
  footers: Map<string, string>
  terms: Map<string, string>
  watermarkImages: Map<string, string>
  watermarkTexts: Map<string, string>
}

async function loadLetterheadIndex(): Promise<LetterheadIndex> {
  const { data } = await supabase.from('lab_letterheads').select('template_type, title, name, file_path, content_text')

  const headers = new Map<string, string>()
  const footers = new Map<string, string>()
  const terms = new Map<string, string>()
  const watermarkImages = new Map<string, string>()
  const watermarkTexts = new Map<string, string>()

  for (const row of Array.isArray(data) ? data : []) {
    const { type, title, fileUrl, text } = letterheadFromRow(row as Record<string, unknown>)
    const key = title.trim()
    if (!key) continue
    if (type === 'header' && fileUrl) headers.set(key, fileUrl)
    else if (type === 'footer' && fileUrl) footers.set(key, fileUrl)
    else if (type === 'terms') terms.set(key, text)
    else if (type === 'watermark_image' && fileUrl) watermarkImages.set(key, fileUrl)
    else if (type === 'watermark_text') watermarkTexts.set(key, text)
  }

  return { headers, footers, terms, watermarkImages, watermarkTexts }
}

async function resolveBinding(
  binding: ReportScopeTemplateBinding,
  index: LetterheadIndex,
): Promise<ResolvedScopeTemplate> {
  const omitHeader = isLetterheadNotApplicable(binding.headerName)
  const omitFooter = isLetterheadNotApplicable(binding.footerName)
  const omitWatermark = isLetterheadNotApplicable(binding.watermarkName)

  const headerPath =
    !omitHeader && binding.headerName
      ? lookupLetterheadPath(index.headers, binding.headerName)
      : null
  const footerPath =
    !omitFooter && binding.footerName
      ? lookupLetterheadPath(index.footers, binding.footerName)
      : null
  const wmImagePath =
    !omitWatermark && binding.watermarkName
      ? lookupLetterheadPath(index.watermarkImages, binding.watermarkName)
      : null
  const wmText =
    !omitWatermark && binding.watermarkName
      ? lookupLetterheadText(index.watermarkTexts, binding.watermarkName)
      : ''

  const [headerUrl, footerUrl, watermarkUrl] = await Promise.all([
    signedUrl(headerPath),
    signedUrl(footerPath),
    signedUrl(wmImagePath),
  ])

  return {
    headerUrl,
    footerUrl,
    termsText: binding.termsName ? index.terms.get(binding.termsName) ?? '' : '',
    watermarkUrl,
    watermarkText: wmText,
    omitHeader,
    omitFooter,
  }
}

/** Resolve header/footer images by template title (SRF print, previews). */
export async function resolveNamedLetterheadTemplates(
  headerName: string,
  footerName: string,
): Promise<{ headerUrl: string | null; footerUrl: string | null }> {
  const index = await loadLetterheadIndex()
  const resolved = await resolveBinding(
    {
      headerName: headerName.trim(),
      footerName: footerName.trim(),
      termsName: '',
      watermarkName: '',
    },
    index,
  )
  return { headerUrl: resolved.headerUrl, footerUrl: resolved.footerUrl }
}

export async function resolveReportScopeTemplate(
  scope: ReportScopeKind,
  config?: ReportScopeTemplatesConfig,
  bindingOverride?: Partial<ReportScopeTemplateBinding>,
): Promise<ResolvedScopeTemplate> {
  const cfg = config ?? (await fetchReportScopeTemplatesConfig())
  const base = cfg[scope] ?? EMPTY_REPORT_SCOPE_TEMPLATES[scope]
  const binding: ReportScopeTemplateBinding = {
    ...base,
    ...(bindingOverride?.headerName !== undefined ? { headerName: bindingOverride.headerName } : {}),
    ...(bindingOverride?.footerName !== undefined ? { footerName: bindingOverride.footerName } : {}),
    ...(bindingOverride?.termsName !== undefined ? { termsName: bindingOverride.termsName } : {}),
    ...(bindingOverride?.watermarkName !== undefined
      ? { watermarkName: bindingOverride.watermarkName }
      : {}),
  }
  const index = await loadLetterheadIndex()
  return resolveBinding(binding, index)
}

export async function saveReportScopeTemplatesConfig(config: ReportScopeTemplatesConfig): Promise<void> {
  const { error } = await supabase.from('lab_settings').upsert(
    {
      id: LAB_SETTINGS_SINGLETON_ID,
      report_scope_templates: config,
    },
    { onConflict: 'id' },
  )
  if (error) throw error
}
