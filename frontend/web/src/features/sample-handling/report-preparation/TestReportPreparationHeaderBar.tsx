import { FileCheck2, Search } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  limsDarkBarBtnClass,
  limsDarkBarFieldClass,
  limsDarkBarGlowStyle,
  limsDarkBarSearchClass,
  limsPanelClass,
} from '@/lib/limsThemeUi'
import { cn } from '@/lib/utils'
import { TestReportPreparationAssistant } from './TestReportPreparationAssistant'
import type { ReportPreparationListRow } from './buildTestReportPreparationAssistantContext'

export function TestReportPreparationHeaderBar({
  search,
  onSearchChange,
  pageSize,
  onPageSizeChange,
  assistantRows,
}: {
  search: string
  onSearchChange: (value: string) => void
  pageSize: number
  onPageSizeChange: (size: number) => void
  assistantRows: ReportPreparationListRow[]
}) {
  return (
    <div className={cn(limsPanelClass)}>
      <div className="relative overflow-hidden bg-gradient-to-br from-stone-800 via-stone-900 to-stone-950 px-3 py-2.5 text-white sm:px-5 sm:py-3">
        <div className="pointer-events-none absolute inset-0 opacity-[0.18]" style={limsDarkBarGlowStyle} />
        <div className="absolute bottom-0 left-0 h-[2px] w-full bg-gradient-to-r from-amber-500 via-amber-300 to-transparent" />

        <div className="relative flex flex-wrap items-center gap-2 lg:flex-nowrap sm:gap-3">
          <h1 className="shrink-0 text-base font-semibold tracking-tight text-white sm:text-lg">
            Test Report Preparation
          </h1>

          <div className="relative order-3 w-full min-w-0 sm:order-none sm:mx-1 sm:w-[40%] sm:max-w-[19.5rem] sm:flex-none">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400"
              aria-hidden
            />
            <Input
              type="search"
              placeholder="Search"
              aria-label="Search"
              value={search}
              onChange={(e) => onSearchChange(e.target.value)}
              className={cn(limsDarkBarSearchClass, 'h-8 pl-9')}
            />
          </div>

          <div className="w-[6.5rem] shrink-0">
            <Select value={String(pageSize)} onValueChange={(v) => onPageSizeChange(Number(v))}>
              <SelectTrigger
                className={cn(
                  limsDarkBarFieldClass,
                  'w-full border-amber-500/40 text-amber-100 focus:border-amber-500 focus:bg-stone-900 focus:text-amber-50',
                )}
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

          <div className="ml-auto flex shrink-0 flex-wrap items-center justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className={cn('gap-1.5', limsDarkBarBtnClass)}
              asChild
            >
              <Link to="/samples/completed" aria-label="Issued Test Report" title="Open Issued Test Report">
                <FileCheck2 size={14} />
                <span className="hidden sm:inline">Issued Test Report</span>
                <span className="sm:hidden">Issued</span>
              </Link>
            </Button>
            <TestReportPreparationAssistant rows={assistantRows} search={search} />
          </div>
        </div>
      </div>
    </div>
  )
}
