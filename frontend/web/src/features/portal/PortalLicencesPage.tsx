import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronRight, FileBadge2, Loader2 } from 'lucide-react'
import { formatDisplayDate } from '@/features/bis/projects/types'
import { cn } from '@/lib/utils'
import { fetchPortalLicences, formatCmL, isLabel, validityBadge, type PortalLicence } from './portalApi'

export default function PortalLicencesPage() {
  const [rows, setRows] = useState<PortalLicence[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    void fetchPortalLicences()
      .then(setRows)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : 'Could not load your licences'))
  }, [])

  const company = rows?.find((r) => r.company_name)?.company_name

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold tracking-tight text-stone-900 sm:text-xl">My BIS Licences</h1>
        {company ? <p className="text-sm text-stone-600">{company}</p> : null}
      </div>

      {error ? (
        <p className="border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>
      ) : rows == null ? (
        <p className="flex items-center gap-2 text-sm text-stone-600">
          <Loader2 size={16} className="animate-spin" aria-hidden /> Loading…
        </p>
      ) : rows.length === 0 ? (
        <p className="border border-stone-300 bg-white px-3 py-6 text-center text-sm text-stone-600">
          No licence has been shared with this login yet. Please contact Q Engineering.
        </p>
      ) : (
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {rows.map((r) => {
            const badge = validityBadge(r.license_validity_date)
            return (
              <li key={r.id} className="min-w-0">
                <Link
                  to={`/portal/licences/${r.id}`}
                  className="group flex h-full items-start gap-3 border border-stone-300 bg-white p-3 shadow-sm transition-colors hover:border-amber-600 hover:bg-amber-50/40 sm:p-4"
                >
                  <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center bg-amber-100 text-amber-800">
                    <FileBadge2 size={18} aria-hidden />
                  </span>
                  <span className="min-w-0 flex-1 space-y-1">
                    <span className="block text-base font-semibold text-stone-900">{formatCmL(r.cm_l_digits)}</span>
                    <span className="block text-sm font-medium text-stone-800">{isLabel(r)}</span>
                    {r.is_title ? <span className="block truncate text-xs text-stone-600" title={r.is_title}>{r.is_title}</span> : null}
                    <span className="block text-xs text-stone-600">Valid Till {formatDisplayDate(r.license_validity_date) || '—'}</span>
                    <span className={cn('inline-block border px-1.5 py-0.5 text-[11px] font-medium', badge.className)}>{badge.label}</span>
                  </span>
                  <ChevronRight size={18} className="mt-1 shrink-0 text-stone-400 group-hover:text-amber-700" aria-hidden />
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
