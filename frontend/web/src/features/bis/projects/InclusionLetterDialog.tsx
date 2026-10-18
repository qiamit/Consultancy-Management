import { useEffect, useState } from 'react'
import { Check, LoaderCircle, RotateCcw, Sparkles } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { limsDialogClass, limsPrimaryBtnClass } from '@/lib/limsThemeUi'
import { cn } from '@/lib/utils'
import { defaultInclusionLetterText, type InclusionLetterText } from '../print/inclusionRequestLetterHtml'
import { loadBisPrintData } from '../print/loadBisPrintData'
import { applicantContextFromPrintData } from '../print/printDocumentShared'
import { fetchBisModulePayload, saveBisModulePayload } from './bisModuleDataApi'
import { BisModuleImportDialog } from './BisModuleImportDialog'
import { INCLUSION_COMPONENTS_KIND, INCLUSION_DETAILS_KIND, inclusionRequired, isInclusionAddition } from './inclusionModel'
import { aiUndertakingLines } from './undertakingAi'
import { parseUndertakingLines, type UndertakingLine } from './undertakingLines'
import { UndertakingLinesTable } from './UndertakingLinesTable'
import { formatCmL, type BisProjectRow } from './types'

/* Inclusion Request Letter & Undertaking — wording editor, laid out like the Undertaking editors: label / value rows
   for the letter parts, the undertaking points in the same lines table (Import, AI, Edit / AI / Delete per line). */

type Rec = Record<string, unknown>

const TITLE = 'Inclusion Request Letter & Undertaking'
const str = (v: unknown) => (typeof v === 'string' ? v.trim() : v == null ? '' : String(v).trim())
const rowsOf = (p: Rec | null | undefined): Rec[] => (Array.isArray(p?.rows) ? (p?.rows as Rec[]) : [])
const areaCls = 'min-h-[2.25rem] w-full resize-y rounded-none border border-stone-400 bg-white px-2 py-1.5 text-sm leading-relaxed text-stone-800 focus:border-amber-600 focus:outline-none'
const aiBtn = 'h-8 w-8 shrink-0 rounded-none border border-stone-400 bg-white/70 p-0 text-amber-800 hover:border-amber-600 hover:bg-amber-50'

function FieldRow({ label, htmlFor, children, onAi, aiBusy }: { label: string; htmlFor: string; children: React.ReactNode; onAi?: () => void; aiBusy?: boolean }) {
  return (
    <div className="flex items-stretch border border-stone-300 bg-white">
      <label htmlFor={htmlFor} className="flex w-48 shrink-0 items-center border-r border-stone-300 bg-[#f3eee6] px-3 text-sm font-semibold text-stone-800">
        {label}
      </label>
      <div className="flex min-w-0 flex-1 items-start gap-1.5 p-1.5">
        <div className="min-w-0 flex-1">{children}</div>
        {onAi ? (
          <Button type="button" variant="ghost" className={aiBtn} title={`${label} — rewrite with AI`} aria-label={`Rewrite ${label} with AI`} disabled={aiBusy} onClick={onAi}>
            {aiBusy ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden /> : <Sparkles className="h-4 w-4" aria-hidden />}
          </Button>
        ) : null}
      </div>
    </div>
  )
}

