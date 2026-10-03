import { useEffect, useMemo, useState } from 'react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import type { QiAssistantIsCodeOption } from './QiAssistant'

export function IsCodeSearchPicker({
  options,
  valueId,
  onChange,
  inputId = 'qi-assistant-is-code',
}: {
  options: QiAssistantIsCodeOption[]
  valueId: string
  onChange: (id: string) => void
  inputId?: string
}) {
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const [highlight, setHighlight] = useState(0)

  const selected = options.find((o) => o.id === valueId)

  useEffect(() => {
    if (!valueId) {
      setText('')
      return
    }
    if (selected) {
      setText(selected.displayCode ?? selected.label)
    }
  }, [valueId, selected])

  const filtered = useMemo(() => {
    const q = text.trim().toLowerCase()
    const list = q
      ? options.filter(
          (o) =>
            o.label.toLowerCase().includes(q) ||
            (o.displayCode?.toLowerCase().includes(q) ?? false),
        )
      : options
    return list.slice(0, 12)
  }, [options, text])

  useEffect(() => {
    setHighlight(0)
  }, [text, open])

  const pick = (opt: QiAssistantIsCodeOption) => {
    onChange(opt.id)
    setText(opt.displayCode ?? opt.label)
    setOpen(false)
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!open && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
      setOpen(true)
      return
    }
    if (!open || filtered.length === 0) return

    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setHighlight((i) => (i + 1) % filtered.length)
      return
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlight((i) => (i - 1 + filtered.length) % filtered.length)
      return
    }
    if (e.key === 'Enter') {
      e.preventDefault()
      const opt = filtered[highlight]
      if (opt) pick(opt)
      return
    }
    if (e.key === 'Escape') {
      e.preventDefault()
      setOpen(false)
    }
  }

  return (
    <div className="space-y-1.5">
      <Label htmlFor={inputId} className="text-xs text-muted-foreground">
        IS Code (reads uploaded PDFs)
      </Label>
      <div className="relative">
        <Input
          id={inputId}
          value={text}
          onChange={(e) => {
            const next = e.target.value
            setText(next)
            setOpen(true)
            if (selected && next !== (selected.displayCode ?? selected.label)) {
              onChange('')
            }
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onKeyDown={handleKeyDown}
          placeholder="Type IS number… e.g. 1786 or IS 1786: 2008"
          autoComplete="off"
          aria-label="Search IS code by number"
          aria-expanded={open}
          aria-autocomplete="list"
          role="combobox"
        />
        {open && filtered.length > 0 && (
          <div
            className="absolute z-20 mt-1 w-full rounded-md border border-border bg-popover shadow-lg"
            role="listbox"
          >
            <ul className="max-h-56 overflow-auto text-sm">
              {filtered.map((opt, index) => (
                <li key={opt.id}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={index === highlight}
                    className={cn(
                      'w-full px-3 py-2 text-left',
                      index === highlight ? 'bg-muted font-semibold' : 'hover:bg-muted',
                    )}
                    onMouseDown={(e) => e.preventDefault()}
                    onPointerDown={(e) => {
                      e.preventDefault()
                      e.stopPropagation()
                      pick(opt)
                    }}
                    onMouseEnter={() => setHighlight(index)}
                    onClick={() => pick(opt)}
                  >
                    <span className="font-medium">{opt.displayCode ?? opt.label}</span>
                    {opt.displayCode && opt.label !== opt.displayCode && (
                      <span className="mt-0.5 block text-xs text-muted-foreground truncate">
                        {opt.label}
                      </span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
        {open && text.trim() && filtered.length === 0 && (
          <div className="absolute z-20 mt-1 w-full rounded-md border border-border bg-popover px-3 py-2 text-xs text-muted-foreground shadow-lg">
            No IS code matches &quot;{text.trim()}&quot;
          </div>
        )}
      </div>
    </div>
  )
}
