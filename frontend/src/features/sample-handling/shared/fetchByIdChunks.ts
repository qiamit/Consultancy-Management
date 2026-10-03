/**
 * Fetch rows for many parent IDs via `.in()`, chunked so PostgREST's default
 * max-rows (~1000) does not drop parameters for later allocations.
 * Chunks run in parallel (bounded concurrency) to cut wall-clock load time.
 */
export async function fetchByIdChunks<T>(
  ids: string[],
  chunkSize: number,
  fetchChunk: (chunkIds: string[]) => Promise<T[]>,
  options?: { concurrency?: number },
): Promise<T[]> {
  const unique = [...new Set(ids.map((id) => id.trim()).filter(Boolean))]
  if (unique.length === 0) return []

  const size = Math.max(1, chunkSize)
  const chunks: string[][] = []
  for (let i = 0; i < unique.length; i += size) {
    chunks.push(unique.slice(i, i + size))
  }

  const concurrency = Math.max(1, options?.concurrency ?? 6)
  const out: T[] = []

  for (let i = 0; i < chunks.length; i += concurrency) {
    const batch = chunks.slice(i, i + concurrency)
    const results = await Promise.all(batch.map((chunk) => fetchChunk(chunk)))
    for (const rows of results) out.push(...rows)
  }

  return out
}

/**
 * Page through a PostgREST query past the default ~1000-row response cap.
 * `fetchPage` must apply `.order(...).range(from, to)` on a stable unique column.
 */
export async function fetchAllByRange<T>(
  fetchPage: (from: number, to: number) => Promise<T[]>,
  pageSize = 1000,
): Promise<T[]> {
  const size = Math.max(1, Math.min(pageSize, 1000))
  const out: T[] = []
  let from = 0
  for (;;) {
    const page = await fetchPage(from, from + size - 1)
    if (page.length === 0) break
    out.push(...page)
    if (page.length < size) break
    from += size
  }
  return out
}
