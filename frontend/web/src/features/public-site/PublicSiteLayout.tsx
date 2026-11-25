import { useEffect, useState } from 'react'
import { BadgeCheck, LayoutDashboard, Menu, X } from 'lucide-react'
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { cn } from '@/lib/utils'
import { PUBLIC_EMAIL, PUBLIC_LAB_NAME, PUBLIC_LAB_SHORT, PUBLIC_PHONE_PRIMARY, PUBLIC_TABS } from './publicNav'
import { useCompanyLogoUrl } from './useCompanyLogoUrl'
import './publicSite.css'

const telHref = (phone: string) => `tel:${phone.replace(/[^+\d]/g, '')}`

/** Public website frame (Apple-style, the same as the Qirlpl website): top bar with the tabs, page, slim footer. */
export default function PublicSiteLayout() {
  const { user, role } = useAuth()
  const [menuOpen, setMenuOpen] = useState(false)
  const companyLogoUrl = useCompanyLogoUrl()
  const { pathname } = useLocation()
  const appHome = role === 'customer' ? '/portal' : '/'
  const appLabel = role === 'customer' ? 'Open Portal' : 'Open App'

  // Each tab is its own page: start it at the top.
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior })
  }, [pathname])

  // Stop the page behind the phone menu from scrolling while it is open (every link in it closes it).
  useEffect(() => {
    if (!menuOpen) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [menuOpen])

  const closeMenu = () => setMenuOpen(false)

  return (
    <div className="qp" id="top">
      <header className="qp-nav">
        <div className="qp-wrap-wide qp-nav-inner">
          <Link to="/home" className="qp-brand" aria-label={`${PUBLIC_LAB_NAME}, home`} onClick={closeMenu}>
            {companyLogoUrl ? (
              <img src={companyLogoUrl} alt="" className="h-[30px] w-auto max-w-[96px] object-contain" />
            ) : (
              <span className="qp-brand-mark" aria-hidden>
                <BadgeCheck size={17} />
              </span>
            )}
            <span className="min-w-0 leading-tight">
              <span className="qp-brand-name">{PUBLIC_LAB_SHORT}</span>
              <span className="qp-brand-sub">BIS &amp; ISO Certification Consultants</span>
            </span>
          </Link>

          <nav className="qp-nav-links" aria-label="Website">
            {PUBLIC_TABS.map((tab) => (
              <NavLink key={tab.to} to={tab.to} className={({ isActive }) => cn('qp-nav-link', isActive && 'active')}>
                {tab.label}
              </NavLink>
            ))}
            <NavLink to={user ? appHome : '/auth'} className="qp-btn small" style={{ marginLeft: 8 }}>
              {user ? (
                <>
                  <LayoutDashboard size={14} /> {appLabel}
                </>
              ) : (
                'Login'
              )}
            </NavLink>
          </nav>

          <button
            type="button"
            className="qp-menu-btn"
            aria-label={menuOpen ? 'Close Menu' : 'Open Menu'}
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((open) => !open)}
          >
            {menuOpen ? <X size={22} /> : <Menu size={22} />}
          </button>
        </div>
      </header>

      {menuOpen ? (
        <nav className="qp-mobile-menu" aria-label="Website (Phone)">
          {PUBLIC_TABS.map((tab) => (
            <NavLink key={tab.to} to={tab.to} onClick={closeMenu} className={({ isActive }) => cn(isActive && 'active')}>
              {tab.label}
            </NavLink>
          ))}
          <Link to={user ? appHome : '/auth'} onClick={closeMenu}>
            {user ? appLabel : 'Login'}
          </Link>
        </nav>
      ) : null}

      <main className="qp-main">
        <Outlet />
      </main>

      <footer className="qp-footbar">
        <div className="qp-wrap-wide qp-footbar-inner">
          <span>
            © {new Date().getFullYear()} {PUBLIC_LAB_NAME} · Raipur, Chhattisgarh
          </span>
          <span className="qp-footbar-links">
            <Link to="/enquiry">Contact</Link>
            <a href={`mailto:${PUBLIC_EMAIL}`}>{PUBLIC_EMAIL}</a>
            <a href={telHref(PUBLIC_PHONE_PRIMARY)}>{PUBLIC_PHONE_PRIMARY}</a>
          </span>
        </div>
      </footer>
    </div>
  )
}
