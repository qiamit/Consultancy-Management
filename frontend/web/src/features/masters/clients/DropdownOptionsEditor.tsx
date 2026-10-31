import { useState } from 'react'
import { ArrowDown, ArrowUp, ArrowUpDown, ClipboardPaste, Plus, Trash2 } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

export type DropdownSettings = {
  options: string[]
  defaultOption: string
  failOptions: string[]
  multiple: boolean
  allowOther: boolean
}

const th = 'border border-stone-700 bg-stone-800 px-2 py-1.5 text-center text-[11px] font-bold uppercase tracking-[0.08em] text-amber-200'
const td = 'border border-[#e7e0d4] px-2 py-1 text-center align-middle text-sm text-stone-800'
const iconBtn = 'inline-flex h-7 w-7 items-center justify-center border border-stone-300 bg-white text-amber-800 hover:bg-amber-50 disabled:opacity-40'
const toolBtn = 'inline-flex h-8 items-center gap-1 border border-stone-400 bg-white px-2 text-xs font-medium text-stone-800 hover:bg-amber-50'

/**
 * Options of a Dropdown column as a table: add in the first row, rename in place, move, delete; one option can be
 * the default, and options ticked "Marks Fail" make the entry Fail when chosen. Settings: several choices at once,
 * and letting the customer type a value that is not in the list.
 */
