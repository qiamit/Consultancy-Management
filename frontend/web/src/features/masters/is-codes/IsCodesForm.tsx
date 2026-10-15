import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogTrigger } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { LimsFieldAddButton, LimsFieldWithAdd } from '@/components/lims/LimsFieldWithAdd'
import { ClientManageDialogContent } from '@/features/masters/clients/ClientManageDialogContent'
import { FilterCombobox } from '@/features/sample-handling/receiving/FilterCombobox'
import { supabase } from '@/lib/supabaseClient'
import { limsPrimaryBtnClass, limsRegistryFormClass } from '@/lib/limsThemeUi'
import { getCurrencyCode, getCurrencySymbol } from '@/lib/appCurrency'
import { formatMoneyInput, sanitizeMoneyInput } from '@/features/masters/products-services/types'
import { cn } from '@/lib/utils'
import { IsCodeFilesTable, type IsCodeViewFile } from './IsCodeFilesTable'
import { normalizeIsUnitLabel } from './unitLabels'
import {
  isCodeNumberDigits,
  isCodeFileDocumentKind,
  isValidAmendment2,
  isValidYear4,
  amendmentToFormStr,
  amendmentWhileTyping,
  partToFormStr,
  partWhileTyping,
  sectionToFormStr,
  sectionWhileTyping,
  reaffirmationToFormStr,
  setIsCodeFileDocumentKind,
  toProperTitleCase,
  type IsAspect,
  type IsCodeForm,
} from './types'

type IdentityOptionCategory =
  | 'standard_prefix'
  | 'part_no'
  | 'section_no'
  | 'revision_year'
  | 'amendment_number'
  | 'reaffirmation_year'
  | 'unit_of_is'

const IDENTITY_OPTION_CATEGORIES: IdentityOptionCategory[] = [
  'standard_prefix',
  'part_no',
  'section_no',
  'revision_year',
  'amendment_number',
  'reaffirmation_year',
  'unit_of_is',
]

const IDENTITY_OPTION_META: Record<
  IdentityOptionCategory,
  { title: string; addLabel: string; placeholder: string }
> = {
  standard_prefix: { title: 'Manage Prefixes', addLabel: 'Add Prefix', placeholder: 'e.g., IS' },
  part_no: { title: 'Manage Parts', addLabel: 'Add Part', placeholder: 'e.g., Part-0' },
  section_no: { title: 'Manage Sections', addLabel: 'Add Section', placeholder: 'e.g., Sec-0' },
  revision_year: { title: 'Manage Revision Years', addLabel: 'Add Revision Year', placeholder: 'e.g., 2026' },
  amendment_number: { title: 'Manage Amendments', addLabel: 'Add Amendment', placeholder: 'e.g., 00' },
  reaffirmation_year: { title: 'Manage Reaffirmations', addLabel: 'Add Reaffirmation', placeholder: 'e.g., RA-2026' },
  unit_of_is: { title: 'Manage Units', addLabel: 'Add Unit', placeholder: 'e.g., Tonne' },
}

function normalizeIdentityOption(category: IdentityOptionCategory, raw: string): string {
  const text = raw.trim()
  if (category === 'revision_year') return text.replace(/\D/g, '').slice(0, 4)
  if (category === 'unit_of_is') return normalizeIsUnitLabel(text)
  if (category === 'amendment_number') {
    const next = amendmentToFormStr(text)
    return next === '00' ? '' : next
  }
  if (category === 'part_no') {
    const next = partToFormStr(text)
    return next === 'Part-0' ? '' : next
  }
  if (category === 'section_no') {
    const next = sectionToFormStr(text)
    return next === 'Sec-0' ? '' : next
  }
  if (category === 'reaffirmation_year') {
    const next = reaffirmationToFormStr(text)
    return next === 'RA-' ? '' : next
  }
  return text
}

