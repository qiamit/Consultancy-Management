import { LimsDatePicker } from '@/components/lims/LimsDatePicker'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, selectFitTriggerClass, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { BisFormDialog } from '../shared/BisFormDialog'
import { ClientIsLicenseFields } from '../shared/ClientIsLicenseFields'
import { StopMarkingLetterPicker } from './StopMarkingLetterPicker'
import { NOTICE_TYPE_OPTIONS, STOP_MARKING_REASON_OPTIONS, type StopMarkingAddForm } from './types'

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
      compact
      open={open}
      onOpenChange={onOpenChange}
      title="Add License Non-Conformity"
      saveLabel="Save"
      canSave={canSave}
      saving={saving}
      errorMessage={errorMessage}
      onSave={onSave}
    >
      <ClientIsLicenseFields idPrefix="smk" clientLabelText="Firm Name" qeManagedOnly value={form} onChange={(next) => onChange({ ...form, ...next })} />
      <div className="col-span-12 space-y-2 md:col-span-6">
        <Label className="block">
          Notice Date <span className="text-destructive">*</span>
        </Label>
        <LimsDatePicker className="h-8 w-full" aria-label="Notice date" value={form.stopDate} onChange={(stopDate) => onChange({ ...form, stopDate })} />
      </div>
      <div className="col-span-12 space-y-2 md:col-span-6">
        <Label className="block">Notice Received from BIS</Label>
        <Select value={form.noticeType} onValueChange={(noticeType) => onChange({ ...form, noticeType })}>
          <SelectTrigger aria-label="Notice received from BIS">
            <SelectValue placeholder="Select Notice" />
          </SelectTrigger>
          <SelectContent className={selectFitTriggerClass}>
            {NOTICE_TYPE_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="col-span-12 space-y-2 md:col-span-6">
        <Label className="block">Non-Conformity</Label>
        <Select value={form.reasonType || undefined} onValueChange={(reasonType) => onChange({ ...form, reasonType })}>
          <SelectTrigger aria-label="Non-conformity">
            <SelectValue placeholder="Select Non-Conformity" />
          </SelectTrigger>
          <SelectContent className={selectFitTriggerClass}>
            {STOP_MARKING_REASON_OPTIONS.map((r) => (
              <SelectItem key={r} value={r}>
                {r}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="col-span-12 space-y-2">
        <Label className="block">BIS Letter Received</Label>
        <StopMarkingLetterPicker compact pendingFile={form.letterFile} onPick={(letterFile) => onChange({ ...form, letterFile })} onClear={() => onChange({ ...form, letterFile: null })} />
      </div>
    </BisFormDialog>
  )
}
