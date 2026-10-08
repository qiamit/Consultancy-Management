import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Plus } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { AddIsCodeDialog } from '@/features/sample-handling/receiving/AddIsCodeDialog'
import {
  formatIsCodeLabel,
  formatIsCodeLabelFromParts,
  normalizeIsCodeLabel,
} from '@/features/masters/is-codes/formatIsCodeLabel'
import { supabase } from '@/lib/supabaseClient'
import { cn } from '@/lib/utils'

type IsCodeOption = {
  id: string
  displayCode: string
  title: string
  searchText: string
}

async function fetchIsCodeOptions(): Promise<IsCodeOption[]> {
  const { data, error } = await supabase
    .from('is_codes')
    .select('id, is_number, title, revision_year')
    .order('is_number', { ascending: true })

  if (error) throw error
  const list = Array.isArray(data)
    ? (data as Array<{
        id: string
        is_number: string
        title: string
        revision_year: string | null
      }>)
    : []

  return list
    .map((r) => {
      const displayCode = formatIsCodeLabelFromParts(r.is_number, r.revision_year)
      const title = (r.title ?? '').trim()
      return {
        id: r.id,
        displayCode,
        title,
        searchText: `${displayCode} ${title} ${r.is_number} ${r.revision_year ?? ''}`.toLowerCase(),
      }
    })
    .filter((r) => r.displayCode)
    .sort((a, b) => a.displayCode.localeCompare(b.displayCode, undefined, { numeric: true }))
}

export function NablTestMethodSelect({
  id = 'nabl-method',
  value,
  onChange,
  label = 'Test Method Specification',
  placeholder = 'IS 2386: 1963',
  className,
  disabled,
}: {
  id?: string
  value: string
  onChange: (value: string) => void
  label?: string
  placeholder?: string
  className?: string
  disabled?: boolean
}) {
  const [options, setOptions] = useState<IsCodeOption[]>([])
  const [open, setOpen] = useState(false)
  const [highlight, setHighlight] = useState(0)
  const [addOpen, setAddOpen] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)

  const refresh = useCallback(async () => {
    try {
      setLoadError(null)
      setOptions(await fetchIsCodeOptions())
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Unable to load IS codes')
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const filtered = useMemo(() => {
    const q = value.trim().toLowerCase()
    if (!q) return options.slice(0, 40)
    return options.filter((o) => o.searchText.includes(q)).slice(0, 40)
  }, [options, value])

  const showAddAction = useMemo(() => {
    const typed = normalizeIsCodeLabel(value)
    if (!typed) return false
    return !options.some(
      (o) =>
        o.displayCode.toLowerCase() === typed.toLowerCase() ||
        o.displayCode.replace(/\s/g, '').toLowerCase() === typed.replace(/\s/g, '').toLowerCase(),
    )
  }, [options, value])

  const totalOptions = filtered.length + (showAddAction ? 1 : 0)

  useEffect(() => {
    setHighlight((prev) => (totalOptions === 0 ? 0 : Math.min(prev, totalOptions - 1)))
  }, [totalOptions])

  const pick = (opt: IsCodeOption) => {
    onChange(opt.displayCode)
    setOpen(false)
  }

  const openAddDialog = () => {
    setAddOpen(true)
    setOpen(false)
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
        pick(filtered[highlight]!)
      } else if (showAddAction) {
        openAddDialog()
      }
    }
    if (event.key === 'Escape') {
      setOpen(false)
    }
  }

  return (
    <>
      <div className={cn('space-y-2', className)}>
        <Label htmlFor={id}>{label}</Label>
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
              placeholder={placeholder}
              autoComplete="off"
              aria-label={label}
              aria-expanded={open}
              aria-autocomplete="list"
              role="combobox"
              className={cn(
                'h-full min-w-0 flex-1 rounded-none border-0 bg-transparent px-3 shadow-none',
                'focus-visible:border-transparent focus-visible:bg-transparent focus-visible:ring-0',
              )}
            />
            <button
              type="button"
              className="inline-flex h-full w-9 shrink-0 items-center justify-center border-l border-stone-500 bg-stone-100 text-amber-800 transition-colors hover:bg-amber-500/15 hover:text-amber-950 disabled:pointer-events-none"
              onClick={openAddDialog}
              onMouseDown={(e) => e.preventDefault()}
              aria-label="Add IS code"
              title="Add New IS Code"
              disabled={disabled}
            >
              <Plus size={14} strokeWidth={2.25} aria-hidden />
            </button>
          </div>

          {open && !disabled && (filtered.length > 0 || showAddAction || loadError) && (
            <div
              className="absolute z-30 mt-1 w-full rounded-none border border-stone-500 bg-white shadow-lg"
              tabIndex={-1}
              role="listbox"
            >
              {loadError ? (
                <p className="px-3 py-2 text-xs text-red-700">{loadError}</p>
              ) : (
                <ul className="max-h-56 overflow-auto text-sm">
                  {filtered.map((opt, index) => (
                    <li key={opt.id}>
                      <button
                        type="button"
                        tabIndex={-1}
                        role="option"
                        aria-selected={index === highlight}
                        className={`w-full px-3 py-2 text-left ${
                          index === highlight ? 'bg-[#f3e9d8] font-semibold' : 'hover:bg-[#f7f3eb]'
                        }`}
                        onMouseDown={(e) => e.preventDefault()}
                        onPointerDown={(e) => {
                          e.preventDefault()
                          e.stopPropagation()
                          pick(opt)
                        }}
                        onMouseEnter={() => setHighlight(index)}
                        onClick={() => pick(opt)}
                      >
                        <span className="font-medium tabular-nums">{opt.displayCode}</span>
                        {opt.title ? (
                          <span className="mt-0.5 block truncate text-xs text-stone-500">
                            {opt.title}
                          </span>
                        ) : null}
                      </button>
                    </li>
                  ))}
                  {showAddAction && (
                    <li>
                      <button
                        type="button"
                        tabIndex={-1}
                        className={`w-full px-3 py-2 text-left text-amber-800 ${
                          highlight === filtered.length
                            ? 'bg-[#f3e9d8] font-semibold'
                            : 'hover:bg-[#f7f3eb]'
                        }`}
                        onMouseDown={(e) => e.preventDefault()}
                        onPointerDown={(e) => {
                          e.preventDefault()
                          e.stopPropagation()
                          openAddDialog()
                        }}
                        onMouseEnter={() => setHighlight(filtered.length)}
                        onClick={openAddDialog}
                      >
                        Add &quot;{normalizeIsCodeLabel(value) || value.trim()}&quot; to IS Code master
                      </button>
                    </li>
                  )}
                </ul>
              )}
            </div>
          )}
        </div>
      </div>

      <AddIsCodeDialog
        nested
        open={addOpen}
        onOpenChange={setAddOpen}
        initialLabel={value}
        onSaved={(newId) => {
          void (async () => {
            try {
              const { data, error } = await supabase
                .from('is_codes')
                .select('id, is_number, title, revision_year')
                .eq('id', newId)
                .single()
              if (error) throw error
              const row = data as {
                is_number: string
                revision_year: string | null
              }
              onChange(formatIsCodeLabel(row))
              await refresh()
            } catch {
              await refresh()
            }
          })()
        }}
      />
    </>
  )
}
