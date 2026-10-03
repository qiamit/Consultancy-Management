import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { BisFormDialog } from '../shared/BisFormDialog'
import { ClientIsLicenseFields } from '../shared/ClientIsLicenseFields'
import {
  SAMPLE_FAILURE_STATUS_OPTIONS,
  SAMPLE_FAILURE_TYPE_OPTIONS,
  sampleFailureAttachments,
  type SampleFailureReplyForm as SampleFailureReplyFormValue,
  type SampleFailureReplyRow,
} from './types'

export function SampleFailureReplyForm({
  open,
  onOpenChange,
  editingRow,
  form,
  onChange,
  canSave,
  saving,
  errorMessage,
  onSave,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  editingRow: SampleFailureReplyRow | null
  form: SampleFailureReplyFormValue
  onChange: (next: SampleFailureReplyFormValue) => void
  canSave: boolean
  saving: boolean
  errorMessage: string | null
  onSave: () => void
}) {
  const editing = editingRow != null
  const set = <K extends keyof SampleFailureReplyFormValue>(
    key: K,
    value: SampleFailureReplyFormValue[K],
  ) => onChange({ ...form, [key]: value })

  const typeOptions: Array<{ value: string; label: string }> = SAMPLE_FAILURE_TYPE_OPTIONS.some(
    (o) => o.value === form.sampleFailureType,
  )
    ? [...SAMPLE_FAILURE_TYPE_OPTIONS]
    : [...SAMPLE_FAILURE_TYPE_OPTIONS, { value: form.sampleFailureType, label: form.sampleFailureType }]

  const attachments = editingRow ? sampleFailureAttachments(editingRow) : []

  return (
    <BisFormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={editing ? 'Edit Sample Failure Reply' : 'Add Sample Failure Reply'}
      saveLabel={editing ? 'Update Reply' : 'Save Reply'}
      canSave={canSave}
      saving={saving}
      errorMessage={errorMessage}
      onSave={onSave}
    >
      <ClientIsLicenseFields
        idPrefix="sfr"
        clientLabelText="Firm Name"
        value={form}
        onChange={(next) => onChange({ ...form, ...next })}
      />

      <div className="col-span-12 space-y-2 md:col-span-3">
        <Label>
          Sample Failure Type <span className="text-destructive">*</span>
        </Label>
        <Select value={form.sampleFailureType} onValueChange={(v) => set('sampleFailureType', v)}>
          <SelectTrigger aria-label="Sample failure type">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="rounded-none border-stone-500">
            {typeOptions.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="col-span-12 space-y-2 md:col-span-3">
        <Label>Status</Label>
        <Select value={form.status} onValueChange={(v) => set('status', v)}>
          <SelectTrigger aria-label="Status">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="rounded-none border-stone-500">
            {SAMPLE_FAILURE_STATUS_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="col-span-12 space-y-2 md:col-span-6">
        <Label htmlFor="sfr-sample-code">Sample Code</Label>
        <Input
          id="sfr-sample-code"
          autoComplete="off"
          value={form.sampleCode}
          onChange={(e) => set('sampleCode', e.target.value)}
        />
      </div>

      <div className="col-span-12 space-y-2 md:col-span-6">
        <Label htmlFor="sfr-sample-qr">Sample QR Code</Label>
        <Input
          id="sfr-sample-qr"
          autoComplete="off"
          value={form.sampleQrCode}
          onChange={(e) => set('sampleQrCode', e.target.value)}
        />
      </div>

      {editing ? (
        <div className="col-span-12 space-y-2">
          <Label>Attached Documents</Label>
          <ul className="space-y-1 border border-stone-300 bg-stone-50 px-3 py-2 text-sm">
            {attachments.map((a) => (
              <li key={a.label} className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-medium text-stone-700">{a.label}</span>
                <span className="text-muted-foreground">
                  {a.name || a.path ? (a.name ?? a.path) : 'Not uploaded'}
                </span>
              </li>
            ))}
          </ul>
          <p className="text-xs text-muted-foreground">
            Document upload is not available in this version; existing attachments are shown for reference.
          </p>
        </div>
      ) : null}

      <div className="col-span-12 space-y-2">
        <Label htmlFor="sfr-reply">Reply Draft</Label>
        <Textarea
          id="sfr-reply"
          rows={8}
          className="rounded-none border-stone-500 bg-stone-50"
          value={form.replyDraft}
          onChange={(e) => set('replyDraft', e.target.value)}
        />
      </div>

      <div className="col-span-12 space-y-2">
        <Label htmlFor="sfr-notes">Notes</Label>
        <Textarea
          id="sfr-notes"
          rows={4}
          className="rounded-none border-stone-500 bg-stone-50"
          value={form.notes}
          onChange={(e) => set('notes', e.target.value)}
        />
      </div>
    </BisFormDialog>
  )
}
