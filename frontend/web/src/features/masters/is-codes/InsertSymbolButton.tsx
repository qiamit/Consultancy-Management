import { useEffect, useRef, useState } from 'react'
import { Omega } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { limsOutlineBtnClass } from '@/lib/limsThemeUi'
import { cn } from '@/lib/utils'
import { SYMBOL_GROUPS } from './scientificSymbols'

/**
 * "Insert Symbol": a panel of scientific symbols. A click inserts the symbol at the cursor of the field the user was
 * typing in (`onInsert` gets it); the panel stays open for more symbols and closes on Escape or a click outside. The
 * buttons do not take the focus, so the field keeps its cursor.
 */
export function InsertSymbolButton({ disabled, onInsert }: { disabled?: boolean; onInsert: (symbol: string) => void }) {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        setOpen(false)
      }
    }
    // Escape is caught on window (capture runs first), so it closes the panel and not the dialog behind it.
    document.addEventListener('mousedown', onDown)
    window.addEventListener('keydown', onKey, true)
    return () => {
      document.removeEventListener('mousedown', onDown)
      window.removeEventListener('keydown', onKey, true)
    }
  }, [open])

  return (
    <div ref={wrapRef} className="relative">
      <Button
        type="button"
        variant="outline"
        className={cn(limsOutlineBtnClass, 'w-10 px-0')}
        disabled={disabled}
        aria-expanded={open}
        aria-label="Insert Symbol"
        title="Insert Symbol: Puts a Scientific Symbol Where the Cursor Is"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => setOpen((v) => !v)}
      >
        <Omega size={16} aria-hidden />
      </Button>
      {open && !disabled ? (
        <div
          role="dialog"
          aria-label="Scientific Symbols"
          className="absolute right-0 top-full z-50 mt-1.5 w-[min(24rem,calc(100vw-2rem))] space-y-2 border border-stone-400 bg-card p-2.5 text-card-foreground shadow-xl"
        >
          <p className="text-[11px] text-stone-600">Click a Symbol to Put It Where the Cursor Is.</p>
          {SYMBOL_GROUPS.map((g) => (
            <div key={g.label}>
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-stone-500">{g.label}</p>
              <div className="flex flex-wrap gap-1">
                {g.symbols.map((s) => (
                  <button
                    key={`${g.label}-${s}`}
                    type="button"
                    className="h-8 min-w-8 border border-stone-300 bg-stone-50 px-1.5 text-sm text-stone-900 hover:border-amber-500 hover:bg-amber-50"
                    aria-label={`Insert ${s}`}
                    title={s}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => onInsert(s)}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  )
}
