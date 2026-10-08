import { useEffect, useMemo, useState } from 'react'
import { Bot, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useShowAiAssistant } from '@/hooks/useShowAiAssistant'
import { QiAssistantChatPanel } from '@/components/qi-assistant/QiAssistantChatPanel'
import { limsAiTriggerClass, limsDarkBarGlowStyle, limsDialogClass } from '@/lib/limsThemeUi'
import { cn } from '@/lib/utils'
import type { TestReportCoverDetails } from './fetchTestReportCoverDetails'
import {
  buildTestReportPrepareDialogAssistantContext,
  expandFullReviewUserMessage,
  FULL_REVIEW_USER_COMMAND,
  type ReportPreparationListRow,
} from './buildTestReportPreparationAssistantContext'
import type { ReportResultRow } from './reportResultRows'
import type { TestReportPartBDetails } from './testReportPartB'

type AssistantTab = 'full_review' | 'general_ask'

export function TestReportPrepareDialogAssistant({
  row,
  coverDetails,
  partBDetails,
  resultRows,
  reportNumber,
  nablUlrNumber,
  draftNotes,
  disabled,
  prepareDialogOpen,
}: {
  row: ReportPreparationListRow | null
  coverDetails: TestReportCoverDetails | null
  partBDetails: TestReportPartBDetails | null
  resultRows: ReportResultRow[]
  reportNumber: string
  nablUlrNumber: string
  draftNotes: string
  disabled?: boolean
  /** Parent prepare dialog open — resets chat when reopened */
  prepareDialogOpen: boolean
}) {
  const showAssistant = useShowAiAssistant()
  const [open, setOpen] = useState(false)
  const [activeTab, setActiveTab] = useState<AssistantTab>('full_review')
  const [fullReviewSession, setFullReviewSession] = useState(0)
  const [generalAskSession, setGeneralAskSession] = useState(0)

  useEffect(() => {
    if (open) {
      setFullReviewSession((n) => n + 1)
      setGeneralAskSession((n) => n + 1)
    }
  }, [open])

  useEffect(() => {
    if (!prepareDialogOpen) setOpen(false)
  }, [prepareDialogOpen])

  const assistantInput = useMemo(
    () => ({
      row: row!,
      coverDetails,
      partBDetails,
      resultRows,
      reportNumber,
      nablUlrNumber,
      draftNotes,
    }),
    [row, coverDetails, partBDetails, resultRows, reportNumber, nablUlrNumber, draftNotes],
  )

  const fullReviewContext = useMemo(() => {
    if (!row) return 'No SRF selected.'
    return buildTestReportPrepareDialogAssistantContext(assistantInput, 'full_review')
  }, [row, assistantInput])

  const generalAskContext = useMemo(() => {
    if (!row) return 'No SRF selected.'
    return buildTestReportPrepareDialogAssistantContext(assistantInput, 'general_ask')
  }, [row, assistantInput])

  const isCodeId = row?.isCodeId?.trim() || undefined

  if (!showAssistant) return null

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          type="button"
          variant="outline"
          className={cn('shrink-0 gap-2', limsAiTriggerClass)}
          disabled={disabled || !row}
          aria-label="Open Test Report AI Assistant"
        >
          <Sparkles size={16} className="text-amber-200" />
          AI Assistant
        </Button>
      </DialogTrigger>
      <DialogContent
        layer="nested"
        aria-describedby={undefined}
        overlayClassName="lg:inset-y-0 lg:left-[268px] lg:right-0 lg:w-auto"
        className={cn(
          limsDialogClass,
          'flex max-h-[88vh] flex-col sm:max-w-2xl',
          'lg:left-[calc(268px+(100vw-268px)/2)] md:top-1/2 md:-translate-x-1/2 md:-translate-y-1/2',
        )}
      >
        <div className="relative shrink-0 overflow-hidden bg-gradient-to-br from-stone-800 via-stone-900 to-stone-950 px-4 py-2.5 text-white sm:px-5">
          <div className="pointer-events-none absolute inset-0 opacity-[0.18]" style={limsDarkBarGlowStyle} />
          <div className="absolute bottom-0 left-0 h-[2px] w-full bg-gradient-to-r from-amber-500 via-amber-300 to-transparent" />
          <DialogHeader className="relative pr-10 text-left">
            <DialogTitle className="flex items-center gap-2 text-base font-semibold tracking-tight text-white">
              <Bot size={20} className="text-amber-200" />
              Test Report AI Assistant
            </DialogTitle>
          </DialogHeader>
        </div>

        <div className="flex min-h-0 flex-1 flex-col bg-gradient-to-b from-stone-100/90 to-stone-50 px-4 pb-4 pt-3 sm:px-5">
          <Tabs
            value={activeTab}
            onValueChange={(v) => setActiveTab(v as AssistantTab)}
            className="flex min-h-0 flex-1 flex-col"
          >
            <TabsList className="mb-3 grid h-auto w-full grid-cols-2 gap-1 border border-stone-500 bg-stone-200/80 p-1">
              <TabsTrigger
                value="full_review"
                className="rounded-none py-2 text-xs text-stone-600 sm:text-sm data-[state=active]:bg-stone-800 data-[state=active]:text-amber-100"
              >
                Full Review of Report
              </TabsTrigger>
              <TabsTrigger
                value="general_ask"
                className="rounded-none py-2 text-xs text-stone-600 sm:text-sm data-[state=active]:bg-stone-800 data-[state=active]:text-amber-100"
              >
                General Ask
              </TabsTrigger>
            </TabsList>

            <TabsContent value="full_review" className="mt-0 flex min-h-0 flex-1 flex-col data-[state=inactive]:hidden">
              <QiAssistantChatPanel
                page="samples/report-preparation"
                contextSummary={fullReviewContext}
                staticIsCodeId={isCodeId}
                staticActiveRecordId={row?.id}
                staticActiveRecordTable="samples"
                resetKey={fullReviewSession}
                prepareMessage={expandFullReviewUserMessage}
                primaryAction={{
                  label: 'Full Review',
                  message: FULL_REVIEW_USER_COMMAND,
                }}
                placeholder='Type "Full Review" or ask about a specific part…'
              />
            </TabsContent>

            <TabsContent value="general_ask" className="mt-0 flex min-h-0 flex-1 flex-col data-[state=inactive]:hidden">
              <QiAssistantChatPanel
                page="samples/report-preparation"
                contextSummary={generalAskContext}
                staticIsCodeId={isCodeId}
                staticActiveRecordId={row?.id}
                staticActiveRecordTable="samples"
                resetKey={generalAskSession}
                placeholder="Ask about IS code, clauses, test methods, or report wording…"
              />
            </TabsContent>
          </Tabs>
        </div>
      </DialogContent>
    </Dialog>
  )
}
