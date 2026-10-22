import { useState, type ReactNode } from 'react'
import { toast } from 'sonner'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import type { BisPrintDocumentKind } from '../print/printBisDocument'
import { fetchBisModulePayload, saveBisModulePayload } from './bisModuleDataApi'
import { EditableRows } from './ManakManagementStep'
import { ManakComponentsTable, type StepComponent, type YesNo } from './ManakComponentsTable'
import { LONG_DURATION_TESTS_KIND, TEST_REPORT_COMPONENTS_KIND } from './manakModuleKinds'
import { fileColumn } from './rowFileColumn'
import { searchLaboratoryMasterOptions } from '@/features/masters/laboratories/laboratoriesApi'
import { formatDisplayDate, isCodeDisplayLabel, isFmcsProject, type BisProjectRow } from './types'
import { ScrollText } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { printableOslSampleRows } from '../print/oslSampleRequirementsHtml'
import { parseOslSampleRequirementsPayload } from './oslSampleRequirementsModel'
import { factoryTestReportHasContent, parseFactoryTestReportPayload } from './factoryTestReportModel'
import { FactoryTestReportGenerateDialog } from './FactoryTestReportGenerateDialog'
import { ManakWarnings } from './ManakStepPages'

type Rec = Record<string, unknown>
type Payload = Rec | null | undefined

const rowsOf = (p: Payload, key = 'rows'): Rec[] => (Array.isArray(p?.[key]) ? (p?.[key] as Rec[]) : [])

/** Long duration tests: the relaxation choice above the table of tests in progress. */
function LongDurationTests({
  projectId,
  payload,
  onChanged,
}: {
  projectId: string
  payload: Payload
  onChanged: () => void
}) {
  const [pending, setPending] = useState<YesNo | null>(null)
  const relaxation: YesNo = pending ?? (payload?.relaxation === 'No' ? 'No' : 'Yes')
  const setRelaxation = async (value: YesNo) => {
    setPending(value)
    try {
      const current = (await fetchBisModulePayload(projectId, LONG_DURATION_TESTS_KIND)) ?? {}
      await saveBisModulePayload(projectId, LONG_DURATION_TESTS_KIND, { ...current, relaxation: value })
      onChanged()
    } catch (err) {
      setPending(null)
      toast.error(err instanceof Error ? err.message : 'Could not save')
    }
  }
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3 border border-[#e7e0d4] bg-[#f7f3eb] px-3 py-2">
        <span className="max-w-3xl text-sm font-bold text-stone-800">
          If the firm hasn&apos;t uploaded the Long Duration Test Report and is opting for relaxation as per Guidelines for Grant of Licence
          <span className="text-red-600">*</span>
        </span>
        <Select value={relaxation} onValueChange={(v) => void setRelaxation(v as YesNo)}>
          <SelectTrigger className="h-8 w-28 rounded-none border-stone-400 bg-white text-sm" aria-label="Opting for Relaxation">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="Yes">Yes</SelectItem>
            <SelectItem value="No">No</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <EditableRows
        projectId={projectId}
        kind={LONG_DURATION_TESTS_KIND}
        fields={[
          { key: 'clauseNo', label: 'Clause No. of IS', width: '8rem', placeholder: 'Clause' },
          { key: 'testName', label: 'Long Duration Test Specified', alignLeft: true, placeholder: 'Test Name' },
          {
            key: 'labName',
            label: 'Name of Lab where Test in Progress',
            alignLeft: true,
            lookup: { search: searchLaboratoryMasterOptions, idKey: 'labId', placeholder: 'Search Laboratory Master' },
          },
          { key: 'duration', label: 'Duration of Test', optional: true, width: '8rem', placeholder: 'e.g. 1000 Hours' },
          { key: 'expectedDate', label: 'Date Test Report Likely to be Available', type: 'date', optional: true, width: '10rem' },
        ]}
        extraColumns={[
          fileColumn({ projectId, kind: LONG_DURATION_TESTS_KIND, key: 'inHouseReport', label: 'In House / Old Test Report', docKind: 'long-duration-inhouse-report', onChanged }),
          fileColumn({ projectId, kind: LONG_DURATION_TESTS_KIND, key: 'labReport', label: 'Test Report from Lab', docKind: 'long-duration-lab-report', onChanged }),
        ]}
        blank={() => ({ clauseNo: '', testName: '', labName: '', labId: '', duration: '', expectedDate: '', inHouseReport: null, labReport: null })}
        saved={rowsOf(payload)}
        onChanged={onChanged}
        addLabel="Add long duration test"
      />
    </div>
  )
}

