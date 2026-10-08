export type ReportScopeKind = 'nabl' | 'non_nabl'

export type ReportScopeTemplateBinding = {
  headerName: string
  footerName: string
  termsName: string
  watermarkName: string
}

export type ReportScopeTemplatesConfig = {
  nabl: ReportScopeTemplateBinding
  non_nabl: ReportScopeTemplateBinding
}

/** Fallback template titles when scope bindings are unset (must match Lab Settings letterhead names). */
export const DEFAULT_LETTERHEAD_TEMPLATE_NAMES = {
  nablHeader: 'NABL Letter Header - Testing',
  nonNablHeader: 'General Letter Header',
  footer: 'General Letter Footer',
} as const

/** Extra aliases used when stored scope bindings still use older titles. */
export const LETTERHEAD_TEMPLATE_NAME_ALIASES: Record<string, string[]> = {
  'Non NABL Letter Head': ['General Letter Header', 'General Letter Head'],
  'Non NABL Letter Header': ['General Letter Header'],
  'NABL Letter Head': [
    'NABL Letter Header - Testing',
    'NABL Letter Header - Calibration',
    'NABL Letter Header',
  ],
  'NABL Letter Header': [
    'NABL Letter Header - Testing',
    'NABL Letter Header - Calibration',
  ],
  'Water Mark': ['Report Water Mark'],
}

export const EMPTY_SCOPE_BINDING: ReportScopeTemplateBinding = {
  headerName: '',
  footerName: DEFAULT_LETTERHEAD_TEMPLATE_NAMES.footer,
  termsName: '',
  watermarkName: '',
}

export const EMPTY_REPORT_SCOPE_TEMPLATES: ReportScopeTemplatesConfig = {
  nabl: {
    ...EMPTY_SCOPE_BINDING,
    headerName: DEFAULT_LETTERHEAD_TEMPLATE_NAMES.nablHeader,
  },
  non_nabl: {
    ...EMPTY_SCOPE_BINDING,
    headerName: DEFAULT_LETTERHEAD_TEMPLATE_NAMES.nonNablHeader,
  },
}

export function parseReportScopeTemplates(raw: unknown): ReportScopeTemplatesConfig {
  if (!raw || typeof raw !== 'object') return { ...EMPTY_REPORT_SCOPE_TEMPLATES }

  const obj = raw as Record<string, unknown>
  const readBinding = (key: ReportScopeKind): ReportScopeTemplateBinding => {
    const block = obj[key]
    const headerFallback =
      key === 'nabl'
        ? DEFAULT_LETTERHEAD_TEMPLATE_NAMES.nablHeader
        : DEFAULT_LETTERHEAD_TEMPLATE_NAMES.nonNablHeader
    if (!block || typeof block !== 'object') {
      return {
        ...EMPTY_SCOPE_BINDING,
        headerName: headerFallback,
      }
    }
    const b = block as Record<string, unknown>
    return {
      headerName: String(b.headerName ?? '').trim() || headerFallback,
      footerName:
        String(b.footerName ?? '').trim() || DEFAULT_LETTERHEAD_TEMPLATE_NAMES.footer,
      termsName: String(b.termsName ?? '').trim(),
      watermarkName: String(b.watermarkName ?? '').trim(),
    }
  }

  return {
    nabl: readBinding('nabl'),
    non_nabl: readBinding('non_nabl'),
  }
}
