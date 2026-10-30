import type { FinanceDocumentTemplate } from '@/features/settings/lab-settings/documentTemplateTypes'
import { getCurrencySymbol } from '@/lib/appCurrency'
import {
  documentMetaFieldLabels,
  isPaymentReceiptDocumentTitle,
} from '@/features/settings/lab-settings/documentTemplateTypes'
import { cn } from '@/lib/utils'
import { DEFAULT_CONSULTANCY_GST } from '@/features/finance/sale/shared/financeRules'
import { amountInIndianRupeesWords } from './amountInIndianRupeesWords'
import { QUOTATION_FRAME_PAD_MM, QUOTATION_SIGNATURE_FONT_FAMILY } from './buildQuotationDocumentHtml'
import {
  computeQuotationTotals,
  formatDate,
  formatMoney,
  parseMoney,
  quotationStatusLabel,
  type QuotationForm,
  type QuotationLineForm,
  type QuotationRow,
} from './types'

export type QuotationBankDetails = {
  bankName: string
  branchName: string
  accountNumber: string
  ifsc: string
  upi: string
}

export type QuotationDocumentAssets = {
  headerUrl: string | null
  footerUrl: string | null
  companyName: string
  sealSignUrl: string | null
  /** Signed laboratory-files URL. Used on print when no letterhead image exists. */
  logoUrl?: string | null
  bank: QuotationBankDetails
}

export type QuotationDocumentViewProps = {
  tpl: FinanceDocumentTemplate
  row: QuotationRow
  assets: QuotationDocumentAssets
  /** When true, omit shadow (for print/PDF capture). */
  forOutput?: boolean
}

function paperWidthMm(tpl: FinanceDocumentTemplate): number {
  const portrait: Record<FinanceDocumentTemplate['paperSize'], number> = {
    A4: 210,
    A5: 148,
    Letter: 216,
    Legal: 216,
  }
  const landscape: Record<FinanceDocumentTemplate['paperSize'], number> = {
    A4: 297,
    A5: 210,
    Letter: 279,
    Legal: 356,
  }
  return tpl.pageOrientation === 'landscape'
    ? landscape[tpl.paperSize]
    : portrait[tpl.paperSize]
}

function paperHeightMm(tpl: FinanceDocumentTemplate): number {
  const portrait: Record<FinanceDocumentTemplate['paperSize'], number> = {
    A4: 297,
    A5: 210,
    Letter: 279,
    Legal: 356,
  }
  const landscape: Record<FinanceDocumentTemplate['paperSize'], number> = {
    A4: 210,
    A5: 148,
    Letter: 216,
    Legal: 216,
  }
  return tpl.pageOrientation === 'landscape'
    ? landscape[tpl.paperSize]
    : portrait[tpl.paperSize]
}

function lineToForm(l: NonNullable<QuotationRow['line_items']>[number]): QuotationLineForm {
  const storedGst = parseMoney(String(l.gst_percent ?? 0))
  return {
    key: l.id,
    description: l.description ?? '',
    details: l.details ?? '',
    make: l.make ?? '',
    hsnSac: l.hsn_sac ?? '',
    itemCode: l.item_code ?? '',
    quantity: String(l.quantity ?? 0),
    unit: l.unit ?? '',
    rate: String(l.rate ?? 0),
    discountPercent: String(l.discount_percent ?? 0),
    // Older quotations forced 0% GST on save; PDF/print still shows the consultancy default when the template asks for GST.
    gstPercent: String(storedGst > 0 ? storedGst : DEFAULT_CONSULTANCY_GST),
    lineRemarks: '',
    deliveryPeriod: '',
  }
}

