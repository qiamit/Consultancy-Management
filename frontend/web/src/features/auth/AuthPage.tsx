import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Award, Eye, EyeOff, FlaskConical, Ruler, ShieldCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { signIn, useAuth } from '@/hooks/useAuth'
import {
  limsDarkBarAccentClass,
  limsDarkBarClass,
  limsDarkBarGlowStyle,
  limsFieldClass,
  limsPageShellClass,
  limsPanelClass,
  limsPrimaryBtnClass,
  limsRegistryFormClass,
} from '@/lib/limsThemeUi'
import { cn } from '@/lib/utils'
import { publicHeroPatternStyle } from '@/features/public-site/PublicChrome'
import {
  PUBLIC_EMAIL,
  PUBLIC_LAB_NAME,
  PUBLIC_NABL_CALIBRATION,
  PUBLIC_NABL_TESTING,
  PUBLIC_TAGLINE_ACCENT,
  PUBLIC_TAGLINE_LEAD,
} from '@/features/public-site/publicNav'

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

  const canSubmit = useMemo(() => {
    return Boolean(email.trim() && password.trim())
  }, [email, password])

  const goAfterAuth = () => {
    if (redirectedRef.current) return
    redirectedRef.current = true
    navigate('/', { replace: true })
  }

  useEffect(() => {
    if (authLoading || !user) return
    goAfterAuth()
  }, [authLoading, user, navigate])

  const handleSubmit = async () => {
    setLoading(true)
    setError(null)

    try {
      const { error: loginError } = await signIn(email.trim(), password)
      if (loginError) throw loginError
      goAfterAuth()
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
            `Unable to reach Railway API host: ${host}\n` +
            `Check VITE_SUPABASE_URL in your .env and verify the Railway api service is running.\n` +
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

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && canSubmit && !loading) {
      void handleSubmit()
    }
  }

  return (
    <div className="grid flex-1 lg:grid-cols-[25%_50%_25%]">
      <aside className={cn(limsDarkBarClass, 'order-2 flex h-full flex-col p-0 lg:order-1')}>
        <div className="pointer-events-none absolute inset-0 opacity-[0.22]" style={limsDarkBarGlowStyle} />
        <div className="pointer-events-none absolute inset-0 opacity-[0.16]" style={publicHeroPatternStyle} />
        <div className={limsDarkBarAccentClass} />
        <div className="absolute right-0 top-0 hidden h-full w-[2px] bg-gradient-to-b from-amber-500 via-amber-300 to-transparent lg:block" />

        <div className="relative flex min-h-[220px] flex-1 flex-col justify-center px-4 py-6 text-center sm:px-5">
          <p className="mb-3 inline-flex items-center justify-center gap-2 self-center border border-amber-500/40 bg-stone-900/60 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-amber-100">
            <Award size={14} className="shrink-0 text-amber-300" />
            About the Company
          </p>
          <h1 className="text-xl font-extrabold tracking-tight text-white sm:text-2xl">
            {PUBLIC_TAGLINE_LEAD} <span className="text-amber-300">{PUBLIC_TAGLINE_ACCENT}</span>
          </h1>
          <p className="mt-3 text-xs leading-relaxed text-stone-300 sm:text-sm">
            {PUBLIC_LAB_NAME} (QIRLPL) is a NABL-accredited testing and calibration laboratory in Raipur, Chhattisgarh.
            We deliver independent, traceable results for manufacturing, construction and quality-conscious industry.
          </p>
        </div>

        <div className="relative h-px shrink-0 bg-gradient-to-r from-amber-500 via-amber-300 to-transparent" />

        <div className="relative flex min-h-[220px] flex-1 flex-col justify-center px-4 py-6 text-center sm:px-5">
          <p className="mb-3 inline-flex items-center justify-center gap-2 self-center border border-amber-500/40 bg-stone-900/60 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-amber-100">
            <Ruler size={14} className="shrink-0 text-amber-300" />
            Calibration
          </p>
          <p className="text-sm font-semibold text-white">ISO 17025 Recognized Calibration</p>
          <p className="mt-1 text-[11px] font-medium tracking-wide text-amber-200">{PUBLIC_NABL_CALIBRATION}</p>
          <p className="mt-3 text-xs leading-relaxed text-stone-300 sm:text-sm">
            Traceable calibration of measuring equipment with certificates for quality systems and audits. All
            calibrations follow ISO/IEC 17025:2017 and national / international measurement standards, with efficient
            turnaround so instruments return to service quickly.
          </p>
        </div>
      </aside>

      <div
        className={cn(
          limsPageShellClass,
          'order-1 flex max-w-none min-w-0 flex-col items-center justify-center gap-8 lg:order-2',
        )}
      >
        <div className="max-w-lg px-2 text-center">
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-amber-800">QIRLPL Laboratory</p>
          <p className="mt-2 text-2xl font-extrabold tracking-tight text-stone-900 sm:text-3xl">
            Precision You Can Prove
          </p>
          <p className="mt-2 text-sm leading-relaxed text-stone-600">
            Independent Testing and Calibration — Accurate, Traceable and Audit-Ready.
          </p>
          <div className="mx-auto mt-3 h-[2px] w-14 bg-amber-600" />
        </div>

        <div className="w-full max-w-md">
          <div className={limsPanelClass}>
            <div className={cn(limsDarkBarClass, 'px-5 py-3.5')}>
              <div className="pointer-events-none absolute inset-0 opacity-[0.18]" style={limsDarkBarGlowStyle} />
              <div className={limsDarkBarAccentClass} />
              <div className="relative flex items-center justify-center gap-2">
                <ShieldCheck size={18} className="text-amber-300" />
                <h2 className="text-lg font-semibold tracking-tight text-white">Sign In</h2>
              </div>
            </div>

            <div className={cn(limsRegistryFormClass, 'space-y-5 p-5')}>
              <div className="space-y-4" onKeyDown={handleKeyDown}>
                <div className="space-y-2">
                  <Label htmlFor="email">Email Address</Label>
                  <Input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder={PUBLIC_EMAIL}
                    autoComplete="email"
                    autoFocus
                    className={limsFieldClass}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="password">Password</Label>
                  <div className="relative">
                    <Input
                      id="password"
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Enter Your Password"
                      autoComplete="current-password"
                      className={cn(limsFieldClass, 'pr-10')}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-500 transition-colors hover:text-stone-800"
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                      tabIndex={-1}
                    >
                      {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>
              </div>

              {error && (
                <div className="rounded-none border border-red-500/40 bg-red-50 px-3 py-2.5">
                  <p className="whitespace-pre-line text-sm text-red-700">{error}</p>
                </div>
              )}

              <div className="flex justify-end">
                <Button
                  type="button"
                  className={cn(limsPrimaryBtnClass, 'h-8 w-auto min-w-[7.5rem] px-5')}
                  onClick={handleSubmit}
                  disabled={!canSubmit || loading}
                >
                  {loading ? 'Signing in...' : 'Sign In'}
                </Button>
              </div>

              <p className="text-center text-xs text-stone-500">
                For Login Access Issues, Contact your Laboratory Director
                <br />
                or Write to{' '}
                <a href={`mailto:${PUBLIC_EMAIL}`} className="font-medium text-amber-800 hover:underline">
                  {PUBLIC_EMAIL}
                </a>
              </p>
            </div>
          </div>
        </div>

        <div className="w-full max-w-lg px-2 text-center">
          <div className="grid gap-2 sm:grid-cols-3">
            {['Traceable Results', 'Audit-Ready Reports', 'Industry Trusted'].map((slogan) => (
              <p
                key={slogan}
                className="border border-stone-500 bg-stone-50 px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-stone-700"
              >
                {slogan}
              </p>
            ))}
          </div>
          <p className="mt-4 text-sm font-medium text-stone-700">Measured with Care. Reported with Confidence.</p>
        </div>
      </div>

      <aside className={cn(limsDarkBarClass, 'order-3 flex h-full flex-col p-0')}>
        <div className="pointer-events-none absolute inset-0 opacity-[0.22]" style={limsDarkBarGlowStyle} />
        <div className="pointer-events-none absolute inset-0 opacity-[0.16]" style={publicHeroPatternStyle} />
        <div className={limsDarkBarAccentClass} />
        <div className="absolute left-0 top-0 hidden h-full w-[2px] bg-gradient-to-b from-amber-500 via-amber-300 to-transparent lg:block" />

        <div className="relative z-[1] flex h-full min-h-[280px] flex-col items-center justify-center px-4 py-8 text-center sm:px-6">
          <p className="mb-4 inline-flex items-center justify-center gap-2 border border-amber-500/40 bg-stone-900/60 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-amber-100">
            <FlaskConical size={14} className="shrink-0 text-amber-300" />
            Testing
          </p>
          <p className="text-lg font-bold leading-snug text-white sm:text-xl">ISO 17025 Recognized Testing</p>
          <p className="mt-2 text-[11px] font-medium tracking-wide text-amber-200">{PUBLIC_NABL_TESTING}</p>
          <p className="mt-4 max-w-sm text-xs leading-relaxed text-stone-300 sm:text-sm">
            Independent testing of metals, TMT bars, construction materials, plywood and textiles — with full
            traceability for compliance and quality assurance. BIS authorized testing centre.
          </p>
        </div>
      </aside>
    </div>
  )
}
