import { LimsDatePicker } from '@/components/lims/LimsDatePicker'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { BisFormDialog } from '../shared/BisFormDialog'
import { ClientIsLicenseFields } from '../shared/ClientIsLicenseFields'
import { StopMarkingLetterPicker } from './StopMarkingLetterPicker'
import type { StopMarkingAddForm } from './types'

/** Add a licence to Stop Marking: the licence, the date, why marking was stopped, and the BIS letter received. */
export function StopMarkingAddDialog({
  open,
  onOpenChange,
  form,
  onChange,
  saving,
  errorMessage,
  onSave,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  form: StopMarkingAddForm
  onChange: (next: StopMarkingAddForm) => void
  saving: boolean
  errorMessage: string | null
  onSave: () => void
}) {
  const canSave = !saving && Boolean(form.clientId && form.isCodeId && form.bisProjectId && form.stopDate)
  return (
    <BisFormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Add License to Stop Marking"
      saveLabel="Save"
      canSave={canSave}
      saving={saving}
      errorMessage={errorMessage}
      onSave={onSave}
    >
      <ClientIsLicenseFields idPrefix="smk" clientLabelText="Firm Name" qeManagedOnly value={form} onChange={(next) => onChange({ ...form, ...next })} />
      <div className="col-span-12 space-y-2 md:col-span-6">
        <Label>
          Stop Marking Date <span className="text-destructive">*</span>
        </Label>
        <LimsDatePicker aria-label="Stop marking date" value={form.stopDate} onChange={(stopDate) => onChange({ ...form, stopDate })} />
      </div>
      <div className="col-span-12 space-y-2">
        <Label htmlFor="smk-add-reason">Reason for Stop Marking</Label>
        <Textarea
          id="smk-add-reason"
          rows={4}
          className="rounded-none border-stone-500 bg-stone-50"
          placeholder="Why BIS stopped marking, as stated in the letter"
          value={form.bisReason}
          onChange={(e) => onChange({ ...form, bisReason: e.target.value })}
        />
      </div>
      <div className="col-span-12 space-y-2">
        <Label>BIS Letter Received</Label>
        <StopMarkingLetterPicker pendingFile={form.letterFile} onPick={(letterFile) => onChange({ ...form, letterFile })} onClear={() => onChange({ ...form, letterFile: null })} />
        <p className="text-xs text-muted-foreground">
          Only QE-managed licences are listed. Saving sets the licence status to Stop Marking. Open the module from the Action column to review the letter, prepare the reply and Factory Test Report, and submit.
        </p>
      </div>
    </BisFormDialog>
  )
}
