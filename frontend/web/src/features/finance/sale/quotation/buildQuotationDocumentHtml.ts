import { resolveNamedLetterheadTemplates } from '@/features/sample-handling/report-preparation/reportScopeConfig'
import { getCurrencySymbol } from '@/lib/appCurrency'
import {
  documentMetaFieldLabels,
  isPaymentReceiptDocumentTitle,
  templateForBook,
  type BookDocumentKind,
  type FinanceDocumentTemplate,
} from '@/features/settings/lab-settings/documentTemplateTypes'
import { fetchLabDocumentTemplates } from '@/features/settings/lab-settings/documentTemplatesConfig'
import { supabase } from '@/lib/supabaseClient'
import { amountInIndianRupeesWords } from './amountInIndianRupeesWords'
import {
  fetchLabCompanySignContext,
  quotationSealStoragePath,
  resolveSignatureSignedUrl,
} from './quotationSignatureStorage'
import {
  computeQuotationTotals,
  formatDate,
  formatMoney,
  quotationStatusLabel,
  type QuotationForm,
  type QuotationLineForm,
  type QuotationRow,
} from './types'

export const QUOTATION_LETTER_HEADER_NAME = 'General Letter Header'
export const QUOTATION_LETTER_FOOTER_NAME = 'General Letter Footer'

export type QuotationBankDetails = {
  bankName: string
  branchName: string
  accountNumber: string
  ifsc: string
  upi: string
}

export type PreparedQuotationDocument = {
  html: string
  template: FinanceDocumentTemplate
  margins: {
    top: number
    right: number
    bottom: number
    left: number
  }
}

function esc(value: string | null | undefined): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function cell(value: string | null | undefined): string {
  const t = String(value ?? '').trim()
  return t ? esc(t) : '—'
}

export async function fetchQuotationBankDetails(): Promise<QuotationBankDetails> {
  const { data } = await supabase
    .from('lab_settings')
    .select('bank_name, branch_name, account_number, ifsc, upi')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  const row = data as {
    bank_name?: string | null
    branch_name?: string | null
    account_number?: string | null
    ifsc?: string | null
    upi?: string | null
  } | null
  return {
    bankName: String(row?.bank_name ?? '').trim(),
    branchName: String(row?.branch_name ?? '').trim(),
    accountNumber: String(row?.account_number ?? '').trim(),
    ifsc: String(row?.ifsc ?? '').trim(),
    upi: String(row?.upi ?? '').trim(),
  }
}

function lineToForm(l: NonNullable<QuotationRow['line_items']>[number]): QuotationLineForm {
  const storedGst = Number(l.gst_percent ?? 0)
  return {
    key: String(l.id ?? Math.random()),
    description: String(l.description ?? ''),
    details: String(l.details ?? ''),
    make: String(l.make ?? ''),
    hsnSac: String(l.hsn_sac ?? ''),
    itemCode: '',
    quantity: String(l.quantity ?? 0),
    unit: String(l.unit ?? ''),
    rate: String(l.rate ?? 0),
    discountPercent: String(l.discount_percent ?? 0),
    gstPercent: String(Number.isFinite(storedGst) && storedGst > 0 ? storedGst : 18),
    lineRemarks: '',
    deliveryPeriod: '',
  }
}

function mmToPx(mm: number): number {
  // html2canvas is unreliable with CSS `mm` — use 96dpi px for PDF capture fidelity.
  return Math.round(mm * (96 / 25.4) * 100) / 100
}

