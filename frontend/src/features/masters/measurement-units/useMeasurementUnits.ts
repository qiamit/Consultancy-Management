import { useCallback, useEffect, useState } from 'react'
import type { UnitRow } from '@/features/masters/test-parameter/types'
import {
  getCachedMeasurementUnits,
  loadMeasurementUnits,
  subscribeMeasurementUnits,
} from './measurementUnitApi'

export function useMeasurementUnits() {
  const [units, setUnits] = useState<UnitRow[]>(getCachedMeasurementUnits())
  const [loading, setLoading] = useState(getCachedMeasurementUnits().length === 0)

  const refresh = useCallback(async () => {
    try {
      const rows = await loadMeasurementUnits()
      setUnits(rows)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
    return subscribeMeasurementUnits(() => {
      setUnits(getCachedMeasurementUnits())
    })
  }, [refresh])

  return { units, loading, refresh }
}
