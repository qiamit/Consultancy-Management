import { useCallback } from 'react'

/** Ignore Radix dismiss when the browser tab loses focus (tab switch). */
export function useFormDialogOpenChange(setOpen: (open: boolean) => void) {
  return useCallback(
    (open: boolean) => {
      if (!open && typeof document !== 'undefined' && document.visibilityState === 'hidden') {
        return
      }
      setOpen(open)
    },
    [setOpen],
  )
}

export function preventFormDialogFocusOutside(e: Event) {
  e.preventDefault()
}
