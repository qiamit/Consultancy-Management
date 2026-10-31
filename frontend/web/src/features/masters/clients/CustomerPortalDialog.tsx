import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { ClipboardList, FileBadge2, FileText, Loader2, Mail, Plus, Power, Send, Trash2, Users, X } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { DateInput } from '@/components/ui/date-input'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { useConfirmDialog } from '@/components/ui/useConfirmDialog'
import { formatDisplayDate } from '@/features/bis/projects/types'
import {
  limsDarkBarBtnClass,
  limsDarkBarGlowStyle,
  limsDialogClass,
  limsDialogWidthCapClass,
  limsFullscreenDialogClass,
  limsOutlineBtnClass,
  limsPrimaryBtnClass,
} from '@/lib/limsThemeUi'
import { todayLocalIso } from '@/lib/localDate'
import { cn } from '@/lib/utils'
import {
  inviteCustomer,
  listClientLicences,
  listFilesForLicences,
  listPortalLogins,
  removeCustomerLogin,
  resendCustomerInvite,
  setFileShared,
  setLicenceAccess,
  setLoginActive,
  setLoginMobile,
  type PortalClientLicence,
  type PortalLicenceFile,
  type PortalLogin,
} from './customerPortalAdminApi'
import { TRIAL_DAYS, listRecordsServices, serviceStatus, setPaidUntil, setRecordsEnabled, type RecordsService } from './portalRecordsAdminApi'
import { PortalRecordsSetupDialog } from './PortalRecordsSetupDialog'

const checkCls = 'h-4 w-4 shrink-0 rounded-none border-stone-500 text-amber-700'
const smallBtn = cn(limsOutlineBtnClass, 'h-8 min-h-8 gap-1 px-2 text-xs')
const th = 'border border-stone-700 bg-stone-800 px-2 py-2 text-left text-[11px] font-bold uppercase tracking-[0.1em] text-amber-200'
const td = 'border border-[#e7e0d4] px-2 py-2 align-middle text-sm text-stone-800'
const rowTone = (i: number) => (i % 2 ? 'bg-[#f7f3eb]' : 'bg-[#fffcf7]')
const iconBtn = 'h-8 w-8 min-h-8 rounded-none p-0 text-[#92400e] hover:bg-[#f3e9d8] hover:text-[#78350f]'
const badge = 'inline-block whitespace-nowrap border px-1.5 py-px text-[10px] font-semibold uppercase tracking-wide'

const MOBILE_RE = /^\+?[0-9][0-9 -]{6,18}$/

function errText(err: unknown, fallback: string) {
  return err instanceof Error ? err.message : fallback
}

/** "CM/L-0003193456 · IS 1786: 2008" -> ["CM/L-0003193456", "IS 1786: 2008"]. */
function splitLabel(label: string): [string, string] {
  const at = label.indexOf(' · ')
  return at < 0 ? [label, ''] : [label.slice(0, at), label.slice(at + 3)]
}

function DarkHeader({ eyebrow, title, children }: { eyebrow?: string; title: ReactNode; children?: ReactNode }) {
  return (
    <div className="relative shrink-0 overflow-hidden bg-gradient-to-br from-stone-800 via-stone-900 to-stone-950 px-4 py-3 text-white sm:px-5">
      <div className="pointer-events-none absolute inset-0 opacity-[0.2]" style={limsDarkBarGlowStyle} />
      <div className="absolute bottom-0 left-0 h-[3px] w-full bg-gradient-to-r from-amber-500 via-amber-300 to-transparent" />
      <div className="relative flex flex-wrap items-center gap-x-5 gap-y-2 pr-10">
        <DialogHeader className="min-w-0 flex-1 space-y-0.5 text-left">
          {eyebrow ? <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-300">{eyebrow}</p> : null}
          <DialogTitle className="truncate text-lg font-semibold tracking-tight text-white">{title}</DialogTitle>
        </DialogHeader>
        {children}
      </div>
    </div>
  )
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <span className="flex h-10 items-baseline gap-1.5 border border-white/15 bg-white/5 px-2.5 pt-2">
      <span className="text-base font-bold text-amber-200">{value}</span>
      <span className="text-[11px] uppercase tracking-[0.08em] text-stone-300">{label}</span>
    </span>
  )
}

