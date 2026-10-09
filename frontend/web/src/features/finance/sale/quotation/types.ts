/** Finance Management · Sale · Quotation types */

export type QuotationStatus =
  | 'Draft'
  | 'Sent'
  | 'Finalized'
  | 'Proforma'
  | 'Invoice'
  | 'CreditNote'
  | 'Payment'
  /** Legacy values still readable from older rows */
  | 'Accepted'
  | 'Rejected'
  | 'Expired'
  | 'Converted'

/** Primary status choices shown in UI dropdowns (quotation module). */
export const QUOTATION_STATUS_OPTIONS: Array<{ value: QuotationStatus; label: string }> = [
  { value: 'Draft', label: 'Draft' },
  { value: 'Sent', label: 'Sent' },
  { value: 'Finalized', label: 'Finalized' },
  { value: 'Proforma', label: 'Convert to Proforma Invoice' },
  { value: 'Invoice', label: 'Convert to Invoice' },
]

const BASE_STATUS_OPTIONS: Array<{ value: QuotationStatus; label: string }> = [
  { value: 'Draft', label: 'Draft' },
  { value: 'Sent', label: 'Sent' },
  { value: 'Finalized', label: 'Finalized' },
]

/** Status dropdown options per finance document kind. */
export function statusOptionsForDocumentKind(
  kind: string | null | undefined,
): Array<{ value: QuotationStatus; label: string }> {
  switch (kind) {
    case 'proformaInvoice':
      return [...BASE_STATUS_OPTIONS, { value: 'Invoice', label: 'Convert to Invoice' }]
    case 'invoice':
      return [
        ...BASE_STATUS_OPTIONS,
        { value: 'CreditNote', label: 'Convert to Credit Note' },
        { value: 'Payment', label: 'Convert to Payment Receipt' },
      ]
    case 'creditNote':
    case 'paymentReceipt':
      return BASE_STATUS_OPTIONS
    default:
      return QUOTATION_STATUS_OPTIONS
  }
}

export const QUOTATION_STATUSES: QuotationStatus[] = QUOTATION_STATUS_OPTIONS.map((o) => o.value)

export const QUOTATION_STATUS_LABELS: Record<QuotationStatus, string> = {
  Draft: 'Draft',
  Sent: 'Sent',
  Finalized: 'Finalized',
  Proforma: 'Convert to Proforma Invoice',
  Invoice: 'Convert to Invoice',
  CreditNote: 'Convert to Credit Note',
  Payment: 'Convert to Payment Receipt',
  Accepted: 'Finalized',
  Rejected: 'Rejected',
  Expired: 'Expired',
  Converted: 'Convert to Invoice',
}

export function quotationStatusLabel(status: string): string {
  const known = QUOTATION_STATUS_LABELS[status as QuotationStatus]
  if (known) return known
  const trimmed = status.trim()
  if (!trimmed) return status
  const match = (Object.keys(QUOTATION_STATUS_LABELS) as QuotationStatus[]).find(
    (key) => key.toLowerCase() === trimmed.toLowerCase(),
  )
  if (match) return QUOTATION_STATUS_LABELS[match]
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1).toLowerCase()
}

export type QuotationLineRow = {
  id: string
  quotation_id: string
  line_no: number
  description: string
  details: string | null
  make: string | null
  hsn_sac: string | null
  item_code?: string | null
  quantity: number
  unit: string
  rate: number
  amount: number
  discount_percent?: number | null
  gst_percent?: number | null
  line_remarks?: string | null
  delivery_period?: string | null
}

