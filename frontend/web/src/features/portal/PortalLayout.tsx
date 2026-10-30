import { Link, Outlet, useNavigate } from 'react-router-dom'
import { LogOut, ShieldCheck } from 'lucide-react'
import { signOut, useAuth } from '@/hooks/useAuth'
import { limsDarkBarGlowStyle } from '@/lib/limsThemeUi'

/** Customer Portal frame: Q Engineering header, the customer's name and Log Out. No staff menu. */
export default function PortalLayout() {
  const navigate = useNavigate()
  const { profileName, user } = useAuth()
  const logOut = async () => {
    await signOut()
    navigate('/auth', { replace: true })
  }
  return (
    <div className="flex min-h-dvh flex-col bg-[#f5f1ea]">
      <header className="relative shrink-0 overflow-hidden bg-gradient-to-br from-stone-800 via-stone-900 to-stone-950 px-4 py-3 text-white sm:px-6">
        <div className="pointer-events-none absolute inset-0 opacity-[0.18]" style={limsDarkBarGlowStyle} />
        <div className="absolute bottom-0 left-0 h-[2px] w-full bg-gradient-to-r from-amber-500 via-amber-300 to-transparent" />
        <div className="relative mx-auto flex max-w-6xl items-center gap-3">
          <Link to="/portal" className="flex min-w-0 items-center gap-2">
            <ShieldCheck size={20} className="shrink-0 text-amber-300" aria-hidden />
            <span className="min-w-0">
              <span className="block truncate text-sm font-semibold tracking-tight sm:text-base">Q Engineering — Customer Portal</span>
              <span className="block truncate text-[11px] text-stone-300">{profileName || user?.email}</span>
            </span>
          </Link>
          <button
            type="button"
            onClick={() => void logOut()}
            className="ml-auto inline-flex h-8 shrink-0 items-center gap-1.5 rounded-none border border-amber-500/60 bg-stone-800 px-2.5 text-xs font-medium text-amber-100 hover:bg-amber-600 hover:text-white"
          >
            <LogOut size={14} aria-hidden />
            <span className="hidden sm:inline">Log Out</span>
          </button>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-3 py-4 sm:px-6 sm:py-6">
        <Outlet />
      </main>
      <footer className="px-4 py-3 text-center text-[11px] text-stone-500">
        Q Engineering · info@qengineering.in · Licence details are maintained by Q Engineering.
      </footer>
    </div>
  )
}
