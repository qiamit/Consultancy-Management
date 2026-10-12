/** Shared readability floor for generated paper documents, used in previews and print windows. */
export const PRINT_SCAN_FRIENDLY_OVERRIDE_CSS = `
  body {
    color: #000 !important;
    font-family: Arial, Helvetica, "Liberation Sans", sans-serif !important;
    font-size: 10pt !important;
    line-height: 1.45 !important;
    -webkit-print-color-adjust: exact !important;
    print-color-adjust: exact !important;
  }
  .pd-sheet, .al-sheet, .f1-sheet {
    color: #000 !important;
    font-family: Arial, Helvetica, "Liberation Sans", sans-serif !important;
    font-size: 10pt !important;
    line-height: 1.45 !important;
    overflow-wrap: break-word;
  }
  .pd-sheet p, .al-sheet p, .f1-sheet p,
  .pd-sheet li, .al-sheet li, .f1-sheet li {
    font-size: 10pt !important;
    line-height: 1.45 !important;
  }
  .pd-sheet table th, .pd-sheet table td,
  .al-sheet table th, .al-sheet table td,
  .f1-sheet table th, .f1-sheet table td,
  body table th, body table td {
    color: #000 !important;
    font-size: 9.5pt !important;
    line-height: 1.35 !important;
    overflow-wrap: break-word;
  }
  .pd-note, .pd-seal-note, .al-seal-note, .al-sign-label {
    color: #000 !important;
    font-size: 9.5pt !important;
    line-height: 1.4 !important;
  }
  .pd-sheet img, .al-sheet img, .f1-sheet img {
    max-width: 100%;
    height: auto;
    object-fit: contain;
  }
`

export function applyPrintScanFriendlyCss(html: string): string {
  const withoutOld = html.replace(
    /<style id="app-print-scan-friendly">[\s\S]*?<\/style>/i,
    '',
  )
  const style = `<style id="app-print-scan-friendly">${PRINT_SCAN_FRIENDLY_OVERRIDE_CSS}</style>`
  if (/<\/head>/i.test(withoutOld)) {
    return withoutOld.replace(/<\/head>/i, `${style}</head>`)
  }
  return `${style}${withoutOld}`
}
