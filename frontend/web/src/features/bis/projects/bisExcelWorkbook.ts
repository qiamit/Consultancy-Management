import * as XLSX from 'xlsx'

/** Tabular BIS documents (CMPF-305 / 306, sub-contracting) as an .xlsx workbook: one sheet per table. */
export function buildExcelWorkbook(
  documents: Array<{ title: string; html: string }>,
): Blob {
  const workbook = XLSX.utils.book_new()
  const usedNames = new Set<string>()
  const addSheet = (sheet: XLSX.WorkSheet, rawName: string) => {
    const base = rawName.replace(/[\\/?*:[\]]/g, ' ').trim().slice(0, 25) || 'Document'
    let name = base
    let suffix = 2
    while (usedNames.has(name.toLowerCase())) {
      name = `${base.slice(0, 25 - String(suffix).length)} ${suffix}`
      suffix += 1
    }
    usedNames.add(name.toLowerCase())
    XLSX.utils.book_append_sheet(workbook, sheet, name)
  }

  for (const document of documents) {
    const parsed = new DOMParser().parseFromString(document.html, 'text/html')
    // A table continued on later pages (same class, e.g. CMPF-305 machinery) becomes one sheet with one header row.
    const firstByClass = new Map<string, HTMLTableElement>()
    for (const table of Array.from(parsed.querySelectorAll('table'))) {
      const key = table.className.trim()
      const first = key ? firstByClass.get(key) : undefined
      if (!key) continue
      if (!first) {
        firstByClass.set(key, table)
        continue
      }
      const target = first.tBodies[0] ?? first.appendChild(parsed.createElement('tbody'))
      // The first page's single-cell placeholder (e.g. "Separate Sheet Attached") is not a data row.
      for (const tr of Array.from(target.rows)) if (tr.cells.length === 1 && tr.cells[0]!.colSpan > 1) tr.remove()
      for (const body of Array.from(table.tBodies)) for (const tr of Array.from(body.rows)) target.appendChild(tr)
      table.remove()
    }
    const tables = Array.from(parsed.querySelectorAll('table'))
    if (tables.length > 0) {
      tables.forEach((table, index) => {
        addSheet(
          XLSX.utils.table_to_sheet(table, { raw: true }),
          tables.length === 1 ? document.title : `${document.title} ${index + 1}`,
        )
      })
      continue
    }
    const lines = (parsed.body.innerText || parsed.body.textContent || '')
      .split(/\n+/)
      .map((line) => line.trim())
      .filter(Boolean)
    addSheet(XLSX.utils.aoa_to_sheet(lines.map((line) => [line])), document.title)
  }

  const bytes = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' })
  return new Blob([bytes], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
}
