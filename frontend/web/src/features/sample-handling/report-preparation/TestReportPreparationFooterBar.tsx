import { ChevronLeft, ChevronRight, Printer } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { SampleHandlingDeleteButton } from '@/features/sample-handling/shared/SampleHandlingDeleteButton'
import {
  limsDarkBarBtnClass,
  limsDarkBarFieldClass,
  limsDarkBarGlowStyle,
  limsPanelClass,
} from '@/lib/limsThemeUi'
import { cn } from '@/lib/utils'
import { LaboratoryDirectorOnly } from '@/components/lims/LaboratoryDirectorOnly'

export function TestReportPreparationFooterBar({
  message,
  loading,
  selectedCount,
  onPrintSelected,
  showDelete,
  onDeleteSelected,
  page,
  pageCount,
  onPrevPage,
  onNextPage,
  jumpTo,
  onJumpToChange,
  onJumpToGo,
}: {
  message: string | null
  loading: boolean
  selectedCount: number
  onPrintSelected: () => void
  showDelete?: boolean
  onDeleteSelected?: () => void
  page: number
  pageCount: number
  onPrevPage: () => void
  onNextPage: () => void
  jumpTo: string
  onJumpToChange: (value: string) => void
  onJumpToGo: () => void
}) {
  return (
    <div className={cn(limsPanelClass)}>
      <div className="relative overflow-hidden bg-gradient-to-br from-stone-800 via-stone-900 to-stone-950 px-3 py-2 text-white sm:px-5 sm:py-2.5">
        <div className="pointer-events-none absolute inset-0 opacity-[0.18]" style={limsDarkBarGlowStyle} />
        <div className="absolute top-0 left-0 h-[2px] w-full bg-gradient-to-r from-amber-500 via-amber-300 to-transparent" />

        <div className="relative flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <LaboratoryDirectorOnly>
              <Button
              type="button"
              variant="outline"
              size="sm"
              className={cn('gap-1.5', limsDarkBarBtnClass)}
              onClick={onPrintSelected}
              disabled={loading}
            >
              <Printer size={14} />
              Print
            </Button>
            {showDelete && onDeleteSelected ? (
              <SampleHandlingDeleteButton
                disabled={loading || selectedCount === 0}
                onClick={onDeleteSelected}
              />
            ) : null}
            </LaboratoryDirectorOnly>
            <span className="text-xs text-stone-300">Selected: {selectedCount}</span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {message ? (
              <p
                className={cn(
                  'text-sm',
                  message.toLowerCase().includes('saved') ||
                    message.toLowerCase().includes('issued') ||
                    message.toLowerCase().includes('draft')
                    ? 'text-emerald-300'
                    : message.toLowerCase().includes('fail') ||
                        message.toLowerCase().includes('error')
                      ? 'text-red-300'
                      : 'text-stone-300',
                )}
              >
                {message}
              </p>
            ) : null}
            <Input
              className={cn(limsDarkBarFieldClass, 'w-16')}
              placeholder="Page"
              value={jumpTo}
              onChange={(e) => onJumpToChange(e.target.value.replace(/[^0-9]/g, ''))}
              aria-label="Jump to page"
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              className={limsDarkBarBtnClass}
              onClick={onJumpToGo}
              disabled={loading}
            >
              Jump
            </Button>
            <Button
              type="button"
              variant="outline"
              size="icon"
              className={cn('h-8 w-8', limsDarkBarBtnClass)}
              onClick={onPrevPage}
              disabled={loading || page <= 1}
              aria-label="Previous page"
            >
              <ChevronLeft size={16} />
            </Button>
            <span className="text-xs font-medium text-stone-300">
              Page {page} / {pageCount}
            </span>
            <Button
              type="button"
              variant="outline"
              size="icon"
              className={cn('h-8 w-8', limsDarkBarBtnClass)}
              onClick={onNextPage}
              disabled={loading || page >= pageCount}
              aria-label="Next page"
            >
              <ChevronRight size={16} />
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
