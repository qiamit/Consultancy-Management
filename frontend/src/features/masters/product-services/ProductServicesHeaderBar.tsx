import { cn } from '@/lib/utils'
import { limsPrimaryBtnClass, limsDarkBarSearchClass, limsDarkBarFieldClass, limsDarkBarBtnClass, limsAiTriggerClass } from '@/lib/limsThemeUi'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { QiAssistant } from '@/components/qi-assistant/QiAssistant'

export function ProductServicesHeaderBar({
  search,
  onSearchChange,
  pageSize,
  onPageSizeChange,
  onNew,
  assistantContext,
  onAssistantDataChanged,
  pageTitle = 'NABL Scope',
  addButtonLabel = 'Add Scope Entry',
  qiPage = 'nabl-scope',
}: {
  search: string
  onSearchChange: (value: string) => void
  pageSize: number
  onPageSizeChange: (size: number) => void
  onNew: () => void
  assistantContext: string
  onAssistantDataChanged?: () => void
  pageTitle?: string
  addButtonLabel?: string
  qiPage?: string
}) {
  return (
    <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between relative overflow-hidden rounded-none border-2 border-stone-500 bg-gradient-to-br from-stone-800 via-stone-900 to-stone-950 text-white shadow-sm ring-1 ring-amber-700/20 px-5 py-4 shadow-sm">
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:gap-4">
        <h1 className="text-lg font-semibold tracking-tight text-white whitespace-nowrap">
          {pageTitle}
        </h1>
        <div className="md:w-[40%]">
          <Input
            placeholder="Search"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            aria-label="Search"
            className={limsDarkBarSearchClass}
          />
        </div>
        <div className="w-28">
          <Select value={String(pageSize)} onValueChange={(v) => onPageSizeChange(Number(v))}>
            <SelectTrigger className={cn(limsDarkBarFieldClass, 'w-full')} aria-label="Rows per page">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="5">5 / Page</SelectItem>
              <SelectItem value="10">10 / Page</SelectItem>
              <SelectItem value="20">20 / Page</SelectItem>
              <SelectItem value="50">50 / Page</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="flex items-center justify-end">
        <div className="flex flex-wrap items-center justify-end gap-2">
          <QiAssistant
            page={qiPage}
            pageTitle={pageTitle}
            contextSummary={assistantContext}
            suggestedQuestions={[
              'Summarize scope entries by discipline group',
              'Add a new product / service entry for chemical testing on steel samples',
              'Which test methods are listed for mechanical testing?',
              'Update the test method for scope entry S.No 5',
            ]}
            welcomeMessage={`Ask me about **${pageTitle}** — search, summarize, add, update or delete entries. I can also explain ISO/IEC 17025 scope requirements.`}
            onDataChanged={onAssistantDataChanged}
            triggerVariant="icon"
            triggerClassName={limsAiTriggerClass}
          />
          <Button type="button" className={cn('gap-2', limsPrimaryBtnClass)} onClick={onNew} aria-label={addButtonLabel}>
            <Plus size={16} />
            {addButtonLabel}
          </Button>
        </div>
      </div>
    </div>
  )
}
