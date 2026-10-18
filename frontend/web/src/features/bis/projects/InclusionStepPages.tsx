import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { FileCheck2, FileDown, Loader2, Plus, Upload } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { usePdfViewer } from '@/components/ui/usePdfViewer'
import { cn } from '@/lib/utils'
import { supabase } from '@/lib/supabaseClient'
import { listBisBranchOffices, type BisBranchOfficeRow } from '@/features/masters/bis-branch-offices/bisBranchOfficesApi'
import { FilterCombobox, type FilterComboboxOption } from '@/features/sample-handling/receiving/FilterCombobox'
import type { BisPrintDocumentKind } from '../print/printBisDocument'
import { fetchBisModulePayload, saveBisModulePayload } from './bisModuleDataApi'
import {
  createBisProjectFileUrls,
  deleteBisProjectFile,
  formatBisProjectFilesError,
  listBisProjectFiles,
  updateBisProjectFileName,
  uploadBisProjectFile,
  type BisProjectViewFile,
} from './bisProjectFilesApi'
import { cmpf306CalibrationStatus, cmpf306QuantityNos, normalizeCmpf306Row } from './cmpf306Model'
import {
  INCLUSION_ADDITION_KEY,
  INCLUSION_COMPONENTS_KIND,
  INCLUSION_DETAILS_KIND,
  INCLUSION_OTHER_DOCS_KIND,
  INCLUSION_TYPES,
  inclusionRequired,
  INCLUSION_SCOPE_FILES_KIND,
  isInclusionAddition,
  newScopeVarieties,
} from './inclusionModel'
import { buildInclusionOtherDocumentPdf } from './inclusionPayload'
import { buildBisDocumentPdfBlob } from './bisDocumentPdf'
import { loadBisProjectPrintPageSettings } from './bisPrintPageSettingsApi'
import { DEFAULT_BIS_DOCUMENT_PRINT_PAGE_SETTINGS } from '../print/bisDocumentPrintPageSettings'
import { ManakComponentsTable, type StepComponent, type YesNo } from './ManakComponentsTable'
import { EditableRows } from './ManakManagementStep'
import { ManakPanel, ManakSubPanel } from './ManakStepPages'
import { ManakVarietiesTable } from './ManakVarietiesTable'
import { InclusionLetterDialog } from './InclusionLetterDialog'
import { formatCmL, manakLoginFromProject, parseBisNotesScope, sanitizeBisLicenseScopeNotes, type BisProjectRow } from './types'

/* BIS New Inclusion — Manak "Application For Change in Scope (Inclusion)", kept apart from the New Application steps.
   Step 1 Licence, existing & new scope · 2 Test Reports (the New Application module) · 3 Add Varieties
   · 4 Declaration (additional machinery / testing equipment) · 5 Request letter & other documents · 6 Preview. */

type Rec = Record<string, unknown>
type Payload = Rec | null | undefined

const str = (v: unknown) => (typeof v === 'string' ? v.trim() : v == null ? '' : String(v).trim())
const rowsOf = (p: Payload, key = 'rows'): Rec[] => (Array.isArray(p?.[key]) ? (p?.[key] as Rec[]) : [])

const LOAD_KINDS: BisPrintDocumentKind[] = [INCLUSION_DETAILS_KIND, INCLUSION_COMPONENTS_KIND, 'cmpf-305', 'cmpf-306', 'osl-sample-requirements']

