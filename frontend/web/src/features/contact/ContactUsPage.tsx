import { useEffect, useState } from 'react'
import { Building2, Globe, Mail, MapPin, Phone, UserRound } from 'lucide-react'
import { NavLink } from 'react-router-dom'
import { Skeleton } from '@/components/ui/skeleton'
import { supabase } from '@/lib/supabaseClient'
import { cn } from '@/lib/utils'
import {
  limsDarkBarAccentClass,
  limsDarkBarGlowStyle,
  limsOutlineBtnClass,
  limsPageShellClass,
  limsPanelClass,
} from '@/lib/limsThemeUi'
import {
  LAB_SETTINGS_SINGLETON_ID,
  parseLabSettingsRow,
  resolveLabSettingsRowId,
} from '@/features/settings/lab-settings/labSettingsDb'

type LabContactDetails = {
  labName: string
  contactPersonName: string
  mobile: string
  email: string
  website: string
  address: string
  district: string
  pinCode: string
  state: string
  country: string
}

const emptyContact: LabContactDetails = {
  labName: '',
  contactPersonName: '',
  mobile: '',
  email: '',
  website: '',
  address: '',
  district: '',
  pinCode: '',
  state: '',
  country: '',
}

function display(value: string): string {
  const trimmed = value.trim()
  return trimmed || '—'
}

function formatAddress(details: LabContactDetails): string {
  const parts = [
    details.address,
    details.district,
    details.pinCode,
    details.state,
    details.country,
  ]
    .map((part) => part.trim())
    .filter(Boolean)
  return parts.length > 0 ? parts.join(', ') : '—'
}

