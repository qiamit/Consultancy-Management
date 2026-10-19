import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { limsPageShellClass } from '@/lib/limsThemeUi'
import { useAuth } from '@/hooks/useAuth'
import { supabase } from '@/lib/supabaseClient'
import { useMasterUiSearchState } from '@/lib/useMasterUiSearchState'
import { fetchTeamUsers, type TeamUserRecord } from '@/lib/fetchTeamUsers'
import {
  ensureLabMasterOptionByLabel,
  fetchLabMasterOptionsGrouped,
} from '@/features/settings/lab-settings/labMasterOptions'
import type { OptionItem } from '@/features/settings/lab-settings/types'
import { UserManagementHeaderBar } from './UserManagementHeaderBar'
import { UserManagementTable } from './UserManagementTable'
import { UserManagementFooterBar } from './UserManagementFooterBar'
import { UserManagementForm } from './UserManagementForm'
import { buildUsersPrintHtml, printUsersViaIframe } from './printSelectedUsers'
import { SetPasswordDialog } from './SetPasswordDialog'
import { createTeamUser, deleteTeamUser } from './userFunctionsApi'
import type { AccessRole, UserAccount, UserForm } from './types'

/**
 * Adds user designations / departments / divisions that are missing from lab_master_options.
 * Reads the options once per load and writes only missing labels (it used to query three
 * times per user on every load). Returns true when it inserted anything.
 */
async function syncUserOptionsToLabMaster(users: UserAccount[]): Promise<boolean> {
  const grouped = await fetchLabMasterOptionsGrouped()
  const known = {
    designation: new Set(grouped.designation.map((o) => o.label.trim().toLowerCase())),
    department: new Set(grouped.department.map((o) => o.label.trim().toLowerCase())),
    division: new Set(grouped.division.map((o) => o.label.trim().toLowerCase())),
  }
  let added = false
  const ensure = async (category: 'designation' | 'department' | 'division', label: string) => {
    const key = label.trim().toLowerCase()
    if (!key || known[category].has(key)) return
    known[category].add(key)
    await ensureLabMasterOptionByLabel(category, label)
    added = true
  }
  for (const u of users) {
    await ensure('designation', u.designation)
    await ensure('department', u.departmentName)
    await ensure('division', u.division)
  }
  return added
}

function toUserAccount(row: TeamUserRecord): UserAccount {
  return {
    id: row.id,
    name: row.full_name,
    email: row.email,
    mobile: row.mobile,
    password: '',
    designation: row.designation,
    departmentName: row.department_name,
    division: row.division,
    status: row.status.toLowerCase() === 'inactive' ? 'Inactive' : 'Active',
    accessRole: row.role === 'admin' || row.role === 'viewer' ? row.role : 'staff',
  }
}

function formatMobileForSave(mobile: string, countryCode?: string): string {
  const trimmed = mobile.trim()
  if (!trimmed) return ''
  if (trimmed.startsWith('+')) return trimmed
  if (countryCode) return `${countryCode} ${trimmed}`.trim()
  return trimmed
}

