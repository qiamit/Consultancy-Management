/**
 * Prints a small HTML document from a hidden iframe. No popup window, so popup blockers (and `noopener`,
 * which makes window.open return null) cannot stop it. Callers must escape any record text in `html`.
 * Returns false when the frame could not be created.
 */
export function printHtmlInFrame(html: string): boolean {
  const iframe = document.createElement('iframe')
  iframe.style.position = 'fixed'
  iframe.style.right = '0'
  iframe.style.bottom = '0'
  iframe.style.width = '0'
  iframe.style.height = '0'
  iframe.style.border = '0'
  iframe.setAttribute('aria-hidden', 'true')
  document.body.appendChild(iframe)

  const cleanup = () => {
    iframe.remove()
  }
  const doc = iframe.contentDocument
  const win = iframe.contentWindow
  if (!doc || !win) {
    cleanup()
    return false
  }

  doc.open()
  doc.write(html)
  doc.close()
  win.addEventListener('afterprint', () => window.setTimeout(cleanup, 0), { once: true })
  window.setTimeout(() => {
    try {
      win.focus()
      win.print()
    } catch {
      cleanup()
    }
  }, 250)
  window.setTimeout(cleanup, 60_000)
  return true
}
