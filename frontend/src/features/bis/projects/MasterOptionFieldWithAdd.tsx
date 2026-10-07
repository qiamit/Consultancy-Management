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
import { useFormDialogOpenChange } from '@/lib/formDialogOpenChange'
import {
  limsDarkBarGlowStyle,
  limsDialogClass,
  limsFieldClass,
  limsOutlineBtnClass,
  limsPrimaryBtnClass,
} from '@/lib/limsThemeUi'
import { cn } from '@/lib/utils'
import {
  deleteBisMasterOption,
  ensureBisMasterOption,
  getCachedBisMasterOptions,
  isBuiltinBisMasterOption,
  refreshBisMasterOptions,
  subscribeBisMasterOptions,
  updateBisMasterOption,
  type BisMasterOptionCategory,
} from './bisMasterOptions'

const MANAGE_LIST_ITEM =
  'flex items-center justify-between gap-2 rounded-none border border-stone-500 bg-stone-50 px-3 py-1.5 text-sm text-stone-900'

export function MasterOptionFieldWithAdd({
  category,
  value,
  onChange,
  label,
  inputId,
  listId,
  placeholder = 'Select or Add',
  manageTitle,
  disabled = false,
  showLabel = true,
  className,
}: {
  category: BisMasterOptionCategory
  value: string
  onChange: (next: string) => void
  label: string
  inputId: string
  listId: string
  placeholder?: string
  manageTitle?: string
  disabled?: boolean
  /** When false, omit the field label (e.g. table cells). */
  showLabel?: boolean
  className?: string
}) {
  const [query, setQuery] = useState(value)
  const [open, setOpen] = useState(false)
  const [options, setOptions] = useState<FilterComboboxOption[]>([])
  const [dialogOpen, setDialogOpen] = useState(false)
  const [newName, setNewName] = useState('')
  const [editingValue, setEditingValue] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const manageInputId = `${inputId}-manage-name`
  const title = manageTitle ?? label

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

  const applyOptions = useCallback((rows: { value: string; label: string }[]) => {
    setOptions(rows.map((r) => ({ id: r.value, label: r.label })))
  }, [])

  useEffect(() => {
    const cached = getCachedBisMasterOptions(category)
    if (cached) applyOptions(cached)

    let cancelled = false
    void (async () => {
      try {
        const rows = await refreshBisMasterOptions(category)
        if (!cancelled) applyOptions(rows)
      } catch {
        if (!cancelled && !getCachedBisMasterOptions(category)) setOptions([])
      }
    })()

    const unsubscribe = subscribeBisMasterOptions((changed, rows) => {
      if (changed !== category) return
      applyOptions(rows)
    })

    return () => {
      cancelled = true
      unsubscribe()
    }
  }, [category, applyOptions])

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

  const managePlaceholder = `Enter ${title}`

  const persistOption = (mode: 'add' | 'saveClose') => {
    void (async () => {
      const formatted = newName.trim()
      if (!formatted) {
        setError(`${title} is required.`)
        return
      }
      const duplicate = options.some(
        (opt) =>
          opt.label.toLowerCase() === formatted.toLowerCase() && opt.id !== editingValue,
      )
      if (duplicate) {
        setError('This value already exists.')
        return
      }

      setSaving(true)
      setError(null)
      try {
        if (editingValue) {
          const current = options.find((opt) => opt.id === editingValue)
          if (!current) throw new Error('Option not found.')
          await updateBisMasterOption(category, current.id, formatted)
          if (value === current.label) onChange(formatted)
          await refreshBisMasterOptions(category)
          handleDialogOpenChange(false)
        } else {
          await ensureBisMasterOption(category, formatted)
          onChange(formatted)
          await refreshBisMasterOptions(category)
          if (mode === 'saveClose') {
            handleDialogOpenChange(false)
          } else {
            // Keep dialog open for multiple adds.
            setNewName('')
            setEditingValue(null)
            window.requestAnimationFrame(() => {
              document.getElementById(manageInputId)?.focus()
            })
          }
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unable to save')
      } finally {
        setSaving(false)
      }
    })()
  }

  const handleDelete = (opt: FilterComboboxOption) => {
    void (async () => {
      setError(null)
      if (isBuiltinBisMasterOption(category, opt.label) || isBuiltinBisMasterOption(category, opt.id)) {
        setError('Built-in options cannot be deleted.')
        return
      }
      try {
        await deleteBisMasterOption(category, opt.id)
        if (value === opt.label) {
          onChange('')
          setQuery('')
        }
        if (editingValue === opt.id) {
          setEditingValue(null)
          setNewName('')
        }
        await refreshBisMasterOptions(category)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unable to delete')
      }
    })()
  }

  return (
    <div className={cn('min-w-0', showLabel ? 'space-y-0.5' : '', className)}>
      {showLabel ? <Label htmlFor={inputId}>{label}</Label> : null}
      <LimsFieldWithAdd
        addButton={
          <LimsFieldAddButton
            aria-label={`Add new ${title}`}
            title={`Add New ${title}`}
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
          placeholder={placeholder}
          disabled={disabled}
          showSerialNumbers={false}
          inputClassName={cn(
            limsFieldClass,
            '!border-0 !bg-stone-50 !shadow-none',
            'focus-visible:!border-transparent focus-visible:!bg-stone-50 focus-visible:!ring-0',
            '[&:-webkit-autofill]:[-webkit-text-fill-color:inherit]',
            '[&:-webkit-autofill]:[box-shadow:inset_0_0_0_1000px_rgb(250_250_249)]',
          )}
        />
      </LimsFieldWithAdd>

      <Dialog open={dialogOpen} onOpenChange={handleDialogOpenChange}>
        <DialogContent
          persistOnFocusLoss
          layer="stacked"
          aria-describedby={undefined}
          className={cn(limsDialogClass, 'w-[min(32rem,calc(100vw-1.5rem))] max-w-lg p-0')}
        >
          <div className="relative overflow-hidden bg-gradient-to-br from-stone-800 via-stone-900 to-stone-950 px-4 py-2.5 text-white">
            <div
              className="pointer-events-none absolute inset-0 opacity-[0.18]"
              style={limsDarkBarGlowStyle}
            />
            <div className="absolute bottom-0 left-0 h-[2px] w-full bg-gradient-to-r from-amber-500 via-amber-300 to-transparent" />
            <DialogHeader className="relative pr-10 text-left">
              <DialogTitle className="text-base font-semibold tracking-tight text-white">
                {editingValue ? `Edit ${title}` : `Add New ${title}`}
              </DialogTitle>
            </DialogHeader>
          </div>

          <div className="space-y-4 bg-gradient-to-b from-stone-100/80 to-white px-4 py-4">
            <div className="space-y-2">
              <Label
                htmlFor={manageInputId}
                className="text-[11px] font-semibold uppercase tracking-wide text-stone-600"
              >
                {editingValue ? `Edit ${title}` : title}
              </Label>
              <LimsFieldWithAdd
                addButton={
                  <LimsFieldAddButton
                    aria-label={editingValue ? `Save ${title}` : `Add ${title}`}
                    title={editingValue ? 'Save' : 'Add'}
                    disabled={saving || !newName.trim()}
                    onClick={() => persistOption(editingValue ? 'saveClose' : 'add')}
                  />
                }
              >
                <Input
                  id={manageInputId}
                  placeholder={managePlaceholder}
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className={cn(
                    limsFieldClass,
                    '!border-0 !bg-stone-50 !shadow-none',
                    'focus-visible:!border-transparent focus-visible:!bg-stone-50 focus-visible:!ring-0',
                  )}
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      persistOption(editingValue ? 'saveClose' : 'add')
                    }
                  }}
                />
              </LimsFieldWithAdd>
            </div>

            <div>
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-stone-600">
                Existing {title}
              </p>
              <div className="max-h-40 space-y-1 overflow-auto">
                {options.length > 0 ? (
                  options.map((opt) => (
                    <div key={opt.id} className={MANAGE_LIST_ITEM}>
                      <span className="min-w-0 truncate">{opt.label}</span>
                      <div className="flex shrink-0 items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => {
                            setEditingValue(opt.id)
                            setNewName(opt.label)
                            setError(null)
                            window.requestAnimationFrame(() => {
                              document.getElementById(manageInputId)?.focus()
                            })
                          }}
                          className="text-amber-800 hover:text-amber-950"
                          aria-label={`Edit ${opt.label}`}
                        >
                          <Pencil size={14} />
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleDelete(opt)}
                          className="text-red-600 hover:text-red-800"
                          aria-label={`Delete ${opt.label}`}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-xs text-stone-500">No values added yet.</p>
                )}
              </div>
            </div>

            {error ? <p className="text-xs text-red-700">{error}</p> : null}
          </div>

          <DialogFooter className="border-t border-stone-200 bg-stone-50 px-4 py-3 sm:justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              className={cn(limsOutlineBtnClass, 'min-w-[6.5rem]')}
              onClick={() => handleDialogOpenChange(false)}
              disabled={saving}
            >
              Close
            </Button>
            {editingValue ? (
              <Button
                type="button"
                className={cn(limsPrimaryBtnClass, 'min-w-[8.5rem]')}
                onClick={() => persistOption('saveClose')}
                disabled={!newName.trim() || saving}
              >
                {saving ? 'Saving…' : 'Save'}
              </Button>
            ) : null}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
