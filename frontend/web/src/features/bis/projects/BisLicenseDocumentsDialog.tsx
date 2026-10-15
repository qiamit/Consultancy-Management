import { useEffect, useMemo, useState } from 'react'
import { PDFDocument } from 'pdf-lib'
import * as XLSX from 'xlsx'
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
import {
  mapPageSizeToPlaywrightFormat,
  renderPdfViaPlaywright,
  triggerPdfDownload,
} from '@/lib/playwrightPdfClient'
import {
  applyBisDocumentPrintPageSettings,
  bisPrintPageSizeMm,
  DEFAULT_BIS_DOCUMENT_PRINT_PAGE_SETTINGS,
} from '../print/bisDocumentPrintPageSettings'
import {
  limsDarkBarBtnClass,
  limsDarkBarFieldClass,
  limsDarkBarGlowStyle,
  limsDarkBarSearchClass,
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
import { buildApplicationDetailsPackPdf } from './buildApplicationDetailsPackPdf'
import { loadBisProjectPrintPageSettings } from './bisPrintPageSettingsApi'
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

const thBase =
  'bg-stone-800 text-center text-[11px] font-bold uppercase tracking-[0.14em] text-amber-200'

const checkboxClass =
  'h-4 w-4 rounded-none border-stone-500 text-amber-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/30'

const rowEvenClass = 'bg-[#f7f3eb] hover:bg-[#f3e9d8]'
const rowOddClass = 'bg-[#fffcf7] hover:bg-[#f3e9d8]'
const rowSelectedClass = 'bg-[#fde68a]/80 hover:bg-[#fde68a]/80'

const actionBtnClass =
  'h-8 w-8 rounded-none border border-stone-400 bg-white/70 p-0 text-amber-800 shadow-sm hover:border-amber-600 hover:bg-amber-50 hover:text-amber-950 focus-visible:ring-2 focus-visible:ring-amber-500/40'

/** ~10″ / desktop: row table. Below that: cards. */
const TABLE_MQ_SHOW = 'hidden xl:block'
const CARDS_MQ_SHOW = 'xl:hidden'

const PAGE_SIZE_OPTIONS = [10, 20, 25, 50] as const

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

async function svgToWordImage(svg: SVGElement): Promise<HTMLImageElement | null> {
  try {
    const source = new XMLSerializer().serializeToString(svg)
    const image = new Image()
    image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(source)}`
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve()
      image.onerror = () => reject(new Error('Could not render map image'))
    })
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, image.naturalWidth || Number(svg.getAttribute('width')) || 1200)
    canvas.height = Math.max(1, image.naturalHeight || Number(svg.getAttribute('height')) || 800)
    canvas.getContext('2d')?.drawImage(image, 0, 0, canvas.width, canvas.height)
    const png = document.createElement('img')
    png.src = canvas.toDataURL('image/png')
    png.alt = 'Location map'
    png.style.width = '100%'
    png.style.height = 'auto'
    png.style.display = 'block'
    return png
  } catch {
    return null
  }
}

async function combineWordHtml(
  title: string,
  documents: string[],
  settings: typeof DEFAULT_BIS_DOCUMENT_PRINT_PAGE_SETTINGS,
): Promise<string> {
  const pages = documents.map((html) => ({
    body: html.match(/<body[^>]*>([\s\S]*?)<\/body>/i)?.[1] ?? html,
    style: Array.from(html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi))
      .map((match) => match[1])
      .join('\n'),
  }))
  const safeTitle = title.replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[character] ?? character)
  const document = new DOMParser().parseFromString(
    `<body>${pages.map((page) => `<section class="bis-word-document">${page.body}</section>`).join('')}</body>`,
    'text/html',
  )
  for (const svg of Array.from(document.querySelectorAll('svg'))) {
    const replacement = await svgToWordImage(svg)
    if (replacement) svg.replaceWith(replacement)
  }
  const pageBreak = () => {
    const element = document.createElement('div')
    element.className = 'page-break'
    element.style.pageBreakAfter = 'always'
    return element
  }
  document.querySelectorAll('.bis-word-document').forEach((section, index) => {
    if (index > 0) section.before(pageBreak())
    const sheets = Array.from(section.querySelectorAll('.pd-sheet, .al-sheet, .f1-sheet'))
    sheets.forEach((sheet, sheetIndex) => {
      if (sheetIndex > 0 || sheet.previousElementSibling?.classList.contains('f1-continuous')) {
        sheet.before(pageBreak())
      }
      const shell = document.createElement('table')
      shell.className = 'word-page-shell'
      shell.setAttribute('role', 'presentation')
      const row = document.createElement('tr')
      const cell = document.createElement('td')
      const pagePadding = Math.min(10, Math.max(0, settings.pageBorderPaddingMm))
      cell.style.padding = `${pagePadding}mm`
      cell.style.verticalAlign = 'top'
      if (settings.showPageBorder) {
        const borderColor = settings.pageBorderColor === 'amber'
          ? '#b45309'
          : settings.pageBorderColor === 'stone'
            ? '#57534e'
            : '#111111'
        const borderStyle = settings.pageBorderStyle === 'solid' ? 'solid' : 'double'
        cell.style.border = `${settings.pageBorderThicknessPt}pt ${borderStyle} ${borderColor}`
      }
      while (sheet.firstChild) cell.appendChild(sheet.firstChild)
      row.appendChild(cell)
      const body = document.createElement('tbody')
      body.appendChild(row)
      shell.appendChild(body)
      sheet.replaceWith(shell)
    })
  })
  const size = bisPrintPageSizeMm(settings)
  const wordLayoutCss = `
    @page { size: ${size.widthMm}mm ${size.heightMm}mm; margin: ${settings.marginTopMm}mm ${settings.marginRightMm}mm ${settings.marginBottomMm}mm ${settings.marginLeftMm}mm; }
    html, body { margin: 0 !important; padding: 0 !important; background: #fff !important; color: #000 !important; font-family: Arial, sans-serif !important; display: block !important; width: auto !important; min-width: 0 !important; transform: none !important; }
    .bis-word-document { display: block !important; }
    .page-break { display: block; page-break-after: always; mso-break-type: page; }
    .word-page-shell { width: 100% !important; border-collapse: collapse !important; table-layout: fixed !important; page-break-inside: avoid !important; }
    .word-page-shell td { vertical-align: top !important; }
    .f1-continuous { display: block !important; width: 100% !important; max-width: 100% !important; height: auto !important; min-height: 0 !important; max-height: none !important; margin: 0 !important; padding: 0 !important; overflow: visible !important; }
    .pd-firm, .al-firm { font-family: 'Times New Roman', serif; font-weight: bold; }
    .pd-firm-addr, .al-firm-addr { text-align: inherit; }
    .pd-firm-contact span { display: inline-block; margin: 0 5px; }
    .pd-to-row { display: table; width: 100%; table-layout: fixed; margin-bottom: 12px; }
    .pd-to-block, .pd-date-block { display: table-cell; vertical-align: top; width: 50%; }
    .pd-date-block { text-align: right; }
    table { border-collapse: collapse; max-width: 100%; }
    tr, img, .pd-meta, .pd-table, .loc-map-wrap { page-break-inside: avoid; }
    .loc-map-wrap img { width: 100% !important; height: auto !important; }
    img { max-width: 100%; }
  `
  const styleText = `${pages.map((page) => page.style).join('\n')}\n${wordLayoutCss}`
  return `<!doctype html><html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" lang="en"><head><meta charset="utf-8"/><meta http-equiv="Content-Type" content="text/html; charset=utf-8"/><meta name="ProgId" content="Word.Document"/><title>${safeTitle}</title><style>${styleText}</style><!--[if gte mso 9]><xml><w:WordDocument><w:View>Print</w:View><w:DoNotOptimizeForBrowser/></w:WordDocument></xml><![endif]--></head>${document.body.outerHTML}</html>`
}

function millimetresToTwips(value: number): number {
  return Math.round((value / 25.4) * 1440)
}

async function inlineWordCompatibleStyles(
  html: string,
  pageWidthMm: number,
  pageHeightMm: number,
): Promise<string> {
  const frame = document.createElement('iframe')
  frame.setAttribute('aria-hidden', 'true')
  frame.setAttribute('sandbox', 'allow-same-origin')
  frame.style.cssText = `position:fixed;left:-10000px;top:0;width:${pageWidthMm}mm;height:${pageHeightMm}mm;border:0;visibility:hidden;pointer-events:none`
  const loaded = new Promise<void>((resolve, reject) => {
    frame.onload = () => resolve()
    frame.onerror = () => reject(new Error('Could not prepare Word document layout'))
  })
  frame.srcdoc = html
  document.body.appendChild(frame)
  try {
    await loaded
    const frameDocument = frame.contentDocument
    const frameWindow = frame.contentWindow
    if (!frameDocument || !frameWindow) throw new Error('Could not prepare Word document layout')
    const styleProperties = [
      'background-color', 'border-bottom-color', 'border-bottom-style', 'border-bottom-width',
      'border-collapse', 'border-left-color', 'border-left-style', 'border-left-width',
      'border-right-color', 'border-right-style', 'border-right-width', 'border-top-color',
      'border-top-style', 'border-top-width', 'color', 'font-family', 'font-size',
      'font-style', 'font-weight', 'line-height', 'margin-bottom', 'margin-left',
      'margin-right', 'margin-top', 'padding-bottom', 'padding-left', 'padding-right',
      'padding-top', 'text-align', 'text-decoration', 'vertical-align', 'white-space',
    ]
    for (const element of Array.from(frameDocument.body.querySelectorAll<HTMLElement>('*'))) {
      const computed = frameWindow.getComputedStyle(element)
      for (const property of styleProperties) {
        const value = computed.getPropertyValue(property)
        if (value && value !== 'normal' && value !== 'auto' && value !== 'rgba(0, 0, 0, 0)') {
          element.style.setProperty(property, value)
        }
      }
      if (element.tagName === 'TABLE' || element.tagName === 'TD' || element.tagName === 'TH') {
        const width = computed.getPropertyValue('width')
        if (width && width !== 'auto') element.style.width = width
      }
      if (element.tagName === 'IMG') {
        const width = computed.getPropertyValue('width')
        if (width && width !== 'auto') element.style.width = width
        element.style.maxWidth = '100%'
        element.style.height = 'auto'
      }
    }
    for (const pageNumber of Array.from(frameDocument.querySelectorAll<HTMLElement>('.pd-page-num'))) {
      pageNumber.style.position = 'static'
      pageNumber.style.textAlign = 'right'
      pageNumber.style.marginTop = '8pt'
    }
    return frameDocument.documentElement.outerHTML
  } finally {
    frame.remove()
  }
}

async function buildWordDocx(html: string, title: string, settings: typeof DEFAULT_BIS_DOCUMENT_PRINT_PAGE_SETTINGS): Promise<Blob> {
  // The browser build of html-to-docx still reads the Node-style `global` name.
  // Define that alias before loading its lazy chunk so the ESM bundle can run in browsers.
  const browserGlobal = globalThis as typeof globalThis & { global?: typeof globalThis }
  browserGlobal.global ??= globalThis
  const { default: HTMLtoDOCX } = await import('@turbodocx/html-to-docx')
  const size = bisPrintPageSizeMm(settings)
  const wordReadyHtml = await inlineWordCompatibleStyles(html, size.widthMm, size.heightMm)
  const wordDocument = await HTMLtoDOCX(wordReadyHtml, null, {
    orientation: settings.orientation,
    pageSize: {
      width: millimetresToTwips(size.widthMm),
      height: millimetresToTwips(size.heightMm),
    },
    margins: {
      top: millimetresToTwips(settings.marginTopMm),
      right: millimetresToTwips(settings.marginRightMm),
      bottom: millimetresToTwips(settings.marginBottomMm),
      left: millimetresToTwips(settings.marginLeftMm),
    },
    title,
    creator: 'Quality Engineering',
    font: 'Arial',
    table: {
      row: { cantSplit: true },
      borderOptions: { size: 1, color: '000000' },
    },
    imageProcessing: { svgHandling: 'native', suppressSharpWarning: true },
  })
  const bytes = wordDocument instanceof Blob
    ? await wordDocument.arrayBuffer()
    : wordDocument instanceof ArrayBuffer
      ? wordDocument
      : Uint8Array.from(wordDocument).buffer
  return new Blob([bytes], {
    type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  })
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
  const subtitle = [client, isLabel, cmL].filter((part) => Boolean(part) && part !== '—').join(' · ')

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
    const kinds = ALL_BIS_PRINT_KINDS.filter(
      (kind) => kind !== 'legal-documents' && kind !== 'location-map' && kind !== 'updated-sit',
    )
    if (!q) return kinds
    return kinds.filter((kind) =>
      BIS_PRINT_DOCUMENT_LABEL[kind]
        .toLowerCase()
        .includes(q),
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

  const downloadPdfDocuments = async (clickedKind: BisPrintDocumentKind) => {
    if (!row) return
    const kinds = selectedDocumentKinds(clickedKind)
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
        : `${safeFileBase('Selected BIS Documents', cmL)}.pdf`
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
  ) => {
    if (!row) return
    const label = BIS_PRINT_DOCUMENT_LABEL[kind]
    const base = safeFileBase(label, cmL)
    if (format === 'pdf') {
      void downloadPdfDocuments(kind)
      return
    }
    setDownloadBusy(true)
    try {
      const settings = await loadBisProjectPrintPageSettings(row.id).catch(
        () => DEFAULT_BIS_DOCUMENT_PRINT_PAGE_SETTINGS,
      )
      const kinds = format === 'word' || format === 'excel' ? selectedDocumentKinds(kind) : [kind]
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

          {/* Footer */}
          <div className={cn(limsPanelClass, 'shrink-0')}>
            <div className="relative overflow-hidden bg-gradient-to-br from-stone-800 via-stone-900 to-stone-950 px-3 py-2 text-white sm:px-4">
              <div
                className="pointer-events-none absolute inset-0 opacity-[0.18]"
                style={limsDarkBarGlowStyle}
              />
              <div className="absolute top-0 left-0 h-[2px] w-full bg-gradient-to-r from-amber-500 via-amber-300 to-transparent" />
              <div className="relative flex min-w-0 flex-wrap items-center justify-between gap-x-4 gap-y-2">
                <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
                  <span className="whitespace-nowrap text-xs font-medium text-stone-200">
                    {filteredKinds.length.toLocaleString('en-IN')} documents
                    {selectedKinds.size > 0
                      ? ` · ${selectedKinds.size} selected (PDF / Word action bundles selection)`
                      : ''}
                  </span>
                  {downloadBusy || busy ? (
                    <span className="text-xs text-amber-200">
                      {downloadBusy ? 'Preparing download…' : 'Preparing document…'}
                    </span>
                  ) : null}
                </div>

                {pageCount > 1 ? (
                  <div className="ml-auto flex flex-wrap items-center justify-end gap-1.5">
                    <span className="mr-1 whitespace-nowrap text-xs font-medium text-stone-300">
                      Page {safePage} of {pageCount}
                    </span>
                    <Input
                      aria-label="Jump to page"
                      placeholder="Page"
                      value={jumpTo}
                      onChange={(e) => setJumpTo(e.target.value.replace(/[^0-9]/g, ''))}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleJumpToGo()
                      }}
                      className={cn(limsDarkBarFieldClass, 'h-8 w-14 text-xs')}
                      inputMode="numeric"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className={cn(limsDarkBarBtnClass, 'h-8 px-2.5 text-xs')}
                      onClick={handleJumpToGo}
                    >
                      Go
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      aria-label="Previous page"
                      className={cn(limsDarkBarBtnClass, 'h-8 w-8')}
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      disabled={safePage <= 1}
                    >
                      <ChevronLeft size={16} />
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      aria-label="Next page"
                      className={cn(limsDarkBarBtnClass, 'h-8 w-8')}
                      onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
                      disabled={safePage >= pageCount}
                    >
                      <ChevronRight size={16} />
                    </Button>
                  </div>
                ) : null}
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
      onLocationMapPreview={() => handlePreview('location-map')}
      onLocationMapWord={() => void runDownload('location-map', 'word')}
      onLocationMapPdf={() => void runDownload('location-map', 'pdf')}
      onLocationMapPrint={() => handlePrint('location-map')}
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
