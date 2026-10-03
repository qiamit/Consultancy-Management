/** Lab Settings → Templates — Quotation / Proforma / Invoice / Credit Note / Receipt print-PDF layouts */

export type DocumentTemplateKind =
  | 'quotation'
  | 'proformaInvoice'
  | 'invoice'
  | 'creditNote'
  | 'paymentReceipt'

export const DOCUMENT_TEMPLATE_KIND_OPTIONS: ReadonlyArray<{
  kind: DocumentTemplateKind
  label: string
  description: string
}> = [
  {
    kind: 'quotation',
    label: 'Quotation',
    description: 'Sale quotation print & PDF layout',
  },
  {
    kind: 'proformaInvoice',
    label: 'Proforma Invoice',
    description: 'Proforma invoice print & PDF layout',
  },
  {
    kind: 'invoice',
    label: 'Invoice',
    description: 'Tax invoice print & PDF layout',
  },
  {
    kind: 'creditNote',
    label: 'Credit Note',
    description: 'Credit note print & PDF layout',
  },
  {
    kind: 'paymentReceipt',
    label: 'Payment Receipt',
    description: 'Payment receipt print & PDF layout',
  },
]

/** Shared layout config for finance document PDFs (table-based A4 format). */
export type DocumentPaperSize = 'A4' | 'A5' | 'Letter' | 'Legal'
export type DocumentPageOrientation = 'portrait' | 'landscape'
export type DocumentPrintQuality = 'draft' | 'normal' | 'high'

export type FinanceDocumentTemplate = {
  /** Centre title on the document (e.g. Quotation) */
  documentTitle: string
  showLetterHeader: boolean
  showLetterFooter: boolean
  headerTemplateName: string
  footerTemplateName: string
  showGridDividers: boolean
  showClientDetails: boolean
  showDocumentMeta: boolean
  showLineItems: boolean
  showAmountInWords: boolean
  showBankDetails: boolean
  showTerms: boolean
  showNotes: boolean
  showRemarks: boolean
  showSealSign: boolean
  showBasicAmount: boolean
  showDiscount: boolean
  showTransportationCharges: boolean
  showPackagingCharge: boolean
  showGstAmount: boolean
  showCgst: boolean
  showSgst: boolean
  showIgst: boolean
  showGrandTotal: boolean
  /** Line-item columns */
  lineShowMake: boolean
  lineShowHsn: boolean
  lineShowQty: boolean
  lineShowUnit: boolean
  lineShowRate: boolean
  lineShowAmount: boolean
  /** Page Setting → Page */
  paperSize: DocumentPaperSize
  pageOrientation: DocumentPageOrientation
  /** Print scaling percent (e.g. 100 = actual size) */
  pageScalingPercent: number
  printQuality: DocumentPrintQuality
  /** Page Setting → Margins */
  centreOnPageHorizontal: boolean
  centreOnPageVertical: boolean
  pageMarginTopMm: number
  pageMarginRightMm: number
  pageMarginBottomMm: number
  pageMarginLeftMm: number
  headerMarginMm: number
  footerMarginMm: number
  /** Page Setting → Header */
  differentOddEvenPages: boolean
  differentFirstPage: boolean
  scaleWithDocument: boolean
  alignWithPageMargin: boolean
  fontFamily: string
  baseFontSizePt: number
}

export type LabDocumentTemplates = {
  quotation: FinanceDocumentTemplate
  proformaInvoice: FinanceDocumentTemplate
  invoice: FinanceDocumentTemplate
  creditNote: FinanceDocumentTemplate
  paymentReceipt: FinanceDocumentTemplate
}

export const DEFAULT_QUOTATION_TEMPLATE: FinanceDocumentTemplate = {
  documentTitle: 'Quotation',
  showLetterHeader: true,
  showLetterFooter: true,
  headerTemplateName: 'General Letter Header',
  footerTemplateName: 'General Letter Footer',
  showGridDividers: true,
  showClientDetails: true,
  showDocumentMeta: true,
  showLineItems: true,
  showAmountInWords: true,
  showBankDetails: true,
  showTerms: true,
  showNotes: true,
  showRemarks: false,
  showSealSign: true,
  showBasicAmount: true,
  showDiscount: false,
  showTransportationCharges: true,
  showPackagingCharge: true,
  showGstAmount: true,
  showCgst: false,
  showSgst: false,
  showIgst: false,
  showGrandTotal: true,
  lineShowMake: true,
  lineShowHsn: true,
  lineShowQty: true,
  lineShowUnit: true,
  lineShowRate: true,
  lineShowAmount: true,
  paperSize: 'A4',
  pageOrientation: 'portrait',
  pageScalingPercent: 100,
  printQuality: 'normal',
  centreOnPageHorizontal: false,
  centreOnPageVertical: false,
  pageMarginTopMm: 8,
  pageMarginRightMm: 8,
  pageMarginBottomMm: 8,
  pageMarginLeftMm: 8,
  headerMarginMm: 28,
  footerMarginMm: 16,
  differentOddEvenPages: false,
  differentFirstPage: false,
  scaleWithDocument: true,
  alignWithPageMargin: true,
  fontFamily: 'Arial, Helvetica, sans-serif',
  baseFontSizePt: 10,
}

