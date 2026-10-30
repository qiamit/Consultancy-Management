import { useCallback, useEffect, useState } from 'react'
import { Loader2, Mail, Power, Send, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useConfirmDialog } from '@/components/ui/useConfirmDialog'
import { limsDarkBarGlowStyle, limsDialogClass, limsOutlineBtnClass, limsPrimaryBtnClass } from '@/lib/limsThemeUi'
import { cn } from '@/lib/utils'
import {
  inviteCustomer,
  listClientLicences,
  listLicenceFiles,
  listPortalLogins,
  removeCustomerLogin,
  resendCustomerInvite,
  setFileShared,
  setLicenceAccess,
  setLoginActive,
  type PortalClientLicence,
  type PortalLicenceFile,
  type PortalLogin,
} from './customerPortalAdminApi'

const sectionTitle = 'bg-stone-800 px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.14em] text-amber-200'
const checkCls = 'h-4 w-4 rounded-none border-stone-500 text-amber-700'
const smallBtn = cn(limsOutlineBtnClass, 'h-8 gap-1 px-2 text-xs')

function errText(err: unknown, fallback: string) {
  return err instanceof Error ? err.message : fallback
}

/**
 * Customer Portal for one client (admin only): invite logins, choose the licences each login sees, switch logins
 * off, and choose which licence files are shown to the customer. Customers only ever view; nothing here lets them edit.
 */
