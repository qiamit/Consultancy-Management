import { Fragment, useMemo, useRef, useState, type ReactNode } from 'react'
import { Calendar } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { LimsFieldWithAdd } from '@/components/lims/LimsFieldWithAdd'
import { limsFieldAddBtnClass } from '@/lib/limsThemeUi'
import { cn } from '@/lib/utils'
import { getCurrencyCode, getCurrencySymbol } from '@/lib/appCurrency'
import { formatMoneyInput, sanitizeMoneyInput } from '@/features/masters/products-services/types'
import { FilterCombobox, type FilterComboboxOption } from '@/features/sample-handling/receiving/FilterCombobox'
import type { BisBranchOfficeRow } from '@/features/masters/bis-branch-offices/bisBranchOfficesApi'
import { MasterOptionFieldWithAdd } from './MasterOptionFieldWithAdd'
import type { BisApplicationDetailsForm, BisApplicationProcess } from './types'

/* Same behaviour as ApplicationDetailsFields (Add / Edit Application), laid out like the Registration Details grid. */

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

const hideNativeCalendar =
  'min-w-0 h-8 rounded-none border-0 bg-transparent px-2 text-sm tabular-nums shadow-none focus-visible:ring-0 [&::-webkit-calendar-picker-indicator]:pointer-events-none [&::-webkit-calendar-picker-indicator]:opacity-0'
const plainInput =
  'h-8 w-full rounded-none border border-stone-300 bg-white px-2 text-sm shadow-none focus-visible:border-amber-600 focus-visible:ring-2 focus-visible:ring-amber-500/20'

const branchDisplayName = (raw: string) => raw.trim().replace(/^Bureau of Indian Standards\s*[-–—:]\s*/i, '')

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

