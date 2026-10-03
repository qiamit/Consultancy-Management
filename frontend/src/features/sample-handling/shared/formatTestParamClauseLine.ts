import { normalizeIsCodeLabel } from '@/features/masters/is-codes/formatIsCodeLabel'

/** Under test name: `IS 18573: 2024 & Cl 4.2`. */
export function formatTestParamClauseLine(
  opt: { clauseNo?: string | null; isCodeLabel?: string | null },
  sampleIsCodeLabel?: string | null,
): string | null {
  const clause = opt.clauseNo?.trim() ?? ''
  const isRef = normalizeIsCodeLabel(opt.isCodeLabel) || normalizeIsCodeLabel(sampleIsCodeLabel)
  if (isRef && clause) return `${isRef} & Cl ${clause}`
  if (isRef) return isRef
  if (clause) return `Cl ${clause}`
  return null
}
