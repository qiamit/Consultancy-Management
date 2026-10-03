import { Fragment, useState, type ReactNode } from 'react'
import { Pencil } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { RESULT_REMARK_OPTIONS } from './evaluateResultConformity'
import {
  groupReportRowsBySectionCode,
  sortReportResultRows,
  type ReportResultRow,
} from './reportResultRows'
import { normalizeResultRemark, resultRemarkCellClass } from './resultRemarkUi'
import {
  ReportSectionCodeEditDialog,
  type ReportSectionCodeEditTarget,
} from './ReportSectionCodeEditDialog'
import {
  ReportSpecifiedRequirementEditDialog,
  type ReportSpecifiedRequirementEditTarget,
} from './ReportSpecifiedRequirementEditDialog'

/** Classic report grid: Times New Roman + black borders (Part A/B style) */
const GRID_TABLE =
  'part-c-screen-table w-max min-w-full border-collapse font-[Times_New_Roman,Times,serif] text-[11pt] font-bold text-black [&_th]:border [&_td]:border [&_th]:border-black [&_td]:border-black [&_th]:font-bold [&_td]:font-bold [&_input]:font-[inherit] [&_button]:font-[inherit]'

const GRID_TITLE =
  'bg-white text-left text-[11pt] font-bold tracking-[0.02em] text-black border-black px-2 py-1.5 normal-case'

const GRID_HEAD =
  'bg-white text-[10pt] font-bold tracking-[0.02em] text-black border-black whitespace-nowrap px-2 py-1.5 normal-case'
const GRID_HEAD_ROW = 'bg-white hover:bg-white'
const GRID_CELL =
  'bg-white text-[11pt] font-bold text-black border-black px-2 py-1.5 align-middle text-center'
/** Shrink-wrap numeric / short columns to content */
const GRID_COL_FIT = 'w-0 whitespace-nowrap'
const GRID_SECTION_ROW = 'bg-white hover:bg-white'
const GRID_SECTION_CELL =
  'text-[11pt] text-black font-bold whitespace-pre-wrap px-2 py-1.5 align-middle border-black'

function columnCount(showScope: boolean): number {
  return showScope ? 8 : 7
}

