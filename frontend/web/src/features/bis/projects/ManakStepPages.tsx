import { Fragment, useEffect, useState, type ReactNode } from 'react'
import { Pencil } from 'lucide-react'
import { cn } from '@/lib/utils'
import { loadBisPrintData, type BisPrintData } from '../print/loadBisPrintData'
import { BIS_PRINT_DOCUMENT_LABEL, type BisPrintDocumentKind } from '../print/printBisDocument'
import { supabase } from '@/lib/supabaseClient'
import { listClientCertificates, type ClientCertificateFile } from '@/features/masters/clients/clientsApi'
import { fetchBisModulePayload } from './bisModuleDataApi'
import { listSites, type ClientSiteRow } from '@/features/masters/clients/clientLinkApi'
import { listBisBranchOffices, type BisBranchOfficeRow } from '@/features/masters/bis-branch-offices/bisBranchOfficesApi'
import { ManakGeneralStep } from './ManakGeneralStep'
import { ManakVarietiesTable } from './ManakVarietiesTable'
import { CORRESPONDENCE_KIND, ManakManagementStep } from './ManakManagementStep'
import type { BisProjectRow } from './types'

/* ───────── Manak Online look: blue section bars, light-blue sub-panels, label / value grids ───────── */

export function ManakPanel({
  title,
  children,
  onEdit,
  editLabel = 'Edit',
}: {
  title: string
  children: ReactNode
  onEdit?: () => void
  editLabel?: string
}) {
  return (
    <section className="mb-4 border-2 border-stone-500 bg-[#fffcf7] ring-1 ring-amber-700/20">
      <header className="flex items-center justify-between bg-gradient-to-br from-stone-800 via-stone-900 to-stone-950 px-3 py-2 text-sm text-white">
        <h3 className="font-semibold tracking-tight">{title}</h3>
        {onEdit ? (
          <button
            type="button"
            onClick={onEdit}
            className="inline-flex items-center gap-1 rounded-sm rounded-none border border-amber-500/40 bg-stone-800/80 px-2 py-0.5 text-xs font-medium text-amber-100 hover:bg-amber-500/20"
          >
            <Pencil className="h-3 w-3" aria-hidden /> {editLabel}
          </button>
        ) : null}
      </header>
      <div className="space-y-3 p-3">{children}</div>
    </section>
  )
}

export function ManakSubPanel({
  title,
  children,
  onEdit,
  headerExtra,
}: {
  title: string
  children: ReactNode
  onEdit?: () => void
  /** Extra control shown on the right of the header (for example a checkbox). */
  headerExtra?: ReactNode
}) {
  return (
    <div className="border border-stone-300 bg-white">
      <div className="flex items-center justify-between bg-stone-800 px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.14em] text-amber-200">
        <span>{title}</span>
        {headerExtra}
        {onEdit ? (
          <button
            type="button"
            onClick={onEdit}
            className="inline-flex items-center gap-1 rounded-none border border-amber-500/40 bg-stone-800/80 px-2 py-0.5 text-[11px] font-medium normal-case tracking-normal text-amber-100 hover:bg-amber-500/20"
          >
            <Pencil className="h-3 w-3" aria-hidden /> Edit
          </button>
        ) : null}
      </div>
      <div className="p-3">{children}</div>
    </div>
  )
}

/**
 * Lay fields out in three columns, grouping labels of similar length so each label column is only as
 * wide as its own longest label (short labels together, long labels together). Order inside a column is kept.
 */
export function arrangeByLabelLength<T>(items: Array<[string, T]>): Array<Array<[string, T] | null>> {
  const perColumn = Math.ceil(items.length / 3)
  const byLength = items.map((item, index) => ({ item, index })).sort((a, b) => a.item[0].length - b.item[0].length || a.index - b.index)
  const columns: Array<Array<[string, T]>> = [0, 1, 2].map((c) =>
    byLength
      .slice(c * perColumn, (c + 1) * perColumn)
      .sort((a, b) => a.index - b.index)
      .map((x) => x.item),
  )
  const rows: Array<Array<[string, T] | null>> = []
  for (let r = 0; r < perColumn; r += 1) rows.push(columns.map((col) => col[r] ?? null))
  return rows
}

