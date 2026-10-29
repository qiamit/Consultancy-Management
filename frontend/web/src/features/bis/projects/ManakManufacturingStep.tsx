import { useMemo, useRef, useState, type ReactNode } from 'react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { FileSpreadsheet, Import, Loader2, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { limsDialogClass, limsPrimaryBtnClass } from '@/lib/limsThemeUi'
import type { BisPrintDocumentKind } from '../print/printBisDocument'
import { fetchBisModulePayload, saveBisModulePayload } from './bisModuleDataApi'
import { BisModuleImportDialog } from './BisModuleImportDialog'
import type { BisProjectRow } from './types'
import { RAW_MATERIAL_CONFORMITY_OPTIONS, isManakRawMaterialConformity } from './rawMaterialReferenceModel'
import { parseProcessFlowPayload } from './processFlowModel'
import { EditableRows } from './ManakManagementStep'
import { DescriptionPointsRows } from './DescriptionPointsRows'
import { cleanDescriptionPoints, saveDescriptionPoints } from './descriptionPointsApi'
import { ProcessDescriptionAiDialog } from './ProcessDescriptionAiDialog'
import { generateHygieneConditions } from './generateHygieneConditions'
import { useShowAiButtons } from '@/hooks/useShowAiAssistant'
import { clientDisplayName, isCodeDisplayLabel, isFmcsProject, sanitizeBisLicenseScopeNotes } from './types'
import { importCmpfSpreadsheetRows } from './cmpfSpreadsheetImport'
import { MANUFACTURING_COMPONENTS_KIND } from './manakModuleKinds'
import { ManakPanel, ManakWarnings } from './ManakStepPages'

type Rec = Record<string, unknown>
type Payload = Rec | null | undefined
type YesNo = 'Yes' | 'No'

const str = (v: unknown) => (typeof v === 'string' ? v.trim() : v == null ? '' : String(v).trim())
const rowsOf = (p: Payload, key = 'rows'): Rec[] => (Array.isArray(p?.[key]) ? (p?.[key] as Rec[]) : [])

const thCls =
  'border border-stone-700 bg-stone-800 px-2 py-1.5 text-left text-[11px] font-bold uppercase tracking-[0.1em] text-amber-200'
const tdCls = 'border border-[#e7e0d4] px-2 py-1.5 align-middle text-stone-700'
const checkCls = 'h-4 w-4 rounded-none border-stone-500 text-amber-700 disabled:opacity-40'
const muted = <span className="text-stone-400">—</span>

type ComponentKey =
  | 'raw-material'
  | 'crm'
  | 'process-flow-chart'
  | 'process-description'
  | 'plant-layout'
  | 'machinery'
  | 'subcontracting'
  | 'hygiene'

type ManufacturingComponent = {
  key: ComponentKey
  label: string
  /** Document used by View / Preview / Print / PDF / Word. */
  printKind: BisPrintDocumentKind
  /** Module dialog opened by Edit; absent → the section below is edited in place. */
  editKind?: BisPrintDocumentKind
  /** Applicable when nothing is saved yet and no data exists. */
  defaultApplicable: YesNo
}

/** Where each popup-edited table is stored, and the column that identifies a row. */
const POPUP_TABLES: Partial<Record<ComponentKey, { kind: BisPrintDocumentKind; rowsKey: string; idKeys: string[] }>> = {
  'raw-material': { kind: 'raw-material-reference', rowsKey: 'rawMaterials', idKeys: ['rawMaterial'] },
  crm: { kind: 'raw-material-reference', rowsKey: 'certifiedReferenceMaterials', idKeys: ['crmName', 'crmNumber'] },
  subcontracting: { kind: 'manufacturing-subcontracting', rowsKey: 'rows', idKeys: ['process'] },
  hygiene: { kind: 'hygiene-conditions', rowsKey: 'rows', idKeys: ['aspect'] },
  machinery: { kind: 'cmpf-305', rowsKey: 'rows', idKeys: ['machineryName'] },
}

