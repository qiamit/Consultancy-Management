const DEV_WARN_AT = 20_000

type PageResult<T> = {
  data: T[] | null
  error: unknown
}

type FetchAllRowsOptions = {
  pageSize?: number
  max?: number
  concurrency?: number
  count?: () => PromiseLike<{ count: number | null; error: unknown }>
}

/**
 * Loads every row past PostgREST's max-rows cap.
 * Callers must order by a stable key (company_name and id) so pages do not skip or repeat rows.
 * When `count` is set, pages load in parallel. Await `supabase.auth.getSession()` once before calling.
 */
export async function fetchAllRows<T>(
  build: (from: number, to: number) => PromiseLike<PageResult<T>>,
  options?: FetchAllRowsOptions,
): Promise<T[]> {
  const pageSize = options?.pageSize ?? 1000
  const max = options?.max ?? 100_000
  const concurrency = Math.max(1, options?.concurrency ?? 4)

  let total: number | null = null
  if (options?.count) {
    const counted = await options.count()
    if (counted.error) throw counted.error
    total = typeof counted.count === 'number' ? counted.count : null
  }

  const collected = total == null
    ? await fetchSequential(build, pageSize, max)
    : await fetchCounted(build, pageSize, max, concurrency, total)

  const rows = dedupeById(collected)
  if (import.meta.env.DEV && rows.length > DEV_WARN_AT) {
    console.warn(`fetchAllRows loaded ${rows.length} rows, above ${DEV_WARN_AT}.`)
  }
  return rows
}

async function fetchSequential<T>(
  build: (from: number, to: number) => PromiseLike<PageResult<T>>,
  pageSize: number,
  max: number,
): Promise<T[]> {
  const collected: T[] = []
  let from = 0
  while (collected.length < max) {
    const page = await readPage(build, from, pageSize)
    const room = max - collected.length
    collected.push(...page.slice(0, room))
    if (page.length < pageSize) break
    from += pageSize
  }
  return collected
}

async function fetchCounted<T>(
  build: (from: number, to: number) => PromiseLike<PageResult<T>>,
  pageSize: number,
  max: number,
  concurrency: number,
  total: number,
): Promise<T[]> {
  const capped = Math.min(Math.max(0, total), max)
  const pageCount = capped === 0 ? 0 : Math.ceil(capped / pageSize)
  const pages: T[][] = new Array(pageCount)
  let nextIndex = 0

  const worker = async () => {
    while (nextIndex < pageCount) {
      const index = nextIndex
      nextIndex += 1
      const from = index * pageSize
      pages[index] = await readPage(build, from, pageSize)
    }
  }

  const workers = Math.min(concurrency, Math.max(pageCount, 1))
  if (pageCount > 0) {
    await Promise.all(Array.from({ length: workers }, () => worker()))
  }

  const collected = pages.flat()
  const last = pages[pageCount - 1] ?? []
  if (last.length < pageSize || collected.length >= max) return collected

  let from = pageCount * pageSize
  while (collected.length < max) {
    const page = await readPage(build, from, pageSize)
    const room = max - collected.length
    collected.push(...page.slice(0, room))
    if (page.length < pageSize) break
    from += pageSize
  }
  return collected
}

async function readPage<T>(
  build: (from: number, to: number) => PromiseLike<PageResult<T>>,
  from: number,
  pageSize: number,
): Promise<T[]> {
  const { data, error } = await build(from, from + pageSize - 1)
  if (error) throw error
  return Array.isArray(data) ? data : []
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
