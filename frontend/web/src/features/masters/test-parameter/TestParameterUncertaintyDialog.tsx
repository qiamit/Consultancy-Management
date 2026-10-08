import { useEffect, useMemo, useState } from 'react'
import { CopyPlus, Download, History, Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useAuth } from '@/hooks/useAuth'
import { supabase } from '@/lib/supabaseClient'
import { EQUIPMENT_KIND_TESTING } from '@/lib/equipmentKind'
import {
  limsDarkBarGlowStyle,
  limsDialogClass,
  limsOutlineBtnClass,
  limsPanelClass,
  limsPrimaryBtnClass,
  limsRegistryFormClass,
} from '@/lib/limsThemeUi'
import { cn } from '@/lib/utils'
import { ApplyMuOnOtherParameterDialog } from './ApplyMuOnOtherParameterDialog'
import type { EquipmentRow } from '@/features/masters/equipment-master/types'
import { FilterCombobox } from '@/features/sample-handling/receiving/FilterCombobox'
import {
  buildEquipmentUncertaintyOption,
  calibrationStandardUncertainty,
  filterEquipmentUncertaintyOptions,
  type EquipmentUncertaintyOption,
} from './equipmentUncertainty'
import { MeasurementUnitSelect } from '@/features/masters/measurement-units/MeasurementUnitSelect'
import type { TestParameterRow } from './types'
import {
  buildUncertaintyCalculationData,
  combineUncertaintyBudget,
  coverageFactorForConfidenceLevel,
  formatTypeBRelativeUncertainty,
  formatToFourDecimals,
  formatUncertaintyOfTestMu,
  newTypeAMeasurement,
  newUncertaintyContributor,
  normalizeConfidenceLevel,
  parseUncertaintyCalculationData,
  totalRelativeUncertaintyPercent,
  TYPE_B_SOURCE_TYPE_OPTIONS,
  typeARelativeUncertaintyPercent,
  relativeUncertaintyFromContributors,
  defaultTypeAReadingLabel,
  type TypeAMeasurement,
  type UncertaintyCalculationData,
  type UncertaintyContributor,
} from './testParameterUncertainty'
import { UncertaintyHistoryDialog } from './UncertaintyHistoryDialog'
import {
  parseUncertaintyMuHistory,
  type UncertaintyHistoryRecord,
} from './uncertaintyHistory'

const CALIBRATION_CERTIFICATE_SOURCE = 'Calibration Certificate'

type UncertaintyImportSource = {
  id: string
  label: string
  itemName: string
  isCodeLabel: string | null
  testMethod: string | null
  clauseNo: string | null
  unitValue: string | null
  uncertaintyMu: string | null
  calculationData: unknown
}

function formatImportSourceLabel(source: {
  item_name: string
  is_code_label: string | null
  uncertainty_mu: string | null
  test_method: string | null
  clause_no: string | null
}): string {
  const parts = [
    source.item_name.trim(),
    source.is_code_label?.trim() || null,
    source.clause_no?.trim() ? `Cl ${source.clause_no.trim()}` : null,
    source.uncertainty_mu?.trim() || null,
  ].filter(Boolean)
  return parts.join(' · ')
}

function cloneImportedWorksheet(
  data: UncertaintyCalculationData,
  defaultUnit: string,
): {
  typeAMeasurements: TypeAMeasurement[]
  typeBContributors: UncertaintyContributor[]
  confidenceLevel: string
  coverageFactor: string
} {
  return {
    typeAMeasurements:
      data.typeAMeasurements.length > 0
        ? data.typeAMeasurements.map((m, index) => ({
            key: `mv-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            label: m.label.trim() || defaultTypeAReadingLabel(index),
            value: m.value.trim() ? formatToFourDecimals(m.value) : '',
            unit: m.unit.trim() || defaultUnit,
          }))
        : [newTypeAMeasurement(defaultTypeAReadingLabel(0), defaultUnit)],
    typeBContributors:
      data.typeBContributors.length > 0
        ? data.typeBContributors.map((c) => ({
            ...c,
            key: `u-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            uncertaintyUnit: c.uncertaintyUnit || defaultUnit,
            uncertainty: c.uncertainty.trim() ? formatToFourDecimals(c.uncertainty) : '',
            measurement: c.measurement.trim() ? formatToFourDecimals(c.measurement) : '',
          }))
        : [newUncertaintyContributor(defaultUnit)],
    confidenceLevel: normalizeConfidenceLevel(data.confidenceLevel),
    coverageFactor:
      data.coverageFactor ||
      coverageFactorForConfidenceLevel(normalizeConfidenceLevel(data.confidenceLevel)),
  }
}

function normalizeTypeAMeasurements(
  measurements: TypeAMeasurement[],
  defaultUnit = '',
): TypeAMeasurement[] {
  if (measurements.length === 0) {
    return [newTypeAMeasurement(defaultTypeAReadingLabel(0), defaultUnit)]
  }
  return measurements.map((m, index) => ({
    ...m,
    label: m.label.trim() || defaultTypeAReadingLabel(index),
    value: m.value.trim() ? formatToFourDecimals(m.value) : '',
    unit: m.unit.trim() || defaultUnit,
  }))
}

