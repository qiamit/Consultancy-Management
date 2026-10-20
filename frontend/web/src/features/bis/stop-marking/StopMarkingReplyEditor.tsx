import { useEffect, useState } from 'react'
import { LoaderCircle, Sparkles } from 'lucide-react'
import { toast } from 'sonner'
import { LimsDatePicker } from '@/components/lims/LimsDatePicker'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import { oslSampleRowHasContent, parseOslSampleRequirementsPayload } from '../projects/oslSampleRequirementsModel'
import { formatDisplayDate, type BisProjectRow } from '../projects/types'
import { AutoGrowTextarea } from '../shared/AutoGrowTextarea'
import { formatBisApiError } from './stopMarkingApi'
import { draftStopMarkingReplySections, type ReplyContext, type ReplySectionKey } from './stopMarkingAi'
import { defaultReplyRef } from './printStopMarkingReply'
import { findingsToText, REPLY_BODY_SECTIONS, stopMarkingIsCodeLabel, type StopMarkingCaseForm, type StopMarkingReplySections, type StopMarkingRow } from './types'

const label = 'block text-[11px] font-semibold uppercase tracking-wide text-stone-600'
const aiBtn = 'h-7 gap-1 rounded-none border-amber-600 bg-amber-50 px-2 text-[11px] font-semibold text-amber-900 hover:bg-amber-100'
const field = 'rounded-none border-stone-500 bg-white'

const ALL_KEYS: ReplySectionKey[] = ['otherRefs', ...REPLY_BODY_SECTIONS.map((s) => s.key as ReplySectionKey)]

/**
 * Step 4: the reply to BIS as a formal letter, section by section. Reference, BIS branch office and licence details come
 * from the case and the licence; every section has its own AI button, and one button drafts the whole letter from the
 * whole non-conformity (letter, test report, standard, new samples, payments).
 */
