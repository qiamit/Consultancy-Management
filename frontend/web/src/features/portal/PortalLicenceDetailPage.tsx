import { useEffect, useState, type ReactNode } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, Download, Eye, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { formatDisplayDate, parseBisNotesScope } from '@/features/bis/projects/types'
import { fileViewHref } from '@/lib/fileViewer'
import { cn } from '@/lib/utils'
import { fetchPortalLicence, formatCmL, isLabel, portalFileUrl, validityBadge, type PortalFile, type PortalLicenceDetail } from './portalApi'

const th = 'border border-stone-700 bg-stone-800 px-2 py-1.5 text-left text-[11px] font-bold uppercase tracking-[0.08em] text-amber-200'
const td = 'border border-stone-200 px-2 py-1.5 align-top text-sm text-stone-800'
const iconBtn =
  'inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-none border border-stone-400 bg-white text-amber-800 hover:bg-amber-50 disabled:opacity-50'

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="border border-stone-300 bg-white shadow-sm">
      <h2 className="bg-stone-800 px-3 py-2 text-[11px] font-bold uppercase tracking-[0.14em] text-amber-200">{title}</h2>
      <div className="p-3">{children}</div>
    </section>
  )
}

function Field({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] font-semibold uppercase tracking-wide text-stone-500">{label}</dt>
      <dd className="break-words text-sm text-stone-900">{value || '—'}</dd>
    </div>
  )
}

