import {
  createContext,
  createElement,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { useAuth } from '@/hooks/useAuth'
import {
  fetchModuleAccessRules,
  type ModuleAccessRuleRow,
} from './moduleAccessApi'
import {
  canAccessNavItemWithRules,
  canAccessPathWithRules,
  canEditPathWithRules,
  resolveModuleAccessLevel,
  type ModuleAccessUserContext,
} from './resolveModuleAccess'
import type { ModuleAccessLevel } from './moduleCatalog'

type ModuleAccessState = {
  rules: ModuleAccessRuleRow[]
  loading: boolean
  error: string | null
  refresh: () => Promise<void>
  ctx: ModuleAccessUserContext
  canAccessPath: (pathname: string) => boolean
  canEditPath: (pathname: string) => boolean
  canAccessNavItem: (requiredDesignations: string[] | undefined, to: string | undefined) => boolean
  accessLevelFor: (pathname: string) => ModuleAccessLevel
}

const ModuleAccessContext = createContext<ModuleAccessState | null>(null)

export function ModuleAccessProvider({ children }: { children: ReactNode }) {
  const { user, designation, departmentName, division, profileReady } = useAuth()
  const [rules, setRules] = useState<ModuleAccessRuleRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setError(null)
    try {
      const rows = await fetchModuleAccessRules()
      setRules(rows)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load module access rules')
      setRules([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!profileReady) return
    if (!user) {
      setRules([])
      setLoading(false)
      return
    }
    setLoading(true)
    void refresh()
  }, [user?.id, profileReady, refresh])

  const ctx = useMemo<ModuleAccessUserContext>(
    () => ({
      designation,
      departmentName,
      division: division ?? '',
      userId: user?.id ?? null,
    }),
    [designation, departmentName, division, user?.id],
  )

  const value = useMemo<ModuleAccessState>(
    () => ({
      rules,
      loading,
      error,
      refresh,
      ctx,
      canAccessPath: (pathname: string) => canAccessPathWithRules(pathname, ctx, rules),
      canEditPath: (pathname: string) => canEditPathWithRules(pathname, ctx, rules),
      canAccessNavItem: (requiredDesignations, to) =>
        canAccessNavItemWithRules(requiredDesignations, to, ctx, rules),
      accessLevelFor: (pathname: string) => resolveModuleAccessLevel(pathname, ctx, rules),
    }),
    [rules, loading, error, refresh, ctx],
  )

  return createElement(ModuleAccessContext.Provider, { value }, children)
}

export function useModuleAccess(): ModuleAccessState {
  const value = useContext(ModuleAccessContext)
  if (!value) {
    throw new Error('useModuleAccess must be used within ModuleAccessProvider')
  }
  return value
}

/** Safe for components that may render outside provider during auth boot. */
export function useModuleAccessOptional(): ModuleAccessState | null {
  return useContext(ModuleAccessContext)
}
