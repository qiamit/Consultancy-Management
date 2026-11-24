import { useCallback, useRef, useState } from 'react'

/**
 * Offsets for a dropdown that opens below a header button (side "bottom", align "end") so that it sits right under
 * the app header and flush with the right edge of the screen, the mirror of the ☰ menu on the left (as in the Qirlpl
 * LIMS, owner, 24 Nov 2026). Call `measure` when the menu opens.
 */
export function useFlushRightMenu<T extends HTMLElement>() {
  const triggerRef = useRef<T | null>(null)
  const [offsets, setOffsets] = useState({ sideOffset: 4, alignOffset: 0 })

  const measure = useCallback(() => {
    const el = triggerRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const headerBottom = el.closest('header')?.getBoundingClientRect().bottom
    const next = {
      // Not rounded: the button's bottom can be fractional, and the menu must start exactly at the header's edge.
      sideOffset: headerBottom == null ? 4 : Math.max(0, headerBottom - rect.bottom),
      // Negative: push the menu's right edge out past the button to the screen edge.
      alignOffset: -Math.max(0, Math.round(document.documentElement.clientWidth - rect.right)),
    }
    setOffsets((prev) => (prev.sideOffset === next.sideOffset && prev.alignOffset === next.alignOffset ? prev : next))
  }, [])

  return { triggerRef, offsets, measure }
}
