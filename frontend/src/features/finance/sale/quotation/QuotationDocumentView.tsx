import type { FinanceDocumentTemplate } from '@/features/settings/lab-settings/documentTemplateTypes'
import { getCurrencySymbol } from '@/lib/appCurrency'
import { documentMetaFieldLabels } from '@/features/settings/lab-settings/documentTemplateTypes'
import { cn } from '@/lib/utils'
import { amountInIndianRupeesWords } from './amountInIndianRupeesWords'
import {
  formatDate,
  formatMoney,
  lineGstSplit,
  quotationStatusLabel,
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
    gstPercent: String(l.gst_percent ?? 0),
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
  const contentWidthMm = Math.max(
    40,
    widthMm -
      (tpl.alignWithPageMargin
        ? (tpl.pageMarginLeftMm || 0) + (tpl.pageMarginRightMm || 0)
        : 0),
  )

  const gstMode: 'intra' | 'inter' =
    tpl.showIgst && !tpl.showCgst && !tpl.showSgst ? 'inter' : 'intra'
  const metaLabels = documentMetaFieldLabels(tpl.documentTitle || 'Document')
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

  const totalRows: Array<{ key: string; label: string; value: string; bold?: boolean }> = []
  if (tpl.showBasicAmount) {
    totalRows.push({
      key: 'basic',
      label: 'Basic Amount',
      value: `${getCurrencySymbol()} ${formatMoney(row.subtotal)}`,
      bold: true,
    })
  }
  if (tpl.showDiscount && Number(row.discount_amount) > 0) {
    totalRows.push({
      key: 'disc',
      label: 'Discount',
      value: `${getCurrencySymbol()} ${formatMoney(row.discount_amount)}`,
      bold: true,
    })
  }
  if (tpl.showTransportationCharges && Number(row.transportation_charges ?? 0) > 0) {
    totalRows.push({
      key: 'trans',
      label: 'Transportation Charges',
      value: `${getCurrencySymbol()} ${formatMoney(row.transportation_charges ?? 0)}`,
      bold: true,
    })
  }
  if (tpl.showPackagingCharge && Number(row.packaging_charges ?? 0) > 0) {
    totalRows.push({
      key: 'pack',
      label: 'Packaging Charge',
      value: `${getCurrencySymbol()} ${formatMoney(row.packaging_charges ?? 0)}`,
      bold: true,
    })
  }
  if (tpl.showGstAmount) {
    totalRows.push({
      key: 'gst',
      label: 'GST Amount',
      value: `${getCurrencySymbol()} ${formatMoney(row.gst_amount)}`,
      bold: true,
    })
  }
  if (tpl.showCgst && cgstTotal > 0) {
    totalRows.push({
      key: 'cgst',
      label: 'CGST',
      value: `${getCurrencySymbol()} ${formatMoney(cgstTotal)}`,
      bold: true,
    })
  }
  if (tpl.showSgst && sgstTotal > 0) {
    totalRows.push({
      key: 'sgst',
      label: 'SGST',
      value: `${getCurrencySymbol()} ${formatMoney(sgstTotal)}`,
      bold: true,
    })
  }
  if (tpl.showIgst && igstTotal > 0) {
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
        'mx-auto flex w-full flex-col border-4 border-double border-black bg-white',
        !forOutput && 'shadow-md',
        tpl.centreOnPageHorizontal ? 'mx-auto' : '',
      )}
      style={{
        fontFamily: tpl.fontFamily || 'Arial, Helvetica, sans-serif',
        fontSize: `${fontSize}px`,
        width: `${widthMm}mm`,
        maxWidth: `${widthMm}mm`,
        height: `${heightMm}mm`,
        minHeight: `${heightMm}mm`,
        paddingTop: `${tpl.pageMarginTopMm}mm`,
        paddingRight: `${tpl.pageMarginRightMm}mm`,
        paddingBottom: tpl.showLetterFooter ? 0 : `${tpl.pageMarginBottomMm}mm`,
        paddingLeft: `${tpl.pageMarginLeftMm}mm`,
        boxSizing: 'border-box',
      }}
    >
      {tpl.showLetterHeader ? (
        <div
          className="flex w-full shrink-0 items-stretch justify-center overflow-hidden border-b border-black"
          style={{
            height: `${headerHeightMm}mm`,
            marginLeft: tpl.alignWithPageMargin ? undefined : `-${tpl.pageMarginLeftMm}mm`,
            marginRight: tpl.alignWithPageMargin ? undefined : `-${tpl.pageMarginRightMm}mm`,
            width: tpl.alignWithPageMargin ? '100%' : `${widthMm}mm`,
            maxWidth: tpl.alignWithPageMargin ? '100%' : `${widthMm}mm`,
          }}
        >
          {assets.headerUrl ? (
            <img
              src={assets.headerUrl}
              alt="Letter Header"
              className="h-full w-full object-fill object-center"
              style={{
                width: '100%',
                height: `${headerHeightMm}mm`,
                maxWidth: `${contentWidthMm}mm`,
              }}
            />
          ) : (
            <span className="flex w-full items-center justify-center text-xs font-semibold text-stone-500">
              Letter Header
            </span>
          )}
        </div>
      ) : null}

      <div className="flex min-h-0 w-full flex-1 flex-col">
        <div className="border-b border-black px-2 py-1.5 text-center text-sm font-bold uppercase tracking-wide">
          {tpl.documentTitle || 'Document'}
        </div>

        {(tpl.showClientDetails || tpl.showDocumentMeta) && (
          <div className="grid grid-cols-2 border-2 border-black">
            {tpl.showClientDetails ? (
              <div className={cn('space-y-0.5 p-2', tpl.showDocumentMeta && 'border-r border-black')}>
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
              <div className="p-0">
                <table className="w-full border-collapse text-[0.95em]">
                  <tbody>
                    {(
                      [
                        [metaLabels.number, row.quotation_number || '—'],
                        [metaLabels.date, formatDate(row.quotation_date)],
                        [metaLabels.dueDate, formatDate(row.valid_until)],
                        [metaLabels.status, quotationStatusLabel(row.status)],
                      ] as const
                    ).map(([label, value], i, arr) => (
                      <tr key={label}>
                        <td
                          className={cn(
                            'border border-black border-l-0 px-2 py-1',
                            i === 0 && 'border-t-0',
                            i === arr.length - 1 && 'border-b-0',
                          )}
                        >
                          {label}
                        </td>
                        <td
                          className={cn(
                            'w-3 border border-black px-1 py-1 text-center',
                            i === 0 && 'border-t-0',
                            i === arr.length - 1 && 'border-b-0',
                          )}
                        >
                          :
                        </td>
                        <td
                          className={cn(
                            'border border-black border-r-0 px-2 py-1 font-semibold',
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
              </div>
            ) : null}
          </div>
        )}

        {tpl.showLineItems ? (
          <div className="mt-2 border-2 border-black">
            <table className="w-full table-fixed border-collapse text-[0.85em]">
              <colgroup>
                <col className="w-[6%]" />
                <col />
                {tpl.lineShowMake ? <col className="w-[10%]" /> : null}
                {tpl.lineShowHsn ? <col className="w-[8%]" /> : null}
                {tpl.lineShowQty ? <col className="w-[7%]" /> : null}
                {tpl.lineShowUnit ? <col className="w-[7%]" /> : null}
                {tpl.lineShowRate ? <col style={{ width: '28mm' }} /> : null}
                {tpl.lineShowAmount ? <col style={{ width: '28mm' }} /> : null}
              </colgroup>
              <thead>
                <tr className="bg-stone-100">
                  <th className="border border-black px-1 py-1 text-center">#</th>
                  <th className="border border-black px-1 py-1 text-left">Description</th>
                  {tpl.lineShowMake ? (
                    <th className="border border-black px-1 py-1 text-center">Make</th>
                  ) : null}
                  {tpl.lineShowHsn ? (
                    <th className="border border-black px-1 py-1 text-center">HSN</th>
                  ) : null}
                  {tpl.lineShowQty ? (
                    <th className="border border-black px-1 py-1 text-center">Qty</th>
                  ) : null}
                  {tpl.lineShowUnit ? (
                    <th className="border border-black px-1 py-1 text-center">Unit</th>
                  ) : null}
                  {tpl.lineShowRate ? (
                    <th className="border border-black px-1 py-1 text-right">Rate</th>
                  ) : null}
                  {tpl.lineShowAmount ? (
                    <th className="border border-black px-1 py-1 text-right">Amount</th>
                  ) : null}
                </tr>
              </thead>
              <tbody>
                {(row.line_items ?? []).length === 0 ? (
                  <tr>
                    <td
                      className="border border-black px-1 py-1 text-center"
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
                      <tr key={l.id || idx}>
                        <td className="border border-black px-1 py-1 text-center">{idx + 1}</td>
                        <td className="border border-black px-1 py-1">
                          <div>{l.description || '—'}</div>
                          {l.details?.trim() ? (
                            <div className="mt-0.5 text-[8px] text-stone-600">{l.details}</div>
                          ) : null}
                        </td>
                        {tpl.lineShowMake ? (
                          <td className="border border-black px-1 py-1 text-center">
                            {l.make?.trim() || '—'}
                          </td>
                        ) : null}
                        {tpl.lineShowHsn ? (
                          <td className="border border-black px-1 py-1 text-center">
                            {l.hsn_sac?.trim() || '—'}
                          </td>
                        ) : null}
                        {tpl.lineShowQty ? (
                          <td className="border border-black px-1 py-1 text-center">
                            {l.quantity}
                          </td>
                        ) : null}
                        {tpl.lineShowUnit ? (
                          <td className="border border-black px-1 py-1 text-center">
                            {l.unit?.trim() || '—'}
                          </td>
                        ) : null}
                        {tpl.lineShowRate ? (
                          <td className="border border-black px-1 py-1 text-right">
                            {getCurrencySymbol()} {formatMoney(l.rate)}
                          </td>
                        ) : null}
                        {tpl.lineShowAmount ? (
                          <td className="border border-black px-1 py-1 text-right">
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
          <div className="mt-[2mm] grid grid-cols-[1.6fr_1fr] border-2 border-black">
            <div className="border-r border-black">
              {tpl.showAmountInWords ? (
                <div className="box-border flex h-6 shrink-0 items-center border-b border-black px-2 leading-none">
                  <div>
                    <span className="font-bold">Amount in Words:</span>{' '}
                    <span>{amountInIndianRupeesWords(Number(row.grand_total) || 0)}</span>
                  </div>
                </div>
              ) : null}
              {tpl.showBankDetails ? (
                <div
                  className={cn(
                    'space-y-0 px-2 py-0.5 leading-tight',
                    tpl.showAmountInWords && 'mt-[2mm]',
                  )}
                >
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
            <div>
              <table className="w-full table-fixed border-collapse leading-none">
                <tbody>
                  {totalRows.map((r) => (
                    <tr key={r.key} className="h-6">
                      <td className="border border-r-0 border-black px-2 py-0 align-middle">
                        {r.label}
                      </td>
                      <td className="w-3 border-y border-black px-1 py-0 text-center align-middle">
                        :
                      </td>
                      <td
                        className={cn(
                          'w-[28mm] border border-l-0 border-black px-2 py-0 text-right align-middle',
                          r.bold && 'font-semibold',
                        )}
                      >
                        {r.value}
                      </td>
                    </tr>
                  ))}
                  {tpl.showGrandTotal ? (
                    <tr className="h-6">
                      <td className="border border-r-0 border-black px-2 py-0 align-middle font-bold">
                        Grand Total
                      </td>
                      <td className="w-3 border-y border-black px-1 py-0 text-center align-middle font-bold">
                        :
                      </td>
                      <td className="w-[28mm] border border-l-0 border-black px-2 py-0 text-right align-middle text-sm font-bold">
                        {getCurrencySymbol()} {formatMoney(row.grand_total)}
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}

        {(tpl.showTerms || tpl.showNotes || tpl.showSealSign) && (
          <div className="mt-[2mm] border-2 border-black">
            {tpl.showTerms ? (
              <div
                className={cn(
                  'min-h-[12mm] w-full p-2',
                  (tpl.showNotes || tpl.showSealSign) && 'border-b border-black',
                )}
              >
                <div className="font-bold">Term &amp; Condition</div>
                <div className="whitespace-pre-wrap text-stone-700">
                  {row.payment_terms?.trim() || '—'}
                </div>
              </div>
            ) : null}
            {(tpl.showNotes || tpl.showSealSign) ? (
              <div className="grid grid-cols-2">
                <div className="border-r border-black">
                  {tpl.showNotes ? (
                    <div className="min-h-[16mm] p-2">
                      <div className="font-bold">Notes</div>
                      <div className="whitespace-pre-wrap text-stone-700">
                        {row.notes?.trim() || '—'}
                      </div>
                    </div>
                  ) : null}
                </div>
                <div className="flex min-h-[24mm] flex-col items-end justify-end gap-0.5 p-2 text-right">
                  {tpl.showSealSign ? (
                    <>
                      {assets.sealSignUrl ? (
                        <img
                          src={assets.sealSignUrl}
                          alt="Company seal and signature"
                          className="mb-1 max-h-[18mm] max-w-[45mm] object-contain"
                        />
                      ) : row.signature_text?.trim() ? (
                        <div
                          className="mb-1 min-h-[12mm] text-base italic"
                          style={{ fontFamily: '"Segoe Script", "Brush Script MT", cursive' }}
                        >
                          {row.signature_text.trim()}
                        </div>
                      ) : (
                        <div className="mb-1 flex h-[18mm] w-[45mm] items-center justify-center border border-dashed border-stone-300 text-[10px] text-stone-400">
                          Seal image
                        </div>
                      )}
                      <div className="font-semibold leading-tight">
                        {assets.companyName.trim() || 'Company Name'}
                      </div>
                      <div className="leading-tight">Authorized Signatory</div>
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
          style={{
            height: `${footerHeightMm}mm`,
            marginLeft: tpl.alignWithPageMargin ? undefined : `-${tpl.pageMarginLeftMm}mm`,
            marginRight: tpl.alignWithPageMargin ? undefined : `-${tpl.pageMarginRightMm}mm`,
            width: tpl.alignWithPageMargin ? '100%' : `${widthMm}mm`,
            maxWidth: tpl.alignWithPageMargin ? '100%' : `${widthMm}mm`,
          }}
        >
          {assets.footerUrl ? (
            <img
              src={assets.footerUrl}
              alt="Letter Footer"
              className="h-full w-full object-fill object-center"
              style={{
                width: '100%',
                height: `${footerHeightMm}mm`,
                maxWidth: `${contentWidthMm}mm`,
              }}
            />
          ) : (
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
