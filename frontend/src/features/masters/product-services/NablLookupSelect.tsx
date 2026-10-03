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
import {
  addNablLookup,
  deleteNablLookup,
  updateNablLookup,
  type NablLookupKind,
} from './nablLookupApi'
import { useNablLookups } from './useNablLookups'

const manageListItemClass =
  'flex items-center justify-between rounded-none border border-stone-500 bg-stone-50 px-3 py-1.5 text-sm text-stone-900'

const KIND_LABELS: Record<
  NablLookupKind,
  { singular: string; plural: string; manageTitle: string; editTitle: string; addAria: string }
> = {
  discipline_group: {
    singular: 'Discipline / Group',
    plural: 'Discipline / Groups',
    manageTitle: 'Manage Discipline / Groups',
    editTitle: 'Edit Discipline / Group',
    addAria: 'Add discipline / group',
  },
  materials_products: {
    singular: 'Materials or Products',
    plural: 'Materials or Products',
    manageTitle: 'Manage Materials or Products',
    editTitle: 'Edit Materials or Products',
    addAria: 'Add materials or products',
  },
  discipline_name: {
    singular: 'Discipline Name',
    plural: 'Discipline Names',
    manageTitle: 'Manage Discipline Names',
    editTitle: 'Edit Discipline Name',
    addAria: 'Add discipline name',
  },
  group_name: {
    singular: 'Group',
    plural: 'Groups',
    manageTitle: 'Manage Groups',
    editTitle: 'Edit Group',
    addAria: 'Add group',
  },
}