function useInclusionData(row: BisProjectRow | null, refreshKey: number) {
  const [payloads, setPayloads] = useState<Partial<Record<BisPrintDocumentKind, Payload>>>({})
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    if (!row?.id) return
    let active = true
    setLoading(true)
    void Promise.all(LOAD_KINDS.map((k) => fetchBisModulePayload(row.id, k).catch(() => null)))
      .then((loaded) => {
        if (active) setPayloads(Object.fromEntries(LOAD_KINDS.map((k, i) => [k, loaded[i]])))
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [row?.id, refreshKey])
  return { payloads, loading }
}

const inputCls = 'h-8 w-full rounded-none border border-stone-300 bg-white px-2 text-sm text-stone-800 focus:border-amber-600 focus:outline-none'
const thCls = 'border border-stone-700 bg-stone-800 px-2 py-1.5 text-left text-[11px] font-bold uppercase tracking-[0.1em] text-amber-200'
const tdCls = 'border border-[#e7e0d4] px-2 py-1.5 align-middle text-sm text-stone-700'

export function InclusionStepPage({
  stepId,
  row,
  refreshKey,
  onEdit,
  onGoToStep,
  renderDocActions,
  docSelection,
  onProjectSaved,
  onScopeDocument,
}: {
  stepId: string
  row: BisProjectRow | null
  refreshKey: number
  onEdit: (kind: BisPrintDocumentKind) => void
  onGoToStep: (index: number) => void
  renderDocActions?: (kind: BisPrintDocumentKind, onModuleEdit: () => void) => ReactNode
  docSelection?: { has: (kind: BisPrintDocumentKind) => boolean; set: (kind: BisPrintDocumentKind, selected: boolean) => void }
  /** The licence row itself changed (BIS branch) — the dialog reloads it. */
  onProjectSaved?: () => void
  /** New Scope header: preview / PDF / Word / print of the request letter (it lists the new varieties). */
  onScopeDocument?: { preview: () => void; pdf: () => void; word: () => void; print?: () => void }
}) {
  const [tick, setTick] = useState(0)
  const { payloads, loading } = useInclusionData(row, refreshKey + tick)
  const changed = () => setTick((t) => t + 1)
  if (!row) return null
  if (loading && !Object.keys(payloads).length) {
    return <p className="flex items-center justify-center gap-2 py-10 text-sm text-stone-500"><Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Loading…</p>
  }
  if (stepId === 'inc-licence') return <LicenceStep row={row} payloads={payloads} onChanged={changed} onProjectSaved={onProjectSaved} onScopeDocument={onScopeDocument} />
  if (stepId === 'inc-varieties') return <VarietiesStep row={row} payloads={payloads} onChanged={changed} onGoToStep={onGoToStep} />
  if (stepId === 'inc-lists') {
    return <ListsStep row={row} payloads={payloads} onChanged={changed} onEdit={onEdit} renderDocActions={renderDocActions} selection={docSelection} />
  }
  return <DocumentsStep row={row} payloads={payloads} onChanged={changed} onEdit={onEdit} renderDocActions={renderDocActions} selection={docSelection} />
}

/* ───────── Step 1 — Licence, existing scope (read only) and the New Scope ───────── */

async function patchDetails(projectId: string, patch: Rec) {
  const current = (await fetchBisModulePayload(projectId, INCLUSION_DETAILS_KIND)) ?? {}
  await saveBisModulePayload(projectId, INCLUSION_DETAILS_KIND, { ...current, ...patch })
}

/** The licence's scope exactly as saved on the licence — shown, never edited here. */
function ExistingScope({ notes }: { notes: string }) {
  const scope = parseBisNotesScope(sanitizeBisLicenseScopeNotes(notes))
  if (scope.mode === 'plain') {
    const lines = scope.text.split('\n').map((l) => l.trim()).filter(Boolean)
    return lines.length ? (
      <table className="w-full border-collapse">
        <thead>
          <tr>
            <th className={cn(thCls, 'w-10 text-center')}>#</th>
            <th className={thCls}>Variety</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((line, i) => (
            <tr key={i}>
              <td className={cn(tdCls, 'text-center')}>{i + 1}</td>
              <td className={tdCls}>{line}</td>
            </tr>
          ))}
        </tbody>
      </table>
    ) : (
      <p className="text-sm text-stone-500">No scope saved on the licence.</p>
    )
  }
  const rows = scope.rows.filter((r) => r.some((c) => c.trim()))
  return (
    <table className="w-full border-collapse">
      <thead>
        <tr>
          <th className={cn(thCls, 'w-10 text-center')}>#</th>
          {scope.headers.map((h, i) => (
            <th key={i} className={thCls}>{h || '—'}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i}>
            <td className={cn(tdCls, 'text-center')}>{i + 1}</td>
            {scope.headers.map((_, c) => (
              <td key={c} className={cn(tdCls, 'whitespace-pre-line')}>{r[c] || '—'}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  )
}

const branchDisplayName = (raw: string) => raw.trim().replace(/^Bureau of Indian Standards\s*[-–—:]\s*/i, '')

/** BIS branch of the licence (same list as the application's Branch Name); saved on the licence row. */
function BranchPicker({ row, onSaved }: { row: BisProjectRow; onSaved?: () => void }) {
  const [offices, setOffices] = useState<BisBranchOfficeRow[]>([])
  const [name, setName] = useState(() => str(row.branch_name))
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  useEffect(() => {
    let active = true
    void listBisBranchOffices()
      .then((list) => {
        if (active) setOffices(list)
      })
      .catch(() => undefined)
    return () => {
      active = false
    }
  }, [])
  const options = useMemo<FilterComboboxOption[]>(
    () => offices.map((o) => ({ id: o.id, label: branchDisplayName(o.name), secondaryLabel: [o.city, o.state].filter(Boolean).join(', ') })),
    [offices],
  )
  const filtered = useMemo(() => {
    const q = query.trim().toLocaleLowerCase()
    return q ? options.filter((o) => `${o.label} ${o.secondaryLabel ?? ''}`.toLocaleLowerCase().includes(q)) : options
  }, [options, query])

  const pick = async (office: BisBranchOfficeRow) => {
    const previous = name
    setName(office.name)
    setQuery(branchDisplayName(office.name))
    setOpen(false)
    const { error } = await supabase.from('bis_projects').update({ branch_name: office.name, branch_state: office.state ?? '' }).eq('id', row.id)
    if (error) {
      setName(previous)
      toast.error(error.message)
      return
    }
    toast.success('BIS branch saved')
    onSaved?.()
  }

  return (
    <div className="w-full max-w-md">
      <FilterCombobox
        inputId="inc-branch-name"
        listId="inc-branch-name-list"
        value={open ? query : branchDisplayName(name)}
        onValueChange={setQuery}
        options={filtered}
        onSelectOption={(option) => {
          const office = offices.find((o) => o.id === option.id)
          if (office) void pick(office)
        }}
        open={open}
        onOpenChange={setOpen}
        onInputFocus={() => setQuery('')}
        placeholder={offices.length ? 'Select or type to search BIS branch' : 'No BIS branch offices available'}
        disabled={offices.length === 0}
        showSerialNumbers={false}
        inputClassName="h-8 rounded-none border border-stone-300 bg-white px-2 text-sm"
      />
    </div>
  )
}

function LicenceStep({
  row,
  payloads,
  onChanged,
  onProjectSaved,
  onScopeDocument,
}: {
  row: BisProjectRow
  payloads: Partial<Record<BisPrintDocumentKind, Payload>>
  onChanged: () => void
  onProjectSaved?: () => void
  onScopeDocument?: { preview: () => void; pdf: () => void; word: () => void; print?: () => void }
}) {
  const details = payloads[INCLUSION_DETAILS_KIND] ?? {}
  const info: Array<[string, string]> = [
    ['Licence No.', row.cm_l_digits ? formatCmL(row.cm_l_digits) : '—'],
    ['Firm Name', str(row.client?.company_name) || '—'],
    ['Indian Standard', str(row.is_code?.is_number) || '—'],
    ['Manak User ID', manakLoginFromProject(row).userId || '—'],
  ]
  return (
    <ManakPanel title="Licence / Varieties of Product">
      <table className="w-full border-collapse">
        <tbody>
          {info.map(([label, value]) => (
            <tr key={label}>
              <th className={cn(tdCls, 'w-48 bg-stone-50 text-left font-semibold text-stone-800')}>{label}</th>
              <td className={tdCls}>{value}</td>
            </tr>
          ))}
          <tr>
            <th className={cn(tdCls, 'w-48 bg-stone-50 text-left font-semibold text-stone-800')}>BIS Branch</th>
            <td className={tdCls}>
              <BranchPicker row={row} onSaved={onProjectSaved} />
            </td>
          </tr>
        </tbody>
      </table>
      <ManakSubPanel title="Existing Scope of License">
        <ExistingScope notes={String(row.notes ?? '')} />
      </ManakSubPanel>
      <ManakVarietiesTable
        projectId={row.id}
        isCodeId={row.is_code_id ?? null}
        isNumber={str(row.is_code?.is_number)}
        varieties={[]}
        scopeNotes={str(details.newScope)}
        saveNotes={(notes) => patchDetails(row.id, { newScope: notes })}
        filesDocKind={INCLUSION_SCOPE_FILES_KIND}
        scopeDocument={onScopeDocument}
        scopeDocumentLabel="Inclusion Request Letter & Undertaking"
        onScopeSaved={onChanged}
        panel={(headerExtra, body) => (
          <ManakSubPanel title="New Scope (Varieties for Inclusion)" headerExtra={headerExtra}>
            {body}
          </ManakSubPanel>
        )}
      />
    </ManakPanel>
  )
}

/* ───────── Step 3 — Add Varieties (one Manak row per New Scope variety) ───────── */

function VarietiesStep({
  row,
  payloads,
  onChanged,
  onGoToStep,
}: {
  row: BisProjectRow
  payloads: Partial<Record<BisPrintDocumentKind, Payload>>
  onChanged: () => void
  onGoToStep: (index: number) => void
}) {
  const details = payloads[INCLUSION_DETAILS_KIND] ?? {}
  // The Variety drop-down offers the New Scope rows (Step 1); one Manak "Add Variety" row per row added here.
  const varieties = newScopeVarieties(details)
  const samples = rowsOf(payloads['osl-sample-requirements']).filter((s) => str(s.qrCode) || str(s.batchNumber))
  const qrOptions = Array.from(new Set(samples.map((s) => str(s.qrCode).replace(/\D/g, '')).filter(Boolean)))
  const qrOnly = (v: string) => (v.match(/\d{6,}/g) ?? []).join(', ')

  return (
    <ManakPanel title="Add Varieties">
      {varieties.length ? (
        <EditableRows
          projectId={row.id}
          kind={INCLUSION_DETAILS_KIND}
          fields={[
            { key: 'variety', label: 'Variety (New Scope)', alignLeft: true, options: varieties },
            { key: 'inclusionType', label: 'Inclusion Type', options: [...INCLUSION_TYPES], width: '11rem' },
            { key: 'qrCode', label: 'Sample QR Code', optional: true, width: '14rem', options: qrOptions, multiple: true, normalize: qrOnly },
            { key: 'delayReason', label: 'Reason for Delay', optional: true, alignLeft: true, width: '13rem', placeholder: 'Not Applicable', normalize: (v) => v.trim() || 'Not Applicable' },
          ]}
          blank={() => ({ variety: '', inclusionType: 'With Test Report', qrCode: '', delayReason: 'Not Applicable' })}
          saved={rowsOf(details).map((r) => ({ ...r, qrCode: qrOnly(str(r.qrCode)) }))}
          onChanged={onChanged}
          addLabel="Add variety"
        />
      ) : (
        <div className="border border-dashed border-stone-300 bg-white px-3 py-6 text-center text-sm text-stone-500">
          No New Scope yet.{' '}
          <button type="button" className="font-semibold text-amber-800 underline" onClick={() => onGoToStep(0)}>
            Add the varieties for inclusion on Step 1
          </button>
          .
        </div>
      )}
    </ManakPanel>
  )
}

/* ───────── Step 4 — Declaration by the Licensee (additional machinery / testing equipment) ───────── */

/** Existing licence rows show "No"; rows added here default to "Yes" (only those go in the Manak list). */
const additionField = {
  key: INCLUSION_ADDITION_KEY,
  label: 'Added for\nInclusion',
  options: ['Yes', 'No'],
  width: '6.5rem',
}
const withAdditionDefault = (rows: Rec[]) => rows.map((r) => ({ ...r, [INCLUSION_ADDITION_KEY]: isInclusionAddition(r) ? 'Yes' : 'No' }))

function ListsStep({
  row,
  payloads,
  onChanged,
  onEdit,
  renderDocActions,
  selection,
}: {
  row: BisProjectRow
  payloads: Partial<Record<BisPrintDocumentKind, Payload>>
  onChanged: () => void
  onEdit: (kind: BisPrintDocumentKind) => void
  renderDocActions?: (kind: BisPrintDocumentKind, onModuleEdit: () => void) => ReactNode
  selection?: { has: (kind: BisPrintDocumentKind) => boolean; set: (kind: BisPrintDocumentKind, selected: boolean) => void }
}) {
  const components = payloads[INCLUSION_COMPONENTS_KIND] ?? null
  const machineryAdded = rowsOf(payloads['cmpf-305']).filter(isInclusionAddition).length
  const equipmentAdded = rowsOf(payloads['cmpf-306']).filter(isInclusionAddition).length
  const [pending, setPending] = useState<Record<string, YesNo>>({})
  const required = (key: 'machinery' | 'equipment', added: number): YesNo =>
    pending[key] ?? (inclusionRequired(components, key, added) ? 'Yes' : 'No')

  const setRequired = async (key: 'machinery' | 'equipment', value: YesNo) => {
    setPending((p) => ({ ...p, [key]: value }))
    try {
      const current = (await fetchBisModulePayload(row.id, INCLUSION_COMPONENTS_KIND)) ?? {}
      const applicable = current.applicable && typeof current.applicable === 'object' ? (current.applicable as Rec) : {}
      await saveBisModulePayload(row.id, INCLUSION_COMPONENTS_KIND, { ...current, applicable: { ...applicable, [key]: value } })
      onChanged()
    } catch (err) {
      setPending((p) => {
        const next = { ...p }
        delete next[key]
        return next
      })
      toast.error(err instanceof Error ? err.message : 'Could not save')
    }
  }

  const machinery: StepComponent = {
    key: 'machinery',
    label: '1. Additional Manufacturing Machinery / Facility required for the new variety(s)?',
    popupTitle: 'Manufacturing Machinery (CMPF-305) — mark the machinery added for this inclusion',
    printKind: 'inclusion-cmpf-305',
    defaultApplicable: 'No',
    choice: { value: required('machinery', machineryAdded), onChange: (v) => void setRequired('machinery', v), actionsWhen: 'Yes', offText: 'Not Required' },
    popup: () => (
      <EditableRows
        projectId={row.id}
        kind="cmpf-305"
        fields={[
          { key: 'machineryName', label: 'Name of the Machinery', alignLeft: true },
          { key: 'make', label: 'Make', width: '10rem' },
          { key: 'capacityPerDay', label: 'Production Capacity', width: '10rem' },
          { key: 'number', label: 'Number', width: '7rem' },
          { key: 'remarks', label: 'Remarks', optional: true, width: '10rem' },
          additionField,
        ]}
        blank={() => ({ machineryName: '', make: '', capacityPerDay: '', number: '', remarks: '', [INCLUSION_ADDITION_KEY]: 'Yes' })}
        saved={withAdditionDefault(rowsOf(payloads['cmpf-305']))}
        onChanged={onChanged}
        addLabel="Add machinery"
      />
    ),
  }

  const equipment: StepComponent = {
    key: 'equipment',
    label: '2. Additional Testing Equipment / Facility required for the new variety(s)?',
    popupTitle: 'Testing Equipment (CMPF-306) — mark the equipment added for this inclusion',
    printKind: 'inclusion-cmpf-306',
    defaultApplicable: 'No',
    choice: { value: required('equipment', equipmentAdded), onChange: (v) => void setRequired('equipment', v), actionsWhen: 'Yes', offText: 'Not Required' },
    popup: () => (
      <EditableRows
        projectId={row.id}
        kind="cmpf-306"
        fields={[
          { key: 'equipmentName', label: 'Equipment', alignLeft: true, placeholder: 'Test Equipment / Chemical' },
          { key: 'make', label: 'Make', alignLeft: true, width: '10rem' },
          { key: 'leastCount', label: 'Least Count', optional: true, width: '7rem' },
          { key: 'range', label: 'Range', optional: true, width: '7rem' },
          {
            key: 'calibrationStatus',
            label: 'Calibration\nStatus',
            options: ['Yes', 'No'],
            width: '6.5rem',
            normalize: (v, r) => cmpf306CalibrationStatus({ ...r, calibrationStatus: v }),
          },
          { key: 'clauseNo', label: 'Clause No.', optional: true, width: '7rem' },
          { key: 'quantity', label: 'Qty', optional: true, width: '5rem', placeholder: '1 Nos', normalize: cmpf306QuantityNos },
          additionField,
        ]}
        blank={() => ({ equipmentName: '', make: '', leastCount: '', range: '', calibrationStatus: 'Yes', clauseNo: '', quantity: '1 Nos', [INCLUSION_ADDITION_KEY]: 'Yes' })}
        saved={withAdditionDefault(rowsOf(payloads['cmpf-306']).map(normalizeCmpf306Row))}
        onChanged={onChanged}
        addLabel="Add testing equipment"
      />
    ),
  }

  return (
    <ManakComponentsTable
      title="Declaration by the Licensee"
      componentHeading="Declaration"
      componentsKind={INCLUSION_COMPONENTS_KIND}
      components={[machinery, equipment]}
      projectId={row.id}
      projectRow={row}
      payloads={payloads}
      onChanged={onChanged}
      onEdit={onEdit}
      renderDocActions={renderDocActions}
      selection={selection}
    />
  )
}

/* ───────── Step 5 — Request letter & other documents ───────── */

function DocumentsStep({
  row,
  payloads,
  onChanged,
  onEdit,
  renderDocActions,
  selection,
}: {
  row: BisProjectRow
  payloads: Partial<Record<BisPrintDocumentKind, Payload>>
  onChanged: () => void
  onEdit: (kind: BisPrintDocumentKind) => void
  renderDocActions?: (kind: BisPrintDocumentKind, onModuleEdit: () => void) => ReactNode
  selection?: { has: (kind: BisPrintDocumentKind) => boolean; set: (kind: BisPrintDocumentKind, selected: boolean) => void }
}) {
  const [letterOpen, setLetterOpen] = useState(false)
  const letter: StepComponent = {
    key: 'request-letter',
    label: 'Inclusion Request Letter & Undertaking',
    printKind: 'inclusion-request-letter',
    defaultApplicable: 'Yes',
    onEdit: () => setLetterOpen(true),
  }
  const letterOn = (() => {
    const map = payloads[INCLUSION_COMPONENTS_KIND]?.applicable
    return !(map && typeof map === 'object' && (map as Rec)['request-letter'] === 'No')
  })()
  return (
    <ManakComponentsTable
      title="Request Letter & Other Documents"
      componentHeading="Document"
      componentsKind={INCLUSION_COMPONENTS_KIND}
      components={[letter]}
      projectId={row.id}
      projectRow={row}
      payloads={payloads}
      onChanged={onChanged}
      onEdit={onEdit}
      renderDocActions={renderDocActions}
      selection={selection}
      after={
        <>
          <OtherDocuments row={row} letterOn={letterOn} />
          <InclusionLetterDialog row={row} open={letterOpen} onOpenChange={setLetterOpen} onSaved={onChanged} />
        </>
      }
    />
  )
}

/** Green PDF icon: click to view, double-click to delete (the single-click waits so a double-click never opens it). */
function PdfFileButton({ title, onView, onDelete, confirmDelete = true }: { title: string; onView: () => void; onDelete: () => void; confirmDelete?: boolean }) {
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  useEffect(() => () => clearTimeout(timer.current), [])
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      className="inline-flex h-8 w-8 items-center justify-center rounded-none border border-green-800 bg-green-600 p-0 text-white shadow-sm hover:bg-green-700"
      onClick={() => {
        clearTimeout(timer.current)
        timer.current = setTimeout(onView, 250)
      }}
      onDoubleClick={() => {
        clearTimeout(timer.current)
        if (!confirmDelete || window.confirm('Delete this document?')) onDelete()
      }}
    >
      <FileCheck2 className="h-4 w-4" aria-hidden />
    </button>
  )
}

/** Named PDFs merged (in this order, after the request letter) into Manak's single "Any Other Document". */
function OtherDocuments({ row, letterOn }: { row: BisProjectRow; letterOn: boolean }) {
  const [files, setFiles] = useState<BisProjectViewFile[]>([])
  const [tick, setTick] = useState(0)
  const [name, setName] = useState('')
  const [picked, setPicked] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [names, setNames] = useState<Record<string, string>>({})
  const [openPdf, pdfViewer] = usePdfViewer()
  const [letterBusy, setLetterBusy] = useState(false)

  /** The generated letter, rendered as the PDF Manak Assist merges first. */
  const viewLetter = async () => {
    setLetterBusy(true)
    try {
      const settings = await loadBisProjectPrintPageSettings(row.id).catch(() => DEFAULT_BIS_DOCUMENT_PRINT_PAGE_SETTINGS)
      const blob = await buildBisDocumentPdfBlob(row, 'inclusion-request-letter', settings)
      openPdf(URL.createObjectURL(blob), 'Inclusion Request Letter & Undertaking')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not build the letter PDF')
    } finally {
      setLetterBusy(false)
    }
  }

  useEffect(() => {
    let active = true
    listBisProjectFiles(row.id, INCLUSION_OTHER_DOCS_KIND)
      .then((list) => {
        if (active) setFiles(list)
      })
      .catch((err) => toast.error(formatBisProjectFilesError(err)))
    return () => {
      active = false
    }
  }, [row.id, tick])

  const add = async () => {
    if (!name.trim()) {
      toast.error('Document name is required.')
      return
    }
    if (!picked) {
      toast.error('Choose the PDF file.')
      return
    }
    setBusy(true)
    try {
      await uploadBisProjectFile(row.id, picked, INCLUSION_OTHER_DOCS_KIND, { displayName: name.trim() })
      setName('')
      setPicked(null)
      setTick((t) => t + 1)
      toast.success('Document added')
    } catch (err) {
      toast.error(formatBisProjectFilesError(err))
    } finally {
      setBusy(false)
    }
  }

  const rename = async (file: BisProjectViewFile) => {
    const next = (names[file.id] ?? file.file_name).trim()
    if (!next || next === file.file_name) return
    try {
      await updateBisProjectFileName(file.id, next)
      setTick((t) => t + 1)
    } catch (err) {
      toast.error(formatBisProjectFilesError(err))
    }
  }

  const view = async (file: BisProjectViewFile) => {
    try {
      const urls = await createBisProjectFileUrls(file.storage_path, file.file_name)
      openPdf(urls.viewUrl, file.file_name)
    } catch (err) {
      toast.error(formatBisProjectFilesError(err))
    }
  }

  const remove = async (file: BisProjectViewFile) => {
    if (!window.confirm(`Delete ${file.file_name}?`)) return
    try {
      await deleteBisProjectFile(file)
      setTick((t) => t + 1)
    } catch (err) {
      toast.error(formatBisProjectFilesError(err))
    }
  }

  const mergedPdf = async () => {
    setBusy(true)
    try {
      const blob = await buildInclusionOtherDocumentPdf(row)
      if (!blob) {
        toast.error('Nothing to merge yet.')
        return
      }
      openPdf(URL.createObjectURL(blob), 'Any Other Document (merged)')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not build the merged PDF')
    } finally {
      setBusy(false)
    }
  }

  return (
    <ManakSubPanel
      title="Other Documents (merged into Manak's “Any Other Document”)"
      headerExtra={
        <button
          type="button"
          onClick={() => void mergedPdf()}
          disabled={busy}
          className="inline-flex items-center gap-1 rounded-none border border-amber-500/40 bg-stone-800/80 px-2 py-0.5 text-[11px] font-medium normal-case tracking-normal text-amber-100 hover:bg-amber-500/20 disabled:opacity-50"
        >
          <FileDown className="h-3 w-3" aria-hidden /> Merged PDF
        </button>
      }
    >
      <table className="w-full border-collapse">
        <thead>
          <tr>
            <th className={cn(thCls, 'w-12 text-center')}>S.No.</th>
            <th className={thCls}>Document Name</th>
            <th className={cn(thCls, 'w-24 text-center')}>Action</th>
          </tr>
        </thead>
        <tbody>
          {letterOn ? (
            <tr>
              <td className={cn(tdCls, 'text-center')}>1</td>
              <td className={tdCls}>Inclusion Request Letter &amp; Undertaking</td>
              <td className={cn(tdCls, 'text-center')}>
                <button
                  type="button"
                  title="Inclusion Request Letter & Undertaking — view PDF"
                  aria-label="View the request letter PDF"
                  disabled={busy}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-none border border-green-800 bg-green-600 p-0 text-white shadow-sm hover:bg-green-700 disabled:opacity-60"
                  onClick={() => void viewLetter()}
                >
                  {letterBusy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <FileCheck2 className="h-4 w-4" aria-hidden />}
                </button>
              </td>
            </tr>
          ) : null}
          {files.map((file, i) => (
            <tr key={file.id}>
              <td className={cn(tdCls, 'text-center')}>{i + (letterOn ? 2 : 1)}</td>
              <td className={tdCls}>
                <input
                  className={inputCls}
                  value={names[file.id] ?? file.file_name}
                  onChange={(e) => setNames((n) => ({ ...n, [file.id]: e.target.value }))}
                  onBlur={() => void rename(file)}
                  aria-label={`Name of document ${i + (letterOn ? 2 : 1)}`}
                />
              </td>
              <td className={cn(tdCls, 'text-center')}>
                <PdfFileButton
                  title={`${file.file_name} — click to view, double-click to delete`}
                  onView={() => void view(file)}
                  onDelete={() => void remove(file)}
                  confirmDelete={false}
                />
              </td>
            </tr>
          ))}
          <tr className="bg-amber-50/40">
            <td className={cn(tdCls, 'text-center text-stone-400')}>+</td>
            <td className={tdCls}>
              <input
                className={inputCls}
                placeholder="Document name (e.g. Test Report, Drawing)"
                value={name}
                onChange={(e) => setName(e.target.value)}
                aria-label="Name of the new document"
              />
            </td>
            <td className={cn(tdCls, 'text-center')}>
              <div className="inline-flex items-center gap-1">
                {picked ? (
                  <PdfFileButton
                    title={`${picked.name} — click to view, double-click to remove`}
                    onView={() => openPdf(URL.createObjectURL(picked), picked.name)}
                    onDelete={() => setPicked(null)}
                    confirmDelete={false}
                  />
                ) : (
                  <label
                    title="Upload PDF"
                    aria-label="Upload PDF"
                    className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-none border border-red-700 bg-red-600 p-0 text-white shadow-sm hover:bg-red-700"
                  >
                    <Upload className="h-4 w-4" aria-hidden />
                    <input
                      type="file"
                      accept="application/pdf,.pdf"
                      className="sr-only"
                      onChange={(e) => {
                        const f = e.target.files?.[0] ?? null
                        e.target.value = ''
                        if (f && !(f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf'))) {
                          toast.error('Only PDF files can be added.')
                          return
                        }
                        setPicked(f)
                        if (f && !name.trim()) setName(f.name.replace(/\.pdf$/i, ''))
                      }}
                    />
                  </label>
                )}
                <Button
                  type="button"
                  className="h-8 w-8 rounded-none bg-amber-700 p-0 text-white shadow-sm hover:bg-amber-800"
                  title="Add document"
                  aria-label="Add document"
                  disabled={busy}
                  onClick={() => void add()}
                >
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Plus className="h-4 w-4" aria-hidden />}
                </Button>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
      {pdfViewer}
    </ManakSubPanel>
  )
}
