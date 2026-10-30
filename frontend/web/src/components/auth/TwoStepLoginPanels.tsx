import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  cancelTotpEnrollment,
  finishTotpEnrollment,
  isSixDigitCode,
  startTotpEnrollment,
  twoStepErrorText,
  verifyTwoStepCode,
  type TotpEnrollment,
} from '@/features/auth/mfaApi'
import { limsFieldClass, limsOutlineBtnClass, limsPrimaryBtnClass } from '@/lib/limsThemeUi'
import { cn } from '@/lib/utils'

/** 6-digit code box: digits only, phone keypad, browser one-time-code autofill. */
export function TwoStepCodeField(props: {
  id: string
  value: string
  onChange: (value: string) => void
  onSubmit?: () => void
  autoFocus?: boolean
  disabled?: boolean
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={props.id}>6-Digit Code</Label>
      <Input
        id={props.id}
        value={props.value}
        onChange={(e) => props.onChange(e.target.value.replace(/\D/g, '').slice(0, 6))}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && isSixDigitCode(props.value)) props.onSubmit?.()
        }}
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="[0-9]*"
        maxLength={6}
        placeholder="123456"
        autoFocus={props.autoFocus}
        disabled={props.disabled}
        className={cn(limsFieldClass, 'text-center font-mono text-lg tracking-[0.4em]')}
      />
    </div>
  )
}

function ErrorNote({ text }: { text: string | null }) {
  if (!text) return null
  return (
    <div className="rounded-none border border-red-500/40 bg-red-50 px-3 py-2.5">
      <p className="text-sm text-red-700">{text}</p>
    </div>
  )
}

