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
import { newPasswordProblem, PASSWORD_MIN_LENGTH } from '@/features/auth/passwordApi'
import {
  limsDarkBarGlowStyle,
  limsDialogClass,
  limsOutlineBtnClass,
  limsPrimaryBtnClass,
  limsRegistryFormClass,
} from '@/lib/limsThemeUi'
import { cn } from '@/lib/utils'
import { setTeamUserPassword } from './userFunctionsApi'
import type { UserAccount } from './types'

const sidebarCenteredOverlayClass = 'lg:inset-y-0 lg:left-[268px] lg:right-0 lg:w-auto'
const sidebarCenteredDialogPositionClass =
  'lg:left-[calc(268px+(100vw-268px)/2)] md:top-1/2 md:-translate-x-1/2 md:-translate-y-1/2'

type SetPasswordDialogProps = {
  user: UserAccount | null
  isSelf: boolean
  onOpenChange: (open: boolean) => void
}

/** Admin-only "Set / reset password" for a team member (functions /set-user-password). */
export function SetPasswordDialog(props: SetPasswordDialogProps) {
  return (
    <Dialog open={props.user != null} onOpenChange={props.onOpenChange}>
      <DialogContent
        persistOnFocusLoss
        overlayClassName={sidebarCenteredOverlayClass}
        className={cn(limsDialogClass, 'max-w-md', sidebarCenteredDialogPositionClass)}
      >
        {/* Mounted only while open (and per user), so every opening starts with empty fields. */}
        {props.user ? <SetPasswordPanel key={props.user.id} {...props} user={props.user} /> : null}
      </DialogContent>
    </Dialog>
  )
}

function SetPasswordPanel(props: SetPasswordDialogProps & { user: UserAccount }) {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [mustChange, setMustChange] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  const handleSave = async () => {
    setError(null)
    const problem = newPasswordProblem(password, confirm)
    if (problem) {
      setError(problem)
      return
    }
    setSaving(true)
    try {
      await setTeamUserPassword(props.user.id, password, props.isSelf ? false : mustChange)
      setDone(true)
      setPassword('')
      setConfirm('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to set the password.')
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
            Set Password
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
          {props.user.name} ({props.user.email})
        </DialogDescription>

        {done ? (
          <p className="border-l-2 border-emerald-600 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
            Password set.
            {props.isSelf
              ? ''
              : ' The user has been logged out everywhere. Share the new password with them privately.'}
          </p>
        ) : (
          <>
            {error && (
              <p className="border-l-2 border-destructive bg-destructive/5 px-3 py-2 text-sm text-destructive">
                {error}
              </p>
            )}
            <div className="space-y-2">
              <Label htmlFor="admin-new-password">New Password</Label>
              <PasswordInput
                id="admin-new-password"
                value={password}
                onChange={setPassword}
                placeholder={`At least ${PASSWORD_MIN_LENGTH} characters`}
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="admin-confirm-password">Confirm Password</Label>
              <PasswordInput id="admin-confirm-password" value={confirm} onChange={setConfirm} />
            </div>
            {!props.isSelf && (
              <label className="flex items-start gap-2 text-sm text-stone-700">
                <input
                  type="checkbox"
                  className="mt-0.5 h-4 w-4"
                  checked={mustChange}
                  onChange={(e) => setMustChange(e.target.checked)}
                />
                <span>User Must Choose a New Password at Next Login</span>
              </label>
            )}
          </>
        )}
      </div>

      <DialogFooter className="gap-2 border-t border-stone-200 bg-stone-50 px-4 py-3 sm:justify-end">
        <Button
          type="button"
          variant="outline"
          className={limsOutlineBtnClass}
          onClick={() => props.onOpenChange(false)}
        >
          {done ? 'Close' : 'Cancel'}
        </Button>
        {!done && (
          <Button
            type="button"
            className={cn('min-w-[140px]', limsPrimaryBtnClass)}
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? 'Saving…' : 'Set password'}
          </Button>
        )}
      </DialogFooter>
    </>
  )
}
