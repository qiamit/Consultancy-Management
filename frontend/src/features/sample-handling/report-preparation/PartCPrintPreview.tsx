import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { limsOutlineBtnClass } from '@/lib/limsThemeUi'
import type { ReportScopeKind } from './reportScope'
import {
  PART_C_REPORT_COLUMN_DEFS,
  partCColumnWidthPercents,
  visiblePartCReportColumns,
  type PartCReportColumnKey,
  type PartCReportColumnVisibility,
} from './partCReportColumns'

function partCHeaderLabel(key: PartCReportColumnKey, label: string) {
  if (key === 'srNo') {
    return (
      <>
        Sr
        <br />
        No
      </>
    )
  }
  if (key === 'observedValue') {
    return (
      <>
        Observed
        <br />
        Value
      </>
    )
  }
  if (key === 'specifiedRequirement') {
    return (
      <>
        Specified
        <br />
        Requirements
      </>
    )
  }
  return label
}

const SAMPLE_ROWS = [
  {
    srNo: '1',
    testName: 'Ultimate Tensile Strength',
    testMethod: 'IS 1608 : 2022',
    unit: 'N/mm²',
    specifiedRequirement: '≥ 545',
    observedValue: '562',
    uncertainty: '± 2.1',
    remark: 'Pass',
  },
  {
    srNo: '2',
    testName: 'Elongation',
    testMethod: 'IS 1608 : 2022',
    unit: '%',
    specifiedRequirement: '≥ 14.5',
    observedValue: '16.2',
    uncertainty: '± 0.4',
    remark: 'Pass',
  },
] as const

function cellValue(row: (typeof SAMPLE_ROWS)[number], key: PartCReportColumnKey): string {
  switch (key) {
    case 'srNo':
      return row.srNo
    case 'testName':
      return row.testName
    case 'unit':
      return row.unit
    case 'specifiedRequirement':
      return row.specifiedRequirement
    case 'observedValue':
      return row.observedValue
    case 'uncertainty':
      return row.uncertainty
    case 'remark':
      return row.remark
    default:
      return '—'
  }
}

export type PartCAfterChoice = 'part_d' | 'signature'

