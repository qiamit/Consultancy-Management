import { useState, type KeyboardEvent } from 'react'
import { Calculator, Calendar, Plus, Scissors, Trash2 } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { LimsFieldWithAdd } from '@/components/lims/LimsFieldWithAdd'
import { limsFieldAddBtnClass } from '@/lib/limsThemeUi'
import { cn } from '@/lib/utils'
import { formatMoneyInput } from '@/features/masters/products-services/types'
import { getCurrencySymbol } from '@/lib/appCurrency'
import {
  calculateRenewalProductionRow,
  coveredProductionExceedsTotal,
  emptyRenewalProductionRow,
  formatDisplayDate,
  renewalSlabForQuantity,
  splitProductionRowForStockMarking,
  type RenewalProductionRow,
  type RenewalSlabRate,
} from './types'

function decimal(value: string): number {
  const parsed = Number.parseFloat(value.replace(/,/g, ''))
  return Number.isFinite(parsed) ? parsed : 0
}

function sumField(rows: RenewalProductionRow[], field: keyof RenewalProductionRow): number | null {
  const values = rows.map((row) => row[field]).filter((value): value is string => typeof value === 'string' && value.trim() !== '')
  return values.length ? values.reduce((sum, value) => sum + decimal(value), 0) : null
}

function formatQuantityTotal(value: number | null): string {
  return value === null ? '—' : new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 }).format(value)
}

function formatAmountTotal(value: number | null): string {
  return value === null ? '—' : formatMoneyInput(value.toFixed(2))
}

function moveToAdjacentProductionQuantity(event: KeyboardEvent<HTMLInputElement>) {
  if (event.key !== 'Tab') return
  const inputs = Array.from(document.querySelectorAll<HTMLInputElement>('[data-renewal-quantity]'))
    .filter((input) => !input.disabled && input.getClientRects().length > 0)
  const currentIndex = inputs.indexOf(event.currentTarget)
  if (currentIndex < 0) return
  const next = inputs[currentIndex + (event.shiftKey ? -1 : 1)]
  if (!next) return
  event.preventDefault()
  next.focus()
}

const periodDateInputClass =
  'min-w-0 border-0 bg-transparent pl-2 pr-1 text-left tabular-nums shadow-none focus-visible:ring-0 [&::-webkit-calendar-picker-indicator]:pointer-events-none [&::-webkit-calendar-picker-indicator]:absolute [&::-webkit-calendar-picker-indicator]:h-0 [&::-webkit-calendar-picker-indicator]:w-0 [&::-webkit-calendar-picker-indicator]:opacity-0'

function openDatePicker(id: string) {
  const input = document.getElementById(id)
  if (!(input instanceof HTMLInputElement) || input.disabled) return
  try {
    if (typeof input.showPicker === 'function') {
      input.showPicker()
      return
    }
  } catch {
    // Some browsers only allow opening the native picker in a user gesture.
  }
  input.focus()
}

export function PeriodDateInput({
  id,
  label,
  value,
  onChange,
  disabled = false,
}: {
  id: string
  label: string
  value: string
  onChange: (value: string) => void
  disabled?: boolean
}) {
  return (
    <LimsFieldWithAdd
      addButton={(
        <button
          type="button"
          className={limsFieldAddBtnClass}
          aria-label="Open calendar"
          title="Pick date"
          disabled={disabled}
          onClick={() => openDatePicker(id)}
        >
          <Calendar size={14} strokeWidth={2.25} aria-hidden />
        </button>
      )}
    >
      <Input
        id={id}
        type="date"
        aria-label={label}
        disabled={disabled}
        className={periodDateInputClass}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </LimsFieldWithAdd>
  )
}

function NumberCell({
  value,
  label,
  onChange,
  error,
  disabled = false,
  quantityTabOrder = false,
}: {
  value: string
  label: string
  onChange: (value: string) => void
  error?: string
  disabled?: boolean
  quantityTabOrder?: boolean
}) {
  return (
    <div className="min-w-0">
      <Input
        aria-label={label}
        aria-invalid={Boolean(error)}
        disabled={disabled}
        data-renewal-quantity={quantityTabOrder ? '' : undefined}
        onKeyDown={quantityTabOrder ? moveToAdjacentProductionQuantity : undefined}
        inputMode="decimal"
        title={error}
        className={cn(
          'h-8 w-full min-w-0 rounded-none border-stone-400 px-1 text-center tabular-nums',
          error && 'border-destructive focus-visible:ring-destructive',
        )}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
      {error ? <p className="mt-0.5 text-[10px] leading-tight text-destructive" role="alert">{error}</p> : null}
    </div>
  )
}

