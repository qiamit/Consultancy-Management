import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { ReportScopeKind } from './reportScope'
import { appendReportScopeSuffix } from './reportScope'
import { limsOutlineBtnClass } from '@/lib/limsThemeUi'

const SAMPLE = {
  customerName: 'ABC Industries Pvt. Ltd.',
  customerAddress: '12 Industrial Area, Phase-II, New Delhi – 110020',
  productTitle: 'High Strength Deformed Steel Bars as per IS 1786: 2008',
  testReportAsPer: 'IS 1786: 2008',
  ulrNumber: 'TC-XXXX-250000001',
  sampleCode: 'SRF/2026/0001',
  reportNumberBase: 'TR/2026/0001',
  qrCode: 'QR-001',
  dateReceipt: '01-04-2026',
  batchNumber: 'BN-0426',
  dateReporting: '08-04-2026',
  sampleQuantity: '1 No.',
  dateMfg: '15-03-2026',
  natureOfSample: 'Steel bar',
  dateStarted: '02-04-2026',
  sectionCode: 'MECH',
  dateCompleted: '07-04-2026',
  sectionReportNo: 'SEC/MECH/001',
  bisSeal: 'Intact',
  reportType: 'Original',
  ioSignature: 'Yes',
  partyRef: 'PO/2026/118',
  referenceReportNo: '—',
  sampleDescription: 'Fe 500, 12 mm dia, 1 metre length',
  declaredValue: 'As per IS 1786',
  anyOther: '—',
} as const

function Kv({ label, value }: { label: string; value: string }) {
  return (
    <>
      <td className="part-a-k">{label}</td>
      <td className="part-a-c">-</td>
      <td className="part-a-v">{value}</td>
    </>
  )
}

function FullRow({ label, value }: { label: string; value: string }) {
  return (
    <tr className="part-a-full">
      <td className="part-a-k">{label}</td>
      <td className="part-a-c">-</td>
      <td className="part-a-v" colSpan={4}>
        {value}
      </td>
    </tr>
  )
}

export type PartAAfterChoice = 'part_b' | 'signature'

