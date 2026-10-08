import { useEffect } from 'react'

function isCheckboxTarget(el: EventTarget | null): el is HTMLElement {
  if (!(el instanceof HTMLElement)) return false
  if (el instanceof HTMLInputElement && el.type === 'checkbox') {
    return !el.disabled && !el.readOnly
  }
  if (el.getAttribute('role') === 'checkbox') {
    return el.getAttribute('aria-disabled') !== 'true'
  }
  return false
}

/** Enter on a focused checkbox toggles it (check / uncheck), app-wide. */
export function useEnterTogglesCheckbox() {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Enter' || event.defaultPrevented || event.repeat) return
      if (event.ctrlKey || event.metaKey || event.altKey) return
      if (!isCheckboxTarget(event.target)) return
      event.preventDefault()
      event.target.click()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [])
}