/** Popups with an "Import from Excel" button: target storage and the spreadsheet column aliases. */
const EXCEL_IMPORTS: Partial<Record<ComponentKey, { kind: BisPrintDocumentKind; idKey: string; columns: Array<{ key: string; aliases: string[] }> }>> = {
  machinery: {
    kind: 'cmpf-305',
    idKey: 'machineryName',
    columns: [
      { key: 'machineryName', aliases: ['machinery name', 'machinery', 'machine', 'equipment name', 'name of the machinery'] },
      { key: 'make', aliases: ['make', 'identification no', 'make identification no', 'make id'] },
      { key: 'capacityPerDay', aliases: ['production capacity per day', 'production capacity day', 'production capacity', 'capacity per day', 'capacity'] },
      { key: 'number', aliases: ['number', 'qty', 'quantity'] },
      { key: 'remarks', aliases: ['remarks', 'remark'] },
    ],
  },
  subcontracting: {
    kind: 'manufacturing-subcontracting',
    idKey: 'process',
    columns: [
      { key: 'process', aliases: ['process sub-contracted', 'process subcontracted', 'manufacturing process sub-contracted', 'manufacturing process', 'process'] },
      { key: 'machinery', aliases: ['machinery used', 'machinery', 'machine'] },
      { key: 'subcontractorName', aliases: ['name of sub-contractor', 'name of subcontractor', 'sub-contractor name', 'subcontractor name', 'sub-contractor', 'subcontractor'] },
      { key: 'subcontractorAddress', aliases: ['address of sub-contractor', 'address of subcontractor', 'sub-contractor address', 'subcontractor address', 'address'] },
      { key: 'remarks', aliases: ['remarks', 'remark'] },
    ],
  },
}

const COMPONENTS: ManufacturingComponent[] = [
  { key: 'raw-material', label: 'Raw Material Details', printKind: 'raw-material-details', defaultApplicable: 'Yes' },
  { key: 'crm', label: 'Certified Reference Material', printKind: 'certified-reference-materials', defaultApplicable: 'No' },
  { key: 'process-flow-chart', label: 'Process Flow Chart', printKind: 'process-flow-chart', editKind: 'process-flow-chart', defaultApplicable: 'Yes' },
  { key: 'process-description', label: 'Process Description', printKind: 'process-description', defaultApplicable: 'Yes' },
  { key: 'plant-layout', label: 'Plant Layout', printKind: 'plant-layout', editKind: 'plant-layout', defaultApplicable: 'Yes' },
  { key: 'machinery', label: 'Manufacturing Machinery List', printKind: 'cmpf-305', defaultApplicable: 'Yes' },
  { key: 'subcontracting', label: 'Sub-Contracting of Manufacturing Machinery', printKind: 'manufacturing-subcontracting', defaultApplicable: 'No' },
  { key: 'hygiene', label: 'Hygiene Conditions', printKind: 'hygiene-conditions', defaultApplicable: 'No' },
]