function normalizeWebsiteHref(website: string): string | null {
  const value = website.trim()
  if (!value) return null
  if (/^https?:\/\//i.test(value)) return value
  return `https://${value}`
}

export default function ContactUsPage() {
  const [details, setDetails] = useState<LabContactDetails>(emptyContact)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function load() {
      try {
        setLoading(true)
        setError(null)
        const id = await resolveLabSettingsRowId(supabase)
        const { data, error: fetchError } = await supabase
          .from('lab_settings')
          .select('*')
          .eq('id', id)
          .maybeSingle()

        if (fetchError) throw fetchError

        let row = data
        if (!row && id !== LAB_SETTINGS_SINGLETON_ID) {
          const fallback = await supabase
            .from('lab_settings')
            .select('*')
            .eq('id', LAB_SETTINGS_SINGLETON_ID)
            .maybeSingle()
          if (fallback.error) throw fallback.error
          row = fallback.data
        }

        if (cancelled) return
        if (!row) {
          setDetails(emptyContact)
          return
        }

        const parsed = parseLabSettingsRow(row as Record<string, unknown>)
        setDetails({
          labName: parsed.labName,
          contactPersonName: parsed.contactPersonName,
          mobile: parsed.mobile,
          email: parsed.email,
          website: parsed.website,
          address: parsed.address,
          district: parsed.district,
          pinCode: parsed.pinCode,
          state: parsed.state,
          country: parsed.country,
        })
      } catch (err) {
        if (cancelled) return
        setError(err instanceof Error ? err.message : 'Unable to load laboratory contact details.')
        setDetails(emptyContact)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [])

  const websiteHref = normalizeWebsiteHref(details.website)
  const emailHref = details.email.trim() ? `mailto:${details.email.trim()}` : null
  const phoneHref = details.mobile.trim()
    ? `tel:${details.mobile.replace(/[^\d+]/g, '')}`
    : null

  return (
    <div className={cn(limsPageShellClass, 'min-h-0')}>
      <div className={limsPanelClass}>
        <div className="relative overflow-hidden bg-gradient-to-br from-stone-800 via-stone-900 to-stone-950 px-4 py-3 text-white sm:px-5 sm:py-4">
          <div className="pointer-events-none absolute inset-0 opacity-[0.18]" style={limsDarkBarGlowStyle} />
          <div className={limsDarkBarAccentClass} />
          <div className="relative flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="flex h-8 w-8 items-center justify-center bg-amber-500/20 text-amber-200 ring-1 ring-amber-500/40">
                  <Mail size={18} aria-hidden />
                </span>
                <h1 className="text-lg font-bold tracking-tight sm:text-xl">Contact Us</h1>
              </div>
            </div>
            <NavLink
              to="/help"
              className={cn(
                limsOutlineBtnClass,
                'inline-flex items-center justify-center border-amber-500/40 bg-stone-800/80 px-3 text-amber-100 hover:bg-amber-500/20 hover:text-amber-50',
              )}
            >
              Open Help Guide
            </NavLink>
          </div>
        </div>

        <div className="space-y-5 bg-gradient-to-b from-stone-100/90 to-stone-50 p-4 sm:p-5">
          {loading ? (
            <div className="grid gap-3 lg:grid-cols-2">
              <Skeleton className="h-48 w-full rounded-none" />
              <Skeleton className="h-48 w-full rounded-none" />
            </div>
          ) : null}

          {!loading && error ? (
            <p className="border border-red-600 bg-red-50 px-3 py-3 text-sm text-red-800">{error}</p>
          ) : null}

          {!loading ? (
            <div className="grid gap-4 lg:grid-cols-2">
              <section
                className="border-2 border-stone-500 bg-card p-4 shadow-sm ring-1 ring-amber-700/15"
                aria-labelledby="lab-contact-heading"
              >
                <div className="flex items-center gap-2">
                  <Building2 size={16} className="text-amber-800" aria-hidden />
                  <h2
                    id="lab-contact-heading"
                    className="text-sm font-bold uppercase tracking-[0.14em] text-stone-800"
                  >
                    Laboratory details
                  </h2>
                </div>

                <dl className="mt-4 space-y-3 text-sm">
                  <div>
                    <dt className="text-[11px] font-bold uppercase tracking-wide text-stone-500">
                      Laboratory name
                    </dt>
                    <dd className="mt-0.5 font-semibold text-stone-900">{display(details.labName)}</dd>
                  </div>

                  <div className="flex items-start gap-2">
                    <UserRound size={15} className="mt-0.5 shrink-0 text-amber-800" aria-hidden />
                    <div>
                      <dt className="text-[11px] font-bold uppercase tracking-wide text-stone-500">
                        Contact person
                      </dt>
                      <dd className="mt-0.5 text-stone-900">
                        {display(details.contactPersonName)}
                      </dd>
                    </div>
                  </div>

                  <div className="flex items-start gap-2">
                    <MapPin size={15} className="mt-0.5 shrink-0 text-amber-800" aria-hidden />
                    <div>
                      <dt className="text-[11px] font-bold uppercase tracking-wide text-stone-500">
                        Address
                      </dt>
                      <dd className="mt-0.5 text-stone-900">{formatAddress(details)}</dd>
                    </div>
                  </div>

                  <div className="flex items-start gap-2">
                    <Phone size={15} className="mt-0.5 shrink-0 text-amber-800" aria-hidden />
                    <div>
                      <dt className="text-[11px] font-bold uppercase tracking-wide text-stone-500">
                        Phone / Mobile
                      </dt>
                      <dd className="mt-0.5">
                        {phoneHref ? (
                          <a
                            href={phoneHref}
                            className="font-semibold text-amber-900 underline-offset-2 hover:underline"
                          >
                            {details.mobile.trim()}
                          </a>
                        ) : (
                          <span className="text-stone-900">—</span>
                        )}
                      </dd>
                    </div>
                  </div>

                  <div className="flex items-start gap-2">
                    <Mail size={15} className="mt-0.5 shrink-0 text-amber-800" aria-hidden />
                    <div>
                      <dt className="text-[11px] font-bold uppercase tracking-wide text-stone-500">
                        Email
                      </dt>
                      <dd className="mt-0.5 break-all">
                        {emailHref ? (
                          <a
                            href={emailHref}
                            className="font-semibold text-amber-900 underline-offset-2 hover:underline"
                          >
                            {details.email.trim()}
                          </a>
                        ) : (
                          <span className="text-stone-900">—</span>
                        )}
                      </dd>
                    </div>
                  </div>

                  <div className="flex items-start gap-2">
                    <Globe size={15} className="mt-0.5 shrink-0 text-amber-800" aria-hidden />
                    <div>
                      <dt className="text-[11px] font-bold uppercase tracking-wide text-stone-500">
                        Website
                      </dt>
                      <dd className="mt-0.5 break-all">
                        {websiteHref ? (
                          <a
                            href={websiteHref}
                            target="_blank"
                            rel="noreferrer"
                            className="font-semibold text-amber-900 underline-offset-2 hover:underline"
                          >
                            {details.website.trim()}
                          </a>
                        ) : (
                          <span className="text-stone-900">—</span>
                        )}
                      </dd>
                    </div>
                  </div>
                </dl>
              </section>

              <section
                className="border-2 border-stone-500 bg-card p-4 shadow-sm ring-1 ring-amber-700/15"
                aria-labelledby="support-notes-heading"
              >
                <h2
                  id="support-notes-heading"
                  className="text-sm font-bold uppercase tracking-[0.14em] text-stone-800"
                >
                  Support notes
                </h2>
                <ul className="mt-3 list-disc space-y-2 pl-4 text-sm text-stone-700">
                  <li>
                    For Module Access (View / Edit / None), user accounts, or password issues, contact your{' '}
                    <strong className="font-semibold text-stone-900">Laboratory Director</strong>.
                  </li>
                  <li>
                    Laboratory name, phone, email, and address shown here are maintained in{' '}
                    <strong className="font-semibold text-stone-900">Lab Settings</strong> by the Laboratory
                    Director.
                  </li>
                  <li>
                    Need how-to help for Testing LIMS, Calibration, Finance, or Masters? Open the{' '}
                    <NavLink to="/help" className="font-semibold text-amber-900 underline-offset-2 hover:underline">
                      Help
                    </NavLink>{' '}
                    guide.
                  </li>
                  <li>This Contact Us page is available to every signed-in user.</li>
                </ul>
              </section>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}
