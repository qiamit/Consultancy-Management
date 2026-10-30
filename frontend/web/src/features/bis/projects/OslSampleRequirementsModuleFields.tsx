import { useEffect, useMemo, useRef, useState, type ChangeEvent, type ReactNode } from 'react'
import {
  Calendar,
  Copy,
  Download,
  ExternalLink,
  FileCheck2,
  FileDown,
  FileText,
  FolderInput,
  Globe,
  Loader2,
  Mic,
  MicOff,
  Paperclip,
  Sparkles,
  X,
  Package,
  Pencil,
  Plus,
  Trash2,
  Upload,
} from 'lucide-react'
import QRCode from 'qrcode'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { useConfirmDialog } from '@/components/ui/useConfirmDialog'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { useVoiceInput } from '../shared/useVoiceInput'
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
import { getCurrencyCode, getCurrencySymbol } from '@/lib/appCurrency'
import { formatMoneyInput, sanitizeMoneyInput } from '@/features/masters/products-services/types'
import { RemoteLookupCombobox } from '@/features/bis/shared/RemoteLookupCombobox'
import { MasterOptionFieldWithAdd } from './MasterOptionFieldWithAdd'
import { fetchBisProjectById, fetchIsCodeTestingCharges, fetchTestingLaboratoryAddressByName } from './bisProjectsApi'
import { fetchBisModulePayload, resolveTechnicalStaffForTestedBy } from './bisModuleDataApi'
import {
  applySampleToFactoryTestReport,
  emptyFactoryTestReportEntry,
  parseFactoryTestReportPayload,
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
import { loadBisPrintData } from '../print/loadBisPrintData'
import { openPendingPrintWindow, openPrintHtml } from '../print/openPrintHtml'
import {
  buildManakTrPayload,
  importManakQrCodes,
  openManakTestRequestFill,
  newManakReturnToken,
  pollManakPdfInbox,
  registerManakPdfInbox,
  subscribeManakQrImport,
  subscribeManakTestRequestResult,
  ackManakTestRequestResult,
  type ManakTrResult,
} from './manakExtensionBridge'
import {
  createBisProjectFileUrls,
  deleteBisProjectFile,
  listBisProjectFiles,
  uploadBisProjectFile,
} from './bisProjectFilesApi'
import { downloadMergedOslTestRequestPdfs } from './mergeOslTestRequestPdfs'
import {
  assertManakAccountBelongsToOnlyFirm,
  collectUnavailableOslQrCodes,
  claimImportedOslQrCodes,
  listOslQrSourceProjects,
  persistScrubbedOslQrPool,
  removeUnusedOslQrCode,
  scrubUnavailableImportedQrCodes,
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
  type OslSampleConformity,
  type OslSampleRequirementRow,
  type OslSampleRequirementsModulePayload,
} from './oslSampleRequirementsModel'
import { formatDisplayDate } from './types'
import {
  findLaboratoryOslCodeByName,
  searchLaboratoryMasterOptions,
} from '@/features/masters/laboratories/laboratoriesApi'
import { openFileInNewTab } from '@/lib/fileViewer'

const thClass =
  'bg-stone-800 text-center text-[10px] font-bold uppercase tracking-[0.12em] text-amber-200'
const actionBtnClass =
  'inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-none p-0 text-amber-900 hover:bg-amber-100 hover:text-amber-950'
const OSL_SAMPLE_FOR_OPTIONS = [
  { id: 'osl', label: 'OSL' },
  { id: 'ft', label: 'FT' },
  { id: 'it', label: 'IT' },
]
const OSL_SAMPLE_PRIORITY_OPTIONS = [
  { id: 'Priority', label: 'Priority' },
  { id: 'Non Priority', label: 'Non Priority' },
]
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

/** One Extension run for a sample row; `done` once its PDF is taken (or being taken). */
type ManakTrRun = { token: string; startedAt: number; done: boolean }

const MANAK_TR_RUN_MAX_AGE_MS = 24 * 60 * 60 * 1000

// Kept in sessionStorage so a reload of this tab mid-run still accepts the PDF.
function manakTrRunsKey(projectId: string): string {
  return `qe-manak-tr-runs:${projectId}`
}

function loadManakTrRuns(projectId: string): Map<string, ManakTrRun> {
  try {
    const raw = window.sessionStorage.getItem(manakTrRunsKey(projectId))
    const parsed = raw ? (JSON.parse(raw) as Record<string, ManakTrRun>) : {}
    const cutoff = Date.now() - MANAK_TR_RUN_MAX_AGE_MS
    return new Map(Object.entries(parsed).filter(([, run]) => run && run.startedAt >= cutoff))
  } catch {
    return new Map()
  }
}

function saveManakTrRuns(projectId: string, runs: Map<string, ManakTrRun>): void {
  try {
    window.sessionStorage.setItem(manakTrRunsKey(projectId), JSON.stringify(Object.fromEntries(runs)))
  } catch {
    /* storage blocked: runs still work for this page */
  }
}

const SAMPLE_CONFORMITY_UNSET = 'not-decided'

/** Conformity of sample as per IS: Yes / No from the lab report, or not decided yet. Manak's Test Report step asks for it. */
function SampleConformitySelect({
  value,
  onChange,
  disabled,
  id,
  className,
  ariaLabel = 'Conformity of sample as per IS',
  needed = false,
}: {
  value: OslSampleConformity
  onChange: (next: OslSampleConformity) => void
  disabled?: boolean
  id?: string
  className?: string
  ariaLabel?: string
  /** Highlight a missing answer (the sample has a QR code, so it goes to Manak). */
  needed?: boolean
}) {
  const missing = needed && !value
  return (
    <Select
      value={value || SAMPLE_CONFORMITY_UNSET}
      onValueChange={(v) => onChange(v === 'Yes' || v === 'No' ? v : '')}
      disabled={disabled}
    >
      <SelectTrigger
        id={id}
        className={cn(
          limsFieldClass,
          'rounded-none',
          !value && 'text-stone-500',
          missing && 'border-amber-600 bg-amber-50',
          className,
        )}
        aria-label={ariaLabel}
        title={missing ? 'Set from the lab report — Manak’s Test Report step needs it for this QR code' : undefined}
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent className="z-[80]">
        <SelectItem value={SAMPLE_CONFORMITY_UNSET}>Not Decided</SelectItem>
        <SelectItem value="Yes">Yes</SelectItem>
        <SelectItem value="No">No</SelectItem>
      </SelectContent>
    </Select>
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
  qrOnlyFields = false,
  onAiFill,
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
  /** Sample code, QR code, laboratory, description, additional information and payment fields only for samples that have a QR code; a sample without one defaults to FT. */
  qrOnlyFields?: boolean
  /** An AI helper for the sample form: gets the current values and the user's instruction, returns the fields to fill. */
  onAiFill?: (current: OslSampleRequirementRow, instruction: string, files: File[]) => Promise<Partial<OslSampleRequirementRow>>
  onPrintTestRequest?: (row: OslSampleRequirementRow) => void
  onPrintTestReport?: (row: OslSampleRequirementRow) => void
  /** @deprecated Courier Slip now opens a read-only A4 preview (print + PDF download). */
  onPrintCourierSlip?: (row: OslSampleRequirementRow) => void
}) {
  const rows = value.rows
  /** Without a QR code on any sample the QR code, sample code and conformity columns are not needed. */
  const showQrCols = !qrOnlyFields || rows.some((r) => r.qrCode.trim() !== '')
  const [confirm, confirmDialog] = useConfirmDialog({ layer: 'top' })
  const [editIndex, setEditIndex] = useState<number | null>(null)
  const [draft, setDraft] = useState<OslSampleRequirementRow | null>(null)
  const [declaredValueUploadBusy, setDeclaredValueUploadBusy] = useState(false)
  const [testingChargesFocused, setTestingChargesFocused] = useState(false)
  const declaredValueFileInputRef = useRef<HTMLInputElement | null>(null)
  const declaredValueClickTimer = useRef<number | null>(null)
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
  const [qrRemoveBusyCode, setQrRemoveBusyCode] = useState('')
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
  const [extensionBusyId, setExtensionBusyId] = useState<string | null>(null)
  const [mergeBusy, setMergeBusy] = useState(false)
  // Extension runs started from this tab, per sample row (see loadManakTrRuns).
  const manakTrRunsRef = useRef<{ projectId: string; runs: Map<string, ManakTrRun> } | null>(null)
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
  const draftIdForCharges = draft?.id ?? null
  const draftChargesValue = draft?.testingCharges ?? null

  useEffect(() => {
    if (!draftIdForCharges || !isCodeId || draftChargesValue?.trim()) return
    let cancelled = false
    void fetchIsCodeTestingCharges(isCodeId)
      .then((charges) => {
        if (cancelled || charges == null) return
        setDraft((current) => current?.id === draftIdForCharges && !current.testingCharges.trim()
          ? { ...current, testingCharges: charges.toFixed(2) }
          : current)
      })
      .catch((error: unknown) => {
        if (!cancelled) toast.error(error instanceof Error ? error.message : 'Could not load IS testing charges.')
      })
    return () => { cancelled = true }
  }, [draftChargesValue, draftIdForCharges, isCodeId])

  const manakTrRuns = (pid: string) => {
    if (manakTrRunsRef.current?.projectId !== pid) {
      manakTrRunsRef.current = { projectId: pid, runs: loadManakTrRuns(pid) }
    }
    return manakTrRunsRef.current.runs
  }

  /**
   * The extension hands one Manak PDF over several times: direct inject, bridge
   * chunks, stored-result replays (page load, focus, timers, every app tab) and
   * the inbox poll. Attach only for a run started from this tab, once per run;
   * replays after that run (or after a Delete) are ignored.
   */
  const attachManakPdfToSample = async (result: ManakTrResult, returnToken?: string) => {
    const pid = (projectId ?? '').trim()
    if (!pid) {
      toast.error('Save the BIS Project First, Then Run Extension Again.')
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
      toast.error('Could Not Match Manak PDF to a Sample Row.')
      return
    }
    const row = current.rows[index]!
    const pdfName =
      result.pdfName.replace(/[^\w.\-]+/g, '_') ||
      `Test_Request_${result.sample_code || row.id}.pdf`
    const runs = manakTrRuns(pid)
    const run = runs.get(row.id)
    // Poll results name their token; page messages count for the run unless the
    // PDF was captured before it started (a replay of an older run).
    const isThisRun = Boolean(run) && (returnToken
      ? returnToken === run!.token
      : !result.filledAt || result.filledAt >= run!.startedAt)
    if (!run || !isThisRun) return
    if (run.done) {
      // Already attached for this run: let the extension drop its stored copy (stops the replays).
      ackManakTestRequestResult(row.id)
      return
    }
    // Claim before the upload, so a delivery arriving mid-upload is ignored too.
    run.done = true
    saveManakTrRuns(pid, runs)
    let uploaded: Awaited<ReturnType<typeof uploadBisProjectFile>>
    try {
      const binary = Uint8Array.from(atob(result.pdfBase64), (c) => c.charCodeAt(0))
      const file = new File([binary], pdfName, { type: 'application/pdf' })
      uploaded = await uploadBisProjectFile(pid, file, 'osl-sample-test-request', {
        displayName: pdfName,
      })
    } catch (err) {
      // Let a later delivery of the same PDF try again.
      run.done = false
      saveManakTrRuns(pid, runs)
      throw err
    }
    // A row deleted while the upload ran: nothing to attach to.
    const latest = valueRef.current
    if (!latest.rows.some((r) => r.id === row.id)) return
    const nextRows = latest.rows.map((r) =>
      r.id === row.id
        ? {
            ...r,
            sampleCode: result.sample_code.trim() || r.sampleCode,
            testRequestFileId: uploaded.id,
            testRequestFileName: uploaded.file_name,
            testRequestStoragePath: uploaded.storage_path,
          }
        : r,
    )
    onChangeRef.current({ ...latest, rows: nextRows })
    setExtensionBusyId((prev) => (prev === row.id ? null : prev))
    ackManakTestRequestResult(row.id)
    toast.success(`Test Request PDF attached${result.sample_code ? ` (${result.sample_code})` : ''}`)
  }

  useEffect(() => {
    return subscribeManakQrImport(
      projectId,
      (codes, sourcePortalUserId) => {
      const expectedPortalUserId = String(portalUserId ?? '').replace(/\s+/g, '').toLowerCase()
      const importedPortalUserId = String(sourcePortalUserId ?? '').replace(/\s+/g, '').toLowerCase()
      if (!expectedPortalUserId || !importedPortalUserId || importedPortalUserId !== expectedPortalUserId) {
        toast.error(
          'QR import stopped: the signed-in Manak account does not match this firm. Sign out, then retry from this firm’s project.',
        )
        return
      }
      const pid = String(projectId ?? '').trim()
      const cid = String(clientId ?? '').trim()
      if (!pid || !cid) {
        toast.error('Save this project and set its client before importing QR codes.')
        return
      }
      const current = valueRef.current
      const before = current.importedQrCodes ?? []
      const merged = normalizeImportedQrCodes([...before, ...codes])
      // Replays after reconnect can contain codes already in local state. Save
      // that complete list too, so an earlier unsaved import cannot look done.
      void claimImportedOslQrCodes({
        projectId: pid,
        clientId: cid,
        codes,
        currentPayload: { ...current, importedQrCodes: merged },
      })
        .then(({ payload, skippedUsedCodes }) => {
          onChangeRef.current(payload)
          if (skippedUsedCodes.length > 0) {
            toast.message(
              `Skipped ${skippedUsedCodes.length} QR code(s) already assigned to sample rows.`,
            )
          }
        })
        .catch((error: unknown) => {
          toast.error(
            error instanceof Error
              ? `QR import could not be saved: ${error.message}`
              : 'QR import could not be saved.',
          )
        })
      },
      (message) => toast.error(message),
    )
  }, [clientId, portalUserId, projectId])

  useEffect(() => {
    return subscribeManakTestRequestResult((result) => {
      void attachManakPdfToSample(result).catch((err) => {
        toast.error(err instanceof Error ? err.message : 'Failed to attach Test Request PDF.')
        setExtensionBusyId(null)
      })
    })
  }, [projectId])

  // Keep the unused QR pool firm-scoped and drop codes already assigned on any sample.
  // Persist immediately so sibling application import matches this picker.
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
        // Only apply if scrub actually removed unavailable codes from the latest pool.
        const beforeLen = current.importedQrCodes?.length ?? 0
        const afterLen = next.importedQrCodes?.length ?? 0
        if (afterLen >= beforeLen) return
        onChangeRef.current(next)
      })
      .catch(() => {
        /* fallback: local-only scrub if persist fails */
        void collectUnavailableOslQrCodes(cid)
          .then((unavailable) => {
            if (cancelled || unavailable.size === 0) return
            const current = valueRef.current
            const next = scrubUnavailableImportedQrCodes(current, unavailable)
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
    const destinationLab = laboratoryName || row.destinationLab.trim()
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
      toast.error('Select Exactly One Sample Row to Copy.')
      return
    }
    const id = [...selectedIds][0]
    const sourceIndex = rows.findIndex((r) => r.id === id)
    if (sourceIndex < 0) {
      toast.error('Selected Sample Not Found.')
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
      sampleFor: qrOnlyFields && !qrCode ? 'ft' : source.sampleFor,
      serialNumber: nextSerial,
      conformity: '',
      sampleCode: source.sampleCode.trim()
        ? `${source.sampleCode.trim()}${qrCode ? '' : '-COPY'}`
        : '',
    }
    const insertAt = rows.length === 0 ? 0 : Math.min(addAfterIndex + 1, rows.length)
    const nextRows = [...rows]
    nextRows.splice(insertAt, 0, next)
    setRows(nextRows)
    setAddChooserOpen(false)
    if (chooserPurpose === 'copy') toast.success('Sample Row Copied')
  }

  const confirmAddSample = () => {
    if (addMode === 'with-qr') {
      const qr = selectedQr.replace(/\D/g, '')
      if (!qr || qr.length < 12) {
        setSelectedQr('')
        return
      }
      if (!availableQrCodes.includes(qr) && !availableQrCodes.includes(selectedQr)) {
        setSelectedQr('')
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

  const handleRemoveImportedQrCode = async (code: string) => {
    const pid = (projectId ?? '').trim()
    if (!pid) {
      toast.error('Save This BIS Project Before Removing an Imported QR Code.')
      return
    }
    setQrRemoveBusyCode(code)
    try {
      const next = await removeUnusedOslQrCode({
        projectId: pid,
        code,
        currentPayload: valueRef.current,
      })
      onChangeRef.current({
        ...valueRef.current,
        importedQrCodes: next.importedQrCodes,
      })
      setSelectedQr((selected) => (selected.replace(/\D/g, '') === code ? '' : selected))
      toast.success('QR Code Removed from the Unused Import Pool.')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not remove the QR code.')
    } finally {
      setQrRemoveBusyCode('')
    }
  }

  const openImportDialog = () => {
    setImportStep('choose')
    setQrSources([])
    setSelectedSourceId('')
    setImportDialogOpen(true)
  }

  const handleImportFromManak = () => {
    const pid = (projectId ?? '').trim()
    const cid = (clientId ?? '').trim()
    const userId = (portalUserId ?? '').trim()
    if (!pid || !cid || !userId) {
      toast.error('Save this project with its firm and Manak User ID before importing QR codes.')
      return
    }
    closeImportDialog()
    setImportBusy(true)
    void assertManakAccountBelongsToOnlyFirm({ clientId: cid, portalUserId: userId })
      .then(() => importManakQrCodes({ portalUserId: userId, projectId: pid, qrCount: 5 }))
      .then(({ extensionUsed }) => {
        if (!extensionUsed) {
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
      toast.error('Select an Application.')
      return
    }
    if (!cid) {
      toast.error('This Project Has No Client — Cannot Transfer QR Codes.')
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
      toast.error('IS Number Missing on This BIS Project.')
      return
    }
    if (!row.qrCode.trim() && !row.sampleCode.trim()) {
      toast.error('Add a QR Code (or Sample Code) Before Running Extension.')
      return
    }
    const userId = String(portalUserId ?? '').trim()
    if (!userId || !hasPortalPassword) {
      toast.error(
        'Manak Online User ID / Password missing on this client. Save them on the client, then retry Extension.',
      )
      return
    }
    const returnToken = newManakReturnToken()
    const buildPayload = (laboratoryOslCode: string) => buildManakTrPayload({
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
        // Manak lists labs by OSL code; the extension picks the lab by this code.
        laboratory_osl_code: laboratoryOslCode,
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
    const pid = (projectId ?? '').trim()
    void (async () => {
      // Set before the first await, so no delivery can arrive ahead of it.
      const runs = manakTrRuns(pid)
      runs.set(row.id, { token: returnToken, startedAt: Date.now(), done: false })
      saveManakTrRuns(pid, runs)
      try {
        const labName = row.laboratoryName.trim() || row.destinationLab.trim()
        const laboratoryOslCode = await findLaboratoryOslCodeByName(labName).catch(() => '')
        if (labName && !laboratoryOslCode) {
          toast.message(
            `No OSL code in Laboratory Master for “${labName}” — the extension will match the lab by name.`,
          )
        }
        const payload = buildPayload(laboratoryOslCode)
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
        // Stops once this run's PDF is attached or a newer run replaces it.
        void pollManakPdfInbox(returnToken, {
          stopWhen: () => {
            const run = manakTrRuns(pid).get(row.id)
            return !run || run.token !== returnToken || run.done
          },
        })
          .then((polled) => {
            if (!polled) return
            return attachManakPdfToSample({ ...polled, sampleId: polled.sampleId || row.id }, returnToken)
          })
          .catch(() => {
            /* ignore poll failures */
          })
      } catch (err) {
        setExtensionBusyId(null)
        const runs = manakTrRuns(pid)
        if (runs.get(row.id)?.token === returnToken) {
          runs.delete(row.id)
          saveManakTrRuns(pid, runs)
        }
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
      toast.error('No Test Request PDF Attached Yet.')
      return
    }
    void createBisProjectFileUrls(
      row.testRequestStoragePath,
      row.testRequestFileName || 'Test_Request.pdf',
    )
      .then(({ viewUrl }) => {
        if (!openFileInNewTab(viewUrl, row.testRequestFileName || 'Test_Request.pdf')) {
          toast.error('Could Not Open Test Request PDF.')
        }
      })
      .catch((err) => {
        toast.error(err instanceof Error ? err.message : 'Could not open Test Request PDF.')
      })
  }


  const deleteTestRequest = (row: OslSampleRequirementRow) => {
    if (!row.testRequestStoragePath.trim() && !row.testRequestFileId.trim()) {
      toast.error('No Test Request PDF Attached Yet.')
      return
    }
    const fileId = row.testRequestFileId.trim()
    const storagePath = row.testRequestStoragePath.trim()
    const fileName = row.testRequestFileName.trim()
    const pid = (projectId ?? '').trim()
    void (async () => {
      try {
        if (fileId) {
          await deleteBisProjectFile({
            id: fileId,
            file_name: row.testRequestFileName || 'Test_Request.pdf',
            storage_path: storagePath,
          })
        }
        // Earlier Extension runs could attach the same PDF several times; only one
        // copy was linked to the row. Remove the unlinked copies with this name too.
        let extraRemoved = 0
        if (pid && fileName) {
          const linkedIds = new Set(
            valueRef.current.rows.map((r) => r.testRequestFileId.trim()).filter(Boolean),
          )
          const copies = (await listBisProjectFiles(pid, 'osl-sample-test-request')).filter(
            (f) => f.id !== fileId && f.file_name === fileName && !linkedIds.has(f.id),
          )
          for (const copy of copies) {
            await deleteBisProjectFile(copy)
            extraRemoved += 1
          }
        }
        clearTestRequestOnRow(row.id)
        toast.success(
          extraRemoved
            ? `Test Request PDF removed (${extraRemoved} duplicate cop${extraRemoved === 1 ? 'y' : 'ies'} too).`
            : 'Test Request PDF removed.',
        )
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
        toast.success('Test Request PDF Attached.')
      })
      .catch((err) => {
        toast.error(err instanceof Error ? err.message : 'Test Request upload failed.')
      })
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
        else toast.success('Courier Slip Ready to Print.')
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
        toast.success('Courier Slip PDF Downloaded — Send It to Your Client.')
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
      toast.error('Save the BIS Project First, Then Attach a Courier Slip.')
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
        toast.success('Courier Slip Attached.')
      })
      .catch((err) => {
        toast.error(err instanceof Error ? err.message : 'Courier Slip upload failed.')
      })
  }

  const handleDownloadSelectedTestRequests = () => {
    const selected = rows.filter((r) => selectedIds.has(r.id))
    if (selected.length === 0) {
      toast.error('Select One or More Samples First.')
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
      toast.error('Select One or More Samples First.')
      return
    }
    const pid = (projectId ?? '').trim()
    if (!pid) {
      toast.error('Save the BIS Project First, Then Download Courier Slips.')
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
      toast.error('Select One or More Samples First.')
      return
    }
    const pid = (projectId ?? '').trim()
    if (!pid) {
      toast.error('Save the BIS Project First, Then Download Factory Test Reports.')
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
      toast.error('No Test Report PDF Attached Yet.')
      return
    }
    void createBisProjectFileUrls(
      row.testReportStoragePath,
      row.testReportFileName || 'Test_Report.pdf',
    )
      .then(({ viewUrl }) => {
        if (!openFileInNewTab(viewUrl, row.testReportFileName || 'Test_Report.pdf')) {
          toast.error('Could Not Open Test Report PDF.')
        }
      })
      .catch((err) => {
        toast.error(err instanceof Error ? err.message : 'Could not open Test Report PDF.')
      })
  }


  const deleteTestReport = (row: OslSampleRequirementRow) => {
    if (!row.testReportStoragePath.trim() && !row.testReportFileId.trim()) {
      toast.error('No Test Report PDF Attached Yet.')
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
        toast.success('Test Report PDF Removed.')
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
        toast.success('Test Report PDF Attached.')
      })
      .catch((err) => {
        toast.error(err instanceof Error ? err.message : 'Test Report upload failed.')
      })
  }

  const [aiInstruction, setAiInstruction] = useState('')
  const [aiBusy, setAiBusy] = useState(false)
  const [aiFiles, setAiFiles] = useState<File[]>([])
  const [voiceLang, setVoiceLang] = useState<'en-IN' | 'hi-IN'>('en-IN')
  const voice = useVoiceInput(setAiInstruction, voiceLang)
  const runAiFill = async () => {
    if (!draft || !onAiFill) return
    setAiBusy(true)
    try {
      const filled = await onAiFill(draft, aiInstruction, aiFiles)
      const keys = Object.keys(filled)
      if (!keys.length) {
        toast.message('AI Found Nothing to Fill.')
        return
      }
      setDraft({ ...draft, ...filled })
      toast.success('Sample Filled by AI — Check the Fields.')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'AI Could Not Fill the Sample.')
    } finally {
      setAiBusy(false)
    }
  }
  const patchDraft = <K extends keyof OslSampleRequirementRow>(
    key: K,
    next: OslSampleRequirementRow[K],
  ) => {
    if (!draft) return
    setDraft({ ...draft, [key]: next })
  }

  const updateDeclaredValueAttachment = (
    rowId: string,
    file: { id: string; file_name: string; storage_path: string } | null,
  ) => {
    const nextRows = rows.map((row) =>
      row.id === rowId
        ? {
            ...row,
            declaredValueFileId: file?.id ?? '',
            declaredValueFileName: file?.file_name ?? '',
            declaredValueStoragePath: file?.storage_path ?? '',
          }
        : row,
    )
    setRows(nextRows)
    setDraft((current) =>
      current?.id === rowId
        ? {
            ...current,
            declaredValueFileId: file?.id ?? '',
            declaredValueFileName: file?.file_name ?? '',
            declaredValueStoragePath: file?.storage_path ?? '',
          }
        : current,
    )
  }

  const handleDeclaredValueFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0]
    event.currentTarget.value = ''
    const row = draft
    if (!file || !row) return
    if (!file.name.toLowerCase().endsWith('.pdf')) {
      toast.error('Attach a PDF File.')
      return
    }
    const pid = (projectId ?? '').trim()
    if (!pid) {
      toast.error('Save the BIS Project Before Attaching a PDF.')
      return
    }
    setDeclaredValueUploadBusy(true)
    void uploadBisProjectFile(pid, file, 'osl-sample-declared-value')
      .then((uploaded) => {
        updateDeclaredValueAttachment(row.id, uploaded)
        if (row.declaredValueFileId) {
          void deleteBisProjectFile({
            id: row.declaredValueFileId,
            file_name: row.declaredValueFileName || 'Declared_Value.pdf',
            storage_path: row.declaredValueStoragePath,
          }).catch(() => undefined)
        }
        toast.success('PDF Attached to Declared Value.')
      })
      .catch((err) => {
        toast.error(err instanceof Error ? err.message : 'PDF upload failed.')
      })
      .finally(() => setDeclaredValueUploadBusy(false))
  }

  const viewDeclaredValueFile = (row: OslSampleRequirementRow) => {
    if (!row.declaredValueStoragePath) return
    void createBisProjectFileUrls(
      row.declaredValueStoragePath,
      row.declaredValueFileName || 'Declared_Value.pdf',
    )
      .then(({ viewUrl }) => {
        if (!openFileInNewTab(viewUrl, row.declaredValueFileName || 'Declared_Value.pdf')) toast.error('Could Not Open the Attached PDF.')
      })
      .catch((err) => toast.error(err instanceof Error ? err.message : 'Could not open the PDF.'))
  }

  const deleteDeclaredValueFile = (row: OslSampleRequirementRow) => {
    if (!row.declaredValueFileId) return
    void deleteBisProjectFile({
      id: row.declaredValueFileId,
      file_name: row.declaredValueFileName || 'Declared_Value.pdf',
      storage_path: row.declaredValueStoragePath,
    })
      .then(() => {
        updateDeclaredValueAttachment(row.id, null)
        toast.success('Attached PDF Removed.')
      })
      .catch((err) => toast.error(err instanceof Error ? err.message : 'Could not delete the PDF.'))
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
        aria-label="Edit Sample"
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
        title="Extension (Manak eBIS) — Fill Test Request & Attach PDF"
        aria-label="Open Manak Extension"
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
        aria-label="Delete Sample"
        onClick={() => removeRow(index)}
      >
        <Trash2 size={14} aria-hidden />
      </Button>
    </div>
  )


  // One button per file: red uploads from the computer; once attached it turns green — click to view (new tab),
  // double-click to delete (after confirmation).
  const fileClickTimers = useRef<Record<string, number>>({})
  const renderFileToggle = ({
    key,
    label,
    hasFile,
    onUpload,
    onView,
    onDelete,
  }: {
    key: string
    label: string
    hasFile: boolean
    onUpload: () => void
    onView: () => void
    onDelete: () => void
  }) => {
    const btn = 'inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-none border p-0 text-white shadow-sm transition-colors disabled:opacity-60'
    if (!hasFile) {
      return (
        <button
          type="button"
          className={cn(btn, 'border-red-700 bg-red-600 hover:bg-red-700')}
          title={`Upload ${label} (PDF)`}
          aria-label={`Upload ${label}`}
          disabled={disabled}
          onClick={onUpload}
        >
          <Upload size={14} aria-hidden />
        </button>
      )
    }
    return (
      <button
        type="button"
        className={cn(btn, 'border-green-800 bg-green-600 hover:bg-green-700')}
        title={`${label} — click to view, double-click to delete`}
        aria-label={`View ${label} (double-click to delete)`}
        disabled={disabled}
        onClick={() => {
          window.clearTimeout(fileClickTimers.current[key])
          fileClickTimers.current[key] = window.setTimeout(onView, 250)
        }}
        onDoubleClick={() => {
          window.clearTimeout(fileClickTimers.current[key])
          void confirm(`Delete the ${label}?`, { title: `Delete ${label}`, confirmLabel: 'Delete', destructive: true }).then((ok) => { if (ok) onDelete() })
        }}
      >
        <FileCheck2 size={14} aria-hidden />
      </button>
    )
  }

  const renderTestRequestMenu = (row: OslSampleRequirementRow) =>
    renderFileToggle({
      key: `${row.id}:request`,
      label: 'Test Request',
      hasFile: Boolean(row.testRequestStoragePath.trim() || row.testRequestFileId.trim()),
      onUpload: () => openTestRequestUpload(row),
      onView: () => viewTestRequest(row),
      onDelete: () => deleteTestRequest(row),
    })

  const renderTestReportMenu = (row: OslSampleRequirementRow) =>
    renderFileToggle({
      key: `${row.id}:report`,
      label: 'Test Report',
      hasFile: Boolean(row.testReportStoragePath.trim() || row.testReportFileId.trim()),
      onUpload: () => openTestReportUpload(row),
      onView: () => viewTestReport(row),
      onDelete: () => deleteTestReport(row),
    })

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
        aria-label="Courier Slip"
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
            aria-label="Courier Slip"
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
      {confirmDialog}
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
            aria-label="Add Sample"
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
            aria-label="Copy Sample"
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
            aria-label="Import QR Code"
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
            title="Download Selected Test Request PDFs (Merged into One File)"
            aria-label="Download Selected Test Request PDFs"
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
            title="Download Selected Courier Slips (Merged into One PDF)"
            aria-label="Download Selected Courier Slips"
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
            title="Download Selected Factory Test Reports (Merged into One PDF)"
            aria-label="Download Selected Factory Test Reports"
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
              aria-label="Select All Samples"
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
                      {!qrOnlyFields || row.qrCode.trim() ? <span className="truncate text-stone-600">{row.priority}</span> : null}
                    </label>
                    {renderActionButtons(row, index)}
                  </div>

                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {!qrOnlyFields || row.qrCode.trim() ? (
<>
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
                    <div className="min-w-0">
                      <p className={cardFieldLabelClass}>Conformity of Sample as per IS</p>
                      <SampleConformitySelect
                        className="h-8 w-full max-w-[12rem] text-sm"
                        value={row.conformity}
                        needed={Boolean(row.qrCode.trim())}
                        disabled={disabled}
                        ariaLabel={`Conformity of sample ${index + 1} as per IS`}
                        onChange={(next) =>
                          setRows(rows.map((r, i) => (i === index ? { ...r, conformity: next } : r)))
                        }
                      />
                    </div>
</>
) : null}
                    <div className="min-w-0 sm:col-span-2">
                      <p className={cardFieldLabelClass}>Sample Details</p>
                      {row.batchNumber.trim() ? (
                        <button
                          type="button"
                          className="truncate text-left text-sm font-semibold text-amber-900 underline decoration-amber-700/50 underline-offset-2 hover:text-amber-950 disabled:pointer-events-none disabled:opacity-50"
                          disabled={disabled}
                          title="Open Sample Details"
                          onClick={() => openEdit(index)}
                        >
                          {row.batchNumber.trim()}
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="text-sm text-stone-500 underline decoration-stone-400/60 underline-offset-2 hover:text-amber-900 disabled:pointer-events-none disabled:opacity-50"
                          disabled={disabled}
                          title="Open Sample Details"
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
          <Table className="w-full min-w-[58rem] table-fixed border-collapse">
            <TableHeader>
              <TableRow className="border-stone-700 bg-stone-800 hover:bg-stone-800">
                <TableHead className={cn(thClass, 'w-10 px-1')}>
                  <input
                    type="checkbox"
                    className={checkboxClass}
                    aria-label="Select All Samples"
                    checked={allChecked}
                    ref={(el) => {
                      if (el) el.indeterminate = !allChecked && someChecked
                    }}
                    disabled={disabled}
                    onChange={(e) => toggleAll(e.target.checked)}
                  />
                </TableHead>
                <TableHead className={cn(thClass, 'w-[4.5rem]')}>Sample For</TableHead>
                {showQrCols ? <TableHead className={cn(thClass, 'w-[16%]')}>QR Code</TableHead> : null}
                {showQrCols ? <TableHead className={cn(thClass, 'w-[16%]')}>Sample Code</TableHead> : null}
                <TableHead className={cn(thClass, 'w-[20%]')}>Sample Details</TableHead>
                <TableHead className={cn(thClass, 'w-[5.5rem]')}>Priority</TableHead>
                <TableHead className={cn(thClass, 'w-[5.5rem]')}>In Offer Letter</TableHead>
                {showQrCols ? (
                <TableHead className={cn(thClass, 'w-[7rem]')} title="Conformity of Sample as per IS (from the Lab Report)">
                  Conformity
                </TableHead>
                ) : null}
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
                    colSpan={showQrCols ? 12 : 9}
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
                      {showQrCols ? (
<>
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
</>
) : null}
                      <TableCell className="truncate px-2 py-2 text-center text-xs font-medium align-middle">
                        {row.batchNumber.trim() ? (
                          <button
                            type="button"
                            className="truncate font-semibold text-amber-900 underline decoration-amber-700/50 underline-offset-2 hover:text-amber-950 hover:decoration-amber-800 disabled:pointer-events-none disabled:opacity-50"
                            disabled={disabled}
                            title="Open Sample Details"
                            onClick={() => openEdit(index)}
                          >
                            {row.batchNumber.trim()}
                          </button>
                        ) : (
                          <button
                            type="button"
                            className="text-stone-500 underline decoration-stone-400/60 underline-offset-2 hover:text-amber-900 disabled:pointer-events-none disabled:opacity-50"
                            disabled={disabled}
                            title="Open Sample Details"
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
                      {showQrCols ? (
                      <TableCell className="px-1.5 py-2 text-center align-middle">
                        <SampleConformitySelect
                          className="h-8 w-full px-2 text-xs"
                          value={row.conformity}
                          needed={Boolean(row.qrCode.trim())}
                          disabled={disabled}
                          ariaLabel={`Conformity of sample ${index + 1} as per IS`}
                          onChange={(next) =>
                            setRows(rows.map((r, i) => (i === index ? { ...r, conformity: next } : r)))
                          }
                        />
                      </TableCell>
) : null}
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
                          aria-label="Courier Slip"
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
              <p className="mt-0.5 line-clamp-2 break-words text-xs text-stone-300">
                {courierDraft?.sampleCode.trim() || courierDraft?.qrCode.trim() || 'Read-only preview'}
              </p>
            </DialogHeader>
          </div>

          {courierDraft ? (
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-stone-200/80 sm:flex-row">
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
                    <p className="mt-0.5 text-sm text-stone-400">Client Address Will Load from Project</p>
                  )}
                </section>
                    </div>
                  </div>
              </div>
              </div>

              <aside className="flex max-h-[40dvh] w-full shrink-0 flex-col gap-2 overflow-y-auto border-t border-stone-400 bg-stone-50 px-2.5 py-4 sm:max-h-none sm:w-[11rem] sm:border-l sm:border-t-0 sm:px-3">
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
                      aria-label="Test Request per Page"
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
              {availableQrCodes.length > 0 ? (
                <section className="min-w-0 space-y-2 border border-stone-300 bg-stone-50 p-3 sm:col-span-2">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <h3 className="text-xs font-semibold text-stone-800">
                        Imported unused QR codes ({availableQrCodes.length})
                      </h3>
                      <p className="text-[11px] text-stone-600">
                        Remove scanned or incorrect codes from this project’s unused pool.
                      </p>
                    </div>
                  </div>
                  <div className="max-h-40 divide-y divide-stone-200 overflow-y-auto border border-stone-300 bg-white">
                    {availableQrCodes.map((code) => (
                      <div key={code} className="flex items-center justify-between gap-3 px-2 py-1.5">
                        <span className="font-mono text-xs text-stone-800">{code}</span>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className={cn(limsOutlineBtnClass, 'h-7 gap-1 px-2 text-[11px] text-red-800')}
                          disabled={disabled || Boolean(qrRemoveBusyCode)}
                          title={`Remove QR ${code} from the unused pool`}
                          onClick={() => void handleRemoveImportedQrCode(code)}
                        >
                          <Trash2 className="h-3.5 w-3.5" aria-hidden />
                          {qrRemoveBusyCode === code ? 'Removing…' : 'Remove'}
                        </Button>
                      </div>
                    ))}
                  </div>
                </section>
              ) : null}
            </div>
          ) : (
            <div className="space-y-3 px-4 py-4">
              {qrSourcesLoading ? (
                <p className="py-4 text-center text-sm text-stone-500">Loading Applications…</p>
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
                        <SelectValue placeholder="Select Application" />
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
                      <SelectValue placeholder="Select QR Code" />
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
          // Start typing in Grade / Type / Variety / Size / Class / Rating, not in "Sample For".
          onOpenAutoFocus={(event) => {
            const grade = document.getElementById('osl-grade') as HTMLTextAreaElement | null
            if (!grade) return
            event.preventDefault()
            grade.focus()
            grade.setSelectionRange(grade.value.length, grade.value.length)
          }}
          className={cn(
            limsDialogClass,
            'flex !flex-col gap-0 overflow-hidden bg-white p-0',
            '!fixed left-[var(--app-dialog-overlay-left,0px)] right-0 top-0 bottom-0',
            'h-[100dvh] max-h-[100dvh] w-[calc(100vw-var(--app-dialog-overlay-left,0px))] max-w-none',
            'translate-x-0 translate-y-0 rounded-none border-0 shadow-none sm:rounded-none',
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
              <input
                ref={declaredValueFileInputRef}
                type="file"
                accept="application/pdf,.pdf"
                className="hidden"
                aria-hidden
                tabIndex={-1}
                onChange={handleDeclaredValueFileChange}
              />
              {qrOnlyFields && !draft.qrCode.trim() && onAiFill ? (
                <div className="flex flex-wrap items-end gap-2 border border-amber-300 bg-amber-50/70 p-2.5">
                  <div className="min-w-0 flex-1 basis-72 space-y-1.5">
                    <label className="text-[11px] font-semibold uppercase tracking-[0.08em] text-stone-600" htmlFor="osl-ai-instruction">Tell the AI (Batch Number, Date, Quantities, or Use Dummy Values)</label>
                    <Input
                      id="osl-ai-instruction"
                      className={cn(limsFieldClass, 'h-9')}
                      value={aiInstruction}
                      disabled={aiBusy}
                      placeholder="e.g. Dummy Batch Number, Mfg Date Today, Batch 5 Tonne, Sample 1 Mtr x 2 Nos"
                      onChange={(e) => setAiInstruction(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void runAiFill() } }}
                    />
                  </div>
                  {voice.supported ? (
                    <div className="flex h-9 items-stretch">
                      <Button type="button" variant="outline" className={cn(limsOutlineBtnClass, 'h-9 w-9 shrink-0 p-0', voice.listening && 'border-red-600 bg-red-50 text-red-700')} disabled={aiBusy} title={voice.listening ? 'Stop Listening' : 'Voice Typing'} aria-label={voice.listening ? 'Stop Voice Typing' : 'Start Voice Typing'} onClick={() => (voice.listening ? voice.stop() : voice.start(aiInstruction))}>
                        {voice.listening ? <MicOff size={15} aria-hidden /> : <Mic size={15} aria-hidden />}
                      </Button>
                      <Button type="button" variant="outline" className={cn(limsOutlineBtnClass, 'h-9 w-10 shrink-0 border-l-0 p-0 text-[11px] font-bold')} disabled={aiBusy || voice.listening} title="Voice Language" aria-label="Voice Language" onClick={() => setVoiceLang((l) => (l === 'en-IN' ? 'hi-IN' : 'en-IN'))}>
                        {voiceLang === 'en-IN' ? 'EN' : 'हि'}
                      </Button>
                    </div>
                  ) : null}
                  <label className={cn(limsOutlineBtnClass, 'inline-flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center border', aiBusy && 'pointer-events-none opacity-50')} title="Attach PDF or Image" aria-label="Attach PDF or Image">
                    <Paperclip size={15} aria-hidden />
                    <input
                      type="file"
                      multiple
                      className="sr-only"
                      accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg"
                      disabled={aiBusy}
                      onChange={(e) => {
                        const picked = Array.from(e.target.files ?? [])
                        e.target.value = ''
                        if (picked.length) setAiFiles((cur) => [...cur, ...picked])
                      }}
                    />
                  </label>
                  <Button type="button" variant="outline" className={cn(limsOutlineBtnClass, 'h-9 gap-1.5 border-amber-600 bg-white font-semibold text-amber-900')} disabled={aiBusy} onClick={() => void runAiFill()}>
                    {aiBusy ? <Loader2 size={14} className="animate-spin" aria-hidden /> : <Sparkles size={14} aria-hidden />} {aiBusy ? 'Filling…' : 'Fill with AI'}
                  </Button>
                  {aiFiles.length || voice.error ? (
                    <div className="flex basis-full flex-wrap items-center gap-1.5">
                      {aiFiles.map((f, i) => (
                        <span key={`${f.name}-${i}`} className="inline-flex max-w-full items-center gap-1 border border-stone-400 bg-white px-2 py-0.5 text-xs text-stone-700">
                          <Paperclip size={12} aria-hidden />
                          <span className="truncate" title={f.name}>{f.name}</span>
                          <button type="button" className="text-red-700" aria-label={`Remove ${f.name}`} disabled={aiBusy} onClick={() => setAiFiles((cur) => cur.filter((_, j) => j !== i))}>
                            <X size={12} aria-hidden />
                          </button>
                        </span>
                      ))}
                      {voice.error ? <span className="text-xs text-destructive">{voice.error}</span> : null}
                    </div>
                  ) : null}
                </div>
              ) : null}
              <div className="space-y-3">
                {(qrOnlyFields && !draft.qrCode.trim()) ? (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
                  <MasterOptionFieldWithAdd
                    category="osl_sample_for"
                    value={sampleForLabel(draft.sampleFor)}
                    onChange={(value) => {
                      const normalized = value.trim().toLowerCase()
                      patchDraft(
                        'sampleFor',
                        normalized === 'osl' || normalized === 'ft' || normalized === 'it'
                          ? normalized
                          : value,
                      )
                    }}
                    label="Sample For"
                    inputId="osl-sample-for"
                    listId="osl-sample-for-list"
                    defaultOptions={OSL_SAMPLE_FOR_OPTIONS}
                  />
                  <MasterOptionFieldWithAdd
                    category="osl_sample_shelf_life"
                    value={draft.shelfLife}
                    onChange={(value) => patchDraft('shelfLife', value)}
                    label="Shelf Life"
                    inputId="osl-shelf"
                    listId="osl-shelf-list"
                  />
                  <MasterOptionFieldWithAdd
                    category="osl_sample_mode_of_disposal"
                    value={draft.modeOfDisposal}
                    onChange={(value) => patchDraft('modeOfDisposal', value)}
                    label="Mode Of Disposal"
                    inputId="osl-disposal"
                    listId="osl-disposal-list"
                  />
                  <MasterOptionFieldWithAdd
                    category="osl_sample_test_required"
                    value={draft.testRequired}
                    onChange={(value) => patchDraft('testRequired', value)}
                    label="Test Required"
                    inputId="osl-test"
                    listId="osl-test-list"
                  />
                  <Field label="Serial Number" htmlFor="osl-serial">
                    <Input
                      id="osl-serial"
                      className={cn(limsFieldClass, 'h-9')}
                      value={draft.serialNumber}
                      onChange={(e) => patchDraft('serialNumber', e.target.value)}
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
                  <div className="min-w-0 sm:col-span-2 lg:col-span-2">
                  <Field label="Sample Quantity" htmlFor="osl-qty">
                    <Input
                      id="osl-qty"
                      className={cn(limsFieldClass, 'h-9')}
                      value={draft.sampleQuantity}
                      onChange={(e) => patchDraft('sampleQuantity', e.target.value)}
                    />
                  </Field>
                  </div>
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
                          aria-label="Open Calendar"
                          title="Pick Date"
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
                </div>
                ) : (
<>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
                  <MasterOptionFieldWithAdd
                    category="osl_sample_for"
                    value={sampleForLabel(draft.sampleFor)}
                    onChange={(value) => {
                      const normalized = value.trim().toLowerCase()
                      patchDraft(
                        'sampleFor',
                        normalized === 'osl' || normalized === 'ft' || normalized === 'it'
                          ? normalized
                          : value,
                      )
                    }}
                    label="Sample For"
                    inputId="osl-sample-for"
                    listId="osl-sample-for-list"
                    defaultOptions={OSL_SAMPLE_FOR_OPTIONS}
                  />
                  {(!qrOnlyFields || Boolean(draft.qrCode.trim())) ? (
<>
                  <MasterOptionFieldWithAdd
                    category="osl_sample_priority"
                    value={draft.priority}
                    onChange={(value) => patchDraft('priority', value)}
                    label="Priority"
                    inputId="osl-sample-priority"
                    listId="osl-sample-priority-list"
                    defaultOptions={OSL_SAMPLE_PRIORITY_OPTIONS}
                  />
                  <MasterOptionFieldWithAdd
                    category="osl_sample_type"
                    value={draft.sampleType}
                    onChange={(value) => patchDraft('sampleType', value)}
                    label="Sample Type"
                    inputId="osl-sample-type"
                    listId="osl-sample-type-list"
                  />
</>
) : null}
                  <Field label="Serial Number" htmlFor="osl-serial">
                    <Input
                      id="osl-serial"
                      className={cn(limsFieldClass, 'h-9')}
                      value={draft.serialNumber}
                      onChange={(e) => patchDraft('serialNumber', e.target.value)}
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
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
                  {(!qrOnlyFields || Boolean(draft.qrCode.trim())) ? (
<>
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
                      placeholder="12-Digit Manak QR (Optional)"
                    />
                  </Field>
</>
) : null}
                  <MasterOptionFieldWithAdd
                    category="osl_sample_shelf_life"
                    value={draft.shelfLife}
                    onChange={(value) => patchDraft('shelfLife', value)}
                    label="Shelf Life"
                    inputId="osl-shelf"
                    listId="osl-shelf-list"
                  />
                  <MasterOptionFieldWithAdd
                    category="osl_sample_mode_of_disposal"
                    value={draft.modeOfDisposal}
                    onChange={(value) => patchDraft('modeOfDisposal', value)}
                    label="Mode Of Disposal"
                    inputId="osl-disposal"
                    listId="osl-disposal-list"
                  />
                  <MasterOptionFieldWithAdd
                    category="osl_sample_test_required"
                    value={draft.testRequired}
                    onChange={(value) => patchDraft('testRequired', value)}
                    label="Test Required"
                    inputId="osl-test"
                    listId="osl-test-list"
                  />
                </div>
</>
                )}
              </div>

              <div className="space-y-3">
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
                    <div className="relative">
                      <Textarea
                        id="osl-declared"
                        rows={2}
                        className={cn(
                          limsFieldClass,
                          'h-[4.5rem] min-h-[4.5rem] resize-none py-2 pb-8',
                        )}
                        value={draft.declaredValue}
                        onChange={(e) => patchDraft('declaredValue', e.target.value)}
                      />
                      {draft.declaredValueFileName ? (
                        <span
                          className="pointer-events-none absolute bottom-1.5 left-2 max-w-[calc(100%-3rem)] truncate bg-white/90 pr-1 text-[10px] text-stone-600"
                          title={draft.declaredValueFileName}
                        >
                          {draft.declaredValueFileName}
                        </span>
                      ) : null}
                      {/* One button: red uploads a PDF; once attached it turns green — click to view, double-click to delete. */}
                      {draft.declaredValueStoragePath ? (
                        <button
                          type="button"
                          className="absolute bottom-1 right-1 inline-flex h-7 w-7 items-center justify-center rounded-none border border-green-800 bg-green-600 p-0 text-white shadow-sm transition-colors hover:bg-green-700 disabled:opacity-60"
                          title={`${draft.declaredValueFileName || 'Declared Value PDF'} — click to view, double-click to delete`}
                          aria-label="View Declared Value PDF (Double-Click to Delete)"
                          disabled={declaredValueUploadBusy}
                          onClick={() => {
                            if (declaredValueClickTimer.current) window.clearTimeout(declaredValueClickTimer.current)
                            declaredValueClickTimer.current = window.setTimeout(() => viewDeclaredValueFile(draft), 250)
                          }}
                          onDoubleClick={() => {
                            if (declaredValueClickTimer.current) window.clearTimeout(declaredValueClickTimer.current)
                            void confirm('Delete the Declared Value PDF?', { title: 'Delete Declared Value PDF', confirmLabel: 'Delete', destructive: true }).then((ok) => { if (ok) deleteDeclaredValueFile(draft) })
                          }}
                        >
                          <FileCheck2 size={14} aria-hidden />
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="absolute bottom-1 right-1 inline-flex h-7 w-7 items-center justify-center rounded-none border border-red-700 bg-red-600 p-0 text-white shadow-sm transition-colors hover:bg-red-700 disabled:opacity-60"
                          title={declaredValueUploadBusy ? 'Uploading PDF…' : 'Upload Declared Value PDF'}
                          aria-label="Upload Declared Value PDF"
                          disabled={declaredValueUploadBusy}
                          onClick={() => declaredValueFileInputRef.current?.click()}
                        >
                          {declaredValueUploadBusy ? <Loader2 size={14} className="animate-spin" aria-hidden /> : <Upload size={14} aria-hidden />}
                        </button>
                      )}
                    </div>
                  </Field>
                </div>
                {!(qrOnlyFields && !draft.qrCode.trim()) ? (
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
                          aria-label="Open Calendar"
                          title="Pick Date"
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
                ) : null}
              </div>

              <div className="space-y-3">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  {(!qrOnlyFields || Boolean(draft.qrCode.trim())) ? (
<>
                  <Field label="Name of the Laboratory" htmlFor="osl-lab">
                    <div className="border border-stone-400 bg-white">
                      <RemoteLookupCombobox
                        inputId="osl-lab"
                        listId="osl-lab-list"
                        placeholder="Select Testing Laboratory"
                        inputClassName="h-[34px]"
                        label={draft.laboratoryName}
                        selectedId={labClientId}
                        search={searchLaboratoryMasterOptions}
                        onChange={({ id, label }) => {
                          setLabClientId(id)
                          setDraft({
                            ...draft,
                            laboratoryName: label,
                            destinationLab: label,
                          })
                        }}
                      />
                    </div>
                  </Field>
                  <Field label="Destination Lab" htmlFor="osl-dest-lab">
                    <Input
                      id="osl-dest-lab"
                      className={cn(limsFieldClass, 'h-9')}
                      value={draft.destinationLab}
                      readOnly
                    />
                  </Field>
</>
) : null}
                  {!qrOnlyFields || draft.qrCode.trim() ? (
                  <Field label="Conformity of Sample as per IS" htmlFor="osl-conformity">
                    <SampleConformitySelect
                      id="osl-conformity"
                      className="h-9 w-full"
                      value={draft.conformity}
                      needed={Boolean(draft.qrCode.trim())}
                      onChange={(next) => patchDraft('conformity', next)}
                    />
                  </Field>
                  ) : null}
                </div>
              </div>

              {(!qrOnlyFields || Boolean(draft.qrCode.trim())) ? (
              <div className="space-y-3">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <Field label="Sample Description" htmlFor="osl-desc">
                    <Textarea
                      id="osl-desc"
                      rows={1}
                      className={cn(limsFieldClass, 'h-[4.5rem] min-h-[4.5rem] resize-none py-2')}
                      value={draft.sampleDescription}
                      onChange={(e) => patchDraft('sampleDescription', e.target.value)}
                    />
                  </Field>
                  <Field label="Additional Information" htmlFor="osl-extra">
                    <Textarea
                      id="osl-extra"
                      rows={1}
                      className={cn(limsFieldClass, 'h-[4.5rem] min-h-[4.5rem] resize-none py-2')}
                      value={draft.additionalInformation}
                      onChange={(e) => patchDraft('additionalInformation', e.target.value)}
                    />
                  </Field>
                </div>
              </div>

) : null}
              {(!qrOnlyFields || Boolean(draft.qrCode.trim())) ? (
              <div className="space-y-3">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <Field label="Testing Charges" htmlFor="osl-charges">
                    <div className="flex h-9 min-w-0 flex-1 overflow-hidden rounded-none border border-stone-500 bg-stone-50 focus-within:border-amber-600 focus-within:bg-white focus-within:ring-2 focus-within:ring-amber-500/20">
                      <span className="inline-flex shrink-0 items-center border-r border-stone-500 bg-stone-100 px-2.5 text-sm font-semibold text-stone-700" aria-hidden>
                        {getCurrencySymbol()}
                      </span>
                      <Input
                        id="osl-charges"
                        type="text"
                        inputMode="decimal"
                        value={testingChargesFocused ? draft.testingCharges : formatMoneyInput(draft.testingCharges || '0')}
                        onFocus={() => setTestingChargesFocused(true)}
                        onChange={(event) => patchDraft('testingCharges', sanitizeMoneyInput(event.target.value))}
                        onBlur={(event) => {
                          setTestingChargesFocused(false)
                          patchDraft('testingCharges', formatMoneyInput(event.target.value || '0'))
                        }}
                        placeholder="0.00"
                        className="h-full min-w-0 flex-1 rounded-none !border-0 !bg-transparent text-right tabular-nums shadow-none focus-visible:!ring-0"
                        aria-label={`Testing Charges in ${getCurrencyCode()}`}
                      />
                    </div>
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
                          aria-label="Open Calendar"
                          title="Pick Date"
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
              </div>
) : null}
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
