import { useEffect, useMemo, useState } from 'react'
import { PDFDocument } from 'pdf-lib'
import * as XLSX from 'xlsx'
import {
  Check,
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
  X,
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import {
  mapPageSizeToPlaywrightFormat,
  renderPdfViaPlaywright,
  triggerPdfDownload,
} from '@/lib/playwrightPdfClient'
import {
  applyBisDocumentPrintPageSettings,
  DEFAULT_BIS_DOCUMENT_PRINT_PAGE_SETTINGS,
} from '../print/bisDocumentPrintPageSettings'
import {
  limsDarkBarBtnClass,
  limsDarkBarGlowStyle,
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
import { ManakStepPage } from './ManakStepPages'
import {
  BIS_APPLICATION_STEPS,
  BIS_PREVIEW_STEP_LABEL,
  unassignedKinds,
} from './bisApplicationSteps'
import { BisDocumentPrintPreviewDialog } from './BisDocumentPrintPreviewDialog'
import { buildApplicationDetailsPackPdf } from './buildApplicationDetailsPackPdf'
import { loadBisProjectPrintPageSettings } from './bisPrintPageSettingsApi'
import { buildWordDocx, combineWordHtml } from './bisWordExport'
import { BisModuleImportDialog } from './BisModuleImportDialog'
import { isImportableBisModuleKind } from './bisModuleImportApi'
import { LegalDocumentsModuleDialog } from './LegalDocumentsModuleDialog'
import {
  buildMergedBisProjectFilesPdf,
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

const checkboxClass =
  'h-4 w-4 rounded-none border-stone-500 text-amber-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/30'

const rowSelectedClass = 'bg-[#fde68a]/80 hover:bg-[#fde68a]/80'

const actionBtnClass =
  'h-8 w-8 rounded-none border border-stone-400 bg-white/70 p-0 text-amber-800 shadow-sm hover:border-amber-600 hover:bg-amber-50 hover:text-amber-950 focus-visible:ring-2 focus-visible:ring-amber-500/40'

function safeFileBase(label: string, cmL: string): string {
  const raw = [label, cmL]
    .map((part) => part.trim())
    .filter((part) => part && !/^[-\u2012-\u2015]+$/.test(part))
    .join('-')
  return raw
    .replace(/[\\/:*?"<>|]+/g, '_')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80) || 'document'
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

function pdfBlob(bytes: Uint8Array): Blob {
  const copy = new Uint8Array(bytes.byteLength)
  copy.set(bytes)
  return new Blob([copy.buffer], { type: 'application/pdf' })
}

async function mergePdfBlobs(blobs: Blob[]): Promise<Blob> {
  const merged = await PDFDocument.create()
  for (const blob of blobs) {
    const source = await PDFDocument.load(new Uint8Array(await blob.arrayBuffer()), {
      ignoreEncryption: true,
    })
    const pages = await merged.copyPages(source, source.getPageIndices())
    pages.forEach((page) => merged.addPage(page))
  }
  const bytes = await merged.save()
  return pdfBlob(bytes)
}

function buildExcelWorkbook(
  documents: Array<{ title: string; html: string }>,
): Blob {
  const workbook = XLSX.utils.book_new()
  const usedNames = new Set<string>()
  const addSheet = (sheet: XLSX.WorkSheet, rawName: string) => {
    const base = rawName.replace(/[\\/?*:[\]]/g, ' ').trim().slice(0, 25) || 'Document'
    let name = base
    let suffix = 2
    while (usedNames.has(name.toLowerCase())) {
      name = `${base.slice(0, 25 - String(suffix).length)} ${suffix}`
      suffix += 1
    }
    usedNames.add(name.toLowerCase())
    XLSX.utils.book_append_sheet(workbook, sheet, name)
  }

  for (const document of documents) {
    const parsed = new DOMParser().parseFromString(document.html, 'text/html')
    const tables = Array.from(parsed.querySelectorAll('table'))
    if (tables.length > 0) {
      tables.forEach((table, index) => {
        addSheet(
          XLSX.utils.table_to_sheet(table, { raw: true }),
          tables.length === 1 ? document.title : `${document.title} ${index + 1}`,
        )
      })
      continue
    }
    const lines = (parsed.body.innerText || parsed.body.textContent || '')
      .split(/\n+/)
      .map((line) => line.trim())
      .filter(Boolean)
    addSheet(XLSX.utils.aoa_to_sheet(lines.map((line) => [line])), document.title)
  }

  const bytes = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' })
  return new Blob([bytes], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
}

function DocRowActions({
  kind,
  labelOverride,
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
  labelOverride?: string
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
  const label = labelOverride ?? BIS_PRINT_DOCUMENT_LABEL[kind]
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
  const [selectedKinds, setSelectedKinds] = useState<Set<BisPrintDocumentKind>>(() => new Set())
  const [downloadBusy, setDownloadBusy] = useState(false)
  const [step, setStep] = useState(0)
  const [refreshKey, setRefreshKey] = useState(0)
  const [previewKind, setPreviewKind] = useState<BisPrintDocumentKind | null>(null)
  // Generated letterhead HTML to preview instead of attached files (Undertaking for Manufacturing Scope).
  const [previewGeneratedHtml, setPreviewGeneratedHtml] = useState<string | null>(null)
  // Undertaking the All Undertakings module opens on (set when it is opened from the Marking Fee section).
  const [undertakingFocus, setUndertakingFocus] = useState<'undertaking-mmf' | null>(null)
  const [importKind, setImportKind] = useState<BisPrintDocumentKind | null>(null)

  const client = row ? clientDisplayName(row) || '—' : '—'
  const isLabel = row ? isCodeDisplayLabel(row) : ''
  const cmL = row ? formatCmL(row.cm_l_digits) : ''
  const subtitle = [client, isLabel, cmL].filter((part) => Boolean(part) && part !== '—').join(' · ')

  useEffect(() => {
    if (!open) {
      setSelectedKinds(new Set())
      setDownloadBusy(false)
      setStep(0)
      setPreviewKind(null)
      setImportKind(null)
    }
  }, [open])

  useEffect(() => {
    setSelectedKinds(new Set())
    setStep(0)
  }, [row?.id])

  const allKinds = useMemo<BisPrintDocumentKind[]>(
    () =>
      ALL_BIS_PRINT_KINDS.filter(
        (kind) => kind !== 'legal-documents' && kind !== 'location-map' && kind !== 'updated-sit',
      ),
    [],
  )

  /** Documents on a wizard step; leftovers not mapped to any step show on Declaration. */
  const stepKinds = (index: number): BisPrintDocumentKind[] => {
    const s = BIS_APPLICATION_STEPS[index]
    if (!s) return []
    const own = s.kinds.filter((k) => allKinds.includes(k))
    return s.id === 'declaration' ? [...own, ...unassignedKinds(allKinds)] : own
  }

  const stepLabels = [...BIS_APPLICATION_STEPS.map((s) => s.label), BIS_PREVIEW_STEP_LABEL]
  const isPreviewStep = step >= BIS_APPLICATION_STEPS.length
  const currentStep = BIS_APPLICATION_STEPS[Math.min(step, BIS_APPLICATION_STEPS.length - 1)]
  const currentKinds = isPreviewStep ? [] : stepKinds(step)
  const actionsDisabled = !row || busy || downloadBusy

  const toggleKind = (kind: BisPrintDocumentKind) => {
    setSelectedKinds((prev) => {
      const next = new Set(prev)
      if (next.has(kind)) next.delete(kind)
      else next.add(kind)
      return next
    })
  }

  const handleModuleEdit = (kind: BisPrintDocumentKind) => {
    setUndertakingFocus(null)
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
      : activeModuleKind === 'location-map'
        ? 'Location Map'
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
    setPreviewGeneratedHtml(null)
    setPreviewKind(kind)
  }

  /** The generated Undertaking for Manufacturing Scope on letterhead (never the uploaded scope files). */
  const previewScopeUndertaking = async () => {
    if (!row) return
    try {
      setPreviewGeneratedHtml(await buildBisDocumentHtml(row, 'manufacturing-scope'))
      setPreviewKind('manufacturing-scope')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not build the undertaking')
    }
  }

  const downloadScopeUndertakingPdf = async () => {
    if (!row) return
    setDownloadBusy(true)
    try {
      const settings = await loadBisProjectPrintPageSettings(row.id).catch(() => DEFAULT_BIS_DOCUMENT_PRINT_PAGE_SETTINGS)
      const html = applyBisDocumentPrintPageSettings(await buildBisDocumentHtml(row, 'manufacturing-scope'), settings)
      const filename = `${safeFileBase('Undertaking for Manufacturing Scope', cmL)}.pdf`
      const blob = await renderPdfViaPlaywright({
        html,
        filename,
        format: mapPageSizeToPlaywrightFormat(settings.pageSize),
        landscape: settings.orientation === 'landscape',
        margin: { top: '0mm', right: '0mm', bottom: '0mm', left: '0mm' },
      })
      triggerPdfDownload(blob, filename)
      toast.success('PDF downloaded: Undertaking for Manufacturing Scope')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'PDF download failed')
    } finally {
      setDownloadBusy(false)
    }
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

  const selectedDocumentKinds = (clickedKind: BisPrintDocumentKind) =>
    selectedKinds.size > 0
      ? ALL_BIS_PRINT_KINDS.filter((kind) => selectedKinds.has(kind))
      : [clickedKind]

  const buildDocumentPdf = async (
    kind: BisPrintDocumentKind,
    settings: typeof DEFAULT_BIS_DOCUMENT_PRINT_PAGE_SETTINGS,
  ): Promise<Blob> => {
    if (!row) throw new Error('Select a license first.')

    if (kind === 'application-details') {
      const html = await buildBisDocumentHtml(row, kind)
      return buildApplicationDetailsPackPdf(
        html,
        row.id,
        row.client_id,
        settings,
        `${safeFileBase(BIS_PRINT_DOCUMENT_LABEL[kind], cmL)}.pdf`,
      )
    }

    if (isMergePdfModuleKind(kind) || isHybridFileViewKind(kind)) {
      const attached = await buildMergedBisProjectFilesPdf(
        row.id,
        [printKindToStorageDocKind(kind)],
        { strict: true },
      )
      if (attached) return pdfBlob(attached)
      if (isMergePdfModuleKind(kind)) {
        throw new Error(`No attached files found for ${BIS_PRINT_DOCUMENT_LABEL[kind]}.`)
      }
    }

    const html = applyBisDocumentPrintPageSettings(
      await buildBisDocumentHtml(row, kind),
      settings,
    )
    return renderPdfViaPlaywright({
      html,
      filename: `${safeFileBase(BIS_PRINT_DOCUMENT_LABEL[kind], cmL)}.pdf`,
      format: mapPageSizeToPlaywrightFormat(settings.pageSize),
      landscape: settings.orientation === 'landscape',
      margin: { top: '0mm', right: '0mm', bottom: '0mm', left: '0mm' },
    })
  }

  const downloadPdfDocuments = async (
    clickedKind: BisPrintDocumentKind,
    overrideKinds?: BisPrintDocumentKind[],
    bundleName = 'Selected BIS Documents',
  ) => {
    if (!row) return
    const kinds = overrideKinds ?? selectedDocumentKinds(clickedKind)
    setDownloadBusy(true)
    try {
      const settings = await loadBisProjectPrintPageSettings(row.id).catch(
        () => DEFAULT_BIS_DOCUMENT_PRINT_PAGE_SETTINGS,
      )
      const pdfs: Blob[] = []
      for (const kind of kinds) pdfs.push(await buildDocumentPdf(kind, settings))
      const output = pdfs.length === 1 ? pdfs[0] : await mergePdfBlobs(pdfs)
      const filename = pdfs.length === 1
        ? `${safeFileBase(BIS_PRINT_DOCUMENT_LABEL[kinds[0]], cmL)}.pdf`
        : `${safeFileBase(bundleName, cmL)}.pdf`
      triggerPdfDownload(output, filename)
      toast.success(
        pdfs.length === 1
          ? `PDF downloaded: ${BIS_PRINT_DOCUMENT_LABEL[kinds[0]]}`
          : `PDF downloaded: ${pdfs.length} selected documents combined`,
      )
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'PDF download failed')
    } finally {
      setDownloadBusy(false)
    }
  }

  const runDownload = async (
    kind: BisPrintDocumentKind,
    format: 'excel' | 'word' | 'pdf',
    onlyThisKind = false,
  ) => {
    if (!row) return
    const label = BIS_PRINT_DOCUMENT_LABEL[kind]
    const base = safeFileBase(label, cmL)
    if (format === 'pdf') {
      void downloadPdfDocuments(kind, onlyThisKind ? [kind] : undefined)
      return
    }
    setDownloadBusy(true)
    try {
      const settings = await loadBisProjectPrintPageSettings(row.id).catch(
        () => DEFAULT_BIS_DOCUMENT_PRINT_PAGE_SETTINGS,
      )
      const kinds = !onlyThisKind && (format === 'word' || format === 'excel') ? selectedDocumentKinds(kind) : [kind]
      const htmlDocuments = await Promise.all(
        kinds.map(async (documentKind) => applyBisDocumentPrintPageSettings(
          await buildBisDocumentHtml(row, documentKind),
          settings,
        )),
      )
      if (format === 'word') {
        const wordHtml = await combineWordHtml(
          kinds.length === 1 ? label : 'Selected BIS Documents',
          htmlDocuments,
          settings,
        )
        const wordBlob = await buildWordDocx(
          wordHtml,
          kinds.length === 1 ? label : 'Selected BIS Documents',
          settings,
        )
        triggerBlobDownload(
          wordBlob,
          kinds.length === 1
            ? `${base}.docx`
            : `${safeFileBase('Selected BIS Documents', cmL)}.docx`,
        )
        toast.success(
          kinds.length === 1
            ? `Word downloaded: ${label}`
            : `Word downloaded: ${kinds.length} selected documents combined`,
        )
        return
      }
      if (format === 'excel') {
        const excel = buildExcelWorkbook(kinds.map((documentKind, index) => ({
          title: kinds.length === 1
            ? label
            : BIS_PRINT_DOCUMENT_LABEL[documentKind],
          html: htmlDocuments[index],
        })))
        triggerBlobDownload(
          excel,
          `${safeFileBase(kinds.length === 1 ? label : 'Selected BIS Documents', cmL)}.xlsx`,
        )
        toast.success(
          kinds.length === 1
            ? `Excel downloaded: ${label}`
            : `Excel downloaded: ${kinds.length} selected documents combined`,
        )
        return
      }
      triggerBlobDownload(
        new Blob([htmlDocuments[0]], { type: 'application/vnd.ms-excel;charset=utf-8' }),
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
          {/* Header */}
          <div className={cn(limsPanelClass, 'shrink-0')}>
            <div className="relative overflow-hidden bg-gradient-to-br from-stone-800 via-stone-900 to-stone-950 px-2 py-2 text-white sm:px-4 sm:py-2.5 md:px-5">
              <div
                className="pointer-events-none absolute inset-0 opacity-[0.18]"
                style={limsDarkBarGlowStyle}
              />
              <div className="absolute bottom-0 left-0 h-[2px] w-full bg-gradient-to-r from-amber-500 via-amber-300 to-transparent" />
              <div className="relative flex min-w-0 flex-col gap-1.5">
                <div className="flex min-w-0 flex-nowrap items-center gap-1.5 sm:gap-2.5">
                  <DialogHeader className="space-y-0 text-left">
                    <DialogTitle className="sr-only">
                      Online Application for Grant of License
                    </DialogTitle>
                  </DialogHeader>
                  <span className="hidden w-[82px] shrink-0 sm:block" aria-hidden />
                  <p
                    className="min-w-0 flex-1 truncate px-1 text-center text-sm font-semibold text-stone-100 sm:text-base md:text-lg"
                    title={subtitle}
                  >
                    {subtitle || '—'}
                  </p>
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
              </div>
            </div>
          </div>

          {/* Stepper — same order as Manak Online */}
          <div className={cn(limsPanelClass, 'shrink-0 bg-[#f7f3eb] px-2 py-1.5 font-jakarta sm:px-4')}>
            <ol className="flex items-center gap-1 overflow-x-auto">
              {stepLabels.map((label, i) => {
                const done = i < step
                const current = i === step
                return (
                  <li key={label} className="relative flex min-w-[2.5rem] flex-1 flex-col items-center">
                    {i > 0 ? (
                      <span
                        aria-hidden
                        className={cn(
                          'absolute left-[-50%] top-1/2 h-0.5 w-full -translate-y-1/2',
                          i <= step ? 'bg-amber-600' : 'bg-stone-300',
                        )}
                      />
                    ) : null}
                    <button
                      type="button"
                      onClick={() => setStep(i)}
                      aria-current={current ? 'step' : undefined}
                      aria-label={`Step ${i + 1}: ${label}`}
                      title={label}
                      className={cn(
                        'relative z-[1] flex h-8 w-8 items-center justify-center rounded-full border-2 text-xs font-bold transition-colors',
                        current
                          ? 'border-amber-700 bg-amber-600 text-white ring-2 ring-amber-400/50'
                          : done
                            ? 'border-amber-700 bg-amber-700 text-white'
                            : 'border-stone-300 bg-white text-stone-600 hover:border-amber-600',
                      )}
                    >
                      {done ? <Check className="h-4 w-4" aria-hidden /> : i + 1}
                    </button>
                  </li>
                )
              })}
            </ol>
          </div>

          {/* Step body */}
          <div className={cn(limsPanelClass, 'flex min-h-0 flex-1 flex-col bg-[#f7f3eb]')}>
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-3 sm:p-4">
              {isPreviewStep ? (
                <div className="space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <h3 className="text-base font-bold text-stone-900">Application Submission - Preview</h3>
                      <p className="text-xs text-stone-600">
                        Review every section, then enter the application on Manak Online (Pay Fee is step 9 there).
                      </p>
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      className="rounded-none bg-amber-700 text-white hover:bg-amber-800"
                      disabled={actionsDisabled || allKinds.length === 0}
                      onClick={() => void downloadPdfDocuments(allKinds[0], allKinds, 'Complete Application')}
                    >
                      <FileDown size={15} className="mr-1.5" aria-hidden />
                      Download complete application (PDF)
                    </Button>
                  </div>
                  {BIS_APPLICATION_STEPS.map((s, si) => {
                    const kinds = stepKinds(si)
                    if (kinds.length === 0) return null
                    return (
                      <section key={s.id} className="border border-stone-400 bg-[#fffcf7]">
                        <header className="flex items-center justify-between bg-stone-800 px-3 py-1.5">
                          <h4 className="text-xs font-bold uppercase tracking-[0.12em] text-amber-200">
                            {si + 1}. {s.title}
                          </h4>
                          <button
                            type="button"
                            className="text-[11px] font-semibold text-amber-200 underline-offset-2 hover:underline"
                            onClick={() => setStep(si)}
                          >
                            Edit step
                          </button>
                        </header>
                        <ul className="divide-y divide-[#e7e0d4]">
                          {kinds.map((kind) => (
                            <li key={kind} className="flex items-center justify-between gap-2 px-3 py-1.5">
                              <span className="flex min-w-0 items-center gap-2 text-sm font-semibold text-[#1c1917]">
                                <FileText className="h-4 w-4 shrink-0 text-amber-800" aria-hidden />
                                <span className="truncate">{BIS_PRINT_DOCUMENT_LABEL[kind]}</span>
                              </span>
                              <span className="inline-flex shrink-0 gap-0.5">
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="ghost"
                                  className={actionBtnClass}
                                  disabled={actionsDisabled}
                                  title={`View — ${BIS_PRINT_DOCUMENT_LABEL[kind]}`}
                                  aria-label={`View ${BIS_PRINT_DOCUMENT_LABEL[kind]}`}
                                  onClick={() => handleView(kind)}
                                >
                                  <Eye size={15} />
                                </Button>
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="ghost"
                                  className={actionBtnClass}
                                  disabled={actionsDisabled}
                                  title={`PDF Download — ${BIS_PRINT_DOCUMENT_LABEL[kind]}`}
                                  aria-label={`PDF Download ${BIS_PRINT_DOCUMENT_LABEL[kind]}`}
                                  onClick={() => void downloadPdfDocuments(kind, [kind])}
                                >
                                  <FileDown size={15} />
                                </Button>
                              </span>
                            </li>
                          ))}
                        </ul>
                      </section>
                    )
                  })}
                </div>
              ) : (
                <>
                <div className="mb-3 text-center font-jakarta">
                  <h3 className="text-xl font-bold text-stone-900">Online Application for Grant of License</h3>
                  <p className="text-right text-xs text-red-600">* Mandatory Fields</p>
                </div>
                <ManakStepPage
                  stepId={currentStep.id}
                  row={row}
                  refreshKey={refreshKey}
                  onEdit={handleModuleEdit}
                  onLocationMapPreview={() => handlePreview('location-map')}
                  onLocationMapPdf={() => void runDownload('location-map', 'pdf')}
                  onProjectSaved={onProjectSaved}
                  onMarkingFee={{
                    edit: () => {
                      handleModuleEdit('all-required-undertakings')
                      setUndertakingFocus('undertaking-mmf')
                    },
                    preview: () => handlePreview('marking-fee-acceptance'),
                    pdf: () => void runDownload('marking-fee-acceptance', 'pdf', true),
                    word: () => void runDownload('marking-fee-acceptance', 'word', true),
                  }}
                  onScopeDocument={{
                    preview: () => void previewScopeUndertaking(),
                    pdf: () => void downloadScopeUndertakingPdf(),
                    word: () => void runDownload('manufacturing-scope', 'word', true),
                  }}
                  documents={
                    <div className="border border-stone-300 bg-[#fffcf7]">
                    {currentKinds.length === 0 ? (
                      <p className="px-3 py-6 text-center text-sm text-stone-500">
                        No documents on this step.
                      </p>
                    ) : (
                      <ul className="divide-y divide-[#e7e0d4]">
                        {currentKinds.map((kind) => {
                          const selected = selectedKinds.has(kind)
                          const label = BIS_PRINT_DOCUMENT_LABEL[kind]
                          return (
                            <li
                              key={kind}
                              className={cn(
                                'flex flex-wrap items-center justify-between gap-2 px-3 py-2',
                                selected ? rowSelectedClass : 'hover:bg-[#f3e9d8]',
                              )}
                            >
                              <div className="flex min-w-0 items-center gap-2.5">
                                <input
                                  type="checkbox"
                                  className={checkboxClass}
                                  aria-label={`Select ${label}`}
                                  checked={selected}
                                  onChange={() => toggleKind(kind)}
                                />
                                <FileText className="h-4 w-4 shrink-0 text-amber-800" aria-hidden />
                                <p className="min-w-0 break-words text-sm font-semibold text-[#1c1917]">
                                  {label}
                                </p>
                              </div>
                              <div className="flex max-w-full justify-end overflow-x-auto">
                                <DocRowActions
                                  kind={kind}
                                  labelOverride={label}
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
                            </li>
                          )
                        })}
                      </ul>
                    )}
                    </div>
                  }
                />
                </>
              )}
            </div>
          </div>

          {/* Footer — Back / Next */}
          <div className={cn(limsPanelClass, 'shrink-0')}>
            <div className="relative overflow-hidden bg-gradient-to-br from-stone-800 via-stone-900 to-stone-950 px-3 py-2 text-white sm:px-4">
              <div
                className="pointer-events-none absolute inset-0 opacity-[0.18]"
                style={limsDarkBarGlowStyle}
              />
              <div className="absolute top-0 left-0 h-[2px] w-full bg-gradient-to-r from-amber-500 via-amber-300 to-transparent" />
              <div className="relative flex min-w-0 flex-wrap items-center justify-between gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className={cn(limsDarkBarBtnClass, 'h-8 gap-1 px-3')}
                  onClick={() => setStep((s) => Math.max(0, s - 1))}
                  disabled={step === 0}
                >
                  <ChevronLeft size={16} aria-hidden /> Back
                </Button>
                <span className="text-xs font-medium text-stone-200">
                  Step {step + 1} of {stepLabels.length}
                  {selectedKinds.size > 0 ? ` · ${selectedKinds.size} selected (PDF / Word / Excel bundle selection)` : ''}
                  {downloadBusy || busy ? (
                    <span className="ml-2 text-amber-200">
                      {downloadBusy ? 'Preparing download…' : 'Preparing document…'}
                    </span>
                  ) : null}
                </span>
                {isPreviewStep ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className={cn(limsDarkBarBtnClass, 'h-8 gap-1 px-3')}
                    onClick={() => onOpenChange(false)}
                  >
                    Done
                  </Button>
                ) : (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className={cn(limsDarkBarBtnClass, 'h-8 gap-1 px-3')}
                    onClick={() => setStep((s) => Math.min(stepLabels.length - 1, s + 1))}
                  >
                    Next <ChevronRight size={16} aria-hidden />
                  </Button>
                )}
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>

    <LegalDocumentsModuleDialog
      open={activeModuleKind != null && row != null}
      onOpenChange={(next) => {
        if (!next) {
          onModuleKindChange?.(null)
          setRefreshKey((k) => k + 1)
        }
      }}
      row={row}
      title={
        undertakingFocus === 'undertaking-mmf' && activeModuleKind === 'all-required-undertakings'
          ? 'Undertaking for Minimum Marking Fee (All India First)'
          : activeModuleTitle
      }
      docKind={activeDocKind}
      printKind={activeModuleKind}
      onProjectSaved={() => {
        setRefreshKey((k) => k + 1)
        onProjectSaved?.()
      }}
      onLocationMapPreview={() => handlePreview('location-map')}
      onLocationMapWord={() => void runDownload('location-map', 'word')}
      onLocationMapPdf={() => void runDownload('location-map', 'pdf')}
      onLocationMapPrint={() => handlePrint('location-map')}
      initialUndertaking={undertakingFocus}
      onPreviewDocument={(kind) => handlePreview(kind)}
      onPdfDocument={(kind) => void runDownload(kind, 'pdf', true)}
      onWordDocument={(kind) => void runDownload(kind, 'word', true)}
    />

    <BisDocumentPrintPreviewDialog
      open={previewKind != null}
      onOpenChange={(next) => {
        if (!next) {
          setPreviewKind(null)
          setPreviewGeneratedHtml(null)
        }
      }}
      row={row}
      kind={previewKind}
      generatedHtml={previewGeneratedHtml}
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
