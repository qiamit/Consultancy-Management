/** Shared readability floor for generated paper documents, used in previews and print windows. */
export const PRINT_SCAN_FRIENDLY_OVERRIDE_CSS = `
  body {
    color: #000 !important;
    font-family: Arial, Helvetica, "Liberation Sans", sans-serif !important;
    font-size: 10.5pt !important;
    line-height: 1.45 !important;
    -webkit-print-color-adjust: exact !important;
    print-color-adjust: exact !important;
  }
  .pd-sheet, .al-sheet, .f1-sheet {
    color: #000 !important;
    font-family: Arial, Helvetica, "Liberation Sans", sans-serif !important;
    font-size: 10.5pt !important;
    line-height: 1.45 !important;
    overflow-wrap: break-word;
  }
  .pd-sheet p, .al-sheet p, .f1-sheet p,
  .pd-sheet li, .al-sheet li, .f1-sheet li {
    font-size: 10pt !important;
    line-height: 1.45 !important;
  }
  body .pd-sheet table[class] th, body .pd-sheet table[class] td,
  body .al-sheet table[class] th, body .al-sheet table[class] td,
  body .f1-sheet table[class] th, body .f1-sheet table[class] td,
  .al-sheet table th, .al-sheet table td,
  .f1-sheet table th, .f1-sheet table td,
  body table th, body table td {
    color: #000 !important;
    font-size: 10pt !important;
    line-height: 1.35 !important;
    overflow-wrap: break-word;
  }
  /* CMPF-307 must stay readable after printing and scanning. Keep its table
     header on a light background because print overrides force black text. */
  body .pd-sheet .cmpf307-top,
  body .pd-sheet .cmpf307-title,
  body .pd-sheet .cmpf307-recipient,
  body .pd-sheet .cmpf307-intro,
  body .pd-sheet .cmpf307-clause,
  body .pd-sheet .cmpf307-sign,
  body .pd-sheet .cmpf307-place-date p,
  body .pd-sheet table.cmpf307-table th,
  body .pd-sheet table.cmpf307-table td {
    font-size: 12pt !important;
    line-height: 1.3 !important;
  }
  body .pd-sheet table.cmpf307-table th {
    background: #e5e7eb !important;
    color: #000 !important;
    border-color: #111 !important;
    -webkit-text-fill-color: #000 !important;
    font-weight: 700 !important;
  }
  .pd-note, .pd-seal-note, .al-seal-note, .al-sign-label {
    color: #000 !important;
    font-size: 9.5pt !important;
    line-height: 1.4 !important;
  }
  .pd-sheet small, .al-sheet small, .f1-sheet small,
  .pd-sheet .pd-page-num, .al-sheet .pd-page-num, .f1-sheet .pd-page-num {
    font-size: 9pt !important;
    line-height: 1.35 !important;
  }
  .pd-sheet .pd-signatory, .al-sheet .al-signatory,
  .pd-sheet .pd-signatory-name, .pd-sheet .pd-date-block,
  .pd-sheet .pd-to-block {
    font-size: 10pt !important;
    line-height: 1.4 !important;
  }
  body .pd-sheet .cmpf311-cover-sign .pd-signatory .pd-sign-line,
  body .pd-sheet .mf-accept-sign .pd-signatory .pd-sign-line {
    margin-left: auto !important;
    margin-right: 0 !important;
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