export function ManakApplicationFields({
  form,
  onChange,
  disabled = false,
  branchOffices = [],
}: {
  form: BisApplicationDetailsForm
  onChange: (next: BisApplicationDetailsForm) => void
  disabled?: boolean
  branchOffices?: BisBranchOfficeRow[]
}) {
  const applicationDateRef = useRef<HTMLInputElement | null>(null)
  const inspectionDateRef = useRef<HTMLInputElement | null>(null)
  const [branchOpen, setBranchOpen] = useState(false)
  const [branchQuery, setBranchQuery] = useState('')

  const branchOptions = useMemo<FilterComboboxOption[]>(
    () =>
      branchOffices.map((o) => ({
        id: o.id,
        label: branchDisplayName(o.name),
        secondaryLabel: [o.city, o.state].filter(Boolean).join(', '),
      })),
    [branchOffices],
  )
  const filteredBranchOptions = useMemo(() => {
    const q = branchQuery.trim().toLocaleLowerCase()
    if (!q) return branchOptions
    return branchOptions.filter((o) => `${o.label} ${o.secondaryLabel ?? ''}`.toLocaleLowerCase().includes(q))
  }, [branchOptions, branchQuery])

  const set = <K extends keyof BisApplicationDetailsForm>(key: K, value: BisApplicationDetailsForm[K]) =>
    onChange({ ...form, [key]: value })

  const dateField = (id: string, ref: React.MutableRefObject<HTMLInputElement | null>, value: string, key: 'applicationDate' | 'inspectionDate') => (
    <LimsFieldWithAdd
      className="w-full"
      addButton={
        <button
          type="button"
          className={limsFieldAddBtnClass}
          aria-label="Open calendar"
          title="Pick date"
          disabled={disabled}
          onClick={() => openDatePicker(ref.current)}
        >
          <Calendar size={14} strokeWidth={2.25} aria-hidden />
        </button>
      }
    >
      <Input ref={ref} id={id} type="date" className={hideNativeCalendar} value={value} disabled={disabled} onChange={(e) => set(key, e.target.value)} />
    </LimsFieldWithAdd>
  )

  const master = (
    category: 'bis_type_of_inspection' | 'unit_of_is' | 'bis_officer_name' | 'designation',
    label: string,
    id: string,
    value: string,
    apply: (v: string) => void,
    manageTitle?: string,
  ) => (
    <MasterOptionFieldWithAdd
      category={category}
      label={label}
      manageTitle={manageTitle}
      inputId={id}
      listId={`${id}-list`}
      value={value}
      onChange={apply}
      disabled={disabled}
      placeholder="Select or Add"
      showLabel={false}
    />
  )

  const currencyBox = (readOnly: boolean, children: ReactNode) => (
    <div className={cn('flex h-8 min-w-0 overflow-hidden border border-stone-300', readOnly ? 'bg-stone-100' : 'bg-white focus-within:border-amber-600 focus-within:ring-2 focus-within:ring-amber-500/20')}>
      <span className="inline-flex shrink-0 items-center border-r border-stone-300 bg-stone-100 px-2 text-sm font-semibold text-stone-700" aria-hidden>
        {getCurrencySymbol()}
      </span>
      {children}
    </div>
  )

  const items: Array<[string, ReactNode]> = [
    [
      'Application Process',
      <Select key="p" value={form.applicationProcess} onValueChange={(v) => set('applicationProcess', v as BisApplicationProcess)} disabled={disabled}>
        <SelectTrigger id="app-process" className="h-8 rounded-none border-stone-300 bg-white text-sm" aria-label="Application Process">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="normal">Option 1</SelectItem>
          <SelectItem value="simplified">Option 2</SelectItem>
        </SelectContent>
      </Select>,
    ],
    [
      'Application Number',
      <div key="n" className="flex items-stretch">
        <span className="inline-flex h-8 items-center border border-r-0 border-stone-300 bg-stone-100 px-2 text-xs font-semibold text-stone-700">CM/A-</span>
        <Input
          id="app-number"
          inputMode="numeric"
          placeholder="0000000000"
          className={cn(plainInput, 'font-mono tabular-nums')}
          value={form.applicationNumber}
          disabled={disabled}
          onChange={(e) => set('applicationNumber', e.target.value.replace(/\D/g, ''))}
        />
      </div>,
    ],
    ['Application Date', dateField('app-date', applicationDateRef, form.applicationDate, 'applicationDate')],
    ['Inspection Date', dateField('app-inspection-date', inspectionDateRef, form.inspectionDate, 'inspectionDate')],
    ['Type of Inspection', master('bis_type_of_inspection', 'Type of Inspection', 'app-insp-type', form.typeOfInspection, (v) => set('typeOfInspection', v))],
    ['Production Unit', master('unit_of_is', 'Production Unit', 'app-production-unit', form.productionUnit, (v) => set('productionUnit', v), 'Unit of IS')],
    [
      'Installed Capacity',
      <Input
        key="ic"
        id="app-installed-capacity"
        type="text"
        inputMode="decimal"
        className={plainInput}
        value={form.installedCapacity}
        disabled={disabled}
        onChange={(e) => {
          const installed = sanitizeCapacity(e.target.value)
          const actual = Number(form.actualCapacity)
          const actualCapacity = installed && Number.isFinite(actual) && actual >= Number(installed) ? '' : !installed ? '' : form.actualCapacity
          onChange({ ...form, installedCapacity: installed, actualCapacity, productionValue: calculatedProductionValue(actualCapacity, form.productionRate) })
        }}
        onBlur={() => {
          const installedCapacity = formatCapacity(form.installedCapacity)
          const actual = Number(form.actualCapacity)
          const actualCapacity =
            installedCapacity && Number.isFinite(actual) && actual >= Number(installedCapacity)
              ? ''
              : !installedCapacity
                ? ''
                : form.actualCapacity
                  ? formatCapacity(form.actualCapacity)
                  : ''
          onChange({ ...form, installedCapacity, actualCapacity, productionValue: calculatedProductionValue(actualCapacity, form.productionRate) })
        }}
      />,
    ],
    [
      'Actual Capacity',
      <Input
        key="ac"
        id="app-actual-capacity"
        type="text"
        inputMode="decimal"
        className={plainInput}
        value={form.actualCapacity}
        disabled={disabled || !form.installedCapacity}
        onChange={(e) => {
          const actual = sanitizeCapacity(e.target.value)
          if (actual && Number(actual) >= Number(form.installedCapacity)) return
          onChange({ ...form, actualCapacity: actual, productionValue: calculatedProductionValue(actual, form.productionRate) })
        }}
        onBlur={() => {
          const actualCapacity = formatCapacity(form.actualCapacity)
          if (actualCapacity && Number(actualCapacity) >= Number(form.installedCapacity)) return
          onChange({ ...form, actualCapacity, productionValue: calculatedProductionValue(actualCapacity, form.productionRate) })
        }}
      />,
    ],
    [
      'Rate / Unit',
      currencyBox(
        false,
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
          className="h-full min-w-0 flex-1 rounded-none border-0 bg-transparent text-right text-sm tabular-nums shadow-none focus-visible:ring-0"
          aria-label={`Rate per unit in ${getCurrencyCode()}`}
        />,
      ),
    ],
    [
      'Production Value',
      currencyBox(
        true,
        <Input
          id="app-production-value"
          className="h-full min-w-0 flex-1 rounded-none border-0 bg-transparent text-right text-sm tabular-nums shadow-none"
          value={form.productionValue}
          readOnly
          disabled={disabled}
          aria-label={`Calculated production value in ${getCurrencyCode()}`}
        />,
      ),
    ],
    [
      'Branch Name',
      <FilterCombobox
        key="bn"
        inputId="app-branch-name"
        listId="app-branch-name-list"
        value={branchOpen ? branchQuery : branchDisplayName(form.branchName)}
        onValueChange={setBranchQuery}
        options={filteredBranchOptions}
        onSelectOption={(option) => {
          const office = branchOffices.find((c) => c.id === option.id)
          if (!office) return
          onChange({ ...form, branchName: office.name, branchState: office.state ?? '' })
          setBranchQuery(branchDisplayName(office.name))
          setBranchOpen(false)
        }}
        open={branchOpen}
        onOpenChange={setBranchOpen}
        onInputFocus={() => setBranchQuery(form.branchName)}
        placeholder={branchOffices.length ? 'Type to search BIS branch offices' : 'No BIS branch offices available'}
        disabled={disabled || branchOffices.length === 0}
        showSerialNumbers={false}
        inputClassName="h-8 rounded-none border border-stone-300 bg-white px-2 text-sm"
      />,
    ],
    [
      'Branch State',
      <Input key="bs" id="app-branch-state" className={cn(plainInput, 'bg-stone-100')} value={form.branchState} readOnly disabled={disabled} placeholder="Auto-selected from branch" />,
    ],
    ['Branch Head Name', master('bis_officer_name', 'Branch Head Name', 'app-branch-head', form.branchHeadName, (v) => set('branchHeadName', v), 'Officer Name')],
    ['Branch Head Designation', master('designation', 'Branch Head Designation', 'app-branch-head-desig', form.branchHeadDesignation, (v) => set('branchHeadDesignation', v), 'Designation')],
    ['Inspection Officer Name', master('bis_officer_name', 'Inspection Officer Name', 'app-insp-officer', form.inspectionOfficerName, (v) => set('inspectionOfficerName', v), 'Officer Name')],
    ['Inspection Officer Designation', master('designation', 'Inspection Officer Designation', 'app-insp-desig', form.inspectionOfficerDesignation, (v) => set('inspectionOfficerDesignation', v), 'Designation')],
    ['Dealing Officer Name', master('bis_officer_name', 'Dealing Officer Name', 'app-deal-officer', form.dealingOfficerName, (v) => set('dealingOfficerName', v), 'Officer Name')],
    ['Dealing Officer Designation', master('designation', 'Dealing Officer Designation', 'app-deal-desig', form.dealingOfficerDesignation, (v) => set('dealingOfficerDesignation', v), 'Designation')],
  ]

  // First two lines hold three fields each (process, number, date; then unit, inspection date, type);
  // everything else follows in two columns.
  const lines: string[][] = [
    ['Application Process', 'Application Number', 'Application Date'],
    ['Production Unit', 'Inspection Date', 'Type of Inspection'],
    ['Installed Capacity', 'Actual Capacity', 'Rate / Unit', 'Production Value'],
  ]
  const lineItems = lines.map((labels) =>
    labels.map((l) => items.find(([label]) => label === l)).filter((x): x is [string, ReactNode] => Boolean(x)),
  )
  const pairLines: string[][] = [
    ['Branch Name', 'Branch State'],
    ['Branch Head Name', 'Branch Head Designation'],
    ['Dealing Officer Name', 'Dealing Officer Designation'],
    ['Inspection Officer Name', 'Inspection Officer Designation'],
  ]
  const find = (l: string) => items.find(([label]) => label === l)
  const pairItems = pairLines.map((labels) => labels.map(find).filter((x): x is [string, ReactNode] => Boolean(x)))
  const labelCls =
    'w-[1%] whitespace-nowrap border border-[#e7e0d4] bg-[#f7f3eb] px-3 py-1.5 text-left align-middle text-sm font-bold text-stone-800'
  const valueCls = 'border border-[#e7e0d4] px-2 py-1.5 align-middle text-sm text-stone-700'
  // Three-field lines share one table; two-field lines get their own table split into four equal parts
  // (label | value | label | value, 25% each).
  // Every row with the same number of fields uses equal-width columns (label and value alike):
  // 3 fields -> six equal columns, 4 fields -> eight, 2 fields -> four.
  const lineTable = (list: Array<[string, ReactNode]>, first: boolean) => (
    <table className={cn('w-full table-fixed border-collapse', !first && '-mt-px')}>
      <colgroup>
        {Array.from({ length: list.length * 2 }, (_, k) => (
          <col key={k} style={{ width: `${100 / (list.length * 2)}%` }} />
        ))}
      </colgroup>
      <tbody>
        <tr>
          {list.map((cell, j) => (
            <Fragment key={j}>
              <th
                scope="row"
                className={cn(labelCls, 'w-auto whitespace-normal', list.length > 3 && 'whitespace-nowrap px-2 text-xs')}
              >
                {cell[0]}:
              </th>
              <td className={valueCls}>{cell[1]}</td>
            </Fragment>
          ))}
        </tr>
      </tbody>
    </table>
  )
  return (
    <div className="manak-kv overflow-x-auto">
      {lineItems.map((list, i) => (
        <Fragment key={i}>{lineTable(list, i === 0)}</Fragment>
      ))}
      <table className="-mt-px w-full table-fixed border-collapse">
        <colgroup>
          <col className="w-1/4" />
          <col className="w-1/4" />
          <col className="w-1/4" />
          <col className="w-1/4" />
        </colgroup>
        <tbody>
          {pairItems.map((pair, i) => (
            <tr key={`w${i}`}>
              <th scope="row" className={cn(labelCls, 'w-auto whitespace-normal')}>
                {pair[0] ? `${pair[0][0]}:` : ''}
              </th>
              <td className={valueCls}>{pair[0] ? pair[0][1] : null}</td>
              <th scope="row" className={cn(labelCls, 'w-auto whitespace-normal')}>
                {pair[1] ? `${pair[1][0]}:` : ''}
              </th>
              <td className={valueCls}>{pair[1] ? pair[1][1] : null}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
