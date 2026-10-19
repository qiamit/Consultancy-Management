import type { ReactNode } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { isLaboratoryDirector } from '@/lib/isLaboratoryDirector'

/** Renders children only for Laboratory Director (footer Import/Export/Print/Delete, etc.). */
export function LaboratoryDirectorOnly({ children }: { children: ReactNode }) {
  const { role } = useAuth()
  if (!isLaboratoryDirector(role)) return null
  return <>{children}</>
}

export function useIsLaboratoryDirector(): boolean {
  const { role } = useAuth()
  return isLaboratoryDirector(role)
}