export type QuotationRow = {
  id: string
  quotation_number: string
  quotation_date: string
  valid_until: string | null
  client_id: string | null
  client_name: string
  contact_person: string | null
  contact_email: string | null
  contact_mobile: string | null
  client_address: string | null
  client_gst_number: string | null
  /** Tax invoice and credit note: intra = CGST+SGST, inter = IGST. */
  gst_supply_mode?: 'intra' | 'inter' | null
  subject: string | null
  /** Against-document / PO / invoice number (not payment mode). */
  reference_no: string | null
  status: QuotationStatus
  payment_terms: string | null
  notes: string | null
  remarks: string | null
  signature_text: string | null
  signature_image_path: string | null
  /** Payment Receipt only — Bank / Cash / UPI / … (from transactions.mode_of_payment). */
  payment_method?: string | null
  /** Payment Receipt only — 2 or 10. Null means no TDS. */
  tds_percent?: number | null
  discount_percent: number
  discount_amount: number
  transportation_charges?: number | null
  packaging_charges?: number | null
  gst_percent: number
  gst_amount: number
  subtotal: number
  grand_total: number
  created_at?: string
  updated_at?: string
  line_items?: QuotationLineRow[]
}

export type QuotationLineForm = {
  key: string
  description: string
  details: string
  make: string
  hsnSac: string
  itemCode: string
  quantity: string
  unit: string
  rate: string
  discountPercent: string
  gstPercent: string
  lineRemarks: string
  deliveryPeriod: string
}

export type QuotationForm = {
  quotationNumber: string
  quotationDate: string
  validUntil: string
  clientId: string
  clientName: string
  contactPerson: string
  contactEmail: string
  contactMobile: string
  clientAddress: string
  clientGstNumber: string
  subject: string
  referenceNo: string
  status: QuotationStatus
  paymentTerms: string
  notes: string
  remarks: string
  signatureText: string
  signatureImagePath: string
  /** Header-level absolute discount (₹). */
  discountAmount: string
  transportationCharges: string
  packagingCharges: string
  discountPercent: string
  gstPercent: string
  /** Payment Receipt: amount received (₹). Unused on Quotation / Invoice forms. */
  paymentAmount: string
  /** Payment Receipt: how payment was received (Bank / Cash / …). */
  paymentMethod: string
  /** Payment Receipt: 2 or 10. Empty means no TDS. */
  tdsPercent: string
  lines: QuotationLineForm[]
}

export const PAYMENT_METHOD_OPTIONS = [
  'Bank',
  'Cash',
  'UPI',
  'Cheque',
  'Other',
] as const

export type PaymentMethod = (typeof PAYMENT_METHOD_OPTIONS)[number]

export function normalizePaymentMethod(value: string | null | undefined): PaymentMethod {
  const v = String(value ?? '').trim()
  return (PAYMENT_METHOD_OPTIONS as readonly string[]).includes(v)
    ? (v as PaymentMethod)
    : 'Bank'
}

