import { useMemo, useRef, useState } from 'react'
import { Calendar } from 'lucide-react'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { LimsFieldWithAdd } from '@/components/lims/LimsFieldWithAdd'
import { limsFieldAddBtnClass, limsFieldClass } from '@/lib/limsThemeUi'
import { cn } from '@/lib/utils'
import { getCurrencyCode, getCurrencySymbol } from '@/lib/appCurrency'
import { formatMoneyInput, sanitizeMoneyInput } from '@/features/masters/products-services/types'
import { MasterOptionFieldWithAdd } from './MasterOptionFieldWithAdd'
import { FilterCombobox, type FilterComboboxOption } from '@/features/sample-handling/receiving/FilterCombobox'
import type { BisBranchOfficeRow } from '@/features/masters/bis-branch-offices/bisBranchOfficesApi'
import type { BisApplicationDetailsForm, BisApplicationProcess } from './types'

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
  'min-w-0 pr-2 tabular-nums',
  '[&::-webkit-calendar-picker-indicator]:pointer-events-none',
  '[&::-webkit-calendar-picker-indicator]:opacity-0',
)

function branchOfficeDisplayName(raw: string): string {
  return raw.trim().replace(/^Bureau of Indian Standards\s*[-–—:]\s*/i, '')
}

function calculatedProductionValue(actual: string, rate: string): string {
  if (!actual.trim() || !rate.trim()) return ''
  const value = Number(actual) * Number(rate)
  return Number.isFinite(value) ? value.toFixed(2) : ''
}

function sanitizeCapacity(value: string): string {
  const cleaned = value.replace(/,/g, '').replace(/[^\d.]/g, '')
  const [whole = '', ...fraction] = cleaned.split('.')
  return fraction.length ? `${whole}.${fraction.join('')}` : whole
}

function formatCapacity(value: string): string {
  if (!value.trim()) return ''
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed.toFixed(2) : value
}

