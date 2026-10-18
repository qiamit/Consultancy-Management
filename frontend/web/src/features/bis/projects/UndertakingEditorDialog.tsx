import { useEffect, useState } from 'react'
import { Eye, LoaderCircle, Sparkles, Upload } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { limsDialogClass, limsPrimaryBtnClass } from '@/lib/limsThemeUi'
import { loadBisPrintData } from '../print/loadBisPrintData'
import { buildBisDocumentHtml } from '../print/printBisDocument'
import { fetchBisModulePayload, saveBisModulePayload } from './bisModuleDataApi'
import { BisDocumentPrintPreviewDialog } from './BisDocumentPrintPreviewDialog'
import { loadUndertakingSources, downloadUndertakingSource, type UndertakingSource } from './undertakingSources'
import { Input } from '@/components/ui/input'
import { emptyUndertakingGeneralPayload, parseUndertakingGeneralPayload } from './undertakingPayloadModels'
import { parseUndertakingLines, resolvedUndertakingLine, type UndertakingLine } from './undertakingLines'
import { undertakingGeneralDefaultPoints } from '../print/undertakingGeneralHtml'
import { UndertakingGeneralFields } from './UndertakingGeneralFields'
import { UndertakingLinesTable } from './UndertakingLinesTable'
import { draftUndertakingLines } from './undertakingAi'
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
  const [preview, setPreview] = useState<string | null>(null)
  const [masterFiles, setMasterFiles] = useState<UndertakingSource[]>([])
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set())
  const [localFiles, setLocalFiles] = useState<File[]>([])
  const [sourceError, setSourceError] = useState('')
  const [sourceLoading, setSourceLoading] = useState(kind !== 'undertaking-general')
  const [guidance, setGuidance] = useState('')
  const [aiLines, setAiLines] = useState<UndertakingLine[]>([])
  const [aiNotes, setAiNotes] = useState('')
  const other = kind === 'undertaking-other'
  const usesAi = kind !== 'undertaking-general'
  const title = other ? 'Undertaking Other if Required' : usesAi ? 'Undertaking as per Indian Standards' : 'Undertaking for General'
  const [documentTitle, setDocumentTitle] = useState('Undertaking Other if Required')
  const [aiTitle, setAiTitle] = useState('')

  useEffect(() => {
    if (!open) return
    let active = true
    void Promise.all([fetchBisModulePayload(row.id, kind), loadBisPrintData(row)])
      .then(([saved, data]) => {
        if (!active) return
        setRaw(saved ?? {})
        setGeneral(parseUndertakingGeneralPayload(saved))
        setLines(parseUndertakingLines(saved?.lines) ?? [])
        setGuidance(String(saved?.guidance ?? ''))
        setAiNotes(String(saved?.aiNotes ?? ''))
        setDocumentTitle(String(saved?.documentTitle ?? '').trim() || 'Undertaking Other if Required')
        setIsLabel(data.isCode.label)
      })
      .catch((err: unknown) => { if (active) setLoadError(err instanceof Error ? err.message : 'Could not load undertaking details.') })
      .finally(() => { if (active) setLoading(false) })
    if (usesAi) void loadUndertakingSources(row, other).then((data) => {
      if (!active) return
      setMasterFiles(data.files)
      setSourceError(data.error)
      setSelectedFiles(new Set(data.files.filter((file) => other || /manual|standard|specification|IS Document/i.test(`${file.documentKind} ${file.fileName}`)).map((file) => file.id)))
    }).catch((err: unknown) => { if (active) setSourceError(err instanceof Error ? err.message : 'Could not load source PDFs.') }).finally(() => { if (active) setSourceLoading(false) })
    return () => { active = false }
  }, [open, kind, usesAi, other, row])

  const payload = () => usesAi ? { ...raw, lines, guidance, aiNotes, ...(other ? { documentTitle } : {}) } : { ...raw, ...general }
  const prepare = async (save: boolean) => {
    if (usesAi && (!lines.length || lines.some((line) => !line.text?.trim()))) { toast.error('Add the undertaking text for every line before saving or previewing.'); return }
    if (!usesAi && general.lines !== null) {
      const defaults = undertakingGeneralDefaultPoints({ ...general, isNumber: isLabel })
      if (!general.lines.length || general.lines.some((line) => !resolvedUndertakingLine(line, defaults).trim())) { toast.error('Enter text for each line, or delete unused blank lines.'); return }
    }
    if (other && !documentTitle.trim()) { toast.error('Enter the Undertaking Title.'); return }
    setBusy(true)
    try {
      const next = payload()
      const html = await buildBisDocumentHtml(row, kind, { modulePayload: next })
      if (save) { await saveBisModulePayload(row.id, kind, next); setRaw(next); toast.success(`${title} saved.`) }
      setPreview(html)
    } catch (err) { toast.error(err instanceof Error ? err.message : 'Could not prepare undertaking.') }
    finally { setBusy(false) }
  }
  const generate = async () => {
    setBusy(true)
    try {
      const downloads = await Promise.all(masterFiles.filter((file) => selectedFiles.has(file.id)).map(downloadUndertakingSource))
      const result = await draftUndertakingLines(row, [...downloads, ...localFiles], guidance, lines, other ? 'other' : 'indian-standards')
      setAiLines(result.lines)
      setAiNotes(result.notes)
      setAiTitle(result.title)
      toast.success(`${result.lines.length} AI draft lines prepared for review.`)
    } catch (err) { toast.error(err instanceof Error ? err.message : 'AI could not prepare undertaking lines.') }
    finally { setBusy(false) }
  }

  return <>
    <Dialog open={open} onOpenChange={(next) => { if (!busy) onOpenChange(next) }}>
      <DialogContent persistOnFocusLoss layer="stacked" aria-describedby={undefined} className={cn(limsDialogClass, 'flex h-[88vh] w-[min(80rem,calc(100vw_-_var(--app-dialog-overlay-left,0px)_-_2rem))] min-w-0 max-w-none flex-col gap-0 p-0')}>
        <DialogHeader className="shrink-0 bg-gradient-to-br from-stone-800 via-stone-900 to-stone-950 py-3 pl-4 pr-12 text-left"><DialogTitle className="text-base text-white">{title}{isLabel ? ` · ${isLabel}` : ''}</DialogTitle></DialogHeader>
        <div className="min-h-0 flex-1 space-y-4 overflow-auto bg-[#fffcf7] p-4">
          {loading ? <p className="text-sm text-stone-500">Loading Undertaking…</p> : loadError ? <p role="alert" className="text-sm text-red-700">{loadError}</p> : usesAi ? <>
            {other ? <label className="grid gap-1 text-sm font-semibold">Undertaking Title<Input aria-label="Undertaking Title" value={documentTitle} disabled={busy} onChange={(event) => setDocumentTitle(event.target.value)} /></label> : null}
            <section className="space-y-3 border border-stone-300 bg-white p-3"><h3 className="text-sm font-semibold">{other ? 'AI Sources — Application, Indian Standard & Product Manual PDFs' : 'AI Sources — Indian Standard & Product Manual'}</h3>
              {sourceError ? <p role="alert" className="text-sm text-amber-800">{sourceError}</p> : null}
              <div className="max-h-48 space-y-2 overflow-auto">{masterFiles.map((file) => <label key={file.id} className="flex items-center gap-2 text-sm"><input type="checkbox" disabled={busy} checked={selectedFiles.has(file.id)} onChange={(event) => setSelectedFiles((previous) => { const next = new Set(previous); if (event.target.checked) next.add(file.id); else next.delete(file.id); return next })} />{file.fileName} <span className="text-xs text-stone-500">{file.documentKind}</span></label>)}</div>
              {masterFiles.length ? <p className="text-xs text-stone-600">{selectedFiles.size} of {masterFiles.length} stored PDFs selected</p> : null}
              {sourceLoading ? <p className="text-xs text-stone-600">Loading Source PDFs…</p> : !masterFiles.length ? <p className="text-xs text-stone-600">No stored source PDFs found. Attach any relevant PDFs below.</p> : null}
              <label className={cn('inline-flex cursor-pointer items-center gap-2 border border-stone-400 px-2 py-1.5 text-xs text-amber-800', busy && 'pointer-events-none opacity-50')}><Upload size={14} />Attach Source PDFs<input type="file" multiple accept="application/pdf,.pdf" className="sr-only" disabled={busy} onChange={(event) => { setLocalFiles(Array.from(event.target.files ?? [])); event.target.value = '' }} /></label>
              {localFiles.length ? <p className="text-xs text-stone-600">{localFiles.map((file) => file.name).join(', ')}</p> : null}
              <p className="text-xs text-stone-500">AI also reads this application's saved module data. Drafts include source/clause references for review.</p>
              <textarea aria-label="AI Drafting Instructions" placeholder={other ? 'Describe the undertaking to prepare from this application and its PDFs…' : 'Additional instructions, including manufacturer–purchaser agreement requirements…'} className="min-h-16 w-full rounded-none border border-stone-300 p-2 text-sm" disabled={busy} value={guidance} onChange={(event) => setGuidance(event.target.value)} />
              <Button type="button" variant="outline" className="rounded-none text-amber-800" disabled={busy || (other ? !guidance.trim() : !selectedFiles.size && !localFiles.length)} onClick={() => void generate()}>{busy ? <LoaderCircle className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles size={16} className="mr-2" />}Draft Lines with AI</Button>
              {aiNotes ? <p className="whitespace-pre-wrap text-sm text-stone-700">{aiNotes}</p> : null}
            </section>
            {aiLines.length ? <section className="space-y-3 border border-amber-400 bg-amber-50 p-3"><h3 className="text-sm font-semibold">AI Draft — Review Before Adding{other && aiTitle ? ` · ${aiTitle}` : ''}</h3><UndertakingLinesTable lines={aiLines} onChange={setAiLines} references disabled={busy} /><Button type="button" variant="outline" disabled={busy} onClick={() => { const existing = new Set(lines.map((line) => line.text?.trim().toLowerCase())); setLines([...lines, ...aiLines.filter((line) => !existing.has(line.text?.trim().toLowerCase()))]); setAiLines([]); if (other && aiTitle) setDocumentTitle(aiTitle) }}>Add AI Lines to Undertaking</Button></section> : null}
            <UndertakingLinesTable lines={lines} onChange={setLines} references={!other} disabled={busy} />
          </> : <UndertakingGeneralFields value={general} onChange={setGeneral} isNumber={isLabel} disabled={busy} />}
        </div>
        <DialogFooter className="shrink-0 flex-wrap gap-2 border-t border-stone-300 bg-stone-50 p-3"><Button type="button" variant="outline" className="rounded-none" disabled={busy} onClick={() => onOpenChange(false)}>Close</Button><Button type="button" variant="outline" className="rounded-none" disabled={busy || loading || !!loadError} onClick={() => void prepare(false)}><Eye size={15} className="mr-2" />Preview</Button><Button type="button" className={limsPrimaryBtnClass} disabled={busy || loading || !!loadError} onClick={() => void prepare(true)}>Save &amp; Preview</Button></DialogFooter>
      </DialogContent>
    </Dialog>
    <BisDocumentPrintPreviewDialog open={open && preview !== null} onOpenChange={(next) => { if (!next) setPreview(null) }} row={row} kind={kind} generatedHtml={preview} />
  </>
}
