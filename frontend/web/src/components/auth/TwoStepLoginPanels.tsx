import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
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

/**
 * The 6-digit code as six boxes (owner, 25 Nov 2026: "Code ko 6 Digit ke Box me Banao, Code Dalte hi Auto Login ho
 * Jaye"). Typing moves to the next box, Backspace goes back, a pasted or auto-filled code (phone keypad,
 * one-time-code) fills all six, and the sixth digit calls `onComplete` so the code is checked at once.
 */
export function TwoStepCodeField(props: {
  id: string
  value: string
  onChange: (value: string) => void
  onSubmit?: () => void
  /** Called with the code when the sixth digit is entered. */
  onComplete?: (code: string) => void
  autoFocus?: boolean
  disabled?: boolean
}) {
  const { value, disabled } = props
  const boxes = useRef<Array<HTMLInputElement | null>>([])
  // The code as just typed: focus moves before React renders the new value, and the box focused must not see the old one.
  const latest = useRef(value)
  useEffect(() => {
    latest.current = value
  }, [value])
  const focusBox = (i: number) => {
    const el = boxes.current[Math.max(0, Math.min(5, i))]
    el?.focus()
    el?.select()
  }

  // A cleared code (wrong code, back from busy) starts again at the first box.
  useEffect(() => {
    if (!disabled && value === '') boxes.current[0]?.focus()
  }, [disabled, value])

  const update = (next: string) => {
    const code = next.replace(/\D/g, '').slice(0, 6)
    const before = latest.current
    latest.current = code
    props.onChange(code)
    if (code.length === 6 && code !== before) props.onComplete?.(code)
    return code
  }

  /** Digits typed, pasted or auto-filled into box i (the code has no gaps: box i takes the place it shows). */
  const put = (i: number, typed: string) => {
    const digits = typed.replace(/\D/g, '')
    if (!digits) return
    const cur = latest.current
    const at = Math.min(i, cur.length)
    const code = update(cur.slice(0, at) + digits + cur.slice(at + digits.length))
    focusBox(Math.min(at + digits.length, code.length === 6 ? 5 : code.length))
  }

  return (
    <div className="space-y-2">
      <Label htmlFor={props.id}>6-Digit Code</Label>
      <div className="flex justify-center gap-2" role="group" aria-label="6-Digit Code">
        {Array.from({ length: 6 }, (_, i) => (
          <input
            key={i}
            ref={(el) => {
              boxes.current[i] = el
            }}
            id={i === 0 ? props.id : `${props.id}-${i + 1}`}
            value={value[i] ?? ''}
            aria-label={`Digit ${i + 1} of 6`}
            inputMode="numeric"
            pattern="[0-9]*"
            // The first box takes the whole code from the phone's or browser's one-time-code autofill.
            autoComplete={i === 0 ? 'one-time-code' : 'off'}
            autoFocus={props.autoFocus && i === 0}
            disabled={disabled}
            onFocus={(e) => {
              // No gaps: a click past the code goes to the next empty box.
              if (i > latest.current.length) focusBox(latest.current.length)
              else e.currentTarget.select()
            }}
            onChange={(e) => {
              const typed = e.target.value
              // Typed next to the box's old digit: the new digit is the other one.
              const old = latest.current[i] ?? ''
              put(i, typed.length === 2 && old && typed.includes(old) ? typed.replace(old, '') : typed)
            }}
            onPaste={(e) => {
              e.preventDefault()
              put(i, e.clipboardData.getData('text'))
            }}
            onKeyDown={(e) => {
              const cur = latest.current
              if (e.key === 'Backspace') {
                e.preventDefault()
                if (cur[i]) update(cur.slice(0, i) + cur.slice(i + 1))
                else if (i > 0) {
                  update(cur.slice(0, i - 1) + cur.slice(i))
                  focusBox(i - 1)
                }
              } else if (e.key === 'ArrowLeft') {
                e.preventDefault()
                focusBox(i - 1)
              } else if (e.key === 'ArrowRight') {
                e.preventDefault()
                focusBox(Math.min(i + 1, cur.length))
              } else if (e.key === 'Enter' && isSixDigitCode(cur)) {
                props.onSubmit?.()
              }
            }}
            className={cn(
              limsFieldClass,
              'h-12 w-11 px-0 text-center font-mono text-xl font-semibold sm:w-12',
              value[i] && 'border-amber-600',
            )}
          />
        ))}
      </div>
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

  const submit = async (value = code) => {
    if (!isSixDigitCode(value) || busy) return
    setBusy(true)
    setError(null)
    try {
      await verifyTwoStepCode(value)
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
      <TwoStepCodeField
        id="two-step-code"
        value={code}
        onChange={setCode}
        onSubmit={() => void submit()}
        onComplete={(value) => void submit(value)}
        autoFocus
        disabled={busy}
      />
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
          onClick={() => void submit()}
          disabled={!isSixDigitCode(code) || busy}
        >
          {busy ? 'Checking…' : 'Verify'}
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

  const submit = async (value = code) => {
    if (!enrollment || !isSixDigitCode(value) || busy) return
    setBusy(true)
    setError(null)
    try {
      await finishTotpEnrollment(enrollment.factorId, value)
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
          <TwoStepCodeField
            id="two-step-enroll-code"
            value={code}
            onChange={setCode}
            onSubmit={() => void submit()}
            onComplete={(value) => void submit(value)}
            disabled={busy}
          />
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
          onClick={() => void submit()}
          disabled={!enrollment || !isSixDigitCode(code) || busy}
        >
          {busy ? 'Checking…' : 'Verify and Turn On'}
        </Button>
      </div>
    </div>
  )
}
