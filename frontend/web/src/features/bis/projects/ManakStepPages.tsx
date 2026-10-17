import { Fragment, useEffect, useState, type ReactNode } from 'react'
import { Pencil } from 'lucide-react'
import { cn } from '@/lib/utils'
import { loadBisPrintData, type BisPrintData } from '../print/loadBisPrintData'
import { BIS_PRINT_DOCUMENT_LABEL, type BisPrintDocumentKind } from '../print/printBisDocument'
import { supabase } from '@/lib/supabaseClient'
import { listClientCertificates, type ClientCertificateFile } from '@/features/masters/clients/clientsApi'
import { fetchBisModulePayload } from './bisModuleDataApi'
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
}: {
  title: string
  children: ReactNode
  onEdit?: () => void
}) {
  return (
    <div className="border border-stone-300 bg-white">
      <div className="flex items-center justify-between bg-stone-800 px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.14em] text-amber-200">
        <span>{title}</span>
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

export function ManakFields({ items }: { items: Array<[string, ReactNode]> }) {
  // Grid layout: label | value | label | value. Label columns shrink to their text; value columns share the rest.
  const rows: Array<Array<[string, ReactNode] | null>> = []
  for (let i = 0; i < items.length; i += 2) rows.push([items[i], items[i + 1] ?? null])
  const labelCls =
    'w-[1%] whitespace-nowrap border border-[#e7e0d4] bg-[#f7f3eb] px-3 py-1.5 text-left align-top text-sm font-bold text-stone-800'
  const valueCls = 'w-[49%] break-words border border-[#e7e0d4] px-3 py-1.5 align-top text-sm text-stone-700'
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

/** Legal-document names that serve as Manak's Proof of Establishment / Address Proof. */
const ESTABLISHMENT_DOC = /incorporation|partnership|llp|udyam|udyog|registration of firm|establishment|msme|shop\s*&?\s*establishment/i
const ADDRESS_DOC = /gst|address|electricity|light bill|rent|lease|property tax/i

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
  payloads: Partial<Record<BisPrintDocumentKind, Payload>>
  loading: boolean
  error: string
}

function useStepData(row: BisProjectRow | null, refreshKey: number): StepData {
  const [state, setState] = useState<StepData>({ print: null, clientRaw: null, certificates: [], payloads: {}, loading: false, error: '' })
  useEffect(() => {
    if (!row?.id) {
      setState({ print: null, clientRaw: null, certificates: [], payloads: {}, loading: false, error: '' })
      return
    }
    let cancelled = false
    setState((s) => ({ ...s, loading: true, error: '' }))
    void (async () => {
      try {
        const [print, clientRes, certs, ...loaded] = await Promise.all([
          loadBisPrintData(row),
          row.client_id
            ? supabase.from('clients').select('*').eq('id', row.client_id).maybeSingle()
            : Promise.resolve({ data: null }),
          row.client_id ? listClientCertificates(row.client_id).catch(() => []) : Promise.resolve([]),
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
          payloads,
          loading: false,
          error: '',
        })
      } catch (err) {
        if (!cancelled) {
          setState({ print: null, clientRaw: null, certificates: [], payloads: {}, loading: false, error: err instanceof Error ? err.message : 'Could not load data' })
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
}: {
  stepId: string
  row: BisProjectRow | null
  refreshKey: number
  onEdit: (kind: BisPrintDocumentKind) => void
  /** Existing document rows (view / print / PDF / generate) for this step. */
  documents: ReactNode
}) {
  const [reloadTick, setReloadTick] = useState(0)
  const { print, clientRaw, certificates, payloads, loading, error } = useStepData(row, refreshKey + reloadTick)
  const edit = (kind: BisPrintDocumentKind) => () => onEdit(kind)
  const c = print?.client
  const isCode = print?.isCode

  let body: ReactNode = null

  if (stepId === 'general') {
    const varieties = list(payloads['osl-sample-requirements'], 'rows')
      .map((r) => s(r.gradeTypeVariety))
      .filter(Boolean)
    const raw = clientRaw ?? {}
    const editClient = () => {
      if (row?.client_id) window.open(`/masters/clients?edit=${encodeURIComponent(row.client_id)}`, '_blank', 'noopener')
    }
    const contact = (
      <>
        {s(raw.landline) ? `LandLine: ${s(raw.landline)}` : 'LandLine: -'}
        <br />
        Mobile: {c?.mobile || '—'}
      </>
    )
    const proofDoc = certificates.find((d) => ESTABLISHMENT_DOC.test(d.cert_name))
    const addressDoc = certificates.find((d) => ADDRESS_DOC.test(d.cert_name))
    const regNo = s(proofDoc?.document_number) || s(raw.cin) || s(raw.llpin)
    body = (
      <div className="space-y-4">
        <ManakSubPanel title="Registration Details" onEdit={editClient}>
          <ManakFields
            items={[
              ['User Id', s(raw.manak_user_id)],
              ['Nature of Firm', s(raw.constitution)],
              ['Proof of Establishment of Firm', s(proofDoc?.cert_name)],
              ['Sector', c?.sector],
              ['Scale', c?.scale],
              ['Registration Number', regNo],
              ['Date of Registration', s(proofDoc?.issued_on).slice(0, 10)],
              ['GST Number', c?.gstNumber],
              ['PAN Number', s(raw.pan)],
              ['Women Entrepreneur', s(raw.women_entrepreneur) || (raw.is_women_entrepreneur ? 'Yes' : 'No')],
              ['Startup', s(raw.startup_status) || (raw.is_startup ? 'Yes' : 'No')],
            ]}
          />
        </ManakSubPanel>
        <ManakSubPanel title="Factory Details" onEdit={editClient}>
          <ManakFields
            items={[
              ['Factory Address', c?.factoryAddress],
              ['City', s(raw.city)],
              ['District', c?.factoryDistrict],
              ['State', c?.factoryState],
              ['Country', c?.country],
              ['PinCode', c?.factoryPin],
              ['E-MailId', c?.email],
              ['Contact No.', contact],
              ['Address Proof Type', s(addressDoc?.cert_name)],
              ['Latitude', c?.latitude],
              ['Longitude', c?.longitude],
            ]}
          />
        </ManakSubPanel>
        <ManakSubPanel title="Office/Firm Details" onEdit={editClient}>
          <ManakFields
            items={[
              ['Firm Name', c?.companyName],
              ['CEO Name', c?.contactPerson],
              ['Firm Address', c?.officeAddress || c?.address],
              ['City', s(raw.city)],
              ['District', c?.district],
              ['State', c?.state],
              ['Country', c?.country],
              ['PinCode', c?.pinCode],
              ['E-MailId', c?.email],
              ['Contact No.', contact],
              ['Address Proof Type', s(addressDoc?.cert_name)],
            ]}
          />
        </ManakSubPanel>
        <ManakSubPanel title="Indian Standard Details">
          <ManakFields
            items={[
              ['Standard Number', isCode?.label],
              ['Standard Title', isCode?.title],
              ['Product Manual', isCode?.productManualNumber],
            ]}
          />
        </ManakSubPanel>
        <ManakSubPanel title="Varieties" onEdit={edit('osl-sample-requirements')}>
          <ManakTable
            head={['S.No.', 'Variety applied for']}
            rows={varieties.map((v, i) => [i + 1, v])}
            empty="No varieties yet — they come from Sample Requirements."
          />
        </ManakSubPanel>
      </div>
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
      <ManakPanel title="Documents (create · view · print · download)">{documents}</ManakPanel>
    </div>
  )
}
