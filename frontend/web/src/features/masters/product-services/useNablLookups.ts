import { useCallback, useEffect, useState } from 'react'
import {
  getCachedNablLookups,
  loadNablLookups,
  subscribeNablLookups,
  type NablLookupKind,
  type NablLookupRow,
} from './nablLookupApi'

export function useNablLookups(kind: NablLookupKind) {
  const [items, setItems] = useState<NablLookupRow[]>(() => getCachedNablLookups(kind))
  const [loading, setLoading] = useState(() => getCachedNablLookups(kind).length === 0)

  const refresh = useCallback(async () => {
    try {
      const rows = await loadNablLookups(kind)
      setItems(rows)
    } finally {
      setLoading(false)
    }
  }, [kind])

  useEffect(() => {
    void refresh()
    return subscribeNablLookups(kind, () => {
      setItems(getCachedNablLookups(kind))
    })
  }, [kind, refresh])

  return { items, loading, refresh }
}