/** Samples ticked "In Offer Letter", each with its Factory Test Report status and Generate Report. */
function FactoryTestReportsList({
  samplesPayload,
  reportsPayload,
  onGenerate,
}: {
  samplesPayload: Payload
  reportsPayload: Payload
  onGenerate: (sampleRowId: string) => void
}) {
  const samples = printableOslSampleRows(parseOslSampleRequirementsPayload(samplesPayload ?? null).rows)
  const reports = parseFactoryTestReportPayload(reportsPayload ?? null).reports
  const generated = (id: string) => reports.some((r) => r.sampleRowId === id && factoryTestReportHasContent(r))
  const th = 'border border-stone-700 bg-stone-800 px-2 py-1.5 text-left text-[11px] font-bold uppercase tracking-[0.1em] text-amber-200'
  const td = 'border border-[#e7e0d4] px-2 py-1.5 align-middle text-stone-700'
  return (
    <div className="overflow-x-auto">
      <table className="row-cards w-full border-collapse text-sm">
        <thead>
          <tr>
            <th className={cn(th, 'w-12 text-center')}>S.No.</th>
            <th className={cn(th, 'text-center')}>Grade / Type / Variety</th>
            <th className={cn(th, 'text-center')}>Declared Value</th>
            <th className={cn(th, 'w-[1%] text-center')}>
              Batch
              <br />
              Number
            </th>
            <th className={cn(th, 'w-[1%] text-center')}>
              Date of
              <br />
              Manufacturing
            </th>
            <th className={cn(th, 'w-[1%] text-center')}>Action</th>
          </tr>
        </thead>
        <tbody>
          {samples.length === 0 ? (
            <tr>
              <td colSpan={6} className={cn(td, 'py-3 text-center text-stone-500')}>
                No sample is ticked &ldquo;In Offer Letter&rdquo; in the Sample Offer Letter.
              </td>
            </tr>
          ) : (
            samples.map((sample, i) => {
              const done = generated(sample.id)
              return (
                <tr key={sample.id} className={i % 2 ? 'bg-[#f7f3eb]' : 'bg-[#fffcf7]'}>
                  <td className={cn(td, 'text-center')}>{i + 1}</td>
                  <td data-label="Grade / Type / Variety" className={cn(td, 'text-center')}>{sample.gradeTypeVariety.trim() || sample.sampleDescription.trim() || '—'}</td>
                  <td data-label="Declared Value" className={cn(td, 'text-center')}>{sample.declaredValue.trim() || '—'}</td>
                  <td data-label="Batch Number" className={cn(td, 'whitespace-nowrap text-center')}>{sample.batchNumber.trim() || '—'}</td>
                  <td data-label="Date of Manufacturing" className={cn(td, 'whitespace-nowrap text-center')}>{sample.dateOfManufacturing.trim() ? formatDisplayDate(sample.dateOfManufacturing) : '—'}</td>
                  <td className={cn(td, 'text-center')}>
                    {/* One button: opens the report to generate, edit, save, print or download. */}
                    <Button
                      type="button"
                      size="sm"
                      className="h-8 w-8 rounded-none bg-amber-700 p-0 text-white hover:bg-amber-800"
                      title={done ? 'Edit Test Report' : 'Generate Test Report'}
                      aria-label={done ? 'Edit Test Report' : 'Generate Test Report'}
                      onClick={() => onGenerate(sample.id)}
                    >
                      <ScrollText className="h-4 w-4" aria-hidden />
                    </Button>
                  </td>
                </tr>
              )
            })
          )}
        </tbody>
      </table>
    </div>
  )
}

