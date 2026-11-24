import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ElementType,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import { createPortal } from 'react-dom'
import { NavLink, useLocation } from 'react-router-dom'
import { ChevronRight, LayoutDashboard, Menu, Pin } from 'lucide-react'
import { cn } from '@/lib/utils'
import { SIDEBAR_NAV_SECTIONS, type NavItem } from '@/lib/appNav'
import { writeSidebarMode } from '@/lib/sidebarMode'
import { formatNavLabel, navItemAccessible, useNavCanAccess, visibleNavItems, type NavCanAccess } from './navAccess'

/*
 * ☰ menu used when the sidebar is not pinned (desktop, 1280px and wider), the same as in the Qirlpl LIMS (owner,
 * 24 Nov 2026). Pointing at ☰ drops the module list, flush with the screen's left edge; pointing at a module opens
 * its options to the right, and a group opens one more column. Clicking an option opens the page. Same modules and
 * Module Access rules as the sidebar. Keyboard: Down opens, arrows move, Right / Left go in and out, Escape closes.
 */

type MenuNode = {
  key: string
  label: string
  icon: ElementType
  to?: string
  /** A top-level module (shown like the sidebar's section headers). */
  section?: boolean
  children: MenuNode[]
  comingSoon?: boolean
}

const CLOSE_DELAY_MS = 280
/** While a column is open, a row in the column before it takes over only after this pause, so the
 * pointer can cross other rows on its way to the open column. */
const SWITCH_DELAY_MS = 140

function itemNode(item: NavItem, canAccess: NavCanAccess, parentKey: string): MenuNode | null {
  const key = `${parentKey}/${item.to ?? item.label}`
  if (item.children && item.children.length > 0) {
    const children = item.children
      .map((c) => itemNode(c, canAccess, key))
      .filter((n): n is MenuNode => n !== null)
    return children.length > 0 ? { key, label: item.label, icon: item.icon, children } : null
  }
  if (!item.to || !navItemAccessible(item, canAccess)) return null
  return { key, label: item.label, icon: item.icon, to: item.to, children: [] }
}

function buildMenu(canAccess: NavCanAccess): MenuNode[] {
  const roots: MenuNode[] = [{ key: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, to: '/', children: [] }]
  for (const section of SIDEBAR_NAV_SECTIONS) {
    const items = visibleNavItems(section.items, canAccess)
      .map((item) => itemNode(item, canAccess, section.clause))
      .filter((n): n is MenuNode => n !== null)
    if (items.length === 0 && section.items.length > 0) continue
    roots.push({
      key: section.clause,
      label: section.title,
      icon: section.icon,
      section: true,
      children: items,
      comingSoon: section.items.length === 0,
    })
  }
  return roots
}

const hasFlyout = (node: MenuNode) => node.children.length > 0 || Boolean(node.comingSoon)

function nodeMatchesPath(node: MenuNode, pathname: string): boolean {
  if (node.to === '/') return pathname === '/'
  if (node.to && (pathname === node.to || pathname.startsWith(`${node.to}/`))) return true
  return node.children.some((c) => nodeMatchesPath(c, pathname))
}

function sameKeys(a: string[], b: string[]) {
  return a.length === b.length && a.every((k, i) => k === b[i])
}

const triggerClass =
  'inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-none border border-stone-500 bg-stone-800/80 text-white shadow-sm transition-colors hover:border-amber-500/50 hover:bg-stone-700'

