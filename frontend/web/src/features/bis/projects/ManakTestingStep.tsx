import { useEffect, useState, type ReactNode } from 'react'
import { toast } from 'sonner'
import { printKindToStorageDocKind, type BisPrintDocumentKind } from '../print/printBisDocument'
import { fetchBisModulePayload, saveBisModulePayload } from './bisModuleDataApi'
import { EditableRows } from './ManakManagementStep'
import { cmpf306CalibrationStatus, cmpf306QuantityNos, normalizeCmpf306Row } from './cmpf306Model'
import { ManakComponentsTable, type StepComponent, type YesNo } from './ManakComponentsTable'
import { TESTING_COMPONENTS_KIND } from './manakModuleKinds'
import { SharedProjectFileButton } from './RowFileAttachment'
import { ProjectFilesUploadCell } from './ProjectFilesUploadCell'
import { CMPF306_EXCEL_COLUMNS } from './cmpf306Model'
import {
  fetchLaboratoryOslInfo,
  searchLaboratoryOslOptions,
  type LaboratoryOslInfo,
} from '@/features/masters/laboratories/laboratoriesApi'
import { ManakWarnings } from './ManakStepPages'
import type { BisProjectRow } from './types'

type Rec = Record<string, unknown>
type Payload = Rec | null | undefined

const str = (v: unknown) => (typeof v === 'string' ? v.trim() : v == null ? '' : String(v).trim())
const rowsOf = (p: Payload, key = 'rows'): Rec[] => (Array.isArray(p?.[key]) ? (p?.[key] as Rec[]) : [])

/** Laboratory Master OSL codes for the given lab ids; null until loaded. */
function useLabOslInfo(ids: string[]): Map<string, LaboratoryOslInfo> | null {
  const key = Array.from(new Set(ids.filter(Boolean))).sort().join(',')
  const [loaded, setLoaded] = useState<{ key: string; map: Map<string, LaboratoryOslInfo> } | null>(null)
  useEffect(() => {
    if (!key) return
    let cancelled = false
    void fetchLaboratoryOslInfo(key.split(','))
      .then((map) => !cancelled && setLoaded({ key, map }))
      .catch(() => !cancelled && setLoaded({ key, map: new Map() }))
    return () => {
      cancelled = true
    }
  }, [key])
  if (!key) return new Map()
  return loaded?.key === key ? loaded.map : null
}

/** Why Manak's lab drop-down cannot be matched for this row (it is matched on the OSL code), or null. */
function labCodeProblem(row: Rec, labs: Map<string, LaboratoryOslInfo> | null): { label: string; detail: string } | null {
  const id = str(row.laboratoryId)
  if (!id) return str(row.laboratoryName) ? { label: 'Not from master', detail: 'Typed in — pick the lab from the Laboratory Master' } : null
  if (!labs) return null
  const lab = labs.get(id)
  if (!lab) return { label: 'Not in master', detail: 'This lab is no longer in the Laboratory Master — pick it again' }
  return lab.oslCode ? null : { label: 'No OSL code', detail: 'Add this lab’s OSL code in the Laboratory Master' }
}

/** OSL code of the row's lab (Manak's lab list is matched on it), or what is missing. */
function LabOslCode({ row, labs }: { row: Rec; labs: Map<string, LaboratoryOslInfo> | null }) {
  const lab = labs?.get(str(row.laboratoryId))
  const problem = labCodeProblem(row, labs)
  if (problem) {
    return (
      <span className="whitespace-nowrap text-xs font-medium text-amber-800" title={problem.detail}>
        {problem.label}
      </span>
    )
  }
  if (!lab) return <span className="text-stone-400">{str(row.laboratoryId) ? '…' : '—'}</span>
  return (
    <span className="whitespace-nowrap" title={lab.place || undefined}>
      <span className="font-mono text-sm font-semibold text-amber-900">{lab.oslCode}</span>
      {lab.place ? <span className="block text-[11px] text-stone-500">{lab.place}</span> : null}
    </span>
  )
}

/** Same cell for the input row, whose lab is picked before the row is saved. */
function DraftLabOslCode({ row }: { row: Rec }) {
  const labs = useLabOslInfo([str(row.laboratoryId)])
  return <LabOslCode row={row} labs={labs} />
}