/** Code step for a user who already has an authenticator (session aal1 -> aal2). */
export function TwoStepChallengePanel(props: {
  onVerified: () => void
  secondaryAction?: { label: string; onClick: () => void }
  intro?: string
}) {
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async () => {
    if (!isSixDigitCode(code) || busy) return
    setBusy(true)
    setError(null)
    try {
      await verifyTwoStepCode(code)
      props.onVerified()
    } catch (err) {
      setError(twoStepErrorText(err))
      setCode('')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-stone-600">
        {props.intro ?? 'Open Your Authenticator App and Enter the 6-Digit Code Shown for Consultancy Pro.'}
      </p>
      <TwoStepCodeField id="two-step-code" value={code} onChange={setCode} onSubmit={submit} autoFocus disabled={busy} />
      <ErrorNote text={error} />
      <div className="flex items-center justify-between gap-3">
        {props.secondaryAction ? (
          <button
            type="button"
            className="text-xs font-medium text-amber-800 hover:underline"
            onClick={props.secondaryAction.onClick}
          >
            {props.secondaryAction.label}
          </button>
        ) : (
          <span />
        )}
        <Button
          type="button"
          className={cn(limsPrimaryBtnClass, 'h-8 w-auto min-w-[7.5rem] px-5')}
          onClick={submit}
          disabled={!isSixDigitCode(code) || busy}
        >
          {busy ? 'Checking...' : 'Verify'}
        </Button>
      </div>
    </div>
  )
}

/**
 * Authenticator setup: QR code + secret for manual entry, then the first code confirms it.
 * Leaving without finishing removes the unfinished enrollment.
 */
export function TwoStepEnrollPanel(props: {
  onEnrolled: () => void
  secondaryAction?: { label: string; onClick: () => void }
  intro?: string
}) {
  const [enrollment, setEnrollment] = useState<TotpEnrollment | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showSecret, setShowSecret] = useState(false)
  const startedRef = useRef(false)
  const doneRef = useRef(false)
  const factorRef = useRef<string | null>(null)

  useEffect(() => {
    // One enrollment per mount (React StrictMode runs effects twice in development).
    if (startedRef.current) return
    startedRef.current = true
    void startTotpEnrollment()
      .then((value) => {
        factorRef.current = value.factorId
        setEnrollment(value)
      })
      .catch((err) => setLoadError(twoStepErrorText(err, 'Could Not Start the Authenticator Setup.')))
  }, [])

  useEffect(
    () => () => {
      if (!doneRef.current && factorRef.current) void cancelTotpEnrollment(factorRef.current)
    },
    [],
  )

  const submit = async () => {
    if (!enrollment || !isSixDigitCode(code) || busy) return
    setBusy(true)
    setError(null)
    try {
      await finishTotpEnrollment(enrollment.factorId, code)
      doneRef.current = true
      props.onEnrolled()
    } catch (err) {
      setError(twoStepErrorText(err))
      setCode('')
    } finally {
      setBusy(false)
    }
  }

  const retry = () => {
    setLoadError(null)
    setEnrollment(null)
    void startTotpEnrollment()
      .then((value) => {
        factorRef.current = value.factorId
        setEnrollment(value)
      })
      .catch((err) => setLoadError(twoStepErrorText(err, 'Could Not Start the Authenticator Setup.')))
  }

  return (
    <div className="space-y-4">
      {props.intro ? <p className="text-sm text-stone-700">{props.intro}</p> : null}
      <ol className="list-decimal space-y-1 pl-5 text-sm text-stone-600">
        <li>Install Google Authenticator or Microsoft Authenticator on Your Phone.</li>
        <li>In the App, Tap Add (+) and Scan This QR Code.</li>
        <li>Enter the 6-Digit Code the App Shows for Consultancy Pro.</li>
      </ol>

      {loadError ? (
        <>
          <ErrorNote text={loadError} />
          <div className="flex justify-end">
            <Button type="button" variant="outline" className={limsOutlineBtnClass} onClick={retry}>
              Try Again
            </Button>
          </div>
        </>
      ) : !enrollment ? (
        <p className="text-sm text-stone-500" role="status">
          Preparing Your QR Code…
        </p>
      ) : (
        <>
          <div className="flex flex-col items-center gap-2">
            {enrollment.qrSrc ? (
              <img
                src={enrollment.qrSrc}
                alt="QR Code for Your Authenticator App"
                width={184}
                height={184}
                className="h-[184px] w-[184px] border border-stone-300 bg-white p-2"
              />
            ) : null}
            <button
              type="button"
              className="text-xs font-medium text-amber-800 hover:underline"
              onClick={() => setShowSecret((v) => !v)}
            >
              {showSecret ? 'Hide Setup Key' : "Can't Scan? Enter a Setup Key Instead"}
            </button>
            {showSecret || !enrollment.qrSrc ? (
              <div className="w-full space-y-1 text-center">
                <p className="text-xs text-stone-500">Setup Key (Time Based)</p>
                <p className="select-all break-all border border-stone-300 bg-stone-50 px-2 py-1.5 font-mono text-sm tracking-wider text-stone-900">
                  {enrollment.secret.replace(/(.{4})/g, '$1 ').trim()}
                </p>
              </div>
            ) : null}
          </div>
          <TwoStepCodeField id="two-step-enroll-code" value={code} onChange={setCode} onSubmit={submit} disabled={busy} />
          <ErrorNote text={error} />
        </>
      )}

      <div className="flex items-center justify-between gap-3">
        {props.secondaryAction ? (
          <button
            type="button"
            className="text-xs font-medium text-amber-800 hover:underline"
            onClick={props.secondaryAction.onClick}
          >
            {props.secondaryAction.label}
          </button>
        ) : (
          <span />
        )}
        <Button
          type="button"
          className={cn(limsPrimaryBtnClass, 'h-8 w-auto min-w-[7.5rem] px-5')}
          onClick={submit}
          disabled={!enrollment || !isSixDigitCode(code) || busy}
        >
          {busy ? 'Checking...' : 'Verify and Turn On'}
        </Button>
      </div>
    </div>
  )
}
