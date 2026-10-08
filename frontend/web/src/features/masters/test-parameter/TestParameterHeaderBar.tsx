import { cn } from '@/lib/utils'
import {
  limsDarkBarSearchClass,
  limsDarkBarFieldClass,
  limsDarkBarBtnClass,
  limsAiTriggerClass,
  limsPanelClass,
  limsDarkBarGlowStyle,
} from '@/lib/limsThemeUi'
import { Omega, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { QiAssistant, type QiAssistantIsCodeOption } from '@/components/qi-assistant/QiAssistant'

export function TestParameterHeaderBar({
  search,
  onSearchChange,
  pageSize,
  onPageSizeChange,
  assistantContext,
  onAssistantDataChanged,
  isCodeOptions = [],
  onAddSymbol,
  canEdit = true,
}: {
  search: string
  onSearchChange: (value: string) => void
  pageSize: number
  onPageSizeChange: (value: number) => void
  assistantContext: string
  onAssistantDataChanged?: () => void
  isCodeOptions?: QiAssistantIsCodeOption[]
  onAddSymbol?: () => void
  canEdit?: boolean
}) {
  return (
    <div className={cn(limsPanelClass)}>
      <div className="relative overflow-hidden bg-gradient-to-br from-stone-800 via-stone-900 to-stone-950 px-2 py-2 text-white sm:px-4 sm:py-2.5 md:px-5">
        <div className="pointer-events-none absolute inset-0 opacity-[0.18]" style={limsDarkBarGlowStyle} />
        <div className="absolute bottom-0 left-0 h-[2px] w-full bg-gradient-to-r from-amber-500 via-amber-300 to-transparent" />

        <div className="relative flex min-w-0 flex-nowrap items-center gap-1 sm:gap-1.5 md:gap-2.5">
          <h1
            className="shrink-0 max-w-[5.5rem] truncate text-sm font-semibold tracking-tight text-white sm:max-w-[11rem] sm:text-base md:max-w-none md:text-lg"
            title="Test Parameter"
          >
            <span className="md:hidden">Parameters</span>
            <span className="hidden md:inline">Test Parameter</span>
          </h1>

          <div className="relative min-w-0 flex-1 basis-0">
            <Search
              className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-stone-400 sm:left-3 sm:h-4 sm:w-4"
              aria-hidden
            />
            <Input
              type="search"
              placeholder="Search IS Code | Parameter | Method | Clause | Unit"
              value={search}
              onChange={(e) => onSearchChange(e.target.value)}
              className={cn(limsDarkBarSearchClass, 'h-8 min-w-0 pl-7 text-xs sm:pl-9 sm:text-sm')}
              aria-label="Search by IS code, parameter, method, clause, or unit"
            />
          </div>

          <Select value={String(pageSize)} onValueChange={(v) => onPageSizeChange(Number(v))}>
            <SelectTrigger
              className={cn(
                limsDarkBarFieldClass,
                'h-8 w-[3.5rem] shrink-0 px-1 text-[11px] tabular-nums sm:w-[4.25rem] sm:px-2 sm:text-xs',
              )}
              aria-label="Rows per page"
              title={`${pageSize} per page`}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent align="end">
              {[5, 10, 20, 50].map((n) => (
                <SelectItem key={n} value={String(n)}>
                  {n}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {canEdit && onAddSymbol ? (
            <Button
              type="button"
              variant="outline"
              className={cn(
                limsDarkBarBtnClass,
                'h-8 shrink-0 gap-1 px-2 text-[11px] font-semibold sm:px-2.5 sm:text-xs',
              )}
              onClick={onAddSymbol}
              aria-label="Add Symbol"
              title="Add Symbol into Test Parameter, Unit, or Requirements"
            >
              <Omega className="size-3.5 shrink-0" aria-hidden />
              <span className="hidden sm:inline">Add Symbol</span>
            </Button>
          ) : null}

          <QiAssistant
            page="test-parameter"
            pageTitle="Test Parameter Master"
            contextSummary={assistantContext}
            isCodeOptions={isCodeOptions}
            welcomeMessage=""
            suggestedQuestions={[]}
            onDataChanged={onAssistantDataChanged}
            enablePdfImport={false}
            triggerVariant="icon"
            triggerClassName={cn(limsAiTriggerClass, 'h-8 w-8 shrink-0')}
          />
        </div>
      </div>
    </div>
  )
}
