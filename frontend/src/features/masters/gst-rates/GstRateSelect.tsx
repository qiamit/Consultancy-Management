import { useEffect, useMemo, useRef, useState } from 'react'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  limsDarkBarGlowStyle,
  limsDialogClass,
  limsFieldClass,
  limsPrimaryBtnClass,
} from '@/lib/limsThemeUi'
import { cn } from '@/lib/utils'
import { addGstRate, deleteGstRate, updateGstRate } from './gstRateApi'
import {
  formatGstRateLabel,
  normalizeGstRateInput,
  parseGstRateValue,
} from './types'
import { useGstRates } from './useGstRates'

const manageListItemClass =
  'flex items-center justify-between rounded-none border border-stone-500 bg-stone-50 px-3 py-1.5 text-sm text-stone-900'

function ratesEqual(a: string, b: number): boolean {
  const left = normalizeGstRateInput(a)
  const right = normalizeGstRateInput(String(b))
  return Boolean(left) && left === right
}

export function GstRateSelect({
  id,
  value,
  onChange,
  label,
  labelClassName,
  showLabel = true,
  showManageButton = true,
  className,
  inputClassName,
  placeholder,
  disabled,
}: {
  id?: string
  value: string
  onChange: (value: string) => void
  label?: string
  labelClassName?: string
  showLabel?: boolean
  showManageButton?: boolean
  className?: string
  inputClassName?: string
  placeholder?: string
  disabled?: boolean
}) {
  const { rates } = useGstRates()
  const inputRef = useRef<HTMLInputElement | null>(null)
  const [open, setOpen] = useState(false)
  const [highlight, setHighlight] = useState(0)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [newRate, setNewRate] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const filteredRates = useMemo(() => {
    const q = value.trim().replace(/%/g, '').toLowerCase()
    if (!q) return rates
    return rates.filter((row) => {
      const labelText = formatGstRateLabel(row.rate).toLowerCase()
      const numeric = String(row.rate)
      const fixed = normalizeGstRateInput(String(row.rate))
      return labelText.includes(q) || numeric.includes(q) || fixed.includes(q)
    })
  }, [rates, value])

  const showAddRateAction = useMemo(() => {
    const parsed = parseGstRateValue(value)
    if (parsed == null) return false
    return !rates.some((row) => Math.abs(row.rate - parsed) < 1e-9)
  }, [rates, value])

  const totalOptions = filteredRates.length + (showAddRateAction ? 1 : 0)
  const resolvedPlaceholder =
    placeholder ?? (rates.length > 0 ? 'Select GST %' : 'Add GST rates to use them here')
  const rateInputId = `${id ?? 'gst'}-new`

  useEffect(() => {
    setHighlight((prev) => (totalOptions === 0 ? 0 : Math.min(prev, totalOptions - 1)))
  }, [totalOptions])

  useEffect(() => {
    if (!dialogOpen) {
      setEditingId(null)
      setNewRate('')
      setError(null)
    }
  }, [dialogOpen])

  const pickRate = (rate: number) => {
    onChange(normalizeGstRateInput(String(rate)))
    setOpen(false)
  }

  const openManageDialog = (prefill?: string) => {
    setEditingId(null)
    const parsed = prefill != null ? parseGstRateValue(prefill) : null
    setNewRate(parsed != null ? String(parsed) : '')
    setError(null)
    setDialogOpen(true)
  }

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Tab' || event.key === 'Shift+Tab') {
      setOpen(false)
      return
    }
    if (!open && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
      setOpen(true)
    }
    if (event.key === 'ArrowDown' && totalOptions > 0) {
      event.preventDefault()
      setHighlight((prev) => (prev + 1) % totalOptions)
    }
    if (event.key === 'ArrowUp' && totalOptions > 0) {
      event.preventDefault()
      setHighlight((prev) => (prev - 1 + totalOptions) % totalOptions)
    }
    if (event.key === 'Enter' && totalOptions > 0) {
      event.preventDefault()
      if (highlight < filteredRates.length) {
        pickRate(filteredRates[highlight].rate)
      } else if (showAddRateAction) {
        openManageDialog(value)
        setOpen(false)
      }
    }
  }

  const handleSaveAndClose = async () => {
    const parsed = parseGstRateValue(newRate)
    if (parsed == null) {
      setError('Enter a valid GST rate between 0 and 100')
      return
    }
    setSaving(true)
    setError(null)
    try {
      if (editingId) {
        const prev = rates.find((row) => row.id === editingId)?.rate
        const row = await updateGstRate(editingId, parsed)
        if (prev != null && ratesEqual(value, prev)) onChange(normalizeGstRateInput(String(row.rate)))
        else if (!value.trim()) onChange(normalizeGstRateInput(String(row.rate)))
      } else {
        const row = await addGstRate(parsed)
        onChange(normalizeGstRateInput(String(row.rate)))
      }
      setDialogOpen(false)
      setEditingId(null)
      setNewRate('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save GST rate')
    } finally {
      setSaving(false)
    }
  }

  const handleDeleteRate = async (rateId: string) => {
    setError(null)
    try {
      const removed = await deleteGstRate(rateId)
      if (removed != null && ratesEqual(value, removed)) onChange('')
      if (editingId === rateId) {
        setEditingId(null)
        setNewRate('')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to delete GST rate')
    }
  }

  return (
    <>
      <div className={cn(showLabel ? 'space-y-2' : '', className)}>
        {showLabel && label ? (
          <Label htmlFor={id} className={labelClassName}>
            {label}
          </Label>
        ) : null}

        <div className="relative">
          <div
            className={cn(
              'flex h-10 overflow-hidden rounded-none border border-stone-500 bg-stone-50',
              'focus-within:border-amber-600 focus-within:bg-white focus-within:ring-2 focus-within:ring-amber-500/20',
              disabled && 'opacity-50',
            )}
          >
            <Input
              ref={inputRef}
              id={id}
              type="text"
              inputMode="decimal"
              value={value}
              disabled={disabled}
              onChange={(e) => {
                setOpen(true)
                onChange(e.target.value.replace(/[^\d.]/g, ''))
                setHighlight(0)
              }}
              onFocus={() => setOpen(true)}
              onBlur={() => {
                setTimeout(() => setOpen(false), 150)
                const normalized = normalizeGstRateInput(value)
                if (normalized) onChange(normalized)
              }}
              onKeyDown={handleKeyDown}
              placeholder={resolvedPlaceholder}
              autoComplete="off"
              className={cn(
                'h-full min-w-0 flex-1 rounded-none border-0 bg-transparent px-3 text-right tabular-nums shadow-none',
                'focus-visible:border-transparent focus-visible:bg-transparent focus-visible:ring-0',
                inputClassName,
              )}
            />
            {showManageButton ? (
              <button
                type="button"
                className="inline-flex h-full w-9 shrink-0 items-center justify-center border-l border-stone-500 bg-stone-100 text-amber-800 transition-colors hover:bg-amber-500/15 hover:text-amber-950 disabled:pointer-events-none"
                onClick={() => openManageDialog()}
                onMouseDown={(e) => e.preventDefault()}
                aria-label="Add GST rate"
                title="Add New"
                disabled={disabled}
              >
                <Plus size={14} strokeWidth={2.25} aria-hidden />
              </button>
            ) : null}
          </div>
          {(filteredRates.length > 0 || showAddRateAction) && open && !disabled && (
            <div
              className="absolute z-30 mt-1 w-full rounded-none border border-stone-500 bg-white shadow-lg"
              tabIndex={-1}
            >
              <ul className="max-h-56 overflow-auto text-sm">
                {filteredRates.map((row, index) => (
                  <li key={row.id}>
                    <button
                      type="button"
                      tabIndex={-1}
                      className={`w-full px-3 py-2 text-left ${index === highlight ? 'bg-[#f3e9d8] font-semibold' : 'hover:bg-[#f7f3eb]'}`}
                      onMouseDown={(e) => e.preventDefault()}
                      onPointerDown={(e) => {
                        e.preventDefault()
                        e.stopPropagation()
                        pickRate(row.rate)
                      }}
                      onMouseEnter={() => setHighlight(index)}
                      onClick={() => pickRate(row.rate)}
                    >
                      {formatGstRateLabel(row.rate)}
                    </button>
                  </li>
                ))}
                {showAddRateAction && (
                  <li>
                    <button
                      type="button"
                      tabIndex={-1}
                      className={`w-full px-3 py-2 text-left text-amber-800 ${
                        highlight === filteredRates.length ? 'bg-[#f3e9d8] font-semibold' : 'hover:bg-[#f7f3eb]'
                      }`}
                      onMouseDown={(e) => e.preventDefault()}
                      onPointerDown={(e) => {
                        e.preventDefault()
                        e.stopPropagation()
                        openManageDialog(value)
                        setOpen(false)
                      }}
                      onMouseEnter={() => setHighlight(filteredRates.length)}
                      onClick={() => {
                        openManageDialog(value)
                        setOpen(false)
                      }}
                    >
                      Add &quot;{parseGstRateValue(value)}%&quot; as new GST rate
                    </button>
                  </li>
                )}
              </ul>
            </div>
          )}
        </div>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent
          persistOnFocusLoss
          layer="stacked"
          aria-describedby={undefined}
          className={cn(limsDialogClass, 'max-w-lg p-0')}
        >
          <div className="relative overflow-hidden bg-gradient-to-br from-stone-800 via-stone-900 to-stone-950 px-4 py-2.5 text-white">
            <div className="pointer-events-none absolute inset-0 opacity-[0.18]" style={limsDarkBarGlowStyle} />
            <div className="absolute bottom-0 left-0 h-[2px] w-full bg-gradient-to-r from-amber-500 via-amber-300 to-transparent" />
            <DialogHeader className="relative pr-10 text-left">
              <DialogTitle className="text-base font-semibold tracking-tight text-white">
                {editingId ? 'Edit GST Rate' : 'Add GST Rate'}
              </DialogTitle>
            </DialogHeader>
          </div>

          <div className="space-y-4 bg-gradient-to-b from-stone-100/80 to-white px-4 py-4">
            <div className="space-y-2">
              <Label
                htmlFor={rateInputId}
                className="text-[11px] font-semibold uppercase tracking-wide text-stone-600"
              >
                {editingId ? 'Edit GST %' : 'GST %'}
              </Label>
              <Input
                id={rateInputId}
                type="text"
                inputMode="decimal"
                placeholder="e.g., 18"
                value={newRate}
                onChange={(e) => setNewRate(e.target.value.replace(/[^\d.]/g, ''))}
                className={cn(limsFieldClass, 'text-right tabular-nums')}
              />
            </div>
            <div>
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-stone-600">
                Existing GST Rates
              </p>
              <div className="max-h-40 space-y-1 overflow-auto">
                {rates.length > 0 ? (
                  rates.map((row) => (
                    <div key={row.id} className={manageListItemClass}>
                      <span className="min-w-0 truncate">{formatGstRateLabel(row.rate)}</span>
                      <div className="flex shrink-0 items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => {
                            setEditingId(row.id)
                            setNewRate(String(row.rate))
                            setError(null)
                            window.requestAnimationFrame(() => {
                              document.getElementById(rateInputId)?.focus()
                            })
                          }}
                          className="text-amber-800 hover:text-amber-950"
                          aria-label={`Edit ${formatGstRateLabel(row.rate)}`}
                        >
                          <Pencil size={14} />
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleDeleteRate(row.id)}
                          className="text-red-600 hover:text-red-800"
                          aria-label={`Delete ${formatGstRateLabel(row.rate)}`}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-xs text-stone-500">No GST rates added yet.</p>
                )}
              </div>
            </div>
            {error ? <p className="text-xs text-red-700">{error}</p> : null}
          </div>

          <DialogFooter className="border-t border-stone-200 bg-stone-50 px-4 py-3 sm:justify-end">
            <Button
              type="button"
              className={cn(limsPrimaryBtnClass, 'min-w-[8.5rem]')}
              onClick={() => void handleSaveAndClose()}
              disabled={!newRate.trim() || saving}
            >
              {saving ? 'Saving…' : 'Save & Close'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
