import { useEffect, useMemo, useState } from 'react'
import {
  FilterCombobox,
  type FilterComboboxOption,
} from '@/features/sample-handling/receiving/FilterCombobox'

interface Option {
  id: string
  company_name: string
}

/**
 * Client / supplier combobox — type-to-filter with portaled dropdown
 * (works inside dialogs that use overflow-y-auto).
 */
export function ClientSearchSelect({
  value,
  onValueChange,
  options,
  placeholder = 'Select client...',
  onAddNewClientClick,
  inputId,
  className,
  inputClassName,
}: {
  value: string | null
  onValueChange: (val: string) => void
  options: Option[]
  placeholder?: string
  onAddNewClientClick?: () => void
  inputId?: string
  className?: string
  inputClassName?: string
}) {
  const selectedOption = useMemo(
    () => options.find((opt) => opt.id === value) ?? null,
    [options, value],
  )
  const selectedLabel = selectedOption?.company_name ?? ''

  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState(selectedLabel)

  useEffect(() => {
    if (!open) setQuery(selectedLabel)
  }, [open, selectedLabel])

  const filteredOptions = useMemo((): FilterComboboxOption[] => {
    const q = query.trim().toLowerCase()
    const list = q
      ? options.filter((opt) => opt.company_name.toLowerCase().includes(q))
      : options
    return list.map((opt) => ({ id: opt.id, label: opt.company_name }))
  }, [options, query])

  return (
    <FilterCombobox
      inputId={inputId}
      className={className}
      inputClassName={inputClassName}
      value={query}
      onValueChange={(next) => {
        setQuery(next)
        if (!open) setOpen(true)
      }}
      options={filteredOptions}
      onSelectOption={(opt) => {
        onValueChange(opt.id)
        setQuery(opt.label)
        setOpen(false)
      }}
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (!next) setQuery(selectedLabel)
      }}
      onInputFocus={() => {
        setOpen(true)
        setQuery('')
      }}
      placeholder={placeholder}
      dropdownPlacement="auto"
      extraActions={
        onAddNewClientClick
          ? [
              {
                key: 'add-client',
                label: 'Add New Client',
                onSelect: () => {
                  onAddNewClientClick()
                  setOpen(false)
                },
              },
            ]
          : []
      }
    />
  )
}