/** Step 5 — Testing and Inspection, laid out like Manak: in-house facility, then the component table. */
export function ManakTestingStep({
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
  const saved = payloads[TESTING_COMPONENTS_KIND]
  const [pendingInHouse, setPendingInHouse] = useState<YesNo | null>(null)
  const inHouse: YesNo = pendingInHouse ?? (saved?.inHouseTesting === 'No' ? 'No' : 'Yes')

  const setInHouse = async (value: YesNo) => {
    setPendingInHouse(value)
    if (value === 'Yes') selection?.set('subcontracted-tests', false)
    try {
      const current = (await fetchBisModulePayload(projectId, TESTING_COMPONENTS_KIND)) ?? {}
      await saveBisModulePayload(projectId, TESTING_COMPONENTS_KIND, { ...current, inHouseTesting: value })
      onChanged()
    } catch (err) {
      setPendingInHouse(null)
      toast.error(err instanceof Error ? err.message : 'Could not save')
    }
  }

  const subRows = rowsOf(payloads['subcontracted-tests']).filter((r) => str(r.testName) || str(r.clauseNo))
  const labs = useLabOslInfo(subRows.map((r) => str(r.laboratoryId)))
  const unmatchedLabs = subRows.filter((r) => labCodeProblem(r, labs))
  const warnings =
    inHouse === 'No'
      ? [
          subRows.length === 0 &&
            'In-house testing facility is "No", but no test to be sub-contracted is entered. Add the tests with their BIS-recognised lab, or set it to "Yes".',
          unmatchedLabs.length > 0 &&
            `${unmatchedLabs.length} sub-contracted test${unmatchedLabs.length === 1 ? ' has a lab' : 's have labs'} without an OSL code. Manak's lab list is matched on the OSL code: pick the lab from the Laboratory Master, and add its OSL code there if it is missing.`,
        ]
      : []

  const equipment: StepComponent = {
    key: 'equipment',
    label: 'List of Testing Equipment',
    printKind: 'cmpf-306',
    defaultApplicable: 'Yes',
    importTable: { kind: 'cmpf-306', rowsKey: 'rows', idKeys: ['equipmentName'] },
    excel: {
      kind: 'cmpf-306',
      idKey: 'equipmentName',
      columns: CMPF306_EXCEL_COLUMNS,
    },
    popup: () => (
      <EditableRows
        projectId={projectId}
        kind="cmpf-306"
        fields={[
          { key: 'equipmentName', label: 'Equipment', alignLeft: true, placeholder: 'Test Equipment / Chemical' },
          { key: 'make', label: 'Make', alignLeft: true, width: '12rem' },
          { key: 'leastCount', label: 'Least Count', optional: true, width: '7rem' },
          { key: 'range', label: 'Range', optional: true, width: '7rem' },
          {
            key: 'calibrationStatus',
            label: 'Calibration\nStatus',
            options: ['Yes', 'No'],
            width: '6.5rem',
            // Left empty: Yes when least count and range are given, otherwise No.
            normalize: (v, row) => cmpf306CalibrationStatus({ ...row, calibrationStatus: v }),
          },
          { key: 'clauseNo', label: 'Clause No.', optional: true, width: '7rem' },
          { key: 'quantity', label: 'Qty', optional: true, width: '5rem', placeholder: '1 Nos', normalize: cmpf306QuantityNos },
        ]}
        blank={() => ({ equipmentName: '', make: '', leastCount: '', range: '', calibrationStatus: 'Yes', clauseNo: '', quantity: '1 Nos' })}
        saved={rowsOf(payloads['cmpf-306']).map(normalizeCmpf306Row)}
        payload={payloads['cmpf-306']}
        onChanged={onChanged}
        addLabel="Add testing equipment"
      />
    ),
  }

  // Manak asks for the tests to sub-contract only when the complete testing is not done in-house,
  // so the row's Yes / No is the in-house facility and its actions open the sub-contracted tests.
  const subcontracted: StepComponent = {
    key: 'subcontracted-tests',
    label: 'Availability of In-House Testing Facility',
    popupTitle: 'Tests Intended to be Sub-Contracted',
    printKind: 'subcontracted-tests',
    defaultApplicable: 'Yes',
    choice: { value: inHouse, onChange: (v) => void setInHouse(v), actionsWhen: 'No', offText: 'Complete Testing In-House' },
    importTable: { kind: 'subcontracted-tests', rowsKey: 'rows', idKeys: ['clauseNo', 'testName'] },
    popup: () => (
      <div className="space-y-3">
        <EditableRows
          projectId={projectId}
          kind="subcontracted-tests"
          fields={[
            { key: 'clauseNo', label: 'Clause No. of IS', width: '9rem', placeholder: 'Clause No.' },
            { key: 'testName', label: 'Test to be Sub-Contracted', alignLeft: true },
            {
              key: 'laboratoryName',
              label: 'Name of Lab (BIS Recognised / Empanelled)',
              alignLeft: true,
              lookup: { search: searchLaboratoryOslOptions, idKey: 'laboratoryId', placeholder: 'Search lab name, OSL code or district' },
            },
          ]}
          extraColumns={[
            {
              label: 'OSL Code',
              compact: true,
              render: (r) => <LabOslCode row={r} labs={labs} />,
              renderDraft: (draft) => <DraftLabOslCode row={draft} />,
            },
            // The consent letter is the one uploaded with the SIT on Step 1 (same file, shown in both places).
            {
              label: 'Consent Letter',
              compact: true,
              render: () => <SharedProjectFileButton projectId={projectId} docKind="consent-letter" label="Consent Letter" />,
              renderDraft: () => <SharedProjectFileButton projectId={projectId} docKind="consent-letter" label="Consent Letter" />,
            },
          ]}
          blank={() => ({ clauseNo: '', testName: '', laboratoryName: '', laboratoryId: '' })}
          saved={rowsOf(payloads['subcontracted-tests'])}
          payload={payloads['subcontracted-tests']}
          onChanged={onChanged}
          addLabel="Add sub-contracted test"
        />
      </div>
    ),
  }

  // Acceptance of SIT is handled on Step 1, so it is not repeated here.
  const components: StepComponent[] = [
    subcontracted,
    equipment,
    {
      key: 'calibration',
      label: 'Calibration Certificates',
      printKind: 'calibration-certificates',
      defaultApplicable: 'Yes',
      // Always outsourced: nothing to edit, only the certificates' PDFs to upload (merged into the document bundle).
      actions: () => <ProjectFilesUploadCell projectId={projectId} docKind={printKindToStorageDocKind('calibration-certificates')} label="Calibration Certificates" />,
    },
  ]

  return (
    <ManakComponentsTable
      title="Testing And Inspection"
      componentHeading="Testing Component"
      componentsKind={TESTING_COMPONENTS_KIND}
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
  )
}
