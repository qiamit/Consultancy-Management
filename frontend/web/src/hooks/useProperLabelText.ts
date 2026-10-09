import { useEffect } from 'react'
import { isUiLabelText, toProperLabelText } from '@/lib/properLabelText'

const HOSTS = 'button, label, th'

function skipHost(el: Element): boolean {
  return Boolean(
    el.closest(
      '[data-keep-case], [role="option"], [role="listbox"], [role="combobox"], td, input, textarea, [contenteditable="true"]',
    ),
  )
}

function paint(root: ParentNode) {
  root.querySelectorAll(HOSTS).forEach((el) => {
    if (skipHost(el)) return
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
    let node = walker.nextNode()
    while (node) {
      const current = node.nodeValue ?? ''
      if (isUiLabelText(current)) {
        const next = toProperLabelText(current)
        if (next !== current) node.nodeValue = next
      }
      node = walker.nextNode()
    }
    for (const attr of ['aria-label', 'title'] as const) {
      const value = el.getAttribute(attr)
      if (!value || !isUiLabelText(value)) continue
      const next = toProperLabelText(value)
      if (next !== value) el.setAttribute(attr, next)
    }
  })
}

/** Keeps button, label, and table-heading text in proper case after each render. */
export function useProperLabelText() {
  useEffect(() => {
    const root = document.getElementById('root')
    if (!root) return
    let frame = 0
    const schedule = () => {
      if (frame) return
      frame = window.requestAnimationFrame(() => {
        frame = 0
        paint(root)
      })
    }
    schedule()
    const observer = new MutationObserver(schedule)
    observer.observe(root, { subtree: true, childList: true, characterData: true })
    return () => {
      observer.disconnect()
      if (frame) window.cancelAnimationFrame(frame)
    }
  }, [])
}