export const SAMPLE_QUOTATION_ROW: QuotationRow = {
  id: 'sample',
  quotation_number: 'QI/QTN/2026-0001',
  quotation_date: '2026-08-10',
  valid_until: '2026-09-09',
  client_id: null,
  client_name: 'Sample Client Pvt. Ltd.',
  contact_person: 'Rahul',
  contact_email: 'rahul@sampleclient.com',
  contact_mobile: '+91 98765 43210',
  client_address: '#12, Industrial Area, Phase-II, Raipur - 492001, Chhattisgarh, India',
  client_gst_number: '22AAAAA0000A1Z5',
  subject: null,
  reference_no: null,
  status: 'Draft',
  payment_terms: '100 % Advance',
  notes: 'Sample note text',
  remarks: null,
  signature_text: null,
  signature_image_path: null,
  discount_percent: 0,
  discount_amount: 0,
  transportation_charges: 0,
  packaging_charges: 0,
  gst_percent: 18,
  gst_amount: 180,
  subtotal: 1000,
  grand_total: 1180,
  line_items: [
    {
      id: '1',
      quotation_id: 'sample',
      line_no: 1,
      description: 'Sample Test / Service Item',
      details: null,
      make: 'QIRLPL',
      hsn_sac: '9983',
      quantity: 1,
      unit: 'Nos',
      rate: 1000,
      amount: 1000,
      gst_percent: 18,
    },
  ],
}

export const SAMPLE_QUOTATION_ASSETS: QuotationDocumentAssets = {
  headerUrl: null,
  footerUrl: null,
  companyName: 'Company Name',
  sealSignUrl: null,
  bank: {
    bankName: 'Sample Bank',
    branchName: 'Main Branch',
    accountNumber: '1234567890',
    ifsc: 'SAMP0001234',
    upi: '',
  },
}

