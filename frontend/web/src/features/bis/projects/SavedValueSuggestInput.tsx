import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type Ref,
} from 'react'
import { createPortal } from 'react-dom'
import { Input } from '@/components/ui/input'
import {
  FILTER_COMBOBOX_DROPDOWN_ATTR,
  FILTER_COMBOBOX_OPTION_INDEX_ATTR,
  isFilterComboboxDropdownTarget,
  useFilterComboboxPointerSelect,
} from '@/features/sample-handling/receiving/FilterCombobox'
import { cn } from '@/lib/utils'

/** Unique non-empty trimmed values, first-seen order (case-insensitive). */
export function uniqueSavedColumnValues(values: string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const raw of values) {
    const v = String(raw ?? '').trim()
    if (!v) continue
    const key = v.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(v)
  }
  return out
}

type DropdownPosition = {
  left: number
  width: number
  top?: number
  bottom?: number
}

/**
 * Table draft input: keeps free typing, and filters previously saved column
 * values under the field for quick re-select.
 */
export function SavedValueSuggestInput({
  value,
  onChange,
  suggestions,
  placeholder,
  disabled = false,
  className,
  inputRef,
  onKeyDown,
  maxSuggestions = 12,
}: {
  value: string
  onChange: (next: string) => void
  suggestions: string[]
  placeholder?: string
  disabled?: boolean
  className?: string
  inputRef?: Ref<HTMLInputElement>
  onKeyDown?: (e: KeyboardEvent<HTMLInputElement>) => void
  maxSuggestions?: number
}) {
  const localRef = useRef<HTMLInputElement | null>(null)
  const selectingRef = useRef(false)
  const [open, setOpen] = useState(false)
  const [highlightIndex, setHighlightIndex] = useState(-1)
  const [dropdownPosition, setDropdownPosition] = useState<DropdownPosition | null>(null)

  const filtered = useMemo(() => {
    const q = value.trim().toLowerCase()
    const list = suggestions.filter((s) => !q || s.toLowerCase().includes(q))
    return list.slice(0, maxSuggestions)
  }, [suggestions, value, maxSuggestions])

  const setRefs = (el: HTMLInputElement | null) => {
    localRef.current = el
    if (!inputRef) return
    if (typeof inputRef === 'function') inputRef(el)
    else inputRef.current = el
  }

  const selectIndex = (index: number) => {
    const picked = filtered[index]
    if (!picked || selectingRef.current) return
    selectingRef.current = true
    try {
      onChange(picked)
      setOpen(false)
      setHighlightIndex(-1)
    } finally {
      window.setTimeout(() => {
        selectingRef.current = false
      }, 0)
    }
  }

  const selectIndexRef = useRef(selectIndex)
  selectIndexRef.current = selectIndex
  useFilterComboboxPointerSelect(open && filtered.length > 0, (index) =>
    selectIndexRef.current(index),
  )

  useEffect(() => {
    if (!open) setHighlightIndex(-1)
  }, [open])

  useEffect(() => {
    setHighlightIndex((current) => {
      if (filtered.length === 0) return -1
      if (current < 0) return current
      return Math.min(current, filtered.length - 1)
    })
  }, [filtered.length])

  const updateDropdownPosition = () => {
    const input = localRef.current
    if (!input) return
    const rect = input.getBoundingClientRect()
    const estimatedHeight = Math.min(28 + Math.max(filtered.length, 1) * 36, 220)
    const spaceBelow = window.innerHeight - rect.bottom
    const spaceAbove = rect.top
    const openUp = spaceBelow < estimatedHeight + 8 && spaceAbove > spaceBelow
    setDropdownPosition(
      openUp
        ? {
            left: rect.left,
            width: rect.width,
            bottom: window.innerHeight - rect.top + 4,
          }
        : {
            left: rect.left,
            width: rect.width,
            top: rect.bottom + 4,
          },
    )
  }

  useLayoutEffect(() => {
    if (!open || filtered.length === 0) {
      setDropdownPosition(null)
      return
    }
    updateDropdownPosition()
    const handleReposition = () => updateDropdownPosition()
    window.addEventListener('resize', handleReposition)
    window.addEventListener('scroll', handleReposition, true)
    return () => {
      window.removeEventListener('resize', handleReposition)
      window.removeEventListener('scroll', handleReposition, true)
    }
  }, [open, filtered.length, value])

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      if (filtered.length === 0) {
        onKeyDown?.(e)
        return
      }
      e.preventDefault()
      setOpen(true)
      setHighlightIndex((current) =>
        current < 0 ? 0 : Math.min(current + 1, filtered.length - 1),
      )
      return
    }
    if (e.key === 'ArrowUp') {
      if (!open || filtered.length === 0) {
        onKeyDown?.(e)
        return
      }
      e.preventDefault()
      setHighlightIndex((current) => (current <= 0 ? 0 : current - 1))
      return
    }
    if (e.key === 'Enter') {
      if (open && filtered.length > 0 && highlightIndex >= 0) {
        e.preventDefault()
        selectIndex(highlightIndex)
        return
      }
      if (open && filtered.length > 0 && highlightIndex < 0) {
        // No highlight — let parent commit the row (sticky + add).
        setOpen(false)
        onKeyDown?.(e)
        return
      }
      onKeyDown?.(e)
      return
    }
    if (e.key === 'Escape') {
      if (!open) {
        onKeyDown?.(e)
        return
      }
      e.preventDefault()
      setOpen(false)
      setHighlightIndex(-1)
      return
    }
    onKeyDown?.(e)
  }

  const listId = 'saved-value-suggest-list'
  const dropdown =
    open && filtered.length > 0 && dropdownPosition
      ? createPortal(
          <div
            {...{ [FILTER_COMBOBOX_DROPDOWN_ATTR]: '' }}
            className="pointer-events-auto fixed z-[10000] overflow-hidden rounded-none border-2 border-stone-600 bg-[#fffcf7] shadow-2xl ring-1 ring-amber-700/30"
            style={{
              left: dropdownPosition.left,
              width: Math.max(dropdownPosition.width, 160),
              top: dropdownPosition.top,
              bottom: dropdownPosition.bottom,
            }}
            onPointerDown={(e) => e.stopPropagation()}
            onMouseDown={(e) => {
              e.preventDefault()
              e.stopPropagation()
            }}
          >
            <div className="flex items-center justify-between gap-2 border-b border-stone-500 bg-gradient-to-r from-stone-800 via-stone-900 to-stone-800 px-2.5 py-1">
              <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-amber-200">
                Saved
              </p>
              <p className="text-[10px] tabular-nums text-stone-300">
                {filtered.length === 1 ? '1' : filtered.length}
              </p>
            </div>
            <ul
              id={listId}
              role="listbox"
              className="max-h-48 overflow-auto overscroll-contain py-0.5 text-sm"
            >
              {filtered.map((opt, index) => {
                const active = highlightIndex === index
                return (
                  <li key={`${opt}-${index}`} role="presentation">
                    <button
                      type="button"
                      role="option"
                      tabIndex={-1}
                      {...{ [FILTER_COMBOBOX_OPTION_INDEX_ATTR]: String(index) }}
                      aria-selected={active}
                      className={cn(
                        'flex w-full items-center border-l-2 px-2.5 py-1.5 text-center transition-colors',
                        active
                          ? 'border-l-amber-600 bg-amber-100/90 text-stone-950'
                          : 'border-l-transparent text-stone-800 hover:border-l-amber-400/80 hover:bg-[#f3e9d8]',
                      )}
                      onPointerDown={(e) => {
                        e.preventDefault()
                        e.stopPropagation()
                        selectIndex(index)
                      }}
                      onMouseEnter={() => setHighlightIndex(index)}
                    >
                      <span className="w-full truncate font-medium">{opt}</span>
                    </button>
                  </li>
                )
              })}
            </ul>
          </div>,
          document.body,
        )
      : null

  return (
    <>
      <Input
        ref={setRefs}
        className={className}
        value={value}
        disabled={disabled}
        placeholder={placeholder}
        autoComplete="off"
        role="combobox"
        aria-expanded={open && filtered.length > 0}
        aria-controls={listId}
        aria-autocomplete="list"
        onChange={(e) => {
          onChange(e.target.value)
          setOpen(true)
          setHighlightIndex(-1)
        }}
        onFocus={() => {
          if (suggestions.length > 0) setOpen(true)
        }}
        onBlur={() => {
          window.setTimeout(() => {
            if (selectingRef.current) return
            const active = document.activeElement
            if (active && isFilterComboboxDropdownTarget(active)) return
            setOpen(false)
          }, 180)
        }}
        onKeyDown={handleKeyDown}
      />
      {dropdown}
    </>
  )
}
