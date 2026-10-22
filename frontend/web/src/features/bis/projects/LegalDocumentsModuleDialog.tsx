import { UndertakingGeneralFields } from './UndertakingGeneralFields'
import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Check, Download, Eye, FileDown, FileType, Import, Pencil, Plus, Printer, Trash2, Upload, X } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import {
  limsDarkBarGlowStyle,
  limsDialogClass,
  limsOutlineBtnClass,
  limsPrimaryBtnClass,
} from '@/lib/limsThemeUi'
import { cn } from '@/lib/utils'
import { getCurrencyCode, getCurrencySymbol } from '@/lib/appCurrency'
import { formatMoneyInput, sanitizeMoneyInput } from '@/features/masters/products-services/types'
import { supabase } from '@/lib/supabaseClient'
import {
  listClientCertificates,
  deleteClientCertificate,
  openClientCertificate,
  updateClientCertificateDetails,
  type ClientCertificateFile,
} from '@/features/masters/clients/clientsApi'
import {
  listBisBranchOffices,
  type BisBranchOfficeRow,
} from '@/features/masters/bis-branch-offices/bisBranchOfficesApi'
import {
  deleteBisProjectFile,
  formatBisProjectFilesError,
  listBisProjectFiles,
  updateBisProjectFileName,
  uploadBisProjectFiles,
  type BisProjectDocKind,
  type BisProjectViewFile,
} from './bisProjectFilesApi'
import {
  emptyTechnicalStaffPayload,
  emptyTopManagementPayload,
  fetchBisModulePayload,
  parseTechnicalStaffPayload,
  parseTopManagementPayload,
  resolveTechnicalStaffForTestedBy,
  saveBisModulePayload,
  type TechnicalStaffModulePayload,
  type TopManagementModulePayload,
} from './bisModuleDataApi'
import {
  formatBisApiError,
  saveBisApplicationDetails,
  saveBisProjectNotes,
} from './bisProjectsApi'
import { ApplicationDetailsFields } from './ApplicationDetailsFields'
import { formatCoordinate } from './locationMapModel'
import { LicenseScopeFields } from './LicenseScopeFields'
import { FactoryTestReportModuleFields } from './FactoryTestReportModuleFields'
import {
  emptyFactoryTestReportPayload,
  factoryTestReportHasContent,
  parseFactoryTestReportPayload,
  type FactoryTestReportModulePayload,
} from './factoryTestReportModel'
import { LocationMapModuleFields } from './LocationMapModuleFields'
import {
  defaultBisToLocation,
  emptyLocationMapPayload,
  parseLocationMapPayload,
  type LocationMapModulePayload,
} from './locationMapModel'
import { PlantLayoutModuleFields } from './PlantLayoutModuleFields'
import {
  emptyPlantLayoutPayload,
  parsePlantLayoutPayload,
  type PlantLayoutModulePayload,
} from './plantLayoutModel'
import { Cmpf305ModuleFields } from './Cmpf305ModuleFields'
import {
  cmpf305RowHasContent,
  emptyCmpf305Payload,
  parseCmpf305Payload,
  type Cmpf305ModulePayload,
} from './cmpf305Model'
import { Cmpf306ModuleFields } from './Cmpf306ModuleFields'
import {
  cmpf306RowHasContent,
  emptyCmpf306Payload,
  parseCmpf306Payload,
  type Cmpf306ModulePayload,
} from './cmpf306Model'
import { Cmpf311ModuleFields } from './Cmpf311ModuleFields'
import { emptyCmpf311Payload, parseCmpf311Payload, type Cmpf311ModulePayload } from './cmpf311Model'
import { Cmpf307ModuleFields } from './Cmpf307ModuleFields'
import { cmpf307RowHasContent, emptyCmpf307BrandRow, emptyCmpf307Payload, parseCmpf307Payload, type Cmpf307ModulePayload } from './cmpf307Model'
import { BisModuleImportDialog } from './BisModuleImportDialog'
import { Cmpf310ModuleFields } from './Cmpf310ModuleFields'
import { RawMaterialReferenceModuleFields } from './RawMaterialReferenceModuleFields'
import { packagingMarkingFieldsFrom, sefPackagingRowsFrom } from '../print/manufacturingStepDocumentsHtml'
import {
  emptyRawMaterialReferencePayload,
  parseRawMaterialReferencePayload,
  type RawMaterialReferencePayload,
} from './rawMaterialReferenceModel'
import { emptyCmpf310Payload, parseCmpf310Payload, type Cmpf310ModulePayload } from './cmpf310Model'
import { ProcessFlowModuleFields } from './ProcessFlowModuleFields'
import {
  emptyUndertakingGeneralPayload,
  emptyUndertakingLongDurationRow,
  emptyUndertakingLongDurationPayload,
  emptyUndertakingMinimumFeePayload,
  emptySelfEvaluationPayload,
  parseUndertakingGeneralPayload,
  parseUndertakingLongDurationPayload,
  parseUndertakingMinimumFeePayload,
  undertakingFirmStatusFromCompanyScale,
  parseSelfEvaluationPayload,
  type UndertakingGeneralPayload,
  type UndertakingLongDurationPayload,
  type UndertakingMinimumFeePayload,
  type SelfEvaluationPayload,
} from './undertakingPayloadModels'
import {
  emptyProcessFlowPayload,
  parseProcessFlowPayload,
  type ProcessFlowModulePayload,
} from './processFlowModel'
import { OslSampleRequirementsModuleFields } from './OslSampleRequirementsModuleFields'
import {
  emptyOslSampleRequirementRow,
  emptyOslSampleRequirementsPayload,
  oslSampleRowHasContent,
  parseOslSampleRequirementsPayload,
  type OslSampleRequirementRow,
  type OslSampleRequirementsModulePayload,
} from './oslSampleRequirementsModel'
import { TechnicalStaffModuleFields } from './TechnicalStaffModuleFields'
import { TopManagementModuleFields } from './TopManagementModuleFields'
import { printBisDocument, type BisPrintDocumentKind } from '../print/printBisDocument'
import { loadBisPrintData } from '../print/loadBisPrintData'
import {
  buildOslSampleTestRequestHtml,
  oslSampleTestRequestDataForSample,
} from '../print/oslSampleTestRequestHtml'
import { openPendingPrintWindow, openPrintHtml } from '../print/openPrintHtml'
import {
  clientDisplayName,
  emptyBisApplicationDetailsForm,
  formatCmA,
  formatCmL,
  isCodeDisplayLabel,
  manakLoginFromProject,
  rowToBisApplicationDetailsForm,
  sanitizeBisLicenseScopeNotes,
  type BisApplicationDetailsForm,
  type BisProjectRow,
} from './types'

const thBase =
  'bg-stone-800 text-center text-[11px] font-bold uppercase tracking-[0.14em] text-amber-200'

const checkboxClass =
  'h-4 w-4 rounded-none border-stone-500 text-amber-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/30'

const actionBtnClass =
  'inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-none p-0 text-amber-900 hover:bg-amber-100 hover:text-amber-950'

const rowEvenClass = 'bg-[#f7f3eb] hover:bg-[#f3e9d8]'
const rowOddClass = 'bg-[#fffcf7] hover:bg-[#f3e9d8]'
const rowSelectedClass = 'bg-[#fde68a]/80 hover:bg-[#fde68a]/80'

const TABLE_MQ_SHOW = 'hidden lg:block'
const CARDS_MQ_SHOW = 'lg:hidden'

const FILE_ACCEPT = '.pdf,.png,.jpg,.jpeg,.doc,.docx,.xls,.xlsx,application/pdf,image/*'

type DraftRow = {
  id: string
  name: string
}

type TableEntry =
  | { key: string; kind: 'file'; file: BisProjectViewFile }
  | { key: string; kind: 'draft'; draft: DraftRow }

type ClientMasterLocation = {
  company_name: string
  address: string
  pin_code: string
  district: string
  state: string
  country: string
  latitude: string
  longitude: string
}

async function loadClientMasterLocation(clientId: string): Promise<ClientMasterLocation | null> {
  const baseColumns = 'company_name, address, pin_code, district, state, country'
  let result = await supabase
    .from('clients')
    .select(`${baseColumns}, latitude, longitude`)
    .eq('id', clientId)
    .maybeSingle()
  if (
    result.error &&
    (['42703', 'PGRST204'].includes(result.error.code ?? '') ||
      (/column/i.test(result.error.message) && /does not exist|schema cache/i.test(result.error.message)))
  ) {
    result = await supabase
      .from('clients')
      .select(baseColumns)
      .eq('id', clientId)
      .maybeSingle()
  }
  if (result.error) throw result.error
  const data = result.data as Record<string, unknown> | null
  if (!data) return null
  const text = (value: unknown) => String(value ?? '').trim()
  return {
    company_name: text(data.company_name),
    address: text(data.address),
    pin_code: text(data.pin_code),
    district: text(data.district),
    state: text(data.state),
    country: text(data.country),
    latitude: text(data.latitude),
    longitude: text(data.longitude),
  }
}

function newDraft(): DraftRow {
  return { id: crypto.randomUUID(), name: '' }
}

function UndertakingCurrencyField({ label, value, disabled, onChange, bare = false }: {
  bare?: boolean
  label: string
  value: string
  disabled: boolean
  onChange: (value: string) => void
}) {
  const [focused, setFocused] = useState(false)
  const field = (
    <>
      <span className="flex h-8 min-w-0 overflow-hidden rounded-none border border-stone-300 bg-white focus-within:border-amber-600 focus-within:bg-white focus-within:ring-2 focus-within:ring-amber-500/20">
        <span className="inline-flex shrink-0 items-center border-r border-stone-500 bg-stone-100 px-2.5 text-sm font-semibold text-stone-700" aria-hidden>{getCurrencySymbol()}</span>
        <Input
          type="text"
          inputMode="decimal"
          value={focused ? value : formatMoneyInput(value || '0')}
          onFocus={() => setFocused(true)}
          onChange={(event) => onChange(sanitizeMoneyInput(event.target.value))}
          onBlur={(event) => { setFocused(false); onChange(formatMoneyInput(event.target.value || '0')) }}
          disabled={disabled}
          placeholder="0.00"
          className="h-full min-w-0 flex-1 rounded-none !border-0 !bg-transparent text-right tabular-nums shadow-none focus-visible:!ring-0"
          aria-label={`${label} in ${getCurrencyCode()}`}
        />
      </span>
    </>
  )
  return bare ? field : <label className="grid gap-1 text-sm font-medium text-stone-700">{label}{field}</label>
}

const UNDERTAKING_OPTIONS: Array<{
  kind: Extract<BisPrintDocumentKind, 'undertaking-option-2' | 'undertaking-general' | 'undertaking-long-duration' | 'undertaking-mmf' | 'self-evaluation-form'>
  title: string
  compactTitle: string
  icon: string
  description: string
}> = [
  {
    kind: 'self-evaluation-form',
    title: 'Self Evaluation Form',
    compactTitle: 'Self Eval',
    icon: '📋',
    description: 'Self Evaluation cum Verification Form using project raw material, staff and brand records.',
  },
  {
    kind: 'undertaking-general',
    title: 'Undertaking for General ISS',
    compactTitle: 'General ISS',
    icon: '📄',
    description: 'General licence, inspection, quality control and marking commitments.',
  },
  {
    kind: 'undertaking-option-2',
    title: 'Undertaking for Option 2',
    compactTitle: 'Option 2',
    icon: '📝',
    description: 'Option 2 undertaking with applicant, product and factory details.',
  },
  {
    kind: 'undertaking-long-duration',
    title: 'Undertaking for Long Duration Test',
    compactTitle: 'Long Test',
    icon: '⏱️',
    description: 'Long duration test declaration with a test schedule table.',
  },
  {
    kind: 'undertaking-mmf',
    title: 'Undertaking for Minimum Marking Fee',
    compactTitle: 'Min. Fee',
    icon: '💰',
    description: 'Minimum marking fee proposal and supporting calculation schedule.',
  },
]

type UndertakingPreviewOptions = Record<(typeof UNDERTAKING_OPTIONS)[number]['kind'], boolean>
const DEFAULT_UNDERTAKING_PREVIEW_OPTIONS: UndertakingPreviewOptions = {
  'self-evaluation-form': true,
  'undertaking-general': true,
  'undertaking-option-2': true,
  'undertaking-long-duration': false,
  'undertaking-mmf': false,
}

