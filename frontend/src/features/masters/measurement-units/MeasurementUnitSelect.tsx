import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  FILTER_COMBOBOX_DROPDOWN_ATTR,
  FILTER_COMBOBOX_OPTION_INDEX_ATTR,
  useFilterComboboxPointerSelect,
} from '@/features/sample-handling/receiving/FilterCombobox'
import {
  limsDarkBarGlowStyle,
  limsDialogClass,
  limsFieldClass,
  limsPrimaryBtnClass,
} from '@/lib/limsThemeUi'
import { cn } from '@/lib/utils'
import {
  addMeasurementUnit,
  deleteMeasurementUnit,
  updateMeasurementUnit,
} from './measurementUnitApi'
import { useMeasurementUnits } from './useMeasurementUnits'

const manageListItemClass =
  'flex items-center justify-between rounded-none border border-stone-500 bg-stone-50 px-3 py-1.5 text-sm text-stone-900'

export function MeasurementUnitSelect({
  id,
  value,
  onChange,
  label,
  labelClassName,
  showLabel = true,
  showManageButton = true,
  className,
  inputClassName,
  shellClassName,
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
  shellClassName?: string
  placeholder?: string
  disabled?: boolean
}) {
  const { units } = useMeasurementUnits()
  const inputRef = useRef<HTMLInputElement | null>(null)
  const fieldRef = useRef<HTMLDivElement | null>(null)
  const [open, setOpen] = useState(false)
  const [highlight, setHighlight] = useState(0)
  const [dropdownPos, setDropdownPos] = useState<{
    left: number
    width: number
    top?: number
    bottom?: number
  } | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [newUnitName, setNewUnitName] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const filteredUnits = useMemo(() => {
    const q = value.trim().toLowerCase()
    if (!q) return units
    return units.filter((unit) => unit.name.toLowerCase().includes(q))
  }, [units, value])

  const showAddUnitAction = useMemo(() => {
    const typed = value.trim()
    if (!typed) return false
    return !units.some((unit) => unit.name.toLowerCase() === typed.toLowerCase())
  }, [units, value])

  const totalOptions = filteredUnits.length + (showAddUnitAction ? 1 : 0)
  const resolvedPlaceholder =
    placeholder ?? (units.length > 0 ? 'Select Unit' : 'Add units to use them here')
  const unitInputId = `${id ?? 'unit'}-new`

  useEffect(() => {
    setHighlight((prev) => (totalOptions === 0 ? 0 : Math.min(prev, totalOptions - 1)))
  }, [totalOptions])

  const showDropdown = open && !disabled && (filteredUnits.length > 0 || showAddUnitAction)

  useLayoutEffect(() => {
    if (!showDropdown) {
      setDropdownPos(null)
      return
    }
    const update = () => {
      const el = fieldRef.current
      if (!el) return
      const rect = el.getBoundingClientRect()
      const estimatedHeight = Math.min(totalOptions * 36, 224)
      const spaceBelow = window.innerHeight - rect.bottom
      const spaceAbove = rect.top
      const openUp = spaceBelow < estimatedHeight + 8 && spaceAbove > spaceBelow
      setDropdownPos(
        openUp
          ? {
              left: rect.left,
              width: Math.max(rect.width, 140),
              bottom: window.innerHeight - rect.top + 4,
            }
          : {
              left: rect.left,
              width: Math.max(rect.width, 140),
              top: rect.bottom + 4,
            },
      )
    }
    update()
    window.addEventListener('resize', update)
    window.addEventListener('scroll', update, true)
    return () => {
      window.removeEventListener('resize', update)
      window.removeEventListener('scroll', update, true)
    }
  }, [showDropdown, totalOptions, value])

  useEffect(() => {
    if (!dialogOpen) {
      setEditingId(null)
      setNewUnitName('')
      setError(null)
    }
  }, [dialogOpen])

  const pickUnit = (name: string) => {
    onChange(name)
    setOpen(false)
  }

  const openManageDialog = (prefill?: string) => {
    setEditingId(null)
    setNewUnitName(prefill?.trim() ?? '')
    setError(null)
    setDialogOpen(true)
  }

  useFilterComboboxPointerSelect(showDropdown, (index) => {
    if (index < filteredUnits.length) {
      pickUnit(filteredUnits[index].name)
      return
    }
    if (showAddUnitAction && index === filteredUnits.length) {
      openManageDialog(value)
      setOpen(false)
    }
  })

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
      if (highlight < filteredUnits.length) {
        pickUnit(filteredUnits[highlight].name)
      } else if (showAddUnitAction) {
        openManageDialog(value)
        setOpen(false)
      }
    }
  }

  const handleSaveAndClose = async () => {
    const name = newUnitName.trim()
    if (!name) return
    setSaving(true)
    setError(null)
    try {
      if (editingId) {
        const prevName = units.find((u) => u.id === editingId)?.name
        const row = await updateMeasurementUnit(editingId, name)
        if (prevName && value === prevName) onChange(row.name)
        else if (!value.trim()) onChange(row.name)
      } else {
        const row = await addMeasurementUnit(name)
        onChange(row.name)
      }
      setDialogOpen(false)
      setEditingId(null)
      setNewUnitName('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save measurement unit')
    } finally {
      setSaving(false)
    }
  }

  const handleDeleteUnit = async (unitId: string) => {
    setError(null)
    try {
      const removedName = await deleteMeasurementUnit(unitId)
      if (removedName && value === removedName) onChange('')
      if (editingId === unitId) {
        setEditingId(null)
        setNewUnitName('')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to delete measurement unit')
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

        <div className="relative h-full min-h-0">
          <div
            ref={fieldRef}
            className={cn(
              'flex h-8 min-h-0 overflow-hidden rounded-none border border-stone-500 bg-stone-50',
              'focus-within:border-amber-600 focus-within:bg-white focus-within:ring-2 focus-within:ring-amber-500/20',
              disabled && 'opacity-50',
              shellClassName,
            )}
          >
            <Input
              ref={inputRef}
              id={id}
              value={value}
              disabled={disabled}
              onChange={(e) => {
                setOpen(true)
                onChange(e.target.value)
                setHighlight(0)
              }}
              onFocus={() => setOpen(true)}
              onBlur={() => setTimeout(() => setOpen(false), 150)}
              onKeyDown={handleKeyDown}
              placeholder={resolvedPlaceholder}
              autoComplete="off"
              className={cn(
                'h-full min-w-0 flex-1 rounded-none border-0 bg-transparent px-3 shadow-none',
                'focus-visible:border-transparent focus-visible:bg-transparent focus-visible:ring-0',
                inputClassName,
              )}
            />
            {showManageButton ? (
              <button
                type="button"
                className="inline-flex h-full w-9 shrink-0 items-center justify-center self-stretch border-l border-stone-500 bg-stone-100 text-amber-800 transition-colors hover:bg-amber-500/15 hover:text-amber-950 disabled:pointer-events-none disabled:opacity-50"
                onClick={() => openManageDialog()}
                onMouseDown={(e) => e.preventDefault()}
                aria-label="Add measurement unit"
                title="Add New"
                disabled={disabled}
              >
                <Plus size={14} strokeWidth={2.25} aria-hidden />
              </button>
            ) : null}
          </div>
          {showDropdown && dropdownPos
            ? createPortal(
                <div
                  {...{ [FILTER_COMBOBOX_DROPDOWN_ATTR]: '' }}
                  className="pointer-events-auto fixed z-[10000] rounded-none border border-stone-500 bg-white shadow-lg"
                  style={{
                    left: dropdownPos.left,
                    width: dropdownPos.width,
                    top: dropdownPos.top,
                    bottom: dropdownPos.bottom,
                    pointerEvents: 'auto',
                  }}
                  tabIndex={-1}
                  onMouseDown={(e) => e.stopPropagation()}
                  onPointerDown={(e) => e.stopPropagation()}
                >
                  <ul className="max-h-56 overflow-auto text-sm">
                    {filteredUnits.map((unit, index) => (
                      <li key={unit.id}>
                        <button
                          type="button"
                          tabIndex={-1}
                          {...{ [FILTER_COMBOBOX_OPTION_INDEX_ATTR]: String(index) }}
                          className={`w-full px-3 py-2 text-left ${index === highlight ? 'bg-[#f3e9d8] font-semibold' : 'hover:bg-[#f7f3eb]'}`}
                          onMouseDown={(e) => e.preventDefault()}
                          onMouseEnter={() => setHighlight(index)}
                          onPointerDown={(e) => {
                            e.preventDefault()
                            e.stopPropagation()
                            pickUnit(unit.name)
                          }}
                          onClick={() => pickUnit(unit.name)}
                        >
                          {unit.name}
                        </button>
                      </li>
                    ))}
                    {showAddUnitAction ? (
                      <li>
                        <button
                          type="button"
                          tabIndex={-1}
                          {...{ [FILTER_COMBOBOX_OPTION_INDEX_ATTR]: String(filteredUnits.length) }}
                          className={`w-full px-3 py-2 text-left text-amber-800 ${
                            highlight === filteredUnits.length
                              ? 'bg-[#f3e9d8] font-semibold'
                              : 'hover:bg-[#f7f3eb]'
                          }`}
                          onMouseDown={(e) => e.preventDefault()}
                          onMouseEnter={() => setHighlight(filteredUnits.length)}
                          onPointerDown={(e) => {
                            e.preventDefault()
                            e.stopPropagation()
                            openManageDialog(value)
                            setOpen(false)
                          }}
                          onClick={() => {
                            openManageDialog(value)
                            setOpen(false)
                          }}
                        >
                          Add &quot;{value.trim()}&quot; as new unit
                        </button>
                      </li>
                    ) : null}
                  </ul>
                </div>,
                document.body,
              )
            : null}
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
                {editingId ? 'Edit Measurement Unit' : 'Add Measurement Unit'}
              </DialogTitle>
            </DialogHeader>
          </div>

          <div className="space-y-4 bg-gradient-to-b from-stone-100/80 to-white px-4 py-4">
            <div className="space-y-2">
              <Label
                htmlFor={unitInputId}
                className="text-[11px] font-semibold uppercase tracking-wide text-stone-600"
              >
                {editingId ? 'Edit Unit Name' : 'Unit Name'}
              </Label>
              <Input
                id={unitInputId}
                placeholder="e.g., kN"
                value={newUnitName}
                onChange={(e) => setNewUnitName(e.target.value)}
                className={limsFieldClass}
              />
            </div>
            <div>
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-stone-600">
                Existing Units
              </p>
              <div className="max-h-40 space-y-1 overflow-auto">
                {units.length > 0 ? (
                  units.map((unit) => (
                    <div key={unit.id} className={manageListItemClass}>
                      <span className="min-w-0 truncate">{unit.name}</span>
                      <div className="flex shrink-0 items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => {
                            setEditingId(unit.id)
                            setNewUnitName(unit.name)
                            setError(null)
                            window.requestAnimationFrame(() => {
                              document.getElementById(unitInputId)?.focus()
                            })
                          }}
                          className="text-amber-800 hover:text-amber-950"
                          aria-label={`Edit ${unit.name}`}
                        >
                          <Pencil size={14} />
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleDeleteUnit(unit.id)}
                          className="text-red-600 hover:text-red-800"
                          aria-label={`Delete ${unit.name}`}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-xs text-stone-500">No units added yet.</p>
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
              disabled={!newUnitName.trim() || saving}
            >
              {saving ? 'Saving…' : 'Save & Close'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
