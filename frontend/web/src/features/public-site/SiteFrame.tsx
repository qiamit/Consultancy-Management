import { useEffect, useState } from 'react'
import { LayoutDashboard, Menu, X } from 'lucide-react'
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { PUBLIC_EMAIL, PUBLIC_LAB_NAME, PUBLIC_PHONE_PRIMARY, PUBLIC_TABS } from './publicNav'
import './site.css'

const phoneLink = (phone: string) => `tel:${phone.replace(/[^+\d]/g, '')}`
const tabClass = ({ isActive }: { isActive: boolean }) => (isActive ? 'qs-tab is-on' : 'qs-tab')

/**
 * Frame of the Quality Engineering website and sign-in pages: top bar with the QE logo and the tabs, the page, and a
 * thin footer. The logo is the static file /brand/qe-logo.png, so it shows before sign-in too.
 */
export default function SiteFrame() {
  const { user, role } = useAuth()
  const { pathname } = useLocation()
  const [drawerOpen, setDrawerOpen] = useState(false)
  const appPath = role === 'customer' ? '/portal' : '/'
  const appLabel = role === 'customer' ? 'Open Portal' : 'Open App'

  // A new tab opens at the top of its page.
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [pathname])

  // The page behind the phone menu stays still while the menu is open.
  useEffect(() => {
    if (!drawerOpen) return
    const before = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = before
    }
  }, [drawerOpen])

  const close = () => setDrawerOpen(false)

  return (
    <div className="qe-site">
      <header className="qs-top">
        <div className="qs-top-row">
          <Link to="/home" className="qs-logo" onClick={close} aria-label={`${PUBLIC_LAB_NAME} Home`}>
            <img src="/brand/qe-logo.png" alt={PUBLIC_LAB_NAME} />
            <span className="qs-logo-text">
              <strong>BIS &amp; ISO Certification</strong>
              <span>NABL · QAI · IQAS Accreditation</span>
            </span>
          </Link>

          <nav className="qs-tabs" aria-label="Website">
            {PUBLIC_TABS.map((tab) => (
              <NavLink key={tab.to} to={tab.to} className={tabClass}>
                {tab.label}
              </NavLink>
            ))}
            <Link to={user ? appPath : '/auth'} className="qs-btn small" style={{ marginLeft: 8 }}>
              {user ? (
                <>
                  <LayoutDashboard size={14} aria-hidden /> {appLabel}
                </>
              ) : (
                'Sign In'
              )}
            </Link>
          </nav>

          <button
            type="button"
            className="qs-burger"
            aria-label={drawerOpen ? 'Close Menu' : 'Open Menu'}
            aria-expanded={drawerOpen}
            onClick={() => setDrawerOpen((open) => !open)}
          >
            {drawerOpen ? <X size={22} /> : <Menu size={22} />}
          </button>
        </div>
      </header>

      {drawerOpen ? (
        <nav className="qs-drawer" aria-label="Website Menu">
          {PUBLIC_TABS.map((tab) => (
            <NavLink key={tab.to} to={tab.to} onClick={close} className={({ isActive }) => (isActive ? 'is-on' : '')}>
              {tab.label}
            </NavLink>
          ))}
          <Link to={user ? appPath : '/auth'} onClick={close}>
            {user ? appLabel : 'Sign In'}
          </Link>
        </nav>
      ) : null}

      <main className="qs-main">
        <Outlet />
      </main>

      <footer className="qs-foot">
        <div className="qs-foot-row">
          <span>
            © {new Date().getFullYear()} {PUBLIC_LAB_NAME}, Raipur, Chhattisgarh
          </span>
          <span className="qs-foot-links">
            <Link to="/enquiry">Contact</Link>
            <a href={`mailto:${PUBLIC_EMAIL}`}>{PUBLIC_EMAIL}</a>
            <a href={phoneLink(PUBLIC_PHONE_PRIMARY)}>{PUBLIC_PHONE_PRIMARY}</a>
          </span>
        </div>
      </footer>
    </div>
  )
}