/** Small sliding on / off switch (green when on). */
function OnOffSwitch({ on, label, title, disabled, busy, onChange }: { on: boolean; label: string; title?: string; disabled?: boolean; busy?: boolean; onChange: (on: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      title={title ?? (on ? 'On' : 'Off')}
      disabled={disabled}
      onClick={() => onChange(!on)}
      className={cn(
        'relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/40 disabled:opacity-60',
        on ? 'border-emerald-700 bg-emerald-600' : 'border-stone-400 bg-stone-300',
      )}
    >
      <span className={cn('flex h-5 w-5 items-center justify-center rounded-full bg-white shadow transition-transform', on ? 'translate-x-5' : 'translate-x-0.5')}>
        {busy ? <Loader2 size={12} className="animate-spin text-stone-500" aria-hidden /> : null}
      </span>
    </button>
  )
}

/** The client's licences for one login: a switch per licence turns its access on or off (saved logins save at once). */
function LicencePickerDialog({
  title,
  licences,
  selected,
  disabled,
  onToggle,
  onClose,
}: {
  title: string | null
  licences: PortalClientLicence[]
  selected: string[]
  disabled?: boolean
  onToggle: (licenceId: string, on: boolean) => void
  onClose: () => void
}) {
  const [ticked, setTicked] = useState<Set<string>>(new Set())
  const allTicked = licences.length > 0 && licences.every((l) => ticked.has(l.id))
  return (
    <Dialog open={title != null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent layer="stacked" aria-describedby={undefined} className={cn(limsDialogClass, 'flex max-h-[85dvh] w-[min(42rem,calc(100vw-1rem))] max-w-none flex-col gap-0 overflow-hidden bg-white p-0')}>
        <DarkHeader title="Licences This Login Can See" />
        <div className="min-h-0 flex-1 overflow-auto p-3">
          <table className="w-full min-w-[30rem] border-collapse font-jakarta">
            <thead>
              <tr>
                <th className={cn(th, 'w-10 text-center')}>
                  <input type="checkbox" className={checkCls} aria-label="Select All Rows" checked={allTicked}
                    onChange={(e) => setTicked(e.target.checked ? new Set(licences.map((l) => l.id)) : new Set())} />
                </th>
                <th className={th}>CM/L No</th>
                <th className={cn(th, 'text-center')}>IS No</th>
                <th className={cn(th, 'w-[7.5rem] text-center')}>Valid Till</th>
                <th className={cn(th, 'w-[5.5rem] text-center')}>Action</th>
              </tr>
            </thead>
            <tbody>
              {licences.map((l, i) => {
                const [cml, is] = splitLabel(l.label)
                const on = selected.includes(l.id)
                return (
                  <tr key={l.id} className={ticked.has(l.id) ? 'bg-[#fde68a]/60' : rowTone(i)}>
                    <td className={cn(td, 'text-center')}>
                      <input type="checkbox" className={checkCls} aria-label={`Select ${cml}`} checked={ticked.has(l.id)}
                        onChange={(e) => setTicked((prev) => {
                          const next = new Set(prev)
                          if (e.target.checked) next.add(l.id)
                          else next.delete(l.id)
                          return next
                        })} />
                    </td>
                    <td className={cn(td, 'whitespace-nowrap font-semibold text-stone-900')}>{cml}</td>
                    <td className={cn(td, 'text-center text-[13px]')}>{is || '—'}</td>
                    <td className={cn(td, 'text-center text-[13px]')}>{l.validity ? formatDisplayDate(l.validity) : '—'}</td>
                    <td className={cn(td, 'text-center')}>
                      <OnOffSwitch on={on} label={`${cml} for this login`} title={on ? 'Can See: Switch Off' : 'Cannot See: Switch On'} disabled={disabled} onChange={(next) => onToggle(l.id, next)} />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <div className="flex items-center gap-2 border-t border-stone-200 bg-stone-50 px-4 py-2.5">
          <span className="text-xs font-semibold text-stone-700">{selected.length} of {licences.length} Licences On</span>
          {disabled ? <Loader2 size={14} className="animate-spin text-stone-500" aria-hidden /> : null}
          <Button type="button" className={cn(limsPrimaryBtnClass, 'ml-auto h-9 min-h-9')} onClick={onClose}>Done</Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

type Draft = { key: string; name: string; email: string; mobile: string; licences: string[] }
type PickFor = { userId: string } | { draftKey: string } | null

/** Logins of the client in one table: saved logins with their actions, plus new invite rows added with "Invite New Login". */
function CustomerLoginsDialog({
  open,
  clientId,
  company,
  licences,
  logins,
  busy,
  run,
  onClose,
}: {
  open: boolean
  clientId: string
  company: string
  licences: PortalClientLicence[]
  logins: PortalLogin[]
  busy: string | null
  run: (key: string, action: () => Promise<void>, done?: string) => Promise<boolean>
  onClose: () => void
}) {
  const [confirm, confirmDialog] = useConfirmDialog({ layer: 'top' })
  const [drafts, setDrafts] = useState<Draft[]>([])
  const [pickFor, setPickFor] = useState<PickFor>(null)

  const allIds = licences.map((l) => l.id)
  const addDraft = () => setDrafts((prev) => [{ key: `${Date.now()}-${prev.length}`, name: '', email: '', mobile: '', licences: allIds }, ...prev])
  const patchDraft = (key: string, patch: Partial<Draft>) => setDrafts((prev) => prev.map((d) => (d.key === key ? { ...d, ...patch } : d)))
  const dropDraft = (key: string) => setDrafts((prev) => prev.filter((d) => d.key !== key))

  const sendInvite = async (d: Draft) => {
    const ok = await run(
      `invite:${d.key}`,
      async () => {
        if (!d.email.trim()) throw new Error('Enter the Email')
        if (!MOBILE_RE.test(d.mobile.trim())) throw new Error('Enter a Valid Mobile No')
        if (d.licences.length === 0) throw new Error('Select at Least One Licence')
        await inviteCustomer({ email: d.email.trim(), full_name: d.name.trim(), mobile: d.mobile.trim(), client_id: clientId, project_ids: d.licences })
      },
      'Invite Sent',
    )
    if (ok) dropDraft(d.key)
  }

  const pickLogin = pickFor && 'userId' in pickFor ? logins.find((u) => u.user_id === pickFor.userId) : undefined
  const pickDraft = pickFor && 'draftKey' in pickFor ? drafts.find((d) => d.key === pickFor.draftKey) : undefined
  const pickTitle = pickLogin ? pickLogin.full_name || pickLogin.email : pickDraft ? pickDraft.name || pickDraft.email || 'New Login' : null
  const pickSelected = pickLogin?.licence_ids ?? pickDraft?.licences ?? []

  const licencesButton = (count: number, onClick: () => void, disabled?: boolean) => (
    <Button type="button" variant="outline" className={cn(smallBtn, 'gap-1.5 px-2')} disabled={disabled} title="View Licences" aria-label={`View Licences (${count} of ${licences.length})`} onClick={onClick}>
      <FileBadge2 size={15} aria-hidden />
      <span className={cn('border px-1 text-[11px] font-semibold', count ? 'border-amber-500 bg-amber-50 text-amber-900' : 'border-red-300 bg-red-50 text-red-700')}>
        {count}/{licences.length}
      </span>
    </Button>
  )

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        layer="nested"
        aria-describedby={undefined}
        className={cn(limsDialogClass, limsDialogWidthCapClass['72rem'], 'flex max-h-[92dvh] flex-col gap-0 overflow-hidden bg-white p-0')}
      >
        {confirmDialog}
        <LicencePickerDialog
          key={pickLogin?.user_id ?? pickDraft?.key ?? 'none'}
          title={pickTitle}
          licences={licences}
          selected={pickSelected}
          disabled={pickLogin ? busy != null : false}
          onClose={() => setPickFor(null)}
          onToggle={(id, on) => {
            if (pickLogin) void run(`lic:${pickLogin.user_id}:${id}`, () => setLicenceAccess(pickLogin.user_id, id, on))
            else if (pickDraft) patchDraft(pickDraft.key, { licences: on ? [...pickDraft.licences, id] : pickDraft.licences.filter((x) => x !== id) })
          }}
        />
        <DarkHeader title={`Customer Logins of ${company}`}>
          <Button type="button" className={cn(limsPrimaryBtnClass, 'gap-1.5')} onClick={addDraft}>
            <Plus size={16} aria-hidden /> Invite New Login
          </Button>
        </DarkHeader>

        <div className="min-h-0 flex-1 overflow-auto bg-[#fffcf7] p-3 sm:p-4">
          <div className="overflow-x-auto border border-stone-300 bg-white shadow-sm">
            <table className="w-full min-w-[1040px] border-collapse font-jakarta">
              <thead>
                <tr>
                  <th className={cn(th, 'w-10 text-center')}>#</th>
                  <th className={cn(th, 'min-w-[10rem]')}>Name</th>
                  <th className={cn(th, 'min-w-[14rem] text-center')}>Email</th>
                  <th className={cn(th, 'w-[8.5rem] text-center')}>Mobile No</th>
                  <th className={cn(th, 'w-[6.5rem] text-center')}>Licences</th>
                  <th className={cn(th, 'w-[6.5rem] text-center')}>Status</th>
                  <th className={cn(th, 'w-[6.5rem] text-center')}>Invited</th>
                  <th className={cn(th, 'w-[7.5rem] text-center')}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {drafts.map((d) => (
                  <tr key={d.key} className="bg-amber-50/70">
                    <td className={cn(td, 'text-center text-xs font-semibold text-amber-800')}>New</td>
                    <td className={td}>
                      <Input value={d.name} placeholder="Contact Person" aria-label="Name" className="h-8 min-h-8 text-sm" onChange={(e) => patchDraft(d.key, { name: e.target.value })} />
                    </td>
                    <td className={td}>
                      <Input type="email" value={d.email} placeholder="Email for Login" aria-label="Email" className="h-8 min-h-8 text-sm" onChange={(e) => patchDraft(d.key, { email: e.target.value })} />
                    </td>
                    <td className={td}>
                      <Input type="tel" inputMode="tel" value={d.mobile} placeholder="Mobile No" aria-label="Mobile No" className="h-8 min-h-8 text-center text-sm" onChange={(e) => patchDraft(d.key, { mobile: e.target.value })} />
                    </td>
                    <td className={cn(td, 'text-center')}>{licencesButton(d.licences.length, () => setPickFor({ draftKey: d.key }))}</td>
                    <td className={cn(td, 'text-center')}><span className={cn(badge, 'border-amber-300 bg-amber-100 text-amber-900')}>Not Sent</span></td>
                    <td className={cn(td, 'text-center text-xs text-stone-400')}>—</td>
                    <td className={td}>
                      <div className="flex items-center justify-center gap-1">
                        <Button type="button" className={cn(limsPrimaryBtnClass, 'h-8 min-h-8 gap-1 px-2.5 text-xs')} disabled={busy != null} onClick={() => void sendInvite(d)}>
                          {busy === `invite:${d.key}` ? <Loader2 size={14} className="animate-spin" aria-hidden /> : <Send size={14} aria-hidden />} Send
                        </Button>
                        <Button type="button" variant="ghost" className={iconBtn} title="Cancel" aria-label="Cancel New Login" onClick={() => dropDraft(d.key)}>
                          <X size={16} aria-hidden />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
                {logins.map((u, i) => (
                  <tr key={u.user_id} className={cn(rowTone(i), !u.active && 'text-stone-500')}>
                    <td className={cn(td, 'text-center text-xs text-stone-500')}>{i + 1}</td>
                    <td className={cn(td, 'font-semibold text-stone-900')}>{u.full_name || '—'}</td>
                    <td className={cn(td, 'break-all text-center text-[13px]')}>{u.email}</td>
                    <td className={td}>
                      <Input
                        key={u.mobile}
                        type="tel"
                        inputMode="tel"
                        defaultValue={u.mobile}
                        placeholder="Add Mobile No"
                        aria-label={`Mobile No of ${u.email}`}
                        disabled={busy != null}
                        className="h-8 min-h-8 border-transparent bg-transparent text-center text-[13px] hover:border-stone-300 focus-visible:bg-white"
                        onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
                        onBlur={(e) => {
                          const next = e.target.value.trim()
                          if (next === u.mobile.trim()) return
                          if (next && !MOBILE_RE.test(next)) {
                            toast.error('Enter a Valid Mobile No')
                            e.target.value = u.mobile
                            return
                          }
                          void run(`mobile:${u.user_id}`, () => setLoginMobile(u.user_id, next), 'Mobile No Saved')
                        }}
                      />
                    </td>
                    <td className={cn(td, 'text-center')}>{licencesButton(u.licence_ids.length, () => setPickFor({ userId: u.user_id }))}</td>
                    <td className={cn(td, 'text-center')}>
                      <span className={cn(badge, u.active ? 'border-emerald-300 bg-emerald-50 text-emerald-800' : 'border-stone-300 bg-stone-100 text-stone-600')}>
                        {u.active ? 'Active' : 'Switched Off'}
                      </span>
                    </td>
                    <td className={cn(td, 'text-center text-xs text-stone-600')}>{u.invited_at ? formatDisplayDate(u.invited_at.slice(0, 10)) : '—'}</td>
                    <td className={td}>
                      <div className="flex items-center justify-center gap-0.5">
                        <Button type="button" variant="ghost" className={iconBtn} disabled={busy != null || !u.active} title="Resend Invite" aria-label={`Resend Invite to ${u.email}`}
                          onClick={() => void run(`resend:${u.user_id}`, () => resendCustomerInvite(u.user_id), 'Invite Sent Again')}>
                          {busy === `resend:${u.user_id}` ? <Loader2 size={16} className="animate-spin" aria-hidden /> : <Mail size={16} aria-hidden />}
                        </Button>
                        <Button type="button" variant="ghost" className={cn(iconBtn, u.active ? '' : 'text-emerald-700')} disabled={busy != null}
                          title={u.active ? 'Switch Off' : 'Switch On'} aria-label={`${u.active ? 'Switch Off' : 'Switch On'} ${u.email}`}
                          onClick={() => void run(`power:${u.user_id}`, () => setLoginActive(u.user_id, !u.active), u.active ? 'Login Switched Off' : 'Login Switched On')}>
                          <Power size={16} aria-hidden />
                        </Button>
                        <Button type="button" variant="ghost" className={cn(iconBtn, 'text-red-700 hover:bg-red-50 hover:text-red-800')} disabled={busy != null} title="Remove" aria-label={`Remove ${u.email}`}
                          onClick={() => void (async () => {
                            if (!(await confirm(`Remove the login ${u.email}? The customer can no longer sign in.`, { title: 'Remove Login', confirmLabel: 'Remove', destructive: true }))) return
                            await run(`remove:${u.user_id}`, () => removeCustomerLogin(u.user_id), 'Login Removed')
                          })()}>
                          <Trash2 size={16} aria-hidden />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
                {logins.length === 0 && drafts.length === 0 ? (
                  <tr>
                    <td colSpan={8} className={cn(td, 'py-8 text-center text-stone-500')}>No login yet. Click "Invite New Login" to add one.</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

/** Files of one licence with a tick for each file shown in the customer's portal. */
function DocumentsDialog({
  licence,
  files,
  busy,
  onToggle,
  onClose,
}: {
  licence: PortalClientLicence | null
  files: PortalLicenceFile[]
  busy: string | null
  onToggle: (file: PortalLicenceFile) => void
  onClose: () => void
}) {
  const shared = files.filter((f) => f.customer_visible).length
  return (
    <Dialog open={licence != null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent layer="nested" aria-describedby={undefined} className={cn(limsDialogClass, 'flex max-h-[85dvh] w-[min(40rem,calc(100vw-1rem))] max-w-none flex-col gap-0 overflow-hidden bg-white p-0')}>
        <DarkHeader eyebrow="Documents Shown to the Customer" title={licence?.label} />
        <div className="flex items-center gap-2 border-b border-stone-200 bg-stone-50 px-4 py-2 text-xs text-stone-600">
          <span className="font-semibold text-stone-800">{shared} of {files.length} Shared</span>
          <span className="ml-auto">Nothing is shared until you tick it.</span>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          {files.length === 0 ? (
            <p className="px-4 py-10 text-center text-sm text-stone-500">No files on this licence yet.</p>
          ) : (
            <ul className="divide-y divide-stone-200">
              {files.map((f) => (
                <li key={f.id}>
                  <label className={cn('flex cursor-pointer items-center gap-3 px-4 py-2.5 text-sm text-stone-800 hover:bg-amber-50/60', f.customer_visible && 'bg-amber-50/80')}>
                    <input type="checkbox" className={checkCls} checked={f.customer_visible} disabled={busy === `file:${f.id}`} onChange={() => onToggle(f)} />
                    <span className="min-w-0 flex-1 truncate" title={f.file_name}>{f.file_name}</span>
                    <span className="shrink-0 border border-stone-200 bg-stone-50 px-1.5 text-[11px] text-stone-600">{f.doc_kind}</span>
                  </label>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="flex justify-end border-t border-stone-200 bg-stone-50 px-4 py-2.5">
          <Button type="button" className={cn(limsPrimaryBtnClass, 'h-9 min-h-9')} onClick={onClose}>Done</Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

/**
 * Customer Portal for one client (admin only), on one page: every licence with its records service, paid date,
 * shared documents and records setup; customer logins open from the header. Customers only ever view their
 * licences; nothing here lets them edit one.
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
  const [files, setFiles] = useState<Map<string, PortalLicenceFile[]>>(new Map())
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)
  const [loginsOpen, setLoginsOpen] = useState(false)
  const [docsFor, setDocsFor] = useState<string | null>(null)
  const [recordsFor, setRecordsFor] = useState<{ id: string; label: string } | null>(null)

  const clientId = client?.id ?? ''
  const today = todayLocalIso()

  const load = useCallback(
    () =>
      Promise.all([listClientLicences(clientId), listPortalLogins(clientId)])
        .then(async ([l, u]) => {
          const ids = l.map((x) => x.id)
          const [svc, fl] = await Promise.all([listRecordsServices(ids), listFilesForLicences(ids)])
          setLicences(l)
          setLogins(u)
          setServices(svc)
          setFiles(fl)
        })
        .catch((err: unknown) => toast.error(errText(err, 'Could not load the Customer Portal settings')))
        .finally(() => setLoading(false)),
    [clientId],
  )

  // The dialog is keyed by client, so its state starts empty for every client.
  useEffect(() => {
    if (clientId) void load()
  }, [clientId, load])

  const run = async (key: string, action: () => Promise<void>, done?: string) => {
    setBusy(key)
    try {
      await action()
      if (done) toast.success(done)
      await load()
      return true
    } catch (err) {
      toast.error(errText(err, 'Action failed'))
      return false
    } finally {
      setBusy(null)
    }
  }

  const toggleFile = async (file: PortalLicenceFile) => {
    setBusy(`file:${file.id}`)
    try {
      await setFileShared(file.id, !file.customer_visible)
      setFiles((prev) => {
        const next = new Map(prev)
        for (const [id, list] of next) {
          if (list.some((f) => f.id === file.id)) next.set(id, list.map((f) => (f.id === file.id ? { ...f, customer_visible: !f.customer_visible } : f)))
        }
        return next
      })
    } catch (err) {
      toast.error(errText(err, 'Could not update the file'))
    } finally {
      setBusy(null)
    }
  }

  const switchRecords = async (l: PortalClientLicence, service: RecordsService | null) => {
    const on = !service?.records_enabled
    const [cml] = splitLabel(l.label)
    const message = on
      ? service?.trial_ends
        ? `Switch the records service on again for ${cml}? The earlier trial and paid dates are kept.`
        : `Switch the records service on for ${cml}? The ${TRIAL_DAYS}-day free trial starts today.`
      : `Switch the records service off for ${cml}? The customer no longer sees the record sections; nothing is deleted.`
    if (!(await confirm(message, { title: on ? 'Switch On Records' : 'Switch Off Records', confirmLabel: on ? 'Switch On' : 'Switch Off', destructive: !on }))) return
    await run(`svc:${l.id}`, () => setRecordsEnabled(l.id, on, service), on ? 'Records Switched On' : 'Records Switched Off')
  }

  const activeLogins = logins.filter((u) => u.active).length
  const recordsOn = licences.filter((l) => services.get(l.id)?.records_enabled).length
  const docsLicence = licences.find((l) => l.id === docsFor) ?? null

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
        <CustomerLoginsDialog
          open={loginsOpen}
          clientId={clientId}
          company={client?.company_name ?? ''}
          licences={licences}
          logins={logins}
          busy={busy}
          run={run}
          onClose={() => setLoginsOpen(false)}
        />
        <DocumentsDialog licence={docsLicence} files={docsFor ? files.get(docsFor) ?? [] : []} busy={busy} onToggle={(f) => void toggleFile(f)} onClose={() => setDocsFor(null)} />

        <DarkHeader eyebrow="Customer Portal" title={client?.company_name}>
          {licences.length ? (
            <div className="flex flex-wrap items-center gap-2">
              <Stat value={licences.length} label="Licences" />
              <Stat value={recordsOn} label="Records On" />
              <Button type="button" variant="outline" className={cn(limsDarkBarBtnClass, 'gap-1.5 px-3')} onClick={() => setLoginsOpen(true)}>
                <Users size={16} aria-hidden /> Customer Logins
                <span className="border border-amber-400/50 bg-amber-500/20 px-1.5 text-xs font-bold text-amber-100">{activeLogins}/{logins.length}</span>
              </Button>
            </div>
          ) : null}
        </DarkHeader>

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
            <div className="mx-auto max-w-[100rem] space-y-2">
              <h3 className="text-sm font-bold uppercase tracking-[0.12em] text-stone-800">Licences &amp; Records</h3>
              <div className="overflow-x-auto border border-stone-300 bg-white shadow-sm">
                <table className="w-full min-w-[980px] border-collapse font-jakarta">
                  <thead>
                    <tr>
                      <th className={cn(th, 'w-10 text-center')}>#</th>
                      <th className={th}>Licence</th>
                      <th className={cn(th, 'w-[7.5rem] text-center')}>Valid Till</th>
                      <th className={cn(th, 'w-[6rem] text-center')}>Logins</th>
                      <th className={cn(th, 'w-[13rem]')}>Records Service</th>
                      <th className={cn(th, 'w-[10.5rem]')}>Paid Till</th>
                      <th className={cn(th, 'w-[9rem] text-center')}>Documents</th>
                      <th className={cn(th, 'w-[9.5rem] text-center')}>Formats</th>
                    </tr>
                  </thead>
                  <tbody>
                    {licences.map((l, i) => {
                      const [cml, is] = splitLabel(l.label)
                      const service = services.get(l.id) ?? null
                      const status = serviceStatus(service)
                      const expired = l.validity != null && l.validity < today
                      const seenBy = logins.filter((u) => u.licence_ids.includes(l.id))
                      const list = files.get(l.id) ?? []
                      const shared = list.filter((f) => f.customer_visible).length
                      return (
                        <tr key={l.id} className={rowTone(i)}>
                          <td className={cn(td, 'text-center text-xs text-stone-500')}>{i + 1}</td>
                          <td className={td}>
                            <p className="whitespace-nowrap font-semibold text-stone-900">{cml}</p>
                            {is ? <p className="text-xs text-stone-600">{is}</p> : null}
                          </td>
                          <td className={cn(td, 'text-center text-[13px]', expired && 'font-semibold text-red-700')}>
                            {l.validity ? formatDisplayDate(l.validity) : '—'}
                            {expired ? <span className="block text-[10px] uppercase tracking-wide">Expired</span> : null}
                          </td>
                          <td className={cn(td, 'text-center')}>
                            <button type="button" className="text-[13px] font-semibold text-amber-800 hover:underline" title={seenBy.map((u) => u.full_name || u.email).join(', ') || 'No login yet'} onClick={() => setLoginsOpen(true)}>
                              {seenBy.length}
                            </button>
                          </td>
                          <td className={td}>
                            <div className="flex items-center gap-2">
                              <OnOffSwitch
                                on={Boolean(service?.records_enabled)}
                                label={`Records Service for ${cml}`}
                                title={service?.records_enabled ? 'Switch Off' : `Switch On (${TRIAL_DAYS}-Day Free Trial)`}
                                disabled={busy != null}
                                busy={busy === `svc:${l.id}`}
                                onChange={() => void switchRecords(l, service)}
                              />
                              <span className={cn(badge, 'min-w-0 truncate normal-case tracking-normal', status.tone)} title={status.text}>{status.text}</span>
                            </div>
                          </td>
                          <td className={td}>
                            {service?.records_enabled ? (
                              <DateInput
                                aria-label={`Paid Till for ${cml}`}
                                className="h-8 min-h-8 w-full text-sm"
                                value={service.paid_until ?? ''}
                                disabled={busy != null}
                                onChange={(e) => {
                                  const next = e.target.value || null
                                  if (next !== (service.paid_until ?? null)) void run(`paid:${l.id}`, () => setPaidUntil(l.id, next), next ? 'Paid Date Saved' : 'Paid Date Cleared')
                                }}
                              />
                            ) : (
                              <span className="text-xs text-stone-400">Switch On First</span>
                            )}
                          </td>
                          <td className={cn(td, 'text-center')}>
                            <Button type="button" variant="outline" className={cn(smallBtn, 'w-full')} onClick={() => setDocsFor(l.id)}>
                              <FileText size={14} aria-hidden /> {shared}/{list.length} Shared
                            </Button>
                          </td>
                          <td className={cn(td, 'text-center')}>
                            <Button type="button" variant="outline" className={cn(smallBtn, 'w-full')} onClick={() => setRecordsFor({ id: l.id, label: l.label })}>
                              <ClipboardList size={14} aria-hidden /> Records Setup
                            </Button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
