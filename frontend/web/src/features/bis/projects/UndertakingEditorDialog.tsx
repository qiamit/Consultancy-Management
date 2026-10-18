import { useEffect, useState } from 'react'
import { Check, LoaderCircle } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { limsDialogClass, limsPrimaryBtnClass } from '@/lib/limsThemeUi'
import { loadBisPrintData } from '../print/loadBisPrintData'
import { fetchBisModulePayload, saveBisModulePayload } from './bisModuleDataApi'
import { BisModuleImportDialog } from './BisModuleImportDialog'
import { UndertakingAiDialog } from './UndertakingAiDialog'
import { UndertakingSourcePicker } from './UndertakingSourcePicker'
import { useUndertakingSources } from './useUndertakingSources'
import { Input } from '@/components/ui/input'
import { emptyUndertakingGeneralPayload, parseUndertakingGeneralPayload } from './undertakingPayloadModels'
import { parseUndertakingLines, resolvedUndertakingLine, type UndertakingLine } from './undertakingLines'
import { undertakingGeneralDefaultPoints } from '../print/undertakingGeneralHtml'
import { UndertakingGeneralFields } from './UndertakingGeneralFields'
import { UndertakingLinesTable } from './UndertakingLinesTable'
import { aiUndertakingLines, draftStandardUndertakings } from './undertakingAi'
import type { BisProjectRow } from './types'

export type EditableUndertakingKind = 'undertaking-general' | 'undertaking-indian-standards' | 'undertaking-other'

