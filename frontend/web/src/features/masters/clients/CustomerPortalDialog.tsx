import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { ClipboardList, FileBadge2, FileText, Loader2, Mail, Power, Send, Trash2, UserPlus, Users } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useConfirmDialog } from '@/components/ui/useConfirmDialog'
import { formatDisplayDate } from '@/features/bis/projects/types'
import { limsDarkBarGlowStyle, limsFullscreenDialogClass, limsOutlineBtnClass, limsPrimaryBtnClass } from '@/lib/limsThemeUi'
import { todayLocalIso } from '@/lib/localDate'
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
import { listRecordsServices, serviceStatus, type RecordsService } from './portalRecordsAdminApi'
import { PortalRecordsSetupDialog } from './PortalRecordsSetupDialog'

const checkCls = 'h-4 w-4 shrink-0 rounded-none border-stone-500 text-amber-700'
const smallBtn = cn(limsOutlineBtnClass, 'h-8 gap-1 px-2 text-xs')

function errText(err: unknown, fallback: string) {
  return err instanceof Error ? err.message : fallback
}

/** "CM/L-0003193456 · IS 1786: 2008" -> ["CM/L-0003193456", "IS 1786: 2008"]. */
function splitLabel(label: string): [string, string] {
  const at = label.indexOf(' · ')
  return at < 0 ? [label, ''] : [label.slice(0, at), label.slice(at + 3)]
}

function initials(text: string) {
  const parts = text.replace(/@.*/, '').split(/[\s._-]+/).filter(Boolean)
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase() || '?'
}

function Panel({ icon, title, count, hint, children }: { icon: ReactNode; title: string; count?: number; hint?: string; children: ReactNode }) {
  return (
    <section className="min-w-0 border border-stone-300 bg-white shadow-sm">
      <header className="flex items-center gap-2.5 border-b border-stone-200 bg-gradient-to-r from-stone-50 to-white px-3 py-2.5 sm:px-4">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center bg-amber-100 text-amber-800">{icon}</span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <h3 className="text-sm font-bold uppercase tracking-[0.1em] text-stone-800">{title}</h3>
            {count != null ? <span className="border border-stone-300 bg-white px-1.5 text-[11px] font-semibold text-stone-600">{count}</span> : null}
          </span>
          {hint ? <span className="block text-[11px] leading-snug text-stone-500">{hint}</span> : null}
        </span>
      </header>
      {children}
    </section>
  )
}

/** A licence as a tick chip: CM/L number in bold, IS Code beside it. */
function LicenceChip({ label, checked, disabled, onChange }: { label: string; checked: boolean; disabled?: boolean; onChange: (checked: boolean) => void }) {
  const [cml, is] = splitLabel(label)
  return (
    <label
      className={cn(
        'inline-flex min-w-0 cursor-pointer items-center gap-1.5 border px-2 py-1 text-xs transition-colors',
        checked ? 'border-amber-600 bg-amber-50 text-amber-950' : 'border-stone-300 bg-white text-stone-600 hover:border-stone-500',
        disabled && 'cursor-not-allowed opacity-60',
      )}
    >
      <input type="checkbox" className={checkCls} checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span className="font-semibold">{cml}</span>
      {is ? <span className="truncate text-stone-500">{is}</span> : null}
    </label>
  )
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <span className="flex items-baseline gap-1.5 border border-white/15 bg-white/5 px-2.5 py-1">
      <span className="text-base font-bold text-amber-200">{value}</span>
      <span className="text-[11px] uppercase tracking-[0.08em] text-stone-300">{label}</span>
    </span>
  )
}

