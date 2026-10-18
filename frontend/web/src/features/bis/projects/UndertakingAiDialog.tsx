import { useState } from 'react'
import { FolderOpen, Loader2, Sparkles } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { limsDialogClass, limsPrimaryBtnClass } from '@/lib/limsThemeUi'
import { cn } from '@/lib/utils'
import { draftUndertakingLines } from './undertakingAi'
import type { UndertakingLine } from './undertakingLines'
import type { UndertakingSourcesState } from './useUndertakingSources'
import type { BisProjectRow } from './types'

const thCls = 'border border-stone-700 bg-stone-800 px-2 py-1.5 text-[11px] font-bold uppercase tracking-[0.1em] text-amber-200'
const tdCls = 'border border-[#e7e0d4] px-2 py-1.5 align-middle text-stone-700'

/**
 * AI drafting for Undertaking Other: describe the undertaking, AI drafts it from the application and the selected
 * source PDFs, then tick the lines to add.
 */
export function UndertakingAiDialog({
  open,
  onOpenChange,
  row,
  lines,
  sources,
  onSelectSource,
  onAdd,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  row: BisProjectRow
  /** Lines already in the undertaking (the AI avoids repeating them). */
  lines: UndertakingLine[]
  sources: UndertakingSourcesState
  onSelectSource: () => void
  onAdd: (lines: UndertakingLine[], title: string) => void
}) {
  const [guidance, setGuidance] = useState('')
  const [busy, setBusy] = useState(false)
  const [draft, setDraft] = useState<Array<UndertakingLine & { checked: boolean }>>([])
  const [notes, setNotes] = useState('')
  const [title, setTitle] = useState('')

  const generate = async () => {
    setBusy(true)
    try {
      const result = await draftUndertakingLines(row, await sources.files(), guidance, lines, 'other')
      setDraft(result.lines.map((line) => ({ ...line, checked: true })))
      setNotes(result.notes)
      setTitle(result.title)
      if (!result.lines.length) toast.message('AI found no new lines', { description: 'Try other sources or add instructions.' })
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'AI could not prepare undertaking lines.')
    } finally {
      setBusy(false)
    }
  }

  const add = () => {
    const picked = draft.filter((d) => d.checked).map((d): UndertakingLine => ({ id: d.id, text: d.text, source: d.source, clause: d.clause, agreementRequired: d.agreementRequired }))
    if (!picked.length) return
    onAdd(picked, title)
    setDraft([])
    setNotes('')
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!busy) onOpenChange(next) }}>
      <DialogContent layer="top" aria-describedby={undefined} className={cn(limsDialogClass, 'flex max-h-[85vh] w-[min(60rem,calc(100vw_-_var(--app-dialog-overlay-left,0px)_-_1.5rem))] max-w-5xl flex-col gap-0 p-0')}>
        <DialogHeader className="bg-gradient-to-br from-stone-800 via-stone-900 to-stone-950 py-2.5 pl-4 pr-12 text-left">
          <DialogTitle className="flex items-center gap-2 text-base font-semibold tracking-tight text-white">
            <Sparkles size={16} className="text-amber-300" aria-hidden /> Draft Undertaking with AI
          </DialogTitle>
        </DialogHeader>
        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto bg-[#fffcf7] p-4">
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" variant="outline" className="h-9 rounded-none border-stone-400 text-amber-800" disabled={busy} onClick={onSelectSource}>
              <FolderOpen size={15} className="mr-1.5" aria-hidden /> Select Source
            </Button>
            <span className="text-xs text-stone-600">
              {sources.loading ? 'Loading sources…' : sources.count ? `${sources.count} source PDF${sources.count === 1 ? '' : 's'} selected` : 'No source selected'}
            </span>
          </div>
          <textarea
            aria-label="AI Drafting Instructions"
            placeholder="Describe the undertaking to prepare from this application and its PDFs…"
            className="min-h-20 w-full rounded-none border border-stone-400 bg-white p-2 text-sm"
            disabled={busy}
            value={guidance}
            onChange={(e) => setGuidance(e.target.value)}
          />
          <div className="flex justify-end">
            <Button type="button" className={cn(limsPrimaryBtnClass, 'h-9')} disabled={busy || !guidance.trim()} onClick={() => void generate()}>
              {busy ? <Loader2 size={15} className="mr-1.5 animate-spin" aria-hidden /> : <Sparkles size={15} className="mr-1.5" aria-hidden />}
              Generate
            </Button>
          </div>
          {notes ? <p className="whitespace-pre-wrap border border-stone-200 bg-white p-2 text-xs text-stone-600">{notes}</p> : null}
          {draft.length ? (
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr>
                  <th className={cn(thCls, 'w-8 px-1 text-center')} aria-label="Select" />
                  <th className={cn(thCls, 'text-left')}>Undertaking{title ? ` · ${title}` : ''}</th>
                </tr>
              </thead>
              <tbody>
                {draft.map((d, i) => (
                  <tr key={d.id} className={i % 2 ? 'bg-[#fffcf7]' : 'bg-[#f7f3eb]'}>
                    <td className={cn(tdCls, 'px-1 text-center')}>
                      <input type="checkbox" className="h-4 w-4" aria-label={`Select AI line ${i + 1}`} checked={d.checked} onChange={(e) => setDraft((prev) => prev.map((x) => (x.id === d.id ? { ...x, checked: e.target.checked } : x)))} />
                    </td>
                    <td className={cn(tdCls, 'whitespace-pre-wrap leading-relaxed text-stone-800')}>{d.text}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : null}
        </div>
        <DialogFooter className="border-t border-stone-200 bg-stone-50 px-4 py-3">
          <Button type="button" variant="outline" className="rounded-none" disabled={busy} onClick={() => onOpenChange(false)}>
            Close
          </Button>
          <Button type="button" className={cn(limsPrimaryBtnClass, 'min-w-[7rem]')} disabled={busy || !draft.some((d) => d.checked)} onClick={add}>
            Add Selected
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
