import { useEffect, useState } from 'react'
import { Eye, FileType, LoaderCircle, Mail, Printer, Sparkles } from 'lucide-react'
import { toast } from 'sonner'
import { LimsDatePicker } from '@/components/lims/LimsDatePicker'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { formatCmL } from '../projects/types'
import { BisFormDialog } from '../shared/BisFormDialog'
import { draftStopMarkingReply, readStopMarkingReport } from './stopMarkingAi'
import {
  clearStopMarkingReport,
  closeStopMarkingCase,
  downloadStopMarkingReport,
  formatBisApiError,
  openStopMarkingReport,
  saveStopMarkingCase,
  uploadStopMarkingReport,
} from './stopMarkingApi'
import { downloadStopMarkingReplyWord, emailStopMarkingReplyToClient, printStopMarkingReply } from './printStopMarkingReply'
import {
  STOP_MARKING_STATUS_OPTIONS,
  rowToCaseForm,
  stopMarkingClientName,
  stopMarkingIsCodeLabel,
  type StopMarkingCaseForm,
  type StopMarkingRow,
} from './types'

const section = 'col-span-12 border-b border-stone-300 pb-1 text-[11px] font-bold uppercase tracking-[0.14em] text-amber-800'
const tbtn = 'h-8 gap-1.5 rounded-none border-stone-400 px-2.5 text-xs'

