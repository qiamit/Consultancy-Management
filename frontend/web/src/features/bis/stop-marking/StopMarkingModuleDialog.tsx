import { useCallback, useEffect, useRef, useState } from 'react'
import { Check, ChevronLeft, ChevronRight, ExternalLink, FileDown, LoaderCircle, Mail, Plus, Printer, Sparkles, Trash2, X } from 'lucide-react'
import { toast } from 'sonner'
import { LimsDatePicker } from '@/components/lims/LimsDatePicker'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { limsDarkBarBtnClass, limsDarkBarGlowStyle, limsPageShellClass, limsPanelClass, limsPrimaryBtnClass } from '@/lib/limsThemeUi'
import { cn } from '@/lib/utils'
import { fetchBisModulePayload } from '../projects/bisModuleDataApi'
import { factoryTestReportHasContent, parseFactoryTestReportPayload } from '../projects/factoryTestReportModel'
import { FactoryTestReportGenerateDialog } from '../projects/FactoryTestReportGenerateDialog'
import { emptyOslSampleRequirementRow, type OslSampleRequirementRow } from '../projects/oslSampleRequirementsModel'
import { formatCmL } from '../projects/types'
import { draftStopMarkingReply, readStopMarkingReport } from './stopMarkingAi'
import {
  closeStopMarkingCase,
  downloadStopMarkingReport,
  formatBisApiError,
  openStopMarkingReport,
  saveStopMarkingCase,
  saveStopMarkingFtrSamples,
  uploadStopMarkingReport,
} from './stopMarkingApi'
import { openStopMarkingManak } from './stopMarkingManak'
import { downloadStopMarkingReplyWord, emailStopMarkingReplyToClient, printStopMarkingReply } from './printStopMarkingReply'
import { AutoGrowTextarea } from '../shared/AutoGrowTextarea'
import { StopMarkingLetterPicker } from './StopMarkingLetterPicker'
import { noticeHoldsMarking, noticeTypeLabel, rowToCaseForm, stopMarkingClientName, stopMarkingIsCodeLabel, stopMarkingStatusLabel, type StopMarkingCaseForm, type StopMarkingRow } from './types'

const STEPS = ['BIS Letter & Review', 'Reply to BIS', 'Factory Test Report', 'Submission'] as const
const label = 'block text-[11px] font-semibold uppercase tracking-wide text-stone-600'
const tbtn = 'h-8 gap-1.5 rounded-none border-stone-400 px-2.5 text-xs'
const shortDate = (iso: string | null | undefined) => (iso ? iso.slice(0, 10).split('-').reverse().join('/') : '—')

/**
 * The Stop Marking module for one case — laid out like the Inclusion / Renewal modules: a stepper
 * (BIS letter & review → reply → Factory Test Report → submission) with Back / Next.
 */
