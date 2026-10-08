import { useEffect, useMemo, useState } from 'react'
import {
  ChevronLeft,
  ChevronRight,
  Eye,
  FileDown,
  FileSpreadsheet,
  FileText,
  FileType,
  Import,
  Pencil,
  Printer,
  ScanEye,
  Search,
  X,
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { downloadPdfViaPlaywright } from '@/lib/playwrightPdfClient'
import {
  limsDarkBarBtnClass,
  limsDarkBarFieldClass,
  limsDarkBarGlowStyle,
  limsDarkBarSearchClass,
  limsOutlineBtnClass,
  limsPageShellClass,
  limsPanelClass,
} from '@/lib/limsThemeUi'
import { cn } from '@/lib/utils'
import {
  ALL_BIS_PRINT_KINDS,
  BIS_FILE_MODULE_KINDS,
  BIS_HYBRID_FILE_VIEW_KINDS,
  BIS_MERGE_PDF_MODULE_KINDS,
  BIS_PRINT_DOCUMENT_LABEL,
  buildBisDocumentHtml,
  printKindToStorageDocKind,
  type BisPrintDocumentKind,
} from '../print/printBisDocument'
import { BisDocumentPrintPreviewDialog } from './BisDocumentPrintPreviewDialog'
import { BisModuleImportDialog } from './BisModuleImportDialog'
import { isImportableBisModuleKind } from './bisModuleImportApi'
import { LegalDocumentsModuleDialog } from './LegalDocumentsModuleDialog'
import {
  downloadMergedBisModulePdf,
  openMergedBisModulePdf,
} from './mergeBisProjectFilesPdf'

function isFileModuleKind(kind: BisPrintDocumentKind): boolean {
  return (BIS_FILE_MODULE_KINDS as readonly string[]).includes(kind)
}

function isMergePdfModuleKind(kind: BisPrintDocumentKind): boolean {
  return (BIS_MERGE_PDF_MODULE_KINDS as readonly string[]).includes(kind)
}

function isHybridFileViewKind(kind: BisPrintDocumentKind): boolean {
  return (BIS_HYBRID_FILE_VIEW_KINDS as readonly string[]).includes(kind)
}
import { clientDisplayName, formatCmL, isCodeDisplayLabel, type BisProjectRow } from './types'

const thBase =
  'bg-stone-800 text-center text-[11px] font-bold uppercase tracking-[0.14em] text-amber-200'

const checkboxClass =
  'h-4 w-4 rounded-none border-stone-500 text-amber-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/30'

const rowEvenClass = 'bg-[#f7f3eb] hover:bg-[#f3e9d8]'
const rowOddClass = 'bg-[#fffcf7] hover:bg-[#f3e9d8]'
const rowSelectedClass = 'bg-[#fde68a]/80 hover:bg-[#fde68a]/80'

const actionBtnClass =
  'h-8 w-8 rounded-none p-0 text-amber-800 hover:bg-amber-100 hover:text-amber-950'

/** ~10″ / desktop: row table. Below that: cards. */
const TABLE_MQ_SHOW = 'hidden lg:block'
const CARDS_MQ_SHOW = 'lg:hidden'

const PAGE_SIZE_OPTIONS = [10, 20, 25, 50] as const

function safeFileBase(label: string, cmL: string): string {
  const raw = [label, cmL].filter(Boolean).join('-')
  return raw.replace(/[\\/:*?"<>|]+/g, '_').replace(/\s+/g, '-').slice(0, 80) || 'document'
}

function triggerBlobDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.rel = 'noopener'
  document.body.appendChild(a)
  a.click()
  a.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 2_000)
}

function DocRowActions({
  kind,
  disabled,
  onModuleEdit,
  onView,
  onPreview,
  onImport,
  onPrint,
  onExcel,
  onWord,
  onPdf,
}: {
  kind: BisPrintDocumentKind
  disabled?: boolean
  onModuleEdit: (kind: BisPrintDocumentKind) => void
  onView: (kind: BisPrintDocumentKind) => void
  onPreview: (kind: BisPrintDocumentKind) => void
  onImport: (kind: BisPrintDocumentKind) => void
  onPrint: (kind: BisPrintDocumentKind) => void
  onExcel: (kind: BisPrintDocumentKind) => void
  onWord: (kind: BisPrintDocumentKind) => void
  onPdf: (kind: BisPrintDocumentKind) => void
}) {
  const label = BIS_PRINT_DOCUMENT_LABEL[kind]
  const importEnabled = isImportableBisModuleKind(kind)
  return (
    <div className="inline-flex shrink-0 items-center justify-center gap-0.5">
      <Button
        type="button"
        size="sm"
        variant="ghost"
        className={actionBtnClass}
        disabled={disabled}
        title={`Module Edit — ${label}`}
        aria-label={`Module Edit ${label}`}
        onClick={() => onModuleEdit(kind)}
      >
        <Pencil size={15} />
      </Button>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        className={actionBtnClass}
        disabled={disabled}
        title={`View — ${label}`}
        aria-label={`View ${label}`}
        onClick={() => onView(kind)}
      >
        <Eye size={15} />
      </Button>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        className={actionBtnClass}
        disabled={disabled}
        title={`Preview — ${label} (page & print settings)`}
        aria-label={`Preview ${label}`}
        onClick={() => onPreview(kind)}
      >
        <ScanEye size={15} />
      </Button>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        className={actionBtnClass}
        disabled={disabled || !importEnabled}
        title={
          importEnabled
            ? `Import — ${label} from another Application / License`
            : `${label} has no stored module data to import`
        }
        aria-label={`Import ${label}`}
        onClick={() => onImport(kind)}
      >
        <Import size={15} />
      </Button>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        className={actionBtnClass}
        disabled={disabled}
        title={`Print — ${label}`}
        aria-label={`Print ${label}`}
        onClick={() => onPrint(kind)}
      >
        <Printer size={15} />
      </Button>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        className={actionBtnClass}
        disabled={disabled}
        title={`Excel Download — ${label}`}
        aria-label={`Excel Download ${label}`}
        onClick={() => onExcel(kind)}
      >
        <FileSpreadsheet size={15} />
      </Button>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        className={actionBtnClass}
        disabled={disabled}
        title={`Word Download — ${label}`}
        aria-label={`Word Download ${label}`}
        onClick={() => onWord(kind)}
      >
        <FileType size={15} />
      </Button>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        className={actionBtnClass}
        disabled={disabled}
        title={`PDF Download — ${label}`}
        aria-label={`PDF Download ${label}`}
        onClick={() => onPdf(kind)}
      >
        <FileDown size={15} />
      </Button>
    </div>
  )
}

export function BisLicenseDocumentsDialog({
  open,
  onOpenChange,
  row,
  busy = false,
  onViewDocument,
  moduleKind = null,
  onModuleKindChange,
  onProjectSaved,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  row: BisProjectRow | null
  busy?: boolean
  onViewDocument: (kind: BisPrintDocumentKind) => void
  /** Open Module Edit for Legal Documents / Application Details / Form-I. */
  moduleKind?: BisPrintDocumentKind | null
  onModuleKindChange?: (kind: BisPrintDocumentKind | null) => void
  onProjectSaved?: () => void
}) {
  const [search, setSearch] = useState('')
  const [selectedKinds, setSelectedKinds] = useState<Set<BisPrintDocumentKind>>(() => new Set())
  const [downloadBusy, setDownloadBusy] = useState(false)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [jumpTo, setJumpTo] = useState('')
  const [previewKind, setPreviewKind] = useState<BisPrintDocumentKind | null>(null)
  const [importKind, setImportKind] = useState<BisPrintDocumentKind | null>(null)

  const client = row ? clientDisplayName(row) || '—' : '—'
  const isLabel = row ? isCodeDisplayLabel(row) : ''
  const cmL = row ? formatCmL(row.cm_l_digits) : ''
  const subtitle = [client, isLabel, cmL].filter(Boolean).join(' · ')

  useEffect(() => {
    if (!open) {
      setSearch('')
      setSelectedKinds(new Set())
      setDownloadBusy(false)
      setPage(1)
      setJumpTo('')
      setPreviewKind(null)
      setImportKind(null)
    }
  }, [open])

  useEffect(() => {
    setSelectedKinds(new Set())
    setSearch('')
    setPage(1)
    setJumpTo('')
  }, [row?.id])

  const filteredKinds = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return ALL_BIS_PRINT_KINDS
    return ALL_BIS_PRINT_KINDS.filter((kind) =>
      BIS_PRINT_DOCUMENT_LABEL[kind].toLowerCase().includes(q),
    )
  }, [search])

  const pageCount = Math.max(1, Math.ceil(filteredKinds.length / pageSize))
  const safePage = Math.min(page, pageCount)

  useEffect(() => {
    setPage(1)
  }, [search, pageSize])

  useEffect(() => {
    if (page > pageCount) setPage(pageCount)
  }, [page, pageCount])

  const pageKinds = useMemo(() => {
    const start = (safePage - 1) * pageSize
    return filteredKinds.slice(start, start + pageSize)
  }, [filteredKinds, safePage, pageSize])

  const allChecked =
    pageKinds.length > 0 && pageKinds.every((kind) => selectedKinds.has(kind))
  const someChecked = pageKinds.some((kind) => selectedKinds.has(kind))
  const actionsDisabled = !row || busy || downloadBusy

  const toggleKind = (kind: BisPrintDocumentKind) => {
    setSelectedKinds((prev) => {
      const next = new Set(prev)
      if (next.has(kind)) next.delete(kind)
      else next.add(kind)
      return next
    })
  }

  const toggleAll = (checked: boolean) => {
    setSelectedKinds((prev) => {
      const next = new Set(prev)
      if (checked) pageKinds.forEach((kind) => next.add(kind))
      else pageKinds.forEach((kind) => next.delete(kind))
      return next
    })
  }

  const handleJumpToGo = () => {
    const n = Number.parseInt(jumpTo, 10)
    if (Number.isFinite(n) && n >= 1 && n <= pageCount) setPage(n)
  }

  const handleModuleEdit = (kind: BisPrintDocumentKind) => {
    if (!row?.id) {
      toast.error('Save the license first, then open the document module.')
      return
    }
    if (!isFileModuleKind(kind)) {
      toast.message('Module Edit', {
        description: `${BIS_PRINT_DOCUMENT_LABEL[kind]} — editor not available.`,
      })
      return
    }
    onModuleKindChange?.(kind)
  }

  const activeModuleKind =
    moduleKind && isFileModuleKind(moduleKind) ? moduleKind : null
  const activeModuleTitle =
    activeModuleKind === 'process-flow-chart' ||
    activeModuleKind === 'process-description'
      ? 'Process Flow Chart & Description'
      : activeModuleKind
        ? BIS_PRINT_DOCUMENT_LABEL[activeModuleKind]
        : 'Documents'
  const activeDocKind = activeModuleKind
    ? printKindToStorageDocKind(activeModuleKind)
    : 'legal'

  const runMergedModulePdf = async (
    kind: BisPrintDocumentKind,
    mode: 'view' | 'print' | 'download',
  ): Promise<string | null> => {
    if (!row) return 'No project selected.'
    const label = BIS_PRINT_DOCUMENT_LABEL[kind]
    const docKind = printKindToStorageDocKind(kind)
    setDownloadBusy(true)
    try {
      if (mode === 'download') {
        await downloadMergedBisModulePdf(
          row.id,
          docKind,
          `${safeFileBase(label, cmL)}.pdf`,
        )
        toast.success(`PDF downloaded: ${label}`)
        return null
      }
      const error = await openMergedBisModulePdf(row.id, docKind, {
        title: label,
        mode,
      })
      if (error) {
        if (!/no attached files/i.test(error)) toast.error(error)
        return error
      }
      return null
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Merged PDF failed'
      toast.error(message)
      return message
    } finally {
      setDownloadBusy(false)
    }
  }

  const handleView = (kind: BisPrintDocumentKind) => {
    // Attached files first; otherwise generated HTML for that module.
    if (isMergePdfModuleKind(kind) || isHybridFileViewKind(kind)) {
      void (async () => {
        const error = await runMergedModulePdf(kind, 'view')
        if (error) onViewDocument(kind)
      })()
      return
    }
    onViewDocument(kind)
  }

  const handlePreview = (kind: BisPrintDocumentKind) => {
    if (!row) {
      toast.error('Select a license first.')
      return
    }
    setPreviewKind(kind)
  }

  const handleImport = (kind: BisPrintDocumentKind) => {
    if (!row?.id) {
      toast.error('Save the license first, then import module data.')
      return
    }
    if (!isImportableBisModuleKind(kind)) {
      toast.message('Import not available', {
        description: `${BIS_PRINT_DOCUMENT_LABEL[kind]} has no stored module data.`,
      })
      return
    }
    setImportKind(kind)
  }

  const handlePrint = (kind: BisPrintDocumentKind) => {
    if (isMergePdfModuleKind(kind) || isHybridFileViewKind(kind)) {
      void (async () => {
        const error = await runMergedModulePdf(kind, 'print')
        if (error) onViewDocument(kind)
      })()
      return
    }
    onViewDocument(kind)
  }

  const runDownload = async (
    kind: BisPrintDocumentKind,
    format: 'excel' | 'word' | 'pdf',
  ) => {
    if (!row) return
    const label = BIS_PRINT_DOCUMENT_LABEL[kind]
    const base = safeFileBase(label, cmL)
    if (format === 'pdf' && (isMergePdfModuleKind(kind) || isHybridFileViewKind(kind))) {
      const error = await runMergedModulePdf(kind, 'download')
      if (error && /no attached files/i.test(error) && !isMergePdfModuleKind(kind)) {
        // fall through to HTML→PDF for hybrid kinds without uploads
      } else {
        return
      }
    }
    setDownloadBusy(true)
    try {
      const html = await buildBisDocumentHtml(row, kind)
      if (format === 'pdf') {
        await downloadPdfViaPlaywright({ html, filename: `${base}.pdf` })
        toast.success(`PDF downloaded: ${label}`)
        return
      }
      if (format === 'word') {
        triggerBlobDownload(
          new Blob([html], { type: 'application/msword;charset=utf-8' }),
          `${base}.doc`,
        )
        toast.success(`Word downloaded: ${label}`)
        return
      }
      triggerBlobDownload(
        new Blob([html], { type: 'application/vnd.ms-excel;charset=utf-8' }),
        `${base}.xls`,
      )
      toast.success(`Excel downloaded: ${label}`)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Download failed'
      toast.error(message)
    } finally {
      setDownloadBusy(false)
    }
  }

  return (
    <>
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        persistOnFocusLoss
        showCloseButton={false}
        aria-describedby={undefined}
        onEscapeKeyDown={(e) => {
          // Nested module dialog owns Escape while open — don't clear view=/module=.
          if (activeModuleKind) e.preventDefault()
        }}
        onInteractOutside={(e) => {
          if (activeModuleKind) e.preventDefault()
        }}
        onPointerDownOutside={(e) => {
          if (activeModuleKind) e.preventDefault()
        }}
        className={cn(
          '!flex z-50 h-[100dvh] max-h-[100dvh] translate-x-0 translate-y-0 flex-col gap-0 overflow-hidden rounded-none border-0 bg-stone-100 p-0 shadow-none sm:rounded-none',
          'left-[var(--app-dialog-overlay-left,0px)] top-0 right-0',
          'w-[calc(100vw-var(--app-dialog-overlay-left,0px))] max-w-none',
          'border-stone-600 ring-1 ring-amber-700/20',
        )}
      >
        <div
          className={cn(
            limsPageShellClass,
            'flex h-full min-h-0 flex-col overflow-hidden !space-y-0 gap-2 p-2 sm:gap-3 sm:p-3 md:gap-3 md:p-4',
          )}
        >
          {/* Header — Client Master style */}
          <div className={cn(limsPanelClass, 'shrink-0')}>
            <div className="relative overflow-hidden bg-gradient-to-br from-stone-800 via-stone-900 to-stone-950 px-2 py-2 text-white sm:px-4 sm:py-2.5 md:px-5">
              <div
                className="pointer-events-none absolute inset-0 opacity-[0.18]"
                style={limsDarkBarGlowStyle}
              />
              <div className="absolute bottom-0 left-0 h-[2px] w-full bg-gradient-to-r from-amber-500 via-amber-300 to-transparent" />
              <div className="relative flex min-w-0 flex-col gap-1.5">
                <div className="flex min-w-0 flex-nowrap items-center gap-1.5 sm:gap-2.5">
                  <DialogHeader className="min-w-0 shrink space-y-0 text-left">
                    <DialogTitle className="truncate text-sm font-semibold tracking-tight text-white sm:text-base md:text-lg">
                      View Documents
                    </DialogTitle>
                  </DialogHeader>
                  <div className="relative min-w-0 flex-1 basis-0">
                    <Search
                      className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-stone-500 sm:left-3 sm:h-4 sm:w-4"
                      aria-hidden
                    />
                    <Input
                      type="search"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="Search Documents"
                      aria-label="Search documents"
                      className={cn(
                        limsDarkBarSearchClass,
                        'h-8 min-w-0 pl-7 text-xs sm:pl-9 sm:text-sm',
                      )}
                    />
                  </div>
                  <Select
                    value={String(pageSize)}
                    onValueChange={(v) => setPageSize(Number(v))}
                  >
                    <SelectTrigger
                      className={cn(
                        limsDarkBarFieldClass,
                        'h-8 w-[3.5rem] shrink-0 px-1 text-[11px] tabular-nums sm:w-[4.25rem] sm:px-2 sm:text-xs',
                      )}
                      aria-label="Rows per page"
                      title={`${pageSize} per page`}
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent align="end">
                      {PAGE_SIZE_OPTIONS.map((n) => (
                        <SelectItem key={n} value={String(n)}>
                          {n}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className={cn(limsDarkBarBtnClass, 'h-8 shrink-0 gap-1.5 px-2.5')}
                    onClick={() => onOpenChange(false)}
                    title="Close"
                  >
                    <X className="h-4 w-4" aria-hidden />
                    <span className="hidden sm:inline">Close</span>
                  </Button>
                </div>
                <p
                  className="truncate px-1 text-center text-xs font-medium text-stone-200 sm:text-sm"
                  title={subtitle}
                >
                  {subtitle || '—'}
                </p>
              </div>
            </div>
          </div>

          {/* Table / cards panel */}
          <div className={cn(limsPanelClass, 'flex min-h-0 flex-1 flex-col bg-[#f7f3eb]')}>
            <div className="min-h-0 flex-1 overflow-y-auto overflow-x-auto overscroll-contain [-webkit-overflow-scrolling:touch]">
              {pageKinds.length === 0 ? (
                <p className="px-3 py-8 text-center text-sm text-stone-500">
                  No documents match your search.
                </p>
              ) : (
                <>
                  {/* Cards — &lt; ~10″ */}
                  <div className={cn(CARDS_MQ_SHOW, 'space-y-2 p-2 sm:p-3')}>
                    {pageKinds.map((kind, index) => {
                      const selected = selectedKinds.has(kind)
                      const label = BIS_PRINT_DOCUMENT_LABEL[kind]
                      return (
                        <article
                          key={kind}
                          className={cn(
                            'border border-stone-400 p-2.5',
                            selected
                              ? 'bg-[#fde68a]/80'
                              : index % 2 === 0
                                ? 'bg-[#f7f3eb]'
                                : 'bg-[#fffcf7]',
                          )}
                        >
                          <div className="mb-2 flex min-w-0 items-start gap-2">
                            <input
                              type="checkbox"
                              className={cn(checkboxClass, 'mt-0.5')}
                              aria-label={`Select ${label}`}
                              checked={selected}
                              onChange={() => toggleKind(kind)}
                            />
                            <div className="flex min-w-0 flex-1 items-center gap-2">
                              <FileText
                                className="h-4 w-4 shrink-0 text-amber-800"
                                aria-hidden
                              />
                              <p className="min-w-0 break-words text-sm font-semibold leading-snug text-[#1c1917]">
                                {label}
                              </p>
                            </div>
                          </div>
                          <div className="flex justify-end overflow-x-auto">
                            <DocRowActions
                              kind={kind}
                              disabled={actionsDisabled}
                              onModuleEdit={handleModuleEdit}
                              onView={handleView}
                              onPreview={handlePreview}
                              onImport={handleImport}
                              onPrint={handlePrint}
                              onExcel={(k) => void runDownload(k, 'excel')}
                              onWord={(k) => void runDownload(k, 'word')}
                              onPdf={(k) => void runDownload(k, 'pdf')}
                            />
                          </div>
                        </article>
                      )
                    })}
                  </div>

                  {/* Table — ~10″ / lg+ */}
                  <div className={TABLE_MQ_SHOW}>
                    <Table className="w-full min-w-[640px] table-fixed border-collapse font-jakarta [&_th]:border [&_td]:border [&_th]:border-stone-700 [&_td]:border-[#e7e0d4] [&_th]:p-[1mm] [&_td]:!p-[1mm] [&_th]:sticky [&_th]:top-0 [&_th]:z-[1]">
                      <TableHeader>
                        <TableRow className="hover:bg-transparent">
                          <TableHead className={cn(thBase, 'w-[4%]')}>
                            <input
                              type="checkbox"
                              className={checkboxClass}
                              aria-label="Select all documents"
                              checked={allChecked}
                              ref={(el) => {
                                if (el) el.indeterminate = !allChecked && someChecked
                              }}
                              onChange={(e) => toggleAll(e.target.checked)}
                            />
                          </TableHead>
                          <TableHead className={cn(thBase, 'text-left')}>
                            Documents Description
                          </TableHead>
                          <TableHead className={cn(thBase, 'w-[20.5rem]')}>Action</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {pageKinds.map((kind, index) => {
                          const selected = selectedKinds.has(kind)
                          const label = BIS_PRINT_DOCUMENT_LABEL[kind]
                          return (
                            <TableRow
                              key={kind}
                              data-state={selected ? 'selected' : undefined}
                              className={cn(
                                'border-b border-[#e7e0d4]',
                                selected
                                  ? rowSelectedClass
                                  : index % 2 === 0
                                    ? rowEvenClass
                                    : rowOddClass,
                              )}
                            >
                              <TableCell className="px-2 py-2 text-center align-middle">
                                <input
                                  type="checkbox"
                                  className={checkboxClass}
                                  aria-label={`Select ${label}`}
                                  checked={selected}
                                  onChange={() => toggleKind(kind)}
                                />
                              </TableCell>
                              <TableCell className="px-3 py-2 text-left align-middle">
                                <div className="flex min-w-0 items-center gap-2.5">
                                  <FileText
                                    className="h-4 w-4 shrink-0 text-amber-800"
                                    aria-hidden
                                  />
                                  <p className="min-w-0 truncate text-sm font-semibold text-[#1c1917]">
                                    {label}
                                  </p>
                                </div>
                              </TableCell>
                              <TableCell className="px-2 py-2 text-center align-middle">
                                <DocRowActions
                                  kind={kind}
                                  disabled={actionsDisabled}
                                  onModuleEdit={handleModuleEdit}
                                  onView={handleView}
                                  onPreview={handlePreview}
                                  onImport={handleImport}
                                  onPrint={handlePrint}
                                  onExcel={(k) => void runDownload(k, 'excel')}
                                  onWord={(k) => void runDownload(k, 'word')}
                                  onPdf={(k) => void runDownload(k, 'pdf')}
                                />
                              </TableCell>
                            </TableRow>
                          )
                        })}
                      </TableBody>
                    </Table>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Footer — Client Master style */}
          <div className={cn(limsPanelClass, 'shrink-0')}>
            <div className="relative overflow-hidden bg-gradient-to-br from-stone-800 via-stone-900 to-stone-950 px-2 py-1.5 text-white sm:px-3 sm:py-2 md:px-4">
              <div
                className="pointer-events-none absolute inset-0 opacity-[0.18]"
                style={limsDarkBarGlowStyle}
              />
              <div className="absolute top-0 left-0 h-[2px] w-full bg-gradient-to-r from-amber-500 via-amber-300 to-transparent" />
              <div className="relative flex min-w-0 flex-nowrap items-center gap-1 overflow-x-auto overscroll-x-contain [-webkit-overflow-scrolling:touch] sm:gap-1.5 md:gap-2.5">
                <div className="flex shrink-0 items-center gap-1 sm:gap-1.5">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className={cn(limsOutlineBtnClass, 'h-8 border-stone-400 bg-stone-50')}
                    onClick={() => onOpenChange(false)}
                  >
                    Close
                  </Button>
                  <span className="shrink-0 whitespace-nowrap text-[10px] text-stone-300 sm:text-xs">
                    Total: {filteredKinds.length.toLocaleString('en-IN')}
                    {selectedKinds.size > 0 ? ` · Selected: ${selectedKinds.size}` : ''}
                  </span>
                  {downloadBusy || busy ? (
                    <span className="truncate text-[10px] text-amber-200 sm:text-xs">
                      {downloadBusy ? 'Preparing download…' : 'Preparing document…'}
                    </span>
                  ) : null}
                </div>

                <div className="ml-auto flex shrink-0 items-center gap-1 sm:gap-1.5">
                  <Input
                    aria-label="Jump to page"
                    placeholder="Page"
                    value={jumpTo}
                    onChange={(e) => setJumpTo(e.target.value.replace(/[^0-9]/g, ''))}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleJumpToGo()
                    }}
                    className={cn(limsDarkBarFieldClass, 'h-8 w-12 shrink-0 text-xs sm:w-14')}
                    inputMode="numeric"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className={cn(limsDarkBarBtnClass, 'hidden h-8 shrink-0 px-2.5 text-xs sm:inline-flex')}
                    onClick={handleJumpToGo}
                  >
                    Jump
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className={cn(limsDarkBarBtnClass, 'h-8 w-8 shrink-0')}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={safePage <= 1}
                  >
                    <ChevronLeft size={16} />
                    <span className="sr-only">Previous page</span>
                  </Button>
                  <span className="shrink-0 whitespace-nowrap text-center text-xs font-medium text-stone-300 sm:min-w-[5rem]">
                    <span className="hidden sm:inline">Page </span>
                    {safePage}/{pageCount}
                  </span>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className={cn(limsDarkBarBtnClass, 'h-8 w-8 shrink-0')}
                    onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
                    disabled={safePage >= pageCount}
                  >
                    <ChevronRight size={16} />
                    <span className="sr-only">Next page</span>
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>

    <LegalDocumentsModuleDialog
      open={activeModuleKind != null && row != null}
      onOpenChange={(next) => {
        if (!next) onModuleKindChange?.(null)
      }}
      row={row}
      title={activeModuleTitle}
      docKind={activeDocKind}
      printKind={activeModuleKind}
      onProjectSaved={onProjectSaved}
    />

    <BisDocumentPrintPreviewDialog
      open={previewKind != null}
      onOpenChange={(next) => {
        if (!next) setPreviewKind(null)
      }}
      row={row}
      kind={previewKind}
    />

    <BisModuleImportDialog
      open={importKind != null}
      onOpenChange={(next) => {
        if (!next) setImportKind(null)
      }}
      targetRow={row}
      kind={importKind}
      onImported={onProjectSaved}
    />
    </>
  )
}
