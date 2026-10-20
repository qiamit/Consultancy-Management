import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { LimsDatePicker } from '@/components/lims/LimsDatePicker'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { formatCmL } from '../projects/types'
import { BisFormDialog } from '../shared/BisFormDialog'
import { StopMarkingLetterPicker } from './StopMarkingLetterPicker'
import {
  clearStopMarkingReport,
  formatBisApiError,
  openStopMarkingReport,
  saveStopMarkingCase,
  uploadStopMarkingReport,
} from './stopMarkingApi'
import {
  STOP_MARKING_STATUS_OPTIONS,
  rowToCaseForm,
  stopMarkingClientName,
  stopMarkingIsCodeLabel,
  type StopMarkingRow,
} from './types'

/** Edit what was entered when the licence was added: date, reason, BIS letter, status and notes. */
export function StopMarkingEditDialog({
  row,
  onOpenChange,
  onUpdated,
}: {
  row: StopMarkingRow | null
  onOpenChange: (open: boolean) => void
  onUpdated: (row: StopMarkingRow) => void
}) {
  const [stopDate, setStopDate] = useState('')
  const [reason, setReason] = useState('')
  const [status, setStatus] = useState('open')
  const [notes, setNotes] = useState('')
  const [busy, setBusy] = useState<'save' | 'letter' | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!row) return
    const form = rowToCaseForm(row)
    setStopDate(form.stopDate)
    setReason(form.bisReason)
    setStatus(form.status === 'closed' ? 'closed' : form.status)
    setNotes(form.notes)
    setError(null)
  }, [row?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!row) return null
  const closed = row.status === 'closed'
  const run = async (key: 'save' | 'letter', fn: () => Promise<void>) => {
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

  return (
    <BisFormDialog
      open
      onOpenChange={onOpenChange}
      title={`Edit Stop Marking — ${stopMarkingClientName(row) || 'Licence'}`}
      saveLabel="Update"
      canSave={!closed && busy === null}
      saving={busy === 'save'}
      errorMessage={error}
      onSave={() =>
        void run('save', async () => {
          const updated = await saveStopMarkingCase(row.id, { ...rowToCaseForm(row), stopDate, bisReason: reason, status, notes })
          onUpdated(updated)
          toast.success('Saved.')
          onOpenChange(false)
        })
      }
    >
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
      <div className="col-span-12 space-y-2 md:col-span-6">
        <Label>Stop Marking Date</Label>
        <LimsDatePicker aria-label="Stop marking date" disabled={closed} value={stopDate} onChange={setStopDate} />
      </div>
      <div className="col-span-12 space-y-2 md:col-span-6">
        <Label>Status</Label>
        <Select value={status} disabled={closed} onValueChange={setStatus}>
          <SelectTrigger aria-label="Status">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="rounded-none border-stone-500">
            {STOP_MARKING_STATUS_OPTIONS.filter((o) => o.value !== 'closed' || closed).map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="col-span-12 space-y-2">
        <Label htmlFor="smk-edit-reason">Reason for Stop Marking</Label>
        <Textarea id="smk-edit-reason" rows={4} disabled={closed} className="rounded-none border-stone-500 bg-stone-50" value={reason} onChange={(e) => setReason(e.target.value)} />
      </div>
      <div className="col-span-12 space-y-2">
        <Label>BIS Letter Received</Label>
        <StopMarkingLetterPicker
          storedName={row.report_name}
          busy={busy === 'letter'}
          disabled={closed}
          onPick={(file) => void run('letter', async () => { onUpdated(await uploadStopMarkingReport(row.id, file)); toast.success('BIS letter uploaded.') })}
          onClear={row.report_path ? () => { if (window.confirm('Remove the BIS letter?')) void run('letter', async () => { onUpdated(await clearStopMarkingReport(row.id, row.report_path)) }) } : undefined}
          onOpen={row.report_path ? () => void run('letter', () => openStopMarkingReport(row.report_path!)) : undefined}
        />
      </div>
      <div className="col-span-12 space-y-2">
        <Label htmlFor="smk-edit-notes">Notes</Label>
        <Textarea id="smk-edit-notes" rows={3} disabled={closed} className="rounded-none border-stone-500 bg-stone-50" value={notes} onChange={(e) => setNotes(e.target.value)} />
      </div>
    </BisFormDialog>
  )
}
