/** Opens print HTML in a new tab for preview (no print dialog). */
export function openHtmlPreviewWindow(html: string): void {
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const win = window.open(url, '_blank', 'noopener,noreferrer')
  if (!win) {
    URL.revokeObjectURL(url)
    return
  }
  win.addEventListener(
    'load',
    () => {
      try {
        win.document.title = ''
      } catch {
        /* cross-origin guard */
      }
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
    },
    { once: true },
  )
}
