import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Pencil, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { LimsFieldAddButton, LimsFieldWithAdd } from '@/components/lims/LimsFieldWithAdd'
import { FilterCombobox } from '@/features/sample-handling/receiving/FilterCombobox'
import {
  limsDarkBarGlowStyle,
  limsDialogClass,
  limsPrimaryBtnClass,
  limsRegistryFormClass,
} from '@/lib/limsThemeUi'
import { cn } from '@/lib/utils'
import { IsCodeFilesTable, type IsCodeViewFile } from './IsCodeFilesTable'
import type { IsAspect, IsCodeForm } from './types'
import {
  IS_CODE_UNITS,
  isValidAmendment2,
  isValidYear4,
  canonicalIsNumber,
  toProperTitleCase,
} from './types'

function Field({
  label,
  error,
  className,
  children,
}: {
  label: string
  error?: string | null
  className?: string
  children: ReactNode
}) {
  return (
    <div className={cn('min-w-0 space-y-1', className)}>
      <Label className="text-[11px] font-semibold uppercase tracking-wide text-stone-600">{label}</Label>
      {children}
      {error ? <p className="text-[11px] text-destructive">{error}</p> : null}
    </div>
  )
}

function Section({
  title,
  children,
}: {
  title: string
  children: ReactNode
}) {
  return (
    <section className="overflow-hidden rounded-none border border-stone-400 bg-[#fffcf7]">
      <div className="flex items-center gap-2 border-b border-stone-300 bg-[#f3ebe0] px-3 py-2">
        <span className="h-3.5 w-1 shrink-0 bg-amber-600" aria-hidden />
        <h3 className="text-[11px] font-bold uppercase tracking-[0.14em] text-stone-700">{title}</h3>
      </div>
      <div className="p-3">{children}</div>
    </section>
  )
}

