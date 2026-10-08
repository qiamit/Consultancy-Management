import { useEffect, useMemo, useState } from 'react'
import { Card, CardContent, CardFooter } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { labRegistryFormClass } from '@/features/settings/lab-settings/labSettingsUi'
import {
  limsDarkBarGlowStyle,
  limsDialogClass,
  limsFieldWithAddShellClass,
  limsOutlineBtnClass,
  limsPanelClass,
  limsPrimaryBtnClass,
} from '@/lib/limsThemeUi'
import { cn, formatDate } from '@/lib/utils'
import { MeasurementUnitSelect } from '@/features/masters/measurement-units/MeasurementUnitSelect'
import {
  FilterCombobox,
  type FilterComboboxOption,
} from '@/features/sample-handling/receiving/FilterCombobox'
import { FileUp, Eye, X, Trash2, Plus, CheckCircle, AlertTriangle, Activity, History, Wrench, ClipboardCheck, ListChecks, Thermometer } from 'lucide-react'
import {
  calculateNextDueDate,
  sanitizeDateStr,
  todayIsoDate,
  type EquipmentForm,
  type EquipmentStatus,
  type Frequency,
  type EquipmentRow,
} from './types'
import { ClientSearchSelect } from './ClientSearchSelect'
import { LimsFieldAddButton, LimsFieldWithAdd } from '@/components/lims/LimsFieldWithAdd'
import { LocationFieldWithAdd } from '@/components/lims/LocationFieldWithAdd'
import { ConductMaintenanceDialog } from './ConductMaintenanceDialog'
import { ConductIntermediateCheckDialog } from './ConductIntermediateCheckDialog'
import { IntermediateCheckCalculator } from '@/features/calibration/equipment-for-calibration/IntermediateCheckCalculator'
import { CalibrationPointsTableSetupDialog } from '@/features/calibration/equipment-for-calibration/CalibrationPointsTableSetupDialog'
import { IqcMasterSelectionDialog } from '@/features/calibration/equipment-for-calibration/IqcMasterSelectionDialog'
import {
  decodeIntermediateCheckResult,
  encodeIntermediateCheckResult,
  hasValidIntermediateReading,
  readingsFromCheckTable,
  type IntermediateCheckDraft,
} from '@/features/calibration/equipment-for-calibration/intermediateCheck'
import {
  emptyCalibrationPointRow,
  emptyCalibrationPointsColumn,
} from '@/features/calibration/equipment-for-calibration/types'
import { MaintenanceHistoryDialog } from './MaintenanceHistoryDialog'
import { IntermediateCheckHistoryDialog } from './IntermediateCheckHistoryDialog'
import {
  buildIntermediateCheckMasterSnapshots,
  createIntermediateCheckHistoryRecord,
  filterIntermediateCheckHistoryLastYears,
  isDateWithinLastYears,
  parseIntermediateCheckResultPayload,
} from './intermediateCheckHistory'
import { IqcMasterSearchSelect } from './IqcMasterSearchSelect'

function parseAcceptanceLimit(criteria: string | null | undefined): number | null {
  if (!criteria) return null
  const match = criteria.match(/[\d\.]+/)
  if (match) {
    const num = parseFloat(match[0])
    return isNaN(num) ? null : num
  }
  return null
}

function extractAcceptanceCriteriaUnit(
  criteria: string | null | undefined,
  parsedUnit?: string,
): string {
  if (parsedUnit?.trim()) return parsedUnit.trim()
  if (!criteria?.trim()) return ''
  return criteria.replace(/[\d.\s±+\-]+/g, '').trim()
}

function calcIntermediateCheckError(
  std: string,
  obs: string,
  multiplier = 1,
): number | null {
  const stdNum = parseFloat(std)
  const obsNum = parseFloat(obs)
  if (Number.isNaN(stdNum) || Number.isNaN(obsNum)) return null
  return Math.abs(obsNum * multiplier - stdNum * multiplier)
}

function formatIntermediateCheckError(err: number, unit: string): string {
  return `${err.toFixed(4)}${unit ? ` ${unit}` : ''}`
}

type IntermediateCheckReading = {
  checkPointValue: string
  std: string
  obs: string
}

function normalizeIntermediateCheckReading(row: unknown): IntermediateCheckReading {
  if (!row || typeof row !== 'object') return emptyIntermediateCheckReading()
  const r = row as Record<string, unknown>
  return {
    checkPointValue: String(r.checkPointValue ?? r.checkPoint ?? r.checkpoint ?? ''),
    std: String(r.std ?? ''),
    obs: String(r.obs ?? ''),
  }
}

function emptyIntermediateCheckReading(): IntermediateCheckReading {
  return { checkPointValue: '', std: '', obs: '' }
}

const DEFAULT_INTERMEDIATE_TEMPERATURE = '27'
const DEFAULT_INTERMEDIATE_HUMIDITY = '65'

function safeEvaluate(expr: string): string {
  const sanitized = expr.replace(/\s+/g, '')
  if (!/^[-+*/.0-9]+$/.test(sanitized)) {
    return 'Error'
  }
  try {
    const fn = new Function(`return ${sanitized}`)
    const res = fn()
    return isFinite(res) ? String(res) : 'Error'
  } catch {
    return 'Error'
  }
}

