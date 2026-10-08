import { useEffect, useMemo, useRef, useState, type ChangeEvent, type ReactNode } from 'react'
import {
  Calendar,
  Copy,
  Download,
  ExternalLink,
  Eye,
  FileDown,
  FileText,
  FolderInput,
  Globe,
  Package,
  Pencil,
  Plus,
  ScrollText,
  Sparkles,
  Trash2,
  Upload,
} from 'lucide-react'
import QRCode from 'qrcode'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Textarea } from '@/components/ui/textarea'
import { LimsFieldWithAdd } from '@/components/lims/LimsFieldWithAdd'
import {
  limsDarkBarGlowStyle,
  limsDialogClass,
  limsFieldAddBtnClass,
  limsFieldClass,
  limsOutlineBtnClass,
  limsPrimaryBtnClass,
} from '@/lib/limsThemeUi'
import { cn } from '@/lib/utils'
import { downloadPdfViaPlaywright } from '@/lib/playwrightPdfClient'
import { RemoteLookupCombobox } from '@/features/bis/shared/RemoteLookupCombobox'
import { fetchBisProjectById, fetchTestingLaboratoryAddressByName, searchTestingLaboratoryClientOptions } from './bisProjectsApi'
import { fetchBisModulePayload, resolveTechnicalStaffForTestedBy, saveBisModulePayload } from './bisModuleDataApi'
import { loadBisProjectPrintPageSettings } from './bisPrintPageSettingsApi'
import { FactoryTestReportModuleFields, type FactoryTestReportPreviewContext } from './FactoryTestReportModuleFields'
import {
  applySampleToFactoryTestReport,
  emptyFactoryTestReportEntry,
  emptyFactoryTestReportPayload,
  parseFactoryTestReportPayload,
  type FactoryTestReportModulePayload,
} from './factoryTestReportModel'
import {
  buildOslCourierSlipHtml,
  buildOslCourierSlipsHtml,
  normalizeCourierSlipPerPage,
  oslCourierSlipDataForSample,
  type OslCourierSlipData,
  type OslCourierSlipPerPage,
} from '../print/oslCourierSlipHtml'
import {
  buildFactoryTestReportHtml,
  factoryTestReportDataFromPrintData,
} from '../print/factoryTestReportHtml'
import { applyBisDocumentPrintPageSettings } from '../print/bisDocumentPrintPageSettings'
import { loadBisPrintData, printSignatoryDefaults } from '../print/loadBisPrintData'
import { openPendingPrintWindow, openPrintHtml } from '../print/openPrintHtml'
import {
  buildManakTrPayload,
  importManakQrCodes,
  openManakTestRequestFill,
  pollManakPdfInbox,
  registerManakPdfInbox,
  subscribeManakQrImport,
  subscribeManakTestRequestResult,
  type ManakTrResult,
} from './manakExtensionBridge'
import { createBisProjectFileUrls, deleteBisProjectFile, uploadBisProjectFile } from './bisProjectFilesApi'
import { downloadMergedOslTestRequestPdfs } from './mergeOslTestRequestPdfs'
import {
  collectForeignOslQrCodes,
  claimImportedOslQrCodes,
  listOslQrSourceProjects,
  persistScrubbedOslQrPool,
  scrubForeignImportedQrCodes,
  transferUnusedOslQrFromProject,
  type OslQrSourceProject,
} from './oslQrImportApi'
import {
  availableImportedQrCodes,
  emptyOslSampleRequirementRow,
  normalizeImportedQrCodes,
  oslSampleRowHasContent,
  oslSampleRowStatusTone,
  sampleForLabel,
  type OslSampleFor,
  type OslSamplePriority,
  type OslSampleRequirementRow,
  type OslSampleRequirementsModulePayload,
} from './oslSampleRequirementsModel'
import { formatDisplayDate } from './types'

const thClass =
  'bg-stone-800 text-center text-[10px] font-bold uppercase tracking-[0.12em] text-amber-200'
const actionBtnClass =
  'inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-none p-0 text-amber-900 hover:bg-amber-100 hover:text-amber-950'
const checkboxClass =
  'h-4 w-4 rounded-none border-stone-500 text-amber-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/30'
const rowSelectedClass = 'bg-[#fde68a]/80 hover:bg-[#fde68a]/80'
/** No Sample Code yet. */
const rowBlankClass = 'bg-sky-50/90 hover:bg-sky-100/90'
/** Sample Code present, Manak Test Request PDF missing. */
const rowWaitingTrClass = 'bg-red-100/90 hover:bg-red-200/80'
/** Sample Code + Test Request both attached. */
const rowCompleteClass = 'bg-emerald-100/90 hover:bg-emerald-200/80'
/** Desktop table; below xl — cards (OSL has many columns; dialog often < 1280). */
const TABLE_MQ_SHOW = 'hidden xl:block'
const CARDS_MQ_SHOW = 'xl:hidden'
const cardFieldLabelClass =
  'mb-0.5 text-[10px] font-bold uppercase tracking-[0.1em] text-stone-500'

const fileMenuContentClass =
  'z-[80] min-w-[12.5rem] overflow-hidden rounded-none border-2 border-stone-600 bg-[#fffcf7] p-1 shadow-xl ring-1 ring-amber-700/25'
const fileMenuLabelClass =
  'px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-amber-900/80'
const fileMenuItemClass =
  'cursor-pointer gap-2.5 rounded-none px-2 py-2 text-[13px] font-semibold text-stone-800 focus:bg-amber-100 focus:text-amber-950 data-[disabled]:opacity-40'
const fileMenuIconWrapClass =
  'inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-none border border-stone-400 bg-white text-amber-900'

function openDatePicker(el: HTMLInputElement | null) {
  if (!el || el.disabled) return
  try {
    if (typeof el.showPicker === 'function') {
      el.showPicker()
      return
    }
  } catch {
    // fall through
  }
  el.focus()
  el.click()
}

const dateInputClass = cn(
  limsFieldClass,
  'min-w-0 border-0 bg-transparent pr-2 shadow-none tabular-nums focus-visible:ring-0',
  '[&::-webkit-calendar-picker-indicator]:pointer-events-none',
  '[&::-webkit-calendar-picker-indicator]:opacity-0',
)

function Field({
  label,
  htmlFor,
  children,
  className,
}: {
  label: string
  htmlFor?: string
  children: ReactNode
  className?: string
}) {
  return (
    <div className={cn('min-w-0 space-y-1.5', className)}>
      <Label
        htmlFor={htmlFor}
        className="text-[11px] font-semibold uppercase tracking-[0.08em] text-stone-600"
      >
        {label}
      </Label>
      {children}
    </div>
  )
}

function FormSection({
  title,
  children,
}: {
  title: string
  children: ReactNode
}) {
  return (
    <section className="space-y-3 rounded-none border border-stone-300 bg-[#fffcf7] p-3 sm:p-3.5">
      <p className="border-b border-stone-300 pb-1.5 text-[11px] font-bold uppercase tracking-[0.14em] text-amber-900/80">
        {title}
      </p>
      {children}
    </section>
  )
}