/** Same layout as Templates preview — used for preview, Print, and PDF. */
export function QuotationDocumentView({
  tpl,
  row,
  assets,
  forOutput = false,
}: QuotationDocumentViewProps) {
  const scale = Math.max(0.1, Math.min(4, (tpl.pageScalingPercent || 100) / 100))
  const headerScale = tpl.scaleWithDocument ? scale : 1
  const fontSize = Math.max(8, Math.min(18, (tpl.baseFontSizePt || 10) * scale))
  const widthMm = paperWidthMm(tpl)
  const heightMm = paperHeightMm(tpl)
  const headerHeightMm = Math.max(tpl.headerMarginMm || 0, 8) * headerScale
  const footerHeightMm = Math.max(tpl.footerMarginMm || 0, 6) * headerScale
  const marginTopMm = tpl.pageMarginTopMm || 0
  const marginRightMm = tpl.pageMarginRightMm || 0
  const marginBottomMm = tpl.pageMarginBottomMm || 0
  const marginLeftMm = tpl.pageMarginLeftMm || 0
  const contentWidthMm = Math.max(40, widthMm - marginLeftMm - marginRightMm - 2 * QUOTATION_FRAME_PAD_MM)
  /** Same geometry as the PDF: frame inset at the margins (3px double), content FRAME_PAD inside it. */
  const insidePad = (mm: number) => `calc(${mm + QUOTATION_FRAME_PAD_MM}mm + 3px)`

  const savedSupplyMode =
    row.gst_supply_mode === 'intra' || row.gst_supply_mode === 'inter' ? row.gst_supply_mode : null
  const gstMode: 'intra' | 'inter' =
    savedSupplyMode ?? (tpl.showIgst && !tpl.showCgst && !tpl.showSgst ? 'inter' : 'intra')
  const showCgst = savedSupplyMode ? savedSupplyMode === 'intra' : tpl.showCgst
  const showSgst = savedSupplyMode ? savedSupplyMode === 'intra' : tpl.showSgst
  const showIgst = savedSupplyMode ? savedSupplyMode === 'inter' : tpl.showIgst
  const metaLabels = documentMetaFieldLabels(tpl.documentTitle || 'Document')
  const isPaymentReceipt = isPaymentReceiptDocumentTitle(tpl.documentTitle || '')
  const lineForms = (row.line_items ?? []).map((l) =>
    isPaymentReceipt
      ? { ...lineToForm(l), gstPercent: '0' }
      : lineToForm(l),
  )
  const totals = computeQuotationTotals(
    {
      lines: lineForms,
      discountAmount: String(row.discount_amount ?? 0),
      discountPercent: String(row.discount_percent ?? 0),
      transportationCharges: String(row.transportation_charges ?? 0),
      packagingCharges: String(row.packaging_charges ?? 0),
      chargesGst: row.charges_gst === true,
      gstPercent: DEFAULT_CONSULTANCY_GST,
    } as QuotationForm,
    gstMode,
  )
  const displayGstAmount = tpl.showGstAmount ? totals.gstAmount : Number(row.gst_amount) || 0
  const displayGrandTotal = isPaymentReceipt
    ? Number(row.grand_total) || 0
    : tpl.showGstAmount
      ? totals.grandTotal
      : Number(row.grand_total) || 0
  const cgstTotal = totals.cgstAmount
  const sgstTotal = totals.sgstAmount
  const igstTotal = totals.igstAmount
  const metaRows: Array<[string, string]> = isPaymentReceipt
    ? [
        [metaLabels.number, row.quotation_number || '—'],
        [metaLabels.date, formatDate(row.quotation_date)],
        [metaLabels.dueDate, (row.reference_no || '').trim() || '—'],
        [
          metaLabels.status,
          `${getCurrencySymbol()} ${formatMoney(displayGrandTotal)}`,
        ],
      ]
    : [
        [metaLabels.number, row.quotation_number || '—'],
        [metaLabels.date, formatDate(row.quotation_date)],
        [metaLabels.dueDate, formatDate(row.valid_until)],
        [metaLabels.status, quotationStatusLabel(row.status)],
      ]

  const totalRows: Array<{ key: string; label: string; value: string; bold?: boolean }> = []
  if (tpl.showBasicAmount && !isPaymentReceipt) {
    totalRows.push({
      key: 'basic',
      label: 'Basic Amount',
      value: `${getCurrencySymbol()} ${formatMoney(totals.subtotal)}`,
      bold: true,
    })
  }
  if (tpl.showDiscount && totals.discountAmount > 0) {
    totalRows.push({
      key: 'disc',
      label: 'Less: Discount',
      value: `${getCurrencySymbol()} ${formatMoney(totals.discountAmount)}`,
      bold: true,
    })
  }
  if (totals.discountAmount > 0 && !isPaymentReceipt && (tpl.showDiscount || tpl.showBasicAmount)) {
    // GST is charged on this value (Basic Amount − Discount).
    totalRows.push({
      key: 'taxable',
      label: 'Taxable Value',
      value: `${getCurrencySymbol()} ${formatMoney(totals.taxableValue)}`,
      bold: true,
    })
  }
  if (tpl.showTransportationCharges && totals.transportationCharges > 0) {
    totalRows.push({
      key: 'trans',
      label: 'Transportation Charges',
      value: `${getCurrencySymbol()} ${formatMoney(totals.transportationCharges)}`,
      bold: true,
    })
  }
  if (tpl.showPackagingCharge && totals.packagingCharges > 0) {
    totalRows.push({
      key: 'pack',
      label: 'Packaging Charge',
      value: `${getCurrencySymbol()} ${formatMoney(totals.packagingCharges)}`,
      bold: true,
    })
  }
  if (tpl.showGstAmount && !isPaymentReceipt) {
    totalRows.push({
      key: 'gst',
      label: 'GST Amount',
      value: `${getCurrencySymbol()} ${formatMoney(displayGstAmount)}`,
      bold: true,
    })
  }
  if (showCgst && cgstTotal > 0) {
    totalRows.push({
      key: 'cgst',
      label: 'CGST',
      value: `${getCurrencySymbol()} ${formatMoney(cgstTotal)}`,
      bold: true,
    })
  }
  if (showSgst && sgstTotal > 0) {
    totalRows.push({
      key: 'sgst',
      label: 'SGST',
      value: `${getCurrencySymbol()} ${formatMoney(sgstTotal)}`,
      bold: true,
    })
  }
  if (showIgst && igstTotal > 0) {
    totalRows.push({
      key: 'igst',
      label: 'IGST',
      value: `${getCurrencySymbol()} ${formatMoney(igstTotal)}`,
      bold: true,
    })
  }

  const showFinance =
    tpl.showAmountInWords ||
    tpl.showBankDetails ||
    totalRows.length > 0 ||
    tpl.showGrandTotal

  const bank = assets.bank
  const bankHasAny = bank.bankName || bank.branchName || bank.accountNumber || bank.ifsc || bank.upi

  return (
    <div
      data-quotation-page="1"
      className={cn(
        'relative mx-auto flex w-full flex-col bg-white',
        !forOutput && 'shadow-md',
        tpl.centreOnPageHorizontal ? 'mx-auto' : '',
      )}
      style={{
        fontFamily: tpl.fontFamily || 'Arial, Helvetica, sans-serif',
        // Template sizes are points (a 10 pt body prints as 10 pt), as in the PDF.
        fontSize: `${fontSize}pt`,
        width: `${widthMm}mm`,
        maxWidth: `${widthMm}mm`,
        minHeight: `${heightMm}mm`,
        paddingTop: insidePad(marginTopMm),
        paddingRight: insidePad(marginRightMm),
        paddingBottom: insidePad(marginBottomMm),
        paddingLeft: insidePad(marginLeftMm),
        boxSizing: 'border-box',
      }}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute z-[3] border-[3px] border-double border-stone-900"
        style={{
          top: `${marginTopMm}mm`,
          right: `${marginRightMm}mm`,
          bottom: `${marginBottomMm}mm`,
          left: `${marginLeftMm}mm`,
        }}
      />
      {tpl.showLetterHeader ? (
        <div
          className="flex w-full shrink-0 items-stretch justify-center overflow-hidden border-b border-black"
          style={{ height: `${headerHeightMm}mm` }}
        >
          {assets.headerUrl ? (
            <img
              src={assets.headerUrl}
              alt="Letter Header"
              className="h-full w-full object-contain object-center"
              style={{
                width: '100%',
                height: `${headerHeightMm}mm`,
                maxWidth: `${contentWidthMm}mm`,
              }}
            />
          ) : forOutput ? (
            <div className="flex h-full w-full items-center justify-center gap-3 px-2">
              {assets.logoUrl ? (
                <img
                  src={assets.logoUrl}
                  alt=""
                  className="w-auto object-contain"
                  style={{ maxHeight: 70, height: 'auto' }}
                />
              ) : null}
              <span className="text-sm font-semibold text-stone-900">
                {assets.companyName.trim() || 'Company Name'}
              </span>
            </div>
          ) : (
            <span className="flex w-full items-center justify-center text-xs font-semibold text-stone-500">
              Letter Header
            </span>
          )}
        </div>
      ) : null}

      <div className="flex w-full flex-1 flex-col">
        <div className="px-2 pb-2.5 pt-2 text-center text-lg font-bold uppercase tracking-wide text-stone-900">
          {tpl.documentTitle || 'Document'}
        </div>

        {(tpl.showClientDetails || tpl.showDocumentMeta) && (
          <div className="grid grid-cols-2 items-stretch border-[3px] border-double border-stone-900">
            {tpl.showClientDetails ? (
              <div
                className={cn(
                  'box-border space-y-0.5',
                  tpl.showDocumentMeta && 'border-r border-stone-500',
                )}
                style={{ padding: '2mm' }}
              >
                <div className="font-bold">Client Details</div>
                <div className="font-semibold">{row.client_name.trim() || '—'}</div>
                {row.client_address?.trim() ? (
                  <div className="text-stone-700">{row.client_address}</div>
                ) : null}
                {row.client_gst_number || row.contact_mobile ? (
                  <div className="text-stone-700">
                    {[
                      row.client_gst_number ? `GST No: ${row.client_gst_number}` : '',
                      row.contact_mobile ? `Mobile No: ${row.contact_mobile}` : '',
                    ]
                      .filter(Boolean)
                      .join(' :: ')}
                  </div>
                ) : null}
                {row.contact_email?.trim() ? (
                  <div className="text-stone-700">Email: {row.contact_email}</div>
                ) : null}
              </div>
            ) : null}
            {tpl.showDocumentMeta ? (
              <table className="h-full w-full table-fixed border-collapse border-spacing-0 text-[0.95em]">
                <colgroup>
                  <col style={{ width: '52%' }} />
                  <col style={{ width: '12px' }} />
                  <col />
                </colgroup>
                <tbody>
                  {metaRows.map(([label, value], i, arr) => (
                    <tr key={label}>
                      <td
                        className={cn(
                          'border-y border-stone-300 px-2 py-1.5 align-middle',
                          i === 0 && 'border-t-0',
                          i === arr.length - 1 && 'border-b-0',
                        )}
                      >
                        {label}
                      </td>
                      <td
                        className={cn(
                          'border-x border-y border-stone-300 px-0 py-1.5 text-center align-middle',
                          i === 0 && 'border-t-0',
                          i === arr.length - 1 && 'border-b-0',
                        )}
                      >
                        :
                      </td>
                      <td
                        className={cn(
                          'border-y border-stone-300 px-2 py-1.5 align-middle font-semibold',
                          i === 0 && 'border-t-0',
                          i === arr.length - 1 && 'border-b-0',
                        )}
                      >
                        {value}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : null}
          </div>
        )}

        {isPaymentReceipt && !tpl.showLineItems ? (
          <div className="mt-2 space-y-1 border-[3px] border-double border-stone-900 px-3 py-2">
            <div className="text-[0.95em]">
              <span className="font-bold">Payment Mode:</span>{' '}
              {(row.payment_method || '').trim() || 'Bank'}
            </div>
            {row.reference_no?.trim() ? (
              <div className="text-[0.95em]">
                <span className="font-bold">Against Invoice:</span>{' '}
                {row.reference_no.trim()}
              </div>
            ) : null}
            <div className="text-[1.05em] font-bold">
              Amount Received: {getCurrencySymbol()} {formatMoney(row.grand_total)}
            </div>
            {row.subject?.trim() ? (
              <div className="text-[0.9em] text-stone-700">
                <span className="font-bold">Towards:</span> {row.subject.trim()}
              </div>
            ) : null}
          </div>
        ) : null}

        {tpl.showLineItems ? (
          <div className="mt-2 overflow-hidden border-[3px] border-double border-stone-900">
            <table className="w-full table-fixed border-collapse border-spacing-0 text-[0.85em] [&_tr:first-child>*]:border-t-0 [&_tr:last-child>*]:border-b-0 [&_tr>*:first-child]:border-l-0 [&_tr>*:last-child]:border-r-0">
              <colgroup>
                <col style={{ width: '7mm' }} />
                <col />
                {tpl.lineShowMake ? <col style={{ width: '18mm' }} /> : null}
                {tpl.lineShowHsn ? <col style={{ width: '16mm' }} /> : null}
                {tpl.lineShowQty ? <col style={{ width: '8mm' }} /> : null}
                {tpl.lineShowUnit ? <col style={{ width: '9mm' }} /> : null}
                {tpl.lineShowRate ? <col style={{ width: '24mm' }} /> : null}
                {tpl.lineShowAmount ? <col style={{ width: '26mm' }} /> : null}
              </colgroup>
              <thead>
                <tr className="bg-[#f0f0f0]">
                  <th className="border border-stone-300 px-0.5 py-1.5 text-center text-[0.7em] font-bold tracking-wide text-black">
                    <span className="inline-flex flex-col items-center leading-none">
                      <span>Sr.</span>
                      <span>No.</span>
                    </span>
                  </th>
                  <th className="border border-stone-300 px-1 py-1.5 text-left text-[0.7em] font-bold uppercase tracking-wide text-black">
                    Description
                  </th>
                  {tpl.lineShowMake ? (
                    <th className="border border-stone-300 px-1 py-1.5 text-center text-[0.7em] font-bold uppercase tracking-wide text-black">
                      Make
                    </th>
                  ) : null}
                  {tpl.lineShowHsn ? (
                    <th className="border border-stone-300 px-1 py-1.5 text-center text-[0.7em] font-bold uppercase tracking-wide text-black">
                      HSN
                    </th>
                  ) : null}
                  {tpl.lineShowQty ? (
                    <th className="border border-stone-300 px-1 py-1.5 text-center text-[0.7em] font-bold uppercase tracking-wide text-black">
                      Qty
                    </th>
                  ) : null}
                  {tpl.lineShowUnit ? (
                    <th className="border border-stone-300 px-1 py-1.5 text-center text-[0.7em] font-bold uppercase tracking-wide text-black">
                      Unit
                    </th>
                  ) : null}
                  {tpl.lineShowRate ? (
                    <th className="border border-stone-300 px-1 py-1.5 text-center text-[0.7em] font-bold uppercase tracking-wide text-black">
                      Rate
                    </th>
                  ) : null}
                  {tpl.lineShowAmount ? (
                    <th className="border border-stone-300 px-1 py-1.5 text-right text-[0.7em] font-bold uppercase tracking-wide text-black">
                      Amount
                    </th>
                  ) : null}
                </tr>
              </thead>
              <tbody>
                {(row.line_items ?? []).length === 0 ? (
                  <tr>
                    <td
                      className="border border-stone-300 px-1 py-1 text-center"
                      colSpan={
                        2 +
                        Number(tpl.lineShowMake) +
                        Number(tpl.lineShowHsn) +
                        Number(tpl.lineShowQty) +
                        Number(tpl.lineShowUnit) +
                        Number(tpl.lineShowRate) +
                        Number(tpl.lineShowAmount)
                      }
                    >
                      No line items
                    </td>
                  </tr>
                ) : (
                  (row.line_items ?? []).map((l, idx) => {
                    const amount = Number(l.amount)
                    const lineAmt = Number.isFinite(amount)
                      ? amount
                      : Number(l.quantity) * Number(l.rate)
                    return (
                      <tr key={l.id || idx} className={idx % 2 === 1 ? 'bg-stone-50' : undefined}>
                        <td className="border border-stone-300 px-1 py-1 text-center align-middle">
                          {idx + 1}
                        </td>
                        <td className="border border-stone-300 px-1 py-1 align-middle">
                          <div>{l.description || '—'}</div>
                          {l.details?.trim() ? (
                            <div className="mt-0.5 text-[0.85em] text-stone-600">{l.details}</div>
                          ) : null}
                        </td>
                        {tpl.lineShowMake ? (
                          <td className="border border-stone-300 px-1 py-1 text-center align-middle">
                            {l.make?.trim() || '—'}
                          </td>
                        ) : null}
                        {tpl.lineShowHsn ? (
                          <td className="border border-stone-300 px-1 py-1 text-center align-middle">
                            {l.hsn_sac?.trim() || '—'}
                          </td>
                        ) : null}
                        {tpl.lineShowQty ? (
                          <td className="border border-stone-300 px-1 py-1 text-center align-middle">
                            {l.quantity}
                          </td>
                        ) : null}
                        {tpl.lineShowUnit ? (
                          <td className="border border-stone-300 px-1 py-1 text-center align-middle">
                            {l.unit?.trim() || '—'}
                          </td>
                        ) : null}
                        {tpl.lineShowRate ? (
                          <td className="border border-stone-300 px-1 py-1 text-center align-middle">
                            {getCurrencySymbol()} {formatMoney(l.rate)}
                          </td>
                        ) : null}
                        {tpl.lineShowAmount ? (
                          <td className="border border-stone-300 px-1 py-1 text-right align-middle">
                            {getCurrencySymbol()} {formatMoney(lineAmt)}
                          </td>
                        ) : null}
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        ) : null}

        {showFinance ? (
          <div className="mt-[2mm] grid grid-cols-[1.6fr_1fr] items-stretch border-[3px] border-double border-stone-900">
            <div className="border-r border-stone-500">
              {tpl.showAmountInWords ? (
                <div className="box-border flex h-6 shrink-0 items-center px-2 leading-none">
                  <div>
                    <span className="font-bold">Amount in Words:</span>{' '}
                    <span>{amountInIndianRupeesWords(displayGrandTotal)}</span>
                  </div>
                </div>
              ) : null}
              {tpl.showBankDetails ? (
                <div className="space-y-0 px-2 pb-1.5 pt-0.5 leading-tight">
                  <div className="font-bold">Bank Details</div>
                  {bankHasAny ? (
                    <>
                      <div>
                        Bank Name: {bank.bankName || '—'}
                        {' :: '}
                        Branch Name: {bank.branchName || '—'}
                      </div>
                      <div>
                        A/c No: {bank.accountNumber || '—'}
                        {' :: '}
                        IFSC Code: {bank.ifsc || '—'}
                      </div>
                      {bank.upi ? <div>UPI: {bank.upi}</div> : null}
                    </>
                  ) : (
                    <div>—</div>
                  )}
                </div>
              ) : null}
            </div>
            <div className="flex min-h-0 flex-col">
              {[
                ...totalRows,
                ...(tpl.showGrandTotal
                  ? [
                      {
                        key: 'grand',
                        label: isPaymentReceipt ? 'Amount Received' : 'Grand Total',
                        value: `${getCurrencySymbol()} ${formatMoney(displayGrandTotal)}`,
                        bold: true,
                      },
                    ]
                  : []),
              ].map((r, i, arr) => (
                <div
                  key={r.key}
                  className={cn(
                    'flex min-h-0 flex-1 items-center leading-none',
                    i < arr.length - 1 && 'border-b border-stone-300',
                    r.bold && 'font-bold',
                  )}
                >
                  <span className="flex-1 px-2 py-0.5">{r.label}</span>
                  <span className="w-3 text-center">:</span>
                  <span className="w-[28mm] px-2 py-0.5 text-right font-semibold">{r.value}</span>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {(tpl.showTerms || tpl.showNotes || tpl.showSealSign) && (
          <div className="mt-[2mm] border-[3px] border-double border-stone-900">
            {tpl.showTerms ? (
              <div
                className={cn(
                  'min-h-[12mm] w-full p-2',
                  (tpl.showNotes || tpl.showSealSign) && 'border-b border-stone-300',
                )}
              >
                <div className="font-bold">Term &amp; Condition</div>
                <div className="whitespace-pre-wrap text-stone-700">
                  {row.payment_terms?.trim() || '—'}
                </div>
              </div>
            ) : null}
            {(tpl.showNotes || tpl.showSealSign) ? (
              <div className="grid grid-cols-2 items-stretch">
                <div className="border-r border-stone-500">
                  {tpl.showNotes ? (
                    <div className="min-h-[16mm] p-2">
                      <div className="font-bold">Notes</div>
                      <div className="whitespace-pre-wrap text-stone-700">
                        {row.notes?.trim() || '—'}
                      </div>
                    </div>
                  ) : null}
                </div>
                <div className="relative flex h-[22mm] max-h-[25mm] min-h-[20mm] flex-col items-end justify-between overflow-hidden px-2 py-1 text-right">
                  {tpl.showSealSign ? (
                    <>
                      <div className="relative z-[1] text-[1.15em] font-bold leading-tight">
                        {assets.companyName.trim() || 'Company Name'}
                      </div>
                      {assets.sealSignUrl ? (
                        <img
                          src={assets.sealSignUrl}
                          alt="Company Seal and Signature"
                          className="pointer-events-none absolute right-1 top-1/2 z-[2] max-h-[18mm] max-w-[46mm] -translate-y-1/2 object-contain mix-blend-multiply"
                        />
                      ) : row.signature_text?.trim() ? (
                        <div
                          className="pointer-events-none absolute right-2 top-1/2 z-[2] -translate-y-1/2 text-[15px] italic opacity-90"
                          style={{ fontFamily: QUOTATION_SIGNATURE_FONT_FAMILY }}
                        >
                          {row.signature_text.trim()}
                        </div>
                      ) : null}
                      <div className="relative z-[1] text-[1.05em] font-bold leading-tight text-amber-700">
                        Authorized Signatory
                      </div>
                    </>
                  ) : null}
                </div>
              </div>
            ) : null}
          </div>
        )}
      </div>

      {tpl.showLetterFooter ? (
        <div
          className="mt-auto flex w-full shrink-0 items-stretch justify-center overflow-hidden"
          style={{ height: `${footerHeightMm}mm` }}
        >
          {assets.footerUrl ? (
            <img
              src={assets.footerUrl}
              alt="Letter Footer"
              className="h-full w-full object-contain object-center"
              style={{
                width: '100%',
                height: `${footerHeightMm}mm`,
                maxWidth: `${contentWidthMm}mm`,
              }}
            />
          ) : forOutput ? null : (
            <span className="flex w-full items-center justify-center text-xs font-semibold text-stone-500">
              Letter Footer
            </span>
          )}
        </div>
      ) : null}
    </div>
  )
}

export { paperWidthMm, paperHeightMm }
