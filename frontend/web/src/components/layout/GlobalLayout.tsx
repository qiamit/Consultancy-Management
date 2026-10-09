import { useCallback, useEffect, useMemo, useState, type ElementType } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useAppDateFormat } from '@/lib/AppDateFormatProvider'
import { useAppCurrency } from '@/lib/AppCurrencyProvider'
import {
  ChevronDown,
  ChevronRight,
  LayoutDashboard,
  Menu,
  X,
  LogOut,
  Bot,
  Shield,
  Globe,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useAuth, signOut } from '@/hooks/useAuth'
import { supabase } from '@/lib/supabaseClient'
import { isLaboratoryDirector } from '@/lib/isLaboratoryDirector'
import { canAccessNavItem as checkNavAccess } from '@/lib/moduleAccess'
import { useModuleAccessOptional } from '@/features/settings/module-access/ModuleAccessProvider'
import { RequireModuleAccess } from '@/components/auth/RequireModuleAccess'
import { getBrandShortName, LAB_NAME_CHANGED_EVENT, LAB_NAME_STORAGE_KEY } from '@/features/settings/lab-settings/brandMark'
import {
  PROFILE_MENU_SECTIONS,
  SIDEBAR_NAV_SECTIONS,
  flattenNavModules,
  type NavItem,
  type NavSection,
} from '@/lib/appNav'
import { QiAssistant } from '@/components/qi-assistant/QiAssistant'
import { toProperLabelText } from '@/lib/properLabelText'

const formatNavLabel = (value: string) => toProperLabelText(value)

function navItemAccessible(
  item: NavItem,
  canAccess: (requiredDesignations: string[] | undefined, to: string | undefined) => boolean,
): boolean {
  return canAccess(item.requiredDesignations, item.to)
}

function useNavCanAccess() {
  const moduleAccess = useModuleAccessOptional()
  const { designation, departmentName } = useAuth()
  const legacyCtx = useMemo(
    () => ({ designation: designation ?? '', departmentName: departmentName ?? '' }),
    [designation, departmentName],
  )

  return useCallback(
    (requiredDesignations: string[] | undefined, to: string | undefined) => {
      if (moduleAccess) return moduleAccess.canAccessNavItem(requiredDesignations, to)
      return checkNavAccess(requiredDesignations, to, legacyCtx)
    },
    [moduleAccess, legacyCtx],
  )
}

/** Expandable nav: starts closed; stays open until user collapses manually */
function useNavSectionOpen(initialOpen = false) {
  const [open, setOpen] = useState(initialOpen)
  const toggleOpen = () => setOpen((v) => !v)
  return { open, setOpen, toggleOpen }
}

function navItemMatchesPath(item: NavItem, pathname: string): boolean {
  if (item.to && (pathname === item.to || pathname.startsWith(`${item.to}/`))) return true
  return (item.children ?? []).some((c) => navItemMatchesPath(c, pathname))
}

function sectionContainsPath(section: NavSection, pathname: string): boolean {
  return section.items.some((item) => navItemMatchesPath(item, pathname))
}

const DIRECTOR_ONLY_PROFILE_PATHS = new Set([
  '/settings/lab',
  '/settings/users',
  '/settings/module-access',
  '/settings/ai',
])

function profileMenuIcon(item: NavItem): ElementType {
  if (item.to === '/settings/ai') return Bot
  if (item.to === '/settings/module-access') return Shield
  if (item.to === '/tools/cms') return Globe
  return item.icon
}

function ProfileMenuSections() {
  const canAccess = useNavCanAccess()
  const { designation } = useAuth()
  const isDirector = isLaboratoryDirector(designation)

  return (
    <>
      {PROFILE_MENU_SECTIONS.map((section, sectionIndex) => {
        const visibleItems = section.items.filter((item) => {
          if (!item.to) return false
          if (DIRECTOR_ONLY_PROFILE_PATHS.has(item.to) && !isDirector) return false
          return navItemAccessible(item, canAccess)
        })
        if (visibleItems.length === 0) return null
        return (
          <div key={section.clause}>
            {sectionIndex > 0 ? <DropdownMenuSeparator /> : null}
            <DropdownMenuLabel className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              {section.title}
            </DropdownMenuLabel>
            {visibleItems.map((item) => {
              const Icon = profileMenuIcon(item)
              return (
                <DropdownMenuItem key={item.to} asChild>
                  <NavLink to={item.to!} className="flex items-center gap-2">
                    <Icon size={14} />
                    {item.label}
                  </NavLink>
                </DropdownMenuItem>
              )
            })}
          </div>
        )
      })}
    </>
  )
}

