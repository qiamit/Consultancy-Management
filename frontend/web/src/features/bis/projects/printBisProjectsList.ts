import {
  clientDisplayName,
  formatCmL,
  formatDisplayDate,
  isCodeDisplayLabel,
  projectStatusLabel,
  type BisProjectRow,
} from './types'

function esc(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

export function buildBisProjectsListPrintHtml(
  rows: BisProjectRow[],
  title: string,
  meta?: { page?: number; pageCount?: number; selectedCount?: number },
): string {
  const subtitleParts: string[] = []
  if (meta?.selectedCount && meta.selectedCount > 0) {
    subtitleParts.push(`${meta.selectedCount} selected`)
  } else if (meta?.page != null && meta?.pageCount != null) {
    subtitleParts.push(`Page ${meta.page} of ${meta.pageCount}`)
  }
  subtitleParts.push(`${rows.length} row(s)`)
  subtitleParts.push(new Date().toLocaleString('en-IN'))

  const tableRows = rows
    .map((row) => {
      const client = clientDisplayName(row) || '—'
      const isCode = isCodeDisplayLabel(row) || '—'
      const cmL = formatCmL(row.cm_l_digits)
      const validity = formatDisplayDate(row.license_validity_date)
      const status = projectStatusLabel(row.status)
      const caseHandledBy = (row.case_handled_by ?? '').trim() || '—'

      return `<tr>
        <td>${esc(client)}</td>
        <td>${esc(isCode)}</td>
        <td class="mono">${esc(cmL)}</td>
        <td class="mono">${esc(validity)}</td>
        <td>${esc(status)}</td>
        <td>${esc(caseHandledBy)}</td>
      </tr>`
    })
    .join('')

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <title>${esc(title)}</title>
  <style>
    :root { --border: #cbd5e1; --muted: #64748b; --fg: #0f172a; }
    * { box-sizing: border-box; }
    body { margin: 16px 20px; font-family: ui-sans-serif, system-ui, "Segoe UI", Roboto, Arial, sans-serif; color: var(--fg); }
    h1 { margin: 0 0 4px; font-size: 18px; }
    .meta { margin: 0 0 14px; font-size: 12px; color: var(--muted); }
    table { width: 100%; border-collapse: collapse; font-size: 12px; }
    th, td { border: 1px solid var(--border); padding: 6px 8px; vertical-align: top; text-align: left; }
    th { background: #f1f5f9; font-size: 11px; text-transform: uppercase; letter-spacing: 0.04em; }
    td.mono { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; white-space: nowrap; }
    tr:nth-child(even) td { background: #fafafa; }
    @media print {
      body { margin: 8mm; }
      tr { break-inside: avoid; }
    }
  </style>
</head>
<body>
  <h1>${esc(title)}</h1>
  <p class="meta">${esc(subtitleParts.join(' · '))}</p>
  <table>
    <thead>
      <tr>
        <th>Client</th>
        <th>IS Code</th>
        <th>CM/L</th>
        <th>Validity</th>
        <th>Status</th>
        <th>Case Handled By</th>
      </tr>
    </thead>
    <tbody>
      ${tableRows || '<tr><td colspan="6">No rows to print.</td></tr>'}
    </tbody>
  </table>
  <script>
    window.addEventListener('load', function () {
      setTimeout(function () {
        try { window.focus(); window.print(); } catch (e) {}
      }, 250);
    });
  </script>
</body>
</html>`
}

export function printBisProjectsList(
  rows: BisProjectRow[],
  title: string,
  meta?: { page?: number; pageCount?: number; selectedCount?: number },
): string | null {
  if (rows.length === 0) return 'Nothing to print on this page.'

  const win = window.open('', '_blank', 'noopener,noreferrer')
  if (!win) return 'Popup blocked. Allow popups to print.'

  win.document.open()
  win.document.write(buildBisProjectsListPrintHtml(rows, title, meta))
  win.document.close()
  return null
}
