/** Minimal CSV helper for BIS list exports (UTF-8 BOM for Excel). */

function csvEscape(value: string): string {
  if (/[",\n\r]/.test(value)) return `"${value.replace(/"/g, '""')}"`
  return value
}

export function toCsv(headers: string[], rows: Array<Record<string, string>>): string {
  const lines = [
    headers.map(csvEscape).join(','),
    ...rows.map((row) => headers.map((h) => csvEscape(row[h] ?? '')).join(',')),
  ]
  return `\uFEFF${lines.join('\n')}`
}

export function downloadCsv(filename: string, headers: string[], rows: Array<Record<string, string>>): void {
  const blob = new Blob([toCsv(headers, rows)], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