function CurrencyAmountField({
  value,
  onChange,
  name,
}: {
  value: string
  onChange: (value: string) => void
  name: string
}) {
  const [focused, setFocused] = useState(false)
  const displayValue = focused ? value : formatMoneyInput(value || '0')

  return (
    <div className="flex h-8 w-full min-w-0 overflow-hidden rounded-none border border-stone-500 bg-stone-50 focus-within:border-amber-600 focus-within:bg-white focus-within:ring-2 focus-within:ring-amber-500/20">
      <span
        className="inline-flex shrink-0 items-center border-r border-stone-500 bg-stone-100 px-2.5 text-sm font-semibold text-stone-700"
        aria-hidden
      >
        {getCurrencySymbol()}
      </span>
      <Input
        type="text"
        inputMode="decimal"
        value={displayValue}
        onFocus={() => setFocused(true)}
        onChange={(e) => onChange(sanitizeMoneyInput(e.target.value))}
        onBlur={(e) => {
          setFocused(false)
          onChange(formatMoneyInput(e.target.value || '0'))
        }}
        placeholder="0.00"
        className="h-full min-w-0 flex-1 rounded-none !border-0 !bg-transparent text-right tabular-nums shadow-none focus-visible:!ring-0"
        aria-label={`${name} in ${getCurrencyCode()}`}
      />
    </div>
  )
}

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
  onDocumentKindChange,
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
  onDocumentKindChange?: (file: IsCodeViewFile, kind: string) => void
  filesResetKey?: string | null
  hideFooter?: boolean
}) {
  const [aspectOpen, setAspectOpen] = useState(false)

  const pendingFiles = useMemo(() => {
    const urls: string[] = []
    const rows: IsCodeViewFile[] = form.files.map((file, index) => {
      const url = URL.createObjectURL(file)
      urls.push(url)
      return {
        id: `pending:${index}:${file.name}`,
        file_name: file.name,
        storage_path: '',
        document_kind: isCodeFileDocumentKind(file) || null,
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
  const [identityOptions, setIdentityOptions] = useState<
    Record<IdentityOptionCategory, Array<{ id: string; label: string }>>
  >({
    standard_prefix: [],
    part_no: [],
    section_no: [],
    revision_year: [],
    amendment_number: [],
    reaffirmation_year: [],
    unit_of_is: [],
  })
  const [openIdentityKey, setOpenIdentityKey] = useState<IdentityOptionCategory | null>(null)
  const [identityDialogOpen, setIdentityDialogOpen] = useState(false)
  const [identityDialogCategory, setIdentityDialogCategory] = useState<IdentityOptionCategory>('standard_prefix')
  const [newIdentityOption, setNewIdentityOption] = useState('')

  useEffect(() => {
    let cancelled = false
    void supabase
      .from('is_code_master_options')
      .select('id, label, category')
      .in('category', IDENTITY_OPTION_CATEGORIES)
      .order('label', { ascending: true })
      .then(({ data }) => {
        if (cancelled || !Array.isArray(data)) return
        const next: Record<IdentityOptionCategory, Array<{ id: string; label: string }>> = {
          standard_prefix: [],
          part_no: [],
          section_no: [],
          revision_year: [],
          amendment_number: [],
          reaffirmation_year: [],
          unit_of_is: [],
        }
        for (const row of data as Array<{ id: string; label: string; category: string }>) {
          const category = row.category as IdentityOptionCategory
          if (!next[category] || !row.label.trim()) continue
          next[category].push({ id: row.id, label: row.label.trim() })
        }
        for (const category of IDENTITY_OPTION_CATEGORIES) {
          next[category].sort((a, b) => a.label.localeCompare(b.label))
        }
        setIdentityOptions(next)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const applyIdentityOption = (category: IdentityOptionCategory, label: string) => {
    const next = normalizeIdentityOption(category, label)
    if (category === 'standard_prefix') onChange({ ...form, standardPrefix: next || 'IS' })
    else if (category === 'part_no') onChange({ ...form, partNo: partWhileTyping(label) })
    else if (category === 'section_no') onChange({ ...form, sectionNo: sectionWhileTyping(label) })
    else if (category === 'revision_year') onChange({ ...form, revisionYear: next })
    else if (category === 'amendment_number') onChange({ ...form, amendmentNumber: amendmentWhileTyping(form.amendmentNumber, label) })
    else if (category === 'unit_of_is') onChange({ ...form, unitOfIs: next })
    else onChange({ ...form, reaffirmationYear: next || 'RA-' })
  }

  const identityValue = (category: IdentityOptionCategory) => {
    if (category === 'standard_prefix') return form.standardPrefix.trim() || 'IS'
    if (category === 'part_no') return form.partNo || 'Part-0'
    if (category === 'section_no') return form.sectionNo || 'Sec-0'
    if (category === 'revision_year') return form.revisionYear
    if (category === 'amendment_number') return form.amendmentNumber
    if (category === 'unit_of_is') return form.unitOfIs
    return reaffirmationDisplay
  }

  const rememberIdentityOption = async (label: string, id?: string, close = true) => {
    const name = normalizeIdentityOption(identityDialogCategory, label)
    if (!name) return
    const list = identityOptions[identityDialogCategory]
    const previous = id ? list.find((item) => item.id === id)?.label ?? '' : ''
    if (id) {
      const { error } = await supabase
        .from('is_code_master_options')
        .update({ label: name, value: name })
        .eq('id', id)
      if (error) return
      if (identityDialogCategory === 'unit_of_is' && previous && previous !== name) {
        const { error: isCodeError } = await supabase
          .from('is_codes')
          .update({ unit_of_is: name })
          .eq('unit_of_is', previous)
        if (isCodeError) return
      }
      setIdentityOptions((prev) => ({
        ...prev,
        [identityDialogCategory]: prev[identityDialogCategory]
          .map((item) => (item.id === id ? { ...item, label: name } : item))
          .sort((a, b) => a.label.localeCompare(b.label)),
      }))
      if (previous && previous !== name && identityValue(identityDialogCategory) === previous) {
        applyIdentityOption(identityDialogCategory, name)
      }
    } else {
      const existing = list.find((item) => item.label.toLowerCase() === name.toLowerCase())
      if (!existing) {
        const { data, error } = await supabase
          .from('is_code_master_options')
          .insert({ category: identityDialogCategory, label: name, value: name })
          .select('id')
          .single()
        if (error) return
        const nextId = (data as { id: string } | null)?.id ?? `tmp-${name}`
        setIdentityOptions((prev) => ({
          ...prev,
          [identityDialogCategory]: [...prev[identityDialogCategory], { id: nextId, label: name }].sort((a, b) =>
            a.label.localeCompare(b.label),
          ),
        }))
      }
    }
    applyIdentityOption(identityDialogCategory, name)
    setNewIdentityOption('')
    if (close) setIdentityDialogOpen(false)
  }

  const identityDialogMeta = IDENTITY_OPTION_META[identityDialogCategory]

  const renderIdentityOption = (
    category: IdentityOptionCategory,
    label: string,
    placeholder: string,
    error?: string | null,
  ) => {
    const value = identityValue(category)
    const query = value.trim().toLowerCase()
    return (
      <Field key={category} label={label} error={error}>
        <LimsFieldWithAdd
          addButton={
            <DialogTrigger asChild>
              <LimsFieldAddButton
                aria-label={`Add ${label}`}
                title={`Add ${label}`}
                onClick={() => {
                  setIdentityDialogCategory(category)
                  setNewIdentityOption(normalizeIdentityOption(category, value))
                }}
              />
            </DialogTrigger>
          }
        >
          <FilterCombobox
            value={value}
            onValueChange={(next) => applyIdentityOption(category, next)}
            options={identityOptions[category]
              .map((item) => ({
                id: item.id,
                label:
                  category === 'part_no'
                    ? partToFormStr(item.label)
                    : category === 'section_no'
                      ? sectionToFormStr(item.label)
                      : item.label,
              }))
              .filter((item) => !query || item.label.toLowerCase().includes(query))}
            onSelectOption={(option) => applyIdentityOption(category, option.label)}
            open={openIdentityKey === category}
            onOpenChange={(open) => {
              setOpenIdentityKey(open ? category : null)
              if (open) return
              if (category === 'standard_prefix') {
                onChange({ ...form, standardPrefix: form.standardPrefix.trim() || 'IS' })
                return
              }
              if (category === 'part_no') {
                onChange({ ...form, partNo: partToFormStr(form.partNo) })
                return
              }
              if (category === 'section_no') {
                onChange({ ...form, sectionNo: sectionToFormStr(form.sectionNo) })
                return
              }
              if (category === 'amendment_number') {
                onChange({ ...form, amendmentNumber: amendmentToFormStr(form.amendmentNumber) })
                return
              }
              if (category !== 'reaffirmation_year') return
              if (!form.reaffirmationYear.trim() || form.reaffirmationYear === 'RA') {
                onChange({ ...form, reaffirmationYear: 'RA-' })
              }
            }}
            placeholder={placeholder}
            showSerialNumbers={false}
            listId={`is-identity-${category}`}
            inputId={`is-identity-${category}`}
            inputClassName="h-8 border-0 bg-transparent px-2 shadow-none focus-visible:ring-0"
          />
        </LimsFieldWithAdd>
      </Field>
    )
  }

  return (
    <div className={cn(limsRegistryFormClass, 'flex min-h-0 flex-1 flex-col gap-0')}>
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto overflow-x-hidden border border-stone-400 bg-[#f7f3eb] p-3 sm:p-4">
        <Dialog open={identityDialogOpen} onOpenChange={setIdentityDialogOpen}>
        <div className="space-y-3">
          <div className="grid grid-cols-1 items-start gap-3 sm:grid-cols-2 xl:grid-cols-7">
            {renderIdentityOption('standard_prefix', 'Prefix', 'IS')}
            <Field label="IS Number">
              <Input
                inputMode="numeric"
                placeholder="12345"
                value={form.isNumber}
                onChange={(e) =>
                  onChange({ ...form, isNumber: isCodeNumberDigits(e.target.value) })
                }
              />
            </Field>
            {renderIdentityOption('part_no', 'Part', 'Part-0')}
            {renderIdentityOption('section_no', 'Section', 'Sec-0')}
            {renderIdentityOption('revision_year', 'Revision Year', 'YYYY', yearError)}
            {renderIdentityOption('amendment_number', 'Amendment', '00', amendError)}
            {renderIdentityOption('reaffirmation_year', 'Reaffirmation', 'RA-2026')}
          </div>
          <ClientManageDialogContent
            open={identityDialogOpen}
            title={identityDialogMeta.title}
            addLabel={identityDialogMeta.addLabel}
            inputId={`new-is-identity-${identityDialogCategory}`}
            placeholder={identityDialogMeta.placeholder}
            value={newIdentityOption}
            onValueChange={setNewIdentityOption}
            inlineAdd
            onInlineAdd={() => void rememberIdentityOption(newIdentityOption, undefined, false)}
            onSave={() => void rememberIdentityOption(newIdentityOption)}
            onUpdate={(id) => void rememberIdentityOption(newIdentityOption, id)}
            saveDisabled={!normalizeIdentityOption(identityDialogCategory, newIdentityOption)}
            items={identityOptions[identityDialogCategory].map((item) =>
              identityDialogCategory === 'part_no'
                ? { ...item, label: partToFormStr(item.label) }
                : identityDialogCategory === 'section_no'
                  ? { ...item, label: sectionToFormStr(item.label) }
                  : item,
            )}
            canDelete={() => true}
            onDelete={(id) => {
              if (id.startsWith('tmp-')) {
                setIdentityOptions((prev) => ({
                  ...prev,
                  [identityDialogCategory]: prev[identityDialogCategory].filter((item) => item.id !== id),
                }))
                return
              }
              void supabase
                .from('is_code_master_options')
                .delete()
                .eq('id', id)
                .then(({ error }) => {
                  if (error) return
                  setIdentityOptions((prev) => ({
                    ...prev,
                    [identityDialogCategory]: prev[identityDialogCategory].filter((item) => item.id !== id),
                  }))
                })
            }}
          />
          <div className="grid grid-cols-1 items-start gap-3 sm:grid-cols-2 xl:grid-cols-7">
            <Field label="Title of the IS Code" className="sm:col-span-2 xl:col-span-5">
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
            <Field label="Product Manual No." className="sm:col-span-2 xl:col-span-2">
              <Input
                placeholder="PM / IS 17425 / 1 / Apr 2026"
                value={form.productManualNumber}
                onChange={(e) => onChange({ ...form, productManualNumber: e.target.value })}
              />
            </Field>
          </div>
        </div>

        <div>
          <div className="grid grid-cols-1 items-start gap-3 sm:grid-cols-2 xl:grid-cols-7">
            <Field label="Aspect of IS">
              <Dialog open={aspectDialogOpen} onOpenChange={setAspectDialogOpen}>
                <LimsFieldWithAdd
                  addButton={
                    <DialogTrigger asChild>
                      <LimsFieldAddButton aria-label="Add aspect" />
                    </DialogTrigger>
                  }
                >
                  <FilterCombobox
                    value={form.aspect.trim() || 'Specification'}
                    onValueChange={(v) =>
                      onChange({ ...form, aspect: (v.trim() || 'Specification') as IsAspect })
                    }
                    options={aspectOptions.map((item) => ({ id: item.id, label: item.label }))}
                    onSelectOption={(opt) => onChange({ ...form, aspect: opt.label })}
                    open={aspectOpen}
                    onOpenChange={(open) => {
                      setAspectOpen(open)
                      if (open || form.aspect.trim()) return
                      onChange({ ...form, aspect: 'Specification' })
                    }}
                    placeholder="Type or select Aspect"
                    listId="is-code-aspect-combobox"
                    inputId="aspect-of-is"
                    inputClassName="h-8 border-0 bg-transparent px-2 shadow-none focus-visible:ring-0"
                  />
                </LimsFieldWithAdd>
                <ClientManageDialogContent
                  open={aspectDialogOpen}
                  title="Manage Aspects"
                  addLabel="Add Aspect"
                  inputId="new-aspect"
                  placeholder="e.g., Specification"
                  value={newAspect}
                  onValueChange={setNewAspect}
                  inlineAdd
                  onInlineAdd={onAddAspect}
                  onSave={onAddAspect}
                  onUpdate={onUpdateAspect}
                  saveDisabled={!newAspect.trim()}
                  items={aspectOptions}
                  canDelete={() => true}
                  onDelete={onDeleteAspect}
                  layer="nested"
                />
              </Dialog>
            </Field>
            {renderIdentityOption('unit_of_is', 'Unit of IS', 'Type or select Unit')}
            <Field label="Testing Charges">
              <CurrencyAmountField
                name="Testing Charges"
                value={form.testingCharges}
                onChange={(testingCharges) => onChange({ ...form, testingCharges })}
              />
            </Field>
            {(
              [
                { key: 'mmfLargeScale' as const, label: 'Large Scale' },
                { key: 'mmfMediumScale' as const, label: 'Medium Scale' },
                { key: 'mmfSmallScale' as const, label: 'Small Scale' },
                { key: 'mmfMicroScale' as const, label: 'Micro Scale' },
              ] as const
            ).map(({ key, label }) => (
              <Field key={key} label={label}>
                <CurrencyAmountField
                  name={label}
                  value={form[key] ?? ''}
                  onChange={(next) => onChange({ ...form, [key]: next })}
                />
              </Field>
            ))}
          </div>
        </div>
          </Dialog>

        <div>
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
                <p className="col-span-2 text-center text-[10px] font-bold uppercase tracking-[0.12em] text-amber-900/80">
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
                  <CurrencyAmountField
                    name={`${title} Rate`}
                    value={form[rateKey] ?? ''}
                    onChange={(next) => onChange({ ...form, [rateKey]: next })}
                  />
                </Field>
              </div>
            ))}
          </div>
        </div>

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
            onDocumentKindChange={(file, kind) => {
              if (file.id.startsWith('pending:')) {
                const idx = Number(file.id.split(':')[1] ?? -1)
                const target = form.files[idx]
                if (!target) return
                setIsCodeFileDocumentKind(target, kind)
                onPickFiles(form.files.slice())
                return
              }
              onDocumentKindChange?.(file, kind)
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
