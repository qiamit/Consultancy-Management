import { useMemo, useState, type ReactNode } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { limsDarkBarGlowStyle, limsDialogClass, limsFieldClass } from '@/lib/limsThemeUi'
import { cn } from '@/lib/utils'
import {
  OTHER_SYMBOLS,
  SCIENTIFIC_SYMBOLS,
  loadSymbolRecents,
  pushSymbolRecent,
} from './scientificSymbols'

export function AddSymbolDialog({
  open,
  onOpenChange,
  onInsert,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onInsert: (symbol: string) => void
}) {
  const [search, setSearch] = useState('')
  const [recents, setRecents] = useState<string[]>(() => loadSymbolRecents())

  const filteredScientific = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return [...SCIENTIFIC_SYMBOLS]
    return SCIENTIFIC_SYMBOLS.filter((sym) => sym.toLowerCase().includes(q))
  }, [search])

  const filteredOther = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return [...OTHER_SYMBOLS]
    return OTHER_SYMBOLS.filter((sym) => sym.toLowerCase().includes(q))
  }, [search])

  const handlePick = (symbol: string) => {
    onInsert(symbol)
    setRecents((prev) => pushSymbolRecent(symbol, prev))
    setSearch('')
    onOpenChange(false)
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next)
        if (!next) setSearch('')
      }}
    >
      <DialogContent
        persistOnFocusLoss
        layer="stacked"
        aria-describedby={undefined}
        className={cn(
          limsDialogClass,
          'flex max-h-[min(72vh,560px)] w-[calc(100%-1.5rem)] max-w-xl flex-col p-0 sm:w-full',
        )}
      >
        <div className="relative shrink-0 overflow-hidden bg-gradient-to-br from-stone-800 via-stone-900 to-stone-950 px-4 py-2.5 text-white">
          <div
            className="pointer-events-none absolute inset-0 opacity-[0.18]"
            style={limsDarkBarGlowStyle}
          />
          <div className="absolute bottom-0 left-0 h-[2px] w-full bg-gradient-to-r from-amber-500 via-amber-300 to-transparent" />
          <DialogHeader className="relative pr-10 text-left">
            <DialogTitle className="text-base font-semibold tracking-tight text-white">
              Add Symbol
            </DialogTitle>
          </DialogHeader>
        </div>
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-gradient-to-b from-stone-100/90 to-stone-50">
          <div className="shrink-0 space-y-2 border-b border-stone-200 px-4 py-3">
            <Label
              htmlFor="add-symbol-search"
              className="text-[11px] font-semibold uppercase tracking-wide text-stone-600"
            >
              Search
            </Label>
            <Input
              id="add-symbol-search"
              placeholder="Search symbols…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              autoFocus
              className={limsFieldClass}
            />
            <p className="text-[11px] text-stone-500">
              Inserts into the focused Test Parameter, Unit, or Requirements field.
            </p>
          </div>
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-3">
            {recents.length > 0 ? (
              <SymbolGroup title="Recent">
                {recents.map((sym, index) => (
                  <SymbolChip key={`recent-${index}`} symbol={sym} onPick={handlePick} />
                ))}
              </SymbolGroup>
            ) : null}
            <SymbolGroup title="Scientific">
              {filteredScientific.map((sym, index) => (
                <SymbolChip key={`scientific-${index}`} symbol={sym} onPick={handlePick} />
              ))}
            </SymbolGroup>
            <SymbolGroup title="Other">
              {filteredOther.map((sym, index) => (
                <SymbolChip key={`other-${index}`} symbol={sym} onPick={handlePick} />
              ))}
            </SymbolGroup>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function SymbolGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="space-y-2">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-stone-600">{title}</p>
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </div>
  )
}

function SymbolChip({ symbol, onPick }: { symbol: string; onPick: (symbol: string) => void }) {
  return (
    <button
      type="button"
      className="min-w-9 rounded-none border border-stone-500 bg-white px-2.5 py-1.5 text-base font-medium text-stone-900 shadow-sm hover:border-amber-600 hover:bg-amber-50"
      onClick={() => onPick(symbol)}
      title={`Insert ${symbol}`}
    >
      {symbol}
    </button>
  )
}