export function PartCPrintPreview({
  fontSizePt,
  scope,
  startsOnNewPage,
  onStartsOnNewPageChange,
  columns,
  onColumnsChange,
  showEndNotes,
  onShowEndNotesChange,
  showSectionRows,
  onShowSectionRowsChange,
  afterPartC,
  onAfterPartCChange,
  gapAfterCMm,
  disabled,
}: {
  fontSizePt: number
  scope: ReportScopeKind
  startsOnNewPage: boolean
  onStartsOnNewPageChange?: (startsOnNewPage: boolean) => void
  columns: PartCReportColumnVisibility
  onColumnsChange?: (columns: PartCReportColumnVisibility) => void
  showEndNotes: boolean
  onShowEndNotesChange?: (show: boolean) => void
  showSectionRows: boolean
  onShowSectionRowsChange?: (show: boolean) => void
  afterPartC: PartCAfterChoice
  onAfterPartCChange?: (afterPartC: PartCAfterChoice) => void
  gapAfterCMm?: number
  disabled?: boolean
}) {
  const isAccredited = scope === 'nabl'
  const scopeLabel = isAccredited ? 'Accredited' : 'Non Accredited'
  const visibleCols = visiblePartCReportColumns(columns)
  const visibleCount = visibleCols.length
  const colWidths = partCColumnWidthPercents(columns)

  return (
    <div className="space-y-2">
      <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-amber-800">
        Part C preview — {scopeLabel}
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
          Start Below Part B
        </Button>
      </div>

      {startsOnNewPage ? (
        <div className="flex items-center gap-2 py-1" aria-hidden>
          <span className="h-px flex-1 border-t border-dashed border-stone-400" />
          <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide text-stone-500">
            Page break — Part C starts on new page
          </span>
          <span className="h-px flex-1 border-t border-dashed border-stone-400" />
        </div>
      ) : (
        <div className="flex items-center gap-2 py-1" aria-hidden>
          <span className="h-px flex-1 border-t border-dashed border-stone-300" />
          <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide text-stone-400">
            Continues below Part B — no page break
          </span>
          <span className="h-px flex-1 border-t border-dashed border-stone-300" />
        </div>
      )}

      <div className="overflow-x-auto border border-stone-400 bg-white p-2 shadow-sm">
        <style>{`
          .part-c-preview-table {
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
          .part-c-preview-table th,
          .part-c-preview-table td {
            border: 1px solid #000;
            padding: 3px 6px;
            vertical-align: middle;
            text-align: center;
            word-break: normal;
            overflow-wrap: break-word;
          }
          .part-c-preview-table th {
            font-weight: 700;
            letter-spacing: 0.02em;
            padding: 5px 6px;
            text-transform: none;
            line-height: 1.2;
            white-space: normal;
          }
          .part-c-preview-table th.part-c-h-sr {
            line-height: 1.15;
            white-space: nowrap;
            width: 8mm;
            max-width: 10mm;
            padding-left: 2px;
            padding-right: 2px;
          }
          .part-c-preview-table td.part-c-sr {
            width: 8mm;
            max-width: 10mm;
            white-space: nowrap;
            padding-left: 2px;
            padding-right: 2px;
          }
          .part-c-preview-table th.part-c-title {
            text-align: left;
          }
          .part-c-preview-table td.part-c-name {
            text-align: left;
          }
          .part-c-preview-table .part-c-method {
            font-size: 9pt;
            font-weight: 400;
          }
        `}</style>
        <table className="part-c-preview-table">
          <colgroup>
            {visibleCols.map((col) => (
              <col key={col.key} style={{ width: colWidths[col.key] }} />
            ))}
          </colgroup>
          <thead>
            <tr>
              <th className="part-c-title" colSpan={Math.max(visibleCols.length, 1)}>
                Part C. Test Results
              </th>
            </tr>
            <tr>
              {visibleCols.map((col) => (
                <th
                  key={col.key}
                  className={col.key === 'srNo' ? 'part-c-h-sr' : undefined}
                >
                  {partCHeaderLabel(col.key, col.label)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {showSectionRows ? (
              <tr>
                <td colSpan={Math.max(visibleCols.length, 1)}>
                  Section Code — MECH
                </td>
              </tr>
            ) : null}
            {SAMPLE_ROWS.map((row) => (
              <tr key={row.srNo}>
                {visibleCols.map((col) => (
                  <td
                    key={col.key}
                    className={
                      col.key === 'testName'
                        ? 'part-c-name'
                        : col.key === 'srNo'
                          ? 'part-c-sr'
                          : undefined
                    }
                  >
                    {col.key === 'testName' ? (
                      <>
                        <div>{row.testName}</div>
                        <div className="part-c-method">{row.testMethod}</div>
                      </>
                    ) : (
                      cellValue(row, col.key)
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {showEndNotes ? (
          <p className="mt-2 text-[10px] font-semibold text-stone-600">
            *** End of Test Results ***
          </p>
        ) : null}
      </div>

      <div className="space-y-3 border-t border-stone-300 pt-3">
        <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-amber-800">
          Table columns — {scopeLabel}
        </p>
        <div className="flex flex-wrap gap-2">
          {PART_C_REPORT_COLUMN_DEFS.map((col) => {
            const checked = Boolean(columns[col.key])
            const isLastVisible = checked && visibleCount <= 1
            return (
              <Button
                key={col.key}
                type="button"
                variant="outline"
                size="sm"
                disabled={disabled || isLastVisible}
                aria-pressed={checked}
                title={
                  isLastVisible
                    ? 'At least one column must stay visible'
                    : checked
                      ? `Hide ${col.label}`
                      : `Show ${col.label}`
                }
                className={cn(
                  limsOutlineBtnClass,
                  'h-8 px-3 text-[11px] font-semibold uppercase tracking-wide',
                  checked
                    ? 'border-amber-600 bg-amber-50 text-amber-900 hover:bg-amber-100 hover:text-amber-950'
                    : 'border-stone-400 bg-white text-stone-600 hover:bg-stone-50',
                )}
                onClick={() => {
                  if (isLastVisible) return
                  onColumnsChange?.({ ...columns, [col.key]: !checked })
                }}
              >
                {col.label}
              </Button>
            )
          })}
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={disabled}
            aria-pressed={showEndNotes}
            className={cn(
              limsOutlineBtnClass,
              'h-8 px-3 text-[11px] font-semibold uppercase tracking-wide',
              showEndNotes
                ? 'border-amber-600 bg-amber-50 text-amber-900 hover:bg-amber-100 hover:text-amber-950'
                : 'border-stone-400 bg-white text-stone-600 hover:bg-stone-50',
            )}
            onClick={() => onShowEndNotesChange?.(!showEndNotes)}
          >
            Show Part C end notes
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={disabled}
            aria-pressed={showSectionRows}
            className={cn(
              limsOutlineBtnClass,
              'h-8 px-3 text-[11px] font-semibold uppercase tracking-wide',
              showSectionRows
                ? 'border-amber-600 bg-amber-50 text-amber-900 hover:bg-amber-100 hover:text-amber-950'
                : 'border-stone-400 bg-white text-stone-600 hover:bg-stone-50',
            )}
            onClick={() => onShowSectionRowsChange?.(!showSectionRows)}
          >
            Show Section Code rows
          </Button>
        </div>
      </div>

      <div
        className="flex items-center gap-2 py-2"
        style={gapAfterCMm != null ? { minHeight: `${Math.max(gapAfterCMm, 8)}px` } : undefined}
        aria-hidden
      >
        <span className="h-px flex-1 border-t border-dashed border-stone-400" />
        <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide text-stone-500">
          Gap{gapAfterCMm != null ? ` · ${gapAfterCMm} mm` : ''}
        </span>
        <span className="h-px flex-1 border-t border-dashed border-stone-400" />
      </div>

      <div className="flex flex-wrap items-center gap-2 py-1">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-stone-600">
          After Part C
        </span>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled}
          aria-pressed={afterPartC === 'part_d'}
          className={cn(
            limsOutlineBtnClass,
            afterPartC === 'part_d' &&
              'border-amber-600 bg-amber-50 text-amber-900 hover:bg-amber-100 hover:text-amber-950',
          )}
          onClick={() => onAfterPartCChange?.('part_d')}
        >
          Start Part D
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled}
          aria-pressed={afterPartC === 'signature'}
          className={cn(
            limsOutlineBtnClass,
            afterPartC === 'signature' &&
              'border-amber-600 bg-amber-50 text-amber-900 hover:bg-amber-100 hover:text-amber-950',
          )}
          onClick={() => onAfterPartCChange?.('signature')}
        >
          Apply Signature
        </Button>
      </div>

      {afterPartC === 'signature' ? (
        <div className="flex items-center gap-2 py-1" aria-hidden>
          <span className="h-px flex-1 border-t border-dashed border-amber-500/60" />
          <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide text-amber-800">
            Signature block after Part C
          </span>
          <span className="h-px flex-1 border-t border-dashed border-amber-500/60" />
        </div>
      ) : (
        <div className="flex items-center gap-2 py-1" aria-hidden>
          <span className="h-px flex-1 border-t border-dashed border-stone-300" />
          <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide text-stone-400">
            Continues to Part D
          </span>
          <span className="h-px flex-1 border-t border-dashed border-stone-300" />
        </div>
      )}
    </div>
  )
}
