import { useEffect, type CSSProperties } from 'react'

/** Entrance delay for the nth item on a page (the motion is off when the visitor asks for reduced motion). */
export function delay(n: number): CSSProperties {
  return { '--d': `${60 + n * 50}ms` } as CSSProperties
}

/** Browser tab title for a website page; the app's own title comes back when the page closes. */
export function usePageTitle(title: string) {
  useEffect(() => {
    const before = document.title
    document.title = title
    return () => {
      document.title = before
    }
  }, [title])
}
