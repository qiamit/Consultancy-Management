import { useEffect, useRef, useState } from 'react'
import { Check, ChevronLeft, ChevronRight, ExternalLink, Eye, FileDown, LoaderCircle, Mail, Paperclip, Printer, Sparkles, Trash2, Upload, X } from 'lucide-react'
import { toast } from 'sonner'
import { LimsDatePicker } from '@/components/lims/LimsDatePicker'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { limsDarkBarBtnClass, limsDarkBarGlowStyle, limsPageShellClass, limsPanelClass, limsPrimaryBtnClass } from '@/lib/limsThemeUi'
import { cn } from '@/lib/utils'
import { fetchBisProjectById } from '../projects/bisProjectsApi'
import { factoryTestReportHasContent, parseFactoryTestReportPayload } from '../projects/factoryTestReportModel'
import { oslSampleRowHasContent, parseOslSampleRequirementsPayload } from '../projects/oslSampleRequirementsModel'
import { formatCmL, type BisProjectRow } from '../projects/types'
import { draftStopMarkingReply, readStopMarkingReport, readStopMarkingTestReport } from './stopMarkingAi'
import {
  addStopMarkingDocument,
  closeStopMarkingCase,
  downloadStopMarkingReport,
  formatBisApiError,
  openStopMarkingReport,
  removeStopMarkingDocument,
  removeStopMarkingTestReport,
  addStopMarkingTestReports,
  saveStopMarkingCase,
  uploadStopMarkingReport,
} from './stopMarkingApi'
import { openStopMarkingManak } from './stopMarkingManak'
import { downloadStopMarkingReplyWord, emailStopMarkingReplyToClient, printStopMarkingReply } from './printStopMarkingReply'
import { AutoGrowTextarea } from '../shared/AutoGrowTextarea'
import { StopMarkingTestReportModule } from './StopMarkingTestReportModule'
import { StopMarkingLetterPicker } from './StopMarkingLetterPicker'
import { findingsToText, noticeHoldsMarking, noticeTypeLabel, rowToCaseForm, stopMarkingClientName, stopMarkingIsCodeLabel, stopMarkingStatusLabel, type StopMarkingCaseForm, type StopMarkingRow } from './types'

