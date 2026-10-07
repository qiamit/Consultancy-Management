import { useLayoutEffect, useState, type RefObject } from 'react'

export type AnchoredMenuPos = {
  left: number
  width: number
  top?: number
  bottom?: number
}

/** Fixed portal menu under an anchor; opens upward when space below is tight. */
export function useAnchoredPortalMenu(
  open: boolean,
  anchorRef: RefObject<HTMLElement | null>,
  optionCount = 1,
): AnchoredMenuPos | null {
  const [pos, setPos] = useState<AnchoredMenuPos | null>(null)

  useLayoutEffect(() => {
    if (!open) {
      setPos(null)
      return
    }
    const update = () => {
      const el = anchorRef.current
      if (!el) return
      const rect = el.getBoundingClientRect()
      const estimatedHeight = Math.min(Math.max(optionCount, 1) * 36, 224)
      const spaceBelow = window.innerHeight - rect.bottom
      const spaceAbove = rect.top
      const openUp = spaceBelow < estimatedHeight + 8 && spaceAbove > spaceBelow
      const width = Math.max(rect.width, 160)
      const left = Math.max(8, Math.min(rect.left, window.innerWidth - width - 8))
      setPos(
        openUp
          ? { left, width, bottom: window.innerHeight - rect.top + 4 }
          : { left, width, top: rect.bottom + 4 },
      )
    }
    update()
    window.addEventListener('resize', update)
    window.addEventListener('scroll', update, true)
    return () => {
      window.removeEventListener('resize', update)
      window.removeEventListener('scroll', update, true)
    }
  }, [anchorRef, open, optionCount])

  return open ? pos : null
}