function Table({ headers, rows }: { headers: string[]; rows: Array<Array<ReactNode>> }) {
  if (rows.length === 0) return <p className="text-sm text-stone-500">Not available.</p>
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse">
        <thead>
          <tr>
            <th className={cn(th, 'w-10 text-center')}>#</th>
            {headers.map((h) => (
              <th key={h} className={th}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((cells, i) => (
            <tr key={i} className={i % 2 ? 'bg-[#f7f3eb]' : 'bg-white'}>
              <td className={cn(td, 'text-center text-stone-500')}>{i + 1}</td>
              {cells.map((c, j) => (
                <td key={j} className={td}>{c || '—'}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function FileRow({ file }: { file: PortalFile }) {
  const [busy, setBusy] = useState<'view' | 'download' | null>(null)
  const open = async (download: boolean) => {
    // Open the tab inside the click, then point it at the file once the link is ready (no popup block).
    const tab = download ? null : window.open('', '_blank')
    setBusy(download ? 'download' : 'view')
    try {
      const url = await portalFileUrl(file, download)
      if (download) window.location.assign(url)
      else if (tab) tab.location.replace(fileViewHref(url, file.file_name))
    } catch (err) {
      tab?.close()
      toast.error(err instanceof Error ? err.message : 'This file is not available.')
    } finally {
      setBusy(null)
    }
  }
  return (
    <li className="flex items-center gap-2 py-1.5">
      <span className="min-w-0 flex-1 truncate text-sm text-stone-800" title={file.file_name}>{file.file_name}</span>
      <button type="button" className={iconBtn} title={`View ${file.file_name}`} aria-label={`View ${file.file_name}`} disabled={busy != null} onClick={() => void open(false)}>
        {busy === 'view' ? <Loader2 size={15} className="animate-spin" aria-hidden /> : <Eye size={15} aria-hidden />}
      </button>
      <button type="button" className={iconBtn} title={`Download ${file.file_name}`} aria-label={`Download ${file.file_name}`} disabled={busy != null} onClick={() => void open(true)}>
        {busy === 'download' ? <Loader2 size={15} className="animate-spin" aria-hidden /> : <Download size={15} aria-hidden />}
      </button>
    </li>
  )
}

function ScopeView({ notes }: { notes: string | null }) {
  const text = (notes ?? '').trim()
  if (!text) return <p className="text-sm text-stone-500">Not available.</p>
  const scope = parseBisNotesScope(text)
  if (scope.mode === 'plain') return <p className="whitespace-pre-wrap text-sm text-stone-800">{scope.text}</p>
  return <Table headers={scope.headers} rows={scope.rows.filter((r) => r.some((c) => c.trim()))} />
}

export default function PortalLicenceDetailPage() {
  const { id = '' } = useParams()
  // Keyed by licence: moving to another licence starts with a fresh, empty page.
  return <LicenceDetail key={id} id={id} />
}

function LicenceDetail({ id }: { id: string }) {
  const [data, setData] = useState<PortalLicenceDetail | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    void fetchPortalLicence(id)
      .then(setData)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : 'Could not load this licence'))
  }, [id])

  const back = (
    <Link to="/portal/licences" className="inline-flex items-center gap-1 text-sm font-medium text-amber-800 hover:underline">
      <ArrowLeft size={15} aria-hidden /> My Licences
    </Link>
  )
  if (error) return <div className="space-y-3">{back}<p className="border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p></div>
  if (!data) {
    return (
      <div className="space-y-3">
        {back}
        <p className="flex items-center gap-2 text-sm text-stone-600"><Loader2 size={16} className="animate-spin" aria-hidden /> Loading…</p>
      </div>
    )
  }

  const badge = validityBadge(data.license_validity_date)
  const f = data.factory
  const factory = f ? [f.address, f.city, f.district, f.state, f.pin_code].map((v) => (v ?? '').trim()).filter(Boolean).join(', ') : ''
  const capacity = data.installed_capacity != null && String(data.installed_capacity).trim()
    ? `${data.installed_capacity}${data.production_unit ? ` ${data.production_unit}` : ''}`
    : ''

  return (
    <div className="space-y-4">
      {back}
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h1 className="text-lg font-semibold tracking-tight text-stone-900 sm:text-xl">{formatCmL(data.cm_l_digits)}</h1>
        <span className="text-sm font-medium text-stone-700">{isLabel(data)}</span>
        <span className={cn('border px-1.5 py-0.5 text-[11px] font-medium', badge.className)}>{badge.label}</span>
      </div>

      <Section title="Licence">
        <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Licence Holder" value={data.company_name} />
          <Field label="Product" value={data.is_title} />
          <Field label="Licence Number" value={data.license_number || formatCmL(data.cm_l_digits)} />
          <Field label="Granted On" value={formatDisplayDate(data.granted_date)} />
          <Field label="Valid Till" value={formatDisplayDate(data.license_validity_date)} />
          <Field label="Status" value={data.licence_status} />
          <Field label="Scheme" value={data.scheme_name} />
          <Field label="BIS Office" value={data.bis_office} />
          <Field label="Installed Capacity" value={capacity} />
        </dl>
      </Section>

      <Section title="Factory">
        <p className="text-sm text-stone-800">{factory || '—'}</p>
      </Section>

      <Section title="Licence Scope">
        <ScopeView notes={data.scope} />
      </Section>

      <Section title="Plant & Machinery">
        <Table
          headers={['Machinery', 'Make', 'Number', 'Capacity / Day', 'Remarks']}
          rows={data.machinery.map((m) => [m.name, m.make, m.number, m.capacity_per_day, m.remarks])}
        />
      </Section>

      <Section title="Testing Equipment">
        <Table
          headers={['Equipment', 'Make', 'Quantity', 'Range', 'Least Count', 'Clause', 'Calibration']}
          rows={data.test_equipment.map((e) => [e.name, e.make, e.quantity, e.range, e.least_count, e.clause_no, e.calibration_status])}
        />
      </Section>

      <Section title="Documents">
        {data.files.length === 0 ? (
          <p className="text-sm text-stone-500">No documents shared yet.</p>
        ) : (
          <ul className="divide-y divide-stone-200">
            {data.files.map((file) => (
              <FileRow key={file.id} file={file} />
            ))}
          </ul>
        )}
      </Section>
    </div>
  )
}
