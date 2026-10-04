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
import { QiAssistant, type QiAssistantIsCodeOption } from '@/components/qi-assistant/QiAssistant'

export function TestParameterHeaderBar({
  title = 'Test Parameter',
  search,
  onSearchChange,
  pageSize,
  onPageSizeChange,
  onNew,
  assistantContext,
  onAssistantDataChanged,
  isCodeOptions = [],
}: {
  title?: string
  search: string
  onSearchChange: (value: string) => void
  pageSize: number
  onPageSizeChange: (value: number) => void
  onNew: () => void
  assistantContext: string
  onAssistantDataChanged?: () => void
  isCodeOptions?: QiAssistantIsCodeOption[]
}) {
  return (
    <div className="relative flex flex-col gap-2.5 overflow-hidden rounded-none border-2 border-stone-500 bg-gradient-to-br from-stone-800 via-stone-900 to-stone-950 px-3 py-2.5 text-white shadow-sm ring-1 ring-amber-700/20 sm:gap-3 sm:px-5 sm:py-3">
      <div className="flex min-w-0 items-center justify-between gap-2">
        <h1 className="min-w-0 truncate text-base font-semibold tracking-tight text-white sm:text-lg">
          {title}
        </h1>
        <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
          <QiAssistant
            page="test-parameter"
            pageTitle="Test Parameter Master"
            contextSummary={assistantContext}
            isCodeOptions={isCodeOptions}
            suggestedQuestions={[
              'Import all chemical test parameters from the selected IS PDF',
              'Add test parameters for Carbon, Sulphur and Phosphorus from this IS',
              'Summarize test parameters already in the list for this IS',
              'Which clauses in the PDF define mechanical tests?',
            ]}
            welcomeMessage="Select an **IS Code** below (PDFs from IS Code Master are read automatically). Tap **!** to activate a **Skill**, then ask me to **extract and add test parameters** (item name, clause, unit, requirement, test method) into Test Parameter Master."
            onDataChanged={onAssistantDataChanged}
            enablePdfImport={false}
            triggerVariant="icon"
            triggerClassName={limsAiTriggerClass}
          />
          <Button
            type="button"
            className={cn('gap-1.5 shrink-0 sm:gap-2', limsPrimaryBtnClass)}
            size="sm"
            onClick={onNew}
            aria-label="Add New Test Parameter"
          >
            <Plus size={14} />
            <span className="hidden sm:inline">Add New Test Parameter</span>
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
            placeholder="Search..."
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            className={cn(limsDarkBarSearchClass, 'pl-9')}
            aria-label="Search test parameters"
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
            {[5, 10, 20, 50].map((n) => (
              <SelectItem key={n} value={String(n)}>
                {n} / Page
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  )
}
