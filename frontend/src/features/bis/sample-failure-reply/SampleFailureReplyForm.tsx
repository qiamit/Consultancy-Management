import { Button } from '@/components/ui/button'
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
  type SampleFailureAttachmentKind,
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
  attachmentBusy = false,
  onUploadAttachment,
  onClearAttachment,
  onOpenAttachment,
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
  attachmentBusy?: boolean
  onUploadAttachment?: (kind: SampleFailureAttachmentKind, file: File) => void
  onClearAttachment?: (kind: SampleFailureAttachmentKind) => void
  onOpenAttachment?: (path: string) => void
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
          <ul className="space-y-2 border border-stone-300 bg-stone-50 px-3 py-2 text-sm">
            {attachments.map((a) => (
              <li
                key={a.kind}
                className="flex flex-wrap items-center justify-between gap-2 border-b border-stone-200 pb-2 last:border-b-0 last:pb-0"
              >
                <div className="min-w-0">
                  <div className="font-medium text-stone-700">{a.label}</div>
                  <div className="truncate text-muted-foreground">
                    {a.name || a.path ? (a.name ?? a.path) : 'Not uploaded'}
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  {a.path ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-7 rounded-none px-2 text-xs"
                      disabled={attachmentBusy}
                      onClick={() => onOpenAttachment?.(a.path!)}
                    >
                      Open
                    </Button>
                  ) : null}
                  {a.path ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-7 rounded-none px-2 text-xs text-red-700"
                      disabled={attachmentBusy}
                      onClick={() => onClearAttachment?.(a.kind)}
                    >
                      Remove
                    </Button>
                  ) : null}
                  <label className="inline-flex h-7 cursor-pointer items-center border border-stone-400 bg-white px-2 text-xs font-medium text-stone-800 hover:bg-stone-100">
                    {a.path ? 'Replace' : 'Upload'}
                    <input
                      type="file"
                      className="sr-only"
                      disabled={attachmentBusy || !onUploadAttachment}
                      accept=".pdf,.png,.jpg,.jpeg,.doc,.docx,.xls,.xlsx,application/pdf,image/*"
                      onChange={(e) => {
                        const file = e.target.files?.[0]
                        e.target.value = ''
                        if (file) onUploadAttachment?.(a.kind, file)
                      }}
                    />
                  </label>
                </div>
              </li>
            ))}
          </ul>
          <p className="text-xs text-muted-foreground">
            Upload Failure Letter, Offer Letter, and Factory Test Report (PDF / Office / image).
          </p>
        </div>
      ) : (
        <div className="col-span-12">
          <p className="text-xs text-muted-foreground">
            Save the reply first, then open Edit to attach Failure Letter, Offer Letter, and Factory
            Test Report.
          </p>
        </div>
      )}

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
