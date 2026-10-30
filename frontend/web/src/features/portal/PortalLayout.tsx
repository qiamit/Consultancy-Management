import { useCallback, useEffect, useState } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { ClipboardList, FileBadge2, FlaskConical, LayoutDashboard, LogOut, Menu, Package, ShieldCheck, X } from 'lucide-react'
import { signOut, useAuth } from '@/hooks/useAuth'
import { limsDarkBarGlowStyle } from '@/lib/limsThemeUi'
import { cn } from '@/lib/utils'
import { fetchPortalDashboard, formatCmL, type PortalDashboard } from './portalApi'
import { PortalDataContext } from './portalDataContext'

const SECTION_ICON: Record<string, typeof Package> = {
  raw_material: Package,
  in_process: ClipboardList,
  final_test: FlaskConical,
  batch: FileBadge2,
}

const navCls = ({ isActive }: { isActive: boolean }) =>
  cn(
    'flex items-center gap-2.5 px-3 py-2 text-sm transition-colors',
    isActive ? 'bg-amber-500/15 font-semibold text-amber-200 shadow-[inset_3px_0_0_rgb(251,191,36)]' : 'text-stone-300 hover:bg-white/5 hover:text-white',
  )

/** Customer Portal frame: sidebar (dashboard, licences and their record sections), header, and the page. */
export default function PortalLayout() {
  const navigate = useNavigate()
  const location = useLocation()
  const { profileName, user } = useAuth()
  const [dashboard, setDashboard] = useState<PortalDashboard | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)

  const reload = useCallback(
    () =>
      fetchPortalDashboard()
        .then((d) => {
          setDashboard(d)
          setError(null)
        })
        .catch((err: unknown) => setError(err instanceof Error ? err.message : 'Could not load the portal')),
    [],
  )

  useEffect(() => {
    void reload()
  }, [reload])

  // The phone menu closes on every page change.
  const [menuPath, setMenuPath] = useState(location.pathname)
  if (menuPath !== location.pathname) {
    setMenuPath(location.pathname)
    setMenuOpen(false)
  }

  const logOut = async () => {
    await signOut()
    navigate('/auth', { replace: true })
  }

  const company = dashboard?.licences.find((l) => l.company_name)?.company_name

  const sidebar = (
    <nav className="flex h-full flex-col">
      <Link to="/portal" className="flex items-center gap-2.5 px-4 py-4">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center bg-gradient-to-br from-amber-400 to-amber-600 text-stone-950 shadow">
          <ShieldCheck size={18} aria-hidden />
        </span>
        <span className="min-w-0">
          <span className="block text-sm font-bold tracking-tight text-white">Q Engineering</span>
          <span className="block text-[10px] font-semibold uppercase tracking-[0.18em] text-amber-300">Customer Portal</span>
        </span>
      </Link>
      <div className="mx-4 mb-2 h-px bg-gradient-to-r from-amber-500/60 via-amber-300/30 to-transparent" />
      <div className="min-h-0 flex-1 space-y-0.5 overflow-y-auto pb-4">
        <NavLink to="/portal" end className={navCls}>
          <LayoutDashboard size={16} aria-hidden /> Dashboard
        </NavLink>
        <NavLink to="/portal/licences" end className={navCls}>
          <FileBadge2 size={16} aria-hidden /> My Licences
        </NavLink>
        {dashboard?.licences.map((l) => (
          <div key={l.id} className="pt-3">
            <p className="px-3 pb-1 text-[10px] font-bold uppercase tracking-[0.16em] text-stone-500">{formatCmL(l.cm_l_digits)}</p>
            <NavLink to={`/portal/licences/${l.id}`} end className={navCls}>
              <FileBadge2 size={15} aria-hidden /> Licence Details
            </NavLink>
            {l.sections.map((s) => {
              const Icon = SECTION_ICON[s.kind] ?? ClipboardList
              return (
                <NavLink key={s.id} to={`/portal/licences/${l.id}/records/${s.id}`} className={navCls}>
                  <Icon size={15} aria-hidden /> <span className="truncate">{s.name}</span>
                </NavLink>
              )
            })}
          </div>
        ))}
      </div>
      <div className="border-t border-white/10 p-3">
        <p className="truncate px-1 text-xs text-stone-300">{profileName || user?.email}</p>
        {company ? <p className="truncate px-1 text-[11px] text-stone-500">{company}</p> : null}
        <button
          type="button"
          onClick={() => void logOut()}
          className="mt-2 inline-flex h-8 w-full items-center justify-center gap-1.5 border border-amber-500/50 text-xs font-medium text-amber-100 hover:bg-amber-600 hover:text-white"
        >
          <LogOut size={14} aria-hidden /> Log Out
        </button>
      </div>
    </nav>
  )

  return (
    <PortalDataContext.Provider value={{ dashboard, error, reload }}>
      <div className="flex min-h-dvh bg-[#f5f1ea]">
        <aside className="relative hidden w-64 shrink-0 overflow-hidden bg-gradient-to-b from-stone-900 via-stone-900 to-stone-950 lg:block">
          <div className="pointer-events-none absolute inset-0 opacity-[0.15]" style={limsDarkBarGlowStyle} />
          <div className="sticky top-0 h-dvh">{sidebar}</div>
        </aside>

        {menuOpen ? (
          <div className="fixed inset-0 z-40 lg:hidden">
            <button type="button" aria-label="Close Menu" className="absolute inset-0 bg-black/50" onClick={() => setMenuOpen(false)} />
            <aside className="absolute inset-y-0 left-0 w-72 max-w-[85vw] overflow-hidden bg-gradient-to-b from-stone-900 to-stone-950 shadow-2xl">
              <button type="button" aria-label="Close Menu" className="absolute right-2 top-3 z-10 p-1 text-stone-300" onClick={() => setMenuOpen(false)}>
                <X size={18} />
              </button>
              {sidebar}
            </aside>
          </div>
        ) : null}

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-30 flex items-center gap-2 border-b border-stone-300 bg-[#fffcf7]/95 px-3 py-2.5 backdrop-blur lg:hidden">
            <button type="button" aria-label="Open Menu" className="inline-flex h-9 w-9 items-center justify-center border border-stone-300 text-stone-700" onClick={() => setMenuOpen(true)}>
              <Menu size={18} />
            </button>
            <span className="min-w-0 truncate text-sm font-semibold text-stone-900">Q Engineering · Customer Portal</span>
          </header>
          <main className="mx-auto w-full max-w-6xl flex-1 px-3 py-4 sm:px-6 sm:py-6">
            {error ? <p className="mb-3 border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p> : null}
            <Outlet />
          </main>
          <footer className="px-4 py-3 text-center text-[11px] text-stone-500">
            Q Engineering · info@qengineering.in · Licence details are maintained by Q Engineering.
          </footer>
        </div>
      </div>
    </PortalDataContext.Provider>
  )
}
