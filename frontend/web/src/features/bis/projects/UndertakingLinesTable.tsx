import { Plus, RotateCcw, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { defaultUndertakingLines, resolvedUndertakingLine, type UndertakingLine } from './undertakingLines'

export function UndertakingLinesTable({ lines, defaults = [], onChange, disabled, references = false }: {
  lines: UndertakingLine[] | null
  defaults?: string[]
  onChange: (lines: UndertakingLine[]) => void
  disabled?: boolean
  references?: boolean
}) {
  const rows = lines ?? defaultUndertakingLines(defaults)
  const patch = (index: number, values: Partial<UndertakingLine>) => onChange(rows.map((row, i) => i === index ? { ...row, ...values } : row))
  const cell = 'border border-stone-300 p-2 align-top'
  return <section className="space-y-2">
    <div className="flex items-center justify-between gap-2"><h3 className="text-sm font-semibold">Undertaking Lines</h3><Button type="button" variant="outline" size="sm" className="rounded-none" disabled={disabled} onClick={() => onChange([...rows, { id: crypto.randomUUID(), text: '', source: '', clause: '', agreementRequired: false }])}><Plus size={15} className="mr-1" />Add Line</Button></div>
    <div className="overflow-x-auto"><table className="w-full min-w-[640px] border-collapse text-sm"><thead className="bg-stone-800 text-left text-xs text-amber-200"><tr><th className={cell}>No.</th><th className={cell}>Undertaking / Requirement</th>{references ? <><th className={cell}>Source / Clause</th><th className={cell}>Manufacturer–Purchaser Agreement Required</th></> : null}<th className={cell}>Action</th></tr></thead><tbody>
      {rows.map((row, index) => <tr key={row.id} className={index % 2 ? 'bg-[#f7f3eb]' : 'bg-white'}><td className={`${cell} w-12 text-center`}>{index + 1}</td><td className={cell}><textarea aria-label={`Undertaking Line ${index + 1}`} className="min-h-20 w-full min-w-64 resize-y rounded-none border border-stone-300 bg-white p-2 text-sm" disabled={disabled} value={resolvedUndertakingLine(row, defaults)} onChange={(event) => patch(index, { text: event.target.value })} /></td>
        {references ? <><td className={`${cell} w-48`}><Input aria-label={`Source for Line ${index + 1}`} value={row.source} placeholder="Standard / Product Manual" disabled={disabled} onChange={(event) => patch(index, { source: event.target.value })} /><Input aria-label={`Clause for Line ${index + 1}`} value={row.clause} placeholder="Clause / Page" disabled={disabled} onChange={(event) => patch(index, { clause: event.target.value })} /></td><td className={`${cell} w-28 text-center`}><input type="checkbox" aria-label={`Agreement Required for Line ${index + 1}`} checked={row.agreementRequired} disabled={disabled} onChange={(event) => patch(index, { agreementRequired: event.target.checked })} /></td></> : null}
        <td className={`${cell} w-20 whitespace-nowrap text-center`}>{row.templateIndex != null ? <Button type="button" variant="outline" size="icon" title="Use Default Line from Fields" aria-label={`Reset Line ${index + 1} from Fields`} disabled={disabled} onClick={() => patch(index, { text: null })}><RotateCcw size={14} /></Button> : null}<Button type="button" variant="outline" size="icon" title="Delete Line" aria-label={`Delete Line ${index + 1}`} disabled={disabled} onClick={() => onChange(rows.filter((_, i) => i !== index))}><Trash2 size={14} /></Button></td></tr>)}
      {!rows.length ? <tr><td className="p-4 text-sm text-stone-500" colSpan={references ? 5 : 3}>Add a line or use AI to draft requirements from the selected sources.</td></tr> : null}
    </tbody></table></div>
  </section>
}
