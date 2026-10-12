import * as XLSX from 'xlsx'

export type CmpfSpreadsheetColumn = {
  key: string
  aliases: string[]
}

const normalize = (value: unknown) =>
  String(value ?? '')
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')

export async function importCmpfSpreadsheetRows<T extends object>(
  file: File,
  columns: CmpfSpreadsheetColumn[],
  hasContent: (row: T) => boolean,
): Promise<T[]> {
  const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: true })
  const firstSheet = workbook.Sheets[workbook.SheetNames[0]]
  if (!firstSheet) throw new Error('The workbook has no sheets.')

  const matrix = XLSX.utils.sheet_to_json<unknown[]>(firstSheet, {
    header: 1,
    defval: '',
    raw: false,
    dateNF: 'yyyy-mm-dd',
  })
  const headerIndex = matrix.findIndex((row) => row.some((cell) => String(cell ?? '').trim()))
  if (headerIndex < 0) throw new Error('The selected sheet is empty.')

  const headers = matrix[headerIndex].map(normalize)
  const indexes = columns.map((column) => {
    const aliases = [column.key, ...column.aliases].map(normalize)
    return headers.findIndex((header) => aliases.includes(header))
  })
  if (indexes.every((index) => index < 0)) {
    throw new Error('Could not match the spreadsheet headings. Use the template column names.')
  }

  const rows = matrix.slice(headerIndex + 1).map((source) => {
    const row = Object.fromEntries(
      columns.map((column, index) => [
        column.key,
        indexes[index] < 0 ? '' : String(source[indexes[index]] ?? '').trim(),
      ]),
    ) as T
    return row
  })
  return rows.filter(hasContent)
}
