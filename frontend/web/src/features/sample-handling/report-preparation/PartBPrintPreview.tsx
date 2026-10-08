import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { limsOutlineBtnClass } from '@/lib/limsThemeUi'
import {
  PART_B_APPLICABLE,
  PART_B_NOT_APPLICABLE,
  PART_B_NO,
  PART_B_ROWS,
  PART_B_YES,
} from './testReportPartB'

const SAMPLE_VALUES: Record<string, string> = {
  samplingProcedureRef: PART_B_NOT_APPLICABLE,
  supportingDocuments: PART_B_APPLICABLE,
  deviationFromMethods: PART_B_NOT_APPLICABLE,
  nablReportRequired: PART_B_YES,
}

export type PartBAfterChoice = 'part_c' | 'signature'

export function PartBPrintPreview({
  fontSizePt,
  startsOnNewPage,
  onStartsOnNewPageChange,
  afterPartB,
  onAfterPartBChange,
  gapAfterBMm,
  disabled,
}: {
  fontSizePt: number
  startsOnNewPage: boolean
  onStartsOnNewPageChange?: (startsOnNewPage: boolean) => void
  afterPartB: PartBAfterChoice
  onAfterPartBChange?: (afterPartB: PartBAfterChoice) => void
  gapAfterBMm?: number
  disabled?: boolean
}) {
  return (
    <div className="space-y-2">
      <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-amber-800">
        Part B preview
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
          Start Below Part A
        </Button>
      </div>

      {startsOnNewPage ? (
        <div className="flex items-center gap-2 py-1" aria-hidden>
          <span className="h-px flex-1 border-t border-dashed border-stone-400" />
          <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide text-stone-500">
            Page break — Part B starts on new page
          </span>
          <span className="h-px flex-1 border-t border-dashed border-stone-400" />
        </div>
      ) : (
        <div className="flex items-center gap-2 py-1" aria-hidden>
          <span className="h-px flex-1 border-t border-dashed border-stone-300" />
          <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide text-stone-400">
            Continues below Part A — no page break
          </span>
          <span className="h-px flex-1 border-t border-dashed border-stone-300" />
        </div>
      )}

      <div className="overflow-x-auto border border-stone-400 bg-white p-2 shadow-sm">
        <style>{`
          .part-b-preview-table {
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
          .part-b-preview-table .part-b-col-k { width: 72%; }
          .part-b-preview-table .part-b-col-c { width: 3%; }
          .part-b-preview-table .part-b-col-v { width: 25%; }
          .part-b-preview-table th,
          .part-b-preview-table td {
            border-top: 1px solid #000;
            border-bottom: 1px solid #000;
            border-left: none;
            border-right: none;
            padding: 4px 8px;
            vertical-align: middle;
            word-break: break-word;
          }
          .part-b-preview-table th:first-child,
          .part-b-preview-table td:first-child {
            border-left: 1px solid #000;
          }
          .part-b-preview-table th:last-child,
          .part-b-preview-table td:last-child {
            border-right: 1px solid #000;
          }
          .part-b-preview-table th {
            text-align: left;
            font-weight: 700;
            letter-spacing: 0.02em;
            padding: 5px 8px;
            text-transform: none;
          }
          .part-b-preview-table .part-b-k { font-weight: 700; }
          .part-b-preview-table .part-b-c {
            text-align: center;
            padding-left: 0;
            padding-right: 0;
            font-weight: 700;
          }
          .part-b-preview-table .part-b-v { font-weight: 700; }
        `}</style>
        <table className="part-b-preview-table">
          <colgroup>
            <col className="part-b-col-k" />
            <col className="part-b-col-c" />
            <col className="part-b-col-v" />
          </colgroup>
          <thead>
            <tr>
              <th colSpan={3}>Part B. Supplementary Information</th>
            </tr>
          </thead>
          <tbody>
            {PART_B_ROWS.map((row, index) => (
              <tr key={row.key}>
                <td className="part-b-k">
                  {index + 1}. {row.label}
                </td>
                <td className="part-b-c">-</td>
                <td className="part-b-v">
                  {SAMPLE_VALUES[row.key] ?? PART_B_NO}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div
        className="flex items-center gap-2 py-2"
        style={gapAfterBMm != null ? { minHeight: `${Math.max(gapAfterBMm, 8)}px` } : undefined}
        aria-hidden
      >
        <span className="h-px flex-1 border-t border-dashed border-stone-400" />
        <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide text-stone-500">
          Gap{gapAfterBMm != null ? ` · ${gapAfterBMm} mm` : ''}
        </span>
        <span className="h-px flex-1 border-t border-dashed border-stone-400" />
      </div>

      <div className="flex flex-wrap items-center gap-2 py-1">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-stone-600">
          After Part B
        </span>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled}
          aria-pressed={afterPartB === 'part_c'}
          className={cn(
            limsOutlineBtnClass,
            afterPartB === 'part_c' &&
              'border-amber-600 bg-amber-50 text-amber-900 hover:bg-amber-100 hover:text-amber-950',
          )}
          onClick={() => onAfterPartBChange?.('part_c')}
        >
          Start Part C
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled}
          aria-pressed={afterPartB === 'signature'}
          className={cn(
            limsOutlineBtnClass,
            afterPartB === 'signature' &&
              'border-amber-600 bg-amber-50 text-amber-900 hover:bg-amber-100 hover:text-amber-950',
          )}
          onClick={() => onAfterPartBChange?.('signature')}
        >
          Apply Signature
        </Button>
      </div>

      {afterPartB === 'signature' ? (
        <div className="flex items-center gap-2 py-1" aria-hidden>
          <span className="h-px flex-1 border-t border-dashed border-amber-500/60" />
          <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide text-amber-800">
            Signature block after Part B
          </span>
          <span className="h-px flex-1 border-t border-dashed border-amber-500/60" />
        </div>
      ) : (
        <div className="flex items-center gap-2 py-1" aria-hidden>
          <span className="h-px flex-1 border-t border-dashed border-stone-300" />
          <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide text-stone-400">
            Continues to Part C
          </span>
          <span className="h-px flex-1 border-t border-dashed border-stone-300" />
        </div>
      )}
    </div>
  )
}
