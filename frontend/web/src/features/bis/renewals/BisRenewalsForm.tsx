import type { Dispatch, ReactNode, SetStateAction } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
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
import {
  limsDarkBarGlowStyle,
  limsPrimaryBtnClass,
  limsRegistryFormClass,
} from '@/lib/limsThemeUi'
import { cn } from '@/lib/utils'
import { RemoteLookupCombobox } from '../projects/BisProjectsForm'
import { fetchRenewalProjectSummary, searchRenewalProjectOptions } from './bisRenewalsApi'
import {
  FEE_PAYMENT_MODES,
  INSPECTION_RESULTS,
  RENEWAL_STATUSES,
  SUBMISSION_MODES,
  TEST_RESULTS,
  computeMarkingFeeTotal,
  formatCmL,
  formatDisplayDate,
  sanitizeCurrencyInput,
  type BisRenewalForm,
} from './types'

const NONE_VALUE = '__none__'

function SectionTitle({ children }: { children: ReactNode }) {
  return (
    <h3 className="col-span-12 border-b border-stone-300 pb-1 pt-2 text-[11px] font-bold uppercase tracking-[0.14em] text-stone-600">
      {children}
    </h3>
  )
}

function Field({
  label,
  htmlFor,
  span = 'md:col-span-3',
  required,
  children,
}: {
  label: string
  htmlFor?: string
  span?: string
  required?: boolean
  children: ReactNode
}) {
  return (
    <div className={cn('col-span-12 space-y-2', span)}>
      <Label htmlFor={htmlFor}>
        {label}
        {required ? <span className="text-destructive"> *</span> : null}
      </Label>
      {children}
    </div>
  )
}

function OptionalSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: string
  options: readonly string[]
  onChange: (value: string) => void
}) {
  const list = value && !options.includes(value) ? [...options, value] : options
  return (
    <Select value={value || NONE_VALUE} onValueChange={(v) => onChange(v === NONE_VALUE ? '' : v)}>
      <SelectTrigger aria-label={label}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent className="rounded-none border-stone-500">
        <SelectItem value={NONE_VALUE}>—</SelectItem>
        {list.map((o) => (
          <SelectItem key={o} value={o}>
            {o}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

export function BisRenewalsForm({
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
  form: BisRenewalForm
  onChange: Dispatch<SetStateAction<BisRenewalForm>>
  canSave: boolean
  saving: boolean
  errorMessage: string | null
  onSave: () => void
}) {
  const set = <K extends keyof BisRenewalForm>(key: K, value: BisRenewalForm[K]) =>
    onChange({ ...form, [key]: value })

  const setFee = (key: 'markingFeeRate' | 'markingFeeQuantity', raw: string) => {
    const next = { ...form, [key]: sanitizeCurrencyInput(raw) }
    const total = computeMarkingFeeTotal(next.markingFeeRate, next.markingFeeQuantity)
    onChange(total ? { ...next, markingFeeTotal: total } : next)
  }

  const handleProjectChange = ({ id, label }: { id: string; label: string }) => {
    if (!id) {
      onChange({
        ...form,
        projectId: '',
        projectLabel: label,
        clientId: '',
        clientLabel: '',
        currentValidity: '',
        cmLDigits: '',
        isCodeLabel: '',
      })
      return
    }
    if (id === form.projectId) {
      onChange({ ...form, projectLabel: label })
      return
    }
    onChange({ ...form, projectId: id, projectLabel: label })
    void fetchRenewalProjectSummary(id)
      .then((summary) => {
        if (!summary) return
        onChange((prev) =>
          prev.projectId === id
            ? {
                ...prev,
                clientId: summary.clientId,
                clientLabel: summary.clientLabel,
                currentValidity: summary.currentValidity,
                cmLDigits: summary.cmLDigits,
                isCodeLabel: summary.isCodeLabel,
              }
            : prev,
        )
      })
      .catch(() => undefined)
  }

  const grantWillUpdateLicense = Boolean(form.newValidityTo)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        persistOnFocusLoss
        aria-describedby={undefined}
        overlayClassName="lg:inset-y-0 lg:left-[268px] lg:right-0 lg:w-auto"
        className={cn(
          '!flex z-50 h-[100dvh] max-h-[100dvh] w-full max-w-none translate-x-0 translate-y-0 flex-col gap-0 overflow-hidden rounded-none border-0 bg-white p-0 shadow-none sm:rounded-none',
          'left-0 top-0',
          'lg:left-[268px] lg:w-[calc(100vw-268px)] lg:max-w-[calc(100vw-268px)]',
          'border-stone-600 ring-1 ring-amber-700/20',
          '[&>button]:!rounded-none [&>button]:text-white [&>button]:opacity-100 [&>button]:hover:bg-white/10',
        )}
      >
        <div className="relative shrink-0 overflow-hidden bg-gradient-to-br from-stone-800 via-stone-900 to-stone-950 px-4 py-2.5 text-white sm:px-5 sm:py-3">
          <div className="pointer-events-none absolute inset-0 opacity-[0.18]" style={limsDarkBarGlowStyle} />
          <div className="absolute bottom-0 left-0 h-[2px] w-full bg-gradient-to-r from-amber-500 via-amber-300 to-transparent" />
          <DialogHeader className="relative pr-10 text-left">
            <DialogTitle className="text-base font-semibold tracking-tight text-white sm:text-lg">
              {editing ? 'Edit License Renewal' : 'Add License Renewal'}
            </DialogTitle>
          </DialogHeader>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden bg-gradient-to-b from-stone-100/80 to-white px-4 py-4 sm:px-6 sm:py-5">
          {errorMessage ? (
            <p className="mb-4 border-l-2 border-destructive bg-destructive/5 px-3 py-2 text-sm text-destructive">
              {errorMessage}
            </p>
          ) : null}

          <div className={limsRegistryFormClass}>
            <div className="grid grid-cols-12 gap-4">
              <Field label="BIS License" htmlFor="renewal-project" span="md:col-span-6" required>
                {editing ? (
                  <Input id="renewal-project" value={form.projectLabel} readOnly disabled />
                ) : (
                  <RemoteLookupCombobox
                    inputId="renewal-project"
                    listId="renewal-project-list"
                    placeholder="Search client or CM/L number…"
                    label={form.projectLabel}
                    selectedId={form.projectId}
                    search={searchRenewalProjectOptions}
                    onChange={handleProjectChange}
                  />
                )}
              </Field>

              <Field label="Renewal Status" span="md:col-span-3">
                <Select value={form.renewalStatus} onValueChange={(v) => set('renewalStatus', v)}>
                  <SelectTrigger aria-label="Renewal status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="rounded-none border-stone-500">
                    {(RENEWAL_STATUSES.includes(form.renewalStatus as (typeof RENEWAL_STATUSES)[number])
                      ? [...RENEWAL_STATUSES]
                      : [...RENEWAL_STATUSES, form.renewalStatus]
                    ).map((s) => (
                      <SelectItem key={s} value={s}>
                        {s}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>

              {form.projectId ? (
                <div className="col-span-12 grid grid-cols-2 gap-px border border-stone-300 bg-stone-300 md:grid-cols-4">
                  {[
                    { label: 'Client', value: form.clientLabel || '—' },
                    { label: 'IS Standard', value: form.isCodeLabel || '—' },
                    { label: 'CM/L No.', value: formatCmL(form.cmLDigits) },
                    { label: 'Current Validity', value: formatDisplayDate(form.currentValidity) },
                  ].map((item) => (
                    <div key={item.label} className="bg-white px-3 py-2">
                      <p className="text-[11px] text-muted-foreground">{item.label}</p>
                      <p className="text-sm font-semibold text-foreground">{item.value}</p>
                    </div>
                  ))}
                </div>
              ) : null}

              <SectionTitle>Application to BIS</SectionTitle>
              <Field label="Date of Application" htmlFor="renewal-app-date">
                <Input
                  id="renewal-app-date"
                  type="date"
                  value={form.applicationDate}
                  onChange={(e) => set('applicationDate', e.target.value)}
                />
              </Field>
              <Field label="Submission Mode">
                <OptionalSelect
                  label="Submission mode"
                  value={form.submissionMode}
                  options={SUBMISSION_MODES}
                  onChange={(v) => set('submissionMode', v)}
                />
              </Field>
              <Field label="Acknowledgment Number" htmlFor="renewal-ack">
                <Input
                  id="renewal-ack"
                  value={form.acknowledgmentNumber}
                  onChange={(e) => set('acknowledgmentNumber', e.target.value)}
                />
              </Field>
              <Field label="BIS Office" htmlFor="renewal-office">
                <Input
                  id="renewal-office"
                  value={form.bisOffice}
                  onChange={(e) => set('bisOffice', e.target.value)}
                />
              </Field>
              <Field label="BIS Desk Officer" htmlFor="renewal-desk" span="md:col-span-6">
                <Input
                  id="renewal-desk"
                  value={form.bisDeskOfficer}
                  onChange={(e) => set('bisDeskOfficer', e.target.value)}
                />
              </Field>

              <SectionTitle>Marking Fee</SectionTitle>
              <Field label="Rate per Unit (₹)" htmlFor="renewal-fee-rate">
                <Input
                  id="renewal-fee-rate"
                  inputMode="decimal"
                  className="tabular-nums"
                  value={form.markingFeeRate}
                  onChange={(e) => setFee('markingFeeRate', e.target.value)}
                />
              </Field>
              <Field label="Quantity (units)" htmlFor="renewal-fee-qty">
                <Input
                  id="renewal-fee-qty"
                  inputMode="decimal"
                  className="tabular-nums"
                  value={form.markingFeeQuantity}
                  onChange={(e) => setFee('markingFeeQuantity', e.target.value)}
                />
              </Field>
              <Field label="Total Marking Fee (₹)" htmlFor="renewal-fee-total">
                <Input
                  id="renewal-fee-total"
                  inputMode="decimal"
                  className="tabular-nums"
                  value={form.markingFeeTotal}
                  onChange={(e) => set('markingFeeTotal', sanitizeCurrencyInput(e.target.value))}
                />
              </Field>
              <Field label="Payment Mode">
                <OptionalSelect
                  label="Fee payment mode"
                  value={form.feePaymentMode}
                  options={FEE_PAYMENT_MODES}
                  onChange={(v) => set('feePaymentMode', v)}
                />
              </Field>
              <Field label="Challan / DD Number" htmlFor="renewal-challan">
                <Input
                  id="renewal-challan"
                  value={form.feeChallanNumber}
                  onChange={(e) => set('feeChallanNumber', e.target.value)}
                />
              </Field>
              <Field label="Payment Date" htmlFor="renewal-fee-date">
                <Input
                  id="renewal-fee-date"
                  type="date"
                  value={form.feePaymentDate}
                  onChange={(e) => set('feePaymentDate', e.target.value)}
                />
              </Field>

              <SectionTitle>Test Report</SectionTitle>
              <Field label="Test Report Number" htmlFor="renewal-tr-no">
                <Input
                  id="renewal-tr-no"
                  value={form.testReportNumber}
                  onChange={(e) => set('testReportNumber', e.target.value)}
                />
              </Field>
              <Field label="Report Date" htmlFor="renewal-tr-date">
                <Input
                  id="renewal-tr-date"
                  type="date"
                  value={form.testReportDate}
                  onChange={(e) => set('testReportDate', e.target.value)}
                />
              </Field>
              <Field label="Laboratory Name" htmlFor="renewal-lab" span="md:col-span-6">
                <Input
                  id="renewal-lab"
                  value={form.testLabName}
                  onChange={(e) => set('testLabName', e.target.value)}
                />
              </Field>
              <Field label="Lab NABL Accreditation No." htmlFor="renewal-nabl" span="md:col-span-6">
                <Input
                  id="renewal-nabl"
                  value={form.testLabNablNo}
                  onChange={(e) => set('testLabNablNo', e.target.value)}
                />
              </Field>
              <Field label="Test Result">
                <OptionalSelect
                  label="Test result"
                  value={form.testResult}
                  options={TEST_RESULTS}
                  onChange={(v) => set('testResult', v)}
                />
              </Field>

              <SectionTitle>Factory Inspection</SectionTitle>
              <Field label="Inspection Notice Date" htmlFor="renewal-insp-notice">
                <Input
                  id="renewal-insp-notice"
                  type="date"
                  value={form.inspectionNoticeDate}
                  onChange={(e) => set('inspectionNoticeDate', e.target.value)}
                />
              </Field>
              <Field label="Inspection Date" htmlFor="renewal-insp-date">
                <Input
                  id="renewal-insp-date"
                  type="date"
                  value={form.inspectionDate}
                  onChange={(e) => set('inspectionDate', e.target.value)}
                />
              </Field>
              <Field label="BIS Inspector Name" htmlFor="renewal-inspector">
                <Input
                  id="renewal-inspector"
                  value={form.bisInspectorName}
                  onChange={(e) => set('bisInspectorName', e.target.value)}
                />
              </Field>
              <Field label="Inspection Result">
                <OptionalSelect
                  label="Inspection result"
                  value={form.inspectionResult}
                  options={INSPECTION_RESULTS}
                  onChange={(v) => set('inspectionResult', v)}
                />
              </Field>

              <SectionTitle>Renewal Grant</SectionTitle>
              <Field label="Renewal Granted Date" htmlFor="renewal-granted">
                <Input
                  id="renewal-granted"
                  type="date"
                  value={form.renewalGrantedDate}
                  onChange={(e) => set('renewalGrantedDate', e.target.value)}
                />
              </Field>
              <Field label="New Validity From" htmlFor="renewal-valid-from">
                <Input
                  id="renewal-valid-from"
                  type="date"
                  value={form.newValidityFrom}
                  onChange={(e) => set('newValidityFrom', e.target.value)}
                />
              </Field>
              <Field label="New Validity To" htmlFor="renewal-valid-to">
                <Input
                  id="renewal-valid-to"
                  type="date"
                  value={form.newValidityTo}
                  onChange={(e) => set('newValidityTo', e.target.value)}
                />
              </Field>
              {grantWillUpdateLicense ? (
                <p className="col-span-12 border-l-2 border-emerald-600 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
                  Saving will set the license validity to{' '}
                  <strong>{formatDisplayDate(form.newValidityTo)}</strong> and mark the BIS license as
                  completed.
                </p>
              ) : null}

              <Field label="Notes" htmlFor="renewal-notes" span="md:col-span-12">
                <Textarea
                  id="renewal-notes"
                  rows={4}
                  className="rounded-none border-stone-500 bg-stone-50"
                  placeholder="Any additional notes about this renewal…"
                  value={form.notes}
                  onChange={(e) => set('notes', e.target.value)}
                />
              </Field>
            </div>
          </div>
        </div>

        <div className="flex shrink-0 items-center justify-end gap-2 border-t-2 border-stone-500 bg-stone-100 px-4 py-3 sm:px-6">
          <Button
            type="button"
            variant="outline"
            className="h-8 rounded-none border-stone-500"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            Cancel
          </Button>
          <Button
            type="button"
            className={limsPrimaryBtnClass}
            onClick={onSave}
            disabled={!canSave || saving}
          >
            {saving ? 'Saving…' : editing ? 'Update Renewal' : 'Save Renewal'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
