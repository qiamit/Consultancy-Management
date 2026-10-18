import { useState, type ReactNode } from 'react'
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
import { searchLaboratoryMasterOptions } from '@/features/masters/laboratories/laboratoriesApi'
import type { BisProjectRow } from './types'

type Rec = Record<string, unknown>
type Payload = Rec | null | undefined

const rowsOf = (p: Payload, key = 'rows'): Rec[] => (Array.isArray(p?.[key]) ? (p?.[key] as Rec[]) : [])

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
              lookup: { search: searchLaboratoryMasterOptions, idKey: 'laboratoryId', placeholder: 'Search Laboratory Master' },
            },
          ]}
          extraColumns={[
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
    />
  )
}