/** One stop-marking case: licence, BIS report, review, AI reply, and marking resumed. */
export function StopMarkingCaseDialog({
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
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setForm(row ? rowToCaseForm(row) : null)
    setError(null)
  }, [row?.id]) // eslint-disable-line react-hooks/exhaustive-deps

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

  /** Current text on screen on top of the saved row, so print / Word / email use what the user sees. */
  const live = (): StopMarkingRow => ({
    ...row,
    stop_date: form.stopDate,
    bis_reference: form.bisReference,
    reply_draft: form.replyDraft,
    reply_date: form.replyDate || null,
  })

  const applyReading = (reading: { reference: string; reason: string; deadline: string; points: string }) =>
    setForm((f) =>
      f && {
        ...f,
        bisReference: reading.reference || f.bisReference,
        bisReason: reading.reason || f.bisReason,
        bisDeadline: reading.deadline || f.bisDeadline,
        reviewNotes: reading.points || f.reviewNotes,
      },
    )

  const readWithAi = (file: File, current: StopMarkingRow) =>
    run('read', async () => {
      applyReading(await readStopMarkingReport(current, file))
      toast.success('Report read — check the details below.')
    })

  const upload = (file: File) =>
    run('upload', async () => {
      const updated = await uploadStopMarkingReport(row.id, file)
      onUpdated(updated)
      toast.success('BIS report uploaded.')
      if (file.name.toLowerCase().endsWith('.pdf')) await readWithAi(file, updated)
    })

  const save = (nextStatus?: string) =>
    run('save', async () => {
      const updated = await saveStopMarkingCase(row.id, { ...form, status: nextStatus ?? form.status })
      onUpdated(updated)
      if (nextStatus) setForm((f) => f && { ...f, status: nextStatus })
      toast.success('Saved.')
    })

  const draft = () =>
    run('draft', async () => {
      const reply = await draftStopMarkingReply(row, {
        reference: form.bisReference,
        reason: form.bisReason,
        deadline: form.bisDeadline,
        reviewNotes: form.reviewNotes,
        currentDraft: form.replyDraft,
      })
      set('replyDraft', reply)
      toast.success('Reply drafted — edit it, then save.')
    })

  const closeCase = () => {
    if (!window.confirm('Marking resumed? This closes the case and puts the licence back to its earlier status.')) return
    void run('close', async () => {
      await saveStopMarkingCase(row.id, form)
      await closeStopMarkingCase(row)
      toast.success('Case closed — licence status restored.')
      onClosedCase()
    })
  }

  const hasReply = form.replyDraft.trim().length > 0

  return (
    <BisFormDialog
      open
      onOpenChange={onOpenChange}
      title={`Stop Marking — ${stopMarkingClientName(row) || 'Licence'}`}
      saveLabel="Save Case"
      canSave={!closed && busy === null}
      saving={busy === 'save'}
      errorMessage={error}
      onSave={() => void save()}
      footerExtra={
        closed ? null : (
          <Button type="button" variant="outline" className="h-8 rounded-none border-emerald-700 text-emerald-800 hover:bg-emerald-50" disabled={busy !== null} onClick={closeCase}>
            {busy === 'close' ? 'Closing…' : 'Marking Resumed — Close Case'}
          </Button>
        )
      }
    >
      <div className={section}>Licence</div>
      <div className="col-span-12 grid gap-2 text-sm sm:grid-cols-3">
        <div>
          <div className="text-[10px] font-bold uppercase tracking-wide text-stone-500">Firm</div>
          <div className="font-medium">{stopMarkingClientName(row) || '—'}</div>
        </div>
        <div>
          <div className="text-[10px] font-bold uppercase tracking-wide text-stone-500">Indian Standard</div>
          <div className="font-medium">{stopMarkingIsCodeLabel(row) || '—'}</div>
        </div>
        <div>
          <div className="text-[10px] font-bold uppercase tracking-wide text-stone-500">CM/L</div>
          <div className="font-mono font-medium">{formatCmL(row.cm_l_digits) || '—'}</div>
        </div>
      </div>
      <div className="col-span-12 space-y-2 sm:col-span-6 md:col-span-4">
        <Label>Stop Marking Date</Label>
        <LimsDatePicker aria-label="Stop marking date" disabled={closed} value={form.stopDate} onChange={(v) => set('stopDate', v)} />
      </div>
      <div className="col-span-12 space-y-2 sm:col-span-6 md:col-span-4">
        <Label>Status</Label>
        <Select value={form.status === 'closed' ? 'reviewed' : form.status} disabled={closed} onValueChange={(v) => set('status', v)}>
          <SelectTrigger aria-label="Status">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="rounded-none border-stone-500">
            {STOP_MARKING_STATUS_OPTIONS.filter((o) => o.value !== 'closed').map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className={section}>BIS Report</div>
      <div className="col-span-12 flex flex-wrap items-center gap-2 border border-stone-300 bg-stone-50 px-3 py-2 text-sm">
        <div className="min-w-0 flex-1 basis-48 truncate">{row.report_name || 'No report uploaded yet'}</div>
        <div className="flex flex-wrap items-center gap-1.5">
          {row.report_path ? (
            <>
              <Button type="button" variant="outline" className={tbtn} disabled={busy !== null} onClick={() => void run('open', () => openStopMarkingReport(row.report_path!))}>
                <Eye size={14} /> Open
              </Button>
              <Button
                type="button"
                variant="outline"
                className={tbtn}
                disabled={busy !== null || closed}
                title="Read the report with AI and fill the details below"
                onClick={() => void run('read', async () => { applyReading(await readStopMarkingReport(row, await downloadStopMarkingReport(row.report_path!, row.report_name ?? 'report.pdf'))); toast.success('Report read — check the details below.') })}
              >
                {busy === 'read' ? <LoaderCircle size={14} className="animate-spin" /> : <Sparkles size={14} />} Read with AI
              </Button>
              <Button
                type="button"
                variant="outline"
                className={`${tbtn} text-red-700`}
                disabled={busy !== null || closed}
                onClick={() => {
                  if (window.confirm('Remove the uploaded report?')) void run('clear', async () => { onUpdated(await clearStopMarkingReport(row.id, row.report_path)) })
                }}
              >
                Remove
              </Button>
            </>
          ) : null}
          <label className={`inline-flex cursor-pointer items-center border border-stone-400 bg-white px-2.5 text-xs font-medium hover:bg-stone-100 ${tbtn}`}>
            {busy === 'upload' ? 'Uploading…' : row.report_path ? 'Replace' : 'Upload Report'}
            <input
              type="file"
              className="sr-only"
              disabled={busy !== null || closed}
              accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/*"
              onChange={(e) => {
                const file = e.target.files?.[0]
                e.target.value = ''
                if (file) void upload(file)
              }}
            />
          </label>
        </div>
      </div>
      <p className="col-span-12 text-xs text-muted-foreground">A PDF is read by AI automatically. For a photo or scan, type the details below yourself.</p>

      <div className={section}>Review</div>
      <div className="col-span-12 space-y-2 md:col-span-6">
        <Label htmlFor="smk-ref">BIS Letter / Reference No. &amp; Date</Label>
        <Input id="smk-ref" disabled={closed} value={form.bisReference} onChange={(e) => set('bisReference', e.target.value)} />
      </div>
      <div className="col-span-12 space-y-2 md:col-span-6">
        <Label>Reply Due By</Label>
        <LimsDatePicker aria-label="Reply due by" disabled={closed} value={form.bisDeadline} onChange={(v) => set('bisDeadline', v)} />
      </div>
      <div className="col-span-12 space-y-2">
        <Label htmlFor="smk-reason">Reason for Stop Marking (as per BIS)</Label>
        <Textarea id="smk-reason" rows={3} disabled={closed} className="rounded-none border-stone-500 bg-stone-50" value={form.bisReason} onChange={(e) => set('bisReason', e.target.value)} />
      </div>
      <div className="col-span-12 space-y-2">
        <Label htmlFor="smk-points">Points Raised by BIS / Review Notes</Label>
        <Textarea id="smk-points" rows={5} disabled={closed} className="rounded-none border-stone-500 bg-stone-50" value={form.reviewNotes} onChange={(e) => set('reviewNotes', e.target.value)} />
      </div>
      {!closed && form.status === 'open' ? (
        <div className="col-span-12">
          <Button type="button" variant="outline" className={tbtn} disabled={busy !== null} onClick={() => void save('reviewed')}>
            Mark Report as Reviewed
          </Button>
        </div>
      ) : null}

      <div className={section}>Reply to BIS</div>
      <div className="col-span-12 flex flex-wrap items-center gap-2">
        <Button type="button" variant="outline" className={tbtn} disabled={busy !== null || closed} onClick={() => void draft()}>
          {busy === 'draft' ? <LoaderCircle size={14} className="animate-spin" /> : <Sparkles size={14} />}
          {hasReply ? 'Improve Reply with AI' : 'Draft Reply with AI'}
        </Button>
        <div className="space-y-0 sm:ml-auto sm:w-48">
          <LimsDatePicker aria-label="Reply date" disabled={closed} placeholder="Reply date" value={form.replyDate} onChange={(v) => set('replyDate', v)} />
        </div>
      </div>
      <div className="col-span-12 space-y-2">
        <Textarea
          aria-label="Reply letter to BIS"
          rows={12}
          disabled={closed}
          className="rounded-none border-stone-500 bg-stone-50 font-serif text-sm leading-relaxed"
          placeholder="Reply letter to BIS — draft it with AI or type it here."
          value={form.replyDraft}
          onChange={(e) => set('replyDraft', e.target.value)}
        />
      </div>
      <div className="col-span-12 flex flex-wrap items-center gap-1.5">
        <Button type="button" variant="outline" className={tbtn} disabled={!hasReply || busy !== null} onClick={() => void run('print', async () => { const msg = await printStopMarkingReply(live()); if (msg) setError(msg) })}>
          <Printer size={14} /> Print / PDF
        </Button>
        <Button type="button" variant="outline" className={tbtn} disabled={!hasReply || busy !== null} onClick={() => void run('word', () => downloadStopMarkingReplyWord(live()))}>
          <FileType size={14} /> Word
        </Button>
        <Button type="button" variant="outline" className={tbtn} disabled={!hasReply || busy !== null} title="Email the letter to the client's master email" onClick={() => void run('mail', async () => { toast.success(await emailStopMarkingReplyToClient(live())) })}>
          {busy === 'mail' ? <LoaderCircle size={14} className="animate-spin" /> : <Mail size={14} />} Email Client
        </Button>
        {!closed && form.status !== 'replied' && hasReply ? (
          <Button type="button" variant="outline" className={tbtn} disabled={busy !== null} onClick={() => void save('replied')}>
            Mark Reply Sent
          </Button>
        ) : null}
      </div>

      <div className="col-span-12 space-y-2">
        <Label htmlFor="smk-notes">Notes</Label>
        <Textarea id="smk-notes" rows={3} disabled={closed} className="rounded-none border-stone-500 bg-stone-50" value={form.notes} onChange={(e) => set('notes', e.target.value)} />
      </div>
    </BisFormDialog>
  )
}
