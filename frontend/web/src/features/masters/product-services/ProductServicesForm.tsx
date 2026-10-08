import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { MeasurementUnitSelect } from '@/features/masters/measurement-units/MeasurementUnitSelect'
import {
  limsPrimaryBtnClass,
  limsRegistryFormClass,
} from '@/lib/limsThemeUi'
import { cn } from '@/lib/utils'
import { NablLookupSelect } from './NablLookupSelect'
import { NablTestMethodSelect } from './NablTestMethodSelect'
import {
  isValidNumberOrEmpty,
  joinUncertaintyParts,
  NABL_SCOPE_STATUS_OPTIONS,
  NABL_TYPE_OF_TEST_OPTIONS,
  splitUncertaintyParts,
  type NablScopeForm,
} from './types'

export function ProductServicesForm({
  form,
  onChange,
  canSave,
  saveLoading,
  onSave,
}: {
  form: NablScopeForm
  onChange: (next: NablScopeForm) => void
  canSave: boolean
  saveLoading: boolean
  onSave: () => void
}) {
  const rangeMinError = isValidNumberOrEmpty(form.rangeMinimum) ? null : 'Range minimum must be a number'
  const rangeMaxError = isValidNumberOrEmpty(form.rangeMaximum) ? null : 'Range maximum must be a number'
  const minNum = form.rangeMinimum.trim() ? Number(form.rangeMinimum) : null
  const maxNum = form.rangeMaximum.trim() ? Number(form.rangeMaximum) : null
  const rangeOrderError =
    minNum != null && maxNum != null && minNum > maxNum
      ? 'Range minimum cannot be greater than range maximum'
      : null

  const uncertaintyParts = splitUncertaintyParts(form.uncertainty)

  const patchUncertainty = (patch: Partial<typeof uncertaintyParts>) => {
    onChange({
      ...form,
      uncertainty: joinUncertaintyParts({ ...uncertaintyParts, ...patch }),
    })
  }

  return (
    <div className={cn(limsRegistryFormClass, 'space-y-5')}>
      {(rangeMinError || rangeMaxError || rangeOrderError) && (
        <p className="border-l-2 border-destructive bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {rangeMinError || rangeMaxError || rangeOrderError}
        </p>
      )}

      <div className="grid gap-4 md:grid-cols-3">
        <NablLookupSelect
          kind="discipline_group"
          id="nabl-discipline"
          label="Discipline / Group"
          value={form.disciplineGroup}
          onChange={(disciplineGroup) => onChange({ ...form, disciplineGroup })}
          placeholder="CHEMICAL- BUILDING MATERIAL"
        />

        <NablTestMethodSelect
          id="nabl-method"
          value={form.testMethodSpecification}
          onChange={(testMethodSpecification) =>
            onChange({ ...form, testMethodSpecification })
          }
          placeholder="IS 2386: 1963"
        />

        <div className="space-y-2">
          <Label>Permanent Testing</Label>
          <Select
            value={form.permanentTesting}
            onValueChange={(v) => onChange({ ...form, permanentTesting: v })}
          >
            <SelectTrigger aria-label="Permanent testing">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="Permanent Testing">Permanent Testing</SelectItem>
              <SelectItem value="Temporary Testing">Temporary Testing</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <NablLookupSelect
          kind="materials_products"
          id="nabl-materials"
          label="Materials or Products Tested"
          value={form.materialsProducts}
          onChange={(materialsProducts) => onChange({ ...form, materialsProducts })}
          placeholder="Fine & Coarse Aggregates"
        />

        <div className="space-y-2">
          <Label htmlFor="nabl-component">Component / Parameter / Test Performed</Label>
          <Textarea
            id="nabl-component"
            value={form.componentParameter}
            onChange={(e) => onChange({ ...form, componentParameter: e.target.value })}
            placeholder="Organic Impurities"
            rows={1}
            className="!min-h-8 resize-y"
          />
        </div>

        <div className="space-y-2">
          <Label>Status of Scope</Label>
          <Select
            value={form.scopeStatus}
            onValueChange={(v) =>
              onChange({
                ...form,
                scopeStatus: v === 'Accredited' ? 'Accredited' : 'Draft Scope',
              })
            }
          >
            <SelectTrigger aria-label="Status of Scope">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {NABL_SCOPE_STATUS_OPTIONS.map((opt) => (
                <SelectItem key={opt} value={opt}>
                  {opt}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <div className="space-y-2">
          <Label>Type of Test</Label>
          <Select
            value={form.typeOfTest || '__none__'}
            onValueChange={(v) =>
              onChange({ ...form, typeOfTest: v === '__none__' ? '' : v })
            }
          >
            <SelectTrigger aria-label="Type of test">
              <SelectValue placeholder="Select type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">—</SelectItem>
              {NABL_TYPE_OF_TEST_OPTIONS.map((opt) => (
                <SelectItem key={opt} value={opt}>
                  {opt}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="nabl-range-min">Range Minimum</Label>
          <Input
            id="nabl-range-min"
            type="number"
            inputMode="decimal"
            step="any"
            value={form.rangeMinimum}
            onChange={(e) => onChange({ ...form, rangeMinimum: e.target.value })}
            placeholder="e.g. 0.01"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="nabl-range-max">Range Maximum</Label>
          <Input
            id="nabl-range-max"
            type="number"
            inputMode="decimal"
            step="any"
            value={form.rangeMaximum}
            onChange={(e) => onChange({ ...form, rangeMaximum: e.target.value })}
            placeholder="e.g. 100"
          />
        </div>

        <MeasurementUnitSelect
          id="nabl-unit"
          label="Unit"
          value={form.unit}
          onChange={(unit) => {
            onChange({
              ...form,
              unit,
              uncertainty: joinUncertaintyParts({
                ...uncertaintyParts,
                muUnit: unit,
                testUnit: unit,
              }),
            })
          }}
          showManageButton
          placeholder="Select unit"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="nabl-uncertainty-mu">Uncertainty</Label>
        <div className="grid grid-cols-1 items-end gap-2 sm:grid-cols-[auto_minmax(0,1fr)_minmax(0,1.1fr)_auto_minmax(0,1fr)_minmax(0,1.1fr)]">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center border border-stone-500 bg-stone-100 text-sm font-semibold text-stone-700">
            ±
          </div>
          <div className="min-w-0 space-y-1">
            <span className="sr-only">MU Value</span>
            <Input
              id="nabl-uncertainty-mu"
              inputMode="decimal"
              placeholder="MU Value"
              value={uncertaintyParts.muValue}
              onChange={(e) =>
                patchUncertainty({ muValue: e.target.value.replace(/[^0-9.]/g, '') })
              }
              aria-label="MU value"
            />
          </div>
          <div className="min-w-0">
            <MeasurementUnitSelect
              id="nabl-uncertainty-mu-unit"
              value={uncertaintyParts.muUnit}
              onChange={(muUnit) => patchUncertainty({ muUnit })}
              showLabel={false}
              showManageButton
              placeholder="MU Unit"
              className="min-w-0"
            />
          </div>
          <div className="flex h-8 w-8 shrink-0 items-center justify-center border border-stone-500 bg-stone-100 text-sm font-semibold text-stone-700">
            @
          </div>
          <div className="min-w-0 space-y-1">
            <span className="sr-only">Test Value</span>
            <Input
              id="nabl-uncertainty-test"
              inputMode="decimal"
              placeholder="Test Value"
              value={uncertaintyParts.testValue}
              onChange={(e) =>
                patchUncertainty({ testValue: e.target.value.replace(/[^0-9.]/g, '') })
              }
              aria-label="Test value"
            />
          </div>
          <div className="min-w-0">
            <MeasurementUnitSelect
              id="nabl-uncertainty-test-unit"
              value={uncertaintyParts.testUnit}
              onChange={(testUnit) => patchUncertainty({ testUnit })}
              showLabel={false}
              showManageButton
              placeholder="Test Unit"
              className="min-w-0"
            />
          </div>
        </div>
      </div>

      <div className="-mx-4 mt-2 flex items-center justify-end gap-2 border-t border-stone-300 bg-stone-50 px-4 py-3 sm:-mx-6 sm:px-6">
        <Button
          type="button"
          className={limsPrimaryBtnClass}
          onClick={onSave}
          disabled={!canSave}
        >
          {saveLoading ? 'Saving…' : 'Save & Close'}
        </Button>
      </div>
    </div>
  )
}
