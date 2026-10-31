import { useRef } from 'react'
import { Calendar } from 'lucide-react'
import { DateInput } from '@/components/ui/date-input'
import { LimsFieldWithAdd } from '@/components/lims/LimsFieldWithAdd'
import { limsFieldAddBtnClass } from '@/lib/limsThemeUi'

/** Date field in the app's field strip: typed dd/mm/yyyy on the left, a calendar button on the right. */
export function CalendarDateField({
  id,
  label,
  value,
  disabled,
  className,
  onChange,
}: {
  id?: string
  label: string
  value: string
  disabled?: boolean
  className?: string
  onChange: (value: string) => void
}) {
  const input = useRef<HTMLInputElement>(null)
  return (
    <LimsFieldWithAdd
      className={className}
      addButton={
        <button
          type="button"
          className={limsFieldAddBtnClass}
          aria-label={`Open ${label} Calendar`}
          title="Calendar"
          disabled={disabled}
          onClick={() => {
            try {
              input.current?.showPicker()
            } catch {
              input.current?.focus()
            }
          }}
        >
          <Calendar size={15} aria-hidden />
        </button>
      }
    >
      <DateInput
        id={id}
        ref={input}
        aria-label={label}
        disabled={disabled}
        className="min-w-0 px-3 text-sm tabular-nums [&::-webkit-calendar-picker-indicator]:pointer-events-none [&::-webkit-calendar-picker-indicator]:opacity-0"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </LimsFieldWithAdd>
  )
}
