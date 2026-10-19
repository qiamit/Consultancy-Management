import { useState, type ReactNode } from 'react'
import { Calendar, Import, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { LimsFieldWithAdd } from '@/components/lims/LimsFieldWithAdd'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { limsFieldAddBtnClass, limsFieldClass, limsOutlineBtnClass } from '@/lib/limsThemeUi'
import { cn } from '@/lib/utils'
import {
  emptyCertifiedReferenceMaterialRow,
  emptyRawMaterialSupplierRow,
  parseRawMaterialReferencePayload,
  RAW_MATERIAL_CONFORMITY_OPTIONS,
  isManakRawMaterialConformity,
  type RawMaterialReferencePayload,
} from './rawMaterialReferenceModel'
import { BisModuleImportDialog } from './BisModuleImportDialog'
import { fetchBisModulePayload } from './bisModuleDataApi'
import type { BisPrintDocumentKind } from '../print/printBisDocument'
import type { BisProjectRow } from './types'

const inputClass = cn(limsFieldClass, 'h-8 min-w-28 rounded-none text-center text-xs')
const selectClass = cn(limsFieldClass, 'h-8 w-full min-w-0 rounded-none px-2 text-center text-xs')
const headerClass = 'bg-stone-800 text-center text-[10px] font-bold uppercase tracking-wide text-amber-200'
const issueDateInputClass =
  'min-w-0 border-0 bg-transparent pr-1 text-center tabular-nums shadow-none focus-visible:ring-0 [&::-webkit-calendar-picker-indicator]:pointer-events-none [&::-webkit-calendar-picker-indicator]:absolute [&::-webkit-calendar-picker-indicator]:h-0 [&::-webkit-calendar-picker-indicator]:w-0 [&::-webkit-calendar-picker-indicator]:opacity-0'

function openDatePicker(id: string) {
  const input = document.getElementById(id)
  if (!(input instanceof HTMLInputElement) || input.disabled) return
  try {
    if (typeof input.showPicker === 'function') {
      input.showPicker()
      return
    }
  } catch {
    // Fall back to focusing the date input when the browser blocks showPicker.
  }
  input.focus()
}

function SectionHeader({ title, action }: {
  title: string
  /** Control shown on the right (e.g. Import). */
  action?: ReactNode
}) {
  return (
    <div className="mb-2 flex items-center justify-between gap-2">
      <h3 className="text-left text-sm font-semibold text-stone-800">{title}</h3>
      {action}
    </div>
  )
}

type ImportTarget = 'rawMaterials' | 'certifiedReferenceMaterials'

const IMPORT_TABLES: Record<ImportTarget, { label: string; kind: BisPrintDocumentKind }> = {
  rawMaterials: { label: 'raw materials', kind: 'raw-material-details' },
  certifiedReferenceMaterials: { label: 'certified reference materials', kind: 'certified-reference-materials' },
}

export function RawMaterialReferenceModuleFields({
  value,
  onChange,
  disabled = false,
  row = null,
}: {
  value: RawMaterialReferencePayload
  onChange: (next: RawMaterialReferencePayload) => void
  disabled?: boolean
  /** Current application; enables Import from another Application / License. */
  row?: BisProjectRow | null
}) {
  const [importTarget, setImportTarget] = useState<ImportTarget | null>(null)
  const importButton = (target: ImportTarget) =>
    row?.id ? (
      <Button
        type="button"
        variant="outline"
        size="sm"
        className={cn(limsOutlineBtnClass, 'h-8 gap-1.5 rounded-none px-3 text-xs')}
        disabled={disabled}
        onClick={() => setImportTarget(target)}
      >
        <Import size={14} aria-hidden /> Import from another Application
      </Button>
    ) : null
  const fillFromSource = async (sourceProjectId: string) => {
    if (!importTarget) return
    const source = parseRawMaterialReferencePayload(await fetchBisModulePayload(sourceProjectId, 'raw-material-reference'))
    const rows = importTarget === 'rawMaterials'
      ? source.rawMaterials.filter((r) => r.rawMaterial.trim())
      : source.certifiedReferenceMaterials.filter((r) => r.crmName.trim() || r.crmNumber.trim())
    const { label } = IMPORT_TABLES[importTarget]
    if (rows.length === 0) throw new Error(`The selected application has no ${label}.`)
    onChange({ ...value, [importTarget]: rows })
    toast.success(`Imported ${rows.length} ${label}`, { description: 'Click Save to keep them.' })
  }
  const updateRawMaterial = (index: number, key: string, nextValue: string) => {
    onChange({
      ...value,
      rawMaterials: value.rawMaterials.map((row, i) => i === index ? { ...row, [key]: nextValue } : row),
    })
  }
  const updateCrm = (index: number, key: string, nextValue: string) => {
    onChange({
      ...value,
      certifiedReferenceMaterials: value.certifiedReferenceMaterials.map((row, i) => i === index ? { ...row, [key]: nextValue } : row),
    })
  }
  const insertRawMaterialAfter = (index: number) => {
    const rawMaterials = [...value.rawMaterials]
    rawMaterials.splice(index + 1, 0, emptyRawMaterialSupplierRow())
    onChange({ ...value, rawMaterials })
  }
  const insertCrmAfter = (index: number) => {
    const certifiedReferenceMaterials = [...value.certifiedReferenceMaterials]
    certifiedReferenceMaterials.splice(index + 1, 0, emptyCertifiedReferenceMaterialRow())
    onChange({ ...value, certifiedReferenceMaterials })
  }

  return (
    <div className="min-h-0 flex-1 space-y-4 overflow-y-auto">
      <section className="border border-stone-300 bg-white p-3 sm:p-4">
        <SectionHeader
          title="Raw Material Supplier Details"
          action={importButton('rawMaterials')}
        />
        <div className="overflow-x-auto border border-stone-300">
          <Table className="min-w-[1050px] table-fixed border-collapse [&_th]:border [&_td]:border [&_th]:border-stone-600 [&_td]:border-stone-300 [&_th]:p-2 [&_td]:p-1.5">
            <TableHeader><TableRow>
              <TableHead className={cn(headerClass, 'w-[5%]')}>Sr. No.</TableHead>
              <TableHead className="w-[20%] bg-stone-800 text-center text-[10px] font-bold uppercase tracking-wide text-amber-200">Raw Material</TableHead>
              <TableHead className="w-[20%] bg-stone-800 text-center text-[10px] font-bold uppercase tracking-wide text-amber-200">Name of Supplier</TableHead>
              <TableHead className="w-[16%] bg-stone-800 text-center text-[10px] font-bold uppercase tracking-wide text-amber-200">Conformity of Material</TableHead>
              <TableHead className="w-[16%] bg-stone-800 text-center text-[10px] font-bold uppercase tracking-wide text-amber-200">Record Maintained</TableHead>
              <TableHead className="w-[16%] bg-stone-800 text-center text-[10px] font-bold uppercase tracking-wide text-amber-200">Batches / Lots and Packaging</TableHead>
              <TableHead className={cn(headerClass, 'w-[7%]')}>Actions</TableHead>
            </TableRow></TableHeader>
            <TableBody>{value.rawMaterials.map((row, index) => <TableRow key={`raw-${index}`}>
              <TableCell className="text-center text-xs">{index + 1}</TableCell>
              <TableCell><Input aria-label={`Raw material ${index + 1}`} className={inputClass} value={row.rawMaterial} onChange={(e) => updateRawMaterial(index, 'rawMaterial', e.target.value)} disabled={disabled} /></TableCell>
              <TableCell><Input aria-label={`Supplier ${index + 1}`} className={inputClass} value={row.supplierName} onChange={(e) => updateRawMaterial(index, 'supplierName', e.target.value)} disabled={disabled} /></TableCell>
              <TableCell>{/* Only Manak's five choices can be picked; an old value stays visible (flagged) until it is changed. */}
              <select aria-label={`Conformity of material ${index + 1}`} className={cn(selectClass, row.bisCertificationMark && !isManakRawMaterialConformity(row.bisCertificationMark) && 'border-red-500 bg-red-50 text-red-800')} title={row.bisCertificationMark && !isManakRawMaterialConformity(row.bisCertificationMark) ? 'Not a Manak choice — pick one of the five' : undefined} value={row.bisCertificationMark} onChange={(e) => updateRawMaterial(index, 'bisCertificationMark', e.target.value)} disabled={disabled}>{row.bisCertificationMark && !isManakRawMaterialConformity(row.bisCertificationMark) ? <option value={row.bisCertificationMark} disabled>{row.bisCertificationMark} (not a Manak choice)</option> : null}{RAW_MATERIAL_CONFORMITY_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}</select></TableCell>
              <TableCell><select aria-label={`Record maintained ${index + 1}`} className={selectClass} value={row.testCertificate} onChange={(e) => updateRawMaterial(index, 'testCertificate', e.target.value)} disabled={disabled}><option value="Yes">Yes</option><option value="No">No</option></select></TableCell>
              <TableCell><select aria-label={`Batch and packaging ${index + 1}`} className={selectClass} value={row.batchesPackaging} onChange={(e) => updateRawMaterial(index, 'batchesPackaging', e.target.value)} disabled={disabled}><option value="Batch">Batch</option><option value="Lot">Lot</option><option value="Heat">Heat</option><option value="Loose">Loose</option></select></TableCell>
              <TableCell><div className="flex items-center justify-center gap-1">
                <Button type="button" variant="outline" size="icon" aria-label={`Add raw material after row ${index + 1}`} className={cn(limsOutlineBtnClass, 'h-8 w-8 rounded-none p-0')} onClick={() => insertRawMaterialAfter(index)} disabled={disabled}><Plus size={14} /></Button>
                <Button type="button" variant="ghost" size="icon" aria-label={`Remove raw material ${index + 1}`} className="h-8 w-8 rounded-none text-red-700" onClick={() => onChange({ ...value, rawMaterials: value.rawMaterials.filter((_, i) => i !== index) })} disabled={disabled || value.rawMaterials.length <= 1}><Trash2 size={14} /></Button>
              </div></TableCell>
            </TableRow>)}</TableBody>
          </Table>
        </div>
      </section>

      <section className="border border-stone-300 bg-white p-3 sm:p-4">
        <SectionHeader
          title="Certified Reference Material Details"
          action={importButton('certifiedReferenceMaterials')}
        />
        <div className="overflow-x-auto border border-stone-300">
          <Table className="min-w-[900px] table-fixed border-collapse [&_th]:border [&_td]:border [&_th]:border-stone-600 [&_td]:border-stone-300 [&_th]:p-2 [&_td]:p-1.5">
            <TableHeader><TableRow>
              <TableHead className={cn(headerClass, 'w-12 text-center')}>Sr. No.</TableHead>
              <TableHead className={headerClass}>Name of CRM</TableHead>
              <TableHead className={headerClass}>CRM No.</TableHead>
              <TableHead className={headerClass}>CRM Type</TableHead>
              <TableHead className={headerClass}>CRM Validity</TableHead>
              <TableHead className={headerClass}>CRM Traceability</TableHead>
              <TableHead className={cn(headerClass, 'w-20')}>Actions</TableHead>
            </TableRow></TableHeader>
            <TableBody>{value.certifiedReferenceMaterials.map((row, index) => <TableRow key={`crm-${index}`}>
              <TableCell className="text-center text-xs">{index + 1}</TableCell>
              <TableCell><Input aria-label={`CRM name ${index + 1}`} className={inputClass} value={row.crmName} onChange={(e) => updateCrm(index, 'crmName', e.target.value)} disabled={disabled} /></TableCell>
              <TableCell><Input aria-label={`CRM number ${index + 1}`} className={inputClass} value={row.crmNumber} onChange={(e) => updateCrm(index, 'crmNumber', e.target.value)} disabled={disabled} /></TableCell>
              <TableCell><Input aria-label={`CRM type ${index + 1}`} className={inputClass} value={row.crmType} onChange={(e) => updateCrm(index, 'crmType', e.target.value)} disabled={disabled} /></TableCell>
              <TableCell>
                <LimsFieldWithAdd
                  addButton={(
                    <button
                      type="button"
                      className={limsFieldAddBtnClass}
                      aria-label="Open calendar"
                      title="Pick date"
                      disabled={disabled}
                      onClick={() => openDatePicker(`crm-validity-${index}`)}
                    >
                      <Calendar size={14} strokeWidth={2.25} aria-hidden />
                    </button>
                  )}
                >
                  <Input
                    id={`crm-validity-${index}`}
                    type="date"
                    aria-label={`CRM validity ${index + 1}`}
                    className={issueDateInputClass}
                    value={row.validity}
                    onChange={(e) => updateCrm(index, 'validity', e.target.value)}
                    disabled={disabled}
                  />
                </LimsFieldWithAdd>
              </TableCell>
              <TableCell><Input aria-label={`CRM traceability ${index + 1}`} className={inputClass} value={row.traceability} onChange={(e) => updateCrm(index, 'traceability', e.target.value)} disabled={disabled} /></TableCell>
              <TableCell><div className="flex items-center justify-center gap-1">
                <Button type="button" variant="outline" size="icon" aria-label={`Add CRM after row ${index + 1}`} className={cn(limsOutlineBtnClass, 'h-8 w-8 rounded-none p-0')} onClick={() => insertCrmAfter(index)} disabled={disabled}><Plus size={14} /></Button>
                <Button type="button" variant="ghost" size="icon" aria-label={`Remove CRM ${index + 1}`} className="h-8 w-8 rounded-none text-red-700" onClick={() => onChange({ ...value, certifiedReferenceMaterials: value.certifiedReferenceMaterials.filter((_, i) => i !== index) })} disabled={disabled || value.certifiedReferenceMaterials.length <= 1}><Trash2 size={14} /></Button>
              </div></TableCell>
            </TableRow>)}</TableBody>
          </Table>
        </div>
      </section>
      <BisModuleImportDialog
        open={importTarget != null}
        onOpenChange={(next) => {
          if (!next) setImportTarget(null)
        }}
        targetRow={row}
        kind={importTarget ? IMPORT_TABLES[importTarget].kind : null}
        onPickSource={fillFromSource}
      />
    </div>
  )
}