export function todayIsoDate(): string {
  const d = new Date()
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

export function defaultValidUntil(fromDate = todayIsoDate()): string {
  const d = new Date(`${fromDate}T00:00:00`)
  if (Number.isNaN(d.getTime())) return todayIsoDate()
  d.setDate(d.getDate() + 30)
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

export function newLineKey(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `line-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

export function emptyQuotationLine(): QuotationLineForm {
  return {
    key: newLineKey(),
    description: '',
    details: '',
    make: '',
    hsnSac: '',
    itemCode: '',
    quantity: '1',
    unit: 'Nos',
    rate: '0',
    discountPercent: '0',
    gstPercent: '0',
    lineRemarks: '',
    deliveryPeriod: '',
  }
}

export function emptyQuotationForm(nextNumber = ''): QuotationForm {
  const quotationDate = todayIsoDate()
  return {
    quotationNumber: nextNumber,
    quotationDate,
    validUntil: defaultValidUntil(quotationDate),
    clientId: '',
    clientName: '',
    contactPerson: '',
    contactEmail: '',
    contactMobile: '',
    clientAddress: '',
    clientGstNumber: '',
    subject: '',
    referenceNo: '',
    status: 'Draft',
    paymentTerms: '100 % Advance',
    notes: '',
    remarks: '',
    signatureText: '',
    signatureImagePath: '',
    discountAmount: '0',
    transportationCharges: '0',
    packagingCharges: '0',
    discountPercent: '0',
    gstPercent: '18',
    paymentAmount: '',
    paymentMethod: 'Bank',
    tdsPercent: '',
    lines: [emptyQuotationLine()],
  }
}

export function parseMoney(value: string): number {
  const n = Number.parseFloat(String(value).replace(/,/g, '').trim())
  return Number.isFinite(n) ? n : 0
}

export function lineAmount(line: QuotationLineForm): number {
  const qty = parseMoney(line.quantity)
  const rate = parseMoney(line.rate)
  return Math.round(qty * rate * 100) / 100
}

/** Amount after line discount (taxable base before GST). */
export function lineTaxableAmount(line: QuotationLineForm): number {
  const base = lineAmount(line)
  const discountPercent = Math.min(100, Math.max(0, parseMoney(line.discountPercent)))
  return Math.round(base * (1 - discountPercent / 100) * 100) / 100
}

export type LineGstSplit = {
  gstPercent: number
  cgstPercent: number
  sgstPercent: number
  igstPercent: number
  gstAmount: number
  cgstAmount: number
  sgstAmount: number
  igstAmount: number
}

/**
 * Intra-state default: CGST + SGST = GST/2 each, IGST = 0.
 * Inter-state: IGST = full GST, CGST/SGST = 0.
 */
export function lineGstSplit(
  line: QuotationLineForm,
  mode: 'intra' | 'inter' = 'intra',
): LineGstSplit {
  const gstPercent = Math.max(0, parseMoney(line.gstPercent))
  const taxable = lineTaxableAmount(line)
  const gstAmount = Math.round(taxable * (gstPercent / 100) * 100) / 100
  if (mode === 'inter') {
    return {
      gstPercent,
      cgstPercent: 0,
      sgstPercent: 0,
      igstPercent: gstPercent,
      gstAmount,
      cgstAmount: 0,
      sgstAmount: 0,
      igstAmount: gstAmount,
    }
  }
  const halfPercent = Math.round((gstPercent / 2) * 100) / 100
  const cgstAmount = Math.round((gstAmount / 2) * 100) / 100
  const sgstAmount = Math.round((gstAmount - cgstAmount) * 100) / 100
  return {
    gstPercent,
    cgstPercent: halfPercent,
    sgstPercent: halfPercent,
    igstPercent: 0,
    gstAmount,
    cgstAmount,
    sgstAmount,
    igstAmount: 0,
  }
}

export function computeQuotationTotals(
  form: QuotationForm,
  gstMode: 'intra' | 'inter' = 'intra',
): {
  subtotal: number
  discountAmount: number
  transportationCharges: number
  packagingCharges: number
  gstAmount: number
  cgstAmount: number
  sgstAmount: number
  igstAmount: number
  grandTotal: number
  effectiveGstPercent: number
} {
  const subtotal = form.lines.reduce((sum, line) => sum + lineTaxableAmount(line), 0)

  // Prefer absolute header discount; fall back to legacy percent of subtotal.
  let discountAmount = Math.max(0, parseMoney(form.discountAmount))
  if (discountAmount <= 0) {
    const discountPercent = parseMoney(form.discountPercent)
    discountAmount = Math.round(subtotal * (discountPercent / 100) * 100) / 100
  }
  discountAmount = Math.min(discountAmount, subtotal)

  const transportationCharges = Math.max(0, parseMoney(form.transportationCharges))
  const packagingCharges = Math.max(0, parseMoney(form.packagingCharges))

  let gstAmount = 0
  let cgstAmount = 0
  let sgstAmount = 0
  let igstAmount = 0
  for (const line of form.lines) {
    const split = lineGstSplit(line, gstMode)
    gstAmount += split.gstAmount
    cgstAmount += split.cgstAmount
    sgstAmount += split.sgstAmount
    igstAmount += split.igstAmount
  }
  gstAmount = Math.round(gstAmount * 100) / 100
  cgstAmount = Math.round(cgstAmount * 100) / 100
  sgstAmount = Math.round(sgstAmount * 100) / 100
  igstAmount = Math.round(igstAmount * 100) / 100

  const afterDiscount = Math.max(0, subtotal - discountAmount)
  const effectiveGstPercent =
    afterDiscount > 0
      ? Math.round((gstAmount / afterDiscount) * 10000) / 100
      : parseMoney(form.gstPercent)

  const grandTotal = Math.round(
    (afterDiscount + transportationCharges + packagingCharges + gstAmount) * 100,
  ) / 100

  return {
    subtotal,
    discountAmount,
    transportationCharges,
    packagingCharges,
    gstAmount,
    cgstAmount,
    sgstAmount,
    igstAmount,
    grandTotal,
    effectiveGstPercent,
  }
}

export function formatMoney(value: number | null | undefined): string {
  const v = typeof value === 'number' && Number.isFinite(value) ? value : 0
  return v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export { formatDate } from '@/lib/utils'

/**
 * Next quotation number from Lab Settings prefix + sequential serial.
 * Example: prefix `QI/QTN/2026-` → `QI/QTN/2026-0001`
 */
export function nextQuotationNumber(existingNumbers: string[], prefixValue?: string): string {
  const year = new Date().getFullYear()
  const prefix = (prefixValue ?? `QTN-${year}-`).trim() || `QTN-${year}-`
  let max = 0
  for (const n of existingNumbers) {
    const value = String(n ?? '').trim()
    if (!value.startsWith(prefix)) continue
    const trailing = value.slice(prefix.length).replace(/\D/g, '')
    const suffix = Number.parseInt(trailing, 10)
    if (Number.isFinite(suffix) && suffix > max) max = suffix
  }
  return `${prefix}${String(max + 1).padStart(4, '0')}`
}

export function rowToForm(row: QuotationRow, asCopy = false, nextNumber = ''): QuotationForm {
  const lines =
    row.line_items && row.line_items.length > 0
      ? row.line_items
          .slice()
          .sort((a, b) => a.line_no - b.line_no)
          .map((l) => ({
            key: newLineKey(),
            description: l.description ?? '',
            details: l.details ?? '',
            make: l.make ?? '',
            hsnSac: l.hsn_sac ?? '',
            itemCode: l.item_code ?? '',
            quantity: String(l.quantity ?? 1),
            unit: l.unit || 'Nos',
            rate: String(l.rate ?? 0),
            discountPercent: String(l.discount_percent ?? 0),
            gstPercent: String(l.gst_percent ?? 0),
            lineRemarks: l.line_remarks ?? '',
            deliveryPeriod: l.delivery_period ?? '',
          }))
      : [emptyQuotationLine()]

  return {
    quotationNumber: asCopy ? nextNumber : row.quotation_number,
    quotationDate: (row.quotation_date ?? todayIsoDate()).slice(0, 10),
    validUntil: row.valid_until ? row.valid_until.slice(0, 10) : '',
    clientId: row.client_id ?? '',
    clientName: row.client_name ?? '',
    contactPerson: row.contact_person ?? '',
    contactEmail: row.contact_email ?? '',
    contactMobile: row.contact_mobile ?? '',
    clientAddress: row.client_address ?? '',
    clientGstNumber: row.client_gst_number ?? '',
    subject: row.subject ?? '',
    referenceNo: row.reference_no ?? '',
    status: asCopy ? 'Draft' : row.status,
    paymentTerms: row.payment_terms ?? '100 % Advance',
    notes: row.notes ?? '',
    remarks: row.remarks ?? '',
    signatureText: row.signature_text ?? '',
    signatureImagePath: row.signature_image_path ?? '',
    discountAmount: String(row.discount_amount ?? 0),
    transportationCharges: String(row.transportation_charges ?? 0),
    packagingCharges: String(row.packaging_charges ?? 0),
    discountPercent: String(row.discount_percent ?? 0),
    gstPercent: String(row.gst_percent ?? 18),
    paymentAmount: String(row.grand_total ?? 0),
    tdsPercent: row.tds_percent === 2 || row.tds_percent === 10 ? String(row.tds_percent) : '',
    paymentMethod: normalizePaymentMethod(
      row.payment_method ??
        // Legacy receipts briefly stored mode in reference_no before invoice-link fix.
        ((PAYMENT_METHOD_OPTIONS as readonly string[]).includes(String(row.reference_no ?? '').trim())
          ? row.reference_no
          : null),
    ),
    lines,
  }
}
