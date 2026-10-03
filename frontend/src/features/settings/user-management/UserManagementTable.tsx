import { useMemo } from 'react'
import { Pencil, Trash2 } from 'lucide-react'
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
  searchActive?: boolean
  selectedIds: Set<string>
  onToggle: (id: string) => void
  onToggleAll: (checked: boolean) => void
  userUpdateLoadingId: string | null
  onEdit: (user: UserAccount) => void
  onDelete: (user: UserAccount) => void
  onStatusChange: (user: UserAccount, status: 'Active' | 'Inactive') => void
}

export function UserManagementTable(props: UserManagementTableProps) {
  const userIds = useMemo(() => props.users.map((u) => u.id), [props.users])
  const allSelected = userIds.length > 0 && userIds.every((id) => props.selectedIds.has(id))
  const someSelected = userIds.some((id) => props.selectedIds.has(id)) && !allSelected

  return (
    <div className="overflow-hidden rounded-none border-2 border-stone-500 bg-white shadow-sm ring-1 ring-amber-700/20 overflow-hidden">
      {props.users.length > 0 ? (
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
                  aria-label="Select all users"
                />
              </TableHead>
              <TableHead className="text-[11px] font-bold uppercase tracking-[0.14em] text-amber-200 text-center">Name</TableHead>
              <TableHead className="text-[11px] font-bold uppercase tracking-[0.14em] text-amber-200 text-center">Contact Details</TableHead>
              <TableHead className="text-[11px] font-bold uppercase tracking-[0.14em] text-amber-200 text-center">Division & Department</TableHead>
              <TableHead className="text-[11px] font-bold uppercase tracking-[0.14em] text-amber-200 text-center">Status</TableHead>
              <TableHead className="text-[11px] font-bold uppercase tracking-[0.14em] text-amber-200 text-center">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {props.users.map((user) => {
              const busy = props.userUpdateLoadingId === user.id

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

                  <TableCell className="text-center align-middle">
                    <Select
                      value={user.status}
                      disabled={busy}
                      onValueChange={(value) =>
                        props.onStatusChange(user, value as 'Active' | 'Inactive')
                      }
                    >
                      <SelectTrigger
                        aria-label={`Status for ${user.name}`}
                        className={cn(
                          'mx-auto h-8 w-[110px] text-xs font-medium',
                          user.status === 'Active'
                            ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                            : 'border-border bg-muted text-muted-foreground',
                        )}
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Active">Active</SelectItem>
                        <SelectItem value="Inactive">Inactive</SelectItem>
                      </SelectContent>
                    </Select>
                  </TableCell>

                  <TableCell className="text-center align-middle">
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
                      onClick={() => props.onDelete(user)}
                      disabled={busy}
                      aria-label={`Delete ${user.name}`}
                    >
                      <Trash2 size={16} className="text-destructive" />
                    </Button>
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      ) : (
        <div className="rounded-lg border border-dashed border-border p-6 text-center">
          <p className="text-sm text-muted-foreground">
            {props.searchActive
              ? 'No team members match your search.'
              : 'No team members added yet.'}
          </p>
          {!props.searchActive && (
            <p className="text-xs text-muted-foreground mt-1">Use "Add User" to invite your first colleague.</p>
          )}
        </div>
      )}
    </div>
  )
}
