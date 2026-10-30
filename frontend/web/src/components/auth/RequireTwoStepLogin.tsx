import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { ShieldCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { signOut, useAuth } from '@/hooks/useAuth'
import { readTwoStepState } from '@/features/auth/mfaApi'
import { TwoStepChallengePanel, TwoStepEnrollPanel } from '@/components/auth/TwoStepLoginPanels'
import {
  limsDarkBarAccentClass,
  limsDarkBarClass,
  limsDarkBarGlowStyle,
  limsOutlineBtnClass,
  limsPageShellClass,
  limsPanelClass,
  limsRegistryFormClass,
} from '@/lib/limsThemeUi'
import { cn } from '@/lib/utils'

type GateState = 'checking' | 'ok' | 'code' | 'enroll' | 'error'

/**
 * Two-Step Login gate in front of the whole app:
 *  - a user with an authenticator whose session has not passed the code (aal1) enters the 6-digit code;
 *  - an admin without an authenticator must set one up first (one time). The database gives an admin
 *    no rights until the session is aal2, so nothing in the app would work before this anyway.
 */
export function RequireTwoStepLogin({ children }: { children: ReactNode }) {
  const navigate = useNavigate()
  const { user, session, role, profileReady } = useAuth()
  const [state, setState] = useState<GateState>('checking')
  const stateRef = useRef<GateState>('checking')
  const runRef = useRef(0)

  const setGate = (next: GateState) => {
    stateRef.current = next
    setState(next)
  }

  const check = useCallback(async () => {
    const run = ++runRef.current
    try {
      const two = await readTwoStepState()
      if (run !== runRef.current) return
      if (two.needsCode) setGate('code')
      // Admins and Customer Portal logins must have an authenticator.
      else if ((role === 'admin' || role === 'customer') && two.verifiedTotp.length === 0) setGate('enroll')
      else setGate('ok')
    } catch {
      if (run !== runRef.current) return
      // A failed re-check (for example on a token refresh) never throws a working user out.
      if (stateRef.current !== 'ok') setGate('error')
    }
  }, [role])

  const accessToken = session?.access_token ?? ''
  useEffect(() => {
    if (!user || !profileReady) return
    void check()
  }, [user, profileReady, accessToken, check])

  const logOut = async () => {
    await signOut()
    navigate('/auth', { replace: true })
  }

  if (state === 'ok') return <>{children}</>
  if (state === 'checking' || !profileReady) return null

  const title = state === 'enroll' ? 'Set Up Two-Step Login' : 'Two-Step Login'
  return (
    <div className={cn(limsPageShellClass, 'flex min-h-[70vh] max-w-none flex-col items-center justify-center')}>
      <div className="w-full max-w-md">
        <div className={limsPanelClass}>
          <div className={cn(limsDarkBarClass, 'px-5 py-3.5')}>
            <div className="pointer-events-none absolute inset-0 opacity-[0.18]" style={limsDarkBarGlowStyle} />
            <div className={limsDarkBarAccentClass} />
            <div className="relative flex items-center justify-center gap-2">
              <ShieldCheck size={18} className="text-amber-300" />
              <h1 className="text-lg font-semibold tracking-tight text-white">{title}</h1>
            </div>
          </div>
          <div className={cn(limsRegistryFormClass, 'space-y-4 p-5')}>
            {user?.email ? <p className="text-xs text-stone-500">Signed In as {user.email}</p> : null}
            {state === 'code' && (
              <TwoStepChallengePanel
                onVerified={() => void check()}
                secondaryAction={{ label: 'Log Out', onClick: () => void logOut() }}
              />
            )}
            {state === 'enroll' && (
              <TwoStepEnrollPanel
                intro="Admin Accounts Must Use Two-Step Login. Set Up an Authenticator App Once; After That Every Sign-In Asks for Your Password and a 6-Digit Code."
                onEnrolled={() => void check()}
                secondaryAction={{ label: 'Log Out', onClick: () => void logOut() }}
              />
            )}
            {state === 'error' && (
              <>
                <div className="rounded-none border border-red-500/40 bg-red-50 px-3 py-2.5">
                  <p className="text-sm text-red-700">Could Not Check Your Two-Step Login. Check Your Connection and Try Again.</p>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <button
                    type="button"
                    className="text-xs font-medium text-amber-800 hover:underline"
                    onClick={() => void logOut()}
                  >
                    Log Out
                  </button>
                  <Button type="button" variant="outline" className={limsOutlineBtnClass} onClick={() => void check()}>
                    Try Again
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
