import { cn } from '@/lib/utils'
import {
  limsPrimaryBtnClass,
  limsDarkBarSearchClass,
  limsDarkBarFieldClass,
  limsAiTriggerClass,
} from '@/lib/limsThemeUi'
import { Plus, Search } from 'lucide-react'
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
    <div className="relative flex flex-col gap-2.5 overflow-hidden rounded-none border-2 border-stone-500 bg-gradient-to-br from-stone-800 via-stone-900 to-stone-950 px-3 py-2.5 text-white shadow-sm ring-1 ring-amber-700/20 sm:gap-3 sm:px-5 sm:py-3">
      <div className="flex min-w-0 items-center justify-between gap-2">
        <h1 className="min-w-0 truncate text-base font-semibold tracking-tight text-white sm:text-lg">
          {pageTitle}
        </h1>
        <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
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
          <Button
            type="button"
            className={cn('gap-1.5 shrink-0 sm:gap-2', limsPrimaryBtnClass)}
            size="sm"
            onClick={onNew}
            aria-label={addButtonLabel}
          >
            <Plus size={14} />
            <span className="hidden sm:inline">{addButtonLabel}</span>
            <span className="sm:hidden">Add</span>
          </Button>
        </div>
      </div>

      <div className="flex w-full min-w-0 items-center gap-2">
        <div className="relative min-w-0 flex-1 sm:max-w-md md:max-w-lg">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400"
            aria-hidden
          />
          <Input
            type="search"
            placeholder="Search"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            aria-label="Search"
            className={cn(limsDarkBarSearchClass, 'pl-9')}
          />
        </div>
        <Select value={String(pageSize)} onValueChange={(v) => onPageSizeChange(Number(v))}>
          <SelectTrigger
            className={cn(limsDarkBarFieldClass, 'h-9 w-[6.5rem] shrink-0 sm:w-[7.5rem]')}
            aria-label="Rows per page"
          >
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
  )
}
