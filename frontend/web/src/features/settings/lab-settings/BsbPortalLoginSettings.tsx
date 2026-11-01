import { useEffect, useState } from 'react'
import { KeyRound, Save, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { getCompanyPortalLoginInfo, saveCompanyPortalLogin } from './companyPortalLoginApi'

const btn =
  'inline-flex h-9 shrink-0 items-center gap-1.5 rounded-none border px-3 text-xs font-semibold disabled:opacity-50'

/**
 * Company-wide BIS Portal (BSB Edge) login. The extension fills it on standardsbis.bsbedge.com from the BIS Portal
 * Login button of every BIS window; the user only types the captcha. The password is never shown again after saving.
 */
export function BsbPortalLoginSettings() {
  const [userId, setUserId] = useState('')
  const [password, setPassword] = useState('')
  const [passwordSet, setPasswordSet] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    void getCompanyPortalLoginInfo('bsb')
      .then((info) => {
        if (cancelled) return
        setUserId(info.userId)
        setPasswordSet(info.passwordSet)
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Could Not Load the BIS Portal Login.')
      })
    return () => {
      cancelled = true
    }
  }, [])

  const save = async (nextPassword: string | null) => {
    setBusy(true)
    try {
      const saved = await saveCompanyPortalLogin('bsb', userId, nextPassword)
      setPasswordSet(saved)
      setPassword('')
      toast.success(nextPassword === '' ? 'BIS Portal Password Removed' : 'BIS Portal Login Saved')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could Not Save the BIS Portal Login.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mt-6 space-y-2 border-t border-stone-300 pt-5">
      <Label className="flex items-center gap-1.5">
        <KeyRound className="h-4 w-4 text-amber-800" aria-hidden />
        BIS Portal Login (Standardsbis.bsbedge.com)
      </Label>
      {error ? <p className="text-xs text-red-700">{error}</p> : null}
      <div className="grid grid-cols-1 items-end gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
        <div className="min-w-0 space-y-1">
          <Label htmlFor="bsb-user-id" className="text-xs">User ID / Registered Email</Label>
          <Input
            id="bsb-user-id"
            autoComplete="off"
            placeholder="User ID / Registered Email"
            value={userId}
            disabled={busy || Boolean(error)}
            onChange={(e) => setUserId(e.target.value)}
          />
        </div>
        <div className="min-w-0 space-y-1">
          <Label htmlFor="bsb-password" className="text-xs">Password {passwordSet ? '(Saved)' : '(Not Saved)'}</Label>
          <Input
            id="bsb-password"
            type="password"
            autoComplete="new-password"
            placeholder={passwordSet ? 'Leave Blank to Keep the Saved Password' : 'Password'}
            value={password}
            disabled={busy || Boolean(error)}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            className={`${btn} border-amber-700 bg-amber-700 text-white hover:bg-amber-800`}
            disabled={busy || Boolean(error) || !userId.trim()}
            onClick={() => void save(password ? password : null)}
          >
            <Save className="h-3.5 w-3.5" aria-hidden /> Save Login
          </button>
          {passwordSet ? (
            <button
              type="button"
              className={`${btn} border-stone-400 bg-white text-red-700 hover:bg-red-50`}
              disabled={busy || Boolean(error)}
              title="Remove the Saved Password"
              onClick={() => void save('')}
            >
              <Trash2 className="h-3.5 w-3.5" aria-hidden />
            </button>
          ) : null}
        </div>
      </div>
    </div>
  )
}