export function InclusionLetterDialog({ row, open, onOpenChange, onSaved }: { row: BisProjectRow; open: boolean; onOpenChange: (open: boolean) => void; onSaved: () => void }) {
  const [defaults, setDefaults] = useState<InclusionLetterText | null>(null)
  const [date, setDate] = useState('')
  const [subject, setSubject] = useState('')
  const [intro, setIntro] = useState('')
  const [lines, setLines] = useState<UndertakingLine[] | null>(null)
  const [closing, setClosing] = useState('')
  const [enclosures, setEnclosures] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [aiField, setAiField] = useState<string | null>(null)
  const [importOpen, setImportOpen] = useState(false)

  useEffect(() => {
    if (!open) return
    let active = true
    setLoading(true)
    void Promise.all([
      fetchBisModulePayload(row.id, INCLUSION_DETAILS_KIND),
      fetchBisModulePayload(row.id, INCLUSION_COMPONENTS_KIND),
      fetchBisModulePayload(row.id, 'cmpf-305'),
      fetchBisModulePayload(row.id, 'cmpf-306'),
      loadBisPrintData(row),
    ])
      .then(([details, components, machinery, equipment, print]) => {
        if (!active) return
        const ctx = applicantContextFromPrintData(print)
        const d = defaultInclusionLetterText({
          licenceNo: row.cm_l_digits ? formatCmL(row.cm_l_digits) : '',
          isRef: [print.isCode.label, print.isCode.title].filter(Boolean).join(' — '),
          firm: ctx.applicantName,
          address: ctx.applicantAddress,
          machineryRequired: inclusionRequired(components, 'machinery', rowsOf(machinery).filter(isInclusionAddition).length),
          equipmentRequired: inclusionRequired(components, 'equipment', rowsOf(equipment).filter(isInclusionAddition).length),
        })
        const saved = details ?? {}
        setDefaults(d)
        setDate(str(saved.letterDate))
        setSubject(str(saved.letterSubject) || d.subject)
        setIntro(str(saved.letterIntro) || d.intro)
        setLines(parseUndertakingLines(saved.letterLines))
        setClosing(str(saved.letterClosing) || d.closing)
        setEnclosures(Array.isArray(saved.letterEnclosures) ? (saved.letterEnclosures as unknown[]).map(str).filter(Boolean).join('\n') : '')
      })
      .catch((err: unknown) => toast.error(err instanceof Error ? err.message : 'Could not load the letter.'))
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [open, row])

  const same = (a: string, b: string) => a.trim() === b.trim()
  const save = async () => {
    if (!defaults) return
    setBusy(true)
    try {
      const current = (await fetchBisModulePayload(row.id, INCLUSION_DETAILS_KIND)) ?? {}
      await saveBisModulePayload(row.id, INCLUSION_DETAILS_KIND, {
        ...current,
        letterDate: date.trim(),
        // Parts left at the standard wording are stored empty, so they keep following the steps (e.g. machinery required).
        letterSubject: same(subject, defaults.subject) ? '' : subject.trim(),
        letterIntro: same(intro, defaults.intro) ? '' : intro.trim(),
        letterLines: lines,
        letterClosing: same(closing, defaults.closing) ? '' : closing.trim(),
        letterEnclosures: enclosures.split('\n').map((v) => v.trim()).filter(Boolean),
      })
      toast.success(`${TITLE} saved.`)
      onSaved()
      onOpenChange(false)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not save the letter.')
    } finally {
      setBusy(false)
    }
  }

  const reset = () => {
    if (!defaults) return
    setSubject(defaults.subject)
    setIntro(defaults.intro)
    setLines(null)
    setClosing(defaults.closing)
    setEnclosures('')
  }

  /** Import the wording from another application's / licence's inclusion. */
  const importFrom = async (sourceProjectId: string) => {
    const source = await fetchBisModulePayload(sourceProjectId, INCLUSION_DETAILS_KIND)
    if (!source || !(source.letterSubject || source.letterIntro || source.letterLines || source.letterClosing)) {
      throw new Error('The selected licence has no edited inclusion letter.')
    }
    if (str(source.letterIntro)) setIntro(str(source.letterIntro))
    if (str(source.letterClosing)) setClosing(str(source.letterClosing))
    const imported = parseUndertakingLines(source.letterLines)
    if (imported?.length) setLines(imported.map((line) => ({ ...line, id: crypto.randomUUID() })))
    toast.success('Letter wording imported — review, then Save.')
  }

  const rewrite = async (field: 'intro' | 'closing', value: string, set: (v: string) => void) => {
    setAiField(field)
    try {
      const [text] = await aiUndertakingLines({ row, title: TITLE, text: value, existing: [], count: 1 })
      if (text) set(text)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'AI could not rewrite this part.')
    } finally {
      setAiField(null)
    }
  }

  const pointsDefaults = defaults?.points ?? []
  return (
    <>
      <Dialog open={open} onOpenChange={(next) => { if (!busy) onOpenChange(next) }}>
        <DialogContent persistOnFocusLoss layer="stacked" aria-describedby={undefined} className={cn(limsDialogClass, 'flex h-[88vh] w-[min(80rem,calc(100vw_-_var(--app-dialog-overlay-left,0px)_-_2rem))] min-w-0 max-w-none flex-col gap-0 p-0')}>
          <DialogHeader className="shrink-0 bg-gradient-to-br from-stone-800 via-stone-900 to-stone-950 py-3 pl-4 pr-12 text-left">
            <DialogTitle className="text-base text-white">{TITLE}{row.cm_l_digits ? ` · ${formatCmL(row.cm_l_digits)}` : ''}</DialogTitle>
          </DialogHeader>
          <div className="min-h-0 flex-1 space-y-3 overflow-auto bg-[#fffcf7] p-4">
            {loading || !defaults ? (
              <p className="text-sm text-stone-500">Loading letter…</p>
            ) : (
              <>
                <FieldRow label="Letter Date" htmlFor="inc-letter-date">
                  <Input id="inc-letter-date" className="h-8 w-56 rounded-none border-stone-400 bg-white text-sm" placeholder="DD/MM/YYYY (blank = today)" value={date} disabled={busy} onChange={(e) => setDate(e.target.value)} />
                </FieldRow>
                <FieldRow label="Subject" htmlFor="inc-letter-subject">
                  <textarea id="inc-letter-subject" className={areaCls} rows={2} value={subject} disabled={busy} onChange={(e) => setSubject(e.target.value)} />
                </FieldRow>
                <FieldRow label="Opening Paragraph" htmlFor="inc-letter-intro" onAi={() => void rewrite('intro', intro, setIntro)} aiBusy={aiField === 'intro'}>
                  <textarea id="inc-letter-intro" className={areaCls} rows={3} value={intro} disabled={busy} onChange={(e) => setIntro(e.target.value)} />
                </FieldRow>
                <UndertakingLinesTable
                  lines={lines}
                  defaults={pointsDefaults}
                  onChange={setLines}
                  disabled={busy}
                  onImport={() => setImportOpen(true)}
                  onAiLines={(text, existing, count) => aiUndertakingLines({ row, title: TITLE, text, existing, count })}
                />
                <FieldRow label="Closing Line" htmlFor="inc-letter-closing" onAi={() => void rewrite('closing', closing, setClosing)} aiBusy={aiField === 'closing'}>
                  <textarea id="inc-letter-closing" className={areaCls} rows={2} value={closing} disabled={busy} onChange={(e) => setClosing(e.target.value)} />
                </FieldRow>
                <FieldRow label="Additional Enclosures" htmlFor="inc-letter-enclosures">
                  <textarea
                    id="inc-letter-enclosures"
                    className={areaCls}
                    rows={3}
                    placeholder="One per line — added after the test reports, lists and uploaded documents"
                    value={enclosures}
                    disabled={busy}
                    onChange={(e) => setEnclosures(e.target.value)}
                  />
                </FieldRow>
              </>
            )}
          </div>
          <DialogFooter className="shrink-0 flex-wrap gap-2 border-t border-stone-300 bg-stone-50 p-3 sm:justify-between">
            <Button type="button" variant="outline" className="rounded-none" disabled={busy || loading} onClick={reset}>
              <RotateCcw className="mr-2 h-4 w-4" aria-hidden /> Standard Wording
            </Button>
            <div className="flex gap-2">
              <Button type="button" variant="outline" className="rounded-none" disabled={busy} onClick={() => onOpenChange(false)}>
                Close
              </Button>
              <Button type="button" className={cn(limsPrimaryBtnClass, 'min-w-[7rem]')} disabled={busy || loading} onClick={() => void save()}>
                {busy ? <LoaderCircle className="mr-2 h-4 w-4 animate-spin" /> : <Check className="mr-2 h-4 w-4" />}Save
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <BisModuleImportDialog open={importOpen} onOpenChange={setImportOpen} targetRow={row} kind={INCLUSION_DETAILS_KIND} onPickSource={importFrom} />
    </>
  )
}
