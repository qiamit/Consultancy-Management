import { useMemo, useRef, useState } from 'react'
import { Calculator } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { FORMULA_FUNCTIONS, evaluateFormula, formulaRefs, type FormulaScalar, type FormulaValue } from '@/lib/recordFormula'
import { cn } from '@/lib/utils'
import type { AdminColumn, AdminSection } from './portalRecordsAdminApi'

type Suggestion = { key: string; label: string; insert: string; detail: string; kind: 'col' | 'fn' | 'blocked' }

const OPERATORS: Array<[string, string]> = [
  ['+', ' + '], ['−', ' - '], ['×', ' * '], ['÷', ' / '], ['^', '^'], ['(', '('], [')', ')'], [',', ', '],
  ['>', ' > '], ['<', ' < '], ['=', ' = '], ['≥', ' >= '], ['≤', ' <= '], ['≠', ' <> '], ['&', ' & '],
]

const toggleBtn = 'inline-flex h-7 items-center border px-2 text-xs font-semibold'

/**
 * Formula box with Excel-like typing help: as you type, matching functions and columns of every section of this
 * licence drop down to pick. Columns of another section are used through a link column of this section
 * (<link>.<column>); sections without such a link are listed but cannot be picked. Below, Output tries the formula
 * with test values.
 */
