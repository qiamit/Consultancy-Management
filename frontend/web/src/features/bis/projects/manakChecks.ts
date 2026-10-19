/**
 * Data checks for the Manak Online "New Application" fill (QE extension, built from manakNewAppPayload.ts).
 * Manak blocks Next on values it does not accept, so the step pages flag them before the fill runs.
 */

/** Same rule as the payload builder: Manak rejects user IDs, lists and addresses without a domain. */
const MANAK_EMAIL_RE = /^[^@\s,;]+@[^@\s,;]+\.[a-z]{2,}$/i

export const isManakEmail = (value: string): boolean => MANAK_EMAIL_RE.test(value.trim())

/** Inline message for a filled-in email Manak will not accept (empty is not an error here). */
export const manakEmailError = (value: string): string | null =>
  value.trim() && !isManakEmail(value) ? 'Not a valid email address (name@company.com) — Manak blocks Next on it.' : null
