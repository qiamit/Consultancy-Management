import { useEffect, useMemo, useState, type Dispatch, type SetStateAction } from 'react'
import { getCurrencyCode, getCurrencySymbol } from '@/lib/appCurrency'
import { ChevronDown, ChevronUp, Columns3, Plus, Trash2, X } from 'lucide-react'
import { LimsFieldAddButton, LimsFieldWithAdd } from '@/components/lims/LimsFieldWithAdd'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
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
  type FilterComboboxOption,
} from '@/features/sample-handling/receiving/FilterCombobox'
import { AddClientDialog } from '@/features/sample-handling/receiving/AddClientDialog'
import {
  AddProductServiceDialog,
  type SavedProductService,
} from '@/features/masters/products-services/AddProductServiceDialog'
import {
  formatMoneyInput,
  sanitizeMoneyInput,
} from '@/features/masters/products-services/types'
import {
  limsDialogClass,
  limsPrimaryBtnClass,
  limsRegistryFormClass,
} from '@/lib/limsThemeUi'
import { cn } from '@/lib/utils'
import { ManageQuotationTermsDialog } from './ManageQuotationTermsDialog'
import { ManageQuotationNotesDialog } from './ManageQuotationNotesDialog'
import {
  fetchQuotationTerms,
  type QuotationTermRow,
} from './quotationTermsApi'
import {
  fetchQuotationNotes,
  type QuotationNoteRow,
} from './quotationNotesApi'
import { QuotationSignatureField } from './QuotationSignatureField'
import {
  fetchDefaultSignatureForKind,
} from './quotationSignatureStorage'
import {
  computeQuotationTotals,
  defaultValidUntil,
  emptyQuotationLine,
  formatMoney,
  lineGstSplit,
  lineTaxableAmount,
  lineAmount,
  parseMoney,
  QUOTATION_STATUS_LABELS,
  QUOTATION_STATUS_OPTIONS,
  PAYMENT_METHOD_OPTIONS,
  type QuotationForm as QuotationFormType,
  type QuotationLineForm,
  type QuotationStatus,
  type PaymentMethod,
} from './types'
import { amountInIndianRupeesWords } from './amountInIndianRupeesWords'
import { parseLabSettingsRow } from '@/features/settings/lab-settings/labSettingsDb'
import { computeClientSaleBalance } from '@/features/finance/sale/shared/clientSaleBalance'
import { supabase } from '@/lib/supabaseClient'

export type QuotationClientContact = {
  contactPerson: string
  contactEmail: string
  contactMobile: string
  gstNumber: string
  address: string
  openingBalance: number
  balanceType: 'Dr' | 'Cr'
}

export type QuotationProductDetails = {
  itemName: string
  itemCode?: string
  itemDescription?: string
  make?: string
  hsnCode: string
  unit: string
  salePrice: number
  gstPercent: number
}

const fieldClass = 'h-10 rounded-none'
/** Line-item inputs: ~10% shorter than form default h-10 (40px → 36px). */
const lineFieldClass = '!h-9 rounded-none border-stone-500 bg-white'
const sectionTitleClass =
  'border-b border-stone-300 pb-1.5 text-xs font-bold uppercase tracking-wide text-stone-800'

function CurrencyInrField({
  id,
  label,
  value,
  onChange,
  placeholder = '0.00',
}: {
  id: string
  label: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
}) {
  const [focused, setFocused] = useState(false)
  const displayValue = focused ? value : formatMoneyInput(value || '0')

  return (
    <div className="flex min-w-0 flex-col space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <div className="flex h-10 overflow-hidden rounded-none border border-stone-500 bg-stone-50 focus-within:border-amber-600 focus-within:bg-white focus-within:ring-2 focus-within:ring-amber-500/20">
        <span
          className="inline-flex shrink-0 items-center border-r border-stone-500 bg-stone-100 px-2.5 text-sm font-semibold text-stone-700"
          aria-hidden
        >
          {getCurrencySymbol()}
        </span>
        <Input
          id={id}
          type="text"
          inputMode="decimal"
          value={displayValue}
          onFocus={() => setFocused(true)}
          onChange={(e) => onChange(sanitizeMoneyInput(e.target.value))}
          onBlur={() => {
            setFocused(false)
            onChange(formatMoneyInput(value || '0'))
          }}
          placeholder={placeholder}
          className="h-full min-w-0 flex-1 rounded-none border-0 bg-transparent text-right tabular-nums shadow-none focus-visible:ring-0"
          aria-label={`${label} in ${getCurrencyCode()}`}
        />
      </div>
    </div>
  )
}

function CurrencyBalanceField({
  label,
  amount,
  balanceType,
  emptyText,
  highlight,
}: {
  label: string
  amount: number
  balanceType: 'Dr' | 'Cr'
  emptyText?: string
  highlight?: boolean
}) {
  return (
    <div className="flex min-w-0 flex-col space-y-2">
      <Label>{label}</Label>
      <div
        className={cn(
          'flex h-10 overflow-hidden rounded-none border border-stone-500',
          highlight ? 'bg-amber-50' : 'bg-white',
          emptyText && 'text-stone-400',
        )}
        aria-live="polite"
      >
        <span
          className="inline-flex shrink-0 items-center border-r border-stone-500 bg-stone-100 px-2.5 text-sm font-semibold text-stone-700"
          aria-hidden
        >
          {getCurrencySymbol()}
        </span>
        {emptyText ? (
          <span className="flex min-w-0 flex-1 items-center px-3 text-sm">{emptyText}</span>
        ) : (
          <>
            <span
              className={cn(
                'flex min-w-0 flex-1 items-center justify-end px-3 text-sm font-semibold tabular-nums',
                highlight && 'text-amber-950',
              )}
            >
              {formatMoney(amount)}
            </span>
            <span
              className={cn(
                'inline-flex shrink-0 items-center border-l border-stone-500 px-2.5 text-[11px] font-bold uppercase tracking-wide',
                balanceType === 'Cr' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-100 text-amber-900',
              )}
            >
              {balanceType}
            </span>
          </>
        )}
      </div>
    </div>
  )
}

type LineColumnKey =
  | 'make'
  | 'hsnSac'
  | 'itemCode'
  | 'quantity'
  | 'unit'
  | 'rate'
  | 'discountPercent'
  | 'amount'
  | 'taxableAmount'
  | 'gstPercent'
  | 'cgstPercent'
  | 'sgstPercent'
  | 'igstPercent'
  | 'cgstAmount'
  | 'sgstAmount'
  | 'igstAmount'
  | 'lineRemarks'
  | 'deliveryPeriod'

const LINE_COLUMN_OPTIONS: { key: LineColumnKey; label: string }[] = [
  { key: 'make', label: 'Make' },
  { key: 'hsnSac', label: 'HSN/SAC' },
  { key: 'itemCode', label: 'Item Code' },
  { key: 'quantity', label: 'Qty' },
  { key: 'unit', label: 'Unit' },
  { key: 'rate', label: 'Rate' },
  { key: 'discountPercent', label: 'Discount %' },
  { key: 'amount', label: 'Amount' },
  { key: 'taxableAmount', label: 'Taxable Amount' },
  { key: 'gstPercent', label: 'GST %' },
  { key: 'cgstPercent', label: 'CGST %' },
  { key: 'sgstPercent', label: 'SGST %' },
  { key: 'igstPercent', label: 'IGST %' },
  { key: 'cgstAmount', label: 'CGST' },
  { key: 'sgstAmount', label: 'SGST' },
  { key: 'igstAmount', label: 'IGST' },
  { key: 'lineRemarks', label: 'Line Remarks' },
  { key: 'deliveryPeriod', label: 'Delivery Period' },
]

const DEFAULT_LINE_COLUMNS: Record<LineColumnKey, boolean> = {
  make: true,
  hsnSac: true,
  itemCode: false,
  quantity: true,
  unit: true,
  rate: true,
  discountPercent: false,
  amount: true,
  taxableAmount: false,
  gstPercent: false,
  cgstPercent: false,
  sgstPercent: false,
  igstPercent: false,
  cgstAmount: false,
  sgstAmount: false,
  igstAmount: false,
  lineRemarks: false,
  deliveryPeriod: false,
}

const LINE_COLUMNS_STORAGE_KEY = 'quotation-line-columns-v3'

function loadLineColumns(): Record<LineColumnKey, boolean> {
  try {
    const raw = localStorage.getItem(LINE_COLUMNS_STORAGE_KEY)
    if (!raw) return { ...DEFAULT_LINE_COLUMNS }
    const parsed = JSON.parse(raw) as Partial<Record<LineColumnKey, boolean>>
    return { ...DEFAULT_LINE_COLUMNS, ...parsed }
  } catch {
    return { ...DEFAULT_LINE_COLUMNS }
  }
}

function joinLineItemText(description: string, details: string): string {
  const name = description.trim().replace(/\s+/g, ' ')
  const detail = details.trim().replace(/\s+/g, ' ')
  if (!name) return detail
  if (!detail) return name
  return `${name} — ${detail}`
}

