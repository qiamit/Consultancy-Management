import { Archive, ArchiveRestore, ChevronLeft, ChevronRight, Download, FileUp, History, Printer, Trash2 } from 'lucide-react'
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
  responsiveWrap = false,
  responsiveClassName,
  loading,
  selectedCount,
  totalCount,
  rangeFrom,
  rangeTo,
  page,
  pageCount,
  onImport,
  onExport,
  onPrintSelected,
  printTitle = 'Print half-A4 courier slip for selected clients',
  onDeleteSelected,
  onHistory,
  canEdit,
  showArchived,
  onToggleShowArchived,
  onArchiveSelected,
  onRestoreSelected,
  onPrevPage,
  onNextPage,
  jumpTo,
  onJumpToChange,
  onJumpToGo,
}: {
  message: string | null
  responsiveWrap?: boolean
  responsiveClassName?: string
  loading: boolean
  selectedCount: number
  totalCount: number
  rangeFrom: number
  rangeTo: number
  page: number
  pageCount: number
  onImport: () => void
  onExport: () => void
  onPrintSelected: () => void
  printTitle?: string
  onDeleteSelected: () => void
  /** Change History button; shown only when given (Clients has none). */
  onHistory?: () => void
  canEdit?: boolean
  showArchived?: boolean
  onToggleShowArchived?: () => void
  onArchiveSelected?: () => void
  onRestoreSelected?: () => void
  onPrevPage: () => void
  onNextPage: () => void
  jumpTo: string
  onJumpToChange: (value: string) => void
  onJumpToGo: () => void
}) {
  const selectionDisabled = selectedCount === 0
  const actionBtn = cn(
    'h-10 min-h-10 shrink-0 gap-1 px-2 text-xs sm:gap-1.5 sm:px-2.5',
    footerBtnClass,
  )

  return (
    <div className={cn(clientPanelClass, 'lims-footer-bar', responsiveWrap && 'laboratories-responsive-footer', responsiveClassName)}>
      <div className="relative overflow-hidden bg-gradient-to-br from-stone-800 via-stone-900 to-stone-950 px-2 py-2 text-white sm:px-4 md:px-5">
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.18]"
          style={{
            backgroundImage:
              'radial-gradient(circle at 12% 20%, rgba(217,119,6,0.45), transparent 42%), radial-gradient(circle at 88% 0%, rgba(251,191,36,0.25), transparent 35%)',
          }}
        />
        <div className="absolute top-0 left-0 h-[2px] w-full bg-gradient-to-r from-amber-500 via-amber-300 to-transparent" />

        {/* One line at every width: on a narrow footer the buttons shrink to icons (see .lims-footer-bar in index.css). */}
        <div className="relative flex min-w-0 flex-nowrap items-center gap-1 sm:gap-1.5 md:gap-2.5">
          <div className="flex min-w-0 flex-1 flex-nowrap items-center gap-1 sm:gap-1.5">
            {onToggleShowArchived ? (
              <label className="flex h-8 shrink-0 items-center gap-1 px-1 text-[10px] text-stone-200 sm:text-xs">
                <input type="checkbox" checked={Boolean(showArchived)} onChange={() => onToggleShowArchived()} />
                Show archived
              </label>
            ) : null}
            {canEdit && onArchiveSelected ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className={actionBtn}
                onClick={onArchiveSelected}
                disabled={loading || selectionDisabled}
                title="Archive Selected"
              >
                <Archive size={14} />
                <span className="laboratories-footer-label hidden md:inline">Archive</span>
              </Button>
            ) : null}
            {canEdit && showArchived && onRestoreSelected ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className={actionBtn}
                onClick={onRestoreSelected}
                disabled={loading || selectionDisabled}
                title="Restore Selected"
              >
                <ArchiveRestore size={14} />
                <span className="laboratories-footer-label hidden md:inline">Restore</span>
              </Button>
            ) : null}
            <LaboratoryDirectorOnly>
              {onHistory ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className={cn(actionBtn, 'h-10 min-h-10')}
                  onClick={onHistory}
                  disabled={loading || selectedCount !== 1}
                  aria-label="Change History"
                  title="Change History"
                >
                  <History size={14} />
                  <span className="laboratories-footer-label hidden md:inline">History</span>
                </Button>
              ) : null}
              <Button
                type="button"
                variant="outline"
                size="sm"
                className={actionBtn}
                onClick={onImport}
                disabled={loading}
                title="Import"
              >
                <FileUp size={14} />
                <span className="laboratories-footer-label hidden md:inline">Import</span>
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className={actionBtn}
                onClick={onExport}
                disabled={loading}
                title="Export"
              >
                <Download size={14} />
                <span className="laboratories-footer-label hidden md:inline">Export</span>
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className={actionBtn}
                onClick={onPrintSelected}
                disabled={loading || selectionDisabled}
                title={printTitle}
              >
                <Printer size={14} />
                <span className="laboratories-footer-label hidden md:inline">Print</span>
              </Button>
              <Button
                type="button"
                variant="destructive"
                size="sm"
                className={cn(clientDeleteBtnClass, 'h-10 min-h-10 shrink-0 gap-1 px-2 text-xs sm:px-2.5')}
                onClick={onDeleteSelected}
                disabled={loading || selectionDisabled}
                title="Delete Permanently"
              >
                <Trash2 size={14} />
                <span className="laboratories-footer-label hidden md:inline">Delete Permanently</span>
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
              className={cn(footerFieldClass, 'lims-footer-page-input h-10 min-h-10 w-12 shrink-0 text-xs sm:w-14')}
              inputMode="numeric"
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              className={cn(actionBtn, 'lims-footer-jump hidden sm:inline-flex')}
              onClick={onJumpToGo}
              disabled={loading}
            >
              Jump
            </Button>
            <Button
              type="button"
              variant="outline"
              size="icon"
              className={cn(footerBtnClass, 'h-10 min-h-10 w-10 shrink-0')}
              onClick={onPrevPage}
              disabled={loading || page <= 1}
            >
              <ChevronLeft size={16} />
              <span className="sr-only">Previous Page</span>
            </Button>
            <span
              className="lims-footer-page shrink-0 whitespace-nowrap text-center text-xs font-medium text-stone-300 sm:min-w-[5rem]"
              title={`Showing ${rangeFrom.toLocaleString('en-IN')}–${rangeTo.toLocaleString('en-IN')} of ${totalCount.toLocaleString('en-IN')}`}
            >
              <span className="lims-footer-page-word hidden sm:inline">Page </span>
              {page}/{pageCount}
            </span>
            <Button
              type="button"
              variant="outline"
              size="icon"
              className={cn(footerBtnClass, 'h-10 min-h-10 w-10 shrink-0')}
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
