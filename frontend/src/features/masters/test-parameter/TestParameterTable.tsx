import { useState } from 'react'
import { ArrowDown, ArrowUp, ArrowUpDown, Calculator, Eye, Pencil } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { QiAssistant } from '@/components/qi-assistant/QiAssistant'
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from '@/components/ui/table'
import {
  buildTestParameterAssistantContext,
  formatTestParameterLabel,
} from './buildTestParameterAssistantContext'
import type { AccreditationBodyRow, TestParameterRow } from './types'

const REQUIREMENT_PREVIEW_MAX = 30

const thClass =
  'bg-stone-800 text-[11px] font-bold uppercase tracking-[0.14em] text-amber-200 py-2 px-2 text-center align-middle whitespace-normal break-words leading-snug'
const tdClass = 'px-2 py-2.5 text-center align-middle whitespace-normal break-words text-sm'

export type TestParameterSortKey =
  | 'isCode'
  | 'itemName'
  | 'testMethod'
  | 'requirement'
  | 'uncertainty'
  | 'accreditation'

export type TestParameterSortDir = 'asc' | 'desc'

function formatAccreditation(
  r: TestParameterRow,
  accreditationBodies: AccreditationBodyRow[],
): string {
  if (!r.under_accreditation_ids?.length || !accreditationBodies.length) return '—'
  return (
    r.under_accreditation_ids
      .map((id) => accreditationBodies.find((b) => b.id === id)?.name)
      .filter(Boolean)
      .join(', ') || '—'
  )
}

function SortableHeader({
  label,
  columnKey,
  sortKey,
  sortDir,
  onSort,
  className,
}: {
  label: string
  columnKey: TestParameterSortKey
  sortKey: TestParameterSortKey
  sortDir: TestParameterSortDir
  onSort: (key: TestParameterSortKey) => void
  className?: string
}) {
  const active = sortKey === columnKey
  const Icon = active ? (sortDir === 'asc' ? ArrowUp : ArrowDown) : ArrowUpDown

  return (
    <TableHead className={className}>
      <button
        type="button"
        className="inline-flex w-full items-center justify-center gap-1 hover:text-amber-100 transition-colors text-amber-200"
        onClick={() => onSort(columnKey)}
        aria-label={`Sort by ${label}${active ? `, ${sortDir === 'asc' ? 'ascending' : 'descending'}` : ''}`}
      >
        <span>{label}</span>
        <Icon className={`h-3.5 w-3.5 shrink-0 ${active ? 'text-amber-300' : 'text-amber-200/60'}`} />
      </button>
    </TableHead>
  )
}