function ResultDataRow({
  row,
  showScope,
  editable,
  onRemarkChange,
  disabled,
  specifiedRequirementEditable,
  onEditSpecifiedRequirement,
}: {
  row: ReportResultRow
  showScope: boolean
  editable?: boolean
  onRemarkChange?: (rowKey: string, remark: string) => void
  disabled?: boolean
  specifiedRequirementEditable?: boolean
  onEditSpecifiedRequirement?: (row: ReportResultRow) => void
}) {
  const remark = normalizeResultRemark(row.remark)

  return (
    <TableRow className="hover:bg-stone-50">
      <TableCell className={cn(GRID_CELL, GRID_COL_FIT, 'text-center')}>
        {row.srNo}
      </TableCell>
      <TableCell className={cn(GRID_CELL, 'w-[311px] max-w-[311px] !text-left')}>
        <div className="font-bold leading-snug text-left">{row.testName}</div>
        {row.testMethodClause && (
          <div className="mt-0.5 text-left text-[9pt] font-normal leading-snug text-black">
            {row.testMethodClause}
          </div>
        )}
      </TableCell>
      <TableCell className={cn(GRID_CELL, GRID_COL_FIT, 'text-center')}>{row.unit}</TableCell>
      <TableCell className={cn(GRID_CELL, 'w-[234px] min-w-[234px] max-w-[234px] text-center')}>
        <div className="inline-flex w-full items-center justify-center gap-1">
          <span className="min-w-0 flex-1 whitespace-pre-wrap break-words text-center font-bold">
            {row.specifiedRequirement}
          </span>
          {specifiedRequirementEditable &&
            onEditSpecifiedRequirement &&
            row.parameterId?.trim() &&
            !disabled && (
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="h-7 w-7 shrink-0"
                aria-label="Edit specified requirement"
                onClick={(e) => {
                  e.stopPropagation()
                  onEditSpecifiedRequirement(row)
                }}
              >
                <Pencil size={14} />
              </Button>
            )}
        </div>
      </TableCell>
      <TableCell className={cn(GRID_CELL, GRID_COL_FIT, 'text-center')}>
        {row.observedValue}
      </TableCell>
      <TableCell className={cn(GRID_CELL, GRID_COL_FIT, 'text-center')}>
        {row.uncertainty}
      </TableCell>
      <TableCell
        className={cn(
          GRID_CELL,
          GRID_COL_FIT,
          'text-center',
          !editable && resultRemarkCellClass(remark),
        )}
      >
        {editable && onRemarkChange ? (
          <Select
            value={remark}
            onValueChange={(value) => onRemarkChange(row.rowKey, value)}
            disabled={disabled}
          >
            <SelectTrigger
              className={cn(
                'h-8 min-w-[7rem] border-input/80 font-[Times_New_Roman,Times,serif] text-[11pt] font-bold',
                resultRemarkCellClass(remark),
              )}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {RESULT_REMARK_OPTIONS.map((option) => (
                <SelectItem
                  key={option}
                  value={option}
                  className="font-[Times_New_Roman,Times,serif] text-[11pt] font-bold"
                >
                  {option}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          remark
        )}
      </TableCell>
      {showScope && (
        <TableCell className={cn(GRID_CELL, GRID_COL_FIT, 'text-center')}>{row.scope}</TableCell>
      )}
    </TableRow>
  )
}

function ResultsTableHeader({
  showScope,
  partTitle,
  colSpan,
}: {
  showScope: boolean
  partTitle?: string
  colSpan: number
}) {
  return (
    <TableHeader>
      {partTitle ? (
        <TableRow className="hover:bg-white">
          <TableHead colSpan={colSpan} className={GRID_TITLE}>
            {partTitle}
          </TableHead>
        </TableRow>
      ) : null}
      <TableRow className={GRID_HEAD_ROW}>
        <TableHead className={cn(GRID_HEAD, GRID_COL_FIT, 'text-center align-middle leading-tight')}>
          Sr
          <br />
          No
        </TableHead>
        <TableHead className={cn(GRID_HEAD, 'w-[311px] max-w-[311px] text-left')}>Test Name</TableHead>
        <TableHead className={cn(GRID_HEAD, GRID_COL_FIT, 'text-center')}>Unit</TableHead>
        <TableHead
          className={cn(
            GRID_HEAD,
            'w-[234px] min-w-[234px] max-w-[234px] whitespace-nowrap text-center',
          )}
        >
          Specified Requirements
        </TableHead>
        <TableHead className={cn(GRID_HEAD, GRID_COL_FIT, 'text-center')}>Observed Value</TableHead>
        <TableHead className={cn(GRID_HEAD, GRID_COL_FIT, 'text-center')}>Uncertainty</TableHead>
        <TableHead className={cn(GRID_HEAD, GRID_COL_FIT, 'text-center')}>Remark</TableHead>
        {showScope && (
          <TableHead className={cn(GRID_HEAD, GRID_COL_FIT, 'text-center')}>Scope</TableHead>
        )}
      </TableRow>
    </TableHeader>
  )
}

function ResultsTableShell({
  embedded,
  children,
}: {
  embedded: boolean
  children: ReactNode
}) {
  const wrapClass = embedded
    ? 'overflow-x-auto'
    : 'overflow-x-auto border-2 border-stone-500 bg-white shadow-sm ring-1 ring-amber-700/15'

  return (
    <div className={wrapClass}>
      <Table className={GRID_TABLE}>{children}</Table>
    </div>
  )
}

function ResultsGroupedBody({
  sections,
  colSpan,
  showScope,
  editable,
  onRemarkChange,
  disabled,
  sectionCodeEditable,
  onEditSectionCode,
  specifiedRequirementEditable,
  onEditSpecifiedRequirement,
}: {
  sections: ReturnType<typeof groupReportRowsBySectionCode>
  colSpan: number
  showScope: boolean
  editable?: boolean
  onRemarkChange?: (rowKey: string, remark: string) => void
  disabled?: boolean
  sectionCodeEditable?: boolean
  onEditSectionCode?: (target: ReportSectionCodeEditTarget) => void
  specifiedRequirementEditable?: boolean
  onEditSpecifiedRequirement?: (row: ReportResultRow) => void
}) {
  if (sections.length === 0) {
    return (
      <TableBody>
        <TableRow>
          <TableCell
            colSpan={colSpan}
            className={cn(GRID_CELL, 'text-sm text-muted-foreground py-4 text-center')}
          >
            No completed test parameter results.
          </TableCell>
        </TableRow>
      </TableBody>
    )
  }

  return (
    <TableBody className="[&_tr:last-child]:border-b">
      {sections.map((section) => (
        <Fragment key={section.testAllocationId || section.sectionCode}>
          <TableRow className={GRID_SECTION_ROW}>
            <TableCell colSpan={colSpan} className={GRID_SECTION_CELL}>
              <div className="flex items-center justify-between gap-3">
                <span>Section Code - {section.sectionCode}</span>
                {sectionCodeEditable &&
                  onEditSectionCode &&
                  section.sampleAllocationId &&
                  section.testAllocationId && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-7 shrink-0 gap-1.5 rounded-none border-black bg-white text-xs font-bold text-black hover:bg-stone-50"
                      onClick={() =>
                        onEditSectionCode({
                          sectionCode: section.sectionCode,
                          sampleAllocationId: section.sampleAllocationId,
                          testAllocationId: section.testAllocationId,
                        })
                      }
                      disabled={disabled}
                    >
                      <Pencil className="size-3.5" aria-hidden />
                      Edit
                    </Button>
                  )}
              </div>
            </TableCell>
          </TableRow>
          {section.rows.map((row) => (
            <ResultDataRow
              key={row.rowKey}
              row={row}
              showScope={showScope}
              editable={editable}
              onRemarkChange={onRemarkChange}
              disabled={disabled}
              specifiedRequirementEditable={specifiedRequirementEditable}
              onEditSpecifiedRequirement={onEditSpecifiedRequirement}
            />
          ))}
        </Fragment>
      ))}
    </TableBody>
  )
}

export function ReportResultsTable({
  rows,
  showScope = true,
  embedded = false,
  groupBySectionCode = false,
  editable = false,
  onRemarkChange,
  disabled,
  sampleId = null,
  sectionCodeEditable = false,
  onSectionCodeUpdated,
  specifiedRequirementEditable = false,
  onSpecifiedRequirementUpdated,
  partTitle,
}: {
  rows: ReportResultRow[]
  showScope?: boolean
  embedded?: boolean
  groupBySectionCode?: boolean
  editable?: boolean
  onRemarkChange?: (rowKey: string, remark: string) => void
  disabled?: boolean
  sampleId?: string | null
  sectionCodeEditable?: boolean
  onSectionCodeUpdated?: (oldCode: string, newCode: string) => void
  specifiedRequirementEditable?: boolean
  onSpecifiedRequirementUpdated?: (rowKey: string, nextValue: string) => void
  /** When set, first thead row shows this title (e.g. PART C. TEST RESULTS). */
  partTitle?: string
}) {
  const colSpan = columnCount(showScope)
  const sections = groupBySectionCode ? groupReportRowsBySectionCode(rows) : null
  const flatRows = groupBySectionCode ? null : sortReportResultRows(rows)
  const [sectionEditTarget, setSectionEditTarget] = useState<ReportSectionCodeEditTarget | null>(null)
  const [sectionEditOpen, setSectionEditOpen] = useState(false)
  const [specEditTarget, setSpecEditTarget] = useState<ReportSpecifiedRequirementEditTarget | null>(null)
  const [specEditOpen, setSpecEditOpen] = useState(false)

  const openSectionCodeEdit = (target: ReportSectionCodeEditTarget) => {
    setSectionEditTarget(target)
    setSectionEditOpen(true)
  }

  const openSpecifiedRequirementEdit = (row: ReportResultRow) => {
    setSpecEditTarget({
      parameterId: row.parameterId,
      sectionCode: row.sectionCode,
      testName: row.testName,
      value: row.specifiedRequirement,
    })
    setSpecEditOpen(true)
  }

  const tableShell = (children: ReactNode) => (
    <>
      <ResultsTableShell embedded={embedded}>{children}</ResultsTableShell>
      {sectionCodeEditable && sampleId && onSectionCodeUpdated && (
        <ReportSectionCodeEditDialog
          open={sectionEditOpen}
          onOpenChange={setSectionEditOpen}
          sampleId={sampleId}
          target={sectionEditTarget}
          onSaved={onSectionCodeUpdated}
        />
      )}
      {specifiedRequirementEditable && onSpecifiedRequirementUpdated && (
        <ReportSpecifiedRequirementEditDialog
          open={specEditOpen}
          onOpenChange={setSpecEditOpen}
          target={specEditTarget}
          onSaved={(nextValue) => {
            if (!specEditTarget) return
            const rowKey = rows.find((r) => r.parameterId === specEditTarget.parameterId)?.rowKey
            if (rowKey) onSpecifiedRequirementUpdated(rowKey, nextValue)
          }}
        />
      )}
    </>
  )

  if (rows.length === 0 && !embedded) {
    return <p className="text-sm text-muted-foreground py-4 px-3">No completed test parameter results.</p>
  }

  if (sections) {
    return tableShell(
      <>
        <ResultsTableHeader showScope={showScope} partTitle={partTitle} colSpan={colSpan} />
        <ResultsGroupedBody
          sections={sections}
          colSpan={colSpan}
          showScope={showScope}
          editable={editable}
          onRemarkChange={onRemarkChange}
          disabled={disabled}
          sectionCodeEditable={sectionCodeEditable && Boolean(sampleId && onSectionCodeUpdated)}
          onEditSectionCode={openSectionCodeEdit}
          specifiedRequirementEditable={specifiedRequirementEditable}
          onEditSpecifiedRequirement={openSpecifiedRequirementEdit}
        />
      </>,
    )
  }

  return tableShell(
    <>
      <ResultsTableHeader showScope={showScope} partTitle={partTitle} colSpan={colSpan} />
      <TableBody>
        {flatRows!.length === 0 ? (
          <TableRow>
            <TableCell colSpan={colSpan} className="text-sm text-muted-foreground py-4 text-center">
              No completed test parameter results.
            </TableCell>
          </TableRow>
        ) : (
          flatRows!.map((row) => (
            <ResultDataRow
              key={row.rowKey}
              row={row}
              showScope={showScope}
              editable={editable}
              onRemarkChange={onRemarkChange}
              disabled={disabled}
              specifiedRequirementEditable={specifiedRequirementEditable}
              onEditSpecifiedRequirement={openSpecifiedRequirementEdit}
            />
          ))
        )}
      </TableBody>
    </>,
  )
}
