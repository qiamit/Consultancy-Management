import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { KeyRound } from 'lucide-react'
import { PasswordInput } from '@/components/auth/PasswordInput'
import { newPasswordProblem, PASSWORD_MIN_LENGTH, setOwnPassword } from '@/features/auth/passwordApi'
import { supabase } from '@/lib/supabaseClient'
import { useAuth } from '@/hooks/useAuth'
import { readTwoStepState } from '@/features/auth/mfaApi'
import { TwoStepChallengePanel } from '@/components/auth/TwoStepLoginPanels'
import { usePublicPageTitle } from '@/features/public-site/publicPageUtils'

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
  /** GoTrue refuses a new password on a password-only session once an authenticator is set up. */
  const [needsCode, setNeedsCode] = useState(false)

  useEffect(() => {
    let canceled = false
    const accept = (sessionEmail: string | undefined) => {
      if (canceled) return
      setEmail(sessionEmail ?? '')
      setPhase('ready')
      void readTwoStepState()
        .then((two) => {
          if (!canceled) setNeedsCode(two.needsCode)
        })
        .catch(() => {
          /* setOwnPassword reports the error if a code was needed */
        })
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

  usePublicPageTitle('Set a New Password · Quality Engineering')

  // Same look as the sign-in page (website style, owner 25 Nov 2026); the steps are unchanged.
  return (
    <section className="qp-screen alt">
      <div className="qp-wrap" style={{ maxWidth: 520 }}>
        <div className="qp-auth-main qp-rise">
          <div className="text-center">
            <span className="qp-brand-mark mx-auto qp-auth-mark" aria-hidden>
              <KeyRound size={24} />
            </span>
            <h1 className="qp-auth-title">Set a New Password</h1>
          </div>

          <div className="qp-panel qp-auth-panel">
            {phase === 'checking' && <p className="qp-small">Checking Your Reset Link…</p>}

            {phase === 'invalid' && (
              <div className="qp-form">
                <p className="qp-error">
                  {linkError || 'This reset link is invalid or has expired.'} Request a new link from the sign-in page.
                </p>
                <button type="button" className="qp-btn w-full" onClick={() => navigate('/auth', { replace: true })}>
                  Back to Sign In
                </button>
              </div>
            )}

            {phase === 'ready' && needsCode && (
              <TwoStepChallengePanel
                intro="Your Account Uses Two-Step Login. Enter the 6-Digit Code From Your Authenticator App Before Setting a New Password. Lost Your Phone? Ask an Admin to Reset Your Two-Step Login First."
                onVerified={() => setNeedsCode(false)}
              />
            )}

            {phase === 'ready' && !needsCode && (
              <div className="qp-form">
                {email && <p className="qp-small" style={{ margin: 0 }}>Account: {email}</p>}
                {error && <p className="qp-error">{error}</p>}
                <div className="qp-field">
                  <label htmlFor="reset-new-password">New Password</label>
                  <PasswordInput
                    id="reset-new-password"
                    value={newPassword}
                    onChange={setNewPassword}
                    placeholder={`At Least ${PASSWORD_MIN_LENGTH} Characters`}
                    autoFocus
                    className="qp-input"
                  />
                </div>
                <div className="qp-field">
                  <label htmlFor="reset-confirm-password">Confirm New Password</label>
                  <PasswordInput
                    id="reset-confirm-password"
                    value={confirmPassword}
                    onChange={setConfirmPassword}
                    className="qp-input"
                  />
                </div>
                <button type="button" className="qp-btn w-full" onClick={handleSave} disabled={saving}>
                  {saving ? 'Saving…' : 'Save Password'}
                </button>
              </div>
            )}

            {phase === 'done' && (
              <div className="qp-form">
                <p
                  className="qp-body"
                  style={{ fontSize: 15, background: 'rgba(52,199,89,0.12)', color: '#1a7f37', padding: '10px 14px', borderRadius: 12, margin: 0 }}
                >
                  Your Password Has Been Changed.
                </p>
                <button type="button" className="qp-btn w-full" onClick={() => navigate('/', { replace: true })}>
                  Continue
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  )
}
