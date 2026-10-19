import { useState } from 'react'
import { KeyRound } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { PasswordInput } from '@/components/auth/PasswordInput'
import {
  changeOwnPassword,
  newPasswordProblem,
  PASSWORD_MIN_LENGTH,
  setOwnPassword,
} from '@/features/auth/passwordApi'
import {
  limsDarkBarGlowStyle,
  limsDialogClass,
  limsOutlineBtnClass,
  limsPrimaryBtnClass,
  limsRegistryFormClass,
} from '@/lib/limsThemeUi'
import { cn } from '@/lib/utils'

type ChangePasswordDialogProps = {
  /**
   * self   = "Change my password" from the user menu; the current password is re-entered.
   * forced = must_change_password after an admin set the password; cannot be dismissed.
   */
  mode: 'self' | 'forced'
  open: boolean
  email: string
  onOpenChange: (open: boolean) => void
  onChanged: () => void
  onLogOut?: () => void
}

export function ChangePasswordDialog(props: ChangePasswordDialogProps) {
  const forced = props.mode === 'forced'
  return (
    <Dialog
      open={props.open}
      onOpenChange={(open) => {
        if (forced && !open) return
        props.onOpenChange(open)
      }}
    >
      <DialogContent
        persistOnFocusLoss
        showCloseButton={!forced}
        className={cn(limsDialogClass, 'max-w-md')}
        onEscapeKeyDown={(e) => {
          if (forced) e.preventDefault()
        }}
        onInteractOutside={(e) => {
          if (forced) e.preventDefault()
        }}
      >
        {/* Mounted only while open, so every opening starts with empty fields. */}
        <ChangePasswordPanel {...props} />
      </DialogContent>
    </Dialog>
  )
}

function ChangePasswordPanel(props: ChangePasswordDialogProps) {
  const forced = props.mode === 'forced'
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  const handleSave = async () => {
    setError(null)
    if (!forced && !currentPassword) {
      setError('Enter your current password.')
      return
    }
    const problem = newPasswordProblem(newPassword, confirmPassword)
    if (problem) {
      setError(problem)
      return
    }
    setSaving(true)
    try {
      if (forced) await setOwnPassword(newPassword)
      else await changeOwnPassword(props.email, currentPassword, newPassword)
      setDone(true)
      props.onChanged()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to change the password.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <div className="relative overflow-hidden bg-gradient-to-br from-stone-800 via-stone-900 to-stone-950 px-4 py-2.5 text-white">
        <div className="pointer-events-none absolute inset-0 opacity-[0.18]" style={limsDarkBarGlowStyle} />
        <div className="absolute bottom-0 left-0 h-[2px] w-full bg-gradient-to-r from-amber-500 via-amber-300 to-transparent" />
        <DialogHeader className="relative pr-10 text-left">
          <DialogTitle className="flex items-center gap-2 text-base font-semibold tracking-tight text-white">
            <KeyRound size={16} className="text-amber-300" />
            {forced ? 'Set a new password' : 'Change password'}
          </DialogTitle>
        </DialogHeader>
      </div>

      <div
        className={cn(
          limsRegistryFormClass,
          'space-y-4 bg-gradient-to-b from-stone-100/80 to-white px-4 py-4',
        )}
      >
        <DialogDescription className="text-sm text-stone-700">
          {forced
            ? 'An admin set your password. Choose your own password to continue.'
            : `Signed in as ${props.email || 'you'}.`}
        </DialogDescription>

        {done ? (
          <p className="border-l-2 border-emerald-600 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
            Password changed.
          </p>
        ) : (
          <>
            {error && (
              <p className="border-l-2 border-destructive bg-destructive/5 px-3 py-2 text-sm text-destructive">
                {error}
              </p>
            )}
            {!forced && (
              <div className="space-y-2">
                <Label htmlFor="current-password">Current password</Label>
                <PasswordInput
                  id="current-password"
                  value={currentPassword}
                  onChange={setCurrentPassword}
                  autoComplete="current-password"
                  autoFocus
                />
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="new-password">New password</Label>
              <PasswordInput
                id="new-password"
                value={newPassword}
                onChange={setNewPassword}
                placeholder={`At least ${PASSWORD_MIN_LENGTH} characters`}
                autoFocus={forced}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirm-password">Confirm new password</Label>
              <PasswordInput id="confirm-password" value={confirmPassword} onChange={setConfirmPassword} />
            </div>
          </>
        )}
      </div>

      <DialogFooter className="gap-2 border-t border-stone-200 bg-stone-50 px-4 py-3 sm:justify-end">
        {done ? (
          <Button
            type="button"
            className={cn('min-w-[120px]', limsPrimaryBtnClass)}
            onClick={() => props.onOpenChange(false)}
          >
            Close
          </Button>
        ) : (
          <>
            {forced ? (
              props.onLogOut ? (
                <Button
                  type="button"
                  variant="outline"
                  className={limsOutlineBtnClass}
                  onClick={props.onLogOut}
                >
                  Log out
                </Button>
              ) : null
            ) : (
              <Button
                type="button"
                variant="outline"
                className={limsOutlineBtnClass}
                onClick={() => props.onOpenChange(false)}
              >
                Cancel
              </Button>
            )}
            <Button
              type="button"
              className={cn('min-w-[140px]', limsPrimaryBtnClass)}
              onClick={handleSave}
              disabled={saving}
            >
              {saving ? 'Saving…' : 'Save password'}
            </Button>
          </>
        )}
      </DialogFooter>
    </>
  )
}