/** Step 6 — Test Reports: Sample Offer Letter, Factory Test Report, then the other testing documents. */
export function ManakTestReportsStep({
  projectRow,
  payloads,
  onChanged,
  onEdit,
  renderDocActions,
  selection,
}: {
  projectRow: BisProjectRow
  payloads: Partial<Record<BisPrintDocumentKind, Payload>>
  onChanged: () => void
  onEdit: (kind: BisPrintDocumentKind) => void
  renderDocActions?: (kind: BisPrintDocumentKind, onModuleEdit: () => void) => ReactNode
  selection?: { has: (kind: BisPrintDocumentKind) => boolean; set: (kind: BisPrintDocumentKind, selected: boolean) => void }
}) {
  const projectId = projectRow.id
  const samples = parseOslSampleRequirementsPayload(payloads['osl-sample-requirements'] ?? null).rows
  // Generate Test Report lives here (Sample Offer Letter only uploads a finished report).
  const [generateSampleId, setGenerateSampleId] = useState<string | null>(null)
  const generateSample = generateSampleId ? samples.find((r) => r.id === generateSampleId) ?? null : null
  // Manak's Test Report step gets one row per sample with a QR code, and asks whether that sample conforms.
  const noConformity = samples.filter((r) => r.qrCode.trim() && !r.conformity)
  const warnings = [
    noConformity.length > 0 &&
      `${noConformity.length} sample${noConformity.length === 1 ? '' : 's'} with a QR code (${noConformity.map((r) => r.qrCode.trim()).join(', ')}) ${noConformity.length === 1 ? 'has' : 'have'} no "Conformity of sample as per IS". Set it from the lab report in Sample Offer Letter & Test Request.`,
  ]
  // FMCS applies under Option 1: BIS draws the samples at the factory visit, Manak asks for the in-house test report
  // (Form IV) and, when the IS needs it, the raw-material test certificates.
  const fmcs = isFmcsProject(projectRow)
  const components: StepComponent[] = [
    {
      key: 'sample-offer',
      label: 'Sample Offer Letter & Test Request',
      printKind: 'osl-offer-and-test-request',
      editKind: 'osl-sample-requirements',
      defaultApplicable: fmcs ? 'No' : 'Yes',
    },
    {
      key: 'factory-test-report',
      label: fmcs ? 'In-House Test Report (Form IV)' : 'Factory Test Report',
      printKind: 'factory-test-report',
      defaultApplicable: 'Yes',
      // Same generator as Sample Offer Letter → Test Report → Generate Report.
      popup: () => (
        <FactoryTestReportsList
          samplesPayload={payloads['osl-sample-requirements']}
          reportsPayload={payloads['factory-test-report']}
          onGenerate={(sampleRowId) => setGenerateSampleId(sampleRowId)}
        />
      ),
    },
    {
      key: 'long-duration',
      label: 'Long Duration Tests',
      // Preview / PDF / Word give the Undertaking for long duration test (Guidelines for GOL – Annex III).
      printKind: 'undertaking-long-duration',
      defaultApplicable: 'No',
      importTable: { kind: LONG_DURATION_TESTS_KIND, rowsKey: 'rows', idKeys: ['clauseNo', 'testName'] },
      popup: () => <LongDurationTests projectId={projectId} payload={payloads[LONG_DURATION_TESTS_KIND]} onChanged={onChanged} />,
    },
    {
      key: 'raw-material-test-reports',
      label: 'Raw Material Test Reports',
      printKind: 'raw-material-test-reports',
      defaultApplicable: fmcs ? 'Yes' : 'No',
      importTable: { kind: 'raw-material-test-reports', rowsKey: 'rows', idKeys: ['description'] },
      popup: () => (
        <div className="space-y-3">
          <EditableRows
            projectId={projectId}
            kind="raw-material-test-reports"
            fields={[
              {
                key: 'description',
                label: 'Raw Material Description',
                alignLeft: true,
                placeholder: 'Description',
                // Raw materials from Step 3 (Raw Material / Grade) as suggestions; anything else can be typed.
                suggestions: rowsOf(payloads['raw-material-reference'], 'rawMaterials').map((r) => String(r.rawMaterial ?? '').trim()).filter(Boolean),
              },
              { key: 'complete', label: 'Test Report / Certificate Complete', options: ['Yes', 'No'], width: '11rem' },
              { key: 'conformity', label: 'Conformity as per Indian Standard', options: ['Yes', 'No'], width: '11rem' },
            ]}
            extraColumns={[
              fileColumn({ projectId, kind: 'raw-material-test-reports', key: 'testReport', label: 'Test Report / Certificate', docKind: 'raw-material-test-report', onChanged }),
            ]}
            blank={() => ({ description: '', complete: 'Yes', conformity: 'Yes', testReport: null })}
            saved={rowsOf(payloads['raw-material-test-reports'])}
            onChanged={onChanged}
            addLabel="Add raw material test report"
          />
        </div>
      ),
    },
  ]

  return (
    <>
    <FactoryTestReportGenerateDialog
      projectId={projectId}
      sample={generateSample}
      samples={samples}
      isCodeId={projectRow.is_code_id ?? null}
      isCodeLabel={isCodeDisplayLabel(projectRow)}
      onClose={() => setGenerateSampleId(null)}
      onSaved={onChanged}
    />
    <ManakComponentsTable
      title="Test Report - Details"
      componentHeading="Test Report Component"
      componentsKind={TEST_REPORT_COMPONENTS_KIND}
      components={components}
      projectId={projectId}
      projectRow={projectRow}
      payloads={payloads}
      onChanged={onChanged}
      onEdit={onEdit}
      renderDocActions={renderDocActions}
      selection={selection}
      after={<ManakWarnings items={warnings} />}
    />
    </>
  )
}
