import { useRef } from 'react'
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
import { MasterOptionFieldWithAdd } from './MasterOptionFieldWithAdd'
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

/** Top row: Process + 3 kind fields = 4 equal columns. */
const topColClass = 'col-span-12 space-y-0.5 sm:col-span-3'

export function ApplicationDetailsFields({
  form,
  onChange,
  disabled = false,
  projectKind,
}: {
  form: BisApplicationDetailsForm
  onChange: (next: BisApplicationDetailsForm) => void
  disabled?: boolean
  /** When Application: show app number/dates. When License: show license number/dates. */
  projectKind?: string | null
}) {
  const applicationDateRef = useRef<HTMLInputElement | null>(null)
  const inspectionDateRef = useRef<HTMLInputElement | null>(null)
  const grantedDateRef = useRef<HTMLInputElement | null>(null)
  const validityDateRef = useRef<HTMLInputElement | null>(null)

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

      <div className="grid grid-cols-12 gap-2 sm:gap-3">
        <div className={topColClass}>
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
              <SelectItem value="simplified">Simplified</SelectItem>
              <SelectItem value="normal">Normal</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Application: Process | Number | App Date | Inspection Date */}
        {showApplicationNumberFields ? (
          <>
            <div className={topColClass}>
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

            <div className={topColClass}>
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

            <div className={topColClass}>
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
            <div className={topColClass}>
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

            <div className={topColClass}>
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

            <div className={topColClass}>
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

        <div className="col-span-12 sm:col-span-4">
          <MasterOptionFieldWithAdd
            category="bis_branch_name"
            label="Branch Name"
            inputId="app-branch-name"
            listId="app-branch-name-list"
            value={form.branchName}
            onChange={(v) => set('branchName', v)}
            disabled={disabled}
            placeholder="Select Branch"
          />
        </div>

        <div className="col-span-12 sm:col-span-4">
          <MasterOptionFieldWithAdd
            category="state"
            label="Branch State"
            inputId="app-branch-state"
            listId="app-branch-state-list"
            value={form.branchState}
            onChange={(v) => set('branchState', v)}
            disabled={disabled}
            placeholder="Select State"
          />
        </div>

        <div className="col-span-12 sm:col-span-4">
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

        <div className="col-span-12 sm:col-span-4">
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

        <div className="col-span-12 sm:col-span-4">
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

        <div className="col-span-12 sm:col-span-4">
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

        <div className="col-span-12 sm:col-span-4">
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

        <div className="col-span-12 sm:col-span-4">
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

        <div className="col-span-12 sm:col-span-4">
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
  )
}