export function DropdownOptionsEditor({ value, onChange }: { value: DropdownSettings; onChange: (next: DropdownSettings) => void }) {
  const [draft, setDraft] = useState('')
  const [pasting, setPasting] = useState(false)
  const [pasteText, setPasteText] = useState('')
  const { options } = value
  const has = (o: string) => options.some((x) => x.toLowerCase() === o.trim().toLowerCase())

  const addMany = (list: string[]) => {
    const seen = new Set(options.map((o) => o.toLowerCase()))
    const fresh: string[] = []
    for (const raw of list) {
      const o = raw.trim()
      if (o && !seen.has(o.toLowerCase())) {
        seen.add(o.toLowerCase())
        fresh.push(o)
      }
    }
    if (fresh.length) onChange({ ...value, options: [...options, ...fresh] })
  }
  const add = () => {
    if (!draft.trim() || has(draft)) return
    addMany([draft])
    setDraft('')
  }
  const rename = (i: number, next: string) => {
    const old = options[i]!
    const list = options.map((o, j) => (j === i ? next : o))
    onChange({
      ...value,
      options: list,
      defaultOption: value.defaultOption === old ? next : value.defaultOption,
      failOptions: value.failOptions.map((f) => (f === old ? next : f)),
    })
  }
  const remove = (i: number) => {
    const old = options[i]!
    onChange({
      ...value,
      options: options.filter((_, j) => j !== i),
      defaultOption: value.defaultOption === old ? '' : value.defaultOption,
      failOptions: value.failOptions.filter((f) => f !== old),
    })
  }
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir
    if (j < 0 || j >= options.length) return
    const list = [...options]
    ;[list[i], list[j]] = [list[j]!, list[i]!]
    onChange({ ...value, options: list })
  }

  return (
    <div className="space-y-2 border border-amber-300 bg-amber-50/40 p-3 sm:col-span-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-semibold text-stone-900">Dropdown Options</span>
        <span className="text-[11px] text-stone-500">{options.length} Options</span>
        <div className="ml-auto flex flex-wrap items-center gap-1.5">
          <label className="flex items-center gap-1 text-xs font-medium text-stone-700" title="Customer can pick more than one">
            <input type="checkbox" className="h-3.5 w-3.5" checked={value.multiple} onChange={(e) => onChange({ ...value, multiple: e.target.checked })} />
            Multiple Choice
          </label>
          <label className="flex items-center gap-1 text-xs font-medium text-stone-700" title="Customer can also type a value that is not in the list">
            <input type="checkbox" className="h-3.5 w-3.5" checked={value.allowOther} onChange={(e) => onChange({ ...value, allowOther: e.target.checked })} />
            Allow Other Value
          </label>
          <button type="button" className={toolBtn} title="Sort A to Z" onClick={() => onChange({ ...value, options: [...options].sort((a, b) => a.localeCompare(b)) })}>
            <ArrowUpDown size={13} aria-hidden /> Sort A–Z
          </button>
          <button type="button" className={cn(toolBtn, pasting && 'border-amber-700 bg-amber-700 text-white hover:bg-amber-700')} title="Paste many options at once" onClick={() => setPasting((p) => !p)}>
            <ClipboardPaste size={13} aria-hidden /> Paste List
          </button>
        </div>
      </div>

      {pasting ? (
        <div className="space-y-1.5 border border-amber-200 bg-white p-2">
          <textarea
            rows={4}
            autoFocus
            className="w-full border border-stone-400 bg-white p-2 text-sm"
            placeholder="One option per line (or separated by commas)"
            value={pasteText}
            onChange={(e) => setPasteText(e.target.value)}
          />
          <div className="flex justify-end">
            <button
              type="button"
              className="inline-flex h-8 items-center gap-1 bg-amber-700 px-3 text-xs font-semibold text-white hover:bg-amber-800"
              onClick={() => {
                addMany(pasteText.split(/\n|,/))
                setPasteText('')
                setPasting(false)
              }}
            >
              <Plus size={13} aria-hidden /> Add These
            </button>
          </div>
        </div>
      ) : null}

      <div className="max-h-72 overflow-y-auto border border-stone-300 bg-white">
        <table className="w-full border-collapse">
          <thead className="sticky top-0 z-[1]">
            <tr>
              <th className={cn(th, 'w-12')}>#</th>
              <th className={cn(th, 'text-left')}>Option</th>
              <th className={cn(th, 'w-[5.5rem]')}>Default</th>
              <th className={cn(th, 'w-[6rem]')}>Marks Fail</th>
              <th className={cn(th, 'w-[7.5rem]')}>Action</th>
            </tr>
          </thead>
          <tbody>
            <tr className="bg-amber-50/70">
              <td className={cn(td, 'text-xs font-semibold text-amber-800')}>New</td>
              <td className={cn(td, 'text-left')}>
                <Input
                  value={draft}
                  placeholder="Option Name"
                  aria-label="New Option"
                  className={cn('h-8 min-h-8', draft && has(draft) && 'border-red-400')}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      add()
                    }
                  }}
                />
              </td>
              <td className={cn(td, 'text-stone-400')}>—</td>
              <td className={cn(td, 'text-stone-400')}>—</td>
              <td className={td}>
                <button type="button" className={cn(iconBtn, 'border-amber-600 bg-amber-600 text-white hover:bg-amber-700')} disabled={!draft.trim() || has(draft)} title={has(draft) ? 'Already in the list' : 'Add Option'} aria-label="Add Option" onClick={add}>
                  <Plus size={14} />
                </button>
              </td>
            </tr>
            {options.map((o, i) => (
              <tr key={i} className={i % 2 ? 'bg-[#f7f3eb]' : 'bg-[#fffcf7]'}>
                <td className={cn(td, 'text-xs text-stone-500')}>{i + 1}</td>
                <td className={cn(td, 'text-left')}>
                  <Input
                    value={o}
                    aria-label={`Option ${i + 1}`}
                    className="h-8 min-h-8 border-transparent bg-transparent hover:border-stone-300 focus-visible:bg-white"
                    onChange={(e) => rename(i, e.target.value)}
                  />
                </td>
                <td className={td}>
                  <input
                    type="radio"
                    name="dropdown-default"
                    className="h-4 w-4"
                    aria-label={`Default ${o}`}
                    checked={value.defaultOption === o}
                    onChange={() => onChange({ ...value, defaultOption: o })}
                    onClick={() => value.defaultOption === o && onChange({ ...value, defaultOption: '' })}
                  />
                </td>
                <td className={td}>
                  <input
                    type="checkbox"
                    className="h-4 w-4 accent-red-600"
                    aria-label={`${o} marks Fail`}
                    checked={value.failOptions.includes(o)}
                    onChange={(e) =>
                      onChange({ ...value, failOptions: e.target.checked ? [...value.failOptions, o] : value.failOptions.filter((f) => f !== o) })
                    }
                  />
                </td>
                <td className={td}>
                  <span className="flex justify-center gap-1">
                    <button type="button" className={iconBtn} title="Move Up" aria-label="Move Up" disabled={i === 0} onClick={() => move(i, -1)}><ArrowUp size={13} /></button>
                    <button type="button" className={iconBtn} title="Move Down" aria-label="Move Down" disabled={i === options.length - 1} onClick={() => move(i, 1)}><ArrowDown size={13} /></button>
                    <button type="button" className={cn(iconBtn, 'text-red-700 hover:bg-red-50')} title="Delete" aria-label={`Delete ${o}`} onClick={() => remove(i)}><Trash2 size={13} /></button>
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
