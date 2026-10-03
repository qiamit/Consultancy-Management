import { useEffect, useRef, useState } from 'react'
import {
  FilterCombobox,
  type FilterComboboxOption,
} from '@/features/sample-handling/receiving/FilterCombobox'

function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const id = window.setTimeout(() => setDebounced(value), delayMs)
    return () => window.clearTimeout(id)
  }, [value, delayMs])
  return debounced
}

/** Server-side lookup combobox: fetches a small page of options per keystroke. */
export function RemoteLookupCombobox({
  inputId,
  listId,
  placeholder,
  label,
  selectedId,
  search,
  onChange,
  disabled,
  searchKey,
}: {
  inputId: string
  listId: string
  placeholder: string
  label: string
  selectedId: string
  search: (term: string) => Promise<FilterComboboxOption[]>
  onChange: (next: { id: string; label: string }) => void
  disabled?: boolean
  /** Changing this value forces the option list to reload (e.g. parent client id). */
  searchKey?: string
}) {
  const [open, setOpen] = useState(false)
  const [options, setOptions] = useState<FilterComboboxOption[]>([])
  const debouncedLabel = useDebouncedValue(label, 250)
  const requestRef = useRef(0)
  const searchRef = useRef(search)
  searchRef.current = search

  useEffect(() => {
    if (!open || disabled) return
    const term = selectedId && debouncedLabel === label ? '' : debouncedLabel
    const requestId = ++requestRef.current
    void searchRef
      .current(term)
      .then((list) => {
        if (requestId === requestRef.current) setOptions(list)
      })
      .catch(() => {
        if (requestId === requestRef.current) setOptions([])
      })
  }, [open, disabled, debouncedLabel, label, selectedId, searchKey])

  return (
    <FilterCombobox
      inputId={inputId}
      listId={listId}
      value={label}
      onValueChange={(text) => {
        onChange({ id: text === label ? selectedId : '', label: text })
      }}
      options={options}
      onSelectOption={(opt) => onChange({ id: opt.id, label: opt.label })}
      open={open}
      onOpenChange={setOpen}
      placeholder={placeholder}
      inputClassName="h-8"
      disabled={disabled}
    />
  )
}
