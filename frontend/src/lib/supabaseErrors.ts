/** PostgREST / Postgres error when a selected or updated column does not exist yet. */
export function isSupabaseMissingColumnError(
  error: { message?: string } | null | undefined,
  column: string,
): boolean {
  if (!error?.message) return false
  const msg = error.message.toLowerCase()
  const col = column.toLowerCase()
  return (
    msg.includes(col) &&
    (msg.includes('does not exist') ||
      msg.includes('could not find') ||
      msg.includes('schema cache'))
  )
}
