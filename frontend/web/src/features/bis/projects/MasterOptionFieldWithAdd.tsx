import { useCallback, useEffect, useMemo, useState } from 'react'
import { Dialog } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { LimsFieldAddButton, LimsFieldWithAdd } from '@/components/lims/LimsFieldWithAdd'
import {
  FilterCombobox,
  type FilterComboboxOption,
} from '@/features/sample-handling/receiving/FilterCombobox'
import { useFormDialogOpenChange } from '@/lib/formDialogOpenChange'
import {
  limsFieldClass,
} from '@/lib/limsThemeUi'
import { cn } from '@/lib/utils'
import { ClientManageDialogContent } from '@/features/masters/clients/ClientManageDialogContent'
import {
  deleteBisMasterOption,
  ensureBisMasterOption,
  getCachedBisMasterOptions,
  refreshBisMasterOptions,
  subscribeBisMasterOptions,
  updateBisMasterOption,
  type BisMasterOptionCategory,
} from './bisMasterOptions'

const NO_DEFAULT_OPTIONS: FilterComboboxOption[] = []

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
  defaultOptions = NO_DEFAULT_OPTIONS,
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
  /** Built-in choices shown alongside values managed in the master list. */
  defaultOptions?: FilterComboboxOption[]
}) {
  const [query, setQuery] = useState(value)
  const [open, setOpen] = useState(false)
  const [options, setOptions] = useState<FilterComboboxOption[]>(() => {
    const merged = [
      ...defaultOptions,
      ...(getCachedBisMasterOptions(category) ?? []).map((row) => ({ id: row.value, label: row.label })),
    ]
    const unique = new Map<string, FilterComboboxOption>()
    for (const option of merged) unique.set(option.label.toLowerCase(), option)
    return [...unique.values()]
  })
  const [dialogOpen, setDialogOpen] = useState(false)
  const [newName, setNewName] = useState('')
  const [managerKey, setManagerKey] = useState(0)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const manageInputId = `${inputId}-manage-name`
  const title = manageTitle ?? label

  const handleDialogOpenChange = useFormDialogOpenChange((next) => {
    setDialogOpen(next)
    if (!next) {
      setNewName('')
      setError(null)
    }
  })

  const applyOptions = useCallback((rows: { value: string; label: string }[]) => {
    const merged = [
      ...defaultOptions,
      ...rows.map((r) => ({ id: r.value, label: r.label })),
    ]
    const unique = new Map<string, FilterComboboxOption>()
    for (const option of merged) unique.set(option.label.toLowerCase(), option)
    setOptions([...unique.values()])
  }, [defaultOptions])

  useEffect(() => {
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
    setNewName(query.trim() || value.trim())
    setError(null)
    setDialogOpen(true)
  }

  const managePlaceholder = `Enter ${title}`

  const persistOption = (mode: 'add' | 'update', updateId?: string) => {
    void (async () => {
      const formatted = newName.trim()
      if (!formatted) {
        setError(`${title} is required.`)
        return
      }
      const duplicate = options.some(
        (opt) =>
          opt.label.toLowerCase() === formatted.toLowerCase() && opt.id !== updateId,
      )
      if (duplicate) {
        setError('This value already exists.')
        return
      }

      setSaving(true)
      setError(null)
      try {
        if (mode === 'update') {
          const current = options.find((opt) => opt.id === updateId)
          if (!current) throw new Error('Option not found.')
          await updateBisMasterOption(category, current.id, formatted)
          if (value === current.label) onChange(formatted)
          await refreshBisMasterOptions(category)
          setNewName('')
          setManagerKey((current) => current + 1)
        } else {
          await ensureBisMasterOption(category, formatted)
          onChange(formatted)
          await refreshBisMasterOptions(category)
          // Keep the manager open so multiple options can be added in sequence.
          setNewName('')
          window.requestAnimationFrame(() => {
            document.getElementById(manageInputId)?.focus()
          })
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unable to save')
      } finally {
        setSaving(false)
      }
    })()
  }

  const handleDelete = (id: string) => {
    void (async () => {
      setError(null)
      try {
        const opt = options.find((item) => item.id === id)
        if (!opt) return
        await deleteBisMasterOption(category, opt.id)
        if (value === opt.label) {
          onChange('')
          setQuery('')
        }
        await refreshBisMasterOptions(category)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unable to delete')
      }
    })()
  }

  return (
    <div className={cn('min-w-0', showLabel ? 'space-y-1.5' : '', className)}>
      {showLabel ? (
        <Label
          htmlFor={inputId}
          className="text-[11px] font-semibold uppercase tracking-[0.08em] text-stone-600"
        >
          {label}
        </Label>
      ) : null}
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
        <ClientManageDialogContent
          key={managerKey}
          open={dialogOpen}
          title={`Manage ${title}`}
          addLabel={`Add ${title}`}
          inputId={manageInputId}
          placeholder={managePlaceholder}
          value={newName}
          onValueChange={setNewName}
          inlineAdd
          onInlineAdd={() => persistOption('add')}
          onSave={() => persistOption('add')}
          onUpdate={(id) => persistOption('update', id)}
          saveDisabled={!newName.trim() || saving}
          items={options}
          canDelete={() => true}
          onDelete={handleDelete}
          layer="stacked"
          message={error}
        />
      </Dialog>
    </div>
  )
}
