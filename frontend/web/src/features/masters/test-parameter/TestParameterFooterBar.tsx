import { cn } from '@/lib/utils'
import {
  limsDarkBarBtnClass,
  limsDarkBarFieldClass,
  limsDarkBarGlowStyle,
  limsDeleteBtnClass,
  limsPanelClass,
} from '@/lib/limsThemeUi'
import { ChevronLeft, ChevronRight, Download, FileUp, Printer, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { LaboratoryDirectorOnly } from '@/components/lims/LaboratoryDirectorOnly'

export function TestParameterTableFooterBar({
  message,
  loading,
  selectedCount,
  onImport,
  onExport,
  onPrintSelected,
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
  onImport: () => void
  onExport: () => void
  onPrintSelected: () => void
  onDeleteSelected: () => void
  page: number
  pageCount: number
  onPrevPage: () => void
  onNextPage: () => void
  jumpTo: string
  onJumpToChange: (value: string) => void
  onJumpToGo: () => void
}) {
  const selectionDisabled = selectedCount === 0
  const actionBtnClass = cn('h-8 shrink-0 gap-1 px-2 text-xs sm:gap-1.5 sm:px-2.5', limsDarkBarBtnClass)

  return (
    <div className={cn(limsPanelClass, 'lims-footer-bar')}>
      <div className="relative overflow-hidden bg-gradient-to-br from-stone-800 via-stone-900 to-stone-950 px-2 py-2 text-white sm:px-4 md:px-5">
        <div className="pointer-events-none absolute inset-0 opacity-[0.18]" style={limsDarkBarGlowStyle} />
        <div className="absolute top-0 left-0 h-[2px] w-full bg-gradient-to-r from-amber-500 via-amber-300 to-transparent" />

        {/* One line at every width: on a narrow footer the buttons shrink to icons (see .lims-footer-bar in index.css). */}
        <div className="relative flex min-w-0 flex-nowrap items-center gap-1 sm:gap-1.5 md:gap-2.5">
          <div className="flex min-w-0 flex-1 flex-nowrap items-center gap-1 sm:gap-1.5">
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
                <FileUp size={14} />
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
                <Download size={14} />
                <span className="hidden md:inline">Export</span>
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className={actionBtnClass}
                onClick={onPrintSelected}
                disabled={loading || selectionDisabled}
                title="Print Selected Test Parameters"
              >
                <Printer size={14} />
                <span className="hidden md:inline">Print</span>
              </Button>
              <Button
                type="button"
                variant="destructive"
                size="sm"
                className={cn(limsDeleteBtnClass, 'h-8 shrink-0 gap-1 px-2 text-xs sm:px-2.5')}
                onClick={onDeleteSelected}
                disabled={loading || selectionDisabled}
                title="Delete Permanently"
              >
                <Trash2 size={14} />
                <span className="hidden md:inline">Delete Permanently</span>
              </Button>
            </LaboratoryDirectorOnly>
            {selectedCount > 0 ? (
              <span className="lims-footer-selected shrink-0 whitespace-nowrap text-[10px] text-stone-300 sm:text-xs">
                Selected: {selectedCount}
              </span>
            ) : null}
            {message ? (
              <p
                className={cn(
                  'lims-footer-message min-w-0 max-w-[8rem] truncate text-[10px] sm:max-w-[12rem] sm:text-xs md:max-w-[16rem]',
                  message.toLowerCase().includes('saved') ||
                    message.toLowerCase().includes('deleted') ||
                    message.toLowerCase().includes('archived') ||
                    message.toLowerCase().includes('restored') ||
                    message.toLowerCase().includes('exported')
                    ? 'text-emerald-300'
                    : 'text-red-300',
                )}
                title={message}
              >
                {message}
              </p>
            ) : null}
          </div>

          <div className="ml-auto flex shrink-0 flex-nowrap items-center gap-1 sm:gap-1.5">
            <Input
              aria-label="Jump to Page"
              placeholder="Page"
              value={jumpTo}
              onChange={(e) => onJumpToChange(e.target.value.replace(/[^0-9]/g, ''))}
              onKeyDown={(e) => {
                if (e.key === 'Enter') onJumpToGo()
              }}
              className={cn(limsDarkBarFieldClass, 'lims-footer-page-input h-8 w-12 shrink-0 text-xs sm:w-14')}
              inputMode="numeric"
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              className={cn(actionBtnClass, 'lims-footer-jump hidden sm:inline-flex')}
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
              <ChevronLeft size={16} />
              <span className="sr-only">Previous Page</span>
            </Button>
            <span className="lims-footer-page shrink-0 whitespace-nowrap text-center text-xs font-medium text-stone-300 sm:min-w-[5rem]">
              <span className="lims-footer-page-word hidden sm:inline">Page </span>
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
              <ChevronRight size={16} />
              <span className="sr-only">Next Page</span>
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
