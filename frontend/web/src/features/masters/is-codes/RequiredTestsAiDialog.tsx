import { useCallback, useEffect, useRef, useState } from 'react'
import { AlertTriangle, CheckCircle2, Circle, FileText, Loader2, Mic, MicOff, Plus, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { useVoiceInput } from '@/features/bis/shared/useVoiceInput'
import { limsDarkBarGlowStyle, limsDialogClass, limsFieldClass, limsOutlineBtnClass, limsPrimaryBtnClass } from '@/lib/limsThemeUi'
import { cn } from '@/lib/utils'
import type { RequiredTest } from './requiredTestsApi'
import { previewAiSources, suggestRequiredTests, type AiStageEvent, type AiStageId } from './requiredTestsAi'

/*
 * "Suggest With AI" window (owner, 25 Nov 2026): instructions (typed or spoken), the sources the AI reads, what it is
 * doing step by step, and the tests it found, ticked to add to the Required Tests list.
 */

const STAGES: Array<{ id: AiStageId; label: string }> = [
  { id: 'find', label: 'Finding the Standard in the Standards Index' },
  { id: 'read', label: 'Reading the Product Manual and the Standard' },
  { id: 'methods', label: 'Finding the Method Standards' },
  { id: 'ai', label: 'AI Is Listing the Required Tests' },
]

type StageState = { status: 'waiting' | 'running' | 'done' | 'failed'; detail?: string }
const freshStages = (): Record<AiStageId, StageState> => ({
  find: { status: 'waiting' },
  read: { status: 'waiting' },
  methods: { status: 'waiting' },
  ai: { status: 'waiting' },
})

/** A spoken command at the end of the instructions: "Generate" / "जनरेट करो" starts, "Add" / "ऐड करो" adds. */
const GENERATE_WORDS = /(?:^|\s+)(?:generate|जनरेट|start|शुरू)(?:\s*(?:karo|kar do|करो|कर दो|करें|please))?\s*[.!।]?\s*$/i
const ADD_WORDS = /(?:^|\s+)(?:add|ऐड|जोड़)(?:\s*(?:karo|kar do|करो|कर दो|करें|please))?\s*[.!।]?\s*$/i

const fileName = (relpath: string) => relpath.split('/').pop() ?? relpath

export function RequiredTestsAiDialog({
  open,
  onOpenChange,
  isCodeId,
  isLabel,
  existingKey,
  onAdd,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  isCodeId: string | null
  isLabel: string
  /** Is a test (by its key) already in the list? Those rows are shown but not ticked. */
  existingKey: (t: RequiredTest) => boolean
  onAdd: (tests: RequiredTest[], sources: string[], model?: string) => void
}) {
  const [instructions, setInstructions] = useState('')
  const [voiceLang, setVoiceLang] = useState<'hi-IN' | 'en-IN'>('hi-IN')
  const [running, setRunning] = useState(false)
  const [stages, setStages] = useState(freshStages)
  const [error, setError] = useState<string | null>(null)
  const [docsFor, setDocsFor] = useState<{
    id: string
    docs: { folders: string[]; standards: string[]; manuals: string[]; failed?: boolean }
  } | null>(null)
  const docs = docsFor && docsFor.id === isCodeId ? docsFor.docs : null
  const docsLoading = open && Boolean(isCodeId) && !docs
  const [result, setResult] = useState<{ tests: RequiredTest[]; sources: string[]; model?: string } | null>(null)
  const [picked, setPicked] = useState<Set<number>>(() => new Set())
  /** A voice command heard at the end of the instructions runs once per Speak (`firedRef`). */
  const firedRef = useRef(false)
  const actionsRef = useRef<{ generate: (text: string) => void; add: () => void; stop: () => void }>({
    generate: () => {},
    add: () => {},
    stop: () => {},
  })
  const hasResultRef = useRef(false)
  useEffect(() => {
    hasResultRef.current = Boolean(result?.tests.length)
  }, [result])

  // What the AI will read: this IS Code's own Standard and Product Manual in the standards index.
  useEffect(() => {
    if (!open || !isCodeId) return
    let live = true
    const id = isCodeId
    previewAiSources(id)
      .then((d) => live && setDocsFor({ id, docs: d }))
      .catch(() => live && setDocsFor({ id, docs: { folders: [], standards: [], manuals: [], failed: true } }))
    return () => {
      live = false
    }
  }, [open, isCodeId])

  const generate = async (text = instructions) => {
    if (!isCodeId || running) return
    setRunning(true)
    setError(null)
    setResult(null)
    setPicked(new Set())
    setStages(freshStages())
    let current: AiStageId | null = null
    try {
      const out = await suggestRequiredTests({
        isCodeId,
        isLabel,
        description: text,
        onStage: (e: AiStageEvent) => {
          current = e.status === 'running' ? e.id : current
          setStages((prev) => ({ ...prev, [e.id]: { status: e.status, detail: e.detail } }))
        },
      })
      setResult(out)
      setPicked(new Set(out.tests.map((t, i) => (existingKey(t) ? -1 : i)).filter((i) => i >= 0)))
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'AI Suggestion Failed.'
      setError(msg)
      const failed: AiStageId = current ?? 'find'
      setStages((prev) => ({ ...prev, [failed]: { status: 'failed', detail: msg } }))
    } finally {
      setRunning(false)
    }
  }

  const addPicked = () => {
    if (!result) return
    const tests = result.tests.filter((_, i) => picked.has(i))
    if (!tests.length) return
    onAdd(tests, result.sources, result.model)
    onOpenChange(false)
  }

  // Voice: the words go into the instructions. "Generate" at the end starts; "Add" adds the ticked tests once there
  // are results (before that, "… add karo" is part of the instructions).
  const onVoiceText = useCallback((text: string) => {
    const kind = GENERATE_WORDS.test(text) ? 'generate' : hasResultRef.current && ADD_WORDS.test(text) ? 'add' : null
    if (!kind) {
      setInstructions(text)
      return
    }
    setInstructions(text.replace(kind === 'generate' ? GENERATE_WORDS : ADD_WORDS, '').trim())
    if (firedRef.current) return
    firedRef.current = true
    const stripped = text.replace(kind === 'generate' ? GENERATE_WORDS : ADD_WORDS, '').trim()
    // After this update: stop listening, then press the button the command names.
    window.setTimeout(() => {
      actionsRef.current.stop()
      if (kind === 'generate') actionsRef.current.generate(stripped)
      else actionsRef.current.add()
    }, 0)
  }, [])
  const voice = useVoiceInput(onVoiceText, voiceLang)
  const startVoice = () => {
    firedRef.current = false
    voice.start(instructions)
  }

  useEffect(() => {
    actionsRef.current = { generate: (text) => void generate(text), add: addPicked, stop: voice.stop }
  })

  const { listening: voiceListening, stop: stopVoice } = voice
  useEffect(() => {
    if (!open && voiceListening) stopVoice()
  }, [open, voiceListening, stopVoice])

  const pickedCount = picked.size
  const allNew = result ? result.tests.map((t, i) => (existingKey(t) ? -1 : i)).filter((i) => i >= 0) : []

  return (
    <Dialog open={open} onOpenChange={(next) => !running && onOpenChange(next)}>
      <DialogContent
        persistOnFocusLoss
        layer="above"
        aria-describedby={undefined}
        className={cn(limsDialogClass, 'w-[min(72rem,calc(100vw-1.5rem))] max-w-none [&>button]:text-white')}
      >
        <div className="relative shrink-0 overflow-hidden bg-gradient-to-br from-stone-800 via-stone-900 to-stone-950 px-4 py-2.5 text-white">
          <div className="pointer-events-none absolute inset-0 opacity-[0.18]" style={limsDarkBarGlowStyle} />
          <DialogHeader className="relative pr-10 text-left">
            <DialogTitle className="flex items-center gap-2 truncate text-base font-semibold tracking-tight text-white">
              <Sparkles size={16} aria-hidden /> Suggest Tests With AI{isLabel ? ` — ${isLabel}` : ''}
            </DialogTitle>
          </DialogHeader>
        </div>

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto bg-gradient-to-b from-stone-100/80 to-white px-4 py-3">
          {/* Instructions */}
          <section className="space-y-1.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label htmlFor="rt-ai-instructions" className="text-[11px] font-semibold uppercase tracking-wide text-stone-600">
                Instructions for the AI (Optional)
              </label>
              <div className="flex items-center gap-1.5">
                <select
                  className={cn(limsFieldClass, 'h-8 min-h-8 w-auto px-2 text-xs')}
                  value={voiceLang}
                  aria-label="Voice Language"
                  disabled={voice.listening}
                  onChange={(e) => setVoiceLang(e.target.value as 'hi-IN' | 'en-IN')}
                >
                  <option value="hi-IN">Voice: हिंदी</option>
                  <option value="en-IN">Voice: English</option>
                </select>
                <Button
                  type="button"
                  variant="outline"
                  className={cn(limsOutlineBtnClass, 'h-8 min-h-8 gap-1.5 px-3 text-xs', voice.listening && 'border-red-500 text-red-700')}
                  disabled={!voice.supported || running}
                  title={voice.supported ? (voice.listening ? 'Stop Listening' : 'Speak the Instructions') : 'Voice Is Not Supported in This Browser'}
                  onClick={() => (voice.listening ? voice.stop() : startVoice())}
                >
                  {voice.listening ? <MicOff size={14} aria-hidden /> : <Mic size={14} aria-hidden />}
                  {voice.listening ? 'Stop' : 'Speak'}
                </Button>
              </div>
            </div>
            <Textarea
              id="rt-ai-instructions"
              rows={3}
              className={cn(limsFieldClass, 'min-h-[4.5rem] resize-y text-sm')}
              placeholder="E.g. Use the Limits of Grade E 250; Include Bend Test; Leave Out Marking. Hindi or English."
              value={instructions}
              disabled={running}
              onChange={(e) => setInstructions(e.target.value)}
            />
            <p className="text-[11px] text-stone-500">
              {voice.listening
                ? 'Listening… Say "Generate" at the End to Start, or "Add" to Add the Ticked Tests.'
                : 'Click Speak to Give the Instructions by Voice. Say "Generate" to Start, "Add" to Add the Ticked Tests.'}
              {voice.error ? <span className="ml-1 text-red-700">{voice.error}</span> : null}
            </p>
          </section>

          <div className="grid gap-3 lg:grid-cols-2">
            {/* What the AI is doing */}
            <section className="space-y-1.5 border border-stone-300 bg-white p-2.5">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-stone-600">What the AI Is Doing</p>
              <ol className="space-y-1.5">
                {STAGES.map((s) => {
                  const st = stages[s.id]
                  return (
                    <li key={s.id} className="flex items-start gap-2 text-xs">
                      <span className="mt-0.5 shrink-0">
                        {st.status === 'running' ? (
                          <Loader2 size={14} className="animate-spin text-amber-700" aria-label="Working" />
                        ) : st.status === 'done' ? (
                          <CheckCircle2 size={14} className="text-emerald-700" aria-label="Done" />
                        ) : st.status === 'failed' ? (
                          <AlertTriangle size={14} className="text-red-700" aria-label="Failed" />
                        ) : (
                          <Circle size={14} className="text-stone-400" aria-label="Waiting" />
                        )}
                      </span>
                      <span className="min-w-0">
                        <span className={cn('font-medium', st.status === 'waiting' ? 'text-stone-500' : 'text-stone-900')}>{s.label}</span>
                        {st.detail ? (
                          <span className={cn('block break-words text-[11px]', st.status === 'failed' ? 'text-red-700' : 'text-stone-600')}>
                            {st.detail}
                          </span>
                        ) : null}
                      </span>
                    </li>
                  )
                })}
              </ol>
            </section>

            {/* Sources */}
            <section className="space-y-1.5 border border-stone-300 bg-white p-2.5">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-stone-600">Sources</p>
              {docsLoading ? (
                <p className="text-xs text-stone-500">Looking Up the Standards Index…</p>
              ) : docs?.failed ? (
                <p className="text-xs text-stone-600">Could Not Look Up the Standards Index Just Now. Generate Tests Will Still Try.</p>
              ) : docs && !docs.folders.length ? (
                <p className="text-xs text-red-700">
                  This IS Code Is Not in the Standards Library Yet. Add Its PDF to the Oracle Database Folder and Run Standards Sync.
                </p>
              ) : docs ? (
                <ul className="space-y-1 text-xs">
                  {docs.standards.map((d) => (
                    <li key={`s-${d}`} className="flex items-start gap-1.5">
                      <FileText size={13} className="mt-0.5 shrink-0 text-stone-500" aria-hidden />
                      <span className="min-w-0 break-words">
                        <span className="font-semibold text-stone-700">Standard:</span> {fileName(d)}
                      </span>
                    </li>
                  ))}
                  {docs.manuals.map((d) => (
                    <li key={`m-${d}`} className="flex items-start gap-1.5">
                      <FileText size={13} className="mt-0.5 shrink-0 text-stone-500" aria-hidden />
                      <span className="min-w-0 break-words">
                        <span className="font-semibold text-stone-700">Product Manual:</span> {fileName(d)}
                      </span>
                    </li>
                  ))}
                  {!docs.standards.length && !docs.manuals.length ? (
                    <li className="text-stone-600">Folder: {docs.folders.join(', ')}</li>
                  ) : null}
                </ul>
              ) : null}
              {result?.sources.length ? (
                <details className="text-[11px] text-stone-600">
                  <summary className="cursor-pointer font-semibold">Pages the AI Read ({result.sources.length})</summary>
                  <p className="mt-1 leading-relaxed">{result.sources.join('; ')}</p>
                </details>
              ) : null}
            </section>
          </div>

          {error ? <p className="border-l-2 border-red-600 bg-red-50 px-3 py-1.5 text-xs text-red-900">{error}</p> : null}

          {/* The tests found */}
          {result ? (
            <section className="space-y-1.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-stone-600">
                  Tests Found ({result.tests.length}){result.model ? ` · ${result.model}` : ''}
                </p>
                <label className="inline-flex items-center gap-1.5 text-xs text-stone-700">
                  <input
                    type="checkbox"
                    className="h-4 w-4 accent-amber-700"
                    checked={allNew.length > 0 && allNew.every((i) => picked.has(i))}
                    disabled={!allNew.length}
                    onChange={(e) => setPicked(e.target.checked ? new Set(allNew) : new Set())}
                  />
                  Tick All New
                </label>
              </div>
              <div className="overflow-x-auto border border-stone-400 bg-white">
                <table className="w-full min-w-[52rem] border-collapse text-xs">
                  <thead className="bg-stone-800 text-[11px] uppercase tracking-wide text-stone-100">
                    <tr>
                      <th className="w-8 px-2 py-1.5" />
                      <th className="px-2 py-1.5 text-left">Test Name</th>
                      <th className="w-28 px-2 py-1.5 text-center">Clause</th>
                      <th className="w-40 px-2 py-1.5 text-center">Test Method</th>
                      <th className="w-20 px-2 py-1.5 text-center">Unit</th>
                      <th className="px-2 py-1.5 text-center">Requirement</th>
                      <th className="w-20 px-2 py-1.5 text-center">PT in a Day</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.tests.map((t, i) => {
                      const inList = existingKey(t)
                      return (
                        <tr key={`${t.testName}-${i}`} className={cn('border-t border-stone-200 align-middle', inList && 'text-stone-500')}>
                          <td className="px-2 py-1 text-center">
                            <input
                              type="checkbox"
                              className="h-4 w-4 accent-amber-700"
                              aria-label={`Add ${t.testName}`}
                              disabled={inList}
                              checked={picked.has(i)}
                              onChange={(e) =>
                                setPicked((prev) => {
                                  const next = new Set(prev)
                                  if (e.target.checked) next.add(i)
                                  else next.delete(i)
                                  return next
                                })
                              }
                            />
                          </td>
                          <td className="px-2 py-1 text-left">
                            {t.testName}
                            {inList ? <span className="ml-1.5 text-[10px] font-semibold uppercase text-stone-500">Already in List</span> : null}
                          </td>
                          <td className="px-2 py-1 text-center">{t.clause}</td>
                          <td className="px-2 py-1 text-center">{t.testMethod}</td>
                          <td className="px-2 py-1 text-center">{t.unit}</td>
                          <td className="px-2 py-1 text-center">{t.requirement}</td>
                          <td className="px-2 py-1 text-center">{t.possibleInADay ? 'Yes' : ''}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          ) : null}
        </div>

        <DialogFooter className="shrink-0 gap-2 border-t border-stone-300 bg-stone-100 px-4 py-3 sm:justify-between">
          <Button
            type="button"
            className={cn(limsPrimaryBtnClass, 'gap-1.5')}
            disabled={running || !isCodeId || (docs !== null && !docs.failed && !docs.folders.length)}
            onClick={() => void generate()}
          >
            {running ? <Loader2 size={14} className="animate-spin" aria-hidden /> : <Sparkles size={14} aria-hidden />}
            {running ? 'Generating…' : result ? 'Generate Again' : 'Generate Tests'}
          </Button>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" className={limsOutlineBtnClass} disabled={running} onClick={() => onOpenChange(false)}>
              Close
            </Button>
            <Button type="button" className={cn(limsPrimaryBtnClass, 'gap-1.5')} disabled={running || !pickedCount} onClick={addPicked}>
              <Plus size={14} aria-hidden /> {pickedCount ? `Add ${pickedCount} ${pickedCount === 1 ? 'Test' : 'Tests'} to the List` : 'Add Tests to the List'}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
