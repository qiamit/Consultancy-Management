import { useEffect, useMemo, useState } from 'react'
import { CheckCircle, Eye, LayoutTemplate, Save, Settings2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import {
  limsDarkBarBtnClass,
  limsDarkBarGlowStyle,
  limsDialogClass,
  limsPrimaryBtnClass,
} from '@/lib/limsThemeUi'
import { cn } from '@/lib/utils'
import { type ReportScopeKind, REPORT_SCOPE_SUFFIX } from './reportScope'
import { getApplicableReportScopes, filterReportRowsByScope, type ReportResultRow } from './reportResultRows'
import { TestReportResultsSection } from './TestReportResultsSection'
import { TestReportCoverDetailsGrid } from './TestReportCoverDetailsGrid'
import { TestReportSupplementaryGrid } from './TestReportSupplementaryGrid'
import { TestReportRemarksSection } from './TestReportRemarksSection'
import { formatSectionReportLine, type TestReportCoverDetails } from './fetchTestReportCoverDetails'
import type { TestReportPartBDetails } from './testReportPartB'
import type { LetterheadTemplateOptions, ReportPrepLetterheadsByScope } from './reportPrepLetterhead'
import type { ReportPreparationListRow } from './buildTestReportPreparationAssistantContext'
import { TestReportPrepareDialogAssistant } from './TestReportPrepareDialogAssistant'
import {
  TestReportPageSettingDialog,
  TestReportPrintSettingDialog,
  useTestReportPrintSettingsForPrepare,
} from './TestReportPreparePrintDialogs'
import { TestReportPrintPreviewDialog } from './TestReportPrintPreviewDialog'

const fmt = (v: string | null | undefined) => (v && String(v).trim() ? String(v).trim() : '—')

export function TestReportPrepareDialog({
  open,
  onOpenChange,
  active,
  reportNumber,
  onReportNumberChange,
  testReportPrefix,
  reportNumberLoading,
  draftNotes,
  onDraftNotesChange,
  nablUlrNumber,
  onNablUlrNumberChange,
  ulrPrefix,
  ulrPrefixLoading,
  letterheadOptions,
  letterheadsByScope,
  onLetterheadChange,
  onPersistLetterheadDefaults,
  onReloadLetterheadDefaults,
  coverDetails,
  partBDetails,
  onPartBDetailsChange,
  coverLoading,
  resultRows,
  resultsLoading,
  saveMessage,
  saveLoading,
  issueLoading,
  onSaveDraft,
  onIssueReports,
  onRemarkChange,
  sampleId = null,
  sectionCodeEditable = false,
  onSectionCodeUpdated,
  specifiedRequirementEditable = false,
  onSpecifiedRequirementUpdated,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  active: ReportPreparationListRow | null
  reportNumber: string
  onReportNumberChange: (value: string) => void
  testReportPrefix: string
  reportNumberLoading: boolean
  draftNotes: string
  onDraftNotesChange: (value: string) => void
  nablUlrNumber: string
  onNablUlrNumberChange: (value: string) => void
  ulrPrefix: string
  ulrPrefixLoading: boolean
  letterheadOptions: LetterheadTemplateOptions
  letterheadsByScope: ReportPrepLetterheadsByScope
  onLetterheadChange: (
    scope: ReportScopeKind,
    field: 'headerName' | 'footerName' | 'watermarkName',
    value: string,
  ) => void
  onPersistLetterheadDefaults?: () => Promise<void>
  onReloadLetterheadDefaults?: () => Promise<void>
  coverDetails: TestReportCoverDetails | null
  partBDetails: TestReportPartBDetails | null
  onPartBDetailsChange: (next: TestReportPartBDetails) => void
  coverLoading: boolean
  resultRows: ReportResultRow[]
  resultsLoading: boolean
  saveMessage: string | null
  saveLoading: boolean
  issueLoading: boolean
  onSaveDraft: () => void
  onIssueReports: () => void
  onRemarkChange?: (rowKey: string, remark: string) => void
  sampleId?: string | null
  sectionCodeEditable?: boolean
  onSectionCodeUpdated?: (oldCode: string, newCode: string) => void
  specifiedRequirementEditable?: boolean
  onSpecifiedRequirementUpdated?: (rowKey: string, nextValue: string) => void
}) {
  const applicableScopes = getApplicableReportScopes(resultRows)
  const [activeReportScope, setActiveReportScope] = useState<ReportScopeKind>('nabl')
  const [printSettingOpen, setPrintSettingOpen] = useState(false)
  const [pageSettingOpen, setPageSettingOpen] = useState(false)
  const [printPreviewOpen, setPrintPreviewOpen] = useState(false)
  const printSettingsControls = useTestReportPrintSettingsForPrepare(open)

  useEffect(() => {
    if (!open) {
      setPrintPreviewOpen(false)
      return
    }
    if (applicableScopes.length === 0) return
    setActiveReportScope((prev) =>
      applicableScopes.includes(prev) ? prev : applicableScopes[0],
    )
  }, [open, applicableScopes])

  const liveCoverDetails = useMemo((): TestReportCoverDetails | null => {
    if (!coverDetails) return null
    const partB = partBDetails ?? coverDetails.partB
    return {
      ...coverDetails,
      partB,
      sectionReportLine: formatSectionReportLine(
        coverDetails.sectionCodes,
        coverDetails.sectionReportNo,
        coverDetails.reportType,
      ),
    }
  }, [coverDetails, partBDetails])

  const activeScopeRowCount = filterReportRowsByScope(resultRows, activeReportScope).length
  const previewDisabled =
    !active ||
    coverLoading ||
    saveLoading ||
    issueLoading ||
    applicableScopes.length === 0 ||
    activeScopeRowCount === 0

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        persistOnFocusLoss
        aria-describedby={undefined}
        overlayClassName="lg:inset-y-0 lg:left-[268px] lg:right-0 lg:w-auto"
        className={cn(
          limsDialogClass,
          'left-0 top-0 flex h-[100dvh] max-h-[100dvh] w-full max-w-none translate-x-0 translate-y-0 flex-col border-0',
          'lg:left-[268px] md:h-[100dvh] lg:w-[calc(100vw-268px)] lg:max-w-[calc(100vw-268px)]',
        )}
      >
        <div className="relative shrink-0 overflow-hidden bg-gradient-to-br from-stone-800 via-stone-900 to-stone-950 px-4 py-2.5 text-white sm:px-5 sm:py-3">
          <div className="pointer-events-none absolute inset-0 opacity-[0.18]" style={limsDarkBarGlowStyle} />
          <div className="absolute bottom-0 left-0 h-[2px] w-full bg-gradient-to-r from-amber-500 via-amber-300 to-transparent" />
          <DialogHeader className="relative pr-10 text-left">
            <DialogTitle className="text-base font-semibold tracking-tight text-white sm:text-lg">
              Test Report for SRF Number
              {active?.srfNumber?.trim() ? ` — ${fmt(active.srfNumber)}` : ''}
            </DialogTitle>
          </DialogHeader>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto bg-gradient-to-b from-stone-100/90 to-stone-50 px-4 py-4 sm:px-5">
          {active && (
            <div className="space-y-4">
              {saveMessage && <p className="text-sm text-stone-600">{saveMessage}</p>}

              {coverLoading ? (
                <p className="text-sm text-stone-600">Loading report cover details…</p>
              ) : liveCoverDetails ? (
                <div className="space-y-4">
                  <TestReportCoverDetailsGrid
                    details={liveCoverDetails}
                    reportNumber={reportNumber}
                    onReportNumberChange={onReportNumberChange}
                    testReportPrefix={testReportPrefix}
                    reportNumberLoading={reportNumberLoading}
                    nablUlrNumber={nablUlrNumber}
                    onNablUlrNumberChange={onNablUlrNumberChange}
                    ulrPrefix={ulrPrefix}
                    ulrPrefixLoading={ulrPrefixLoading}
                    activeScope={activeReportScope}
                    disabled={coverLoading || saveLoading || issueLoading}
                  />
                  {liveCoverDetails.partB && (
                    <TestReportSupplementaryGrid
                      details={liveCoverDetails.partB}
                      onChange={onPartBDetailsChange}
                      disabled={coverLoading || saveLoading || issueLoading}
                    />
                  )}
                </div>
              ) : (
                <p className="text-sm text-stone-600">Unable to load report cover details.</p>
              )}

              <TestReportResultsSection
                resultsLoading={resultsLoading}
                applicableScopes={applicableScopes}
                activeScope={activeReportScope}
                onActiveScopeChange={setActiveReportScope}
                resultRows={resultRows}
                onRemarkChange={onRemarkChange}
                disabled={saveLoading || issueLoading}
                sampleId={sampleId}
                sectionCodeEditable={sectionCodeEditable}
                onSectionCodeUpdated={onSectionCodeUpdated}
                specifiedRequirementEditable={specifiedRequirementEditable}
                onSpecifiedRequirementUpdated={onSpecifiedRequirementUpdated}
              />

              <TestReportRemarksSection
                remarks={draftNotes}
                onRemarksChange={onDraftNotesChange}
                isCodeLabel={active?.isCodeLabel ?? liveCoverDetails?.isCode ?? null}
                disabled={saveLoading || issueLoading}
              />
            </div>
          )}
        </div>

        <div className="relative shrink-0 border-t border-stone-700 bg-gradient-to-br from-stone-800 via-stone-900 to-stone-950 px-4 py-3 sm:px-5">
          <div className="pointer-events-none absolute inset-0 opacity-[0.18]" style={limsDarkBarGlowStyle} />
          <div className="absolute top-0 left-0 h-[2px] w-full bg-gradient-to-r from-amber-500 via-amber-300 to-transparent" />
          <div className="relative flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <TestReportPrepareDialogAssistant
              row={active}
              coverDetails={liveCoverDetails}
              partBDetails={partBDetails}
              resultRows={resultRows}
              reportNumber={reportNumber}
              nablUlrNumber={nablUlrNumber}
              draftNotes={draftNotes}
              disabled={coverLoading || saveLoading || issueLoading}
              prepareDialogOpen={open}
            />
            <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:justify-end">
              <Button
                type="button"
                variant="outline"
                onClick={() => setPrintSettingOpen(true)}
                disabled={coverLoading || saveLoading || issueLoading}
                className={cn('gap-2', limsDarkBarBtnClass)}
              >
                <Settings2 size={16} />
                Print Setting
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => setPageSettingOpen(true)}
                disabled={coverLoading || saveLoading || issueLoading}
                className={cn('gap-2', limsDarkBarBtnClass)}
              >
                <LayoutTemplate size={16} />
                Page Setting
              </Button>
              <Button
                type="button"
                variant="outline"
                id={`preview-${activeReportScope}`}
                onClick={() => setPrintPreviewOpen(true)}
                disabled={previewDisabled}
                className={cn('gap-2', limsDarkBarBtnClass)}
              >
                <Eye size={16} />
                Preview {REPORT_SCOPE_SUFFIX[activeReportScope]}
              </Button>
              <Button
                type="button"
                variant="outline"
                className={cn('gap-2', limsDarkBarBtnClass)}
                onClick={onSaveDraft}
                disabled={!active || saveLoading}
              >
                <Save size={16} />
                {saveLoading ? 'Saving…' : 'Save Draft'}
              </Button>
              <Button
                type="button"
                className={cn('h-8 gap-1.5', limsPrimaryBtnClass)}
                onClick={onIssueReports}
                disabled={!active || issueLoading || applicableScopes.length === 0}
              >
                <CheckCircle size={16} />
                {issueLoading ? 'Issuing…' : 'Issue Test Report'}
              </Button>
            </div>
          </div>
        </div>

        <TestReportPrintSettingDialog
          open={printSettingOpen}
          onOpenChange={setPrintSettingOpen}
          controls={printSettingsControls}
          applicableScopes={applicableScopes}
          letterheadOptions={letterheadOptions}
          letterheadsByScope={letterheadsByScope}
          onLetterheadChange={onLetterheadChange}
          onPersistLetterheadDefaults={onPersistLetterheadDefaults}
          onReloadLetterheadDefaults={onReloadLetterheadDefaults}
        />
        <TestReportPageSettingDialog
          open={pageSettingOpen}
          onOpenChange={setPageSettingOpen}
          controls={printSettingsControls}
        />
        <TestReportPrintPreviewDialog
          open={printPreviewOpen}
          onOpenChange={setPrintPreviewOpen}
          applicableScopes={applicableScopes}
          previewScope={activeReportScope}
          onPreviewScopeChange={setActiveReportScope}
          letterheadsByScope={letterheadsByScope}
          printSettingsControls={printSettingsControls}
          active={active}
          reportNumber={reportNumber}
          nablUlrNumber={nablUlrNumber}
          draftNotes={draftNotes}
          coverDetails={liveCoverDetails}
          partBDetails={partBDetails}
          resultRows={resultRows}
          printDisabled={previewDisabled}
        />
      </DialogContent>
    </Dialog>
  )
}
