import { useState } from 'react'
import { Input } from '@/components/ui/input'
import { getCurrencyCode, getCurrencySymbol } from '@/lib/appCurrency'
import { formatMoneyInput, sanitizeMoneyInput } from '@/features/masters/products-services/types'

export function RenewalCurrencyInput({
  id,
  label,
  value,
  onChange,
  readOnly = false,
}: {
  id?: string
  label: string
  value: string
  onChange: (value: string) => void
  readOnly?: boolean
}) {
  const [focused, setFocused] = useState(false)
  const displayValue = !readOnly && focused ? value : formatMoneyInput(value || '0')

  return (
    <div className="flex h-8 min-w-0 w-full overflow-hidden rounded-none border border-stone-500 bg-stone-50 focus-within:border-amber-600 focus-within:ring-2 focus-within:ring-amber-500/20">
      <span className="inline-flex shrink-0 items-center border-r border-stone-500 bg-stone-100 px-2 text-xs font-semibold text-stone-700" aria-hidden>
        {getCurrencySymbol()}
      </span>
      <Input
        id={id}
        type="text"
        inputMode="decimal"
        value={displayValue}
        readOnly={readOnly}
        onFocus={() => { if (!readOnly) setFocused(true) }}
        onChange={(event) => onChange(sanitizeMoneyInput(event.target.value))}
        onBlur={(event) => {
          setFocused(false)
          if (!readOnly) onChange(formatMoneyInput(event.target.value || '0'))
        }}
        placeholder="0.00"
        className="h-full min-w-0 flex-1 rounded-none !border-0 !bg-transparent px-2 text-right tabular-nums shadow-none focus-visible:!ring-0 read-only:cursor-not-allowed read-only:text-stone-700"
        aria-label={`${label} in ${getCurrencyCode()}`}
      />
    </div>
  )
}
