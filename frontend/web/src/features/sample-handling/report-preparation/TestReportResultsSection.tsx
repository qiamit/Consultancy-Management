import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { REPORT_SCOPE_TITLE, type ReportScopeKind } from './reportScope'
import { filterReportRowsByScope, type ReportResultRow } from './reportResultRows'
import { ReportResultsTable } from './ReportResultsTable'
import { formatTestReportEndNotesText, TEST_REPORT_END_MARKER } from './testReportEndNotes'

function TestReportEndNotesBlock() {
  return (
    <div
      className="mt-0 border border-t-0 border-black bg-white px-3 py-3 font-[Times_New_Roman,Times,serif] text-[10pt] font-bold leading-relaxed text-black"
      role="note"
      aria-label="End of report notes"
    >
      <p className="mb-2 text-center font-bold tracking-wide">{TEST_REPORT_END_MARKER}</p>
      <p className="text-justify font-bold">{formatTestReportEndNotesText()}</p>
    </div>
  )
}

export function TestReportResultsSection({
  resultsLoading,
  applicableScopes,
  activeScope,
  onActiveScopeChange,
  resultRows,
  onRemarkChange,
  disabled,
  sampleId = null,
  sectionCodeEditable = false,
  onSectionCodeUpdated,
  specifiedRequirementEditable = false,
  onSpecifiedRequirementUpdated,
}: {
  resultsLoading: boolean
  applicableScopes: ReportScopeKind[]
  activeScope: ReportScopeKind
  onActiveScopeChange: (scope: ReportScopeKind) => void
  resultRows: ReportResultRow[]
  onRemarkChange?: (rowKey: string, remark: string) => void
  disabled?: boolean
  sampleId?: string | null
  sectionCodeEditable?: boolean
  onSectionCodeUpdated?: (oldCode: string, newCode: string) => void
  specifiedRequirementEditable?: boolean
  onSpecifiedRequirementUpdated?: (rowKey: string, nextValue: string) => void
}) {
  return (
    <div className="overflow-hidden border-2 border-stone-500 bg-white p-2 shadow-sm ring-1 ring-amber-700/15 sm:p-3">
      {resultsLoading ? (
        <p className="py-2 text-sm text-stone-600">Loading test results…</p>
      ) : applicableScopes.length === 0 ? (
        <p className="py-2 text-sm text-stone-600">No completed test results for this SRF.</p>
      ) : (
        <Tabs
          value={activeScope}
          onValueChange={(v) => onActiveScopeChange(v as ReportScopeKind)}
          className="w-full"
        >
          <TabsList className="mb-3 grid h-auto w-full grid-cols-2 gap-0 border border-black bg-white p-0">
            {applicableScopes.map((scope) => (
              <TabsTrigger
                key={scope}
                value={scope}
                className="rounded-none border-r border-black text-xs font-bold uppercase tracking-wide text-black last:border-r-0 sm:text-sm data-[state=active]:bg-stone-900 data-[state=active]:text-white data-[state=active]:shadow-none"
              >
                {REPORT_SCOPE_TITLE[scope]}
              </TabsTrigger>
            ))}
          </TabsList>
          {applicableScopes.map((scope) => {
            const scopedRows = filterReportRowsByScope(resultRows, scope)
            return (
              <TabsContent
                key={scope}
                value={scope}
                className="mt-0 space-y-3 focus-visible:outline-none"
              >
                <div className="overflow-hidden border border-black bg-white">
                  <ReportResultsTable
                    rows={scopedRows}
                    showScope={false}
                    embedded
                    groupBySectionCode
                    editable
                    partTitle="Part C. Test Results"
                    onRemarkChange={onRemarkChange}
                    disabled={disabled}
                    sampleId={sampleId}
                    sectionCodeEditable={sectionCodeEditable}
                    onSectionCodeUpdated={onSectionCodeUpdated}
                    specifiedRequirementEditable={specifiedRequirementEditable}
                    onSpecifiedRequirementUpdated={onSpecifiedRequirementUpdated}
                  />
                  {scopedRows.length > 0 && <TestReportEndNotesBlock />}
                </div>
              </TabsContent>
            )
          })}
        </Tabs>
      )}
    </div>
  )
}