function quotationStylesCss(tpl: FinanceDocumentTemplate): string {
  const scale = Math.max(0.1, Math.min(4, (tpl.pageScalingPercent || 100) / 100))
  const headerScale = tpl.scaleWithDocument ? scale : 1
  const font = esc(tpl.fontFamily || 'Arial, Helvetica, sans-serif')
  const size = Math.max(7, Math.min(18, (tpl.baseFontSizePt || 10) * scale))
  const portraitW: Record<FinanceDocumentTemplate['paperSize'], number> = {
    A4: 210,
    A5: 148,
    Letter: 216,
    Legal: 216,
  }
  const portraitH: Record<FinanceDocumentTemplate['paperSize'], number> = {
    A4: 297,
    A5: 210,
    Letter: 279,
    Legal: 356,
  }
  const pageW =
    tpl.pageOrientation === 'landscape'
      ? portraitH[tpl.paperSize]
      : portraitW[tpl.paperSize]
  const pageH =
    tpl.pageOrientation === 'landscape'
      ? portraitW[tpl.paperSize]
      : portraitH[tpl.paperSize]
  const headerH = Math.max(tpl.headerMarginMm || 0, 8) * headerScale
  const footerH = Math.max(tpl.footerMarginMm || 0, 6) * headerScale
  const padT = tpl.pageMarginTopMm || 0
  const padR = tpl.pageMarginRightMm || 0
  const padB = tpl.showLetterFooter ? 0 : tpl.pageMarginBottomMm || 0
  const padL = tpl.pageMarginLeftMm || 0
  const contentW = Math.max(
    40,
    pageW - (tpl.alignWithPageMargin ? padL + padR : 0),
  )
  const pageCssSize =
    tpl.pageOrientation === 'landscape'
      ? `${tpl.paperSize === 'Letter' ? 'letter' : tpl.paperSize === 'Legal' ? 'legal' : tpl.paperSize.toLowerCase()} landscape`
      : tpl.paperSize === 'Letter'
        ? 'letter'
        : tpl.paperSize === 'Legal'
          ? 'legal'
          : tpl.paperSize.toLowerCase()

  const pageWpx = mmToPx(pageW)
  const pageHpx = mmToPx(pageH)
  const gap2 = mmToPx(2)
  const headerHpx = mmToPx(headerH)
  const footerHpx = mmToPx(footerH)
  const contentWpx = mmToPx(contentW)
  const padTpx = mmToPx(padT)
  const padRpx = mmToPx(padR)
  const padBpx = mmToPx(padB)
  const padLpx = mmToPx(padL)
  const rateColPx = mmToPx(28)
  const signHpx = mmToPx(18)
  const signWpx = mmToPx(46)
  const termsMinPx = mmToPx(12)
  const blockMinPx = mmToPx(14)
  /** Company ↔ Authorized gap ~18mm (under 1 inch). */
  const sealHpx = mmToPx(22)
  const hair = '1px solid #78716c'
  const hairSoft = '1px solid #d6d3d1'
  /** True double-line frame (even weight on all sides). */
  const boxFrame = `border: 3px double #292524;`
  const itemsFrame = `border: 3px double #292524;`

  return `
  @page { size: ${pageCssSize}; margin: 0; }
  * { box-sizing: border-box; }
  html, body {
    margin: 0; padding: 0; width: ${pageWpx}px; background: #fff;
  }
  body {
    font-family: ${font};
    font-size: ${size}px;
    color: #1c1917;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  table { border-collapse: collapse; border-spacing: 0; }
  .page {
    width: ${pageWpx}px;
    min-height: ${pageHpx}px;
    height: ${pageHpx}px;
    ${boxFrame}
    background: #fff;
    padding: ${padTpx}px ${padRpx}px ${padBpx}px ${padLpx}px;
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
  }
  .page-body { flex: 1 1 auto; min-height: 0; }
  .letter-footer-wrap {
    margin-top: auto;
    flex-shrink: 0;
    width: 100%;
  }
  .letter-header {
    width: 100%; height: ${headerHpx}px; text-align: center; vertical-align: middle;
    border-bottom: ${hairSoft};
  }
  .letter-header img {
    width: 100%; max-width: ${contentWpx}px; height: ${headerHpx}px;
    object-fit: fill; object-position: center; display: block;
  }
  .letter-header .ph { font-size: 12px; font-weight: 700; color: #333; }
  .letter-header .brand {
    display: flex; align-items: center; justify-content: center; gap: 12px; height: 100%;
  }
  .letter-header .brand img {
    width: auto; max-width: 220px; max-height: 70px; height: auto; object-fit: contain; display: inline-block;
  }
  .title-bar {
    width: 100%; border-bottom: none; text-align: center;
    font-size: ${Math.max(size + 8, 18)}px; font-weight: 700; letter-spacing: 1.5px;
    padding: 8px 4px 10px; color: #1c1917;
  }
  .meta-outer {
    width: 100%; ${boxFrame}
    border-collapse: separate; border-spacing: 0;
  }
  .meta-outer > tbody > tr > td {
    vertical-align: stretch; height: 1px;
  }
  /* Specificity must beat the td rule above — content was flush to the double border */
  .meta-outer > tbody > tr > td.meta-client {
    width: 58%;
    border-right: ${hair};
    padding: 2mm 2mm 2mm 2mm;
    vertical-align: top;
    box-sizing: border-box;
  }
  .meta-outer > tbody > tr > td.meta-info {
    width: 42%; padding: 0; height: 100%; vertical-align: top;
  }
  .lbl { font-size: ${size + 1}px; font-weight: 700; margin: 0 0 6px; }
  .client-line { margin: 0 0 3px; line-height: 1.35; font-size: ${size}px; }
  /* Plain table — flex/grid fill was collapsing rows in the preview iframe */
  .kv {
    width: 100%; height: 100%;
    border-collapse: collapse; border-spacing: 0; table-layout: fixed;
  }
  .kv col.kv-k { width: 52%; }
  .kv col.kv-sep { width: 12px; }
  .kv col.kv-v { width: auto; }
  .kv td {
    border-top: ${hairSoft}; border-bottom: ${hairSoft};
    border-left: none; border-right: none;
    padding: 5px 6px; vertical-align: middle; font-size: ${size}px;
    line-height: 1.25;
  }
  .kv tr:first-child td { border-top: none; }
  .kv tr:last-child td { border-bottom: none; }
  .kv .k { white-space: nowrap; }
  .kv .sep {
    text-align: center; width: 12px;
    border-left: ${hairSoft}; border-right: ${hairSoft};
    padding-left: 0; padding-right: 0;
  }
  .kv .v { font-weight: 700; }
  .items-wrap {
    width: 100%; margin-top: 8px; overflow: hidden; ${itemsFrame}
  }
  .items { width: 100%; border-collapse: collapse; border-spacing: 0; border: none; table-layout: fixed; }
  .items th, .items td {
    border: ${hairSoft}; padding: 5px 4px; vertical-align: middle;
    font-size: ${Math.max(size - 1, 8)}px; color: #1c1917;
  }
  .items tr:first-child > * { border-top: none; }
  .items tr:last-child > * { border-bottom: none; }
  .items tr > *:first-child { border-left: none; }
  .items tr > *:last-child { border-right: none; }
  .items th {
    background: #1c1917;
    background: linear-gradient(180deg, #44403c 0%, #1c1917 100%);
    color: #fde68a; font-weight: 700; text-transform: uppercase;
    font-size: ${Math.max(size - 2, 7)}px; letter-spacing: 0.08em;
    border-bottom: 1px solid #b45309;
    vertical-align: middle;
  }
  .items th .sr-stack {
    display: inline-flex; flex-direction: column; align-items: center; justify-content: center;
    line-height: 1.05; gap: 0;
  }
  .items col.col-sr { width: 7mm; }
  .items col.col-desc { width: auto; }
  .items col.col-make { width: 9mm; }
  .items col.col-hsn { width: 10mm; }
  .items col.col-qty { width: 8mm; }
  .items col.col-unit { width: 9mm; }
  .items col.col-rate { width: 24mm; }
  .items col.col-amt { width: 26mm; }
  .items tbody tr:nth-child(even) td { background: #fafaf9; }
  .c { text-align: center; }
  .r { text-align: right; }
  .finance {
    width: 100%; margin-top: ${gap2}px; ${boxFrame}
    border-collapse: separate; border-spacing: 0;
  }
  .finance > tbody > tr > td { vertical-align: stretch; padding: 0; height: 1px; }
  .finance-left { width: 62%; border-right: ${hair}; height: 100%; }
  .finance-left-inner { width: 100%; height: 100%; }
  .finance-left-inner td {
    padding: 6px 10px; vertical-align: top; border-bottom: none;
  }
  .finance-right { width: 38%; height: 100%; vertical-align: top; }
  .totals-fill {
    display: flex; flex-direction: column; height: 100%; width: 100%; min-height: 100%;
  }
  .totals-fill .tr {
    flex: 1 1 0;
    display: flex; align-items: center; width: 100%;
    border-bottom: ${hairSoft};
    font-size: ${size}px; line-height: 1.15; min-height: 0;
  }
  .totals-fill .tr:last-child { border-bottom: none; }
  .totals-fill .tr.grand { font-weight: 700; }
  .totals-fill .k { flex: 1 1 auto; padding: 2px 6px; }
  .totals-fill .sep { flex: 0 0 10px; text-align: center; }
  .totals-fill .v {
    flex: 0 0 ${rateColPx}px; text-align: right; font-weight: 700; padding: 2px 6px;
  }
  .words, .bank-line { font-size: ${size}px; line-height: 1.2; margin: 0 0 1px; }
  .bottom { width: 100%; margin-top: ${gap2}px; ${boxFrame} border-collapse: separate; border-spacing: 0; }
  .bottom-terms {
    width: 100%; padding: 6px 8px; border-bottom: ${hairSoft}; min-height: ${termsMinPx}px;
  }
  .bottom-body { width: 100%; height: 100%; }
  .bottom-body > tbody > tr > td { vertical-align: stretch; padding: 0; height: 1px; }
  .bottom .left-col { width: 50%; border-right: ${hair}; }
  .bottom .block { padding: 6px 8px; border-bottom: ${hairSoft}; min-height: ${blockMinPx}px; }
  .bottom .block:last-child { border-bottom: none; }
  .bottom .br {
    width: 50%; text-align: right; vertical-align: stretch; padding: 0;
    height: ${sealHpx}px; max-height: ${mmToPx(25)}px;
  }
  .body-text { font-size: ${size}px; line-height: 1.4; white-space: pre-wrap; margin-top: 4px; }
  .sign-block {
    position: relative;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    align-items: flex-end;
    text-align: right;
    height: ${sealHpx}px;
    min-height: ${sealHpx}px;
    max-height: ${mmToPx(25)}px;
    padding: 4px 8px;
    overflow: hidden;
  }
  .sign-company {
    position: relative;
    z-index: 1;
    font-size: ${Math.max(size + 3, 13)}px;
    font-weight: 700;
    line-height: 1.15;
  }
  .sign-stamp {
    position: absolute;
    right: 4px;
    top: 50%;
    transform: translateY(-50%);
    max-height: ${signHpx}px;
    max-width: ${signWpx}px;
    width: auto;
    height: auto;
    object-fit: contain;
    z-index: 2;
    /* Drop white seal paper so company / Authorized text shows through */
    mix-blend-mode: multiply;
    opacity: 1;
    pointer-events: none;
    background: transparent;
  }
  .sign-text {
    position: absolute;
    right: 8px;
    top: 50%;
    transform: translateY(-50%);
    z-index: 2;
    font-family: "Segoe Script", "Brush Script MT", cursive;
    font-size: 15px;
    font-style: italic;
    white-space: nowrap;
    opacity: 0.9;
    pointer-events: none;
  }
  .sign-caption {
    position: relative;
    z-index: 1;
    font-size: ${Math.max(size + 1, 11)}px;
    font-weight: 700;
    line-height: 1.15;
    color: #a16207;
  }
  .letter-footer { width: 100%; height: ${footerHpx}px; text-align: center; vertical-align: middle; }
  .letter-footer img {
    width: 100%; max-width: ${contentWpx}px; height: ${footerHpx}px;
    object-fit: fill; object-position: center; display: block;
  }
  .letter-footer .ph { font-size: 11px; color: #333; font-weight: 700; }
  `
}

