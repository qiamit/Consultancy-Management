import { useEffect, useRef, useState } from 'react'
import { Calendar, ChevronDown, ClipboardCopy, Eye, Mail, Printer } from 'lucide-react'
import { toast } from 'sonner'
import { useIsLaboratoryDirector } from '@/components/lims/LaboratoryDirectorOnly'
import { LimsFieldAddButton, LimsFieldWithAdd } from '@/components/lims/LimsFieldWithAdd'
import { AddClientDialog } from '@/features/sample-handling/receiving/AddClientDialog'
import { supabase } from '@/lib/supabaseClient'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import {
  BIS_PRINT_DOCUMENT_LABEL,
  EXTRA_PRINT_KINDS,
  MORE_PRINTS_TOOLTIP,
  type BisPrintDocumentKind } from '../print/printBisDocument'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  FilterCombobox,
  type FilterComboboxExtraAction,
  type FilterComboboxOption,
} from '@/features/sample-handling/receiving/FilterCombobox'
import {
  limsDarkBarGlowStyle,
  limsDialogClass,
  limsFieldAddBtnClass,
  limsOutlineBtnClass,
  limsPrimaryBtnClass,
  limsRegistryFormClass,
} from '@/lib/limsThemeUi'
import { cn } from '@/lib/utils'
import { fetchEmployeeNames } from '../shared/bisLookupApi'
import { searchClientOptions, searchIsCodeOptions } from './bisProjectsApi'
import { revealPortalPassword } from './bisPortalSecretApi'
import { LicenseScopeFields } from './LicenseScopeFields'
import {
  BIS_BILLING_FREQUENCIES,
  BIS_PROJECT_KIND_OPTIONS,
  DEFAULT_CASE_HANDLED_BY,
  sanitizeCurrencyInput,
  type BisProjectForm,
} from './types'

export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const id = window.setTimeout(() => setDebounced(value), delayMs)
    return () => window.clearTimeout(id)
  }, [value, delayMs])
  return debounced
}

/** Server-side lookup combobox: never loads the full table, fetches a small page per keystroke. */
export function RemoteLookupCombobox({
  inputId,
  listId,
  placeholder,
  label,
  selectedId,
  search,
  onChange,
  showSerialNumbers = false,
  onAddNew,
  addLabel = 'Add New',
  extraActions,
}: {
  inputId: string
  listId: string
  placeholder: string
  label: string
  selectedId: string
  search: (term: string) => Promise<FilterComboboxOption[]>
  onChange: (next: { id: string; label: string }) => void
  showSerialNumbers?: boolean
  onAddNew?: (typedName: string) => void
  addLabel?: string
  extraActions?: FilterComboboxExtraAction[]
}) {
  const [open, setOpen] = useState(false)
  const [options, setOptions] = useState<FilterComboboxOption[]>([])
  const debouncedLabel = useDebouncedValue(label, 250)
  const requestRef = useRef(0)
  const searchRef = useRef(search)
  searchRef.current = search

  useEffect(() => {
    if (!open) return
    const term = selectedId && debouncedLabel === label ? '' : debouncedLabel
    const requestId = ++requestRef.current
    void searchRef
      .current(term)
      .then((list) => {
        if (requestId === requestRef.current) setOptions(list)
      })
      .catch(() => {
        if (requestId === requestRef.current) setOptions([])
      })
  }, [open, debouncedLabel, label, selectedId])

  const actions = [
    ...(extraActions ?? []),
    ...(onAddNew
      ? [
          {
            key: 'add-new',
            label: addLabel,
            onSelect: () => onAddNew(label.trim()),
          },
        ]
      : []),
  ]

  return (
    <FilterCombobox
      inputId={inputId}
      listId={listId}
      value={label}
      onValueChange={(text) => {
        onChange({ id: text === label ? selectedId : '', label: text })
      }}
      options={options}
      onSelectOption={(opt) => onChange({ id: opt.id, label: opt.label })}
      open={open}
      onOpenChange={setOpen}
      placeholder={placeholder}
      inputClassName="h-8"
      showSerialNumbers={showSerialNumbers}
      extraActions={actions}
    />
  )
}

