import { ChevronLeft, ChevronRight, Printer } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  limsDarkBarBtnClass,
  limsDarkBarFieldClass,
  limsDarkBarGlowStyle,
  limsPanelClass,
} from '@/lib/limsThemeUi'
import { cn } from '@/lib/utils'
import { LaboratoryDirectorOnly } from '@/components/lims/LaboratoryDirectorOnly'

type UserManagementFooterBarProps = {
  totalCount: number
  page: number
  pageCount: number
  pageSize: number
  jumpTo: string
  selectedCount: number
  onPrintSelected: () => void
  onPrevPage: () => void
  onNextPage: () => void
  onJumpToChange: (value: string) => void
  onJumpToGo: () => void
}

export function UserManagementFooterBar({
  totalCount,
  page,
  pageCount,
  pageSize,
  jumpTo,
  selectedCount,
  onPrintSelected,
  onPrevPage,
  onNextPage,
  onJumpToChange,
  onJumpToGo,
}: UserManagementFooterBarProps) {
  const from = totalCount === 0 ? 0 : (page - 1) * pageSize + 1
  const to = Math.min(page * pageSize, totalCount)

  return (
    <div className={cn(limsPanelClass)}>
      <div className="relative overflow-hidden bg-gradient-to-br from-stone-800 via-stone-900 to-stone-950 px-3 py-1.5 text-white sm:px-5 sm:py-2">
        <div className="pointer-events-none absolute inset-0 opacity-[0.18]" style={limsDarkBarGlowStyle} />
        <div className="absolute top-0 left-0 h-[2px] w-full bg-gradient-to-r from-amber-500 via-amber-300 to-transparent" />

        <div className="relative flex min-w-0 flex-nowrap items-center justify-between gap-1.5 sm:gap-2 md:gap-3">
          <div className="flex min-w-0 flex-nowrap items-center gap-1 sm:gap-1.5">
            <LaboratoryDirectorOnly>
              <Button
              type="button"
              variant="outline"
              size="sm"
              className={cn('h-7 shrink-0 gap-1 px-1.5 text-[11px] sm:h-8 sm:gap-1.5 sm:px-2.5 sm:text-xs', limsDarkBarBtnClass)}
              onClick={onPrintSelected}
              disabled={selectedCount === 0}
              title={selectedCount === 0 ? 'Select team members to print' : 'Print selected'}
            >
              <Printer size={14} />
              <span className="hidden lg:inline">Print</span>
            </Button>
            </LaboratoryDirectorOnly>
            {selectedCount > 0 ? (
              <span className="hidden shrink-0 whitespace-nowrap text-[10px] text-stone-300 sm:inline sm:text-xs">
                Selected: {selectedCount}
              </span>
            ) : null}
            <p className="min-w-0 truncate text-[10px] text-stone-300 sm:text-xs">
              Showing <span className="font-medium text-white">{from}</span>–
              <span className="font-medium text-white">{to}</span> of{' '}
              <span className="font-medium text-white">{totalCount}</span>
            </p>
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
              className={cn(limsDarkBarFieldClass, 'h-7 w-10 shrink-0 text-[11px] sm:h-8 sm:w-12 sm:text-xs md:w-14')}
              inputMode="numeric"
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              className={cn('hidden h-7 shrink-0 sm:inline-flex sm:h-8', limsDarkBarBtnClass)}
              onClick={onJumpToGo}
            >
              Jump
            </Button>
            <Button
              type="button"
              variant="outline"
              size="icon"
              className={cn('h-7 w-7 shrink-0 sm:h-8 sm:w-8', limsDarkBarBtnClass)}
              onClick={onPrevPage}
              disabled={page <= 1}
            >
              <ChevronLeft size={16} />
              <span className="sr-only">Previous page</span>
            </Button>
            <span className="shrink-0 whitespace-nowrap text-center text-[10px] font-medium text-stone-300 sm:min-w-[4.5rem] sm:text-xs md:min-w-[5.5rem]">
              <span className="hidden sm:inline">Page </span>
              {page}/{pageCount}
            </span>
            <Button
              type="button"
              variant="outline"
              size="icon"
              className={cn('h-7 w-7 shrink-0 sm:h-8 sm:w-8', limsDarkBarBtnClass)}
              onClick={onNextPage}
              disabled={page >= pageCount}
            >
              <ChevronRight size={16} />
              <span className="sr-only">Next page</span>
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