export function StopMarkingModuleDialog({
  row,
  onOpenChange,
  onUpdated,
  onClosedCase,
}: {
  row: StopMarkingRow | null
  onOpenChange: (open: boolean) => void
  onUpdated: (row: StopMarkingRow) => void
  onClosedCase: () => void
}) {
  const [form, setForm] = useState<StopMarkingCaseForm | null>(null)
  const [step, setStep] = useState(0)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [ftrDone, setFtrDone] = useState<Set<string>>(() => new Set())
  const [generateId, setGenerateId] = useState<string | null>(null)
  const [draftSample, setDraftSample] = useState({ gradeTypeVariety: '', batchNumber: '', dateOfManufacturing: '', declaredValue: '' })

  useEffect(() => {
    setForm(row ? rowToCaseForm(row) : null)
    setStep(0)
    setError(null)
  }, [row?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const projectId = row?.bis_project_id ?? null
  const samples = row?.ftr_samples ?? []

  /** Which samples already have a saved Factory Test Report (the generator saves them on the licence). */
  const loadFtrStatus = useCallback(async () => {
    if (!projectId) return
    try {
      const payload = parseFactoryTestReportPayload(await fetchBisModulePayload(projectId, 'factory-test-report'))
      setFtrDone(new Set(payload.reports.filter((r) => factoryTestReportHasContent(r)).map((r) => r.sampleRowId)))
    } catch {
      /* status is informational */
    }
  }, [projectId])
  useEffect(() => {
    void loadFtrStatus()
  }, [loadFtrStatus, row?.id])

  /** Reads the stored PDF letter with AI and fills reference, due date, non-conformity and points. */
  const readStored = async () => {
    if (!row?.report_path) return
    setBusy('read')
    setError(null)
    try {
      const file = await downloadStopMarkingReport(row.report_path, row.report_name ?? 'letter.pdf')
      const reading = await readStopMarkingReport(row, file)
      setForm((f) => f && { ...f, bisReference: reading.reference || f.bisReference, bisReason: reading.reason || f.bisReason, bisDeadline: reading.deadline || f.bisDeadline, reviewNotes: reading.points || f.reviewNotes })
      toast.success('Letter read — check the details.')
    } catch (err) {
      setError(formatBisApiError(err))
    } finally {
      setBusy(null)
    }
  }

  // A PDF letter with nothing filled yet is read automatically, once per case, when the module opens.
  const autoRead = useRef<string | null>(null)
  useEffect(() => {
    if (!row || !form || autoRead.current === row.id) return
    if (row.status === 'closed' || !row.report_path || !/\.pdf$/i.test(row.report_name ?? '')) return
    if (form.bisReference || form.bisReason || form.reviewNotes || form.bisDeadline) return
    autoRead.current = row.id
    void readStored()
  }, [row?.id, row?.report_path, form !== null]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!row || !form) return null
  const closed = row.status === 'closed'
  const set = <K extends keyof StopMarkingCaseForm>(key: K, value: StopMarkingCaseForm[K]) => setForm({ ...form, [key]: value })
  const run = async (key: string, fn: () => Promise<void>) => {
    setBusy(key)
    setError(null)
    try {
      await fn()
    } catch (err) {
      setError(formatBisApiError(err))
    } finally {
      setBusy(null)
    }
  }
  const live = (): StopMarkingRow => ({ ...row, stop_date: form.stopDate, bis_reference: form.bisReference, reply_draft: form.replyDraft, reply_date: form.replyDate || null })
  const save = async (nextStatus?: string) => {
    const updated = await saveStopMarkingCase(row.id, { ...form, status: nextStatus ?? form.status })
    onUpdated(updated)
    if (nextStatus) setForm((f) => f && { ...f, status: nextStatus })
    return updated
  }
  const go = (next: number) => {
    if (closed) return setStep(next)
    void run('nav', async () => {
      await save()
      setStep(next)
    })
  }
  const applyReading = (r: { reference: string; reason: string; deadline: string; points: string }) =>
    setForm((f) => f && { ...f, bisReference: r.reference || f.bisReference, bisReason: r.reason || f.bisReason, bisDeadline: r.deadline || f.bisDeadline, reviewNotes: r.points || f.reviewNotes })
  const readLetter = (file: File, current: StopMarkingRow) =>
    run('read', async () => {
      applyReading(await readStopMarkingReport(current, file))
      toast.success('Letter read — check the details.')
    })

  const addSample = () => {
    if (!draftSample.gradeTypeVariety.trim()) return setError('Enter the Grade / Type / Variety of the sample.')
    const next: OslSampleRequirementRow = { ...emptyOslSampleRequirementRow('osl'), id: crypto.randomUUID(), ...draftSample, includeInPrint: true }
    void run('samples', async () => {
      onUpdated(await saveStopMarkingFtrSamples(row.id, [...samples, next]))
      setDraftSample({ gradeTypeVariety: '', batchNumber: '', dateOfManufacturing: '', declaredValue: '' })
    })
  }
  const removeSample = (id: string) =>
    void run('samples', async () => {
      onUpdated(await saveStopMarkingFtrSamples(row.id, samples.filter((s) => s.id !== id)))
    })

  const hasReply = form.replyDraft.trim().length > 0
  const ftrCount = samples.filter((s) => ftrDone.has(s.id)).length
  const checks: Array<[string, boolean, string]> = [
    ['BIS Letter Received', Boolean(row.report_path), row.report_name || 'Not Attached'],
    ['Reason and Points Reviewed', Boolean(form.bisReason.trim() || form.reviewNotes.trim()), form.bisReference || 'Not Entered'],
    ['Reply Letter Ready', hasReply, hasReply ? 'Drafted' : 'Not Drafted'],
    ['Factory Test Report', samples.length > 0 && ftrCount === samples.length, samples.length ? `${ftrCount} of ${samples.length} Generated` : 'None Added (Optional)'],
  ]

  return (
    <>
      <Dialog open onOpenChange={onOpenChange}>
        <DialogContent
          persistOnFocusLoss
          showCloseButton={false}
          aria-describedby={undefined}
          onInteractOutside={(e) => e.preventDefault()}
          className={cn(
            '!flex z-50 h-[100dvh] max-h-[100dvh] translate-x-0 translate-y-0 flex-col gap-0 overflow-hidden rounded-none border-0 bg-stone-100 p-0 shadow-none sm:rounded-none',
            'left-[var(--app-dialog-overlay-left,0px)] top-0 right-0',
            'w-[calc(100vw-var(--app-dialog-overlay-left,0px))] max-w-none',
            'border-stone-600 ring-1 ring-amber-700/20',
          )}
        >
          <div className={cn(limsPageShellClass, 'flex h-full min-h-0 flex-col overflow-hidden !space-y-0 gap-2 p-2 sm:gap-3 sm:p-3 md:p-4')}>
            {/* Header */}
            <div className={cn(limsPanelClass, 'shrink-0')}>
              <div className="relative overflow-hidden bg-gradient-to-br from-stone-800 via-stone-900 to-stone-950 px-2 py-2 text-white sm:px-4 sm:py-2.5 md:px-5">
                <div className="pointer-events-none absolute inset-0 opacity-[0.18]" style={limsDarkBarGlowStyle} />
                <div className="absolute bottom-0 left-0 h-[2px] w-full bg-gradient-to-r from-amber-500 via-amber-300 to-transparent" />
                <div className="relative flex min-w-0 items-center gap-2.5">
                  <DialogHeader className="min-w-0 flex-1 space-y-0 text-left">
                    <DialogTitle className="line-clamp-2 break-words text-sm font-semibold leading-snug text-stone-100 sm:text-base md:text-lg">
                      {noticeTypeLabel(row.case_type)} — {stopMarkingClientName(row) || 'Licence'}
                    </DialogTitle>
                    <p className="line-clamp-2 break-words text-xs text-stone-300">
                      {[stopMarkingIsCodeLabel(row), formatCmL(row.cm_l_digits), stopMarkingStatusLabel(row.status)].filter(Boolean).join(' · ')}
                    </p>
                  </DialogHeader>
                  <Button type="button" variant="outline" size="sm" className={cn(limsDarkBarBtnClass, 'h-8 shrink-0 gap-1.5 px-2.5')} onClick={() => onOpenChange(false)} title="Close">
                    <X className="h-4 w-4" aria-hidden />
                    <span className="hidden sm:inline">Close</span>
                  </Button>
                </div>
              </div>
            </div>

            {/* Stepper */}
            <div className={cn(limsPanelClass, 'shrink-0 bg-[#f7f3eb] px-2 py-1.5 font-jakarta sm:px-4')}>
              <ol className="flex items-center gap-1">
                {STEPS.map((name, i) => {
                  const done = i < step
                  const current = i === step
                  return (
                    <li key={name} className="relative flex min-w-[2.25rem] flex-1 flex-col items-center sm:min-w-[2.5rem]">
                      {i > 0 ? <span aria-hidden className={cn('absolute left-[-50%] top-1/2 h-0.5 w-full -translate-y-1/2', i <= step ? 'bg-amber-600' : 'bg-stone-300')} /> : null}
                      <button
                        type="button"
                        onClick={() => go(i)}
                        aria-current={current ? 'step' : undefined}
                        aria-label={`Step ${i + 1}: ${name}`}
                        title={name}
                        className={cn(
                          'relative z-[1] flex h-8 w-8 items-center justify-center rounded-full border-2 text-xs font-bold transition-colors',
                          current ? 'border-amber-700 bg-amber-600 text-white ring-2 ring-amber-400/50' : done ? 'border-amber-700 bg-amber-700 text-white' : 'border-stone-300 bg-white text-stone-600 hover:border-amber-600',
                        )}
                      >
                        {done ? <Check className="h-4 w-4" aria-hidden /> : i + 1}
                      </button>
                    </li>
                  )
                })}
              </ol>
            </div>

            {/* Step body */}
            <div className={cn(limsPanelClass, 'flex min-h-0 flex-1 flex-col bg-[#f7f3eb]')}>
              <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-3 sm:p-4">
                <div className="mx-auto max-w-4xl space-y-4">
                  <div className="border-b border-stone-300 pb-1 text-[11px] font-bold uppercase tracking-[0.14em] text-amber-800">
                    Step {step + 1} of {STEPS.length} — {STEPS[step]}
                  </div>
                  {error ? <p className="border-l-2 border-destructive bg-destructive/5 px-3 py-2 text-sm text-destructive">{error}</p> : null}

                  {step === 0 ? (
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <Label className={label}>BIS Letter Received</Label>
                        <StopMarkingLetterPicker
                          inline
                          storedName={row.report_name}
                          busy={busy === 'upload'}
                          disabled={closed}
                          onPick={(file) =>
                            void run('upload', async () => {
                              const updated = await uploadStopMarkingReport(row.id, file)
                              onUpdated(updated)
                              toast.success('BIS letter uploaded.')
                              if (file.name.toLowerCase().endsWith('.pdf')) await readLetter(file, updated)
                            })
                          }
                          onOpen={row.report_path ? () => void run('open', () => openStopMarkingReport(row.report_path!)) : undefined}
                          extra={
                            <Button
                              type="button"
                              variant="outline"
                              className="h-full gap-1.5 rounded-none border-amber-600 bg-amber-50 px-2.5 text-xs font-semibold text-amber-900 hover:bg-amber-100"
                              disabled={!row.report_path || busy !== null || closed}
                              title="Read the Letter with AI and Fill the Details Below"
                              onClick={() => void readStored()}
                            >
                              {busy === 'read' ? <LoaderCircle size={14} className="animate-spin" /> : <Sparkles size={14} />} {busy === 'read' ? 'Reading…' : 'Read Letter with AI'}
                            </Button>
                          }
                        />
                      </div>
                      <div className="grid gap-4 md:grid-cols-2">
                        <div className="space-y-2">
                          <Label className={label} htmlFor="smk-m-ref">BIS Letter / Reference No. &amp; Date</Label>
                          <Input id="smk-m-ref" disabled={closed} value={form.bisReference} onChange={(e) => set('bisReference', e.target.value)} />
                        </div>
                        <div className="space-y-2">
                          <Label className={label}>Reply Due By</Label>
                          <LimsDatePicker className="h-8 w-full" aria-label="Reply due by" disabled={closed} value={form.bisDeadline} onChange={(v) => set('bisDeadline', v)} />
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Label className={label} htmlFor="smk-m-reason">Non-Conformity as Stated by BIS</Label>
                        <AutoGrowTextarea id="smk-m-reason" disabled={closed} className="rounded-none border-stone-500 bg-white" value={form.bisReason} onChange={(e) => set('bisReason', e.target.value)} />
                      </div>
                      <div className="space-y-2">
                        <Label className={label} htmlFor="smk-m-points">Points Raised by BIS / Review Notes</Label>
                        <AutoGrowTextarea id="smk-m-points" disabled={closed} className="rounded-none border-stone-500 bg-white" value={form.reviewNotes} onChange={(e) => set('reviewNotes', e.target.value)} />
                      </div>
                      {!closed && form.status === 'open' ? (
                        <Button type="button" variant="outline" className={tbtn} disabled={busy !== null} onClick={() => void run('save', async () => { await save('reviewed'); toast.success('Marked as reviewed.') })}>
                          Mark Letter as Reviewed
                        </Button>
                      ) : null}
                    </div>
                  ) : null}

                  {step === 1 ? (
                    <div className="space-y-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          className={tbtn}
                          disabled={busy !== null || closed}
                          onClick={() =>
                            void run('draft', async () => {
                              set('replyDraft', await draftStopMarkingReply(row, { reference: form.bisReference, reason: form.bisReason, deadline: form.bisDeadline, reviewNotes: form.reviewNotes, currentDraft: form.replyDraft }))
                              toast.success('Reply drafted — edit it, then save.')
                            })
                          }
                        >
                          {busy === 'draft' ? <LoaderCircle size={14} className="animate-spin" /> : <Sparkles size={14} />}
                          {hasReply ? 'Improve Reply with AI' : 'Draft Reply with AI'}
                        </Button>
                        <div className="sm:ml-auto sm:w-48">
                          <LimsDatePicker className="h-8 w-full" aria-label="Reply Date" disabled={closed} placeholder="Reply Date" value={form.replyDate} onChange={(v) => set('replyDate', v)} />
                        </div>
                      </div>
                      <Textarea
                        aria-label="Reply Letter to BIS"
                        rows={16}
                        disabled={closed}
                        className="rounded-none border-stone-500 bg-white font-serif text-sm leading-relaxed"
                        placeholder="Reply Letter to BIS — Draft It with AI or Type It Here."
                        value={form.replyDraft}
                        onChange={(e) => set('replyDraft', e.target.value)}
                      />
                      <div className="flex flex-wrap items-center gap-1.5">
                        <Button type="button" variant="outline" className={tbtn} disabled={!hasReply || busy !== null} onClick={() => void run('print', async () => { const m = await printStopMarkingReply(live()); if (m) setError(m) })}>
                          <Printer size={14} /> Print / PDF
                        </Button>
                        <Button type="button" variant="outline" className={tbtn} disabled={!hasReply || busy !== null} onClick={() => void run('word', () => downloadStopMarkingReplyWord(live()))}>
                          <FileDown size={14} /> Word
                        </Button>
                        <Button type="button" variant="outline" className={tbtn} disabled={!hasReply || busy !== null} title="Email the Letter to the Client's Master Email" onClick={() => void run('mail', async () => { toast.success(await emailStopMarkingReplyToClient(live())) })}>
                          {busy === 'mail' ? <LoaderCircle size={14} className="animate-spin" /> : <Mail size={14} />} Email Client
                        </Button>
                      </div>
                    </div>
                  ) : null}

                  {step === 2 ? (
                    <div className="space-y-3">
                      <p className="text-sm text-stone-700">
                        Add the Sample(s) BIS Tested or Asked About, Then Generate the Factory Test Report for Each — the Same Generator as the Application Module (Parameters, Save, Print, PDF).
                      </p>
                      {!projectId ? <p className="text-sm text-destructive">This Case Is Not Linked to a Licence, so a Factory Test Report Cannot Be Generated.</p> : null}
                      <div className="grid gap-2 border border-stone-400 bg-white p-3 sm:grid-cols-2 lg:grid-cols-[2fr_1fr_1fr_1fr_auto] lg:items-end">
                        <div className="space-y-1">
                          <Label className={label}>Grade / Type / Variety</Label>
                          <Input disabled={closed || !projectId} value={draftSample.gradeTypeVariety} onChange={(e) => setDraftSample({ ...draftSample, gradeTypeVariety: e.target.value })} />
                        </div>
                        <div className="space-y-1">
                          <Label className={label}>Batch Number</Label>
                          <Input disabled={closed || !projectId} value={draftSample.batchNumber} onChange={(e) => setDraftSample({ ...draftSample, batchNumber: e.target.value })} />
                        </div>
                        <div className="space-y-1">
                          <Label className={label}>Date of Manufacturing</Label>
                          <LimsDatePicker className="h-8 w-full" aria-label="Date of manufacturing" disabled={closed || !projectId} value={draftSample.dateOfManufacturing} onChange={(v) => setDraftSample({ ...draftSample, dateOfManufacturing: v })} />
                        </div>
                        <div className="space-y-1">
                          <Label className={label}>Declared Value</Label>
                          <Input disabled={closed || !projectId} value={draftSample.declaredValue} onChange={(e) => setDraftSample({ ...draftSample, declaredValue: e.target.value })} />
                        </div>
                        <Button type="button" className={cn(limsPrimaryBtnClass, 'h-8 gap-1.5')} disabled={closed || !projectId || busy !== null} onClick={addSample}>
                          <Plus size={14} /> Add Sample
                        </Button>
                      </div>
                      {samples.length === 0 ? (
                        <p className="border border-dashed border-stone-400 bg-white px-3 py-6 text-center text-sm text-muted-foreground">No Samples Yet. A Factory Test Report Is Optional — Add a Sample Only if BIS Asked for One.</p>
                      ) : (
                        <ul className="space-y-2">
                          {samples.map((s, i) => (
                            <li key={s.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 border border-stone-300 bg-white px-3 py-2">
                              <span className="w-6 text-sm font-bold text-amber-800">{i + 1}</span>
                              <div className="min-w-0 flex-1 basis-56">
                                <p className="break-words text-sm font-semibold text-stone-900">{s.gradeTypeVariety}</p>
                                <p className="text-xs text-stone-600">
                                  Batch {s.batchNumber || '—'} · Mfg {shortDate(s.dateOfManufacturing)} · Declared {s.declaredValue || '—'}
                                </p>
                              </div>
                              <span className={cn('inline-flex rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset', ftrDone.has(s.id) ? 'bg-emerald-50 text-emerald-800 ring-emerald-200' : 'bg-stone-100 text-stone-700 ring-stone-300')}>
                                {ftrDone.has(s.id) ? 'Report Generated' : 'Not Generated'}
                              </span>
                              <div className="flex items-center gap-1.5">
                                <Button type="button" variant="outline" className={tbtn} disabled={!projectId || busy !== null} onClick={() => setGenerateId(s.id)}>
                                  {ftrDone.has(s.id) ? 'Edit Report' : 'Generate Report'}
                                </Button>
                                <Button type="button" variant="outline" size="icon" className="h-8 w-8 rounded-none border-stone-400 text-red-700" aria-label={`Remove Sample ${i + 1}`} disabled={closed || busy !== null} onClick={() => removeSample(s.id)}>
                                  <Trash2 size={14} />
                                </Button>
                              </div>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  ) : null}

                  {step === 3 ? (
                    <div className="space-y-4">
                      <ul className="divide-y divide-stone-200 border border-stone-300 bg-white">
                        {checks.map(([name, ok, detail]) => (
                          <li key={name} className="flex items-center gap-3 px-3 py-2 text-sm">
                            <span className={cn('flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-white', ok ? 'border-emerald-700 bg-emerald-600' : 'border-stone-300 bg-white')}>{ok ? <Check size={12} aria-hidden /> : null}</span>
                            <span className="font-medium text-stone-800">{name}</span>
                            <span className="ml-auto min-w-0 truncate text-xs text-stone-600">{detail}</span>
                          </li>
                        ))}
                      </ul>
                      <div className="flex flex-wrap items-center gap-2">
                        <Button type="button" variant="outline" className={tbtn} disabled={!hasReply || busy !== null} onClick={() => void run('print', async () => { const m = await printStopMarkingReply(live()); if (m) setError(m) })}>
                          <Printer size={14} /> Print Reply
                        </Button>
                        <Button type="button" variant="outline" className={tbtn} disabled={busy !== null} title="Open Manak eBIS (login ready); the reply text is copied for pasting" onClick={() => void run('manak', () => openStopMarkingManak({ ...row, reply_draft: form.replyDraft }))}>
                          <ExternalLink size={14} /> Manak Assist
                        </Button>
                        {!closed && form.status !== 'replied' ? (
                          <Button type="button" variant="outline" className={tbtn} disabled={!hasReply || busy !== null} onClick={() => void run('save', async () => { await save('replied'); toast.success('Marked as reply sent.') })}>
                            Mark Reply Sent
                          </Button>
                        ) : null}
                      </div>
                      {!closed ? (
                        <div className="border border-emerald-300 bg-emerald-50/60 p-3">
                          <p className="mb-2 text-sm text-stone-800">{noticeHoldsMarking(row.case_type) ? 'When BIS Permits Marking Again, Close the Case: the Licence Goes Back to Its Earlier Status.' : 'When BIS Accepts the Reply and the Matter Is Settled, Close the Case.'}</p>
                          <Button
                            type="button"
                            variant="outline"
                            className="h-8 rounded-none border-emerald-700 text-emerald-800 hover:bg-emerald-50"
                            disabled={busy !== null}
                            onClick={() => {
                              if (!window.confirm(noticeHoldsMarking(row.case_type) ? 'Marking resumed? This closes the case and puts the licence back to its earlier status.' : 'Close this case?')) return
                              void run('close', async () => {
                                await save()
                                await closeStopMarkingCase(row)
                                toast.success(noticeHoldsMarking(row.case_type) ? 'Case closed — licence status restored.' : 'Case closed.')
                                onClosedCase()
                              })
                            }}
                          >
                            {busy === 'close' ? 'Closing…' : noticeHoldsMarking(row.case_type) ? 'Marking Resumed — Close Case' : 'Close Case'}
                          </Button>
                        </div>
                      ) : (
                        <p className="text-sm text-stone-700">This case is closed ({row.closed_at ? shortDate(row.closed_at) : ''}).</p>
                      )}
                    </div>
                  ) : null}
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className={cn(limsPanelClass, 'shrink-0')}>
              <div className="relative overflow-hidden bg-gradient-to-br from-stone-800 via-stone-900 to-stone-950 px-3 py-2 text-white sm:px-4">
                <div className="pointer-events-none absolute inset-0 opacity-[0.18]" style={limsDarkBarGlowStyle} />
                <div className="absolute top-0 left-0 h-[2px] w-full bg-gradient-to-r from-amber-500 via-amber-300 to-transparent" />
                <div className="relative flex min-w-0 flex-wrap items-center justify-between gap-2">
                  <Button type="button" variant="outline" size="sm" className={cn(limsDarkBarBtnClass, 'h-8 gap-1 px-3')} onClick={() => go(Math.max(0, step - 1))} disabled={step === 0 || busy !== null}>
                    <ChevronLeft size={16} aria-hidden /> Back
                  </Button>
                  <span className="order-last w-full text-center text-xs font-medium text-stone-300 sm:order-none sm:w-auto">Step {step + 1} of {STEPS.length}</span>
                  <div className="flex items-center gap-2">
                    {!closed ? (
                      <Button type="button" size="sm" className={cn(limsPrimaryBtnClass, 'h-8 px-3')} disabled={busy !== null} onClick={() => void run('save', async () => { await save(); toast.success('Saved.') })}>
                        {busy === 'save' ? 'Saving…' : 'Save'}
                      </Button>
                    ) : null}
                    {step < STEPS.length - 1 ? (
                      <Button type="button" variant="outline" size="sm" className={cn(limsDarkBarBtnClass, 'h-8 gap-1 px-3')} onClick={() => go(step + 1)} disabled={busy !== null}>
                        Next <ChevronRight size={16} aria-hidden />
                      </Button>
                    ) : null}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
      <FactoryTestReportGenerateDialog
        projectId={projectId}
        sample={generateId ? samples.find((s) => s.id === generateId) ?? null : null}
        samples={samples}
        isCodeId={row.is_code_id}
        isCodeLabel={stopMarkingIsCodeLabel(row)}
        onClose={() => setGenerateId(null)}
        onSaved={() => void loadFtrStatus()}
      />
    </>
  )
}