export const DEFAULT_PROFORMA_TEMPLATE: FinanceDocumentTemplate = {
  ...DEFAULT_QUOTATION_TEMPLATE,
  documentTitle: 'Proforma Invoice',
}

export const DEFAULT_INVOICE_TEMPLATE: FinanceDocumentTemplate = {
  ...DEFAULT_QUOTATION_TEMPLATE,
  documentTitle: 'Tax Invoice',
}

export const DEFAULT_CREDIT_NOTE_TEMPLATE: FinanceDocumentTemplate = {
  ...DEFAULT_QUOTATION_TEMPLATE,
  documentTitle: 'Credit Note',
}

export const DEFAULT_PAYMENT_RECEIPT_TEMPLATE: FinanceDocumentTemplate = {
  ...DEFAULT_QUOTATION_TEMPLATE,
  documentTitle: 'Payment Receipt',
  showLineItems: false,
  showBasicAmount: false,
  showGstAmount: false,
  showCgst: false,
  showSgst: false,
  showIgst: false,
  showTransportationCharges: false,
  showPackagingCharge: false,
}

export const DEFAULT_LAB_DOCUMENT_TEMPLATES: LabDocumentTemplates = {
  quotation: { ...DEFAULT_QUOTATION_TEMPLATE },
  proformaInvoice: { ...DEFAULT_PROFORMA_TEMPLATE },
  invoice: { ...DEFAULT_INVOICE_TEMPLATE },
  creditNote: { ...DEFAULT_CREDIT_NOTE_TEMPLATE },
  paymentReceipt: { ...DEFAULT_PAYMENT_RECEIPT_TEMPLATE },
}

function asBool(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback
}

function asString(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback
}

function asNumber(value: unknown, fallback: number, min = 0, max = 40): number {
  const n = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(n)) return fallback
  return Math.min(max, Math.max(min, Math.round(n * 10) / 10))
}

const PAPER_SIZES: DocumentPaperSize[] = ['A4', 'A5', 'Letter', 'Legal']
const ORIENTATIONS: DocumentPageOrientation[] = ['portrait', 'landscape']
const PRINT_QUALITIES: DocumentPrintQuality[] = ['draft', 'normal', 'high']

function asPaperSize(value: unknown, fallback: DocumentPaperSize): DocumentPaperSize {
  return typeof value === 'string' && PAPER_SIZES.includes(value as DocumentPaperSize)
    ? (value as DocumentPaperSize)
    : fallback
}

function asOrientation(
  value: unknown,
  fallback: DocumentPageOrientation,
): DocumentPageOrientation {
  return typeof value === 'string' && ORIENTATIONS.includes(value as DocumentPageOrientation)
    ? (value as DocumentPageOrientation)
    : fallback
}

function asPrintQuality(value: unknown, fallback: DocumentPrintQuality): DocumentPrintQuality {
  return typeof value === 'string' && PRINT_QUALITIES.includes(value as DocumentPrintQuality)
    ? (value as DocumentPrintQuality)
    : fallback
}

