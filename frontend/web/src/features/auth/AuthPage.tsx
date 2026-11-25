import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Eye, EyeOff, ShieldCheck } from 'lucide-react'
import { signIn, signOut, useAuth } from '@/hooks/useAuth'
import { requestPasswordReset } from '@/features/auth/passwordApi'
import { readTwoStepState } from '@/features/auth/mfaApi'
import { TwoStepChallengePanel } from '@/components/auth/TwoStepLoginPanels'
import { LoginStepsStrip, LoginTilesPanel, LoginWidgetsPanel } from '@/features/auth/LoginSidePanels'
import { usePublicPageTitle } from '@/features/public-site/publicPageUtils'
import { PUBLIC_EMAIL, PUBLIC_LAB_NAME } from '@/features/public-site/publicNav'

/**
 * Sign-in page in the website's Apple style, the same layout as the Qirlpl login page (owner, 25 Nov 2026): tiles
 * on the left, live widgets on the right, the sign-in box in the middle. Sign-in, two-step code and password reset
 * work as before.
 */
export default function AuthPage() {
  const navigate = useNavigate()
  const { user, loading: authLoading } = useAuth()
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined
  const redirectedRef = useRef(false)

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [forgotMode, setForgotMode] = useState(false)
  /** Password accepted; the account has an authenticator, so the 6-digit code comes next. */
  const [codeStep, setCodeStep] = useState(false)
  const [resetSending, setResetSending] = useState(false)
  const [resetSent, setResetSent] = useState(false)
  const [resetError, setResetError] = useState<string | null>(null)
  const [authNotice] = useState<string | null>(() => {
    try {
      const message = sessionStorage.getItem('authNotice')
      if (!message) return null
      sessionStorage.removeItem('authNotice')
      return message
    } catch {
      return null
    }
  })

  const canSubmit = useMemo(() => {
    return Boolean(email.trim() && password.trim())
  }, [email, password])

  const goAfterAuth = () => {
    if (redirectedRef.current) return
    redirectedRef.current = true
    navigate('/', { replace: true })
  }

  /** After the password: ask for the authenticator code when the account has one, else enter the app. */
  const continueAfterPassword = async () => {
    if (redirectedRef.current) return
    try {
      const two = await readTwoStepState()
      if (two.needsCode) {
        setCodeStep(true)
        return
      }
    } catch {
      // The app's Two-Step Login gate checks again before showing anything.
    }
    goAfterAuth()
  }

  useEffect(() => {
    if (authLoading || !user) return
    void continueAfterPassword()
  }, [authLoading, user, navigate])

  const backToSignIn = async () => {
    await signOut()
    setCodeStep(false)
    setPassword('')
    setError(null)
  }

  const handleSubmit = async () => {
    setLoading(true)
    setError(null)

    try {
      const { error: loginError } = await signIn(email.trim(), password)
      if (loginError) throw loginError
      await continueAfterPassword()
    } catch (err) {
      const isObject = typeof err === 'object' && err !== null
      const name = isObject && 'name' in err ? String((err as { name?: unknown }).name) : ''
      const rawMessage = isObject && 'message' in err ? String((err as { message?: unknown }).message) : ''
      const message = rawMessage || 'Authentication failed'

      const isFailedToFetch =
        (name === 'TypeError' && message.toLowerCase().includes('failed to fetch')) ||
        message.toLowerCase().includes('failed to fetch')

      if (isFailedToFetch) {
        const host = (() => {
          try {
            return supabaseUrl ? new URL(supabaseUrl).host : 'unknown-host'
          } catch {
            return 'invalid-api-url'
          }
        })()
        setError(
          `${message}\n\n` +
            `Unable to reach the app's API host: ${host}\n` +
            `Check VITE_SUPABASE_URL in your .env and verify the API service is running.\n` +
            `If URL is correct, this is usually DNS/firewall/proxy blocking in your network or IDE preview.\n` +
            `Try in system Chrome and/or switch DNS to 8.8.8.8 or 1.1.1.1.\n\n` +
            `Origin: ${window.location.origin}\n` +
            `User-Agent: ${navigator.userAgent}`,
        )
        return
      }

      setError(message)
    } finally {
      setLoading(false)
    }
  }

  const handleSendReset = async () => {
    const target = email.trim()
    if (!target) {
      setResetError('Enter your email address.')
      return
    }
    setResetSending(true)
    setResetError(null)
    try {
      await requestPasswordReset(target)
      setResetSent(true)
    } catch {
      setResetError('Could not send the reset email right now. Try again later or contact your admin.')
    } finally {
      setResetSending(false)
    }
  }

  const openForgot = () => {
    setForgotMode(true)
    setResetSent(false)
    setResetError(null)
    setError(null)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && canSubmit && !loading) {
      void handleSubmit()
    }
  }

  usePublicPageTitle(
    codeStep ? 'Two-Step Login · Quality Engineering' : forgotMode ? 'Reset Password · Quality Engineering' : 'Sign In · Quality Engineering',
  )

  const textLink = (label: string, onClick: () => void) => (
    <button type="button" className="qp-link" style={{ fontSize: 14 }} onClick={onClick}>
      {label}
    </button>
  )

  return (
    <section className="qp-screen alt">
      <div className="qp-wrap-wide qp-auth">
        <LoginTilesPanel />
        <div className="qp-auth-main qp-rise">
          <div className="text-center">
            <span className="qp-brand-mark mx-auto qp-auth-mark" aria-hidden>
              <ShieldCheck size={26} />
            </span>
            <h1 className="qp-auth-title">
              {codeStep ? 'Two-Step Login' : forgotMode ? 'Reset Your Password' : 'Sign In to Consultancy Pro'}
            </h1>
            <p className="qp-small" style={{ marginTop: 8 }}>
              For the Team and Clients of {PUBLIC_LAB_NAME}
            </p>
          </div>

          <div className="qp-panel qp-auth-panel">
            {authNotice ? (
              <p
                className="qp-body"
                style={{ fontSize: 15, background: 'rgba(0,113,227,0.08)', color: '#0058b0', padding: '10px 14px', borderRadius: 12, marginBottom: 16 }}
              >
                {authNotice}
              </p>
            ) : null}

            {codeStep ? (
              <TwoStepChallengePanel
                onVerified={goAfterAuth}
                secondaryAction={{ label: 'Back to Sign In', onClick: () => void backToSignIn() }}
              />
            ) : forgotMode ? (
              <div className="qp-form">
                {resetSent ? (
                  <p className="qp-body" style={{ fontSize: 15 }}>
                    If an account exists for {email.trim()}, a password reset link has been sent. Check your inbox (and
                    spam folder). The link works once and expires in about an hour.
                  </p>
                ) : (
                  <>
                    <p className="qp-small" style={{ margin: 0 }}>
                      Enter your account email. We will send you a link to set a new password.
                    </p>
                    <div className="qp-field">
                      <label htmlFor="reset-email">Email Address</label>
                      <input
                        id="reset-email"
                        type="email"
                        className="qp-input"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && !resetSending) void handleSendReset()
                        }}
                        placeholder={PUBLIC_EMAIL}
                        autoComplete="email"
                        autoFocus
                      />
                    </div>
                  </>
                )}
                {resetError ? <p className="qp-error">{resetError}</p> : null}
                {resetSent ? null : (
                  <button
                    type="button"
                    className="qp-btn w-full"
                    onClick={() => void handleSendReset()}
                    disabled={!email.trim() || resetSending}
                  >
                    {resetSending ? 'Sending…' : 'Send Reset Link'}
                  </button>
                )}
                <div className="text-center">{textLink('Back to Sign In', () => setForgotMode(false))}</div>
              </div>
            ) : (
              <div className="qp-form" onKeyDown={handleKeyDown}>
                <div className="qp-field">
                  <label htmlFor="email">Email Address</label>
                  <input
                    id="email"
                    type="email"
                    className="qp-input"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder={PUBLIC_EMAIL}
                    autoComplete="email"
                    autoFocus
                  />
                </div>
                <div className="qp-field">
                  <label htmlFor="password">Password</label>
                  <div className="relative">
                    <input
                      id="password"
                      type={showPassword ? 'text' : 'password'}
                      className="qp-input"
                      style={{ paddingRight: 48 }}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Enter Your Password"
                      autoComplete="current-password"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2"
                      style={{ color: '#86868b', background: 'none', border: 0, cursor: 'pointer', padding: 4 }}
                      aria-label={showPassword ? 'Hide Password' : 'Show Password'}
                      tabIndex={-1}
                    >
                      {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                </div>
                {error ? <p className="qp-error whitespace-pre-line">{error}</p> : null}
                <button
                  type="button"
                  className="qp-btn w-full"
                  style={{ marginTop: 4 }}
                  onClick={handleSubmit}
                  disabled={!canSubmit || loading}
                >
                  {loading ? 'Signing In…' : 'Sign In'}
                </button>
                <div className="text-center">{textLink('Forgot Password?', openForgot)}</div>
              </div>
            )}
          </div>

          <LoginStepsStrip />
          <p className="qp-small text-center qp-auth-help-line">
            Login Help: Your Admin or{' '}
            <a href={`mailto:${PUBLIC_EMAIL}`} className="qp-link" style={{ fontSize: 13 }}>
              {PUBLIC_EMAIL}
            </a>
          </p>
        </div>
        <LoginWidgetsPanel />
      </div>
    </section>
  )
}
