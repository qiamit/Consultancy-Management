import { useEffect, useRef, useState } from 'react'
import { Download, Eye, Plus, Trash2, Upload } from 'lucide-react'
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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import {
  limsDarkBarGlowStyle,
  limsDialogClass,
  limsOutlineBtnClass,
  limsPrimaryBtnClass,
} from '@/lib/limsThemeUi'
import { cn } from '@/lib/utils'
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
import { ProcessFlowModuleFields } from './ProcessFlowModuleFields'
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
  formatCmL,
  isCodeDisplayLabel,
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

function newDraft(): DraftRow {
  return { id: crypto.randomUUID(), name: '' }
}

export function LegalDocumentsModuleDialog({
  open,
  onOpenChange,
  row,
  title = 'Legal Documents',
  docKind = 'legal',
  printKind = null,
  onProjectSaved,
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
    showOslSampleFields ||
    showFactoryTestFields ||
    showLocationMapFields ||
    showPlantLayoutFields ||
    showProcessFlowFields ||
    showCmpf305Fields ||
    showCmpf306Fields
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
    !showProcessFlowFields

  const [files, setFiles] = useState<BisProjectViewFile[]>([])
  /** Local editable document names for saved files (persisted on Save). */
  const [fileNames, setFileNames] = useState<Record<string, string>>({})
  const [drafts, setDrafts] = useState<DraftRow[]>([newDraft()])
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set())
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(false)
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
  const [plantLayout, setPlantLayout] = useState<PlantLayoutModulePayload>(() =>
    emptyPlantLayoutPayload(),
  )
  const [cmpf305, setCmpf305] = useState<Cmpf305ModulePayload>(() => emptyCmpf305Payload())
  const [cmpf306, setCmpf306] = useState<Cmpf306ModulePayload>(() => emptyCmpf306Payload())
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
      setPlantLayout(emptyPlantLayoutPayload())
      setCmpf305(emptyCmpf305Payload())
      setCmpf306(emptyCmpf306Payload())
      setProcessFlow(emptyProcessFlowPayload())
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

    if (showApplicationFields) {
      setFiles([])
      setFileNames({})
      setLoading(false)
      return
    }

    if (showManufacturingScopeFields) {
      setFiles([])
      setFileNames({})
      setLoading(false)
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
            setLocationMap(parseLocationMapPayload(payload))
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
                ? parsed
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
                ? parsed
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
    showProcessFlowFields,
    row?.notes,
    row?.inspection_officer_name,
    row?.inspection_officer_designation,
  ])

  const resolveRowDocumentName = (target: { type: 'draft' | 'file'; id: string }): string => {
    if (target.type === 'file') {
      return (fileNames[target.id] ?? files.find((f) => f.id === target.id)?.file_name ?? '').trim()
    }
    return (drafts.find((d) => d.id === target.id)?.name ?? '').trim()
  }

  const openFilePicker = (target: { type: 'draft' | 'file'; id: string }) => {
    const documentName = resolveRowDocumentName(target)
    if (!documentName) {
      toast.error('Enter Documents Name in this row before uploading.')
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
      toast.error('Enter Documents Name in this row before uploading.')
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
        toast.success('Document replaced')
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
        toast.success('Document uploaded')
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
      toast.success('Document deleted')
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
      toast.error('License Number must be exactly 10 digits (CM/L-).')
      return
    }

    setSaving(true)
    setStatus(null)
    try {
      if (showApplicationFields) {
        await saveBisApplicationDetails(row.id, appDetails)
        onProjectSaved?.()
        toast.success(`${title} saved.`)
        return
      }

      if (showTopManagementFields && printKind) {
        const rows = topManagement.rows.filter((r) =>
          Object.values(r).some((v) => v.trim().length > 0),
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
        toast.success('Process Flow Chart & Description saved.')
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
            aria-label="Upload document"
          >
            <Upload size={15} aria-hidden />
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className={cn(limsOutlineBtnClass, actionBtnClass)}
            disabled
            title="View (upload a file first)"
            aria-label="View document"
          >
            <Eye size={15} aria-hidden />
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className={cn(limsOutlineBtnClass, actionBtnClass)}
            disabled
            title="Download (upload a file first)"
            aria-label="Download document"
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
            aria-label="View unavailable"
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
            title="Download unavailable"
            aria-label="Download unavailable"
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
          title="Add new row"
          aria-label="Add new row"
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
          title="Delete row"
          aria-label="Delete row"
        >
          <Trash2 size={15} aria-hidden />
        </Button>
      </div>
    )
  }

  return (
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
                  ? 'h-auto max-h-[min(92vh,860px)] w-[min(68rem,calc(100vw-1.5rem))] max-w-[68rem]'
                  : 'max-h-[min(92vh,860px)]',
                !compactFormModule &&
                  (showApplicationFields
                    ? 'w-[min(56rem,calc(100vw-1.5rem))] max-w-[56rem]'
                    : 'w-[min(42rem,calc(100vw-1.5rem))] max-w-[42rem]'),
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
            <p className="mt-0.5 truncate text-xs text-stone-300" title={subtitle}>
              {subtitle}
            </p>
          </DialogHeader>
        </div>

        <div
          className={cn(
            'flex flex-col gap-2 bg-gradient-to-b from-stone-100/80 to-white px-3 py-3 sm:px-4 sm:py-4',
            fullPageModule
              ? 'min-h-0 flex-1 overflow-hidden'
              : compactFormModule
                ? 'shrink-0 overflow-y-auto overscroll-contain [-webkit-overflow-scrolling:touch]'
                : 'min-h-0 flex-1',
          )}
        >
          {status ? (
            <p className="text-xs text-red-700" role="alert">
              {status}
            </p>
          ) : null}

          {showApplicationFields ? (
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain [-webkit-overflow-scrolling:touch]">
              <ApplicationDetailsFields
                form={appDetails}
                onChange={setAppDetails}
                disabled={busy || saving}
                projectKind={row?.project_kind}
              />
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
                  portalUserId={row?.portal_user_id}
                  hasPortalPassword={Boolean(row?.portal_password_set)}
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
                          applicationNumber: (row.application_number ?? '').trim(),
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
                />
              )}
            </div>
          ) : showProcessFlowFields ? (
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
              {loading ? (
                <p className="py-6 text-center text-sm text-stone-500">Loading…</p>
              ) : (
                <ProcessFlowModuleFields
                  value={processFlow}
                  onChange={setProcessFlow}
                  disabled={busy || saving}
                  applicantName={row ? clientDisplayName(row) : ''}
                  isNumber={(row?.is_code?.is_number ?? '').trim()}
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
                                aria-label="Select all rows"
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
          <Button
            type="button"
            variant="outline"
            className={cn(limsOutlineBtnClass, 'h-9 px-4 text-sm')}
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
  )
}
