import { useSyncExternalStore } from 'react'

/**
 * How the main navigation shows on a desktop screen (1280px and wider), as in the Qirlpl LIMS (owner, 24 Nov 2026):
 *  - 'menu' (default): no sidebar; pointing at ☰ at the top left opens the menu, and each module's options open
 *    to its right. Pages use the full screen width.
 *  - 'pinned': the sidebar stays on the left (the layout used until 24 Nov 2026).
 * Kept per browser, like the theme. Narrower screens always use the slide-in menu.
 */
export type SidebarMode = 'menu' | 'pinned'

const STORAGE_KEY = 'consultancy.sidebarMode'
const CHANGED_EVENT = 'consultancy:sidebar-mode-changed'

/** Holds the choice when the browser blocks storage (private window), until reload. */
let memoryMode: SidebarMode | null = null

export function readSidebarMode(): SidebarMode {
  if (memoryMode) return memoryMode
  try {
    return window.localStorage.getItem(STORAGE_KEY) === 'pinned' ? 'pinned' : 'menu'
  } catch {
    return 'menu'
  }
}

export function writeSidebarMode(mode: SidebarMode): void {
  memoryMode = mode
  try {
    window.localStorage.setItem(STORAGE_KEY, mode)
  } catch {
    // Storage blocked: memoryMode keeps it for this visit.
  }
  window.dispatchEvent(new Event(CHANGED_EVENT))
}

function subscribe(onChange: () => void): () => void {
  const onStorage = (event: StorageEvent) => {
    if (event.key !== STORAGE_KEY) return
    memoryMode = null
    onChange()
  }
  window.addEventListener(CHANGED_EVENT, onChange)
  window.addEventListener('storage', onStorage)
  return () => {
    window.removeEventListener(CHANGED_EVENT, onChange)
    window.removeEventListener('storage', onStorage)
  }
}

export function useSidebarMode(): SidebarMode {
  return useSyncExternalStore(subscribe, readSidebarMode, () => 'menu')
}

/** Keep in step with the xl: classes in GlobalLayout. */
export const DESKTOP_NAV_QUERY = '(min-width: 1280px)'

function subscribeDesktop(onChange: () => void): () => void {
  const mq = window.matchMedia(DESKTOP_NAV_QUERY)
  mq.addEventListener('change', onChange)
  return () => mq.removeEventListener('change', onChange)
}

/** True from 1280px, where the sidebar can be pinned and the ☰ menu opens on hover. */
export function useIsDesktopNav(): boolean {
  return useSyncExternalStore(
    subscribeDesktop,
    () => window.matchMedia(DESKTOP_NAV_QUERY).matches,
    () => true,
  )
}