export function StopMarkingReplyEditor({
  row,
  form,
  bisRow,
  closed,
  onChange,
  onDate,
}: {
  row: StopMarkingRow
  form: StopMarkingCaseForm
  bisRow: BisProjectRow | null
  closed: boolean
  onChange: (next: StopMarkingReplySections) => void
  onDate: (iso: string) => void
}) {
  const s = form.replySections
  const [busy, setBusy] = useState<string | null>(null)
  const [instruction, setInstruction] = useState('')
  const [error, setError] = useState<string | null>(null)
  const set = <K extends keyof StopMarkingReplySections>(key: K, value: StopMarkingReplySections[K]) => onChange({ ...s, [key]: value })

  // "Our Ref." is generated as soon as the step opens, and stays editable.
  useEffect(() => {
    if (!s.ourRef.trim() && !closed) onChange({ ...s, ourRef: defaultReplyRef({ cm_l_digits: row.cm_l_digits, reply_date: form.replyDate || null }) })
  }, [row.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const osl = parseOslSampleRequirementsPayload((row.test_report_module?.osl ?? null) as Record<string, unknown> | null).rows.filter(oslSampleRowHasContent)
  const context = (): ReplyContext => ({
    reference: form.bisReference,
    reason: form.bisReason,
    deadline: form.bisDeadline,
    points: form.reviewNotes,
    details: form.reportDetails,
    sampleCode: form.sampleCode,
    qrCode: form.sampleQrCode,
    findings: findingsToText(form.reportFindings),
    observations: form.reportObservations,
    samples: osl
      .map((r, i) => `${i + 1}. ${r.gradeTypeVariety.trim() || r.sampleDescription.trim() || '—'}; batch ${r.batchNumber.trim() || '—'}; mfg ${r.dateOfManufacturing ? formatDisplayDate(r.dateOfManufacturing) : '—'}; quantity ${r.sampleQuantity.trim() || r.batchQuantity.trim() || '—'}; declared ${r.declaredValue.trim() || '—'}`)
      .join('\n'),
    payments: osl
      .filter((r) => r.testingCharges.trim() || r.paymentRef.trim())
      .map((r, i) => `${i + 1}. Testing charges ${r.testingCharges.trim() || '—'}; mode ${r.paymentMode.trim() || '—'}; reference ${r.paymentRef.trim() || '—'}; date ${r.paymentDate ? formatDisplayDate(r.paymentDate) : '—'}`)
      .join('\n'),
  })

  const draft = async (keys: ReplySectionKey[], busyKey: string) => {
    setBusy(busyKey)
    setError(null)
    try {
      const out = await draftStopMarkingReplySections(row, context(), keys, s, instruction)
      onChange({ ...s, ...out })
      toast.success(keys.length > 1 ? 'Reply Drafted — Edit It, Then Save.' : 'Section Written — Check It.')
    } catch (err) {
      setError(formatBisApiError(err))
    } finally {
      setBusy(null)
    }
  }

  const sectionAi = (key: ReplySectionKey, text: string) => (
    <Button type="button" variant="outline" className={aiBtn} disabled={busy !== null || closed} title={`Write This Section with AI`} aria-label={`Write ${key} with AI`} onClick={() => void draft([key], key)}>
      {busy === key ? <LoaderCircle size={12} className="animate-spin" aria-hidden /> : <Sparkles size={12} aria-hidden />} {text}
    </Button>
  )

  const branchLine = bisRow
    ? ['The Director & Head', 'Bureau of Indian Standards', [bisRow.branch_name, bisRow.branch_state].filter(Boolean).join(', ')].filter(Boolean).join(', ')
    : 'The BIS branch office of this licence'

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-2 border border-amber-300 bg-amber-50/70 p-2.5">
        <div className="min-w-0 flex-1 basis-64 space-y-1.5">
          <Label className={label} htmlFor="smk-reply-instruction">Tell the AI Anything Extra (Optional)</Label>
          <Input id="smk-reply-instruction" className={cn(field, 'h-9')} value={instruction} disabled={busy !== null || closed} placeholder="e.g. Failure due to a faulty tensile test setup; stock of 5 tonne is on hold" onChange={(e) => setInstruction(e.target.value)} />
        </div>
        <Button type="button" variant="outline" className="h-9 gap-1.5 rounded-none border-amber-600 bg-white px-3 text-xs font-semibold text-amber-900 hover:bg-amber-100" disabled={busy !== null || closed} onClick={() => void draft(ALL_KEYS, 'all')}>
          {busy === 'all' ? <LoaderCircle size={14} className="animate-spin" aria-hidden /> : <Sparkles size={14} aria-hidden />} {busy === 'all' ? 'Drafting the Reply…' : 'Draft Full Reply with AI'}
        </Button>
      </div>
      {error ? <p className="border-l-2 border-destructive bg-destructive/5 px-3 py-2 text-sm text-destructive">{error}</p> : null}

      <div className="grid gap-3 border border-stone-400 bg-white p-3 md:grid-cols-2">
        <div className="space-y-1.5">
          <Label className={label} htmlFor="smk-reply-ref">Our Letter No.</Label>
          <Input id="smk-reply-ref" className={cn(field, 'h-9')} disabled={closed} value={s.ourRef} onChange={(e) => set('ourRef', e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label className={label}>Date of Reply</Label>
          <LimsDatePicker className="h-9 w-full" aria-label="Reply Date" disabled={closed} placeholder="Reply Date" value={form.replyDate} onChange={onDate} />
        </div>
        <div className="space-y-1.5 md:col-span-2">
          <Label className={label}>To — BIS Branch Office of the Licence</Label>
          <p className="border border-stone-300 bg-stone-50 px-3 py-2 text-sm text-stone-800">{branchLine}</p>
        </div>
        <div className="space-y-1.5 md:col-span-2">
          <Label className={label}>Your Reference · Licence · Indian Standard</Label>
          <p className="border border-stone-300 bg-stone-50 px-3 py-2 text-sm text-stone-800">
            {[form.bisReference || 'BIS Reference Not Entered', row.cm_l_digits ? `CM/L-${row.cm_l_digits}` : '', stopMarkingIsCodeLabel(row)].filter(Boolean).join(' · ')}
          </p>
        </div>
        <div className="space-y-1.5 md:col-span-2">
          <div className="flex items-center justify-between gap-2">
            <Label className={label} htmlFor="smk-reply-otherrefs">Other References</Label>
            {sectionAi('otherRefs', 'Fill with AI')}
          </div>
          <AutoGrowTextarea id="smk-reply-otherrefs" disabled={closed} className={field} value={s.otherRefs} onChange={(e) => set('otherRefs', e.target.value)} />
        </div>
      </div>

      {REPLY_BODY_SECTIONS.map(({ key, title }) => (
        <div key={key} className="space-y-1.5 border border-stone-300 bg-white p-3">
          <div className="flex items-center justify-between gap-2">
            <Label className={label} htmlFor={`smk-reply-${key}`}>{title}</Label>
            {sectionAi(key as ReplySectionKey, 'Write with AI')}
          </div>
          <AutoGrowTextarea id={`smk-reply-${key}`} disabled={closed} className={field} value={s[key]} onChange={(e) => set(key, e.target.value)} />
          {key === 'newSamples' && osl.length ? <p className="text-xs text-stone-600">The {osl.length} Sample{osl.length > 1 ? 's' : ''} of Step 3 Are Also Printed in a Table Below This Section.</p> : null}
        </div>
      ))}

      <div className="grid gap-3 border border-stone-300 bg-white p-3 md:grid-cols-2">
        <div className="space-y-1.5">
          <Label className={label} htmlFor="smk-reply-signname">Signatory Name</Label>
          <Input id="smk-reply-signname" className={cn(field, 'h-9')} disabled={closed} placeholder="From the Licence Signatory" value={s.signatoryName} onChange={(e) => set('signatoryName', e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label className={label} htmlFor="smk-reply-signdesig">Designation</Label>
          <Input id="smk-reply-signdesig" className={cn(field, 'h-9')} disabled={closed} value={s.signatoryDesignation} onChange={(e) => set('signatoryDesignation', e.target.value)} />
        </div>
        <p className="text-xs text-stone-600 md:col-span-2">The Printed Letter Ends with the Firm&apos;s Seal and Signature Space, Then the Signatory.</p>
      </div>
    </div>
  )
}
