import { useMemo, useState } from 'react'
import { Loader2, Mic, MicOff, Paperclip, Sparkles, Trash2, X } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { useVoiceInput } from '@/features/bis/shared/useVoiceInput'
import { limsOutlineBtnClass, limsPrimaryBtnClass } from '@/lib/limsThemeUi'
import { cn } from '@/lib/utils'
import { suggestTestParameters, type SuggestedTestParameter } from './testParameterAi'

type IsCodeChoice = { id: string; displayCode: string; searchLabel: string }
type Line = SuggestedTestParameter & { id: string; selected: boolean; duplicate: boolean }

const key = (name: string, clause: string) => `${name.trim().toLowerCase()}|${clause.trim().toLowerCase()}`

/**
 * Add Test Parameters with AI: pick an IS Code, optionally describe the sample (grade, size …) or attach a PDF,
 * and the AI reads the standard and product manual of the IS Code and lists its test parameters. The user reviews the
 * list, then adds the ticked ones to the Test Parameter Master.
 */
export function TestParameterAiDialog({
  open,
  onOpenChange,
  isCodes,
  existing,
  initialIsCodeId = '',
  onAdd,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  isCodes: IsCodeChoice[]
  existing: Array<{ is_code_id: string | null; item_name: string; clause_no: string | null }>
  initialIsCodeId?: string
  /** Adds the ticked parameters of one IS Code; returns how many were added. */
  onAdd: (isCodeId: string, items: SuggestedTestParameter[]) => Promise<number>
}) {
  const [chosenId, setChosenId] = useState(initialIsCodeId)
  const [query, setQuery] = useState('')
  const [pickerOpen, setPickerOpen] = useState(false)
  const [description, setDescription] = useState('')
  const [files, setFiles] = useState<File[]>([])
  const [lines, setLines] = useState<Line[]>([])
  const [busy, setBusy] = useState<'read' | 'add' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [standardsUsed, setStandardsUsed] = useState<string[]>([])
  const voice = useVoiceInput(setDescription)

  const chosen = isCodes.find((c) => c.id === chosenId) ?? null
  const matches = useMemo(() => {
    const q = query.trim().toLowerCase()
    return (q ? isCodes.filter((c) => c.searchLabel.toLowerCase().includes(q)) : isCodes).slice(0, 30)
  }, [isCodes, query])

  const read = async () => {
    if (!chosen) return setError('Select an IS Code first.')
    setBusy('read')
    setError(null)
    try {
      const result = await suggestTestParameters({ id: chosen.id, label: chosen.displayCode, title: chosen.searchLabel.split(' — ')[1] }, description, files)
      const known = new Set(existing.filter((r) => r.is_code_id === chosen.id).map((r) => key(r.item_name, r.clause_no ?? '')))
      setLines(
        result.parameters.map((p) => {
          const duplicate = known.has(key(p.itemName, p.clauseNo))
          return { ...p, id: crypto.randomUUID(), duplicate, selected: !duplicate }
        }),
      )
      setStandardsUsed(result.standardsUsed)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'AI could not read the standard.')
    } finally {
      setBusy(null)
    }
  }

  const add = async () => {
    if (!chosen) return
    const items = lines.filter((l) => l.selected && l.itemName.trim()).map(({ itemName, clauseNo, testMethod, unitValue, specificRequirement }) => ({ itemName, clauseNo, testMethod, unitValue, specificRequirement }))
    if (!items.length) return setError('Tick at least one test parameter.')
    setBusy('add')
    setError(null)
    try {
      const n = await onAdd(chosen.id, items)
      toast.success(`${n} Test Parameter${n === 1 ? '' : 's'} Added.`)
      setLines([])
      onOpenChange(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add the test parameters.')
    } finally {
      setBusy(null)
    }
  }

  const edit = (id: string, patch: Partial<Line>) => setLines((cur) => cur.map((l) => (l.id === id ? { ...l, ...patch } : l)))
  const cell = 'h-8 rounded-none border-stone-400 px-2 text-sm'
  const selectedCount = lines.filter((l) => l.selected && l.itemName.trim()).length

  return (
    <Dialog open={open} onOpenChange={(next) => { if (busy === null) onOpenChange(next) }}>
      <DialogContent className="flex max-h-[92dvh] w-[min(72rem,calc(100vw-1.5rem))] max-w-none flex-col gap-3 overflow-hidden rounded-none border-2 border-stone-500 bg-[#f7f3eb] p-3 sm:p-4">
        <DialogHeader>
          <DialogTitle className="font-jakarta text-base">Add Test Parameters with AI</DialogTitle>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto">
          <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
            <div className="space-y-1.5">
              <Label className="text-[11px] font-semibold uppercase tracking-[0.08em] text-stone-600" htmlFor="tpai-is">IS Code</Label>
              <Input
                id="tpai-is"
                className="h-9 rounded-none border-stone-500 bg-white"
                placeholder="Search IS Code"
                autoComplete="off"
                value={pickerOpen ? query : chosen ? chosen.displayCode : query}
                onFocus={() => { setQuery(''); setPickerOpen(true) }}
                onChange={(e) => { setQuery(e.target.value); setPickerOpen(true) }}
                onBlur={() => window.setTimeout(() => setPickerOpen(false), 150)}
              />
              {pickerOpen ? (
                <ul className="mt-1 max-h-48 w-full overflow-y-auto border border-stone-500 bg-white">
                  {matches.length ? matches.map((c) => (
                    <li key={c.id}>
                      <button type="button" className="block w-full truncate px-3 py-1.5 text-left text-sm hover:bg-amber-50" onMouseDown={(e) => e.preventDefault()} onClick={() => { setChosenId(c.id); setPickerOpen(false); setLines([]) }}>
                        {c.searchLabel}
                      </button>
                    </li>
                  )) : <li className="px-3 py-2 text-sm text-stone-500">No IS Code Found</li>}
                </ul>
              ) : null}
            </div>
            <div className="space-y-1.5">
              <Label className="text-[11px] font-semibold uppercase tracking-[0.08em] text-stone-600" htmlFor="tpai-desc">Sample Description or Instructions (Optional)</Label>
              <div className="flex items-stretch gap-1.5">
                <Textarea
                  id="tpai-desc"
                  rows={2}
                  className="min-h-[2.25rem] flex-1 resize-none rounded-none border-stone-500 bg-white py-2"
                  placeholder="e.g. WT 240, 42.4 x 2.0 mm, ERW, without zinc coating"
                  value={description}
                  disabled={busy !== null}
                  onChange={(e) => setDescription(e.target.value)}
                />
                <div className="flex flex-col gap-1.5">
                  {voice.supported ? (
                    <Button type="button" variant="outline" className={cn(limsOutlineBtnClass, 'h-8 w-8 p-0', voice.listening && 'border-red-600 bg-red-50 text-red-700')} aria-label={voice.listening ? 'Stop Voice Typing' : 'Start Voice Typing'} title={voice.listening ? 'Stop Listening' : 'Voice Typing'} disabled={busy !== null} onClick={() => (voice.listening ? voice.stop() : voice.start(description))}>
                      {voice.listening ? <MicOff size={15} aria-hidden /> : <Mic size={15} aria-hidden />}
                    </Button>
                  ) : null}
                  <label className={cn(limsOutlineBtnClass, 'inline-flex h-8 w-8 cursor-pointer items-center justify-center border', busy !== null && 'pointer-events-none opacity-50')} title="Attach PDF" aria-label="Attach PDF">
                    <Paperclip size={15} aria-hidden />
                    <input type="file" multiple accept=".pdf,application/pdf" className="sr-only" disabled={busy !== null} onChange={(e) => { const picked = Array.from(e.target.files ?? []); e.target.value = ''; if (picked.length) setFiles((cur) => [...cur, ...picked]) }} />
                  </label>
                </div>
              </div>
              {files.length || voice.error ? (
                <div className="flex flex-wrap items-center gap-1.5">
                  {files.map((f, i) => (
                    <span key={`${f.name}-${i}`} className="inline-flex max-w-full items-center gap-1 border border-stone-400 bg-white px-2 py-0.5 text-xs text-stone-700">
                      <Paperclip size={12} aria-hidden />
                      <span className="truncate" title={f.name}>{f.name}</span>
                      <button type="button" className="text-red-700" aria-label={`Remove ${f.name}`} disabled={busy !== null} onClick={() => setFiles((cur) => cur.filter((_, j) => j !== i))}><X size={12} aria-hidden /></button>
                    </span>
                  ))}
                  {voice.error ? <span className="text-xs text-destructive">{voice.error}</span> : null}
                </div>
              ) : null}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" className={cn(limsPrimaryBtnClass, 'h-9 gap-1.5')} disabled={busy !== null || !chosen} onClick={() => void read()}>
              {busy === 'read' ? <Loader2 size={14} className="animate-spin" aria-hidden /> : <Sparkles size={14} aria-hidden />} {busy === 'read' ? 'Reading the Standard…' : 'Read Standard with AI'}
            </Button>
            {standardsUsed.length ? <span className="text-xs text-stone-600">Read: {standardsUsed.join(', ')}</span> : null}
          </div>

          {error ? <p className="border-l-2 border-destructive bg-destructive/5 px-3 py-2 text-sm text-destructive">{error}</p> : null}

          {lines.length ? (
            <div className="overflow-x-auto border border-stone-400 bg-white">
              <table className="w-full min-w-[56rem] border-collapse text-sm">
                <thead>
                  <tr className="bg-stone-100 text-left text-[11px] font-semibold uppercase tracking-wide text-stone-600">
                    <th className="w-8 px-2 py-1.5">
                      <input type="checkbox" aria-label="Select all" className="h-4 w-4 accent-amber-700" checked={lines.every((l) => l.selected)} onChange={(e) => setLines((cur) => cur.map((l) => ({ ...l, selected: e.target.checked })))} />
                    </th>
                    <th className="px-2 py-1.5">Test Parameter</th>
                    <th className="w-28 px-2 py-1.5">Clause No.</th>
                    <th className="w-40 px-2 py-1.5">Test Method</th>
                    <th className="w-24 px-2 py-1.5">Unit</th>
                    <th className="px-2 py-1.5">Specific Requirement</th>
                    <th className="w-8 px-2 py-1.5" />
                  </tr>
                </thead>
                <tbody>
                  {lines.map((l) => (
                    <tr key={l.id} className={cn('border-t border-stone-200', l.duplicate && 'bg-stone-50')}>
                      <td className="px-2 py-1.5"><input type="checkbox" aria-label={`Select ${l.itemName}`} className="h-4 w-4 accent-amber-700" checked={l.selected} onChange={(e) => edit(l.id, { selected: e.target.checked })} /></td>
                      <td className="px-2 py-1.5">
                        <Input aria-label="Test parameter" className={cell} value={l.itemName} onChange={(e) => edit(l.id, { itemName: e.target.value })} />
                        {l.duplicate ? <span className="text-[10px] font-semibold uppercase text-amber-800">Already in Master</span> : null}
                      </td>
                      <td className="px-2 py-1.5"><Input aria-label="Clause number" className={cell} value={l.clauseNo} onChange={(e) => edit(l.id, { clauseNo: e.target.value })} /></td>
                      <td className="px-2 py-1.5"><Input aria-label="Test method" className={cell} value={l.testMethod} onChange={(e) => edit(l.id, { testMethod: e.target.value })} /></td>
                      <td className="px-2 py-1.5"><Input aria-label="Unit" className={cell} value={l.unitValue} onChange={(e) => edit(l.id, { unitValue: e.target.value })} /></td>
                      <td className="px-2 py-1.5"><Input aria-label="Specific requirement" className={cell} value={l.specificRequirement} onChange={(e) => edit(l.id, { specificRequirement: e.target.value })} /></td>
                      <td className="px-2 py-1.5"><Button type="button" variant="outline" size="icon" className="h-7 w-7 rounded-none border-stone-400 text-red-700" aria-label={`Remove ${l.itemName}`} onClick={() => setLines((cur) => cur.filter((x) => x.id !== l.id))}><Trash2 size={13} /></Button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </div>

        <DialogFooter className="flex-row items-center justify-between gap-2 sm:justify-between">
          <span className="text-xs text-stone-600">{lines.length ? `${selectedCount} of ${lines.length} Selected` : ''}</span>
          <div className="flex gap-2">
            <Button type="button" variant="outline" className={cn(limsOutlineBtnClass, 'h-8')} disabled={busy !== null} onClick={() => onOpenChange(false)}>Close</Button>
            <Button type="button" className={cn(limsPrimaryBtnClass, 'h-8')} disabled={busy !== null || selectedCount === 0} onClick={() => void add()}>
              {busy === 'add' ? 'Adding…' : `Add Selected (${selectedCount})`}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
