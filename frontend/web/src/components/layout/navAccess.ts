import { useCallback, useMemo } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { canAccessNavItem as checkNavAccess } from '@/lib/moduleAccess'
import { useModuleAccessOptional } from '@/features/settings/module-access/ModuleAccessProvider'
import { toProperLabelText } from '@/lib/properLabelText'
import type { NavItem } from '@/lib/appNav'

/** Shared by the pinned sidebar, the ☰ hover menu and the profile menu. */

export const formatNavLabel = (value: string) => toProperLabelText(value)

export type NavCanAccess = (requiredDesignations: string[] | undefined, to: string | undefined) => boolean

export function navItemAccessible(item: NavItem, canAccess: NavCanAccess): boolean {
  return canAccess(item.requiredDesignations, item.to)
}

/** Items of a section the user may open (a group counts when one of its children is open to them). */
export function visibleNavItems(items: NavItem[], canAccess: NavCanAccess): NavItem[] {
  return items.filter((item) => {
    if (item.children && item.children.length > 0) {
      return item.children.some((c) => navItemAccessible(c, canAccess))
    }
    return navItemAccessible(item, canAccess)
  })
}

export function useNavCanAccess(): NavCanAccess {
  const moduleAccess = useModuleAccessOptional()
  const { designation, departmentName, role } = useAuth()
  const legacyCtx = useMemo(
    () => ({ designation: designation ?? '', departmentName: departmentName ?? '', role }),
    [designation, departmentName, role],
  )

  return useCallback(
    (requiredDesignations: string[] | undefined, to: string | undefined) => {
      if (moduleAccess) return moduleAccess.canAccessNavItem(requiredDesignations, to)
      return checkNavAccess(requiredDesignations, to, legacyCtx)
    },
    [moduleAccess, legacyCtx],
  )
}

export function navItemMatchesPath(item: NavItem, pathname: string): boolean {
  if (item.to && (pathname === item.to || pathname.startsWith(`${item.to}/`))) return true
  return (item.children ?? []).some((c) => navItemMatchesPath(c, pathname))
}
