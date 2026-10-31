import { useState } from 'react'
import { Search } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { FORMULA_FUNCTIONS, FORMULA_OPERATORS } from '@/lib/recordFormula'
import { limsDialogClass } from '@/lib/limsThemeUi'
import { cn } from '@/lib/utils'

const th = 'sticky top-0 z-[1] border border-stone-700 bg-stone-800 px-2 py-1.5 text-center text-[11px] font-bold uppercase tracking-[0.08em] text-amber-200'
const td = 'border border-[#e7e0d4] px-2 py-1.5 text-[13px] text-stone-800'
const CATEGORIES = ['All', 'Math', 'Statistical', 'Logical', 'Text', 'Date'] as const

function Shell({ title, open, onClose, children }: { title: string; open: boolean; onClose: () => void; children: React.ReactNode }) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        layer="nested"
        aria-describedby={undefined}
        className={cn(limsDialogClass, '[&>button]:top-[10px] sm:[&>button]:top-[14px]', 'flex max-h-[85dvh] w-[min(58rem,calc(100vw-1rem))] max-w-none flex-col gap-0 overflow-hidden bg-white p-0')}
      >
        <div className="flex h-14 shrink-0 items-center bg-gradient-to-br from-stone-800 via-stone-900 to-stone-950 px-4">
          <DialogHeader className="pr-10 text-left">
            <DialogTitle className="text-base font-semibold text-white">{title}</DialogTitle>
          </DialogHeader>
        </div>
        {children}
      </DialogContent>
    </Dialog>
  )
}

/** Every formula function with its type, how to write it and what it does; a click puts it in the formula. */
export function FunctionsDialog({ open, onClose, onPick }: { open: boolean; onClose: () => void; onPick: (text: string) => void }) {
  const [q, setQ] = useState('')
  const [cat, setCat] = useState<(typeof CATEGORIES)[number]>('All')
  const query = q.trim().toLowerCase()
  const rows = FORMULA_FUNCTIONS.filter(
    (f) => (cat === 'All' || f.category === cat) && (!query || f.name.toLowerCase().includes(query) || f.help.toLowerCase().includes(query)),
  )
  return (
    <Shell title="Functions" open={open} onClose={onClose}>
      <div className="flex flex-wrap items-center gap-2 border-b border-stone-200 bg-stone-50 px-3 py-2">
        <div className="relative w-full sm:w-64">
          <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-stone-400" aria-hidden />
          <Input value={q} autoFocus placeholder="Search Function" aria-label="Search Function" className="h-9 pl-8" onChange={(e) => setQ(e.target.value)} />
        </div>
        <div className="flex flex-wrap gap-1">
          {CATEGORIES.map((c) => (
            <button
              key={c}
              type="button"
              className={cn('h-8 border px-2.5 text-xs font-semibold', c === cat ? 'border-amber-700 bg-amber-700 text-white' : 'border-stone-300 bg-white text-stone-700 hover:border-amber-600')}
              onClick={() => setCat(c)}
            >
              {c}
            </button>
          ))}
        </div>
        <span className="ml-auto text-xs text-stone-500">{rows.length} Functions</span>
      </div>
      <div className="min-h-0 flex-1 overflow-auto p-3">
        <table className="w-full min-w-[42rem] border-collapse font-jakarta">
          <thead>
            <tr>
              <th className={cn(th, 'w-[9rem]')}>Function</th>
              <th className={cn(th, 'w-[7rem]')}>Type</th>
              <th className={cn(th, 'w-[16rem]')}>How to Write</th>
              <th className={th}>What It Does</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((f, i) => (
              <tr
                key={f.name}
                className={cn('cursor-pointer hover:bg-amber-100/70', i % 2 ? 'bg-[#f7f3eb]' : 'bg-[#fffcf7]')}
                title="Click to use"
                onClick={() => {
                  onPick(`${f.name}(`)
                  onClose()
                }}
              >
                <td className={cn(td, 'text-center font-mono font-bold text-amber-900')}>{f.name}</td>
                <td className={cn(td, 'text-center text-xs')}>{f.category}</td>
                <td className={cn(td, 'text-center font-mono text-xs')}>{f.syntax}</td>
                <td className={td}>{f.help}{f.list ? <span className="ml-1 text-[11px] text-sky-700">(Takes linked lists)</span> : null}</td>
              </tr>
            ))}
            {rows.length === 0 ? (
              <tr><td colSpan={4} className={cn(td, 'py-6 text-center text-stone-500')}>No function matches.</td></tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </Shell>
  )
}

/** Every operator with its type, an example and its meaning; a click puts it in the formula. */
export function OperatorsDialog({ open, onClose, onPick }: { open: boolean; onClose: () => void; onPick: (text: string) => void }) {
  return (
    <Shell title="Operators" open={open} onClose={onClose}>
      <div className="min-h-0 flex-1 overflow-auto p-3">
        <table className="w-full min-w-[36rem] border-collapse font-jakarta">
          <thead>
            <tr>
              <th className={cn(th, 'w-[6rem]')}>Operator</th>
              <th className={cn(th, 'w-[8rem]')}>Type</th>
              <th className={cn(th, 'w-[10rem]')}>Example</th>
              <th className={th}>What It Does</th>
            </tr>
          </thead>
          <tbody>
            {FORMULA_OPERATORS.map((o, i) => (
              <tr
                key={o.symbol}
                className={cn('cursor-pointer hover:bg-amber-100/70', i % 2 ? 'bg-[#f7f3eb]' : 'bg-[#fffcf7]')}
                title="Click to use"
                onClick={() => {
                  onPick(o.insert)
                  onClose()
                }}
              >
                <td className={cn(td, 'text-center font-mono text-base font-bold text-amber-900')}>{o.symbol}</td>
                <td className={cn(td, 'text-center text-xs')}>{o.category}</td>
                <td className={cn(td, 'text-center font-mono text-xs')}>{o.example}</td>
                <td className={td}>{o.help}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Shell>
  )
}