const STEPS = ['BIS Letter & Review', 'Test Report Review', 'Factory Test Report', 'Reply to BIS', 'Documents & Submission'] as const
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
  const [bisRow, setBisRow] = useState<BisProjectRow | null>(null)
  const [docLabel, setDocLabel] = useState('')

  useEffect(() => {
    setForm(row ? rowToCaseForm(row) : null)
    setStep(0)
    setError(null)
  }, [row?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const projectId = row?.bis_project_id ?? null
  const caseOsl = parseOslSampleRequirementsPayload(row?.test_report_module?.osl ?? null)
  const samples = caseOsl.rows.filter(oslSampleRowHasContent)
  const ftrReports = parseFactoryTestReportPayload(row?.test_report_module?.ftr ?? null).reports
  const ftrCount = samples.filter((s) => ftrReports.some((r) => r.sampleRowId === s.id && factoryTestReportHasContent(r))).length

  /** The licence, only to read the firm / IS Code / letterhead details for the printed documents. */
  useEffect(() => {
    if (!projectId) {
      setBisRow(null)
      return
    }
    let canceled = false
    void fetchBisProjectById(projectId)
      .then((p) => { if (!canceled) setBisRow(p) })
      .catch(() => { /* informational */ })
    return () => { canceled = true }
  }, [projectId])

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

  /** Test reports: read the PDFs (fresh or stored) and put the summary in the findings. */
  const readTestReports = async (current: StopMarkingRow, files: File[]) => {
    setBusy('treport-read')
    setError(null)
    try {
      const r = await readStopMarkingTestReport(current, files)
      setForm((f) => f && {
        ...f,
        reportFindings: r.findings,
        reportObservations: r.observations,
        sampleCode: r.sampleCode || f.sampleCode,
        sampleQrCode: r.qrCode || f.sampleQrCode,
        reportDetails: {
          ...f.reportDetails,
          batchNumber: r.batchNumber || f.reportDetails.batchNumber,
          manufactureDate: r.manufactureDate || f.reportDetails.manufactureDate,
          description: r.description || f.reportDetails.description,
          declaredValue: r.declaredValue || f.reportDetails.declaredValue,
        },
      })
      toast.success(r.standardsUsed.length ? 'Test Reports Read and Checked Against the Standard — Review the Details.' : 'Test Reports Read — No Standard Attached to Check Against.')
    } catch (err) {
      setError(formatBisApiError(err))
    } finally {
      setBusy(null)
    }
  }
  const readStoredTestReports = async () => {
    const docs = (row?.test_reports ?? []).filter((d) => /\.pdf$/i.test(d.name))
    if (!row || !docs.length) return
    try {
      await readTestReports(row, await Promise.all(docs.map((d) => downloadStopMarkingReport(d.path, d.name))))
    } catch (err) {
      setError(formatBisApiError(err))
    }
  }
  if (!row || !form) return null
  const closed = row.status === 'closed'
  const setDetail = (key: keyof StopMarkingCaseForm['reportDetails'], value: string) => setForm({ ...form, reportDetails: { ...form.reportDetails, [key]: value } })
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

  const hasReply = form.replyDraft.trim().length > 0
  const checks: Array<[string, boolean, string]> = [
    ['BIS Letter Received', Boolean(row.report_path), row.report_name || 'Not Attached'],
    ['Reason and Points Reviewed', Boolean(form.bisReason.trim() || form.reviewNotes.trim()), form.bisReference || 'Not Entered'],
    ['Test Report Reviewed', form.reportFindings.length > 0, (row.test_reports ?? []).length ? `${(row.test_reports ?? []).length} Attached` : 'Not Attached'],
    ['Reply Letter Ready', hasReply, hasReply ? 'Drafted' : 'Not Drafted'],
    ['Factory Test Report', samples.length > 0 && ftrCount === samples.length, samples.length ? `${ftrCount} of ${samples.length} Generated` : 'None Added (Optional)'],
    ['Supporting Documents', (row.documents ?? []).length > 0, `${(row.documents ?? []).length} Uploaded`],
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
              <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-3">
                <div className="w-full space-y-4">
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

                  {step === 3 ? (
                    <div className="space-y-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          className={tbtn}
                          disabled={busy !== null || closed}
                          onClick={() =>
                            void run('draft', async () => {
                              set('replyDraft', await draftStopMarkingReply(row, { reference: form.bisReference, reason: form.bisReason, deadline: form.bisDeadline, reviewNotes: form.reviewNotes, reportFindings: [findingsToText(form.reportFindings), form.reportObservations && `Observations on Failed Parameters as per the Standard:\n${form.reportObservations}`].filter(Boolean).join('\n\n'), currentDraft: form.replyDraft }))
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

                  {step === 1 ? (
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <Label className={label}>Test Reports Received from BIS</Label>
                        <div className="flex h-9 items-center gap-2 border border-stone-400 bg-white pl-3 text-sm">
                          <Paperclip size={15} className="shrink-0 text-amber-800" aria-hidden />
                          <span className="min-w-0 flex-1 truncate text-stone-700">
                            {(row.test_reports ?? []).length ? `${(row.test_reports ?? []).length} Report${(row.test_reports ?? []).length > 1 ? 's' : ''} Attached` : 'No Report Attached'}
                          </span>
                          <div className="flex h-full shrink-0 items-stretch">
                            <label className="inline-flex h-full cursor-pointer items-center border border-stone-400 bg-white px-2.5 text-xs font-medium hover:bg-stone-100">
                              {busy === 'treport' ? 'Uploading…' : 'Attach Reports'}
                              <input
                                type="file"
                                multiple
                                className="sr-only"
                                accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/*"
                                disabled={closed || busy !== null}
                                onChange={(e) => {
                                  const files = Array.from(e.target.files ?? [])
                                  e.target.value = ''
                                  if (!files.length) return
                                  void run('treport', async () => {
                                    const updated = await addStopMarkingTestReports(row.id, row.test_reports ?? [], files)
                                    onUpdated(updated)
                                    toast.success('Test Reports Uploaded.')
                                    const pdfs = (updated.test_reports ?? []).filter((d) => /\.pdf$/i.test(d.name))
                                    if (pdfs.length) await readTestReports(updated, await Promise.all(pdfs.map((d) => downloadStopMarkingReport(d.path, d.name))))
                                  })
                                }}
                              />
                            </label>
                            <Button
                              type="button"
                              variant="outline"
                              className="h-full gap-1.5 rounded-none border-amber-600 bg-amber-50 px-2.5 text-xs font-semibold text-amber-900 hover:bg-amber-100"
                              disabled={!(row.test_reports ?? []).length || busy !== null || closed}
                              title="Read the Test Reports with AI and Summarise the Failed Parameters"
                              onClick={() => void readStoredTestReports()}
                            >
                              {busy === 'treport-read' ? <LoaderCircle size={14} className="animate-spin" /> : <Sparkles size={14} />} {busy === 'treport-read' ? 'Reading…' : 'Read Reports with AI'}
                            </Button>
                          </div>
                        </div>
                        {(row.test_reports ?? []).length ? (
                          <ul className="divide-y divide-stone-200 border border-stone-300 bg-white">
                            {(row.test_reports ?? []).map((d) => (
                              <li key={d.id} className="flex items-center gap-2 px-3 py-1.5 text-sm">
                                <Paperclip size={14} className="shrink-0 text-amber-800" aria-hidden />
                                <span className="min-w-0 flex-1 truncate" title={d.name}>{d.name}</span>
                                <Button type="button" variant="outline" size="icon" className="h-7 w-7 rounded-none border-stone-400" aria-label={`Open ${d.name}`} onClick={() => void run('open', () => openStopMarkingReport(d.path))}>
                                  <Eye size={13} />
                                </Button>
                                <Button type="button" variant="outline" size="icon" className="h-7 w-7 rounded-none border-stone-400 text-red-700" aria-label={`Remove ${d.name}`} disabled={closed || busy !== null} onClick={() => void run('treport', async () => { onUpdated(await removeStopMarkingTestReport(row.id, row.test_reports ?? [], d.id)) })}>
                                  <Trash2 size={13} />
                                </Button>
                              </li>
                            ))}
                          </ul>
                        ) : null}
                      </div>
                      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                        {([
                          ['Sample Code', form.sampleCode, (v: string) => set('sampleCode', v)],
                          ['QR Code', form.sampleQrCode, (v: string) => set('sampleQrCode', v)],
                          ['Batch Number', form.reportDetails.batchNumber, (v: string) => setDetail('batchNumber', v)],
                          ['Declared Value', form.reportDetails.declaredValue, (v: string) => setDetail('declaredValue', v)],
                        ] as const).map(([name, value, onChange]) => (
                          <div key={name} className="space-y-1">
                            <Label className={label}>{name}</Label>
                            <Input disabled={closed} className="h-9 rounded-none border-stone-500 bg-white" value={value} onChange={(e) => onChange(e.target.value)} />
                          </div>
                        ))}
                        <div className="space-y-1">
                          <Label className={label}>Date of Manufacturing</Label>
                          <LimsDatePicker className="h-9 w-full" aria-label="Date of manufacturing" disabled={closed} value={form.reportDetails.manufactureDate} onChange={(v) => setDetail('manufactureDate', v)} />
                        </div>
                      </div>
                      <div className="space-y-1">
                        <Label className={label} htmlFor="smk-m-desc">Sample Description</Label>
                        <AutoGrowTextarea id="smk-m-desc" disabled={closed} className="rounded-none border-stone-500 bg-white" value={form.reportDetails.description} onChange={(e) => setDetail('description', e.target.value)} />
                      </div>
                      <div className="space-y-2">
                        <Label className={label}>Test Report Findings (Failed Parameters)</Label>
                        <div className="border border-stone-400 bg-white">
                          <div className="hidden grid-cols-[2rem_2fr_1.3fr_1.3fr_1fr_2rem] gap-2 border-b border-stone-300 bg-stone-100 px-2 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-stone-600 sm:grid">
                            <span />
                            <span>Test Parameter</span>
                            <span>Specified Value</span>
                            <span>Observed Value</span>
                            <span>Remark</span>
                            <span />
                          </div>
                          {form.reportFindings.length ? (
                            form.reportFindings.map((f) => {
                              const edit = (patch: Partial<typeof f>) => set('reportFindings', form.reportFindings.map((x) => (x.id === f.id ? { ...x, ...patch } : x)))
                              const cell = 'h-8 rounded-none border-stone-400 px-2 text-sm'
                              return (
                                <div key={f.id} className="grid grid-cols-1 items-center gap-2 border-b border-stone-200 px-2 py-2 last:border-b-0 sm:grid-cols-[2rem_2fr_1.3fr_1.3fr_1fr_2rem]">
                                  <input type="checkbox" aria-label={`Select ${f.parameter || 'row'}`} className="h-4 w-4 accent-amber-700" checked={f.selected} disabled={closed} onChange={(e) => edit({ selected: e.target.checked })} />
                                  <Input aria-label="Test parameter" placeholder="Test Parameter" className={cell} disabled={closed} value={f.parameter} onChange={(e) => edit({ parameter: e.target.value })} />
                                  <Input aria-label="Specified value" placeholder="Specified Value" className={cell} disabled={closed} value={f.specified} onChange={(e) => edit({ specified: e.target.value })} />
                                  <Input aria-label="Observed value" placeholder="Observed Value" className={cell} disabled={closed} value={f.observed} onChange={(e) => edit({ observed: e.target.value })} />
                                  <Input aria-label="Remark" placeholder="Remark" className={cn(cell, /fail/i.test(f.remark) ? 'font-semibold text-red-700' : /pass/i.test(f.remark) ? 'text-emerald-800' : '')} disabled={closed} value={f.remark} onChange={(e) => edit({ remark: e.target.value })} />
                                  <Button type="button" variant="outline" size="icon" className="h-7 w-7 rounded-none border-stone-400 text-red-700" aria-label="Remove row" disabled={closed} onClick={() => set('reportFindings', form.reportFindings.filter((x) => x.id !== f.id))}>
                                    <Trash2 size={13} />
                                  </Button>
                                </div>
                              )
                            })
                          ) : (
                            <p className="px-3 py-4 text-center text-sm text-stone-500">No Failed Parameters Yet — Read the Reports with AI or Add a Row.</p>
                          )}
                          <div className="border-t border-stone-300 px-2 py-1.5">
                            <Button type="button" variant="outline" size="sm" className="h-7 rounded-none border-stone-400 text-xs" disabled={closed} onClick={() => set('reportFindings', [...form.reportFindings, { id: crypto.randomUUID(), selected: true, parameter: '', specified: '', observed: '', remark: '' }])}>
                              + Add Row
                            </Button>
                          </div>
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Label className={label} htmlFor="smk-m-obs">Observations as per the Standard</Label>
                        <AutoGrowTextarea id="smk-m-obs" disabled={closed} className="rounded-none border-stone-500 bg-white" value={form.reportObservations} onChange={(e) => set('reportObservations', e.target.value)} />
                      </div>
                    </div>
                  ) : null}

                  {step === 2 ? (
                    <div className="space-y-3">
                      {!projectId ? <p className="text-sm text-destructive">This Case Is Not Linked to a Licence, so the Documents Cannot Be Printed.</p> : null}
                      <StopMarkingTestReportModule row={row} form={form} bisRow={bisRow} closed={closed} onUpdated={onUpdated} />
                    </div>
                  ) : null}

                  {step === 4 ? (
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
                      <div className="space-y-2">
                        <Label className={label}>Upload Supporting Documents</Label>
                        <div className="flex flex-wrap items-center gap-2 border border-stone-400 bg-white p-2">
                          <Input
                            aria-label="Document Name"
                            className="h-8 min-w-0 flex-1 basis-48"
                            placeholder="Document Name (e.g. Corrective Action Report)"
                            value={docLabel}
                            disabled={closed}
                            onChange={(e) => setDocLabel(e.target.value)}
                          />
                          <label className="inline-flex h-8 cursor-pointer items-center gap-1.5 border border-stone-400 bg-white px-2.5 text-xs font-medium hover:bg-stone-100">
                            <Upload size={14} /> {busy === 'doc' ? 'Uploading…' : 'Attach and Upload'}
                            <input
                              type="file"
                              multiple
                              className="sr-only"
                              disabled={closed || busy !== null}
                              onChange={(e) => {
                                const files = Array.from(e.target.files ?? [])
                                e.target.value = ''
                                if (files.length) void run('doc', async () => { onUpdated(await addStopMarkingDocument(row.id, row.documents ?? [], docLabel, files)); setDocLabel(''); toast.success('Documents Uploaded.') })
                              }}
                            />
                          </label>
                        </div>
                        {(row.documents ?? []).length ? (
                          <ul className="divide-y divide-stone-200 border border-stone-300 bg-white">
                            {(row.documents ?? []).map((d) => (
                              <li key={d.id} className="flex items-center gap-2 px-3 py-1.5 text-sm">
                                <Paperclip size={14} className="shrink-0 text-amber-800" aria-hidden />
                                <span className="min-w-0 flex-1 truncate" title={d.name}>
                                  <span className="font-medium text-stone-800">{d.label}</span> <span className="text-xs text-stone-500">· {d.name}</span>
                                </span>
                                <Button type="button" variant="outline" size="icon" className="h-7 w-7 rounded-none border-stone-400" aria-label={`Open ${d.label}`} onClick={() => void run('open', () => openStopMarkingReport(d.path))}>
                                  <Eye size={13} />
                                </Button>
                                <Button type="button" variant="outline" size="icon" className="h-7 w-7 rounded-none border-stone-400 text-red-700" aria-label={`Remove ${d.label}`} disabled={closed || busy !== null} onClick={() => void run('doc', async () => { onUpdated(await removeStopMarkingDocument(row.id, row.documents ?? [], d.id)) })}>
                                  <Trash2 size={13} />
                                </Button>
                              </li>
                            ))}
                          </ul>
                        ) : null}
                      </div>
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
    </>
  )
}
