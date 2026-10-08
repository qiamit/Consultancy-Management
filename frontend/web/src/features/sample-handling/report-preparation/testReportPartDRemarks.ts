/** Line 1 — auto from SRF IS code (read-only in UI) */
export function formatPartDRemarksLine1(isCodeLabel?: string | null): string {
  const isRef = isCodeLabel?.trim() || 'the Applicable IS Standard'
  return `1. The Sample Confirms to ${isRef} with Respect to Above Tests.`
}

const LINE1_PREFIX = '1. The Sample Confirms to'

export function splitPartDRemarks(
  stored: string,
  isCodeLabel?: string | null,
): { line1: string; line2: string } {
  const line1 = formatPartDRemarksLine1(isCodeLabel)
  if (!stored.trim()) return { line1, line2: '' }

  if (stored.startsWith(LINE1_PREFIX) || stored.trimStart().startsWith(LINE1_PREFIX)) {
    const body = stored.startsWith(LINE1_PREFIX) ? stored : stored.trimStart()
    if (body === line1 || body === `${line1}\n`) return { line1, line2: '' }
    if (body.startsWith(`${line1}\n`)) {
      return { line1, line2: body.slice(line1.length + 1) }
    }
    const newlineIdx = body.indexOf('\n')
    if (newlineIdx > 0) {
      return { line1, line2: body.slice(newlineIdx + 1) }
    }
  }

  return { line1, line2: stored }
}

export function joinPartDRemarks(line1: string, line2: string): string {
  if (!line2.trim()) return line1.trim()
  return `${line1.trim()}\n${line2}`
}

/** @deprecated Use formatPartDRemarksLine1 */
export const formatPartDRemarksPlaceholder = formatPartDRemarksLine1