export function IsCodesForm({
  form,
  onChange,
  canSave,
  saveLoading,
  onSave,
  onPickFiles,
  aspectOptions,
  aspectDialogOpen,
  setAspectDialogOpen,
  newAspect,
  setNewAspect,
  onAddAspect,
  onUpdateAspect,
  onDeleteAspect,
  savedFiles = [],
  filesLoading = false,
  filesStatus = null,
  onAddSavedFiles,
  onReplaceSavedFile,
  onDeleteSavedFile,
  filesResetKey = null,
  hideFooter = false,
}: {
  form: IsCodeForm
  onChange: (next: IsCodeForm) => void
  canSave: boolean
  saveLoading: boolean
  onSave: () => void
  onPickFiles: (files: File[]) => void
  aspectOptions: Array<{ id: string; label: string }>
  aspectDialogOpen: boolean
  setAspectDialogOpen: (value: boolean) => void
  newAspect: string
  setNewAspect: (value: string) => void
  onAddAspect: () => void
  onUpdateAspect: (id: string) => void
  onDeleteAspect: (id: string) => void
  savedFiles?: IsCodeViewFile[]
  filesLoading?: boolean
  filesStatus?: string | null
  onAddSavedFiles?: (files: File[]) => void
  onReplaceSavedFile?: (existing: IsCodeViewFile, next: File) => void
  onDeleteSavedFile?: (file: IsCodeViewFile) => void
  filesResetKey?: string | null
  hideFooter?: boolean
}) {
  const [editingAspectId, setEditingAspectId] = useState<string | null>(null)
  const [aspectOpen, setAspectOpen] = useState(false)
  const [unitOpen, setUnitOpen] = useState(false)

  useEffect(() => {
    if (!aspectDialogOpen) setEditingAspectId(null)
  }, [aspectDialogOpen])

  const aspectComboboxOptions = useMemo(() => {
    const labels = Array.from(
      new Set(
        ['Specification', form.aspect, ...aspectOptions.map((x) => x.label)].filter(
          (v) => String(v ?? '').trim().length > 0,
        ),
      ),
    )
    return labels.map((label) => ({ id: label, label }))
  }, [aspectOptions, form.aspect])

  const isNumberRest = form.isNumber.replace(/^is\s*/i, '').trim()
  const isNumberError =
    isNumberRest.length === 0
      ? 'Enter number after IS (e.g. IS 1234)'
      : /^is/i.test(form.isNumber.trim())
        ? null
        : 'Must start with IS'

  const pendingFiles = useMemo(() => {
    const urls: string[] = []
    const rows: IsCodeViewFile[] = form.files.map((file, index) => {
      const url = URL.createObjectURL(file)
      urls.push(url)
      return {
        id: `pending:${index}:${file.name}`,
        file_name: file.name,
        storage_path: '',
        viewUrl: url,
        downloadUrl: url,
        url,
      }
    })
    return { rows, urls }
  }, [form.files])

  useEffect(() => {
    return () => {
      for (const url of pendingFiles.urls) URL.revokeObjectURL(url)
    }
  }, [pendingFiles])

  const filesTableRows = useMemo(
    () => [...savedFiles, ...pendingFiles.rows],
    [savedFiles, pendingFiles.rows],
  )

  const yearError = isValidYear4(form.revisionYear) ? null : 'Year must be up to 4 digits'
  const reaffirmationDisplay =
    form.reaffirmationYear === 'RA' ? 'RA-' : form.reaffirmationYear
  const amendError = isValidAmendment2(form.amendmentNumber) ? null : 'Up to 2 digits'

  return (
    <div className={cn(limsRegistryFormClass, 'flex min-h-0 flex-1 flex-col gap-0')}>
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto overflow-x-hidden border border-stone-400 bg-[#f7f3eb] p-3 sm:p-4">
        <Section title="Identity">
          <div className="grid grid-cols-12 gap-3">
            <Field label="IS Number" error={isNumberError} className="col-span-12 sm:col-span-6 lg:col-span-3">
              <Input
                placeholder="IS 1234"
                value={form.isNumber}
                onChange={(e) => onChange({ ...form, isNumber: e.target.value })}
                onBlur={() => onChange({ ...form, isNumber: canonicalIsNumber(form.isNumber) || 'IS ' })}
              />
            </Field>
            <Field label="Revision Year" error={yearError} className="col-span-6 lg:col-span-3">
              <Input
                inputMode="numeric"
                placeholder="YYYY"
                value={form.revisionYear}
                onChange={(e) =>
                  onChange({
                    ...form,
                    revisionYear: e.target.value.replace(/[^0-9]/g, '').slice(0, 4),
                  })
                }
              />
            </Field>
            <Field label="Reaffirmation" className="col-span-6 lg:col-span-3">
              <Input
                placeholder="RA-2026"
                value={reaffirmationDisplay}
                onChange={(e) => {
                  const raw = e.target.value.toUpperCase()
                  const digits = raw.replace(/^RA-?/, '').replace(/\D/g, '').slice(0, 4)
                  onChange({ ...form, reaffirmationYear: digits ? `RA-${digits}` : 'RA-' })
                }}
                onBlur={() => {
                  if (!form.reaffirmationYear.trim() || form.reaffirmationYear === 'RA') {
                    onChange({ ...form, reaffirmationYear: 'RA-' })
                  }
                }}
              />
            </Field>
            <Field label="Amendment" error={amendError} className="col-span-12 sm:col-span-6 lg:col-span-3">
              <Input
                inputMode="numeric"
                placeholder="01"
                value={form.amendmentNumber}
                onChange={(e) =>
                  onChange({
                    ...form,
                    amendmentNumber: e.target.value.replace(/[^0-9]/g, '').slice(0, 2),
                  })
                }
              />
            </Field>
            <Field label="Part" className="col-span-12 sm:col-span-4">
              <Input className="h-10 min-h-10" value={form.partNo} onChange={(e) => onChange({ ...form, partNo: e.target.value })} />
            </Field>
            <Field label="Section" className="col-span-12 sm:col-span-4">
              <Input className="h-10 min-h-10" value={form.sectionNo} onChange={(e) => onChange({ ...form, sectionNo: e.target.value })} />
            </Field>
            <Field label="Prefix" className="col-span-12 sm:col-span-4">
              <Input className="h-10 min-h-10" placeholder="IS/IEC" value={form.standardPrefix} onChange={(e) => onChange({ ...form, standardPrefix: e.target.value })} />
            </Field>
            <Field label="Technical department" className="col-span-12 sm:col-span-6">
              <Input className="h-10 min-h-10" value={form.technicalDepartment} onChange={(e) => onChange({ ...form, technicalDepartment: e.target.value })} />
            </Field>
            <Field label="Technical committee" className="col-span-12 sm:col-span-6">
              <Input className="h-10 min-h-10" value={form.technicalCommittee} onChange={(e) => onChange({ ...form, technicalCommittee: e.target.value })} />
            </Field>
            <Field label="ICS" className="col-span-12 sm:col-span-4">
              <Input className="h-10 min-h-10" value={form.icsCode} onChange={(e) => onChange({ ...form, icsCode: e.target.value })} />
            </Field>
            <Field label="Certification" className="col-span-12 sm:col-span-4">
              <Select value={form.certificationCategory || 'none'} onValueChange={(v) => onChange({ ...form, certificationCategory: v === 'none' ? '' : v })}>
                <SelectTrigger className="h-10 min-h-10" aria-label="Certification category">
                  <SelectValue placeholder="Certification" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Not set</SelectItem>
                  <SelectItem value="Voluntary">Voluntary</SelectItem>
                  <SelectItem value="Compulsory">Compulsory</SelectItem>
                  <SelectItem value="Not certifiable">Not certifiable</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label="Status" className="col-span-12 sm:col-span-4">
              <Select value={form.standardStatus || 'none'} onValueChange={(v) => onChange({ ...form, standardStatus: v === 'none' ? '' : v })}>
                <SelectTrigger className="h-10 min-h-10" aria-label="Standard status">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Not set</SelectItem>
                  <SelectItem value="Current">Current</SelectItem>
                  <SelectItem value="Withdrawn">Withdrawn</SelectItem>
                  <SelectItem value="Superseded">Superseded</SelectItem>
                  <SelectItem value="Draft">Draft</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label="Title of the IS Code" className="col-span-12">
              <Input
                placeholder="Enter IS Code Title"
                value={form.title}
                onChange={(e) => onChange({ ...form, title: e.target.value })}
                onBlur={() => {
                  const next = toProperTitleCase(form.title)
                  if (next !== form.title) onChange({ ...form, title: next })
                }}
              />
            </Field>
          </div>
        </Section>

        <Section title="Classification & Charges">
          <div className="grid grid-cols-12 gap-3">
            <Field label="Aspect of IS" className="col-span-12 sm:col-span-6 lg:col-span-3">
              <Dialog open={aspectDialogOpen} onOpenChange={setAspectDialogOpen}>
                <LimsFieldWithAdd
                  addButton={
                    <DialogTrigger asChild>
                      <LimsFieldAddButton aria-label="Add aspect" />
                    </DialogTrigger>
                  }
                >
                  <FilterCombobox
                    value={form.aspect || 'Specification'}
                    onValueChange={(v) =>
                      onChange({ ...form, aspect: (v || 'Specification') as IsAspect })
                    }
                    options={aspectComboboxOptions}
                    onSelectOption={(opt) => onChange({ ...form, aspect: opt.label as IsAspect })}
                    open={aspectOpen}
                    onOpenChange={setAspectOpen}
                    placeholder="Type or select Aspect"
                    listId="is-code-aspect-combobox"
                    inputId="aspect-of-is"
                    inputClassName="h-10"
                  />
                </LimsFieldWithAdd>
                <DialogContent
                  persistOnFocusLoss
                  layer="nested"
                  aria-describedby={undefined}
                  className={cn(limsDialogClass, 'max-w-lg')}
                >
                  <div className="relative overflow-hidden bg-gradient-to-br from-stone-800 via-stone-900 to-stone-950 px-4 py-2.5 text-white">
                    <div
                      className="pointer-events-none absolute inset-0 opacity-[0.18]"
                      style={limsDarkBarGlowStyle}
                    />
                    <div className="absolute bottom-0 left-0 h-[2px] w-full bg-gradient-to-r from-amber-500 via-amber-300 to-transparent" />
                    <DialogHeader className="relative pr-10 text-left">
                      <DialogTitle className="text-base font-semibold tracking-tight text-white">
                        Manage Aspects
                      </DialogTitle>
                    </DialogHeader>
                  </div>
                  <div className="space-y-4 bg-gradient-to-b from-stone-100/80 to-white px-4 py-4">
                    <div className="space-y-2">
                      <Label htmlFor="new-aspect">
                        {editingAspectId ? 'Edit Aspect' : 'Add Aspect'}
                      </Label>
                      <Input
                        id="new-aspect"
                        placeholder="e.g., Specification"
                        value={newAspect}
                        onChange={(e) => setNewAspect(e.target.value)}
                      />
                    </div>
                    <div>
                      <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-stone-600">
                        Existing
                      </p>
                      <div className="max-h-40 space-y-1 overflow-auto">
                        {aspectOptions.map((a) => (
                          <div
                            key={a.id}
                            className="flex items-center justify-between rounded-none border border-stone-500 bg-stone-50 px-3 py-1.5 text-sm text-black"
                          >
                            <span className="min-w-0 truncate">{a.label}</span>
                            <div className="flex shrink-0 items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingAspectId(a.id)
                                  setNewAspect(a.label)
                                  window.requestAnimationFrame(() => {
                                    document.getElementById('new-aspect')?.focus()
                                  })
                                }}
                                className="text-amber-800 hover:text-amber-950"
                                aria-label={`Edit ${a.label}`}
                              >
                                <Pencil size={14} />
                              </button>
                              {aspectOptions.length > 1 ? (
                                <button
                                  type="button"
                                  onClick={() => onDeleteAspect(a.id)}
                                  className="text-red-600 hover:text-red-800"
                                  aria-label={`Delete ${a.label}`}
                                >
                                  <Trash2 size={14} />
                                </button>
                              ) : null}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                  <DialogFooter className="border-t border-stone-200 bg-stone-50 px-4 py-3 sm:justify-end">
                    <Button
                      type="button"
                      className={limsPrimaryBtnClass}
                      onClick={() => {
                        if (editingAspectId) onUpdateAspect(editingAspectId)
                        else onAddAspect()
                      }}
                      disabled={!newAspect.trim()}
                    >
                      Save & Close
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </Field>
            <Field label="Unit of IS" className="col-span-12 sm:col-span-6 lg:col-span-3">
              <FilterCombobox
                value={form.unitOfIs || 'Tonne'}
                onValueChange={(v) => onChange({ ...form, unitOfIs: v || 'Tonne' })}
                options={IS_CODE_UNITS.map((u) => ({ id: u, label: u }))}
                onSelectOption={(opt) => onChange({ ...form, unitOfIs: opt.label })}
                open={unitOpen}
                onOpenChange={setUnitOpen}
                placeholder="Type or select Unit"
                listId="is-code-unit-combobox"
                inputId="unit-of-is"
                inputClassName="h-10"
              />
            </Field>
            <Field label="Product Manual No." className="col-span-12 sm:col-span-6 lg:col-span-3">
              <Input
                placeholder="e.g. PM/ IS 17425/ 1"
                value={form.productManualNumber}
                onChange={(e) => onChange({ ...form, productManualNumber: e.target.value })}
              />
            </Field>
            <Field label="Testing Charges (₹)" className="col-span-12 sm:col-span-6 lg:col-span-3">
              <Input
                inputMode="decimal"
                placeholder="0.00"
                value={form.testingCharges}
                onChange={(e) =>
                  onChange({ ...form, testingCharges: e.target.value.replace(/[^0-9.]/g, '') })
                }
              />
            </Field>
          </div>
        </Section>

        <Section title="Minimum Marking Fee (₹)">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {(
              [
                { key: 'mmfLargeScale' as const, label: 'Large Scale' },
                { key: 'mmfMediumScale' as const, label: 'Medium Scale' },
                { key: 'mmfSmallScale' as const, label: 'Small Scale' },
                { key: 'mmfMicroScale' as const, label: 'Micro Scale' },
              ] as const
            ).map(({ key, label }) => (
              <Field key={key} label={label}>
                <Input
                  inputMode="decimal"
                  placeholder="0.00"
                  value={form[key] ?? ''}
                  onChange={(e) =>
                    onChange({ ...form, [key]: e.target.value.replace(/[^0-9.]/g, '') })
                  }
                />
              </Field>
            ))}
          </div>
        </Section>

        <Section title="Quantity Slabs">
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
            {(
              [
                {
                  qtyKey: 'slab1Quantity' as const,
                  rateKey: 'slab1Rate' as const,
                  title: 'Slab 1',
                },
                {
                  qtyKey: 'slab2Quantity' as const,
                  rateKey: 'slab2Rate' as const,
                  title: 'Slab 2',
                },
                {
                  qtyKey: 'slab3Quantity' as const,
                  rateKey: 'slab3Rate' as const,
                  title: 'Slab 3',
                },
              ] as const
            ).map(({ qtyKey, rateKey, title }) => (
              <div
                key={qtyKey}
                className="grid grid-cols-2 gap-2 rounded-none border border-stone-300 bg-stone-50/80 p-2.5"
              >
                <p className="col-span-2 text-[10px] font-bold uppercase tracking-[0.12em] text-amber-900/80">
                  {title}
                </p>
                <Field label="Quantity">
                  <Input
                    placeholder="Quantity band"
                    value={form[qtyKey] ?? ''}
                    onChange={(e) => onChange({ ...form, [qtyKey]: e.target.value })}
                  />
                </Field>
                <Field label="Rate">
                  <Input
                    inputMode="decimal"
                    placeholder="0.00"
                    value={form[rateKey] ?? ''}
                    onChange={(e) =>
                      onChange({ ...form, [rateKey]: e.target.value.replace(/[^0-9.]/g, '') })
                    }
                  />
                </Field>
              </div>
            ))}
          </div>
        </Section>

        <Section title="Amendments">
          <div className="space-y-2">
            {form.amendments.map((row, index) => (
              <div key={row.id ?? `amend-${index}`} className="grid grid-cols-12 gap-2">
                <Input className="col-span-12 h-10 min-h-10 sm:col-span-2" aria-label="Amendment number" placeholder="No." value={row.amendmentNo} onChange={(e) => {
                  const amendments = form.amendments.map((item, i) => i === index ? { ...item, amendmentNo: e.target.value } : item)
                  onChange({ ...form, amendments })
                }} />
                <Input className="col-span-12 h-10 min-h-10 sm:col-span-3" type="date" aria-label="Amendment date" value={row.issuedOn} onChange={(e) => {
                  const amendments = form.amendments.map((item, i) => i === index ? { ...item, issuedOn: e.target.value } : item)
                  onChange({ ...form, amendments })
                }} />
                <Input className="col-span-12 h-10 min-h-10 sm:col-span-6" aria-label="Amendment summary" placeholder="Summary" value={row.summary} onChange={(e) => {
                  const amendments = form.amendments.map((item, i) => i === index ? { ...item, summary: e.target.value } : item)
                  onChange({ ...form, amendments })
                }} />
                <Button type="button" variant="outline" className="col-span-12 h-10 min-h-10 sm:col-span-1" onClick={() => onChange({ ...form, amendments: form.amendments.filter((_, i) => i !== index) })}>
                  Remove
                </Button>
              </div>
            ))}
            <Button type="button" variant="outline" className="h-10 min-h-10" onClick={() => onChange({ ...form, amendments: [...form.amendments, { amendmentNo: '', issuedOn: '', summary: '' }] })}>
              Add amendment
            </Button>
          </div>
        </Section>

        <Section title="IS Code Files">
          <IsCodeFilesTable
            files={filesTableRows}
            loading={filesLoading}
            busy={saveLoading}
            status={filesStatus}
            resetKey={filesResetKey}
            scrollClassName="max-h-[min(36vh,320px)]"
            onAddFiles={(picked) => {
              if (onAddSavedFiles) {
                onAddSavedFiles(picked)
                return
              }
              onPickFiles([...form.files, ...picked])
            }}
            onReplaceFile={(existing, next) => {
              if (existing.id.startsWith('pending:')) {
                const idx = Number(existing.id.split(':')[1] ?? -1)
                if (!Number.isFinite(idx) || idx < 0) return
                const nextPending = form.files.slice()
                nextPending[idx] = next
                onPickFiles(nextPending)
                return
              }
              onReplaceSavedFile?.(existing, next)
            }}
            onDeleteFile={(file) => {
              if (file.id.startsWith('pending:')) {
                const idx = Number(file.id.split(':')[1] ?? -1)
                if (!Number.isFinite(idx) || idx < 0) return
                onPickFiles(form.files.filter((_, i) => i !== idx))
                return
              }
              onDeleteSavedFile?.(file)
            }}
          />
        </Section>
      </div>

      {!hideFooter ? (
        <div className="flex shrink-0 items-center justify-end gap-2 border border-t-0 border-stone-400 bg-stone-50 px-3 py-2.5 sm:px-4">
          <Button
            type="button"
            className={cn(limsPrimaryBtnClass, 'h-9 px-4')}
            onClick={onSave}
            disabled={!canSave || saveLoading}
          >
            {saveLoading ? 'Saving…' : 'Save & Close'}
          </Button>
        </div>
      ) : null}
    </div>
  )
}
