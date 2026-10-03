export function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

const AUTO_PRINT_SCRIPT = `<script>
  window.addEventListener('load', function () {
    setTimeout(function () {
      try { window.focus(); window.print(); } catch (e) {}
    }, 300);
  });
</script>`

const POPUP_BLOCKED_MESSAGE = 'Popup blocked. Allow popups to print.'

/**
 * Opens an empty tab with a loading note. Call this synchronously inside the click handler
 * (before any `await`) so browsers do not treat the later print window as an unwanted popup.
 */
export function openPendingPrintWindow(title = 'Preparing document…'): Window | null {
  const win = window.open('', '_blank')
  if (!win) return null
  win.document.open()
  win.document.write(
    `<!doctype html><html lang="en"><head><meta charset="utf-8"/><title>${escapeHtml(title)}</title></head>` +
      `<body style="font-family:system-ui,Arial,sans-serif;color:#57534e;padding:24px">${escapeHtml(title)}</body></html>`,
  )
  win.document.close()
  return win
}

/**
 * Writes `html` into `target` (or a new tab) and triggers the browser print dialog.
 * Returns an error message when no window could be opened, otherwise null.
 */
export function openPrintHtml(
  html: string,
  options?: { autoPrint?: boolean; target?: Window | null },
): string | null {
  const win = options?.target && !options.target.closed ? options.target : window.open('', '_blank')
  if (!win) return POPUP_BLOCKED_MESSAGE

  const doc =
    options?.autoPrint !== false && !html.includes('window.print()')
      ? html.replace(/<\/body>/i, `${AUTO_PRINT_SCRIPT}</body>`)
      : html

  win.document.open()
  win.document.write(doc)
  win.document.close()
  return null
}
