import type { ElementType } from 'react'
import { useEffect, useState } from 'react'
import {
  ArrowRight,
  Ban,
  BadgeCheck,
  BookOpen,
  CalendarX2,
  Eye,
  FilePlus2,
  FolderKanban,
  Globe,
  MessageSquareWarning,
  RefreshCw,
  Users,
  Wallet,
} from 'lucide-react'
import { NavLink } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { supabase } from '@/lib/supabaseClient'
import { Skeleton } from '@/components/ui/skeleton'
import { limsPageShellClass, limsPanelClass } from '@/lib/limsThemeUi'
import { todayIsoDate } from '@/features/bis/projects/types'
import { cn } from '@/lib/utils'

type StatCard = {
  title: string
  value: string | number
  subtitle: string
  icon: ElementType
  href: string
}

type DashCounts = {
  clients: number
  licenses: number
  applications: number
  isCodes: number
  qeManaged: number
  stopMarking: number
  expiredLicenses: number
  renewals: number
  surveillance: number
  sampleFailures: number
  quotations: number
}

const EMPTY: DashCounts = {
  clients: 0,
  licenses: 0,
  applications: 0,
  isCodes: 0,
  qeManaged: 0,
  stopMarking: 0,
  expiredLicenses: 0,
  renewals: 0,
  surveillance: 0,
  sampleFailures: 0,
  quotations: 0,
}