function TypeAUncertaintySection({
  measurements,
  subtotal,
  stats,
  unitLabel,
  onChange,
  onLinkedUnitChange,
}: {
  measurements: TypeAMeasurement[]
  subtotal: number
  stats: { n: number; mean: number; s: number }
  unitLabel?: string | null
  onChange: (next: TypeAMeasurement[]) => void
  onLinkedUnitChange: (unit: string) => void
}) {
  const unitSuffix = unitLabel?.trim() ? ` (${unitLabel.trim()})` : ''
  const formatValue = (value: number) => `${value.toFixed(4)}${unitSuffix}`
  const relativeUncertaintyPercent =
    stats.n >= 2 && stats.mean !== 0 ? typeARelativeUncertaintyPercent(subtotal, stats.mean) : null
  const defaultUnit = unitLabel?.trim() ?? ''

  return (
    <div className={cn(limsPanelClass, 'space-y-3 p-3')}>
      <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-amber-800">
        Type A Uncertainty
      </p>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-stretch">
        <div className="min-w-0 flex-1 overflow-hidden rounded-none border-2 border-stone-500">
          <table className="w-full table-auto border-collapse text-xs">
            <thead className="bg-stone-800">
              <tr>
                <th className="p-2 text-center text-[11px] font-bold uppercase tracking-[0.14em] text-amber-200">
                  Reading
                </th>
                <th className="p-2 text-center text-[11px] font-bold uppercase tracking-[0.14em] text-amber-200">
                  Input Value
                </th>
                <th className="w-0 whitespace-nowrap p-2 text-center text-[11px] font-bold uppercase tracking-[0.14em] text-amber-200">
                  Unit
                </th>
                <th className="w-10 p-2 text-center" />
              </tr>
            </thead>
            <tbody className="divide-y divide-[#e7e0d4] bg-[#fffcf7]">
              {measurements.map((m, index) => {
                const isLastRow = index === measurements.length - 1
                return (
                  <tr key={m.key}>
                    <td className="p-2 text-center">
                      <Input
                        className="text-center"
                        value={m.label}
                        placeholder={defaultTypeAReadingLabel(index)}
                        aria-label={`Reading label row ${index + 1}`}
                        onChange={(e) =>
                          onChange(
                            measurements.map((row) =>
                              row.key === m.key ? { ...row, label: e.target.value } : row,
                            ),
                          )
                        }
                        onBlur={() => {
                          const trimmed = m.label.trim()
                          if (trimmed === m.label) return
                          onChange(
                            measurements.map((row) =>
                              row.key === m.key
                                ? {
                                    ...row,
                                    label: trimmed || defaultTypeAReadingLabel(index),
                                  }
                                : row,
                            ),
                          )
                        }}
                      />
                    </td>
                    <td className="p-2 text-center">
                      <Input
                        className="text-center"
                        inputMode="decimal"
                        value={m.value}
                        placeholder="Enter Value"
                        onChange={(e) =>
                          onChange(
                            measurements.map((row) =>
                              row.key === m.key
                                ? { ...row, value: e.target.value.replace(/[^0-9.\-]/g, '') }
                                : row,
                            ),
                          )
                        }
                        onBlur={() => {
                          const formatted = formatToFourDecimals(m.value)
                          if (!formatted || formatted === m.value) return
                          onChange(
                            measurements.map((row) =>
                              row.key === m.key ? { ...row, value: formatted } : row,
                            ),
                          )
                        }}
                      />
                    </td>
                    <td className="w-0 whitespace-nowrap p-2">
                      <div className="w-[7.5rem]">
                        <MeasurementUnitSelect
                          id={`tp-unc-typea-unit-${m.key}`}
                          value={m.unit || defaultUnit}
                          onChange={(unit) => onLinkedUnitChange(unit)}
                          showLabel={false}
                          showManageButton
                          placeholder="Unit"
                          className="space-y-0"
                        />
                      </div>
                    </td>
                    <td className="p-2 text-center">
                      {isLastRow ? (
                        <Button
                          type="button"
                          size="icon"
                          variant="outline"
                          className={cn('h-8 w-8', limsOutlineBtnClass)}
                          aria-label="Add another value"
                          title="Add Another Value"
                          onClick={() =>
                            onChange([
                              ...measurements,
                              newTypeAMeasurement(
                                defaultTypeAReadingLabel(measurements.length),
                                defaultUnit,
                              ),
                            ])
                          }
                        >
                          <Plus size={14} />
                        </Button>
                      ) : (
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8 text-destructive hover:bg-rose-50 hover:text-destructive"
                          aria-label={`Remove value ${index + 1}`}
                          onClick={() => onChange(measurements.filter((row) => row.key !== m.key))}
                        >
                          <Trash2 size={14} />
                        </Button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        <div className="flex w-full shrink-0 flex-col justify-center rounded-none border-2 border-stone-500 bg-stone-50 p-3 sm:w-80">
          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-amber-800">
            Type A Calculation
          </p>
          <dl className="mt-3 space-y-2.5 text-xs">
            <div className="flex items-start justify-between gap-3">
              <dt className="text-stone-500">Average</dt>
              <dd className="text-right font-medium tabular-nums text-stone-800">
                {stats.n === 0 ? '—' : formatValue(stats.mean)}
              </dd>
            </div>
            <div className="flex items-start justify-between gap-3">
              <dt className="text-stone-500">Mean</dt>
              <dd className="text-right font-medium tabular-nums text-stone-800">
                {stats.n === 0 ? '—' : formatValue(stats.mean)}
              </dd>
            </div>
            <div className="flex items-start justify-between gap-3">
              <dt className="text-stone-500">Standard Deviation σ</dt>
              <dd className="text-right font-medium tabular-nums text-stone-800">
                {stats.n < 2 ? '—' : formatValue(stats.s)}
              </dd>
            </div>
            <div className="flex items-start justify-between gap-3">
              <dt className="text-stone-500">
                u<sub>A</sub> = σ / √{stats.n || 'n'} (Standard Error of Mean)
              </dt>
              <dd className="shrink-0 text-right font-medium tabular-nums text-stone-800">
                {stats.n < 2 ? '—' : formatValue(subtotal)}
              </dd>
            </div>
            <div className="flex items-start justify-between gap-3 border-t border-stone-300 pt-2.5">
              <dt className="font-semibold text-stone-700">
                Type A Relative Uncertainty u<sub>A</sub> (%)
              </dt>
              <dd className="text-right font-semibold tabular-nums text-stone-900">
                {relativeUncertaintyPercent == null ? '—' : `${relativeUncertaintyPercent.toFixed(4)} %`}
              </dd>
            </div>
          </dl>
        </div>
      </div>
    </div>
  )
}

function TypeBUncertaintySection({
  contributors,
  subtotal,
  defaultUncertaintyUnit,
  equipmentOptions,
  onChange,
}: {
  contributors: UncertaintyContributor[]
  subtotal: number
  defaultUncertaintyUnit?: string | null
  equipmentOptions: EquipmentUncertaintyOption[]
  onChange: (next: UncertaintyContributor[]) => void
}) {
  const [openEquipmentPickerKey, setOpenEquipmentPickerKey] = useState<string | null>(null)
  const defaultUnit = defaultUncertaintyUnit?.trim() ?? ''
  const [equipmentSearchByKey, setEquipmentSearchByKey] = useState<Record<string, string>>({})

  const updateContributor = (key: string, patch: Partial<UncertaintyContributor>) => {
    onChange(contributors.map((c) => (c.key === key ? { ...c, ...patch } : c)))
  }

  const updateContributorWithAutoRelative = (
    key: string,
    patch: Partial<UncertaintyContributor>,
  ) => {
    onChange(
      contributors.map((c) => {
        if (c.key !== key) return c
        const next = { ...c, ...patch }
        return {
          ...next,
          relativeUncertainty: formatTypeBRelativeUncertainty(next),
        }
      }),
    )
  }

  const handleSourceTypeChange = (key: string, nextType: string) => {
    onChange(
      contributors.map((c) =>
        c.key === key
          ? {
              ...c,
              sourceType: nextType,
              sourceName: '',
              equipmentId: '',
              uncertainty: '',
              uncertaintyUnit: defaultUnit,
              measurement: '',
              relativeUncertainty: '',
              divisor: '1',
            }
          : c,
      ),
    )
  }

  const handleEquipmentSelect = (key: string, option: EquipmentUncertaintyOption) => {
    const current = contributors.find((row) => row.key === key)
    const uncertainty = calibrationStandardUncertainty(option.uncertainty, option.coverageFactor)
    const measurement = current?.measurement ?? ''

    updateContributor(key, {
      equipmentId: option.id,
      sourceName: option.label,
      uncertainty,
      uncertaintyUnit: option.uncertaintyUnit || defaultUnit,
      divisor: '1',
      relativeUncertainty: measurement
        ? formatTypeBRelativeUncertainty({ uncertainty, measurement, divisor: '1' })
        : '',
    })
  }

  return (
    <div className={cn(limsPanelClass, 'space-y-3 p-3')}>
      <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-amber-800">
        Type B Uncertainty
      </p>

      <div className="overflow-x-auto rounded-none border-2 border-stone-500">
        <table className="w-full table-auto border-collapse text-xs">
          <thead className="bg-stone-800">
            <tr>
              <th className="whitespace-nowrap p-2 text-left text-[11px] font-bold uppercase tracking-[0.14em] text-amber-200">
                Type of Source
              </th>
              <th className="min-w-[10rem] w-full p-2 text-center text-[11px] font-bold uppercase tracking-[0.14em] text-amber-200">
                Source Name
              </th>
              <th className="p-2 text-center text-[11px] font-bold uppercase leading-tight tracking-[0.14em] text-amber-200">
                Standard
                <br />
                Uncertainty
              </th>
              <th className="whitespace-nowrap p-2 text-center text-[11px] font-bold uppercase tracking-[0.14em] text-amber-200">
                Measurement
              </th>
              <th className="p-2 text-center text-[11px] font-bold uppercase leading-tight tracking-[0.14em] text-amber-200">
                Relative
                <br />
                Uncertainty
              </th>
              <th className="w-10 whitespace-nowrap p-2 text-center" />
            </tr>
          </thead>
          <tbody className="divide-y divide-[#e7e0d4] bg-[#fffcf7]">
            {contributors.map((c, index) => {
              const isLastRow = index === contributors.length - 1
              const isCalibrationCertificate = c.sourceType === CALIBRATION_CERTIFICATE_SOURCE
              const isPickerOpen = openEquipmentPickerKey === c.key
              const equipmentSearch = isPickerOpen ? (equipmentSearchByKey[c.key] ?? '') : c.sourceName
              const equipmentPickerOptions = filterEquipmentUncertaintyOptions(
                isPickerOpen ? (equipmentSearchByKey[c.key] ?? '') : '',
                equipmentOptions,
              ).map((opt) => ({ id: opt.id, label: opt.label }))

              return (
                <tr key={c.key}>
                  <td className="w-0 whitespace-nowrap p-2">
                    <Select
                      value={c.sourceType || undefined}
                      onValueChange={(value) => handleSourceTypeChange(c.key, value)}
                    >
                      <SelectTrigger className="h-8 w-max min-w-[10.5rem] text-xs">
                        <SelectValue placeholder="Select type" />
                      </SelectTrigger>
                      <SelectContent>
                        {TYPE_B_SOURCE_TYPE_OPTIONS.map((option) => (
                          <SelectItem key={option} value={option}>
                            {option}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </td>
                  <td className="min-w-[10rem] p-2">
                    {isCalibrationCertificate ? (
                      <FilterCombobox
                        value={equipmentSearch}
                        onValueChange={(value) => {
                          setEquipmentSearchByKey((prev) => ({ ...prev, [c.key]: value }))
                          if (c.equipmentId) {
                            updateContributor(c.key, {
                              sourceName: '',
                              equipmentId: '',
                              uncertainty: '',
                              measurement: '',
                              relativeUncertainty: '',
                            })
                          }
                        }}
                        options={equipmentPickerOptions}
                        onSelectOption={(option) => {
                          const selected = equipmentOptions.find((item) => item.id === option.id)
                          if (selected) {
                            handleEquipmentSelect(c.key, selected)
                            setEquipmentSearchByKey((prev) => {
                              const next = { ...prev }
                              delete next[c.key]
                              return next
                            })
                          }
                        }}
                        open={isPickerOpen}
                        onOpenChange={(open) => {
                          if (open) {
                            setOpenEquipmentPickerKey(c.key)
                            setEquipmentSearchByKey((prev) => ({
                              ...prev,
                              [c.key]: prev[c.key] ?? '',
                            }))
                          } else {
                            setOpenEquipmentPickerKey((current) => (current === c.key ? null : current))
                          }
                        }}
                        onInputFocus={() => {
                          setEquipmentSearchByKey((prev) => ({
                            ...prev,
                            [c.key]: prev[c.key] ?? '',
                          }))
                        }}
                        placeholder="Search Equipment"
                        inputClassName="h-8 text-sm"
                        listId={`equipment-picker-${c.key}`}
                        dropdownPlacement="top"
                      />
                    ) : (
                      <Input
                        value={c.sourceName}
                        placeholder="Source name"
                        onChange={(e) => updateContributor(c.key, { sourceName: e.target.value })}
                      />
                    )}
                  </td>
                  <td className="w-0 whitespace-nowrap p-2">
                    <Input
                      className="w-[7.5rem] text-center"
                      inputMode="decimal"
                      value={c.uncertainty}
                      onChange={(e) =>
                        updateContributorWithAutoRelative(c.key, {
                          uncertainty: e.target.value.replace(/[^0-9.]/g, ''),
                        })
                      }
                      onBlur={() => {
                        const formatted = formatToFourDecimals(c.uncertainty)
                        if (formatted !== c.uncertainty) {
                          updateContributorWithAutoRelative(c.key, { uncertainty: formatted })
                        }
                      }}
                    />
                  </td>
                  <td className="w-0 whitespace-nowrap p-2">
                    <Input
                      className="w-[7.5rem] text-center"
                      inputMode="decimal"
                      value={c.measurement}
                      placeholder="Value"
                      onChange={(e) =>
                        updateContributorWithAutoRelative(c.key, {
                          measurement: e.target.value.replace(/[^0-9.]/g, ''),
                        })
                      }
                    />
                  </td>
                  <td className="w-0 whitespace-nowrap p-2">
                    <div className="relative w-[8.5rem]">
                      <Input
                        className="pr-7 text-center"
                        inputMode="decimal"
                        value={c.relativeUncertainty}
                        placeholder="Auto"
                        onChange={(e) =>
                          updateContributor(c.key, {
                            relativeUncertainty: e.target.value.replace(/[^0-9.]/g, ''),
                          })
                        }
                      />
                      <span className="pointer-events-none absolute inset-y-0 right-2 flex items-center text-xs text-stone-500">
                        %
                      </span>
                    </div>
                  </td>
                  <td className="w-0 whitespace-nowrap p-2 text-center">
                    {isLastRow ? (
                      <Button
                        type="button"
                        size="icon"
                        variant="outline"
                        className={cn('h-8 w-8', limsOutlineBtnClass)}
                        aria-label="Add source"
                        title="Add source"
                        onClick={() =>
                          onChange([...contributors, newUncertaintyContributor(defaultUnit)])
                        }
                      >
                        <Plus size={14} />
                      </Button>
                    ) : (
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8 text-destructive hover:bg-rose-50 hover:text-destructive"
                        aria-label="Remove source"
                        onClick={() => onChange(contributors.filter((rowItem) => rowItem.key !== c.key))}
                      >
                        <Trash2 size={14} />
                      </Button>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <div className="rounded-none border-2 border-stone-500 bg-stone-50 p-3">
        <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-amber-800">
          Type B Calculation
        </p>
        <dl className="mt-2 text-xs">
          <div className="flex items-center justify-between gap-3">
            <dt className="font-semibold text-stone-700">
              Total Type B Uncertainty u<sub>B</sub>
            </dt>
            <dd className="font-semibold tabular-nums text-stone-900">
              {subtotal > 0 ? `${subtotal.toFixed(4)} %` : '—'}
            </dd>
          </div>
        </dl>
      </div>
    </div>
  )
}

export function TestParameterUncertaintyDialog({
  row,
  open,
  saving,
  onOpenChange,
  onSave,
  onHistoryChange,
  onAppliedToOthers,
}: {
  row: TestParameterRow | null
  open: boolean
  saving: boolean
  onOpenChange: (open: boolean) => void
  onSave: (uncertaintyMu: string, calculationData: UncertaintyCalculationData) => Promise<void>
  onHistoryChange: (next: UncertaintyHistoryRecord[]) => Promise<void>
  onAppliedToOthers?: () => Promise<void> | void
}) {
  const { profileName } = useAuth()
  const [typeAMeasurements, setTypeAMeasurements] = useState<TypeAMeasurement[]>([
    newTypeAMeasurement(defaultTypeAReadingLabel(0)),
  ])
  const [typeBContributors, setTypeBContributors] = useState<UncertaintyContributor[]>([
    newUncertaintyContributor(),
  ])
  const [confidenceLevel, setConfidenceLevel] = useState('95')
  const [confidenceUnit, setConfidenceUnit] = useState('%')
  const [worksheetUnit, setWorksheetUnit] = useState('')
  const [coverageFactor, setCoverageFactor] = useState('2')
  const [equipmentOptions, setEquipmentOptions] = useState<EquipmentUncertaintyOption[]>([])
  const [importSources, setImportSources] = useState<UncertaintyImportSource[]>([])
  const [importSearch, setImportSearch] = useState('')
  const [importPickerOpen, setImportPickerOpen] = useState(false)
  const [selectedImportSourceId, setSelectedImportSourceId] = useState<string | null>(null)
  const [importPanelOpen, setImportPanelOpen] = useState(false)
  const [importMessage, setImportMessage] = useState<string | null>(null)
  const [historyPanelOpen, setHistoryPanelOpen] = useState(false)
  const [applyMuPanelOpen, setApplyMuPanelOpen] = useState(false)

  useEffect(() => {
    if (!open || !row) return
    const defaultUnit = row.unit_value?.trim() ?? ''
    const saved = parseUncertaintyCalculationData(row.uncertainty_calculation_data, defaultUnit)
    setImportSearch('')
    setImportPickerOpen(false)
    setSelectedImportSourceId(null)
    setImportPanelOpen(false)
    setImportMessage(null)
    setHistoryPanelOpen(false)
    setApplyMuPanelOpen(false)
    setWorksheetUnit(defaultUnit)

    if (saved) {
      setTypeAMeasurements(
        normalizeTypeAMeasurements(
          saved.typeAMeasurements.length > 0
            ? saved.typeAMeasurements
            : [newTypeAMeasurement(defaultTypeAReadingLabel(0), defaultUnit)],
          defaultUnit,
        ),
      )
      setTypeBContributors(
        saved.typeBContributors.length > 0
          ? saved.typeBContributors
          : [newUncertaintyContributor(defaultUnit)],
      )
      const savedConfidence = normalizeConfidenceLevel(saved.confidenceLevel)
      setConfidenceLevel(savedConfidence)
      setConfidenceUnit('%')
      setCoverageFactor(saved.coverageFactor || coverageFactorForConfidenceLevel(savedConfidence))
      return
    }

    setTypeAMeasurements([newTypeAMeasurement(defaultTypeAReadingLabel(0), defaultUnit)])
    setTypeBContributors([newUncertaintyContributor(defaultUnit)])
    setConfidenceLevel('95')
    setConfidenceUnit('%')
    setCoverageFactor('2')
  }, [open, row])

  useEffect(() => {
    if (!open) return
    void (async () => {
      const { data, error } = await supabase
        .from('equipment_master')
        .select(
          'id, asset_code, equipment_name, manufacturer, model_number, range_capacity, calibration_certificate_number, calibration_certificate_uncertainty, calibration_uncertainty_unit, calibration_coverage_factor, intermediate_check_result',
        )
        .eq('equipment_kind', EQUIPMENT_KIND_TESTING)
        .order('equipment_name', { ascending: true })

      if (error) {
        console.warn('Failed to load equipment for uncertainty:', error)
        setEquipmentOptions([])
        return
      }

      setEquipmentOptions((data as EquipmentRow[] | null)?.map(buildEquipmentUncertaintyOption) ?? [])
    })()
  }, [open])

  useEffect(() => {
    if (!open || !row) return
    void (async () => {
      const { data, error } = await supabase
        .from('test_parameters')
        .select(
          'id, item_name, is_code_label, test_method, clause_no, unit_value, uncertainty_mu, uncertainty_calculation_data',
        )
        .not('uncertainty_calculation_data', 'is', null)
        .order('item_name', { ascending: true })

      if (error) {
        console.warn('Failed to load uncertainty import sources:', error)
        setImportSources([])
        return
      }

      const list = Array.isArray(data) ? data : []
      setImportSources(
        list
          .filter((item) => String(item.id) !== row.id && item.uncertainty_calculation_data != null)
          .map((item) => ({
            id: String(item.id),
            label: formatImportSourceLabel({
              item_name: String(item.item_name ?? ''),
              is_code_label: item.is_code_label ? String(item.is_code_label) : null,
              uncertainty_mu: item.uncertainty_mu ? String(item.uncertainty_mu) : null,
              test_method: item.test_method ? String(item.test_method) : null,
              clause_no: item.clause_no ? String(item.clause_no) : null,
            }),
            itemName: String(item.item_name ?? ''),
            isCodeLabel: item.is_code_label ? String(item.is_code_label) : null,
            testMethod: item.test_method ? String(item.test_method) : null,
            clauseNo: item.clause_no ? String(item.clause_no) : null,
            unitValue: item.unit_value ? String(item.unit_value) : null,
            uncertaintyMu: item.uncertainty_mu ? String(item.uncertainty_mu) : null,
            calculationData: item.uncertainty_calculation_data,
          })),
      )
    })()
  }, [open, row])

  const suggestedImportSources = useMemo(() => {
    if (!row) return importSources
    const itemName = row.item_name.trim().toLowerCase()
    const testMethod = row.test_method?.trim().toLowerCase() ?? ''
    const sameNameOrMethod = importSources.filter((source) => {
      const sourceName = source.itemName.trim().toLowerCase()
      const sourceMethod = source.testMethod?.trim().toLowerCase() ?? ''
      return (
        (itemName && sourceName === itemName) ||
        (testMethod && sourceMethod && sourceMethod === testMethod)
      )
    })
    return sameNameOrMethod.length > 0 ? sameNameOrMethod : importSources
  }, [importSources, row])

  const importPickerOptions = useMemo(() => {
    const q = importSearch.trim().toLowerCase()
    const pool = suggestedImportSources
    const filtered = !q
      ? pool
      : pool.filter(
          (source) =>
            source.label.toLowerCase().includes(q) ||
            source.itemName.toLowerCase().includes(q) ||
            source.isCodeLabel?.toLowerCase().includes(q) ||
            source.testMethod?.toLowerCase().includes(q) ||
            source.clauseNo?.toLowerCase().includes(q) ||
            source.uncertaintyMu?.toLowerCase().includes(q),
        )
    return filtered.slice(0, 50).map((source) => ({ id: source.id, label: source.label }))
  }, [importSearch, suggestedImportSources])

  const applyImportedSource = (sourceId: string) => {
    if (!row) return
    const source = importSources.find((item) => item.id === sourceId)
    if (!source) {
      setImportMessage('Selected test parameter was not found.')
      return
    }

    const defaultUnit = row.unit_value?.trim() ?? ''
    const parsed = parseUncertaintyCalculationData(source.calculationData, defaultUnit)
    if (!parsed) {
      setImportMessage('Selected test parameter has no usable uncertainty calculation data.')
      return
    }

    const cloned = cloneImportedWorksheet(parsed, defaultUnit)
    setTypeAMeasurements(cloned.typeAMeasurements)
    setTypeBContributors(cloned.typeBContributors)
    setConfidenceLevel(cloned.confidenceLevel)
    setCoverageFactor(cloned.coverageFactor)
    setImportSearch(source.label)
    setImportPickerOpen(false)
    setSelectedImportSourceId(null)
    setImportPanelOpen(false)
    setImportMessage(null)
  }

  const handleImportAndClose = () => {
    if (selectedImportSourceId) {
      applyImportedSource(selectedImportSourceId)
      return
    }
    const q = importSearch.trim().toLowerCase()
    if (!q) {
      setImportMessage('Select a test parameter to import.')
      return
    }
    const match =
      importPickerOptions.find((option) => option.label.toLowerCase() === q) ??
      importPickerOptions.find((option) => option.label.toLowerCase().includes(q))
    if (!match) {
      setImportMessage('No matching test parameter found to import.')
      return
    }
    applyImportedSource(match.id)
  }

  const { uTypeA, uc, expanded, typeAStats } = useMemo(
    () => combineUncertaintyBudget(typeAMeasurements, typeBContributors, Number.parseFloat(coverageFactor)),
    [typeAMeasurements, typeBContributors, coverageFactor],
  )

  const uTypeBRelative = useMemo(
    () => relativeUncertaintyFromContributors(typeBContributors),
    [typeBContributors],
  )

  const totalRelativeUncertainty = useMemo(
    () => totalRelativeUncertaintyPercent(uTypeA, typeAStats, uTypeBRelative),
    [uTypeA, typeAStats, uTypeBRelative],
  )

  const unitLabel = worksheetUnit.trim() || row?.unit_value?.trim() || ''
  const historyRecords = useMemo(
    () => parseUncertaintyMuHistory(row?.uncertainty_mu_history),
    [row?.uncertainty_mu_history],
  )
  const unitSuffix = unitLabel ? ` ${unitLabel}` : ''

  const handleWorksheetUnitChange = (unit: string) => {
    const next = unit.trim()
    setWorksheetUnit(next)
    setTypeAMeasurements((prev) => prev.map((m) => ({ ...m, unit: next })))
    setTypeBContributors((prev) =>
      prev.map((c) => ({
        ...c,
        uncertaintyUnit: next || c.uncertaintyUnit,
      })),
    )
  }

  const uncertaintyInUnitDisplay = useMemo(() => {
    if (expanded <= 0) return '—'
    return unitLabel ? `${expanded.toFixed(4)}${unitSuffix}` : expanded.toFixed(4)
  }, [expanded, unitLabel, unitSuffix])

  const computedResultMu = useMemo(
    () => formatUncertaintyOfTestMu(unitLabel || null, expanded, totalRelativeUncertainty),
    [unitLabel, expanded, totalRelativeUncertainty],
  )

  const handleConfidenceLevelChange = (raw: string) => {
    const next = raw.replace(/[^0-9.]/g, '')
    setConfidenceLevel(next)
    setCoverageFactor(coverageFactorForConfidenceLevel(next || '95'))
  }

  const handleConfidenceLevelBlur = () => {
    const next = normalizeConfidenceLevel(confidenceLevel)
    setConfidenceLevel(next)
    setCoverageFactor(coverageFactorForConfidenceLevel(next))
  }

  const handleSave = async () => {
    const trimmed = computedResultMu.trim()
    if (!trimmed) return
    await onSave(
      trimmed,
      buildUncertaintyCalculationData({
        typeAMeasurements,
        typeBContributors,
        confidenceLevel,
        coverageFactor,
        referenceValue: '',
        resultMu: trimmed,
      }),
    )
  }

  return (
    <>
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        persistOnFocusLoss
        aria-describedby={undefined}
        overlayClassName="lg:inset-y-0 lg:left-[268px] lg:right-0 lg:w-auto"
        className={cn(
          limsDialogClass,
          '!flex h-[100dvh] max-h-[100dvh] w-full max-w-none translate-x-0 translate-y-0 flex-col',
          'left-0 top-0',
          'lg:left-[268px] lg:w-[calc(100vw-268px)] lg:max-w-[calc(100vw-268px)]',
          '[&>button]:!text-white [&>button]:hover:bg-white/10',
        )}
      >
        <div className="relative shrink-0 overflow-hidden bg-gradient-to-br from-stone-800 via-stone-900 to-stone-950 px-4 py-2.5 text-white sm:px-5 sm:py-3">
          <div
            className="pointer-events-none absolute inset-0 opacity-[0.18]"
            style={limsDarkBarGlowStyle}
          />
          <div className="absolute bottom-0 left-0 h-[2px] w-full bg-gradient-to-r from-amber-500 via-amber-300 to-transparent" />
          <DialogHeader className="relative pr-10 text-left">
            <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3">
              <DialogTitle className="min-w-0 shrink text-base font-semibold tracking-tight text-white sm:text-lg">
                Uncertainty Calculation
              </DialogTitle>
              <p
                className={cn(
                  'justify-self-center whitespace-nowrap text-center text-sm font-semibold tabular-nums tracking-tight sm:text-base',
                  computedResultMu ? 'text-amber-200' : 'text-stone-500',
                )}
                title={computedResultMu ? `MU = ${computedResultMu}` : undefined}
              >
                {computedResultMu ? `MU = ${computedResultMu}` : 'MU = —'}
              </p>
              {row?.item_name.trim() ? (
                <p
                  className="min-w-0 justify-self-end text-right text-sm font-medium leading-snug text-amber-200/95 break-words sm:text-base"
                  title={row.item_name}
                >
                  {row.item_name}
                </p>
              ) : (
                <span className="justify-self-end" aria-hidden />
              )}
            </div>
          </DialogHeader>
        </div>

        {row ? (
          <div
            className={cn(
              'min-h-0 flex-1 space-y-4 overflow-y-auto overflow-x-hidden bg-gradient-to-b from-stone-100/80 to-white px-4 py-4 text-sm sm:px-6 sm:py-5',
              limsRegistryFormClass,
            )}
          >
            <div className={cn(limsPanelClass, 'space-y-3 p-3')}>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0 space-y-1">
                  <p className="text-xs text-stone-600">
                    <span className="font-semibold uppercase tracking-wide">Test Method:</span>{' '}
                    {row.test_method?.trim() || '—'}
                    {row.clause_no ? ` · Clause ${row.clause_no}` : ''}
                    {unitLabel ? ` · Unit ${unitLabel}` : ''}
                  </p>
                  {row.uncertainty_mu ? (
                    <p className="text-xs text-stone-500">
                      Current MU:{' '}
                      <span className="font-medium text-stone-700">{row.uncertainty_mu}</span>
                    </p>
                  ) : null}
                </div>
                <div className="flex shrink-0 flex-wrap items-center gap-2 self-start sm:self-auto">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className={cn('h-8 gap-1.5', limsOutlineBtnClass)}
                    aria-haspopup="dialog"
                    aria-expanded={historyPanelOpen}
                    onClick={() => setHistoryPanelOpen(true)}
                  >
                    <History size={14} />
                    Uncertainty History
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className={cn('h-8 gap-1.5', limsOutlineBtnClass)}
                    disabled={!computedResultMu.trim() || !(row.test_method?.trim())}
                    aria-haspopup="dialog"
                    aria-expanded={applyMuPanelOpen}
                    title={
                      !(row.test_method?.trim())
                        ? 'Test method is required'
                        : !computedResultMu.trim()
                          ? 'Calculate MU first'
                          : 'Apply this MU to other parameters with the same test method'
                    }
                    onClick={() => setApplyMuPanelOpen(true)}
                  >
                    <CopyPlus size={14} />
                    Apply MU on Other Parameter
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className={cn('h-8 gap-1.5', limsOutlineBtnClass)}
                    disabled={importSources.length === 0}
                    aria-haspopup="dialog"
                    aria-expanded={importPanelOpen}
                    onClick={() => {
                      setImportPanelOpen(true)
                      setImportPickerOpen(false)
                      setImportSearch('')
                      setSelectedImportSourceId(null)
                      setImportMessage(null)
                    }}
                  >
                    <Download size={14} />
                    Import Uncertainty Data
                  </Button>
                </div>
              </div>
            </div>

            <TypeAUncertaintySection
              measurements={typeAMeasurements}
              subtotal={uTypeA}
              stats={typeAStats}
              unitLabel={unitLabel}
              onChange={setTypeAMeasurements}
              onLinkedUnitChange={handleWorksheetUnitChange}
            />

            <TypeBUncertaintySection
              contributors={typeBContributors}
              subtotal={uTypeBRelative}
              defaultUncertaintyUnit={unitLabel}
              equipmentOptions={equipmentOptions}
              onChange={setTypeBContributors}
            />

            <div className={cn(limsPanelClass, 'space-y-3 p-4')}>
              <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-amber-800">
                Combined Uncertainty Summary
              </p>
              <div className="overflow-x-auto">
                <div className="grid min-w-[920px] grid-cols-5 gap-3">
                  <div className="space-y-1.5">
                    <Label className="flex justify-center text-center">
                      Total Relative Uncertainty
                    </Label>
                    <div className="flex h-8 items-center justify-center rounded-none border border-stone-500 bg-stone-50 px-3 text-center text-sm tabular-nums text-stone-800">
                      {totalRelativeUncertainty > 0
                        ? `${totalRelativeUncertainty.toFixed(4)} %`
                        : '—'}
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="flex justify-center text-center">Combined Uncertainty</Label>
                    <div className="flex h-8 items-center justify-center rounded-none border border-stone-500 bg-stone-50 px-3 text-center text-sm tabular-nums text-stone-800">
                      {uc > 0 ? `${uc.toFixed(4)}${unitSuffix}` : '—'}
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="tp-unc-confidence" className="flex justify-center text-center">
                      Confidence Level
                    </Label>
                    <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-2">
                      <Input
                        id="tp-unc-confidence"
                        inputMode="decimal"
                        value={confidenceLevel}
                        placeholder="95"
                        className="text-center"
                        aria-label="Confidence level value"
                        onChange={(e) => handleConfidenceLevelChange(e.target.value)}
                        onBlur={handleConfidenceLevelBlur}
                      />
                      <MeasurementUnitSelect
                        id="tp-unc-confidence-unit"
                        value={confidenceUnit}
                        onChange={setConfidenceUnit}
                        showLabel={false}
                        showManageButton
                        placeholder="%"
                        className="space-y-0"
                      />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="tp-unc-k" className="flex justify-center text-center">
                      Coverage Factor
                    </Label>
                    <Input
                      id="tp-unc-k"
                      readOnly
                      value={coverageFactor}
                      className="bg-stone-100 text-center text-stone-700"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="flex justify-center text-center">
                      Uncertainty of Test in Unit
                    </Label>
                    <div className="flex h-8 items-center justify-center rounded-none border border-stone-500 bg-stone-50 px-3 text-center text-sm tabular-nums text-stone-800">
                      {uncertaintyInUnitDisplay}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : null}

        <DialogFooter className="shrink-0 gap-2 border-t border-stone-300 bg-stone-50 px-4 py-3 sm:justify-end sm:px-6">
          <Button
            type="button"
            className={limsPrimaryBtnClass}
            onClick={() => void handleSave()}
            disabled={saving || !computedResultMu.trim()}
          >
            {saving ? 'Saving…' : 'Save & Close'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <Dialog
      open={importPanelOpen}
      onOpenChange={(next) => {
        setImportPanelOpen(next)
        if (!next) {
          setImportPickerOpen(false)
          setImportSearch('')
          setSelectedImportSourceId(null)
        }
      }}
    >
      <DialogContent
        persistOnFocusLoss
        layer="stacked"
        aria-describedby={undefined}
        overlayClassName="lg:inset-y-0 lg:left-[268px] lg:right-0 lg:w-auto"
        className={cn(limsDialogClass, 'max-w-lg')}
      >
        <div className="relative overflow-hidden bg-gradient-to-br from-stone-800 via-stone-900 to-stone-950 px-4 py-2.5 text-white">
          <div
            className="pointer-events-none absolute inset-0 opacity-[0.18]"
            style={{
              backgroundImage:
                'radial-gradient(circle at 12% 20%, rgba(217,119,6,0.45), transparent 42%), radial-gradient(circle at 88% 0%, rgba(251,191,36,0.25), transparent 35%)',
            }}
          />
          <div className="absolute bottom-0 left-0 h-[2px] w-full bg-gradient-to-r from-amber-500 via-amber-300 to-transparent" />
          <DialogHeader className="relative pr-10 text-left">
            <DialogTitle className="text-base font-semibold tracking-tight text-white">
              Import Uncertainty Data
            </DialogTitle>
          </DialogHeader>
        </div>

        <div
          className={cn(
            limsRegistryFormClass,
            'space-y-4 bg-gradient-to-b from-stone-100/80 to-white px-4 py-4',
          )}
        >
          <div className="space-y-2">
            <Label
              htmlFor="uncertainty-import-search"
              className="text-[11px] font-semibold uppercase tracking-wide text-stone-600"
            >
              Search Test Parameter
            </Label>
            <FilterCombobox
              value={importSearch}
              onValueChange={(value) => {
                setImportSearch(value)
                setSelectedImportSourceId(null)
                setImportMessage(null)
              }}
              options={importPickerOptions}
              onSelectOption={(option) => {
                setImportSearch(option.label)
                setSelectedImportSourceId(option.id)
                setImportPickerOpen(false)
                setImportMessage(null)
              }}
              open={importPickerOpen}
              onOpenChange={setImportPickerOpen}
              placeholder="Search by Test Name | IS Code | Method | MU"
              inputClassName="h-8 text-sm"
              inputId="uncertainty-import-search"
              listId="uncertainty-import-picker"
              dropdownPlacement="bottom"
            />
            {importMessage && !importMessage.startsWith('Imported') ? (
              <p className="text-xs font-medium text-red-700">{importMessage}</p>
            ) : null}
          </div>
        </div>

        <DialogFooter className="border-t border-stone-200 bg-stone-50 px-4 py-3 sm:justify-end">
          <Button
            type="button"
            className={limsPrimaryBtnClass}
            onClick={handleImportAndClose}
            disabled={importSources.length === 0}
          >
            Import & Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <UncertaintyHistoryDialog
      open={historyPanelOpen}
      onOpenChange={setHistoryPanelOpen}
      parameterName={row?.item_name?.trim() || 'Test Parameter'}
      isCodeLabel={row?.is_code_label}
      history={historyRecords}
      onHistoryChange={onHistoryChange}
      layer="stacked"
    />

    {row ? (
      <ApplyMuOnOtherParameterDialog
        open={applyMuPanelOpen}
        onOpenChange={setApplyMuPanelOpen}
        sourceParameterId={row.id}
        sourceParameterName={row.item_name?.trim() || 'Test Parameter'}
        testMethod={row.test_method?.trim() || ''}
        currentMu={computedResultMu.trim()}
        calculationData={buildUncertaintyCalculationData({
          typeAMeasurements,
          typeBContributors,
          confidenceLevel,
          coverageFactor,
          referenceValue: '',
          resultMu: computedResultMu.trim(),
        })}
        savedByName={profileName}
        onApplied={async () => {
          await onAppliedToOthers?.()
        }}
        layer="stacked"
      />
    ) : null}
    </>
  )
}
