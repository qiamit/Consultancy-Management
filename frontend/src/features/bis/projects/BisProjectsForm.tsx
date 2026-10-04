import { useEffect, useRef, useState } from 'react'
import { ChevronDown, ExternalLink, Mail, Printer, Search } from 'lucide-react'
import { toast } from 'sonner'
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
import { Textarea } from '@/components/ui/textarea'
import {
  FilterCombobox,
  type FilterComboboxOption,
} from '@/features/sample-handling/receiving/FilterCombobox'
import {
  limsDarkBarGlowStyle,
  limsPrimaryBtnClass,
  limsRegistryFormClass,
} from '@/lib/limsThemeUi'
import { cn } from '@/lib/utils'
import { searchClientOptions, searchIsCodeOptions } from './bisProjectsApi'
import {
  fetchIsCodeViaExtension,
  isNumberFromLabel,
  openManakEbisAssist,
} from './manakExtensionBridge'
import {
  BIS_BILLING_FREQUENCIES,
  BIS_PROJECT_KIND_OPTIONS,
  BIS_PROJECT_STATUS_OPTIONS,
  licenseValidityState,
  sanitizeCurrencyInput,
  type BisProjectForm,
} from './types'

const EXTENSION_MISSING_MSG =
  'QE Consultancy extension is not loaded. Open this app in Chrome or Edge, then reload the extension from chrome://extensions.'

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
}: {
  inputId: string
  listId: string
  placeholder: string
  label: string
  selectedId: string
  search: (term: string) => Promise<FilterComboboxOption[]>
  onChange: (next: { id: string; label: string }) => void
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
    />
  )
}

