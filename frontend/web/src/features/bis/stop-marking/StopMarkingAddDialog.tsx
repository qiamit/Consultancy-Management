import { LimsDatePicker } from '@/components/lims/LimsDatePicker'
import { Label } from '@/components/ui/label'
import { BisFormDialog } from '../shared/BisFormDialog'
import { ClientIsLicenseFields } from '../shared/ClientIsLicenseFields'
import type { StopMarkingAddForm } from './types'

/** Add a licence to Stop Marking: pick the licence (firm, IS code, CM/L) and the date BIS stopped marking. */
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
      saveLabel="Add to Stop Marking"
      canSave={canSave}
      saving={saving}
      errorMessage={errorMessage}
      onSave={onSave}
    >
      <ClientIsLicenseFields
        idPrefix="smk"
        clientLabelText="Firm Name"
        qeManagedOnly
        value={form}
        onChange={(next) => onChange({ ...form, ...next })}
      />
      <div className="col-span-12 space-y-2 md:col-span-6">
        <Label>
          Stop Marking Date <span className="text-destructive">*</span>
        </Label>
        <LimsDatePicker aria-label="Stop marking date" value={form.stopDate} onChange={(stopDate) => onChange({ ...form, stopDate })} />
      </div>
      <p className="col-span-12 text-xs text-muted-foreground">
        Only QE-managed licences are listed. Adding the licence sets its status to Stop Marking; you can attach the BIS
        report and prepare the reply after it is added.
      </p>
    </BisFormDialog>
  )
}
