import type { ReactNode } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { isLaboratoryDirector } from '@/lib/isLaboratoryDirector'

/** Renders children only for Laboratory Director (footer Import/Export/Print/Delete, etc.). */
export function LaboratoryDirectorOnly({ children }: { children: ReactNode }) {
  const { designation } = useAuth()
  if (!isLaboratoryDirector(designation)) return null
  return <>{children}</>
}

export function useIsLaboratoryDirector(): boolean {
  const { designation } = useAuth()
  return isLaboratoryDirector(designation)
}
