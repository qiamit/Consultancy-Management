import { resolveNamedLetterheadTemplates } from '@/features/sample-handling/report-preparation/reportScopeConfig'
import { getCurrencySymbol } from '@/lib/appCurrency'
import {
  documentMetaFieldLabels,
  type DocumentTemplateKind,
  type FinanceDocumentTemplate,
} from '@/features/settings/lab-settings/documentTemplateTypes'
import { fetchLabDocumentTemplates } from '@/features/settings/lab-settings/documentTemplatesConfig'
import { supabase } from '@/lib/supabaseClient'
import { amountInIndianRupeesWords } from './amountInIndianRupeesWords'
import { resolveSignatureSignedUrl, fetchLabCompanySignContext } from './quotationSignatureStorage'
import {
  formatDate,
  formatMoney,
  lineGstSplit,
  quotationStatusLabel,
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

async function signedSignatureUrl(path: string | null | undefined): Promise<string | null> {
  return resolveSignatureSignedUrl(path)
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
    gstPercent: String(l.gst_percent ?? 0),
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
  const totalsHpx = mmToPx(5.5)
  const signHpx = mmToPx(18)
  const signWpx = mmToPx(45)
  const termsMinPx = mmToPx(12)
  const blockMinPx = mmToPx(14)
  const sealHpx = mmToPx(42)

  return `
  @page { size: ${pageCssSize}; margin: 0; }
  * { box-sizing: border-box; }
  html, body {
    margin: 0; padding: 0; width: ${pageWpx}px; background: #fff;
  }
  body {
    font-family: ${font};
    font-size: ${size}px;
    color: #000;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  table { border-collapse: collapse; }
  .page {
    width: ${pageWpx}px;
    min-height: ${pageHpx}px;
    height: ${pageHpx}px;
    /* double-line page border (html2canvas-friendly) */
    border: 2px solid #000;
    outline: 2px solid #000;
    outline-offset: -5px;
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
    border-bottom: 2px solid #000;
  }
  .letter-header img {
    width: 100%; max-width: ${contentWpx}px; height: ${headerHpx}px;
    object-fit: fill; object-position: center; display: block;
  }
  .letter-header .ph { font-size: 12px; font-weight: 700; color: #333; }
  .title-bar {
    width: 100%; border-bottom: 2px solid #000; text-align: center;
    font-size: ${Math.max(size + 4, 14)}px; font-weight: 700; letter-spacing: 1px; padding: 6px 4px;
  }
  .meta-outer { width: 100%; border: 2px solid #000; }
  .meta-outer > tbody > tr > td { vertical-align: top; padding: 8px 10px; }
  .meta-client { width: 58%; border-right: 1px solid #000; }
  .meta-info { width: 42%; padding: 0 !important; }
  .lbl { font-size: ${size + 1}px; font-weight: 700; margin: 0 0 6px; }
  .client-line { margin: 0 0 3px; line-height: 1.35; font-size: ${size}px; }
  .kv { width: 100%; border-collapse: collapse; }
  .kv td {
    border: 1px solid #000; padding: 5px 6px; vertical-align: middle; font-size: ${size}px;
  }
  .kv tr:first-child td { border-top: none; }
  .kv tr:last-child td { border-bottom: none; }
  .kv td:first-child { border-left: none; }
  .kv td:last-child { border-right: none; }
  .kv .k { width: 52%; white-space: nowrap; }
  .kv .sep { width: 10px; text-align: center; }
  .kv .v { font-weight: 700; }
  .items-wrap {
    width: 100%; margin-top: 8px;
    border: 2px solid #000;
  }
  .items { width: 100%; border-collapse: collapse; border: 1px solid #000; table-layout: fixed; }
  .items th, .items td {
    border: 1px solid #000; padding: 4px 3px; vertical-align: top;
    font-size: ${Math.max(size - 1, 8)}px;
  }
  .items th {
    background: #f0f0f0; font-weight: 700; text-transform: uppercase;
    font-size: ${Math.max(size - 2, 7)}px;
  }
  .c { text-align: center; }
  .r { text-align: right; }
  .finance { width: 100%; margin-top: ${gap2}px; border: 2px solid #000; }
  .finance > tbody > tr > td { vertical-align: top; padding: 0; }
  .finance-left { width: 62%; border-right: 1px solid #000; }
  .finance-left-inner { width: 100%; }
  .finance-left-inner td {
    padding: 8px 10px; vertical-align: top; border-bottom: 1px solid #000;
  }
  .finance-left-inner tr:last-child td { border-bottom: none; }
  .finance-right { width: 38%; }
  .totals { width: 100%; border-collapse: collapse; table-layout: fixed; }
  .totals td {
    border: 1px solid #000; padding: 1px 6px; height: ${totalsHpx}px; font-size: ${size}px;
    vertical-align: middle; line-height: 1.15;
  }
  .totals .k { width: 55%; border-right: none !important; }
  .totals .sep {
    width: 10px; text-align: center;
    border-left: none !important; border-right: none !important;
  }
  .totals .v {
    width: ${rateColPx}px; text-align: right; font-weight: 700; border-left: none !important;
  }
  .totals .grand td { font-size: ${size + 2}px; font-weight: 700; }
  .words, .bank-line { font-size: ${size}px; line-height: 1.2; margin: 0 0 1px; }
  .bottom { width: 100%; margin-top: ${gap2}px; border: 2px solid #000; }
  .bottom-terms {
    width: 100%; padding: 6px 8px; border-bottom: 1px solid #000; min-height: ${termsMinPx}px;
  }
  .bottom-body { width: 100%; }
  .bottom-body > tbody > tr > td { vertical-align: top; padding: 0; }
  .bottom .left-col { width: 50%; border-right: 1px solid #000; }
  .bottom .block { padding: 6px 8px; border-bottom: 1px solid #000; min-height: ${blockMinPx}px; }
  .bottom .block:last-child { border-bottom: none; }
  .bottom .br {
    width: 50%; text-align: right; vertical-align: bottom; padding: 8px 10px; height: ${sealHpx}px;
  }
  .body-text { font-size: ${size}px; line-height: 1.4; white-space: pre-wrap; margin-top: 4px; }
  .sign-img {
    max-height: ${signHpx}px; max-width: ${signWpx}px; object-fit: contain; display: block; margin: 0 0 4px auto;
  }
  .sign-text {
    font-family: "Segoe Script", "Brush Script MT", cursive; font-size: 16px; font-style: italic;
    min-height: ${mmToPx(12)}px; margin-bottom: 4px;
  }
  .sign-company { font-size: ${size + 1}px; font-weight: 700; line-height: 1.2; }
  .sign-caption { font-size: ${size}px; font-weight: 400; line-height: 1.2; }
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
    bank: QuotationBankDetails
    signatureUrl: string | null
    companyName: string
    template: FinanceDocumentTemplate
  },
): string {
  const tpl = opts.template
  const metaLabels = documentMetaFieldLabels(tpl.documentTitle || 'Document')
  const gstMode: 'intra' | 'inter' =
    tpl.showIgst && !tpl.showCgst && !tpl.showSgst ? 'inter' : 'intra'

  let cgstTotal = 0
  let sgstTotal = 0
  let igstTotal = 0
  for (const l of row.line_items ?? []) {
    const split = lineGstSplit(lineToForm(l), gstMode)
    cgstTotal += split.cgstAmount
    sgstTotal += split.sgstAmount
    igstTotal += split.igstAmount
  }
  cgstTotal = Math.round(cgstTotal * 100) / 100
  sgstTotal = Math.round(sgstTotal * 100) / 100
  igstTotal = Math.round(igstTotal * 100) / 100

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
        ${tpl.lineShowRate ? `<td class="r">${getCurrencySymbol()} ${esc(formatMoney(l.rate))}</td>` : ''}
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

  const signatureInner = opts.signatureUrl
    ? `<img class="sign-img" src="${esc(opts.signatureUrl)}" alt="Company seal and signature" />`
    : row.signature_text?.trim()
      ? `<div class="sign-text">${esc(row.signature_text.trim())}</div>`
      : `<div class="sign-text">&nbsp;</div>`

  const sealSignBlock = tpl.showSealSign
    ? `${signatureInner}<div class="sign-company">${esc(opts.companyName.trim() || 'Company Name')}</div><div class="sign-caption">Authorized Signatory</div>`
    : ''

  const totalRows: string[] = []
  if (tpl.showBasicAmount) {
    totalRows.push(
      `<tr><td class="k">Basic Amount</td><td class="sep">:</td><td class="v">${getCurrencySymbol()} ${esc(formatMoney(row.subtotal))}</td></tr>`,
    )
  }
  if (tpl.showDiscount && Number(row.discount_amount) > 0) {
    totalRows.push(
      `<tr><td class="k">Discount</td><td class="sep">:</td><td class="v">${getCurrencySymbol()} ${esc(formatMoney(row.discount_amount))}</td></tr>`,
    )
  }
  if (tpl.showTransportationCharges && Number(row.transportation_charges ?? 0) > 0) {
    totalRows.push(
      `<tr><td class="k">Transportation Charges</td><td class="sep">:</td><td class="v">${getCurrencySymbol()} ${esc(formatMoney(row.transportation_charges ?? 0))}</td></tr>`,
    )
  }
  if (tpl.showPackagingCharge && Number(row.packaging_charges ?? 0) > 0) {
    totalRows.push(
      `<tr><td class="k">Packaging Charge</td><td class="sep">:</td><td class="v">${getCurrencySymbol()} ${esc(formatMoney(row.packaging_charges ?? 0))}</td></tr>`,
    )
  }
  if (tpl.showGstAmount) {
    totalRows.push(
      `<tr><td class="k">GST Amount</td><td class="sep">:</td><td class="v">${getCurrencySymbol()} ${esc(formatMoney(row.gst_amount))}</td></tr>`,
    )
  }
  if (tpl.showCgst) {
    totalRows.push(
      `<tr><td class="k">CGST</td><td class="sep">:</td><td class="v">${getCurrencySymbol()} ${esc(formatMoney(cgstTotal))}</td></tr>`,
    )
  }
  if (tpl.showSgst) {
    totalRows.push(
      `<tr><td class="k">SGST</td><td class="sep">:</td><td class="v">${getCurrencySymbol()} ${esc(formatMoney(sgstTotal))}</td></tr>`,
    )
  }
  if (tpl.showIgst) {
    totalRows.push(
      `<tr><td class="k">IGST</td><td class="sep">:</td><td class="v">${getCurrencySymbol()} ${esc(formatMoney(igstTotal))}</td></tr>`,
    )
  }
  if (tpl.showGrandTotal) {
    totalRows.push(
      `<tr class="grand"><td class="k">Grand Total</td><td class="sep">:</td><td class="v">${getCurrencySymbol()} ${esc(formatMoney(row.grand_total))}</td></tr>`,
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
              : `<span class="ph">Letter Header</span>`
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
            <tr><td class="k">${esc(metaLabels.number)}</td><td class="sep">:</td><td class="v">${cell(row.quotation_number)}</td></tr>
            <tr><td class="k">${esc(metaLabels.date)}</td><td class="sep">:</td><td class="v">${esc(formatDate(row.quotation_date))}</td></tr>
            <tr><td class="k">${esc(metaLabels.dueDate)}</td><td class="sep">:</td><td class="v">${esc(formatDate(row.valid_until))}</td></tr>
            <tr><td class="k">${esc(metaLabels.status)}</td><td class="sep">:</td><td class="v">${esc(quotationStatusLabel(row.status))}</td></tr>
          </table>
        </td>`
            : ''
        }
      </tr></table>`
        : ''
    }
    ${
      tpl.showLineItems
        ? `<div class="items-wrap"><table class="items" cellspacing="0" cellpadding="0">
        <thead><tr>
          <th class="c" style="width:6%;">#</th>
          <th>Description</th>
          ${tpl.lineShowMake ? '<th class="c" style="width:10%;">Make</th>' : ''}
          ${tpl.lineShowHsn ? '<th class="c" style="width:8%;">HSN</th>' : ''}
          ${tpl.lineShowQty ? '<th class="c" style="width:7%;">Qty</th>' : ''}
          ${tpl.lineShowUnit ? '<th class="c" style="width:7%;">Unit</th>' : ''}
          ${tpl.lineShowRate ? '<th class="r" style="width:28mm;">Rate</th>' : ''}
          ${tpl.lineShowAmount ? '<th class="r" style="width:28mm;">Amount</th>' : ''}
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
              ? `<tr><td style="height:5.5mm;padding:1px 8px;vertical-align:middle;border-bottom:1.5px solid #000;box-sizing:border-box;line-height:1.15;">
              <p class="words" style="margin:0;"><span class="lbl" style="display:inline;margin:0;">Amount in Words:</span> ${esc(amountInIndianRupeesWords(Number(row.grand_total) || 0))}</p>
            </td></tr>`
              : ''
          }
          ${
            tpl.showBankDetails
              ? `<tr><td style="height:auto;padding:${tpl.showAmountInWords ? `${mmToPx(2)}px` : '2px'} 8px 2px;vertical-align:top;line-height:1.2;">
              <div class="lbl" style="margin:0 0 2px;">Bank Details</div>
              ${bankBody}
            </td></tr>`
              : ''
          }
        </table></td>
        <td class="finance-right"><table class="totals" cellspacing="0" cellpadding="0">${totalRows.join('')}</table></td>
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
              : `<span class="ph">Letter Footer</span>`
          }</td></tr></table></div>`
        : ''
    }
  </div>
  `
}

/** Full document HTML using Lab document_templates for the given kind. */
export async function prepareQuotationDocumentHtml(
  rows: QuotationRow[],
  documentKind: DocumentTemplateKind = 'quotation',
): Promise<PreparedQuotationDocument> {
  const docs = await fetchLabDocumentTemplates()
  const template = docs[documentKind] ?? docs.quotation

  const headerName = template.headerTemplateName || QUOTATION_LETTER_HEADER_NAME
  const footerName = template.footerTemplateName || QUOTATION_LETTER_FOOTER_NAME

  const [letterhead, bank, companySign] = await Promise.all([
    resolveNamedLetterheadTemplates(headerName, footerName),
    fetchQuotationBankDetails(),
    fetchLabCompanySignContext(),
  ])

  const signatureUrls = await Promise.all(
    rows.map((r) => signedSignatureUrl(r.signature_image_path)),
  )

  const body = rows
    .map((row, i) =>
      buildOneQuotationHtml(row, {
        headerUrl: template.showLetterHeader ? letterhead.headerUrl : null,
        footerUrl: template.showLetterFooter ? letterhead.footerUrl : null,
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