export default function DashboardPage() {
  const { profileName, user } = useAuth()
  const [loading, setLoading] = useState(true)
  const [counts, setCounts] = useState<DashCounts>(EMPTY)

  useEffect(() => {
    let canceled = false
    const load = async () => {
      setLoading(true)
      const today = todayIsoDate()
      const [
        c,
        b,
        a,
        i,
        qe,
        sm,
        exp,
        ren,
        surv,
        sfr,
        qtn,
      ] = await Promise.all([
        supabase.from('clients').select('*', { count: 'exact', head: true }),
        supabase.from('bis_projects').select('*', { count: 'exact', head: true }),
        supabase
          .from('bis_projects')
          .select('*', { count: 'exact', head: true })
          .or('project_kind.eq.Application,project_kind.eq.application'),
        supabase.from('is_codes').select('*', { count: 'exact', head: true }),
        supabase.from('bis_projects').select('*', { count: 'exact', head: true }).eq('is_qe_managed', true),
        supabase.from('bis_projects').select('*', { count: 'exact', head: true }).eq('status', 'stop_marking'),
        supabase
          .from('bis_projects')
          .select('*', { count: 'exact', head: true })
          .lt('license_validity_date', today),
        supabase.from('bis_renewal_applications').select('*', { count: 'exact', head: true }),
        supabase.from('license_surveillance').select('*', { count: 'exact', head: true }),
        supabase.from('bis_sample_failure_replies').select('*', { count: 'exact', head: true }),
        supabase.from('quotations').select('*', { count: 'exact', head: true }),
      ])
      if (canceled) return
      setCounts({
        clients: c.count ?? 0,
        licenses: b.count ?? 0,
        applications: a.count ?? 0,
        isCodes: i.count ?? 0,
        qeManaged: qe.count ?? 0,
        stopMarking: sm.count ?? 0,
        expiredLicenses: exp.count ?? 0,
        renewals: ren.count ?? 0,
        surveillance: surv.count ?? 0,
        sampleFailures: sfr.count ?? 0,
        quotations: qtn.count ?? 0,
      })
      setLoading(false)
    }
    void load()
    return () => {
      canceled = true
    }
  }, [])

  const overviewCards: StatCard[] = [
    {
      title: 'Clients',
      value: counts.clients,
      subtitle: 'Client master records',
      icon: Users,
      href: '/masters/clients',
    },
    {
      title: 'BIS Licenses',
      value: counts.licenses,
      subtitle: 'All registered licenses',
      icon: FolderKanban,
      href: '/bis/projects',
    },
    {
      title: 'New Applications',
      value: counts.applications,
      subtitle: 'BIS application-type projects',
      icon: FilePlus2,
      href: '/bis/new-applications',
    },
    {
      title: 'IS Codes',
      value: counts.isCodes,
      subtitle: 'IS Code master',
      icon: BookOpen,
      href: '/masters/is-codes',
    },
  ]

  const licenseStatusCards: StatCard[] = [
    {
      title: 'QE Managed',
      value: counts.qeManaged,
      subtitle: 'Licenses managed by Q Engineering',
      icon: BadgeCheck,
      href: '/bis/our-licenses',
    },
    {
      title: 'Stop Marking',
      value: counts.stopMarking,
      subtitle: 'Licenses in stop marking status',
      icon: Ban,
      href: '/bis/stop-marking',
    },
    {
      title: 'Expired Licenses',
      value: counts.expiredLicenses,
      subtitle: 'Past license validity date',
      icon: CalendarX2,
      href: '/bis/expired-licenses',
    },
  ]

  const opsCards: StatCard[] = [
    {
      title: 'Renewals',
      value: counts.renewals,
      subtitle: 'License renewal applications',
      icon: RefreshCw,
      href: '/bis/license-renewals',
    },
    {
      title: 'Surveillance',
      value: counts.surveillance,
      subtitle: 'BIS surveillance records',
      icon: Eye,
      href: '/bis/surveillance',
    },
    {
      title: 'Sample Failure Reply',
      value: counts.sampleFailures,
      subtitle: 'Sample failure replies on file',
      icon: MessageSquareWarning,
      href: '/bis/sample-failure-reply',
    },
    {
      title: 'Quotations',
      value: counts.quotations,
      subtitle: 'Finance sale quotations',
      icon: Wallet,
      href: '/finance/sale/quotation',
    },
  ]

  const shortcuts = [
    { label: 'Renewals', href: '/bis/license-renewals', icon: RefreshCw },
    { label: 'Stop Marking', href: '/bis/stop-marking', icon: Ban },
    { label: 'Surveillance', href: '/bis/surveillance', icon: Eye },
    { label: 'Sample Failure Reply', href: '/bis/sample-failure-reply', icon: MessageSquareWarning },
    { label: 'Website CMS', href: '/tools/cms', icon: Globe },
    { label: 'Quotation', href: '/finance/sale/quotation', icon: Wallet },
  ]

  const renderStatCard = (card: StatCard) => {
    const Icon = card.icon
    return (
      <NavLink
        key={card.title}
        to={card.href}
        className={cn(limsPanelClass, 'group block p-5 transition hover:border-amber-600/40')}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {card.title}
            </p>
            {loading ? (
              <Skeleton className="mt-3 h-8 w-16" />
            ) : (
              <p className="mt-2 font-jakarta text-3xl font-bold text-foreground">{card.value}</p>
            )}
            <p className="mt-1 text-xs text-muted-foreground">{card.subtitle}</p>
          </div>
          <span className="rounded-none border border-stone-700 bg-stone-900 p-2 text-amber-300">
            <Icon className="h-5 w-5" />
          </span>
        </div>
        <span className="mt-4 inline-flex items-center gap-1 text-xs font-semibold text-amber-700 group-hover:gap-2">
          Open <ArrowRight className="h-3.5 w-3.5" />
        </span>
      </NavLink>
    )
  }

  return (
    <div className={cn(limsPageShellClass, 'space-y-6 p-4 md:p-6')}>
      <div className={cn(limsPanelClass, 'p-6')}>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-700">
          Quality Engineering
        </p>
        <h1 className="mt-2 font-jakarta text-3xl font-bold tracking-tight text-foreground">
          Welcome{profileName || user?.email ? `, ${profileName || user?.email}` : ''}
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          Consultancy operations on the Railway stack — Auth, PostgREST, Storage, PDF, Resend, and
          Manak eBIS Assist.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {overviewCards.map(renderStatCard)}
      </div>

      <div className="space-y-3">
        <h2 className="font-jakarta text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          License status
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {licenseStatusCards.map(renderStatCard)}
        </div>
      </div>

      <div className="space-y-3">
        <h2 className="font-jakarta text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Operations &amp; finance
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {opsCards.map(renderStatCard)}
        </div>
      </div>

      <div className={cn(limsPanelClass, 'p-5')}>
        <h2 className="font-jakarta text-lg font-bold text-foreground">Quick actions</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          {shortcuts.map((item) => {
            const Icon = item.icon
            return (
              <NavLink
                key={item.href}
                to={item.href}
                className="flex items-center gap-3 border border-[rgb(var(--lims-paper-border))] bg-[rgb(var(--lims-paper))] px-4 py-3 text-sm font-medium text-foreground transition hover:border-amber-600/50"
              >
                <Icon className="h-4 w-4 shrink-0 text-amber-700" />
                <span className="leading-snug">{item.label}</span>
              </NavLink>
            )
          })}
        </div>
      </div>
    </div>
  )
}