function CalculatedAmount({ value }: { value: string }) {
  return (
    <div className="flex h-8 w-full min-w-0 items-center justify-end overflow-hidden border border-stone-300 bg-stone-50 px-1 text-right font-medium tabular-nums">
      {value ? formatMoneyInput(value) : '—'}
    </div>
  )
}

export function RenewalProductionTable({
  rows,
  unitOfIs,
  renewalPeriodFrom,
  basicUnitRate,
  slabRates,
  onRowsChange,
}: {
  rows: RenewalProductionRow[]
  unitOfIs: string
  renewalPeriodFrom: string
  basicUnitRate: string
  slabRates: RenewalSlabRate[]
  onRowsChange: (rows: RenewalProductionRow[]) => void
}) {
  const [calculationSelection, setCalculationSelection] = useState<{
    rows: RenewalProductionRow[]
    total: boolean
  } | null>(null)
  const [breakSelection, setBreakSelection] = useState<{ row: RenewalProductionRow; from: string; to: string; error: string } | null>(null)
  const calculatedRows = rows.map((row) => calculateRenewalProductionRow(row, basicUnitRate, slabRates))
  const totalProduction = sumField(calculatedRows, 'productionUnit')
  const totalProductionValue = sumField(calculatedRows, 'productionValue')
  const totalCovered = sumField(calculatedRows, 'coveredUnit')
  const totalCoveredValue = sumField(calculatedRows, 'coveredValue')
  const totalMarkingFee = sumField(calculatedRows, 'markingFee')
  const totalCoveredPercent = totalProduction && totalProduction > 0 && totalCovered !== null
    ? ((totalCovered / totalProduction) * 100).toFixed(2)
    : '—'

  const update = (id: string, field: keyof RenewalProductionRow, value: string) => {
    onRowsChange(rows.map((row) => row.id === id
      ? { ...row, [field]: value, ...(field === 'productionUnit' || field === 'coveredUnit' ? { coveredPercent: '' } : {}) }
      : row))
  }

  const addPeriod = () => {
    onRowsChange([...rows, emptyRenewalProductionRow()])
  }

  const rowActions = (row: RenewalProductionRow, index: number, isLast: boolean) => (
    <div className="flex items-center justify-center gap-0.5">
      {isLast ? (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={`Add production period after row ${index + 1}`}
          title="Add period"
          className="size-7 shrink-0 rounded-none text-emerald-800 hover:bg-emerald-50"
          onClick={addPeriod}
        >
          <Plus className="size-4" />
        </Button>
      ) : null}
      {!row.stockMarkingBreak ? <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label={`Add stock-marking break to production period ${index + 1}`}
        title="Insert stock-marking break within this period"
        className="size-7 shrink-0 rounded-none text-stone-700 hover:bg-stone-100"
        disabled={!row.periodFrom || !row.periodTo}
        onClick={() => setBreakSelection({ row, from: row.periodFrom, to: row.periodTo, error: '' })}
      >
        <Scissors className="size-4" />
      </Button> : null}
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label={`Delete production period ${index + 1}`}
        title="Delete period"
        className="size-7 shrink-0 rounded-none text-red-700 hover:bg-red-50 hover:text-red-800"
        onClick={() => onRowsChange(rows.filter((item) => item.id !== row.id))}
      >
        <Trash2 className="size-4" />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label={`Calculation step for production period ${index + 1}`}
        title="Show marking fee calculation steps"
        className="size-7 shrink-0 rounded-none text-amber-800 hover:bg-amber-50"
        onClick={() => setCalculationSelection({ rows: [row], total: false })}
      >
        <Calculator className="size-4" />
      </Button>
    </div>
  )

  const emptyRowAction = (
    <Button type="button" variant="outline" className="rounded-none" onClick={() => onRowsChange([emptyRenewalProductionRow()])}>
      <Plus className="mr-1 size-4" /> Add Period
    </Button>
  )

  return (
    <section>
      <div className="hidden xl:block">
        <table className="w-full table-fixed border-collapse text-[11px]">
          <colgroup>
            <col className="w-[13%]" /><col className="w-[13%]" /><col className="w-[12%]" />
            <col className="w-[10%]" /><col className="w-[12%]" /><col className="w-[10%]" />
            <col className="w-[9%]" /><col className="w-[10%]" /><col className="w-[11%]" />
          </colgroup>
          <thead className="bg-stone-800 text-amber-100">
            <tr className="bg-stone-100 text-stone-900">
              <th colSpan={2} className="border border-stone-300 px-1 py-2 text-center font-bold">Total Production</th>
              <th className="border border-stone-300 px-1 py-2 text-center font-bold tabular-nums">{formatQuantityTotal(totalProduction)}</th>
              <th className="border border-stone-300 px-1 py-2 text-center font-bold tabular-nums">{formatAmountTotal(totalProductionValue)}</th>
              <th className="border border-stone-300 px-1 py-2 text-center font-bold tabular-nums">{formatQuantityTotal(totalCovered)}</th>
              <th className="border border-stone-300 px-1 py-2 text-center font-bold tabular-nums">{formatAmountTotal(totalCoveredValue)}</th>
              <th className="border border-stone-300 px-1 py-2 text-center font-bold tabular-nums">{totalCoveredPercent}</th>
              <th className="border border-stone-300 px-1 py-2 text-center font-bold tabular-nums">{formatAmountTotal(totalMarkingFee)}</th>
              <th className="border border-stone-300 px-1 py-1 text-center">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label="Calculation steps for total marking fee"
                  title="Show total marking fee calculation"
                  className="size-7 rounded-none text-amber-800 hover:bg-amber-50"
                  onClick={() => setCalculationSelection({ rows: calculatedRows, total: true })}
                >
                  <Calculator className="size-4" />
                </Button>
              </th>
            </tr>
            <tr>
              {[
                { key: 'from', label: 'Period Start' },
                { key: 'to', label: 'Period End' },
                { key: 'production', label: <><span>Total Production</span>{unitOfIs ? <span className="block">in {unitOfIs}</span> : null}</> },
                { key: 'productionValue', label: <><span>Value</span><span className="block">in Rs</span></> },
                { key: 'covered', label: <><span>Covered Production</span>{unitOfIs ? <span className="block">in {unitOfIs}</span> : null}</> },
                { key: 'coveredValue', label: <><span>Value</span><span className="block">in Rs</span></> },
                { key: 'percent', label: <><span>Covered Qty</span><span className="block">in %</span></> },
                { key: 'markingFee', label: <><span>Marking Fee</span><span className="block">in Rs</span></> },
                { key: 'action', label: 'Action' },
              ].map(({ key, label }) => (
                <th key={key} className="border border-stone-600 px-1 py-2 text-center font-semibold leading-tight">
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {calculatedRows.map((row, index) => {
              return (
              <tr key={row.id} className={cn(row.stockMarkingBreak ? 'bg-amber-50' : index % 2 ? 'bg-stone-50' : 'bg-white')}>
                <td className="border border-stone-300 p-1"><PeriodDateInput id={`renewal-period-from-desktop-${row.id}`} label={`Period from ${index + 1}`} value={index === 0 ? renewalPeriodFrom : row.periodFrom} disabled={index === 0 || row.stockMarkingBreak} onChange={(value) => update(row.id, 'periodFrom', value)} />{row.stockMarkingBreak ? <span className="mt-1 block text-center text-[9px] font-semibold text-amber-900">Stock Marking — No Production</span> : null}</td>
                <td className="border border-stone-300 p-1"><PeriodDateInput id={`renewal-period-to-desktop-${row.id}`} label={`Period to ${index + 1}`} value={row.periodTo} disabled={row.stockMarkingBreak} onChange={(value) => update(row.id, 'periodTo', value)} /></td>
                <td className="border border-stone-300 p-1">{row.stockMarkingBreak ? <div className="flex h-8 items-center justify-center border border-stone-300 bg-stone-50 tabular-nums">0</div> : <NumberCell label={`Total production units ${index + 1}`} value={row.productionUnit} quantityTabOrder onChange={(value) => update(row.id, 'productionUnit', value)} />}</td>
                <td className="border border-stone-300 p-1"><CalculatedAmount value={row.productionValue} /></td>
                <td className="border border-stone-300 p-1">{row.stockMarkingBreak ? <div className="flex h-8 items-center justify-center border border-stone-300 bg-stone-50 tabular-nums">0</div> : <NumberCell label={`Quantity covered units ${index + 1}`} value={row.coveredUnit} quantityTabOrder error={coveredProductionExceedsTotal(row) ? 'Must be equal to or less than Total Production.' : undefined} onChange={(value) => update(row.id, 'coveredUnit', value)} />}</td>
                <td className="border border-stone-300 p-1"><CalculatedAmount value={row.coveredValue} /></td>
                <td className="border border-stone-300 px-1 py-2 text-center font-medium tabular-nums">{row.coveredPercent || '—'}</td>
                <td className="border border-stone-300 p-1"><CalculatedAmount value={row.markingFee} /></td>
                <td className="border border-stone-300 px-1 py-1 text-center">{rowActions(row, index, index === rows.length - 1)}</td>
              </tr>
            )})}
            {rows.length === 0 ? (
              <tr>
                <td colSpan={9} className="border border-stone-300 px-4 py-6 text-center text-stone-500">{emptyRowAction}</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <div className="space-y-3 xl:hidden">
        <div className="grid min-w-0 grid-cols-2 gap-2 border border-stone-400 bg-stone-100 p-3 text-xs">
          <div><span className="block font-medium text-stone-600">Total Production</span><strong className="tabular-nums">{formatQuantityTotal(totalProduction)} {unitOfIs}</strong></div>
          <div><span className="block font-medium text-stone-600">Total Production Value (Rs)</span><strong className="tabular-nums">{formatAmountTotal(totalProductionValue)}</strong></div>
          <div><span className="block font-medium text-stone-600">Total Covered Production</span><strong className="tabular-nums">{formatQuantityTotal(totalCovered)} {unitOfIs}</strong></div>
          <div><span className="block font-medium text-stone-600">Total Covered Value (Rs)</span><strong className="tabular-nums">{formatAmountTotal(totalCoveredValue)}</strong></div>
          <div><span className="block font-medium text-stone-600">Covered Qty in %</span><strong className="tabular-nums">{totalCoveredPercent}</strong></div>
          <div><span className="block font-medium text-stone-600">Total Marking Fee (Rs)</span><strong className="tabular-nums">{formatAmountTotal(totalMarkingFee)}</strong></div>
          <Button
            type="button"
            variant="outline"
            className="col-span-2 h-8 justify-center rounded-none border-stone-400"
            onClick={() => setCalculationSelection({ rows: calculatedRows, total: true })}
          >
            <Calculator className="mr-1 size-4" /> Total Calculation Steps
          </Button>
        </div>
        {calculatedRows.map((row, index) => (
          <article key={row.id} className={cn('space-y-3 border border-stone-400 p-3', row.stockMarkingBreak ? 'bg-amber-50' : 'bg-white')}>
            {row.stockMarkingBreak ? <div className="border-b border-amber-200 pb-2 text-xs font-semibold text-amber-900">Stock Marking — No Production</div> : null}
            <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="min-w-0 space-y-1 text-xs font-medium text-stone-700"><span className="block">Period Start</span><PeriodDateInput id={`renewal-period-from-mobile-${row.id}`} label={`Period start ${index + 1}`} value={index === 0 ? renewalPeriodFrom : row.periodFrom} disabled={index === 0} onChange={(value) => update(row.id, 'periodFrom', value)} /></div>
              <div className="min-w-0 space-y-1 text-xs font-medium text-stone-700"><span className="block">Period End</span><PeriodDateInput id={`renewal-period-to-mobile-${row.id}`} label={`Period end ${index + 1}`} value={row.periodTo} onChange={(value) => update(row.id, 'periodTo', value)} /></div>
              <label className="min-w-0 space-y-1 text-xs font-medium text-stone-700">Total Production{unitOfIs ? ` in ${unitOfIs}` : ''}<NumberCell label={`Total production units ${index + 1}`} value={row.stockMarkingBreak ? '0' : row.productionUnit} disabled={row.stockMarkingBreak} quantityTabOrder onChange={(value) => update(row.id, 'productionUnit', value)} /></label>
              <div className="min-w-0 space-y-1 text-xs font-medium text-stone-700"><span className="block">Production Value (Rs)</span><CalculatedAmount value={row.productionValue} /></div>
              <label className="min-w-0 space-y-1 text-xs font-medium text-stone-700">Covered Production{unitOfIs ? ` in ${unitOfIs}` : ''}<NumberCell label={`Quantity covered units ${index + 1}`} value={row.stockMarkingBreak ? '0' : row.coveredUnit} disabled={row.stockMarkingBreak} quantityTabOrder onChange={(value) => update(row.id, 'coveredUnit', value)} /></label>
              <div className="min-w-0 space-y-1 text-xs font-medium text-stone-700"><span className="block">Covered Value (Rs)</span><CalculatedAmount value={row.coveredValue} /></div>
              <div className="space-y-1 text-xs font-medium text-stone-700"><span className="block">Covered Qty in %</span><div className="flex h-8 items-center justify-center border border-stone-300 bg-stone-50 tabular-nums">{row.coveredPercent || '—'}</div></div>
              <div className="min-w-0 space-y-1 text-xs font-medium text-stone-700"><span className="block">Marking Fee (Rs)</span><CalculatedAmount value={row.markingFee} /></div>
            </div>
            <div className="flex items-center justify-between border-t border-stone-200 pt-2">
              <span className="text-xs font-semibold text-stone-700">Actions</span>
              {rowActions(row, index, index === rows.length - 1)}
            </div>
          </article>
        ))}
        {rows.length === 0 ? <div className="border border-stone-300 p-4 text-center">{emptyRowAction}</div> : null}
      </div>
      <MarkingFeeCalculationDialog
        selection={calculationSelection}
        unitOfIs={unitOfIs}
        basicUnitRate={basicUnitRate}
        slabRates={slabRates}
        onOpenChange={(open) => { if (!open) setCalculationSelection(null) }}
      />
      <Dialog open={breakSelection !== null} onOpenChange={(open) => { if (!open) setBreakSelection(null) }}>
        <DialogContent className="max-w-md rounded-none border-stone-500">
          <DialogHeader><DialogTitle>Add Stock-Marking Break</DialogTitle></DialogHeader>
          {breakSelection ? <div className="space-y-4">
            <p className="text-sm text-stone-600">Choose the dates with no production. A zero-production row will be inserted inside this monthly period.</p>
            <div className="grid grid-cols-2 gap-3">
              <label className="space-y-1 text-xs font-medium">Break from<Input type="date" min={breakSelection.row.periodFrom} max={breakSelection.row.periodTo} value={breakSelection.from} onChange={(event) => setBreakSelection({ ...breakSelection, from: event.target.value, error: '' })} /></label>
              <label className="space-y-1 text-xs font-medium">Break to<Input type="date" min={breakSelection.row.periodFrom} max={breakSelection.row.periodTo} value={breakSelection.to} onChange={(event) => setBreakSelection({ ...breakSelection, to: event.target.value, error: '' })} /></label>
            </div>
            {breakSelection.error ? <p className="text-sm text-destructive" role="alert">{breakSelection.error}</p> : null}
            <div className="flex justify-end gap-2"><Button type="button" variant="outline" className="rounded-none" onClick={() => setBreakSelection(null)}>Cancel</Button><Button type="button" className="rounded-none" onClick={() => {
              try {
                onRowsChange(splitProductionRowForStockMarking(rows, breakSelection.row.id, breakSelection.from, breakSelection.to))
                setBreakSelection(null)
              } catch (error) {
                setBreakSelection({ ...breakSelection, error: error instanceof Error ? error.message : 'Could not insert this break.' })
              }
            }}>Insert Break</Button></div>
          </div> : null}
        </DialogContent>
      </Dialog>
    </section>
  )
}

function MarkingFeeCalculationDialog({
  selection,
  unitOfIs,
  basicUnitRate,
  slabRates,
  onOpenChange,
}: {
  selection: { rows: RenewalProductionRow[]; total: boolean } | null
  unitOfIs: string
  basicUnitRate: string
  slabRates: RenewalSlabRate[]
  onOpenChange: (open: boolean) => void
}) {
  const rows = selection?.rows ?? []
  const totalProduction = sumField(rows, 'productionUnit')
  const totalProductionValue = sumField(rows, 'productionValue')
  const totalCovered = sumField(rows, 'coveredUnit')
  const totalCoveredValue = sumField(rows, 'coveredValue')
  const totalFee = sumField(rows, 'markingFee')
  const totalCoveredPercent = totalProduction && totalProduction > 0 && totalCovered !== null
    ? ((totalCovered / totalProduction) * 100).toFixed(2)
    : '—'
  const unit = unitOfIs || 'unit'
  const populatedRows = rows.filter((row) => row.productionUnit.trim() !== '')
  const baseRate = basicUnitRate.trim() ? decimal(basicUnitRate) : null
  const productionSumFormula = populatedRows.map((row) => formatQuantityTotal(decimal(row.productionUnit))).join(' + ')
  const productionValueFormula = populatedRows.map((row) => baseRate === null
    ? `${getCurrencySymbol()} ${formatAmountTotal(decimal(row.productionValue))}`
    : `${formatQuantityTotal(decimal(row.productionUnit))} × ${getCurrencySymbol()} ${formatAmountTotal(baseRate)}`
  ).join(' + ')
  const coveredProductionRows = rows.filter((row) => row.coveredUnit.trim() !== '')
  const coveredSumFormula = coveredProductionRows.map((row) => formatQuantityTotal(decimal(row.coveredUnit))).join(' + ')
  const coveredValueFormula = coveredProductionRows.map((row) => baseRate === null
    ? `${getCurrencySymbol()} ${formatAmountTotal(decimal(row.coveredValue))}`
    : `${formatQuantityTotal(decimal(row.coveredUnit))} × ${getCurrencySymbol()} ${formatAmountTotal(baseRate)}`
  ).join(' + ')
  const feeFormula = rows.filter((row) => row.coveredUnit.trim() !== '').map((row) => {
    const matchedSlab = renewalSlabForQuantity(row.coveredUnit, slabRates)
    return matchedSlab
      ? `${formatQuantityTotal(decimal(row.coveredUnit))} × ${getCurrencySymbol()} ${formatAmountTotal(decimal(matchedSlab.rate))}`
      : 'unmatched slab'
  }).join(' + ')

  return (
    <Dialog open={selection !== null} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90vh] w-[min(96vw,1100px)] max-w-none flex-col overflow-hidden rounded-none border-stone-500 p-0">
        <DialogHeader>
          <div className="shrink-0 border-b border-stone-300 bg-stone-900 px-5 py-4 text-amber-50">
            <DialogTitle className="text-base">{selection?.total ? 'Total Marking Fee Calculation' : 'Marking Fee Calculation'}</DialogTitle>
          </div>
        </DialogHeader>
        {selection ? (
          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain px-5 pb-5 text-sm">
            {selection.total ? (
              <article className="space-y-3 border-2 border-stone-400 bg-stone-50 p-3 sm:p-4">
                <h3 className="border-b border-stone-300 pb-2 font-semibold text-stone-900">Overall Renewal Summary</h3>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
                  <div className="min-w-0 border border-stone-200 bg-white px-3 py-2">
                    <span className="block text-xs text-stone-600">Total Production</span>
                    <strong className="block break-words tabular-nums">{formatQuantityTotal(totalProduction)} {unit}</strong>
                  </div>
                  <div className="min-w-0 border border-stone-200 bg-white px-3 py-2">
                    <span className="block text-xs text-stone-600">Total Production Value</span>
                    <strong className="block break-words tabular-nums">{getCurrencySymbol()} {formatAmountTotal(totalProductionValue)}</strong>
                  </div>
                  <div className="min-w-0 border border-stone-200 bg-white px-3 py-2">
                    <span className="block text-xs text-stone-600">Total Covered Production</span>
                    <strong className="block break-words tabular-nums">{formatQuantityTotal(totalCovered)} {unit}</strong>
                  </div>
                  <div className="min-w-0 border border-stone-200 bg-white px-3 py-2">
                    <span className="block text-xs text-stone-600">Total Covered Value</span>
                    <strong className="block break-words tabular-nums">{getCurrencySymbol()} {formatAmountTotal(totalCoveredValue)}</strong>
                  </div>
                  <div className="min-w-0 border border-stone-200 bg-white px-3 py-2">
                    <span className="block text-xs text-stone-600">Covered Quantity</span>
                    <strong className="block break-words tabular-nums">{totalCoveredPercent}%</strong>
                  </div>
                  <div className="min-w-0 border border-amber-500 bg-amber-100 px-3 py-2">
                    <span className="block text-xs text-stone-700">Total Marking Fee</span>
                    <strong className="block break-words tabular-nums">{getCurrencySymbol()} {formatAmountTotal(totalFee)}</strong>
                  </div>
                </div>
                <section className="space-y-2 border-t border-stone-300 pt-3">
                  <h4 className="text-xs font-semibold uppercase tracking-wide text-stone-600">Overall Calculation Steps</h4>
                  <ol className="grid grid-cols-1 gap-2 lg:grid-cols-2">
                    <li className="flex min-w-0 items-start gap-2 border border-stone-200 bg-white p-2.5 text-xs leading-relaxed">
                      <span className="flex size-6 shrink-0 items-center justify-center bg-stone-800 font-semibold text-amber-50">1</span>
                      <p className="min-w-0 break-words [overflow-wrap:anywhere]">Total production = period production quantities added: <strong>{productionSumFormula || 'No production entered'} = {formatQuantityTotal(totalProduction)} {unit}</strong></p>
                    </li>
                    <li className="flex min-w-0 items-start gap-2 border border-stone-200 bg-white p-2.5 text-xs leading-relaxed">
                      <span className="flex size-6 shrink-0 items-center justify-center bg-stone-800 font-semibold text-amber-50">2</span>
                      <p className="min-w-0 break-words [overflow-wrap:anywhere]">Total production value = each period’s production × basic unit rate: <strong>{productionValueFormula || 'Rate or production not entered'} = {getCurrencySymbol()} {formatAmountTotal(totalProductionValue)}</strong></p>
                    </li>
                    <li className="flex min-w-0 items-start gap-2 border border-stone-200 bg-white p-2.5 text-xs leading-relaxed">
                      <span className="flex size-6 shrink-0 items-center justify-center bg-stone-800 font-semibold text-amber-50">3</span>
                      <p className="min-w-0 break-words [overflow-wrap:anywhere]">Total covered production = period covered quantities added: <strong>{coveredSumFormula || 'No covered production entered'} = {formatQuantityTotal(totalCovered)} {unit}</strong></p>
                    </li>
                    <li className="flex min-w-0 items-start gap-2 border border-stone-200 bg-white p-2.5 text-xs leading-relaxed">
                      <span className="flex size-6 shrink-0 items-center justify-center bg-stone-800 font-semibold text-amber-50">4</span>
                      <p className="min-w-0 break-words [overflow-wrap:anywhere]">Total covered value = each period’s covered production × basic unit rate: <strong>{coveredValueFormula || 'Rate or covered production not entered'} = {getCurrencySymbol()} {formatAmountTotal(totalCoveredValue)}</strong></p>
                    </li>
                    <li className="flex min-w-0 items-start gap-2 border border-stone-200 bg-white p-2.5 text-xs leading-relaxed">
                      <span className="flex size-6 shrink-0 items-center justify-center bg-stone-800 font-semibold text-amber-50">5</span>
                      <p className="min-w-0 break-words [overflow-wrap:anywhere]">Covered quantity percentage = total covered production ÷ total production × 100: <strong>{formatQuantityTotal(totalCovered)} ÷ {formatQuantityTotal(totalProduction)} × 100 = {totalCoveredPercent}%</strong></p>
                    </li>
                    <li className="flex min-w-0 items-start gap-2 border border-amber-400 bg-amber-50 p-2.5 text-xs leading-relaxed">
                      <span className="flex size-6 shrink-0 items-center justify-center bg-amber-700 font-semibold text-white">6</span>
                      <p className="min-w-0 break-words [overflow-wrap:anywhere]">Total marking fee = period covered quantities × their matched IS Code slab rates, then added: <strong>{feeFormula || 'No covered production entered'} = {getCurrencySymbol()} {formatAmountTotal(totalFee)}</strong></p>
                    </li>
                  </ol>
                </section>
              </article>
            ) : null}
            {rows.map((row, index) => {
              const slab = renewalSlabForQuantity(row.coveredUnit, slabRates)
              const rate = slab ? decimal(slab.rate) : null
              const period = row.periodFrom && row.periodTo
                ? `${formatDisplayDate(row.periodFrom)} – ${formatDisplayDate(row.periodTo)}`
                : 'Dates not set'
              const fee = row.markingFee ? formatMoneyInput(row.markingFee) : '0.00'
              return (
                <article key={row.id} className="space-y-3 border border-stone-300 bg-white p-3 sm:p-4">
                  <h3 className="border-b border-stone-300 pb-2 font-semibold text-stone-900">Period {index + 1}: {period}</h3>
                  <section className="space-y-2">
                    <h4 className="text-xs font-semibold uppercase tracking-wide text-stone-600">Calculation summary</h4>
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4">
                      <div className="min-w-0 border border-stone-200 bg-stone-50 px-3 py-2">
                        <span className="block text-xs text-stone-600">Covered Production</span>
                        <strong className="block break-words tabular-nums">{row.coveredUnit || '—'} {unit}</strong>
                      </div>
                      <div className="min-w-0 border border-stone-200 bg-stone-50 px-3 py-2">
                        <span className="block text-xs text-stone-600">Applicable IS Code Slab</span>
                        <strong className="block break-words">{slab?.quantity || 'No matching slab'}</strong>
                      </div>
                      <div className="min-w-0 border border-stone-200 bg-stone-50 px-3 py-2">
                        <span className="block text-xs text-stone-600">Rate per {unit}</span>
                        <strong className="block break-words tabular-nums">{rate === null ? '—' : `${getCurrencySymbol()} ${formatMoneyInput(String(rate))}`}</strong>
                      </div>
                      <div className="min-w-0 border border-amber-400 bg-amber-50 px-3 py-2">
                        <span className="block text-xs text-stone-600">Marking Fee</span>
                        <strong className="block break-words tabular-nums">{getCurrencySymbol()} {fee}</strong>
                      </div>
                    </div>
                  </section>

                  <section className="space-y-2">
                    <h4 className="text-xs font-semibold uppercase tracking-wide text-stone-600">Calculation steps</h4>
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4">
                      <div className="flex min-w-0 items-start gap-2 border border-stone-200 bg-stone-50 p-2.5 text-xs leading-relaxed">
                        <span className="flex size-6 shrink-0 items-center justify-center bg-stone-800 font-semibold text-amber-50">1</span>
                        <p className="min-w-0 break-words [overflow-wrap:anywhere]">Covered production: <strong>{row.coveredUnit || '0'} {unit}</strong></p>
                      </div>
                      <div className="flex min-w-0 items-start gap-2 border border-stone-200 bg-stone-50 p-2.5 text-xs leading-relaxed">
                        <span className="flex size-6 shrink-0 items-center justify-center bg-stone-800 font-semibold text-amber-50">2</span>
                        <p className="min-w-0 break-words [overflow-wrap:anywhere]">Matched IS Code slab: <strong>{slab?.quantity || 'No matching slab'}</strong></p>
                      </div>
                      <div className="flex min-w-0 items-start gap-2 border border-stone-200 bg-stone-50 p-2.5 text-xs leading-relaxed">
                        <span className="flex size-6 shrink-0 items-center justify-center bg-stone-800 font-semibold text-amber-50">3</span>
                        <p className="min-w-0 break-words [overflow-wrap:anywhere]">Applicable rate: <strong>{rate === null ? 'Unavailable' : `${getCurrencySymbol()} ${formatMoneyInput(String(rate))} per ${unit}`}</strong></p>
                      </div>
                      <div className="flex min-w-0 items-start gap-2 border border-amber-400 bg-amber-50 p-2.5 text-xs leading-relaxed">
                        <span className="flex size-6 shrink-0 items-center justify-center bg-amber-700 font-semibold text-white">4</span>
                        <p className="min-w-0 break-words [overflow-wrap:anywhere]">Covered production × rate = <strong className="tabular-nums">{rate === null
                          ? 'Fee unavailable'
                          : `${row.coveredUnit || '0'} × ${formatMoneyInput(String(rate))} = ${getCurrencySymbol()} ${fee}`}</strong></p>
                      </div>
                    </div>
                  </section>
                </article>
              )
            })}

            <div className="flex items-center justify-between border-t-2 border-stone-400 pt-3 font-semibold">
              <span>{selection.total ? 'Total Marking Fee' : 'Marking Fee for Period'}</span>
              <span className="tabular-nums">{formatAmountTotal(totalFee) === '—' ? '—' : `${getCurrencySymbol()} ${formatAmountTotal(totalFee)}`}</span>
            </div>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}
