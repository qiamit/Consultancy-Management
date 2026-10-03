import { useCallback, useEffect, useState } from 'react'
import {
  getCachedItemCategories,
  loadItemCategories,
  subscribeItemCategories,
  type ItemCategoryRow,
} from './itemCategoryApi'

export function useItemCategories() {
  const [categories, setCategories] = useState<ItemCategoryRow[]>(getCachedItemCategories())
  const [loading, setLoading] = useState(getCachedItemCategories().length === 0)

  const refresh = useCallback(async () => {
    try {
      const rows = await loadItemCategories()
      setCategories(rows)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
    return subscribeItemCategories(() => {
      setCategories(getCachedItemCategories())
    })
  }, [refresh])

  return { categories, loading, refresh }
}
