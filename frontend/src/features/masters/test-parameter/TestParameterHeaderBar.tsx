import { cn } from '@/lib/utils'
import { limsPrimaryBtnClass, limsDarkBarSearchClass, limsDarkBarFieldClass, limsDarkBarBtnClass, limsAiTriggerClass } from '@/lib/limsThemeUi'
import { Plus } from 'lucide-react'
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
    <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between relative overflow-hidden rounded-none border-2 border-stone-500 bg-gradient-to-br from-stone-800 via-stone-900 to-stone-950 text-white shadow-sm ring-1 ring-amber-700/20 px-5 py-4 shadow-sm">
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:gap-4">
        <h1 className="text-lg font-semibold tracking-tight text-white whitespace-nowrap">{title}</h1>
        <div className="md:w-[40%]">
          <Input placeholder="Search..." value={search} onChange={(e) => onSearchChange(e.target.value)} className={limsDarkBarSearchClass} />
        </div>
        <div className="w-28">
          <Select value={String(pageSize)} onValueChange={(v) => onPageSizeChange(Number(v))}>
            <SelectTrigger className={cn(limsDarkBarFieldClass, 'w-full')} aria-label="Rows per page">
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
      <div className="flex items-center justify-end">
        <div className="flex flex-wrap items-center justify-end gap-2">
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
          <Button type="button" className={cn('gap-2', limsPrimaryBtnClass)} onClick={onNew}>
            <Plus size={16} />
            Add New Test Parameter
          </Button>
        </div>
      </div>
    </div>
  )
}