function SidebarMainNav() {
  const location = useLocation()
  const [openSectionId, setOpenSectionId] = useState<string | null>(null)

  useEffect(() => {
    const match = SIDEBAR_NAV_SECTIONS.find((s) => sectionContainsPath(s, location.pathname))
    if (match) setOpenSectionId(match.clause)
  }, [location.pathname])

  return (
    <nav className="w-full min-w-0 max-w-full space-y-2 overflow-x-hidden px-2 pb-3" aria-label="Main navigation">
      <div className="min-w-0 max-w-full overflow-hidden rounded-none border border-stone-600/80 bg-stone-900/50 p-1">
        <NavItemLink
          item={{ label: 'Dashboard', to: '/', icon: LayoutDashboard }}
          collapsed={false}
        />
      </div>

      {SIDEBAR_NAV_SECTIONS.map((section) => (
        <NavSectionGroup
          key={section.clause}
          section={section}
          collapsed={false}
          open={openSectionId === section.clause}
          onToggle={() =>
            setOpenSectionId((prev) => (prev === section.clause ? null : section.clause))
          }
        />
      ))}
    </nav>
  )
}

function NavSectionGroup({
  section,
  collapsed,
  open,
  onToggle,
}: {
  section: NavSection
  collapsed: boolean
  open: boolean
  onToggle: () => void
}) {
  const SectionIcon = section.icon
  const canAccess = useNavCanAccess()

  const visibleItems = useMemo(
    () =>
      section.items.filter((item) => {
        if (item.children && item.children.length > 0) {
          return item.children.some((c) => navItemAccessible(c, canAccess))
        }
        return navItemAccessible(item, canAccess)
      }),
    [section.items, canAccess],
  )

  if (visibleItems.length === 0 && section.items.length > 0) return null

  if (collapsed) {
    return (
      <div className="space-y-0.5">
        <div className="mx-2 my-2 h-px bg-stone-600/80" />
        {visibleItems.map((item) => (
          <div key={item.to ?? item.label}>
            {item.children && item.children.length > 0 ? (
              <NavItemGroup item={item} collapsed={collapsed} />
            ) : (
              <NavItemLink item={item} collapsed={collapsed} />
            )}
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className="sidebar-section-panel">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full min-w-0 max-w-full items-center gap-1.5 rounded-none px-1.5 py-2 text-left transition-colors hover:bg-white/10"
        aria-expanded={open}
        title={formatNavLabel(section.title)}
      >
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-none bg-amber-500/15 text-amber-300 ring-1 ring-amber-500/30">
          <SectionIcon size={13} aria-hidden />
        </span>
        <span className="min-w-0 flex-1 truncate text-[10px] font-bold uppercase tracking-wide text-stone-300">
          {formatNavLabel(section.title)}
        </span>
        <span className="shrink-0 text-stone-500">
          {open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
        </span>
      </button>

      {open && visibleItems.length === 0 ? (
        <p className="mx-1 mb-1 rounded-none bg-stone-800/60 px-2.5 py-2 text-[11px] text-stone-400">
          Coming soon
        </p>
      ) : null}

      {open && visibleItems.length > 0 ? (
        <ul className="mt-0.5 space-y-0.5">
          {visibleItems.map((item) => (
            <li key={item.to ?? item.label}>
              {item.children && item.children.length > 0 ? (
                <NavItemGroup item={item} collapsed={collapsed} />
              ) : (
                <NavItemLink item={item} collapsed={collapsed} />
              )}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}

function NavItemGroup({ item, collapsed }: { item: NavItem; collapsed: boolean }) {
  const location = useLocation()
  const Icon = item.icon
  const canAccess = useNavCanAccess()

  const children = item.children ?? []
  const visibleChildren = useMemo(
    () => children.filter((c) => navItemAccessible(c, canAccess)),
    [children, canAccess],
  )
  const isAnyChildActive = useMemo(() => {
    return visibleChildren.some((c) => {
      if (!c.to) return false
      return location.pathname === c.to || location.pathname.startsWith(`${c.to}/`)
    })
  }, [visibleChildren, location.pathname])

  const { open, setOpen, toggleOpen } = useNavSectionOpen(isAnyChildActive)

  useEffect(() => {
    if (isAnyChildActive) setOpen(true)
  }, [isAnyChildActive, setOpen])

  if (visibleChildren.length === 0) return null

  // Collapsed rail: flyout menu so nested routes remain reachable
  if (collapsed) {
    return (
      <DropdownMenu>
        <TooltipProvider delayDuration={0}>
          <Tooltip>
            <TooltipTrigger asChild>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className={cn(
                    'sidebar-nav-item w-full justify-center px-2',
                    isAnyChildActive && 'sidebar-nav-active',
                  )}
                  aria-label={formatNavLabel(item.label)}
                >
                  <Icon size={16} className="shrink-0 opacity-80" />
                </button>
              </DropdownMenuTrigger>
            </TooltipTrigger>
            <TooltipContent side="right" sideOffset={8}>
              {formatNavLabel(item.label)}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
        <DropdownMenuContent side="right" align="start" sideOffset={10} className="min-w-[12rem]">
          <div className="px-2 py-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            {formatNavLabel(item.label)}
          </div>
          <DropdownMenuSeparator />
          {visibleChildren.map((c) => {
            if (!c.to) return null
            const ChildIcon = c.icon
            return (
              <DropdownMenuItem key={c.to} asChild>
                <NavLink to={c.to} className="flex cursor-pointer items-center gap-2">
                  <ChildIcon size={14} className="opacity-70" />
                  <span>{formatNavLabel(c.label)}</span>
                </NavLink>
              </DropdownMenuItem>
            )
          })}
        </DropdownMenuContent>
      </DropdownMenu>
    )
  }

  return (
    <div>
      <button
        type="button"
        onClick={toggleOpen}
        className={cn(
          'sidebar-nav-item w-full',
          isAnyChildActive && 'sidebar-nav-active',
        )}
        aria-expanded={open}
      >
        <Icon size={15} className="shrink-0 opacity-80" />
        <span className="flex-1 truncate text-left">{formatNavLabel(item.label)}</span>
        <span className="opacity-45">
          {open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
        </span>
      </button>

      {open && (
        <ul className="mt-0.5 ml-3 space-y-0.5 border-l border-amber-500/25 pl-2">
          {visibleChildren.map((c) => (
            <li key={c.to ?? c.label}>
              <NavItemLink item={c} collapsed={false} nested />
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function NavItemLink({
  item,
  collapsed,
  nested = false,
}: {
  item: NavItem
  collapsed: boolean
  nested?: boolean
}) {
  const Icon = item.icon
  const canAccess = useNavCanAccess()

  if (!item.to) return null
  if (!navItemAccessible(item, canAccess)) return null

  const link = (
    <NavLink
      to={item.to}
      end={item.to === '/'}
      className={({ isActive }) =>
        cn(
          'sidebar-nav-item',
          nested && 'py-1.5 text-[12px]',
          isActive && 'sidebar-nav-active',
          collapsed && 'justify-center px-2',
        )
      }
    >
      <Icon size={nested ? 14 : 15} className="shrink-0 opacity-80" />
      {!collapsed && (
        <span className="min-w-0 flex-1 truncate">{formatNavLabel(item.label)}</span>
      )}
    </NavLink>
  )

  if (collapsed) {
    return (
      <TooltipProvider delayDuration={0}>
        <Tooltip>
          <TooltipTrigger asChild>{link}</TooltipTrigger>
          <TooltipContent side="right" sideOffset={8}>
            {item.label}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    )
  }

  return link
}

export default function GlobalLayout() {
  // Re-render entire shell when Lab Settings date/time/currency preferences change
  useAppDateFormat()
  useAppCurrency()
  const navigate = useNavigate()
  const location = useLocation()
  const globalPageTitle = useMemo(() => {
    let best = ''
    let label = ''
    for (const item of flattenNavModules()) {
      if (location.pathname === item.key || (item.key !== '/' && location.pathname.startsWith(`${item.key}/`))) {
        if (item.key.length > best.length) {
          best = item.key
          label = item.label
        }
      }
    }
    return label || 'Q Engineering'
  }, [location.pathname])
  const hideGlobalAssistant =
    location.pathname === '/masters/clients' ||
    location.pathname.startsWith('/masters/clients/') ||
    location.pathname === '/masters/is-codes' ||
    location.pathname.startsWith('/masters/is-codes/') ||
    location.pathname === '/masters/test-parameter' ||
    location.pathname.startsWith('/masters/test-parameter/')
  const { profileName, designation } = useAuth()
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    if (typeof window === 'undefined') return false
    return window.localStorage.getItem('app.sidebarCollapsed') === '1'
  })
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const [labName, setLabName] = useState(() => {
    if (typeof window === 'undefined') return ''
    return window.localStorage.getItem(LAB_NAME_STORAGE_KEY) ?? ''
  })

  // Dialogs portal to <body>; publish content-area center + overlay inset beside docked sidebar.
  useEffect(() => {
    const root = document.documentElement
    const syncDialogLayout = () => {
      const desktop = window.matchMedia('(min-width: 1024px)').matches
      if (desktop && !sidebarCollapsed) {
        root.style.setProperty('--app-dialog-center-x', 'calc(268px + (100vw - 268px) / 2)')
        root.style.setProperty('--app-dialog-overlay-left', '268px')
        root.dataset.sidebarDocked = '1'
      } else {
        root.style.setProperty('--app-dialog-center-x', '50%')
        root.style.setProperty('--app-dialog-overlay-left', '0px')
        delete root.dataset.sidebarDocked
      }
    }
    syncDialogLayout()
    window.addEventListener('resize', syncDialogLayout)
    return () => {
      window.removeEventListener('resize', syncDialogLayout)
      root.style.removeProperty('--app-dialog-center-x')
      root.style.removeProperty('--app-dialog-overlay-left')
      delete root.dataset.sidebarDocked
    }
  }, [sidebarCollapsed])

  useEffect(() => {
    let canceled = false

    const loadLabName = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession()
      if (!session?.access_token || canceled) return

      const { data, error } = await supabase
        .from('lab_settings')
        .select('lab_name, created_at')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (canceled) return
      if (error || !data) return
      const name = typeof data.lab_name === 'string' ? data.lab_name : ''
      if (!name.trim()) return

      setLabName(name)
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(LAB_NAME_STORAGE_KEY, name)
      }
    }

    void loadLabName()

    const { data: authListener } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'INITIAL_SESSION') {
        if (nextSession?.access_token) void loadLabName()
      }
    })

    const onStorage = (e: StorageEvent) => {
      if (e.key !== LAB_NAME_STORAGE_KEY) return
      setLabName(typeof e.newValue === 'string' ? e.newValue : '')
    }

    const onLabNameChanged = (e: Event) => {
      const detail = (e as CustomEvent<string>).detail
      if (typeof detail === 'string') setLabName(detail)
    }

    if (typeof window !== 'undefined') {
      window.addEventListener('storage', onStorage)
      window.addEventListener(LAB_NAME_CHANGED_EVENT, onLabNameChanged)
    }

    return () => {
      canceled = true
      authListener.subscription.unsubscribe()
      if (typeof window !== 'undefined') {
        window.removeEventListener('storage', onStorage)
        window.removeEventListener(LAB_NAME_CHANGED_EVENT, onLabNameChanged)
      }
    }
  }, [])

  useEffect(() => {
    setMobileNavOpen(false)
  }, [location.pathname])

  useEffect(() => {
    if (!mobileNavOpen) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMobileNavOpen(false)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [mobileNavOpen])

  useEffect(() => {
    if (!mobileNavOpen) return
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previousOverflow
    }
  }, [mobileNavOpen])

  const initials = useMemo(() => {
    const name = profileName || ''
    const parts = name.split(' ').filter(Boolean)
    if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase()
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
    return 'U'
  }, [profileName])

  const toggleSidebarCollapsed = () => {
    setSidebarCollapsed((v) => {
      const next = !v
      if (typeof window !== 'undefined') {
        window.localStorage.setItem('app.sidebarCollapsed', next ? '1' : '0')
      }
      return next
    })
  }

  const brandShortName = useMemo(() => getBrandShortName(labName), [labName])

  const renderSidebar = (collapsed: boolean, options?: { showCollapseToggle?: boolean }) => {
    const showCollapseToggle = options?.showCollapseToggle ?? false
    return (
    <>
      <div
        className={cn(
          'relative flex shrink-0 items-center gap-3 overflow-hidden border-b border-stone-700 px-3 py-3',
          'bg-gradient-to-br from-stone-800 via-stone-900 to-stone-950',
          'min-h-[5.5rem]',
        )}
      >
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.16]"
          style={{
            backgroundImage:
              'radial-gradient(circle at 10% 30%, rgba(217,119,6,0.4), transparent 40%), radial-gradient(circle at 90% 0%, rgba(251,191,36,0.22), transparent 35%)',
          }}
        />
        <div className="absolute bottom-0 left-0 h-[2px] w-full bg-gradient-to-r from-amber-500 via-amber-300 to-transparent" />

        <div
          className="relative flex h-14 min-w-0 flex-1 items-center justify-center overflow-hidden rounded-none bg-white px-2 py-1 shadow-md ring-1 ring-amber-500/40"
          title={labName || brandShortName}
        >
          <img
            src="/brand/qe-logo.png"
            alt=""
            className="h-full w-full max-w-[11rem] object-contain"
            draggable={false}
          />
        </div>

        {showCollapseToggle ? (
          <button
            type="button"
            onClick={toggleSidebarCollapsed}
            className="relative z-10 shrink-0 rounded-none border border-transparent p-1.5 text-stone-200 transition-colors hover:border-amber-500/40 hover:bg-white/10 hover:text-white"
            aria-label="Hide sidebar"
            title="Hide sidebar"
          >
            <Menu size={18} aria-hidden />
          </button>
        ) : (
          <button
            type="button"
            className="relative z-10 shrink-0 rounded-none p-1.5 text-stone-200 hover:bg-white/10 hover:text-white lg:hidden"
            onClick={() => setMobileNavOpen(false)}
            aria-label="Close navigation menu"
          >
            <X size={18} />
          </button>
        )}
      </div>

      <ScrollArea className="min-w-0 flex-1 overflow-hidden py-3">
        <SidebarMainNav />
      </ScrollArea>
    </>
    )
  }

  return (
    <div className="flex h-[100dvh] overflow-hidden bg-background">
      {mobileNavOpen && (
        <button
          type="button"
          className="fixed inset-0 z-40 bg-slate-900/50 backdrop-blur-[2px] lg:hidden"
          aria-label="Close navigation menu"
          onClick={() => setMobileNavOpen(false)}
        />
      )}

      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 flex w-[min(88vw,280px)] max-w-[280px] flex-col overflow-hidden border-r border-stone-700',
          'bg-gradient-to-b from-stone-800 via-stone-900 to-stone-950 shadow-2xl shadow-stone-950/40',
          'transition-transform duration-300 ease-in-out lg:hidden',
          mobileNavOpen ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        {renderSidebar(false, { showCollapseToggle: false })}
      </aside>

      {!sidebarCollapsed ? (
        <aside
          className={cn(
            'hidden w-[268px] min-w-0 max-w-[268px] flex-col overflow-hidden border-r border-stone-700 bg-gradient-to-b from-stone-800 via-stone-900 to-stone-950',
            'relative z-[55] shadow-lg shadow-stone-950/30 transition-[width] duration-300 ease-in-out lg:flex',
          )}
        >
          {renderSidebar(false, { showCollapseToggle: true })}
        </aside>
      ) : null}

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <header className="relative sticky top-0 z-30 flex h-14 shrink-0 items-center justify-between gap-2 overflow-hidden border-b border-stone-700 bg-gradient-to-br from-stone-800 via-stone-900 to-stone-950 px-2 text-white shadow-md sm:px-4 md:px-6">
          <div
            className="pointer-events-none absolute inset-0 opacity-[0.16]"
            style={{
              backgroundImage:
                'radial-gradient(circle at 10% 30%, rgba(217,119,6,0.4), transparent 40%), radial-gradient(circle at 90% 0%, rgba(251,191,36,0.22), transparent 35%)',
            }}
          />
          <div className="absolute bottom-0 left-0 h-[2px] w-full bg-gradient-to-r from-amber-500 via-amber-300 to-transparent" />

          <div className="relative flex min-w-0 flex-1 items-center gap-2 sm:gap-3">
            <button
              type="button"
              className={cn(
                'inline-flex h-9 w-9 items-center justify-center rounded-none border border-stone-500 bg-stone-800/80 text-white shadow-sm transition-colors hover:border-amber-500/50 hover:bg-stone-700',
                !sidebarCollapsed && 'lg:hidden',
              )}
              onClick={() => {
                if (typeof window !== 'undefined' && window.matchMedia('(min-width: 1024px)').matches) {
                  if (sidebarCollapsed) toggleSidebarCollapsed()
                  return
                }
                setMobileNavOpen(true)
              }}
              aria-label={sidebarCollapsed ? 'Show sidebar' : 'Open navigation menu'}
              title={sidebarCollapsed ? 'Show sidebar' : 'Open navigation menu'}
            >
              <Menu size={18} aria-hidden />
            </button>
            <div className="min-w-0">
              <p
                className="truncate text-sm font-semibold tracking-tight text-white sm:text-base"
                title={labName.trim() || brandShortName}
              >
                {labName.trim() || brandShortName || 'Company'}
              </p>
            </div>
          </div>

          <div className="relative flex shrink-0 items-center gap-2 sm:gap-3">
            {hideGlobalAssistant ? null : (
              <>
                <div className="hidden sm:block">
                  <QiAssistant
                    page="global"
                    pageTitle={globalPageTitle}
                    contextSummary={`The user is on the app route ${location.pathname}.`}
                    triggerVariant="default"
                    triggerClassName="h-8"
                  />
                </div>
                <div className="sm:hidden">
                  <QiAssistant
                    page="global"
                    pageTitle={globalPageTitle}
                    contextSummary={`The user is on the app route ${location.pathname}.`}
                    triggerVariant="icon"
                  />
                </div>
              </>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex items-center gap-2 rounded-none px-2 py-1.5 transition-colors hover:bg-white/10">
                  <div className="flex h-8 w-8 items-center justify-center rounded-none bg-amber-700 text-xs font-bold text-white shadow-sm">
                    {initials}
                  </div>
                  <div className="hidden text-left leading-tight sm:block">
                    <p className="max-w-[140px] truncate text-xs font-semibold text-white lg:max-w-[180px]">
                      {profileName || 'User'}
                    </p>
                    <p className="max-w-[140px] truncate text-[10px] text-stone-300 lg:max-w-[180px]">
                      {designation || 'Staff'}
                    </p>
                  </div>
                  <ChevronDown size={14} className="hidden text-stone-400 sm:block" />
                </button>
              </DropdownMenuTrigger>

              <DropdownMenuContent align="end" className="w-56">
                <div className="px-2 py-2 sm:hidden">
                  <p className="text-sm font-semibold">{profileName || 'User'}</p>
                  <p className="text-xs text-muted-foreground">{designation || 'Staff'}</p>
                </div>
                <DropdownMenuSeparator className="sm:hidden" />

                <ProfileMenuSections />

                <DropdownMenuSeparator />

                <DropdownMenuItem
                  className="text-destructive focus:text-destructive"
                  onSelect={async (event) => {
                    event.preventDefault()
                    await signOut()
                    navigate('/auth', { replace: true })
                  }}
                >
                  <LogOut size={14} />
                  Log Out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        <main className="app-shell-main pb-[env(safe-area-inset-bottom)]">
          <RequireModuleAccess>
            <Outlet />
          </RequireModuleAccess>
        </main>
      </div>
    </div>
  )
}
