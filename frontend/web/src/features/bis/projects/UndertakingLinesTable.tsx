import { useState } from 'react'
import { Check, FolderOpen, Import, Loader2, Pencil, Plus, Sparkles, Trash2, X } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { defaultUndertakingLines, resolvedUndertakingLine, type UndertakingLine } from './undertakingLines'

/* Undertaking lines laid out like the other step tables: an input row on top (AI + Add), saved rows read-only with
   Edit / AI / Delete in the same row, a select box per row, and Import / AI buttons in the heading. */

const thCls = 'border border-stone-700 bg-stone-800 px-2 py-1.5 text-[11px] font-bold uppercase tracking-[0.1em] text-amber-200'
const tdCls = 'border border-[#e7e0d4] px-2 py-1.5 align-middle text-stone-700'
const iconBtn = 'h-7 w-7 rounded-none border border-stone-400 bg-white/70 p-0 text-amber-800 hover:border-amber-600 hover:bg-amber-50'
const headerBtn = 'h-8 w-8 rounded-none border border-amber-700 bg-white p-0 text-amber-800 shadow-sm hover:bg-amber-50'
const areaCls = 'min-h-[2.25rem] w-full resize-y rounded-none border border-stone-400 bg-white px-2 py-1.5 text-sm'

type Draft = { text: string; source: string; clause: string; agreementRequired: boolean }
const blankDraft = (): Draft => ({ text: '', source: '', clause: '', agreementRequired: false })