export function BisProjectsForm({
  open,
  onOpenChange,
  editing,
  projectId = null,
  form,
  onChange,
  canSave,
  saving,
  errorMessage,
  onSave,
  onPrintForm1,
  onPrintAuthLetter,
  onPrintDocument,
  onEmailDocument,
  printBusy = false,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  editing: boolean
  projectId?: string | null
  form: BisProjectForm
  onChange: (next: BisProjectForm) => void
  canSave: boolean
  saving: boolean
  errorMessage: string | null
  onSave: () => void
  onPrintForm1?: () => void
  onPrintAuthLetter?: () => void
  onPrintDocument?: (kind: BisPrintDocumentKind) => void
  onEmailDocument?: (kind: BisPrintDocumentKind) => void
  printBusy?: boolean
}) {
  const frequencyOptions: string[] = BIS_BILLING_FREQUENCIES.includes(
    form.billingFrequency as (typeof BIS_BILLING_FREQUENCIES)[number],
  )
    ? [...BIS_BILLING_FREQUENCIES]
    : [...BIS_BILLING_FREQUENCIES, form.billingFrequency].filter(Boolean)

  const set = <K extends keyof BisProjectForm>(key: K, value: BisProjectForm[K]) =>
    onChange({ ...form, [key]: value })
  const isAdmin = useIsLaboratoryDirector()
  const [changingPassword, setChangingPassword] = useState(false)
  const [revealedPassword, setRevealedPassword] = useState<string | null>(null)
  const [revealSeconds, setRevealSeconds] = useState(0)
  const passwordResetKey = `${open ? 'open' : 'closed'}:${projectId ?? ''}`
  const [seenPasswordKey, setSeenPasswordKey] = useState(passwordResetKey)
  if (seenPasswordKey !== passwordResetKey) {
    setSeenPasswordKey(passwordResetKey)
    setChangingPassword(false)
    setRevealedPassword(null)
    setRevealSeconds(0)
  }
  const savedPassword = Boolean(form.portalPasswordSet) && !form.clearPortalPassword
  const showSavedBox = Boolean(projectId) && savedPassword && !changingPassword

  useEffect(() => {
    if (!revealedPassword) return
    const id = window.setInterval(() => {
      setRevealSeconds((seconds) => {
        if (seconds <= 1) {
          setRevealedPassword(null)
          return 0
        }
        return seconds - 1
      })
    }, 1000)
    return () => window.clearInterval(id)
  }, [revealedPassword])

  const passwordBtnClass = 'h-10 min-h-10 rounded-none border-stone-500 px-3'

  const revealPassword = () => {
    if (!projectId) return
    void revealPortalPassword(projectId)
      .then((value) => {
        if (!value) {
          toast.error('No password saved')
          return
        }
        setRevealedPassword(value)
        setRevealSeconds(20)
      })
      .catch((err: unknown) => {
        toast.error(err instanceof Error ? err.message : 'No permission')
      })
  }

  const copyPassword = () => {
    if (!projectId) return
    void revealPortalPassword(projectId)
      .then(async (value) => {
        if (!value) {
          toast.error('No password saved')
          return
        }
        await navigator.clipboard.writeText(value)
        toast.success('Password copied')
      })
      .catch((err: unknown) => {
        toast.error(err instanceof Error ? err.message : 'No permission')
      })
  }

  const isApplicationProject =
    form.projectKind.trim().toLowerCase() === 'application'

  const validityInputRef = useRef<HTMLInputElement | null>(null)
  const grantedInputRef = useRef<HTMLInputElement | null>(null)
  const [handledByOptions, setHandledByOptions] = useState<string[]>([DEFAULT_CASE_HANDLED_BY])
  const [addClientOpen, setAddClientOpen] = useState(false)
  const [addClientInitialName, setAddClientInitialName] = useState('')

  const openAddClient = (typedName?: string) => {
    setAddClientInitialName((typedName ?? form.clientLabel).trim())
    setAddClientOpen(true)
  }

  const handleClientSaved = async (clientId: string) => {
    try {
      const { data } = await supabase
        .from('clients')
        .select('company_name')
        .eq('id', clientId)
        .maybeSingle()
      const label =
        String((data as { company_name?: string | null } | null)?.company_name ?? '').trim() ||
        addClientInitialName.trim() ||
        'Unnamed'
      onChange({ ...form, clientId, clientLabel: label })
    } catch {
      onChange({
        ...form,
        clientId,
        clientLabel: addClientInitialName.trim() || 'Unnamed',
      })
    } finally {
      setAddClientInitialName('')
    }
  }

  const openDatePicker = (el: HTMLInputElement | null) => {
    if (!el) return
    try {
      if (typeof el.showPicker === 'function') {
        el.showPicker()
        return
      }
    } catch {
      // fall through
    }
    el.focus()
    el.click()
  }

  const openValidityPicker = () => openDatePicker(validityInputRef.current)
  const openGrantedPicker = () => openDatePicker(grantedInputRef.current)

  useEffect(() => {
    if (!open) return
    let cancelled = false
    const currentHandledBy = form.caseHandledBy
    void fetchEmployeeNames()
      .then((names) => {
        if (cancelled) return
        const merged = [
          ...new Set(
            [DEFAULT_CASE_HANDLED_BY, currentHandledBy, ...names]
              .map((n) => n.trim())
              .filter(Boolean),
          ),
        ].sort((a, b) => a.localeCompare(b, 'en', { sensitivity: 'base' }))
        setHandledByOptions(merged)
      })
      .catch(() => {
        if (!cancelled) {
          setHandledByOptions(
            [...new Set([DEFAULT_CASE_HANDLED_BY, currentHandledBy.trim()].filter(Boolean))],
          )
        }
      })
    return () => {
      cancelled = true
    }
    // Refresh user list when the dialog opens (not on every field keystroke).
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional: open-only load
  }, [open])

  return (
    <>
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        persistOnFocusLoss
        aria-describedby={undefined}
        className={cn(
          limsDialogClass,
          'max-h-[92vh] max-w-[51.2rem] bg-white',
          'w-[min(51.2rem,calc(100vw-1.5rem))]',
          '[&>button]:!rounded-none [&>button]:text-white [&>button]:opacity-100 [&>button]:hover:bg-white/10',
        )}
      >
        <div className="relative shrink-0 overflow-hidden bg-gradient-to-br from-stone-800 via-stone-900 to-stone-950 px-4 py-2.5 text-white sm:px-5 sm:py-3">
          <div className="pointer-events-none absolute inset-0 opacity-[0.18]" style={limsDarkBarGlowStyle} />
          <div className="absolute bottom-0 left-0 h-[2px] w-full bg-gradient-to-r from-amber-500 via-amber-300 to-transparent" />
          <DialogHeader className="relative pr-10 text-left">
            <DialogTitle className="text-base font-semibold tracking-tight text-white sm:text-lg">
              {editing ? 'Edit BIS License' : 'Add New BIS License'}
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
            <div className="space-y-4">
              {/* Line 1 (fixed 2 fields): QE + Type */}
              <div className="grid grid-cols-12 gap-4">
                <div className="col-span-12 space-y-2 md:col-span-6">
                  <Label>QE Management</Label>
                  <Select
                    value={form.isQeManaged ? 'yes' : 'no'}
                    onValueChange={(v) => set('isQeManaged', v === 'yes')}
                  >
                    <SelectTrigger aria-label="QE Management">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="rounded-none border-stone-500">
                      <SelectItem value="yes">Managed by QE</SelectItem>
                      <SelectItem value="no">Not Managed by QE</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="col-span-12 space-y-2 md:col-span-6">
                  <Label htmlFor="bis-project-kind">Type of Project</Label>
                  <Select
                    value={
                      form.projectKind === 'Licence' || form.projectKind === 'License'
                        ? 'Licence'
                        : form.projectKind === 'Inclusion'
                          ? 'Inclusion'
                          : 'Application'
                    }
                    onValueChange={(v) => set('projectKind', v)}
                  >
                    <SelectTrigger id="bis-project-kind" aria-label="Type of Project">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="rounded-none border-stone-500">
                      {BIS_PROJECT_KIND_OPTIONS.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          {opt.label}
                        </SelectItem>
                      ))}
                      {form.projectKind === 'Inclusion' ? (
                        <SelectItem value="Inclusion">Inclusion</SelectItem>
                      ) : null}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Line 2 (fixed 2 fields): Client + IS */}
              <div className="grid grid-cols-12 gap-4">
                <div className="col-span-12 space-y-2 md:col-span-6">
                  <Label htmlFor="bis-client">
                    Search Client Name <span className="text-destructive">*</span>
                  </Label>
                  <LimsFieldWithAdd
                    addButton={
                      <LimsFieldAddButton
                        aria-label="Add new client"
                        title="Add New Client"
                        onClick={() => openAddClient(form.clientLabel)}
                      />
                    }
                  >
                    <RemoteLookupCombobox
                      inputId="bis-client"
                      listId="bis-client-list"
                      placeholder="Search Client Name"
                      label={form.clientLabel}
                      selectedId={form.clientId}
                      search={searchClientOptions}
                      showSerialNumbers={false}
                      addLabel="Add New Client"
                      onAddNew={(typed) => openAddClient(typed)}
                      onChange={({ id, label }) =>
                        onChange({ ...form, clientId: id, clientLabel: label })
                      }
                    />
                  </LimsFieldWithAdd>
                </div>

                <div className="col-span-12 space-y-2 md:col-span-6">
                  <Label htmlFor="bis-is-code">Search IS Number</Label>
                  <RemoteLookupCombobox
                    inputId="bis-is-code"
                    listId="bis-is-code-list"
                    placeholder="Search IS Number"
                    label={form.isCodeLabel}
                    selectedId={form.isCodeId}
                    search={searchIsCodeOptions}
                    showSerialNumbers={false}
                    onChange={({ id, label }) =>
                      onChange({ ...form, isCodeId: id, isCodeLabel: label })
                    }
                  />
                </div>
              </div>

              {/* Line 3 (License only): CM/L + Validity + Granted */}
              {!isApplicationProject ? (
                <div className="grid grid-cols-12 gap-4">
                  <div className="col-span-12 space-y-2 md:col-span-4">
                    <Label htmlFor="bis-cml">
                      CM/L Number <span className="text-destructive">*</span>
                    </Label>
                    <div className="flex items-stretch">
                      <span className="inline-flex h-8 items-center border border-r-0 border-stone-500 bg-stone-100 px-3 text-xs font-semibold text-stone-700">
                        CM/L
                      </span>
                      <Input
                        id="bis-cml"
                        inputMode="numeric"
                        maxLength={10}
                        placeholder="0000000000"
                        className="font-mono tabular-nums"
                        value={form.cmLDigits}
                        onChange={(e) =>
                          set('cmLDigits', e.target.value.replace(/\D/g, '').slice(0, 10))
                        }
                      />
                    </div>
                  </div>

                  <div className="col-span-12 space-y-2 md:col-span-4">
                    <Label htmlFor="bis-validity">
                      License Validity <span className="text-destructive">*</span>
                    </Label>
                    <LimsFieldWithAdd
                      addButton={
                        <button
                          type="button"
                          className={limsFieldAddBtnClass}
                          aria-label="Open calendar"
                          title="Pick date"
                          onClick={openValidityPicker}
                        >
                          <Calendar size={14} strokeWidth={2.25} aria-hidden />
                        </button>
                      }
                    >
                      <Input
                        ref={validityInputRef}
                        id="bis-validity"
                        type="date"
                        value={form.licenseValidityDate}
                        onChange={(e) => set('licenseValidityDate', e.target.value)}
                        className={cn(
                          'min-w-0 pr-2 tabular-nums',
                          '[&::-webkit-calendar-picker-indicator]:pointer-events-none',
                          '[&::-webkit-calendar-picker-indicator]:opacity-0',
                        )}
                      />
                    </LimsFieldWithAdd>
                  </div>

                  <div className="col-span-12 space-y-2 md:col-span-4">
                    <Label htmlFor="bis-granted">Granted Date</Label>
                    <LimsFieldWithAdd
                      addButton={
                        <button
                          type="button"
                          className={limsFieldAddBtnClass}
                          aria-label="Open calendar"
                          title="Pick date"
                          onClick={openGrantedPicker}
                        >
                          <Calendar size={14} strokeWidth={2.25} aria-hidden />
                        </button>
                      }
                    >
                      <Input
                        ref={grantedInputRef}
                        id="bis-granted"
                        type="date"
                        value={form.grantedDate}
                        onChange={(e) => set('grantedDate', e.target.value)}
                        className={cn(
                          'min-w-0 pr-2 tabular-nums',
                          '[&::-webkit-calendar-picker-indicator]:pointer-events-none',
                          '[&::-webkit-calendar-picker-indicator]:opacity-0',
                        )}
                      />
                    </LimsFieldWithAdd>
                  </div>
                </div>
              ) : null}

              <div className="grid grid-cols-12 gap-4">
              <div className="col-span-12 space-y-2 md:col-span-3">
                <Label htmlFor="bis-handled">Case Handled By</Label>
                <Select
                  value={form.caseHandledBy || DEFAULT_CASE_HANDLED_BY}
                  onValueChange={(v) => set('caseHandledBy', v)}
                >
                  <SelectTrigger id="bis-handled" aria-label="Case Handled By">
                    <SelectValue placeholder={DEFAULT_CASE_HANDLED_BY} />
                  </SelectTrigger>
                  <SelectContent
                    className={cn(
                      'z-[100] rounded-none border-2 border-stone-500 bg-white p-0 shadow-lg',
                      'data-[state=open]:animate-in',
                    )}
                  >
                    <div className="border-b border-stone-200 bg-stone-50 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.12em] text-stone-500">
                      User Management
                    </div>
                    <div className="max-h-56 overflow-y-auto py-1">
                      {handledByOptions.map((name) => (
                        <SelectItem
                          key={name}
                          value={name}
                          className={cn(
                            'rounded-none border-b border-stone-100 py-2 last:border-b-0',
                            'focus:bg-amber-50 focus:text-amber-950',
                            'data-[state=checked]:bg-[#f3e9d8] data-[state=checked]:font-semibold',
                          )}
                        >
                          {name}
                        </SelectItem>
                      ))}
                    </div>
                  </SelectContent>
                </Select>
              </div>

              <div className="col-span-12 space-y-2 md:col-span-3">
                <Label htmlFor="bis-referred">Case Referred By</Label>
                <Input
                  id="bis-referred"
                  value={form.caseReferredBy}
                  onChange={(e) => set('caseReferredBy', e.target.value)}
                />
              </div>

              <div className="col-span-12 space-y-2 md:col-span-3">
                <Label htmlFor="bis-billing">Billing Amount</Label>
                <div className="flex items-stretch">
                  <span className="inline-flex h-8 items-center border border-r-0 border-stone-500 bg-stone-100 px-3 text-xs font-semibold text-stone-700">
                    ₹
                  </span>
                  <Input
                    id="bis-billing"
                    inputMode="decimal"
                    className="tabular-nums"
                    value={form.billingAmount}
                    onChange={(e) => set('billingAmount', sanitizeCurrencyInput(e.target.value))}
                  />
                </div>
              </div>

              <div className="col-span-12 space-y-2 md:col-span-3">
                <Label>Billing Frequency</Label>
                <Select value={form.billingFrequency} onValueChange={(v) => set('billingFrequency', v)}>
                  <SelectTrigger aria-label="Billing frequency">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="rounded-none border-stone-500">
                    {frequencyOptions.map((f) => (
                      <SelectItem key={f} value={f}>
                        {f}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              </div>

              <div className="grid grid-cols-12 gap-4">
                <div className="col-span-12 space-y-2 md:col-span-6">
                  <Label htmlFor="bis-portal-user">Portal User ID</Label>
                  <Input
                    id="bis-portal-user"
                    autoComplete="off"
                    value={form.portalUserId}
                    onChange={(e) => set('portalUserId', e.target.value)}
                  />
                </div>

                <div className="col-span-12 space-y-2 md:col-span-6">
                  <Label htmlFor="bis-portal-pass">Portal Password</Label>
                  {form.clearPortalPassword ? (
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                      <p className="min-h-10 flex-1 border border-amber-600 bg-amber-50 px-3 py-2 text-sm text-amber-950">
                        Will be removed on Save
                      </p>
                      <Button
                        type="button"
                        variant="outline"
                        className={passwordBtnClass}
                        onClick={() =>
                          onChange({ ...form, clearPortalPassword: false, portalPassword: '' })
                        }
                      >
                        Undo
                      </Button>
                    </div>
                  ) : showSavedBox ? (
                    <div className="space-y-2">
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                        <Input
                          id="bis-portal-pass"
                          readOnly
                          value={revealedPassword ?? '•••••••• Saved (encrypted)'}
                          className="min-h-10"
                          aria-label={revealedPassword ? 'Revealed portal password' : 'Saved encrypted password'}
                        />
                        <div className="flex flex-wrap gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            className={passwordBtnClass}
                            onClick={() => {
                              setRevealedPassword(null)
                              setRevealSeconds(0)
                              setChangingPassword(true)
                              onChange({ ...form, portalPassword: '', clearPortalPassword: false })
                            }}
                          >
                            Change
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            className={passwordBtnClass}
                            onClick={() =>
                              onChange({
                                ...form,
                                clearPortalPassword: true,
                                portalPassword: '',
                              })
                            }
                          >
                            Clear
                          </Button>
                          {isAdmin ? (
                            <>
                              <Button
                                type="button"
                                variant="outline"
                                className={passwordBtnClass}
                                onClick={revealPassword}
                              >
                                <Eye className="mr-1.5 h-3.5 w-3.5" aria-hidden />
                                Reveal
                              </Button>
                              <Button
                                type="button"
                                variant="outline"
                                className={passwordBtnClass}
                                onClick={copyPassword}
                              >
                                <ClipboardCopy className="mr-1.5 h-3.5 w-3.5" aria-hidden />
                                Copy
                              </Button>
                            </>
                          ) : null}
                        </div>
                      </div>
                      {revealedPassword ? (
                        <p className="text-xs font-medium text-amber-900">
                          Hides in {revealSeconds}s
                        </p>
                      ) : (
                        <p className="text-xs font-medium text-emerald-800">Password saved • encrypted</p>
                      )}
                    </div>
                  ) : (
                    <Input
                      id="bis-portal-pass"
                      type="password"
                      autoComplete="new-password"
                      className="min-h-10"
                      placeholder={projectId ? 'Not set' : ''}
                      value={form.portalPassword}
                      onChange={(e) => set('portalPassword', e.target.value)}
                    />
                  )}
                </div>
              </div>

              <div className="grid grid-cols-12 gap-4">
                <div className="col-span-12">
                  <LicenseScopeFields
                    value={form.notes}
                    onChange={(next) => set('notes', next)}
                    disabled={saving}
                    inputId="bis-notes"
                    isCodeId={form.isCodeId || null}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t-2 border-stone-500 bg-stone-100 px-4 py-3 sm:px-6">
          <div className="flex flex-wrap items-center gap-2">
            {editing && onPrintForm1 ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 rounded-none border-stone-500"
                onClick={onPrintForm1}
                disabled={saving || printBusy}
                title="Print BIS Form-I from the saved record"
              >
                <Printer className="mr-1.5 h-3.5 w-3.5" aria-hidden />
                Print Form-I
              </Button>
            ) : null}
            {editing && onPrintAuthLetter ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 rounded-none border-stone-500"
                onClick={onPrintAuthLetter}
                disabled={saving || printBusy}
                title="Print Authorization Letter from the saved record"
              >
                <Printer className="mr-1.5 h-3.5 w-3.5" aria-hidden />
                Print Authorization Letter
              </Button>
            ) : null}
            {editing && onPrintDocument ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8 rounded-none border-stone-500"
                    disabled={saving || printBusy}
                    title={`Print from the saved record: ${MORE_PRINTS_TOOLTIP}`}
                  >
                    <Printer className="mr-1.5 h-3.5 w-3.5" aria-hidden />
                    More prints
                    <ChevronDown className="ml-1 h-3 w-3" aria-hidden />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                  {EXTRA_PRINT_KINDS.map((kind) => (
                    <DropdownMenuItem key={kind} onSelect={() => onPrintDocument(kind)}>
                      {BIS_PRINT_DOCUMENT_LABEL[kind]}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            ) : null}
            {editing && onEmailDocument ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8 rounded-none border-stone-500"
                    disabled={saving || printBusy}
                    title="Email BIS documents to the client from the saved record"
                  >
                    <Mail className="mr-1.5 h-3.5 w-3.5" aria-hidden />
                    Email docs
                    <ChevronDown className="ml-1 h-3 w-3" aria-hidden />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="max-h-80 overflow-y-auto">
                  <DropdownMenuItem onSelect={() => onEmailDocument('form1')}>
                    {BIS_PRINT_DOCUMENT_LABEL.form1}
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => onEmailDocument('authorization-letter')}>
                    {BIS_PRINT_DOCUMENT_LABEL['authorization-letter']}
                  </DropdownMenuItem>
                  {EXTRA_PRINT_KINDS.map((kind) => (
                    <DropdownMenuItem key={`email-${kind}`} onSelect={() => onEmailDocument(kind)}>
                      {BIS_PRINT_DOCUMENT_LABEL[kind]}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            ) : null}
          </div>
          <div className="flex items-center gap-2">
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
              {saving ? 'Saving…' : editing ? 'Update License' : 'Save License'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>

    <AddClientDialog
      nested
      open={addClientOpen}
      onOpenChange={(next) => {
        setAddClientOpen(next)
        if (!next) setAddClientInitialName('')
      }}
      initialCompanyName={addClientInitialName}
      onSaved={(id) => {
        void handleClientSaved(id)
      }}
      title="Add New Client"
    />
    </>
  )
}
