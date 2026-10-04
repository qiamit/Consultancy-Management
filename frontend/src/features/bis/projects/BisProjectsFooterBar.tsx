import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Download,
  Mail,
  Printer,
  RefreshCw,
  Trash2,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  limsDarkBarBtnClass,
  limsDarkBarFieldClass,
  limsDeleteBtnClass,
} from '@/lib/limsThemeUi'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { LaboratoryDirectorOnly } from '@/components/lims/LaboratoryDirectorOnly'
import {
  BIS_PRINT_DOCUMENT_LABEL,
  EXTRA_PRINT_KINDS,
  MORE_PRINTS_TOOLTIP,
  type BisPrintDocumentKind } from '../print/printBisDocument'

export function BisProjectsFooterBar({
  message,
  loading,
  selectedCount,
  totalCount,
  page,
  pageCount,
  onDeleteSelected,
  onExport,
  onPrintList,
  printListLabel = 'Print list',
  onEmailClient,
  emailClientLabel = 'Email client',
  onEmailDocument,
  onStartRenewal,
  onPrintForm1,
  onPrintAuthLetter,
  onPrintDocument,
  printDocsBusy = false,
  onPrevPage,
  onNextPage,
  jumpTo,
  onJumpToChange,
  onJumpToGo,
}: {
  message: string | null
  loading: boolean
  selectedCount: number
  totalCount: number
  page: number
  pageCount: number
  onDeleteSelected: () => void
  /** Export current page / selection as CSV. */
  onExport?: () => void
  onPrintList?: () => void
  /** Button label when `onPrintList` is provided (default: Print list). */
  printListLabel?: string
  /** Email one fixed document HTML to the client (renewals / SFR / surveillance). */
  onEmailClient?: () => void
  emailClientLabel?: string
  /** Email any BIS print document kind to the client (license lists). */
  onEmailDocument?: (kind: BisPrintDocumentKind) => void
  /** Open renewal form for the selected license (Due Soon / Expired). */
  onStartRenewal?: () => void
  onPrintForm1?: () => void
  onPrintAuthLetter?: () => void
  onPrintDocument?: (kind: BisPrintDocumentKind) => void
  printDocsBusy?: boolean
  onPrevPage: () => void
  onNextPage: () => void
  jumpTo: string
  onJumpToChange: (value: string) => void
  onJumpToGo: () => void
}) {
  const actionBtnClass = cn(
    'h-7 shrink-0 gap-1 px-1.5 text-[11px] sm:h-8 sm:gap-1.5 sm:px-2.5 sm:text-xs',
    limsDarkBarBtnClass,
  )
  const fieldClass = cn(limsDarkBarFieldClass, 'h-7 shrink-0 text-[11px] sm:h-8 sm:text-xs')
  const isSuccess =
    message != null &&
    (message.toLowerCase().includes('saved') ||
      message.toLowerCase().includes('deleted') ||
      message.toLowerCase().includes('exported') ||
      message.toLowerCase().includes('emailed'))

  return (
    <div className="relative overflow-hidden rounded-none border-2 border-stone-500 bg-gradient-to-br from-stone-800 via-stone-900 to-stone-950 px-2 py-1.5 text-white shadow-sm ring-1 ring-amber-700/20 sm:px-3 sm:py-2 md:px-4">
      <div className="flex min-w-0 flex-nowrap items-center gap-1 overflow-x-auto overscroll-x-contain [-webkit-overflow-scrolling:touch] sm:gap-1.5 md:gap-2.5">
        <div className="flex shrink-0 items-center gap-1 sm:gap-1.5">
          <LaboratoryDirectorOnly>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              className={cn(
                limsDeleteBtnClass,
                'h-7 shrink-0 gap-1 px-1.5 text-[11px] sm:h-8 sm:gap-1.5 sm:px-2.5 sm:text-xs',
              )}
              onClick={onDeleteSelected}
              disabled={loading || selectedCount === 0}
              title="Delete selected"
            >
              <Trash2 className="size-3.5 shrink-0 sm:size-4" />
              <span className="hidden lg:inline">Delete</span>
            </Button>
          </LaboratoryDirectorOnly>
          {onExport ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className={actionBtnClass}
              onClick={onExport}
              disabled={loading || totalCount === 0}
              title="Export CSV (selected rows, or current page)"
            >
              <Download className="size-3.5 shrink-0 sm:size-4" />
              <span className="hidden lg:inline">Export</span>
            </Button>
          ) : null}
          {onPrintList ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className={actionBtnClass}
              onClick={onPrintList}
              disabled={loading || (printListLabel === 'Print list' ? totalCount === 0 : selectedCount !== 1)}
              title={
                printListLabel === 'Print list'
                  ? 'Print list'
                  : selectedCount === 1
                    ? printListLabel
                    : 'Select exactly one row to print'
              }
            >
              <Printer className="size-3.5 shrink-0 sm:size-4" />
              <span className="hidden lg:inline">{printListLabel}</span>
            </Button>
          ) : null}
          {onEmailDocument ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className={actionBtnClass}
                  disabled={loading || printDocsBusy || selectedCount !== 1}
                  title={
                    selectedCount === 1
                      ? 'Email BIS documents to the client'
                      : 'Select exactly one row to email the client'
                  }
                >
                  <Mail className="size-3.5 shrink-0 sm:size-4" />
                  <span className="hidden lg:inline">Email docs</span>
                  <ChevronDown className="size-3 shrink-0" aria-hidden />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="max-h-80 overflow-y-auto">
                <DropdownMenuItem onSelect={() => onEmailDocument('form1')}>
                  {BIS_PRINT_DOCUMENT_LABEL.form1}
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => onEmailDocument('authorization-letter')}>
                  {BIS_PRINT_DOCUMENT_LABEL['authorization-letter']}
                </DropdownMenuItem>
                {EXTRA_PRINT_KINDS.map((kind) => (
                  <DropdownMenuItem key={`email-${kind}`} onSelect={() => onEmailDocument(kind)}>
                    {BIS_PRINT_DOCUMENT_LABEL[kind]}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          ) : onEmailClient ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className={actionBtnClass}
              onClick={onEmailClient}
              disabled={loading || printDocsBusy || selectedCount !== 1}
              title={
                selectedCount === 1
                  ? emailClientLabel
                  : 'Select exactly one row to email the client'
              }
            >
              <Mail className="size-3.5 shrink-0 sm:size-4" />
              <span className="hidden lg:inline">{emailClientLabel}</span>
            </Button>
          ) : null}
          {onStartRenewal ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className={actionBtnClass}
              onClick={onStartRenewal}
              disabled={loading || selectedCount !== 1}
              title={
                selectedCount === 1
                  ? 'Start license renewal for the selected row'
                  : 'Select exactly one license to start renewal'
              }
            >
              <RefreshCw className="size-3.5 shrink-0 sm:size-4" />
              <span className="hidden lg:inline">Start Renewal</span>
            </Button>
          ) : null}
          {onPrintForm1 ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className={actionBtnClass}
              onClick={onPrintForm1}
              disabled={loading || printDocsBusy || selectedCount !== 1}
              title={selectedCount === 1 ? 'Print BIS Form-I' : 'Select exactly one row to print Form-I'}
            >
              <Printer className="size-3.5 shrink-0 sm:size-4" />
              <span className="hidden lg:inline">Print Form-I</span>
            </Button>
          ) : null}
          {onPrintAuthLetter ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className={actionBtnClass}
              onClick={onPrintAuthLetter}
              disabled={loading || printDocsBusy || selectedCount !== 1}
              title={
                selectedCount === 1
                  ? 'Print Authorization Letter'
                  : 'Select exactly one row to print the Authorization Letter'
              }
            >
              <Printer className="size-3.5 shrink-0 sm:size-4" />
              <span className="hidden lg:inline">Print Authorization Letter</span>
            </Button>
          ) : null}
          {onPrintDocument ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className={actionBtnClass}
                  disabled={loading || printDocsBusy || selectedCount !== 1}
                  title={
                    selectedCount === 1
                      ? `More BIS documents (${MORE_PRINTS_TOOLTIP})`
                      : 'Select exactly one row to print more documents'
                  }
                >
                  <Printer className="size-3.5 shrink-0 sm:size-4" />
                  <span className="hidden lg:inline">More prints</span>
                  <ChevronDown className="size-3 shrink-0" aria-hidden />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                {EXTRA_PRINT_KINDS.map((kind) => (
                  <DropdownMenuItem key={kind} onSelect={() => onPrintDocument(kind)}>
                    {BIS_PRINT_DOCUMENT_LABEL[kind]}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}
          {selectedCount > 0 ? (
            <span className="hidden shrink-0 whitespace-nowrap text-[10px] text-stone-300 sm:inline sm:text-xs">
              Selected: {selectedCount}
            </span>
          ) : null}
          <span className="hidden shrink-0 whitespace-nowrap text-[10px] text-stone-300 md:inline sm:text-xs">
            Total: {totalCount.toLocaleString('en-IN')}
          </span>
          {message ? (
            <p
              className={cn(
                'min-w-0 max-w-[8rem] truncate text-[10px] sm:max-w-[12rem] sm:text-xs md:max-w-[16rem]',
                isSuccess ? 'text-emerald-300' : 'text-red-300',
              )}
              title={message}
            >
              {message}
            </p>
          ) : null}
        </div>

        <div className="ml-auto flex shrink-0 items-center gap-1 sm:gap-1.5">
          <Input
            aria-label="Jump to page"
            placeholder="Page"
            value={jumpTo}
            onChange={(e) => onJumpToChange(e.target.value.replace(/[^0-9]/g, ''))}
            onKeyDown={(e) => {
              if (e.key === 'Enter') onJumpToGo()
            }}
            className={cn(fieldClass, 'w-12 sm:w-14 md:w-16')}
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
          <span className="shrink-0 whitespace-nowrap text-center text-xs font-medium text-stone-300 sm:min-w-[5rem] md:min-w-[6.5rem]">
            <span className="hidden sm:inline">Page </span>
            {page}/{Math.max(pageCount, 1)}
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
