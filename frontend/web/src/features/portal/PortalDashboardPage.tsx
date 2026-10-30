import { Link } from 'react-router-dom'
import { AlertTriangle, CalendarClock, CheckCircle2, ChevronRight, ClipboardList, FileBadge2, Loader2, XCircle } from 'lucide-react'
import type { ReactNode } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { formatDisplayDate, licenseValidityState } from '@/features/bis/projects/types'
import { limsDarkBarGlowStyle } from '@/lib/limsThemeUi'
import { cn } from '@/lib/utils'
import { formatCmL, isLabel, serviceLabel, validityBadge } from './portalApi'
import { usePortalData } from './portalDataContext'

function Kpi({ icon, label, value, tone }: { icon: ReactNode; label: string; value: number; tone: 'amber' | 'emerald' | 'sky' | 'red' }) {
  const tones = {
    amber: 'from-amber-500 to-amber-600',
    emerald: 'from-emerald-500 to-emerald-600',
    sky: 'from-sky-500 to-sky-600',
    red: 'from-red-500 to-red-600',
  }
  return (
    <div className="flex items-center gap-3 border border-stone-200 bg-white p-3 shadow-sm sm:p-4">
      <span className={cn('flex h-11 w-11 shrink-0 items-center justify-center bg-gradient-to-br text-white shadow', tones[tone])}>{icon}</span>
      <span className="min-w-0">
        <span className="block text-2xl font-bold leading-tight text-stone-900">{value.toLocaleString('en-IN')}</span>
        <span className="block text-xs font-medium leading-tight text-stone-600">{label}</span>
      </span>
    </div>
  )
}

