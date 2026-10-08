import { supabase } from '@/lib/supabaseClient'
import {
  fetchSrfPrintSettings,
  fetchTestReportPrintSettings,
} from '@/features/settings/lab-settings/printSettingsConfig'
import {
  visibleTestReportSignatures,
  type TestReportPrintSettings,
  type TestReportSignature,
} from '@/features/settings/lab-settings/printSettingsTypes'
import { parseLabSettingsRow, resolveLabSettingsRowId } from '@/features/settings/lab-settings/labSettingsDb'
import { DEFAULT_LETTERHEAD_TEMPLATE_NAMES } from '@/features/settings/lab-settings/reportScopeTemplateTypes'
import {
  fetchReportScopeTemplatesConfig,
  resolveNamedLetterheadTemplates,
  resolveReportScopeTemplate,
  type ResolvedScopeTemplate,
} from './reportScopeConfig'
import { CONSENT_LETTER_DEFAULTS } from './consentLetterDefaults'
import type { ConsentLetterLabDetails } from './fetchConsentLetterFormData'
import { fetchActiveUserProfiles } from '@/features/sample-handling/shared/fetchActiveUserProfiles'
import { embedPrintImageAsDataUrl } from './embedPrintImages'

const LETTERHEAD_BUCKET = 'laboratory-files'
const CONSENT_LETTER_SIGNATORY_DESIGNATION = 'Quality Manager'
const CONSENT_LETTER_SIGNATORY_ROLE = 'Approved By'

function normalizeDesignation(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ')
}

function normalizeDepartment(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ')
}

async function resolveConsentLetterSignatory(
  printSignatures: TestReportSignature[],
): Promise<TestReportSignature> {
  const profiles = await fetchActiveUserProfiles()
  const isQualityManager = (profile: { designation: string }) =>
    normalizeDesignation(profile.designation) === 'quality manager'

  const qualityManager =
    profiles.find(
      (profile) =>
        isQualityManager(profile) && normalizeDepartment(profile.departmentName) === 'quality assurance',
    ) ?? profiles.find(isQualityManager)

  if (qualityManager) {
    return {
      roleLabel: CONSENT_LETTER_SIGNATORY_ROLE,
      userId: qualityManager.id,
      name: qualityManager.name,
      designation: CONSENT_LETTER_SIGNATORY_DESIGNATION,
      department: qualityManager.departmentName ?? '',
      enabled: true,
      required: true,
      showAfterParts: ['part_d'],
    }
  }

  const linked = printSignatures.find((s) => s.userId.trim())
  if (linked?.name.trim()) {
    return {
      roleLabel: CONSENT_LETTER_SIGNATORY_ROLE,
      userId: linked.userId,
      name: linked.name.trim(),
      designation: CONSENT_LETTER_SIGNATORY_DESIGNATION,
      department: linked.department ?? '',
      enabled: true,
      required: true,
      showAfterParts: linked.showAfterParts?.length
        ? [...linked.showAfterParts]
        : ['part_d'],
    }
  }

  return {
    roleLabel: CONSENT_LETTER_SIGNATORY_ROLE,
    userId: '',
    name: '',
    designation: CONSENT_LETTER_SIGNATORY_DESIGNATION,
    department: '',
    enabled: true,
    required: true,
    showAfterParts: ['part_d'],
  }
}

