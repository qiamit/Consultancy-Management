import { cn } from '@/lib/utils'
import type { ConformityRemark } from './evaluateResultConformity'

export function normalizeResultRemark(value: string | null | undefined): ConformityRemark {
  const t = (value ?? '').trim()
  if (t === 'Confirm' || t === 'Not Confirm' || t === 'Not Applicable') return t
  if (t === '—' || t === '-' || t.toLowerCase() === 'n/a' || t.toLowerCase() === 'na') {
    return 'Not Applicable'
  }
  return 'Not Applicable'
}

export function resultRemarkCellClass(remark: string): string {
  const normalized = normalizeResultRemark(remark)
  return cn(
    normalized === 'Confirm' && 'text-emerald-700 dark:text-emerald-400',
    normalized === 'Not Confirm' && 'text-destructive',
    normalized === 'Not Applicable' && 'text-muted-foreground',
  )
}
