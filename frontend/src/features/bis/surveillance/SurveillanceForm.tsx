import { useEffect, useState } from 'react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { fetchEmployeeNames } from '../shared/bisLookupApi'
import { BisFormDialog } from '../shared/BisFormDialog'
import { ClientIsLicenseFields } from '../shared/ClientIsLicenseFields'
import type { SurveillanceForm as SurveillanceFormValue } from './types'

export function SurveillanceForm({
  open,
  onOpenChange,
  editing,
  form,
  onChange,
  canSave,
  saving,
  errorMessage,
  onSave,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  editing: boolean
  form: SurveillanceFormValue
  onChange: (next: SurveillanceFormValue) => void
  canSave: boolean
  saving: boolean
  errorMessage: string | null
  onSave: () => void
}) {
  const [employees, setEmployees] = useState<string[]>([])

  useEffect(() => {
    if (!open) return
    let cancelled = false
    void fetchEmployeeNames()
      .then((names) => {
        if (!cancelled) setEmployees(names)
      })
      .catch(() => {
        if (!cancelled) setEmployees([])
      })
    return () => {
      cancelled = true
    }
  }, [open])

  return (
    <BisFormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={editing ? 'Edit Surveillance' : 'Add Surveillance'}
      saveLabel={editing ? 'Update Surveillance' : 'Save Surveillance'}
      canSave={canSave}
      saving={saving}
      errorMessage={errorMessage}
      onSave={onSave}
    >
      <ClientIsLicenseFields
        idPrefix="surv"
        value={form}
        onChange={(next) => onChange({ ...form, ...next })}
      />

      <div className="col-span-12 space-y-2 md:col-span-3">
        <Label htmlFor="surv-date">
          Date of Surveillance <span className="text-destructive">*</span>
        </Label>
        <Input
          id="surv-date"
          type="date"
          value={form.surveillanceDate}
          onChange={(e) => onChange({ ...form, surveillanceDate: e.target.value })}
        />
      </div>

      <div className="col-span-12 space-y-2 md:col-span-3">
        <Label htmlFor="surv-employee">
          Allotted Employee <span className="text-destructive">*</span>
        </Label>
        <Input
          id="surv-employee"
          list="surv-employee-list"
          autoComplete="off"
          placeholder="Select or type employee name"
          value={form.allottedEmployeeName}
          onChange={(e) => onChange({ ...form, allottedEmployeeName: e.target.value })}
        />
        <datalist id="surv-employee-list">
          {employees.map((name) => (
            <option key={name} value={name} />
          ))}
        </datalist>
      </div>
    </BisFormDialog>
  )
}