export function parseFinanceDocumentTemplate(
  raw: unknown,
  defaults: FinanceDocumentTemplate,
): FinanceDocumentTemplate {
  const o = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  let documentTitle = asString(o.documentTitle, defaults.documentTitle)
  // Older saves copied Quotation into every kind — restore the kind's real title.
  if (
    defaults.documentTitle !== 'Quotation' &&
    (documentTitle === 'Quotation' || !String(o.documentTitle ?? '').trim())
  ) {
    documentTitle = defaults.documentTitle
  }
  return {
    documentTitle,
    showLetterHeader: asBool(o.showLetterHeader, defaults.showLetterHeader),
    showLetterFooter: asBool(o.showLetterFooter, defaults.showLetterFooter),
    headerTemplateName: asString(o.headerTemplateName, defaults.headerTemplateName),
    footerTemplateName: asString(o.footerTemplateName, defaults.footerTemplateName),
    showGridDividers: asBool(o.showGridDividers, defaults.showGridDividers),
    showClientDetails: asBool(o.showClientDetails, defaults.showClientDetails),
    showDocumentMeta: asBool(o.showDocumentMeta, defaults.showDocumentMeta),
    showLineItems: asBool(o.showLineItems, defaults.showLineItems),
    showAmountInWords: asBool(o.showAmountInWords, defaults.showAmountInWords),
    showBankDetails: asBool(o.showBankDetails, defaults.showBankDetails),
    showTerms: asBool(o.showTerms, defaults.showTerms),
    showNotes: asBool(o.showNotes, defaults.showNotes),
    showRemarks: false,
    showSealSign: asBool(o.showSealSign, defaults.showSealSign),
    showBasicAmount: asBool(o.showBasicAmount, defaults.showBasicAmount),
    showDiscount: asBool(o.showDiscount, defaults.showDiscount),
    showTransportationCharges: asBool(
      o.showTransportationCharges,
      defaults.showTransportationCharges,
    ),
    showPackagingCharge: asBool(o.showPackagingCharge, defaults.showPackagingCharge),
    showGstAmount: asBool(o.showGstAmount, defaults.showGstAmount),
    showCgst: asBool(o.showCgst, defaults.showCgst),
    showSgst: asBool(o.showSgst, defaults.showSgst),
    showIgst: asBool(o.showIgst, defaults.showIgst),
    showGrandTotal: asBool(o.showGrandTotal, defaults.showGrandTotal),
    lineShowMake: asBool(o.lineShowMake, defaults.lineShowMake),
    lineShowHsn: asBool(o.lineShowHsn, defaults.lineShowHsn),
    lineShowQty: asBool(o.lineShowQty, defaults.lineShowQty),
    lineShowUnit: asBool(o.lineShowUnit, defaults.lineShowUnit),
    lineShowRate: asBool(o.lineShowRate, defaults.lineShowRate),
    lineShowAmount: asBool(o.lineShowAmount, defaults.lineShowAmount),
    paperSize: asPaperSize(o.paperSize, defaults.paperSize),
    pageOrientation: asOrientation(o.pageOrientation, defaults.pageOrientation),
    pageScalingPercent: asNumber(o.pageScalingPercent, defaults.pageScalingPercent, 10, 400),
    printQuality: asPrintQuality(o.printQuality, defaults.printQuality),
    centreOnPageHorizontal: asBool(o.centreOnPageHorizontal, defaults.centreOnPageHorizontal),
    centreOnPageVertical: asBool(o.centreOnPageVertical, defaults.centreOnPageVertical),
    pageMarginTopMm: asNumber(o.pageMarginTopMm, defaults.pageMarginTopMm),
    pageMarginRightMm: asNumber(o.pageMarginRightMm, defaults.pageMarginRightMm),
    pageMarginBottomMm: asNumber(o.pageMarginBottomMm, defaults.pageMarginBottomMm),
    pageMarginLeftMm: asNumber(o.pageMarginLeftMm, defaults.pageMarginLeftMm),
    headerMarginMm: asNumber(
      o.headerMarginMm === 8 || o.headerMarginMm === '8' ? 28 : o.headerMarginMm,
      defaults.headerMarginMm,
    ),
    footerMarginMm: asNumber(
      o.footerMarginMm === 8 || o.footerMarginMm === '8' ? 16 : o.footerMarginMm,
      defaults.footerMarginMm,
    ),
    differentOddEvenPages: asBool(o.differentOddEvenPages, defaults.differentOddEvenPages),
    differentFirstPage: asBool(o.differentFirstPage, defaults.differentFirstPage),
    scaleWithDocument: asBool(o.scaleWithDocument, defaults.scaleWithDocument),
    alignWithPageMargin: asBool(o.alignWithPageMargin, defaults.alignWithPageMargin),
    fontFamily: asString(o.fontFamily, defaults.fontFamily),
    baseFontSizePt: asNumber(o.baseFontSizePt, defaults.baseFontSizePt, 7, 16),
  }
}

export function parseLabDocumentTemplates(raw: unknown): LabDocumentTemplates {
  const o = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  return {
    quotation: parseFinanceDocumentTemplate(o.quotation, DEFAULT_QUOTATION_TEMPLATE),
    proformaInvoice: parseFinanceDocumentTemplate(
      o.proformaInvoice,
      DEFAULT_PROFORMA_TEMPLATE,
    ),
    invoice: parseFinanceDocumentTemplate(o.invoice, DEFAULT_INVOICE_TEMPLATE),
    creditNote: parseFinanceDocumentTemplate(o.creditNote, DEFAULT_CREDIT_NOTE_TEMPLATE),
    paymentReceipt: parseFinanceDocumentTemplate(
      o.paymentReceipt,
      DEFAULT_PAYMENT_RECEIPT_TEMPLATE,
    ),
  }
}

export function labDocumentTemplatesToJson(doc: LabDocumentTemplates): LabDocumentTemplates {
  return parseLabDocumentTemplates(doc)
}

/** Meta-box labels derived from the centre document title (Quotation, Proforma Invoice, …). */
export function documentMetaFieldLabels(documentTitle: string): {
  number: string
  date: string
  dueDate: string
  status: string
} {
  const title = documentTitle.trim() || 'Document'
  return {
    number: `${title} Number`,
    date: `Date of ${title}`,
    dueDate: `Due Date of ${title}`,
    status: `Status of ${title}`,
  }
}