export function UndertakingLinesTable({
  lines,
  defaults = [],
  onChange,
  disabled,
  references = false,
  onImport,
  onAiLines,
  onAiHeader,
  aiHeaderBusy = false,
  onSource,
  sourceCount = 0,
}: {
  lines: UndertakingLine[] | null
  defaults?: string[]
  onChange: (lines: UndertakingLine[]) => void
  disabled?: boolean
  references?: boolean
  /** Heading Import button: copy lines from another application. */
  onImport?: () => void
  /** AI: rewrite `text` (one line) or, when empty, draft `count` new lines. */
  onAiLines?: (text: string, existing: string[], count: number) => Promise<string[]>
  /** Heading AI button: open a fuller AI dialog instead of suggesting 3 lines. */
  onAiHeader?: () => void
  /** The heading AI action (onAiHeader) is running. */
  aiHeaderBusy?: boolean
  /** Heading Source button: choose the PDFs the AI reads. */
  onSource?: () => void
  sourceCount?: number
}) {
  const rows = lines ?? defaultUndertakingLines(defaults)
  const texts = rows.map((row) => resolvedUndertakingLine(row, defaults))
  const [draft, setDraft] = useState<Draft>(blankDraft)
  const [editIndex, setEditIndex] = useState<number | null>(null)
  const [edit, setEdit] = useState<Draft>(blankDraft)
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [aiBusy, setAiBusy] = useState<string | null>(null)

  const runAi = async (key: string, text: string, count: number): Promise<string[] | null> => {
    if (!onAiLines) return null
    setAiBusy(key)
    try {
      return await onAiLines(text, texts.filter(Boolean), count)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'AI could not prepare the line.')
      return null
    } finally {
      setAiBusy(null)
    }
  }

  const add = () => {
    if (!draft.text.trim()) {
      toast.error('Enter the Undertaking Text, or Use AI to Draft It.')
      return
    }
    onChange([...rows, { id: crypto.randomUUID(), text: draft.text.trim(), source: draft.source.trim(), clause: draft.clause.trim(), agreementRequired: draft.agreementRequired }])
    setDraft(blankDraft())
  }

  const saveEdit = () => {
    if (editIndex == null) return
    if (!edit.text.trim()) {
      toast.error('The Undertaking Text Cannot Be Empty.')
      return
    }
    onChange(rows.map((row, i) => (i === editIndex ? { ...row, text: edit.text.trim(), source: edit.source, clause: edit.clause, agreementRequired: edit.agreementRequired } : row)))
    setEditIndex(null)
  }

  const remove = (indexes: number[]) => {
    onChange(rows.filter((_, i) => !indexes.includes(i)))
    setSelected(new Set())
    setEditIndex(null)
  }

  const refCells = (value: Draft, set: (patch: Partial<Draft>) => void, idPrefix: string) => (
    <>
      <td data-label="Source / Clause" className={cn(tdCls, 'w-48')}>
        <Input aria-label={`Source ${idPrefix}`} className="h-8 rounded-none border-stone-400 bg-white text-sm" value={value.source} placeholder="Standard / Product Manual" disabled={disabled} onChange={(e) => set({ source: e.target.value })} />
        <Input aria-label={`Clause ${idPrefix}`} className="mt-1 h-8 rounded-none border-stone-400 bg-white text-sm" value={value.clause} placeholder="Clause / Page" disabled={disabled} onChange={(e) => set({ clause: e.target.value })} />
      </td>
      <td data-label="Agreement Required" className={cn(tdCls, 'w-28 text-center')}>
        <input type="checkbox" className="h-4 w-4" aria-label={`Agreement Required ${idPrefix}`} checked={value.agreementRequired} disabled={disabled} onChange={(e) => set({ agreementRequired: e.target.checked })} />
      </td>
    </>
  )

  const colSpan = references ? 5 : 3

  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-stone-800">Undertaking Lines</h3>
        <div className="flex items-center gap-1.5">
          {selected.size > 0 ? (
            <Button type="button" size="sm" variant="outline" className="h-8 rounded-none border-red-300 text-xs text-red-700 hover:bg-red-50" disabled={disabled} onClick={() => remove([...selected])}>
              <Trash2 className="mr-1 h-3 w-3" aria-hidden /> Delete selected ({selected.size})
            </Button>
          ) : null}
          {onImport ? (
            <Button type="button" variant="ghost" className={headerBtn} disabled={disabled} title="Import from Another Application" aria-label="Import from Another Application" onClick={onImport}>
              <Import size={15} aria-hidden />
            </Button>
          ) : null}
          {onSource ? (
            <Button type="button" variant="ghost" className={cn(headerBtn, 'relative')} disabled={disabled} title={`Select Source PDFs for AI (${sourceCount} selected)`} aria-label="Select Source PDFs for AI" onClick={onSource}>
              <FolderOpen size={15} aria-hidden />
              {sourceCount ? <span className="absolute -right-1.5 -top-1.5 min-w-[1rem] rounded-full bg-amber-700 px-1 text-[10px] font-bold leading-4 text-white">{sourceCount}</span> : null}
            </Button>
          ) : null}
          {onAiLines || onAiHeader ? (
            <Button
              type="button"
              variant="ghost"
              className={headerBtn}
              disabled={disabled || aiBusy !== null || aiHeaderBusy}
              title={onSource ? 'Draft undertakings with AI from the selected sources' : 'Suggest more undertaking lines with AI'}
              aria-label="Suggest More Undertaking Lines with AI"
              onClick={() =>
                onAiHeader ? onAiHeader() : void runAi('header', '', 3).then((more) => {
                  if (more?.length) {
                    onChange([...rows, ...more.map((text) => ({ id: crypto.randomUUID(), text, source: '', clause: '', agreementRequired: false }))])
                    toast.success(`Added ${more.length} AI line${more.length === 1 ? '' : 's'} — review and edit as needed.`)
                  }
                })
              }
            >
              {aiBusy === 'header' || aiHeaderBusy ? <Loader2 size={15} className="animate-spin" aria-hidden /> : <Sparkles size={15} aria-hidden />}
            </Button>
          ) : null}
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="list-cards w-full min-w-[640px] border-collapse text-sm">
          <thead>
            <tr>
              <th className={cn(thCls, 'w-8 px-1 text-center')} aria-label="Select" />
              <th className={cn(thCls, 'text-left')}>
                Undertaking / Requirement<span className="text-red-400">*</span>
              </th>
              {references ? (
                <>
                  <th className={cn(thCls, 'text-center')}>Source / Clause</th>
                  <th className={cn(thCls, 'text-center')}>Agreement Required</th>
                </>
              ) : null}
              <th className={cn(thCls, 'w-28 text-center')}>Action</th>
            </tr>
          </thead>
          <tbody>
            <tr className="bg-[#fffcf7]">
              <td className={cn(tdCls, 'lc-check')} />
              <td data-label="New Line" className={cn(tdCls, 'lc-wide')}>
                <textarea aria-label="New Undertaking Line" className={areaCls} rows={2} placeholder="Undertaking / Requirement" disabled={disabled} value={draft.text} onChange={(e) => setDraft((d) => ({ ...d, text: e.target.value }))} />
              </td>
              {references ? refCells(draft, (patch) => setDraft((d) => ({ ...d, ...patch })), 'for the new line') : null}
              <td className={cn(tdCls, 'lc-actions text-center')}>
                <span className="inline-flex gap-1">
                  {onAiLines ? (
                    <Button
                      type="button"
                      variant="ghost"
                      className={iconBtn}
                      disabled={disabled || aiBusy !== null}
                      title={draft.text.trim() ? 'Improve this line with AI' : 'Draft a line with AI'}
                      aria-label="AI for the New Line"
                      onClick={() => void runAi('draft', draft.text, 1).then((out) => out?.[0] && setDraft((d) => ({ ...d, text: out[0]! })))}
                    >
                      {aiBusy === 'draft' ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
                    </Button>
                  ) : null}
                  <Button type="button" size="sm" disabled={disabled} className="h-7 w-7 rounded-none bg-amber-700 p-0 text-white hover:bg-amber-800" title="Add Line" aria-label="Add Line" onClick={add}>
                    <Plus className="h-4 w-4" aria-hidden />
                  </Button>
                </span>
              </td>
            </tr>
            {rows.map((row, index) => {
              const editing = editIndex === index
              return (
                <tr key={row.id} className={index % 2 ? 'bg-[#fffcf7]' : 'bg-[#f7f3eb]'}>
                  <td className={cn(tdCls, 'lc-check px-1 text-center')}>
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded-none border-stone-500 text-amber-700"
                      aria-label={`Select line ${index + 1}`}
                      checked={selected.has(index)}
                      onChange={() =>
                        setSelected((prev) => {
                          const next = new Set(prev)
                          if (next.has(index)) next.delete(index)
                          else next.add(index)
                          return next
                        })
                      }
                    />
                  </td>
                  <td className={cn(tdCls, 'lc-wide')}>
                    {editing ? (
                      <textarea aria-label={`Undertaking Line ${index + 1}`} className={areaCls} rows={3} disabled={disabled} value={edit.text} onChange={(e) => setEdit((d) => ({ ...d, text: e.target.value }))} />
                    ) : (
                      <span className="block whitespace-pre-wrap leading-relaxed text-stone-800">{texts[index] || <span className="text-stone-400">—</span>}</span>
                    )}
                  </td>
                  {references ? (
                    editing ? (
                      refCells(edit, (patch) => setEdit((d) => ({ ...d, ...patch })), `for line ${index + 1}`)
                    ) : (
                      <>
                        <td data-label="Source / Clause" className={cn(tdCls, 'text-center text-xs')}>{[row.source, row.clause].filter(Boolean).join(' — ') || '—'}</td>
                        <td data-label="Agreement Required" className={cn(tdCls, 'text-center text-xs')}>{row.agreementRequired ? 'Yes' : 'No'}</td>
                      </>
                    )
                  ) : null}
                  <td className={cn(tdCls, 'lc-actions text-center')}>
                    <span className="inline-flex gap-1">
                      {editing ? (
                        <>
                          <Button type="button" variant="ghost" className={iconBtn} disabled={disabled} title="Save" aria-label={`Save line ${index + 1}`} onClick={saveEdit}>
                            <Check size={14} />
                          </Button>
                          <Button type="button" variant="ghost" className={iconBtn} title="Cancel" aria-label={`Cancel editing line ${index + 1}`} onClick={() => setEditIndex(null)}>
                            <X size={14} />
                          </Button>
                        </>
                      ) : (
                        <>
                          <Button
                            type="button"
                            variant="ghost"
                            className={iconBtn}
                            disabled={disabled}
                            title="Edit Line"
                            aria-label={`Edit line ${index + 1}`}
                            onClick={() => {
                              setEditIndex(index)
                              setEdit({ text: texts[index] ?? '', source: row.source, clause: row.clause, agreementRequired: row.agreementRequired })
                            }}
                          >
                            <Pencil size={13} />
                          </Button>
                          {onAiLines ? (
                            <Button
                              type="button"
                              variant="ghost"
                              className={iconBtn}
                              disabled={disabled || aiBusy !== null}
                              title="Improve This Line with AI"
                              aria-label={`AI for line ${index + 1}`}
                              onClick={() =>
                                void runAi(`row-${index}`, texts[index] ?? '', 1).then((out) => {
                                  if (out?.[0]) onChange(rows.map((r, i) => (i === index ? { ...r, text: out[0]! } : r)))
                                })
                              }
                            >
                              {aiBusy === `row-${index}` ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
                            </Button>
                          ) : null}
                          <Button type="button" variant="ghost" className={iconBtn} disabled={disabled} title="Delete Line" aria-label={`Delete line ${index + 1}`} onClick={() => remove([index])}>
                            <Trash2 size={13} />
                          </Button>
                        </>
                      )}
                    </span>
                  </td>
                </tr>
              )
            })}
            {!rows.length ? (
              <tr>
                <td className={cn(tdCls, 'py-3 text-center text-stone-500')} colSpan={colSpan}>
                  No lines yet — type one above or use AI.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </section>
  )
}
