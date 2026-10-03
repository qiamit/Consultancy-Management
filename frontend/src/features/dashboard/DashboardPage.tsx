import type { ElementType } from 'react'
import { useEffect, useState } from 'react'
import {
  ArrowRight,
  BadgeCheck,
  BookOpen,
  FilePlus2,
  FolderKanban,
  Users,
  Wallet,
} from 'lucide-react'
import { NavLink } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { supabase } from '@/lib/supabaseClient'
import { Skeleton } from '@/components/ui/skeleton'
import { limsPageShellClass, limsPanelClass } from '@/lib/limsThemeUi'
import { cn } from '@/lib/utils'

type StatCard = {
  title: string
  value: string | number
  subtitle: string
  icon: ElementType
  href: string
}

export default function DashboardPage() {
  const { profileName, user } = useAuth()
  const [loading, setLoading] = useState(true)
  const [clients, setClients] = useState(0)
  const [licenses, setLicenses] = useState(0)
  const [applications, setApplications] = useState(0)
  const [isCodes, setIsCodes] = useState(0)

  useEffect(() => {
    let canceled = false
    const load = async () => {
      setLoading(true)
      const [c, b, a, i] = await Promise.all([
        supabase.from('clients').select('*', { count: 'exact', head: true }),
        supabase.from('bis_projects').select('*', { count: 'exact', head: true }),
        supabase.from('bis_new_applications').select('*', { count: 'exact', head: true }),
        supabase.from('is_codes').select('*', { count: 'exact', head: true }),
      ])
      if (canceled) return
      setClients(c.count ?? 0)
      setLicenses(b.count ?? 0)
      setApplications(a.count ?? 0)
      setIsCodes(i.count ?? 0)
      setLoading(false)
    }
    void load()
    return () => {
      canceled = true
    }
  }, [])

  const cards: StatCard[] = [
    {
      title: 'Clients',
      value: clients,
      subtitle: 'Client master records',
      icon: Users,
      href: '/masters/clients',
    },
    {
      title: 'BIS Licenses',
      value: licenses,
      subtitle: 'All registered licenses',
      icon: FolderKanban,
      href: '/bis/projects',
    },
    {
      title: 'New Applications',
      value: applications,
      subtitle: 'BIS new application files',
      icon: FilePlus2,
      href: '/bis/new-applications',
    },
    {
      title: 'IS Codes',
      value: isCodes,
      subtitle: 'IS Code master',
      icon: BookOpen,
      href: '/masters/is-codes',
    },
  ]

  const shortcuts = [
    { label: 'New BIS Application', href: '/bis/new-applications', icon: FilePlus2 },
    { label: 'Client Master', href: '/masters/clients', icon: Users },
    { label: 'Finance Quotation', href: '/finance/sale/quotation', icon: Wallet },
    { label: 'QE BIS Licenses', href: '/bis/our-licenses', icon: BadgeCheck },
  ]

  return (
    <div className={cn(limsPageShellClass, 'space-y-6 p-4 md:p-6')}>
      <div className={cn(limsPanelClass, 'p-6')}>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-700">
          Consultancy Pro
        </p>
        <h1 className="mt-2 font-jakarta text-3xl font-bold tracking-tight text-foreground">
          Welcome{profileName || user?.email ? `, ${profileName || user?.email}` : ''}
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          Q Engineering consultancy operations on the same Railway stack as Qirlpl LIMS —
          Auth, PostgREST, Storage, PDF, and Resend.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map((card) => {
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
        })}
      </div>

      <div className={cn(limsPanelClass, 'p-5')}>
        <h2 className="font-jakarta text-lg font-bold text-foreground">Quick actions</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {shortcuts.map((item) => {
            const Icon = item.icon
            return (
              <NavLink
                key={item.href}
                to={item.href}
                className="flex items-center gap-3 border border-[rgb(var(--lims-paper-border))] bg-[rgb(var(--lims-paper))] px-4 py-3 text-sm font-medium text-foreground transition hover:border-amber-600/50"
              >
                <Icon className="h-4 w-4 text-amber-700" />
                {item.label}
              </NavLink>
            )
          })}
        </div>
      </div>
    </div>
  )
}
