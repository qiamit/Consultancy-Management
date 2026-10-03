import { cn } from '@/lib/utils'
import {
  limsPrimaryBtnClass,
  limsDarkBarSearchClass,
  limsDarkBarFieldClass,
  limsDarkBarBtnClass,
  limsAiTriggerClass,
} from '@/lib/limsThemeUi'
import { Plus, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { QiAssistant } from '@/components/qi-assistant/QiAssistant'

export function IsCodesHeaderBar({
  search,
  onSearchChange,
  pageSize,
  onPageSizeChange,
  onNew,
  onOpenBIS,
  assistantContext,
  onAssistantDataChanged,
}: {
  search: string
  onSearchChange: (value: string) => void
  pageSize: number
  onPageSizeChange: (size: number) => void
  onNew: () => void
  onOpenBIS: () => void
  assistantContext: string
  onAssistantDataChanged?: () => void
}) {
  return (
    <div className="relative flex flex-col gap-3 overflow-hidden rounded-none border-2 border-stone-500 bg-gradient-to-br from-stone-800 via-stone-900 to-stone-950 px-5 py-4 text-white shadow-sm ring-1 ring-amber-700/20 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 flex-1 flex-col gap-3 sm:flex-row sm:items-center">
        <h1 className="shrink-0 text-lg font-semibold tracking-tight text-white">IS Code Master</h1>
        <div className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
          <div className="relative w-full sm:max-w-sm">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400"
              aria-hidden
            />
            <Input
              type="search"
              value={search}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder=""
              className={cn(limsDarkBarSearchClass, 'pl-9')}
              aria-label="Search IS codes"
            />
          </div>
          <Select value={String(pageSize)} onValueChange={(v) => onPageSizeChange(Number(v))}>
            <SelectTrigger
              className={cn(limsDarkBarFieldClass, 'h-9 w-full shrink-0 sm:w-[7.5rem]')}
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

      <div className="flex flex-wrap items-center justify-end gap-2">
        <QiAssistant
          page="is-codes"
          pageTitle="IS Code Master"
          contextSummary={assistantContext}
          suggestedQuestions={[
            'Add a new IS code IS 1234:2010 titled Sample Standard',
            'Summarize the IS codes in the current list',
            'Update testing charges for the first IS in the list',
            'How do I upload PDFs for an IS code?',
          ]}
          onDataChanged={onAssistantDataChanged}
          enablePdfImport
          triggerVariant="icon"
          triggerClassName={limsAiTriggerClass}
        />
        <Button type="button" variant="outline" size="sm" className={limsDarkBarBtnClass} onClick={onOpenBIS}>
          BIS Website
        </Button>
        <Button
          type="button"
          className={cn('gap-2 shrink-0', limsPrimaryBtnClass)}
          size="sm"
          onClick={onNew}
          aria-label="Add New IS Code"
        >
          <Plus size={14} />
          Add New IS Code
        </Button>
      </div>
    </div>
  )
}
