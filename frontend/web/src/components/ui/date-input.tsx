import * as React from 'react'
import { toast } from 'sonner'
import { MAX_ISO_DATE, MIN_ISO_DATE, isValidIsoDate, normalizeDateFieldValue } from '@/lib/localDate'

type DateInputProps = Omit<React.ComponentProps<'input'>, 'type'>

/**
 * Native `<input type="date">` that only hands the parent real dates.
 *
 * While a year is being typed the browser reports partial years (0002, 0020, 0202 …). Passing those
 * up made the parent store them, and stopping at "27" saved year 0027. Here the half-typed value
 * stays local until it is a full date between 1900 and 2100; on blur a two-digit year (00YY) becomes
 * 20YY and any other out-of-range year is undone with a message. The value is always YYYY-MM-DD —
 * no Date objects, so no time-zone shift.
 */
export const DateInput = React.forwardRef<HTMLInputElement, DateInputProps>(
  ({ value, defaultValue, onChange, onBlur, min, max, ...props }, forwardedRef) => {
    const innerRef = React.useRef<HTMLInputElement | null>(null)
    const setRefs = React.useCallback(
      (node: HTMLInputElement | null) => {
        innerRef.current = node
        if (typeof forwardedRef === 'function') forwardedRef(node)
        else if (forwardedRef) forwardedRef.current = node
      },
      [forwardedRef],
    )

    const controlled = value !== undefined
    const external = controlled ? String(value ?? '') : undefined
    const [draft, setDraft] = React.useState<string>(external ?? String(defaultValue ?? ''))

    // Follow the parent's value whenever it changes from outside (reset, load, auto-fill).
    React.useEffect(() => {
      if (external !== undefined) setDraft(external)
    }, [external])

    const emit = (node: HTMLInputElement, next: string) => {
      if (!onChange) return
      node.value = next
      onChange({ target: node, currentTarget: node } as React.ChangeEvent<HTMLInputElement>)
    }

    return (
      <input
        {...props}
        ref={setRefs}
        type="date"
        min={min ?? MIN_ISO_DATE}
        max={max ?? MAX_ISO_DATE}
        value={draft}
        onChange={(event) => {
          const next = event.target.value
          setDraft(next)
          // Only complete, sensible dates (or a cleared field) reach the parent.
          if (next === '' || isValidIsoDate(next)) onChange?.(event)
        }}
        onBlur={(event) => {
          const node = event.currentTarget
          const current = node.value
          if (current !== '' && !isValidIsoDate(current)) {
            const fixed = normalizeDateFieldValue(current)
            if (fixed) {
              setDraft(fixed)
              emit(node, fixed)
            } else {
              const previous = external ?? ''
              setDraft(previous)
              node.value = previous
              toast.error('Enter a year between 1900 and 2100.')
            }
          }
          onBlur?.(event)
        }}
      />
    )
  },
)
DateInput.displayName = 'DateInput'