export function NavHoverMenu() {
  const location = useLocation()
  const canAccess = useNavCanAccess()
  const roots = useMemo(() => buildMenu(canAccess), [canAccess])

  const routeKey = `${location.pathname}${location.search}`
  const [openOn, setOpenOn] = useState<string | null>(null)
  // Open only on the page it was opened on: choosing a page (or any address change) closes it.
  const open = openOn === routeKey
  const [path, setPath] = useState<string[]>([])
  const [anchor, setAnchor] = useState<{ top: number; left: number } | null>(null)

  const triggerRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const closeTimer = useRef<number | null>(null)
  const switchTimer = useRef<{ id: number; depth: number } | null>(null)
  const lastPointer = useRef<string>('mouse')

  const cancelClose = useCallback(() => {
    if (closeTimer.current !== null) window.clearTimeout(closeTimer.current)
    closeTimer.current = null
  }, [])

  const cancelSwitch = useCallback(() => {
    if (switchTimer.current) window.clearTimeout(switchTimer.current.id)
    switchTimer.current = null
  }, [])

  const closeMenu = useCallback(() => {
    cancelClose()
    cancelSwitch()
    setOpenOn(null)
    setPath([])
  }, [cancelClose, cancelSwitch])

  const openMenu = useCallback(() => {
    cancelClose()
    const button = triggerRef.current
    if (button) {
      const rect = button.getBoundingClientRect()
      const headerBottom = button.closest('header')?.getBoundingClientRect().bottom
      // Flush with the left edge of the screen, like a sidebar sliding down (Director, 24 Nov 2026).
      setAnchor({ top: Math.round(headerBottom ?? rect.bottom + 4), left: 0 })
    }
    if (openOn !== routeKey) setPath([])
    setOpenOn(routeKey)
  }, [cancelClose, openOn, routeKey])

  const scheduleClose = useCallback(() => {
    cancelClose()
    closeTimer.current = window.setTimeout(closeMenu, CLOSE_DELAY_MS)
  }, [cancelClose, closeMenu])

  useEffect(() => () => {
    if (closeTimer.current !== null) window.clearTimeout(closeTimer.current)
    if (switchTimer.current) window.clearTimeout(switchTimer.current.id)
  }, [])

  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      closeMenu()
      triggerRef.current?.focus()
    }
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node
      if (triggerRef.current?.contains(target) || panelRef.current?.contains(target)) return
      closeMenu()
    }
    window.addEventListener('keydown', onKeyDown)
    document.addEventListener('pointerdown', onPointerDown)
    window.addEventListener('resize', closeMenu)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      document.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('resize', closeMenu)
    }
  }, [open, closeMenu])

  const columns = useMemo(() => {
    const cols: { parent: MenuNode | null; nodes: MenuNode[] }[] = [{ parent: null, nodes: roots }]
    let level = roots
    for (const key of path) {
      const node = level.find((n) => n.key === key)
      if (!node || !hasFlyout(node)) break
      cols.push({ parent: node, nodes: node.children })
      level = node.children
    }
    return cols
  }, [roots, path])

  // Each open column starts level with the row that opened it, moved up as far as needed to fit.
  useLayoutEffect(() => {
    const panel = panelRef.current
    if (!open || !panel) return
    const cols = Array.from(panel.querySelectorAll<HTMLElement>('[data-menu-col]'))
    const panelTop = panel.getBoundingClientRect().top
    const room = window.innerHeight - panelTop - 12
    cols.forEach((col, i) => {
      if (i === 0) return
      const parentKey = path[i - 1]
      const row = parentKey
        ? cols[i - 1]?.querySelector<HTMLElement>(`[data-menu-key="${CSS.escape(parentKey)}"]`)
        : null
      const want = row ? row.getBoundingClientRect().top - panelTop - 6 : 0
      const most = Math.max(0, room - col.offsetHeight)
      col.style.marginTop = `${Math.round(Math.max(0, Math.min(want, most)))}px`
    })
  }, [open, path, columns])

  const pointRow = (depth: number, node: MenuNode) => {
    const nextFor = (prev: string[]) => (hasFlyout(node) ? [...prev.slice(0, depth), node.key] : prev.slice(0, depth))
    const apply = () => {
      switchTimer.current = null
      setPath((prev) => {
        const next = nextFor(prev)
        return sameKeys(next, prev) ? prev : next
      })
    }
    cancelSwitch()
    const columnOpenFromHere = path.length > depth && path[depth] !== node.key
    if (columnOpenFromHere) {
      switchTimer.current = { id: window.setTimeout(apply, SWITCH_DELAY_MS), depth }
    } else {
      apply()
    }
  }

  const enterColumn = (depth: number) => {
    cancelClose()
    // Reached the open column: keep it, whatever rows were crossed on the way.
    if (switchTimer.current && switchTimer.current.depth < depth) cancelSwitch()
  }

  const focusRow = (depth: number, which: 'first' | string) => {
    window.requestAnimationFrame(() => {
      const col = panelRef.current?.querySelectorAll<HTMLElement>('[data-menu-col]')[depth]
      const rows = Array.from(col?.querySelectorAll<HTMLElement>('[data-menu-row]') ?? [])
      const target = which === 'first' ? rows[0] : rows.find((r) => r.dataset.menuKey === which)
      target?.focus()
    })
  }

  const onPanelKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const row = (event.target as HTMLElement).closest<HTMLElement>('[data-menu-row]')
    if (!row) return
    const depth = Number(row.dataset.depth ?? 0)
    const key = row.dataset.menuKey ?? ''
    const col = row.closest<HTMLElement>('[data-menu-col]')
    const rows = Array.from(col?.querySelectorAll<HTMLElement>('[data-menu-row]') ?? [])
    const index = rows.indexOf(row)
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      const step = event.key === 'ArrowDown' ? 1 : -1
      rows[(index + step + rows.length) % rows.length]?.focus()
    } else if (event.key === 'ArrowRight' && row.dataset.flyout === '1') {
      event.preventDefault()
      cancelSwitch()
      setPath((prev) => [...prev.slice(0, depth), key])
      focusRow(depth + 1, 'first')
    } else if (event.key === 'ArrowLeft' && depth > 0) {
      event.preventDefault()
      const parentKey = path[depth - 1]
      setPath((prev) => prev.slice(0, depth))
      if (parentKey) focusRow(depth - 1, parentKey)
    }
  }

  const onTriggerPointerEnter = (event: ReactPointerEvent) => {
    lastPointer.current = event.pointerType
    if (event.pointerType === 'mouse') openMenu()
  }

  const onPointerLeave = (event: ReactPointerEvent) => {
    if (event.pointerType === 'mouse') scheduleClose()
  }

  const maxColumnHeight = anchor ? Math.max(200, window.innerHeight - anchor.top - 12) : 400

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className={cn(triggerClass, open && 'border-amber-500/60 bg-stone-700')}
        aria-label="Open menu"
        title="Menu"
        aria-haspopup="true"
        aria-expanded={open}
        onPointerEnter={onTriggerPointerEnter}
        onPointerDown={(event) => {
          lastPointer.current = event.pointerType
        }}
        onPointerLeave={onPointerLeave}
        onClick={(event) => {
          const fromKeyboard = event.detail === 0
          if (open && (fromKeyboard || lastPointer.current !== 'mouse')) {
            closeMenu()
            return
          }
          openMenu()
          if (fromKeyboard) focusRow(0, 'first')
        }}
        onKeyDown={(event) => {
          if (event.key !== 'ArrowDown') return
          event.preventDefault()
          openMenu()
          focusRow(0, 'first')
        }}
      >
        <Menu size={18} aria-hidden />
      </button>

      {open && anchor
        ? createPortal(
            <div
              ref={panelRef}
              className="fixed z-50 flex items-start"
              style={{ top: anchor.top, left: anchor.left }}
              onPointerEnter={cancelClose}
              onPointerLeave={onPointerLeave}
              onKeyDown={onPanelKeyDown}
            >
              <nav aria-label="Main menu" className="contents">
                {columns.map((col, depth) => (
                  <div
                    key={col.parent?.key ?? 'root'}
                    data-menu-col=""
                    className={cn(
                      'nav-hover-menu w-72 shrink-0 overflow-y-auto overscroll-contain border border-stone-700 p-1.5 text-stone-200',
                      'bg-gradient-to-b from-stone-800 via-stone-900 to-stone-950 shadow-2xl shadow-black/40',
                      depth === 0 ? 'border-l-0' : '-ml-px',
                    )}
                    style={{ maxHeight: maxColumnHeight }}
                    onPointerEnter={() => enterColumn(depth)}
                  >
                    {depth === 0 ? (
                      <div className="mb-1 flex items-center justify-between gap-2 border-b border-stone-700 px-2 pb-1.5 pt-0.5">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-stone-400">Menu</span>
                        <button
                          type="button"
                          className="inline-flex items-center gap-1 rounded-none border border-stone-600 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-stone-300 transition-colors hover:border-amber-500/50 hover:bg-white/10 hover:text-white"
                          title="Keep the Sidebar Always Shown on the Left"
                          onClick={() => {
                            closeMenu()
                            writeSidebarMode('pinned')
                          }}
                        >
                          <Pin size={11} aria-hidden />
                          Keep Open
                        </button>
                      </div>
                    ) : (
                      <p className="mb-1 truncate border-b border-stone-700 px-2 pb-1.5 pt-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-200/80">
                        {formatNavLabel(col.parent?.label ?? '')}
                      </p>
                    )}

                    {col.nodes.length === 0 ? (
                      <p className="px-2.5 py-2 text-[11px] text-stone-400">Coming Soon</p>
                    ) : (
                      <ul className="space-y-0.5">
                        {col.nodes.map((node) => (
                          <li key={node.key}>
                            <MenuRow
                              node={node}
                              depth={depth}
                              pathname={location.pathname}
                              expanded={path[depth] === node.key}
                              onPoint={() => pointRow(depth, node)}
                              onOpenFlyout={() => {
                                cancelSwitch()
                                setPath((prev) => [...prev.slice(0, depth), node.key])
                              }}
                              onNavigate={closeMenu}
                            />
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                ))}
              </nav>
            </div>,
            document.body,
          )
        : null}
    </>
  )
}

function MenuRow({
  node,
  depth,
  pathname,
  expanded,
  onPoint,
  onOpenFlyout,
  onNavigate,
}: {
  node: MenuNode
  depth: number
  pathname: string
  expanded: boolean
  onPoint: () => void
  onOpenFlyout: () => void
  onNavigate: () => void
}) {
  const Icon = node.icon
  const current = nodeMatchesPath(node, pathname)
  const label = formatNavLabel(node.label)
  const flyout = hasFlyout(node)
  const rowClass = cn(
    'sidebar-nav-item w-full text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/70',
    node.section && 'py-1.5',
    current && 'sidebar-nav-active',
    expanded && !current && 'bg-white/10 text-white',
    expanded && current && 'bg-amber-500/25',
  )
  const icon = node.section ? (
    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-none bg-amber-500/15 text-amber-300 ring-1 ring-amber-500/30">
      <Icon size={13} aria-hidden />
    </span>
  ) : (
    <Icon size={15} className="shrink-0 opacity-80" aria-hidden />
  )
  const text = (
    <span
      className={cn(
        'min-w-0 flex-1 truncate',
        node.section && 'text-[11px] font-bold uppercase tracking-wide',
      )}
      title={label}
    >
      {label}
    </span>
  )
  const common = {
    'data-menu-row': '',
    'data-menu-key': node.key,
    'data-depth': String(depth),
    onPointerEnter: (event: ReactPointerEvent) => {
      if (event.pointerType === 'mouse') onPoint()
    },
  }

  if (flyout) {
    return (
      <button
        type="button"
        {...common}
        data-flyout="1"
        aria-expanded={expanded}
        className={rowClass}
        onClick={onOpenFlyout}
      >
        {icon}
        {text}
        <ChevronRight size={14} className={cn('shrink-0', expanded ? 'opacity-90' : 'opacity-45')} aria-hidden />
      </button>
    )
  }

  return (
    <NavLink to={node.to ?? '/'} end={node.to === '/'} {...common} className={rowClass} onClick={onNavigate}>
      {icon}
      {text}
    </NavLink>
  )
}