export function CustomerPortalDialog({
  client,
  onOpenChange,
}: {
  client: { id: string; company_name: string } | null
  onOpenChange: (open: boolean) => void
}) {
  const [confirm, confirmDialog] = useConfirmDialog()
  const [licences, setLicences] = useState<PortalClientLicence[]>([])
  const [logins, setLogins] = useState<PortalLogin[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [filesFor, setFilesFor] = useState('')
  // Files of one licence; shown only while they belong to the licence picked in the list.
  const [filesOf, setFilesOf] = useState<{ licenceId: string; list: PortalLicenceFile[] } | null>(null)
  const files = filesOf && filesOf.licenceId === filesFor ? filesOf.list : null

  const clientId = client?.id ?? ''

  const load = useCallback(
    () =>
      Promise.all([listClientLicences(clientId), listPortalLogins(clientId)])
        .then(([l, u]) => {
          setLicences(l)
          setLogins(u)
          setPicked((prev) => (prev.size ? prev : new Set(l.map((x) => x.id))))
          setFilesFor((prev) => prev || l[0]?.id || '')
        })
        .catch((err: unknown) => toast.error(errText(err, 'Could not load the Customer Portal settings')))
        .finally(() => setLoading(false)),
    [clientId],
  )

  // The dialog is keyed by client, so its fields start empty for every client.
  useEffect(() => {
    if (clientId) void load()
  }, [clientId, load])

  useEffect(() => {
    if (!filesFor) return
    let cancelled = false
    void listLicenceFiles(filesFor)
      .then((list) => !cancelled && setFilesOf({ licenceId: filesFor, list }))
      .catch((err: unknown) => !cancelled && toast.error(errText(err, 'Could not load the files')))
    return () => {
      cancelled = true
    }
  }, [filesFor])

  const run = async (key: string, action: () => Promise<void>, done?: string) => {
    setBusy(key)
    try {
      await action()
      if (done) toast.success(done)
      await load()
    } catch (err) {
      toast.error(errText(err, 'Action failed'))
    } finally {
      setBusy(null)
    }
  }

  const sendInvite = () =>
    run(
      'invite',
      async () => {
        if (!email.trim()) throw new Error('Enter the Email')
        if (picked.size === 0) throw new Error('Select at Least One Licence')
        await inviteCustomer({ email: email.trim(), full_name: name.trim(), client_id: clientId, project_ids: [...picked] })
        setName('')
        setEmail('')
      },
      'Invite Sent',
    )

  const toggleFile = async (file: PortalLicenceFile) => {
    setBusy(`file:${file.id}`)
    try {
      await setFileShared(file.id, !file.customer_visible)
      setFilesOf((prev) =>
        prev ? { ...prev, list: prev.list.map((f) => (f.id === file.id ? { ...f, customer_visible: !f.customer_visible } : f)) } : prev,
      )
    } catch (err) {
      toast.error(errText(err, 'Could not update the file'))
    } finally {
      setBusy(null)
    }
  }

  return (
    <Dialog open={client != null} onOpenChange={onOpenChange}>
      <DialogContent aria-describedby={undefined} className={cn(limsDialogClass, 'flex max-h-[90dvh] w-[min(56rem,calc(100vw-1.5rem))] max-w-none flex-col gap-0 overflow-hidden bg-white p-0')}>
        {confirmDialog}
        <div className="relative shrink-0 overflow-hidden bg-gradient-to-br from-stone-800 via-stone-900 to-stone-950 px-4 py-2.5 text-white">
          <div className="pointer-events-none absolute inset-0 opacity-[0.18]" style={limsDarkBarGlowStyle} />
          <div className="absolute bottom-0 left-0 h-[2px] w-full bg-gradient-to-r from-amber-500 via-amber-300 to-transparent" />
          <DialogHeader className="relative pr-10 text-left">
            <DialogTitle className="truncate text-base font-semibold tracking-tight text-white">Customer Portal — {client?.company_name}</DialogTitle>
          </DialogHeader>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto bg-[#fffcf7] p-4">
          {loading && licences.length === 0 ? (
            <p className="flex items-center gap-2 text-sm text-stone-600"><Loader2 size={16} className="animate-spin" aria-hidden /> Loading…</p>
          ) : licences.length === 0 ? (
            <p className="border border-stone-300 bg-white px-3 py-4 text-sm text-stone-600">This client has no BIS licence yet. Add a licence first.</p>
          ) : (
            <>
              <section className="border border-stone-300 bg-white">
                <h3 className={sectionTitle}>Customer Logins</h3>
                {logins.length === 0 ? (
                  <p className="px-3 py-3 text-sm text-stone-600">No login yet. Invite one below.</p>
                ) : (
                  <ul className="divide-y divide-stone-200">
                    {logins.map((u) => (
                      <li key={u.user_id} className="space-y-2 px-3 py-2.5">
                        <div className="flex flex-wrap items-center gap-2">
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-semibold text-stone-900">{u.full_name || u.email}</p>
                            <p className="truncate text-xs text-stone-600">{u.email}</p>
                          </div>
                          <span className={cn('border px-1.5 py-0.5 text-[11px] font-medium', u.active ? 'border-emerald-300 bg-emerald-50 text-emerald-800' : 'border-stone-300 bg-stone-100 text-stone-600')}>
                            {u.active ? 'Active' : 'Switched Off'}
                          </span>
                          <Button type="button" variant="outline" className={smallBtn} disabled={busy != null || !u.active} title="Send a new set-password link"
                            onClick={() => void run(`resend:${u.user_id}`, () => resendCustomerInvite(u.user_id), 'Invite Sent Again')}>
                            <Mail size={14} aria-hidden /> Resend Invite
                          </Button>
                          <Button type="button" variant="outline" className={smallBtn} disabled={busy != null}
                            onClick={() => void run(`power:${u.user_id}`, () => setLoginActive(u.user_id, !u.active), u.active ? 'Login Switched Off' : 'Login Switched On')}>
                            <Power size={14} aria-hidden /> {u.active ? 'Switch Off' : 'Switch On'}
                          </Button>
                          <Button type="button" variant="outline" className={cn(smallBtn, 'text-red-700')} disabled={busy != null}
                            onClick={() => void (async () => {
                              if (!(await confirm(`Remove the login ${u.email}? The customer can no longer sign in.`, { title: 'Remove Login', confirmLabel: 'Remove', destructive: true }))) return
                              await run(`remove:${u.user_id}`, () => removeCustomerLogin(u.user_id), 'Login Removed')
                            })()}>
                            <Trash2 size={14} aria-hidden /> Remove
                          </Button>
                        </div>
                        <div className="flex flex-wrap gap-x-4 gap-y-1">
                          {licences.map((l) => (
                            <label key={l.id} className="inline-flex items-center gap-1.5 text-xs text-stone-800">
                              <input type="checkbox" className={checkCls} disabled={busy != null} checked={u.licence_ids.includes(l.id)}
                                onChange={(e) => void run(`lic:${u.user_id}:${l.id}`, () => setLicenceAccess(u.user_id, l.id, e.target.checked))} />
                              {l.label}
                            </label>
                          ))}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <section className="border border-stone-300 bg-white">
                <h3 className={sectionTitle}>Invite a New Login</h3>
                <div className="space-y-3 p-3">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1">
                      <Label htmlFor="portal-invite-name">Name</Label>
                      <Input id="portal-invite-name" value={name} placeholder="Contact Person" onChange={(e) => setName(e.target.value)} />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="portal-invite-email">Email</Label>
                      <Input id="portal-invite-email" type="email" value={email} placeholder="Email for Login" onChange={(e) => setEmail(e.target.value)} />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs font-semibold text-stone-700">Licences This Login Can See</p>
                    <div className="flex flex-wrap gap-x-4 gap-y-1">
                      {licences.map((l) => (
                        <label key={l.id} className="inline-flex items-center gap-1.5 text-xs text-stone-800">
                          <input type="checkbox" className={checkCls} checked={picked.has(l.id)}
                            onChange={(e) => setPicked((prev) => {
                              const next = new Set(prev)
                              if (e.target.checked) next.add(l.id)
                              else next.delete(l.id)
                              return next
                            })} />
                          {l.label}
                        </label>
                      ))}
                    </div>
                  </div>
                  <p className="text-[11px] text-stone-500">The customer gets an email to set a password, then sets up Two-Step Login. They can only view; nothing can be changed from the portal.</p>
                  <Button type="button" className={cn(limsPrimaryBtnClass, 'h-9 gap-1.5')} disabled={busy != null} onClick={() => void sendInvite()}>
                    {busy === 'invite' ? <Loader2 size={15} className="animate-spin" aria-hidden /> : <Send size={15} aria-hidden />} Send Invite
                  </Button>
                </div>
              </section>

              <section className="border border-stone-300 bg-white">
                <h3 className={sectionTitle}>Documents Shown to the Customer</h3>
                <div className="space-y-2 p-3">
                  <select
                    className="h-9 w-full border border-stone-400 bg-white px-2 text-sm"
                    value={filesFor}
                    onChange={(e) => setFilesFor(e.target.value)}
                    aria-label="Licence"
                  >
                    {licences.map((l) => (
                      <option key={l.id} value={l.id}>{l.label}</option>
                    ))}
                  </select>
                  {files == null ? (
                    <p className="flex items-center gap-2 text-sm text-stone-600"><Loader2 size={15} className="animate-spin" aria-hidden /> Loading…</p>
                  ) : files.length === 0 ? (
                    <p className="text-sm text-stone-600">No files on this licence yet.</p>
                  ) : (
                    <ul className="divide-y divide-stone-200 border border-stone-200">
                      {files.map((f) => (
                        <li key={f.id}>
                          <label className="flex items-center gap-2 px-2 py-1.5 text-sm text-stone-800">
                            <input type="checkbox" className={checkCls} checked={f.customer_visible} disabled={busy === `file:${f.id}`} onChange={() => void toggleFile(f)} />
                            <span className="min-w-0 flex-1 truncate" title={f.file_name}>{f.file_name}</span>
                            <span className="shrink-0 text-[11px] text-stone-500">{f.doc_kind}</span>
                          </label>
                        </li>
                      ))}
                    </ul>
                  )}
                  <p className="text-[11px] text-stone-500">Ticked files appear under Documents in the customer's portal. Nothing is shared until you tick it.</p>
                </div>
              </section>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