export function FormulaBuilder({
  formula,
  onFormula,
  decimals,
  onDecimals,
  problem,
  section,
  sections,
  ownColumns,
}: {
  formula: string
  onFormula: (value: string) => void
  decimals: string
  onDecimals: (value: string) => void
  problem: string
  section: AdminSection
  sections: AdminSection[]
  ownColumns: AdminColumn[]
}) {
  const box = useRef<HTMLTextAreaElement>(null)
  const [caret, setCaret] = useState(formula.length)
  const [focused, setFocused] = useState(false)
  const [active, setActive] = useState(0)
  const [panel, setPanel] = useState<'functions' | 'operators' | null>(null)
  const [tests, setTests] = useState<Record<string, string>>({})

  const all = useMemo<Suggestion[]>(() => {
    const out: Suggestion[] = []
    for (const c of ownColumns) {
      if (c.col_type === 'link') continue
      out.push({ key: `own:${c.id}`, label: c.label, insert: c.key, detail: `${section.name} · ${c.key}`, kind: 'col' })
    }
    const links = ownColumns.filter((c) => c.col_type === 'link' && c.config.section_id)
    for (const s of sections) {
      if (s.id === section.id) continue
      const via = links.filter((l) => l.config.section_id === s.id)
      for (const c of s.columns) {
        if (c.col_type === 'link') continue
        if (via.length === 0) {
          out.push({ key: `blk:${s.id}:${c.id}`, label: c.label, insert: '', detail: `${s.name} · Add a "Link to Another Section" column for ${s.name} first`, kind: 'blocked' })
        }
        for (const l of via) {
          out.push({ key: `lnk:${l.id}:${c.id}`, label: c.label, insert: `${l.key}.${c.key}`, detail: `${s.name} via ${l.label} · ${l.key}.${c.key}`, kind: 'col' })
        }
      }
    }
    for (const f of FORMULA_FUNCTIONS) out.push({ key: `fn:${f.name}`, label: f.name, insert: `${f.name}(`, detail: f.help, kind: 'fn' })
    return out
  }, [ownColumns, sections, section.id, section.name])

  // The word being typed just before the cursor.
  const before = formula.slice(0, caret)
  const token = /[A-Za-z_][A-Za-z0-9_.]*$/.exec(before)?.[0] ?? ''
  const afterOperator = token === '' && (before.trim() === '' || /[=(+\-*/^,<>&\s]$/.test(before))
  const open = focused && (token !== '' || afterOperator)
  const matches = useMemo(() => {
    if (!open) return []
    const t = token.toLowerCase()
    const hit = (s: Suggestion) => !t || s.insert.toLowerCase().startsWith(t) || s.label.toLowerCase().includes(t)
    return all.filter(hit).slice(0, 14)
  }, [all, open, token])
  const activeIndex = Math.min(active, Math.max(0, matches.length - 1))

  const put = (text: string, replace = 0) => {
    const el = box.current
    const start = (el?.selectionStart ?? caret) - replace
    const end = el?.selectionEnd ?? caret
    const next = formula.slice(0, start) + text + formula.slice(end)
    onFormula(next)
    const at = start + text.length
    setCaret(at)
    setActive(0)
    requestAnimationFrame(() => {
      el?.focus()
      el?.setSelectionRange(at, at)
    })
  }
  const pick = (s: Suggestion | undefined) => {
    if (!s || s.kind === 'blocked') return
    put(s.insert, token.length)
  }

  // Output: try the formula with test values for each column it uses (several values for a linked column).
  let refs: string[] = []
  try {
    refs = problem ? [] : formulaRefs(formula)
  } catch {
    refs = []
  }
  const labelOf = (ref: string) => all.find((s) => s.kind === 'col' && s.insert === ref)?.label ?? ref
  let output: string
  let outputOk = true
  try {
    const scope: Record<string, FormulaValue> = {}
    for (const r of refs) {
      const raw = (tests[r] ?? '').trim()
      const parts = raw === '' ? [] : raw.split(',').map((p) => p.trim())
      const vals: FormulaScalar[] = parts.map((p) => (p !== '' && Number.isFinite(Number(p)) ? Number(p) : p))
      scope[r] = r.includes('.') ? vals : (vals[0] ?? null)
    }
    const v = problem ? null : evaluateFormula(formula, scope)
    const d = decimals.trim() === '' ? null : Number(decimals)
    output = v == null ? '—' : typeof v === 'number' ? String(d != null ? Math.round(v * 10 ** d) / 10 ** d : v) : typeof v === 'boolean' ? (v ? 'True' : 'False') : String(v)
  } catch (err) {
    output = err instanceof Error ? err.message : 'Error'
    outputOk = false
  }

  return (
    <div className="space-y-2 border border-amber-300 bg-amber-50/40 p-3 sm:col-span-2">
      <div className="flex flex-wrap items-center gap-2">
        <Calculator size={15} className="text-amber-800" aria-hidden />
        <label htmlFor="col-formula" className="text-sm font-semibold text-stone-900">Formula Builder</label>
        <span className={cn('text-[11px] font-medium', problem ? 'text-red-700' : 'text-emerald-700')}>{problem || 'Formula OK'}</span>
        <div className="ml-auto flex flex-wrap items-center gap-1.5">
          <button type="button" className={cn(toggleBtn, panel === 'functions' ? 'border-amber-700 bg-amber-700 text-white' : 'border-amber-600/60 bg-white text-amber-900 hover:bg-amber-50')} onClick={() => setPanel((p) => (p === 'functions' ? null : 'functions'))}>
            Functions
          </button>
          <button type="button" className={cn(toggleBtn, panel === 'operators' ? 'border-amber-700 bg-amber-700 text-white' : 'border-amber-600/60 bg-white text-amber-900 hover:bg-amber-50')} onClick={() => setPanel((p) => (p === 'operators' ? null : 'operators'))}>
            + − × ÷ Operators
          </button>
          <label htmlFor="col-decimals" className="text-xs font-semibold text-stone-700">Decimals</label>
          <Input id="col-decimals" inputMode="numeric" className="h-7 min-h-7 w-12 px-2 text-center text-xs" value={decimals} onChange={(e) => onDecimals(e.target.value.replace(/\D/g, ''))} />
        </div>
      </div>

      {panel === 'functions' ? (
        <div className="flex flex-wrap gap-1 border border-amber-200 bg-white p-2">
          {FORMULA_FUNCTIONS.map((f) => (
            <button key={f.name} type="button" className="inline-flex h-7 items-center border border-amber-600/60 bg-white px-1.5 font-mono text-xs font-semibold text-amber-900 hover:bg-amber-50" title={f.help} onClick={() => put(`${f.name}(`)}>
              {f.name}
            </button>
          ))}
        </div>
      ) : null}
      {panel === 'operators' ? (
        <div className="flex flex-wrap gap-1 border border-amber-200 bg-white p-2">
          {OPERATORS.map(([label, text]) => (
            <button key={label} type="button" className="inline-flex h-7 min-w-7 items-center justify-center border border-stone-400 bg-white px-1.5 font-mono text-sm text-stone-900 hover:bg-amber-50" onClick={() => put(text)}>
              {label}
            </button>
          ))}
        </div>
      ) : null}

      <div className="relative">
        <textarea
          id="col-formula"
          ref={box}
          rows={2}
          autoFocus
          spellCheck={false}
          className="w-full border border-stone-400 bg-white p-2 font-mono text-sm"
          value={formula}
          placeholder="Type = then a column or function, e.g. =ROUND(load * 1000 / area, 1)"
          onChange={(e) => {
            onFormula(e.target.value)
            setCaret(e.target.selectionStart)
            setActive(0)
          }}
          onSelect={(e) => setCaret(e.currentTarget.selectionStart)}
          onFocus={() => setFocused(true)}
          onBlur={() => setTimeout(() => setFocused(false), 150)}
          onKeyDown={(e) => {
            if (!matches.length) return
            if (e.key === 'ArrowDown') {
              e.preventDefault()
              setActive((i) => (i + 1) % matches.length)
            } else if (e.key === 'ArrowUp') {
              e.preventDefault()
              setActive((i) => (i - 1 + matches.length) % matches.length)
            } else if ((e.key === 'Enter' || e.key === 'Tab') && token) {
              e.preventDefault()
              pick(matches[activeIndex])
            } else if (e.key === 'Escape') {
              e.stopPropagation()
              setFocused(false)
            }
          }}
        />
        {matches.length ? (
          <ul role="listbox" className="absolute left-0 right-0 top-full z-20 max-h-64 overflow-y-auto border border-stone-400 bg-white shadow-lg">
            {matches.map((s, i) => (
              <li key={s.key} role="option" aria-selected={i === activeIndex} aria-disabled={s.kind === 'blocked'}>
                <button
                  type="button"
                  disabled={s.kind === 'blocked'}
                  className={cn('flex w-full items-baseline gap-2 px-2 py-1.5 text-left text-sm', i === activeIndex && s.kind !== 'blocked' ? 'bg-amber-100' : 'hover:bg-amber-50', s.kind === 'blocked' && 'cursor-not-allowed text-stone-400')}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => pick(s)}
                >
                  <span className={cn('shrink-0 border px-1 text-[10px] font-bold', s.kind === 'fn' ? 'border-amber-500 text-amber-800' : 'border-sky-400 text-sky-800', s.kind === 'blocked' && 'border-stone-300 text-stone-400')}>
                    {s.kind === 'fn' ? 'fx' : 'col'}
                  </span>
                  <span className={cn('font-medium', s.kind === 'fn' && 'font-mono')}>{s.label}</span>
                  <span className="min-w-0 truncate text-[11px] text-stone-500">{s.detail}</span>
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      <div className="space-y-1.5 border-t border-amber-200 pt-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-stone-700">Output</span>
          <span className={cn('min-w-[5rem] border px-2 py-0.5 font-mono text-sm', outputOk && !problem ? 'border-emerald-300 bg-emerald-50 text-emerald-900' : 'border-red-300 bg-red-50 text-red-800')}>{output}</span>
          <span className="text-[11px] text-stone-500">Try the formula with test values. Works only inside this licence.</span>
        </div>
        {refs.length ? (
          <div className="flex flex-wrap gap-2">
            {refs.map((r) => (
              <label key={r} className="flex items-center gap-1 text-xs text-stone-700">
                <span className="max-w-[10rem] truncate" title={r}>{labelOf(r)}</span>
                <Input
                  className="h-7 min-h-7 w-24 px-2 text-xs"
                  value={tests[r] ?? ''}
                  placeholder={r.includes('.') ? '10, 20, 30' : 'Value'}
                  onChange={(e) => setTests((prev) => ({ ...prev, [r]: e.target.value }))}
                />
              </label>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  )
}