function splitLineItemText(value: string): { description: string; details: string } {
  const normalized = value.replace(/\r\n/g, '\n').replace(/\s+/g, ' ').trim()
  const sep = ' — '
  const idx = normalized.indexOf(sep)
  if (idx >= 0) {
    return {
      description: normalized.slice(0, idx).trim(),
      details: normalized.slice(idx + sep.length).trim(),
    }
  }
  const nl = normalized.indexOf('\n')
  if (nl >= 0) {
    return {
      description: normalized.slice(0, nl).trim(),
      details: normalized.slice(nl + 1).trim(),
    }
  }
  return { description: normalized, details: '' }
}

export function QuotationFormView({
  form,
  onChange,
  clientOptions,
  clientContactById,
  productOptions,
  productById,
  onReloadClients,
  onReloadProducts,
  canSave,
  saveLoading,
  onSave,
  documentLabel = 'Quotation',
  formMode = 'standard',
  documentKind = 'quotation',
  excludeReceiptId = null,
}: {
  form: QuotationFormType
  onChange: Dispatch<SetStateAction<QuotationFormType>>
  clientOptions: FilterComboboxOption[]
  clientContactById: Record<string, QuotationClientContact>
  productOptions: FilterComboboxOption[]
  productById: Record<string, QuotationProductDetails>
  onReloadClients: () => Promise<
    | {
        options: FilterComboboxOption[]
        contacts: Record<string, QuotationClientContact>
      }
    | undefined
  >
  onReloadProducts: () => void | Promise<unknown>
  canSave: boolean
  saveLoading: boolean
  onSave: () => void
  /** Section labels for Sale modules (Proforma Invoice, Invoice, …). */
  documentLabel?: string
  /** Payment Receipt uses balance + amount instead of line items / totals. */
  formMode?: 'standard' | 'paymentReceipt'
  documentKind?: import('@/features/settings/lab-settings/documentTemplateTypes').DocumentTemplateKind
  excludeReceiptId?: string | null
}) {
  const isPaymentReceipt = formMode === 'paymentReceipt'
  const [clientQuery, setClientQuery] = useState(form.clientName)
  const [clientOpen, setClientOpen] = useState(false)
  const [addClientOpen, setAddClientOpen] = useState(false)
  const [addClientInitialName, setAddClientInitialName] = useState('')
  const [descOpenByKey, setDescOpenByKey] = useState<Record<string, boolean>>({})
  const [descQueryByKey, setDescQueryByKey] = useState<Record<string, string>>({})
  const [rateFocusedKey, setRateFocusedKey] = useState<string | null>(null)
  const [addProductLineKey, setAddProductLineKey] = useState<string | null>(null)
  const [addProductInitialName, setAddProductInitialName] = useState('')
  const [visibleLineColumns, setVisibleLineColumns] = useState<Record<LineColumnKey, boolean>>(
    () => loadLineColumns(),
  )
  const [columnsDialogOpen, setColumnsDialogOpen] = useState(false)
  const [draftLineColumns, setDraftLineColumns] = useState<Record<LineColumnKey, boolean>>(
    () => loadLineColumns(),
  )
  const [terms, setTerms] = useState<QuotationTermRow[]>([])
  const [termsOpen, setTermsOpen] = useState(false)
  const [manageTermsOpen, setManageTermsOpen] = useState(false)
  const [notes, setNotes] = useState<QuotationNoteRow[]>([])
  const [notesOpen, setNotesOpen] = useState(false)
  const [convertedInvoiceTotal, setConvertedInvoiceTotal] = useState(0)
  const [manageNotesOpen, setManageNotesOpen] = useState(false)
  const [showDiscountRow, setShowDiscountRow] = useState(false)
  const [showTransportRow, setShowTransportRow] = useState(false)
  const [showPackagingRow, setShowPackagingRow] = useState(false)
  const [showCgstRow, setShowCgstRow] = useState(false)
  const [showSgstRow, setShowSgstRow] = useState(false)
  const [showIgstRow, setShowIgstRow] = useState(false)
  const [bankDetails, setBankDetails] = useState({
    bankName: '',
    branchName: '',
    accountNumber: '',
    ifsc: '',
    upi: '',
  })

  const gstMode: 'intra' | 'inter' =
    showIgstRow && !showCgstRow && !showSgstRow ? 'inter' : 'intra'
  const totals = computeQuotationTotals(form, gstMode)
  const showGstBreakdown = showCgstRow || showSgstRow || showIgstRow
  const amountInWords = amountInIndianRupeesWords(totals.grandTotal)

  useEffect(() => {
    try {
      localStorage.setItem(LINE_COLUMNS_STORAGE_KEY, JSON.stringify(visibleLineColumns))
    } catch {
      /* ignore */
    }
  }, [visibleLineColumns])

  const openColumnsDialog = () => {
    setDraftLineColumns({ ...visibleLineColumns })
    setColumnsDialogOpen(true)
  }

  const applyColumnsDialog = () => {
    const anyOn = LINE_COLUMN_OPTIONS.some((c) => draftLineColumns[c.key])
    if (!anyOn) return
    setVisibleLineColumns({ ...draftLineColumns })
    setColumnsDialogOpen(false)
  }

  const toggleDraftColumn = (key: LineColumnKey, checked: boolean) => {
    setDraftLineColumns((prev) => ({ ...prev, [key]: checked }))
  }

  useEffect(() => {
    setClientQuery(form.clientName)
  }, [form.clientId, form.clientName])

  useEffect(() => {
    if (parseMoney(form.discountAmount) > 0 || parseMoney(form.discountPercent) > 0) {
      setShowDiscountRow(true)
    }
    if (parseMoney(form.transportationCharges) > 0) setShowTransportRow(true)
    if (parseMoney(form.packagingCharges) > 0) setShowPackagingRow(true)
  }, [form.discountAmount, form.discountPercent, form.transportationCharges, form.packagingCharges])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const [termRows, noteRows, defaultSign] = await Promise.all([
          fetchQuotationTerms(documentKind),
          fetchQuotationNotes(documentKind),
          fetchDefaultSignatureForKind(documentKind).catch(() => ({
            signatureText: '',
            signatureImagePath: '',
          })),
        ])
        if (cancelled) return
        setTerms(termRows)
        setNotes(noteRows)
        const defTerm = termRows.find((t) => t.isDefault)?.content ?? ''
        const defNote = noteRows.find((n) => n.isDefault)?.content ?? ''
        if (defTerm || defNote || defaultSign.signatureImagePath || defaultSign.signatureText) {
          onChange((prev) => ({
            ...prev,
            paymentTerms: prev.paymentTerms.trim() ? prev.paymentTerms : defTerm || prev.paymentTerms,
            notes: prev.notes.trim() ? prev.notes : defNote || prev.notes,
            signatureText: prev.signatureText.trim()
              ? prev.signatureText
              : defaultSign.signatureText || prev.signatureText,
            signatureImagePath: prev.signatureImagePath.trim()
              ? prev.signatureImagePath
              : defaultSign.signatureImagePath || prev.signatureImagePath,
          }))
        }
      } catch {
        if (!cancelled) {
          setTerms([])
          setNotes([])
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [onChange, documentKind])

  const termOptions = useMemo<FilterComboboxOption[]>(
    () =>
      terms.map((t) => ({
        id: t.id,
        label: t.isDefault ? `${t.label} (Default)` : t.label,
      })),
    [terms],
  )

  const selectedTermDisplay = useMemo(() => {
    const match = terms.find((t) => t.content === form.paymentTerms)
    if (!match) return form.paymentTerms
    return match.isDefault ? `${match.label} (Default)` : match.label
  }, [terms, form.paymentTerms])

  const noteOptions = useMemo<FilterComboboxOption[]>(
    () =>
      notes.map((n) => ({
        id: n.id,
        label: n.isDefault ? `${n.label} (Default)` : n.label,
      })),
    [notes],
  )

  const selectedNoteDisplay = useMemo(() => {
    const match = notes.find((n) => n.content === form.notes)
    if (!match) return form.notes
    return match.isDefault ? `${match.label} (Default)` : match.label
  }, [notes, form.notes])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const { data, error } = await supabase
          .from('lab_settings')
          .select('bank_name, branch_name, account_number, ifsc, upi')
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle()
        if (error) throw error
        if (cancelled) return
        const parsed = parseLabSettingsRow((data ?? {}) as Record<string, unknown>)
        setBankDetails({
          bankName: parsed.bankName,
          branchName: parsed.branchName,
          accountNumber: parsed.accountNumber,
          ifsc: parsed.ifsc,
          upi: parsed.upi,
        })
      } catch {
        if (!cancelled) {
          setBankDetails({
            bankName: '',
            branchName: '',
            accountNumber: '',
            ifsc: '',
            upi: '',
          })
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const set = <K extends keyof QuotationFormType>(key: K, value: QuotationFormType[K]) => {
    onChange({ ...form, [key]: value })
  }

  const patchLine = (key: string, patch: Partial<QuotationLineForm>) => {
    onChange({
      ...form,
      lines: form.lines.map((l) => (l.key === key ? { ...l, ...patch } : l)),
    })
  }

  const applyProductToLine = (
    lineKey: string,
    product: QuotationProductDetails | SavedProductService,
  ) => {
    const itemName = 'itemName' in product ? product.itemName : ''
    const itemDescription =
      'itemDescription' in product && typeof product.itemDescription === 'string'
        ? product.itemDescription
        : ''
    const hsnCode = 'hsnCode' in product ? product.hsnCode : ''
    const itemCode =
      'itemCode' in product && typeof product.itemCode === 'string' ? product.itemCode : ''
    const make =
      'make' in product && typeof product.make === 'string' ? product.make.trim() : ''
    const unit = 'unit' in product ? product.unit : ''
    const salePrice = 'salePrice' in product ? product.salePrice : 0
    const gstPercent =
      'gstPercent' in product && typeof product.gstPercent === 'number'
        ? product.gstPercent
        : 0
    const description =
      itemName.trim() || form.lines.find((l) => l.key === lineKey)?.description || ''
    const details = itemDescription.trim()
    patchLine(lineKey, {
      description,
      details,
      make: make || 'QIRLPL',
      hsnSac: hsnCode.trim(),
      itemCode: itemCode.trim(),
      unit: unit.trim() || form.lines.find((l) => l.key === lineKey)?.unit || 'Nos',
      rate: String(Number.isFinite(salePrice) ? salePrice : 0),
      gstPercent: String(Number.isFinite(gstPercent) ? gstPercent : 0),
    })
    const combined = joinLineItemText(description, details)
    setDescQueryByKey((prev) => ({ ...prev, [lineKey]: combined }))
    setDescOpenByKey((prev) => ({ ...prev, [lineKey]: false }))
  }

  const addLine = () => {
    onChange({ ...form, lines: [...form.lines, emptyQuotationLine()] })
  }

  const removeLine = (key: string) => {
    if (form.lines.length <= 1) return
    onChange({ ...form, lines: form.lines.filter((l) => l.key !== key) })
  }

  const moveLine = (key: string, direction: -1 | 1) => {
    onChange((prev) => {
      const index = prev.lines.findIndex((l) => l.key === key)
      if (index < 0) return prev
      const target = index + direction
      if (target < 0 || target >= prev.lines.length) return prev
      const lines = prev.lines.slice()
      const [item] = lines.splice(index, 1)
      lines.splice(target, 0, item)
      return { ...prev, lines }
    })
  }

  const applyClientSelection = (
    clientId: string,
    clientName: string,
    contactOverride?: QuotationClientContact,
  ) => {
    const contact = contactOverride ?? (clientId ? clientContactById[clientId] : undefined)
    onChange((prev) => ({
      ...prev,
      clientId,
      clientName,
      contactPerson: contact?.contactPerson ?? '',
      contactEmail: contact?.contactEmail ?? '',
      contactMobile: contact?.contactMobile ?? '',
      clientAddress: contact?.address ?? '',
      clientGstNumber: contact?.gstNumber ?? '',
    }))
  }

  const openAddClient = (initialName?: string) => {
    setAddClientInitialName((initialName ?? clientQuery).trim())
    setClientOpen(false)
    setAddClientOpen(true)
  }

  const clearClientSelection = () => {
    onChange((prev) => ({
      ...prev,
      clientId: '',
      clientName: '',
      contactPerson: '',
      contactEmail: '',
      contactMobile: '',
      clientAddress: '',
      clientGstNumber: '',
    }))
  }

  const selectedClientLabel =
    clientOptions.find((o) => o.id === form.clientId)?.label ?? form.clientName

  useEffect(() => {
    if (!isPaymentReceipt || (!form.clientId && !form.clientName.trim())) {
      setConvertedInvoiceTotal(0)
      return
    }
    let cancelled = false
    void (async () => {
      try {
        let query = supabase
          .from('quotations')
          .select('grand_total, client_id, client_name, status')
          .in('status', ['Invoice', 'Converted'])
        if (form.clientId.trim()) {
          query = query.eq('client_id', form.clientId.trim())
        } else {
          query = query.ilike('client_name', form.clientName.trim())
        }
        const { data, error } = await query
        if (error) throw error
        const total = (Array.isArray(data) ? data : []).reduce((sum, row) => {
          const n = Number((row as { grand_total?: number }).grand_total)
          return sum + (Number.isFinite(n) ? Math.max(0, n) : 0)
        }, 0)
        if (!cancelled) setConvertedInvoiceTotal(Math.round(total * 100) / 100)
      } catch {
        if (!cancelled) setConvertedInvoiceTotal(0)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [form.clientId, form.clientName, isPaymentReceipt])

  const selectedClientBalance = useMemo(() => {
    const contact = form.clientId ? clientContactById[form.clientId] : undefined
    if (!form.clientId && !form.clientName.trim()) {
      return { amount: 0, type: 'Dr' as const }
    }
    return computeClientSaleBalance({
      clientId: form.clientId,
      clientName: form.clientName,
      openingBalance: contact?.openingBalance ?? 0,
      openingType: contact?.balanceType === 'Cr' ? 'Cr' : 'Dr',
      excludeReceiptId,
      extraDebit: convertedInvoiceTotal,
    })
  }, [
    clientContactById,
    convertedInvoiceTotal,
    excludeReceiptId,
    form.clientId,
    form.clientName,
  ])

  const paymentAmountValue = parseMoney(form.paymentAmount)
  const balanceAfterPayment = useMemo(() => {
    const signed =
      selectedClientBalance.type === 'Cr'
        ? -Math.abs(selectedClientBalance.amount)
        : Math.abs(selectedClientBalance.amount)
    const next = signed - Math.max(0, paymentAmountValue)
    if (next < 0) return { amount: Math.abs(next), type: 'Cr' as const }
    return { amount: Math.abs(next), type: 'Dr' as const }
  }, [paymentAmountValue, selectedClientBalance.amount, selectedClientBalance.type])

  const filteredProductsByQuery = useMemo(() => {
    const map: Record<string, FilterComboboxOption[]> = {}
    for (const line of form.lines) {
      const open = Boolean(descOpenByKey[line.key])
      const raw = open
        ? (descQueryByKey[line.key] ?? joinLineItemText(line.description, line.details))
        : joinLineItemText(line.description, line.details)
      const q = splitLineItemText(raw).description.trim().toLowerCase() || raw.trim().toLowerCase()
      map[line.key] = !q
        ? productOptions
        : productOptions.filter((opt) => {
            const details = productById[opt.id]
            const hay = [
              opt.label,
              details?.itemName,
              details?.itemCode,
              details?.itemDescription,
              details?.hsnCode,
            ]
              .filter(Boolean)
              .join(' ')
              .toLowerCase()
            return hay.includes(q)
          })
    }
    return map
  }, [form.lines, descOpenByKey, descQueryByKey, productOptions, productById])

  return (
    <div className={cn(limsRegistryFormClass, 'space-y-5')}>
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2 lg:items-start">
        {/* Document meta */}
        <section className="min-w-0 space-y-3 rounded-none border border-stone-500 bg-stone-50/60 p-3">
          <h3 className={sectionTitleClass}>{documentLabel} Details</h3>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="flex min-w-0 flex-col space-y-2">
              <Label htmlFor="quotation-number">{documentLabel} Number</Label>
              <Input
                id="quotation-number"
                value={form.quotationNumber}
                onChange={(e) => set('quotationNumber', e.target.value)}
                className={fieldClass}
                aria-label={`${documentLabel} number`}
              />
            </div>
            <div className="flex min-w-0 flex-col space-y-2">
              <Label htmlFor="quotation-status">Status</Label>
              <Select
                value={form.status}
                onValueChange={(v) => set('status', v as QuotationStatus)}
              >
                <SelectTrigger id="quotation-status" className={cn(fieldClass, 'w-full')}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {QUOTATION_STATUS_OPTIONS.map((s) => (
                    <SelectItem key={s.value} value={s.value}>
                      {s.label}
                    </SelectItem>
                  ))}
                  {!QUOTATION_STATUS_OPTIONS.some((o) => o.value === form.status) ? (
                    <SelectItem value={form.status}>
                      {QUOTATION_STATUS_LABELS[form.status] ?? form.status}
                    </SelectItem>
                  ) : null}
                </SelectContent>
              </Select>
            </div>
            <div className="flex min-w-0 flex-col space-y-2">
              <Label htmlFor="quotation-date">Date of {documentLabel}</Label>
              <Input
                id="quotation-date"
                type="date"
                value={form.quotationDate}
                onChange={(e) => {
                  const quotationDate = e.target.value
                  onChange({
                    ...form,
                    quotationDate,
                    validUntil: defaultValidUntil(quotationDate || undefined),
                  })
                }}
                className={fieldClass}
              />
            </div>
            {!isPaymentReceipt ? (
              <div className="flex min-w-0 flex-col space-y-2">
                <Label htmlFor="quotation-due">{documentLabel} Due Date</Label>
                <Input
                  id="quotation-due"
                  type="date"
                  value={form.validUntil}
                  onChange={(e) => set('validUntil', e.target.value)}
                  className={fieldClass}
                />
              </div>
            ) : null}
          </div>
        </section>

        {/* Client */}
        <section className="min-w-0 space-y-3 rounded-none border border-stone-500 bg-stone-50/60 p-3">
          <h3 className={sectionTitleClass}>Client Details</h3>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="flex min-w-0 flex-col space-y-2 sm:col-span-2">
              <Label htmlFor="quotation-client">Client</Label>
              <LimsFieldWithAdd
                addButton={
                  <LimsFieldAddButton
                    aria-label="Add new client"
                    title="Add New Client"
                    onClick={() => openAddClient()}
                  />
                }
              >
                <FilterCombobox
                  value={clientOpen ? clientQuery : selectedClientLabel}
                  onValueChange={(v) => {
                    setClientQuery(v)
                    if (!clientOpen) setClientOpen(true)
                    if (!v.trim()) {
                      clearClientSelection()
                      return
                    }
                    const match = clientOptions.find((opt) => opt.label === v)
                    if (match) applyClientSelection(match.id, match.label)
                  }}
                  options={
                    !clientQuery.trim()
                      ? clientOptions
                      : clientOptions.filter((opt) =>
                          opt.label.toLowerCase().includes(clientQuery.trim().toLowerCase()),
                        )
                  }
                  onSelectOption={(opt) => {
                    applyClientSelection(opt.id, opt.label)
                    setClientQuery(opt.label)
                    setClientOpen(false)
                  }}
                  open={clientOpen}
                  onOpenChange={(open) => {
                    setClientOpen(open)
                    if (open) setClientQuery((prev) => prev || selectedClientLabel)
                    else setClientQuery(selectedClientLabel)
                  }}
                  placeholder="Search Client"
                  listId="quotation-client-combobox"
                  inputId="quotation-client"
                  inputClassName="h-10 border-0 bg-transparent shadow-none focus-visible:border-transparent focus-visible:bg-transparent focus-visible:ring-0"
                  extraActions={[
                    {
                      key: 'add-client',
                      label: 'Add New Client',
                      onSelect: () => openAddClient(clientQuery),
                    },
                  ]}
                />
              </LimsFieldWithAdd>
            </div>
            {(form.clientId ||
              form.clientAddress ||
              form.clientGstNumber ||
              form.contactMobile ||
              form.contactEmail) && (
              <div className="sm:col-span-2 space-y-0.5 rounded-none border border-stone-400 bg-white px-3 py-2.5 text-sm leading-relaxed text-stone-800">
                {form.clientAddress.trim() ? (
                  <p className="whitespace-pre-wrap break-words">{form.clientAddress.trim()}</p>
                ) : null}
                {(form.clientGstNumber.trim() || form.contactMobile.trim()) && (
                  <p className="whitespace-pre-wrap break-words">
                    {[
                      form.clientGstNumber.trim() || '',
                      form.contactMobile.trim() || '',
                    ]
                      .filter(Boolean)
                      .join('  |  ')}
                  </p>
                )}
                {form.contactEmail.trim() ? (
                  <p className="whitespace-pre-wrap break-words">{form.contactEmail.trim()}</p>
                ) : null}
              </div>
            )}
          </div>
        </section>
      </div>

      {isPaymentReceipt ? (
        <section className="space-y-3 rounded-none border border-stone-500 bg-stone-50/60 p-3">
          <h3 className={sectionTitleClass}>Payment</h3>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <CurrencyBalanceField
              label="Current Balance"
              amount={selectedClientBalance.amount}
              balanceType={selectedClientBalance.type}
              emptyText={form.clientId ? undefined : 'Select a client'}
            />
            <div className="flex min-w-0 flex-col space-y-2">
              <Label htmlFor="payment-method">Payment In</Label>
              <Select
                value={form.paymentMethod || 'Bank'}
                onValueChange={(v) => set('paymentMethod', v as PaymentMethod)}
              >
                <SelectTrigger id="payment-method" className={cn(fieldClass, 'w-full')}>
                  <SelectValue placeholder="Select payment mode" />
                </SelectTrigger>
                <SelectContent>
                  {PAYMENT_METHOD_OPTIONS.map((mode) => (
                    <SelectItem key={mode} value={mode}>
                      {mode}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <CurrencyInrField
              id="payment-amount"
              label="Payment Amount"
              value={form.paymentAmount}
              onChange={(v) => set('paymentAmount', v)}
            />
            <CurrencyBalanceField
              label="Balance After Payment"
              amount={balanceAfterPayment.amount}
              balanceType={balanceAfterPayment.type}
              emptyText={form.clientId ? undefined : '—'}
              highlight
            />
          </div>
        </section>
      ) : (
        <>
      {/* Line items */}
      <section className="space-y-3">
        <div className="flex items-center justify-between gap-2 border-b border-stone-300 pb-1.5">
          <h3 className="text-xs font-bold uppercase tracking-wide text-stone-800">Line Items</h3>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 gap-1 rounded-none border-stone-500 px-2 text-[11px] font-semibold uppercase tracking-wide text-stone-700"
            aria-label="Select table columns"
            onClick={openColumnsDialog}
          >
            <Columns3 size={14} aria-hidden />
            Columns
          </Button>
        </div>

        <div className="overflow-x-auto rounded-none border-2 border-stone-500">
          <table className="w-full min-w-[520px] border-collapse text-sm">
            <thead>
              <tr className="bg-stone-800 text-white">
                <th className="w-12 px-0.5 py-2 text-center text-[10px] font-bold uppercase tracking-wider">
                  #
                </th>
                <th className="min-w-[200px] px-2 py-2 text-left text-[10px] font-bold uppercase tracking-wider">
                  Item / Description
                </th>
                {visibleLineColumns.make ? (
                  <th className="w-24 px-2 py-2 text-center text-[10px] font-bold uppercase tracking-wider">
                    Make
                  </th>
                ) : null}
                {visibleLineColumns.hsnSac ? (
                  <th className="w-24 px-2 py-2 text-center text-[10px] font-bold uppercase tracking-wider">
                    HSN/SAC
                  </th>
                ) : null}
                {visibleLineColumns.itemCode ? (
                  <th className="w-24 px-2 py-2 text-center text-[10px] font-bold uppercase tracking-wider">
                    Item Code
                  </th>
                ) : null}
                {visibleLineColumns.quantity ? (
                  <th className="w-20 px-2 py-2 text-center text-[10px] font-bold uppercase tracking-wider">
                    Qty
                  </th>
                ) : null}
                {visibleLineColumns.unit ? (
                  <th className="w-20 px-2 py-2 text-center text-[10px] font-bold uppercase tracking-wider">
                    Unit
                  </th>
                ) : null}
                {visibleLineColumns.rate ? (
                  <th className="w-28 px-2 py-2 text-center text-[10px] font-bold uppercase tracking-wider">
                    Rate
                  </th>
                ) : null}
                {visibleLineColumns.discountPercent ? (
                  <th className="w-20 px-2 py-2 text-center text-[10px] font-bold uppercase tracking-wider">
                    Disc %
                  </th>
                ) : null}
                {visibleLineColumns.amount ? (
                  <th className="w-28 px-2 py-2 text-center text-[10px] font-bold uppercase tracking-wider">
                    Amount
                  </th>
                ) : null}
                {visibleLineColumns.taxableAmount ? (
                  <th className="w-28 px-2 py-2 text-center text-[10px] font-bold uppercase tracking-wider">
                    Taxable
                  </th>
                ) : null}
                {visibleLineColumns.gstPercent ? (
                  <th className="w-20 px-2 py-2 text-center text-[10px] font-bold uppercase tracking-wider">
                    GST %
                  </th>
                ) : null}
                {visibleLineColumns.cgstPercent ? (
                  <th className="w-20 px-2 py-2 text-center text-[10px] font-bold uppercase tracking-wider">
                    CGST %
                  </th>
                ) : null}
                {visibleLineColumns.sgstPercent ? (
                  <th className="w-20 px-2 py-2 text-center text-[10px] font-bold uppercase tracking-wider">
                    SGST %
                  </th>
                ) : null}
                {visibleLineColumns.igstPercent ? (
                  <th className="w-20 px-2 py-2 text-center text-[10px] font-bold uppercase tracking-wider">
                    IGST %
                  </th>
                ) : null}
                {visibleLineColumns.cgstAmount ? (
                  <th className="w-24 px-2 py-2 text-center text-[10px] font-bold uppercase tracking-wider">
                    CGST
                  </th>
                ) : null}
                {visibleLineColumns.sgstAmount ? (
                  <th className="w-24 px-2 py-2 text-center text-[10px] font-bold uppercase tracking-wider">
                    SGST
                  </th>
                ) : null}
                {visibleLineColumns.igstAmount ? (
                  <th className="w-24 px-2 py-2 text-center text-[10px] font-bold uppercase tracking-wider">
                    IGST
                  </th>
                ) : null}
                {visibleLineColumns.lineRemarks ? (
                  <th className="min-w-[120px] px-2 py-2 text-center text-[10px] font-bold uppercase tracking-wider">
                    Remarks
                  </th>
                ) : null}
                {visibleLineColumns.deliveryPeriod ? (
                  <th className="w-28 px-2 py-2 text-center text-[10px] font-bold uppercase tracking-wider">
                    Delivery
                  </th>
                ) : null}
                <th className="w-12 px-2 py-2 text-center text-[10px] font-bold uppercase tracking-wider">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody className="bg-[#f7f3eb]">
              {form.lines.map((line, index) => {
                const isLast = index === form.lines.length - 1
                const descOpen = Boolean(descOpenByKey[line.key])
                const combined = joinLineItemText(line.description, line.details)
                const descValue = descOpen ? (descQueryByKey[line.key] ?? combined) : combined
                const cellTextClass =
                  'align-middle px-2 py-1.5 text-center text-sm text-stone-800'
                const gstSplit = lineGstSplit(line, 'intra')
                const moneyCellClass =
                  'align-middle px-2 py-1.5 text-center tabular-nums font-medium text-stone-900'
                return (
                  <tr
                    key={line.key}
                    className="align-middle border-t border-stone-300"
                  >
                    <td className="w-12 align-middle px-0.5 py-1.5">
                      <div className="flex items-center justify-center gap-0">
                        <button
                          type="button"
                          className="inline-flex h-6 w-4 items-center justify-center text-stone-500 hover:bg-stone-200 hover:text-stone-800 disabled:pointer-events-none disabled:opacity-30"
                          aria-label={`Move line ${index + 1} up`}
                          title="Move up"
                          disabled={index === 0}
                          onClick={() => moveLine(line.key, -1)}
                        >
                          <ChevronUp size={12} strokeWidth={2.25} aria-hidden />
                        </button>
                        <span className="min-w-[0.75rem] text-center text-[11px] font-medium tabular-nums text-stone-600">
                          {index + 1}
                        </span>
                        <button
                          type="button"
                          className="inline-flex h-6 w-4 items-center justify-center text-stone-500 hover:bg-stone-200 hover:text-stone-800 disabled:pointer-events-none disabled:opacity-30"
                          aria-label={`Move line ${index + 1} down`}
                          title="Move down"
                          disabled={index >= form.lines.length - 1}
                          onClick={() => moveLine(line.key, 1)}
                        >
                          <ChevronDown size={12} strokeWidth={2.25} aria-hidden />
                        </button>
                      </div>
                    </td>

                    {isLast ? (
                      <>
                        <td className="align-middle min-w-[220px] px-2 py-1.5">
                          <FilterCombobox
                            value={descValue}
                            onValueChange={(v) => {
                              setDescQueryByKey((prev) => ({ ...prev, [line.key]: v }))
                              setDescOpenByKey((prev) => ({ ...prev, [line.key]: true }))
                              const parts = splitLineItemText(v)
                              patchLine(line.key, {
                                description: parts.description,
                                details: parts.details,
                              })
                            }}
                            options={filteredProductsByQuery[line.key] ?? productOptions}
                            onSelectOption={(opt) => {
                              const details = productById[opt.id]
                              if (details) applyProductToLine(line.key, details)
                              else {
                                patchLine(line.key, { description: opt.label, details: '' })
                                setDescQueryByKey((prev) => ({ ...prev, [line.key]: opt.label }))
                              }
                            }}
                            open={descOpen}
                            onOpenChange={(open) => {
                              setDescOpenByKey((prev) => ({ ...prev, [line.key]: open }))
                              if (open) {
                                setDescQueryByKey((prev) => ({
                                  ...prev,
                                  [line.key]:
                                    prev[line.key] ??
                                    joinLineItemText(line.description, line.details),
                                }))
                                if (productOptions.length === 0) void onReloadProducts()
                              }
                            }}
                            onInputFocus={() => {
                              if (productOptions.length === 0) void onReloadProducts()
                            }}
                            placeholder="Type to Search Item"
                            listId={`quotation-line-desc-${line.key}`}
                            inputClassName="!h-9 rounded-none border-stone-500 bg-white text-left text-sm"
                            extraActions={[
                              {
                                key: 'add-product',
                                label: 'Add New Product / Service',
                                onSelect: () => {
                                  setAddProductLineKey(line.key)
                                  setAddProductInitialName(
                                    splitLineItemText(
                                      descQueryByKey[line.key] ??
                                        joinLineItemText(line.description, line.details),
                                    ).description.trim(),
                                  )
                                },
                              },
                            ]}
                          />
                        </td>
                        {visibleLineColumns.make ? (
                          <td className="align-middle px-2 py-1.5">
                            <Input
                              className={cn(lineFieldClass, 'text-center')}
                              value={line.make}
                              onChange={(e) => patchLine(line.key, { make: e.target.value })}
                              aria-label="Make"
                              placeholder="Make"
                            />
                          </td>
                        ) : null}
                        {visibleLineColumns.hsnSac ? (
                          <td className="align-middle px-2 py-1.5">
                            <Input
                              className={cn(lineFieldClass, 'text-center')}
                              value={line.hsnSac}
                              onChange={(e) => patchLine(line.key, { hsnSac: e.target.value })}
                              aria-label="HSN SAC"
                            />
                          </td>
                        ) : null}
                        {visibleLineColumns.itemCode ? (
                          <td className="align-middle px-2 py-1.5">
                            <Input
                              className={cn(lineFieldClass, 'text-center')}
                              value={line.itemCode}
                              onChange={(e) => patchLine(line.key, { itemCode: e.target.value })}
                              aria-label="Item code"
                              placeholder="Code"
                            />
                          </td>
                        ) : null}
                        {visibleLineColumns.quantity ? (
                          <td className="align-middle px-2 py-1.5">
                            <Input
                              className={cn(lineFieldClass, 'text-center')}
                              type="number"
                              min={0}
                              step="0.001"
                              value={line.quantity}
                              onChange={(e) => patchLine(line.key, { quantity: e.target.value })}
                              aria-label="Quantity"
                            />
                          </td>
                        ) : null}
                        {visibleLineColumns.unit ? (
                          <td className="align-middle px-2 py-1.5">
                            <Input
                              className={cn(lineFieldClass, 'text-center')}
                              value={line.unit}
                              onChange={(e) => patchLine(line.key, { unit: e.target.value })}
                              aria-label="Unit"
                            />
                          </td>
                        ) : null}
                        {visibleLineColumns.rate ? (
                          <td className="align-middle px-2 py-1.5">
                            <div className="flex !h-9 items-stretch overflow-hidden rounded-none border border-stone-500 bg-white">
                              <span
                                className="inline-flex shrink-0 items-center border-r border-stone-500 bg-stone-100 px-1.5 text-xs font-semibold text-stone-700"
                                aria-hidden
                              >
                                {getCurrencySymbol()}
                              </span>
                              <Input
                                className="h-full min-w-0 flex-1 rounded-none border-0 bg-transparent px-1 text-center tabular-nums shadow-none focus-visible:ring-0"
                                type="text"
                                inputMode="decimal"
                                value={
                                  rateFocusedKey === line.key
                                    ? line.rate
                                    : formatMoney(parseMoney(line.rate))
                                }
                                onFocus={() => {
                                  setRateFocusedKey(line.key)
                                  patchLine(line.key, {
                                    rate: sanitizeMoneyInput(line.rate) || '0',
                                  })
                                }}
                                onChange={(e) =>
                                  patchLine(line.key, { rate: sanitizeMoneyInput(e.target.value) })
                                }
                                onBlur={() => {
                                  setRateFocusedKey(null)
                                  patchLine(line.key, {
                                    rate: formatMoneyInput(line.rate || '0'),
                                  })
                                }}
                                aria-label={`Rate in ${getCurrencyCode()}`}
                              />
                            </div>
                          </td>
                        ) : null}
                        {visibleLineColumns.discountPercent ? (
                          <td className="align-middle px-2 py-1.5">
                            <Input
                              className={cn(lineFieldClass, 'text-center tabular-nums')}
                              type="number"
                              min={0}
                              max={100}
                              step="0.01"
                              value={line.discountPercent}
                              onChange={(e) =>
                                patchLine(line.key, { discountPercent: e.target.value })
                              }
                              aria-label="Discount percent"
                            />
                          </td>
                        ) : null}
                        {visibleLineColumns.amount ? (
                          <td className="align-middle px-2 py-1.5 text-center tabular-nums font-medium text-stone-900">
                            {getCurrencySymbol()} {formatMoney(lineAmount(line))}
                          </td>
                        ) : null}
                        {visibleLineColumns.taxableAmount ? (
                          <td className="align-middle px-2 py-1.5 text-center tabular-nums font-medium text-stone-900">
                            {getCurrencySymbol()} {formatMoney(lineTaxableAmount(line))}
                          </td>
                        ) : null}
                        {visibleLineColumns.gstPercent ? (
                          <td className="align-middle px-2 py-1.5">
                            <Input
                              className={cn(lineFieldClass, 'text-center tabular-nums')}
                              type="number"
                              min={0}
                              max={100}
                              step="0.01"
                              value={line.gstPercent}
                              onChange={(e) => patchLine(line.key, { gstPercent: e.target.value })}
                              aria-label="GST percent"
                            />
                          </td>
                        ) : null}
                        {visibleLineColumns.cgstPercent ? (
                          <td className={cn(cellTextClass, 'tabular-nums')}>
                            {formatMoney(gstSplit.cgstPercent)}
                          </td>
                        ) : null}
                        {visibleLineColumns.sgstPercent ? (
                          <td className={cn(cellTextClass, 'tabular-nums')}>
                            {formatMoney(gstSplit.sgstPercent)}
                          </td>
                        ) : null}
                        {visibleLineColumns.igstPercent ? (
                          <td className={cn(cellTextClass, 'tabular-nums')}>
                            {formatMoney(gstSplit.igstPercent)}
                          </td>
                        ) : null}
                        {visibleLineColumns.cgstAmount ? (
                          <td className={moneyCellClass}>{getCurrencySymbol()} {formatMoney(gstSplit.cgstAmount)}</td>
                        ) : null}
                        {visibleLineColumns.sgstAmount ? (
                          <td className={moneyCellClass}>{getCurrencySymbol()} {formatMoney(gstSplit.sgstAmount)}</td>
                        ) : null}
                        {visibleLineColumns.igstAmount ? (
                          <td className={moneyCellClass}>{getCurrencySymbol()} {formatMoney(gstSplit.igstAmount)}</td>
                        ) : null}
                        {visibleLineColumns.lineRemarks ? (
                          <td className="align-middle px-2 py-1.5">
                            <Input
                              className={cn(lineFieldClass, 'text-left')}
                              value={line.lineRemarks}
                              onChange={(e) =>
                                patchLine(line.key, { lineRemarks: e.target.value })
                              }
                              aria-label="Line remarks"
                              placeholder="Remarks"
                            />
                          </td>
                        ) : null}
                        {visibleLineColumns.deliveryPeriod ? (
                          <td className="align-middle px-2 py-1.5">
                            <Input
                              className={cn(lineFieldClass, 'text-center')}
                              value={line.deliveryPeriod}
                              onChange={(e) =>
                                patchLine(line.key, { deliveryPeriod: e.target.value })
                              }
                              aria-label="Delivery period"
                              placeholder="e.g. 7 days"
                            />
                          </td>
                        ) : null}
                        <td className="align-middle px-2 py-1.5 text-center">
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7 rounded-none text-amber-800 hover:bg-amber-500/15 hover:text-amber-950"
                            onClick={addLine}
                            disabled={!line.description.trim()}
                            aria-label="Add line"
                            title="Add line"
                          >
                            <Plus size={16} strokeWidth={2.25} />
                          </Button>
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="align-middle min-w-[220px] px-2 py-1.5 text-left text-sm text-stone-800">
                          <p className="whitespace-pre-wrap break-words leading-snug">
                            {combined || '—'}
                          </p>
                        </td>
                        {visibleLineColumns.make ? (
                          <td className={cellTextClass}>{line.make.trim() || '—'}</td>
                        ) : null}
                        {visibleLineColumns.hsnSac ? (
                          <td className={cellTextClass}>{line.hsnSac.trim() || '—'}</td>
                        ) : null}
                        {visibleLineColumns.itemCode ? (
                          <td className={cellTextClass}>{line.itemCode.trim() || '—'}</td>
                        ) : null}
                        {visibleLineColumns.quantity ? (
                          <td className={cn(cellTextClass, 'tabular-nums')}>
                            {line.quantity.trim() || '—'}
                          </td>
                        ) : null}
                        {visibleLineColumns.unit ? (
                          <td className={cellTextClass}>{line.unit.trim() || '—'}</td>
                        ) : null}
                        {visibleLineColumns.rate ? (
                          <td className={cn(cellTextClass, 'tabular-nums')}>
                            {getCurrencySymbol()} {formatMoney(parseMoney(line.rate))}
                          </td>
                        ) : null}
                        {visibleLineColumns.discountPercent ? (
                          <td className={cn(cellTextClass, 'tabular-nums')}>
                            {line.discountPercent.trim() || '0'}
                          </td>
                        ) : null}
                        {visibleLineColumns.amount ? (
                          <td className="align-middle px-2 py-1.5 text-center tabular-nums font-medium text-stone-900">
                            {getCurrencySymbol()} {formatMoney(lineAmount(line))}
                          </td>
                        ) : null}
                        {visibleLineColumns.taxableAmount ? (
                          <td className="align-middle px-2 py-1.5 text-center tabular-nums font-medium text-stone-900">
                            {getCurrencySymbol()} {formatMoney(lineTaxableAmount(line))}
                          </td>
                        ) : null}
                        {visibleLineColumns.gstPercent ? (
                          <td className={cn(cellTextClass, 'tabular-nums')}>
                            {line.gstPercent.trim() || '0'}
                          </td>
                        ) : null}
                        {visibleLineColumns.cgstPercent ? (
                          <td className={cn(cellTextClass, 'tabular-nums')}>
                            {formatMoney(gstSplit.cgstPercent)}
                          </td>
                        ) : null}
                        {visibleLineColumns.sgstPercent ? (
                          <td className={cn(cellTextClass, 'tabular-nums')}>
                            {formatMoney(gstSplit.sgstPercent)}
                          </td>
                        ) : null}
                        {visibleLineColumns.igstPercent ? (
                          <td className={cn(cellTextClass, 'tabular-nums')}>
                            {formatMoney(gstSplit.igstPercent)}
                          </td>
                        ) : null}
                        {visibleLineColumns.cgstAmount ? (
                          <td className={moneyCellClass}>{getCurrencySymbol()} {formatMoney(gstSplit.cgstAmount)}</td>
                        ) : null}
                        {visibleLineColumns.sgstAmount ? (
                          <td className={moneyCellClass}>{getCurrencySymbol()} {formatMoney(gstSplit.sgstAmount)}</td>
                        ) : null}
                        {visibleLineColumns.igstAmount ? (
                          <td className={moneyCellClass}>{getCurrencySymbol()} {formatMoney(gstSplit.igstAmount)}</td>
                        ) : null}
                        {visibleLineColumns.lineRemarks ? (
                          <td className={cn(cellTextClass, 'text-left')}>
                            {line.lineRemarks.trim() || '—'}
                          </td>
                        ) : null}
                        {visibleLineColumns.deliveryPeriod ? (
                          <td className={cellTextClass}>{line.deliveryPeriod.trim() || '—'}</td>
                        ) : null}
                        <td className="align-middle px-2 py-1.5 text-center">
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7 rounded-none text-destructive hover:bg-destructive/10"
                            onClick={() => removeLine(line.key)}
                            disabled={form.lines.length <= 1}
                            aria-label="Remove line"
                          >
                            <Trash2 size={14} />
                          </Button>
                        </td>
                      </>
                    )}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* Totals + bank */}
      <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="space-y-3 rounded-none border border-stone-500 bg-stone-50 p-3">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <h3 className="shrink-0 text-xs font-bold uppercase tracking-wide text-stone-800">
              Amount in Words:
            </h3>
            <p className="min-w-0 flex-1 text-sm font-medium leading-snug text-stone-900">
              {amountInWords}
            </p>
          </div>
          <h3 className="pt-2 text-xs font-bold uppercase tracking-wide text-stone-800">
            Bank Details
          </h3>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm text-stone-800">
            <p className="min-w-0">
              <span className="font-medium">Bank Name: </span>
              {bankDetails.bankName || '—'}
            </p>
            <p className="min-w-0">
              <span className="font-medium">Branch: </span>
              {bankDetails.branchName || '—'}
            </p>
            <p className="min-w-0">
              <span className="font-medium">A/C No.: </span>
              {bankDetails.accountNumber || '—'}
            </p>
            <p className="min-w-0">
              <span className="font-medium">IFSC: </span>
              {bankDetails.ifsc || '—'}
            </p>
            {bankDetails.upi ? (
              <p className="col-span-2 min-w-0">
                <span className="font-medium">UPI: </span>
                {bankDetails.upi}
              </p>
            ) : null}
          </div>
        </div>

        <div className="space-y-2 rounded-none border border-stone-500 bg-stone-50 p-3 text-sm">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] font-bold uppercase tracking-wide text-stone-700">
              Totals
            </span>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 gap-1 rounded-none border-stone-500 bg-white px-2 text-[11px] font-semibold uppercase tracking-wide text-stone-700"
                >
                  <Plus size={12} aria-hidden />
                  Add Charge
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="rounded-none border-stone-500">
                <DropdownMenuItem
                  disabled={showDiscountRow}
                  onSelect={() => {
                    setShowDiscountRow(true)
                    if (!form.discountAmount.trim()) set('discountAmount', '0')
                  }}
                >
                  Discount
                </DropdownMenuItem>
                <DropdownMenuItem
                  disabled={showTransportRow}
                  onSelect={() => {
                    setShowTransportRow(true)
                    if (!form.transportationCharges.trim()) set('transportationCharges', '0')
                  }}
                >
                  Transportation Charges
                </DropdownMenuItem>
                <DropdownMenuItem
                  disabled={showPackagingRow}
                  onSelect={() => {
                    setShowPackagingRow(true)
                    if (!form.packagingCharges.trim()) set('packagingCharges', '0')
                  }}
                >
                  Packaging Charge
                </DropdownMenuItem>
                <DropdownMenuItem
                  disabled={showCgstRow}
                  onSelect={() => {
                    setShowIgstRow(false)
                    setShowCgstRow(true)
                  }}
                >
                  CGST
                </DropdownMenuItem>
                <DropdownMenuItem
                  disabled={showSgstRow}
                  onSelect={() => {
                    setShowIgstRow(false)
                    setShowSgstRow(true)
                  }}
                >
                  SGST
                </DropdownMenuItem>
                <DropdownMenuItem
                  disabled={showIgstRow}
                  onSelect={() => {
                    setShowCgstRow(false)
                    setShowSgstRow(false)
                    setShowIgstRow(true)
                  }}
                >
                  IGST
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          <div className="flex items-center justify-between gap-3">
            <span className="text-stone-600">Basic Amount</span>
            <span className="tabular-nums">{getCurrencySymbol()} {formatMoney(totals.subtotal)}</span>
          </div>

          {showDiscountRow ? (
            <div className="flex items-center justify-between gap-2">
              <span className="text-stone-600">Discount</span>
              <div className="flex items-center gap-1">
                <span className="text-stone-500">{getCurrencySymbol()}</span>
                <Input
                  type="text"
                  inputMode="decimal"
                  value={form.discountAmount}
                  onChange={(e) =>
                    set('discountAmount', sanitizeMoneyInput(e.target.value))
                  }
                  className="!h-7 w-24 rounded-none border-stone-500 bg-white px-2 text-right tabular-nums"
                  aria-label="Discount amount"
                />
                <button
                  type="button"
                  className="inline-flex h-7 w-7 items-center justify-center text-stone-500 hover:text-red-700"
                  aria-label="Remove discount"
                  title="Remove"
                  onClick={() => {
                    setShowDiscountRow(false)
                    set('discountAmount', '0')
                    set('discountPercent', '0')
                  }}
                >
                  <X size={14} aria-hidden />
                </button>
              </div>
            </div>
          ) : null}

          {showTransportRow ? (
            <div className="flex items-center justify-between gap-2">
              <span className="text-stone-600">Transportation Charges</span>
              <div className="flex items-center gap-1">
                <span className="text-stone-500">{getCurrencySymbol()}</span>
                <Input
                  type="text"
                  inputMode="decimal"
                  value={form.transportationCharges}
                  onChange={(e) =>
                    set('transportationCharges', sanitizeMoneyInput(e.target.value))
                  }
                  className="!h-7 w-24 rounded-none border-stone-500 bg-white px-2 text-right tabular-nums"
                  aria-label="Transportation charges"
                />
                <button
                  type="button"
                  className="inline-flex h-7 w-7 items-center justify-center text-stone-500 hover:text-red-700"
                  aria-label="Remove transportation charges"
                  title="Remove"
                  onClick={() => {
                    setShowTransportRow(false)
                    set('transportationCharges', '0')
                  }}
                >
                  <X size={14} aria-hidden />
                </button>
              </div>
            </div>
          ) : null}

          {showPackagingRow ? (
            <div className="flex items-center justify-between gap-2">
              <span className="text-stone-600">Packaging Charge</span>
              <div className="flex items-center gap-1">
                <span className="text-stone-500">{getCurrencySymbol()}</span>
                <Input
                  type="text"
                  inputMode="decimal"
                  value={form.packagingCharges}
                  onChange={(e) =>
                    set('packagingCharges', sanitizeMoneyInput(e.target.value))
                  }
                  className="!h-7 w-24 rounded-none border-stone-500 bg-white px-2 text-right tabular-nums"
                  aria-label="Packaging charge"
                />
                <button
                  type="button"
                  className="inline-flex h-7 w-7 items-center justify-center text-stone-500 hover:text-red-700"
                  aria-label="Remove packaging charge"
                  title="Remove"
                  onClick={() => {
                    setShowPackagingRow(false)
                    set('packagingCharges', '0')
                  }}
                >
                  <X size={14} aria-hidden />
                </button>
              </div>
            </div>
          ) : null}

          {showCgstRow ? (
            <div className="flex items-center justify-between gap-2">
              <span className="text-stone-600">CGST</span>
              <div className="flex items-center gap-1">
                <span className="tabular-nums">{getCurrencySymbol()} {formatMoney(totals.cgstAmount)}</span>
                <button
                  type="button"
                  className="inline-flex h-7 w-7 items-center justify-center text-stone-500 hover:text-red-700"
                  aria-label="Remove CGST"
                  title="Remove"
                  onClick={() => setShowCgstRow(false)}
                >
                  <X size={14} aria-hidden />
                </button>
              </div>
            </div>
          ) : null}

          {showSgstRow ? (
            <div className="flex items-center justify-between gap-2">
              <span className="text-stone-600">SGST</span>
              <div className="flex items-center gap-1">
                <span className="tabular-nums">{getCurrencySymbol()} {formatMoney(totals.sgstAmount)}</span>
                <button
                  type="button"
                  className="inline-flex h-7 w-7 items-center justify-center text-stone-500 hover:text-red-700"
                  aria-label="Remove SGST"
                  title="Remove"
                  onClick={() => setShowSgstRow(false)}
                >
                  <X size={14} aria-hidden />
                </button>
              </div>
            </div>
          ) : null}

          {showIgstRow ? (
            <div className="flex items-center justify-between gap-2">
              <span className="text-stone-600">IGST</span>
              <div className="flex items-center gap-1">
                <span className="tabular-nums">{getCurrencySymbol()} {formatMoney(totals.igstAmount)}</span>
                <button
                  type="button"
                  className="inline-flex h-7 w-7 items-center justify-center text-stone-500 hover:text-red-700"
                  aria-label="Remove IGST"
                  title="Remove"
                  onClick={() => setShowIgstRow(false)}
                >
                  <X size={14} aria-hidden />
                </button>
              </div>
            </div>
          ) : null}

          {!showGstBreakdown ? (
            <div className="flex items-center justify-between gap-3">
              <span className="text-stone-600">GST Amount</span>
              <span className="tabular-nums">{getCurrencySymbol()} {formatMoney(totals.gstAmount)}</span>
            </div>
          ) : null}
          <div className="flex items-center justify-between gap-3 border-t-2 border-stone-800 pt-2 text-base font-semibold">
            <span>Grand Total</span>
            <span className="tabular-nums text-amber-900">{getCurrencySymbol()} {formatMoney(totals.grandTotal)}</span>
          </div>
        </div>
      </section>
        </>
      )}

      {/* Other */}
      <section className="space-y-3">
        <h3 className={sectionTitleClass}>Other</h3>
        <div className="grid grid-cols-3 gap-2">
          <div className="flex min-w-0 flex-col space-y-2">
            <Label htmlFor="term-condition">Term &amp; Condition</Label>
            <LimsFieldWithAdd
              addButton={
                <LimsFieldAddButton
                  aria-label="Manage terms and conditions"
                  title="Manage Terms & Conditions"
                  onClick={() => setManageTermsOpen(true)}
                />
              }
            >
              <FilterCombobox
                value={termsOpen ? form.paymentTerms : selectedTermDisplay}
                onValueChange={(v) => {
                  set('paymentTerms', v)
                  if (!termsOpen) setTermsOpen(true)
                }}
                options={
                  !form.paymentTerms.trim()
                    ? termOptions
                    : termOptions.filter((opt) => {
                        const term = terms.find((t) => t.id === opt.id)
                        const q = form.paymentTerms.trim().toLowerCase()
                        return (
                          opt.label.toLowerCase().includes(q) ||
                          (term?.content ?? '').toLowerCase().includes(q) ||
                          (term?.label ?? '').toLowerCase().includes(q)
                        )
                      })
                }
                onSelectOption={(opt) => {
                  const term = terms.find((t) => t.id === opt.id)
                  set('paymentTerms', term?.content ?? opt.label)
                  setTermsOpen(false)
                }}
                open={termsOpen}
                onOpenChange={(open) => {
                  setTermsOpen(open)
                  if (open) {
                    const match = terms.find((t) => t.content === form.paymentTerms)
                    if (match) set('paymentTerms', match.label)
                  } else {
                    const byLabel = terms.find(
                      (t) =>
                        t.label === form.paymentTerms.trim() ||
                        `${t.label} (Default)` === form.paymentTerms.trim(),
                    )
                    if (byLabel) set('paymentTerms', byLabel.content)
                  }
                }}
                placeholder="Select Term & Condition"
                listId="quotation-terms-combobox"
                inputId="term-condition"
                inputClassName="h-10 border-0 bg-transparent shadow-none focus-visible:border-transparent focus-visible:bg-transparent focus-visible:ring-0"
                extraActions={[
                  {
                    key: 'manage-terms',
                    label: 'Manage Terms & Conditions',
                    onSelect: () => setManageTermsOpen(true),
                  },
                ]}
              />
            </LimsFieldWithAdd>
          </div>

          <div className="flex min-w-0 flex-col space-y-2">
            <Label htmlFor="quotation-notes">Notes</Label>
            <LimsFieldWithAdd
              addButton={
                <LimsFieldAddButton
                  aria-label="Manage notes"
                  title="Manage Notes"
                  onClick={() => setManageNotesOpen(true)}
                />
              }
            >
              <FilterCombobox
                value={notesOpen ? form.notes : selectedNoteDisplay}
                onValueChange={(v) => {
                  set('notes', v)
                  if (!notesOpen) setNotesOpen(true)
                }}
                options={
                  !form.notes.trim()
                    ? noteOptions
                    : noteOptions.filter((opt) => {
                        const note = notes.find((n) => n.id === opt.id)
                        const q = form.notes.trim().toLowerCase()
                        return (
                          opt.label.toLowerCase().includes(q) ||
                          (note?.content ?? '').toLowerCase().includes(q) ||
                          (note?.label ?? '').toLowerCase().includes(q)
                        )
                      })
                }
                onSelectOption={(opt) => {
                  const note = notes.find((n) => n.id === opt.id)
                  set('notes', note?.content ?? opt.label)
                  setNotesOpen(false)
                }}
                open={notesOpen}
                onOpenChange={(open) => {
                  setNotesOpen(open)
                  if (open) {
                    const match = notes.find((n) => n.content === form.notes)
                    if (match) set('notes', match.label)
                  } else {
                    const byLabel = notes.find(
                      (n) =>
                        n.label === form.notes.trim() ||
                        `${n.label} (Default)` === form.notes.trim(),
                    )
                    if (byLabel) set('notes', byLabel.content)
                  }
                }}
                placeholder="Select Notes"
                listId="quotation-notes-combobox"
                inputId="quotation-notes"
                inputClassName="h-10 border-0 bg-transparent shadow-none focus-visible:border-transparent focus-visible:bg-transparent focus-visible:ring-0"
                extraActions={[
                  {
                    key: 'manage-notes',
                    label: 'Manage Notes',
                    onSelect: () => setManageNotesOpen(true),
                  },
                ]}
              />
            </LimsFieldWithAdd>
          </div>

          <QuotationSignatureField
            text={form.signatureText}
            imagePath={form.signatureImagePath}
            onTextChange={(signatureText) => set('signatureText', signatureText)}
            onImagePathChange={(signatureImagePath) => set('signatureImagePath', signatureImagePath)}
            documentKind={documentKind}
            documentLabel={documentLabel}
          />
        </div>
      </section>

      <div className="mt-1 flex items-center justify-end gap-2 border-t border-stone-200 pt-2.5">
        <Button
          type="button"
          className={cn(limsPrimaryBtnClass, 'h-9 px-4 text-sm')}
          disabled={saveLoading}
          onClick={onSave}
        >
          {saveLoading ? 'Saving…' : 'Save & Close'}
        </Button>
      </div>

      <Dialog open={columnsDialogOpen} onOpenChange={setColumnsDialogOpen}>
        <DialogContent
          className={cn(
            limsDialogClass,
            '!flex max-h-[min(90vh,640px)] w-[min(480px,94vw)] max-w-lg flex-col',
          )}
          aria-describedby={undefined}
          layer="nested"
          persistOnFocusLoss
        >
          <div className="relative shrink-0 overflow-hidden bg-gradient-to-br from-stone-800 via-stone-900 to-stone-950 px-4 py-2.5 text-white">
            <div
              className="pointer-events-none absolute inset-0 opacity-[0.18]"
              style={{
                backgroundImage:
                  'radial-gradient(circle at 12% 20%, rgba(217,119,6,0.45), transparent 42%), radial-gradient(circle at 88% 0%, rgba(251,191,36,0.25), transparent 35%)',
              }}
            />
            <div className="absolute bottom-0 left-0 h-[2px] w-full bg-gradient-to-r from-amber-500 via-amber-300 to-transparent" />
            <DialogHeader className="relative pr-10 text-left">
              <DialogTitle className="text-base font-semibold tracking-tight text-white">
                Select Columns
              </DialogTitle>
            </DialogHeader>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto bg-gradient-to-b from-stone-100/80 to-white px-4 py-4">
            <div className="overflow-hidden rounded-none border border-stone-500">
              <table className="w-full border-collapse text-sm">
                <thead className="sticky top-0 z-10">
                  <tr className="bg-stone-800 text-amber-200">
                    <th className="px-3 py-2 text-left text-[11px] font-bold uppercase tracking-wider">
                      Column Name
                    </th>
                    <th className="w-24 px-3 py-2 text-center text-[11px] font-bold uppercase tracking-wider">
                      Action
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-[#f7f3eb]">
                  {LINE_COLUMN_OPTIONS.map((col) => {
                    const checked = draftLineColumns[col.key]
                    const id = `quotation-col-${col.key}`
                    return (
                      <tr key={col.key} className="border-t border-stone-300">
                        <td className="px-3 py-2 font-medium text-stone-800">
                          <label htmlFor={id} className="cursor-pointer">
                            {col.label}
                          </label>
                        </td>
                        <td className="px-3 py-2 text-center">
                          <input
                            id={id}
                            type="checkbox"
                            checked={checked}
                            onChange={(e) => toggleDraftColumn(col.key, e.target.checked)}
                            className="h-4 w-4 rounded-none border-stone-500 text-amber-700 focus:ring-amber-500/30"
                            aria-label={`Show ${col.label}`}
                          />
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            {!LINE_COLUMN_OPTIONS.some((c) => draftLineColumns[c.key]) ? (
              <p className="pt-2 text-xs text-destructive">Select at least one column.</p>
            ) : null}
          </div>

          <DialogFooter className="shrink-0 border-t border-stone-200 bg-stone-50 px-4 py-3 sm:justify-end">
            <Button
              type="button"
              className={limsPrimaryBtnClass}
              disabled={!LINE_COLUMN_OPTIONS.some((c) => draftLineColumns[c.key])}
              onClick={applyColumnsDialog}
            >
              Save & Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ManageQuotationTermsDialog
        open={manageTermsOpen}
        onOpenChange={setManageTermsOpen}
        onChanged={(rows) => setTerms(rows)}
        onDefaultSet={(content) => set('paymentTerms', content)}
        documentKind={documentKind}
        documentLabel={documentLabel}
      />

      <ManageQuotationNotesDialog
        open={manageNotesOpen}
        onOpenChange={setManageNotesOpen}
        onChanged={(rows) => setNotes(rows)}
        onDefaultSet={(content) => set('notes', content)}
        documentKind={documentKind}
        documentLabel={documentLabel}
      />

      <AddClientDialog
        nested
        open={addClientOpen}
        onOpenChange={(open) => {
          setAddClientOpen(open)
          if (!open) setAddClientInitialName('')
        }}
        initialCompanyName={addClientInitialName}
        onSaved={(id) => {
          void (async () => {
            const result = await onReloadClients()
            const label =
              result?.options.find((opt) => opt.id === id)?.label ||
              addClientInitialName.trim() ||
              'Unnamed'
            const contact = result?.contacts[id]
            applyClientSelection(id, label, contact)
            setClientQuery(label)
            setAddClientInitialName('')
          })()
        }}
      />

      <AddProductServiceDialog
        nested
        open={addProductLineKey != null}
        onOpenChange={(open) => {
          if (!open) {
            setAddProductLineKey(null)
            setAddProductInitialName('')
          }
        }}
        initialItemName={addProductInitialName}
        onSaved={(item) => {
          const lineKey = addProductLineKey
          void onReloadProducts()
          if (lineKey) applyProductToLine(lineKey, item)
          setAddProductLineKey(null)
          setAddProductInitialName('')
        }}
      />
    </div>
  )
}
