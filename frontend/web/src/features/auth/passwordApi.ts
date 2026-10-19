import { supabase } from '@/lib/supabaseClient'

export const PASSWORD_MIN_LENGTH = 8
export const PASSWORD_MAX_LENGTH = 72

/** Same rules as the functions service (`passwordProblem`). Passwords are never trimmed. */
export function newPasswordProblem(password: string, confirm: string): string | null {
  if (!password) return 'Enter a new password.'
  if (password.length < PASSWORD_MIN_LENGTH) {
    return `Password must be at least ${PASSWORD_MIN_LENGTH} characters.`
  }
  if (password.length > PASSWORD_MAX_LENGTH) {
    return `Password must be at most ${PASSWORD_MAX_LENGTH} characters.`
  }
  if (password.trim() !== password) return 'Password cannot start or end with a space.'
  if (password !== confirm) return 'The two passwords do not match.'
  return null
}

/** Clears user_profiles.must_change_password for the signed-in user. */
export async function markPasswordChanged(): Promise<void> {
  const { error } = await supabase.rpc('app_password_changed')
  if (error) throw new Error(error.message)
}

/** Sets a new password for the signed-in user (session from login or a recovery link). */
export async function setOwnPassword(newPassword: string): Promise<void> {
  const { error } = await supabase.auth.updateUser({ password: newPassword })
  if (error) throw new Error(error.message)
  await markPasswordChanged()
}

/** "Change my password": checks the current password first, then sets the new one. */
export async function changeOwnPassword(
  email: string,
  currentPassword: string,
  newPassword: string,
): Promise<void> {
  if (!email) throw new Error('Your session has no email address. Log in again.')
  if (currentPassword === newPassword) {
    throw new Error('The new password must be different from the current one.')
  }
  const { error: verifyError } = await supabase.auth.signInWithPassword({
    email,
    password: currentPassword,
  })
  if (verifyError) throw new Error('Current password is incorrect.')
  await setOwnPassword(newPassword)
}

export function passwordResetRedirectUrl(): string {
  return `${window.location.origin}/auth/reset`
}

/** Sends the "Forgot password" email. GoTrue answers the same whether or not the email exists. */
export async function requestPasswordReset(email: string): Promise<void> {
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: passwordResetRedirectUrl(),
  })
  if (error) throw new Error(error.message)
}