export default function PortalDashboardPage() {
  const { dashboard } = usePortalData()
  const { profileName } = useAuth()

  if (!dashboard) {
    return (
      <p className="flex items-center gap-2 text-sm text-stone-600">
        <Loader2 size={16} className="animate-spin" aria-hidden /> Loading…
      </p>
    )
  }

  const { licences, recent } = dashboard
  const company = licences.find((l) => l.company_name)?.company_name
  const states = licences.map((l) => licenseValidityState(l.license_validity_date).state)
  const operative = states.filter((s) => s === 'operative').length
  const renewal = states.filter((s) => s === 'expiring' || s === 'deferred').length
  const entries = licences.reduce((n, l) => n + Number(l.entries_month || 0), 0)
  const fails = licences.reduce((n, l) => n + Number(l.fails_month || 0), 0)
  const today = new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })

  return (
    <div className="space-y-5">
      <section className="relative overflow-hidden bg-gradient-to-br from-stone-800 via-stone-900 to-stone-950 px-5 py-5 text-white shadow-md sm:px-6 sm:py-6">
        <div className="pointer-events-none absolute inset-0 opacity-[0.22]" style={limsDarkBarGlowStyle} />
        <div className="absolute bottom-0 left-0 h-[3px] w-full bg-gradient-to-r from-amber-500 via-amber-300 to-transparent" />
        <div className="relative">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-300">{today}</p>
          <h1 className="mt-1 text-xl font-semibold tracking-tight sm:text-2xl">Welcome{profileName ? `, ${profileName}` : ''}</h1>
          {company ? <p className="mt-0.5 text-sm text-stone-300">{company}</p> : null}
        </div>
      </section>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi icon={<FileBadge2 size={20} />} label="Licences Operative" value={operative} tone="emerald" />
        <Kpi icon={<CalendarClock size={20} />} label="Renewal Due" value={renewal} tone="amber" />
        <Kpi icon={<ClipboardList size={20} />} label="Entries This Month" value={entries} tone="sky" />
        <Kpi icon={<AlertTriangle size={20} />} label="Failed This Month" value={fails} tone="red" />
      </div>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold uppercase tracking-[0.14em] text-stone-700">My Licences</h2>
          <Link to="/portal/licences" className="text-xs font-medium text-amber-800 hover:underline">View All</Link>
        </div>
        {licences.length === 0 ? (
          <p className="border border-stone-300 bg-white px-3 py-6 text-center text-sm text-stone-600">
            No licence has been shared with this login yet. Please contact Q Engineering.
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {licences.map((l) => {
              const validity = validityBadge(l.license_validity_date)
              const service = serviceLabel(l.service, l.service_valid_till)
              return (
                <article key={l.id} className="min-w-0 border border-stone-200 bg-white shadow-sm transition-shadow hover:shadow-md">
                  <Link to={`/portal/licences/${l.id}`} className="flex items-start gap-3 border-b border-stone-100 p-4">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center bg-amber-100 text-amber-800">
                      <FileBadge2 size={18} aria-hidden />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-base font-semibold text-stone-900">{formatCmL(l.cm_l_digits)}</span>
                      <span className="block text-sm text-stone-700">{isLabel(l)}</span>
                      {l.is_title ? <span className="block truncate text-xs text-stone-500" title={l.is_title}>{l.is_title}</span> : null}
                    </span>
                    <ChevronRight size={18} className="mt-1 shrink-0 text-stone-400" aria-hidden />
                  </Link>
                  <div className="space-y-2 p-4 pt-3">
                    <div className="flex flex-wrap gap-1.5">
                      <span className={cn('border px-1.5 py-0.5 text-[11px] font-medium', validity.className)}>{validity.label}</span>
                      <span className={cn('border px-1.5 py-0.5 text-[11px] font-medium', service.className)}>{service.label}</span>
                    </div>
                    <p className="text-xs text-stone-600">
                      Valid Till {formatDisplayDate(l.license_validity_date) || '—'} · This Month: {Number(l.entries_month).toLocaleString('en-IN')} Entries
                      {Number(l.fails_month) > 0 ? <span className="font-semibold text-red-700"> · {l.fails_month} Failed</span> : null}
                    </p>
                    {l.sections.length ? (
                      <div className="flex flex-wrap gap-1.5 pt-1">
                        {l.sections.map((s) => (
                          <Link
                            key={s.id}
                            to={`/portal/licences/${l.id}/records/${s.id}`}
                            className="border border-stone-300 bg-[#fffcf7] px-2 py-1 text-xs font-medium text-stone-800 hover:border-amber-600 hover:bg-amber-50"
                          >
                            {s.name}
                          </Link>
                        ))}
                      </div>
                    ) : null}
                  </div>
                </article>
              )
            })}
          </div>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-bold uppercase tracking-[0.14em] text-stone-700">Recent Entries</h2>
        {recent.length === 0 ? (
          <p className="border border-stone-200 bg-white px-3 py-5 text-center text-sm text-stone-500">No entries yet.</p>
        ) : (
          <ul className="divide-y divide-stone-100 border border-stone-200 bg-white shadow-sm">
            {recent.map((e) => {
              const licence = licences.find((l) => l.id === e.project_id)
              return (
                <li key={e.id} className="flex items-center gap-3 px-3 py-2.5 sm:px-4">
                  {e.result === 'fail' ? (
                    <XCircle size={18} className="shrink-0 text-red-600" aria-hidden />
                  ) : e.result === 'pass' ? (
                    <CheckCircle2 size={18} className="shrink-0 text-emerald-600" aria-hidden />
                  ) : (
                    <ClipboardList size={18} className="shrink-0 text-stone-400" aria-hidden />
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-stone-900">
                      {e.section}{e.ref_no ? ` · ${e.ref_no}` : ''}
                    </span>
                    <span className="block truncate text-xs text-stone-500">{formatCmL(licence?.cm_l_digits)}</span>
                  </span>
                  <span className="shrink-0 text-xs text-stone-600">{formatDisplayDate(e.entry_date)}</span>
                </li>
              )
            })}
          </ul>
        )}
      </section>
    </div>
  )
}
