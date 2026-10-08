const DEV_WARN_AT = 20_000

type PageResult<T> = {
  data: T[] | null
  error: unknown
}

/**
 * Loads every row past PostgREST's max-rows cap.
 * Callers must order by a stable key (company_name and id) so pages do not skip or repeat rows.
 */
export async function fetchAllRows<T>(
  build: (from: number, to: number) => PromiseLike<PageResult<T>>,
  options?: { pageSize?: number; max?: number },
): Promise<T[]> {
  const pageSize = options?.pageSize ?? 1000
  const max = options?.max ?? 100_000
  const collected: T[] = []

  let from = 0
  while (collected.length < max) {
    const to = from + pageSize - 1
    const { data, error } = await build(from, to)
    if (error) throw error
    const page = Array.isArray(data) ? data : []
    const room = max - collected.length
    collected.push(...page.slice(0, room))
    if (page.length < pageSize) break
    from += pageSize
  }

  const rows = dedupeById(collected)
  if (import.meta.env.DEV && rows.length > DEV_WARN_AT) {
    console.warn(`fetchAllRows loaded ${rows.length} rows, above ${DEV_WARN_AT}.`)
  }
  return rows
}

function dedupeById<T>(rows: T[]): T[] {
  const seen = new Set<string>()
  const unique: T[] = []
  for (const row of rows) {
    const id =
      row && typeof row === 'object' && 'id' in row ? String((row as { id?: unknown }).id ?? '') : ''
    if (id) {
      if (seen.has(id)) continue
      seen.add(id)
    }
    unique.push(row)
  }
  return unique
}
