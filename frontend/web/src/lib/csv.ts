/**
 * Quote-aware CSV parser (RFC 4180 style): commas and line breaks inside "quoted" cells stay in
 * the cell, "" is a literal quote. Cells are trimmed. Our exports quote every cell, and addresses
 * almost always contain commas, so a plain split(',') shifts every later column.
 */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let inQuotes = false

  const flushCell = () => {
    row.push(cell)
    cell = ''
  }
  const flushRow = () => {
    flushCell()
    rows.push(row)
    row = []
  }

  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"'
          i++
        } else {
          inQuotes = false
        }
      } else {
        cell += ch
      }
      continue
    }
    if (ch === '"') inQuotes = true
    else if (ch === ',') flushCell()
    else if (ch === '\n') flushRow()
    else if (ch !== '\r') cell += ch
  }
  if (cell.length > 0 || row.length > 0) flushRow()

  return rows.map((r) => r.map((c) => c.trim())).filter((r) => r.some((c) => c.length > 0))
}
