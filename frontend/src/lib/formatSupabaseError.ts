/** PostgREST / Postgres details often explain 400 PATCH failures (enum, missing column, etc.). */
export function formatSupabaseError(err: {
  message?: string
  details?: string
  hint?: string
  code?: string
}): string {
  const m = typeof err.message === 'string' ? err.message : ''
  const d = typeof err.details === 'string' && err.details.trim() ? err.details.trim() : ''
  const h = typeof err.hint === 'string' && err.hint.trim() ? err.hint.trim() : ''
  const c = typeof err.code === 'string' && err.code.trim() ? err.code.trim() : ''
  return [m, d, h, c && `(${c})`].filter(Boolean).join(' — ')
}
