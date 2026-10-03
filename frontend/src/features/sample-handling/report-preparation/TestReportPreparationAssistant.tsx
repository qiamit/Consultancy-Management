import { useCallback, useEffect, useMemo, useState } from 'react'
import { Bot, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useShowAiAssistant } from '@/hooks/useShowAiAssistant'
import { QiAssistantChatPanel } from '@/components/qi-assistant/QiAssistantChatPanel'
import { limsAiTriggerClass, limsDialogClass } from '@/lib/limsThemeUi'
import { cn } from '@/lib/utils'
import {
  buildSrfReportAssistantContext,
  buildTestReportPreparationListContext,
  findRowBySrf,
  parseSrfFromMessage,
  type ReportPreparationListRow,
} from './buildTestReportPreparationAssistantContext'

export function TestReportPreparationAssistant({
  rows,
  search,
}: {
  rows: ReportPreparationListRow[]
  search: string
}) {
  const showAssistant = useShowAiAssistant()
  const [open, setOpen] = useState(false)
  const [activeTab, setActiveTab] = useState('srf')
  const [dialogSession, setDialogSession] = useState(0)

  useEffect(() => {
    if (open) setDialogSession((n) => n + 1)
  }, [open])

  const listContext = useMemo(
    () => buildTestReportPreparationListContext(rows, search),
    [rows, search],
  )

  const srfNumbers = useMemo(
    () => [...new Set(rows.map((r) => (r.srfNumber ?? '').trim()).filter(Boolean))].sort(),
    [rows],
  )

  const resolveSrfContext = useCallback(
    async (message: string) => {
      const srf = parseSrfFromMessage(message, srfNumbers)
      if (!srf) {
        return {
          context: listContext,
          error: 'Enter an SRF number from the table (SRF column).',
        }
      }
      const row = findRowBySrf(rows, srf)
      if (!row) {
        return {
          context: listContext,
          error: `SRF "${srf}" is not in your ready-for-report list. Check spelling or clear the search filter.`,
        }
      }
      const context = await buildSrfReportAssistantContext(row)
      return {
        context,
        displayMessage: `SRF **${row.srfNumber ?? srf}** — ask about report drafting or pre-issue checklist.`,
      }
    },
    [listContext, rows, srfNumbers],
  )

  if (!showAssistant) return null

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className={cn(limsAiTriggerClass, 'h-8 gap-2 shrink-0')}
          aria-label="Open QI Assistant"
        >
          <Sparkles size={16} />
          QI Assistant
        </Button>
      </DialogTrigger>
      <DialogContent className={cn(limsDialogClass, 'flex max-h-[88vh] flex-col sm:max-w-xl')}>
        <DialogHeader className="border-b border-stone-200 bg-[#f7f3eb] px-5 py-4">
          <DialogTitle className="flex items-center gap-2 text-base text-[#1c1917]">
            <Bot size={20} className="text-amber-700" />
            Test Report Preparation Assistant
          </DialogTitle>
          <DialogDescription>
            SRF-level report drafting guidance and general Clause 7.8 workflow help — suggestions only.
          </DialogDescription>
        </DialogHeader>

        <Tabs
          value={activeTab}
          onValueChange={setActiveTab}
          className="flex min-h-0 flex-1 flex-col px-5 pb-4"
        >
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="srf">SRF Analysis</TabsTrigger>
            <TabsTrigger value="general">General Q&amp;A</TabsTrigger>
          </TabsList>

          <TabsContent value="srf" className="mt-3 flex min-h-0 flex-1 flex-col data-[state=inactive]:hidden">
            <p className="mb-2 text-xs text-muted-foreground">
              Type an <strong>SRF number</strong>, then your question. Answers use consolidated results and sample
              details for that SRF only — <strong>suggestions only</strong>.
            </p>
            <QiAssistantChatPanel
              page="samples/report-preparation"
              contextSummary={listContext}
              resetKey={dialogSession * 10 + 1}
              resolveContextOnSend={resolveSrfContext}
              welcomeMessage={`**SRF Analysis** — enter SRF \`${srfNumbers[0] ?? 'YOUR-SRF'}\`, then ask (e.g. "Pre-issue checklist?" or "Summarise results for the report body").\n\nI answer **only for that SRF**.`}
              suggestedQuestions={
                srfNumbers.length > 0
                  ? srfNumbers.slice(0, 3).flatMap((srf) => [
                      `${srf}`,
                      `${srf} — pre-issue checklist`,
                    ]).slice(0, 4)
                  : ['Enter SRF from the table']
              }
            />
          </TabsContent>

          <TabsContent value="general" className="mt-3 flex min-h-0 flex-1 flex-col data-[state=inactive]:hidden">
            <QiAssistantChatPanel
              page="samples/report-preparation"
              contextSummary={listContext}
              resetKey={dialogSession * 10 + 2}
              welcomeMessage="Ask about Test Report Preparation workflow, draft vs issue, or how SRFs reach this stage."
              suggestedQuestions={[
                'How does an SRF get to Test Report Preparation?',
                'Difference between Save draft and Issue test report?',
                'What should I verify before issuing?',
              ]}
            />
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}