export function OslSampleRequirementsModuleFields({
  value,
  onChange,
  disabled = false,
  projectId = null,
  clientId = null,
  isCodeId = null,
  isCodeLabel = '',
  isCodeSearch = null,
  isCodeRevisionYear = null,
  portalUserId = null,
  hasPortalPassword = false,
}: {
  value: OslSampleRequirementsModulePayload
  onChange: (next: OslSampleRequirementsModulePayload) => void
  disabled?: boolean
  /** Current BIS project — used when transferring QR from sibling applications. */
  projectId?: string | null
  clientId?: string | null
  /** IS code master id — used when generating Factory Test Reports. */
  isCodeId?: string | null
  /** Display label for IS code (e.g. IS 17636: 2022). */
  isCodeLabel?: string
  /** IS number only for Manak search (no revision year), e.g. `IS 10748` or `10748`. */
  isCodeSearch?: string | null
  /** Optional revision year — helps pick the matching IS from Manak results. */
  isCodeRevisionYear?: string | null
  portalUserId?: string | null
  hasPortalPassword?: boolean
  onPrintTestRequest?: (row: OslSampleRequirementRow) => void
  onPrintTestReport?: (row: OslSampleRequirementRow) => void
  /** @deprecated Courier Slip now opens a read-only A4 preview (print + PDF download). */
  onPrintCourierSlip?: (row: OslSampleRequirementRow) => void
}) {
  const rows = value.rows
  const [editIndex, setEditIndex] = useState<number | null>(null)
  const [draft, setDraft] = useState<OslSampleRequirementRow | null>(null)
  const [labClientId, setLabClientId] = useState('')
  const manufacturingDateRef = useRef<HTMLInputElement | null>(null)
  const paymentDateRef = useRef<HTMLInputElement | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set())
  const [addChooserOpen, setAddChooserOpen] = useState(false)
  const [chooserPurpose, setChooserPurpose] = useState<'add' | 'copy'>('add')
  const [addAfterIndex, setAddAfterIndex] = useState(0)
  const [addMode, setAddMode] = useState<'without-qr' | 'with-qr'>('without-qr')
  const [selectedQr, setSelectedQr] = useState('')
  const [importBusy, setImportBusy] = useState(false)
  const [importDialogOpen, setImportDialogOpen] = useState(false)
  const [importStep, setImportStep] = useState<'choose' | 'from-app'>('choose')
  const [qrSources, setQrSources] = useState<OslQrSourceProject[]>([])
  const [qrSourcesLoading, setQrSourcesLoading] = useState(false)
  const [selectedSourceId, setSelectedSourceId] = useState('')
  const [transferBusy, setTransferBusy] = useState(false)
  const [courierFormOpen, setCourierFormOpen] = useState(false)
  const [courierDraft, setCourierDraft] = useState<OslSampleRequirementRow | null>(null)
  const [courierIncludeBlv, setCourierIncludeBlv] = useState(true)
  const [courierIncludeMobile, setCourierIncludeMobile] = useState(true)
  const [courierPerPage, setCourierPerPage] = useState<OslCourierSlipPerPage>(1)
  const [courierBusy, setCourierBusy] = useState(false)
  const [courierQrDataUrl, setCourierQrDataUrl] = useState('')
  const [courierFrom, setCourierFrom] = useState<{
    name: string
    address: string
    isNumber: string
    applicationNo: string
  }>({ name: '', address: '', isNumber: '', applicationNo: '' })
  const [testReportGenerateOpen, setTestReportGenerateOpen] = useState(false)
  const [testReportGenerateBusy, setTestReportGenerateBusy] = useState(false)
  const [testReportGenerateLoading, setTestReportGenerateLoading] = useState(false)
  const [testReportGeneratePayload, setTestReportGeneratePayload] =
    useState<FactoryTestReportModulePayload>(() => emptyFactoryTestReportPayload())
  const [testReportGenerateSampleId, setTestReportGenerateSampleId] = useState<string | null>(null)
  const [testReportPreviewContext, setTestReportPreviewContext] =
    useState<FactoryTestReportPreviewContext | null>(null)
  const [testReportQcSignatureUrl, setTestReportQcSignatureUrl] = useState('')
  const [extensionBusyId, setExtensionBusyId] = useState<string | null>(null)
  const [mergeBusy, setMergeBusy] = useState(false)
  const pendingManakTokensRef = useRef<Map<string, string>>(new Map())
  const courierSlipInputRef = useRef<HTMLInputElement | null>(null)
  const courierSlipRowIdRef = useRef<string | null>(null)
  const testRequestInputRef = useRef<HTMLInputElement | null>(null)
  const testRequestRowIdRef = useRef<string | null>(null)
  const testReportInputRef = useRef<HTMLInputElement | null>(null)
  const testReportRowIdRef = useRef<string | null>(null)

  const allChecked = rows.length > 0 && rows.every((r) => selectedIds.has(r.id))
  const someChecked = rows.some((r) => selectedIds.has(r.id))

  const selectedCount = useMemo(() => selectedIds.size, [selectedIds])
  const availableQrCodes = useMemo(() => availableImportedQrCodes(value), [value])
  const valueRef = useRef(value)
  const onChangeRef = useRef(onChange)
  valueRef.current = value
  onChangeRef.current = onChange

  const attachManakPdfToSample = async (result: ManakTrResult) => {
    const pid = (projectId ?? '').trim()
    if (!pid) {
      toast.error('Save the BIS project first, then run Extension again.')
      return
    }
    const current = valueRef.current
    const byId = result.sampleId
      ? current.rows.findIndex((r) => r.id === result.sampleId)
      : -1
    const byCode = result.sample_code
      ? current.rows.findIndex(
          (r) => r.sampleCode.trim().toLowerCase() === result.sample_code.trim().toLowerCase(),
        )
      : -1
    const index = byId >= 0 ? byId : byCode
    if (index < 0) {
      toast.error('Could not match Manak PDF to a sample row.')
      return
    }
    const row = current.rows[index]!
    const binary = Uint8Array.from(atob(result.pdfBase64), (c) => c.charCodeAt(0))
    const pdfName =
      result.pdfName.replace(/[^\w.\-]+/g, '_') ||
      `Test_Request_${result.sample_code || row.id}.pdf`
    const file = new File([binary], pdfName, { type: 'application/pdf' })
    const uploaded = await uploadBisProjectFile(pid, file, 'osl-sample-test-request', {
      displayName: pdfName,
    })
    const nextRows = current.rows.map((r, i) =>
      i === index
        ? {
            ...r,
            sampleCode: result.sample_code.trim() || r.sampleCode,
            testRequestFileId: uploaded.id,
            testRequestFileName: uploaded.file_name,
            testRequestStoragePath: uploaded.storage_path,
          }
        : r,
    )
    onChangeRef.current({ ...current, rows: nextRows })
    pendingManakTokensRef.current.delete(row.id)
    setExtensionBusyId((prev) => (prev === row.id ? null : prev))
    toast.success(`Test Request PDF attached${result.sample_code ? ` (${result.sample_code})` : ''}`)
  }

  useEffect(() => {
    return subscribeManakQrImport((codes) => {
      const current = valueRef.current
      const before = current.importedQrCodes ?? []
      const merged = normalizeImportedQrCodes([...before, ...codes])
      // Only update when something new was added (extension may re-broadcast).
      if (merged.length === before.length) return
      const pid = (projectId ?? '').trim()
      const added = merged.filter(
        (c) => !before.some((b) => b.replace(/\D/g, '') === c.replace(/\D/g, '')),
      )
      // Optimistic UI first, then claim ownership (strip ghost unused pools elsewhere).
      onChangeRef.current({ ...current, importedQrCodes: merged })
      if (!pid || added.length === 0) {
        toast.success(`Imported ${merged.length - before.length} QR code(s) from Manak.`)
        return
      }
      void claimImportedOslQrCodes({
        projectId: pid,
        codes: added,
        currentPayload: { ...current, importedQrCodes: merged },
      })
        .then((next) => {
          onChangeRef.current(next)
          toast.success(`Imported ${added.length} QR code(s) from Manak.`)
        })
        .catch(() => {
          toast.success(`Imported ${added.length} QR code(s) from Manak.`)
        })
    })
  }, [projectId])

  useEffect(() => {
    return subscribeManakTestRequestResult((result) => {
      void attachManakPdfToSample(result).catch((err) => {
        toast.error(err instanceof Error ? err.message : 'Failed to attach Test Request PDF.')
        setExtensionBusyId(null)
      })
    })
  }, [projectId])

  // Keep unused QR picker firm-scoped: drop codes that are already used on another firm's sample.
  // Persist immediately so "Import from Application" on sibling licenses matches this UI.
  useEffect(() => {
    const cid = (clientId ?? '').trim()
    const pid = (projectId ?? '').trim()
    if (!cid || !pid) return
    let cancelled = false
    void persistScrubbedOslQrPool({
      projectId: pid,
      clientId: cid,
      payload: valueRef.current,
      getLatest: () => valueRef.current,
    })
      .then((next) => {
        if (cancelled) return
        const current = valueRef.current
        if (next === current) return
        // Only apply if scrub actually removed foreign-used codes from the latest pool.
        const beforeLen = current.importedQrCodes?.length ?? 0
        const afterLen = next.importedQrCodes?.length ?? 0
        if (afterLen >= beforeLen) return
        onChangeRef.current(next)
        toast.message(
          `Removed ${beforeLen - afterLen} QR code(s) already used on another firm’s sample.`,
        )
      })
      .catch(() => {
        /* fallback: local-only scrub if persist fails */
        void collectForeignOslQrCodes(cid)
          .then((foreign) => {
            if (cancelled || foreign.size === 0) return
            const current = valueRef.current
            const next = scrubForeignImportedQrCodes(current, foreign)
            if (next === current) return
            onChangeRef.current(next)
          })
          .catch(() => {})
      })
    return () => {
      cancelled = true
    }
  }, [clientId, projectId])

  useEffect(() => {
    if (!addChooserOpen || addMode !== 'with-qr') return
    if (!selectedQr || !availableQrCodes.includes(selectedQr)) {
      setSelectedQr(availableQrCodes[0] ?? '')
    }
  }, [addChooserOpen, addMode, availableQrCodes, selectedQr])

  const setRows = (next: OslSampleRequirementRow[]) => {
    onChange({ ...value, rows: next })
  }

  const openEdit = (index: number) => {
    const row = rows[index]!
    const laboratoryName = row.laboratoryName.trim()
    const destinationLab = row.destinationLab.trim() || laboratoryName
    setEditIndex(index)
    setLabClientId('')
    setDraft({
      ...row,
      laboratoryName,
      destinationLab,
      serialNumber: row.serialNumber.trim() || String(index + 1),
    })
  }

  const openAddChooser = (index?: number) => {
    setChooserPurpose('add')
    setAddAfterIndex(index ?? Math.max(-1, rows.length - 1))
    setAddMode('without-qr')
    setSelectedQr(availableQrCodes[0] ?? '')
    setAddChooserOpen(true)
  }

  const openCopyChooser = () => {
    if (selectedIds.size !== 1) {
      toast.error('Select exactly one sample row to copy.')
      return
    }
    const id = [...selectedIds][0]
    const sourceIndex = rows.findIndex((r) => r.id === id)
    if (sourceIndex < 0) {
      toast.error('Selected sample not found.')
      return
    }
    setChooserPurpose('copy')
    setAddAfterIndex(sourceIndex)
    setAddMode('without-qr')
    setSelectedQr(availableQrCodes[0] ?? '')
    setAddChooserOpen(true)
  }

  const pasteRowFromAbove = (qrCode = '') => {
    const source =
      (addAfterIndex >= 0 ? rows[addAfterIndex] : null) ??
      rows[rows.length - 1] ??
      emptyOslSampleRequirementRow()
    const nextSerial = String(rows.length + 1)
    const next: OslSampleRequirementRow = {
      ...source,
      id: emptyOslSampleRequirementRow().id,
      qrCode,
      serialNumber: nextSerial,
      sampleCode: source.sampleCode.trim()
        ? `${source.sampleCode.trim()}${qrCode ? '' : '-COPY'}`
        : '',
    }
    const insertAt = rows.length === 0 ? 0 : Math.min(addAfterIndex + 1, rows.length)
    const nextRows = [...rows]
    nextRows.splice(insertAt, 0, next)
    setRows(nextRows)
    setAddChooserOpen(false)
    if (chooserPurpose === 'copy') toast.success('Sample row copied')
  }

  const confirmAddSample = () => {
    if (addMode === 'with-qr') {
      const qr = selectedQr.replace(/\D/g, '')
      if (!qr || qr.length < 12) {
        toast.error('Select a QR code from the imported list.')
        return
      }
      if (!availableQrCodes.includes(qr) && !availableQrCodes.includes(selectedQr)) {
        toast.error('That QR code is already used or not imported.')
        return
      }
      pasteRowFromAbove(qr)
      return
    }
    pasteRowFromAbove('')
  }

  const closeImportDialog = () => {
    setImportDialogOpen(false)
    setImportStep('choose')
    setQrSources([])
    setSelectedSourceId('')
    setQrSourcesLoading(false)
    setTransferBusy(false)
  }

  const openImportDialog = () => {
    setImportStep('choose')
    setQrSources([])
    setSelectedSourceId('')
    setImportDialogOpen(true)
  }

  const handleImportFromManak = () => {
    closeImportDialog()
    setImportBusy(true)
    void importManakQrCodes({
      portalUserId,
      projectId,
      qrCount: 5,
    })
      .then(({ extensionUsed }) => {
        if (extensionUsed) {
          toast.success(
            'Import QR started — after login, unused codes are copied; if none exist, new codes are generated then copied.',
          )
        } else {
          toast.message(
            'QE Consultancy extension not detected. Opened Manak login — install/enable the extension to import QR codes.',
          )
        }
      })
      .catch((err: unknown) => {
        toast.error(err instanceof Error ? err.message : 'Could not import QR codes from Manak')
      })
      .finally(() => setImportBusy(false))
  }

  const openFromAppStep = () => {
    const cid = (clientId ?? '').trim()
    const pid = (projectId ?? '').trim()
    if (!cid) {
      toast.error('This project has no client — cannot look up other applications.')
      return
    }
    setImportStep('from-app')
    setQrSourcesLoading(true)
    setSelectedSourceId('')
    void listOslQrSourceProjects({ clientId: cid, excludeProjectId: pid })
      .then((list) => {
        setQrSources(list)
        setSelectedSourceId(list[0]?.projectId ?? '')
      })
      .catch((err) => {
        toast.error(err instanceof Error ? err.message : 'Failed to load applications.')
        setQrSources([])
      })
      .finally(() => setQrSourcesLoading(false))
  }

  const handleTransferFromApp = () => {
    const sourceId = selectedSourceId.trim()
    const cid = (clientId ?? '').trim()
    if (!sourceId) {
      toast.error('Select an application.')
      return
    }
    if (!cid) {
      toast.error('This project has no client — cannot transfer QR codes.')
      return
    }
    setTransferBusy(true)
    void transferUnusedOslQrFromProject({
      sourceProjectId: sourceId,
      expectedClientId: cid,
      currentPayload: value,
    })
      .then(({ codes, nextPayload }) => {
        onChange(nextPayload)
        toast.success(
          `Transferred ${codes.length} unused QR code(s). Source remaining list cleared; used samples unchanged.`,
        )
        closeImportDialog()
      })
      .catch((err) => {
        toast.error(err instanceof Error ? err.message : 'Transfer failed.')
      })
      .finally(() => setTransferBusy(false))
  }

  const handleImportCodes = () => {
    openImportDialog()
  }

  const closeEdit = () => {
    setEditIndex(null)
    setDraft(null)
    setLabClientId('')
  }

  const saveEdit = () => {
    if (editIndex == null || !draft) return
    setRows(rows.map((r, i) => (i === editIndex ? draft : r)))
    closeEdit()
  }

  const removeRow = (index: number) => {
    const row = rows[index]
    if (!row) return
    setRows(rows.filter((_, i) => i !== index))
    setSelectedIds((prev) => {
      const next = new Set(prev)
      next.delete(row.id)
      return next
    })
  }

  const handleExtension = (row: OslSampleRequirementRow) => {
    const isSearch = (isCodeSearch ?? '').trim()
    if (!isSearch) {
      toast.error('IS Number missing on this BIS project.')
      return
    }
    if (!row.qrCode.trim() && !row.sampleCode.trim()) {
      toast.error('Add a QR code (or Sample Code) before running Extension.')
      return
    }
    const userId = String(portalUserId ?? '').trim()
    if (!userId || !hasPortalPassword) {
      toast.error(
        'Portal User ID / Password missing on this BIS project. Save them on the project form, then retry Extension.',
      )
      return
    }
    const returnToken =
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `manak-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
    pendingManakTokensRef.current.set(row.id, returnToken)
    const payload = buildManakTrPayload({
      sampleId: row.id,
      isSearch,
      isYear: isCodeRevisionYear,
      returnToken,
      portalUserId: userId,
      portalPassword: '',
      sample: {
        date_of_manufacturing: row.dateOfManufacturing,
        shelf_life: row.shelfLife,
        batch_number: row.batchNumber,
        sample_quantity: row.sampleQuantity,
        mode_of_disposal: row.modeOfDisposal,
        serial_number: row.serialNumber,
        test_required: row.testRequired,
        destination_lab: row.destinationLab,
        laboratory_name: row.laboratoryName,
        sample_description: row.sampleDescription || row.gradeTypeVariety,
        additional_information: row.additionalInformation,
        grade_type_variety: row.gradeTypeVariety,
        declared_value: row.declaredValue,
        qr_code: row.qrCode,
        sample_code: row.sampleCode,
        testing_charges: row.testingCharges,
        payment_ref: row.paymentRef,
        payment_date: row.paymentDate,
        payment_mode: row.paymentMode,
      },
    })
    setExtensionBusyId(row.id)
    void (async () => {
      try {
        await registerManakPdfInbox(returnToken, row.id)
        const { extensionUsed } = await openManakTestRequestFill({
          payload,
          portalUserId: userId,
          projectId,
        })
        if (extensionUsed) {
          toast.success(
            'Manak Test Request started — User ID/Password filled; type captcha (10s wait), then form + PDF attach here.',
          )
        } else {
          toast.message(
            'QE Consultancy extension not detected. Opened Manak login — enable the extension for auto-fill + PDF.',
          )
        }
        // Backup poll if postMessage PDF never arrives.
        void pollManakPdfInbox(returnToken)
          .then((polled) => {
            if (!polled) return
            return attachManakPdfToSample({ ...polled, sampleId: polled.sampleId || row.id })
          })
          .catch(() => {
            /* ignore poll failures */
          })
      } catch (err) {
        setExtensionBusyId(null)
        pendingManakTokensRef.current.delete(row.id)
        toast.error(err instanceof Error ? err.message : 'Failed to start Manak Extension.')
      }
    })()
  }

  const clearTestRequestOnRow = (rowId: string) => {
    const current = valueRef.current
    onChangeRef.current({
      ...current,
      rows: current.rows.map((r) =>
        r.id === rowId
          ? {
              ...r,
              testRequestFileId: '',
              testRequestFileName: '',
              testRequestStoragePath: '',
            }
          : r,
      ),
    })
  }

  const clearTestReportOnRow = (rowId: string) => {
    const current = valueRef.current
    onChangeRef.current({
      ...current,
      rows: current.rows.map((r) =>
        r.id === rowId
          ? {
              ...r,
              testReportFileId: '',
              testReportFileName: '',
              testReportStoragePath: '',
            }
          : r,
      ),
    })
  }

  const viewTestRequest = (row: OslSampleRequirementRow) => {
    if (!row.testRequestStoragePath.trim()) {
      toast.error('No Test Request PDF attached yet.')
      return
    }
    void createBisProjectFileUrls(
      row.testRequestStoragePath,
      row.testRequestFileName || 'Test_Request.pdf',
    )
      .then(({ viewUrl, downloadUrl }) => {
        const href = viewUrl || downloadUrl
        if (!href) {
          toast.error('Could not open Test Request PDF.')
          return
        }
        window.open(href, '_blank', 'noopener,noreferrer')
      })
      .catch((err) => {
        toast.error(err instanceof Error ? err.message : 'Could not open Test Request PDF.')
      })
  }

  const downloadTestRequest = (row: OslSampleRequirementRow) => {
    if (!row.testRequestStoragePath.trim()) {
      toast.error('No Test Request PDF attached yet.')
      return
    }
    const filename = row.testRequestFileName.trim() || 'Test_Request.pdf'
    void createBisProjectFileUrls(row.testRequestStoragePath, filename)
      .then(({ downloadUrl, viewUrl }) => {
        const href = downloadUrl || viewUrl
        if (!href) {
          toast.error('Could not download Test Request PDF.')
          return
        }
        const a = document.createElement('a')
        a.href = href
        a.download = filename
        a.rel = 'noopener'
        document.body.appendChild(a)
        a.click()
        a.remove()
      })
      .catch((err) => {
        toast.error(err instanceof Error ? err.message : 'Could not download Test Request PDF.')
      })
  }

  const deleteTestRequest = (row: OslSampleRequirementRow) => {
    if (!row.testRequestStoragePath.trim() && !row.testRequestFileId.trim()) {
      toast.error('No Test Request PDF attached yet.')
      return
    }
    const fileId = row.testRequestFileId.trim()
    const storagePath = row.testRequestStoragePath.trim()
    void (async () => {
      try {
        if (fileId) {
          await deleteBisProjectFile({
            id: fileId,
            file_name: row.testRequestFileName || 'Test_Request.pdf',
            storage_path: storagePath,
          })
        }
        clearTestRequestOnRow(row.id)
        toast.success('Test Request PDF removed.')
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Could not delete Test Request PDF.')
      }
    })()
  }

  const openTestRequestUpload = (row: OslSampleRequirementRow) => {
    const pid = (projectId ?? '').trim()
    if (!pid) {
      toast.error('Save the BIS project first, then upload a Test Request PDF.')
      return
    }
    testRequestRowIdRef.current = row.id
    testRequestInputRef.current?.click()
  }

  const handleTestRequestFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    const rowId = testRequestRowIdRef.current
    testRequestRowIdRef.current = null
    if (!file || !rowId) return
    const pid = (projectId ?? '').trim()
    if (!pid) {
      toast.error('Save the BIS project first, then upload a Test Request PDF.')
      return
    }
    void uploadBisProjectFile(pid, file, 'osl-sample-test-request', {
      displayName: file.name,
    })
      .then((uploaded) => {
        const current = valueRef.current
        onChangeRef.current({
          ...current,
          rows: current.rows.map((r) =>
            r.id === rowId
              ? {
                  ...r,
                  testRequestFileId: uploaded.id,
                  testRequestFileName: uploaded.file_name,
                  testRequestStoragePath: uploaded.storage_path,
                }
              : r,
          ),
        })
        toast.success('Test Request PDF attached.')
      })
      .catch((err) => {
        toast.error(err instanceof Error ? err.message : 'Test Request upload failed.')
      })
  }

  const openGenerateTestReport = (row: OslSampleRequirementRow) => {
    const pid = (projectId ?? '').trim()
    if (!pid) {
      toast.error('Save the BIS project first, then generate a Test Report.')
      return
    }
    setTestReportGenerateSampleId(row.id)
    setTestReportPreviewContext(null)
    setTestReportQcSignatureUrl('')
    setTestReportGenerateOpen(true)
    setTestReportGenerateLoading(true)
    void (async () => {
      try {
        const [raw, project, techRaw] = await Promise.all([
          fetchBisModulePayload(pid, 'factory-test-report'),
          fetchBisProjectById(pid),
          fetchBisModulePayload(pid, 'technical-staff').catch(() => null),
        ])
        const parsed = parseFactoryTestReportPayload(raw)
        const hasSample = parsed.reports.some((r) => r.sampleRowId === row.id)
        let next: FactoryTestReportModulePayload = hasSample
          ? parsed
          : {
              ...parsed,
              reports: [
                ...parsed.reports,
                applySampleToFactoryTestReport(emptyFactoryTestReportEntry(), row),
              ],
            }
        next = {
          ...next,
          reports: next.reports.map((r) =>
            r.sampleRowId === row.id ? applySampleToFactoryTestReport(r, row) : r,
          ),
        }

        const techPerson = resolveTechnicalStaffForTestedBy(techRaw)
        let qcSignatureUrl = ''
        if (techPerson?.applySignatureToDocuments && techPerson.signatureStoragePath) {
          try {
            const urls = await createBisProjectFileUrls(
              techPerson.signatureStoragePath,
              techPerson.signatureFileName || 'signature',
            )
            qcSignatureUrl = urls.viewUrl?.trim() || ''
          } catch {
            qcSignatureUrl = ''
          }
        }

        if (project) {
          const printData = await loadBisPrintData(project)
          const ctx = factoryTestReportDataFromPrintData({
            ...printData,
            modulePayload: next as unknown as Record<string, unknown>,
          })
          const sig = printSignatoryDefaults(printData)

          next = {
            ...next,
            // Witnessed By — Application Details (BIS project) is source of truth.
            inspectionOfficerName:
              (project.inspection_officer_name ?? '').trim() ||
              next.inspectionOfficerName.trim() ||
              ctx.inspectionOfficerName,
            inspectionOfficerDesignation:
              (project.inspection_officer_designation ?? '').trim() ||
              next.inspectionOfficerDesignation.trim() ||
              ctx.inspectionOfficerDesignation,
            authorisedName: next.authorisedName.trim() || sig.signatoryName || ctx.authorisedName,
            authorisedDesignation:
              next.authorisedDesignation.trim() ||
              sig.signatoryDesignation ||
              ctx.authorisedDesignation,
            // Tested By — Technical Staff module is source of truth.
            testedByName:
              (techPerson?.personName ?? '').trim() ||
              next.testedByName.trim() ||
              ctx.testedByName,
            testedByDesignation:
              (techPerson?.designation ?? '').trim() ||
              (() => {
                const fallback =
                  (techPerson?.personName ? '' : next.testedByDesignation.trim()) ||
                  ctx.testedByDesignation
                return fallback === 'Technical Staff / Quality Control Incharge'
                  ? ''
                  : fallback
              })(),
          }

          setTestReportPreviewContext({
            applicantName: ctx.applicantName,
            applicantAddress: ctx.applicantAddress,
            applicationNumber: ctx.applicationNumber,
            dateOfApplication: ctx.dateOfApplication,
            dateOfInspection: ctx.dateOfInspection,
            licenceNumber: ctx.applicationNumber,
            isNumber: ctx.isNumber,
            productTitle: ctx.productTitle || ctx.isTitle,
            inspectionOfficerName:
              (project.inspection_officer_name ?? '').trim() ||
              next.inspectionOfficerName.trim(),
            inspectionOfficerDesignation:
              (project.inspection_officer_designation ?? '').trim() ||
              next.inspectionOfficerDesignation.trim(),
            testedByName: next.testedByName.trim(),
            testedByDesignation: next.testedByDesignation.trim(),
          })
        } else if (techPerson) {
          next = {
            ...next,
            testedByName: techPerson.personName || next.testedByName.trim(),
            testedByDesignation: techPerson.designation || next.testedByDesignation.trim(),
          }
        }

        setTestReportQcSignatureUrl(qcSignatureUrl)
        setTestReportGeneratePayload(next)
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Could not load Test Report module.')
        setTestReportGeneratePayload({
          ...emptyFactoryTestReportPayload(),
          reports: [applySampleToFactoryTestReport(emptyFactoryTestReportEntry(), row)],
        })
      } finally {
        setTestReportGenerateLoading(false)
      }
    })()
  }

  const saveGenerateTestReport = async () => {
    const pid = (projectId ?? '').trim()
    if (!pid) throw new Error('Save the BIS project first, then save the Test Report.')
    await saveBisModulePayload(
      pid,
      'factory-test-report',
      testReportGeneratePayload as unknown as Record<string, unknown>,
    )
  }

  const handleGenerateTestReportSave = () => {
    setTestReportGenerateBusy(true)
    void saveGenerateTestReport()
      .then(() => toast.success('Test Report module saved.'))
      .catch((err) =>
        toast.error(err instanceof Error ? err.message : 'Could not save Test Report.'),
      )
      .finally(() => setTestReportGenerateBusy(false))
  }

  const handleGenerateTestReportPrint = () => {
    const pid = (projectId ?? '').trim()
    if (!pid) {
      toast.error('Save the BIS project first, then print the Test Report.')
      return
    }
    setTestReportGenerateBusy(true)
    void (async () => {
      try {
        await saveGenerateTestReport()
        const project = await fetchBisProjectById(pid)
        if (!project) throw new Error('BIS project not found.')
        const printData = await loadBisPrintData(project)
        const data = {
          ...factoryTestReportDataFromPrintData({
            ...printData,
            modulePayload: testReportGeneratePayload as unknown as Record<string, unknown>,
          }),
          reports: testReportGeneratePayload.reports,
          inspectionOfficerName:
            (project.inspection_officer_name ?? '').trim() ||
            testReportGeneratePayload.inspectionOfficerName,
          inspectionOfficerDesignation:
            (project.inspection_officer_designation ?? '').trim() ||
            testReportGeneratePayload.inspectionOfficerDesignation,
          authorisedName: testReportGeneratePayload.authorisedName,
          authorisedDesignation: testReportGeneratePayload.authorisedDesignation,
          testedByName: testReportGeneratePayload.testedByName,
          testedByDesignation: testReportGeneratePayload.testedByDesignation,
          testedBySignatureImageUrl: testReportQcSignatureUrl,
        }
        const html = applyBisDocumentPrintPageSettings(
          buildFactoryTestReportHtml(data),
          await loadBisProjectPrintPageSettings(pid),
        )
        const pending = openPendingPrintWindow('Preparing Test Report…')
        const err = openPrintHtml(html, { target: pending })
        if (err) toast.error(err)
        else toast.success('Test Report ready to print.')
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Could not print Test Report.')
      } finally {
        setTestReportGenerateBusy(false)
      }
    })()
  }

  const handleGenerateTestReportDownload = () => {
    const pid = (projectId ?? '').trim()
    if (!pid) {
      toast.error('Save the BIS project first, then download the Test Report.')
      return
    }
    setTestReportGenerateBusy(true)
    void (async () => {
      try {
        await saveGenerateTestReport()
        const project = await fetchBisProjectById(pid)
        if (!project) throw new Error('BIS project not found.')
        const printData = await loadBisPrintData(project)
        const data = {
          ...factoryTestReportDataFromPrintData({
            ...printData,
            modulePayload: testReportGeneratePayload as unknown as Record<string, unknown>,
          }),
          reports: testReportGeneratePayload.reports,
          inspectionOfficerName:
            (project.inspection_officer_name ?? '').trim() ||
            testReportGeneratePayload.inspectionOfficerName,
          inspectionOfficerDesignation:
            (project.inspection_officer_designation ?? '').trim() ||
            testReportGeneratePayload.inspectionOfficerDesignation,
          authorisedName: testReportGeneratePayload.authorisedName,
          authorisedDesignation: testReportGeneratePayload.authorisedDesignation,
          testedByName: testReportGeneratePayload.testedByName,
          testedByDesignation: testReportGeneratePayload.testedByDesignation,
          testedBySignatureImageUrl: testReportQcSignatureUrl,
        }
        const isLabel =
          (isCodeSearch ?? '').trim() ||
          isCodeLabel.trim() ||
          (printData.isNumber ?? '').trim() ||
          ''
        const isDigits =
          isLabel.replace(/^is\s*/i, '').match(/\d{3,7}/)?.[0] ||
          isLabel.replace(/[^\d]/g, '') ||
          ''
        const focusId = (testReportGenerateSampleId ?? '').trim()
        const activeReport =
          (focusId
            ? testReportGeneratePayload.reports.find((r) => r.sampleRowId === focusId)
            : null) ??
          testReportGeneratePayload.reports[0] ??
          null
        const batchRaw = (activeReport?.batchNumber ?? '').trim()
        const batchSafe = batchRaw.replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, ' ').trim()
        const filename = isDigits
          ? batchSafe
            ? `IS ${isDigits} Test Report - ${batchSafe}.pdf`
            : `IS ${isDigits} Test Report.pdf`
          : batchSafe
            ? `Test Report - ${batchSafe}.pdf`
            : 'Test Report.pdf'
        await downloadPdfViaPlaywright({
          html: applyBisDocumentPrintPageSettings(
            buildFactoryTestReportHtml(data),
            await loadBisProjectPrintPageSettings(pid),
          ),
          filename,
        })
        toast.success('Test Report PDF downloaded.')
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Could not download Test Report.')
      } finally {
        setTestReportGenerateBusy(false)
      }
    })()
  }

  const openCourierSlipForm = (row: OslSampleRequirementRow) => {
    setCourierDraft({ ...row })
    setCourierIncludeBlv(true)
    setCourierIncludeMobile(true)
    setCourierQrDataUrl('')
    setCourierFrom({ name: '', address: '', isNumber: '', applicationNo: '' })
    setCourierFormOpen(true)
    const pid = (projectId ?? '').trim()
    const qr = row.qrCode.trim()
    const labName = row.laboratoryName.trim() || row.destinationLab.trim()
    if (qr) {
      void QRCode.toDataURL(qr, { margin: 1, width: 280, errorCorrectionLevel: 'M' })
        .then((url) => setCourierQrDataUrl(url))
        .catch(() => setCourierQrDataUrl(''))
    }
    // Prefill laboratory full address from Client master (Testing Laboratory).
    if (labName) {
      void fetchTestingLaboratoryAddressByName(labName)
        .then((address) => {
          if (!address) return
          setCourierDraft((prev) => {
            if (!prev) return prev
            const current = prev.destinationLab.trim()
            const name = (prev.laboratoryName.trim() || prev.destinationLab.trim()).toLowerCase()
            // Fill when empty or still just the lab name (not a real address yet).
            if (!current || current.toLowerCase() === name) {
              return { ...prev, destinationLab: address }
            }
            return prev
          })
        })
        .catch(() => {
          /* keep existing destination */
        })
    }
    if (!pid) return
    void fetchBisProjectById(pid)
      .then(async (project) => {
        if (!project) return
        const printData = await loadBisPrintData(project)
        const slip = oslCourierSlipDataForSample(printData, row)
        setCourierFrom({
          name: slip.applicantName,
          address: slip.applicantAddress,
          isNumber: slip.isNumber,
          applicationNo: slip.applicationNumber,
        })
      })
      .catch(() => {
        /* From block stays empty until print loads again */
      })
  }

  const buildCourierSlipHtml = async (draft: OslSampleRequirementRow) => {
    const pid = (projectId ?? '').trim()
    if (!pid) throw new Error('Save the BIS project first, then generate the Courier Slip.')
    const project = await fetchBisProjectById(pid)
    if (!project) throw new Error('BIS project not found.')
    const printData = await loadBisPrintData(project)
    let qrDataUrl = courierQrDataUrl
    const qr = draft.qrCode.trim()
    if (qr && !qrDataUrl) {
      try {
        qrDataUrl = await QRCode.toDataURL(qr, { margin: 1, width: 280, errorCorrectionLevel: 'M' })
      } catch {
        qrDataUrl = ''
      }
    }
    return oslCourierSlipDataForSample(printData, draft, {
      includeBlvCareOf: courierIncludeBlv,
      includeMobile: courierIncludeMobile,
      qrDataUrl,
    })
  }

  const courierSlipFilename = (draft: OslSampleRequirementRow) => {
    const isLabel =
      (isCodeSearch ?? '').trim() ||
      isCodeLabel.trim() ||
      courierFrom.isNumber.trim() ||
      ''
    const isDigits =
      isLabel.replace(/^is\s*/i, '').match(/\d{3,7}/)?.[0] ||
      isLabel.replace(/[^\d]/g, '') ||
      ''
    if (isDigits) return `IS ${isDigits} Courier Slip.pdf`
    const code = draft.sampleCode.trim().replace(/[^\w.-]+/g, '_') || 'Sample'
    return `Courier Slip_${code}.pdf`
  }

  const handleCourierPrint = () => {
    if (!courierDraft) return
    setCourierBusy(true)
    void (async () => {
      try {
        const data = await buildCourierSlipHtml(courierDraft)
        const html = buildOslCourierSlipHtml(data, { perPage: courierPerPage })
        const pending = openPendingPrintWindow('Preparing Courier Slip…')
        const err = openPrintHtml(html, { target: pending })
        if (err) toast.error(err)
        else toast.success('Courier Slip ready to print.')
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Could not print Courier Slip.')
      } finally {
        setCourierBusy(false)
      }
    })()
  }

  const handleCourierDownload = () => {
    if (!courierDraft) return
    setCourierBusy(true)
    void (async () => {
      try {
        const data = await buildCourierSlipHtml(courierDraft)
        const html = buildOslCourierSlipHtml(data, { perPage: courierPerPage })
        await downloadPdfViaPlaywright({
          html,
          filename: courierSlipFilename(courierDraft),
        })
        toast.success('Courier Slip PDF downloaded — send it to your client.')
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Could not download Courier Slip.')
      } finally {
        setCourierBusy(false)
      }
    })()
  }

  const openCourierSlipPicker = (row: OslSampleRequirementRow) => {
    openCourierSlipForm(row)
  }

  const handleCourierSlipFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    const rowId = courierSlipRowIdRef.current
    courierSlipRowIdRef.current = null
    if (!file || !rowId) return
    const pid = (projectId ?? '').trim()
    if (!pid) {
      toast.error('Save the BIS project first, then attach a Courier Slip.')
      return
    }
    void uploadBisProjectFile(pid, file, 'osl-sample-courier-slip', {
      displayName: file.name,
    })
      .then((uploaded) => {
        const current = valueRef.current
        onChangeRef.current({
          ...current,
          rows: current.rows.map((r) =>
            r.id === rowId
              ? {
                  ...r,
                  courierSlipFileId: uploaded.id,
                  courierSlipFileName: uploaded.file_name,
                  courierSlipStoragePath: uploaded.storage_path,
                }
              : r,
          ),
        })
        toast.success('Courier Slip attached.')
      })
      .catch((err) => {
        toast.error(err instanceof Error ? err.message : 'Courier Slip upload failed.')
      })
  }

  const handleDownloadSelectedTestRequests = () => {
    const selected = rows.filter((r) => selectedIds.has(r.id))
    if (selected.length === 0) {
      toast.error('Select one or more samples first.')
      return
    }
    const isLabel = (isCodeSearch ?? '').trim()
    const isDigits =
      isLabel.replace(/^is\s*/i, '').match(/\d{3,7}/)?.[0] ||
      isLabel.replace(/[^\d]/g, '') ||
      ''
    const filename = isDigits
      ? `IS ${isDigits} OSL Test Request.pdf`
      : 'OSL Test Request.pdf'
    setMergeBusy(true)
    void downloadMergedOslTestRequestPdfs(selected, filename)
      .then(() => toast.success(`Downloaded ${selected.filter((r) => r.testRequestStoragePath.trim()).length} Test Request PDF(s).`))
      .catch((err) => {
        toast.error(err instanceof Error ? err.message : 'Merge download failed.')
      })
      .finally(() => setMergeBusy(false))
  }

  const handleDownloadSelectedCourierSlips = () => {
    const selected = rows.filter((r) => selectedIds.has(r.id))
    if (selected.length === 0) {
      toast.error('Select one or more samples first.')
      return
    }
    const pid = (projectId ?? '').trim()
    if (!pid) {
      toast.error('Save the BIS project first, then download Courier Slips.')
      return
    }
    const isLabel = (isCodeSearch ?? '').trim()
    const isDigits =
      isLabel.replace(/^is\s*/i, '').match(/\d{3,7}/)?.[0] ||
      isLabel.replace(/[^\d]/g, '') ||
      ''
    const filename = isDigits
      ? `IS ${isDigits} Courier Slip.pdf`
      : 'Courier Slip.pdf'

    setMergeBusy(true)
    void (async () => {
      try {
        const project = await fetchBisProjectById(pid)
        if (!project) throw new Error('BIS project not found.')
        const printData = await loadBisPrintData(project)
        const slips: OslCourierSlipData[] = []
        for (const row of selected) {
          let draft = { ...row }
          const labName = draft.laboratoryName.trim() || draft.destinationLab.trim()
          const currentDest = draft.destinationLab.trim()
          if (
            labName &&
            (!currentDest || currentDest.toLowerCase() === labName.toLowerCase())
          ) {
            try {
              const address = await fetchTestingLaboratoryAddressByName(labName)
              if (address) draft = { ...draft, destinationLab: address }
            } catch {
              /* keep existing destination */
            }
          }
          let qrDataUrl = ''
          const qr = draft.qrCode.trim()
          if (qr) {
            try {
              qrDataUrl = await QRCode.toDataURL(qr, {
                margin: 1,
                width: 280,
                errorCorrectionLevel: 'M',
              })
            } catch {
              qrDataUrl = ''
            }
          }
          slips.push(
            oslCourierSlipDataForSample(printData, draft, {
              includeBlvCareOf: true,
              includeMobile: true,
              qrDataUrl,
            }),
          )
        }
        const html = buildOslCourierSlipsHtml(slips, { perPage: courierPerPage })
        await downloadPdfViaPlaywright({ html, filename })
        toast.success(
          `Downloaded ${slips.length} Courier Slip${slips.length === 1 ? '' : 's'} as one PDF.`,
        )
      } catch (err) {
        toast.error(
          err instanceof Error ? err.message : 'Could not download Courier Slips.',
        )
      } finally {
        setMergeBusy(false)
      }
    })()
  }

  const handleDownloadSelectedFactoryTestReports = () => {
    const selected = rows.filter((r) => selectedIds.has(r.id))
    if (selected.length === 0) {
      toast.error('Select one or more samples first.')
      return
    }
    const pid = (projectId ?? '').trim()
    if (!pid) {
      toast.error('Save the BIS project first, then download Factory Test Reports.')
      return
    }
    const isLabel = (isCodeSearch ?? '').trim()
    const isDigits =
      isLabel.replace(/^is\s*/i, '').match(/\d{3,7}/)?.[0] ||
      isLabel.replace(/[^\d]/g, '') ||
      ''
    const filename = isDigits
      ? `IS ${isDigits} Factory Test Report.pdf`
      : 'Factory Test Report.pdf'

    setMergeBusy(true)
    void (async () => {
      try {
        const [project, raw, techRaw] = await Promise.all([
          fetchBisProjectById(pid),
          fetchBisModulePayload(pid, 'factory-test-report'),
          fetchBisModulePayload(pid, 'technical-staff').catch(() => null),
        ])
        if (!project) throw new Error('BIS project not found.')
        const parsed = parseFactoryTestReportPayload(raw)
        const reports = selected.map((row) => {
          const existing = parsed.reports.find((r) => r.sampleRowId === row.id)
          return applySampleToFactoryTestReport(
            existing ?? emptyFactoryTestReportEntry(),
            row,
          )
        })
        const techPerson = resolveTechnicalStaffForTestedBy(techRaw)
        let testedBySignatureImageUrl = ''
        if (techPerson?.applySignatureToDocuments && techPerson.signatureStoragePath) {
          try {
            const urls = await createBisProjectFileUrls(
              techPerson.signatureStoragePath,
              techPerson.signatureFileName || 'signature',
            )
            testedBySignatureImageUrl = urls.viewUrl?.trim() || ''
          } catch {
            testedBySignatureImageUrl = ''
          }
        }
        const printData = await loadBisPrintData(project)
        const data = {
          ...factoryTestReportDataFromPrintData({
            ...printData,
            modulePayload: {
              ...parsed,
              reports,
            } as unknown as Record<string, unknown>,
          }),
          reports,
          inspectionOfficerName:
            (project.inspection_officer_name ?? '').trim() || parsed.inspectionOfficerName,
          inspectionOfficerDesignation:
            (project.inspection_officer_designation ?? '').trim() ||
            parsed.inspectionOfficerDesignation,
          authorisedName: parsed.authorisedName,
          authorisedDesignation: parsed.authorisedDesignation,
          testedByName: (techPerson?.personName ?? '').trim() || parsed.testedByName,
          testedByDesignation:
            (techPerson?.designation ?? '').trim() ||
            (parsed.testedByDesignation === 'Technical Staff / Quality Control Incharge'
              ? ''
              : parsed.testedByDesignation),
          testedBySignatureImageUrl,
        }
        await downloadPdfViaPlaywright({
          html: buildFactoryTestReportHtml(data),
          filename,
        })
        toast.success(
          `Downloaded ${reports.length} Factory Test Report${reports.length === 1 ? '' : 's'} as one PDF.`,
        )
      } catch (err) {
        toast.error(
          err instanceof Error
            ? err.message
            : 'Could not download Factory Test Reports.',
        )
      } finally {
        setMergeBusy(false)
      }
    })()
  }

  const openTestReportUpload = (row: OslSampleRequirementRow) => {
    const pid = (projectId ?? '').trim()
    if (!pid) {
      toast.error('Save the BIS project first, then upload a Test Report PDF.')
      return
    }
    testReportRowIdRef.current = row.id
    testReportInputRef.current?.click()
  }

  const viewTestReport = (row: OslSampleRequirementRow) => {
    if (!row.testReportStoragePath.trim()) {
      toast.error('No Test Report PDF attached yet.')
      return
    }
    void createBisProjectFileUrls(
      row.testReportStoragePath,
      row.testReportFileName || 'Test_Report.pdf',
    )
      .then(({ viewUrl, downloadUrl }) => {
        const href = viewUrl || downloadUrl
        if (!href) {
          toast.error('Could not open Test Report PDF.')
          return
        }
        window.open(href, '_blank', 'noopener,noreferrer')
      })
      .catch((err) => {
        toast.error(err instanceof Error ? err.message : 'Could not open Test Report PDF.')
      })
  }

  const downloadTestReport = (row: OslSampleRequirementRow) => {
    if (!row.testReportStoragePath.trim()) {
      toast.error('No Test Report PDF attached yet.')
      return
    }
    const filename = row.testReportFileName.trim() || 'Test_Report.pdf'
    void createBisProjectFileUrls(row.testReportStoragePath, filename)
      .then(({ downloadUrl, viewUrl }) => {
        const href = downloadUrl || viewUrl
        if (!href) {
          toast.error('Could not download Test Report PDF.')
          return
        }
        const a = document.createElement('a')
        a.href = href
        a.download = filename
        a.rel = 'noopener'
        document.body.appendChild(a)
        a.click()
        a.remove()
      })
      .catch((err) => {
        toast.error(err instanceof Error ? err.message : 'Could not download Test Report PDF.')
      })
  }

  const deleteTestReport = (row: OslSampleRequirementRow) => {
    if (!row.testReportStoragePath.trim() && !row.testReportFileId.trim()) {
      toast.error('No Test Report PDF attached yet.')
      return
    }
    const fileId = row.testReportFileId.trim()
    const storagePath = row.testReportStoragePath.trim()
    void (async () => {
      try {
        if (fileId) {
          await deleteBisProjectFile({
            id: fileId,
            file_name: row.testReportFileName || 'Test_Report.pdf',
            storage_path: storagePath,
          })
        }
        clearTestReportOnRow(row.id)
        toast.success('Test Report PDF removed.')
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Could not delete Test Report PDF.')
      }
    })()
  }

  const handleTestReportFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    const rowId = testReportRowIdRef.current
    testReportRowIdRef.current = null
    if (!file || !rowId) return
    const pid = (projectId ?? '').trim()
    if (!pid) {
      toast.error('Save the BIS project first, then upload a Test Report PDF.')
      return
    }
    void uploadBisProjectFile(pid, file, 'osl-sample-test-report', {
      displayName: file.name,
    })
      .then((uploaded) => {
        const current = valueRef.current
        onChangeRef.current({
          ...current,
          rows: current.rows.map((r) =>
            r.id === rowId
              ? {
                  ...r,
                  testReportFileId: uploaded.id,
                  testReportFileName: uploaded.file_name,
                  testReportStoragePath: uploaded.storage_path,
                }
              : r,
          ),
        })
        toast.success('Test Report PDF attached.')
      })
      .catch((err) => {
        toast.error(err instanceof Error ? err.message : 'Test Report upload failed.')
      })
  }

  const patchDraft = <K extends keyof OslSampleRequirementRow>(
    key: K,
    next: OslSampleRequirementRow[K],
  ) => {
    if (!draft) return
    setDraft({ ...draft, [key]: next })
  }

  const toggleId = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleAll = (checked: boolean) => {
    setSelectedIds(checked ? new Set(rows.map((r) => r.id)) : new Set())
  }

  const renderActionButtons = (row: OslSampleRequirementRow, index: number) => (
    <div className="inline-flex flex-wrap items-center justify-center gap-0.5">
      <Button
        type="button"
        size="sm"
        variant="outline"
        className={cn(limsOutlineBtnClass, actionBtnClass)}
        disabled={disabled}
        title="Edit"
        aria-label="Edit sample"
        onClick={() => openEdit(index)}
      >
        <Pencil size={14} aria-hidden />
      </Button>
      <Button
        type="button"
        size="sm"
        variant="outline"
        className={cn(limsOutlineBtnClass, actionBtnClass)}
        disabled={disabled || extensionBusyId === row.id}
        title="Extension (Manak eBIS) — fill Test Request & attach PDF"
        aria-label="Open Manak extension"
        onClick={() => handleExtension(row)}
      >
        <ExternalLink size={14} aria-hidden />
      </Button>
      <Button
        type="button"
        size="sm"
        variant="outline"
        className={cn(
          limsOutlineBtnClass,
          actionBtnClass,
          'text-red-700 hover:bg-red-50 hover:text-red-800',
        )}
        disabled={disabled}
        title="Delete"
        aria-label="Delete sample"
        onClick={() => removeRow(index)}
      >
        <Trash2 size={14} aria-hidden />
      </Button>
    </div>
  )

  const renderFileActionMenu = ({
    title,
    hasFile,
    triggerTitle,
    triggerAriaLabel,
    triggerIcon,
    onGenerate,
    onView,
    onUpload,
    onDownload,
    onDelete,
  }: {
    title: string
    hasFile: boolean
    triggerTitle: string
    triggerAriaLabel: string
    triggerIcon: ReactNode
    onGenerate?: () => void
    onView: () => void
    onUpload: () => void
    onDownload: () => void
    onDelete: () => void
  }) => (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className={cn(
            limsOutlineBtnClass,
            actionBtnClass,
            hasFile ? 'border-amber-600 bg-amber-50 text-amber-950' : null,
          )}
          disabled={disabled}
          title={triggerTitle}
          aria-label={triggerAriaLabel}
        >
          {triggerIcon}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" sideOffset={6} className={fileMenuContentClass}>
        <DropdownMenuLabel className={fileMenuLabelClass}>{title}</DropdownMenuLabel>
        <DropdownMenuSeparator className="mx-1 bg-stone-300" />
        {onGenerate ? (
          <DropdownMenuItem
            disabled={disabled}
            className={fileMenuItemClass}
            onSelect={onGenerate}
          >
            <span className={cn(fileMenuIconWrapClass, 'border-violet-500 bg-violet-50 text-violet-800')}>
              <Sparkles className="h-3.5 w-3.5" aria-hidden />
            </span>
            Generate
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuItem
          disabled={disabled || !hasFile}
          className={fileMenuItemClass}
          onSelect={onView}
        >
          <span className={cn(fileMenuIconWrapClass, 'border-sky-400 bg-sky-50 text-sky-800')}>
            <Eye className="h-3.5 w-3.5" aria-hidden />
          </span>
          View
        </DropdownMenuItem>
        <DropdownMenuItem
          disabled={disabled}
          className={fileMenuItemClass}
          onSelect={onUpload}
        >
          <span className={cn(fileMenuIconWrapClass, 'border-amber-500 bg-amber-50 text-amber-900')}>
            <Upload className="h-3.5 w-3.5" aria-hidden />
          </span>
          Upload
        </DropdownMenuItem>
        <DropdownMenuItem
          disabled={disabled || !hasFile}
          className={fileMenuItemClass}
          onSelect={onDownload}
        >
          <span className={cn(fileMenuIconWrapClass, 'border-emerald-500 bg-emerald-50 text-emerald-800')}>
            <Download className="h-3.5 w-3.5" aria-hidden />
          </span>
          Download
        </DropdownMenuItem>
        <DropdownMenuSeparator className="mx-1 bg-stone-300" />
        <DropdownMenuItem
          disabled={disabled || !hasFile}
          className={cn(fileMenuItemClass, 'text-red-700 focus:bg-red-50 focus:text-red-800')}
          onSelect={onDelete}
        >
          <span className={cn(fileMenuIconWrapClass, 'border-red-400 bg-red-50 text-red-700')}>
            <Trash2 className="h-3.5 w-3.5" aria-hidden />
          </span>
          Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )

  const renderTestRequestMenu = (row: OslSampleRequirementRow) => {
    const hasFile = Boolean(row.testRequestStoragePath.trim() || row.testRequestFileId.trim())
    return renderFileActionMenu({
      title: 'Test Request',
      hasFile,
      triggerTitle: 'Test Request',
      triggerAriaLabel: 'Test request',
      triggerIcon: <FileText size={14} aria-hidden />,
      onView: () => viewTestRequest(row),
      onUpload: () => openTestRequestUpload(row),
      onDownload: () => downloadTestRequest(row),
      onDelete: () => deleteTestRequest(row),
    })
  }

  const renderTestReportMenu = (row: OslSampleRequirementRow) => {
    const hasFile = Boolean(row.testReportStoragePath.trim() || row.testReportFileId.trim())
    return renderFileActionMenu({
      title: 'Test Report',
      hasFile,
      triggerTitle: 'Test Report',
      triggerAriaLabel: 'Test report',
      triggerIcon: <ScrollText size={14} aria-hidden />,
      onGenerate: () => openGenerateTestReport(row),
      onView: () => viewTestReport(row),
      onUpload: () => openTestReportUpload(row),
      onDownload: () => downloadTestReport(row),
      onDelete: () => deleteTestReport(row),
    })
  }

  const renderDocButtons = (row: OslSampleRequirementRow) => (
    <div className="inline-flex flex-wrap items-center gap-0.5">
      {renderTestRequestMenu(row)}
      <Button
        type="button"
        size="sm"
        variant="outline"
        className={cn(
          limsOutlineBtnClass,
          actionBtnClass,
          row.courierSlipStoragePath.trim()
            ? 'border-amber-600 bg-amber-50 text-amber-950'
            : null,
        )}
        disabled={disabled}
        title="Courier Slip — preview Test Request, then Print / Download PDF"
        aria-label="Courier slip"
        onClick={() => openCourierSlipPicker(row)}
      >
        <Package size={14} aria-hidden />
      </Button>
      {renderTestReportMenu(row)}
    </div>
  )

  const renderDocTiles = (row: OslSampleRequirementRow) => {
    const hasCourier = Boolean(row.courierSlipStoragePath.trim())
    const tileClass =
      'flex min-w-0 flex-1 flex-col items-center gap-1.5 rounded-none border border-stone-400 bg-white/90 px-1.5 py-2 shadow-sm'
    return (
      <div className="grid w-full min-w-0 grid-cols-3 gap-1.5">
        <div className={tileClass}>
          <p className="text-center text-[9px] font-bold uppercase leading-tight tracking-[0.08em] text-stone-600">
            Test Request
          </p>
          {renderTestRequestMenu(row)}
        </div>
        <div className={tileClass}>
          <p className="text-center text-[9px] font-bold uppercase leading-tight tracking-[0.08em] text-stone-600">
            Courier
          </p>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className={cn(
              limsOutlineBtnClass,
              actionBtnClass,
              hasCourier ? 'border-amber-600 bg-amber-50 text-amber-950' : null,
            )}
            disabled={disabled}
            title="Courier Slip — preview Test Request, then Print / Download PDF"
            aria-label="Courier slip"
            onClick={() => openCourierSlipPicker(row)}
          >
            <Package size={14} aria-hidden />
          </Button>
        </div>
        <div className={tileClass}>
          <p className="text-center text-[9px] font-bold uppercase leading-tight tracking-[0.08em] text-stone-600">
            Report
          </p>
          {renderTestReportMenu(row)}
        </div>
      </div>
    )
  }

  const sampleStatusClass = (row: OslSampleRequirementRow, selected: boolean) => {
    if (selected) return rowSelectedClass
    const tone = oslSampleRowStatusTone(row)
    if (tone === 'complete') return rowCompleteClass
    if (tone === 'waiting-tr') return rowWaitingTrClass
    return rowBlankClass
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden rounded-none border border-stone-400 bg-[#fffcf7] p-2 sm:p-3">
      <input
        ref={courierSlipInputRef}
        type="file"
        accept="application/pdf,image/*"
        className="hidden"
        aria-hidden
        tabIndex={-1}
        onChange={handleCourierSlipFileChange}
      />
      <input
        ref={testRequestInputRef}
        type="file"
        accept="application/pdf"
        className="hidden"
        aria-hidden
        tabIndex={-1}
        onChange={handleTestRequestFileChange}
      />
      <input
        ref={testReportInputRef}
        type="file"
        accept="application/pdf,image/*"
        className="hidden"
        aria-hidden
        tabIndex={-1}
        onChange={handleTestReportFileChange}
      />
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2">
        <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-stone-600">
          Sample Requirements
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            className={cn(limsOutlineBtnClass, actionBtnClass)}
            disabled={disabled}
            title="Add Sample"
            aria-label="Add sample"
            onClick={() => openAddChooser()}
          >
            <Plus size={14} aria-hidden />
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className={cn(limsOutlineBtnClass, actionBtnClass)}
            disabled={disabled || selectedCount !== 1}
            title={
              selectedCount === 1
                ? 'Copy selected sample'
                : 'Select exactly one sample to copy'
            }
            aria-label="Copy sample"
            onClick={openCopyChooser}
          >
            <Copy size={14} aria-hidden />
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className={cn(limsOutlineBtnClass, actionBtnClass)}
            disabled={disabled || importBusy}
            title="Import QR Code"
            aria-label="Import QR code"
            onClick={handleImportCodes}
          >
            <Download size={14} aria-hidden />
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className={cn(limsOutlineBtnClass, actionBtnClass)}
            disabled={disabled || mergeBusy || selectedCount === 0}
            title="Download selected Test Request PDFs (merged into one file)"
            aria-label="Download selected test request PDFs"
            onClick={handleDownloadSelectedTestRequests}
          >
            <FileDown size={14} aria-hidden />
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className={cn(limsOutlineBtnClass, actionBtnClass)}
            disabled={disabled || mergeBusy || selectedCount === 0}
            title="Download selected Courier Slips (merged into one PDF)"
            aria-label="Download selected courier slips"
            onClick={handleDownloadSelectedCourierSlips}
          >
            <Package size={14} aria-hidden />
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className={cn(limsOutlineBtnClass, actionBtnClass)}
            disabled={disabled || mergeBusy || selectedCount === 0}
            title="Download selected Factory Test Reports (merged into one PDF)"
            aria-label="Download selected factory test reports"
            onClick={handleDownloadSelectedFactoryTestReports}
          >
            <FileText size={14} aria-hidden />
          </Button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto rounded-none border border-stone-500 bg-stone-50">
        {/* Cards — below lg */}
        <div className={cn(CARDS_MQ_SHOW, 'space-y-2 p-2')}>
          <div className="flex items-center gap-2 border border-stone-500 bg-stone-800 px-2.5 py-2 text-amber-200">
            <input
              type="checkbox"
              className={checkboxClass}
              aria-label="Select all samples"
              checked={allChecked}
              ref={(el) => {
                if (el) el.indeterminate = !allChecked && someChecked
              }}
              disabled={disabled || rows.length === 0}
              onChange={(e) => toggleAll(e.target.checked)}
            />
            <span className="text-[11px] font-bold uppercase tracking-[0.14em]">
              {selectedCount > 0
                ? `${selectedCount} selected`
                : `${rows.length} sample${rows.length === 1 ? '' : 's'}`}
            </span>
          </div>

          {rows.length === 0 ? (
            <p className="px-3 py-8 text-center text-sm text-stone-500">
              No samples yet. Use + to add a sample.
            </p>
          ) : (
            rows.map((row, index) => {
              const selected = selectedIds.has(row.id)
              return (
                <article
                  key={`osl-card-${row.id}`}
                  className={cn(
                    'space-y-2.5 border border-stone-400 p-2.5',
                    sampleStatusClass(row, selected),
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <label className="inline-flex min-w-0 items-center gap-2 text-xs font-semibold text-stone-700">
                      <input
                        type="checkbox"
                        className={checkboxClass}
                        checked={selected}
                        disabled={disabled}
                        aria-label={`Select sample ${index + 1}`}
                        onChange={() => toggleId(row.id)}
                      />
                      <span className="tabular-nums text-stone-500">
                        {String(index + 1).padStart(2, '0')}
                      </span>
                      <span className="rounded-none border border-stone-400 bg-white/70 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-950">
                        {sampleForLabel(row.sampleFor)}
                      </span>
                      <span className="truncate text-stone-600">{row.priority}</span>
                    </label>
                    {renderActionButtons(row, index)}
                  </div>

                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <div className="min-w-0">
                      <p className={cardFieldLabelClass}>QR Code</p>
                      <p className="truncate text-sm font-medium text-stone-900" title={row.qrCode || undefined}>
                        {row.qrCode || '—'}
                      </p>
                    </div>
                    <div className="min-w-0">
                      <p className={cardFieldLabelClass}>Sample Code</p>
                      <p
                        className="truncate text-sm font-medium text-stone-900"
                        title={row.sampleCode || undefined}
                      >
                        {row.sampleCode || '—'}
                      </p>
                    </div>
                    <div className="min-w-0 sm:col-span-2">
                      <p className={cardFieldLabelClass}>Sample Details</p>
                      {row.batchNumber.trim() ? (
                        <button
                          type="button"
                          className="truncate text-left text-sm font-semibold text-amber-900 underline decoration-amber-700/50 underline-offset-2 hover:text-amber-950 disabled:pointer-events-none disabled:opacity-50"
                          disabled={disabled}
                          title="Open sample details"
                          onClick={() => openEdit(index)}
                        >
                          {row.batchNumber.trim()}
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="text-sm text-stone-500 underline decoration-stone-400/60 underline-offset-2 hover:text-amber-900 disabled:pointer-events-none disabled:opacity-50"
                          disabled={disabled}
                          title="Open sample details"
                          onClick={() => openEdit(index)}
                        >
                          —
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="space-y-2 border-t border-stone-300/80 pt-2">
                    <label className="inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-stone-600">
                      <input
                        type="checkbox"
                        className={checkboxClass}
                        checked={row.includeInPrint}
                        disabled={disabled}
                        aria-label={`Include sample ${index + 1} in offer letter`}
                        onChange={(e) =>
                          setRows(
                            rows.map((r, i) =>
                              i === index ? { ...r, includeInPrint: e.target.checked } : r,
                            ),
                          )
                        }
                      />
                      In Offer Letter
                    </label>
                    {renderDocTiles(row)}
                  </div>
                </article>
              )
            })
          )}
        </div>

        {/* Table — lg+ */}
        <div className={TABLE_MQ_SHOW}>
          <Table className="w-full min-w-[52rem] table-fixed border-collapse">
            <TableHeader>
              <TableRow className="border-stone-700 bg-stone-800 hover:bg-stone-800">
                <TableHead className={cn(thClass, 'w-10 px-1')}>
                  <input
                    type="checkbox"
                    className={checkboxClass}
                    aria-label="Select all samples"
                    checked={allChecked}
                    ref={(el) => {
                      if (el) el.indeterminate = !allChecked && someChecked
                    }}
                    disabled={disabled}
                    onChange={(e) => toggleAll(e.target.checked)}
                  />
                </TableHead>
                <TableHead className={cn(thClass, 'w-[4.5rem]')}>Sample For</TableHead>
                <TableHead className={cn(thClass, 'w-[16%]')}>QR Code</TableHead>
                <TableHead className={cn(thClass, 'w-[16%]')}>Sample Code</TableHead>
                <TableHead className={cn(thClass, 'w-[20%]')}>Sample Details</TableHead>
                <TableHead className={cn(thClass, 'w-[5.5rem]')}>Priority</TableHead>
                <TableHead className={cn(thClass, 'w-[5.5rem]')}>In Offer Letter</TableHead>
                <TableHead className={cn(thClass, 'w-14')}>Test Request</TableHead>
                <TableHead className={cn(thClass, 'w-14')}>Courier Slip</TableHead>
                <TableHead className={cn(thClass, 'w-14')}>Test Report</TableHead>
                <TableHead className={cn(thClass, 'w-[7rem] px-1')}>Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 ? (
                <TableRow className={cn('border-[#e7e0d4]', rowBlankClass)}>
                  <TableCell
                    colSpan={11}
                    className="px-3 py-8 text-center text-sm text-stone-500"
                  >
                    No samples yet. Use + to add a sample.
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((row, index) => {
                  const selected = selectedIds.has(row.id)
                  return (
                    <TableRow
                      key={row.id}
                      data-state={selected ? 'selected' : undefined}
                      className={cn('border-[#e7e0d4]', sampleStatusClass(row, selected))}
                    >
                      <TableCell className="px-2 py-2 text-center align-middle">
                        <input
                          type="checkbox"
                          className={checkboxClass}
                          checked={selected}
                          disabled={disabled}
                          aria-label={`Select sample ${index + 1}`}
                          onChange={() => toggleId(row.id)}
                        />
                      </TableCell>
                      <TableCell className="px-2 py-2 text-center text-xs font-semibold align-middle">
                        {sampleForLabel(row.sampleFor)}
                      </TableCell>
                      <TableCell
                        className="truncate px-2 py-2 text-center text-xs align-middle"
                        title={row.qrCode || undefined}
                      >
                        {row.qrCode || '—'}
                      </TableCell>
                      <TableCell
                        className="truncate px-2 py-2 text-center text-xs align-middle"
                        title={row.sampleCode || undefined}
                      >
                        {row.sampleCode || '—'}
                      </TableCell>
                      <TableCell className="truncate px-2 py-2 text-center text-xs font-medium align-middle">
                        {row.batchNumber.trim() ? (
                          <button
                            type="button"
                            className="truncate font-semibold text-amber-900 underline decoration-amber-700/50 underline-offset-2 hover:text-amber-950 hover:decoration-amber-800 disabled:pointer-events-none disabled:opacity-50"
                            disabled={disabled}
                            title="Open sample details"
                            onClick={() => openEdit(index)}
                          >
                            {row.batchNumber.trim()}
                          </button>
                        ) : (
                          <button
                            type="button"
                            className="text-stone-500 underline decoration-stone-400/60 underline-offset-2 hover:text-amber-900 disabled:pointer-events-none disabled:opacity-50"
                            disabled={disabled}
                            title="Open sample details"
                            onClick={() => openEdit(index)}
                          >
                            —
                          </button>
                        )}
                      </TableCell>
                      <TableCell className="px-2 py-2 text-center text-xs align-middle">
                        {row.priority}
                      </TableCell>
                      <TableCell className="px-2 py-2 text-center align-middle">
                        <input
                          type="checkbox"
                          className={checkboxClass}
                          checked={row.includeInPrint}
                          disabled={disabled}
                          aria-label={`Include sample ${index + 1} in offer letter`}
                          onChange={(e) =>
                            setRows(
                              rows.map((r, i) =>
                                i === index ? { ...r, includeInPrint: e.target.checked } : r,
                              ),
                            )
                          }
                        />
                      </TableCell>
                      <TableCell className="px-2 py-2 text-center align-middle">
                        {renderTestRequestMenu(row)}
                      </TableCell>
                      <TableCell className="px-2 py-2 text-center align-middle">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className={cn(
                            limsOutlineBtnClass,
                            actionBtnClass,
                            row.courierSlipStoragePath.trim()
                              ? 'border-amber-600 bg-amber-50 text-amber-950'
                              : null,
                          )}
                          disabled={disabled}
                          title="Courier Slip — preview Test Request, then Print / Download PDF"
                          aria-label="Courier slip"
                          onClick={() => openCourierSlipPicker(row)}
                        >
                          <Package size={14} aria-hidden />
                        </Button>
                      </TableCell>
                      <TableCell className="px-2 py-2 text-center align-middle">
                        {renderTestReportMenu(row)}
                      </TableCell>
                      <TableCell className="w-[7rem] whitespace-nowrap px-1 py-2 text-center align-middle">
                        {renderActionButtons(row, index)}
                      </TableCell>
                    </TableRow>
                  )
                })
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      <Dialog
        open={courierFormOpen && courierDraft != null}
        onOpenChange={(open) => {
          if (!open) {
            setCourierFormOpen(false)
            setCourierDraft(null)
            setCourierBusy(false)
            setCourierQrDataUrl('')
            setCourierFrom({ name: '', address: '', isNumber: '', applicationNo: '' })
          }
        }}
      >
        <DialogContent
          persistOnFocusLoss
          layer="stacked"
          aria-describedby={undefined}
          className={cn(
            'flex !flex-col gap-0 overflow-hidden p-0',
            '!flex h-[100dvh] max-h-[100dvh] translate-x-0 translate-y-0 rounded-none border-0 bg-stone-100 shadow-none sm:rounded-none',
            'left-[var(--app-dialog-overlay-left,0px)] top-0 right-0',
            'w-[calc(100vw-var(--app-dialog-overlay-left,0px))] max-w-none',
            'border-stone-600 ring-1 ring-amber-700/20',
          )}
        >
          <div className="relative shrink-0 overflow-hidden bg-gradient-to-br from-stone-800 via-stone-900 to-stone-950 px-4 py-2.5 text-white">
            <div
              className="pointer-events-none absolute inset-0 opacity-[0.18]"
              style={limsDarkBarGlowStyle}
            />
            <div className="absolute bottom-0 left-0 h-[2px] w-full bg-gradient-to-r from-amber-500 via-amber-300 to-transparent" />
            <DialogHeader className="relative pr-10 text-left">
              <DialogTitle className="text-base font-semibold tracking-tight text-white">
                BIS Sample Test Request
              </DialogTitle>
              <p className="mt-0.5 truncate text-xs text-stone-300">
                {courierDraft?.sampleCode.trim() || courierDraft?.qrCode.trim() || 'Read-only preview'}
              </p>
            </DialogHeader>
          </div>

          {courierDraft ? (
            <div className="flex min-h-0 flex-1 overflow-hidden bg-stone-200/80">
              <div className="min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-contain px-3 py-4 sm:px-6 [-webkit-overflow-scrolling:touch]">
                <div
                  className={cn(
                    'mx-auto w-full max-w-[210mm] border-2 border-stone-900 bg-white p-1.5 shadow-lg',
                    courierPerPage === 1
                      ? 'min-h-[min(297mm,calc(100dvh-9rem))]'
                      : 'min-h-[min(297mm,calc(100dvh-9rem))]',
                  )}
                >
                  <div
                    className={cn(
                      'w-full gap-2 font-[Times_New_Roman,Times,serif] text-stone-900',
                      courierPerPage === 1 && 'flex flex-col',
                      courierPerPage === 2 && 'flex flex-col',
                      courierPerPage === 3 && 'flex flex-col',
                      courierPerPage === 4 && 'grid grid-cols-2',
                    )}
                    style={{
                      minHeight: 'calc(min(297mm, calc(100dvh - 9rem)) - 0.75rem)',
                    }}
                  >
                    <div
                      className={cn(
                        'flex w-full flex-col gap-3 border border-stone-900 p-[10mm]',
                        courierPerPage === 1 &&
                          'min-h-[calc(min(297mm,calc(100dvh-9rem))-0.75rem)]',
                        courierPerPage === 2 && 'min-h-[calc((min(297mm,calc(100dvh-9rem))-0.75rem-0.5rem)/2)]',
                        courierPerPage === 3 && 'min-h-[calc((min(297mm,calc(100dvh-9rem))-0.75rem-1rem)/3)]',
                        courierPerPage === 4 && 'min-h-[calc((min(297mm,calc(100dvh-9rem))-0.75rem-0.5rem)/2)]',
                        courierPerPage >= 2 && 'gap-1.5 p-[5mm] text-[11px]',
                        courierPerPage >= 3 && 'gap-1 p-[3.5mm] text-[9px]',
                        courierPerPage === 4 && 'gap-1 p-[3mm] text-[8px]',
                      )}
                    >
                    <header className="text-center">
                      <h2
                        className={cn(
                          'font-extrabold uppercase tracking-[0.06em]',
                          courierPerPage === 1 && 'text-base',
                          courierPerPage === 2 && 'text-sm',
                          courierPerPage >= 3 && 'text-xs',
                        )}
                      >
                        BIS Sample Test Request
                      </h2>
                    </header>

                {/* TO + QR */}
                <div
                  className={cn(
                    'grid grid-cols-1 gap-3',
                    courierPerPage === 1 && 'sm:grid-cols-[minmax(0,1fr)_11rem]',
                    courierPerPage === 2 && 'sm:grid-cols-[minmax(0,1fr)_8rem] gap-2',
                    courierPerPage >= 3 && 'sm:grid-cols-[minmax(0,1fr)_5.5rem] gap-1.5',
                  )}
                >
                  <section className="rounded-sm border border-stone-400 px-3 py-2.5 text-sm leading-snug">
                    <p className="text-[11px] font-extrabold uppercase tracking-[0.08em]">To</p>
                    <div className="mt-1.5 flex flex-col gap-1">
                      {courierIncludeBlv ? (
                        <p className="font-bold">BLV Testing Solutions C/o</p>
                      ) : null}
                      <p className="rounded-sm bg-stone-100 px-2 py-1 font-bold">
                        {courierDraft.laboratoryName.trim() || '—'}
                      </p>
                      {(() => {
                        const labAddr =
                          courierDraft.destinationLab.trim().toLowerCase() ===
                          courierDraft.laboratoryName.trim().toLowerCase()
                            ? ''
                            : courierDraft.destinationLab.trim()
                        return labAddr ? (
                          <p className="whitespace-pre-wrap rounded-sm bg-stone-100 px-2 py-1.5 text-sm">
                            {labAddr}
                          </p>
                        ) : null
                      })()}
                      {courierIncludeMobile ? (
                        <p className="font-bold">Mobile: +919009413040</p>
                      ) : null}
                    </div>
                  </section>

                  <aside className="flex flex-col items-center justify-center gap-1.5 rounded-sm border border-stone-300 bg-white px-2 py-2">
                    {courierQrDataUrl ? (
                      <img
                        src={courierQrDataUrl}
                        alt={`QR ${courierDraft.qrCode}`}
                        className={cn(
                          'object-contain',
                          courierPerPage === 1 && 'h-36 w-36',
                          courierPerPage === 2 && 'h-24 w-24',
                          courierPerPage === 3 && 'h-16 w-16',
                          courierPerPage === 4 && 'h-14 w-14',
                        )}
                      />
                    ) : (
                      <div
                        className={cn(
                          'flex items-center justify-center border border-dashed border-stone-400 text-[10px] text-stone-400',
                          courierPerPage === 1 && 'h-36 w-36',
                          courierPerPage === 2 && 'h-24 w-24',
                          courierPerPage === 3 && 'h-16 w-16',
                          courierPerPage === 4 && 'h-14 w-14',
                        )}
                      >
                        No QR
                      </div>
                    )}
                    <p className="w-full rounded-sm border border-stone-300 bg-stone-50 px-2 py-1 text-center text-[11px] font-semibold">
                      {courierDraft.qrCode.trim() || '—'}
                    </p>
                  </aside>
                </div>

                {/* Sample details table — ordered; empty values omitted */}
                <section className="rounded-sm border border-stone-300 px-3 py-2.5">
                  <p className="mb-2 text-sm font-extrabold">Sample Details</p>
                  <div className="overflow-hidden rounded-sm border border-stone-400">
                    <table className="w-full table-auto border-collapse text-left text-sm">
                      <tbody>
                        {(() => {
                          const th =
                            'w-px whitespace-nowrap border border-stone-400 bg-stone-100 px-2 py-1.5 align-middle font-extrabold'
                          const thTop =
                            'w-px whitespace-nowrap border border-stone-400 bg-stone-100 px-2 py-1.5 align-top font-extrabold'
                          const td = 'border border-stone-400 px-2 py-1.5 text-sm font-normal'
                          const tdWrap = `${td} whitespace-pre-wrap`
                          const nonEmpty = (v: string) => v.trim().length > 0
                          const pair = (
                            key: string,
                            aLabel: string,
                            aValue: string,
                            bLabel: string,
                            bValue: string,
                            opts?: { aTabular?: boolean; bTabular?: boolean },
                          ) => {
                            const a = nonEmpty(aValue)
                            const b = nonEmpty(bValue)
                            if (!a && !b) return null
                            if (a && b) {
                              return (
                                <tr key={key}>
                                  <th className={th}>{aLabel}</th>
                                  <td className={cn(td, opts?.aTabular && 'tabular-nums')}>{aValue.trim()}</td>
                                  <th className={th}>{bLabel}</th>
                                  <td className={cn(td, opts?.bTabular && 'tabular-nums')}>{bValue.trim()}</td>
                                </tr>
                              )
                            }
                            const label = a ? aLabel : bLabel
                            const value = a ? aValue.trim() : bValue.trim()
                            const tabular = a ? opts?.aTabular : opts?.bTabular
                            return (
                              <tr key={key}>
                                <th className={th}>{label}</th>
                                <td className={cn(td, tabular && 'tabular-nums')} colSpan={3}>
                                  {value}
                                </td>
                              </tr>
                            )
                          }
                          const full = (key: string, label: string, value: string, wrap = false) => {
                            if (!nonEmpty(value)) return null
                            return (
                              <tr key={key}>
                                <th className={wrap ? thTop : th}>{label}</th>
                                <td className={wrap ? tdWrap : td} colSpan={3}>
                                  {value.trim()}
                                </td>
                              </tr>
                            )
                          }
                          const dom = courierDraft.dateOfManufacturing.trim()
                            ? formatDisplayDate(courierDraft.dateOfManufacturing)
                            : ''
                          return (
                            <>
                              {pair(
                                'is-shelf',
                                'IS Number',
                                courierFrom.isNumber,
                                'Shelf Life',
                                courierDraft.shelfLife,
                              )}
                              {pair(
                                'code-qr',
                                'Sample Code',
                                courierDraft.sampleCode,
                                'QR Code',
                                courierDraft.qrCode,
                              )}
                              {pair(
                                'batch-dom',
                                'Batch Number',
                                courierDraft.batchNumber,
                                'DOM',
                                dom,
                                { bTabular: true },
                              )}
                              {full('qty', 'Sample Quantity', courierDraft.sampleQuantity)}
                              {full('grade', 'Grade / Type / Variety', courierDraft.gradeTypeVariety, true)}
                              {full('declared', 'Declared Value', courierDraft.declaredValue, true)}
                              {full('desc', 'Sample Description', courierDraft.sampleDescription, true)}
                              {full('extra', 'Additional Information', courierDraft.additionalInformation, true)}
                            </>
                          )
                        })()}
                      </tbody>
                    </table>
                  </div>
                </section>

                {/* FROM — client name + address only (no mobile / email) */}
                <section className="rounded-sm border border-stone-400 px-3 py-2.5">
                  <p className="text-[11px] font-extrabold uppercase tracking-[0.08em]">From</p>
                  <p className="mt-1 text-sm font-bold">
                    {courierFrom.name.trim() || '—'}
                  </p>
                  {courierFrom.address.trim() ? (
                    <p className="mt-0.5 whitespace-pre-wrap text-sm text-stone-800">
                      {courierFrom.address}
                    </p>
                  ) : (
                    <p className="mt-0.5 text-sm text-stone-400">Client address will load from project</p>
                  )}
                </section>
                    </div>
                  </div>
              </div>
              </div>

              <aside className="flex w-[9.5rem] shrink-0 flex-col gap-2 border-l border-stone-400 bg-stone-50 px-2.5 py-4 sm:w-[11rem] sm:px-3">
                <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-stone-500">
                  Slip options
                </p>
                <Button
                  type="button"
                  variant="outline"
                  className={cn(
                    limsOutlineBtnClass,
                    'h-9 w-full justify-center px-2 text-xs font-semibold',
                    courierIncludeBlv && 'border-amber-700 bg-amber-100 text-amber-950',
                  )}
                  disabled={disabled || courierBusy}
                  onClick={() => setCourierIncludeBlv((v) => !v)}
                >
                  Add BLV
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className={cn(
                    limsOutlineBtnClass,
                    'h-9 w-full justify-center px-2 text-xs font-semibold',
                    courierIncludeMobile && 'border-amber-700 bg-amber-100 text-amber-950',
                  )}
                  disabled={disabled || courierBusy}
                  onClick={() => setCourierIncludeMobile((v) => !v)}
                >
                  Add Mobile
                </Button>
                <div className="mt-1 space-y-1.5 border-t border-stone-300 pt-2">
                  <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-stone-500">
                    Test Request per page
                  </p>
                  <Select
                    value={String(courierPerPage)}
                    onValueChange={(v) => setCourierPerPage(normalizeCourierSlipPerPage(v))}
                    disabled={disabled || courierBusy}
                  >
                    <SelectTrigger
                      className={cn(
                        limsFieldClass,
                        'h-9 w-full rounded-none border-stone-400 bg-white px-2 text-xs font-semibold',
                      )}
                      aria-label="Test Request per page"
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="z-[80]">
                      {([1, 2, 3, 4] as const).map((n) => (
                        <SelectItem key={n} value={String(n)} className="text-xs font-semibold">
                          {n} per page
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </aside>
            </div>
          ) : null}

          <DialogFooter className="shrink-0 gap-2 border-t border-stone-300 bg-stone-50 px-4 py-3 sm:justify-between">
            <Button
              type="button"
              variant="outline"
              className={cn(limsOutlineBtnClass, 'h-9')}
              disabled={courierBusy}
              onClick={() => {
                setCourierFormOpen(false)
                setCourierDraft(null)
                setCourierQrDataUrl('')
                setCourierFrom({ name: '', address: '', isNumber: '', applicationNo: '' })
              }}
            >
              Close
            </Button>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                className={cn(limsOutlineBtnClass, 'h-9 gap-1.5')}
                disabled={disabled || courierBusy || !courierDraft}
                onClick={handleCourierPrint}
              >
                Print
              </Button>
              <Button
                type="button"
                className={cn(limsPrimaryBtnClass, 'h-9 gap-1.5')}
                disabled={disabled || courierBusy || !courierDraft}
                onClick={handleCourierDownload}
              >
                <FileDown className="h-4 w-4" aria-hidden />
                {courierBusy ? 'Preparing…' : 'Download PDF'}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={testReportGenerateOpen}
        onOpenChange={(open) => {
          if (!open) {
            setTestReportGenerateOpen(false)
            setTestReportGenerateBusy(false)
            setTestReportGenerateLoading(false)
            setTestReportGenerateSampleId(null)
            setTestReportPreviewContext(null)
            setTestReportQcSignatureUrl('')
          }
        }}
      >
        <DialogContent
          persistOnFocusLoss
          layer="top"
          aria-describedby={undefined}
          className={cn(
            'flex !flex-col gap-0 overflow-hidden p-0',
            '!flex h-[100dvh] max-h-[100dvh] translate-x-0 translate-y-0 rounded-none border-0 bg-stone-100 shadow-none sm:rounded-none',
            'left-[var(--app-dialog-overlay-left,0px)] top-0 right-0',
            'w-[calc(100vw-var(--app-dialog-overlay-left,0px))] max-w-none',
            'border-stone-600 ring-1 ring-amber-700/20',
          )}
        >
          <div className="relative shrink-0 overflow-hidden bg-gradient-to-br from-stone-800 via-stone-900 to-stone-950 px-4 py-2.5 text-white">
            <div
              className="pointer-events-none absolute inset-0 opacity-[0.18]"
              style={limsDarkBarGlowStyle}
            />
            <div className="absolute bottom-0 left-0 h-[2px] w-full bg-gradient-to-r from-amber-500 via-amber-300 to-transparent" />
            <DialogHeader className="relative pr-10 text-left">
              <DialogTitle className="text-base font-semibold tracking-tight text-white">
                Generate Test Report
              </DialogTitle>
            </DialogHeader>
          </div>

          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            {testReportGenerateLoading ? (
              <p className="py-8 text-center text-sm text-stone-500">Loading Test Report module…</p>
            ) : (
              <FactoryTestReportModuleFields
                value={testReportGeneratePayload}
                onChange={setTestReportGeneratePayload}
                disabled={disabled || testReportGenerateBusy}
                sampleOptions={rows}
                isCodeId={isCodeId}
                isCodeLabel={
                  isCodeLabel.trim() ||
                  [isCodeSearch, isCodeRevisionYear].filter(Boolean).join(': ') ||
                  ''
                }
                focusSampleRowId={testReportGenerateSampleId}
                previewContext={testReportPreviewContext}
                testedBySignatureImageUrl={testReportQcSignatureUrl}
                projectId={projectId}
              />
            )}
          </div>

          <DialogFooter className="shrink-0 gap-2 border-t border-stone-300 bg-stone-50 px-4 py-3 sm:justify-between">
            <Button
              type="button"
              variant="outline"
              className={cn(limsOutlineBtnClass, 'h-9')}
              disabled={testReportGenerateBusy}
              onClick={() => {
                setTestReportGenerateOpen(false)
                setTestReportGenerateSampleId(null)
                setTestReportPreviewContext(null)
                setTestReportQcSignatureUrl('')
              }}
            >
              Close
            </Button>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                className={cn(limsOutlineBtnClass, 'h-9')}
                disabled={disabled || testReportGenerateBusy || testReportGenerateLoading}
                onClick={handleGenerateTestReportSave}
              >
                Save
              </Button>
              <Button
                type="button"
                variant="outline"
                className={cn(limsOutlineBtnClass, 'h-9 gap-1.5')}
                disabled={disabled || testReportGenerateBusy || testReportGenerateLoading}
                onClick={handleGenerateTestReportPrint}
              >
                Print
              </Button>
              <Button
                type="button"
                className={cn(limsPrimaryBtnClass, 'h-9 gap-1.5')}
                disabled={disabled || testReportGenerateBusy || testReportGenerateLoading}
                onClick={handleGenerateTestReportDownload}
              >
                <FileDown className="h-4 w-4" aria-hidden />
                {testReportGenerateBusy ? 'Preparing…' : 'Download PDF'}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={importDialogOpen}
        onOpenChange={(open) => {
          if (!open) closeImportDialog()
        }}
      >
        <DialogContent
          persistOnFocusLoss
          layer="stacked"
          aria-describedby={undefined}
          className={cn(limsDialogClass, 'max-w-2xl overflow-hidden bg-white')}
        >
          <div className="relative shrink-0 overflow-hidden bg-gradient-to-br from-stone-800 via-stone-900 to-stone-950 px-4 py-2.5 text-white">
            <div
              className="pointer-events-none absolute inset-0 opacity-[0.18]"
              style={limsDarkBarGlowStyle}
            />
            <div className="absolute bottom-0 left-0 h-[2px] w-full bg-gradient-to-r from-amber-500 via-amber-300 to-transparent" />
            <DialogHeader className="relative pr-10 text-left">
              <DialogTitle className="text-base font-semibold tracking-tight text-white">
                {importStep === 'choose' ? 'Import QR Code' : 'Import from Application'}
              </DialogTitle>
            </DialogHeader>
          </div>

          {importStep === 'choose' ? (
            <div className="grid grid-cols-1 gap-3 px-4 py-4 sm:grid-cols-2">
              <button
                type="button"
                disabled={disabled}
                onClick={openFromAppStep}
                className="flex h-full min-w-0 items-center gap-2 rounded-none border border-stone-400 bg-[#fffcf7] px-3 py-3 text-left transition-colors hover:border-amber-600 hover:bg-amber-50"
              >
                <FolderInput className="h-5 w-5 shrink-0 text-amber-800" aria-hidden />
                <span className="text-sm font-semibold text-stone-800">
                  From Another Application
                </span>
              </button>
              <button
                type="button"
                disabled={disabled || importBusy}
                onClick={handleImportFromManak}
                className="flex h-full min-w-0 items-center gap-2 rounded-none border border-stone-400 bg-[#fffcf7] px-3 py-3 text-left transition-colors hover:border-amber-600 hover:bg-amber-50"
              >
                <Globe className="h-5 w-5 shrink-0 text-amber-800" aria-hidden />
                <span className="text-sm font-semibold text-stone-800">From Manak Online</span>
              </button>
            </div>
          ) : (
            <div className="space-y-3 px-4 py-4">
              {qrSourcesLoading ? (
                <p className="py-4 text-center text-sm text-stone-500">Loading applications…</p>
              ) : qrSources.length === 0 ? (
                <div className="space-y-3 rounded-none border border-stone-400 bg-[#fffcf7] p-3">
                  <p className="text-sm text-stone-700">
                    No unused QR codes found on other applications for this client. Import from
                    Manak Online instead.
                  </p>
                  <Button
                    type="button"
                    className={cn(limsPrimaryBtnClass, 'h-9 gap-1.5')}
                    disabled={disabled || importBusy}
                    onClick={handleImportFromManak}
                  >
                    <Globe className="h-4 w-4" aria-hidden />
                    Import from Manak Online
                  </Button>
                </div>
              ) : (
                <>
                  <div className="min-w-0 space-y-1">
                    <Label className="text-[11px] font-semibold text-stone-700">
                      Application / License
                    </Label>
                    <Select value={selectedSourceId} onValueChange={setSelectedSourceId}>
                      <SelectTrigger className="h-9 rounded-none">
                        <SelectValue placeholder="Select application" />
                      </SelectTrigger>
                      <SelectContent>
                        {qrSources.map((src) => (
                          <SelectItem key={src.projectId} value={src.projectId}>
                            {src.label} · {src.unusedCount} unused
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  {selectedSourceId ? (
                    <p className="text-xs font-medium text-amber-900">
                      Will transfer{' '}
                      {qrSources.find((s) => s.projectId === selectedSourceId)?.unusedCount ?? 0}{' '}
                      unused QR code(s).
                    </p>
                  ) : null}
                </>
              )}
            </div>
          )}

          <DialogFooter className="shrink-0 gap-2 border-t border-stone-300 bg-stone-100 px-4 py-3 sm:justify-between">
            {importStep === 'from-app' ? (
              <Button
                type="button"
                variant="outline"
                className={limsOutlineBtnClass}
                disabled={transferBusy}
                onClick={() => setImportStep('choose')}
              >
                Back
              </Button>
            ) : (
              <span />
            )}
            <div className="flex flex-wrap gap-2 sm:justify-end">
              <Button
                type="button"
                variant="outline"
                className={limsOutlineBtnClass}
                disabled={transferBusy}
                onClick={closeImportDialog}
              >
                Cancel
              </Button>
              {importStep === 'from-app' && qrSources.length > 0 ? (
                <Button
                  type="button"
                  className={limsPrimaryBtnClass}
                  disabled={disabled || transferBusy || !selectedSourceId}
                  onClick={handleTransferFromApp}
                >
                  {transferBusy ? 'Transferring…' : 'Transfer Unused QR'}
                </Button>
              ) : null}
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={addChooserOpen} onOpenChange={setAddChooserOpen}>
        <DialogContent
          persistOnFocusLoss
          layer="stacked"
          aria-describedby={undefined}
          className={cn(limsDialogClass, 'max-w-md overflow-hidden bg-white')}
        >
          <div className="relative shrink-0 overflow-hidden bg-gradient-to-br from-stone-800 via-stone-900 to-stone-950 px-4 py-2.5 text-white">
            <div
              className="pointer-events-none absolute inset-0 opacity-[0.18]"
              style={limsDarkBarGlowStyle}
            />
            <div className="absolute bottom-0 left-0 h-[2px] w-full bg-gradient-to-r from-amber-500 via-amber-300 to-transparent" />
            <DialogHeader className="relative pr-10 text-left">
              <DialogTitle className="text-base font-semibold tracking-tight text-white">
                {chooserPurpose === 'copy' ? 'Copy Sample' : 'Add Sample'}
              </DialogTitle>
            </DialogHeader>
          </div>
          <div className="space-y-3 px-4 py-4">
            <div className="min-w-0 space-y-1">
              <Label className="text-[11px] font-semibold text-stone-700">
                {chooserPurpose === 'copy' ? 'Copy Sample As' : 'Add Sample As'}
              </Label>
              <Select
                value={addMode}
                onValueChange={(v) => {
                  const mode = v === 'with-qr' ? 'with-qr' : 'without-qr'
                  setAddMode(mode)
                  if (mode === 'with-qr') setSelectedQr(availableQrCodes[0] ?? '')
                }}
              >
                <SelectTrigger className="h-9 rounded-none">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="without-qr">Without QR Code</SelectItem>
                  <SelectItem value="with-qr">With QR Code</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-stone-600">
                {addMode === 'with-qr'
                  ? 'Select an imported unused QR code, then continue.'
                  : chooserPurpose === 'copy'
                    ? 'Copies the selected (or last) sample without a QR code.'
                    : 'Adds a copy of the row above — no QR selection needed.'}
              </p>
            </div>

            {addMode === 'with-qr' ? (
              availableQrCodes.length > 0 ? (
                <div className="min-w-0 space-y-1">
                  <Label className="text-[11px] font-semibold text-stone-700">QR Code</Label>
                  <Select value={selectedQr} onValueChange={setSelectedQr}>
                    <SelectTrigger className="h-9 rounded-none">
                      <SelectValue placeholder="Select QR code" />
                    </SelectTrigger>
                    <SelectContent>
                      {availableQrCodes.map((code) => (
                        <SelectItem key={code} value={code}>
                          {code}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ) : (
                <div className="space-y-2 rounded-none border border-stone-400 bg-[#fffcf7] p-3">
                  <p className="text-xs text-stone-700">
                    No unused QR codes yet. Import from Manak (extension + captcha), then select
                    here.
                  </p>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className={cn(limsOutlineBtnClass, 'h-8 gap-1.5 px-3 text-xs')}
                    disabled={disabled || importBusy}
                    onClick={handleImportCodes}
                  >
                    <Download className="h-3.5 w-3.5" aria-hidden />
                    {importBusy ? 'Importing…' : 'Import QR Code'}
                  </Button>
                </div>
              )
            ) : null}
          </div>
          <DialogFooter className="border-t border-stone-200 bg-stone-50 px-4 py-3 sm:justify-end">
            <Button
              type="button"
              variant="outline"
              className={limsOutlineBtnClass}
              onClick={() => setAddChooserOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              className={limsPrimaryBtnClass}
              disabled={addMode === 'with-qr' && availableQrCodes.length === 0}
              onClick={confirmAddSample}
            >
              {chooserPurpose === 'copy' ? 'Copy' : 'Add'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={editIndex != null && draft != null}
        onOpenChange={(open) => {
          if (!open) closeEdit()
        }}
      >
        <DialogContent
          persistOnFocusLoss
          layer="stacked"
          aria-describedby={undefined}
          className={cn(
            limsDialogClass,
            'flex !flex-col gap-0 overflow-hidden bg-white p-0',
            'w-[min(56rem,calc(100vw-1.5rem))] max-w-[56rem] max-h-[min(92vh,900px)]',
          )}
        >
          <div className="relative shrink-0 overflow-hidden bg-gradient-to-br from-stone-800 via-stone-900 to-stone-950 px-4 py-3 text-white">
            <div
              className="pointer-events-none absolute inset-0 opacity-[0.18]"
              style={limsDarkBarGlowStyle}
            />
            <div className="absolute bottom-0 left-0 h-[2px] w-full bg-gradient-to-r from-amber-500 via-amber-300 to-transparent" />
            <DialogHeader className="relative pr-10 text-left">
              <DialogTitle className="text-base font-semibold tracking-tight text-white">
                {editIndex != null &&
                editIndex < rows.length &&
                oslSampleRowHasContent(rows[editIndex]!)
                  ? 'Edit Sample'
                  : 'Add Sample'}
              </DialogTitle>
            </DialogHeader>
          </div>

          {draft ? (
            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain bg-gradient-to-b from-stone-100/90 to-white px-4 py-4 [-webkit-overflow-scrolling:touch]">
              <FormSection title="Sample Identity">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <Field label="Sample For">
                    <Select
                      value={draft.sampleFor}
                      onValueChange={(v) => patchDraft('sampleFor', v as OslSampleFor)}
                    >
                      <SelectTrigger className={cn(limsFieldClass, 'h-9')}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="osl">OSL</SelectItem>
                        <SelectItem value="ft">FT</SelectItem>
                        <SelectItem value="it">IT</SelectItem>
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field label="Priority">
                    <Select
                      value={draft.priority}
                      onValueChange={(v) => patchDraft('priority', v as OslSamplePriority)}
                    >
                      <SelectTrigger className={cn(limsFieldClass, 'h-9')}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Priority">Priority</SelectItem>
                        <SelectItem value="Non Priority">Non Priority</SelectItem>
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field label="Sample Type" htmlFor="osl-sample-type">
                    <Input
                      id="osl-sample-type"
                      className={cn(limsFieldClass, 'h-9')}
                      value={draft.sampleType}
                      onChange={(e) => patchDraft('sampleType', e.target.value)}
                    />
                  </Field>
                  <Field label="Serial Number" htmlFor="osl-serial">
                    <Input
                      id="osl-serial"
                      className={cn(limsFieldClass, 'h-9')}
                      value={draft.serialNumber}
                      onChange={(e) => patchDraft('serialNumber', e.target.value)}
                    />
                  </Field>
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <Field label="Sample Code" htmlFor="osl-sample-code">
                    <Input
                      id="osl-sample-code"
                      className={cn(limsFieldClass, 'h-9')}
                      value={draft.sampleCode}
                      onChange={(e) => patchDraft('sampleCode', e.target.value)}
                    />
                  </Field>
                  <Field label="QR Code" htmlFor="osl-qr-code">
                    <Input
                      id="osl-qr-code"
                      className={cn(limsFieldClass, 'h-9 tabular-nums')}
                      value={draft.qrCode}
                      onChange={(e) => patchDraft('qrCode', e.target.value)}
                      placeholder="12-digit Manak QR (optional)"
                    />
                  </Field>
                </div>
              </FormSection>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 rounded-none border border-stone-300 bg-[#fffcf7] p-3 sm:p-3.5">
                <Field label="Shelf Life" htmlFor="osl-shelf">
                  <Input
                    id="osl-shelf"
                    className={cn(limsFieldClass, 'h-9')}
                    value={draft.shelfLife}
                    onChange={(e) => patchDraft('shelfLife', e.target.value)}
                  />
                </Field>
                <Field label="Mode Of Disposal" htmlFor="osl-disposal">
                  <Input
                    id="osl-disposal"
                    className={cn(limsFieldClass, 'h-9')}
                    value={draft.modeOfDisposal}
                    onChange={(e) => patchDraft('modeOfDisposal', e.target.value)}
                  />
                </Field>
                <Field label="Test Required" htmlFor="osl-test">
                  <Input
                    id="osl-test"
                    className={cn(limsFieldClass, 'h-9')}
                    value={draft.testRequired}
                    onChange={(e) => patchDraft('testRequired', e.target.value)}
                  />
                </Field>
                <Field label="Batch Quantity" htmlFor="osl-batch-qty">
                  <Input
                    id="osl-batch-qty"
                    className={cn(limsFieldClass, 'h-9')}
                    value={draft.batchQuantity}
                    onChange={(e) => patchDraft('batchQuantity', e.target.value)}
                  />
                </Field>
              </div>

              <FormSection title="Product & Batch">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <Field label="Grade / Type / Variety / Size / Class / Rating" htmlFor="osl-grade">
                    <Textarea
                      id="osl-grade"
                      rows={2}
                      className={cn(limsFieldClass, 'h-[4.5rem] min-h-[4.5rem] resize-none py-2')}
                      value={draft.gradeTypeVariety}
                      onChange={(e) => patchDraft('gradeTypeVariety', e.target.value)}
                    />
                  </Field>
                  <Field label="Declared Value" htmlFor="osl-declared">
                    <Textarea
                      id="osl-declared"
                      rows={2}
                      className={cn(limsFieldClass, 'h-[4.5rem] min-h-[4.5rem] resize-none py-2')}
                      value={draft.declaredValue}
                      onChange={(e) => patchDraft('declaredValue', e.target.value)}
                    />
                  </Field>
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <Field label="Batch Number" htmlFor="osl-batch">
                    <Input
                      id="osl-batch"
                      className={cn(limsFieldClass, 'h-9')}
                      value={draft.batchNumber}
                      onChange={(e) => patchDraft('batchNumber', e.target.value)}
                    />
                  </Field>
                  <Field label="Date of Manufacturing" htmlFor="osl-dom">
                    <LimsFieldWithAdd
                      className="h-9"
                      addButton={
                        <button
                          type="button"
                          className={cn(limsFieldAddBtnClass, 'w-9')}
                          aria-label="Open calendar"
                          title="Pick date"
                          onClick={() => openDatePicker(manufacturingDateRef.current)}
                        >
                          <Calendar size={14} strokeWidth={2.25} aria-hidden />
                        </button>
                      }
                    >
                      <Input
                        ref={manufacturingDateRef}
                        id="osl-dom"
                        type="date"
                        className={dateInputClass}
                        value={draft.dateOfManufacturing}
                        onChange={(e) => patchDraft('dateOfManufacturing', e.target.value)}
                      />
                    </LimsFieldWithAdd>
                  </Field>
                  <Field label="Sample Quantity" htmlFor="osl-qty">
                    <Input
                      id="osl-qty"
                      className={cn(limsFieldClass, 'h-9')}
                      value={draft.sampleQuantity}
                      onChange={(e) => patchDraft('sampleQuantity', e.target.value)}
                    />
                  </Field>
                </div>
              </FormSection>

              <FormSection title="Laboratory">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <Field label="Name of the Laboratory" htmlFor="osl-lab">
                    <RemoteLookupCombobox
                      inputId="osl-lab"
                      listId="osl-lab-list"
                      placeholder="Select testing laboratory…"
                      label={draft.laboratoryName}
                      selectedId={labClientId}
                      search={searchTestingLaboratoryClientOptions}
                      onChange={({ id, label }) => {
                        const lab = label
                        setLabClientId(id)
                        setDraft({
                          ...draft,
                          laboratoryName: lab,
                          destinationLab:
                            !draft.destinationLab.trim() ||
                            draft.destinationLab === draft.laboratoryName
                              ? lab
                              : draft.destinationLab,
                        })
                        void fetchTestingLaboratoryAddressByName(lab)
                          .then((address) => {
                            if (!address) return
                            setDraft((prev) => {
                              if (!prev) return prev
                              const current = prev.destinationLab.trim()
                              const name = prev.laboratoryName.trim().toLowerCase()
                              if (!current || current.toLowerCase() === name) {
                                return { ...prev, destinationLab: address }
                              }
                              return prev
                            })
                          })
                          .catch(() => {
                            /* keep lab name as destination */
                          })
                      }}
                    />
                  </Field>
                  <Field label="Destination Lab" htmlFor="osl-dest-lab">
                    <Input
                      id="osl-dest-lab"
                      className={cn(limsFieldClass, 'h-9')}
                      value={draft.destinationLab}
                      onChange={(e) => patchDraft('destinationLab', e.target.value)}
                    />
                  </Field>
                </div>
              </FormSection>

              <FormSection title="Description">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <Field label="Sample Description" htmlFor="osl-desc">
                    <Textarea
                      id="osl-desc"
                      rows={1}
                      className={cn(limsFieldClass, 'h-9 min-h-9 resize-none py-2')}
                      value={draft.sampleDescription}
                      onChange={(e) => patchDraft('sampleDescription', e.target.value)}
                    />
                  </Field>
                  <Field label="Additional Information" htmlFor="osl-extra">
                    <Textarea
                      id="osl-extra"
                      rows={1}
                      className={cn(limsFieldClass, 'h-9 min-h-9 resize-none py-2')}
                      value={draft.additionalInformation}
                      onChange={(e) => patchDraft('additionalInformation', e.target.value)}
                    />
                  </Field>
                </div>
              </FormSection>

              <FormSection title="Payment & Print">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <Field label="Testing Charges" htmlFor="osl-charges">
                    <Input
                      id="osl-charges"
                      className={cn(limsFieldClass, 'h-9')}
                      value={draft.testingCharges}
                      onChange={(e) => patchDraft('testingCharges', e.target.value)}
                    />
                  </Field>
                  <Field label="UTR / UPI / Cheque No." htmlFor="osl-pay-ref">
                    <Input
                      id="osl-pay-ref"
                      className={cn(limsFieldClass, 'h-9')}
                      value={draft.paymentRef}
                      onChange={(e) => patchDraft('paymentRef', e.target.value)}
                    />
                  </Field>
                  <Field label="Mode of Payment" htmlFor="osl-pay-mode">
                    <Input
                      id="osl-pay-mode"
                      className={cn(limsFieldClass, 'h-9')}
                      value={draft.paymentMode}
                      onChange={(e) => patchDraft('paymentMode', e.target.value)}
                    />
                  </Field>
                  <Field label="Date of Transaction" htmlFor="osl-pay-date">
                    <LimsFieldWithAdd
                      className="h-9"
                      addButton={
                        <button
                          type="button"
                          className={cn(limsFieldAddBtnClass, 'w-9')}
                          aria-label="Open calendar"
                          title="Pick date"
                          onClick={() => openDatePicker(paymentDateRef.current)}
                        >
                          <Calendar size={14} strokeWidth={2.25} aria-hidden />
                        </button>
                      }
                    >
                      <Input
                        ref={paymentDateRef}
                        id="osl-pay-date"
                        type="date"
                        className={dateInputClass}
                        value={draft.paymentDate}
                        onChange={(e) => patchDraft('paymentDate', e.target.value)}
                      />
                    </LimsFieldWithAdd>
                  </Field>
                </div>
              </FormSection>
            </div>
          ) : null}

          <DialogFooter className="shrink-0 gap-2 border-t border-stone-300 bg-stone-100 px-4 py-3 sm:justify-end">
            <Button
              type="button"
              variant="outline"
              className={limsOutlineBtnClass}
              onClick={closeEdit}
            >
              Cancel
            </Button>
            <Button type="button" className={limsPrimaryBtnClass} onClick={saveEdit}>
              Save Sample
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
