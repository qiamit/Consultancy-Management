import { useCallback, useEffect, useState } from 'react'
import { getCachedGstRates, loadGstRates, subscribeGstRates } from './gstRateApi'
import type { GstRateRow } from './types'

export function useGstRates() {
  const [rates, setRates] = useState<GstRateRow[]>(getCachedGstRates())
  const [loading, setLoading] = useState(getCachedGstRates().length === 0)

  const refresh = useCallback(async () => {
    try {
      const rows = await loadGstRates()
      setRates(rows)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
    return subscribeGstRates(() => {
      setRates(getCachedGstRates())
    })
  }, [refresh])

  return { rates, loading, refresh }
}