export function LegalDocumentsModuleDialog({
  open,
  onOpenChange,
  row,
  title = 'Legal Documents',
  docKind = 'legal',
  printKind = null,
  onProjectSaved,
  onLocationMapPreview,
  onLocationMapWord,
  onLocationMapPdf,
  onLocationMapPrint,
  onPreviewDocument,
  onPdfDocument,
  onWordDocument,
  initialUndertaking = null,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  row: BisProjectRow | null
  /** Module name shown in the dialog header / document list. */
  title?: string
  docKind?: BisProjectDocKind
  /** View Documents print kind — drives structured editors. */
  printKind?: BisPrintDocumentKind | null
  /** Called after Application Details / structured module fields are saved. */
  onProjectSaved?: () => void
  onLocationMapPreview?: () => void
  onLocationMapWord?: () => void
  onLocationMapPdf?: () => void
  onLocationMapPrint?: () => void
  /** Preview / PDF of the module's own print document (used by the SIT acceptance module). */
  onPreviewDocument?: (kind: BisPrintDocumentKind) => void
  onPdfDocument?: (kind: BisPrintDocumentKind) => void
  onWordDocument?: (kind: BisPrintDocumentKind) => void
  /** Undertaking shown first when the All Undertakings module opens (for example the Minimum Marking Fee one from step 1). */
  initialUndertaking?: (typeof UNDERTAKING_OPTIONS)[number]['kind'] | null
}) {
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const uploadTargetRef = useRef<{ type: 'draft' | 'file'; id: string } | null>(null)
  const showApplicationFields = docKind === 'application' || printKind === 'application-details'
  const showTopManagementFields = printKind === 'top-management'
  const showTechnicalStaffFields = printKind === 'technical-staff'
  const showManufacturingScopeFields = printKind === 'manufacturing-scope'
  const showOslSampleFields = printKind === 'osl-sample-requirements'
  const showFactoryTestFields = printKind === 'factory-test-report'
  const showLocationMapFields = printKind === 'location-map'
  const showPlantLayoutFields = printKind === 'plant-layout'
  const showCmpf305Fields = printKind === 'cmpf-305'
  const showCmpf306Fields = printKind === 'cmpf-306'
  const showCmpf311Fields = printKind === 'cmpf-311'
  // Opened from the All India First button: only the Undertaking for Minimum Marking Fee (Annexure 1) form is shown.
  const mmfOnly = printKind === 'all-required-undertakings' && initialUndertaking === 'undertaking-mmf'
  const showCmpf307Fields = printKind === 'cmpf-307'
  const showCmpf310Fields = printKind === 'cmpf-310'
  const showRawMaterialReferenceFields = printKind === 'raw-material-reference'
  const showAllUndertakingsFields = printKind === 'all-required-undertakings'
  const showSelfEvaluationFields = printKind === 'self-evaluation-form'
  /** Merged Process Flow Chart + Process Description (shared payload). */
  const showProcessFlowFields =
    printKind === 'process-flow-chart' || printKind === 'process-description'
  /** Compact modules: dialog height follows content (no forced tall empty body). */
  const compactFormModule =
    showTopManagementFields ||
    showTechnicalStaffFields ||
    showManufacturingScopeFields
  /** Full main-area sheet (sidebar left clear via --app-dialog-overlay-left). */
  const fullPageModule =
    showApplicationFields ||
    showOslSampleFields ||
    showFactoryTestFields ||
    showLocationMapFields ||
    showPlantLayoutFields ||
    showProcessFlowFields ||
    showCmpf305Fields ||
    showCmpf306Fields ||
    showCmpf311Fields ||
    showCmpf307Fields ||
    showCmpf310Fields ||
    showRawMaterialReferenceFields ||
    showAllUndertakingsFields ||
    showSelfEvaluationFields
  const showFileTable =
    !showApplicationFields &&
    !showTopManagementFields &&
    !showTechnicalStaffFields &&
    !showManufacturingScopeFields &&
    !showOslSampleFields &&
    !showFactoryTestFields &&
    !showLocationMapFields &&
    !showPlantLayoutFields &&
    !showCmpf305Fields &&
    !showCmpf306Fields &&
    !showCmpf311Fields &&
    !showCmpf307Fields &&
    !showCmpf310Fields &&
    !showRawMaterialReferenceFields &&
    !showAllUndertakingsFields &&
    !showSelfEvaluationFields &&
    !showProcessFlowFields

  const [files, setFiles] = useState<BisProjectViewFile[]>([])
  /** Local editable document names for saved files (persisted on Save). */
  const [fileNames, setFileNames] = useState<Record<string, string>>({})
  const [drafts, setDrafts] = useState<DraftRow[]>([newDraft()])
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set())
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [printingUndertaking, setPrintingUndertaking] = useState(false)
  const [selectedUndertaking, setSelectedUndertaking] = useState<(typeof UNDERTAKING_OPTIONS)[number]['kind']>('self-evaluation-form')
  useEffect(() => {
    if (open && showAllUndertakingsFields && initialUndertaking) setSelectedUndertaking(initialUndertaking)
  }, [open, showAllUndertakingsFields, initialUndertaking])
  const [undertakingPreviewOptions, setUndertakingPreviewOptions] = useState<UndertakingPreviewOptions>(DEFAULT_UNDERTAKING_PREVIEW_OPTIONS)
  const [undertakingPreviewOptionsLoadedFor, setUndertakingPreviewOptionsLoadedFor] = useState<string | null>(null)
  const [undertakingPreviewOptionsTouched, setUndertakingPreviewOptionsTouched] = useState(false)
  const [undertakingGeneral, setUndertakingGeneral] = useState<UndertakingGeneralPayload>(() => emptyUndertakingGeneralPayload())
  const [undertakingLongDuration, setUndertakingLongDuration] = useState<UndertakingLongDurationPayload>(() => emptyUndertakingLongDurationPayload())
  const [longDurationDraft, setLongDurationDraft] = useState(() => emptyUndertakingLongDurationRow())
  const [editingLongDurationIndex, setEditingLongDurationIndex] = useState<number | null>(null)
  const [selectedLongDurationRows, setSelectedLongDurationRows] = useState<Set<number>>(() => new Set())
  const [undertakingMinimumFee, setUndertakingMinimumFee] = useState<UndertakingMinimumFeePayload>(() => emptyUndertakingMinimumFeePayload())
  const [companyFirmStatus, setCompanyFirmStatus] = useState('')
  const [selfEvaluation, setSelfEvaluation] = useState<SelfEvaluationPayload>(() => emptySelfEvaluationPayload())
  // SEF "Packaging & Marking" follows Step 4 Packaging and Marking once that is saved.
  const [linkedPackagingRows, setLinkedPackagingRows] = useState<Array<{ label: string; value: string }> | null>(null)
  useEffect(() => {
    if (!open || !row?.id) return
    let cancelled = false
    fetchBisModulePayload(row.id, 'packaging-marking')
      .then((payload) => {
        if (!cancelled) setLinkedPackagingRows(sefPackagingRowsFrom(packagingMarkingFieldsFrom(payload)))
      })
      .catch(() => {
        if (!cancelled) setLinkedPackagingRows(null)
      })
    return () => {
      cancelled = true
    }
  }, [open, row?.id])
  const [saving, setSaving] = useState(false)
  const [status, setStatus] = useState<string | null>(null)
  const [appDetails, setAppDetails] = useState<BisApplicationDetailsForm>(() =>
    emptyBisApplicationDetailsForm(),
  )
  const [topManagement, setTopManagement] = useState<TopManagementModulePayload>(() =>
    emptyTopManagementPayload(),
  )
  const [technicalStaff, setTechnicalStaff] = useState<TechnicalStaffModulePayload>(() =>
    emptyTechnicalStaffPayload(),
  )
  const [oslSamples, setOslSamples] = useState<OslSampleRequirementsModulePayload>(() =>
    emptyOslSampleRequirementsPayload(),
  )
  const [factoryTestReports, setFactoryTestReports] = useState<FactoryTestReportModulePayload>(
    () => emptyFactoryTestReportPayload(),
  )
  /** Sample rows available when editing Factory Test Report (from Sample Requirements). */
  const [factorySampleOptions, setFactorySampleOptions] = useState<OslSampleRequirementRow[]>([])
  const [locationMap, setLocationMap] = useState<LocationMapModulePayload>(() =>
    emptyLocationMapPayload(),
  )
  const [clientLegalDocuments, setClientLegalDocuments] = useState<ClientCertificateFile[]>([])
  const [selectedClientDocumentIds, setSelectedClientDocumentIds] = useState<Set<string>>(() => new Set())
  const [editingClientDocument, setEditingClientDocument] = useState<ClientCertificateFile | null>(null)
  const [clientDocumentEdit, setClientDocumentEdit] = useState({ name: '', issuedOn: '', number: '' })
  const [applicationReferenceLoading, setApplicationReferenceLoading] = useState(false)
  const [applicationBranchOffices, setApplicationBranchOffices] = useState<BisBranchOfficeRow[]>([])
  const [applicationClientLocation, setApplicationClientLocation] = useState<ClientMasterLocation | null>(null)
  const [applicationSavedLocationMap, setApplicationSavedLocationMap] =
    useState<LocationMapModulePayload>(() => emptyLocationMapPayload())
  const [plantLayout, setPlantLayout] = useState<PlantLayoutModulePayload>(() =>
    emptyPlantLayoutPayload(),
  )
  const [cmpf305, setCmpf305] = useState<Cmpf305ModulePayload>(() => emptyCmpf305Payload())
  const [cmpf306, setCmpf306] = useState<Cmpf306ModulePayload>(() => emptyCmpf306Payload())
  const [cmpf311, setCmpf311] = useState<Cmpf311ModulePayload>(() => emptyCmpf311Payload())
  const [cmpf307, setCmpf307] = useState<Cmpf307ModulePayload>(() => emptyCmpf307Payload())
  const [brandImportOpen, setBrandImportOpen] = useState(false)
  const [flowImportOpen, setFlowImportOpen] = useState(false)
  const [cmpf310, setCmpf310] = useState<Cmpf310ModulePayload>(() => emptyCmpf310Payload())
  const [rawMaterialReference, setRawMaterialReference] = useState<RawMaterialReferencePayload>(() => emptyRawMaterialReferencePayload())
  const [processFlow, setProcessFlow] = useState<ProcessFlowModulePayload>(() =>
    emptyProcessFlowPayload(),
  )
  /** Shared with Add Application / Licence → Notes / License Scope. */
  const [licenseScopeNotes, setLicenseScopeNotes] = useState('')

  const subtitle = row
    ? [clientDisplayName(row) || '—', isCodeDisplayLabel(row), formatCmL(row.cm_l_digits)]
        .filter(Boolean)
        .join(' · ')
    : '—'

  const applicationDisplayLocation = useMemo(() => {
    const normalizeOfficeLabel = (value: string) =>
      value.toLowerCase().replace(/[^a-z0-9]/g, '')
    const branchName = normalizeOfficeLabel(appDetails.branchName)
    const branchState = normalizeOfficeLabel(appDetails.branchState)
    const matchesOriginalBranch =
      branchName === normalizeOfficeLabel(row?.branch_name ?? '') &&
      branchState === normalizeOfficeLabel(row?.branch_state ?? '')
    const office =
      applicationBranchOffices.find(
        (candidate) =>
          normalizeOfficeLabel(candidate.name) === branchName &&
          (!branchState || normalizeOfficeLabel(candidate.state ?? '') === branchState),
      ) ??
      (matchesOriginalBranch
        ? applicationBranchOffices.find((candidate) => candidate.id === row?.bis_office_id)
        : undefined)
    return {
      office,
      firmLatitude: applicationClientLocation?.latitude || applicationSavedLocationMap.firmLatitude,
      firmLongitude: applicationClientLocation?.longitude || applicationSavedLocationMap.firmLongitude,
      bisLatitude: office?.latitude ?? (matchesOriginalBranch ? applicationSavedLocationMap.bisLatitude : ''),
      bisLongitude: office?.longitude ?? (matchesOriginalBranch ? applicationSavedLocationMap.bisLongitude : ''),
    }
  }, [
    appDetails.branchName,
    appDetails.branchState,
    row?.branch_name,
    row?.branch_state,
    row?.bis_office_id,
    applicationBranchOffices,
    applicationClientLocation,
    applicationSavedLocationMap,
  ])

  const entries: TableEntry[] = [
    ...files.map((file) => ({ key: file.id, kind: 'file' as const, file })),
    ...drafts.map((draft) => ({ key: draft.id, kind: 'draft' as const, draft })),
  ]

  const allChecked = entries.length > 0 && entries.every((e) => selectedIds.has(e.key))
  const someChecked = entries.some((e) => selectedIds.has(e.key))

  const ensureTrailingDraft = (nextDrafts: DraftRow[]) => {
    if (nextDrafts.length === 0) return [newDraft()]
    const hasEmpty = nextDrafts.some((d) => d.name.trim().length === 0)
    return hasEmpty ? nextDrafts : [...nextDrafts, newDraft()]
  }

  /** Reload saved files only — never rewrite other draft row names. */
  const reloadFiles = async (projectId: string, opts?: { showLoading?: boolean }) => {
    if (opts?.showLoading !== false) setLoading(true)
    setStatus(null)
    try {
      const listed = await listBisProjectFiles(projectId, docKind)
      setFiles(listed)
      setFileNames(Object.fromEntries(listed.map((f) => [f.id, f.file_name])))
    } catch (err) {
      setFiles([])
      setFileNames({})
      setStatus(formatBisProjectFilesError(err))
    } finally {
      if (opts?.showLoading !== false) setLoading(false)
    }
  }

  useEffect(() => {
    if (!open || !row?.id) {
      setFiles([])
      setFileNames({})
      setDrafts([newDraft()])
      setSelectedIds(new Set())
      setStatus(null)
      setBusy(false)
      setSaving(false)
      setAppDetails(emptyBisApplicationDetailsForm())
      setTopManagement(emptyTopManagementPayload())
      setTechnicalStaff(emptyTechnicalStaffPayload())
      setOslSamples(emptyOslSampleRequirementsPayload())
      setFactoryTestReports(emptyFactoryTestReportPayload())
      setFactorySampleOptions([])
      setLocationMap(emptyLocationMapPayload())
      setClientLegalDocuments([])
      setSelectedClientDocumentIds(new Set())
      setEditingClientDocument(null)
      setClientDocumentEdit({ name: '', issuedOn: '', number: '' })
      setApplicationReferenceLoading(false)
      setApplicationBranchOffices([])
      setApplicationClientLocation(null)
      setApplicationSavedLocationMap(emptyLocationMapPayload())
      setPlantLayout(emptyPlantLayoutPayload())
      setCmpf305(emptyCmpf305Payload())
      setCmpf306(emptyCmpf306Payload())
      setCmpf311(emptyCmpf311Payload())
      setCmpf307(emptyCmpf307Payload())
      setCmpf310(emptyCmpf310Payload())
      setRawMaterialReference(emptyRawMaterialReferencePayload())
      setProcessFlow(emptyProcessFlowPayload())
      setUndertakingGeneral(emptyUndertakingGeneralPayload())
      setUndertakingLongDuration(emptyUndertakingLongDurationPayload())
      setLongDurationDraft(emptyUndertakingLongDurationRow())
      setEditingLongDurationIndex(null)
      setSelectedLongDurationRows(new Set())
      setUndertakingMinimumFee(emptyUndertakingMinimumFeePayload())
      setCompanyFirmStatus('')
      setSelfEvaluation(emptySelfEvaluationPayload())
      setUndertakingPreviewOptions(DEFAULT_UNDERTAKING_PREVIEW_OPTIONS)
      setUndertakingPreviewOptionsLoadedFor(null)
      setUndertakingPreviewOptionsTouched(false)
      setLicenseScopeNotes('')
      return
    }
    setDrafts([newDraft()])
    setSelectedIds(new Set())
    setAppDetails(
      showApplicationFields
        ? rowToBisApplicationDetailsForm(row)
        : emptyBisApplicationDetailsForm(),
    )
    setLicenseScopeNotes(sanitizeBisLicenseScopeNotes(row.notes ?? ''))
    if (showLocationMapFields) setClientLegalDocuments([])

    if (showApplicationFields) {
      setFiles([])
      setFileNames({})
      setApplicationReferenceLoading(true)
      setStatus(null)
      void (async () => {
        try {
          const [certificates, clientLocation, branchOffices, savedMapPayload, isCodeUnit] =
            await Promise.all([
              row.client_id ? listClientCertificates(row.client_id) : Promise.resolve([]),
              row.client_id
                ? loadClientMasterLocation(row.client_id)
                : Promise.resolve(null),
              listBisBranchOffices(),
              fetchBisModulePayload(row.id, 'location-map').catch(() => null),
              row.production_unit?.trim() || row.is_code?.unit_of_is?.trim()
                ? Promise.resolve(row.production_unit?.trim() || row.is_code?.unit_of_is?.trim() || '')
                : row.is_code_id
                  ? supabase
                      .from('is_codes')
                      .select('unit_of_is')
                      .eq('id', row.is_code_id)
                      .maybeSingle()
                      .then(({ data }) => String((data as { unit_of_is?: string | null } | null)?.unit_of_is ?? '').trim())
                  : Promise.resolve(''),
            ])
          if (isCodeUnit) {
            setAppDetails((current) => current.productionUnit
              ? current
              : { ...current, productionUnit: isCodeUnit })
          }
          setClientLegalDocuments(certificates)
          setSelectedClientDocumentIds(new Set())
          setApplicationClientLocation(clientLocation)
          setApplicationBranchOffices(branchOffices)
          setApplicationSavedLocationMap(parseLocationMapPayload(savedMapPayload))
        } catch (err) {
          setClientLegalDocuments([])
          setApplicationBranchOffices([])
          setStatus(formatBisApiError(err))
        } finally {
          setApplicationReferenceLoading(false)
        }
      })()
      return
    }

    if (showManufacturingScopeFields) {
      setFiles([])
      setFileNames({})
      setLoading(false)
      return
    }

    if (showAllUndertakingsFields || showSelfEvaluationFields) {
      setFiles([])
      setFileNames({})
      setLoading(true)
      setStatus(null)
      void (async () => {
        try {
          const [general, duration, fee, evaluation, company, previewSettings] = await Promise.all([
            showAllUndertakingsFields ? fetchBisModulePayload(row.id, 'undertaking-general').catch(() => null) : Promise.resolve(null),
            showAllUndertakingsFields ? fetchBisModulePayload(row.id, 'undertaking-long-duration').catch(() => null) : Promise.resolve(null),
            showAllUndertakingsFields ? fetchBisModulePayload(row.id, 'undertaking-mmf').catch(() => null) : Promise.resolve(null),
            fetchBisModulePayload(row.id, 'self-evaluation-form').catch(() => null),
            row.client_id
              ? supabase.from('clients').select('company_scale').eq('id', row.client_id).maybeSingle()
              : Promise.resolve({ data: null, error: null }),
            showAllUndertakingsFields ? fetchBisModulePayload(row.id, 'all-required-undertakings').catch(() => null) : Promise.resolve(null),
          ])
          if (company.error) throw company.error
          const firmStatus = undertakingFirmStatusFromCompanyScale(
            (company.data as { company_scale?: unknown } | null)?.company_scale,
          )
          setUndertakingGeneral(parseUndertakingGeneralPayload(general))
          setUndertakingLongDuration(parseUndertakingLongDurationPayload(duration))
          setLongDurationDraft(emptyUndertakingLongDurationRow())
          setEditingLongDurationIndex(null)
          setSelectedLongDurationRows(new Set())
          setCompanyFirmStatus(firmStatus)
          setUndertakingMinimumFee({ ...parseUndertakingMinimumFeePayload(fee), firmStatus })
          setSelfEvaluation(parseSelfEvaluationPayload(evaluation))
          const savedPreviewOptions = previewSettings?.previewOptions
          setUndertakingPreviewOptions({
            ...DEFAULT_UNDERTAKING_PREVIEW_OPTIONS,
            ...(previewSettings?.previewOptionsVersion === 2 && savedPreviewOptions && typeof savedPreviewOptions === 'object' ? savedPreviewOptions as Partial<UndertakingPreviewOptions> : {}),
          })
          setUndertakingPreviewOptionsTouched(false)
          if (showAllUndertakingsFields) setUndertakingPreviewOptionsLoadedFor(row.id)
        } catch (err) {
          setStatus(formatBisApiError(err))
        } finally {
          setLoading(false)
        }
      })()
      return
    }

    if (
      showTopManagementFields ||
      showTechnicalStaffFields ||
      showOslSampleFields ||
      showFactoryTestFields ||
      showLocationMapFields ||
      showPlantLayoutFields ||
      showCmpf305Fields ||
      showCmpf306Fields ||
      showCmpf311Fields ||
      showCmpf307Fields ||
      showRawMaterialReferenceFields ||
      showProcessFlowFields
    ) {
      setFiles([])
      setFileNames({})
      setLoading(true)
      setStatus(null)
      void (async () => {
        try {
          // Process Description opens the same merged payload as Process Flow Chart.
          const payloadKind =
            printKind === 'process-description' ? 'process-flow-chart' : printKind
          const payload = payloadKind
            ? await fetchBisModulePayload(row.id, payloadKind)
            : null
          if (showTopManagementFields) {
            const parsed = parseTopManagementPayload(payload)
            setTopManagement(
              parsed.rows.length > 0
                ? parsed
                : {
                    ...emptyTopManagementPayload(),
                    signatoryName: '',
                    rows: emptyTopManagementPayload().rows.map((r, i) =>
                      i === 0
                        ? {
                            ...r,
                            personName: '',
                          }
                        : r,
                    ),
                  },
            )
          }
          if (showTechnicalStaffFields) {
            const parsed = parseTechnicalStaffPayload(payload)
            setTechnicalStaff(parsed.rows.length > 0 ? parsed : emptyTechnicalStaffPayload())
          }
          if (showOslSampleFields) {
            setOslSamples(parseOslSampleRequirementsPayload(payload))
          }
          if (showFactoryTestFields) {
            const parsed = parseFactoryTestReportPayload(payload)
            const techRaw = await fetchBisModulePayload(row.id, 'technical-staff').catch(
              () => null,
            )
            const techPerson = resolveTechnicalStaffForTestedBy(techRaw)
            setFactoryTestReports({
              ...parsed,
              inspectionOfficerName:
                (row.inspection_officer_name ?? '').trim() || parsed.inspectionOfficerName,
              inspectionOfficerDesignation:
                (row.inspection_officer_designation ?? '').trim() ||
                parsed.inspectionOfficerDesignation,
              testedByName:
                (techPerson?.personName ?? '').trim() || parsed.testedByName,
              testedByDesignation:
                (techPerson?.designation ?? '').trim() ||
                (parsed.testedByDesignation === 'Technical Staff / Quality Control Incharge'
                  ? ''
                  : parsed.testedByDesignation),
            })
            const samplePayload = await fetchBisModulePayload(
              row.id,
              'osl-sample-requirements',
            ).catch(() => null)
            setFactorySampleOptions(
              parseOslSampleRequirementsPayload(samplePayload).rows.filter(oslSampleRowHasContent),
            )
          }
          if (showLocationMapFields) {
            const [certificates, clientGeoResult, branchOffices] = await Promise.all([
              row.client_id ? listClientCertificates(row.client_id) : Promise.resolve([]),
              row.client_id
                ? supabase.from('clients').select('latitude, longitude').eq('id', row.client_id).maybeSingle()
                : Promise.resolve({ data: null, error: null }),
              listBisBranchOffices().catch(() => []),
            ])
            const savedMap = parseLocationMapPayload(payload)
            const clientGeo = clientGeoResult.data as { latitude?: unknown; longitude?: unknown } | null
            const normalizeOfficeLabel = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, '')
            const branchName = normalizeOfficeLabel(row.branch_name ?? '')
            const branchState = normalizeOfficeLabel(row.branch_state ?? '')
            const officeGeo = branchOffices.find((office) =>
              normalizeOfficeLabel(office.name) === branchName &&
              (!branchState || normalizeOfficeLabel(office.state ?? '') === branchState),
            ) ?? branchOffices.find((office) => office.id === row.bis_office_id)
            setClientLegalDocuments(certificates)
            setLocationMap({
              ...savedMap,
              firmLatitude: String(clientGeo?.latitude ?? '').trim() || savedMap.firmLatitude,
              firmLongitude: String(clientGeo?.longitude ?? '').trim() || savedMap.firmLongitude,
              bisLatitude: officeGeo?.latitude || savedMap.bisLatitude,
              bisLongitude: officeGeo?.longitude || savedMap.bisLongitude,
            })
          }
          if (showPlantLayoutFields) {
            setPlantLayout(parsePlantLayoutPayload(payload))
          }
          if (showCmpf305Fields) {
            const parsed = parseCmpf305Payload(payload)
            const hasSaved =
              parsed.rows.some(cmpf305RowHasContent) ||
              parsed.firmRepName ||
              parsed.firmRepDesignation ||
              parsed.inspectionOfficerName ||
              parsed.inspectionOfficerDesignation
            setCmpf305(
              hasSaved
                ? {
                    ...parsed,
                    inspectionOfficerName:
                      (row.inspection_officer_name ?? '').trim() || parsed.inspectionOfficerName,
                    inspectionOfficerDesignation:
                      (row.inspection_officer_designation ?? '').trim() ||
                      parsed.inspectionOfficerDesignation,
                  }
                : {
                    ...emptyCmpf305Payload(),
                    firmRepName: '',
                    firmRepDesignation: '',
                    inspectionOfficerName: (row.inspection_officer_name ?? '').trim(),
                    inspectionOfficerDesignation: (
                      row.inspection_officer_designation ?? ''
                    ).trim(),
                  },
            )
          }
          if (showCmpf306Fields) {
            const parsed = parseCmpf306Payload(payload)
            const hasSaved =
              parsed.rows.some(cmpf306RowHasContent) ||
              parsed.firmRepName ||
              parsed.firmRepDesignation ||
              parsed.inspectionOfficerName ||
              parsed.inspectionOfficerDesignation
            setCmpf306(
              hasSaved
                ? {
                    ...parsed,
                    inspectionOfficerName:
                      (row.inspection_officer_name ?? '').trim() || parsed.inspectionOfficerName,
                    inspectionOfficerDesignation:
                      (row.inspection_officer_designation ?? '').trim() ||
                      parsed.inspectionOfficerDesignation,
                  }
                : {
                    ...emptyCmpf306Payload(),
                    firmRepName: '',
                    firmRepDesignation: '',
                    inspectionOfficerName: (row.inspection_officer_name ?? '').trim(),
                    inspectionOfficerDesignation: (
                      row.inspection_officer_designation ?? ''
                    ).trim(),
                  },
            )
          }
          if (showCmpf311Fields) {
            const parsed = parseCmpf311Payload(payload)
            setCmpf311(parsed)
          }
          if (showCmpf307Fields) {
            setCmpf307(parseCmpf307Payload(payload))
          }
          if (showCmpf310Fields) setCmpf310(parseCmpf310Payload(payload))
          if (showRawMaterialReferenceFields) setRawMaterialReference(parseRawMaterialReferencePayload(payload))
          if (showProcessFlowFields) {
            setProcessFlow(parseProcessFlowPayload(payload))
          }
        } catch (err) {
          setStatus(formatBisApiError(err))
          if (showTopManagementFields) setTopManagement(emptyTopManagementPayload())
          if (showTechnicalStaffFields) setTechnicalStaff(emptyTechnicalStaffPayload())
          if (showOslSampleFields) setOslSamples(emptyOslSampleRequirementsPayload())
          if (showFactoryTestFields) {
            setFactoryTestReports(emptyFactoryTestReportPayload())
            setFactorySampleOptions([])
          }
          if (showLocationMapFields) setLocationMap(emptyLocationMapPayload())
          if (showPlantLayoutFields) setPlantLayout(emptyPlantLayoutPayload())
          if (showCmpf305Fields) setCmpf305(emptyCmpf305Payload())
          if (showCmpf306Fields) setCmpf306(emptyCmpf306Payload())
          if (showCmpf311Fields) setCmpf311(emptyCmpf311Payload())
          if (showCmpf307Fields) setCmpf307(emptyCmpf307Payload())
          if (showCmpf310Fields) setCmpf310(emptyCmpf310Payload())
          if (showRawMaterialReferenceFields) setRawMaterialReference(emptyRawMaterialReferencePayload())
          if (showProcessFlowFields) setProcessFlow(emptyProcessFlowPayload())
        } finally {
          setLoading(false)
        }
      })()
      return
    }

    void reloadFiles(row.id)
  }, [
    open,
    row?.id,
    docKind,
    printKind,
    showApplicationFields,
    showTopManagementFields,
    showTechnicalStaffFields,
    showManufacturingScopeFields,
    showOslSampleFields,
    showFactoryTestFields,
    showLocationMapFields,
    showPlantLayoutFields,
    showCmpf305Fields,
    showCmpf306Fields,
    showCmpf311Fields,
    showCmpf307Fields,
    showCmpf310Fields,
    showRawMaterialReferenceFields,
    showProcessFlowFields,
    showAllUndertakingsFields,
    showSelfEvaluationFields,
    row?.notes,
    row?.client_id,
    row?.inspection_officer_name,
    row?.inspection_officer_designation,
  ])

  useEffect(() => {
    if (!open || !row?.id || loading || (!showAllUndertakingsFields && !showSelfEvaluationFields)) return
    const timer = window.setTimeout(() => {
      const saves: Promise<unknown>[] = []
      if (showAllUndertakingsFields && selectedUndertaking === 'undertaking-general') {
        saves.push(saveBisModulePayload(row.id, 'undertaking-general', undertakingGeneral))
      } else if (showAllUndertakingsFields && selectedUndertaking === 'undertaking-long-duration') {
        saves.push(saveBisModulePayload(row.id, 'undertaking-long-duration', undertakingLongDuration))
      } else if (showAllUndertakingsFields && selectedUndertaking === 'undertaking-mmf') {
        saves.push(saveBisModulePayload(row.id, 'undertaking-mmf', undertakingMinimumFee))
      } else if (selectedUndertaking === 'self-evaluation-form' || showSelfEvaluationFields) {
        saves.push(saveBisModulePayload(row.id, 'self-evaluation-form', selfEvaluation))
      }
      void Promise.all(saves).catch((err) => toast.error(formatBisApiError(err)))
    }, 700)
    return () => window.clearTimeout(timer)
  }, [
    open, row?.id, loading, showAllUndertakingsFields, showSelfEvaluationFields, selectedUndertaking,
    undertakingGeneral, undertakingLongDuration, undertakingMinimumFee, selfEvaluation,
  ])

  useEffect(() => {
    if (!open || !row?.id || !showAllUndertakingsFields || undertakingPreviewOptionsLoadedFor !== row.id || !undertakingPreviewOptionsTouched) return
    const timer = window.setTimeout(() => {
      void saveBisModulePayload(row.id, 'all-required-undertakings', { previewOptionsVersion: 2, previewOptions: undertakingPreviewOptions })
        .catch((err) => toast.error(formatBisApiError(err)))
    }, 400)
    return () => window.clearTimeout(timer)
  }, [open, row?.id, showAllUndertakingsFields, undertakingPreviewOptions, undertakingPreviewOptionsLoadedFor, undertakingPreviewOptionsTouched])

  useEffect(() => {
    const clientId = row?.client_id
    if (!open || !showApplicationFields || !clientId) return

    let active = true
    let loadingLatest = false
    const refreshClientLocation = async () => {
      if (document.visibilityState === 'hidden' || loadingLatest) return
      loadingLatest = true
      try {
        const location = await loadClientMasterLocation(clientId)
        if (active) setApplicationClientLocation(location)
      } catch {
        // The main load path reports data errors; focus refresh remains best-effort.
      } finally {
        loadingLatest = false
      }
    }
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') void refreshClientLocation()
    }
    window.addEventListener('focus', refreshClientLocation)
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => {
      active = false
      window.removeEventListener('focus', refreshClientLocation)
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
  }, [open, row?.client_id, showApplicationFields])

  const resolveRowDocumentName = (target: { type: 'draft' | 'file'; id: string }): string => {
    if (target.type === 'file') {
      return (fileNames[target.id] ?? files.find((f) => f.id === target.id)?.file_name ?? '').trim()
    }
    return (drafts.find((d) => d.id === target.id)?.name ?? '').trim()
  }

  const openFilePicker = (target: { type: 'draft' | 'file'; id: string }) => {
    const documentName = resolveRowDocumentName(target)
    if (!documentName) {
      toast.error('Enter Documents Name in This Row Before Uploading.')
      return
    }
    uploadTargetRef.current = target
    fileInputRef.current?.click()
  }

  const handleFilesPicked = async (picked: File[]) => {
    if (!row?.id || picked.length === 0) return
    const target = uploadTargetRef.current
    uploadTargetRef.current = null
    if (!target) return

    // Capture this row's name synchronously so async refresh cannot mix other rows.
    const displayName = resolveRowDocumentName(target)
    if (!displayName) {
      toast.error('Enter Documents Name in This Row Before Uploading.')
      return
    }

    setBusy(true)
    setStatus(null)
    try {
      if (target.type === 'file') {
        const existing = files.find((f) => f.id === target.id)
        await uploadBisProjectFiles(row.id, picked.slice(0, 1), docKind, { displayName })
        if (existing) {
          try {
            await deleteBisProjectFile(existing)
          } catch {
            // keep new file even if old delete fails
          }
        }
        setSelectedIds((prev) => {
          const next = new Set(prev)
          next.delete(target.id)
          return next
        })
        await reloadFiles(row.id, { showLoading: false })
        toast.success('Document Replaced')
      } else {
        await uploadBisProjectFiles(row.id, picked.slice(0, 1), docKind, { displayName })
        // Drop only the uploaded draft row; leave every other draft name untouched.
        setDrafts((prev) => ensureTrailingDraft(prev.filter((d) => d.id !== target.id)))
        setSelectedIds((prev) => {
          const next = new Set(prev)
          next.delete(target.id)
          return next
        })
        await reloadFiles(row.id, { showLoading: false })
        toast.success('Document Uploaded')
      }
      setStatus(null)
    } catch (err) {
      const msg = formatBisProjectFilesError(err)
      setStatus(msg)
      toast.error(msg)
    } finally {
      setBusy(false)
    }
  }

  const handleDeleteFile = async (file: BisProjectViewFile) => {
    if (!row?.id) return
    setBusy(true)
    setStatus(null)
    try {
      await deleteBisProjectFile(file)
      setSelectedIds((prev) => {
        const next = new Set(prev)
        next.delete(file.id)
        return next
      })
      setFileNames((prev) => {
        const next = { ...prev }
        delete next[file.id]
        return next
      })
      // Optimistic remove so UI updates even if list reload is slow.
      setFiles((prev) => prev.filter((f) => f.id !== file.id))
      await reloadFiles(row.id, { showLoading: false })
      toast.success('Document Deleted')
    } catch (err) {
      const msg = formatBisProjectFilesError(err)
      setStatus(msg)
      toast.error(msg)
      await reloadFiles(row.id, { showLoading: false })
    } finally {
      setBusy(false)
    }
  }

  const addNewRow = () => {
    setDrafts((prev) => [...prev, newDraft()])
  }

  const deleteRow = (entry: TableEntry) => {
    if (busy || saving) return
    if (entry.kind === 'draft') {
      // Always allow deleting a draft row (including the last empty one when files exist).
      setDrafts((prev) => {
        const next = prev.filter((d) => d.id !== entry.draft.id)
        if (next.length > 0) return next
        // No drafts left: add one empty only if there are zero saved files.
        return files.length === 0 ? [newDraft()] : []
      })
      setSelectedIds((prev) => {
        const next = new Set(prev)
        next.delete(entry.draft.id)
        return next
      })
      return
    }
    void handleDeleteFile(entry.file)
  }

  const handleSave = async () => {
    if (!row?.id) return

    const isApplicationProject =
      (row.project_kind ?? '').trim().toLowerCase() === 'application'
    if (
      showApplicationFields &&
      !isApplicationProject &&
      appDetails.licenseNumberDigits.length > 0 &&
      appDetails.licenseNumberDigits.length !== 10
    ) {
      toast.error('License Number Must Be Exactly 10 Digits (CM/L-).')
      return
    }

    setSaving(true)
    setStatus(null)
    try {
      if (showAllUndertakingsFields) {
        await Promise.all([
          saveBisModulePayload(row.id, 'self-evaluation-form', selfEvaluation),
          saveBisModulePayload(row.id, 'undertaking-general', undertakingGeneral),
          saveBisModulePayload(row.id, 'undertaking-long-duration', undertakingLongDuration),
          saveBisModulePayload(row.id, 'undertaking-mmf', undertakingMinimumFee),
          saveBisModulePayload(row.id, 'all-required-undertakings', {
            previewOptionsVersion: 2,
            previewOptions: undertakingPreviewOptions,
          }),
        ])
        setUndertakingPreviewOptionsTouched(false)
        onProjectSaved?.()
        toast.success('Undertaking Documents and Preview Settings Saved.')
        return
      }

      if (showSelfEvaluationFields) {
        await saveBisModulePayload(row.id, 'self-evaluation-form', selfEvaluation)
        onProjectSaved?.()
        toast.success('Self Evaluation Form Saved.')
        return
      }

      if (showApplicationFields) {
        await saveBisApplicationDetails(row.id, appDetails)
        onProjectSaved?.()
        toast.success(`${title} saved.`)
        return
      }

      if (showTopManagementFields && printKind) {
        const rows = topManagement.rows.filter((r) =>
          Object.values(r).some((v) => typeof v === 'string' && v.trim().length > 0),
        )
        await saveBisModulePayload(row.id, printKind, {
          rows: rows.length > 0 ? rows : topManagement.rows.slice(0, 1),
          signatoryName: topManagement.signatoryName.trim(),
          signatoryDesignation: topManagement.signatoryDesignation.trim(),
          includeAuthorizedSignatory: topManagement.includeAuthorizedSignatory,
          authorizedSignatoryName: topManagement.authorizedSignatoryName.trim(),
          authorizedSignatoryDesignation:
            topManagement.authorizedSignatoryDesignation.trim(),
          authorizedSignatoryEmail: topManagement.authorizedSignatoryEmail.trim(),
          authorizedSignatoryMobile: topManagement.authorizedSignatoryMobile.trim(),
          authorizedBy: topManagement.authorizedBy.trim(),
          authorizedSignatureFileId:
            topManagement.authorizedSignatureFileId.trim(),
          authorizedSignatureFileName:
            topManagement.authorizedSignatureFileName.trim(),
          authorizedSignatureStoragePath:
            topManagement.authorizedSignatureStoragePath.trim(),
          applyAuthorizedSignatureToDocuments:
            topManagement.applyAuthorizedSignatureToDocuments,
        })
        onProjectSaved?.()
        toast.success(`${title} saved.`)
        return
      }

      if (showTechnicalStaffFields && printKind) {
        const rows = technicalStaff.rows.filter((r) =>
          Object.entries(r).some(([key, v]) => {
            if (key === 'applySignatureToDocuments') return Boolean(v)
            return typeof v === 'string' && v.trim().length > 0
          }),
        )
        await saveBisModulePayload(row.id, printKind, {
          rows: rows.length > 0 ? rows : technicalStaff.rows.slice(0, 1),
          signatoryName: technicalStaff.signatoryName.trim(),
          signatoryDesignation: technicalStaff.signatoryDesignation.trim(),
        })
        onProjectSaved?.()
        toast.success(`${title} saved.`)
        return
      }

      if (showManufacturingScopeFields) {
        await saveBisProjectNotes(row.id, sanitizeBisLicenseScopeNotes(licenseScopeNotes))
        onProjectSaved?.()
        toast.success(`${title} saved.`)
        return
      }

      if (showOslSampleFields && printKind) {
        const rows = oslSamples.rows.filter(oslSampleRowHasContent)
        await saveBisModulePayload(row.id, printKind, {
          rows: rows.length > 0 ? rows : [emptyOslSampleRequirementRow()],
          importedQrCodes: oslSamples.importedQrCodes ?? [],
          signatoryName: oslSamples.signatoryName.trim(),
          signatoryDesignation: oslSamples.signatoryDesignation.trim(),
        })
        onProjectSaved?.()
        toast.success(`${title} saved.`)
        return
      }

      if (showFactoryTestFields && printKind) {
        const reports = factoryTestReports.reports.filter(factoryTestReportHasContent)
        await saveBisModulePayload(row.id, printKind, {
          reports,
          inspectionOfficerName: factoryTestReports.inspectionOfficerName.trim(),
          inspectionOfficerDesignation:
            factoryTestReports.inspectionOfficerDesignation.trim(),
          authorisedName: factoryTestReports.authorisedName.trim(),
          authorisedDesignation: factoryTestReports.authorisedDesignation.trim(),
          testedByName: factoryTestReports.testedByName.trim(),
          testedByDesignation: factoryTestReports.testedByDesignation.trim(),
          applyWitnessedBy: factoryTestReports.applyWitnessedBy !== false,
          applyAuthorizedSignatory: factoryTestReports.applyAuthorizedSignatory !== false,
          applyTestedBy: factoryTestReports.applyTestedBy !== false,
        })
        onProjectSaved?.()
        toast.success(`${title} saved.`)
        return
      }

      if (showLocationMapFields && printKind) {
        await saveBisModulePayload(row.id, printKind, {
          firmLatitude: locationMap.firmLatitude.trim(),
          firmLongitude: locationMap.firmLongitude.trim(),
          bisLatitude: locationMap.bisLatitude.trim(),
          bisLongitude: locationMap.bisLongitude.trim(),
          toLocation:
            locationMap.toLocation.trim() ||
            defaultBisToLocation(
              [row.branch_name, row.branch_state]
                .map((x) => (x ?? '').trim())
                .filter(Boolean)
                .join(', '),
            ),
        })
        onProjectSaved?.()
        toast.success(`${title} saved.`)
        return
      }

      if (showPlantLayoutFields && printKind) {
        await saveBisModulePayload(row.id, printKind, {
          boxes: plantLayout.boxes.map((box) => ({
            ...box,
            label: box.label.trim(),
            input: '',
            output: '',
          })),
        })
        onProjectSaved?.()
        toast.success(`${title} saved.`)
        return
      }

      if (showCmpf305Fields && printKind) {
        const rows = cmpf305.rows.filter(cmpf305RowHasContent)
        await saveBisModulePayload(row.id, printKind, {
          rows,
          firmRepName: cmpf305.firmRepName.trim(),
          firmRepDesignation: cmpf305.firmRepDesignation.trim(),
          inspectionOfficerName: cmpf305.inspectionOfficerName.trim(),
          inspectionOfficerDesignation: cmpf305.inspectionOfficerDesignation.trim(),
        })
        onProjectSaved?.()
        toast.success(`${title} saved.`)
        return
      }

      if (showCmpf306Fields && printKind) {
        const rows = cmpf306.rows.filter(cmpf306RowHasContent)
        await saveBisModulePayload(row.id, printKind, {
          rows,
          firmRepName: cmpf306.firmRepName.trim(),
          firmRepDesignation: cmpf306.firmRepDesignation.trim(),
          inspectionOfficerName: cmpf306.inspectionOfficerName.trim(),
          inspectionOfficerDesignation: cmpf306.inspectionOfficerDesignation.trim(),
        })
        onProjectSaved?.()
        toast.success(`${title} saved.`)
        return
      }

      if (showCmpf311Fields && printKind) {
        await saveBisModulePayload(row.id, printKind, {
          ...cmpf311,
          productManualNumber: cmpf311.productManualNumber.trim(),
        })
        onProjectSaved?.()
        toast.success(`${title} saved.`)
        return
      }

      if (showCmpf307Fields && printKind) {
        const completedBrandRows = cmpf307.rows.filter(cmpf307RowHasContent)
        const missingAgreement = completedBrandRows.some((brand) => brand.ownedBy === 'Others' && !brand.agreementFileId)
        if (missingAgreement) {
          toast.error('Upload the Agreement Copy for Each Brand Owned by Others.')
          return
        }
        const missingTrademarkCertificate = completedBrandRows.some((brand) => brand.registeredStatus === 'Registered' && !brand.trademarkFileId)
        if (missingTrademarkCertificate) {
          toast.error('Upload the Trademark License Certificate for Each Registered Brand.')
          return
        }
        await saveBisModulePayload(row.id, printKind, {
          rows: completedBrandRows,
          brandsWithoutMarkReasons: cmpf307.brandsWithoutMarkReasons.trim(),
        })
        onProjectSaved?.()
        toast.success(`${title} saved.`)
        return
      }

      if (showCmpf310Fields && printKind) {
        await saveBisModulePayload(row.id, printKind, {
          feePerYear: cmpf310.feePerYear.trim(),
          unit: cmpf310.unit.trim(),
          allIndiaFirst: cmpf310.allIndiaFirst,
        })
        onProjectSaved?.()
        toast.success(`${title} saved.`)
        return
      }

      if (showRawMaterialReferenceFields) {
        const payload: RawMaterialReferencePayload = {
          rawMaterials: rawMaterialReference.rawMaterials.map((item) => ({
            rawMaterial: item.rawMaterial.trim(),
            supplierName: item.supplierName.trim(),
            bisCertificationMark: item.bisCertificationMark.trim(),
            testCertificate: item.testCertificate.trim(),
            batchesPackaging: item.batchesPackaging.trim(),
          })),
          certifiedReferenceMaterials: rawMaterialReference.certifiedReferenceMaterials.map((item) => ({
            crmName: item.crmName.trim(),
            crmNumber: item.crmNumber.trim(),
            crmType: item.crmType.trim(),
            validity: item.validity.trim(),
            traceability: item.traceability.trim(),
          })),
        }
        await saveBisModulePayload(row.id, 'raw-material-reference', payload)
        setRawMaterialReference(payload)
        onProjectSaved?.()
        toast.success(`${title} saved.`)
        return
      }

      if (showProcessFlowFields) {
        const payload = {
          nodes: processFlow.nodes.map((n, i) => ({
            id: n.id,
            parentId: n.parentId,
            label: n.label.trim(),
            sortOrder: Number.isFinite(n.sortOrder) ? n.sortOrder : i,
            horizontalWithPrev: Boolean(n.horizontalWithPrev),
            linkFromId: n.linkFromId ?? null,
            boxWidth: n.boxWidth ?? null,
            boxHeight: n.boxHeight ?? null,
          })),
          descriptionPoints: processFlow.descriptionPoints
            .map((p) => p.trim())
            .filter(Boolean),
          arrowStyle: {
            color: processFlow.arrowStyle?.color || '#78716c',
            width: Number(processFlow.arrowStyle?.width) || 2.2,
            dashed: Boolean(processFlow.arrowStyle?.dashed),
            design: processFlow.arrowStyle?.design || 'triangle',
          },
          boxStyle: {
            width: Number(processFlow.boxStyle?.width) || 220,
            height: Number(processFlow.boxStyle?.height) || 44,
            gapY: Number(processFlow.boxStyle?.gapY) || 14,
          },
        }
        // Canonical store + mirror so either document kind prints correctly if fetched alone.
        await saveBisModulePayload(row.id, 'process-flow-chart', payload)
        await saveBisModulePayload(row.id, 'process-description', payload)
        onProjectSaved?.()
        toast.success(printKind === 'process-description' ? 'Process Description saved.' : 'Process Flow Chart saved.')
        return
      }

      // Drop blank / no-file draft rows on Save.
      const blankDraftCount = drafts.length
      setDrafts([])

      const renames = files
        .map((file) => {
          const nextName = (fileNames[file.id] ?? file.file_name).trim()
          if (!nextName || nextName === file.file_name) return null
          return { id: file.id, fileName: nextName }
        })
        .filter((x): x is { id: string; fileName: string } => x != null)

      for (const rename of renames) {
        await updateBisProjectFileName(rename.id, rename.fileName)
      }
      if (renames.length > 0) {
        await reloadFiles(row.id, { showLoading: false })
      }
      toast.success(
        blankDraftCount > 0
          ? `${title} saved. Empty rows removed.`
          : `${title} saved.`,
      )
    } catch (err) {
      const msg =
        showApplicationFields ||
        showTopManagementFields ||
        showTechnicalStaffFields ||
        showManufacturingScopeFields ||
        showOslSampleFields ||
        showFactoryTestFields ||
        showLocationMapFields ||
        showPlantLayoutFields ||
        showCmpf305Fields ||
        showCmpf306Fields ||
        showCmpf307Fields ||
        showRawMaterialReferenceFields ||
        showProcessFlowFields
          ? formatBisApiError(err)
          : formatBisProjectFilesError(err)
      setStatus(msg)
      toast.error(msg)
      if (showFileTable) {
        setDrafts((prev) => (prev.length === 0 ? [newDraft()] : prev))
      }
    } finally {
      setSaving(false)
    }
  }

  const handlePrintUndertaking = async (kind: (typeof UNDERTAKING_OPTIONS)[number]['kind'] | 'self-evaluation-form') => {
    if (!row || printingUndertaking) return
    setPrintingUndertaking(true)
    try {
      if (kind === 'undertaking-general') await saveBisModulePayload(row.id, kind, undertakingGeneral)
      if (kind === 'undertaking-long-duration') await saveBisModulePayload(row.id, kind, undertakingLongDuration)
      if (kind === 'undertaking-mmf') await saveBisModulePayload(row.id, kind, undertakingMinimumFee)
      if (kind === 'self-evaluation-form') await saveBisModulePayload(row.id, kind, selfEvaluation)
      const error = await printBisDocument(row, kind)
      if (error) toast.error(error)
    } catch (err) {
      toast.error(formatBisApiError(err))
    } finally {
      setPrintingUndertaking(false)
    }
  }

  const addLongDurationRow = () => {
    if (!longDurationDraft.typeOfTest.trim() || !longDurationDraft.durationOfTest.trim() || !longDurationDraft.dateOfCompletion) {
      toast.error('Enter the test type, duration and completion date before adding the row.')
      return
    }
    setUndertakingLongDuration((current) => ({
      ...current,
      testRows: editingLongDurationIndex === null
        ? [...current.testRows, longDurationDraft]
        : current.testRows.map((row, index) => index === editingLongDurationIndex ? longDurationDraft : row),
    }))
    setLongDurationDraft(emptyUndertakingLongDurationRow())
    setEditingLongDurationIndex(null)
  }

  const renderNameField = (entry: TableEntry) => {
    if (entry.kind === 'draft') {
      return (
        <Input
          value={entry.draft.name}
          placeholder="Documents Name"
          className="h-8 rounded-none border-stone-500 bg-white"
          disabled={busy || saving}
          onChange={(e) =>
            setDrafts((prev) =>
              prev.map((d) =>
                d.id === entry.draft.id ? { ...d, name: e.target.value } : d,
              ),
            )
          }
        />
      )
    }
    return (
      <Input
        value={fileNames[entry.file.id] ?? entry.file.file_name}
        placeholder="Documents Name"
        className="h-8 rounded-none border-stone-500 bg-white"
        disabled={busy || saving}
        onChange={(e) =>
          setFileNames((prev) => ({ ...prev, [entry.file.id]: e.target.value }))
        }
      />
    )
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
    setSelectedIds(checked ? new Set(entries.map((e) => e.key)) : new Set())
  }

  /** Document column: icon-only Upload / View / Download */
  const renderDocumentActions = (entry: TableEntry) => {
    if (entry.kind === 'draft') {
      return (
        <div className="inline-flex items-center justify-center gap-0.5">
          <Button
            type="button"
            size="sm"
            variant="outline"
            className={cn(limsOutlineBtnClass, actionBtnClass)}
            disabled={!row || busy}
            onClick={() => openFilePicker({ type: 'draft', id: entry.draft.id })}
            title="Upload"
            aria-label="Upload Document"
          >
            <Upload size={15} aria-hidden />
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className={cn(limsOutlineBtnClass, actionBtnClass)}
            disabled
            title="View (Upload a File First)"
            aria-label="View Document"
          >
            <Eye size={15} aria-hidden />
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className={cn(limsOutlineBtnClass, actionBtnClass)}
            disabled
            title="Download (Upload a File First)"
            aria-label="Download Document"
          >
            <Download size={15} aria-hidden />
          </Button>
        </div>
      )
    }

    const file = entry.file
    return (
      <div className="inline-flex items-center justify-center gap-0.5">
        <Button
          type="button"
          size="sm"
          variant="outline"
          className={cn(limsOutlineBtnClass, actionBtnClass)}
          disabled={!row || busy}
          onClick={() => openFilePicker({ type: 'file', id: file.id })}
          title="Upload / Replace"
          aria-label={`Upload or replace ${file.file_name}`}
        >
          <Upload size={15} aria-hidden />
        </Button>
        {file.viewUrl ? (
          <a
            href={file.viewUrl}
            target="_blank"
            rel="noreferrer"
            className={cn(limsOutlineBtnClass, actionBtnClass)}
            title={`View ${file.file_name}`}
            aria-label={`View ${file.file_name}`}
          >
            <Eye size={15} aria-hidden />
          </a>
        ) : (
          <Button
            type="button"
            size="sm"
            variant="outline"
            className={cn(limsOutlineBtnClass, actionBtnClass)}
            disabled
            title={file.error || 'View unavailable'}
            aria-label="View Unavailable"
          >
            <Eye size={15} aria-hidden />
          </Button>
        )}
        {file.downloadUrl ? (
          <a
            href={file.downloadUrl}
            download={file.file_name}
            className={cn(limsOutlineBtnClass, actionBtnClass)}
            title={`Download ${file.file_name}`}
            aria-label={`Download ${file.file_name}`}
          >
            <Download size={15} aria-hidden />
          </a>
        ) : (
          <Button
            type="button"
            size="sm"
            variant="outline"
            className={cn(limsOutlineBtnClass, actionBtnClass)}
            disabled
            title="Download Unavailable"
            aria-label="Download Unavailable"
          >
            <Download size={15} aria-hidden />
          </Button>
        )}
      </div>
    )
  }

  /** Action column: icon-only Add / Delete — enabled on every row (including uploaded files). */
  const renderRowActions = (entry: TableEntry) => {
    return (
      <div className="inline-flex items-center justify-center gap-0.5">
        <Button
          type="button"
          size="sm"
          variant="outline"
          className={cn(limsOutlineBtnClass, actionBtnClass)}
          disabled={busy || saving}
          onClick={(e) => {
            e.preventDefault()
            e.stopPropagation()
            addNewRow()
          }}
          title="Add New Row"
          aria-label="Add New Row"
        >
          <Plus size={15} aria-hidden />
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
          disabled={busy || saving}
          onClick={(e) => {
            e.preventDefault()
            e.stopPropagation()
            deleteRow(entry)
          }}
          title="Delete Row"
          aria-label="Delete Row"
        >
          <Trash2 size={15} aria-hidden />
        </Button>
      </div>
    )
  }

  const beginClientDocumentEdit = (document: ClientCertificateFile) => {
    setEditingClientDocument(document)
    setClientDocumentEdit({
      name: document.cert_name,
      issuedOn: document.issued_on,
      number: document.document_number,
    })
  }

  const saveClientDocumentEdit = async () => {
    if (!editingClientDocument) return
    try {
      await updateClientCertificateDetails(editingClientDocument.id, {
        certName: clientDocumentEdit.name,
        issuedOn: clientDocumentEdit.issuedOn,
        documentNumber: clientDocumentEdit.number,
      })
      setClientLegalDocuments((current) =>
        current.map((document) =>
          document.id === editingClientDocument.id
            ? {
                ...document,
                cert_name: clientDocumentEdit.name.trim(),
                issued_on: clientDocumentEdit.issuedOn,
                document_number: clientDocumentEdit.number.trim(),
              }
            : document,
        ),
      )
      setEditingClientDocument(null)
      toast.success('Client Document Updated.')
    } catch (err) {
      toast.error(formatBisApiError(err))
    }
  }

  const removeClientDocument = async (document: ClientCertificateFile) => {
    if (!window.confirm(`Delete ${document.cert_name} from Client Master?`)) return
    try {
      await deleteClientCertificate(document)
      setClientLegalDocuments((current) => current.filter((item) => item.id !== document.id))
      setSelectedClientDocumentIds((current) => {
        const next = new Set(current)
        next.delete(document.id)
        return next
      })
      toast.success('Client Document Deleted.')
    } catch (err) {
      toast.error(formatBisApiError(err))
    }
  }

  return (
    <>
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        persistOnFocusLoss
        layer="nested"
        aria-describedby={undefined}
        className={cn(
          // Override DialogContent base `grid gap-4` so height follows children.
          'flex !flex-col gap-0 overflow-hidden p-0',
          fullPageModule
            ? cn(
                '!flex h-[100dvh] max-h-[100dvh] translate-x-0 translate-y-0 rounded-none border-0 bg-stone-100 shadow-none sm:rounded-none',
                'left-[var(--app-dialog-overlay-left,0px)] top-0 right-0',
                'w-[calc(100vw-var(--app-dialog-overlay-left,0px))] max-w-none',
                'border-stone-600 ring-1 ring-amber-700/20',
              )
            : cn(
                limsDialogClass,
                'bg-white',
                compactFormModule
                  ? 'h-auto max-h-[min(92vh,860px)] w-[min(68rem,calc(100vw_-_var(--app-dialog-overlay-left,0px)_-_1.5rem))] max-w-[68rem]'
                  : 'max-h-[min(92vh,860px)]',
                !compactFormModule &&
                  (showApplicationFields
                    ? 'w-[min(56rem,calc(100vw_-_var(--app-dialog-overlay-left,0px)_-_1.5rem))] max-w-[56rem]'
                    : 'w-[min(42rem,calc(100vw_-_var(--app-dialog-overlay-left,0px)_-_1.5rem))] max-w-[42rem]'),
              ),
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
              {title}
            </DialogTitle>
            <p className="mt-0.5 line-clamp-2 break-words text-xs text-stone-300" title={subtitle}>
              {subtitle}
            </p>
          </DialogHeader>
          {showCmpf307Fields && row?.id ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={busy || saving}
              className="absolute right-11 top-2 z-10 h-7 w-7 rounded-none border border-amber-500/60 bg-stone-800 p-0 text-amber-200 shadow-sm transition-colors hover:border-amber-400 hover:bg-amber-600 hover:text-white"
              title="Import from Another Application"
              aria-label="Import from Another Application"
              onClick={() => setBrandImportOpen(true)}
            >
              <Import size={15} aria-hidden />
            </Button>
          ) : null}
          {showProcessFlowFields && row?.id ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={busy || saving}
              className="absolute right-11 top-2 z-10 h-7 w-7 rounded-none border border-amber-500/60 bg-stone-800 p-0 text-amber-200 shadow-sm transition-colors hover:border-amber-400 hover:bg-amber-600 hover:text-white"
              title="Import from Another Application"
              aria-label="Import from Another Application"
              onClick={() => setFlowImportOpen(true)}
            >
              <Import size={15} aria-hidden />
            </Button>
          ) : null}
        </div>

        <div
          className={cn(
            'flex flex-col gap-2 bg-gradient-to-b from-stone-100/80 to-white px-3 py-3 sm:px-4 sm:py-4',
            fullPageModule
              ? 'min-h-0 flex-1 overflow-hidden'
              : compactFormModule
                ? 'min-h-0 flex-1 overflow-y-auto overscroll-contain [-webkit-overflow-scrolling:touch]'
                : 'min-h-0 flex-1',
          )}
        >
          {status ? (
            <p className="text-xs text-red-700" role="alert">
              {status}
            </p>
          ) : null}

          {showAllUndertakingsFields ? (
            <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden">
              {mmfOnly ? null : (
              <nav aria-label="Undertaking Types" className="grid shrink-0 grid-cols-5 gap-1 border-b border-stone-400 bg-stone-800 p-1">
                {UNDERTAKING_OPTIONS.map((option) => (
                  <Button
                    key={option.kind}
                    type="button"
                    variant="ghost"
                    aria-pressed={selectedUndertaking === option.kind}
                    title={option.title}
                    aria-label={option.title}
                    className={cn(
                      'h-auto min-h-10 min-w-0 whitespace-normal rounded-none px-2 py-2 text-center text-[11px] font-semibold leading-tight text-stone-100 hover:bg-stone-700 hover:text-white max-[640px]:px-1 max-[640px]:text-[10px] max-[420px]:min-h-9',
                      selectedUndertaking === option.kind && 'bg-amber-700 text-white hover:bg-amber-700',
                    )}
                    onClick={() => setSelectedUndertaking(option.kind)}
                  >
                    <span className="hidden min-[641px]:inline">{option.title}</span>
                    <span className="hidden max-[640px]:inline max-[420px]:hidden">{option.compactTitle}</span>
                    <span aria-hidden="true" className="hidden max-[420px]:inline">{option.icon}</span>
                  </Button>
                ))}
              </nav>
              )}
              {UNDERTAKING_OPTIONS.filter((option) => option.kind === selectedUndertaking).map((option) => (
                <section key={option.kind} className={cn('min-h-0 flex-1 overflow-y-auto border border-stone-300 bg-white', option.kind === 'undertaking-mmf' ? 'p-0' : 'p-5 sm:p-8')}>
                  <div className={cn('flex items-center justify-between gap-4', option.kind === 'undertaking-mmf' && 'bg-stone-800 px-3 py-1.5')}>
                    <h2 className={option.kind === 'undertaking-mmf' ? 'text-[11px] font-bold uppercase tracking-[0.14em] text-amber-200' : 'text-xl font-semibold text-stone-900'}>{option.title}</h2>
                    {mmfOnly ? null : (
                    <label className={cn('flex shrink-0 cursor-pointer items-center gap-2 text-sm font-medium', option.kind === 'undertaking-mmf' ? 'text-[11px] text-amber-100' : 'text-stone-700')} title={`Show ${option.title} in preview`}>
                      <input
                        type="checkbox"
                        className="h-4 w-4 accent-amber-600"
                        aria-label={`Show ${option.title} in preview`}
                        checked={undertakingPreviewOptions[option.kind]}
                        disabled={loading || undertakingPreviewOptionsLoadedFor !== row?.id}
                        onChange={(event) => {
                          setUndertakingPreviewOptions((current) => ({ ...current, [option.kind]: event.target.checked }))
                          setUndertakingPreviewOptionsTouched(true)
                        }}
                      />
                      <span>Show in Preview</span>
                    </label>
                    )}
                  </div>
                  {option.kind === 'undertaking-option-2' ? <p className="mt-4 border border-stone-200 bg-stone-50 p-3 text-sm text-stone-700">No additional inputs are required. The undertaking is prepared directly from this project’s saved application details.</p> : null}
                  {option.kind === 'undertaking-general' ? <div className="mt-5"><UndertakingGeneralFields value={undertakingGeneral} onChange={setUndertakingGeneral} disabled={loading || printingUndertaking} isNumber={row ? isCodeDisplayLabel(row) : ''} /></div> : null}
                  {option.kind === 'undertaking-long-duration' ? (
                    <div className="mt-5 grid max-w-6xl gap-4">
                      <div className="overflow-x-auto border border-stone-300">
                        <table className="w-full min-w-[900px] text-sm">
                          <thead className="bg-stone-100"><tr><th className="w-10 border-b border-stone-300 p-2 text-center">Select</th><th className="border-b border-stone-300 p-2 text-left">Type of Test</th><th className="border-b border-stone-300 p-2 text-left">Duration of Test</th><th className="border-b border-stone-300 p-2 text-left">Date of Completion</th><th className="w-16 border-b border-stone-300 p-2 text-center">Action</th></tr></thead>
                          <tbody><tr className="bg-white">
                            <td className="border-b border-stone-200 p-2 text-center">—</td>
                            <td className="border-b border-stone-200 p-1"><Input aria-label="New Type of Test" value={longDurationDraft.typeOfTest} disabled={loading || printingUndertaking} onChange={(e) => setLongDurationDraft((v) => ({ ...v, typeOfTest: e.target.value }))} /></td>
                            <td className="border-b border-stone-200 p-1"><Input aria-label="New Duration of Test" value={longDurationDraft.durationOfTest} disabled={loading || printingUndertaking} onChange={(e) => setLongDurationDraft((v) => ({ ...v, durationOfTest: e.target.value }))} /></td>
                            <td className="border-b border-stone-200 p-1"><Input aria-label="New Date of Completion" type="date" value={longDurationDraft.dateOfCompletion} disabled={loading || printingUndertaking} onChange={(e) => setLongDurationDraft((v) => ({ ...v, dateOfCompletion: e.target.value }))} /></td>
                            <td className="border-b border-stone-200 p-1 text-center"><Button type="button" variant="outline" size="icon" aria-label={editingLongDurationIndex === null ? 'Add test schedule row' : 'Update test schedule row'} disabled={loading || printingUndertaking} onClick={addLongDurationRow}><Plus size={16} /></Button></td>
                          </tr></tbody>
                        </table>
                      </div>
                      <div className="overflow-x-auto border border-stone-300">
                        <table className="w-full min-w-[900px] text-sm">
                          <thead className="bg-stone-100"><tr><th className="w-10 border-b border-stone-300 p-2 text-center">Select</th><th className="border-b border-stone-300 p-2 text-left">Type of Test</th><th className="border-b border-stone-300 p-2 text-left">Duration of Test</th><th className="border-b border-stone-300 p-2 text-left">Date of Completion</th><th className="w-28 border-b border-stone-300 p-2 text-center">Action</th></tr></thead>
                          <tbody>{undertakingLongDuration.testRows.length ? undertakingLongDuration.testRows.map((test, index) => <tr key={`${test.typeOfTest}-${index}`} className="border-b border-stone-200">
                            <td className="p-2 text-center"><input type="checkbox" aria-label={`Select test row ${index + 1}`} checked={selectedLongDurationRows.has(index)} onChange={(e) => setSelectedLongDurationRows((current) => { const next = new Set(current); if (e.target.checked) next.add(index); else next.delete(index); return next })} /></td>
                            <td className="p-2">{test.typeOfTest}</td><td className="p-2">{test.durationOfTest}</td><td className="p-2">{test.dateOfCompletion}</td>
                            <td className="p-1 text-center"><div className="flex justify-center gap-1"><Button type="button" variant="outline" size="icon" aria-label={`Edit test row ${index + 1}`} onClick={() => { setLongDurationDraft(test); setEditingLongDurationIndex(index) }}><Pencil size={14} /></Button><Button type="button" variant="outline" size="icon" aria-label={`Delete test row ${index + 1}`} onClick={() => { setUndertakingLongDuration((current) => ({ ...current, testRows: current.testRows.filter((_, i) => i !== index) })); setSelectedLongDurationRows((current) => new Set([...current].filter((i) => i !== index).map((i) => i > index ? i - 1 : i))); if (editingLongDurationIndex === index) { setLongDurationDraft(emptyUndertakingLongDurationRow()); setEditingLongDurationIndex(null) } }}><Trash2 size={14} /></Button></div></td>
                          </tr>) : <tr><td colSpan={5} className="p-3 text-center text-stone-500">No Test Schedule Rows Added Yet.</td></tr>}</tbody>
                        </table>
                      </div>
                    </div>
                  ) : null}
                  {option.kind === 'undertaking-mmf' ? (() => {
                    const u = undertakingMinimumFee
                    const off = loading || printingUndertaking
                    const set = (patch: Partial<typeof u>) => setUndertakingMinimumFee((current) => ({ ...current, ...patch }))
                    const fieldCls = 'h-8 w-full rounded-none border-stone-300 bg-white text-sm'
                    const selCls = 'h-8 w-full rounded-none border border-stone-300 bg-white px-2 text-sm focus:border-amber-600 focus:outline-none'
                    const cur = (label: string, value: string, key: keyof typeof u) => <UndertakingCurrencyField bare label={label} value={value} disabled={off} onChange={(value) => set({ [key]: value } as Partial<typeof u>)} />
                    const cells: Array<[string, ReactNode]> = [
                      ['Firm Status', <Input key="fs" className={fieldCls} value={companyFirmStatus === 'LS' ? 'Large Scale' : companyFirmStatus} placeholder="Set Company Scale in Company Master" readOnly disabled={off} />],
                      ['Annual Production Capacity', <Input key="apc" className={fieldCls} value={u.annualProductionCapacity} disabled={off} onChange={(event) => set({ annualProductionCapacity: event.target.value })} />],
                      ['Value of Production per Unit', cur('Value of Production per Unit', u.valueOfProductionPerUnit, 'valueOfProductionPerUnit')],
                      ['Cost of Production per Unit', cur('Cost of Production per Unit', u.costOfProductionPerUnit, 'costOfProductionPerUnit')],
                      ['Market Surveillance Plan', <Textarea key="msp" value={u.marketSurveillancePlan} disabled={off} onChange={(event) => set({ marketSurveillancePlan: event.target.value })} className="min-h-8 h-8 rounded-none border-stone-300 bg-white py-1" />],
                    ]
                    if (u.factoryTestingBasis !== 'Yes') {
                      cells.push(['Testing Charge Basis', <select key="tcb" className={selCls} value={u.testingChargeBasis} disabled={off} onChange={(event) => set({ testingChargeBasis: event.target.value })}><option value="">Select Charge Basis</option><option value="BIS Lab">BIS Laboratory Charges</option><option value="OSL Complete Testing">OSL Average (Complete Testing)</option><option value="OSL Maximum Parameters">OSL Average (Maximum Available Parameters)</option></select>])
                      if (u.testingChargeBasis === 'BIS Lab') cells.push(['BIS Laboratory Testing Charge per Sample', cur('BIS Laboratory Testing Charge per Sample', u.bisLabTestingCharges, 'bisLabTestingCharges')])
                      if (u.testingChargeBasis.startsWith('OSL')) cells.push(['Average OSL Testing Charge per Sample', cur('Average OSL Testing Charge per Sample', u.oslAvgTestingCharges, 'oslAvgTestingCharges')])
                    }
                    cells.push(
                      ['Quantity per Market Sample', <Input key="qms" className={fieldCls} value={u.marketSampleQuantity} disabled={off} onChange={(event) => set({ marketSampleQuantity: event.target.value })} />],
                      ['Cost of One Market Sample', cur('Cost of One Market Sample', u.marketSampleCost, 'marketSampleCost')],
                      ['Factory Testing Basis', <select key="ftb" className={selCls} value={u.factoryTestingBasis} disabled={off} onChange={(event) => set({ factoryTestingBasis: event.target.value })}><option value="No">No</option><option value="Yes">Yes</option></select>],
                    )
                    if (u.factoryTestingBasis === 'Yes') {
                      cells.push(
                        ['BIS Testing Mandays per Visit', <Input key="fm" className={fieldCls} inputMode="decimal" value={u.factoryMandays} disabled={off} onChange={(event) => set({ factoryMandays: event.target.value })} />],
                        ['BIS Officer Visit Charge per Manday', cur('BIS Officer Visit Charge per Manday', u.factoryVisitRate, 'factoryVisitRate')],
                      )
                    }
                    const rows: Array<Array<[string, ReactNode]>> = []
                    for (let n = 0; n < cells.length; n += 2) rows.push(cells.slice(n, n + 2))
                    return (
                      <div className="m-3 overflow-x-auto">
                        <table className="w-full table-fixed border-collapse text-sm">
                          <tbody>
                            {rows.map((pair, ri) => (
                              <tr key={ri}>
                                {pair.map(([label, node]) => (
                                  <Fragment key={label}>
                                    <th scope="row" className="w-[22%] border border-[#e7e0d4] bg-[#f7f3eb] px-3 py-1.5 text-left align-middle font-bold text-stone-800">{label}:</th>
                                    <td className="w-[28%] border border-[#e7e0d4] px-2 py-1 align-middle text-stone-700">{node}</td>
                                  </Fragment>
                                ))}
                                {pair.length < 2 ? <><th className="w-[22%] border border-[#e7e0d4] bg-[#f7f3eb]" /><td className="w-[28%] border border-[#e7e0d4]" /></> : null}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )
                  })() : null}
                  {option.kind === 'self-evaluation-form' ? (
                    <div className="mt-5 grid max-w-5xl gap-4">
                      <div className="border border-stone-300">
                        <div className="bg-stone-100 p-3 text-sm font-semibold">Packaging &amp; Marking</div>
                        {linkedPackagingRows ? (
                          <>
                            <p className="border-t border-stone-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                              Linked to Step 4 · Packaging and Marking — edit the values there.
                            </p>
                            {linkedPackagingRows.map((item) => (
                              <div key={item.label} className="grid gap-2 border-t border-stone-200 p-2 text-sm sm:grid-cols-2">
                                <span className="font-semibold text-stone-700">{item.label}</span>
                                <span className="text-stone-800">{item.value || '—'}</span>
                              </div>
                            ))}
                          </>
                        ) : (
                          <>
                            {selfEvaluation.packagingMarkingRows.map((item, index) => <div key={index} className="grid gap-2 border-t border-stone-200 p-2 sm:grid-cols-2"><Input aria-label={`Packaging field ${index + 1}`} value={item.label} disabled={loading || printingUndertaking} onChange={(e) => setSelfEvaluation((v) => ({ ...v, packagingMarkingRows: v.packagingMarkingRows.map((r, i) => i === index ? { ...r, label: e.target.value } : r) }))} /><Input aria-label={`Packaging value ${index + 1}`} value={item.value} disabled={loading || printingUndertaking} onChange={(e) => setSelfEvaluation((v) => ({ ...v, packagingMarkingRows: v.packagingMarkingRows.map((r, i) => i === index ? { ...r, value: e.target.value } : r) }))} /></div>)}
                          </>
                        )}
                      </div>
                    </div>
                  ) : null}
                </section>
              ))}
            </div>
          ) : null}

          {showSelfEvaluationFields ? (
            <section className="m-3 flex min-h-0 flex-1 flex-col border border-stone-300 bg-white p-5 sm:m-5 sm:p-8">
              <h2 className="text-xl font-semibold text-stone-900">Self Evaluation Cum Verification Form</h2>
              <p className="mt-2 max-w-4xl text-sm leading-6 text-stone-600">
                The form follows the attached BIS format and compiles raw material supplier details, packaging and marking, quality control staff, and brand information saved in this project’s related modules.
              </p>
              <ol className="mt-5 grid max-w-5xl gap-2 text-sm text-stone-700 sm:grid-cols-2">
                <li className="border border-stone-200 bg-stone-50 p-3">1. General Information and Plant Layout</li>
                <li className="border border-stone-200 bg-stone-50 p-3">2. Raw Material Supplier Details</li>
                <li className="border border-stone-200 bg-stone-50 p-3">3. Packaging and Marking</li>
                <li className="border border-stone-200 bg-stone-50 p-3">4. Quality Control Staff Details</li>
                <li className="border border-stone-200 bg-stone-50 p-3">5. Brand Names and Declarations</li>
              </ol>
              <Button
                type="button"
                className={cn(limsPrimaryBtnClass, 'mt-6 h-10 w-fit px-5')}
                disabled={!row?.id || busy || saving || printingUndertaking}
                onClick={() => void handlePrintUndertaking('self-evaluation-form')}
              >
                <Printer size={15} className="mr-2" />
                {printingUndertaking ? 'Preparing…' : 'Prepare Self Evaluation Form'}
              </Button>
            </section>
          ) : null}

          {showApplicationFields ? (
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain [-webkit-overflow-scrolling:touch]">
              <ApplicationDetailsFields
                form={appDetails}
                onChange={setAppDetails}
                disabled={busy || saving}
                projectKind={row?.project_kind}
                branchOffices={applicationBranchOffices}
              />
              <section className="mx-3 mb-[2mm] mt-[2mm] space-y-2 border border-stone-300 bg-white p-3 sm:mx-4">
                <div>
                  <h2 className="text-sm font-semibold text-stone-800">Client Master Legal Documents</h2>
                </div>
                {applicationReferenceLoading ? (
                  <p className="text-sm text-stone-500">Loading Client Documents…</p>
                ) : clientLegalDocuments.length ? (
                  <div className="overflow-hidden border border-stone-300 max-[640px]:overflow-visible max-[640px]:border-0">
                    <Table className="table-fixed max-[640px]:block max-[640px]:w-full">
                      <TableHeader className="max-[640px]:hidden">
                        <TableRow className="bg-stone-800 hover:bg-stone-800">
                          <TableHead className="w-9 border border-stone-700 px-1 text-center">
                            <input
                              type="checkbox"
                              className="h-4 w-4"
                              aria-label="Select All Client Documents"
                              checked={clientLegalDocuments.length > 0 && selectedClientDocumentIds.size === clientLegalDocuments.length}
                              onChange={(event) => setSelectedClientDocumentIds(event.target.checked ? new Set(clientLegalDocuments.map((document) => document.id)) : new Set())}
                            />
                          </TableHead>
                          <TableHead className="border border-stone-700 px-2 text-center text-[11px] font-bold uppercase tracking-wide text-amber-200">Document Name</TableHead>
                          <TableHead className="w-32 border border-stone-700 px-2 text-center text-[11px] font-bold uppercase tracking-wide text-amber-200">Date of Issue</TableHead>
                          <TableHead className="border border-stone-700 px-2 text-center text-[11px] font-bold uppercase tracking-wide text-amber-200">Document Number</TableHead>
                          <TableHead className="w-32 border border-stone-700 px-1 text-center text-[11px] font-bold uppercase tracking-wide text-amber-200">Action</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody className="max-[640px]:block">
                        {clientLegalDocuments.map((document) => {
                          const isEditing = editingClientDocument?.id === document.id
                          return (
                            <TableRow key={document.id} className="even:bg-[#f7f3eb] max-[640px]:mb-2 max-[640px]:grid max-[640px]:grid-cols-1 max-[640px]:overflow-hidden max-[640px]:border max-[640px]:border-stone-400">
                              <TableCell className="border border-stone-300 px-1 text-center max-[640px]:flex max-[640px]:items-center max-[640px]:justify-between max-[640px]:gap-3 max-[640px]:text-left">
                                <span className="text-xs font-semibold text-stone-600 sm:hidden">Select Document</span>
                                <input
                                  type="checkbox"
                                  className="h-4 w-4"
                                  aria-label={`Select ${document.cert_name}`}
                                  checked={selectedClientDocumentIds.has(document.id)}
                                  onChange={() => setSelectedClientDocumentIds((current) => {
                                    const next = new Set(current)
                                    if (next.has(document.id)) next.delete(document.id)
                                    else next.add(document.id)
                                    return next
                                  })}
                                />
                              </TableCell>
                              <TableCell className="border border-stone-300 px-2 py-1.5 max-[640px]:flex max-[640px]:items-start max-[640px]:justify-between max-[640px]:gap-3">
                                <span className="shrink-0 text-xs font-semibold text-stone-600 sm:hidden">Document Name</span>
                                {isEditing ? <Input className="h-8 min-w-0" value={clientDocumentEdit.name} onChange={(event) => setClientDocumentEdit((current) => ({ ...current, name: event.target.value }))} /> : <span className="min-w-0 break-words text-right text-sm font-medium [overflow-wrap:anywhere]">{document.cert_name}</span>}
                              </TableCell>
                              <TableCell className="border border-stone-300 px-1 py-1.5 max-[640px]:flex max-[640px]:items-center max-[640px]:justify-between max-[640px]:gap-3">
                                <span className="text-xs font-semibold text-stone-600 sm:hidden">Date of Issue</span>
                                {isEditing ? <Input type="date" className="h-8 min-w-0 px-1" value={clientDocumentEdit.issuedOn} onChange={(event) => setClientDocumentEdit((current) => ({ ...current, issuedOn: event.target.value }))} /> : <span className="block break-words text-right text-sm [overflow-wrap:anywhere]">{document.issued_on || '—'}</span>}
                              </TableCell>
                              <TableCell className="border border-stone-300 px-2 py-1.5 text-center max-[640px]:flex max-[640px]:items-start max-[640px]:justify-between max-[640px]:gap-3">
                                <span className="shrink-0 text-xs font-semibold text-stone-600 sm:hidden">Document Number</span>
                                {isEditing ? <Input className="h-8 min-w-0 text-right sm:text-center" value={clientDocumentEdit.number} onChange={(event) => setClientDocumentEdit((current) => ({ ...current, number: event.target.value }))} /> : <span className="block min-w-0 break-words text-right text-sm [overflow-wrap:anywhere] sm:text-center">{document.document_number || '—'}</span>}
                              </TableCell>
                              <TableCell className="border border-stone-300 px-1 py-1.5 max-[640px]:flex max-[640px]:items-center max-[640px]:justify-between max-[640px]:gap-3">
                                <span className="text-xs font-semibold text-stone-600 sm:hidden">Action</span>
                                <div className="flex flex-wrap items-center justify-center gap-1">
                                  {isEditing ? (
                                    <>
                                      <Button type="button" variant="outline" size="icon" className="h-8 w-8" title="Save Changes" aria-label="Save Changes" onClick={() => void saveClientDocumentEdit()}><Check size={14} /></Button>
                                      <Button type="button" variant="outline" size="icon" className="h-8 w-8" title="Cancel Edit" aria-label="Cancel Edit" onClick={() => setEditingClientDocument(null)}><X size={14} /></Button>
                                    </>
                                  ) : (
                                    <>
                                      <Button type="button" variant="outline" size="icon" className="h-8 w-8" title="View Document" aria-label={`View ${document.cert_name}`} onClick={() => void openClientCertificate(document).catch((err: unknown) => toast.error(err instanceof Error ? err.message : 'Unable to open client document.'))}><Eye size={14} /></Button>
                                      <Button type="button" variant="outline" size="icon" className="h-8 w-8" title="Edit Document Details" aria-label={`Edit ${document.cert_name}`} onClick={() => beginClientDocumentEdit(document)}><Pencil size={14} /></Button>
                                      <Button type="button" variant="outline" size="icon" className="h-8 w-8 text-red-700" title="Delete Document" aria-label={`Delete ${document.cert_name}`} onClick={() => void removeClientDocument(document)}><Trash2 size={14} /></Button>
                                    </>
                                  )}
                                </div>
                              </TableCell>
                            </TableRow>
                          )
                        })}
                      </TableBody>
                    </Table>
                  </div>
                ) : (
                  <p className="border border-dashed border-stone-300 p-3 text-sm text-stone-500">No Legal Documents Are Saved for This Client.</p>
                )}
              </section>
              <section className="mx-3 mb-[2mm] mt-[2mm] space-y-2 border border-stone-300 bg-white p-3 sm:mx-4">
                <h2 className="text-sm font-semibold text-stone-800">Location Map</h2>
                <div className="overflow-hidden border border-stone-300 max-[640px]:overflow-visible max-[640px]:border-0">
                  <Table className="table-fixed max-[640px]:block max-[640px]:w-full">
                    <TableHeader className="max-[640px]:hidden">
                      <TableRow className="bg-stone-800 hover:bg-stone-800">
                        <TableHead className="w-[42%] border border-stone-700 px-2 text-center text-[11px] font-bold uppercase tracking-wide text-amber-200">Location From</TableHead>
                        <TableHead className="w-[42%] border border-stone-700 px-2 text-center text-[11px] font-bold uppercase tracking-wide text-amber-200">Location To</TableHead>
                        <TableHead className="border border-stone-700 px-1 text-center text-[11px] font-bold uppercase tracking-wide text-amber-200">Action</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody className="max-[640px]:block">
                      <TableRow className="max-[640px]:grid max-[640px]:grid-cols-1 max-[640px]:overflow-hidden max-[640px]:border max-[640px]:border-stone-400">
                        <TableCell className="border border-stone-300 px-2 py-2 align-top max-[640px]:block">
                          <p className="mb-1 text-xs font-bold uppercase tracking-wide text-stone-600 sm:hidden">Location From</p>
                          <p className="font-semibold text-stone-900">{applicationDisplayLocation.office?.name || appDetails.branchName || '—'}</p>
                          <p className="mt-1 break-words text-xs text-stone-600">{[applicationDisplayLocation.office?.address, applicationDisplayLocation.office?.city, applicationDisplayLocation.office?.state, applicationDisplayLocation.office?.pinCode, applicationDisplayLocation.office?.country].filter(Boolean).join(', ') || 'Address unavailable'}</p>
                          <p className="mt-1 font-mono text-xs text-stone-600">Lat: {formatCoordinate(applicationDisplayLocation.bisLatitude) || '—'} · Long: {formatCoordinate(applicationDisplayLocation.bisLongitude) || '—'}</p>
                        </TableCell>
                        <TableCell className="border border-stone-300 px-2 py-2 align-top max-[640px]:block">
                          <p className="mb-1 text-xs font-bold uppercase tracking-wide text-stone-600 sm:hidden">Location To</p>
                          <p className="font-semibold text-stone-900">{applicationClientLocation?.company_name || row?.client?.company_name || '—'}</p>
                          <p className="mt-1 break-words text-xs text-stone-600">{[applicationClientLocation?.address, applicationClientLocation?.district, applicationClientLocation?.state, applicationClientLocation?.pin_code, applicationClientLocation?.country].filter(Boolean).join(', ') || 'Address unavailable'}</p>
                          <p className="mt-1 font-mono text-xs text-stone-600">Lat: {formatCoordinate(applicationDisplayLocation.firmLatitude) || '—'} · Long: {formatCoordinate(applicationDisplayLocation.firmLongitude) || '—'}</p>
                        </TableCell>
                        <TableCell className="border border-stone-300 px-1 py-2 align-middle max-[640px]:flex max-[640px]:items-center max-[640px]:justify-between max-[640px]:gap-3">
                          <span className="pl-2 text-xs font-bold uppercase tracking-wide text-stone-600 sm:hidden">Actions</span>
                          <div className="flex flex-wrap items-center justify-center gap-1">
                            <Button type="button" variant="outline" size="icon" className="h-8 w-8" title="Preview Location Map" aria-label="Preview Location Map" disabled={!onLocationMapPreview} onClick={onLocationMapPreview}><Eye size={14} /></Button>
                            <Button type="button" variant="outline" size="icon" className="h-8 w-8" title="Download Location Map as Word" aria-label="Download Location Map as Word" disabled={!onLocationMapWord} onClick={onLocationMapWord}><FileType size={14} /></Button>
                            <Button type="button" variant="outline" size="icon" className="h-8 w-8" title="Download Location Map as PDF" aria-label="Download Location Map as PDF" disabled={!onLocationMapPdf} onClick={onLocationMapPdf}><FileDown size={14} /></Button>
                            <Button type="button" variant="outline" size="icon" className="h-8 w-8" title="Print Location Map" aria-label="Print Location Map" disabled={!onLocationMapPrint} onClick={onLocationMapPrint}><Printer size={14} /></Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </div>
              </section>
            </div>
          ) : showTopManagementFields ? (
            <div className="shrink-0">
              {loading ? (
                <p className="py-6 text-center text-sm text-stone-500">Loading…</p>
              ) : (
                <TopManagementModuleFields
                  value={topManagement}
                  onChange={setTopManagement}
                  disabled={busy || saving}
                  projectId={row?.id ?? null}
                />
              )}
            </div>
          ) : showTechnicalStaffFields ? (
            <div className="shrink-0">
              {loading ? (
                <p className="py-6 text-center text-sm text-stone-500">Loading…</p>
              ) : (
                <TechnicalStaffModuleFields
                  value={technicalStaff}
                  onChange={setTechnicalStaff}
                  disabled={busy || saving}
                  projectId={row?.id ?? null}
                  projectRow={row}
                />
              )}
            </div>
          ) : showManufacturingScopeFields ? (
            <div className="shrink-0 space-y-3 rounded-none border border-stone-400 bg-[#fffcf7] p-2 sm:p-3">
              <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-stone-600">
                Manufacturing Scope
              </p>
              <LicenseScopeFields
                value={licenseScopeNotes}
                onChange={setLicenseScopeNotes}
                disabled={busy || saving}
                label="Notes / License Scope"
                inputId="bis-manufacturing-scope-notes"
                isCodeId={row?.is_code_id ?? null}
                isNumber={row?.is_code?.is_number ?? ''}
                projectId={row?.id ?? null}
              />
            </div>
          ) : showOslSampleFields ? (
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
              {loading ? (
                <p className="py-6 text-center text-sm text-stone-500">Loading…</p>
              ) : (
                <OslSampleRequirementsModuleFields
                  value={oslSamples}
                  onChange={setOslSamples}
                  disabled={busy || saving}
                  projectId={row?.id ?? null}
                  clientId={row?.client_id ?? null}
                  isCodeId={row?.is_code_id ?? null}
                  isCodeLabel={row ? isCodeDisplayLabel(row) : ''}
                  isCodeSearch={
                    row ? String(row.is_code?.is_number ?? '').trim() || null : null
                  }
                  isCodeRevisionYear={
                    row ? String(row.is_code?.revision_year ?? '').trim() || null : null
                  }
                  portalUserId={row ? manakLoginFromProject(row).userId : null}
                  hasPortalPassword={row ? manakLoginFromProject(row).hasPassword : false}
                  onPrintTestRequest={() => {
                    if (!row) return
                    void printBisDocument(row, 'osl-sample-test-request').then((err) => {
                      if (err) toast.error(err)
                    })
                  }}
                  onPrintCourierSlip={(sample: OslSampleRequirementRow) => {
                    if (!row) return
                    const pending = openPendingPrintWindow('Preparing Courier Slip…')
                    void loadBisPrintData(row)
                      .then((printData) => {
                        const html = buildOslSampleTestRequestHtml(
                          oslSampleTestRequestDataForSample(printData, sample),
                        )
                        const err = openPrintHtml(html, { target: pending })
                        if (err) toast.error(err)
                      })
                      .catch((err) => {
                        try {
                          pending?.close()
                        } catch {
                          /* ignore */
                        }
                        toast.error(
                          err instanceof Error ? err.message : 'Could not print Courier Slip.',
                        )
                      })
                  }}
                  onPrintTestReport={() => {
                    if (!row) return
                    void printBisDocument(row, 'factory-test-report').then((err) => {
                      if (err) toast.error(err)
                    })
                  }}
                />
              )}
            </div>
          ) : showFactoryTestFields ? (
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
              {loading ? (
                <p className="py-6 text-center text-sm text-stone-500">Loading…</p>
              ) : (
                <FactoryTestReportModuleFields
                  value={factoryTestReports}
                  onChange={setFactoryTestReports}
                  disabled={busy || saving}
                  sampleOptions={factorySampleOptions}
                  isCodeId={row?.is_code_id ?? null}
                  isCodeLabel={row ? isCodeDisplayLabel(row) : ''}
                  projectId={row?.id ?? null}
                  previewContext={
                    row
                      ? {
                          applicantName: clientDisplayName(row),
                          applicantAddress: '',
                          applicationNumber: formatCmA(row.application_number),
                          dateOfApplication: (row.application_date ?? '').trim(),
                          dateOfInspection: (row.inspection_date ?? '').trim(),
                          licenceNumber: formatCmL(row.cm_l_digits),
                          isNumber: isCodeDisplayLabel(row),
                          productTitle: row.is_code?.title?.trim() || '',
                          inspectionOfficerName: (row.inspection_officer_name ?? '').trim(),
                          inspectionOfficerDesignation: (
                            row.inspection_officer_designation ?? ''
                          ).trim(),
                          testedByName: factoryTestReports.testedByName.trim(),
                          testedByDesignation: factoryTestReports.testedByDesignation.trim(),
                        }
                      : null
                  }
                />
              )}
            </div>
          ) : showLocationMapFields ? (
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
              {loading ? (
                <p className="py-6 text-center text-sm text-stone-500">Loading…</p>
              ) : (
                <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-3 sm:px-4 [-webkit-overflow-scrolling:touch]">
                  <section className="mb-4 space-y-2 border border-stone-300 bg-white p-3">
                    <div>
                      <h2 className="text-sm font-semibold text-stone-800">Client Master Legal Documents</h2>
                      <p className="text-xs text-stone-500">Documents Are Linked from Client Master and Are Not Copied.</p>
                    </div>
                    {clientLegalDocuments.length ? (
                      <ul className="divide-y divide-stone-200 border border-stone-200">
                        {clientLegalDocuments.map((document) => (
                          <li key={document.id} className="flex min-w-0 items-center justify-between gap-3 px-2.5 py-2 text-sm">
                            <span className="min-w-0 truncate font-medium text-stone-800" title={document.cert_name}>{document.cert_name}</span>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="h-8 shrink-0"
                              onClick={() => void openClientCertificate(document).catch((err: unknown) => toast.error(err instanceof Error ? err.message : 'Unable to open client document.'))}
                            >
                              <Eye className="mr-1.5 h-4 w-4" /> Open
                            </Button>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="border border-dashed border-stone-300 p-3 text-sm text-stone-500">No Legal Documents Are Saved for This Client.</p>
                    )}
                  </section>
                  <LocationMapModuleFields
                    value={locationMap}
                    onChange={setLocationMap}
                    disabled={busy || saving}
                    firmName={row ? clientDisplayName(row) : ''}
                    bisOfficeName={
                      row
                        ? [row.branch_name, row.branch_state]
                            .map((x) => (x ?? '').trim())
                            .filter(Boolean)
                            .join(', ')
                        : ''
                    }
                  />
                </div>
              )}
            </div>
          ) : showPlantLayoutFields ? (
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
              {loading ? (
                <p className="py-6 text-center text-sm text-stone-500">Loading…</p>
              ) : (
                <PlantLayoutModuleFields
                  value={plantLayout}
                  onChange={setPlantLayout}
                  disabled={busy || saving}
                />
              )}
            </div>
          ) : showCmpf305Fields ? (
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
              {loading ? (
                <p className="py-6 text-center text-sm text-stone-500">Loading…</p>
              ) : (
                <Cmpf305ModuleFields
                  value={cmpf305}
                  onChange={setCmpf305}
                  disabled={busy || saving}
                />
              )}
            </div>
          ) : showCmpf306Fields ? (
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
              {loading ? (
                <p className="py-6 text-center text-sm text-stone-500">Loading…</p>
              ) : (
                <Cmpf306ModuleFields
                  value={cmpf306}
                  onChange={setCmpf306}
                  disabled={busy || saving}
                  projectId={row?.id ?? null}
                />
              )}
            </div>
          ) : showCmpf311Fields ? (
            <Cmpf311ModuleFields
              value={cmpf311}
              onChange={setCmpf311}
              disabled={busy || saving}
              isCodeId={row?.is_code_id ?? null}
              isNumber={row ? isCodeDisplayLabel(row) : ''}
              productTitle={(row?.is_code?.title ?? '').trim()}
            />
          ) : showCmpf307Fields ? (
            <Cmpf307ModuleFields
              value={cmpf307}
              onChange={setCmpf307}
              disabled={busy || saving}
              projectId={row?.id ?? null}
            />
          ) : showCmpf310Fields ? (
            <Cmpf310ModuleFields
              value={cmpf310}
              onChange={setCmpf310}
              disabled={busy || saving}
              isNumber={row ? isCodeDisplayLabel(row) : ''}
              isUnit={(row?.is_code?.unit_of_is ?? '').trim()}
            />
          ) : showRawMaterialReferenceFields ? (
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
              {loading ? (
                <p className="py-6 text-center text-sm text-stone-500">Loading…</p>
              ) : (
                <RawMaterialReferenceModuleFields
                  value={rawMaterialReference}
                  onChange={setRawMaterialReference}
                  disabled={busy || saving}
                  row={row}
                />
              )}
            </div>
          ) : showProcessFlowFields ? (
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
              {loading ? (
                <p className="py-6 text-center text-sm text-stone-500">Loading…</p>
              ) : (
                <ProcessFlowModuleFields
                  mode={printKind === 'process-description' ? 'description' : 'chart'}
                  projectRow={row}
                  value={processFlow}
                  onChange={setProcessFlow}
                  disabled={busy || saving}
                  applicantName={row ? clientDisplayName(row) : ''}
                  isNumber={row ? isCodeDisplayLabel(row) : ''}
                  isTitle={(row?.is_code?.title ?? '').trim()}
                  productName={(row?.is_code?.title ?? '').trim()}
                  licenseScope={licenseScopeNotes}
                  isCodeId={row?.is_code_id ?? null}
                />
              )}
            </div>
          ) : showFileTable ? (
            <>
              <input
                ref={fileInputRef}
                type="file"
                accept={FILE_ACCEPT}
                className="hidden"
                onChange={(e) => {
                  const list = e.target.files
                  if (!list?.length) return
                  void handleFilesPicked(Array.from(list).slice(0, 1))
                  e.target.value = ''
                }}
              />

              <div className="min-h-0 flex-1 overflow-hidden rounded-none border-2 border-stone-500 bg-[#f7f3eb]">
                {loading ? (
                  <p className="px-3 py-8 text-center text-sm text-stone-500">Loading…</p>
                ) : (
                  <div className="h-full max-h-[min(56vh,520px)] overflow-y-auto overflow-x-auto overscroll-contain [-webkit-overflow-scrolling:touch]">
                    {/* Cards — &lt; ~10″ */}
                    <div className={cn(CARDS_MQ_SHOW, 'space-y-2 p-2')}>
                      {entries.map((entry, index) => {
                        const selected = selectedIds.has(entry.key)
                        const ariaName =
                          entry.kind === 'file'
                            ? fileNames[entry.file.id] || entry.file.file_name
                            : entry.draft.name.trim() || 'Documents Name'
                        return (
                          <article
                            key={entry.key}
                            className={cn(
                              'border border-stone-400 p-2.5',
                              selected
                                ? 'bg-[#fde68a]/80'
                                : index % 2 === 0
                                  ? 'bg-[#f7f3eb]'
                                  : 'bg-[#fffcf7]',
                            )}
                          >
                            <div className="mb-2 flex items-start gap-2">
                              <input
                                type="checkbox"
                                className={cn(checkboxClass, 'mt-1')}
                                checked={selected}
                                onChange={() => toggleId(entry.key)}
                                aria-label={`Select ${ariaName}`}
                              />
                              <div className="min-w-0 flex-1">{renderNameField(entry)}</div>
                            </div>
                            <div className="space-y-2">
                              <div>
                                <p className="mb-1 text-[10px] font-bold uppercase tracking-wide text-stone-500">
                                  Document
                                </p>
                                {renderDocumentActions(entry)}
                              </div>
                              <div>
                                <p className="mb-1 text-[10px] font-bold uppercase tracking-wide text-stone-500">
                                  Action
                                </p>
                                {renderRowActions(entry)}
                              </div>
                            </div>
                          </article>
                        )
                      })}
                    </div>

                    {/* Table — ~10″ / lg+ */}
                    <div className={TABLE_MQ_SHOW}>
                      <Table className="w-full min-w-[520px] table-fixed border-collapse font-jakarta [&_th]:border [&_td]:border [&_th]:border-stone-700 [&_td]:border-[#e7e0d4] [&_th]:p-[1mm] [&_td]:!p-[1mm] [&_th]:sticky [&_th]:top-0 [&_th]:z-[1]">
                        <TableHeader>
                          <TableRow className="hover:bg-transparent">
                            <TableHead className={cn(thBase, 'w-[6%]')}>
                              <input
                                type="checkbox"
                                className={checkboxClass}
                                aria-label="Select All Rows"
                                checked={allChecked}
                                ref={(el) => {
                                  if (el) el.indeterminate = !allChecked && someChecked
                                }}
                                onChange={(e) => toggleAll(e.target.checked)}
                              />
                            </TableHead>
                            <TableHead className={cn(thBase, 'w-[55%] text-left')}>
                              Documents Name
                            </TableHead>
                            <TableHead className={cn(thBase, 'w-[7.5rem]')}>Document</TableHead>
                            <TableHead className={cn(thBase, 'w-[5.5rem]')}>Action</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {entries.map((entry, index) => {
                            const selected = selectedIds.has(entry.key)
                            return (
                              <TableRow
                                key={entry.key}
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
                                    checked={selected}
                                    onChange={() => toggleId(entry.key)}
                                    aria-label={
                                      entry.kind === 'file'
                                        ? `Select ${entry.file.file_name}`
                                        : 'Select draft row'
                                    }
                                  />
                                </TableCell>
                                <TableCell className="px-3 py-2 text-left align-middle">
                                  {renderNameField(entry)}
                                </TableCell>
                                <TableCell className="px-2 py-2 text-center align-middle">
                                  {renderDocumentActions(entry)}
                                </TableCell>
                                <TableCell className="px-2 py-2 text-center align-middle">
                                  {renderRowActions(entry)}
                                </TableCell>
                              </TableRow>
                            )
                          })}
                        </TableBody>
                      </Table>
                    </div>
                  </div>
                )}
              </div>
            </>
          ) : null}
        </div>

        <DialogFooter className="shrink-0 gap-2 border-t border-stone-300 bg-stone-50 px-4 py-3 sm:justify-end sm:px-5">
          {(showCmpf311Fields || mmfOnly) && printKind && (onPreviewDocument || onPdfDocument || onWordDocument) ? (
            <div className="mr-auto flex gap-2">
              {onPreviewDocument ? (
                <Button
                  type="button"
                        className={cn(limsPrimaryBtnClass, 'h-9 gap-1.5 px-4 text-sm')}
                  disabled={!row?.id || busy || saving || loading}
                  title="Save and Preview the SIT Acceptance Document"
                  onClick={() => void handleSave().then(() => onPreviewDocument(mmfOnly ? 'marking-fee-acceptance' : printKind))}
                >
                  <Eye className="h-4 w-4" aria-hidden /> Preview
                </Button>
              ) : null}
              {onPdfDocument ? (
                <Button
                  type="button"
                        className={cn(limsPrimaryBtnClass, 'h-9 gap-1.5 px-4 text-sm')}
                  disabled={!row?.id || busy || saving || loading}
                  title="Save and Download the SIT Acceptance Document as PDF"
                  onClick={() => void handleSave().then(() => onPdfDocument(mmfOnly ? 'marking-fee-acceptance' : printKind))}
                >
                  <Download className="h-4 w-4" aria-hidden /> PDF
                </Button>
              ) : null}
              {onWordDocument ? (
                <Button
                  type="button"
                  className={cn(limsPrimaryBtnClass, 'h-9 gap-1.5 px-4 text-sm')}
                  disabled={!row?.id || busy || saving || loading}
                  title="Save and download an editable Word copy (backup if the software cannot be used)"
                  onClick={() => void handleSave().then(() => onWordDocument(mmfOnly ? 'marking-fee-acceptance' : printKind))}
                >
                  <FileType className="h-4 w-4" aria-hidden /> Word
                </Button>
              ) : null}
            </div>
          ) : null}
          <Button
            type="button"
            className={cn(limsPrimaryBtnClass, 'h-9 px-4 text-sm')}
            disabled={busy || saving}
            onClick={() => onOpenChange(false)}
          >
            Close
          </Button>
          <Button
            type="button"
            className={cn(limsPrimaryBtnClass, 'h-9 px-4 text-sm')}
            disabled={!row?.id || busy || saving || loading}
            onClick={() => void handleSave()}
          >
            {saving ? 'Saving…' : 'Save'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    {showProcessFlowFields ? (
      <BisModuleImportDialog
        open={flowImportOpen}
        onOpenChange={setFlowImportOpen}
        targetRow={row}
        kind="process-flow-chart"
        onPickSource={async (sourceProjectId) => {
          const source = parseProcessFlowPayload(await fetchBisModulePayload(sourceProjectId, 'process-flow-chart'))
          if (source.nodes.length === 0 && source.descriptionPoints.length === 0) {
            throw new Error('The selected application has no process flow chart.')
          }
          const hasCurrent = processFlow.nodes.length > 0 || processFlow.descriptionPoints.some((point) => point.trim())
          if (hasCurrent && !window.confirm('Replace the process flow chart and description here with the imported one?')) return
          setProcessFlow(source)
          toast.success('Process Flow Chart Imported', { description: 'Check the boxes and description, then click Save.' })
        }}
      />
    ) : null}
    {showCmpf307Fields ? (
      <BisModuleImportDialog
        open={brandImportOpen}
        onOpenChange={setBrandImportOpen}
        targetRow={row}
        kind="cmpf-307"
        onPickSource={async (sourceProjectId) => {
          const source = parseCmpf307Payload(await fetchBisModulePayload(sourceProjectId, 'cmpf-307'))
          const sourceRows = source.rows.filter((r) => r.brandName.trim())
          if (sourceRows.length === 0) throw new Error('The selected application has no brand names.')
          const existing = cmpf307.rows.filter((r) => r.brandName.trim())
          const known = new Set(existing.map((r) => r.brandName.trim().toLowerCase()))
          // Attachments belong to the other application; imported rows come without them (upload here).
          const fresh = sourceRows
            .filter((r) => !known.has(r.brandName.trim().toLowerCase()))
            .map((r) => ({ ...emptyCmpf307BrandRow(), brandName: r.brandName, ownedBy: r.ownedBy, registeredStatus: r.registeredStatus, registrationDate: r.registrationDate }))
          if (fresh.length === 0) {
            toast.message('Nothing New to Import', { description: 'These brand names are already here.' })
            return
          }
          setCmpf307({ ...cmpf307, rows: [...existing, ...fresh] })
          toast.success(`Imported ${fresh.length} brand name${fresh.length === 1 ? '' : 's'}`, { description: 'Upload their certificates, then click Save.' })
        }}
      />
    ) : null}
    </>
  )
}
