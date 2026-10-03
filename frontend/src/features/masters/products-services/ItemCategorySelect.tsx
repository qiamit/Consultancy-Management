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
  addItemCategory,
  deleteItemCategory,
  updateItemCategory,
} from './itemCategoryApi'
import { useItemCategories } from './useItemCategories'

const manageListItemClass =
  'flex items-center justify-between rounded-none border border-stone-500 bg-stone-50 px-3 py-1.5 text-sm text-stone-900'

export function ItemCategorySelect({
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
  const { categories } = useItemCategories()
  const inputRef = useRef<HTMLInputElement | null>(null)
  const [open, setOpen] = useState(false)
  const [highlight, setHighlight] = useState(0)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [newCategoryName, setNewCategoryName] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const filteredCategories = useMemo(() => {
    const q = value.trim().toLowerCase()
    if (!q) return categories
    return categories.filter((c) => c.name.toLowerCase().includes(q))
  }, [categories, value])

  const showAddCategoryAction = useMemo(() => {
    const typed = value.trim()
    if (!typed) return false
    return !categories.some((c) => c.name.toLowerCase() === typed.toLowerCase())
  }, [categories, value])

  const totalOptions = filteredCategories.length + (showAddCategoryAction ? 1 : 0)
  const resolvedPlaceholder =
    placeholder ?? (categories.length > 0 ? 'Type or select category' : 'Add categories to use them here')
  const categoryInputId = `${id ?? 'item-category'}-new`

  useEffect(() => {
    setHighlight((prev) => (totalOptions === 0 ? 0 : Math.min(prev, totalOptions - 1)))
  }, [totalOptions])

  useEffect(() => {
    if (!dialogOpen) {
      setEditingId(null)
      setNewCategoryName('')
      setError(null)
    }
  }, [dialogOpen])

  const pickCategory = (name: string) => {
    onChange(name)
    setOpen(false)
  }

  const openManageDialog = (prefill?: string) => {
    setEditingId(null)
    setNewCategoryName(prefill?.trim() ?? '')
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
      if (highlight < filteredCategories.length) {
        pickCategory(filteredCategories[highlight]!.name)
      } else if (showAddCategoryAction) {
        openManageDialog(value)
        setOpen(false)
      }
    }
  }

  const handleSaveAndClose = async () => {
    const name = newCategoryName.trim()
    if (!name) return
    setSaving(true)
    setError(null)
    try {
      if (editingId) {
        const prevName = categories.find((c) => c.id === editingId)?.name
        const row = await updateItemCategory(editingId, name)
        if (prevName && value === prevName) onChange(row.name)
        else if (!value.trim()) onChange(row.name)
      } else {
        const row = await addItemCategory(name)
        onChange(row.name)
      }
      setDialogOpen(false)
      setEditingId(null)
      setNewCategoryName('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save category')
    } finally {
      setSaving(false)
    }
  }

  const handleDeleteCategory = async (categoryId: string) => {
    setError(null)
    try {
      const removedName = await deleteItemCategory(categoryId)
      if (removedName && value === removedName) onChange('')
      if (editingId === categoryId) {
        setEditingId(null)
        setNewCategoryName('')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to delete category')
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
                aria-label="Add item category"
                title="Add New"
                disabled={disabled}
              >
                <Plus size={14} strokeWidth={2.25} aria-hidden />
              </button>
            ) : null}
          </div>
          {(filteredCategories.length > 0 || showAddCategoryAction) && open && !disabled && (
            <div
              className="absolute z-30 mt-1 w-full rounded-none border border-stone-500 bg-white shadow-lg"
              tabIndex={-1}
            >
              <ul className="max-h-56 overflow-auto text-sm">
                {filteredCategories.map((category, index) => (
                  <li key={category.id}>
                    <button
                      type="button"
                      tabIndex={-1}
                      className={`w-full px-3 py-2 text-left ${index === highlight ? 'bg-[#f3e9d8] font-semibold' : 'hover:bg-[#f7f3eb]'}`}
                      onMouseDown={(e) => e.preventDefault()}
                      onPointerDown={(e) => {
                        e.preventDefault()
                        e.stopPropagation()
                        pickCategory(category.name)
                      }}
                      onMouseEnter={() => setHighlight(index)}
                      onClick={() => pickCategory(category.name)}
                    >
                      {category.name}
                    </button>
                  </li>
                ))}
                {showAddCategoryAction && (
                  <li>
                    <button
                      type="button"
                      tabIndex={-1}
                      className={`w-full px-3 py-2 text-left text-amber-800 ${
                        highlight === filteredCategories.length ? 'bg-[#f3e9d8] font-semibold' : 'hover:bg-[#f7f3eb]'
                      }`}
                      onMouseDown={(e) => e.preventDefault()}
                      onPointerDown={(e) => {
                        e.preventDefault()
                        e.stopPropagation()
                        openManageDialog(value)
                        setOpen(false)
                      }}
                      onMouseEnter={() => setHighlight(filteredCategories.length)}
                      onClick={() => {
                        openManageDialog(value)
                        setOpen(false)
                      }}
                    >
                      Add &quot;{value.trim()}&quot; as new category
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
                {editingId ? 'Edit Item Category' : 'Manage Item Categories'}
              </DialogTitle>
            </DialogHeader>
          </div>

          <div className="space-y-4 bg-gradient-to-b from-stone-100/80 to-white px-4 py-4">
            <div className="space-y-2">
              <Label
                htmlFor={categoryInputId}
                className="text-[11px] font-semibold uppercase tracking-wide text-stone-600"
              >
                {editingId ? 'Edit Category Name' : 'Category Name'}
              </Label>
              <Input
                id={categoryInputId}
                placeholder="e.g., Testing"
                value={newCategoryName}
                onChange={(e) => setNewCategoryName(e.target.value)}
                className={limsFieldClass}
              />
            </div>
            <div>
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-stone-600">
                Existing Categories
              </p>
              <div className="max-h-40 space-y-1 overflow-auto">
                {categories.length > 0 ? (
                  categories.map((category) => (
                    <div key={category.id} className={manageListItemClass}>
                      <span className="min-w-0 truncate">{category.name}</span>
                      <div className="flex shrink-0 items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => {
                            setEditingId(category.id)
                            setNewCategoryName(category.name)
                            setError(null)
                            window.requestAnimationFrame(() => {
                              document.getElementById(categoryInputId)?.focus()
                            })
                          }}
                          className="text-amber-800 hover:text-amber-950"
                          aria-label={`Edit ${category.name}`}
                        >
                          <Pencil size={14} />
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleDeleteCategory(category.id)}
                          className="text-red-600 hover:text-red-800"
                          aria-label={`Delete ${category.name}`}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-xs text-stone-500">No categories added yet.</p>
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
              disabled={!newCategoryName.trim() || saving}
            >
              {saving ? 'Saving…' : 'Save & Close'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
