import { useMemo, useState } from 'react'
import { Calendar, ChevronLeft, ChevronRight } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { limsFieldAddBtnClass, limsFieldClass } from '@/lib/limsThemeUi'
import { cn } from '@/lib/utils'
import { formatDisplayDate, todayIsoDate } from '@/features/bis/projects/types'

const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'] as const
const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const

function parseIso(value: string): { y: number; m: number; d: number } | null {
  const m = value.trim().slice(0, 10).match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!m) return null
  const y = Number(m[1])
  const mo = Number(m[2])
  const d = Number(m[3])
  if (!y || mo < 1 || mo > 12 || d < 1 || d > 31) return null
  return { y, m: mo - 1, d }
}

function toIso(y: number, m0: number, d: number): string {
  return `${y}-${String(m0 + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

function daysInMonth(y: number, m0: number): number {
  return new Date(y, m0 + 1, 0).getDate()
}

function startWeekday(y: number, m0: number): number {
  return new Date(y, m0, 1).getDay()
}

export function LimsDatePicker({
  value,
  onChange,
  disabled = false,
  placeholder = 'Select date',
  className,
  'aria-label': ariaLabel,
}: {
  value: string
  onChange: (next: string) => void
  disabled?: boolean
  placeholder?: string
  className?: string
  'aria-label'?: string
}) {
  const parsed = parseIso(value)
  const today = todayIsoDate()
  const initial = parsed ?? parseIso(today) ?? { y: new Date().getFullYear(), m: new Date().getMonth(), d: 1 }
  const [open, setOpen] = useState(false)
  const [viewY, setViewY] = useState(initial.y)
  const [viewM, setViewM] = useState(initial.m)

  const cells = useMemo(() => {
    const total = daysInMonth(viewY, viewM)
    const start = startWeekday(viewY, viewM)
    const list: Array<{ key: string; day: number | null; iso: string }> = []
    for (let i = 0; i < start; i++) {
      list.push({ key: `e-${i}`, day: null, iso: '' })
    }
    for (let d = 1; d <= total; d++) {
      const iso = toIso(viewY, viewM, d)
      list.push({ key: iso, day: d, iso })
    }
    while (list.length % 7 !== 0) {
      list.push({ key: `t-${list.length}`, day: null, iso: '' })
    }
    return list
  }, [viewY, viewM])

  const display = value.trim() ? formatDisplayDate(value) : placeholder

  const shiftMonth = (delta: number) => {
    const next = new Date(viewY, viewM + delta, 1)
    setViewY(next.getFullYear())
    setViewM(next.getMonth())
  }

  const openWithValueMonth = (nextOpen: boolean) => {
    if (nextOpen) {
      const p = parseIso(value) ?? parseIso(today)
      if (p) {
        setViewY(p.y)
        setViewM(p.m)
      }
    }
    setOpen(nextOpen)
  }

  return (
    <DropdownMenu open={open} onOpenChange={openWithValueMonth}>
      <DropdownMenuTrigger asChild disabled={disabled}>
        <button
          type="button"
          aria-label={ariaLabel ?? 'Pick date'}
          disabled={disabled}
          className={cn(
            'inline-flex h-7 min-w-0 items-stretch overflow-hidden rounded-none border border-stone-400 bg-white text-left text-[12px] text-foreground shadow-none',
            'focus-visible:border-amber-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/20',
            'disabled:cursor-not-allowed disabled:opacity-50',
            className,
          )}
        >
          <span
            className={cn(
              'flex min-w-0 flex-1 items-center px-2 tabular-nums',
              value.trim() ? 'font-medium text-stone-900' : 'text-stone-400',
            )}
          >
            {display}
          </span>
          <span
            className={cn(
              limsFieldAddBtnClass,
              'h-full w-8 border-l border-stone-400 bg-stone-100 text-amber-800',
            )}
            aria-hidden
          >
            <Calendar size={14} strokeWidth={2.25} />
          </span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        sideOffset={6}
        className={cn(
          'z-[95] w-[17.5rem] rounded-none border-2 border-stone-500 bg-card p-0 text-card-foreground shadow-lg ring-1 ring-amber-700/20',
        )}
        onCloseAutoFocus={(e) => e.preventDefault()}
      >
        <div className="border-b border-stone-300 bg-stone-800 px-2.5 py-2">
          <div className="flex items-center justify-between gap-1">
            <button
              type="button"
              className="inline-flex h-7 w-7 items-center justify-center rounded-none text-amber-100 hover:bg-amber-500/20"
              aria-label="Previous month"
              onClick={(e) => {
                e.preventDefault()
                e.stopPropagation()
                shiftMonth(-1)
              }}
            >
              <ChevronLeft size={16} strokeWidth={2.25} />
            </button>
            <p className="min-w-0 flex-1 truncate text-center text-[12px] font-bold uppercase tracking-[0.08em] text-amber-100">
              {MONTHS[viewM]} {viewY}
            </p>
            <button
              type="button"
              className="inline-flex h-7 w-7 items-center justify-center rounded-none text-amber-100 hover:bg-amber-500/20"
              aria-label="Next month"
              onClick={(e) => {
                e.preventDefault()
                e.stopPropagation()
                shiftMonth(1)
              }}
            >
              <ChevronRight size={16} strokeWidth={2.25} />
            </button>
          </div>
        </div>

        <div className="space-y-2 p-2.5">
          <div className="grid grid-cols-7 gap-0.5">
            {WEEKDAYS.map((d) => (
              <div
                key={d}
                className="py-1 text-center text-[10px] font-bold uppercase tracking-wide text-stone-500"
              >
                {d}
              </div>
            ))}
            {cells.map((cell) => {
              if (cell.day == null) {
                return <div key={cell.key} className="h-8" />
              }
              const selected = value.trim() === cell.iso
              const isToday = cell.iso === today
              return (
                <button
                  key={cell.key}
                  type="button"
                  className={cn(
                    'inline-flex h-8 items-center justify-center rounded-none text-[12px] font-semibold tabular-nums transition-colors',
                    selected
                      ? 'bg-amber-700 text-white shadow-sm'
                      : isToday
                        ? 'border border-amber-600/70 bg-amber-50 text-amber-950 hover:bg-amber-100'
                        : 'text-stone-800 hover:bg-amber-500/15 hover:text-amber-950',
                  )}
                  onClick={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    onChange(cell.iso)
                    setOpen(false)
                  }}
                >
                  {cell.day}
                </button>
              )
            })}
          </div>

          <div className="flex items-center justify-between gap-2 border-t border-stone-200 pt-2">
            <button
              type="button"
              className="h-7 rounded-none px-2 text-[11px] font-semibold text-stone-600 hover:bg-stone-100 hover:text-stone-900"
              onClick={(e) => {
                e.preventDefault()
                e.stopPropagation()
                onChange('')
                setOpen(false)
              }}
            >
              Clear
            </button>
            <button
              type="button"
              className={cn(
                limsFieldClass,
                'h-7 border-amber-600/50 bg-amber-50 px-2.5 text-[11px] font-bold text-amber-900 hover:bg-amber-100',
              )}
              onClick={(e) => {
                e.preventDefault()
                e.stopPropagation()
                onChange(today)
                const p = parseIso(today)
                if (p) {
                  setViewY(p.y)
                  setViewM(p.m)
                }
                setOpen(false)
              }}
            >
              Today
            </button>
          </div>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
