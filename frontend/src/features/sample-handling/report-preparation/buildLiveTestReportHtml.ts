import type { TestReportPrintSettings } from '@/features/settings/lab-settings/printSettingsTypes'
import { formatDate } from '@/lib/utils'
import type { ReportPreparationListRow } from './buildTestReportPreparationAssistantContext'
import { buildScopedTestReportPrintHtml } from './buildScopedTestReportPrintHtml'
import { formatSectionReportLine, type TestReportCoverDetails } from './fetchTestReportCoverDetails'
import {
  bindingFromLetterheadSelection,
  type ReportPrepLetterheadsByScope,
} from './reportPrepLetterhead'
import { filterReportRowsByScope, type ReportResultRow } from './reportResultRows'
import { appendReportScopeSuffix, type ReportScopeKind } from './reportScope'
import {
  fetchReportScopeTemplatesConfig,
  resolveReportScopeTemplate,
} from './reportScopeConfig'
import type { TestReportPartBDetails } from './testReportPartB'

export type BuildLiveTestReportHtmlInput = {
  scope: ReportScopeKind
  printSettings: TestReportPrintSettings
  letterheadsByScope: ReportPrepLetterheadsByScope
  active: ReportPreparationListRow
  reportNumber: string
  nablUlrNumber: string
  draftNotes: string
  coverDetails: TestReportCoverDetails | null
  partBDetails: TestReportPartBDetails | null
  resultRows: ReportResultRow[]
  labName?: string
}

/**
 * Same HTML used by Print Preview iframe, browser Print, and Download PDF.
 */
export async function buildLiveTestReportHtml(
  input: BuildLiveTestReportHtmlInput,
): Promise<string> {
  const {
    scope,
    printSettings,
    letterheadsByScope,
    active,
    reportNumber,
    nablUlrNumber,
    draftNotes,
    coverDetails,
    partBDetails,
    resultRows,
  } = input

  const scopedRows = filterReportRowsByScope(resultRows, scope)
  if (scopedRows.length === 0) {
    throw new Error('No parameters for this report scope.')
  }

  const letterheads = letterheadsByScope[scope]
  const scopeConfig = await fetchReportScopeTemplatesConfig()
  const binding = bindingFromLetterheadSelection(scope, scopeConfig, letterheads)
  const template = await resolveReportScopeTemplate(scope, scopeConfig, binding)

  const printCover = coverDetails
    ? {
        ...coverDetails,
        partB: partBDetails ?? coverDetails.partB,
        sectionReportLine: formatSectionReportLine(
          coverDetails.sectionCodes,
          coverDetails.sectionReportNo,
          coverDetails.reportType,
        ),
      }
    : null

  const labName =
    input.labName?.trim() ||
    (typeof window !== 'undefined' &&
      window.localStorage.getItem('labSettings.labName')?.trim()) ||
    'Quality International Research & Laboratories Pvt. Ltd.'

  const scopedReportNumber =
    appendReportScopeSuffix(reportNumber, scope).trim() || reportNumber.trim() || '—'

  return buildScopedTestReportPrintHtml({
    scope,
    labName,
    srf: active.srfNumber ?? active.id,
    client: active.clientName ?? '—',
    isStandard: active.isCodeLabel ?? '—',
    dateReceiving: formatDate(active.dateReceiving ?? ''),
    reportNumber: scopedReportNumber,
    ulrNumber: scope === 'nabl' ? nablUlrNumber : undefined,
    notes: draftNotes,
    rows: scopedRows,
    template,
    coverDetails: printCover,
    printSettings,
  })
}
