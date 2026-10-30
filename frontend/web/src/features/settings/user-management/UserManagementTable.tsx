import { useMemo } from 'react'
import { KeyRound, Pencil, ShieldOff } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from '@/components/ui/table'
import { cn } from '@/lib/utils'
import type { UserAccount } from './types'

const GRID_TABLE =
  'w-full border-collapse [&_th]:border [&_td]:border [&_th]:border-border [&_td]:border-border'

const checkboxClass =
  'h-4 w-4 rounded border-muted-foreground/30 text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'

type UserManagementTableProps = {
  users: UserAccount[]
  loading?: boolean
  searchActive?: boolean
  selectedIds: Set<string>
  onToggle: (id: string) => void
  onToggleAll: (checked: boolean) => void
  userUpdateLoadingId: string | null
  /** The signed-in admin: their own status cannot be changed (last-admin / self lock-out guard). */
  currentUserId: string | null
  onEdit: (user: UserAccount) => void
  onSetPassword: (user: UserAccount) => void
  /** Admin: remove another user's authenticator (lost phone). Not offered on the signed-in admin's own row. */
  onResetTwoStep: (user: UserAccount) => void
  onStatusChange: (user: UserAccount, status: 'Active' | 'Inactive') => void
}

export function UserManagementTable(props: UserManagementTableProps) {
  const userIds = useMemo(() => props.users.map((u) => u.id), [props.users])
  const allSelected = userIds.length > 0 && userIds.every((id) => props.selectedIds.has(id))
  const someSelected = userIds.some((id) => props.selectedIds.has(id)) && !allSelected

  const statusSelect = (user: UserAccount, className?: string) => {
    const busy = props.userUpdateLoadingId === user.id
    const isSelf = props.currentUserId === user.id
    return (
      <Select
        value={user.status}
        disabled={busy || isSelf}
        onValueChange={(value) =>
          props.onStatusChange(user, value as 'Active' | 'Inactive')
        }
      >
        <SelectTrigger
          aria-label={`Status for ${user.name}`}
          title={isSelf ? 'You cannot deactivate your own account' : undefined}
          className={cn(
            'h-8 w-[110px] text-xs font-medium',
            user.status === 'Active'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
              : 'border-border bg-muted text-muted-foreground',
            className,
          )}
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="Active">Active</SelectItem>
          <SelectItem value="Inactive">Inactive</SelectItem>
        </SelectContent>
      </Select>
    )
  }

  const actionButtons = (user: UserAccount) => {
    const busy = props.userUpdateLoadingId === user.id
    return (
      <>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => props.onEdit(user)}
          disabled={busy}
          className="mr-1"
          aria-label={`Edit ${user.name}`}
        >
          <Pencil size={16} />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => props.onSetPassword(user)}
          disabled={busy}
          aria-label={`Set password for ${user.name}`}
          title="Set Password"
        >
          <KeyRound size={16} />
        </Button>
        {props.currentUserId !== user.id && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => props.onResetTwoStep(user)}
            disabled={busy}
            aria-label={`Reset Two-Step Login for ${user.name}`}
            title="Reset Two-Step Login"
          >
            <ShieldOff size={16} />
          </Button>
        )}
      </>
    )
  }

  return (
    <div className="overflow-x-auto rounded-none border-2 border-stone-500 bg-white shadow-sm ring-1 ring-amber-700/20">
      {props.loading ? (
        <div className="p-6 text-center text-sm text-muted-foreground" role="status">Loading Team Members…</div>
      ) : props.users.length > 0 ? (
        <>
        {/* Phones and tablets: one card per team member. */}
        <div className="lg:hidden">
          <label className="flex items-center gap-2.5 bg-stone-800 px-3 py-2 text-[11px] font-bold uppercase tracking-[0.14em] text-amber-200">
            <input
              type="checkbox"
              className={checkboxClass}
              checked={allSelected}
              ref={(el) => {
                if (el) el.indeterminate = someSelected
              }}
              onChange={(e) => props.onToggleAll(e.target.checked)}
              aria-label="Select All Users"
            />
            <span className="uppercase">{props.users.length} {props.users.length === 1 ? "Member" : "Members"}</span>
          </label>
          <div className="grid gap-2 p-2 sm:grid-cols-2">
            {props.users.map((user) => (
              <article
                key={user.id}
                className={cn(
                  'border border-stone-300 bg-white shadow-sm',
                  props.selectedIds.has(user.id) && 'border-amber-600 ring-1 ring-amber-600/30',
                )}
              >
                <div className="flex items-start gap-3 px-3 py-2.5">
                  <input
                    type="checkbox"
                    className={cn(checkboxClass, 'mt-1 shrink-0')}
                    checked={props.selectedIds.has(user.id)}
                    onChange={() => props.onToggle(user.id)}
                    aria-label={`Select ${user.name}`}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-stone-900">{user.name}</p>
                    <p className="text-xs text-muted-foreground">{user.designation?.trim() || '—'}</p>
                  </div>
                  <div className="-mr-1 flex shrink-0 items-center">{actionButtons(user)}</div>
                </div>
                <dl className="grid grid-cols-2 gap-x-3 gap-y-2 border-t border-stone-200 bg-stone-50/70 px-3 py-2.5 text-sm">
                  <div className="col-span-2 min-w-0">
                    <dt className="text-[10px] font-bold uppercase tracking-[0.1em] text-stone-500">Contact</dt>
                    <dd className="break-all text-stone-800">{user.email || '—'}</dd>
                    <dd className="text-xs text-muted-foreground">{user.mobile || '—'}</dd>
                  </div>
                  <div className="min-w-0">
                    <dt className="text-[10px] font-bold uppercase tracking-[0.1em] text-stone-500">Division / Department</dt>
                    <dd className="text-stone-800">{user.division?.trim() || '—'}</dd>
                    <dd className="text-xs text-muted-foreground">{user.departmentName?.trim() || '—'}</dd>
                  </div>
                  <div className="min-w-0">
                    <dt className="text-[10px] font-bold uppercase tracking-[0.1em] text-stone-500">Role</dt>
                    <dd className="capitalize text-stone-800">{user.accessRole}</dd>
                  </div>
                </dl>
                <div className="flex items-center justify-between gap-2 border-t border-stone-200 px-3 py-2">
                  <span className="text-[10px] font-bold uppercase tracking-[0.1em] text-stone-500">Status</span>
                  {statusSelect(user)}
                </div>
              </article>
            ))}
          </div>
        </div>
        <div className="hidden lg:block">
        <Table className={GRID_TABLE}>
          <TableHeader>
            <TableRow className="bg-stone-800 hover:bg-stone-800">
              <TableHead className="text-[11px] font-bold uppercase tracking-[0.14em] text-amber-200 text-center w-14">
                <input
                  type="checkbox"
                  className={checkboxClass}
                  checked={allSelected}
                  ref={(el) => {
                    if (el) el.indeterminate = someSelected
                  }}
                  onChange={(e) => props.onToggleAll(e.target.checked)}
                  aria-label="Select All Users"
                />
              </TableHead>
              <TableHead className="text-[11px] font-bold uppercase tracking-[0.14em] text-amber-200 text-center">Name</TableHead>
              <TableHead className="text-[11px] font-bold uppercase tracking-[0.14em] text-amber-200 text-center">Contact Details</TableHead>
              <TableHead className="text-[11px] font-bold uppercase tracking-[0.14em] text-amber-200 text-center">Division & Department</TableHead>
              <TableHead className="text-[11px] font-bold uppercase tracking-[0.14em] text-amber-200 text-center">Role</TableHead>
              <TableHead className="text-[11px] font-bold uppercase tracking-[0.14em] text-amber-200 text-center">Status</TableHead>
              <TableHead className="text-[11px] font-bold uppercase tracking-[0.14em] text-amber-200 text-center">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {props.users.map((user) => {
              return (
                <TableRow key={user.id} data-state={props.selectedIds.has(user.id) ? 'selected' : undefined}>
                  <TableCell className="text-center align-middle">
                    <input
                      type="checkbox"
                      className={checkboxClass}
                      checked={props.selectedIds.has(user.id)}
                      onChange={() => props.onToggle(user.id)}
                      aria-label={`Select ${user.name}`}
                    />
                  </TableCell>

                  <TableCell className="align-middle text-left">
                    <div className="space-y-0.5 min-w-[140px]">
                      <p className="font-medium text-foreground">{user.name}</p>
                      <p className="text-xs text-muted-foreground">{user.designation?.trim() || '—'}</p>
                    </div>
                  </TableCell>

                  <TableCell className="align-middle text-center">
                    <div className="space-y-0.5 min-w-[180px]">
                      <p className="text-sm text-foreground break-all">{user.email || '—'}</p>
                      <p className="text-xs text-muted-foreground">{user.mobile || '—'}</p>
                    </div>
                  </TableCell>

                  <TableCell className="align-middle text-center">
                    <div className="space-y-0.5 min-w-[160px]">
                      <p className="text-sm text-foreground">{user.division?.trim() || '—'}</p>
                      <p className="text-sm text-muted-foreground">{user.departmentName?.trim() || '—'}</p>
                    </div>
                  </TableCell>

                  <TableCell className="text-center align-middle text-sm capitalize">{user.accessRole}</TableCell>

                  <TableCell className="text-center align-middle">
                    {statusSelect(user, 'mx-auto')}
                  </TableCell>

                  <TableCell className="text-center align-middle">
                    {actionButtons(user)}
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
        </div>
        </>
      ) : (
        <div className="rounded-lg border border-dashed border-border p-6 text-center">
          <p className="text-sm text-muted-foreground">
            {props.searchActive
              ? 'No team members match your search.'
              : 'No team members added yet.'}
          </p>
          {!props.searchActive && (
            <p className="text-xs text-muted-foreground mt-1">Use "Add User" to Invite Your First Colleague.</p>
          )}
        </div>
      )}
    </div>
  )
}