function buildOneQuotationHtml(
  row: QuotationRow,
  opts: {
    headerUrl: string | null
    footerUrl: string | null
    logoUrl: string | null
    bank: QuotationBankDetails
    signatureUrl: string | null
    companyName: string
    template: FinanceDocumentTemplate
  },
): string {
  const tpl = opts.template
  const metaLabels = documentMetaFieldLabels(tpl.documentTitle || 'Document')
  const isPaymentReceipt = isPaymentReceiptDocumentTitle(tpl.documentTitle || '')
  const savedSupplyMode =
    row.gst_supply_mode === 'intra' || row.gst_supply_mode === 'inter' ? row.gst_supply_mode : null
  const gstMode: 'intra' | 'inter' =
    savedSupplyMode ?? (tpl.showIgst && !tpl.showCgst && !tpl.showSgst ? 'inter' : 'intra')
  const showCgst = savedSupplyMode ? savedSupplyMode === 'intra' : tpl.showCgst
  const showSgst = savedSupplyMode ? savedSupplyMode === 'intra' : tpl.showSgst
  const showIgst = savedSupplyMode ? savedSupplyMode === 'inter' : tpl.showIgst

  const lineForms = (row.line_items ?? []).map((l) =>
    isPaymentReceipt ? { ...lineToForm(l), gstPercent: '0' } : lineToForm(l),
  )
  const totals = computeQuotationTotals(
    {
      lines: lineForms,
      discountAmount: String(row.discount_amount ?? 0),
      discountPercent: String(row.discount_percent ?? 0),
      transportationCharges: String(row.transportation_charges ?? 0),
      packagingCharges: String(row.packaging_charges ?? 0),
      gstPercent: '18',
    } as QuotationForm,
    gstMode,
  )
  const cgstTotal = totals.cgstAmount
  const sgstTotal = totals.sgstAmount
  const igstTotal = totals.igstAmount
  const displayGstAmount = isPaymentReceipt ? 0 : totals.gstAmount
  const displayGrandTotal = isPaymentReceipt ? Number(row.grand_total) || 0 : totals.grandTotal

  const colCount =
    2 +
    Number(tpl.lineShowMake) +
    Number(tpl.lineShowHsn) +
    Number(tpl.lineShowQty) +
    Number(tpl.lineShowUnit) +
    Number(tpl.lineShowRate) +
    Number(tpl.lineShowAmount)

  const itemsHtml = (row.line_items ?? [])
    .map((l, idx) => {
      const amount = Number(l.amount)
      const lineAmt = Number.isFinite(amount) ? amount : Number(l.quantity) * Number(l.rate)
      return `<tr>
        <td class="c">${idx + 1}</td>
        <td>
          <div>${cell(l.description)}</div>
          ${l.details?.trim() ? `<div style="font-size:8px;color:#444;margin-top:2px;">${esc(l.details)}</div>` : ''}
        </td>
        ${tpl.lineShowMake ? `<td class="c">${cell(l.make)}</td>` : ''}
        ${tpl.lineShowHsn ? `<td class="c">${cell(l.hsn_sac)}</td>` : ''}
        ${tpl.lineShowQty ? `<td class="c">${cell(String(l.quantity))}</td>` : ''}
        ${tpl.lineShowUnit ? `<td class="c">${cell(l.unit)}</td>` : ''}
        ${tpl.lineShowRate ? `<td class="c">${getCurrencySymbol()} ${esc(formatMoney(l.rate))}</td>` : ''}
        ${tpl.lineShowAmount ? `<td class="r">${getCurrencySymbol()} ${esc(formatMoney(lineAmt))}</td>` : ''}
      </tr>`
    })
    .join('')

  const itemsBodyHtml =
    itemsHtml || `<tr><td colspan="${colCount}" class="c">No line items</td></tr>`

  const bankHasAny =
    opts.bank.bankName ||
    opts.bank.branchName ||
    opts.bank.accountNumber ||
    opts.bank.ifsc ||
    opts.bank.upi

  const bankBody = bankHasAny
    ? [
        `<p class="bank-line">Bank Name: ${esc(opts.bank.bankName || '—')} :: Branch Name: ${esc(opts.bank.branchName || '—')}</p>`,
        `<p class="bank-line">A/c No: ${esc(opts.bank.accountNumber || '—')} :: IFSC Code: ${esc(opts.bank.ifsc || '—')}</p>`,
        opts.bank.upi ? `<p class="bank-line">UPI: ${esc(opts.bank.upi)}</p>` : '',
      ].join('')
    : `<p class="bank-line">—</p>`

  const signatureStamp = opts.signatureUrl
    ? `<img class="sign-stamp" src="${esc(opts.signatureUrl)}" alt="Company seal and signature" />`
    : row.signature_text?.trim()
      ? `<div class="sign-text">${esc(row.signature_text.trim())}</div>`
      : ''

  const sealSignBlock = tpl.showSealSign
    ? `<div class="sign-block"><div class="sign-company">${esc(opts.companyName.trim() || 'Company Name')}</div>${signatureStamp}<div class="sign-caption">Authorized Signatory</div></div>`
    : ''

  const totalRows: string[] = []
  if (tpl.showBasicAmount && !isPaymentReceipt) {
    totalRows.push(
      `<div class="tr"><span class="k">Basic Amount</span><span class="sep">:</span><span class="v">${getCurrencySymbol()} ${esc(formatMoney(totals.subtotal))}</span></div>`,
    )
  }
  if (tpl.showDiscount && totals.discountAmount > 0) {
    totalRows.push(
      `<div class="tr"><span class="k">Discount</span><span class="sep">:</span><span class="v">${getCurrencySymbol()} ${esc(formatMoney(totals.discountAmount))}</span></div>`,
    )
  }
  if (tpl.showTransportationCharges && totals.transportationCharges > 0) {
    totalRows.push(
      `<div class="tr"><span class="k">Transportation Charges</span><span class="sep">:</span><span class="v">${getCurrencySymbol()} ${esc(formatMoney(totals.transportationCharges))}</span></div>`,
    )
  }
  if (tpl.showPackagingCharge && totals.packagingCharges > 0) {
    totalRows.push(
      `<div class="tr"><span class="k">Packaging Charge</span><span class="sep">:</span><span class="v">${getCurrencySymbol()} ${esc(formatMoney(totals.packagingCharges))}</span></div>`,
    )
  }
  if (tpl.showGstAmount && !isPaymentReceipt) {
    totalRows.push(
      `<div class="tr"><span class="k">GST Amount</span><span class="sep">:</span><span class="v">${getCurrencySymbol()} ${esc(formatMoney(displayGstAmount))}</span></div>`,
    )
  }
  if (showCgst && cgstTotal > 0) {
    totalRows.push(
      `<div class="tr"><span class="k">CGST</span><span class="sep">:</span><span class="v">${getCurrencySymbol()} ${esc(formatMoney(cgstTotal))}</span></div>`,
    )
  }
  if (showSgst && sgstTotal > 0) {
    totalRows.push(
      `<div class="tr"><span class="k">SGST</span><span class="sep">:</span><span class="v">${getCurrencySymbol()} ${esc(formatMoney(sgstTotal))}</span></div>`,
    )
  }
  if (showIgst && igstTotal > 0) {
    totalRows.push(
      `<div class="tr"><span class="k">IGST</span><span class="sep">:</span><span class="v">${getCurrencySymbol()} ${esc(formatMoney(igstTotal))}</span></div>`,
    )
  }
  if (tpl.showGrandTotal) {
    totalRows.push(
      `<div class="tr grand"><span class="k">${isPaymentReceipt ? 'Amount Received' : 'Grand Total'}</span><span class="sep">:</span><span class="v">${getCurrencySymbol()} ${esc(formatMoney(displayGrandTotal))}</span></div>`,
    )
  }

  const showMetaRow = tpl.showClientDetails || tpl.showDocumentMeta
  const showFinance =
    tpl.showAmountInWords || tpl.showBankDetails || totalRows.length > 0
  const showBottom = tpl.showTerms || tpl.showNotes || tpl.showSealSign

  return `
  <div class="page">
    ${
      tpl.showLetterHeader
        ? `<table width="100%" cellspacing="0" cellpadding="0"><tr><td class="letter-header">${
            opts.headerUrl
              ? `<img src="${esc(opts.headerUrl)}" alt="Letter Header" />`
              : `<div class="brand">${
                  opts.logoUrl
                    ? `<img class="logo" src="${esc(opts.logoUrl)}" alt="" />`
                    : ''
                }<span class="ph">${esc(opts.companyName.trim() || 'Company Name')}</span></div>`
          }</td></tr></table>`
        : ''
    }
    <div class="page-body">
    <div class="title-bar">${esc(tpl.documentTitle || 'Document')}</div>
    ${
      showMetaRow
        ? `<table class="meta-outer" cellspacing="0" cellpadding="0"><tr>
        ${
          tpl.showClientDetails
            ? `<td class="meta-client"${tpl.showDocumentMeta ? '' : ' colspan="2" style="border-right:none;width:100%;"'}>
          <div class="lbl">Client Details</div>
          <p class="client-line"><b>${cell(row.client_name)}</b></p>
          ${row.client_address ? `<p class="client-line">${esc(row.client_address)}</p>` : ''}
          ${
            row.client_gst_number || row.contact_mobile
              ? `<p class="client-line">${[
                  row.client_gst_number ? `GST No: ${esc(row.client_gst_number)}` : '',
                  row.contact_mobile ? `Mobile No: ${esc(row.contact_mobile)}` : '',
                ]
                  .filter(Boolean)
                  .join(' :: ')}</p>`
              : ''
          }
          ${row.contact_email ? `<p class="client-line">Email: ${esc(row.contact_email)}</p>` : ''}
        </td>`
            : ''
        }
        ${
          tpl.showDocumentMeta
            ? `<td class="meta-info"${tpl.showClientDetails ? '' : ' colspan="2" style="width:100%;"'}>
          <table class="kv" cellspacing="0" cellpadding="0">
            <colgroup>
              <col class="kv-k" />
              <col class="kv-sep" />
              <col class="kv-v" />
            </colgroup>
            <tr><td class="k">${esc(metaLabels.number)}</td><td class="sep">:</td><td class="v">${cell(row.quotation_number)}</td></tr>
            <tr><td class="k">${esc(metaLabels.date)}</td><td class="sep">:</td><td class="v">${esc(formatDate(row.quotation_date))}</td></tr>
            <tr><td class="k">${esc(metaLabels.dueDate)}</td><td class="sep">:</td><td class="v">${
              isPaymentReceipt
                ? cell(row.reference_no)
                : esc(formatDate(row.valid_until))
            }</td></tr>
            <tr><td class="k">${esc(metaLabels.status)}</td><td class="sep">:</td><td class="v">${
              isPaymentReceipt
                ? `${getCurrencySymbol()} ${esc(formatMoney(displayGrandTotal))}`
                : esc(quotationStatusLabel(row.status))
            }</td></tr>
          </table>
        </td>`
            : ''
        }
      </tr></table>`
        : ''
    }
    ${
      isPaymentReceipt && !tpl.showLineItems
        ? `<div class="items-wrap" style="padding:8px 10px;border:2px solid #000;">
        <div style="margin-bottom:4px;"><b>Payment Mode:</b> ${cell(row.payment_method || 'Bank')}</div>
        ${
          row.reference_no?.trim()
            ? `<div style="margin-bottom:4px;"><b>Against Invoice:</b> ${cell(row.reference_no)}</div>`
            : ''
        }
        <div style="font-size:1.05em;font-weight:700;margin-bottom:4px;">Amount Received: ${getCurrencySymbol()} ${esc(formatMoney(displayGrandTotal))}</div>
        ${
          row.subject?.trim()
            ? `<div style="font-size:0.9em;color:#333;"><b>Towards:</b> ${esc(row.subject.trim())}</div>`
            : ''
        }
      </div>`
        : ''
    }
    ${
      tpl.showLineItems
        ? `<div class="items-wrap"><table class="items" cellspacing="0" cellpadding="0">
        <colgroup>
          <col class="col-sr" />
          <col class="col-desc" />
          ${tpl.lineShowMake ? '<col class="col-make" />' : ''}
          ${tpl.lineShowHsn ? '<col class="col-hsn" />' : ''}
          ${tpl.lineShowQty ? '<col class="col-qty" />' : ''}
          ${tpl.lineShowUnit ? '<col class="col-unit" />' : ''}
          ${tpl.lineShowRate ? '<col class="col-rate" />' : ''}
          ${tpl.lineShowAmount ? '<col class="col-amt" />' : ''}
        </colgroup>
        <thead><tr>
          <th class="c"><span class="sr-stack"><span>Sr.</span><span>No.</span></span></th>
          <th>Description</th>
          ${tpl.lineShowMake ? '<th class="c">Make</th>' : ''}
          ${tpl.lineShowHsn ? '<th class="c">HSN</th>' : ''}
          ${tpl.lineShowQty ? '<th class="c">Qty</th>' : ''}
          ${tpl.lineShowUnit ? '<th class="c">Unit</th>' : ''}
          ${tpl.lineShowRate ? '<th class="c">Rate</th>' : ''}
          ${tpl.lineShowAmount ? '<th class="r">Amount</th>' : ''}
        </tr></thead>
        <tbody>
          ${itemsBodyHtml}
        </tbody>
      </table></div>`
        : ''
    }
    ${
      showFinance
        ? `<table class="finance" cellspacing="0" cellpadding="0"><tr>
        <td class="finance-left"><table class="finance-left-inner" cellspacing="0" cellpadding="0">
          ${
            tpl.showAmountInWords
              ? `<tr><td style="height:5.5mm;padding:4px 8px;vertical-align:middle;border-bottom:none;box-sizing:border-box;line-height:1.15;">
              <p class="words" style="margin:0;"><span class="lbl" style="display:inline;margin:0;">Amount in Words:</span> ${esc(amountInIndianRupeesWords(displayGrandTotal))}</p>
            </td></tr>`
              : ''
          }
          ${
            tpl.showBankDetails
              ? `<tr><td style="height:auto;padding:2px 8px 6px;vertical-align:top;line-height:1.2;border-top:none;">
              <div class="lbl" style="margin:0 0 2px;">Bank Details</div>
              ${bankBody}
            </td></tr>`
              : ''
          }
        </table></td>
        <td class="finance-right"><div class="totals-fill">${totalRows.join('')}</div></td>
      </tr></table>`
        : ''
    }
    ${
      showBottom
        ? `<div class="bottom">
      ${
          tpl.showTerms
            ? `<div class="bottom-terms"${
                tpl.showNotes || tpl.showSealSign
                  ? ''
                  : ' style="border-bottom:none;"'
              }><div class="lbl">Term &amp; Condition</div><div class="body-text">${cell(row.payment_terms)}</div></div>`
            : ''
        }
      ${
        tpl.showNotes || tpl.showSealSign
          ? `<table class="bottom-body" cellspacing="0" cellpadding="0">
        <tr>
          <td class="left-col">
            ${tpl.showNotes ? `<div class="block"><div class="lbl">Notes</div><div class="body-text">${cell(row.notes)}</div></div>` : ''}
          </td>
          <td class="br">${sealSignBlock}</td>
        </tr>
      </table>`
          : ''
      }
    </div>`
        : ''
    }
    </div>
    ${
      tpl.showLetterFooter
        ? `<div class="letter-footer-wrap"><table width="100%" cellspacing="0" cellpadding="0"><tr><td class="letter-footer">${
            opts.footerUrl
              ? `<img src="${esc(opts.footerUrl)}" alt="Letter Footer" />`
              : ''
          }</td></tr></table></div>`
        : ''
    }
  </div>
  `
}

