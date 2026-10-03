import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import {
  applyAppTheme,
  deleteCustomTheme,
  normalizeAppThemeId,
  readCustomThemes,
  readStoredAppTheme,
  upsertCustomTheme,
  type AppThemeId,
  type CustomThemeDef,
} from '@/lib/appTheme'

type AppThemeContextValue = {
  theme: AppThemeId
  setTheme: (theme: AppThemeId) => void
  customThemes: CustomThemeDef[]
  saveCustomTheme: (def: CustomThemeDef) => void
  removeCustomTheme: (id: string) => void
}

const AppThemeContext = createContext<AppThemeContextValue | null>(null)

export function AppThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<AppThemeId>(() => readStoredAppTheme())
  const [customThemes, setCustomThemes] = useState<CustomThemeDef[]>(() => readCustomThemes())

  const setTheme = useCallback(
    (next: AppThemeId) => {
      const normalized = normalizeAppThemeId(next)
      setThemeState(normalized)
      applyAppTheme(normalized, customThemes)
    },
    [customThemes],
  )

  const saveCustomTheme = useCallback(
    (def: CustomThemeDef) => {
      const next = upsertCustomTheme(def, customThemes)
      setCustomThemes(next)
      setThemeState(def.id)
      applyAppTheme(def.id, next)
    },
    [customThemes],
  )

  const removeCustomTheme = useCallback(
    (id: string) => {
      const next = deleteCustomTheme(id, customThemes)
      setCustomThemes(next)
      if (theme === id) {
        setThemeState('light')
        applyAppTheme('light', next)
      } else {
        applyAppTheme(theme, next)
      }
    },
    [customThemes, theme],
  )

  useLayoutEffect(() => {
    applyAppTheme(theme, customThemes)
  }, [theme, customThemes])

  useEffect(() => {
    if (theme !== 'system') return
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = () => applyAppTheme('system', customThemes)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [theme, customThemes])

  const value = useMemo(
    () => ({ theme, setTheme, customThemes, saveCustomTheme, removeCustomTheme }),
    [theme, setTheme, customThemes, saveCustomTheme, removeCustomTheme],
  )

  return <AppThemeContext.Provider value={value}>{children}</AppThemeContext.Provider>
}

export function useAppTheme() {
  const ctx = useContext(AppThemeContext)
  if (!ctx) {
    throw new Error('useAppTheme must be used within AppThemeProvider')
  }
  return ctx
}