export function TestParameterTable({
  rows,
  loading,
  error,
  selectedIds,
  onToggle,
  onToggleAll,
  onEdit,
  onOpenUncertainty,
  accreditationBodies = [],
  onAssistantDataChanged,
  sortKey,
  sortDir,
  onSort,
}: {
  rows: TestParameterRow[]
  loading: boolean
  error: string | null
  selectedIds: Set<string>
  onToggle: (id: string) => void
  onToggleAll: (checked: boolean) => void
  onEdit: (row: TestParameterRow) => void
  onOpenUncertainty: (row: TestParameterRow) => void
  accreditationBodies?: AccreditationBodyRow[]
  onAssistantDataChanged?: () => void
  sortKey: TestParameterSortKey
  sortDir: TestParameterSortDir
  onSort: (key: TestParameterSortKey) => void
}) {
  const allChecked = rows.length > 0 && rows.every((r) => selectedIds.has(r.id))
  const someChecked = rows.some((r) => selectedIds.has(r.id))
  const [requirementPreview, setRequirementPreview] = useState<{ title: string; text: string } | null>(
    null,
  )

  const renderRequirement = (requirement: string | null | undefined, rowTitle: string) => {
    const text = requirement?.trim() || '—'
    if (text === '—' || text.length <= REQUIREMENT_PREVIEW_MAX) {
      return <div className="whitespace-pre-wrap break-words">{text}</div>
    }
    return (
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="h-8 gap-1.5 px-2.5"
        aria-label={`View requirement for ${rowTitle}`}
        onClick={() => setRequirementPreview({ title: rowTitle, text })}
      >
        <Eye size={14} />
        View
      </Button>
    )
  }

  return (
    <div className="overflow-hidden rounded-none border-2 border-stone-500 bg-white shadow-sm ring-1 ring-amber-700/20 overflow-hidden">
      {error && <p className="px-4 pt-4 text-sm text-destructive">{error}</p>}
      {loading ? (
        <p className="px-4 py-6 text-sm text-muted-foreground">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="px-4 py-6 text-sm text-muted-foreground">No test parameters added yet.</p>
      ) : (
        <Table className="table-fixed w-full">
          <TableHeader>
            <TableRow className="bg-stone-800 hover:bg-stone-800 border-t border-stone-700">
              <TableHead className={`${thClass} w-[3%]`}>
                <input
                  type="checkbox"
                  aria-label="Select all"
                  checked={allChecked}
                  ref={(el) => {
                    if (el) el.indeterminate = !allChecked && someChecked
                  }}
                  onChange={(e) => onToggleAll(e.target.checked)}
                />
              </TableHead>
              <SortableHeader
                label="IS Code"
                columnKey="isCode"
                sortKey={sortKey}
                sortDir={sortDir}
                onSort={onSort}
                className={`${thClass} w-[11%]`}
              />
              <SortableHeader
                label="Test Parameter"
                columnKey="itemName"
                sortKey={sortKey}
                sortDir={sortDir}
                onSort={onSort}
                className={`${thClass} w-[14%]`}
              />
              <SortableHeader
                label="Test Method"
                columnKey="testMethod"
                sortKey={sortKey}
                sortDir={sortDir}
                onSort={onSort}
                className={`${thClass} w-[13%]`}
              />
              <SortableHeader
                label="Requirements"
                columnKey="requirement"
                sortKey={sortKey}
                sortDir={sortDir}
                onSort={onSort}
                className={`${thClass} w-[20%]`}
              />
              <SortableHeader
                label="Uncertainty (MU)"
                columnKey="uncertainty"
                sortKey={sortKey}
                sortDir={sortDir}
                onSort={onSort}
                className={`${thClass} w-[13%]`}
              />
              <SortableHeader
                label="Accreditation"
                columnKey="accreditation"
                sortKey={sortKey}
                sortDir={sortDir}
                onSort={onSort}
                className={`${thClass} w-[11%]`}
              />
              <TableHead className={`${thClass} w-[15%]`}>Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.id}>
                <TableCell className={tdClass}>
                  <input
                    type="checkbox"
                    aria-label={`Select ${r.item_name}`}
                    checked={selectedIds.has(r.id)}
                    onChange={() => onToggle(r.id)}
                  />
                </TableCell>
                <TableCell className={tdClass}>
                  <div className="font-medium">{r.is_code_label || '—'}</div>
                </TableCell>
                <TableCell className={tdClass}>
                  <div className="font-medium text-foreground/90">{r.item_name || '—'}</div>
                </TableCell>
                <TableCell className={tdClass}>
                  <div className="flex flex-col items-center justify-center gap-1">
                    <div>{r.test_method || '—'}</div>
                    {r.clause_no || r.unit_value ? (
                      <div className="inline-flex items-center justify-center gap-1 flex-wrap">
                        {r.clause_no ? (
                          <span className="inline-flex items-center rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-600">
                            Cl: {r.clause_no}
                          </span>
                        ) : null}
                        {r.unit_value ? (
                          <span className="inline-flex items-center rounded bg-blue-50 px-1.5 py-0.5 text-[10px] font-medium text-blue-600">
                            Unit: {r.unit_value}
                          </span>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                </TableCell>
                <TableCell className={tdClass}>{renderRequirement(r.specific_requirement, r.item_name)}</TableCell>
                <TableCell className={tdClass}>
                  <div className="flex flex-col items-center justify-center gap-1.5">
                    {r.uncertainty_mu ? (
                      <button
                        type="button"
                        className="inline-flex items-center rounded bg-amber-50 px-1.5 py-0.5 text-xs font-medium text-amber-700 break-words hover:bg-amber-100 cursor-pointer transition-colors"
                        aria-label={`Edit uncertainty for ${r.item_name}`}
                        title="Edit uncertainty"
                        onClick={() => onOpenUncertainty(r)}
                      >
                        {r.uncertainty_mu}
                      </button>
                    ) : (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-8 gap-1.5 px-2.5"
                        aria-label={`Calculate uncertainty for ${r.item_name}`}
                        title="Open uncertainty calculation"
                        onClick={() => onOpenUncertainty(r)}
                      >
                        <Calculator size={14} />
                        Calculate
                      </Button>
                    )}
                  </div>
                </TableCell>
                <TableCell className={`${tdClass} text-xs`}>
                  {formatAccreditation(r, accreditationBodies)}
                </TableCell>
                <TableCell className={tdClass}>
                  <div className="flex flex-wrap items-center justify-center gap-1.5">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-8 w-8 p-0"
                      onClick={() => onEdit(r)}
                      aria-label="Edit"
                    >
                      <Pencil size={14} />
                    </Button>
                    <QiAssistant
                      page="test-parameter"
                      pageTitle={formatTestParameterLabel(r)}
                      contextSummary={buildTestParameterAssistantContext(r)}
                      activeRecordId={r.id}
                      activeRecordTable="test_parameters"
                      isCodeId={r.is_code_id ?? undefined}
                      triggerVariant="icon"
                      welcomeMessage={`I'm your **Test Parameter Assistant** for **${formatTestParameterLabel(r)}** (id: \`${r.id}\`). I can explain requirements${r.is_code_id ? ' using linked IS PDFs' : ''} and **update this test parameter** when you ask.`}
                      suggestedQuestions={[
                        'Explain this test parameter and its requirement',
                        'What clause in the IS standard applies here?',
                        'Update the specific requirement for this parameter',
                        'Change the test method for this row',
                      ]}
                      onDataChanged={onAssistantDataChanged}
                      enablePdfImport={false}
                    />
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <Dialog
        open={Boolean(requirementPreview)}
        onOpenChange={(open) => {
          if (!open) setRequirementPreview(null)
        }}
      >
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Specified Requirement</DialogTitle>
          </DialogHeader>
          {requirementPreview ? (
            <div className="space-y-2 text-sm">
              <p className="text-muted-foreground">{requirementPreview.title}</p>
              <p className="whitespace-pre-wrap break-words">{requirementPreview.text}</p>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  )
}
