import { useEffect, useState } from 'react'
import { ShieldCheck } from 'lucide-react'
import type { Factor } from '@supabase/supabase-js'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useConfirmDialog } from '@/components/ui/useConfirmDialog'
import { TwoStepEnrollPanel } from '@/components/auth/TwoStepLoginPanels'
import { readTwoStepState, removeOwnTotp, twoStepErrorText } from '@/features/auth/mfaApi'
import { useAuth } from '@/hooks/useAuth'
import {
  limsDarkBarGlowStyle,
  limsDeleteBtnClass,
  limsDialogClass,
  limsOutlineBtnClass,
  limsPrimaryBtnClass,
  limsRegistryFormClass,
} from '@/lib/limsThemeUi'
import { cn, formatDateDmyMmm } from '@/lib/utils'

type TwoStepLoginDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
}

/** "Two-Step Login (Authenticator App)" from the user menu: set up, see status, remove. */
export function TwoStepLoginDialog(props: TwoStepLoginDialogProps) {
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent persistOnFocusLoss className={cn(limsDialogClass, 'max-w-md')}>
        {/* Mounted only while open, so every opening re-reads the status. */}
        <TwoStepLoginPanel {...props} />
      </DialogContent>
    </Dialog>
  )
}

type View = 'loading' | 'on' | 'off' | 'enroll' | 'error'

function TwoStepLoginPanel(props: TwoStepLoginDialogProps) {
  const { role } = useAuth()
  const isAdmin = role === 'admin'
  const [view, setView] = useState<View>('loading')
  const [factor, setFactor] = useState<Factor | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [confirm, confirmDialog] = useConfirmDialog()

  const load = async () => {
    setError(null)
    try {
      const state = await readTwoStepState()
      const first = state.verifiedTotp[0] ?? null
      setFactor(first)
      setView(first ? 'on' : 'off')
    } catch (err) {
      setError(twoStepErrorText(err, 'Could Not Read Your Two-Step Login Status.'))
      setView('error')
    }
  }

  useEffect(() => {
    void load()
  }, [])

  const remove = async () => {
    if (!factor) return
    const ok = await confirm(
      isAdmin
        ? 'Remove the Authenticator From Your Account? Admin Accounts Must Use Two-Step Login, So You Will Be Asked to Set Up a New One Right Away.'
        : 'Remove the Authenticator From Your Account? Sign-In Will Then Need Only Your Password.',
      { title: 'Remove Authenticator', confirmLabel: 'Remove', destructive: true },
    )
    if (!ok) return
    setBusy(true)
    setError(null)
    try {
      await removeOwnTotp(factor.id)
      setNotice('Authenticator Removed.')
      setFactor(null)
      setView('off')
    } catch (err) {
      setError(twoStepErrorText(err, 'Could Not Remove the Authenticator.'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <div className="relative overflow-hidden bg-gradient-to-br from-stone-800 via-stone-900 to-stone-950 px-4 py-2.5 text-white">
        <div className="pointer-events-none absolute inset-0 opacity-[0.18]" style={limsDarkBarGlowStyle} />
        <div className="absolute bottom-0 left-0 h-[2px] w-full bg-gradient-to-r from-amber-500 via-amber-300 to-transparent" />
        <DialogHeader className="relative pr-10 text-left">
          <DialogTitle className="flex items-center gap-2 text-base font-semibold tracking-tight text-white">
            <ShieldCheck size={16} className="text-amber-300" />
            Two-Step Login (Authenticator App)
          </DialogTitle>
        </DialogHeader>
      </div>

      <div className={cn(limsRegistryFormClass, 'space-y-4 bg-gradient-to-b from-stone-100/80 to-white px-4 py-4')}>
        <DialogDescription className="text-sm text-stone-700">
          Sign-In Asks for Your Password and a 6-Digit Code From Google Authenticator or Microsoft Authenticator
          on Your Phone. No SMS Is Used.
        </DialogDescription>

        {notice && (
          <p className="border-l-2 border-emerald-600 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{notice}</p>
        )}
        {error && (
          <p className="border-l-2 border-destructive bg-destructive/5 px-3 py-2 text-sm text-destructive">{error}</p>
        )}

        {view === 'loading' && (
          <p className="text-sm text-stone-500" role="status">
            Checking…
          </p>
        )}

        {view === 'on' && factor && (
          <div className="border border-emerald-600/40 bg-emerald-50 px-3 py-2.5">
            <p className="text-sm font-semibold text-emerald-800">Two-Step Login Is On</p>
            {formatDateDmyMmm(factor.created_at) ? (
              <p className="text-xs text-emerald-800/80">Authenticator Added on {formatDateDmyMmm(factor.created_at)}</p>
            ) : null}
            <p className="mt-1 text-xs text-stone-600">
              Lost or Changed Your Phone? Ask an Admin to Reset Your Two-Step Login, Then Set It Up Again.
            </p>
          </div>
        )}

        {view === 'off' && (
          <div className="border border-amber-500/50 bg-amber-50 px-3 py-2.5">
            <p className="text-sm font-semibold text-amber-900">Two-Step Login Is Off</p>
            <p className="text-xs text-amber-900/80">
              {isAdmin ? 'Admin Accounts Must Turn It On.' : 'Turn It On to Protect Your Account if Your Password Leaks.'}
            </p>
          </div>
        )}

        {view === 'enroll' && (
          <TwoStepEnrollPanel
            onEnrolled={() => {
              setNotice('Two-Step Login Is Now On.')
              void load()
            }}
            secondaryAction={{ label: 'Cancel', onClick: () => setView('off') }}
          />
        )}
      </div>

      {view !== 'enroll' && (
        <DialogFooter className="gap-2 border-t border-stone-200 bg-stone-50 px-4 py-3 sm:justify-end">
          {view === 'on' && (
            <Button type="button" className={limsDeleteBtnClass} onClick={remove} disabled={busy}>
              {busy ? 'Removing…' : 'Remove Authenticator'}
            </Button>
          )}
          {view === 'error' && (
            <Button type="button" variant="outline" className={limsOutlineBtnClass} onClick={() => void load()}>
              Try Again
            </Button>
          )}
          {view === 'off' && (
            <Button
              type="button"
              className={cn('min-w-[140px]', limsPrimaryBtnClass)}
              onClick={() => {
                setNotice(null)
                setView('enroll')
              }}
            >
              Set Up Authenticator
            </Button>
          )}
          <Button
            type="button"
            variant="outline"
            className={limsOutlineBtnClass}
            onClick={() => props.onOpenChange(false)}
          >
            Close
          </Button>
        </DialogFooter>
      )}
      {confirmDialog}
    </>
  )
}
