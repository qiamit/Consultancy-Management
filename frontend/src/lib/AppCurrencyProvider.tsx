import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useSyncExternalStore,
  type ReactNode,
} from 'react'
import {
  getAppCurrencyId,
  getAppCurrencySnapshot,
  getCurrencyMeta,
  normalizeAppCurrencyId,
  setAppCurrency,
  subscribeAppCurrency,
  type AppCurrencyMeta,
} from '@/lib/appCurrency'

type AppCurrencyContextValue = {
  currencyId: string
  meta: AppCurrencyMeta
  symbol: string
  code: string
  setCurrency: (id: string, labelHint?: string) => void
}

const AppCurrencyContext = createContext<AppCurrencyContextValue | null>(null)

function useAppCurrencyStore() {
  return useSyncExternalStore(subscribeAppCurrency, getAppCurrencySnapshot, getAppCurrencyId)
}

export function AppCurrencyProvider({ children }: { children: ReactNode }) {
  const snapshot = useAppCurrencyStore()
  const currencyId = snapshot.split('||')[0] || getAppCurrencyId()
  const meta = getCurrencyMeta()

  const setCurrency = useCallback((id: string, labelHint?: string) => {
    setAppCurrency(normalizeAppCurrencyId(id), labelHint)
  }, [])

  const value = useMemo(
    () => ({
      currencyId,
      meta,
      symbol: meta.symbol,
      code: meta.code,
      setCurrency,
    }),
    [currencyId, meta, setCurrency],
  )

  return <AppCurrencyContext.Provider value={value}>{children}</AppCurrencyContext.Provider>
}

export function useAppCurrency() {
  const ctx = useContext(AppCurrencyContext)
  const snapshot = useAppCurrencyStore()
  const currencyId = snapshot.split('||')[0] || getAppCurrencyId()
  if (ctx) return ctx
  const meta = getCurrencyMeta()
  return {
    currencyId,
    meta,
    symbol: meta.symbol,
    code: meta.code,
    setCurrency: (id: string, labelHint?: string) =>
      setAppCurrency(normalizeAppCurrencyId(id), labelHint),
  }
}