/** Full document HTML using Lab document_templates for the given kind. */
export async function prepareQuotationDocumentHtml(
  rows: QuotationRow[],
  documentKind: BookDocumentKind = 'quotation',
  templateOverride?: FinanceDocumentTemplate,
): Promise<PreparedQuotationDocument> {
  const docs = await fetchLabDocumentTemplates()
  const template = templateOverride ?? templateForBook(docs, documentKind)

  const headerName = template.headerTemplateName || QUOTATION_LETTER_HEADER_NAME
  const footerName = template.footerTemplateName || QUOTATION_LETTER_FOOTER_NAME

  const [letterhead, bank, companySign] = await Promise.all([
    resolveNamedLetterheadTemplates(headerName, footerName),
    fetchQuotationBankDetails(),
    fetchLabCompanySignContext(),
  ])

  const logoUrl = await resolveSignatureSignedUrl(companySign.logoPath)
  const signatureUrls = await Promise.all(
    rows.map((r) =>
      resolveSignatureSignedUrl(
        quotationSealStoragePath(r.signature_image_path, r.signature_text, companySign.sealSignPath),
      ),
    ),
  )

  const body = rows
    .map((row, i) =>
      buildOneQuotationHtml(row, {
        headerUrl: template.showLetterHeader ? letterhead.headerUrl : null,
        footerUrl: template.showLetterFooter ? letterhead.footerUrl : null,
        logoUrl,
        bank,
        signatureUrl: signatureUrls[i] ?? null,
        companyName: companySign.labName,
        template,
      }),
    )
    .join('<div style="page-break-after:always;height:0;"></div>')

  const title =
    rows.length === 1
      ? `${template.documentTitle || 'Document'} ${rows[0]?.quotation_number ?? ''}`.trim()
      : template.documentTitle || 'Documents'

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>${esc(title)}</title>
<style>${quotationStylesCss(template)}</style>
</head>
<body>
${body}
</body>
</html>`

  return {
    html,
    template,
    margins: {
      top: template.pageMarginTopMm,
      right: template.pageMarginRightMm,
      bottom: template.pageMarginBottomMm,
      left: template.pageMarginLeftMm,
    },
  }
}
