import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useAuth, signIn } from '@/hooks/useAuth'
import {
  limsDarkBarGlowStyle,
  limsDialogClass,
  limsFieldClass,
  limsPrimaryBtnClass,
} from '@/lib/limsThemeUi'
import { cn } from '@/lib/utils'

export function ConfirmLoginPasswordDialog({
  open,
  onOpenChange,
  title = 'Confirm Password',
  confirmLabel = 'Confirm',
  onConfirmed,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title?: string
  confirmLabel?: string
  onConfirmed: () => void
}) {
  const { user } = useAuth()
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [verifying, setVerifying] = useState(false)

  useEffect(() => {
    if (!open) {
      setPassword('')
      setError(null)
      setVerifying(false)
    }
  }, [open])

  const handleConfirm = async () => {
    const email = user?.email?.trim()
    if (!email) {
      setError('No logged-in user email found. Please sign in again.')
      return
    }
    if (!password.trim()) {
      setError('Password is required.')
      return
    }

    setVerifying(true)
    setError(null)
    try {
      const { error: authError } = await signIn(email, password)
      if (authError) {
        setError(authError.message || 'Incorrect password.')
        return
      }
      onOpenChange(false)
      onConfirmed()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not verify password.')
    } finally {
      setVerifying(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        layer="nested"
        className={cn(
          limsDialogClass,
          'max-w-md p-0',
          'lg:left-[calc(268px+(100vw-268px)/2)] md:top-1/2 md:-translate-x-1/2 md:-translate-y-1/2',
        )}
        overlayClassName="lg:inset-y-0 lg:left-[268px] lg:right-0 lg:w-auto"
        portalClassName="lg:left-[268px]"
        aria-describedby={undefined}
      >
        <div className="relative overflow-hidden bg-gradient-to-br from-stone-800 via-stone-900 to-stone-950 px-4 py-2.5 text-white">
          <div className="pointer-events-none absolute inset-0 opacity-[0.18]" style={limsDarkBarGlowStyle} />
          <div className="absolute bottom-0 left-0 h-[2px] w-full bg-gradient-to-r from-amber-500 via-amber-300 to-transparent" />
          <DialogHeader className="relative pr-10 text-left">
            <DialogTitle className="text-base font-semibold tracking-tight text-white">{title}</DialogTitle>
          </DialogHeader>
        </div>

        <div className="space-y-4 bg-[#f7f3eb] px-4 py-4">
          <div className="space-y-2">
            <Label
              htmlFor="confirm-login-password"
              className="text-[11px] font-semibold uppercase tracking-wide text-stone-600"
            >
              Password
            </Label>
            <Input
              id="confirm-login-password"
              type="password"
              autoComplete="current-password"
              autoFocus
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  void handleConfirm()
                }
              }}
              placeholder="Enter Your Password"
              className={limsFieldClass}
              disabled={verifying}
            />
          </div>
          {error ? <p className="text-sm text-red-700">{error}</p> : null}
        </div>

        <DialogFooter className="gap-2 border-t border-stone-700 bg-gradient-to-br from-stone-800 via-stone-900 to-stone-950 px-4 py-3 sm:justify-end">
          <Button
            type="button"
            className={limsPrimaryBtnClass}
            onClick={() => void handleConfirm()}
            disabled={verifying}
          >
            {verifying ? 'Verifying…' : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
