import type { UserAccount } from './types'

function esc(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

export function buildUsersPrintHtml(users: UserAccount[]): string {
  const rows = users
    .map(
      (u) => `
      <tr>
        <td>${esc(u.name?.trim() || '—')}</td>
        <td>${esc(u.email?.trim() || '—')}</td>
        <td>${esc(u.mobile?.trim() || '—')}</td>
        <td>${esc(u.division?.trim() || '—')}</td>
        <td>${esc(u.departmentName?.trim() || '—')}</td>
        <td>${esc(u.designation?.trim() || '—')}</td>
      </tr>`,
    )
    .join('')

  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Team Members Print</title>
    <style>
      *{box-sizing:border-box}
      body{margin:24px;font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial;color:#1c1917;background:#fff}
      h1{font-size:18px;margin:0 0 4px;font-weight:700}
      .meta{font-size:12px;color:#78716c;margin-bottom:16px}
      table{width:100%;border-collapse:collapse;font-size:12px}
      th,td{border:1px solid #44403c;padding:8px 10px;text-align:left;vertical-align:top}
      th{background:#1c1917;color:#fde68a;font-size:11px;text-transform:uppercase;letter-spacing:.08em}
      tr:nth-child(even) td{background:#f7f3eb}
      @media print{body{margin:12px} th{-webkit-print-color-adjust:exact;print-color-adjust:exact}}
    </style>
  </head>
  <body>
    <h1>Team Members</h1>
    <p class="meta">${users.length} selected · printed ${esc(new Date().toLocaleString())}</p>
    <table>
      <thead>
        <tr>
          <th>Name</th>
          <th>Email</th>
          <th>Mobile</th>
          <th>Division</th>
          <th>Department</th>
          <th>Designation</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
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

export function printUsersViaIframe(html: string): boolean {
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
    try {
      document.body.removeChild(iframe)
    } catch {
      // ignore
    }
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

  const onAfterPrint = () => {
    win.removeEventListener('afterprint', onAfterPrint)
    cleanup()
  }
  win.addEventListener('afterprint', onAfterPrint)
  window.setTimeout(cleanup, 60_000)
  return true
}