export function ManakFields({ items }: { items: Array<[string, ReactNode]> }) {
  // Grid layout: three label | value pairs per row. Label columns shrink to their text; value columns share the rest.
  const rows = arrangeByLabelLength(items)
  const labelCls =
    'w-[1%] whitespace-nowrap border border-[#e7e0d4] bg-[#f7f3eb] px-3 py-1.5 text-left align-top text-sm font-bold text-stone-800'
  const valueCls = 'w-[32%] break-words border border-[#e7e0d4] px-3 py-1.5 align-top text-sm text-stone-700'
  return (
    <div className="overflow-x-auto">
      <table className="w-full table-auto border-collapse">
        <tbody>
          {rows.map((pair, i) => (
            <tr key={i}>
              {pair.map((cell, j) =>
                cell ? (
                  <Fragment key={j}>
                    <th scope="row" className={labelCls}>
                      {cell[0]}:
                    </th>
                    <td className={valueCls}>
                      {cell[1] || <span className="text-stone-400">—</span>}
                    </td>
                  </Fragment>
                ) : (
                  <Fragment key={j}>
                    <th className={labelCls} />
                    <td className={valueCls} />
                  </Fragment>
                ),
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function ManakTable({
  head,
  rows,
  empty = 'No records yet.',
}: {
  head: string[]
  rows: ReactNode[][]
  empty?: string
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr>
            {head.map((h) => (
              <th key={h} className="border border-stone-700 bg-stone-800 px-2 py-1.5 text-left text-[11px] font-bold uppercase tracking-[0.1em] text-amber-200">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={head.length} className="border border-[#e7e0d4] px-2 py-3 text-center text-stone-500">
                {empty}
              </td>
            </tr>
          ) : (
            rows.map((cells, i) => (
              <tr key={i} className={i % 2 ? 'bg-[#f7f3eb]' : 'bg-[#fffcf7]'}>
                {cells.map((c, j) => (
                  <td key={j} className="border border-[#e7e0d4] px-2 py-1.5 align-top text-stone-700">
                    {c}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  )
}

/* ───────── data ───────── */

type Payload = Record<string, unknown> | null


const STEP_MODULES: BisPrintDocumentKind[] = [
  'top-management',
  'technical-staff',
  'raw-material-reference',
  'cmpf-305',
  'cmpf-306',
  'cmpf-307',
  'cmpf-311',
  'osl-sample-requirements',
  CORRESPONDENCE_KIND,
]

type StepData = {
  print: BisPrintData | null
  clientRaw: Record<string, unknown> | null
  certificates: ClientCertificateFile[]
  sites: ClientSiteRow[]
  projectRaw: Record<string, unknown> | null
  branches: BisBranchOfficeRow[]
  payloads: Partial<Record<BisPrintDocumentKind, Payload>>
  loading: boolean
  error: string
}

function useStepData(row: BisProjectRow | null, refreshKey: number): StepData {
  const [state, setState] = useState<StepData>({ print: null, clientRaw: null, certificates: [], sites: [], projectRaw: null, branches: [], payloads: {}, loading: false, error: '' })
  useEffect(() => {
    if (!row?.id) {
      setState({ print: null, clientRaw: null, certificates: [], sites: [], projectRaw: null, branches: [], payloads: {}, loading: false, error: '' })
      return
    }
    let cancelled = false
    setState((s) => ({ ...s, loading: true, error: '' }))
    void (async () => {
      try {
        const [print, clientRes, certs, siteRows, projectRes, branchRows, ...loaded] = await Promise.all([
          loadBisPrintData(row),
          row.client_id
            ? supabase.from('clients').select('*').eq('id', row.client_id).maybeSingle()
            : Promise.resolve({ data: null }),
          row.client_id ? listClientCertificates(row.client_id).catch(() => []) : Promise.resolve([]),
          row.client_id ? listSites(row.client_id) : Promise.resolve([]),
          supabase.from('bis_projects').select('*').eq('id', row.id).maybeSingle(),
          listBisBranchOffices().catch(() => [] as BisBranchOfficeRow[]),
          ...STEP_MODULES.map((k) => fetchBisModulePayload(row.id, k).catch(() => null)),
        ])
        if (cancelled) return
        const payloads: StepData['payloads'] = {}
        STEP_MODULES.forEach((k, i) => {
          payloads[k] = loaded[i] as Payload
        })
        setState({
          print,
          clientRaw: (clientRes.data as Record<string, unknown> | null) ?? null,
          certificates: certs,
          sites: siteRows,
          projectRaw: (projectRes.data as Record<string, unknown> | null) ?? null,
          branches: branchRows,
          payloads,
          loading: false,
          error: '',
        })
      } catch (err) {
        if (!cancelled) {
          setState({ print: null, clientRaw: null, certificates: [], sites: [], projectRaw: null, branches: [], payloads: {}, loading: false, error: err instanceof Error ? err.message : 'Could not load data' })
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [row, refreshKey])
  return state
}

function s(v: unknown): string {
  return typeof v === 'string' ? v.trim() : v == null ? '' : String(v).trim()
}

function list(p: Payload | undefined, key: string): Array<Record<string, unknown>> {
  const v = p?.[key]
  return Array.isArray(v) ? (v as Array<Record<string, unknown>>) : []
}

const yesNo = (v: unknown) => (s(v) ? 'Yes' : 'No')

/* ───────── step pages ───────── */

export function ManakStepPage({
  stepId,
  row,
  refreshKey,
  onEdit,
  documents,
  onLocationMapPreview,
  onLocationMapPdf,
  onProjectSaved,
}: {
  stepId: string
  row: BisProjectRow | null
  refreshKey: number
  onEdit: (kind: BisPrintDocumentKind) => void
  /** Existing document rows (view / print / PDF / generate) for this step. */
  documents: ReactNode
  /** Location map preview (single click) and PDF download (double click) from the documents dialog. */
  onLocationMapPreview?: () => void
  onLocationMapPdf?: () => void
  onProjectSaved?: () => void
}) {
  const [reloadTick, setReloadTick] = useState(0)
  const { print, clientRaw, certificates, sites, projectRaw, branches, payloads, loading, error } = useStepData(row, refreshKey + reloadTick)
  const edit = (kind: BisPrintDocumentKind) => () => onEdit(kind)
  const c = print?.client
  const isCode = print?.isCode

  let body: ReactNode = null

  if (stepId === 'general') {
    const varieties = list(payloads['osl-sample-requirements'], 'rows')
      .map((r) => s(r.gradeTypeVariety))
      .filter(Boolean)
    const linked = !s(row?.cm_l_digits) && row?.project_kind !== 'Licence'
    body = (
      <ManakGeneralStep
        row={row}
        client={c}
        clientRaw={clientRaw}
        certificates={certificates}
        sites={sites}
        linked={linked}
        projectRaw={projectRaw}
        branches={branches}
        onLocationMapPreview={onLocationMapPreview}
        onLocationMapPdf={onLocationMapPdf}
        onProjectSaved={onProjectSaved}
        onChanged={() => setReloadTick((t) => t + 1)}
      >
        <ManakSubPanel title="Indian Standard Details">
          <ManakFields
            items={[
              ['Standard Number', isCode?.label],
              ['Standard Title', isCode?.title],
              ['Product Manual', isCode?.productManualNumber],
            ]}
          />
        </ManakSubPanel>
        <ManakSubPanel title="Varieties">
          <ManakVarietiesTable
            onEdit={edit('osl-sample-requirements')}
            projectId={row?.id ?? null}
            isCodeId={row?.is_code_id ?? null}
            isNumber={isCode?.label || isCode?.isNumber || ''}
            varieties={varieties}
          />
        </ManakSubPanel>
      </ManakGeneralStep>
    )
  } else if (stepId === 'management') {
    body = row?.id ? (
      <ManakManagementStep
        projectId={row.id}
        client={c}
        topManagement={payloads['top-management']}
        technicalStaff={payloads['technical-staff']}
        correspondence={payloads[CORRESPONDENCE_KIND]}
        onChanged={() => setReloadTick((t) => t + 1)}
        onOpenModule={onEdit}
      />
    ) : null
  } else if (stepId === 'manufacturing') {
    const raw = list(payloads['raw-material-reference'], 'rawMaterials')
    const mach = list(payloads['cmpf-305'], 'rows')
    body = (
      <>
        <ManakPanel title="Manufacturing Process Details" onEdit={edit('raw-material-reference')}>
          <ManakSubPanel title="Raw Material Details">
            <ManakTable
              head={['S.No.', 'Raw material (With Grade Details, if any)', 'Name of Supplier', 'Conformity of Material', 'How Received Batches/Lots Nature of Package']}
              rows={raw.map((r, i) => [
                i + 1,
                s(r.rawMaterial),
                s(r.supplierName),
                [s(r.bisCertificationMark) && `ISI mark: ${s(r.bisCertificationMark)}`, s(r.testCertificate) && `Test certificate: ${s(r.testCertificate)}`]
                  .filter(Boolean)
                  .join(' · '),
                s(r.batchesPackaging),
              ])}
            />
          </ManakSubPanel>
          <ManakSubPanel title="Process Flow-Chart · Layout Plan">
            <p className="text-sm text-stone-700">
              Generated from the {BIS_PRINT_DOCUMENT_LABEL['process-flow-chart']} and {BIS_PRINT_DOCUMENT_LABEL['plant-layout']} modules — use
              the document rows below to create, view or download them (no upload needed).
            </p>
          </ManakSubPanel>
        </ManakPanel>
        <ManakPanel title="Manufacturing Machinery List" onEdit={edit('cmpf-305')}>
          <ManakTable
            head={['S.No.', 'Machinery', 'Make', 'Capacity / day', 'Number', 'Remarks']}
            rows={mach.map((r, i) => [i + 1, s(r.machineryName), s(r.make), s(r.capacityPerDay), s(r.number), s(r.remarks)])}
          />
        </ManakPanel>
      </>
    )
  } else if (stepId === 'packaging') {
    const brands = list(payloads['cmpf-307'], 'rows').filter((r) => s(r.brandName))
    body = (
      <ManakPanel title="Packaging And Brand Details" onEdit={edit('cmpf-307')}>
        <ManakSubPanel title="Brand Details">
          <ManakTable
            head={['S.No.', 'Brand Names / Trademark(s)', 'Owned by self or others', 'Registered/Unregistered', 'Date of Registration/Introduction', 'Uploaded File']}
            rows={brands.map((r, i) => [i + 1, s(r.brandName), s(r.ownedBy), s(r.registeredStatus), s(r.registrationDate), yesNo(r.trademarkFileId)])}
          />
        </ManakSubPanel>
      </ManakPanel>
    )
  } else if (stepId === 'testing') {
    const eq = list(payloads['cmpf-306'], 'rows')
    const p311 = payloads['cmpf-311']
    body = (
      <>
        <ManakPanel title="Testing And Inspection" onEdit={edit('cmpf-306')}>
          <ManakSubPanel title="List of Testing Equipment">
            <ManakTable
              head={['S.No.', 'Equipment', 'Make', 'Least count', 'Range', 'Calibration status', 'Clause No.', 'Qty']}
              rows={eq.map((r, i) => [i + 1, s(r.equipmentName), s(r.make), s(r.leastCount), s(r.range), s(r.calibrationStatus), s(r.clauseNo), s(r.quantity)])}
            />
          </ManakSubPanel>
        </ManakPanel>
        <ManakPanel title="Scheme of Inspection & Testing / Sub-contracted tests" onEdit={edit('cmpf-311')}>
          <ManakFields
            items={[
              ['Product Manual', s(p311?.productManualNumber)],
              ['Test rows', String(list(p311, 'testRows').length)],
              ['Sub-contracted laboratory', s(p311?.subcontractedLaboratoryName)],
            ]}
          />
        </ManakPanel>
      </>
    )
  } else if (stepId === 'test-reports') {
    const rows = list(payloads['osl-sample-requirements'], 'rows')
    body = (
      <ManakPanel title="Test Report - Option 2" onEdit={edit('osl-sample-requirements')}>
        <ManakTable
          head={['S.No.', 'Product variety description', 'QR Code', 'Sample Code', 'Test Report', 'Test Request', 'Courier slip']}
          rows={rows.map((r, i) => [
            i + 1,
            s(r.gradeTypeVariety) || s(r.sampleDescription),
            s(r.qrCode),
            s(r.sampleCode),
            yesNo(r.testReportFileId),
            yesNo(r.testRequestFileId),
            yesNo(r.courierSlipFileId),
          ])}
          empty="No sample rows yet — add them in Sample Requirements."
        />
      </ManakPanel>
    )
  } else if (stepId === 'declaration') {
    const tm = payloads['top-management']
    body = (
      <ManakPanel title="Declaration and Undertaking" onEdit={edit('all-required-undertakings')}>
        <ManakSubPanel title="Miscellaneous Declaration">
          <ManakFields
            items={[
              ['Name of Person submitting the application', s(tm?.signatoryName) || c?.contactPerson],
              ['Designation of Person submitting the application', s(tm?.signatoryDesignation)],
            ]}
          />
        </ManakSubPanel>
        <p className="text-sm text-stone-700">
          Undertakings and the Self Evaluation Form are generated from the module — see the document rows below.
        </p>
      </ManakPanel>
    )
  }

  return (
    <div className="font-jakarta">
      {loading ? <p className="mb-2 text-xs text-stone-500">Loading application data…</p> : null}
      {error ? <p className="mb-2 text-xs text-red-700">{error}</p> : null}
      <div className={cn(loading && 'opacity-60')}>{body}</div>
      {/* Step 1 no longer needs the documents list: everything is edited in place above. */}
      {stepId !== 'general' ? <ManakPanel title="Documents (create · view · print · download)">{documents}</ManakPanel> : null}
    </div>
  )
}