export function BisProjectsForm({
  open,
  onOpenChange,
  editing,
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
  const validity = licenseValidityState(form.licenseValidityDate)
  const statusOptions = BIS_PROJECT_STATUS_OPTIONS.some((o) => o.value === form.status)
    ? BIS_PROJECT_STATUS_OPTIONS
    : [...BIS_PROJECT_STATUS_OPTIONS, { value: form.status, label: form.status }]
  const kindOptions = BIS_PROJECT_KIND_OPTIONS.some((o) => o.value === form.projectKind)
    ? BIS_PROJECT_KIND_OPTIONS
    : [...BIS_PROJECT_KIND_OPTIONS, { value: form.projectKind, label: form.projectKind }]
  const frequencyOptions: string[] = BIS_BILLING_FREQUENCIES.includes(
    form.billingFrequency as (typeof BIS_BILLING_FREQUENCIES)[number],
  )
    ? [...BIS_BILLING_FREQUENCIES]
    : [...BIS_BILLING_FREQUENCIES, form.billingFrequency].filter(Boolean)

  const set = <K extends keyof BisProjectForm>(key: K, value: BisProjectForm[K]) =>
    onChange({ ...form, [key]: value })

  const [isCodeFetchBusy, setIsCodeFetchBusy] = useState(false)
  const isCodeFetchCleanupRef = useRef<(() => void) | null>(null)

  useEffect(() => {
    return () => {
      isCodeFetchCleanupRef.current?.()
      isCodeFetchCleanupRef.current = null
    }
  }, [])

  useEffect(() => {
    if (!open) {
      isCodeFetchCleanupRef.current?.()
      isCodeFetchCleanupRef.current = null
      setIsCodeFetchBusy(false)
    }
  }, [open])

  const handleManakAssist = () => {
    void openManakEbisAssist({
      portalUserId: form.portalUserId,
      portalPassword: form.portalPassword,
    }).then(({ extensionUsed }) => {
      if (extensionUsed) {
        toast.success('Opening Manak eBIS via extension')
      } else {
        toast.warning('Extension not detected — opened Manak eBIS in a new tab', {
          description: EXTENSION_MISSING_MSG,
        })
      }
    })
  }

  const handleFetchIsCode = () => {
    const isNumber = isNumberFromLabel(form.isCodeLabel)
    if (!isNumber) {
      toast.error('Enter an IS Code first')
      return
    }

    isCodeFetchCleanupRef.current?.()
    setIsCodeFetchBusy(true)
    toast.message('Fetching IS Code data…', { description: isNumber })

    isCodeFetchCleanupRef.current = fetchIsCodeViaExtension(isNumber, {
      onProgress: (message) => {
        toast.message(message)
      },
      onDone: (payload) => {
        setIsCodeFetchBusy(false)
        isCodeFetchCleanupRef.current = null
        const fieldCount = Object.keys(payload.fields ?? {}).length
        const noteCount = payload.notes?.length ?? 0
        toast.success('IS Code fetch complete', {
          description: `${fieldCount} field(s) collected${noteCount ? ` · ${noteCount} note(s)` : ''}`,
        })
      },
      onMissingExtension: () => {
        setIsCodeFetchBusy(false)
        isCodeFetchCleanupRef.current = null
        toast.error('Extension not detected', { description: EXTENSION_MISSING_MSG })
      },
    })
  }

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
            <div className="grid grid-cols-12 gap-4">
              <div className="col-span-12 space-y-2 md:col-span-6">
                <Label htmlFor="bis-client">
                  Name of Client <span className="text-destructive">*</span>
                </Label>
                <RemoteLookupCombobox
                  inputId="bis-client"
                  listId="bis-client-list"
                  placeholder="Search client name…"
                  label={form.clientLabel}
                  selectedId={form.clientId}
                  search={searchClientOptions}
                  onChange={({ id, label }) => onChange({ ...form, clientId: id, clientLabel: label })}
                />
              </div>

              <div className="col-span-12 space-y-2 md:col-span-6">
                <Label htmlFor="bis-is-code">IS Code</Label>
                <RemoteLookupCombobox
                  inputId="bis-is-code"
                  listId="bis-is-code-list"
                  placeholder="Search IS number or title…"
                  label={form.isCodeLabel}
                  selectedId={form.isCodeId}
                  search={searchIsCodeOptions}
                  onChange={({ id, label }) => onChange({ ...form, isCodeId: id, isCodeLabel: label })}
                />
              </div>

              <div className="col-span-12 space-y-2 md:col-span-3">
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
                    onChange={(e) => set('cmLDigits', e.target.value.replace(/\D/g, '').slice(0, 10))}
                  />
                </div>
              </div>

              <div className="col-span-12 space-y-2 md:col-span-3">
                <Label htmlFor="bis-validity">License Validity</Label>
                <Input
                  id="bis-validity"
                  type="date"
                  value={form.licenseValidityDate}
                  onChange={(e) => set('licenseValidityDate', e.target.value)}
                />
                {validity.state === 'expired' ? (
                  <p className="text-xs text-red-700">This license has expired.</p>
                ) : validity.state === 'expiring' ? (
                  <p className="text-xs text-amber-700">{validity.daysLeft} day(s) left — renewal due.</p>
                ) : null}
              </div>

              <div className="col-span-12 space-y-2 md:col-span-3">
                <Label>Project Kind</Label>
                <Select value={form.projectKind} onValueChange={(v) => set('projectKind', v)}>
                  <SelectTrigger aria-label="Project Kind">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="rounded-none border-stone-500">
                    {kindOptions.map((o) => (
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
                    {statusOptions.map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="col-span-12 space-y-2 md:col-span-3">
                <Label htmlFor="bis-stage">Application Stage</Label>
                <Input
                  id="bis-stage"
                  placeholder="e.g. Documents pending"
                  value={form.applicationStage}
                  onChange={(e) => set('applicationStage', e.target.value)}
                />
              </div>

              <div className="col-span-12 space-y-2 md:col-span-3">
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

              <div className="col-span-12 space-y-2 md:col-span-3">
                <Label htmlFor="bis-handled">Case Handled By</Label>
                <Input
                  id="bis-handled"
                  value={form.caseHandledBy}
                  onChange={(e) => set('caseHandledBy', e.target.value)}
                />
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

              <div className="col-span-12 space-y-2 md:col-span-3">
                <Label htmlFor="bis-portal-user">Portal User ID</Label>
                <Input
                  id="bis-portal-user"
                  autoComplete="off"
                  value={form.portalUserId}
                  onChange={(e) => set('portalUserId', e.target.value)}
                />
              </div>

              <div className="col-span-12 space-y-2 md:col-span-3">
                <Label htmlFor="bis-portal-pass">Portal Password</Label>
                <Input
                  id="bis-portal-pass"
                  type="password"
                  autoComplete="new-password"
                  value={form.portalPassword}
                  onChange={(e) => set('portalPassword', e.target.value)}
                />
              </div>

              <div className="col-span-12 space-y-2">
                <Label htmlFor="bis-notes">Notes / License Scope</Label>
                <Textarea
                  id="bis-notes"
                  rows={5}
                  className="rounded-none border-stone-500 bg-stone-50"
                  value={form.notes}
                  onChange={(e) => set('notes', e.target.value)}
                />
              </div>
            </div>
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t-2 border-stone-500 bg-stone-100 px-4 py-3 sm:px-6">
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 rounded-none border-stone-500"
              onClick={handleManakAssist}
              disabled={saving}
              title="Open Manak eBIS login (User ID and password pre-filled when entered)"
            >
              <ExternalLink className="mr-1.5 h-3.5 w-3.5" aria-hidden />
              Manak Assist
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 rounded-none border-stone-500"
              onClick={handleFetchIsCode}
              disabled={saving || isCodeFetchBusy}
              title="Fetch IS data from BIS portals via QE Consultancy extension"
            >
              <Search className="mr-1.5 h-3.5 w-3.5" aria-hidden />
              {isCodeFetchBusy ? 'Fetching…' : 'Fetch IS Code'}
            </Button>
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
  )
}