export default function UserManagementMasterPage() {
  const { session } = useAuth()
  const { editId, setEdit } = useMasterUiSearchState()
  const hydratedEditRef = useRef<string | null>(null)
  const [users, setUsers] = useState<UserAccount[]>([])
  const [usersLoading, setUsersLoading] = useState(true)
  const [usersLoadError, setUsersLoadError] = useState<string | null>(null)
  const [userUpdateLoadingId, setUserUpdateLoadingId] = useState<string | null>(null)
  const [userUpdateError, setUserUpdateError] = useState<string | null>(null)
  const userDialogOpen = editId === 'new'
  const editingId = editId && editId !== 'new' ? editId : null
  const editDialogOpen = editingId != null
  const editTarget = editingId ? users.find((u) => u.id === editingId) ?? null : null
  const [searchQuery, setSearchQuery] = useState('')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [jumpTo, setJumpTo] = useState('')
  const [userDeleteTarget, setUserDeleteTarget] = useState<UserAccount | null>(null)
  const [passwordTarget, setPasswordTarget] = useState<UserAccount | null>(null)
  const currentUserId = session?.user?.id ?? null
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set())
  const [printMessage, setPrintMessage] = useState<string | null>(null)

  const [designations, setDesignations] = useState<OptionItem[]>([])
  const [departments, setDepartments] = useState<OptionItem[]>([])
  const [divisions, setDivisions] = useState<OptionItem[]>([])

  const refreshLabOptions = useCallback(async () => {
    const grouped = await fetchLabMasterOptionsGrouped()
    setDesignations(grouped.designation)
    setDepartments(grouped.department)
    setDivisions(grouped.division)
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(
        'userManagement.designations',
        JSON.stringify(grouped.designation.map((o) => o.label)),
      )
      window.localStorage.setItem(
        'userManagement.departments',
        JSON.stringify(grouped.department.map((o) => o.label)),
      )
      window.localStorage.setItem(
        'userManagement.divisions',
        JSON.stringify(grouped.division.map((o) => o.label)),
      )
    }
  }, [])

  useEffect(() => {
    void refreshLabOptions().catch(() => {
      /* defaults from lab_master_options fetch */
    })
  }, [refreshLabOptions])

  useEffect(() => {
    let canceled = false

    const loadUsers = async () => {
      setUsersLoadError(null)

      const {
        data: { session: latestSession },
      } = await supabase.auth.getSession()

      if (!(latestSession?.access_token ?? session?.access_token)) {
        if (!canceled) {
          setUsersLoadError('Session expired. Please log in again.')
          setUsersLoading(false)
        }
        return
      }

      try {
        const mapped = (await fetchTeamUsers()).map(toUserAccount)
        if (canceled) return
        setUsers(mapped)

        try {
          const added = await syncUserOptionsToLabMaster(mapped)
          if (added && !canceled) await refreshLabOptions()
        } catch {
          /* keep UI usable if sync fails */
        }

        const designationByDepartment: Record<string, string[]> = {}
        for (const u of mapped) {
          const dept = u.departmentName?.trim()
          const des = u.designation?.trim()
          if (dept && des) {
            if (!designationByDepartment[dept]) designationByDepartment[dept] = []
            if (!designationByDepartment[dept].includes(des)) designationByDepartment[dept].push(des)
          }
        }
        for (const k of Object.keys(designationByDepartment)) {
          designationByDepartment[k].sort((a, b) => a.localeCompare(b))
        }
        try {
          window.localStorage.setItem('userManagement.designationByDepartment', JSON.stringify(designationByDepartment))
        } catch {
          /* ignore */
        }
      } catch (err) {
        if (!canceled) {
          setUsersLoadError(err instanceof Error ? err.message : 'Unable to load users')
        }
      } finally {
        if (!canceled) setUsersLoading(false)
      }
    }

    void loadUsers()

    return () => {
      canceled = true
    }
  }, [session])

  const reloadUsers = async () => {
    setUsersLoading(true)
    setUsersLoadError(null)

    const {
      data: { session: latestSession },
    } = await supabase.auth.getSession()

    if (!(latestSession?.access_token ?? session?.access_token)) {
      setUsersLoadError('Session expired. Please log in again.')
      setUsersLoading(false)
      return
    }

    try {
      const mapped = (await fetchTeamUsers()).map(toUserAccount)
      setUsers(mapped)

      try {
        if (await syncUserOptionsToLabMaster(mapped)) await refreshLabOptions()
      } catch {
        /* keep UI usable if sync fails */
      }

      const designationByDepartment: Record<string, string[]> = {}
      for (const u of mapped) {
        const dept = u.departmentName?.trim()
        const des = u.designation?.trim()
        if (dept && des) {
          if (!designationByDepartment[dept]) designationByDepartment[dept] = []
          if (!designationByDepartment[dept].includes(des)) designationByDepartment[dept].push(des)
        }
      }
      for (const k of Object.keys(designationByDepartment)) {
        designationByDepartment[k].sort((a, b) => a.localeCompare(b))
      }
      try {
        window.localStorage.setItem('userManagement.designationByDepartment', JSON.stringify(designationByDepartment))
      } catch {
        /* ignore */
      }
    } catch (err) {
      setUsersLoadError(err instanceof Error ? err.message : 'Unable to load users')
    } finally {
      setUsersLoading(false)
    }
  }

  const persistUserLabOptions = async (formData: UserForm) => {
    if (formData.designation.trim()) {
      await ensureLabMasterOptionByLabel('designation', formData.designation)
    }
    if (formData.department.trim()) {
      await ensureLabMasterOptionByLabel('department', formData.department)
    }
    if (formData.division.trim()) {
      await ensureLabMasterOptionByLabel('division', formData.division)
    }
    await refreshLabOptions()
  }

  const filteredUsers = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    if (!q) return users

    return users.filter((user) => {
      const haystack = [
        user.name,
        user.email,
        user.mobile,
        user.designation,
        user.departmentName,
        user.division,
        user.status,
      ]
        .join(' ')
        .toLowerCase()
      return haystack.includes(q)
    })
  }, [users, searchQuery])

  const pageCount = Math.max(1, Math.ceil(filteredUsers.length / pageSize))

  useEffect(() => {
    setPage(1)
    setJumpTo('')
  }, [searchQuery, pageSize])

  useEffect(() => {
    if (page > pageCount) setPage(pageCount)
  }, [page, pageCount])

  const pagedUsers = useMemo(() => {
    const start = (page - 1) * pageSize
    return filteredUsers.slice(start, start + pageSize)
  }, [filteredUsers, page, pageSize])

  useEffect(() => {
    const validIds = new Set(users.map((u) => u.id))
    setSelectedIds((prev) => {
      const next = new Set([...prev].filter((id) => validIds.has(id)))
      return next.size === prev.size ? prev : next
    })
  }, [users])

  useEffect(() => {
    if (!editId || editId === 'new') {
      if (!editId) hydratedEditRef.current = null
      return
    }
    if (hydratedEditRef.current === editId) return
    const fromPage = users.find((u) => u.id === editId)
    if (fromPage) {
      hydratedEditRef.current = editId
      return
    }
    if (users.length > 0 || usersLoadError) setEdit(null)
  }, [editId, users, usersLoadError, setEdit])

  const selectedUsers = useMemo(
    () => users.filter((u) => selectedIds.has(u.id)),
    [users, selectedIds],
  )

  const toggleRow = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleAllOnPage = (checked: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      for (const u of pagedUsers) {
        if (checked) next.add(u.id)
        else next.delete(u.id)
      }
      return next
    })
  }

  const handlePrintSelected = () => {
    setPrintMessage(null)
    if (selectedUsers.length === 0) {
      setPrintMessage('Select at least one team member to print.')
      return
    }
    const ok = printUsersViaIframe(buildUsersPrintHtml(selectedUsers))
    if (!ok) setPrintMessage('Unable to open print preview.')
  }

  return (
    <div className={limsPageShellClass}>
      <UserManagementHeaderBar
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        pageSize={pageSize}
        onPageSizeChange={(size) => {
          setPageSize(size)
          setPage(1)
        }}
        setUserDialogOpen={(open) => {
          if (open) {
            hydratedEditRef.current = 'new'
            setEdit('new')
          } else {
            hydratedEditRef.current = null
            setEdit(null)
          }
        }}
      />

      {usersLoadError && <p className="text-sm text-destructive">{usersLoadError}</p>}
      {userUpdateError && <p className="text-sm text-destructive">{userUpdateError}</p>}
      {printMessage && <p className="text-sm text-destructive">{printMessage}</p>}
      <UserManagementTable
        users={pagedUsers}
        loading={usersLoading}
        searchActive={searchQuery.trim().length > 0}
        selectedIds={selectedIds}
        onToggle={toggleRow}
        onToggleAll={toggleAllOnPage}
        userUpdateLoadingId={userUpdateLoadingId}
        currentUserId={currentUserId}
        onEdit={(user: UserAccount) => {
          hydratedEditRef.current = user.id
          setEdit(user.id)
        }}
        onSetPassword={(user: UserAccount) => setPasswordTarget(user)}
        onStatusChange={async (user, status) => {
          if (user.status === status) return

          setUserUpdateError(null)
          setUserUpdateLoadingId(user.id)

          try {
            const {
              data: { session: latestSession },
            } = await supabase.auth.getSession()

            const accessToken = latestSession?.access_token ?? session?.access_token
            if (!accessToken) {
              throw new Error('Session expired. Please log in again.')
            }

            const { error: statusError } = await supabase
              .from('user_profiles')
              .update({ status })
              .eq('id', user.id)
            if (statusError) throw statusError

            setUsers((prev) => prev.map((u) => (u.id === user.id ? { ...u, status } : u)))
          } catch (err) {
            setUserUpdateError(err instanceof Error ? err.message : 'Unable to update status')
          } finally {
            setUserUpdateLoadingId(null)
          }
        }}
      />

      <UserManagementFooterBar
        totalCount={filteredUsers.length}
        page={page}
        pageCount={pageCount}
        pageSize={pageSize}
        jumpTo={jumpTo}
        selectedCount={selectedIds.size}
        onPrintSelected={handlePrintSelected}
        onPrevPage={() => setPage((p) => Math.max(1, p - 1))}
        onNextPage={() => setPage((p) => Math.min(pageCount, p + 1))}
        onJumpToChange={setJumpTo}
        onJumpToGo={() => {
          const n = Number(jumpTo)
          if (!Number.isFinite(n) || n < 1) return
          setPage(Math.min(pageCount, Math.max(1, Math.floor(n))))
        }}
      />

      <UserManagementForm
        mode="create"
        open={userDialogOpen}
        onOpenChange={(open) => {
          if (!open) {
            hydratedEditRef.current = null
            setEdit(null)
          }
        }}
        designations={designations}
        setDesignations={setDesignations}
        departments={departments}
        setDepartments={setDepartments}
        divisions={divisions}
        setDivisions={setDivisions}
        onSave={async (formData: UserForm, countryCode: string, accessRole: AccessRole) => {
          await persistUserLabOptions(formData)
          // Role is set server-side with the profile, so a role error can no longer hide behind a closed dialog.
          await createTeamUser({
            email: formData.email.trim(),
            password: formData.password,
            full_name: formData.name.trim(),
            mobile: formatMobileForSave(formData.mobile, countryCode || '+91'),
            designation: formData.designation,
            department_name: formData.department,
            division: formData.division,
            role: accessRole,
          })
          await reloadUsers()
        }}
        onOptionsChanged={refreshLabOptions}
      />

      <UserManagementForm
        key={editTarget?.id || 'edit-placeholder'}
        mode="edit"
        open={editDialogOpen && editTarget != null}
        onOpenChange={(open: boolean) => {
          if (!open) {
            hydratedEditRef.current = null
            setEdit(null)
          }
        }}
        initialData={editTarget}
        designations={designations}
        setDesignations={setDesignations}
        departments={departments}
        setDepartments={setDepartments}
        divisions={divisions}
        setDivisions={setDivisions}
        onSave={async (formData: UserForm, countryCode: string, accessRole: AccessRole) => {
          if (!editTarget) return

          setUserUpdateError(null)
          setUserUpdateLoadingId(editTarget.id)
          try {
            await persistUserLabOptions(formData)

            // update_team_user also syncs the GoTrue email; there is no direct-table fallback
            // because that changed user_profiles.email without the login email.
            const { error: updateError } = await supabase.rpc('update_team_user', {
              p_user_id: editTarget.id,
              p_full_name: formData.name.trim(),
              p_mobile: formatMobileForSave(formData.mobile, countryCode),
              p_designation: formData.designation,
              p_department_name: formData.department,
              p_division: formData.division,
              p_email: formData.email.trim(),
            })
            if (updateError) throw new Error(updateError.message)

            if (accessRole !== editTarget.accessRole) {
              const { error: roleError } = await supabase.rpc('set_user_role', {
                p_user_id: editTarget.id,
                p_role: accessRole,
              })
              if (roleError) throw new Error(`Details saved, but the access role was not changed: ${roleError.message}`)
            }

            await reloadUsers()
          } finally {
            setUserUpdateLoadingId(null)
          }
        }}
        onOptionsChanged={refreshLabOptions}
        loading={userUpdateLoadingId === editTarget?.id}
        onRequestDelete={
          editTarget && editTarget.status === 'Inactive' && editTarget.id !== currentUserId
            ? () => {
                const target = editTarget
                hydratedEditRef.current = null
                setEdit(null)
                setUserDeleteTarget(target)
              }
            : undefined
        }
      />

      {userDeleteTarget && (
        <UserManagementForm
          mode="delete"
          open={!!userDeleteTarget}
          onOpenChange={(open: boolean) => !open && setUserDeleteTarget(null)}
          initialData={userDeleteTarget}
          designations={designations}
          setDesignations={setDesignations}
          departments={departments}
          setDepartments={setDepartments}
          divisions={divisions}
          setDivisions={setDivisions}
          onSave={async () => {
            if (!userDeleteTarget) return

            setUserUpdateError(null)
            setUserUpdateLoadingId(userDeleteTarget.id)
            try {
              await deleteTeamUser(userDeleteTarget.id)
              setUserDeleteTarget(null)
              await reloadUsers()
            } finally {
              setUserUpdateLoadingId(null)
            }
          }}
        />
      )}

      <SetPasswordDialog
        user={passwordTarget}
        isSelf={passwordTarget != null && passwordTarget.id === currentUserId}
        onOpenChange={(open) => {
          if (!open) setPasswordTarget(null)
        }}
      />
    </div>
  )
}
