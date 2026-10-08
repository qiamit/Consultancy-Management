import { useState } from 'react'
import { FlaskConical, LayoutDashboard, Menu, X } from 'lucide-react'
import { NavLink, Outlet } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/hooks/useAuth'
import { limsDarkBarAccentClass, limsDarkBarBtnClass, limsDarkBarClass, limsDarkBarGlowStyle } from '@/lib/limsThemeUi'
import { cn } from '@/lib/utils'
import { PUBLIC_LAB_NAME, PUBLIC_NAV_ITEMS } from './publicNav'
import { useCompanyLogoUrl } from './useCompanyLogoUrl'

function navClass(isActive: boolean, isLogin: boolean) {
  if (isLogin) {
    return cn(
      limsDarkBarBtnClass,
      'inline-flex items-center px-3',
      isActive && 'bg-amber-500/25 text-amber-50',
    )
  }
  return cn(
    'inline-flex h-8 items-center rounded-none px-3 text-sm font-medium',
    isActive ? 'bg-amber-500/20 text-amber-50' : 'text-stone-200 hover:bg-amber-500/15 hover:text-amber-50',
  )
}

export default function PublicSiteLayout() {
  const { user } = useAuth()
  const [menuOpen, setMenuOpen] = useState(false)
  const companyLogoUrl = useCompanyLogoUrl()

  return (
    <div className="flex min-h-screen flex-col bg-gradient-to-b from-stone-100/90 to-stone-50">
      <header className={cn(limsDarkBarClass, 'z-20')}>
        <div className="pointer-events-none absolute inset-0 opacity-[0.18]" style={limsDarkBarGlowStyle} />
        <div className={limsDarkBarAccentClass} />
        <div className="relative mx-auto flex w-full max-w-[1600px] items-center gap-3 px-3 py-2.5 sm:px-5">
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <NavLink
              to="/home"
              className="flex min-w-0 max-w-[min(28rem,52%)] items-center gap-2 text-white"
              onClick={() => setMenuOpen(false)}
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center border border-amber-500/45 bg-stone-800/80">
                <FlaskConical size={18} className="text-amber-300" />
              </span>
              <span className="min-w-0 leading-tight">
                <span className="block text-[11px] font-semibold tracking-tight sm:text-sm">
                  {PUBLIC_LAB_NAME}
                </span>
                <span className="hidden text-[10px] uppercase tracking-[0.14em] text-amber-200 sm:block">
                  Testing & Calibration
                </span>
              </span>
            </NavLink>

            <nav className="ml-auto hidden flex-wrap items-center justify-end gap-1 lg:flex" aria-label="Public site">
              {PUBLIC_NAV_ITEMS.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={({ isActive }) => navClass(isActive, item.to === '/auth')}
                >
                  {item.label}
                </NavLink>
              ))}
              {user ? (
                <NavLink to="/" className={cn(limsDarkBarBtnClass, 'inline-flex items-center gap-1.5 px-3')}>
                  <LayoutDashboard size={14} />
                  Open LIMS
                </NavLink>
              ) : null}
            </nav>

            <Button
              type="button"
              className={cn(limsDarkBarBtnClass, 'ml-auto h-8 w-8 px-0 lg:hidden')}
              aria-label={menuOpen ? 'Close menu' : 'Open menu'}
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((open) => !open)}
            >
              {menuOpen ? <X size={16} /> : <Menu size={16} />}
            </Button>
          </div>

          {companyLogoUrl ? (
            <NavLink
              to="/home"
              className="flex h-11 max-w-[200px] shrink-0 items-center border border-amber-500/35 bg-white px-2"
              aria-label="Company logo"
            >
              <img
                src={companyLogoUrl}
                alt="Company logo"
                className="h-9 w-auto max-w-[180px] object-contain"
              />
            </NavLink>
          ) : null}
        </div>

        {menuOpen ? (
          <nav className="relative border-t border-amber-500/20 px-3 py-2 lg:hidden" aria-label="Public site mobile">
            <div className="flex flex-col gap-1">
              {PUBLIC_NAV_ITEMS.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  onClick={() => setMenuOpen(false)}
                  className={({ isActive }) =>
                    cn(navClass(isActive, item.to === '/auth'), 'w-full justify-center')
                  }
                >
                  {item.label}
                </NavLink>
              ))}
              {user ? (
                <NavLink
                  to="/"
                  onClick={() => setMenuOpen(false)}
                  className={cn(limsDarkBarBtnClass, 'inline-flex w-full items-center justify-center gap-1.5')}
                >
                  <LayoutDashboard size={14} />
                  Open LIMS
                </NavLink>
              ) : null}
            </div>
          </nav>
        ) : null}
      </header>

      <main className="flex min-h-0 flex-1 flex-col">
        <Outlet />
      </main>

      <footer className={cn(limsDarkBarClass, 'mt-auto')}>
        <div className="pointer-events-none absolute inset-0 opacity-[0.16]" style={limsDarkBarGlowStyle} />
        <div className="absolute left-0 top-0 h-[2px] w-full bg-gradient-to-r from-amber-600 via-amber-300 to-transparent" />
        <p className="relative px-4 py-3 text-center text-[11px] text-stone-400 sm:px-6">
          © {new Date().getFullYear()} {PUBLIC_LAB_NAME}. All rights reserved.
        </p>
      </footer>
    </div>
  )
}