export function UndertakingEditorDialog({ row, kind, open, onOpenChange }: { row: BisProjectRow; kind: EditableUndertakingKind; open: boolean; onOpenChange: (open: boolean) => void }) {
  const [general, setGeneral] = useState(emptyUndertakingGeneralPayload)
  const [lines, setLines] = useState<UndertakingLine[]>([])
  const [raw, setRaw] = useState<Record<string, unknown>>({})
  const [isLabel, setIsLabel] = useState('')
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [busy, setBusy] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const [aiOpen, setAiOpen] = useState(false)
  const [sourceOpen, setSourceOpen] = useState(false)
  const [drafting, setDrafting] = useState(false)
  const other = kind === 'undertaking-other'
  const usesAi = kind !== 'undertaking-general'
  const title = other ? 'Undertaking Other if Required' : usesAi ? 'Undertaking as per Indian Standards' : 'Undertaking for General'
  const [documentTitle, setDocumentTitle] = useState('Undertaking Other if Required')
  // Indian Standards reads only the IS Code master PDFs (Standard / Product Manual); Other may also use application documents.
  const sources = useUndertakingSources(row, open && usesAi, other)

  useEffect(() => {
    if (!open) return
    let active = true
    void Promise.all([fetchBisModulePayload(row.id, kind), loadBisPrintData(row)])
      .then(([saved, data]) => {
        if (!active) return
        setRaw(saved ?? {})
        setGeneral(parseUndertakingGeneralPayload(saved))
        setLines(parseUndertakingLines(saved?.lines) ?? [])
        setDocumentTitle(String(saved?.documentTitle ?? '').trim() || 'Undertaking Other if Required')
        setIsLabel(data.isCode.label)
      })
      .catch((err: unknown) => { if (active) setLoadError(err instanceof Error ? err.message : 'Could not load undertaking details.') })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [open, kind, row])

  const payload = () => usesAi ? { ...raw, lines, ...(other ? { documentTitle } : {}) } : { ...raw, ...general }
  /** Save, then close; the undertaking is previewed / printed from its row on Step 7. */
  const save = async () => {
    if (usesAi && (!lines.length || lines.some((line) => !line.text?.trim()))) { toast.error('Add the undertaking text for every line before saving.'); return }
    if (!usesAi && general.lines !== null) {
      const defaults = undertakingGeneralDefaultPoints({ ...general, isNumber: isLabel })
      if (!general.lines.length || general.lines.some((line) => !resolvedUndertakingLine(line, defaults).trim())) { toast.error('Enter text for each line, or delete unused blank lines.'); return }
    }
    if (other && !documentTitle.trim()) { toast.error('Enter the Undertaking Title.'); return }
    setBusy(true)
    try {
      const next = payload()
      await saveBisModulePayload(row.id, kind, next)
      setRaw(next)
      toast.success(`${title} saved.`)
      onOpenChange(false)
    } catch (err) { toast.error(err instanceof Error ? err.message : 'Could not save the undertaking.') }
    finally { setBusy(false) }
  }

  /** Import from another application: General copies its fields and lines; the others add the lines not already here. */
  const importFrom = async (sourceProjectId: string) => {
    const source = await fetchBisModulePayload(sourceProjectId, kind)
    if (!source) throw new Error(`The selected application has no ${title}.`)
    if (!usesAi) {
      const parsed = parseUndertakingGeneralPayload(source)
      setGeneral((current) => ({ ...parsed, weeklyOff: current.weeklyOff }))
      toast.success(`${title} imported — review, then Save.`)
      return
    }
    const sourceLines = (parseUndertakingLines(source.lines) ?? []).filter((line) => line.text?.trim())
    const known = new Set(lines.map((line) => line.text?.trim().toLowerCase()))
    const fresh = sourceLines.filter((line) => !known.has(line.text?.trim().toLowerCase())).map((line) => ({ ...line, id: crypto.randomUUID() }))
    if (!fresh.length) { toast.message('Nothing new to import'); return }
    setLines([...lines, ...fresh])
    if (other && String(source.documentTitle ?? '').trim() && !documentTitle.trim()) setDocumentTitle(String(source.documentTitle))
    toast.success(`Imported ${fresh.length} line${fresh.length === 1 ? '' : 's'} — review, then Save.`)
  }
  /** Indian Standards: AI reads the selected Standard / Product Manual only and adds undertakings to the table. */
  const draftFromStandard = async () => {
    if (!sources.count) {
      toast.message('Select the Indian Standard and Product Manual first.')
      setSourceOpen(true)
      return
    }
    setDrafting(true)
    try {
      const added = await draftStandardUndertakings(await sources.files(), lines.map((line) => line.text ?? '').filter(Boolean))
      if (!added.length) { toast.message('AI found no new undertakings in the selected sources.'); return }
      setLines((current) => [...current, ...added.map((text) => ({ id: crypto.randomUUID(), text, source: '', clause: '', agreementRequired: false }))])
      toast.success(`Added ${added.length} undertaking${added.length === 1 ? '' : 's'} — review, then Save.`)
    } catch (err) { toast.error(err instanceof Error ? err.message : 'AI could not prepare undertakings.') }
    finally { setDrafting(false) }
  }
  // General uses the manufacturer skill (how the firm works + the General fields); IS / Other rewrite or draft plainly.
  const suggestLines = (text: string, existing: string[], count: number) =>
    aiUndertakingLines({ row, title: other ? documentTitle || title : title, text, existing, count, ...(usesAi ? {} : { general: { ...general, isNumber: isLabel } }) })

  return <>
    <Dialog open={open} onOpenChange={(next) => { if (!busy) onOpenChange(next) }}>
      <DialogContent persistOnFocusLoss layer="stacked" aria-describedby={undefined} className={cn(limsDialogClass, 'flex h-[88vh] w-[min(80rem,calc(100vw_-_var(--app-dialog-overlay-left,0px)_-_2rem))] min-w-0 max-w-none flex-col gap-0 p-0')}>
        <DialogHeader className="shrink-0 bg-gradient-to-br from-stone-800 via-stone-900 to-stone-950 py-3 pl-4 pr-12 text-left"><DialogTitle className="text-base text-white">{title}{isLabel ? ` · ${isLabel}` : ''}</DialogTitle></DialogHeader>
        <div className="min-h-0 flex-1 space-y-4 overflow-auto bg-[#fffcf7] p-4">
          {loading ? <p className="text-sm text-stone-500">Loading Undertaking…</p> : loadError ? <p role="alert" className="text-sm text-red-700">{loadError}</p> : usesAi ? <>
            {other ? <div className="flex items-stretch border border-stone-300 bg-white"><label htmlFor="undertaking-other-title" className="flex w-48 shrink-0 items-center border-r border-stone-300 bg-[#f3eee6] px-3 text-sm font-semibold text-stone-800">Undertaking Title <span className="ml-0.5 text-red-600">*</span></label><div className="flex-1 p-1.5"><Input id="undertaking-other-title" aria-label="Undertaking Title" className="h-8 rounded-none border-stone-400 bg-white text-sm" value={documentTitle} disabled={busy} onChange={(event) => setDocumentTitle(event.target.value)} /></div></div> : null}
            <UndertakingLinesTable lines={lines} onChange={setLines} disabled={busy || drafting} onImport={() => setImportOpen(true)} onAiLines={suggestLines} onAiHeader={other ? () => setAiOpen(true) : () => void draftFromStandard()} aiHeaderBusy={drafting} onSource={() => setSourceOpen(true)} sourceCount={sources.count} />
          </> : <UndertakingGeneralFields value={general} onChange={setGeneral} isNumber={isLabel} disabled={busy} onImport={() => setImportOpen(true)} onAiLines={suggestLines} />}
        </div>
        <DialogFooter className="shrink-0 flex-wrap gap-2 border-t border-stone-300 bg-stone-50 p-3"><Button type="button" variant="outline" className="rounded-none" disabled={busy} onClick={() => onOpenChange(false)}>Close</Button><Button type="button" className={cn(limsPrimaryBtnClass, 'min-w-[7rem]')} disabled={busy || loading || !!loadError} onClick={() => void save()}>{busy ? <LoaderCircle className="mr-2 h-4 w-4 animate-spin" /> : <Check className="mr-2 h-4 w-4" />}Save</Button></DialogFooter>
      </DialogContent>
    </Dialog>
    {usesAi ? <UndertakingSourcePicker open={sourceOpen} onOpenChange={setSourceOpen} state={sources} heading={other ? 'IS Code Master, Application & Client Documents' : 'Indian Standard & Product Manual (IS Code Master)'} /> : null}
    {other ? <UndertakingAiDialog open={aiOpen} onOpenChange={setAiOpen} row={row} lines={lines} sources={sources} onSelectSource={() => setSourceOpen(true)} onAdd={(added, aiTitle) => {
      const existing = new Set(lines.map((line) => line.text?.trim().toLowerCase()))
      const fresh = added.filter((line) => !existing.has(line.text?.trim().toLowerCase()))
      setLines([...lines, ...fresh])
      if (other && aiTitle && (!documentTitle.trim() || documentTitle === 'Undertaking Other if Required')) setDocumentTitle(aiTitle)
      toast.success(`Added ${fresh.length} AI line${fresh.length === 1 ? '' : 's'} — review, then Save.`)
    }} /> : null}
    <BisModuleImportDialog open={importOpen} onOpenChange={setImportOpen} targetRow={row} kind={kind} onPickSource={importFrom} />
  </>
}
