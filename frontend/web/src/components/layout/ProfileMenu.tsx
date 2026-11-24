import type { ElementType } from 'react'
import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import { Bot, ChevronDown, Globe, KeyRound, LogOut, Mail, Shield, ShieldCheck } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useAuth, signOut } from '@/hooks/useAuth'
import { isLaboratoryDirector } from '@/lib/isLaboratoryDirector'
import { limsDarkBarGlowStyle } from '@/lib/limsThemeUi'
import { PROFILE_MENU_SECTIONS, type NavItem } from '@/lib/appNav'
import { cn } from '@/lib/utils'
import { navItemAccessible, useNavCanAccess } from './navAccess'
import { useFlushRightMenu } from './useFlushRightMenu'

/** Settings pages the profile menu shows to the Laboratory Director only. */
const DIRECTOR_ONLY_PROFILE_PATHS = new Set([
  '/settings/lab',
  '/settings/users',
  '/settings/module-access',
  '/settings/ai',
  '/settings/email-log',
  '/settings/standards-library',
])

function entryIcon(item: NavItem): ElementType {
  if (item.to === '/settings/ai') return Bot
  if (item.to === '/settings/email-log') return Mail
  if (item.to === '/settings/module-access') return Shield
  if (item.to === '/tools/cms') return Globe
  return item.icon
}

/** Item row, dark like the sidebar / ☰ menu. */
const itemClass = cn(
  'group flex cursor-pointer items-center gap-2.5 rounded-none px-2 py-1.5 text-[13px] font-medium text-stone-300 outline-none transition-colors',
  'hover:bg-white/10 hover:text-white focus:bg-white/10 focus:text-white',
)

/** Small square icon tile in front of each entry (like the sidebar's section icons). */
function EntryIcon({ icon: Icon, tone = 'default' }: { icon: ElementType; tone?: 'default' | 'danger' }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'flex h-6 w-6 shrink-0 items-center justify-center rounded-none ring-1 transition-colors',
        tone === 'danger'
          ? 'bg-red-500/10 text-red-300 ring-red-500/30 group-hover:bg-red-500/20 group-focus:bg-red-500/20'
          : 'bg-amber-500/15 text-amber-300 ring-amber-500/30 group-hover:bg-amber-500/25 group-focus:bg-amber-500/25',
      )}
    >
      <Icon size={13} strokeWidth={2} />
    </span>
  )
}

function Heading({ children }: { children: string }) {
  return <p className="px-2 pb-1 pt-2 text-[10px] font-bold uppercase tracking-wider text-stone-400">{children}</p>
}

/**
 * Profile menu at the top right of the header, as in the Qirlpl LIMS (owner, 24 Nov 2026): a header with the name
 * and role, grouped entries with icon tiles, the current page highlighted and Log Out set apart. It opens right under
 * the app header, flush with the right edge of the screen.
 */
export function ProfileMenu({
  initials,
  onChangePassword,
  onTwoStepLogin,
}: {
  initials: string
  onChangePassword: () => void
  onTwoStepLogin: () => void
}) {
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const { profileName, designation, profileReady, role } = useAuth()
  const canAccess = useNavCanAccess()
  const isDirector = isLaboratoryDirector(role)
  const { triggerRef, offsets, measure } = useFlushRightMenu<HTMLButtonElement>()
  const name = profileReady ? profileName || 'User' : 'Loading profile…'
  const roleLabel = profileReady ? designation || 'Staff' : ' '

  const sections = PROFILE_MENU_SECTIONS.map((section) => ({
    section,
    items: section.items.filter((item) => {
      if (!item.to) return false
      if (DIRECTOR_ONLY_PROFILE_PATHS.has(item.to) && !isDirector) return false
      return navItemAccessible(item, canAccess)
    }),
  })).filter((s) => s.items.length > 0)

  return (
    <DropdownMenu
      onOpenChange={(open) => {
        if (open) measure()
      }}
    >
      <DropdownMenuTrigger asChild>
        <button
          ref={triggerRef}
          className="flex items-center gap-2 rounded-none px-2 py-1.5 transition-colors hover:bg-white/10 data-[state=open]:bg-white/10"
        >
          <div className="flex h-8 w-8 items-center justify-center rounded-none bg-amber-700 text-xs font-bold text-white shadow-sm">
            {initials}
          </div>
          <div className="hidden text-left leading-tight sm:block">
            <p className="max-w-[140px] truncate text-xs font-semibold text-white lg:max-w-[180px]">{name}</p>
            <p className="max-w-[140px] truncate text-[11px] text-stone-300 sm:text-xs lg:max-w-[180px]">{roleLabel}</p>
          </div>
          <ChevronDown size={14} className="hidden text-stone-400 sm:block" />
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent
        align="end"
        sideOffset={offsets.sideOffset}
        alignOffset={offsets.alignOffset}
        className={cn(
          'profile-menu max-h-[var(--radix-dropdown-menu-content-available-height)] w-72 overflow-y-auto overscroll-contain rounded-none border border-r-0 border-stone-700 p-0 text-stone-200',
          'bg-gradient-to-b from-stone-800 via-stone-900 to-stone-950 shadow-2xl shadow-black/40',
        )}
      >
        <div className="relative overflow-hidden border-b border-stone-700 bg-gradient-to-br from-stone-800 via-stone-900 to-stone-950 px-3 py-3 text-white">
          <div className="pointer-events-none absolute inset-0 opacity-[0.18]" style={limsDarkBarGlowStyle} />
          <div className="absolute bottom-0 left-0 h-[2px] w-full bg-gradient-to-r from-amber-500 via-amber-300 to-transparent" />
          <div className="relative flex items-center gap-2.5">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-none bg-amber-700 text-xs font-bold text-white shadow-sm">
              {initials}
            </div>
            <div className="min-w-0 leading-tight">
              <p className="truncate text-sm font-semibold">{name}</p>
              <p className="truncate text-[11px] text-amber-200/90">{roleLabel}</p>
            </div>
          </div>
        </div>

        <div className="p-1">
          {sections.map(({ section, items }, i) => (
            <div key={section.clause}>
              {i > 0 ? <DropdownMenuSeparator className="bg-stone-700" /> : null}
              <Heading>{section.title}</Heading>
              {items.map((item) => {
                const current = pathname === item.to || pathname.startsWith(`${item.to}/`)
                return (
                  <DropdownMenuItem key={item.to} asChild className={cn(itemClass, current && 'sidebar-nav-active')}>
                    <NavLink to={item.to!} end>
                      <EntryIcon icon={entryIcon(item)} />
                      {item.label}
                    </NavLink>
                  </DropdownMenuItem>
                )
              })}
            </div>
          ))}

          <DropdownMenuSeparator className="bg-stone-700" />
          <Heading>Account</Heading>
          <DropdownMenuItem onSelect={onChangePassword} className={itemClass}>
            <EntryIcon icon={KeyRound} />
            Change Password
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={onTwoStepLogin} className={itemClass}>
            <EntryIcon icon={ShieldCheck} />
            Two-Step Login
          </DropdownMenuItem>
        </div>

        <div className="border-t border-stone-700 bg-black/20 p-1">
          <DropdownMenuItem
            className={cn(itemClass, 'text-red-300 hover:bg-red-500/15 hover:text-red-200 focus:bg-red-500/15 focus:text-red-200')}
            onSelect={async (event) => {
              event.preventDefault()
              await signOut()
              navigate('/auth', { replace: true })
            }}
          >
            <EntryIcon icon={LogOut} tone="danger" />
            Log Out
          </DropdownMenuItem>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
