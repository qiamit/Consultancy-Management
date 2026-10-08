/** Natural sort for IS clause numbers (e.g. 5, 5.3, 5.3.1, 10, Annex A). */
export function compareClauseNumbers(
  a: string | null | undefined,
  b: string | null | undefined,
): number {
  const parts = (value: string | null | undefined): Array<string | number> => {
    const t = (value ?? '').trim()
    if (!t) return [Number.POSITIVE_INFINITY]
    return t
      .split(/(\d+)/)
      .filter(Boolean)
      .map((part) => (/^\d+$/.test(part) ? Number(part) : part.toLowerCase()))
  }

  const pa = parts(a)
  const pb = parts(b)
  const len = Math.max(pa.length, pb.length)

  for (let i = 0; i < len; i++) {
    const va = pa[i]
    const vb = pb[i]
    if (va === undefined) return -1
    if (vb === undefined) return 1
    if (typeof va === 'number' && typeof vb === 'number') {
      if (va !== vb) return va - vb
      continue
    }
    const cmp = String(va).localeCompare(String(vb), undefined, {
      numeric: true,
      sensitivity: 'base',
    })
    if (cmp !== 0) return cmp
  }

  return 0
}
