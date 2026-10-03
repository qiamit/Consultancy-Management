import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useSyncExternalStore,
  type ReactNode,
} from 'react'
import {
  getAppDateFormat,
  getAppDateTimeFormatSnapshot,
  getAppTimeFormat,
  normalizeAppDateFormat,
  normalizeAppTimeFormat,
  setAppDateFormat,
  setAppTimeFormat,
  subscribeAppDateTimeFormat,
  type AppTimeFormatId,
} from '@/lib/appDateFormat'

type AppDateFormatContextValue = {
  dateFormat: string
  timeFormat: AppTimeFormatId
  setDateFormat: (value: string) => void
  setTimeFormat: (value: string) => void
}

const AppDateFormatContext = createContext<AppDateFormatContextValue | null>(null)

function useAppDateTimeFormatStore() {
  const snapshot = useSyncExternalStore(
    subscribeAppDateTimeFormat,
    getAppDateTimeFormatSnapshot,
    () => `${getAppDateFormat()}|${getAppTimeFormat()}`,
  )
  const [dateFormat, timeFormat] = snapshot.split('|') as [string, AppTimeFormatId]
  return { dateFormat, timeFormat }
}

export function AppDateFormatProvider({ children }: { children: ReactNode }) {
  const { dateFormat, timeFormat } = useAppDateTimeFormatStore()

  const setDateFormat = useCallback((value: string) => {
    setAppDateFormat(normalizeAppDateFormat(value))
  }, [])

  const setTimeFormat = useCallback((value: string) => {
    setAppTimeFormat(normalizeAppTimeFormat(value))
  }, [])

  const value = useMemo(
    () => ({ dateFormat, timeFormat, setDateFormat, setTimeFormat }),
    [dateFormat, timeFormat, setDateFormat, setTimeFormat],
  )

  return (
    <AppDateFormatContext.Provider value={value}>{children}</AppDateFormatContext.Provider>
  )
}

export function useAppDateFormat() {
  const ctx = useContext(AppDateFormatContext)
  const store = useAppDateTimeFormatStore()
  if (ctx) return ctx
  return {
    dateFormat: store.dateFormat,
    timeFormat: store.timeFormat,
    setDateFormat: (value: string) => setAppDateFormat(normalizeAppDateFormat(value)),
    setTimeFormat: (value: string) => setAppTimeFormat(normalizeAppTimeFormat(value)),
  }
}