export function ApplicationDetailsFields({
  form,
  onChange,
  disabled = false,
  projectKind,
  branchOffices = [],
}: {
  form: BisApplicationDetailsForm
  onChange: (next: BisApplicationDetailsForm) => void
  disabled?: boolean
  /** When Application: show app number/dates. When License: show license number/dates. */
  projectKind?: string | null
  branchOffices?: BisBranchOfficeRow[]
}) {
  const applicationDateRef = useRef<HTMLInputElement | null>(null)
  const inspectionDateRef = useRef<HTMLInputElement | null>(null)
  const grantedDateRef = useRef<HTMLInputElement | null>(null)
  const validityDateRef = useRef<HTMLInputElement | null>(null)
  const [branchDropdownOpen, setBranchDropdownOpen] = useState(false)
  const [branchQuery, setBranchQuery] = useState('')
  const branchOptions = useMemo<FilterComboboxOption[]>(
    () =>
      branchOffices.map((office) => ({
        id: office.id,
        label: branchOfficeDisplayName(office.name),
        secondaryLabel: [office.city, office.state].filter(Boolean).join(', '),
      })),
    [branchOffices],
  )
  const filteredBranchOptions = useMemo(() => {
    const query = branchQuery.trim().toLocaleLowerCase()
    if (!query) return branchOptions
    return branchOptions.filter((option) =>
      `${option.label} ${option.secondaryLabel ?? ''}`.toLocaleLowerCase().includes(query),
    )
  }, [branchOptions, branchQuery])

  const kind = (projectKind ?? '').trim().toLowerCase()
  const isApplicationProject = kind === 'application'
  const isLicenseProject = kind === 'licence' || kind === 'license'
  const showApplicationNumberFields = !isLicenseProject
  const showLicenseFields = !isApplicationProject

  const set = <K extends keyof BisApplicationDetailsForm>(
    key: K,
    value: BisApplicationDetailsForm[K],
  ) => onChange({ ...form, [key]: value })

  return (
    <div className="space-y-3 rounded-none border border-stone-400 bg-[#fffcf7] p-2 sm:p-3">
      <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-stone-600">
        Application / Licence Details
      </p>

      <div className="space-y-2.5">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-5 sm:gap-3">
        <div className="min-w-0 space-y-0.5">
          <Label htmlFor="app-process">Application Process</Label>
          <Select
            value={form.applicationProcess}
            onValueChange={(v) => set('applicationProcess', v as BisApplicationProcess)}
            disabled={disabled}
          >
            <SelectTrigger id="app-process" className={limsFieldClass} aria-label="Application Process">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="simplified">Option 1</SelectItem>
              <SelectItem value="normal">Option 2</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Keep the process, identifier, dates and inspection type together in one row on wide screens. */}
        {showApplicationNumberFields ? (
          <>
            <div className="min-w-0 space-y-0.5">
              <Label htmlFor="app-number">Application Number</Label>
              <div className="flex items-stretch">
                <span className="inline-flex h-8 items-center border border-r-0 border-stone-500 bg-stone-100 px-2 text-xs font-semibold text-stone-700 sm:px-3">
                  CM/A-
                </span>
                <Input
                  id="app-number"
                  inputMode="numeric"
                  placeholder="Application number"
                  className={cn(limsFieldClass, 'font-mono tabular-nums')}
                  value={form.applicationNumber}
                  disabled={disabled}
                  onChange={(e) => set('applicationNumber', e.target.value.replace(/\D/g, ''))}
                />
              </div>
            </div>

            <div className="min-w-0 space-y-0.5">
              <Label htmlFor="app-date">Application Date</Label>
              <LimsFieldWithAdd
                addButton={
                  <button
                    type="button"
                    className={limsFieldAddBtnClass}
                    aria-label="Open calendar"
                    title="Pick date"
                    disabled={disabled}
                    onClick={() => openDatePicker(applicationDateRef.current)}
                  >
                    <Calendar size={14} strokeWidth={2.25} aria-hidden />
                  </button>
                }
              >
                <Input
                  ref={applicationDateRef}
                  id="app-date"
                  type="date"
                  className={dateInputClass}
                  value={form.applicationDate}
                  disabled={disabled}
                  onChange={(e) => set('applicationDate', e.target.value)}
                />
              </LimsFieldWithAdd>
            </div>

            <div className="min-w-0 space-y-0.5">
              <Label htmlFor="app-inspection-date">Inspection Date</Label>
              <LimsFieldWithAdd
                addButton={
                  <button
                    type="button"
                    className={limsFieldAddBtnClass}
                    aria-label="Open calendar"
                    title="Pick date"
                    disabled={disabled}
                    onClick={() => openDatePicker(inspectionDateRef.current)}
                  >
                    <Calendar size={14} strokeWidth={2.25} aria-hidden />
                  </button>
                }
              >
                <Input
                  ref={inspectionDateRef}
                  id="app-inspection-date"
                  type="date"
                  className={dateInputClass}
                  value={form.inspectionDate}
                  disabled={disabled}
                  onChange={(e) => set('inspectionDate', e.target.value)}
                />
              </LimsFieldWithAdd>
            </div>
          </>
        ) : null}

        {/* License: Process | License Number | Granted Date | Validity Date */}
        {showLicenseFields ? (
          <>
            <div className="min-w-0 space-y-0.5">
              <Label htmlFor="app-license">License Number</Label>
              <div className="flex items-stretch">
                <span className="inline-flex h-8 items-center border border-r-0 border-stone-500 bg-stone-100 px-2 text-xs font-semibold text-stone-700 sm:px-3">
                  CM/L-
                </span>
                <Input
                  id="app-license"
                  inputMode="numeric"
                  maxLength={10}
                  placeholder="0000000000"
                  className={cn(limsFieldClass, 'font-mono tabular-nums')}
                  value={form.licenseNumberDigits}
                  disabled={disabled}
                  onChange={(e) =>
                    set('licenseNumberDigits', e.target.value.replace(/\D/g, '').slice(0, 10))
                  }
                />
              </div>
            </div>

            <div className="min-w-0 space-y-0.5">
              <Label htmlFor="app-granted">Granted Date</Label>
              <LimsFieldWithAdd
                addButton={
                  <button
                    type="button"
                    className={limsFieldAddBtnClass}
                    aria-label="Open calendar"
                    title="Pick date"
                    disabled={disabled}
                    onClick={() => openDatePicker(grantedDateRef.current)}
                  >
                    <Calendar size={14} strokeWidth={2.25} aria-hidden />
                  </button>
                }
              >
                <Input
                  ref={grantedDateRef}
                  id="app-granted"
                  type="date"
                  className={dateInputClass}
                  value={form.grantedDate}
                  disabled={disabled}
                  onChange={(e) => set('grantedDate', e.target.value)}
                />
              </LimsFieldWithAdd>
            </div>

            <div className="min-w-0 space-y-0.5">
              <Label htmlFor="app-validity">Validity Date</Label>
              <LimsFieldWithAdd
                addButton={
                  <button
                    type="button"
                    className={limsFieldAddBtnClass}
                    aria-label="Open calendar"
                    title="Pick date"
                    disabled={disabled}
                    onClick={() => openDatePicker(validityDateRef.current)}
                  >
                    <Calendar size={14} strokeWidth={2.25} aria-hidden />
                  </button>
                }
              >
                <Input
                  ref={validityDateRef}
                  id="app-validity"
                  type="date"
                  className={dateInputClass}
                  value={form.licenseValidityDate}
                  disabled={disabled}
                  onChange={(e) => set('licenseValidityDate', e.target.value)}
                />
              </LimsFieldWithAdd>
            </div>
          </>
        ) : null}

        <div className="min-w-0 space-y-0.5">
          <MasterOptionFieldWithAdd
            category="bis_type_of_inspection"
            label="Type of Inspection"
            inputId="app-insp-type"
            listId="app-insp-type-list"
            value={form.typeOfInspection}
            onChange={(v) => set('typeOfInspection', v)}
            disabled={disabled}
            placeholder="Select or Add"
          />
        </div>
        </div>

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-5 sm:gap-3">
          <MasterOptionFieldWithAdd
            category="unit_of_is"
            label="Production Unit"
            manageTitle="Unit of IS"
            inputId="app-production-unit"
            listId="app-production-unit-list"
            value={form.productionUnit}
            onChange={(value) => set('productionUnit', value)}
            disabled={disabled}
            placeholder="Select or Add Unit"
          />
          <div className="min-w-0 space-y-0.5">
            <Label htmlFor="app-installed-capacity">Installed Capacity</Label>
            <Input id="app-installed-capacity" type="text" inputMode="decimal" className={limsFieldClass} value={form.installedCapacity} disabled={disabled} onBlur={() => {
              const installedCapacity = formatCapacity(form.installedCapacity)
              const actual = Number(form.actualCapacity)
              const actualCapacity = installedCapacity && Number.isFinite(actual) && actual >= Number(installedCapacity)
                ? ''
                : !installedCapacity ? '' : form.actualCapacity ? formatCapacity(form.actualCapacity) : ''
              onChange({
                ...form,
                installedCapacity,
                actualCapacity,
                productionValue: calculatedProductionValue(actualCapacity, form.productionRate),
              })
            }} onChange={(e) => {
              const installed = sanitizeCapacity(e.target.value)
              const actual = Number(form.actualCapacity)
              const actualCapacity = installed && Number.isFinite(actual) && actual >= Number(installed) ? '' : !installed ? '' : form.actualCapacity
              onChange({
                ...form,
                installedCapacity: installed,
                actualCapacity,
                productionValue: calculatedProductionValue(actualCapacity, form.productionRate),
              })
            }} />
          </div>
          <div className="min-w-0 space-y-0.5">
            <Label htmlFor="app-actual-capacity">Actual Capacity</Label>
            <Input id="app-actual-capacity" type="text" inputMode="decimal" className={limsFieldClass} value={form.actualCapacity} disabled={disabled || !form.installedCapacity} onBlur={() => {
              const actualCapacity = formatCapacity(form.actualCapacity)
              if (actualCapacity && Number(actualCapacity) >= Number(form.installedCapacity)) return
              onChange({
                ...form,
                actualCapacity,
                productionValue: calculatedProductionValue(actualCapacity, form.productionRate),
              })
            }} onChange={(e) => {
              const actual = sanitizeCapacity(e.target.value)
              if (actual && Number(actual) >= Number(form.installedCapacity)) return
              onChange({
                ...form,
                actualCapacity: actual,
                productionValue: calculatedProductionValue(actual, form.productionRate),
              })
            }} />
          </div>
          <div className="min-w-0 space-y-0.5">
            <Label htmlFor="app-production-rate">Rate / Unit</Label>
            <div className="flex h-8 min-w-0 overflow-hidden border border-stone-500 bg-stone-50 focus-within:border-amber-600 focus-within:bg-white focus-within:ring-2 focus-within:ring-amber-500/20">
              <span className="inline-flex shrink-0 items-center border-r border-stone-500 bg-stone-100 px-2 text-sm font-semibold text-stone-700" aria-hidden>{getCurrencySymbol()}</span>
              <Input
                id="app-production-rate"
                type="text"
                inputMode="decimal"
                value={form.productionRate}
                disabled={disabled}
                onChange={(e) => {
                  const productionRate = sanitizeMoneyInput(e.target.value)
                  onChange({ ...form, productionRate, productionValue: calculatedProductionValue(form.actualCapacity, productionRate) })
                }}
                onBlur={() => {
                  if (form.productionRate) {
                    const productionRate = formatMoneyInput(form.productionRate)
                    onChange({ ...form, productionRate, productionValue: calculatedProductionValue(form.actualCapacity, productionRate) })
                  }
                }}
                className="h-full min-w-0 flex-1 rounded-none border-0 bg-transparent text-right tabular-nums shadow-none focus-visible:ring-0"
                aria-label={`Rate per unit in ${getCurrencyCode()}`}
              />
            </div>
          </div>
          <div className="min-w-0 space-y-0.5">
            <Label htmlFor="app-production-value">Production Value</Label>
            <div className="flex h-8 min-w-0 overflow-hidden border border-stone-500 bg-stone-100">
              <span className="inline-flex shrink-0 items-center border-r border-stone-500 bg-stone-100 px-2 text-sm font-semibold text-stone-700" aria-hidden>{getCurrencySymbol()}</span>
              <Input id="app-production-value" className="h-full min-w-0 flex-1 rounded-none border-0 bg-transparent text-right tabular-nums shadow-none" value={form.productionValue} readOnly disabled={disabled} aria-label={`Calculated production value in ${getCurrencyCode()}`} />
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4 sm:gap-3">
        <div className="min-w-0">
          <div className="min-w-0 space-y-0.5">
            <Label htmlFor="app-branch-name">Branch Name</Label>
            <FilterCombobox
              inputId="app-branch-name"
              listId="app-branch-name-list"
              value={branchDropdownOpen ? branchQuery : branchOfficeDisplayName(form.branchName)}
              onValueChange={(value) => {
                setBranchQuery(value)
              }}
              options={filteredBranchOptions}
              onSelectOption={(option) => {
                const office = branchOffices.find((candidate) => candidate.id === option.id)
                if (!office) return
                onChange({ ...form, branchName: office.name, branchState: office.state ?? '' })
                setBranchQuery(branchOfficeDisplayName(office.name))
                setBranchDropdownOpen(false)
              }}
              open={branchDropdownOpen}
              onOpenChange={setBranchDropdownOpen}
              onInputFocus={() => setBranchQuery(form.branchName)}
              placeholder={branchOffices.length ? 'Type to search BIS branch offices' : 'No BIS branch offices available'}
              disabled={disabled || branchOffices.length === 0}
              showSerialNumbers={false}
              inputClassName={limsFieldClass}
            />
          </div>
        </div>

        <div className="min-w-0">
          <div className="min-w-0 space-y-0.5">
            <Label htmlFor="app-branch-state">Branch State</Label>
            <Input id="app-branch-state" className={limsFieldClass} value={form.branchState} readOnly disabled={disabled} placeholder="Auto-selected from branch" />
          </div>
        </div>

        <div className="min-w-0">
          <MasterOptionFieldWithAdd
            category="bis_officer_name"
            label="Branch Head Name"
            manageTitle="Officer Name"
            inputId="app-branch-head"
            listId="app-branch-head-list"
            value={form.branchHeadName}
            onChange={(v) => set('branchHeadName', v)}
            disabled={disabled}
            placeholder="Select or Add"
          />
        </div>

        <div className="min-w-0">
          <MasterOptionFieldWithAdd
            category="designation"
            label="Branch Head Designation"
            manageTitle="Designation"
            inputId="app-branch-head-desig"
            listId="app-branch-head-desig-list"
            value={form.branchHeadDesignation}
            onChange={(v) => set('branchHeadDesignation', v)}
            disabled={disabled}
            placeholder="Select or Add"
          />
        </div>
        </div>

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4 sm:gap-3">
        <div className="min-w-0">
          <MasterOptionFieldWithAdd
            category="bis_officer_name"
            label="Inspection Officer Name"
            manageTitle="Officer Name"
            inputId="app-insp-officer"
            listId="app-insp-officer-list"
            value={form.inspectionOfficerName}
            onChange={(v) => set('inspectionOfficerName', v)}
            disabled={disabled}
            placeholder="Select or Add"
          />
        </div>

        <div className="min-w-0">
          <MasterOptionFieldWithAdd
            category="designation"
            label="Inspection Officer Designation"
            manageTitle="Designation"
            inputId="app-insp-desig"
            listId="app-insp-desig-list"
            value={form.inspectionOfficerDesignation}
            onChange={(v) => set('inspectionOfficerDesignation', v)}
            disabled={disabled}
            placeholder="Select or Add"
          />
        </div>

        <div className="min-w-0">
          <MasterOptionFieldWithAdd
            category="bis_officer_name"
            label="Dealing Officer Name"
            manageTitle="Officer Name"
            inputId="app-deal-officer"
            listId="app-deal-officer-list"
            value={form.dealingOfficerName}
            onChange={(v) => set('dealingOfficerName', v)}
            disabled={disabled}
            placeholder="Select or Add"
          />
        </div>

        <div className="min-w-0">
          <MasterOptionFieldWithAdd
            category="designation"
            label="Dealing Officer Designation"
            manageTitle="Designation"
            inputId="app-deal-desig"
            listId="app-deal-desig-list"
            value={form.dealingOfficerDesignation}
            onChange={(v) => set('dealingOfficerDesignation', v)}
            disabled={disabled}
            placeholder="Select or Add"
          />
        </div>
        </div>
      </div>
    </div>
  )
}