/**
 * Customer Portal for one client (admin only): invite logins, choose the licences each login sees, switch logins
 * off, choose which licence files are shown to the customer, and open the records setup of each licence.
 * Customers only ever view their licences; nothing here lets them edit one.
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
  const [services, setServices] = useState<Map<string, RecordsService>>(new Map())
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [filesFor, setFilesFor] = useState('')
  const [recordsFor, setRecordsFor] = useState<{ id: string; label: string } | null>(null)
  // Files of one licence; shown only while they belong to the licence picked in the list.
  const [filesOf, setFilesOf] = useState<{ licenceId: string; list: PortalLicenceFile[] } | null>(null)
  const files = filesOf && filesOf.licenceId === filesFor ? filesOf.list : null

  const clientId = client?.id ?? ''
  const today = todayLocalIso()

  const load = useCallback(
    () =>
      Promise.all([listClientLicences(clientId), listPortalLogins(clientId)])
        .then(async ([l, u]) => {
          setLicences(l)
          setLogins(u)
          setPicked((prev) => (prev.size ? prev : new Set(l.map((x) => x.id))))
          setFilesFor((prev) => prev || l[0]?.id || '')
          setServices(await listRecordsServices(l.map((x) => x.id)))
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

  const activeLogins = logins.filter((u) => u.active).length
  const recordsOn = licences.filter((l) => services.get(l.id)?.records_enabled).length
  const sharedCount = files?.filter((f) => f.customer_visible).length ?? 0

  return (
    <Dialog open={client != null} onOpenChange={onOpenChange}>
      <DialogContent
        aria-describedby={undefined}
        className={cn(
          '!flex h-[100dvh] max-h-[100dvh] max-w-none flex-col gap-0 overflow-hidden rounded-none border-0 bg-[#fffcf7] p-0 shadow-none sm:rounded-none',
          limsFullscreenDialogClass,
          'border-stone-600 ring-1 ring-amber-700/20',
        )}
      >
        {confirmDialog}
        <PortalRecordsSetupDialog
          key={recordsFor?.id ?? 'none'}
          licence={recordsFor}
          onOpenChange={(open) => {
            if (open) return
            setRecordsFor(null)
            void load()
          }}
        />
        <div className="relative shrink-0 overflow-hidden bg-gradient-to-br from-stone-800 via-stone-900 to-stone-950 px-4 py-3 text-white sm:px-6 sm:py-4">
          <div className="pointer-events-none absolute inset-0 opacity-[0.2]" style={limsDarkBarGlowStyle} />
          <div className="absolute bottom-0 left-0 h-[3px] w-full bg-gradient-to-r from-amber-500 via-amber-300 to-transparent" />
          <div className="relative flex flex-wrap items-end gap-x-6 gap-y-2 pr-10">
            <DialogHeader className="min-w-0 flex-1 space-y-0.5 text-left">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-300">Customer Portal</p>
              <DialogTitle className="truncate text-lg font-semibold tracking-tight text-white sm:text-xl">{client?.company_name}</DialogTitle>
            </DialogHeader>
            {licences.length ? (
              <div className="flex flex-wrap gap-2">
                <Stat value={licences.length} label="Licences" />
                <Stat value={activeLogins} label="Active Logins" />
                <Stat value={recordsOn} label="Records On" />
              </div>
            ) : null}
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-3 sm:p-5">
          {loading && licences.length === 0 ? (
            <p className="flex items-center gap-2 text-sm text-stone-600"><Loader2 size={16} className="animate-spin" aria-hidden /> Loading…</p>
          ) : licences.length === 0 ? (
            <div className="mx-auto mt-10 max-w-md border border-stone-300 bg-white px-5 py-8 text-center shadow-sm">
              <FileBadge2 size={28} className="mx-auto text-amber-700" aria-hidden />
              <p className="mt-2 text-sm font-semibold text-stone-800">No BIS Licence Yet</p>
              <p className="mt-1 text-sm text-stone-600">Add a licence for this client first; then logins can be invited here.</p>
            </div>
          ) : (
            <div className="mx-auto grid max-w-[100rem] items-start gap-4 xl:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] xl:gap-5">
              <div className="min-w-0 space-y-4 xl:space-y-5">
                <Panel icon={<Users size={17} aria-hidden />} title="Customer Logins" count={logins.length} hint="Each login sees only the licences ticked for it.">
                  {logins.length === 0 ? (
                    <p className="px-4 py-6 text-center text-sm text-stone-600">No login yet. Invite one below.</p>
                  ) : (
                    <ul className="divide-y divide-stone-200">
                      {logins.map((u) => (
                        <li key={u.user_id} className={cn('space-y-2.5 px-3 py-3 sm:px-4', !u.active && 'bg-stone-50')}>
                          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                            <span className={cn('flex h-10 w-10 shrink-0 items-center justify-center text-sm font-bold', u.active ? 'bg-amber-600 text-white' : 'bg-stone-300 text-stone-600')}>
                              {initials(u.full_name || u.email)}
                            </span>
                            <div className="min-w-0 flex-1">
                              <p className="flex items-center gap-2">
                                <span className="truncate text-sm font-semibold text-stone-900">{u.full_name || u.email}</span>
                                <span className={cn('shrink-0 border px-1.5 py-px text-[10px] font-semibold uppercase tracking-wide', u.active ? 'border-emerald-300 bg-emerald-50 text-emerald-800' : 'border-stone-300 bg-stone-100 text-stone-600')}>
                                  {u.active ? 'Active' : 'Switched Off'}
                                </span>
                              </p>
                              <p className="truncate text-xs text-stone-600">
                                {u.email}
                                {u.invited_at ? <span className="text-stone-400"> · Invited {formatDisplayDate(u.invited_at.slice(0, 10))}</span> : null}
                              </p>
                            </div>
                            <div className="flex flex-wrap gap-1.5">
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
                          </div>
                          <div className="flex flex-wrap gap-1.5 sm:pl-[3.25rem]">
                            {licences.map((l) => (
                              <LicenceChip key={l.id} label={l.label} disabled={busy != null} checked={u.licence_ids.includes(l.id)}
                                onChange={(on) => void run(`lic:${u.user_id}:${l.id}`, () => setLicenceAccess(u.user_id, l.id, on))} />
                            ))}
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </Panel>

                <Panel icon={<UserPlus size={17} aria-hidden />} title="Invite a New Login" hint="The customer gets an email to set a password, then sets up Two-Step Login.">
                  <div className="space-y-3.5 p-3 sm:p-4">
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
                    <div className="space-y-1.5">
                      <div className="flex items-center gap-3">
                        <p className="text-xs font-semibold text-stone-700">Licences This Login Can See</p>
                        <button type="button" className="text-[11px] font-medium text-amber-800 hover:underline" onClick={() => setPicked(new Set(licences.map((l) => l.id)))}>Select All</button>
                        <button type="button" className="text-[11px] font-medium text-amber-800 hover:underline" onClick={() => setPicked(new Set())}>Clear</button>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {licences.map((l) => (
                          <LicenceChip key={l.id} label={l.label} checked={picked.has(l.id)}
                            onChange={(on) => setPicked((prev) => {
                              const next = new Set(prev)
                              if (on) next.add(l.id)
                              else next.delete(l.id)
                              return next
                            })} />
                        ))}
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-stone-200 pt-3">
                      <p className="max-w-md text-[11px] text-stone-500">They can only view; nothing about the licence can be changed from the portal.</p>
                      <Button type="button" className={cn(limsPrimaryBtnClass, 'h-9 gap-1.5')} disabled={busy != null} onClick={() => void sendInvite()}>
                        {busy === 'invite' ? <Loader2 size={15} className="animate-spin" aria-hidden /> : <Send size={15} aria-hidden />} Send Invite
                      </Button>
                    </div>
                  </div>
                </Panel>
              </div>

              <div className="min-w-0 space-y-4 xl:space-y-5">
                <Panel icon={<ClipboardList size={17} aria-hidden />} title="Licences & Records" count={licences.length} hint="Paid records service per licence (30-day free trial). Q Engineering designs the formats; customers only enter data.">
                  <ul className="divide-y divide-stone-200">
                    {licences.map((l) => {
                      const [cml, is] = splitLabel(l.label)
                      const status = serviceStatus(services.get(l.id) ?? null)
                      const expired = l.validity != null && l.validity < today
                      const seenBy = logins.filter((u) => u.licence_ids.includes(l.id)).length
                      return (
                        <li key={l.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2.5 sm:px-4">
                          <div className="min-w-0 flex-1">
                            <p className="text-sm">
                              <span className="font-semibold text-stone-900">{cml}</span>
                              {is ? <span className="text-stone-600"> · {is}</span> : null}
                            </p>
                            <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-stone-500">
                              <span className={cn(expired && 'font-semibold text-red-700')}>{l.validity ? `Valid Till ${formatDisplayDate(l.validity)}` : 'Validity Not Set'}</span>
                              <span>· {seenBy === 1 ? '1 Login' : `${seenBy} Logins`}</span>
                              <span className={cn('border px-1.5 py-px text-[10px] font-semibold', status.tone)}>Records: {status.text}</span>
                            </p>
                          </div>
                          <Button type="button" variant="outline" className={smallBtn} onClick={() => setRecordsFor({ id: l.id, label: l.label })}>
                            <ClipboardList size={14} aria-hidden /> Records Setup
                          </Button>
                        </li>
                      )
                    })}
                  </ul>
                </Panel>

                <Panel icon={<FileText size={17} aria-hidden />} title="Documents Shown to the Customer" hint="Ticked files appear under Documents in the customer's portal. Nothing is shared until you tick it.">
                  <div className="space-y-3 p-3 sm:p-4">
                    <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Licence">
                      {licences.map((l) => {
                        const [cml] = splitLabel(l.label)
                        const on = l.id === filesFor
                        return (
                          <button
                            key={l.id}
                            type="button"
                            role="tab"
                            aria-selected={on}
                            title={l.label}
                            onClick={() => setFilesFor(l.id)}
                            className={cn(
                              'border px-2.5 py-1 text-xs font-semibold transition-colors',
                              on ? 'border-stone-800 bg-stone-800 text-amber-200' : 'border-stone-300 bg-white text-stone-700 hover:border-stone-500',
                            )}
                          >
                            {cml}
                          </button>
                        )
                      })}
                    </div>
                    {files == null ? (
                      <p className="flex items-center gap-2 text-sm text-stone-600"><Loader2 size={15} className="animate-spin" aria-hidden /> Loading…</p>
                    ) : files.length === 0 ? (
                      <p className="border border-dashed border-stone-300 px-3 py-5 text-center text-sm text-stone-500">No files on this licence yet.</p>
                    ) : (
                      <>
                        <p className="text-[11px] font-medium text-stone-600">{sharedCount} of {files.length} Shared</p>
                        <ul className="divide-y divide-stone-200 border border-stone-200">
                          {files.map((f) => (
                            <li key={f.id}>
                              <label className={cn('flex cursor-pointer items-center gap-2 px-2.5 py-2 text-sm text-stone-800 hover:bg-amber-50/50', f.customer_visible && 'bg-amber-50/70')}>
                                <input type="checkbox" className={checkCls} checked={f.customer_visible} disabled={busy === `file:${f.id}`} onChange={() => void toggleFile(f)} />
                                <span className="min-w-0 flex-1 truncate" title={f.file_name}>{f.file_name}</span>
                                <span className="shrink-0 border border-stone-200 bg-stone-50 px-1.5 text-[11px] text-stone-600">{f.doc_kind}</span>
                              </label>
                            </li>
                          ))}
                        </ul>
                      </>
                    )}
                  </div>
                </Panel>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