export function ManakManufacturingStep({
  projectId,
  projectRow,
  payloads,
  onChanged,
  onEdit,
  renderDocActions,
  selection,
}: {
  projectId: string
  /** Current application (needed to import from another one). */
  projectRow: BisProjectRow | null
  payloads: Partial<Record<BisPrintDocumentKind, Payload>>
  onChanged: () => void
  onEdit: (kind: BisPrintDocumentKind) => void
  /** View / Preview / Print / Word / PDF buttons for one document; onModuleEdit replaces the Edit button's target. */
  renderDocActions?: (kind: BisPrintDocumentKind, onModuleEdit: () => void) => ReactNode
  /** Bundle selection shared with the PDF / Word / Excel downloads. */
  selection?: { has: (kind: BisPrintDocumentKind) => boolean; set: (kind: BisPrintDocumentKind, selected: boolean) => void }
}) {
  const flow = parseProcessFlowPayload(payloads['process-flow-chart'] ?? null)
  const subcontracting = rowsOf(payloads['manufacturing-subcontracting'])
  const hygiene = rowsOf(payloads['hygiene-conditions'])
  const rawMaterials = rowsOf(payloads['raw-material-reference'], 'rawMaterials')

  const savedApplicable = useMemo(() => {
    const raw = payloads[MANUFACTURING_COMPONENTS_KIND]?.applicable
    return raw && typeof raw === 'object' ? (raw as Partial<Record<ComponentKey, YesNo>>) : {}
  }, [payloads])
  // Choices made here show at once; the saved payload catches up after the reload.
  const [pending, setPending] = useState<Partial<Record<ComponentKey, YesNo>>>({})
  const applicable = { ...savedApplicable, ...pending }
  // Until a choice is saved, each component uses its own default (CRM, Sub-Contracting and Hygiene start at No).
  const isApplicable = (c: ManufacturingComponent): boolean => (applicable[c.key] ?? c.defaultApplicable) === 'Yes'

  const setComponentApplicable = async (c: ManufacturingComponent, value: YesNo) => {
    const next = { ...applicable, [c.key]: value }
    setPending((p) => ({ ...p, [c.key]: value }))
    if (value === 'No') selection?.set(c.printKind, false)
    try {
      await saveBisModulePayload(projectId, MANUFACTURING_COMPONENTS_KIND, { ...(payloads[MANUFACTURING_COMPONENTS_KIND] ?? {}), applicable: next })
      onChanged()
    } catch (err) {
      setPending((p) => {
        const rest = { ...p }
        delete rest[c.key]
        return rest
      })
      toast.error(err instanceof Error ? err.message : 'Could not save')
    }
  }

  // Components without a module dialog are edited in a popup opened from their Edit button.
  const [popup, setPopup] = useState<ManufacturingComponent | null>(null)
  const [importOpen, setImportOpen] = useState(false)
  const [aiOpen, setAiOpen] = useState(false)
  const [hygieneAiBusy, setHygieneAiBusy] = useState(false)
  /** AI hygiene requirements from the IS, its product manual and the manufacturing scope; added below the saved rows. */
  const generateHygiene = async () => {
    setHygieneAiBusy(true)
    try {
      const current = (await fetchBisModulePayload(projectId, 'hygiene-conditions')) ?? {}
      const existing = rowsOf(current).filter((r) => str(r.aspect))
      const generated = await generateHygieneConditions({
        applicantName: projectRow ? clientDisplayName(projectRow) : '',
        isNumber: projectRow ? isCodeDisplayLabel(projectRow) : '',
        isTitle: (projectRow?.is_code?.title ?? '').trim(),
        licenseScope: sanitizeBisLicenseScopeNotes(projectRow?.notes ?? ''),
        productManualNumber: str(payloads['cmpf-311']?.productManualNumber),
        isCodeId: projectRow?.is_code_id ?? null,
        existingAspects: existing.map((r) => str(r.aspect)),
      })
      const known = new Set(existing.map((r) => str(r.aspect).toLowerCase()))
      const fresh = generated.filter((r) => !known.has(r.aspect.toLowerCase()))
      if (fresh.length === 0) {
        toast.message('Nothing New to Add', { description: 'The AI suggested only aspects already in the table.' })
        return
      }
      await saveBisModulePayload(projectId, 'hygiene-conditions', { ...current, rows: [...existing, ...fresh] })
      toast.success(`Added ${fresh.length} hygiene condition${fresh.length === 1 ? '' : 's'}`, { description: 'Review and edit them as needed.' })
      onChanged()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not generate hygiene conditions')
    } finally {
      setHygieneAiBusy(false)
    }
  }
  const showAiButtons = useShowAiButtons()
  const excelInputRef = useRef<HTMLInputElement | null>(null)
  /** Adds rows from an Excel / CSV sheet to the open popup's saved list (Machinery, Sub-Contracting). */
  const importExcel = async (file: File) => {
    const config = popup ? EXCEL_IMPORTS[popup.key] : undefined
    if (!config) return
    try {
      const imported = await importCmpfSpreadsheetRows<Record<string, string>>(file, config.columns, (r) => Boolean(str(r[config.idKey])))
      if (imported.length === 0) {
        toast.error('No Rows Were Found in the Selected Spreadsheet.')
        return
      }
      const current = (await fetchBisModulePayload(projectId, config.kind)) ?? {}
      const existing = rowsOf(current).filter((r) => str(r[config.idKey]))
      await saveBisModulePayload(projectId, config.kind, { ...current, rows: [...existing, ...imported] })
      toast.success(`Imported ${imported.length} row${imported.length === 1 ? '' : 's'}`)
      onChanged()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Unable to import the spreadsheet.')
    } finally {
      if (excelInputRef.current) excelInputRef.current.value = ''
    }
  }
  /** Adds the source application's rows to this table, skipping ones already present. */
  const importRows = async (sourceProjectId: string) => {
    if (popup?.key === 'process-description') {
      const sourcePoints = cleanDescriptionPoints((await fetchBisModulePayload(sourceProjectId, 'process-flow-chart'))?.descriptionPoints)
      if (sourcePoints.length === 0) throw new Error('The selected application has no Process Description.')
      let added = 0
      await saveDescriptionPoints(projectId, (list) => {
        const known = new Set(list.map((p) => p.toLowerCase()))
        const fresh = sourcePoints.filter((p) => !known.has(p.toLowerCase()))
        added = fresh.length
        return [...list, ...fresh]
      })
      if (added === 0) toast.message('Nothing New to Import', { description: 'All these points are already in this application.' })
      else toast.success(`Imported ${added} point${added === 1 ? '' : 's'}`)
      onChanged()
      return
    }
    const table = popup ? POPUP_TABLES[popup.key] : undefined
    if (!popup || !table) return
    const rowKey = (r: Rec) => table.idKeys.map((k) => str(r[k]).toLowerCase()).join('|')
    const isRow = (r: Rec) => table.idKeys.some((k) => str(r[k]))
    const sourceRows = rowsOf(await fetchBisModulePayload(sourceProjectId, table.kind), table.rowsKey).filter(isRow)
    if (sourceRows.length === 0) throw new Error(`The selected application has no ${popup.label}.`)
    const current = (await fetchBisModulePayload(projectId, table.kind)) ?? {}
    const existing = rowsOf(current, table.rowsKey).filter(isRow)
    const known = new Set(existing.map(rowKey))
    const added = sourceRows.filter((r) => !known.has(rowKey(r)))
    if (added.length === 0) {
      toast.message('Nothing New to Import', { description: `All ${popup.label} rows are already in this application.` })
      return
    }
    await saveBisModulePayload(projectId, table.kind, { ...current, [table.rowsKey]: [...existing, ...added] })
    toast.success(`Imported ${added.length} row${added.length === 1 ? '' : 's'}`, {
      description: added.length < sourceRows.length ? `${sourceRows.length - added.length} already present were skipped.` : undefined,
    })
    onChanged()
  }

  // What Manak's Manufacturing step will get: outsourcing = Sub-Contracting applicable; conformity sent as stored.
  const outsourcing = COMPONENTS.some((c) => c.key === 'subcontracting' && isApplicable(c))
  const subcontractedProcesses = subcontracting.filter((r) => str(r.process))
  const badConformity = rawMaterials.filter((r) => str(r.rawMaterial) && !isManakRawMaterialConformity(str(r.bisCertificationMark)))
  const badConformityValues = Array.from(new Set(badConformity.map((r) => str(r.bisCertificationMark) || 'blank')))
  const warnings = [
    outsourcing &&
      subcontractedProcesses.length === 0 &&
      'Sub-Contracting of Manufacturing Machinery is "Yes" (Manak: outsourcing), but no sub-contracted process is entered. Add the processes, or set it to "No".',
    badConformity.length > 0 &&
      `${badConformity.length} raw material row${badConformity.length === 1 ? ' has' : 's have'} a Conformity of Material Manak does not accept (${badConformityValues.map((v) => `"${v}"`).join(', ')}). Open Raw Material Details, edit ${badConformity.length === 1 ? 'it' : 'them'} and pick one of: ${RAW_MATERIAL_CONFORMITY_OPTIONS.join(', ')}.`,
  ]

  const editComponent = (c: ManufacturingComponent) => () => {
    if (c.editKind) onEdit(c.editKind)
    else setPopup(c)
  }

  /** Tables edited in the popup (components without a module dialog). */
  const sections: Partial<Record<ComponentKey, ReactNode>> = {
    'raw-material': (
      <EditableRows
        projectId={projectId}
        kind="raw-material-reference"
        rowsKey="rawMaterials"
        fields={[
          { key: 'rawMaterial', label: 'Raw Material / Grade', alignLeft: true, placeholder: 'Raw Material' },
          { key: 'supplierName', label: 'Name of Supplier', placeholder: 'Supplier', width: '13rem' },
          // FMCS: Manak asks the supplier's country for every raw material.
          ...(isFmcsProject(projectRow) ? [{ key: 'supplierCountry', label: 'Supplier Country', placeholder: 'Country', width: '9rem' }] : []),
          { key: 'bisCertificationMark', label: 'Conformity of Material', options: RAW_MATERIAL_CONFORMITY_OPTIONS, width: '13rem' },
          { key: 'testCertificate', label: 'Record Maintained', options: ['Yes', 'No'], width: '9rem' },
          { key: 'batchesPackaging', label: 'Batches / Lots & Packaging', options: ['Batch', 'Lot', 'Heat', 'Loose'], width: '9rem' },
        ]}
        blank={() => ({ rawMaterial: '', supplierName: '', supplierCountry: '', bisCertificationMark: 'ISI Marked', testCertificate: 'Yes', batchesPackaging: 'Batch' })}
        // Stored values as they are, so an old "With" is flagged instead of looking like ISI Marked (the fill sends what is stored).
        saved={rawMaterials}
        onChanged={onChanged}
        addLabel="Add raw material"
      />
    ),
    crm: (
      <EditableRows
        projectId={projectId}
        kind="raw-material-reference"
        rowsKey="certifiedReferenceMaterials"
        fields={[
          { key: 'crmName', label: 'Name of CRM', alignLeft: true },
          { key: 'crmNumber', label: 'CRM No.' },
          { key: 'crmType', label: 'CRM Type', optional: true },
          { key: 'validity', label: 'CRM Validity', type: 'date', optional: true, width: '10rem' },
          { key: 'traceability', label: 'CRM Traceability', optional: true },
        ]}
        blank={() => ({ crmName: '', crmNumber: '', crmType: '', validity: '', traceability: '' })}
        saved={rowsOf(payloads['raw-material-reference'], 'certifiedReferenceMaterials')}
        onChanged={onChanged}
        addLabel="Add certified reference material"
      />
    ),
    'process-description': (
      <DescriptionPointsRows
        points={cleanDescriptionPoints(flow.descriptionPoints)}
        apply={async (mutate) => {
          await saveDescriptionPoints(projectId, mutate)
          onChanged()
        }}
      />
    ),
    machinery: (
      <EditableRows
        projectId={projectId}
        kind="cmpf-305"
        fields={[
          { key: 'machineryName', label: 'Name of the Machinery', alignLeft: true },
          { key: 'make', label: 'Make', width: '10rem' },
          { key: 'capacityPerDay', label: 'Production Capacity', width: '10rem' },
          { key: 'number', label: 'Number', width: '7rem' },
          { key: 'remarks', label: 'Remarks', optional: true, width: '10rem' },
        ]}
        blank={() => ({ machineryName: '', make: '', capacityPerDay: '', number: '', remarks: '' })}
        saved={rowsOf(payloads['cmpf-305'])}
        onChanged={onChanged}
        addLabel="Add machinery"
      />
    ),
    subcontracting: (
      <EditableRows
        projectId={projectId}
        kind="manufacturing-subcontracting"
        fields={[
          { key: 'process', label: 'Process Sub-contracted', alignLeft: true },
          { key: 'machinery', label: 'Machinery Used', optional: true },
          { key: 'subcontractorName', label: 'Name of Sub-contractor' },
          { key: 'subcontractorAddress', label: 'Address of Sub-contractor', alignLeft: true },
          { key: 'remarks', label: 'Remarks', optional: true },
        ]}
        blank={() => ({ process: '', machinery: '', subcontractorName: '', subcontractorAddress: '', remarks: '' })}
        saved={subcontracting}
        onChanged={onChanged}
        addLabel="Add sub-contracted process"
      />
    ),
    hygiene: (
      <EditableRows
        projectId={projectId}
        kind="hygiene-conditions"
        fields={[
          { key: 'aspect', label: 'Hygiene Aspect', alignLeft: true, placeholder: 'e.g. Pest control' },
          { key: 'arrangement', label: 'Arrangement / Condition Maintained', alignLeft: true },
          { key: 'remarks', label: 'Remarks', optional: true },
        ]}
        blank={() => ({ aspect: '', arrangement: '', remarks: '' })}
        saved={hygiene}
        onChanged={onChanged}
        addLabel="Add hygiene condition"
      />
    ),
  }

  return (
    <>
      <ManakPanel title="Manufacturing Process Details">
        {/* Phones: one card per component instead of a table that scrolls sideways. */}
        <div className="space-y-2 md:hidden">
          {COMPONENTS.map((c) => {
            const yes = isApplicable(c)
            return (
              <article key={c.key} className={cn('border border-stone-300 bg-[#fffcf7] p-2.5', !yes && 'bg-[#f7f3eb]')}>
                <div className="flex items-start gap-2">
                  <input
                    type="checkbox"
                    className={cn(checkCls, 'mt-0.5 shrink-0')}
                    aria-label={`Select ${c.label}`}
                    disabled={!yes || !selection}
                    checked={yes && Boolean(selection?.has(c.printKind))}
                    onChange={(e) => selection?.set(c.printKind, e.target.checked)}
                  />
                  <div className="min-w-0 flex-1 text-sm font-semibold leading-snug text-stone-800">
                    {yes ? (
                      <button type="button" className="text-left font-semibold hover:text-amber-800 hover:underline" onClick={editComponent(c)}>
                        {c.label}
                      </button>
                    ) : (
                      c.label
                    )}
                  </div>
                </div>
                {/* Applicable and the action buttons share one line; the buttons drop below only when they do not fit. */}
                <div className="mt-2 flex flex-wrap items-end justify-between gap-x-2 gap-y-1.5 border-t border-stone-200 pt-2">
                  <div className="flex flex-col items-start gap-0.5 text-[10px] font-semibold uppercase tracking-wide text-stone-500">
                    <span>
                      Applicable<span className="text-red-500">*</span>
                    </span>
                    <Select value={yes ? 'Yes' : 'No'} onValueChange={(v) => void setComponentApplicable(c, v as YesNo)}>
                      <SelectTrigger className="h-8 w-20 rounded-none border-stone-300 bg-white text-sm normal-case tracking-normal text-stone-900" aria-label={`${c.label} applicable`}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Yes">Yes</SelectItem>
                        <SelectItem value="No">No</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="ml-auto flex min-w-0 flex-wrap items-center justify-end gap-0.5">
                    {yes ? renderDocActions?.(c.printKind, editComponent(c)) ?? muted : <span className="text-xs text-stone-400">Not Applicable</span>}
                  </div>
                </div>
              </article>
            )
          })}
        </div>
        <div className="hidden overflow-x-auto md:block">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr>
                <th className={cn(thCls, 'w-8 px-1 text-center')} aria-label="Select" />
                <th className={thCls}>Manufacturing Component</th>
                <th className={cn(thCls, 'w-[1%] whitespace-nowrap text-center')}>
                  Applicable<span className="text-red-400">*</span>
                </th>
                <th className={cn(thCls, 'w-[1%] text-center')}>Action</th>
              </tr>
            </thead>
            <tbody>
              {COMPONENTS.map((c, n) => {
                const yes = isApplicable(c)
                return (
                  <tr key={c.key} className={n % 2 ? 'bg-[#f7f3eb]' : 'bg-[#fffcf7]'}>
                    <td className={cn(tdCls, 'px-1 text-center')}>
                      <input
                        type="checkbox"
                        className={checkCls}
                        aria-label={`Select ${c.label}`}
                        disabled={!yes || !selection}
                        checked={yes && Boolean(selection?.has(c.printKind))}
                        onChange={(e) => selection?.set(c.printKind, e.target.checked)}
                      />
                    </td>
                    <td className={cn(tdCls, 'font-semibold text-stone-800')}>
                      {yes ? (
                        <button type="button" className="text-left font-semibold hover:text-amber-800 hover:underline" onClick={editComponent(c)}>
                          {c.label}
                        </button>
                      ) : (
                        c.label
                      )}
                    </td>
                    <td className={cn(tdCls, 'text-center')}>
                      <Select value={yes ? 'Yes' : 'No'} onValueChange={(v) => void setComponentApplicable(c, v as YesNo)}>
                        <SelectTrigger className="mx-auto h-8 w-24 rounded-none border-stone-300 bg-white text-sm" aria-label={`${c.label} applicable`}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Yes">Yes</SelectItem>
                          <SelectItem value="No">No</SelectItem>
                        </SelectContent>
                      </Select>
                    </td>
                    <td className={cn(tdCls, 'whitespace-nowrap text-center')}>
                      {yes ? renderDocActions?.(c.printKind, editComponent(c)) ?? muted : <span className="text-xs text-stone-400">Not Applicable</span>}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <ManakWarnings items={warnings} />
      </ManakPanel>

      <Dialog open={popup != null} onOpenChange={(open) => !open && setPopup(null)}>
        <DialogContent
          persistOnFocusLoss
          layer="stacked"
          aria-describedby={undefined}
          className={cn(limsDialogClass, 'flex max-h-[90dvh] w-[min(72rem,calc(100vw_-_var(--app-dialog-overlay-left,0px)_-_1.5rem))] max-w-6xl flex-col p-0')}
        >
          <DialogHeader className="flex-row items-center justify-between gap-2 space-y-0 bg-gradient-to-br from-stone-800 via-stone-900 to-stone-950 py-1.5 pl-4 pr-12 text-left">
            <DialogTitle className="text-base font-semibold tracking-tight text-white">{popup?.label}</DialogTitle>
            <div className="flex shrink-0 items-center gap-1.5">
            {popup && EXCEL_IMPORTS[popup.key] ? (
              <>
                <input
                  ref={excelInputRef}
                  type="file"
                  accept=".xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0]
                    if (file) void importExcel(file)
                  }}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 shrink-0 rounded-none border border-amber-500/60 bg-stone-800 p-0 text-amber-200 shadow-sm transition-colors hover:border-amber-400 hover:bg-amber-600 hover:text-white focus-visible:ring-2 focus-visible:ring-amber-400/50"
                  title="Import from Excel"
                  aria-label="Import from Excel"
                  onClick={() => excelInputRef.current?.click()}
                >
                  <FileSpreadsheet size={15} aria-hidden />
                </Button>
              </>
            ) : null}
            {projectRow?.id ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 w-8 shrink-0 rounded-none border border-amber-500/60 bg-stone-800 p-0 text-amber-200 shadow-sm transition-colors hover:border-amber-400 hover:bg-amber-600 hover:text-white focus-visible:ring-2 focus-visible:ring-amber-400/50"
                title="Import from Another Application"
                aria-label="Import from Another Application"
                onClick={() => setImportOpen(true)}
              >
                <Import size={15} aria-hidden />
              </Button>
            ) : null}
            {popup?.key === 'hygiene' && showAiButtons ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={hygieneAiBusy}
                className="h-8 w-8 shrink-0 rounded-none border border-amber-500/60 bg-stone-800 p-0 text-amber-200 shadow-sm transition-colors hover:border-amber-400 hover:bg-amber-600 hover:text-white focus-visible:ring-2 focus-visible:ring-amber-400/50"
                title="Generate hygiene conditions with AI (from the IS, product manual and manufacturing scope)"
                aria-label="Generate Hygiene Conditions with AI"
                onClick={() => void generateHygiene()}
              >
                {hygieneAiBusy ? <Loader2 size={15} className="animate-spin" aria-hidden /> : <Sparkles size={15} aria-hidden />}
              </Button>
            ) : null}
            {popup?.key === 'process-description' && showAiButtons ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 w-8 shrink-0 rounded-none border border-amber-500/60 bg-stone-800 p-0 text-amber-200 shadow-sm transition-colors hover:border-amber-400 hover:bg-amber-600 hover:text-white focus-visible:ring-2 focus-visible:ring-amber-400/50"
                title="Generate Description Points with AI"
                aria-label="Generate Description Points with AI"
                onClick={() => setAiOpen(true)}
              >
                <Sparkles size={15} aria-hidden />
              </Button>
            ) : null}
            </div>
          </DialogHeader>
          <div className="min-h-0 flex-1 overflow-y-auto bg-[#fffcf7] p-4">
            {popup ? sections[popup.key] : null}
          </div>
          <DialogFooter className="border-t border-stone-200 bg-stone-50 px-4 py-3">
            <Button type="button" className={cn(limsPrimaryBtnClass, 'min-w-[7rem]')} onClick={() => setPopup(null)}>
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {showAiButtons ? (
        <ProcessDescriptionAiDialog
          open={aiOpen}
          onOpenChange={setAiOpen}
          applicantName={projectRow ? clientDisplayName(projectRow) : ''}
          isNumber={projectRow ? isCodeDisplayLabel(projectRow) : ''}
          isTitle={(projectRow?.is_code?.title ?? '').trim()}
          productName={(projectRow?.is_code?.title ?? '').trim()}
          licenseScope={sanitizeBisLicenseScopeNotes(projectRow?.notes ?? '')}
          isCodeId={projectRow?.is_code_id ?? null}
          nodes={flow.nodes}
          existingPoints={cleanDescriptionPoints(flow.descriptionPoints)}
          onApplyPoints={(points, mode) => {
            const fresh = points.map((p) => p.trim()).filter(Boolean)
            void saveDescriptionPoints(projectId, (list) => (mode === 'replace' ? fresh : [...list, ...fresh]))
              .then(() => {
                toast.success(mode === 'replace' ? 'Description points replaced' : 'Description points added')
                onChanged()
              })
              .catch((err) => toast.error(err instanceof Error ? err.message : 'Could not save'))
          }}
        />
      ) : null}

      <BisModuleImportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        targetRow={projectRow}
        kind={popup?.printKind ?? null}
        onPickSource={importRows}
      />
    </>
  )
}