export function PartAPrintPreview({
  fontSizePt,
  startsOnNewPage,
  onStartsOnNewPageChange,
  afterPartA,
  onAfterPartAChange,
  gapAfterAMm,
  disabled,
  scope,
}: {
  fontSizePt: number
  startsOnNewPage: boolean
  onStartsOnNewPageChange?: (startsOnNewPage: boolean) => void
  afterPartA: PartAAfterChoice
  onAfterPartAChange?: (afterPartA: PartAAfterChoice) => void
  gapAfterAMm?: number
  disabled?: boolean
  scope: ReportScopeKind
}) {
  const isAccredited = scope === 'nabl'
  const reportNumber = appendReportScopeSuffix(SAMPLE.reportNumberBase, scope)
  const ulrNumber = isAccredited ? SAMPLE.ulrNumber : '—'
  const scopeLabel = isAccredited ? 'Accredited (NABL)' : 'Non Accredited (Non-NABL)'

  return (
    <div className="space-y-2">
      <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-amber-800">
        Part A preview — {scopeLabel}
      </p>

      <div className="flex flex-wrap items-center gap-2 py-1">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-stone-600">
          Page
        </span>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled}
          aria-pressed={startsOnNewPage}
          className={cn(
            limsOutlineBtnClass,
            startsOnNewPage &&
              'border-amber-600 bg-amber-50 text-amber-900 hover:bg-amber-100 hover:text-amber-950',
          )}
          onClick={() => onStartsOnNewPageChange?.(true)}
        >
          Start on New Page
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled}
          aria-pressed={!startsOnNewPage}
          className={cn(
            limsOutlineBtnClass,
            !startsOnNewPage &&
              'border-amber-600 bg-amber-50 text-amber-900 hover:bg-amber-100 hover:text-amber-950',
          )}
          onClick={() => onStartsOnNewPageChange?.(false)}
        >
          Start from 1st Page
        </Button>
      </div>

      {startsOnNewPage ? (
        <div className="flex items-center gap-2 py-1" aria-hidden>
          <span className="h-px flex-1 border-t border-dashed border-stone-400" />
          <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide text-stone-500">
            Page break — Part A starts on new page
          </span>
          <span className="h-px flex-1 border-t border-dashed border-stone-400" />
        </div>
      ) : (
        <div className="flex items-center gap-2 py-1" aria-hidden>
          <span className="h-px flex-1 border-t border-dashed border-stone-300" />
          <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide text-stone-400">
            Continues from 1st page — no page break
          </span>
          <span className="h-px flex-1 border-t border-dashed border-stone-300" />
        </div>
      )}

      <div className="overflow-x-auto border border-stone-400 bg-white p-2 shadow-sm">
        <style>{`
          .part-a-preview-table {
            width: 100%;
            border-collapse: collapse;
            table-layout: fixed;
            font-family: "Times New Roman", Times, serif;
            font-weight: 700;
            font-size: ${fontSizePt}pt;
            color: #000;
            line-height: 1.25;
            border: 1px solid #000;
          }
          .part-a-preview-table .part-a-col-k { width: 24%; }
          .part-a-preview-table .part-a-col-c { width: 2%; }
          .part-a-preview-table .part-a-col-v { width: 24%; }
          .part-a-preview-table th,
          .part-a-preview-table td {
            border-top: 1px solid #000;
            border-bottom: 1px solid #000;
            border-left: none;
            border-right: none;
            padding: 3px 6px;
            vertical-align: top;
            word-break: break-word;
          }
          .part-a-preview-table th:first-child,
          .part-a-preview-table td:first-child {
            border-left: 1px solid #000;
          }
          .part-a-preview-table th:last-child,
          .part-a-preview-table td:last-child {
            border-right: 1px solid #000;
          }
          .part-a-preview-table td.part-a-v + td.part-a-k {
            border-left: 1px solid #000;
          }
          .part-a-preview-table th {
            text-align: left;
            font-weight: 700;
            letter-spacing: 0.02em;
            padding: 5px 8px;
            text-transform: none;
          }
          .part-a-preview-table .part-a-k {
            font-weight: 700;
            white-space: nowrap;
            word-break: keep-all;
            overflow-wrap: normal;
          }
          .part-a-preview-table .part-a-c {
            text-align: center;
            padding-left: 0;
            padding-right: 0;
            font-weight: 700;
          }
          .part-a-preview-table .part-a-v { font-weight: 700; }
        `}</style>
        <table className="part-a-preview-table">
          <colgroup>
            <col className="part-a-col-k" />
            <col className="part-a-col-c" />
            <col className="part-a-col-v" />
            <col className="part-a-col-k" />
            <col className="part-a-col-c" />
            <col className="part-a-col-v" />
          </colgroup>
          <thead>
            <tr>
              <th colSpan={6}>Part A. Particulars of Sample Submitted</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <Kv label="Report Type" value={SAMPLE.reportType} />
              <Kv label="Date of Reporting" value={SAMPLE.dateReporting} />
            </tr>
            {isAccredited ? (
              <tr>
                <Kv label="Report Number" value={reportNumber} />
                <Kv label="ULR Number" value={ulrNumber} />
              </tr>
            ) : (
              <FullRow label="Report Number" value={reportNumber} />
            )}
            <FullRow label="Customer Name" value={SAMPLE.customerName} />
            <FullRow label="Customer Address" value={SAMPLE.customerAddress} />
            <FullRow label="Product IS Code Title" value={SAMPLE.productTitle} />
            <FullRow label="Sample Description" value={SAMPLE.sampleDescription} />
            <FullRow label="Declared Values" value={SAMPLE.declaredValue} />
            <FullRow label="Batch Number" value={SAMPLE.batchNumber} />
            <FullRow label="Date of Manufacturing" value={SAMPLE.dateMfg} />
            <FullRow label="Sample Code" value={SAMPLE.sampleCode} />
            <FullRow label="QR Code / Bar Code" value={SAMPLE.qrCode} />
            <tr>
              <Kv label="BIS Seal" value={SAMPLE.bisSeal} />
              <Kv label="IO's Signature" value={SAMPLE.ioSignature} />
            </tr>
            <FullRow label="Date of Sample Receipt" value={SAMPLE.dateReceipt} />
            <FullRow label="Sample Quantity" value={SAMPLE.sampleQuantity} />
            <FullRow label="Nature of Sample" value={SAMPLE.natureOfSample} />
            <FullRow label="Section Code" value={SAMPLE.sectionCode} />
            <FullRow label="Section Report No" value={SAMPLE.sectionReportNo} />
            <FullRow label="Date of Test Started" value={SAMPLE.dateStarted} />
            <FullRow label="Date of Test Completed" value={SAMPLE.dateCompleted} />
            <FullRow label="Party Reference No" value={SAMPLE.partyRef} />
            <FullRow label="Reference Report No" value={SAMPLE.referenceReportNo} />
            <FullRow label="Any Other Information" value={SAMPLE.anyOther} />
          </tbody>
        </table>
      </div>

      <div
        className="flex items-center gap-2 py-2"
        style={gapAfterAMm != null ? { minHeight: `${Math.max(gapAfterAMm, 8)}px` } : undefined}
        aria-hidden
      >
        <span className="h-px flex-1 border-t border-dashed border-stone-400" />
        <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide text-stone-500">
          Gap{gapAfterAMm != null ? ` · ${gapAfterAMm} mm` : ''}
        </span>
        <span className="h-px flex-1 border-t border-dashed border-stone-400" />
      </div>

      <div className="flex flex-wrap items-center gap-2 py-1">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-stone-600">
          After Part A
        </span>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled}
          aria-pressed={afterPartA === 'part_b'}
          className={cn(
            limsOutlineBtnClass,
            afterPartA === 'part_b' &&
              'border-amber-600 bg-amber-50 text-amber-900 hover:bg-amber-100 hover:text-amber-950',
          )}
          onClick={() => onAfterPartAChange?.('part_b')}
        >
          Start Part B
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled}
          aria-pressed={afterPartA === 'signature'}
          className={cn(
            limsOutlineBtnClass,
            afterPartA === 'signature' &&
              'border-amber-600 bg-amber-50 text-amber-900 hover:bg-amber-100 hover:text-amber-950',
          )}
          onClick={() => onAfterPartAChange?.('signature')}
        >
          Apply Signature
        </Button>
      </div>

      {afterPartA === 'signature' ? (
        <div className="flex items-center gap-2 py-1" aria-hidden>
          <span className="h-px flex-1 border-t border-dashed border-amber-500/60" />
          <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide text-amber-800">
            Signature block after Part A
          </span>
          <span className="h-px flex-1 border-t border-dashed border-amber-500/60" />
        </div>
      ) : (
        <div className="flex items-center gap-2 py-1" aria-hidden>
          <span className="h-px flex-1 border-t border-dashed border-stone-300" />
          <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide text-stone-400">
            Continues to Part B
          </span>
          <span className="h-px flex-1 border-t border-dashed border-stone-300" />
        </div>
      )}
    </div>
  )
}