async function signedStorageUrl(path: string | null | undefined): Promise<string | null> {
  const p = (path ?? '').trim()
  if (!p) return null
  if (/^https?:\/\//i.test(p)) return p
  const { data, error } = await supabase.storage.from(LETTERHEAD_BUCKET).createSignedUrl(p, 60 * 60)
  if (error || !data?.signedUrl) return null
  return data.signedUrl
}

export type ConsentLetterPrintContext = {
  lab: ConsentLetterLabDetails
  printSettings: TestReportPrintSettings
  template: ResolvedScopeTemplate
  sealSignUrl: string | null
  signatures: TestReportSignature[]
}

async function resolveConsentLetterTemplate(): Promise<ResolvedScopeTemplate> {
  const [config, srfPrint] = await Promise.all([
    fetchReportScopeTemplatesConfig(),
    fetchSrfPrintSettings(),
  ])

  const binding = config.non_nabl
  const fallbackHeader =
    DEFAULT_LETTERHEAD_TEMPLATE_NAMES.nonNablHeader
  const fallbackFooter = DEFAULT_LETTERHEAD_TEMPLATE_NAMES.footer

  let template = await resolveReportScopeTemplate(
    'non_nabl',
    config,
    binding.headerName || binding.footerName
      ? undefined
      : {
          headerName: fallbackHeader,
          footerName: fallbackFooter,
        },
  )

  const needsHeader = !template.omitHeader && !template.headerUrl
  const needsFooter = !template.omitFooter && !template.footerUrl
  if (needsHeader || needsFooter) {
    const headerCandidates = [
      needsHeader ? binding.headerName.trim() : '',
      srfPrint.headerTemplateName.trim(),
      fallbackHeader,
      'General Letter Header',
    ].filter(Boolean)
    const footerCandidates = [
      needsFooter ? binding.footerName.trim() : '',
      srfPrint.footerTemplateName.trim(),
      fallbackFooter,
      'General Letter Footer',
    ].filter(Boolean)

    let headerUrl = template.headerUrl
    let footerUrl = template.footerUrl
    for (const name of headerCandidates) {
      if (headerUrl) break
      const named = await resolveNamedLetterheadTemplates(name, footerCandidates[0] ?? fallbackFooter)
      headerUrl = named.headerUrl
      footerUrl = footerUrl ?? named.footerUrl
    }
    if (!footerUrl) {
      for (const name of footerCandidates) {
        const named = await resolveNamedLetterheadTemplates(headerCandidates[0] ?? fallbackHeader, name)
        if (named.footerUrl) {
          footerUrl = named.footerUrl
          break
        }
      }
    }

    template = {
      ...template,
      headerUrl: template.headerUrl ?? headerUrl,
      footerUrl: template.footerUrl ?? footerUrl,
      omitHeader: Boolean(template.omitHeader && !(template.headerUrl ?? headerUrl)),
      omitFooter: Boolean(template.omitFooter && !(template.footerUrl ?? footerUrl)),
    }
  }

  return template
}

export async function fetchConsentLetterPrintContext(): Promise<ConsentLetterPrintContext> {
  const [printSettings, rowId, template] = await Promise.all([
    fetchTestReportPrintSettings(),
    resolveLabSettingsRowId(supabase),
    resolveConsentLetterTemplate(),
  ])

  const { data } = await supabase.from('lab_settings').select('*').eq('id', rowId).maybeSingle()
  const parsed = data ? parseLabSettingsRow(data as Record<string, unknown>) : null
  const mobile = parsed?.mobile?.trim()
  const sealSignUrl = await signedStorageUrl(parsed?.sealSignPath)
  const printSignatures = visibleTestReportSignatures(printSettings)
  const signatory = await resolveConsentLetterSignatory(printSignatures)
  const [headerUrl, footerUrl, sealEmbedded] = await Promise.all([
    embedPrintImageAsDataUrl(template.headerUrl),
    embedPrintImageAsDataUrl(template.footerUrl),
    embedPrintImageAsDataUrl(sealSignUrl),
  ])

  return {
    lab: {
      labName: parsed?.labName?.trim() || CONSENT_LETTER_DEFAULTS.labName,
      address: parsed?.address?.trim() || CONSENT_LETTER_DEFAULTS.address,
      contacts: mobile || CONSENT_LETTER_DEFAULTS.contacts,
      website: CONSENT_LETTER_DEFAULTS.website,
      email: parsed?.email?.trim() || CONSENT_LETTER_DEFAULTS.email,
      bisOslCode: CONSENT_LETTER_DEFAULTS.bisOslCode,
      nablCertificateNo: CONSENT_LETTER_DEFAULTS.nablCertificateNo,
    },
    printSettings,
    template: {
      ...template,
      headerUrl,
      footerUrl,
    },
    sealSignUrl: sealEmbedded,
    signatures: [signatory],
  }
}
