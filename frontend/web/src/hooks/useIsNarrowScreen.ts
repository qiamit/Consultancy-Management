import { useSyncExternalStore } from 'react'

/** Same width as Tailwind's `sm` breakpoint: below it the screen counts as narrow (phones). */
const NARROW = '(max-width: 639px)'

const subscribe = (onChange: () => void) => {
  const query = window.matchMedia(NARROW)
  query.addEventListener('change', onChange)
  return () => query.removeEventListener('change', onChange)
}

export function useIsNarrowScreen(): boolean {
  return useSyncExternalStore(subscribe, () => window.matchMedia(NARROW).matches)
}
