import { useEffect, useMemo, useState } from 'react'
import { Eye, FileUp, Pencil, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
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
import type { IsAspect, IsCodeForm } from './types'
import { isValidAmendment2, isValidYear4, toProperTitleCase } from './types'

const fileIconBtnClass =
  'inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-none border border-stone-500 bg-stone-50 text-stone-800 shadow-none transition-colors hover:bg-stone-100 hover:text-stone-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/20'

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
  onOpenFiles,
  onDeleteFiles,
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
  onOpenFiles: () => void
  onDeleteFiles: () => void
  /** When true, omit in-form Save (parent dialog provides footer). */
  hideFooter?: boolean
}) {
  const [editingAspectId, setEditingAspectId] = useState<string | null>(null)
  const [aspectOpen, setAspectOpen] = useState(false)

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

  const yearError = isValidYear4(form.revisionYear) ? null : 'Year must be up to 4 digits'
  const raError =
    form.reaffirmationYear.trim().length === 0 || /^RA[0-9]{0,4}$/.test(form.reaffirmationYear.trim())
      ? null
      : 'Use RA + Year (e.g. RA2026)'
  const amendError = isValidAmendment2(form.amendmentNumber) ? null : 'Up to 2 digits'

  return (
    <div className={limsRegistryFormClass}>
      <div className="space-y-5">
        <div className="grid grid-cols-12 gap-4">
          <div className="col-span-12 space-y-2 md:col-span-3">
            <Label>IS Number</Label>
            <Input
              placeholder="IS 1234"
              value={form.isNumber}
              onChange={(e) => onChange({ ...form, isNumber: e.target.value })}
            />
          </div>

          <div className="col-span-12 space-y-2 md:col-span-3">
            <Label>Revision of Year</Label>
            <Input
              inputMode="numeric"
              placeholder="YYYY"
              value={form.revisionYear}
              onChange={(e) =>
                onChange({ ...form, revisionYear: e.target.value.replace(/[^0-9]/g, '').slice(0, 4) })
              }
            />
            {yearError ? <p className="text-xs text-destructive">{yearError}</p> : null}
          </div>

          <div className="col-span-12 space-y-2 md:col-span-3">
            <Label>Reaffirmation Year</Label>
            <Input
              placeholder="RA2026"
              value={form.reaffirmationYear}
              onChange={(e) => {
                const v = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '')
                const next = v.startsWith('RA') ? v : `RA${v.replace(/^RA/, '')}`
                onChange({ ...form, reaffirmationYear: next.slice(0, 6) })
              }}
            />
            {raError ? <p className="text-xs text-destructive">{raError}</p> : null}
          </div>

          <div className="col-span-12 space-y-2 md:col-span-3">
            <Label>Amendment Number</Label>
            <Input
              inputMode="numeric"
              placeholder="01"
              value={form.amendmentNumber}
              onChange={(e) =>
                onChange({ ...form, amendmentNumber: e.target.value.replace(/[^0-9]/g, '').slice(0, 2) })
              }
            />
            {amendError ? <p className="text-xs text-destructive">{amendError}</p> : null}
          </div>

          <div className="col-span-12 space-y-2">
            <Label>Title of the IS Code</Label>
            <Input
              placeholder="Enter IS Code Title"
              value={form.title}
              onChange={(e) => onChange({ ...form, title: e.target.value })}
              onBlur={() => {
                const next = toProperTitleCase(form.title)
                if (next !== form.title) onChange({ ...form, title: next })
              }}
            />
          </div>

          <div className="col-span-12 space-y-2 md:col-span-3">
            <Label>Aspact of IS</Label>
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
                  onValueChange={(v) => onChange({ ...form, aspect: (v || 'Specification') as IsAspect })}
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
                  <div className="pointer-events-none absolute inset-0 opacity-[0.18]" style={limsDarkBarGlowStyle} />
                  <div className="absolute bottom-0 left-0 h-[2px] w-full bg-gradient-to-r from-amber-500 via-amber-300 to-transparent" />
                  <DialogHeader className="relative pr-10 text-left">
                    <DialogTitle className="text-base font-semibold tracking-tight text-white">
                      Manage Aspects
                    </DialogTitle>
                  </DialogHeader>
                </div>
                <div className="space-y-4 bg-gradient-to-b from-stone-100/80 to-white px-4 py-4">
                  <div className="space-y-2">
                    <Label htmlFor="new-aspect">{editingAspectId ? 'Edit Aspect' : 'Add Aspect'}</Label>
                    <Input
                      id="new-aspect"
                      placeholder="e.g., Specification"
                      value={newAspect}
                      onChange={(e) => setNewAspect(e.target.value)}
                    />
                  </div>
                  <div>
                    <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-stone-600">Existing</p>
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
          </div>

          <div className="col-span-12 space-y-2 md:col-span-3">
            <Label>Testing Charges</Label>
            <Input
              inputMode="decimal"
              placeholder="0.00"
              value={form.testingCharges}
              onChange={(e) => onChange({ ...form, testingCharges: e.target.value.replace(/[^0-9.]/g, '') })}
            />
          </div>

          <div className="col-span-12 space-y-2 md:col-span-3">
            <Label>Remarks</Label>
            <Input
              placeholder="Enter Remarks"
              value={form.remarks}
              onChange={(e) => onChange({ ...form, remarks: e.target.value })}
            />
          </div>

          <div className="col-span-12 space-y-2 md:col-span-3">
            <Label>IS Code Files</Label>
            <div className="flex items-center justify-center gap-1.5">
              <button
                type="button"
                className={cn(fileIconBtnClass, 'text-amber-800 hover:text-amber-950')}
                aria-label="Upload files"
                title="Upload"
                onClick={() => {
                  const input = document.createElement('input')
                  input.type = 'file'
                  input.multiple = true
                  input.accept = '.pdf,.png,.jpg,.jpeg,.doc,.docx,application/pdf,image/png,image/jpeg'
                  input.onchange = () => {
                    const list = Array.from(input.files ?? [])
                    onPickFiles(list)
                  }
                  input.click()
                }}
              >
                <FileUp size={16} aria-hidden />
              </button>
              <button
                type="button"
                className={fileIconBtnClass}
                aria-label="View files"
                title="View"
                onClick={onOpenFiles}
              >
                <Eye size={16} aria-hidden />
              </button>
              <button
                type="button"
                className={cn(fileIconBtnClass, 'text-red-700 hover:bg-red-50 hover:text-red-800')}
                aria-label="Delete files"
                title="Delete"
                onClick={onDeleteFiles}
              >
                <Trash2 size={16} aria-hidden />
              </button>
              {form.files.length > 0 ? (
                <span className="min-w-0 truncate text-[11px] font-medium text-stone-600">
                  {form.files.length} selected
                </span>
              ) : null}
            </div>
          </div>
        </div>
      </div>

      {!hideFooter ? (
        <div className="mt-3 flex items-center justify-end gap-2 border-t border-stone-200 pt-2.5">
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
