import { ChevronLeft, ChevronRight, Download, FileUp, Printer, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { clientDeleteBtnClass, clientPanelClass } from './clientsFormUi'
import { limsDarkBarBtnClass, limsDarkBarFieldClass } from '@/lib/limsThemeUi'
import { cn } from '@/lib/utils'
import { LaboratoryDirectorOnly } from '@/components/lims/LaboratoryDirectorOnly'

const footerBtnClass = limsDarkBarBtnClass
const footerFieldClass = limsDarkBarFieldClass

export function ClientsTableFooterBar({
  message,
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
  message: string | null
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
  onJumpToChange: (value: string) => void
  onJumpToGo: () => void
}) {
  const selectionDisabled = selectedCount === 0

  return (
    <div className={cn(clientPanelClass)}>
      <div className="relative overflow-hidden bg-gradient-to-br from-stone-800 via-stone-900 to-stone-950 px-3 py-1.5 text-white sm:px-5 sm:py-2">
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.18]"
          style={{
            backgroundImage:
              'radial-gradient(circle at 12% 20%, rgba(217,119,6,0.45), transparent 42%), radial-gradient(circle at 88% 0%, rgba(251,191,36,0.25), transparent 35%)',
          }}
        />
        <div className="absolute top-0 left-0 h-[2px] w-full bg-gradient-to-r from-amber-500 via-amber-300 to-transparent" />

        <div className="relative flex min-w-0 flex-nowrap items-center justify-between gap-1.5 sm:gap-2 md:gap-3">
          <div className="flex min-w-0 flex-nowrap items-center gap-1 sm:gap-1.5">
            <LaboratoryDirectorOnly>
              <Button
              type="button"
              variant="outline"
              size="sm"
              className={cn('h-7 shrink-0 gap-1 px-1.5 text-[11px] sm:h-8 sm:gap-1.5 sm:px-2.5 sm:text-xs', footerBtnClass)}
              onClick={onImport}
              disabled={loading}
              title="Import"
            >
              <FileUp size={14} />
              <span className="hidden lg:inline">Import</span>
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className={cn('h-7 shrink-0 gap-1 px-1.5 text-[11px] sm:h-8 sm:gap-1.5 sm:px-2.5 sm:text-xs', footerBtnClass)}
              onClick={onExport}
              disabled={loading}
              title="Export"
            >
              <Download size={14} />
              <span className="hidden lg:inline">Export</span>
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className={cn('h-7 shrink-0 gap-1 px-1.5 text-[11px] sm:h-8 sm:gap-1.5 sm:px-2.5 sm:text-xs', footerBtnClass)}
              onClick={onPrintSelected}
              disabled={loading}
              title="Print"
            >
              <Printer size={14} />
              <span className="hidden lg:inline">Print</span>
            </Button>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              className={cn(clientDeleteBtnClass, 'h-7 shrink-0 gap-1 px-1.5 text-[11px] sm:h-8 sm:gap-1.5 sm:px-2.5 sm:text-xs')}
              onClick={onDeleteSelected}
              disabled={loading || selectionDisabled}
              title="Delete"
            >
              <Trash2 size={14} />
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
              className={cn(footerFieldClass, 'h-7 w-10 shrink-0 text-[11px] sm:h-8 sm:w-12 sm:text-xs md:w-14')}
              inputMode="numeric"
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              className={cn('hidden h-7 shrink-0 sm:inline-flex sm:h-8', footerBtnClass)}
              onClick={onJumpToGo}
              disabled={loading}
            >
              Jump
            </Button>
            <Button
              type="button"
              variant="outline"
              size="icon"
              className={cn('h-7 w-7 shrink-0 sm:h-8 sm:w-8', footerBtnClass)}
              onClick={onPrevPage}
              disabled={loading || page <= 1}
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
              className={cn('h-7 w-7 shrink-0 sm:h-8 sm:w-8', footerBtnClass)}
              onClick={onNextPage}
              disabled={loading || page >= pageCount}
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
