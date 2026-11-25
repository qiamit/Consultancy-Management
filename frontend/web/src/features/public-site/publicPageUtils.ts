import { useEffect, type CSSProperties } from 'react'

/** Browser tab title for a page of the public website; the app's own title comes back when the page closes. */
export function usePublicPageTitle(title: string) {
  useEffect(() => {
    const before = document.title
    document.title = title
    return () => {
      document.title = before
    }
  }, [title])
}

/** Entrance animation with a small delay per item (off when the visitor prefers reduced motion). */
export function rise(index: number): CSSProperties {
  return { animationDelay: `${80 + index * 55}ms` }
}
