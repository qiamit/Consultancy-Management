import { cn } from '@/lib/utils'
import { limsDarkBarBtnClass, limsDarkBarFieldClass, limsDeleteBtnClass } from '@/lib/limsThemeUi'
import { ChevronLeft, ChevronRight, LayoutTemplate, Printer, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { LaboratoryDirectorOnly } from '@/components/lims/LaboratoryDirectorOnly'

export function QuotationFooterBar({
  message,
  loading,
  selectedCount,
  page,
  pageCount,
  onTemplates,
  onPrintSelected,
  onDeleteSelected,
  onPrevPage,
  onNextPage,
  jumpTo,
  onJumpToChange,
  onJumpToGo,
}: {
  message: string | null
  loading: boolean
  selectedCount: number
  page: number
  pageCount: number
  onTemplates: () => void
  onPrintSelected: () => void
  onDeleteSelected: () => void
  onPrevPage: () => void
  onNextPage: () => void
  jumpTo: string
  onJumpToChange: (value: string) => void
  onJumpToGo: () => void
}) {
  const selectionDisabled = selectedCount === 0
  const actionBtnClass = cn(
    'h-7 shrink-0 gap-1 px-1.5 text-[11px] sm:h-8 sm:gap-1.5 sm:px-2.5 sm:text-xs',
    limsDarkBarBtnClass,
  )
  const fieldClass = cn(limsDarkBarFieldClass, 'h-7 shrink-0 text-[11px] sm:h-8 sm:text-xs')

  return (
    <div className="relative overflow-hidden rounded-none border-2 border-stone-500 bg-gradient-to-br from-stone-800 via-stone-900 to-stone-950 px-2 py-1.5 text-white shadow-sm ring-1 ring-amber-700/20 sm:px-3 sm:py-2 md:px-4">
      <div className="flex min-w-0 flex-nowrap items-center justify-between gap-1.5 sm:gap-2 md:gap-3">
        <div className="flex min-w-0 flex-nowrap items-center gap-1 sm:gap-1.5">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className={actionBtnClass}
            onClick={onTemplates}
            disabled={loading}
            title="Templates"
          >
            <LayoutTemplate className="size-3.5 shrink-0 sm:size-4" />
            <span className="hidden lg:inline">Templates</span>
          </Button>
          <LaboratoryDirectorOnly>
            <Button
            type="button"
            variant="outline"
            size="sm"
            className={actionBtnClass}
            onClick={onPrintSelected}
            disabled={loading}
            title="Print"
          >
            <Printer className="size-3.5 shrink-0 sm:size-4" />
            <span className="hidden lg:inline">Print</span>
          </Button>
          <Button
            type="button"
            variant="destructive"
            size="sm"
            className={cn(
              limsDeleteBtnClass,
              'h-7 shrink-0 gap-1 px-1.5 text-[11px] sm:h-8 sm:gap-1.5 sm:px-2.5 sm:text-xs',
            )}
            onClick={onDeleteSelected}
            disabled={loading || selectionDisabled}
            title="Delete"
          >
            <Trash2 className="size-3.5 shrink-0 sm:size-4" />
            <span className="hidden lg:inline">Delete</span>
          </Button>
          </LaboratoryDirectorOnly>
          {selectedCount > 0 ? (
            <span className="hidden shrink-0 whitespace-nowrap text-[10px] text-stone-300 sm:inline sm:text-xs">
              Selected: {selectedCount}
            </span>
          ) : null}
          {message ? (
            <p
              className={cn(
                'min-w-0 max-w-[8rem] truncate text-[10px] sm:max-w-[12rem] sm:text-xs md:max-w-[16rem]',
                message.toLowerCase().includes('saved') || message.toLowerCase().includes('deleted')
                  ? 'text-emerald-300'
                  : 'text-red-300',
              )}
              title={message}
            >
              {message}
            </p>
          ) : null}
        </div>

        <div className="flex min-w-0 flex-nowrap items-center justify-end gap-1 overflow-x-auto overscroll-x-contain sm:gap-1.5 md:gap-2 [-webkit-overflow-scrolling:touch]">
          <Input
            aria-label="Jump to page"
            placeholder="Page"
            value={jumpTo}
            onChange={(e) => onJumpToChange(e.target.value.replace(/[^0-9]/g, ''))}
            onKeyDown={(e) => {
              if (e.key === 'Enter') onJumpToGo()
            }}
            className={cn(fieldClass, 'w-10 sm:w-12 md:w-14')}
            inputMode="numeric"
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            className={cn(actionBtnClass, 'hidden sm:inline-flex')}
            onClick={onJumpToGo}
            disabled={loading}
          >
            Jump
          </Button>
          <Button
            type="button"
            variant="outline"
            size="icon"
            className={cn(limsDarkBarBtnClass, 'h-7 w-7 shrink-0 sm:h-8 sm:w-8')}
            onClick={onPrevPage}
            disabled={loading || page <= 1}
          >
            <ChevronLeft className="size-3.5 sm:size-4" />
            <span className="sr-only">Previous page</span>
          </Button>
          <span className="shrink-0 whitespace-nowrap text-center text-[10px] font-medium text-stone-300 sm:min-w-[4.5rem] sm:text-xs md:min-w-[5.5rem]">
            <span className="hidden sm:inline">Page </span>
            {page}/{Math.max(pageCount, 1)}
          </span>
          <Button
            type="button"
            variant="outline"
            size="icon"
            className={cn(limsDarkBarBtnClass, 'h-7 w-7 shrink-0 sm:h-8 sm:w-8')}
            onClick={onNextPage}
            disabled={loading || page >= pageCount}
          >
            <ChevronRight className="size-3.5 sm:size-4" />
            <span className="sr-only">Next page</span>
          </Button>
        </div>
      </div>
    </div>
  )
}
