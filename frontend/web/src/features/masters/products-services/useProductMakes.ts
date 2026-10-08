import { useCallback, useEffect, useState } from 'react'
import {
  getCachedProductMakes,
  loadProductMakes,
  subscribeProductMakes,
  type ProductMakeRow,
} from './makeApi'

export function useProductMakes() {
  const [makes, setMakes] = useState<ProductMakeRow[]>(getCachedProductMakes())
  const [loading, setLoading] = useState(getCachedProductMakes().length === 0)

  const refresh = useCallback(async () => {
    try {
      const rows = await loadProductMakes()
      setMakes(rows)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
    return subscribeProductMakes(() => {
      setMakes(getCachedProductMakes())
    })
  }, [refresh])

  return { makes, loading, refresh }
}