export function NablLookupSelect({
  kind,
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
  kind: NablLookupKind
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
  const labels = KIND_LABELS[kind]
  const { items } = useNablLookups(kind)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const [open, setOpen] = useState(false)
  const [highlight, setHighlight] = useState(0)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [newName, setNewName] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const filtered = useMemo(() => {
    const q = value.trim().toLowerCase()
    if (!q) return items
    return items.filter((row) => row.name.toLowerCase().includes(q))
  }, [items, value])

  const showAddAction = useMemo(() => {
    const typed = value.trim()
    if (!typed) return false
    return !items.some((row) => row.name.toLowerCase() === typed.toLowerCase())
  }, [items, value])

  const totalOptions = filtered.length + (showAddAction ? 1 : 0)
  const resolvedPlaceholder =
    placeholder ??
    (items.length > 0 ? `Type or select ${labels.singular.toLowerCase()}` : `Add ${labels.singular.toLowerCase()} to use here`)
  const nameInputId = `${id ?? kind}-new`

  useEffect(() => {
    setHighlight((prev) => (totalOptions === 0 ? 0 : Math.min(prev, totalOptions - 1)))
  }, [totalOptions])

  useEffect(() => {
    if (!dialogOpen) {
      setEditingId(null)
      setNewName('')
      setError(null)
    }
  }, [dialogOpen])

  const pick = (name: string) => {
    onChange(name)
    setOpen(false)
  }

  const openManageDialog = (prefill?: string) => {
    setEditingId(null)
    setNewName(prefill?.trim() ?? '')
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
      if (highlight < filtered.length) {
        pick(filtered[highlight]!.name)
      } else if (showAddAction) {
        openManageDialog(value)
        setOpen(false)
      }
    }
  }

  const handleSaveAndClose = async () => {
    const name = newName.trim()
    if (!name) return
    setSaving(true)
    setError(null)
    try {
      if (editingId) {
        const prevName = items.find((r) => r.id === editingId)?.name
        const row = await updateNablLookup(kind, editingId, name)
        if (prevName && value === prevName) onChange(row.name)
        else if (!value.trim()) onChange(row.name)
      } else {
        const row = await addNablLookup(kind, name)
        onChange(row.name)
      }
      setDialogOpen(false)
      setEditingId(null)
      setNewName('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (rowId: string) => {
    setError(null)
    try {
      const removedName = await deleteNablLookup(kind, rowId)
      if (removedName && value === removedName) onChange('')
      if (editingId === rowId) {
        setEditingId(null)
        setNewName('')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to delete')
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
                className="inline-flex h-full w-9 shrink-0 items-center justify-center border-l border-stone-500 bg-stone-100 text-amber-800 transition-colors hover:bg-amber-500/15 hover:text-amber-950 disabled:pointer-events-none"
                onClick={() => openManageDialog()}
                onMouseDown={(e) => e.preventDefault()}
                aria-label={labels.addAria}
                title="Add New"
                disabled={disabled}
              >
                <Plus size={14} strokeWidth={2.25} aria-hidden />
              </button>
            ) : null}
          </div>
          {(filtered.length > 0 || showAddAction) && open && !disabled && (
            <div
              className="absolute z-30 mt-1 w-full rounded-none border border-stone-500 bg-white shadow-lg"
              tabIndex={-1}
            >
              <ul className="max-h-56 overflow-auto text-sm">
                {filtered.map((row, index) => (
                  <li key={row.id}>
                    <button
                      type="button"
                      tabIndex={-1}
                      className={`w-full px-3 py-2 text-left ${index === highlight ? 'bg-[#f3e9d8] font-semibold' : 'hover:bg-[#f7f3eb]'}`}
                      onMouseDown={(e) => e.preventDefault()}
                      onPointerDown={(e) => {
                        e.preventDefault()
                        e.stopPropagation()
                        pick(row.name)
                      }}
                      onMouseEnter={() => setHighlight(index)}
                      onClick={() => pick(row.name)}
                    >
                      {row.name}
                    </button>
                  </li>
                ))}
                {showAddAction && (
                  <li>
                    <button
                      type="button"
                      tabIndex={-1}
                      className={`w-full px-3 py-2 text-left text-amber-800 ${
                        highlight === filtered.length ? 'bg-[#f3e9d8] font-semibold' : 'hover:bg-[#f7f3eb]'
                      }`}
                      onMouseDown={(e) => e.preventDefault()}
                      onPointerDown={(e) => {
                        e.preventDefault()
                        e.stopPropagation()
                        openManageDialog(value)
                        setOpen(false)
                      }}
                      onMouseEnter={() => setHighlight(filtered.length)}
                      onClick={() => {
                        openManageDialog(value)
                        setOpen(false)
                      }}
                    >
                      Add &quot;{value.trim()}&quot; as new {labels.singular.toLowerCase()}
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
                {editingId ? labels.editTitle : labels.manageTitle}
              </DialogTitle>
            </DialogHeader>
          </div>

          <div className="space-y-4 bg-gradient-to-b from-stone-100/80 to-white px-4 py-4">
            <div className="space-y-2">
              <Label
                htmlFor={nameInputId}
                className="text-[11px] font-semibold uppercase tracking-wide text-stone-600"
              >
                {editingId ? `Edit ${labels.singular}` : labels.singular}
              </Label>
              <Input
                id={nameInputId}
                placeholder={`e.g. ${
                  kind === 'discipline_group'
                    ? 'Chemical - Building Material'
                    : kind === 'discipline_name'
                      ? 'Mechanical'
                      : kind === 'group_name'
                        ? 'Dimensional'
                        : 'Fine & Coarse Aggregates'
                }`}
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                className={limsFieldClass}
              />
            </div>
            <div>
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-stone-600">
                Existing {labels.plural}
              </p>
              <div className="max-h-40 space-y-1 overflow-auto">
                {items.length > 0 ? (
                  items.map((row) => (
                    <div key={row.id} className={manageListItemClass}>
                      <span className="min-w-0 truncate">{row.name}</span>
                      <div className="flex shrink-0 items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => {
                            setEditingId(row.id)
                            setNewName(row.name)
                            setError(null)
                            window.requestAnimationFrame(() => {
                              document.getElementById(nameInputId)?.focus()
                            })
                          }}
                          className="text-amber-800 hover:text-amber-950"
                          aria-label={`Edit ${row.name}`}
                        >
                          <Pencil size={14} />
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleDelete(row.id)}
                          className="text-red-600 hover:text-red-800"
                          aria-label={`Delete ${row.name}`}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-xs text-stone-500">No entries added yet.</p>
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
              disabled={!newName.trim() || saving}
            >
              {saving ? 'Saving…' : 'Save & Close'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
