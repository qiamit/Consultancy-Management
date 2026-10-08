import { useState } from 'react'
import { Eye, Printer } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import {
  limsDarkBarBtnClass,
  limsDarkBarGlowStyle,
  limsDialogClass,
  limsPrimaryBtnClass,
} from '@/lib/limsThemeUi'
import { cn } from '@/lib/utils'
import { REPORT_SCOPE_TITLE, type ReportScopeKind } from './reportScope'
import type { ReportPrepLetterheadsByScope } from './reportPrepLetterhead'
import type { TestReportPrintSettingsControls } from './TestReportPreparePrintDialogs'
import { TestReportTemplateLivePreview } from './TestReportTemplateLivePreview'
import type { ReportPreparationListRow } from './buildTestReportPreparationAssistantContext'
import type { TestReportCoverDetails } from './fetchTestReportCoverDetails'
import type { TestReportPartBDetails } from './testReportPartB'
import type { ReportResultRow } from './reportResultRows'
import { buildPaginatedTestReportHtml } from './buildPaginatedTestReportHtml'
import { printHtmlDocument } from './buildScopedTestReportPrintHtml'

export function TestReportPrintPreviewDialog({
  open,
  onOpenChange,
  applicableScopes,
  previewScope,
  onPreviewScopeChange,
  letterheadsByScope,
  printSettingsControls,
  active,
  reportNumber,
  nablUlrNumber,
  draftNotes,
  coverDetails,
  partBDetails,
  resultRows,
  printDisabled,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  applicableScopes: ReportScopeKind[]
  previewScope: ReportScopeKind
  onPreviewScopeChange: (scope: ReportScopeKind) => void
  letterheadsByScope: ReportPrepLetterheadsByScope
  printSettingsControls: TestReportPrintSettingsControls
  active: ReportPreparationListRow | null
  reportNumber: string
  nablUlrNumber: string
  draftNotes: string
  coverDetails: TestReportCoverDetails | null
  partBDetails: TestReportPartBDetails | null
  resultRows: ReportResultRow[]
  printDisabled?: boolean
}) {
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)

  const scopeForPreview =
    applicableScopes.length === 0
      ? previewScope
      : applicableScopes.includes(previewScope)
        ? previewScope
        : applicableScopes[0]

  const buildSameAsPreviewHtml = async (): Promise<string> => {
    if (!active) throw new Error('Open a test report first.')
    return buildPaginatedTestReportHtml({
      scope: scopeForPreview,
      printSettings: printSettingsControls.settings,
      letterheadsByScope,
      active,
      reportNumber,
      nablUlrNumber,
      draftNotes,
      coverDetails,
      partBDetails,
      resultRows,
    })
  }

  const handlePrint = async () => {
    setActionError(null)
    setBusy(true)
    try {
      const html = await buildSameAsPreviewHtml()
      await printHtmlDocument(html)
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Print failed')
    } finally {
      setBusy(false)
    }
  }

  const actionsDisabled = Boolean(printDisabled) || busy || !active

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        persistOnFocusLoss
        layer="nested"
        aria-describedby={undefined}
        overlayClassName="lg:inset-y-0 lg:left-[268px] lg:right-0 lg:w-auto"
        className={cn(
          limsDialogClass,
          'left-0 top-0 flex h-[100dvh] max-h-[100dvh] w-full max-w-none translate-x-0 translate-y-0 flex-col gap-0 overflow-hidden border-0 p-0',
          'lg:left-[268px] md:h-[100dvh] lg:w-[calc(100vw-268px)] lg:max-w-[calc(100vw-268px)]',
        )}
      >
        <div className="relative shrink-0 overflow-hidden bg-gradient-to-br from-stone-800 via-stone-900 to-stone-950 px-4 py-2.5 text-white sm:px-5">
          <div
            className="pointer-events-none absolute inset-0 opacity-[0.18]"
            style={limsDarkBarGlowStyle}
          />
          <div className="absolute bottom-0 left-0 h-[2px] w-full bg-gradient-to-r from-amber-500 via-amber-300 to-transparent" />
          <DialogHeader className="relative pr-10 text-left">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <DialogTitle className="flex items-center gap-2 text-base font-semibold tracking-tight text-white">
                <Eye size={18} />
                Print Preview — {REPORT_SCOPE_TITLE[scopeForPreview]}
              </DialogTitle>
              {applicableScopes.length > 1 ? (
                <div className="flex gap-1 rounded-none border border-stone-500/80 bg-stone-950/40 p-1">
                  {applicableScopes.map((scope) => (
                    <Button
                      key={scope}
                      type="button"
                      variant="outline"
                      className={cn(
                        'h-7 rounded-none border px-2 text-[11px] font-semibold uppercase tracking-wide',
                        scopeForPreview === scope
                          ? 'border-amber-400 bg-amber-500/20 text-amber-100 hover:bg-amber-500/30 hover:text-amber-50'
                          : 'border-stone-500 bg-stone-900/60 text-stone-300 hover:bg-stone-800 hover:text-white',
                      )}
                      onClick={() => onPreviewScopeChange(scope)}
                    >
                      {REPORT_SCOPE_TITLE[scope]}
                    </Button>
                  ))}
                </div>
              ) : null}
            </div>
          </DialogHeader>
        </div>

        <div className="relative min-h-0 flex-1 overflow-hidden bg-gradient-to-b from-stone-100/90 to-stone-50">
          <TestReportTemplateLivePreview
            open={open}
            scope={scopeForPreview}
            printSettings={printSettingsControls.settings}
            letterheadsByScope={letterheadsByScope}
            active={active}
            reportNumber={reportNumber}
            nablUlrNumber={nablUlrNumber}
            draftNotes={draftNotes}
            coverDetails={coverDetails}
            partBDetails={partBDetails}
            resultRows={resultRows}
          />
        </div>

        <div className="relative shrink-0 border-t border-stone-700 bg-gradient-to-br from-stone-800 via-stone-900 to-stone-950 px-4 py-3">
          <div className="pointer-events-none absolute inset-0 opacity-[0.18]" style={limsDarkBarGlowStyle} />
          <div className="relative flex flex-wrap items-center justify-end gap-2">
            {actionError ? (
              <p
                className="mr-auto max-w-[min(100%,40rem)] whitespace-normal break-words text-xs text-amber-200"
                title={actionError}
                role="alert"
              >
                {actionError}
              </p>
            ) : null}
            <Button
              type="button"
              variant="outline"
              className={cn('gap-2', limsDarkBarBtnClass)}
              onClick={() => onOpenChange(false)}
            >
              Close
            </Button>
            <Button
              type="button"
              className={cn('gap-2', limsPrimaryBtnClass)}
              disabled={actionsDisabled}
              onClick={() => void handlePrint()}
            >
              <Printer size={16} />
              {busy ? 'Printing…' : 'Print'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
