import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { KeyRound } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { PasswordInput } from '@/components/auth/PasswordInput'
import { newPasswordProblem, PASSWORD_MIN_LENGTH, setOwnPassword } from '@/features/auth/passwordApi'
import { supabase } from '@/lib/supabaseClient'
import { useAuth } from '@/hooks/useAuth'
import {
  limsDarkBarAccentClass,
  limsDarkBarClass,
  limsDarkBarGlowStyle,
  limsPageShellClass,
  limsPanelClass,
  limsPrimaryBtnClass,
  limsRegistryFormClass,
} from '@/lib/limsThemeUi'
import { cn } from '@/lib/utils'

/** Error GoTrue puts in the redirect URL when the link is expired or already used. */
function linkErrorFromUrl(): string | null {
  const params = new URLSearchParams(
    `${window.location.search.replace(/^\?/, '')}&${window.location.hash.replace(/^#/, '')}`,
  )
  const description = params.get('error_description') || params.get('error')
  return description ? description.replace(/\+/g, ' ').replace(/[.!]?\s*$/, '.') : null
}

/**
 * Read at module load, before supabase-js finishes reading and clearing the URL hash: only a
 * recovery link may set a password here without the current one (an already signed-in session
 * uses "Change password" in the user menu instead).
 */
const ARRIVED_WITH_RECOVERY_LINK =
  typeof window !== 'undefined' && /(^|[#&?])type=recovery(&|$)/.test(window.location.hash)

type Phase = 'checking' | 'ready' | 'invalid' | 'done'

/** /auth/reset: target of the "Forgot password?" email. The recovery link signs the user in. */
export default function ResetPasswordPage() {
  const navigate = useNavigate()
  const { clearMustChangePassword } = useAuth()
  const [phase, setPhase] = useState<Phase>(ARRIVED_WITH_RECOVERY_LINK ? 'checking' : 'invalid')
  const [linkError] = useState(linkErrorFromUrl)
  const [email, setEmail] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let canceled = false
    const accept = (sessionEmail: string | undefined) => {
      if (canceled) return
      setEmail(sessionEmail ?? '')
      setPhase('ready')
    }

    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY' && session) accept(session.user.email)
    })

    if (!ARRIVED_WITH_RECOVERY_LINK) {
      return () => {
        canceled = true
        listener.subscription.unsubscribe()
      }
    }

    void supabase.auth.getSession().then(({ data }) => {
      if (data.session) {
        accept(data.session.user.email)
        return
      }
      // detectSessionInUrl may still be exchanging the link; give it a moment.
      window.setTimeout(() => {
        void supabase.auth.getSession().then(({ data: later }) => {
          if (canceled) return
          if (later.session) accept(later.session.user.email)
          else setPhase((p) => (p === 'checking' ? 'invalid' : p))
        })
      }, 1500)
    })

    return () => {
      canceled = true
      listener.subscription.unsubscribe()
    }
  }, [])

  const handleSave = async () => {
    setError(null)
    const problem = newPasswordProblem(newPassword, confirmPassword)
    if (problem) {
      setError(problem)
      return
    }
    setSaving(true)
    try {
      await setOwnPassword(newPassword)
      clearMustChangePassword()
      setPhase('done')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to set the password.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      className={cn(limsPageShellClass, 'flex min-h-[70vh] max-w-none flex-col items-center justify-center')}
    >
      <div className="w-full max-w-md">
        <div className={limsPanelClass}>
          <div className={cn(limsDarkBarClass, 'px-5 py-3.5')}>
            <div
              className="pointer-events-none absolute inset-0 opacity-[0.18]"
              style={limsDarkBarGlowStyle}
            />
            <div className={limsDarkBarAccentClass} />
            <div className="relative flex items-center justify-center gap-2">
              <KeyRound size={18} className="text-amber-300" />
              <h1 className="text-lg font-semibold tracking-tight text-white">Set a New Password</h1>
            </div>
          </div>

          <div className={cn(limsRegistryFormClass, 'space-y-4 p-5')}>
            {phase === 'checking' && <p className="text-sm text-stone-600">Checking Your Reset Link…</p>}

            {phase === 'invalid' && (
              <>
                <div className="rounded-none border border-red-500/40 bg-red-50 px-3 py-2.5">
                  <p className="text-sm text-red-700">
                    {linkError || 'This reset link is invalid or has expired.'} Request a new link from the
                    sign-in page.
                  </p>
                </div>
                <div className="flex justify-end">
                  <Button
                    type="button"
                    className={cn(limsPrimaryBtnClass, 'h-8 px-5')}
                    onClick={() => navigate('/auth', { replace: true })}
                  >
                    Back to sign in
                  </Button>
                </div>
              </>
            )}

            {phase === 'ready' && (
              <>
                {email && <p className="text-sm text-stone-600">Account: {email}</p>}
                {error && (
                  <div className="rounded-none border border-red-500/40 bg-red-50 px-3 py-2.5">
                    <p className="text-sm text-red-700">{error}</p>
                  </div>
                )}
                <div className="space-y-2">
                  <Label htmlFor="reset-new-password">New Password</Label>
                  <PasswordInput
                    id="reset-new-password"
                    value={newPassword}
                    onChange={setNewPassword}
                    placeholder={`At least ${PASSWORD_MIN_LENGTH} characters`}
                    autoFocus
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="reset-confirm-password">Confirm New Password</Label>
                  <PasswordInput
                    id="reset-confirm-password"
                    value={confirmPassword}
                    onChange={setConfirmPassword}
                  />
                </div>
                <div className="flex justify-end">
                  <Button
                    type="button"
                    className={cn(limsPrimaryBtnClass, 'h-8 min-w-[9rem] px-5')}
                    onClick={handleSave}
                    disabled={saving}
                  >
                    {saving ? 'Saving...' : 'Save password'}
                  </Button>
                </div>
              </>
            )}

            {phase === 'done' && (
              <>
                <div className="rounded-none border border-emerald-600/40 bg-emerald-50 px-3 py-2.5">
                  <p className="text-sm text-emerald-800">Your Password Has Been Changed.</p>
                </div>
                <div className="flex justify-end">
                  <Button
                    type="button"
                    className={cn(limsPrimaryBtnClass, 'h-8 px-5')}
                    onClick={() => navigate('/', { replace: true })}
                  >
                    Continue
                  </Button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
