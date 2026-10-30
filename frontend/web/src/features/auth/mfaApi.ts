import type { Factor } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabaseClient'

/**
 * Two-Step Login = GoTrue TOTP MFA (Google / Microsoft Authenticator, no SMS).
 * A password-only session is aal1; after the 6-digit code it is aal2. The database (app_is_admin,
 * app_module_level) and the functions service require aal2 for admins and for anyone with a factor.
 */

export const TOTP_ISSUER = 'Consultancy Pro'

export type TwoStepState = {
  /** aal of the current session JWT ('aal1' | 'aal2'), '' when unknown. */
  currentLevel: string
  /** Verified authenticator factors of the user (fresh from GoTrue). */
  verifiedTotp: Factor[]
  /** The user has an authenticator but this session has not passed the code yet. */
  needsCode: boolean
}

function message(error: unknown, fallback: string): string {
  if (error && typeof error === 'object' && 'message' in error) {
    const text = String((error as { message?: unknown }).message ?? '').trim()
    if (text) return text
  }
  return fallback
}

/** Friendlier text for the GoTrue errors a user can actually cause. */
export function twoStepErrorText(error: unknown, fallback = 'Something went wrong. Try again.'): string {
  const text = message(error, fallback)
  const lower = text.toLowerCase()
  if (lower.includes('invalid totp') || lower.includes('invalid code') || lower.includes('code is invalid')) {
    return 'That Code Is Not Correct. Enter the Current 6-Digit Code From Your Authenticator App.'
  }
  if (lower.includes('expired')) return 'The Code Request Expired. Enter a New Code.'
  if (lower.includes('rate limit') || lower.includes('too many')) {
    return 'Too Many Attempts. Wait a Minute and Try Again.'
  }
  return text
}

export async function readTwoStepState(): Promise<TwoStepState> {
  const [{ data: aal, error: aalError }, { data: factors, error: factorsError }] = await Promise.all([
    supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
    supabase.auth.mfa.listFactors(),
  ])
  if (aalError) throw new Error(aalError.message)
  if (factorsError) throw new Error(factorsError.message)
  const verifiedTotp = (factors?.totp ?? []).filter((f) => f.status === 'verified')
  const currentLevel = String(aal?.currentLevel ?? '')
  return { currentLevel, verifiedTotp, needsCode: verifiedTotp.length > 0 && currentLevel !== 'aal2' }
}

export function isSixDigitCode(code: string): boolean {
  return /^\d{6}$/.test(code)
}

/** Challenge + verify with the user's verified authenticator; the session becomes aal2. */
export async function verifyTwoStepCode(code: string, factorId?: string): Promise<void> {
  let id = factorId
  if (!id) {
    const { data, error } = await supabase.auth.mfa.listFactors()
    if (error) throw new Error(error.message)
    id = (data?.totp ?? []).find((f) => f.status === 'verified')?.id
  }
  if (!id) throw new Error('No Authenticator Is Set Up for This Account.')
  const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: id, code })
  if (error) throw new Error(twoStepErrorText(error))
}

export type TotpEnrollment = {
  factorId: string
  /** Safe <img src> value (data:image/svg+xml), or '' when GoTrue sent no usable QR. */
  qrSrc: string
  /** Base32 secret for typing into the app by hand. */
  secret: string
}

/**
 * GoTrue returns the QR as SVG text, which supabase-js prefixes with "data:image/svg+xml;utf-8,".
 * Re-encode it so characters such as # cannot cut the data URI short. Rendered only as <img src>
 * (an image context never runs scripts).
 */
function qrImageSrc(raw: unknown): string {
  const value = String(raw ?? '').trim()
  const prefixed = value.match(/^data:image\/svg\+xml;(?:utf-8|charset=utf-8),([\s\S]*)$/i)
  const svg = prefixed ? prefixed[1] : value
  if (!/^\s*(<\?xml[^>]*>\s*)?<svg[\s>]/i.test(svg)) return ''
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}

/**
 * Starts a new authenticator enrollment. Unfinished (unverified) enrollments from earlier attempts are
 * removed first so they never pile up against GoTrue's factor limit.
 */
export async function startTotpEnrollment(): Promise<TotpEnrollment> {
  const { data: listed } = await supabase.auth.mfa.listFactors()
  for (const factor of listed?.all ?? []) {
    if (factor.factor_type === 'totp' && factor.status !== 'verified') {
      await supabase.auth.mfa.unenroll({ factorId: factor.id })
    }
  }
  const stamp = new Date().toISOString().slice(0, 16).replace('T', ' ')
  const { data, error } = await supabase.auth.mfa.enroll({
    factorType: 'totp',
    issuer: TOTP_ISSUER,
    friendlyName: `Authenticator App ${stamp}`,
  })
  if (error || !data) throw new Error(twoStepErrorText(error, 'Could Not Start the Authenticator Setup.'))
  if (data.type !== 'totp') throw new Error('Could Not Start the Authenticator Setup.')
  return { factorId: data.id, qrSrc: qrImageSrc(data.totp?.qr_code), secret: String(data.totp?.secret ?? '') }
}

/** Confirms the enrollment with the first code; the factor becomes verified and the session aal2. */
export async function finishTotpEnrollment(factorId: string, code: string): Promise<void> {
  const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId, code })
  if (error) throw new Error(twoStepErrorText(error))
}

/** Drops an enrollment the user did not finish (dialog closed). Best effort. */
export async function cancelTotpEnrollment(factorId: string): Promise<void> {
  try {
    await supabase.auth.mfa.unenroll({ factorId })
  } catch {
    /* an unverified factor also expires on its own */
  }
}

/** Removes the user's own authenticator. GoTrue requires an aal2 session for a verified factor. */
export async function removeOwnTotp(factorId: string): Promise<void> {
  const { error } = await supabase.auth.mfa.unenroll({ factorId })
  if (error) throw new Error(twoStepErrorText(error, 'Could Not Remove the Authenticator.'))
  // Pick up the new factor list (and the session GoTrue may have downgraded).
  await supabase.auth.refreshSession()
}
