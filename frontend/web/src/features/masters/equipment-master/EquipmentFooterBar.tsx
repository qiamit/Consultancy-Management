import { cn } from '@/lib/utils'
import { limsDarkBarBtnClass, limsDarkBarFieldClass, limsDeleteBtnClass } from '@/lib/limsThemeUi'
import { ChevronLeft, ChevronRight, Download, FileUp, Printer, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { LaboratoryDirectorOnly } from '@/components/lims/LaboratoryDirectorOnly'

export function EquipmentFooterBar({
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

  return (
    <div className="relative overflow-hidden rounded-none border-2 border-stone-500 bg-gradient-to-br from-stone-800 via-stone-900 to-stone-950 text-white shadow-sm ring-1 ring-amber-700/20 px-5 py-3 shadow-sm">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <LaboratoryDirectorOnly>
            <Button type="button" variant="outline" className={limsDarkBarBtnClass} onClick={onImport} disabled={loading}>
            <FileUp size={16} />
            Import
          </Button>
          <Button type="button" variant="outline" className={limsDarkBarBtnClass} onClick={onExport} disabled={loading}>
            <Download size={16} />
            Export
          </Button>
          <Button type="button" variant="outline" className={limsDarkBarBtnClass} onClick={onPrintSelected} disabled={loading}>
            <Printer size={16} />
            Print
          </Button>
          <Button type="button" variant="destructive" className={limsDeleteBtnClass} onClick={onDeleteSelected} disabled={loading || selectionDisabled}>
            <Trash2 size={16} />
            Delete Selected
          </Button>
          </LaboratoryDirectorOnly>
        </div>

        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-end md:gap-3">
          <div>
            {message && (
              <p className={message.toLowerCase().includes('success') ? 'text-sm text-emerald-300' : 'text-sm text-red-300'}>
                {message}
              </p>
            )}
          </div>

          <div className="flex items-center justify-end gap-2">
            <span className="text-xs text-stone-300">Selected: {selectedCount}</span>

            <div className="flex items-center gap-2">
              <Input
                aria-label="Jump to page"
                placeholder="Page"
                value={jumpTo}
                onChange={(e) => onJumpToChange(e.target.value.replace(/[^0-9]/g, ''))}
                className={cn(limsDarkBarFieldClass, 'w-14 sm:w-16')}
              />
              <Button type="button" variant="outline" className={limsDarkBarBtnClass} onClick={onJumpToGo} disabled={loading}>
                Jump
              </Button>
            </div>

            <Button type="button" variant="outline" size="icon" className={cn('h-8 w-8', limsDarkBarBtnClass)} onClick={onPrevPage} disabled={loading || page <= 1}>
              <ChevronLeft size={16} />
            </Button>
            <span className="text-xs font-medium text-stone-300">
              Page {page} / {pageCount}
            </span>
            <Button type="button" variant="outline" size="icon" className={cn('h-8 w-8', limsDarkBarBtnClass)} onClick={onNextPage} disabled={loading || page >= pageCount}>
              <ChevronRight size={16} />
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
