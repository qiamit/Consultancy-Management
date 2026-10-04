import { cn } from '@/lib/utils'
import {
  limsDarkBarBtnClass,
  limsDarkBarFieldClass,
  limsDeleteBtnClass,
  limsToolbarScrollClass,
} from '@/lib/limsThemeUi'
import { ChevronLeft, ChevronRight, Download, FileUp, Printer, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { LaboratoryDirectorOnly } from '@/components/lims/LaboratoryDirectorOnly'

export function IsCodesTableFooterBar({
  loading,
  selectedCount,
  page,
  pageCount,
  onImport,
  onExport,
  onPrintSelected,
  onDeleteSelected,
  onPrevPage,
  onNextPage,
  jumpTo,
  onJumpToChange,
  onJumpToGo,
}: {
  loading: boolean
  selectedCount: number
  page: number
  pageCount: number
  onImport: () => void
  onExport: () => void
  onPrintSelected: () => void
  onDeleteSelected: () => void
  onPrevPage: () => void
  onNextPage: () => void
  jumpTo: string
  onJumpToChange: (v: string) => void
  onJumpToGo: () => void
}) {
  const selectionDisabled = selectedCount === 0
  const actionBtnClass = cn('h-8 shrink-0 gap-1 px-2 text-xs sm:gap-1.5 sm:px-2.5', limsDarkBarBtnClass)

  return (
    <div className="relative overflow-hidden rounded-none border-2 border-stone-500 bg-gradient-to-br from-stone-800 via-stone-900 to-stone-950 px-3 py-2 text-white shadow-sm ring-1 ring-amber-700/20 sm:px-5">
      <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
        <div className={cn(limsToolbarScrollClass, 'pb-0.5')}>
          <LaboratoryDirectorOnly>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className={actionBtnClass}
              onClick={onImport}
              disabled={loading}
              title="Import"
            >
              <FileUp className="size-3.5 shrink-0 sm:size-4" />
              <span className="hidden md:inline">Import</span>
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className={actionBtnClass}
              onClick={onExport}
              disabled={loading}
              title="Export"
            >
              <Download className="size-3.5 shrink-0 sm:size-4" />
              <span className="hidden md:inline">Export</span>
            </Button>
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
              <span className="hidden md:inline">Print</span>
            </Button>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              className={cn(limsDeleteBtnClass, 'h-8 shrink-0 gap-1 px-2 text-xs sm:px-2.5')}
              onClick={onDeleteSelected}
              disabled={loading || selectionDisabled}
              title="Delete"
            >
              <Trash2 className="size-3.5 shrink-0 sm:size-4" />
              <span className="hidden md:inline">Delete</span>
            </Button>
          </LaboratoryDirectorOnly>
          {selectedCount > 0 ? (
            <span className="shrink-0 whitespace-nowrap text-[10px] text-stone-300 sm:text-xs">
              Selected: {selectedCount}
            </span>
          ) : null}
        </div>

        <div className={cn(limsToolbarScrollClass, 'justify-end sm:shrink-0')}>
          <Input
            aria-label="Jump to page"
            placeholder="Page"
            value={jumpTo}
            onChange={(e) => onJumpToChange(e.target.value.replace(/[^0-9]/g, ''))}
            onKeyDown={(e) => {
              if (e.key === 'Enter') onJumpToGo()
            }}
            className={cn(limsDarkBarFieldClass, 'h-8 w-12 shrink-0 text-xs sm:w-14')}
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
            className={cn(limsDarkBarBtnClass, 'h-8 w-8 shrink-0')}
            onClick={onPrevPage}
            disabled={loading || page <= 1}
          >
            <ChevronLeft className="size-3.5 sm:size-4" />
            <span className="sr-only">Previous page</span>
          </Button>
          <span className="shrink-0 whitespace-nowrap text-center text-xs font-medium text-stone-300 sm:min-w-[5rem]">
            <span className="hidden sm:inline">Page </span>
            {page}/{pageCount}
          </span>
          <Button
            type="button"
            variant="outline"
            size="icon"
            className={cn(limsDarkBarBtnClass, 'h-8 w-8 shrink-0')}
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