export function EquipmentMasterForm({
  form,
  onChange,
  canSave,
  saveLoading,
  onSave,
  clients,
  employees,
  locations: _locations,
  onViewFile,
  activeSection,
  hideScheduleSections = false,
  readOnly = false,
  onClose,
  onAddNewClientClick,
  equipments = [],
  iqcMasters = [],
}: {
  form: EquipmentForm
  onChange: (next: EquipmentForm) => void
  canSave: boolean
  saveLoading: boolean
  onSave: () => void
  clients: Array<{ id: string; company_name: string }>
  employees: Array<{
    id: string
    full_name: string
    department_name?: string | null
    designation?: string | null
  }>
  locations: string[]
  onViewFile: (storagePath: string, fileName: string) => void
  activeSection?: 'calibration' | 'intermediate' | 'maintenance' | null
  hideScheduleSections?: boolean
  /** Name-link details view — fields locked; Edit is via pencil only. */
  readOnly?: boolean
  onClose?: () => void
  onAddNewClientClick: (field: 'purchasedFrom' | 'externalCalibrationAgency') => void
  equipments?: EquipmentRow[]
  iqcMasters?: any[]
}) {
  const [showCalcSteps, setShowCalcSteps] = useState(false)
  const [showCalculator, setShowCalculator] = useState(false)
  const [calcInput, setCalcInput] = useState('')
  const [calcResult, setCalcResult] = useState('')

  // Applicability states
  const [calApplicable, setCalApplicable] = useState<'applicable' | 'not-applicable'>('applicable')
  const [intermediateApplicable, setIntermediateApplicable] = useState<'applicable' | 'not-applicable'>('applicable')
  const [maintApplicable, setMaintApplicable] = useState<'applicable' | 'not-applicable'>('applicable')
  const [conductMaintenanceOpen, setConductMaintenanceOpen] = useState(false)
  const [conductIntermediateCheckOpen, setConductIntermediateCheckOpen] = useState(false)
  const [maintenanceHistoryViewOpen, setMaintenanceHistoryViewOpen] = useState(false)
  const [intermediateHistoryViewOpen, setIntermediateHistoryViewOpen] = useState(false)
  const [intermediateCompleteMessage, setIntermediateCompleteMessage] = useState<string | null>(null)
  const [calDetailsOpen, setCalDetailsOpen] = useState(false)
  const [intermediateDetailsOpen, setIntermediateDetailsOpen] = useState(false)
  const [maintenanceScheduleOpen, setMaintenanceScheduleOpen] = useState(false)
  const [icEnvSetupOpen, setIcEnvSetupOpen] = useState(false)
  const [icCheckSetupOpen, setIcCheckSetupOpen] = useState(false)
  const [icIqcSetupOpen, setIcIqcSetupOpen] = useState(false)
  const [custodianOpen, setCustodianOpen] = useState(false)
  const [custodianQuery, setCustodianQuery] = useState('')
  const [maintDoneByOpen, setMaintDoneByOpen] = useState(false)
  const [maintDoneByQuery, setMaintDoneByQuery] = useState('')
  const [checkDoneByOpen, setCheckDoneByOpen] = useState(false)
  const [checkDoneByQuery, setCheckDoneByQuery] = useState('')

  const employeeOptions = useMemo<FilterComboboxOption[]>(
    () =>
      employees
        .map((emp) => {
          const label = String(emp.full_name ?? '').trim()
          const secondaryLabel = [emp.department_name, emp.designation]
            .map((part) => String(part ?? '').trim())
            .filter(Boolean)
            .join(' | ')
          return {
            id: emp.id,
            label,
            ...(secondaryLabel ? { secondaryLabel } : {}),
          }
        })
        .filter((o) => o.label.length > 0),
    [employees],
  )

  const selectedCustodianLabel =
    employees.find((emp) => emp.id === form.custodianEmployeeId)?.full_name ?? ''

  const filteredCustodianOptions = useMemo(() => {
    const q = custodianQuery.trim().toLowerCase()
    if (!q || !custodianOpen) return employeeOptions
    if (employeeOptions.some((o) => o.label.trim().toLowerCase() === q)) return employeeOptions
    return employeeOptions.filter(
      (o) =>
        o.label.toLowerCase().includes(q) ||
        (o.secondaryLabel ?? '').toLowerCase().includes(q),
    )
  }, [custodianQuery, custodianOpen, employeeOptions])

  const effectiveMaintenanceDoneBy = form.maintenanceDoneBy || form.custodianEmployeeId || ''

  const selectedMaintDoneByLabel =
    employees.find((emp) => emp.id === effectiveMaintenanceDoneBy)?.full_name ?? ''

  const filteredMaintDoneByOptions = useMemo(() => {
    const q = maintDoneByQuery.trim().toLowerCase()
    if (!q || !maintDoneByOpen) return employeeOptions
    if (employeeOptions.some((o) => o.label.trim().toLowerCase() === q)) return employeeOptions
    return employeeOptions.filter(
      (o) =>
        o.label.toLowerCase().includes(q) ||
        (o.secondaryLabel ?? '').toLowerCase().includes(q),
    )
  }, [maintDoneByQuery, maintDoneByOpen, employeeOptions])

  const filteredCheckDoneByOptions = useMemo(() => {
    const q = checkDoneByQuery.trim().toLowerCase()
    if (!q || !checkDoneByOpen) return employeeOptions
    if (employeeOptions.some((o) => o.label.trim().toLowerCase() === q)) return employeeOptions
    return employeeOptions.filter(
      (o) =>
        o.label.toLowerCase().includes(q) ||
        (o.secondaryLabel ?? '').toLowerCase().includes(q),
    )
  }, [checkDoneByQuery, checkDoneByOpen, employeeOptions])

  const maintenanceDoneByName = useMemo(
    () => employees.find((emp) => emp.id === effectiveMaintenanceDoneBy)?.full_name ?? '',
    [employees, effectiveMaintenanceDoneBy],
  )

  const hasMaintenanceChecklistHistory = useMemo(
    () =>
      form.maintenanceHistory.length > 0 ||
      (form.maintenanceChecklist.length > 0 && !!form.lastMaintenanceDate?.trim()),
    [form.maintenanceHistory.length, form.maintenanceChecklist.length, form.lastMaintenanceDate],
  )

  const renderMaintenanceScheduleRow = (
    ids: { last: string; next: string },
    labelClassName = 'text-xs font-semibold',
  ) => (
    <div className="grid grid-cols-12 gap-3">
      <div className="col-span-12 min-w-0 space-y-2 md:col-span-3">
        <Label htmlFor={`${ids.last}-freq`} className={labelClassName}>
          Schedule Frequency
        </Label>
        <Select
          value={form.maintenanceScheduleFrequency || 'Quarterly'}
          onValueChange={(v) => onChange({ ...form, maintenanceScheduleFrequency: v as Frequency })}
        >
          <SelectTrigger id={`${ids.last}-freq`}>
            <SelectValue placeholder="Select Frequency" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="Daily">Daily</SelectItem>
            <SelectItem value="Weekly">Weekly</SelectItem>
            <SelectItem value="Monthly">Monthly</SelectItem>
            <SelectItem value="Quarterly">Quarterly</SelectItem>
            <SelectItem value="Half Yearly">Half Yearly</SelectItem>
            <SelectItem value="Yearly">Yearly</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="col-span-12 min-w-0 space-y-2 md:col-span-3">
        <Label htmlFor={ids.last} className={labelClassName}>
          Last Date
        </Label>
        <Input
          id={ids.last}
          type="date"
          value={form.lastMaintenanceDate}
          onChange={(e) => onChange({ ...form, lastMaintenanceDate: e.target.value })}
        />
      </div>
      <div className="col-span-12 min-w-0 space-y-2 md:col-span-3">
        <Label htmlFor={ids.next} className={labelClassName}>
          Next Due (Auto)
        </Label>
        <Input
          id={ids.next}
          type="date"
          value={form.nextMaintenanceDate}
          readOnly
          className="bg-slate-50 font-mono text-slate-600"
        />
      </div>
      <div className="col-span-12 min-w-0 space-y-2 md:col-span-3">
        <Label htmlFor={`${ids.last}-done`} className={labelClassName}>
          Maintenance Done By
        </Label>
        <FilterCombobox
          inputId={`${ids.last}-done`}
          listId={`${ids.last}-done-list`}
          value={maintDoneByOpen ? maintDoneByQuery : selectedMaintDoneByLabel}
          onValueChange={(v) => {
            setMaintDoneByQuery(v)
            if (!maintDoneByOpen) setMaintDoneByOpen(true)
            if (!v.trim()) {
              onChange({ ...form, maintenanceDoneBy: '' })
            }
          }}
          options={filteredMaintDoneByOptions}
          onSelectOption={(opt) => {
            onChange({ ...form, maintenanceDoneBy: opt.id })
            setMaintDoneByQuery(opt.label)
            setMaintDoneByOpen(false)
          }}
          open={maintDoneByOpen}
          onOpenChange={(open) => {
            setMaintDoneByOpen(open)
            if (open) setMaintDoneByQuery(selectedMaintDoneByLabel)
          }}
          placeholder="Type to search employee…"
        />
      </div>
      <div className="col-span-12 min-w-0 space-y-2 md:col-span-3">
        <Label className={labelClassName}>Conduct Maintenance</Label>
        <Button
          type="button"
          variant="outline"
          className={cn('h-10 w-full gap-1.5 text-xs', limsOutlineBtnClass)}
          onClick={() => setConductMaintenanceOpen(true)}
        >
          <Wrench size={14} />
          Conduct
        </Button>
      </div>
      <div className="col-span-12 min-w-0 space-y-2 md:col-span-3">
        <Label className={labelClassName}>View Old Checklist</Label>
        <Button
          type="button"
          variant="secondary"
          className="h-10 w-full gap-1.5 text-xs"
          disabled={!hasMaintenanceChecklistHistory}
          onClick={() => setMaintenanceHistoryViewOpen(true)}
        >
          <History size={14} />
          View
          {form.maintenanceHistory.length > 0 ? ` (${form.maintenanceHistory.length})` : ''}
        </Button>
      </div>
    </div>
  )

  const renderMaintenanceScheduleDialog = () => (
    <Dialog open={maintenanceScheduleOpen} onOpenChange={setMaintenanceScheduleOpen}>
      <DialogContent
        persistOnFocusLoss
        layer="nested"
        overlayClassName="lg:inset-y-0 lg:left-[268px] lg:right-0 lg:w-auto"
        className={cn(
          limsDialogClass,
          '!flex h-[100dvh] max-h-[100dvh] w-full max-w-none translate-x-0 translate-y-0 flex-col gap-0 overflow-hidden p-0',
          'left-0 top-0',
          'lg:left-[268px] lg:w-[calc(100vw-268px)] lg:max-w-[calc(100vw-268px)]',
        )}
        aria-describedby={undefined}
      >
        <div className="relative shrink-0 overflow-hidden bg-gradient-to-br from-stone-800 via-stone-900 to-stone-950 px-4 py-2.5 text-white sm:px-5 sm:py-3">
          <div
            className="pointer-events-none absolute inset-0 opacity-[0.18]"
            style={limsDarkBarGlowStyle}
          />
          <div className="absolute bottom-0 left-0 h-[2px] w-full bg-gradient-to-r from-amber-500 via-amber-300 to-transparent" />
          <DialogHeader className="relative pr-10 text-left">
            <DialogTitle className="text-base font-semibold tracking-tight text-white sm:text-lg">
              Maintenance Schedule Form
            </DialogTitle>
          </DialogHeader>
        </div>
        <div
          className={cn(
            'min-h-0 flex-1 overflow-y-auto overflow-x-hidden bg-gradient-to-b from-stone-100/80 to-white px-4 py-4 sm:px-6 sm:py-5',
            labRegistryFormClass,
          )}
        >
          {renderMaintenanceScheduleRow(
            { last: 'eq-last-maint-dialog', next: 'eq-next-maint-dialog' },
            'text-[11px] font-semibold uppercase tracking-wide text-stone-600',
          )}
        </div>
        <DialogFooter className="shrink-0 gap-2 border-t border-stone-300 bg-white px-4 py-3 sm:px-6">
          <Button
            type="button"
            className={limsPrimaryBtnClass}
            disabled={saveLoading}
            onClick={() => {
              onSave()
              setMaintenanceScheduleOpen(false)
            }}
          >
            {saveLoading ? 'Saving…' : 'Save & Close'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )

  const renderCalibrationFormFields = (idSuffix: string) => (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
        <div className="space-y-1.5">
          <Label htmlFor={`eq-cal-freq-${idSuffix}`}>Frequency</Label>
          <Select
            value={form.calibrationFrequency}
            onValueChange={(v) => onChange({ ...form, calibrationFrequency: v as Frequency })}
          >
            <SelectTrigger id={`eq-cal-freq-${idSuffix}`}>
              <SelectValue placeholder="Select Frequency" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="Daily">Daily</SelectItem>
              <SelectItem value="Weekly">Weekly</SelectItem>
              <SelectItem value="Monthly">Monthly</SelectItem>
              <SelectItem value="Quarterly">Quarterly</SelectItem>
              <SelectItem value="Half Yearly">Half Yearly</SelectItem>
              <SelectItem value="Yearly">Yearly</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`eq-last-cal-${idSuffix}`}>Last Date</Label>
          <Input
            id={`eq-last-cal-${idSuffix}`}
            type="date"
            value={form.lastCalibrationDate}
            onChange={(e) => onChange({ ...form, lastCalibrationDate: e.target.value })}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`eq-next-cal-${idSuffix}`}>Next Due (Auto)</Label>
          <Input
            id={`eq-next-cal-${idSuffix}`}
            type="date"
            value={form.nextCalibrationDue}
            readOnly
            className="bg-muted font-mono text-muted-foreground"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`eq-cal-cert-${idSuffix}`}>Certificate Number</Label>
          <Input
            id={`eq-cal-cert-${idSuffix}`}
            placeholder="Certificate No"
            value={form.calibrationCertificateNumber}
            onChange={(e) => onChange({ ...form, calibrationCertificateNumber: e.target.value })}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 items-end gap-3 sm:grid-cols-2">
        <div className="space-y-0.5">
          <Label htmlFor={`eq-cal-uncertainty-${idSuffix}`}>UOM of Calibration</Label>
          <div className={limsFieldWithAddShellClass}>
            <span
              className="flex h-full shrink-0 items-center px-2 text-sm font-semibold text-stone-700"
              aria-hidden
            >
              ±
            </span>
            <Input
              id={`eq-cal-uncertainty-${idSuffix}`}
              inputMode="decimal"
              placeholder="Value"
              aria-label="UOM of calibration value, plus or minus"
              value={form.calibrationCertificateUncertainty}
              onChange={(e) =>
                onChange({
                  ...form,
                  calibrationCertificateUncertainty: e.target.value.replace(/[^0-9.]/g, ''),
                })
              }
              className="h-full min-w-0 flex-1 rounded-none border-0 bg-transparent px-2 pl-0 shadow-none focus-visible:ring-0"
            />
            <div className="min-w-0 flex-1 border-l border-stone-500">
              <MeasurementUnitSelect
                id={`eq-cal-uncertainty-unit-${idSuffix}`}
                value={form.calibrationUncertaintyUnit}
                onChange={(calibrationUncertaintyUnit) =>
                  onChange({ ...form, calibrationUncertaintyUnit })
                }
                showLabel={false}
                showManageButton
                placeholder="Unit"
                className="min-w-0"
                shellClassName="h-full border-0 focus-within:border-transparent focus-within:ring-0"
                inputClassName="px-2"
              />
            </div>
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`eq-cal-coverage-factor-${idSuffix}`}>Coverage Factor</Label>
          <Input
            id={`eq-cal-coverage-factor-${idSuffix}`}
            inputMode="decimal"
            placeholder="2"
            value={form.calibrationCoverageFactor}
            onChange={(e) =>
              onChange({
                ...form,
                calibrationCoverageFactor: e.target.value.replace(/[^0-9.]/g, '') || '2',
              })
            }
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label>External Calibration Agency</Label>
          <LimsFieldWithAdd
            addButton={
              <LimsFieldAddButton
                aria-label="Add new calibration agency client"
                title="Add New Client"
                onClick={() => onAddNewClientClick('externalCalibrationAgency')}
              />
            }
          >
            <ClientSearchSelect
              value={form.externalCalibrationAgency}
              onValueChange={(v) => onChange({ ...form, externalCalibrationAgency: v })}
              options={clients}
              placeholder="Type to Search Agency"
            />
          </LimsFieldWithAdd>
        </div>
        <div className="space-y-1.5">
          <Label>Calibration Certificate (PDF)</Label>
          <div className="flex h-8 items-center gap-0.5 rounded-none border border-stone-500 bg-stone-50 px-1">
            <span
              className="min-w-0 flex-1 truncate px-1.5 text-xs text-stone-600"
              title={
                form.certificateFile?.name ||
                (form.uploadCertificatePath
                  ? form.uploadCertificatePath.split('/').pop()?.replace(/^\d+_/, '')
                  : undefined)
              }
            >
              {form.certificateFile
                ? form.certificateFile.name
                : form.uploadCertificatePath
                  ? form.uploadCertificatePath.split('/').pop()?.replace(/^\d+_/, '')
                  : 'No file'}
            </span>
            <label
              className="inline-flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-none text-base leading-none hover:bg-stone-200/80"
              title="Upload"
              aria-label="Upload Calibration Certificate"
            >
              <span aria-hidden>📤</span>
              <input
                type="file"
                accept=".pdf"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0] || null
                  handleFileChange('certificateFile', file)
                  e.target.value = ''
                }}
              />
            </label>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-7 w-7 shrink-0 rounded-none text-base hover:bg-stone-200/80"
              title="View"
              aria-label="View Calibration Certificate"
              disabled={!form.uploadCertificatePath && !form.certificateFile}
              onClick={() => {
                if (form.uploadCertificatePath) {
                  onViewFile(form.uploadCertificatePath, 'Certificate')
                  return
                }
                if (form.certificateFile) {
                  const url = URL.createObjectURL(form.certificateFile)
                  window.open(url, '_blank', 'noopener,noreferrer')
                  window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
                }
              }}
            >
              <span aria-hidden>👁</span>
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-7 w-7 shrink-0 rounded-none text-base hover:bg-red-50"
              title="Delete"
              aria-label="Delete Calibration Certificate"
              disabled={!form.uploadCertificatePath && !form.certificateFile}
              onClick={() => {
                const ok = window.confirm(
                  'Are you sure you want to delete the uploaded certificate?',
                )
                if (!ok) return
                onChange({
                  ...form,
                  uploadCertificatePath: '',
                  certificateFile: null,
                })
              }}
            >
              <span aria-hidden>🗑</span>
            </Button>
          </div>
        </div>
      </div>
    </div>
  )

  const openCalibrationForm = () => {
    if (calApplicable !== 'applicable') return
    const nextFrequency = form.calibrationFrequency || 'Yearly'
    if (
      nextFrequency !== form.calibrationFrequency ||
      !form.calibrationCoverageFactor
    ) {
      onChange({
        ...form,
        calibrationFrequency: nextFrequency,
        calibrationCoverageFactor: form.calibrationCoverageFactor || '2',
      })
    }
    setCalDetailsOpen(true)
  }

  const renderCalibrationFormDialog = () => (
    <Dialog
      open={calDetailsOpen}
      onOpenChange={(open) => {
        setCalDetailsOpen(open)
        if (!open) return
        const nextFrequency = form.calibrationFrequency || 'Yearly'
        if (nextFrequency !== form.calibrationFrequency || !form.calibrationCoverageFactor) {
          onChange({
            ...form,
            calibrationFrequency: nextFrequency,
            calibrationCoverageFactor: form.calibrationCoverageFactor || '2',
          })
        }
      }}
    >
      <DialogContent
        persistOnFocusLoss
        layer="nested"
        overlayClassName="lg:inset-y-0 lg:left-[268px] lg:right-0 lg:w-auto"
        className={cn(
          limsDialogClass,
          '!flex h-[100dvh] max-h-[100dvh] w-full max-w-none translate-x-0 translate-y-0 flex-col gap-0 overflow-hidden p-0',
          'left-0 top-0',
          'lg:left-[268px] lg:w-[calc(100vw-268px)] lg:max-w-[calc(100vw-268px)]',
        )}
        aria-describedby={undefined}
      >
        <div className="relative shrink-0 overflow-hidden bg-gradient-to-br from-stone-800 via-stone-900 to-stone-950 px-4 py-2.5 text-white sm:px-5 sm:py-3">
          <div
            className="pointer-events-none absolute inset-0 opacity-[0.18]"
            style={limsDarkBarGlowStyle}
          />
          <div className="absolute bottom-0 left-0 h-[2px] w-full bg-gradient-to-r from-amber-500 via-amber-300 to-transparent" />
          <DialogHeader className="relative pr-10 text-left">
            <DialogTitle className="text-base font-semibold tracking-tight text-white sm:text-lg">
              Calibration Form
            </DialogTitle>
          </DialogHeader>
        </div>
        <div
          className={cn(
            'min-h-0 flex-1 overflow-y-auto overflow-x-hidden bg-gradient-to-b from-stone-100/80 to-white px-4 py-4 sm:px-6 sm:py-5',
            labRegistryFormClass,
          )}
        >
          {renderCalibrationFormFields('dialog')}
        </div>
        <DialogFooter className="shrink-0 gap-2 border-t border-stone-300 bg-white px-4 py-3 sm:px-6">
          <Button
            type="button"
            className={limsPrimaryBtnClass}
            disabled={saveLoading}
            onClick={() => {
              onSave()
              setCalDetailsOpen(false)
            }}
          >
            {saveLoading ? 'Saving…' : 'Save & Close'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )

  const renderMaintenanceHistoryDialog = () => (
    <MaintenanceHistoryDialog
      open={maintenanceHistoryViewOpen}
      onOpenChange={setMaintenanceHistoryViewOpen}
      equipmentName={form.equipmentName}
      assetCode={form.assetCode}
      history={form.maintenanceHistory}
      currentLastDate={form.lastMaintenanceDate}
      currentDoneByName={maintenanceDoneByName}
      currentChecklist={form.maintenanceChecklist}
      onDirectorChange={(next) =>
        onChange({
          ...form,
          maintenanceHistory: next.history,
          lastMaintenanceDate: next.currentLastDate,
          maintenanceDoneBy: next.currentDoneByName,
          maintenanceChecklist: next.currentChecklist,
        })
      }
    />
  )

  const [prevAssetCode, setPrevAssetCode] = useState<string | null>(null)
  const [prevFormResetState, setPrevFormResetState] = useState<boolean>(false)

  const currentFormResetState = !form.equipmentName && !form.manufacturer && !form.modelNumber && !form.serialNumber && !form.calibrationFrequency && !form.intermediateCheckFrequency && !form.maintenanceScheduleFrequency

  if (form.assetCode !== prevAssetCode || (currentFormResetState && !prevFormResetState)) {
    setPrevAssetCode(form.assetCode)
    setPrevFormResetState(currentFormResetState)
    
    // Default schedule statuses to Applicable (user can switch to Not Applicable)
    setCalApplicable('applicable')
    setIntermediateApplicable('applicable')
    setMaintApplicable('applicable')
    setCalDetailsOpen(false)
    setIntermediateDetailsOpen(false)
    setMaintenanceScheduleOpen(false)
  } else if (!currentFormResetState && prevFormResetState) {
    setPrevFormResetState(false)
  }

  const {
    parsedReadings,
    parsedDoneBy,
    parsedMasters,
    parsedUnit,
    parsedConversionMultiplier,
    parsedTemperature,
    parsedHumidity,
    parsedIsEnRatioEnabled,
    parsedLabUncertainty,
    parsedMasterUncertainty,
    isLegacy
  } = (() => {
    const match = form.intermediateCheckResult?.match(/\[DATA:([\s\S]+)\]/)
    if (match) {
      try {
        const parsed = JSON.parse(match[1])
        if (Array.isArray(parsed.readings)) {
          return {
            parsedReadings: parsed.readings.map((row: Record<string, unknown>) =>
              normalizeIntermediateCheckReading(row),
            ),
            parsedDoneBy:
              String(parsed.doneBy ?? '').trim() || form.custodianEmployeeId || '',
            parsedMasters: Array.isArray(parsed.masters) ? (parsed.masters as string[]) : [],
            parsedUnit: parsed.unit !== undefined ? String(parsed.unit) : '',
            parsedConversionMultiplier: parsed.conversionMultiplier !== undefined ? String(parsed.conversionMultiplier) : '1',
            parsedTemperature:
              String(parsed.temperature ?? '').trim() || DEFAULT_INTERMEDIATE_TEMPERATURE,
            parsedHumidity:
              String(parsed.humidity ?? '').trim() || DEFAULT_INTERMEDIATE_HUMIDITY,
            parsedIsEnRatioEnabled: !!parsed.isEnRatioEnabled,
            parsedLabUncertainty: parsed.labUncertainty !== undefined ? String(parsed.labUncertainty) : '',
            parsedMasterUncertainty: parsed.masterUncertainty !== undefined ? String(parsed.masterUncertainty) : '',
            isLegacy: false,
          }
        }
      } catch (e) {
        // ignore
      }
    }
    
    return {
      parsedReadings: [emptyIntermediateCheckReading()],
      parsedDoneBy: form.custodianEmployeeId || '',
      parsedMasters: [],
      parsedUnit: '',
      parsedConversionMultiplier: '1',
      parsedTemperature: DEFAULT_INTERMEDIATE_TEMPERATURE,
      parsedHumidity: DEFAULT_INTERMEDIATE_HUMIDITY,
      parsedIsEnRatioEnabled: false,
      parsedLabUncertainty: '',
      parsedMasterUncertainty: '',
      isLegacy: !!form.intermediateCheckResult?.trim() && !form.intermediateCheckResult.includes('[DATA:'),
    }
  })()

  const defaultLimit = parseAcceptanceLimit(form.accuracyAcceptanceCriteria)

  const handleUpdateCheck = (
    newReadings: IntermediateCheckReading[],
    doneByVal?: string,
    mastersVal?: string[],
    unitVal?: string,
    multiplierVal?: string,
    tempVal?: string,
    humidityVal?: string,
    isEnEnabled?: boolean,
    labUncVal?: string,
    masterUncVal?: string,
    extraForm?: Partial<EquipmentForm>,
  ) => {
    const multiplier = parseFloat(multiplierVal !== undefined ? multiplierVal : parsedConversionMultiplier) || 1
    const finalDoneBy =
      (doneByVal !== undefined ? doneByVal : parsedDoneBy) || form.custodianEmployeeId
    const finalMasters = mastersVal !== undefined ? mastersVal : parsedMasters
    const finalUnit = unitVal !== undefined ? unitVal : parsedUnit
    const finalMultiplier = multiplierVal !== undefined ? multiplierVal : parsedConversionMultiplier
    const finalTemp =
      (tempVal !== undefined ? tempVal : parsedTemperature) || DEFAULT_INTERMEDIATE_TEMPERATURE
    const finalHumidity =
      (humidityVal !== undefined ? humidityVal : parsedHumidity) || DEFAULT_INTERMEDIATE_HUMIDITY
    const finalIsEn = isEnEnabled !== undefined ? isEnEnabled : parsedIsEnRatioEnabled
    const finalLabUnc = labUncVal !== undefined ? labUncVal : parsedLabUncertainty
    const finalMasterUnc = masterUncVal !== undefined ? masterUncVal : parsedMasterUncertainty

    const parsedLimitNum = defaultLimit
    const uLab = parseFloat(finalLabUnc) || 0
    const uRef = parseFloat(finalMasterUnc) || 0
    const enDenom = Math.sqrt(uLab * uLab + uRef * uRef)

    let maxError = 0
    let sumSqError = 0
    let hasFail = false
    let hasValidReading = false

    newReadings.forEach((r) => {
      const stdNum = parseFloat(r.std)
      const obsNum = parseFloat(r.obs)
      if (!isNaN(stdNum) && !isNaN(obsNum)) {
        hasValidReading = true
        // Apply multiplier to convert values to target criteria unit
        const stdConverted = stdNum * multiplier
        const obsConverted = obsNum * multiplier
        const err = Math.abs(obsConverted - stdConverted)
        
        sumSqError += err * err
        if (err > maxError) {
          maxError = err
        }
        
        let pass = true
        if (finalIsEn && enDenom > 0) {
          const enRatio = err / enDenom
          if (enRatio > 1.0) {
            pass = false
          }
        } else if (parsedLimitNum !== null) {
          pass = err <= parsedLimitNum
        }

        if (!pass) {
          hasFail = true
        }
      }
    })

    let overallStatus: 'Satisfactory' | 'Unsatisfactory' | 'N/A' = 'N/A'
    if (hasValidReading) {
      overallStatus = hasFail ? 'Unsatisfactory' : 'Satisfactory'
    }

    const combinedErrorRSSVal = Math.sqrt(sumSqError)
    const displayUnit = finalUnit || form.accuracyAcceptanceCriteria?.replace(/[\d\.\s±]+/g, '') || ''
    
    const summaryLine = hasValidReading
      ? `${overallStatus} (Max Error: ${maxError.toFixed(4)} ${displayUnit}, RSS Combined Error: ${combinedErrorRSSVal.toFixed(4)} ${displayUnit})`
      : 'No check performed yet'

    const dataStr = `[DATA:${JSON.stringify({
      status: overallStatus,
      limit: defaultLimit !== null ? String(defaultLimit) : '',
      readings: newReadings,
      doneBy: finalDoneBy,
      masters: finalMasters,
      unit: finalUnit,
      conversionMultiplier: finalMultiplier,
      temperature: finalTemp,
      humidity: finalHumidity,
      isEnRatioEnabled: finalIsEn,
      labUncertainty: finalLabUnc,
      masterUncertainty: finalMasterUnc,
      combinedErrorRSS: combinedErrorRSSVal.toFixed(4)
    })}]`

    onChange({
      ...form,
      ...extraForm,
      intermediateCheckResult: `${summaryLine}\n${dataStr}`,
    })
  }

  const applyCustodianSelection = (employeeId: string) => {
    const next: EquipmentForm = {
      ...form,
      custodianEmployeeId: employeeId,
    }
    if (maintApplicable === 'applicable' && !form.maintenanceDoneBy && employeeId) {
      next.maintenanceDoneBy = employeeId
    }
    onChange(next)
    if (intermediateApplicable === 'applicable' && !parsedDoneBy && employeeId) {
      handleUpdateCheck(parsedReadings, employeeId)
    }
  }

  const intermediateDoneBy =
    parsedDoneBy || form.custodianEmployeeId || ''

  const intermediateDraft = useMemo(
    () =>
      decodeIntermediateCheckResult(
        form.intermediateCheckResult,
        intermediateDoneBy || form.custodianEmployeeId || '',
      ),
    [form.intermediateCheckResult, intermediateDoneBy, form.custodianEmployeeId],
  )

  const setIntermediateDraft = (next: IntermediateCheckDraft) => {
    onChange({
      ...form,
      intermediateCheckResult: encodeIntermediateCheckResult(
        next,
        form.accuracyAcceptanceCriteria,
      ),
    })
  }

  const ensureDefaultEnvTable = () => {
    if (intermediateDraft.envColumns.length > 0) {
      setIcEnvSetupOpen(true)
      return
    }
    const columns = [
      emptyCalibrationPointsColumn('Temperature (°C)', 'number'),
      emptyCalibrationPointsColumn('Humidity (% RH)', 'number'),
    ]
    setIntermediateDraft({
      ...intermediateDraft,
      envColumns: columns,
      envRows: [emptyCalibrationPointRow(columns)],
    })
  }

  const intermediateDoneByName = useMemo(
    () => employees.find((emp) => emp.id === intermediateDoneBy)?.full_name ?? '',
    [employees, intermediateDoneBy],
  )

  const currentIntermediatePayload = useMemo(
    () => parseIntermediateCheckResultPayload(form.intermediateCheckResult),
    [form.intermediateCheckResult],
  )

  const visibleIntermediateHistoryCount = useMemo(
    () =>
      filterIntermediateCheckHistoryLastYears(form.intermediateCheckHistory).length +
      (form.lastIntermediateCheckDate?.trim() &&
      currentIntermediatePayload.readings.length > 0 &&
      isDateWithinLastYears(form.lastIntermediateCheckDate)
        ? 1
        : 0),
    [
      form.intermediateCheckHistory,
      form.lastIntermediateCheckDate,
      currentIntermediatePayload.readings.length,
    ],
  )

  const hasIntermediateCheckHistory = visibleIntermediateHistoryCount > 0

  const handleCompleteIntermediateCheck = (): boolean => {
    const doneBy = intermediateDraft.doneBy || intermediateDoneBy
    if (!doneBy?.trim()) {
      setIntermediateCompleteMessage('Select Performed By before completing intermediate check.')
      return false
    }

    if (!hasValidIntermediateReading(intermediateDraft.readings)) {
      setIntermediateCompleteMessage('Add at least one valid Std/Obs reading before completing.')
      return false
    }

    const today = todayIsoDate()
    const nextDue =
      calculateNextDueDate(today, form.intermediateCheckFrequency || 'Quarterly') || ''

    let nextHistory = [...form.intermediateCheckHistory]

    const shouldArchivePrevious =
      form.lastIntermediateCheckDate.trim() &&
      form.intermediateCheckResult.trim() &&
      form.lastIntermediateCheckDate !== today &&
      !nextHistory.some((record) => record.conductedOn === form.lastIntermediateCheckDate)

    if (shouldArchivePrevious) {
      const archived = createIntermediateCheckHistoryRecord({
        conductedOn: form.lastIntermediateCheckDate,
        doneBy: currentIntermediatePayload.doneBy || doneBy,
        doneByName: intermediateDoneByName,
        intermediateCheckResult: form.intermediateCheckResult,
        nextDueDate: form.nextIntermediateCheckDate,
        iqcMasters: iqcMasters ?? [],
      })
      if (archived) {
        nextHistory = [...nextHistory, archived]
      }
    }

    const syncedDraft: IntermediateCheckDraft = { ...intermediateDraft, doneBy }
    onChange({
      ...form,
      intermediateCheckResult: encodeIntermediateCheckResult(
        syncedDraft,
        form.accuracyAcceptanceCriteria,
      ),
      intermediateCheckHistory: nextHistory,
      lastIntermediateCheckDate: today,
      nextIntermediateCheckDate: nextDue,
    })
    setIntermediateCompleteMessage('Intermediate check completed and saved to history.')
    return true
  }

  const renderIntermediateScheduleRow = (
    ids: { last: string; next: string },
    labelClassName = 'text-xs font-semibold',
    dueLabel = 'Next Due (Auto)',
  ) => (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
      <div className="space-y-1.5">
        <Label htmlFor={ids.last} className={labelClassName}>
          Last Check
        </Label>
        <Input
          id={ids.last}
          type="date"
          value={form.lastIntermediateCheckDate}
          onChange={(e) => onChange({ ...form, lastIntermediateCheckDate: e.target.value })}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor={ids.next} className={labelClassName}>
          {dueLabel}
        </Label>
        <Input
          id={ids.next}
          type="date"
          value={form.nextIntermediateCheckDate}
          readOnly
          className="bg-muted text-muted-foreground font-mono"
        />
      </div>

      <div className="space-y-1.5">
        <Label className={labelClassName}>Conduct Check</Label>
        <Button
          type="button"
          variant="outline"
          className="h-9 w-full gap-1.5 text-xs"
          onClick={() => setConductIntermediateCheckOpen(true)}
        >
          <Activity size={14} />
          Conduct
        </Button>
      </div>

      <div className="space-y-1.5">
        <Label className={labelClassName}>Previous Results</Label>
        <Button
          type="button"
          variant="secondary"
          className="h-9 w-full gap-1.5 text-xs"
          disabled={!hasIntermediateCheckHistory}
          onClick={() => setIntermediateHistoryViewOpen(true)}
        >
          <History size={14} />
          View
          {visibleIntermediateHistoryCount > 0 ? ` (${visibleIntermediateHistoryCount})` : ''}
        </Button>
      </div>
    </div>
  )

  const renderIntermediateCheckFormBody = (idSuffix: string) => {
    const freqId = `eq-check-freq-${idSuffix}`
    const doneById = `eq-check-done-by-${idSuffix}`
    const labelClass =
      idSuffix === 'section'
        ? undefined
        : 'text-[11px] font-semibold uppercase tracking-wide text-stone-600'

    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor={freqId} className={labelClass}>
              Frequency
            </Label>
            <Select
              value={form.intermediateCheckFrequency || 'Quarterly'}
              onValueChange={(v) =>
                onChange({ ...form, intermediateCheckFrequency: v as Frequency })
              }
            >
              <SelectTrigger id={freqId}>
                <SelectValue placeholder="Select Frequency" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Daily">Daily</SelectItem>
                <SelectItem value="Weekly">Weekly</SelectItem>
                <SelectItem value="Monthly">Monthly</SelectItem>
                <SelectItem value="Quarterly">Quarterly</SelectItem>
                <SelectItem value="Half Yearly">Half Yearly</SelectItem>
                <SelectItem value="Yearly">Yearly</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={doneById} className={labelClass}>
              Performed By
            </Label>
            <FilterCombobox
              inputId={doneById}
              listId={`${doneById}-list`}
              value={
                checkDoneByOpen
                  ? checkDoneByQuery
                  : employees.find(
                      (emp) =>
                        emp.id ===
                        (intermediateDraft.doneBy || form.custodianEmployeeId || ''),
                    )?.full_name ?? ''
              }
              onValueChange={(v) => {
                setCheckDoneByQuery(v)
                if (!checkDoneByOpen) setCheckDoneByOpen(true)
                if (!v.trim()) {
                  setIntermediateDraft({ ...intermediateDraft, doneBy: '' })
                }
              }}
              options={filteredCheckDoneByOptions}
              onSelectOption={(opt) => {
                setIntermediateDraft({ ...intermediateDraft, doneBy: opt.id })
                setCheckDoneByQuery(opt.label)
                setCheckDoneByOpen(false)
              }}
              open={checkDoneByOpen}
              onOpenChange={(open) => {
                setCheckDoneByOpen(open)
                if (open) {
                  setCheckDoneByQuery(
                    employees.find(
                      (emp) =>
                        emp.id ===
                        (intermediateDraft.doneBy || form.custodianEmployeeId || ''),
                    )?.full_name ?? '',
                  )
                }
              }}
              placeholder="Name of Employee"
            />
          </div>
        </div>

        {renderIntermediateScheduleRow(
          { last: `eq-last-check-${idSuffix}`, next: `eq-next-check-${idSuffix}` },
          labelClass,
          'Next Due (Auto)',
        )}

        <div className="flex flex-wrap items-center gap-2 border-t border-stone-300 pt-3">
          <Button
            type="button"
            variant="outline"
            className={cn('h-9', limsOutlineBtnClass)}
            onClick={() => setIcEnvSetupOpen(true)}
            aria-label="Environment Condition"
            title="Set up environment condition columns"
          >
            <Thermometer size={16} className="mr-1.5" aria-hidden />
            Environment Condition
            {intermediateDraft.envColumns.length > 0 ? (
              <span className="ml-1.5 rounded-none bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-amber-900">
                {intermediateDraft.envColumns.length}
              </span>
            ) : null}
          </Button>
          <Button
            type="button"
            variant="outline"
            className={cn('h-9', limsOutlineBtnClass)}
            onClick={() => setIcCheckSetupOpen(true)}
          >
            Check Point Table
            {intermediateDraft.checkColumns.length > 0 ? (
              <span className="ml-1.5 rounded-none bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-amber-900">
                {intermediateDraft.checkColumns.length}
              </span>
            ) : null}
          </Button>
          <Button
            type="button"
            variant="outline"
            className={cn('h-9', limsOutlineBtnClass)}
            onClick={() => setIcIqcSetupOpen(true)}
          >
            IQC Master Selection
            {intermediateDraft.masterIds.length > 0 ? (
              <span className="ml-1.5 rounded-none bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-amber-900">
                {intermediateDraft.masterIds.length}
              </span>
            ) : null}
          </Button>
        </div>
      </div>
    )
  }

  const renderIntermediateFormDialog = () => (
    <Dialog
      open={intermediateDetailsOpen}
      onOpenChange={(open) => {
        setIntermediateDetailsOpen(open)
        if (open && !form.lastIntermediateCheckDate.trim()) {
          onChange({ ...form, lastIntermediateCheckDate: todayIsoDate() })
        }
      }}
    >
      <DialogContent
        persistOnFocusLoss
        layer="nested"
        overlayClassName="lg:inset-y-0 lg:left-[268px] lg:right-0 lg:w-auto"
        className={cn(
          limsDialogClass,
          '!flex h-[100dvh] max-h-[100dvh] w-full max-w-none translate-x-0 translate-y-0 flex-col gap-0 overflow-hidden p-0',
          'left-0 top-0',
          'lg:left-[268px] lg:w-[calc(100vw-268px)] lg:max-w-[calc(100vw-268px)]',
        )}
        aria-describedby={undefined}
      >
        <div className="relative shrink-0 overflow-hidden bg-gradient-to-br from-stone-800 via-stone-900 to-stone-950 px-4 py-2.5 text-white sm:px-5 sm:py-3">
          <div
            className="pointer-events-none absolute inset-0 opacity-[0.18]"
            style={limsDarkBarGlowStyle}
          />
          <div className="absolute bottom-0 left-0 h-[2px] w-full bg-gradient-to-r from-amber-500 via-amber-300 to-transparent" />
          <DialogHeader className="relative pr-10 text-left">
            <DialogTitle className="text-base font-semibold tracking-tight text-white sm:text-lg">
              Intermediate Check Form
            </DialogTitle>
          </DialogHeader>
        </div>
        <div
          className={cn(
            'min-h-0 flex-1 overflow-y-auto overflow-x-hidden bg-gradient-to-b from-stone-100/80 to-white px-4 py-4 sm:px-6 sm:py-5',
            labRegistryFormClass,
          )}
        >
          {renderIntermediateCheckFormBody('dialog')}
        </div>
        <DialogFooter className="shrink-0 gap-2 border-t border-stone-300 bg-white px-4 py-3 sm:px-6">
          <Button
            type="button"
            className={limsPrimaryBtnClass}
            disabled={saveLoading}
            onClick={() => {
              onSave()
              setIntermediateDetailsOpen(false)
            }}
          >
            {saveLoading ? 'Saving…' : 'Save & Close'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )

  const renderIntermediateSetupDialogs = () => (
    <>
      <CalibrationPointsTableSetupDialog
        open={icEnvSetupOpen}
        onOpenChange={setIcEnvSetupOpen}
        title="Environment Condition"
        layer="stacked"
        columns={
          intermediateDraft.envColumns.length > 0
            ? intermediateDraft.envColumns
            : [
                emptyCalibrationPointsColumn('Temperature (°C)', 'number'),
                emptyCalibrationPointsColumn('Humidity (% RH)', 'number'),
              ]
        }
        rows={intermediateDraft.envRows}
        onApply={(columns, rows) =>
          setIntermediateDraft({ ...intermediateDraft, envColumns: columns, envRows: rows })
        }
      />
      <CalibrationPointsTableSetupDialog
        open={icCheckSetupOpen}
        onOpenChange={setIcCheckSetupOpen}
        title="Check Point Table"
        layer="stacked"
        columns={
          intermediateDraft.checkColumns.length > 0
            ? intermediateDraft.checkColumns
            : [emptyCalibrationPointsColumn('', 'number')]
        }
        rows={intermediateDraft.checkRows}
        onApply={(columns, rows) =>
          setIntermediateDraft({
            ...intermediateDraft,
            checkColumns: columns,
            checkRows: rows,
            readings: readingsFromCheckTable(columns, rows),
          })
        }
      />
      <IqcMasterSelectionDialog
        open={icIqcSetupOpen}
        onOpenChange={setIcIqcSetupOpen}
        masters={iqcMasters ?? []}
        selectedIds={intermediateDraft.masterIds}
        onSelectedIdsChange={(masterIds) =>
          setIntermediateDraft({ ...intermediateDraft, masterIds })
        }
      />
    </>
  )

  const renderConductIntermediateCheck = () => (
    <ConductIntermediateCheckDialog
      open={conductIntermediateCheckOpen}
      onOpenChange={(open) => {
        setConductIntermediateCheckOpen(open)
        if (!open) setIntermediateCompleteMessage(null)
      }}
      layer="stacked"
      equipmentName={form.equipmentName}
      assetCode={form.assetCode}
      acceptanceCriteria={
        [form.accuracyAcceptanceCriteria, form.accuracyAcceptanceCriteriaUnit]
          .map((part) => String(part ?? '').trim())
          .filter(Boolean)
          .join(' ')
      }
      onComplete={handleCompleteIntermediateCheck}
      onEnvironmentCondition={ensureDefaultEnvTable}
    >
      <IntermediateCheckCalculator
        draft={intermediateDraft}
        onDraftChange={setIntermediateDraft}
        acceptanceCriteria={
          [form.accuracyAcceptanceCriteria, form.accuracyAcceptanceCriteriaUnit]
            .map((part) => String(part ?? '').trim())
            .filter(Boolean)
            .join(' ')
        }
        masterEquipment={iqcMasters ?? []}
        message={intermediateCompleteMessage}
      />
    </ConductIntermediateCheckDialog>
  )

  const currentIntermediateMasterSnapshots = useMemo(
    () => buildIntermediateCheckMasterSnapshots(parsedMasters, iqcMasters ?? []),
    [parsedMasters, iqcMasters],
  )

  const renderIntermediateCheckHistoryDialog = () => (
    <IntermediateCheckHistoryDialog
      open={intermediateHistoryViewOpen}
      onOpenChange={setIntermediateHistoryViewOpen}
      equipmentName={form.equipmentName}
      assetCode={form.assetCode}
      history={form.intermediateCheckHistory}
      currentLastDate={form.lastIntermediateCheckDate}
      currentDoneByName={intermediateDoneByName}
      currentStatus={currentIntermediatePayload.status}
      currentSummary={currentIntermediatePayload.summaryLine}
      currentReadings={currentIntermediatePayload.readings}
      currentTemperature={parsedTemperature}
      currentHumidity={parsedHumidity}
      currentMasters={currentIntermediateMasterSnapshots}
      currentNextDueDate={form.nextIntermediateCheckDate}
      acceptanceCriteria={form.accuracyAcceptanceCriteria}
    />
  )

  const renderIntermediateCheckCalculator = () => {
    return (
      <div className="space-y-3">
        <Label className="text-xs font-semibold text-slate-700">Intermediate Check Perform</Label>

        {intermediateCompleteMessage ? (
          <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            {intermediateCompleteMessage}
          </div>
        ) : null}
        
        {isLegacy && (
          <div className="p-2 border border-amber-200 bg-amber-50 rounded-md text-[11px] text-amber-800 space-y-1">
            <div className="font-semibold text-xs">Legacy Result Data:</div>
            <div className="font-mono text-[10px] whitespace-pre-wrap">{form.intermediateCheckResult}</div>
            <div className="text-[9px] text-amber-600">
              * Performing a new calculation below will replace this legacy text.
            </div>
          </div>
        )}

        <div className="space-y-4 border border-slate-200 rounded-lg p-3 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b pb-2 text-xs">
            <span className="font-bold text-slate-700 uppercase">Interactive Check Layout (ISO 17025)</span>
            <span className="text-muted-foreground text-[11px]">
              Criteria: <strong className="text-foreground">{form.accuracyAcceptanceCriteria || 'None'}</strong>
            </span>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 items-start">
            <div className="space-y-1.5">
              <Label htmlFor="eq-check-temperature" className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                Temperature (°C)
              </Label>
              <Input
                id="eq-check-temperature"
                type="text"
                inputMode="decimal"
                placeholder="e.g. 23.5"
                value={parsedTemperature || DEFAULT_INTERMEDIATE_TEMPERATURE}
                onChange={(e) =>
                  handleUpdateCheck(
                    parsedReadings,
                    undefined,
                    undefined,
                    undefined,
                    undefined,
                    e.target.value,
                  )
                }
                className="h-9 text-xs"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="eq-check-humidity" className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                Humidity (% RH)
              </Label>
              <Input
                id="eq-check-humidity"
                type="text"
                inputMode="decimal"
                placeholder="e.g. 55"
                value={parsedHumidity || DEFAULT_INTERMEDIATE_HUMIDITY}
                onChange={(e) =>
                  handleUpdateCheck(
                    parsedReadings,
                    undefined,
                    undefined,
                    undefined,
                    undefined,
                    undefined,
                    e.target.value,
                  )
                }
                className="h-9 text-xs"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                Master Standard(s) Used (IQC Masters)
              </Label>
              <IqcMasterSearchSelect
                iqcMasters={iqcMasters ?? []}
                selectedMasterIds={parsedMasters}
                onSelectedMasterIdsChange={(ids) =>
                  handleUpdateCheck(parsedReadings, undefined, ids)
                }
              />
            </div>
          </div>

          {parsedMasters.length > 0 && iqcMasters ? (
            <div className="space-y-2 bg-slate-50 p-3 rounded-lg border border-slate-150">
              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500 border-b border-slate-200 pb-1">
                Selected Master Details (Intermediate Check Related)
              </div>
                {parsedMasters.map((id) => {
                  const eq = iqcMasters.find((e) => e.id === id)
                  if (!eq) return null
                  const isOverdue =
                    eq.next_calibration_due && new Date(eq.next_calibration_due) < new Date()
                  const calPoints = Array.isArray(eq.calibration_points) ? eq.calibration_points : []
                  return (
                    <div
                      key={id}
                      className="rounded-md border border-slate-200 bg-white p-2.5 space-y-2 text-[11px]"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div>
                          <div className="font-semibold text-slate-800">{eq.equipment_name}</div>
                          <div className="font-mono text-[10px] text-muted-foreground">{eq.asset_code}</div>
                        </div>
                        <div className="flex flex-col items-end gap-1">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-7 px-2 text-[10px] text-destructive border-destructive/30 hover:bg-destructive/5"
                            onClick={() =>
                              handleUpdateCheck(
                                parsedReadings,
                                undefined,
                                parsedMasters.filter((masterId) => masterId !== id),
                              )
                            }
                          >
                            Deselect
                          </Button>
                          <span
                            className={
                              isOverdue
                                ? 'text-rose-600 font-bold text-[10px]'
                                : 'text-slate-500 text-[10px]'
                            }
                          >
                            {eq.next_calibration_due
                              ? `Cal Due: ${formatDate(eq.next_calibration_due)}${isOverdue ? ' (Overdue!)' : ''}`
                              : 'No Calibration Due Date'}
                          </span>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[10px] text-slate-600 sm:grid-cols-3">
                        <div>
                          <span className="text-muted-foreground">Range / Capacity: </span>
                          {eq.range_capacity || '-'}
                        </div>
                        <div>
                          <span className="text-muted-foreground">Resolution: </span>
                          {eq.resolution_least_count || '-'}
                        </div>
                        <div>
                          <span className="text-muted-foreground">Acceptance Criteria: </span>
                          {eq.accuracy_acceptance_criteria || '-'}
                        </div>
                        <div>
                          <span className="text-muted-foreground">Cal Frequency: </span>
                          {eq.calibration_frequency || '-'}
                        </div>
                        <div>
                          <span className="text-muted-foreground">Last Calibration: </span>
                          {eq.last_calibration_date
                            ? formatDate(eq.last_calibration_date)
                            : '-'}
                        </div>
                        <div>
                          <span className="text-muted-foreground">Certificate No: </span>
                          {eq.calibration_certificate_number || '-'}
                        </div>
                      </div>

                      {calPoints.length > 0 ? (
                        <div className="overflow-x-auto rounded border border-slate-100">
                          <table className="w-full text-left text-[10px] border-collapse">
                            <thead>
                              <tr className="bg-slate-50 text-slate-500 font-semibold uppercase border-b">
                                <th className="py-1 px-1.5">Nominal / Std</th>
                                <th className="py-1 px-1.5">Actual / Certified</th>
                                <th className="py-1 px-1.5">Correction</th>
                                <th className="py-1 px-1.5">Uncertainty</th>
                                <th className="py-1 px-1.5 text-right">Actions</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                              {calPoints.map((pt: { id?: string; nominalValue?: string; actualValue?: string; correction?: string; uncertainty?: string }, ptIdx: number) => (
                                <tr key={pt.id || ptIdx}>
                                  <td className="py-1 px-1.5 font-mono">{pt.nominalValue || '-'}</td>
                                  <td className="py-1 px-1.5 font-mono">{pt.actualValue || '-'}</td>
                                  <td className="py-1 px-1.5 font-mono text-slate-600">{pt.correction || '-'}</td>
                                  <td className="py-1 px-1.5 font-mono text-slate-600">
                                    {pt.uncertainty ? `±${pt.uncertainty}` : '-'}
                                  </td>
                                  <td className="py-1 px-1.5 text-right">
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="sm"
                                      className="h-5 px-1.5 text-[9px] font-semibold text-primary hover:bg-slate-100"
                                      onClick={() => {
                                        const emptyIdx = parsedReadings.findIndex(
                                          (r) => !r.checkPointValue && !r.std && !r.obs,
                                        )
                                        let nextReadings = [...parsedReadings]
                                        if (emptyIdx >= 0) {
                                          nextReadings[emptyIdx] = {
                                            checkPointValue: pt.nominalValue || '',
                                            std: pt.nominalValue || '',
                                            obs: pt.actualValue || '',
                                          }
                                        } else {
                                          nextReadings.push({
                                            checkPointValue: pt.nominalValue || '',
                                            std: pt.nominalValue || '',
                                            obs: pt.actualValue || '',
                                          })
                                        }
                                        handleUpdateCheck(nextReadings)
                                      }}
                                    >
                                      Use Reading
                                    </Button>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      ) : (
                        <p className="text-[10px] text-muted-foreground">No calibration points recorded for this master.</p>
                      )}
                    </div>
                  )
                })}
            </div>
          ) : null}

          {(() => {
            const criteriaUnit = extractAcceptanceCriteriaUnit(
              form.accuracyAcceptanceCriteria,
              parsedUnit,
            )
            const readingMultiplier = parseFloat(parsedConversionMultiplier) || 1

            return (
          <div className="overflow-x-auto max-h-[200px] overflow-y-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-200 text-muted-foreground font-semibold text-[10px] uppercase bg-slate-50/50">
                  <th className="py-1.5 px-2 w-[5%]">#</th>
                  <th className="py-1.5 px-2 w-[22%] text-center">Check Point</th>
                  <th className="py-1.5 px-2 w-[20%] text-center">Std Value</th>
                  <th className="py-1.5 px-2 w-[20%] text-center">Obs Value</th>
                  <th className="py-1.5 px-2 w-[18%] text-center">
                    Error{criteriaUnit ? ` (${criteriaUnit})` : ''}
                  </th>
                  <th className="py-1.5 px-2 w-[7%]"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {parsedReadings.map((r, idx) => {
                  const limitNum = defaultLimit
                  const errValue = calcIntermediateCheckError(r.std, r.obs, readingMultiplier)
                  
                  let errText = '-'
                  let isPass = true
                  
                  if (errValue !== null) {
                    errText = formatIntermediateCheckError(errValue, criteriaUnit)
                    if (limitNum !== null) {
                      isPass = errValue <= limitNum
                    }
                  }
                  
                  const isLastRow = idx === parsedReadings.length - 1
                  
                  return (
                    <tr key={idx} className="group hover:bg-slate-50/50">
                      <td className="py-1.5 px-2 text-slate-500 font-mono align-middle">{idx + 1}</td>
                      <td className="py-0.5 px-1 align-middle text-center">
                        <Input
                          type="text"
                          placeholder="Check Point"
                          value={r.checkPointValue}
                          onChange={(e) => {
                            const newR = [...parsedReadings]
                            newR[idx] = { ...newR[idx], checkPointValue: e.target.value }
                            handleUpdateCheck(newR)
                          }}
                          className="h-7 text-xs py-0.5 px-2 text-center"
                        />
                      </td>
                      <td className="py-0.5 px-1 align-middle text-center">
                        <Input
                          type="text"
                          placeholder="Std"
                          value={r.std}
                          onChange={(e) => {
                            const newR = [...parsedReadings]
                            newR[idx] = { ...newR[idx], std: e.target.value }
                            handleUpdateCheck(newR)
                          }}
                          className="h-7 text-xs py-0.5 px-2 text-center"
                        />
                      </td>
                      <td className="py-0.5 px-1 align-middle text-center">
                        <Input
                          type="text"
                          placeholder="Obs"
                          value={r.obs}
                          onChange={(e) => {
                            const newR = [...parsedReadings]
                            newR[idx] = { ...newR[idx], obs: e.target.value }
                            handleUpdateCheck(newR)
                          }}
                          className="h-7 text-xs py-0.5 px-2 text-center"
                        />
                      </td>
                      <td className="py-1.5 text-center align-middle">
                        {errValue !== null ? (
                          <div className="space-y-0.5">
                            <div className="font-mono font-medium text-slate-700 text-[11px]">{errText}</div>
                            {isPass ? (
                              <span className="inline-flex items-center font-semibold text-emerald-600 bg-emerald-50 px-1 py-0.5 rounded text-[9px]">
                                Pass
                              </span>
                            ) : (
                              <span className="inline-flex items-center font-semibold text-rose-600 bg-rose-50 px-1 py-0.5 rounded text-[9px]">
                                Fail
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-slate-350 text-[10px]">-</span>
                        )}
                      </td>
                      <td className="py-0.5 pl-1 align-middle text-right">
                        <div className="flex items-center justify-end gap-0.5">
                          {!isLastRow && parsedReadings.length > 1 ? (
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6 text-destructive hover:bg-rose-50"
                              aria-label="Delete reading"
                              onClick={() => {
                                const newR = parsedReadings.filter((_, i) => i !== idx)
                                handleUpdateCheck(newR)
                              }}
                            >
                              <Trash2 size={10} />
                            </Button>
                          ) : null}
                          {isLastRow ? (
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6 text-primary hover:bg-primary/10"
                              aria-label="Add reading"
                              onClick={() => {
                                const newR = [...parsedReadings, emptyIntermediateCheckReading()]
                                handleUpdateCheck(newR)
                              }}
                            >
                              <Plus size={12} />
                            </Button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
              
              {parsedReadings.some((r) => calcIntermediateCheckError(r.std, r.obs, readingMultiplier) !== null) && (
                <tfoot className="border-t border-slate-200 bg-slate-50/40 text-[11px] text-slate-700">
                  <tr>
                    <td colSpan={4} className="py-2 px-2 font-semibold text-right">Combined Error (RSS):</td>
                    <td className="py-2 text-center font-mono font-bold text-primary">
                      {formatIntermediateCheckError(
                        (() => {
                        let sumSq = 0
                        parsedReadings.forEach((r) => {
                          const err = calcIntermediateCheckError(r.std, r.obs, readingMultiplier)
                          if (err !== null) sumSq += err * err
                        })
                        return Math.sqrt(sumSq)
                      })(),
                        criteriaUnit,
                      )}
                    </td>
                    <td></td>
                  </tr>
                  <tr>
                    <td colSpan={4} className="py-1 px-2 font-semibold text-right">Max Error:</td>
                    <td className="py-1 text-center font-mono font-semibold">
                      {formatIntermediateCheckError(
                        (() => {
                        let maxE = 0
                        parsedReadings.forEach((r) => {
                          const err = calcIntermediateCheckError(r.std, r.obs, readingMultiplier)
                          if (err !== null && err > maxE) maxE = err
                        })
                        return maxE
                      })(),
                        criteriaUnit,
                      )}
                    </td>
                    <td></td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
            )
          })()}

          {/* Action and Summary */}
          <div className="flex items-center justify-between border-t pt-2 mt-1">
            <div className="flex items-center gap-1.5 flex-wrap">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className={`h-7 px-2 text-[11px] ${showCalcSteps ? 'bg-slate-100 text-primary font-semibold' : 'text-slate-600 hover:bg-slate-100'}`}
                onClick={() => setShowCalcSteps(p => !p)}
              >
                Steps
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className={`h-7 px-2 text-[11px] ${showCalculator ? 'bg-slate-100 text-primary font-semibold' : 'text-slate-600 hover:bg-slate-100'}`}
                onClick={() => setShowCalculator(p => !p)}
              >
                Calculator
              </Button>
            </div>
            
            {/* Overall Verdict */}
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] text-muted-foreground">Result:</span>
              {(() => {
                let hasValid = false
                let hasFail = false
                const limitNum = defaultLimit
                const readingMultiplier = parseFloat(parsedConversionMultiplier) || 1
                
                parsedReadings.forEach((r) => {
                  const err = calcIntermediateCheckError(r.std, r.obs, readingMultiplier)
                  if (err !== null) {
                    hasValid = true
                    if (limitNum !== null && err > limitNum) {
                      hasFail = true
                    }
                  }
                })
                
                if (!hasValid) {
                  return <span className="text-[10px] font-semibold text-slate-400">No readings</span>
                }
                if (hasFail) {
                  return (
                    <span className="inline-flex items-center gap-1 font-bold text-rose-700 bg-rose-100 border border-rose-200 px-1.5 py-0.2 rounded text-[10px]">
                      <AlertTriangle size={10} /> Unsatisfactory
                    </span>
                  )
                }
                return (
                  <span className="inline-flex items-center gap-1 font-bold text-emerald-700 bg-emerald-100 border border-emerald-200 px-1.5 py-0.2 rounded text-[10px]">
                    <CheckCircle size={10} /> Satisfactory
                  </span>
                )
              })()}
            </div>
          </div>

          {/* Steps panel */}
          {showCalcSteps && (
            <div className="bg-slate-50 border border-slate-200 p-3 rounded-lg text-[11px] text-slate-700 space-y-2 mt-2">
              <div className="font-bold uppercase text-[10px] text-slate-500 border-b pb-1">Calculation Method & Logic</div>
              <div className="space-y-1.5">
                <div>
                  <span className="font-semibold block text-primary">1. Observed Error:</span>
                  <code className="bg-white border px-1 py-0.2 rounded font-mono text-[10px]">Error = |Observed Value - Standard Value| * Multiplier</code>
                  <span className="text-muted-foreground block mt-0.5">Calculates the absolute difference between what the equipment reads and the standard reference scaled by the unit conversion multiplier.</span>
                </div>
                <div>
                  <span className="font-semibold block text-primary">2. Combined Error (RSS):</span>
                  <code className="bg-white border px-1 py-0.2 rounded font-mono text-[10px]">RSS Error = sqrt( sum(Error_i²) )</code>
                  <span className="text-muted-foreground block mt-0.5">Calculates the Root Sum Square (RSS) of errors across all test readings (ISO 17025 combined measurement estimation).</span>
                </div>
                <div>
                  <span className="font-semibold block text-primary">3. Drift Evaluation (En Ratio):</span>
                  <code className="bg-white border px-1 py-0.2 rounded font-mono text-[10px]">E_n = Error / sqrt(U_lab² + U_ref²)</code>
                  <span className="text-muted-foreground block mt-0.5">If enabled, uses uncertainty of the lab and reference master standard to compute the E_n ratio. E_n ≤ 1.0 passes drift criteria.</span>
                </div>
                <div>
                  <span className="font-semibold block text-primary">4. Criteria Evaluation:</span>
                  <span className="text-muted-foreground block">
                    If E_n ratio is disabled: <code className="bg-white border px-1 py-0.2 rounded font-mono text-[10px]">Error ≤ Acceptance Criteria Limit</code> → <strong className="text-emerald-600">Pass</strong><br />
                    If E_n ratio is enabled: <code className="bg-white border px-1 py-0.2 rounded font-mono text-[10px]">E_n Ratio ≤ 1.0</code> → <strong className="text-emerald-600">Pass</strong>
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Calculator panel */}
          {showCalculator && (
            <div className="bg-slate-100 p-3 rounded-lg border border-slate-200 w-[240px] space-y-2 mt-2">
              <div className="text-[10px] font-bold uppercase text-slate-500">Quick Calculator</div>
              <div className="bg-white border rounded p-1.5 text-right font-mono text-sm min-h-[44px] flex flex-col justify-between">
                <div className="text-[10px] text-muted-foreground">{calcInput || '0'}</div>
                <div className="font-bold text-slate-800">{calcResult || '0'}</div>
              </div>
              <div className="grid grid-cols-4 gap-1">
                {['7', '8', '9', '/'].map(btn => (
                  <Button key={btn} type="button" variant="outline" size="sm" className="h-8 text-xs font-semibold p-0" onClick={() => setCalcInput(p => p + btn)}>{btn}</Button>
                ))}
                {['4', '5', '6', '*'].map(btn => (
                  <Button key={btn} type="button" variant="outline" size="sm" className="h-8 text-xs font-semibold p-0" onClick={() => setCalcInput(p => p + btn)}>{btn}</Button>
                ))}
                {['1', '2', '3', '-'].map(btn => (
                  <Button key={btn} type="button" variant="outline" size="sm" className="h-8 text-xs font-semibold p-0" onClick={() => setCalcInput(p => p + btn)}>{btn}</Button>
                ))}
                {['0', '.', '=', '+'].map(btn => (
                  <Button key={btn} type="button" variant="outline" size="sm" className="h-8 text-xs font-semibold p-0" onClick={() => {
                    if (btn === '=') {
                      setCalcResult(safeEvaluate(calcInput))
                    } else {
                      setCalcInput(p => p + btn)
                    }
                  }}>{btn}</Button>
                ))}
                <Button type="button" variant="destructive" size="sm" className="h-8 text-xs font-semibold col-span-2 p-0" onClick={() => { setCalcInput(''); setCalcResult(''); }}>Clear</Button>
                <Button type="button" variant="secondary" size="sm" className="h-8 text-xs font-semibold col-span-2 p-0" onClick={() => setCalcInput(p => p.slice(0, -1))}>Back</Button>
              </div>
            </div>
          )}
        </div>
      </div>
    )
  }

  // Handle auto calculation of Next Calibration Due when Last Calibration Date or Frequency changes
  useEffect(() => {
    const nextDue = calculateNextDueDate(form.lastCalibrationDate, form.calibrationFrequency)
    if (nextDue !== form.nextCalibrationDue) {
      onChange({ ...form, nextCalibrationDue: nextDue })
    }
  }, [form.lastCalibrationDate, form.calibrationFrequency])

  // Handle auto calculation of Next Intermediate Check when Last Check Date or Frequency changes
  useEffect(() => {
    const nextDue = calculateNextDueDate(form.lastIntermediateCheckDate, form.intermediateCheckFrequency)
    if (nextDue !== form.nextIntermediateCheckDate) {
      onChange({ ...form, nextIntermediateCheckDate: nextDue })
    }
  }, [form.lastIntermediateCheckDate, form.intermediateCheckFrequency])

  // Handle auto calculation of Next Maintenance Date when Last Maintenance Date or Frequency changes
  useEffect(() => {
    const nextDue = calculateNextDueDate(form.lastMaintenanceDate, form.maintenanceScheduleFrequency)
    if (nextDue !== form.nextMaintenanceDate) {
      onChange({ ...form, nextMaintenanceDate: nextDue })
    }
  }, [form.lastMaintenanceDate, form.maintenanceScheduleFrequency])

  // Default frequencies when Applicable and empty
  useEffect(() => {
    const patch: Partial<EquipmentForm> = {}
    if (calApplicable === 'applicable' && !form.calibrationFrequency) {
      patch.calibrationFrequency = 'Yearly'
      if (!form.calibrationCoverageFactor) patch.calibrationCoverageFactor = '2'
    }
    if (intermediateApplicable === 'applicable' && !form.intermediateCheckFrequency) {
      patch.intermediateCheckFrequency = 'Quarterly'
    }
    if (maintApplicable === 'applicable' && !form.maintenanceScheduleFrequency) {
      patch.maintenanceScheduleFrequency = 'Quarterly'
    }
    if (Object.keys(patch).length === 0) return
    onChange({ ...form, ...patch })
  }, [
    calApplicable,
    intermediateApplicable,
    maintApplicable,
    form.calibrationFrequency,
    form.intermediateCheckFrequency,
    form.maintenanceScheduleFrequency,
  ])

  // Default calibration Frequency=Yearly when opening Calibration section
  useEffect(() => {
    if (activeSection !== 'calibration') return
    const nextFrequency = form.calibrationFrequency || 'Yearly'
    if (
      nextFrequency === form.calibrationFrequency &&
      form.calibrationCoverageFactor
    ) {
      return
    }
    onChange({
      ...form,
      calibrationFrequency: nextFrequency,
      calibrationCoverageFactor: form.calibrationCoverageFactor || '2',
    })
  }, [activeSection])

  // Default Intermediate Check Frequency + Last Check date when opening Intermediate section
  useEffect(() => {
    if (activeSection !== 'intermediate') return
    const nextFrequency = form.intermediateCheckFrequency || 'Quarterly'
    const nextLast = form.lastIntermediateCheckDate.trim() || todayIsoDate()
    if (
      nextFrequency === form.intermediateCheckFrequency &&
      nextLast === form.lastIntermediateCheckDate
    ) {
      return
    }
    onChange({
      ...form,
      intermediateCheckFrequency: nextFrequency,
      lastIntermediateCheckDate: nextLast,
    })
  }, [activeSection])

  useEffect(() => {
    if (activeSection) {
      const timer = setTimeout(() => {
        const element = document.getElementById(`section-${activeSection}`)
        if (element) {
          element.scrollIntoView({ behavior: 'smooth', block: 'center' })
          element.classList.add('ring-2', 'ring-primary', 'ring-offset-2', 'scale-[1.02]', 'shadow-md')
          setTimeout(() => {
            element.classList.remove('ring-2', 'ring-primary', 'ring-offset-2', 'scale-[1.02]', 'shadow-md')
          }, 2000)
        }
      }, 300)
      return () => clearTimeout(timer)
    }
  }, [activeSection])

  const handleFileChange = (field: 'certificateFile' | 'manualSopFile', file: File | null) => {
    onChange({ ...form, [field]: file })
  }

  if (activeSection) {
    let sectionTitle = 'Calibration'
    let sectionContent = null

    if (activeSection === 'calibration') {
      sectionTitle = 'Calibration Details'
      sectionContent = (
        <div className="space-y-4">
          {renderCalibrationFormFields('section')}
        </div>
      )
    } else if (activeSection === 'intermediate') {
      sectionTitle = 'Intermediate Check Details'
      sectionContent = renderIntermediateCheckFormBody('section')
    } else if (activeSection === 'maintenance') {
      sectionTitle = 'Maintenance'
      sectionContent = (
        <div className="space-y-3">
          {renderMaintenanceScheduleRow(
            { last: 'eq-last-maint-section', next: 'eq-next-maint-section' },
            'text-xs font-semibold',
          )}
        </div>
      )
    }

    return (
      <Card className="border-0 bg-transparent shadow-none">
        <CardContent className={cn('space-y-4 p-0', labRegistryFormClass)}>
          <div>
            <h3 className="mb-2 text-[11px] font-bold uppercase tracking-[0.14em] text-amber-900">
              {sectionTitle}
            </h3>
            {sectionContent}
          </div>
        </CardContent>
        <CardFooter className="-mx-4 mt-4 flex items-center justify-end gap-2 border-t border-stone-300 bg-stone-50 px-4 py-3 sm:-mx-6 sm:px-6">
          <Button
            type="button"
            onClick={onSave}
            disabled={!canSave || saveLoading}
            className={cn(limsPrimaryBtnClass, 'min-w-[8.5rem]')}
          >
            {saveLoading ? 'Saving…' : 'Save & Close'}
          </Button>
        </CardFooter>
        <ConductMaintenanceDialog
          open={conductMaintenanceOpen}
          onOpenChange={setConductMaintenanceOpen}
          equipmentName={form.equipmentName}
          assetCode={form.assetCode}
          manufacturer={form.manufacturer}
          modelNumber={form.modelNumber}
          rangeCapacity={form.rangeCapacity}
          initialChecklist={form.maintenanceChecklist}
          maintenanceHistory={form.maintenanceHistory}
          lastMaintenanceDate={form.lastMaintenanceDate}
          nextMaintenanceDate={form.nextMaintenanceDate}
          maintenanceDoneBy={effectiveMaintenanceDoneBy}
          maintenanceDoneByName={maintenanceDoneByName}
          maintenanceScheduleFrequency={form.maintenanceScheduleFrequency}
          onSaveChecklist={(items) => onChange({ ...form, maintenanceChecklist: items })}
          onCompleteMaintenance={(payload) =>
            onChange({
              ...form,
              maintenanceChecklist: payload.checklist,
              maintenanceHistory: payload.maintenanceHistory,
              lastMaintenanceDate: payload.lastMaintenanceDate,
              nextMaintenanceDate: payload.nextMaintenanceDate,
            })
          }
        />
        {renderConductIntermediateCheck()}
        {renderIntermediateSetupDialogs()}
        {renderMaintenanceScheduleDialog()}
        {renderCalibrationFormDialog()}
        {renderIntermediateFormDialog()}
        {renderMaintenanceHistoryDialog()}
        {renderIntermediateCheckHistoryDialog()}
      </Card>
    )
  }

  return (
    <Card className="border-0 bg-transparent shadow-none">
      <CardContent
        className={cn(
          'space-y-5 p-0',
          labRegistryFormClass,
          readOnly &&
            'pointer-events-none select-text [&_[data-readonly-action]]:pointer-events-auto',
        )}
      >
        <div className="space-y-4">
          <section className={cn(limsPanelClass, "p-4")}>
            <h3 className="mb-3 border-b border-amber-700/25 pb-2 text-[11px] font-bold uppercase tracking-[0.14em] text-amber-800">
              Equipment Identity
            </h3>
            <div className="grid grid-cols-12 gap-3">
            <div className="col-span-12 space-y-0.5 md:col-span-4">
              <Label htmlFor="eq-id">Equipment ID / Asset Code *</Label>
              <Input
                id="eq-id"
                value={form.assetCode}
                onChange={(e) =>
                  onChange({ ...form, assetCode: e.target.value.toUpperCase() })
                }
                placeholder="Enter unique asset code"
                className="font-mono font-medium uppercase"
                autoComplete="off"
                required
                aria-required="true"
              />
            </div>

            <div className="col-span-12 space-y-0.5 md:col-span-4">
              <Label htmlFor="eq-name">Equipment Name *</Label>
              <Input
                id="eq-name"
                placeholder="Enter Equipment Name"
                value={form.equipmentName}
                onChange={(e) => onChange({ ...form, equipmentName: e.target.value })}
              />
            </div>

            <div className="col-span-12 space-y-0.5 md:col-span-4">
              <Label htmlFor="eq-status">Equipment Status</Label>
              <Select
                value={form.equipmentStatus}
                onValueChange={(v) => onChange({ ...form, equipmentStatus: v as EquipmentStatus })}
              >
                <SelectTrigger id="eq-status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Active">Active</SelectItem>
                  <SelectItem value="In Repair">In Repair</SelectItem>
                  <SelectItem value="Idle">Idle</SelectItem>
                </SelectContent>
              </Select>
            </div>
            </div>
          </section>

          <section className={cn(limsPanelClass, "p-4")}>
            <h3 className="mb-3 border-b border-amber-700/25 pb-2 text-[11px] font-bold uppercase tracking-[0.14em] text-amber-800">
              Identification & Custodian
            </h3>
            <div className="grid grid-cols-12 gap-3">
            <div className="col-span-12 space-y-0.5 md:col-span-3">
              <Label htmlFor="eq-make">Manufacturer / Make</Label>
              <Input
                id="eq-make"
                placeholder="Make"
                value={form.manufacturer}
                onChange={(e) => onChange({ ...form, manufacturer: e.target.value })}
              />
            </div>

            <div className="col-span-12 space-y-0.5 md:col-span-3">
              <Label htmlFor="eq-model">Model Number</Label>
              <Input
                id="eq-model"
                placeholder="Model"
                value={form.modelNumber}
                onChange={(e) => onChange({ ...form, modelNumber: e.target.value })}
              />
            </div>

            <div className="col-span-12 space-y-0.5 md:col-span-3">
              <Label htmlFor="eq-serial">Serial Number</Label>
              <Input
                id="eq-serial"
                placeholder="Serial No"
                value={form.serialNumber}
                onChange={(e) => onChange({ ...form, serialNumber: e.target.value })}
              />
            </div>

            <div className="col-span-12 space-y-0.5 md:col-span-3">
              <Label htmlFor="eq-custodian">Custodian / In-charge</Label>
              <FilterCombobox
                inputId="eq-custodian"
                listId="eq-custodian-list"
                value={custodianOpen ? custodianQuery : selectedCustodianLabel}
                onValueChange={(v) => {
                  setCustodianQuery(v)
                  if (!custodianOpen) setCustodianOpen(true)
                  if (!v.trim()) {
                    applyCustodianSelection('')
                  }
                }}
                options={filteredCustodianOptions}
                onSelectOption={(opt) => {
                  applyCustodianSelection(opt.id)
                  setCustodianQuery(opt.label)
                  setCustodianOpen(false)
                }}
                open={custodianOpen}
                onOpenChange={(open) => {
                  setCustodianOpen(open)
                  if (open) setCustodianQuery(selectedCustodianLabel)
                }}
                placeholder="Type to search employee…"
              />
            </div>
            </div>
          </section>

          <section className={cn(limsPanelClass, "p-4")}>
            <h3 className="mb-3 border-b border-amber-700/25 pb-2 text-[11px] font-bold uppercase tracking-[0.14em] text-amber-800">
              Purchase & Location
            </h3>
            <div className="grid grid-cols-12 gap-3">
            <div className="col-span-12 md:col-span-3 space-y-1.5">
              <Label htmlFor="eq-purchase-date" >Date of Purchased</Label>
              <Input
                id="eq-purchase-date"
                type="date"
                value={form.dateOfPurchase}
                onChange={(e) => onChange({ ...form, dateOfPurchase: e.target.value })}
              />
            </div>

            <div className="col-span-12 md:col-span-3 space-y-1.5">
              <Label htmlFor="eq-service-date" >Date Placed in Service</Label>
              <Input
                id="eq-service-date"
                type="date"
                value={form.datePlacedInService}
                onChange={(e) => onChange({ ...form, datePlacedInService: e.target.value })}
              />
            </div>

            <div className="col-span-12 space-y-0.5 md:col-span-3">
              <Label>Purchase From</Label>
              <LimsFieldWithAdd
                addButton={
                  <LimsFieldAddButton
                    aria-label="Add new supplier client"
                    title="Add New Client"
                    onClick={() => onAddNewClientClick('purchasedFrom')}
                  />
                }
              >
                <ClientSearchSelect
                  value={form.purchasedFrom}
                  onValueChange={(v) => onChange({ ...form, purchasedFrom: v })}
                  options={clients}
                  placeholder="Type to search supplier…"
                />
              </LimsFieldWithAdd>
            </div>

            <div className="col-span-12 space-y-0.5 md:col-span-3">
              <LocationFieldWithAdd
                inputId="eq-location"
                listId="eq-location-list"
                label="Current Location"
                value={form.currentLocation}
                onChange={(currentLocation) => onChange({ ...form, currentLocation })}
              />
            </div>
            </div>
          </section>

          <section className={cn(limsPanelClass, "p-4")}>
            <h3 className="mb-3 border-b border-amber-700/25 pb-2 text-[11px] font-bold uppercase tracking-[0.14em] text-amber-800">
              Technical Specifications
            </h3>
            <div className="grid grid-cols-12 gap-3">
            <div className="col-span-12 space-y-0.5 md:col-span-4">
              <Label htmlFor="eq-range">Range / Capacity</Label>
              <div className={limsFieldWithAddShellClass}>
                <Input
                  id="eq-range"
                  placeholder="Value"
                  aria-label="Range / capacity value"
                  value={form.rangeCapacity}
                  onChange={(e) => onChange({ ...form, rangeCapacity: e.target.value })}
                  className="h-full min-w-0 flex-1 rounded-none border-0 bg-transparent px-2 shadow-none focus-visible:ring-0"
                />
                <div className="min-w-0 flex-1 border-l border-stone-500">
                  <MeasurementUnitSelect
                    id="eq-range-unit"
                    value={form.rangeCapacityUnit}
                    onChange={(rangeCapacityUnit) => onChange({ ...form, rangeCapacityUnit })}
                    showLabel={false}
                    showManageButton
                    placeholder="Unit"
                    className="min-w-0"
                    shellClassName="h-full border-0 focus-within:border-transparent focus-within:ring-0"
                    inputClassName="px-2"
                  />
                </div>
              </div>
            </div>

            <div className="col-span-12 space-y-0.5 md:col-span-4">
              <Label htmlFor="eq-resolution">Resolution / Least Count</Label>
              <div className={limsFieldWithAddShellClass}>
                <Input
                  id="eq-resolution"
                  placeholder="Value"
                  aria-label="Resolution / least count value"
                  value={form.resolutionLeastCount}
                  onChange={(e) => onChange({ ...form, resolutionLeastCount: e.target.value })}
                  className="h-full min-w-0 flex-1 rounded-none border-0 bg-transparent px-2 shadow-none focus-visible:ring-0"
                />
                <div className="min-w-0 flex-1 border-l border-stone-500">
                  <MeasurementUnitSelect
                    id="eq-resolution-unit"
                    value={form.resolutionLeastCountUnit}
                    onChange={(resolutionLeastCountUnit) =>
                      onChange({ ...form, resolutionLeastCountUnit })
                    }
                    showLabel={false}
                    showManageButton
                    placeholder="Unit"
                    className="min-w-0"
                    shellClassName="h-full border-0 focus-within:border-transparent focus-within:ring-0"
                    inputClassName="px-2"
                  />
                </div>
              </div>
            </div>

            <div className="col-span-12 space-y-0.5 md:col-span-4">
              <Label htmlFor="eq-accuracy">Acceptance Criteria</Label>
              <div className={limsFieldWithAddShellClass}>
                <Input
                  id="eq-accuracy"
                  placeholder="Value"
                  aria-label="Acceptance criteria value"
                  value={form.accuracyAcceptanceCriteria}
                  onChange={(e) =>
                    onChange({ ...form, accuracyAcceptanceCriteria: e.target.value })
                  }
                  className="h-full min-w-0 flex-1 rounded-none border-0 bg-transparent px-2 shadow-none focus-visible:ring-0"
                />
                <div className="min-w-0 flex-1 border-l border-stone-500">
                  <MeasurementUnitSelect
                    id="eq-accuracy-unit"
                    value={form.accuracyAcceptanceCriteriaUnit}
                    onChange={(accuracyAcceptanceCriteriaUnit) =>
                      onChange({ ...form, accuracyAcceptanceCriteriaUnit })
                    }
                    showLabel={false}
                    showManageButton
                    placeholder="Unit"
                    className="min-w-0"
                    shellClassName="h-full border-0 focus-within:border-transparent focus-within:ring-0"
                    inputClassName="px-2"
                  />
                </div>
              </div>
            </div>

            </div>
          </section>

            {/* Calibration / Intermediate / Maintenance — hidden on name-link details view */}
            {!hideScheduleSections ? (
              <section className={cn(limsPanelClass, "p-4")}>
            <h3 className="mb-3 border-b border-amber-700/25 pb-2 text-[11px] font-bold uppercase tracking-[0.14em] text-amber-800">
              Schedule Applicability
            </h3>
            <div className="grid grid-cols-12 gap-3">
            <div id="section-calibration" className="col-span-12 space-y-3 md:col-span-4">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">Calibration</h4>

              <div className="space-y-1.5">
                <div className="flex items-center gap-2">
                  <Select
                    value={calApplicable}
                    onValueChange={(v) => {
                      setCalApplicable(v as 'applicable' | 'not-applicable')
                      if (v === 'not-applicable') {
                        setCalDetailsOpen(false)
                        onChange({
                          ...form,
                          calibrationFrequency: '',
                          lastCalibrationDate: '',
                          nextCalibrationDue: '',
                          calibrationCertificateNumber: '',
                          calibrationCertificateUncertainty: '',
                          calibrationUncertaintyUnit: '',
                          calibrationCoverageFactor: '',
                          externalCalibrationAgency: '',
                          certificateFile: null,
                          uploadCertificatePath: '',
                        })
                      } else {
                        onChange({
                          ...form,
                          calibrationFrequency: form.calibrationFrequency || 'Yearly',
                          calibrationCoverageFactor: form.calibrationCoverageFactor || '2',
                        })
                      }
                    }}
                  >
                    <SelectTrigger className="min-w-0 flex-1 bg-white border-slate-200">
                      <SelectValue placeholder="Select Status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="applicable">Applicable</SelectItem>
                      <SelectItem value="not-applicable">Not Applicable</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button
                    type="button"
                    variant="outline"
                    className={cn('h-8 shrink-0 gap-1.5 px-3', limsOutlineBtnClass)}
                    disabled={calApplicable !== 'applicable'}
                    aria-disabled={calApplicable !== 'applicable'}
                    title={
                      calApplicable === 'applicable'
                        ? 'Open Calibration form'
                        : 'Set status to Applicable to open the form'
                    }
                    aria-label={
                      calApplicable === 'applicable'
                        ? 'Open Calibration form'
                        : 'Open Calibration form (disabled when Not Applicable)'
                    }
                    onClick={openCalibrationForm}
                  >
                    <ClipboardCheck size={14} />
                    Open Form
                  </Button>
                </div>
              </div>
            </div>

            {/* Intermediate Check details */}
            <div id="section-intermediate" className="col-span-12 space-y-3 md:col-span-4">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                Intermediate Check
              </h4>

              <div className="space-y-1.5">
                <div className="flex items-center gap-2">
                  <Select
                    value={intermediateApplicable}
                    onValueChange={(v) => {
                      setIntermediateApplicable(v as 'applicable' | 'not-applicable')
                      if (v === 'not-applicable') {
                        setIntermediateDetailsOpen(false)
                        onChange({
                          ...form,
                          intermediateCheckFrequency: '',
                          lastIntermediateCheckDate: '',
                          nextIntermediateCheckDate: '',
                          intermediateCheckResult: '',
                        })
                      } else {
                        if (form.custodianEmployeeId && !parsedDoneBy) {
                          handleUpdateCheck(
                            parsedReadings,
                            form.custodianEmployeeId,
                            undefined,
                            undefined,
                            undefined,
                            undefined,
                            undefined,
                            undefined,
                            undefined,
                            undefined,
                            !form.intermediateCheckFrequency
                              ? { intermediateCheckFrequency: 'Quarterly' }
                              : undefined,
                          )
                        } else if (!form.intermediateCheckFrequency) {
                          onChange({ ...form, intermediateCheckFrequency: 'Quarterly' })
                        }
                      }
                    }}
                  >
                    <SelectTrigger className="min-w-0 flex-1 bg-white border-slate-200">
                      <SelectValue placeholder="Select Status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="applicable">Applicable</SelectItem>
                      <SelectItem value="not-applicable">Not Applicable</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button
                    type="button"
                    variant="outline"
                    className={cn('h-8 shrink-0 gap-1.5 px-3', limsOutlineBtnClass)}
                    disabled={intermediateApplicable !== 'applicable'}
                    aria-disabled={intermediateApplicable !== 'applicable'}
                    title={
                      intermediateApplicable === 'applicable'
                        ? 'Open Intermediate Check form'
                        : 'Set status to Applicable to open the form'
                    }
                    aria-label={
                      intermediateApplicable === 'applicable'
                        ? 'Open Intermediate Check form'
                        : 'Open Intermediate Check form (disabled when Not Applicable)'
                    }
                    onClick={() => {
                      if (intermediateApplicable !== 'applicable') return
                      setIntermediateDetailsOpen(true)
                    }}
                  >
                    <ListChecks size={14} />
                    Open Form
                  </Button>
                </div>
              </div>
            </div>

            {/* Maintenance — Applicable / Not Applicable + Open Form (same as Intermediate Check) */}
            <div id="section-maintenance" className="col-span-12 space-y-3 md:col-span-4">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                Maintenance
              </h4>

              <div className="space-y-1.5">
                <div className="flex items-center gap-2">
                  <Select
                    value={maintApplicable}
                    onValueChange={(v) => {
                      setMaintApplicable(v as 'applicable' | 'not-applicable')
                      if (v === 'not-applicable') {
                        setMaintenanceScheduleOpen(false)
                        onChange({
                          ...form,
                          maintenanceScheduleFrequency: '',
                          lastMaintenanceDate: '',
                          nextMaintenanceDate: '',
                          maintenanceDoneBy: '',
                          maintenanceChecklist: [],
                        })
                      } else {
                        onChange({
                          ...form,
                          maintenanceScheduleFrequency:
                            form.maintenanceScheduleFrequency || 'Quarterly',
                          maintenanceDoneBy:
                            form.maintenanceDoneBy || form.custodianEmployeeId || '',
                        })
                      }
                    }}
                  >
                    <SelectTrigger className="min-w-0 flex-1 bg-white border-slate-200">
                      <SelectValue placeholder="Select Status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="applicable">Applicable</SelectItem>
                      <SelectItem value="not-applicable">Not Applicable</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button
                    type="button"
                    variant="outline"
                    className={cn('h-8 shrink-0 gap-1.5 px-3', limsOutlineBtnClass)}
                    disabled={maintApplicable !== 'applicable'}
                    aria-disabled={maintApplicable !== 'applicable'}
                    title={
                      maintApplicable === 'applicable'
                        ? 'Open Maintenance form'
                        : 'Set status to Applicable to open the form'
                    }
                    aria-label={
                      maintApplicable === 'applicable'
                        ? 'Open Maintenance form'
                        : 'Open Maintenance form (disabled when Not Applicable)'
                    }
                    onClick={() => {
                      if (maintApplicable !== 'applicable') return
                      if (!form.maintenanceScheduleFrequency) {
                        onChange({
                          ...form,
                          maintenanceScheduleFrequency: 'Quarterly',
                          maintenanceDoneBy:
                            form.maintenanceDoneBy || form.custodianEmployeeId || '',
                        })
                      } else if (!form.maintenanceDoneBy && form.custodianEmployeeId) {
                        onChange({
                          ...form,
                          maintenanceDoneBy: form.custodianEmployeeId,
                        })
                      }
                      setMaintenanceScheduleOpen(true)
                    }}
                  >
                    <Wrench size={14} />
                    Open Form
                  </Button>
                </div>
              </div>
            </div>
            </div>
              </section>
            ) : null}

          <section className={cn(limsPanelClass, "p-4")}>
            <h3 className="mb-3 border-b border-amber-700/25 pb-2 text-[11px] font-bold uppercase tracking-[0.14em] text-amber-800">
              Documents & History
            </h3>
            <div className="grid grid-cols-12 gap-3">
            <div className="col-span-12 space-y-1.5 md:col-span-3">
              <Label>Upload Manual / SOP</Label>
              <div
                className={cn(
                  'flex h-8 items-center gap-0.5 rounded-none border border-stone-500 bg-stone-50 px-1',
                )}
              >
                <span
                  className="min-w-0 flex-1 truncate px-1.5 text-xs text-stone-600"
                  title={
                    form.manualSopFile?.name ||
                    (form.uploadManualSopPath
                      ? form.uploadManualSopPath.split('/').pop()?.replace(/^\d+_/, '')
                      : undefined)
                  }
                >
                  {form.manualSopFile
                    ? form.manualSopFile.name
                    : form.uploadManualSopPath
                      ? form.uploadManualSopPath.split('/').pop()?.replace(/^\d+_/, '')
                      : 'No file'}
                </span>
                <label
                  className="inline-flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-none text-base leading-none hover:bg-stone-200/80"
                  title="Upload"
                  aria-label="Upload Manual / SOP"
                >
                  <span aria-hidden>📤</span>
                  <input
                    type="file"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0] || null
                      handleFileChange('manualSopFile', file)
                      e.target.value = ''
                    }}
                  />
                </label>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  data-readonly-action=""
                  className="h-7 w-7 shrink-0 rounded-none text-base hover:bg-stone-200/80"
                  title="View"
                  aria-label="View Manual / SOP"
                  disabled={!form.uploadManualSopPath && !form.manualSopFile}
                  onClick={() => {
                    if (form.uploadManualSopPath) {
                      onViewFile(form.uploadManualSopPath, 'Manual_SOP')
                      return
                    }
                    if (form.manualSopFile) {
                      const url = URL.createObjectURL(form.manualSopFile)
                      window.open(url, '_blank', 'noopener,noreferrer')
                      window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
                    }
                  }}
                >
                  <span aria-hidden>👁</span>
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 shrink-0 rounded-none text-base hover:bg-red-50"
                  title="Delete"
                  aria-label="Delete Manual / SOP"
                  disabled={!form.uploadManualSopPath && !form.manualSopFile}
                  onClick={() => {
                    const ok = window.confirm(
                      'Are you sure you want to delete the uploaded Manual/SOP?',
                    )
                    if (!ok) return
                    onChange({
                      ...form,
                      uploadManualSopPath: '',
                      manualSopFile: null,
                    })
                  }}
                >
                  <span aria-hidden>🗑</span>
                </Button>
              </div>
            </div>

            <div className="col-span-12 space-y-1.5 md:col-span-9">
              <Label htmlFor="eq-damage">History of Damage/Malfunction</Label>
              <Input
                id="eq-damage"
                placeholder="Describe any history of damages or malfunctions…"
                value={form.historyOfDamage}
                onChange={(e) => onChange({ ...form, historyOfDamage: e.target.value })}
                className="h-8"
              />
            </div>
            </div>
          </section>
        </div>
      </CardContent>

      <CardFooter className="-mx-4 mt-5 flex items-center justify-end gap-2 border-t border-stone-300 bg-stone-50 px-4 py-3 sm:-mx-6 sm:px-6">
        {readOnly ? (
          <Button
            type="button"
            variant="outline"
            onClick={() => onClose?.()}
            className={cn(limsOutlineBtnClass, 'min-w-[8.5rem]')}
          >
            Close
          </Button>
        ) : (
          <Button
            type="button"
            onClick={onSave}
            disabled={!canSave || saveLoading}
            className={cn(limsPrimaryBtnClass, 'min-w-[8.5rem]')}
          >
            {saveLoading ? 'Saving…' : 'Save & Close'}
          </Button>
        )}
      </CardFooter>
      <ConductMaintenanceDialog
        open={conductMaintenanceOpen}
        onOpenChange={setConductMaintenanceOpen}
        equipmentName={form.equipmentName}
        assetCode={form.assetCode}
        manufacturer={form.manufacturer}
        modelNumber={form.modelNumber}
        rangeCapacity={form.rangeCapacity}
        initialChecklist={form.maintenanceChecklist}
        maintenanceHistory={form.maintenanceHistory}
        lastMaintenanceDate={form.lastMaintenanceDate}
        nextMaintenanceDate={form.nextMaintenanceDate}
        maintenanceDoneBy={effectiveMaintenanceDoneBy}
        maintenanceDoneByName={maintenanceDoneByName}
        maintenanceScheduleFrequency={form.maintenanceScheduleFrequency}
        onSaveChecklist={(items) => onChange({ ...form, maintenanceChecklist: items })}
        onCompleteMaintenance={(payload) =>
          onChange({
            ...form,
            maintenanceChecklist: payload.checklist,
            maintenanceHistory: payload.maintenanceHistory,
            lastMaintenanceDate: payload.lastMaintenanceDate,
            nextMaintenanceDate: payload.nextMaintenanceDate,
          })
        }
      />
      {renderConductIntermediateCheck()}
      {renderIntermediateSetupDialogs()}
      {renderMaintenanceScheduleDialog()}
      {renderCalibrationFormDialog()}
      {renderIntermediateFormDialog()}
      {renderMaintenanceHistoryDialog()}
      {renderIntermediateCheckHistoryDialog()}
    </Card>
  )
}
