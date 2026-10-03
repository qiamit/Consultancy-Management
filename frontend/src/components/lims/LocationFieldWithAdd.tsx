import { useCallback, useEffect, useMemo, useState } from 'react'
import { Pencil, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { LimsFieldAddButton, LimsFieldWithAdd } from '@/components/lims/LimsFieldWithAdd'
import {
  FilterCombobox,
  type FilterComboboxOption,
} from '@/features/sample-handling/receiving/FilterCombobox'
import {
  deleteLabMasterOption,
  ensureLabMasterOptionByLabel,
  fetchLabMasterOptionsGrouped,
  updateLabMasterOption,
} from '@/features/settings/lab-settings/labMasterOptions'
import { useFormDialogOpenChange } from '@/lib/formDialogOpenChange'
import {
  limsDarkBarGlowStyle,
  limsDialogClass,
  limsFieldClass,
  limsPrimaryBtnClass,
} from '@/lib/limsThemeUi'
import { cn } from '@/lib/utils'
import { supabase } from '@/lib/supabaseClient'

const MANAGE_LIST_ITEM =
  'flex items-center justify-between gap-2 rounded-none border border-stone-500 bg-stone-50 px-3 py-1.5 text-sm text-stone-900'

type ManagedLocationOption = {
  value: string
  label: string
  inMaster: boolean
}

function fromLocationRows(data: unknown): string[] {
  if (!Array.isArray(data)) return []
  return data
    .map((r) => String((r as { current_location?: string | null }).current_location ?? '').trim())
    .filter(Boolean)
}

/** Shared Current Location combobox + Plus manage (lab_master_options department). */
export function LocationFieldWithAdd({
  value,
  onChange,
  label = 'Current Location',
  inputId = 'location-field',
  listId = 'location-field-list',
  disabled = false,
  className,
}: {
  value: string
  onChange: (next: string) => void
  label?: string
  inputId?: string
  listId?: string
  disabled?: boolean
  className?: string
}) {
  const [query, setQuery] = useState(value)
  const [open, setOpen] = useState(false)
  const [managed, setManaged] = useState<ManagedLocationOption[]>([])
  const [dialogOpen, setDialogOpen] = useState(false)
  const [newName, setNewName] = useState('')
  const [editingValue, setEditingValue] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const manageInputId = `${inputId}-manage-name`

  const handleDialogOpenChange = useFormDialogOpenChange((next) => {
    setDialogOpen(next)
    if (!next) {
      setNewName('')
      setEditingValue(null)
      setError(null)
    }
  })

  useEffect(() => {
    setQuery(value)
  }, [value])

  const reload = useCallback(async () => {
    const [grouped, calLocRes, masterLocRes, iqcLocRes] = await Promise.all([
      fetchLabMasterOptionsGrouped().catch(() => null),
      supabase.from('equipment_for_calibration').select('current_location'),
      supabase.from('equipment_master').select('current_location'),
      supabase.from('iqc_masters').select('current_location'),
    ])
    const masterDepts: ManagedLocationOption[] = (grouped?.department ?? []).map((o) => ({
      value: o.value,
      label: o.label,
      inMaster: true,
    }))
    const masterLabels = new Set(masterDepts.map((o) => o.label.toLowerCase()))
    const legacyLabels = Array.from(
      new Set([
        ...fromLocationRows(calLocRes.data),
        ...fromLocationRows(masterLocRes.data),
        ...fromLocationRows(iqcLocRes.data),
      ]),
    ).filter((label) => !masterLabels.has(label.toLowerCase()))
    const legacy: ManagedLocationOption[] = legacyLabels.map((label) => ({
      value: `legacy:${label}`,
      label,
      inMaster: false,
    }))
    setManaged([...masterDepts, ...legacy].sort((a, b) => a.label.localeCompare(b.label)))
  }, [])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        await reload()
      } catch {
        if (!cancelled) setManaged([])
      }
    })()
    return () => {
      cancelled = true
    }
  }, [reload])

  const options = useMemo<FilterComboboxOption[]>(
    () => managed.map((loc) => ({ id: loc.value, label: loc.label })),
    [managed],
  )

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q || !open) return options
    return options.filter((opt) => opt.label.toLowerCase().includes(q))
  }, [query, open, options])

  const openManage = () => {
    if (disabled) return
    setOpen(false)
    setEditingValue(null)
    setNewName(query.trim() || value.trim())
    setError(null)
    setDialogOpen(true)
  }

  const handleSave = () => {
    void (async () => {
      const formatted = newName.trim()
      if (!formatted) {
        setError('Location name is required.')
        return
      }
      const duplicate = managed.some(
        (loc) =>
          loc.label.toLowerCase() === formatted.toLowerCase() && loc.value !== editingValue,
      )
      if (duplicate) {
        setError('This location already exists.')
        return
      }

      setSaving(true)
      setError(null)
      try {
        if (editingValue) {
          const current = managed.find((loc) => loc.value === editingValue)
          if (!current) throw new Error('Location not found.')
          const prevLabel = current.label
          if (current.inMaster) {
            await updateLabMasterOption('department', current.value, formatted)
          } else {
            await ensureLabMasterOptionByLabel('department', formatted)
          }
          if (value === prevLabel) onChange(formatted)
        } else {
          await ensureLabMasterOptionByLabel('department', formatted)
          onChange(formatted)
        }
        await reload()
        handleDialogOpenChange(false)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unable to save location')
      } finally {
        setSaving(false)
      }
    })()
  }

  const handleDelete = (option: ManagedLocationOption) => {
    void (async () => {
      setError(null)
      try {
        if (option.inMaster) {
          await deleteLabMasterOption('department', option.value)
        }
        setManaged((prev) => prev.filter((loc) => loc.value !== option.value))
        if (value === option.label) {
          onChange('')
          setQuery('')
        }
        if (editingValue === option.value) {
          setEditingValue(null)
          setNewName('')
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unable to delete location')
      }
    })()
  }

  return (
    <div className={cn('min-w-0 space-y-0.5', className)}>
      <Label htmlFor={inputId}>{label}</Label>
      <LimsFieldWithAdd
        addButton={
          <LimsFieldAddButton
            aria-label="Add new location"
            title="Add New Location"
            disabled={disabled}
            onClick={openManage}
          />
        }
      >
        <FilterCombobox
          inputId={inputId}
          listId={listId}
          value={open ? query : value}
          onValueChange={(v) => {
            setQuery(v)
            if (!open) setOpen(true)
            if (!v.trim()) onChange('')
          }}
          options={filtered}
          onSelectOption={(opt) => {
            onChange(opt.label)
            setQuery(opt.label)
            setOpen(false)
          }}
          open={open}
          onOpenChange={(next) => {
            setOpen(next)
            if (next) setQuery(value)
          }}
          placeholder="Select from created locations"
          disabled={disabled}
        />
      </LimsFieldWithAdd>

      <Dialog open={dialogOpen} onOpenChange={handleDialogOpenChange}>
        <DialogContent
          persistOnFocusLoss
          layer="stacked"
          aria-describedby={undefined}
          className={cn(limsDialogClass, 'max-w-lg p-0')}
        >
          <div className="relative overflow-hidden bg-gradient-to-br from-stone-800 via-stone-900 to-stone-950 px-4 py-2.5 text-white">
            <div
              className="pointer-events-none absolute inset-0 opacity-[0.18]"
              style={limsDarkBarGlowStyle}
            />
            <div className="absolute bottom-0 left-0 h-[2px] w-full bg-gradient-to-r from-amber-500 via-amber-300 to-transparent" />
            <DialogHeader className="relative pr-10 text-left">
              <DialogTitle className="text-base font-semibold tracking-tight text-white">
                {editingValue ? 'Edit Location' : 'Add New Location'}
              </DialogTitle>
            </DialogHeader>
          </div>

          <div className="space-y-4 bg-gradient-to-b from-stone-100/80 to-white px-4 py-4">
            <div className="space-y-2">
              <Label
                htmlFor={manageInputId}
                className="text-[11px] font-semibold uppercase tracking-wide text-stone-600"
              >
                {editingValue ? 'Edit Location Name' : 'Location Name'}
              </Label>
              <Input
                id={manageInputId}
                placeholder="e.g., Mechanical Lab"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                className={limsFieldClass}
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    handleSave()
                  }
                }}
              />
            </div>

            <div>
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-stone-600">
                Existing Locations
              </p>
              <div className="max-h-40 space-y-1 overflow-auto">
                {managed.length > 0 ? (
                  managed.map((loc) => (
                    <div key={loc.value} className={MANAGE_LIST_ITEM}>
                      <span className="min-w-0 truncate">{loc.label}</span>
                      <div className="flex shrink-0 items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => {
                            setEditingValue(loc.value)
                            setNewName(loc.label)
                            setError(null)
                            window.requestAnimationFrame(() => {
                              document.getElementById(manageInputId)?.focus()
                            })
                          }}
                          className="text-amber-800 hover:text-amber-950"
                          aria-label={`Edit ${loc.label}`}
                        >
                          <Pencil size={14} />
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleDelete(loc)}
                          className="text-red-600 hover:text-red-800"
                          aria-label={`Delete ${loc.label}`}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-xs text-stone-500">No locations added yet.</p>
                )}
              </div>
            </div>

            {error ? <p className="text-xs text-red-700">{error}</p> : null}
          </div>

          <DialogFooter className="border-t border-stone-200 bg-stone-50 px-4 py-3 sm:justify-end">
            <Button
              type="button"
              className={cn(limsPrimaryBtnClass, 'min-w-[8.5rem]')}
              onClick={() => void handleSave()}
              disabled={!newName.trim() || saving}
            >
              {saving ? 'Saving…' : 'Save & Close'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
