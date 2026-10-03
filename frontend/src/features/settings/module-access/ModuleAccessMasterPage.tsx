import { useCallback, useEffect, useMemo, useState } from 'react'
import { ArrowDown, ArrowUp, ArrowUpDown, List, KeyRound, Loader2, RefreshCw, Save, Search, Shield } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ModuleAccessFooterBar } from './ModuleAccessFooterBar'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useAuth } from '@/hooks/useAuth'
import {
  limsDarkBarBtnClass,
  limsDarkBarFieldClass,
  limsDarkBarGlowStyle,
  limsDarkBarSearchClass,
  limsDialogClass,
  limsPageShellClass,
  limsPanelClass,
  limsPrimaryBtnClass,
  limsTableBodyToneClass,
  limsTableClass,
  limsTableHeadClass,
} from '@/lib/limsThemeUi'
import { cn } from '@/lib/utils'
import { supabase } from '@/lib/supabaseClient'
import { fetchTeamUsers } from '@/lib/fetchTeamUsers'
import {
  MODULE_CATALOG,
  moduleSections,
  resolveLevelFromSubjectRules,
  type ModuleAccessLevel,
  type ModuleAccessSubjectType,
} from './moduleCatalog'
import {
  fetchModuleAccessRulesForSubject,
  saveModuleAccessMatrix,
  type ModuleAccessRuleRow,
} from './moduleAccessApi'
import { useModuleAccess } from './ModuleAccessProvider'

type TeamUser = {
  id: string
  name: string
  email: string
  division: string
  department: string
  designation: string
}

type AccessRow = {
  id: string
  selected: boolean
  division: string
  department: string
  designation: string
  userId: string
  userName: string
  email: string
}

type AccessStatusLabel = 'Full Access' | 'Partial Access' | 'View Only' | 'No Access'

type AccessRowWithStatus = AccessRow & { status: AccessStatusLabel }

type ModuleAccessSortKey = 'userName' | 'division' | 'department' | 'designation' | 'status'

const ACCESS_STATUS_RANK: Record<AccessStatusLabel, number> = {
  'No Access': 0,
  'Partial Access': 1,
  'View Only': 2,
  'Full Access': 3,
}

function computeUserAccessStatus(
  userId: string,
  rules: ModuleAccessRuleRow[],
): AccessStatusLabel {
  const byModule = new Map<string, ModuleAccessLevel>()
  for (const rule of rules) {
    if (rule.subject_type !== 'user' || rule.subject_key !== userId) continue
    byModule.set(rule.module_key, rule.access_level)
  }

  let editCount = 0
  let viewCount = 0
  let noneCount = 0
  for (const m of MODULE_CATALOG) {
    const level = byModule.get(m.key) ?? 'none'
    if (level === 'edit') editCount += 1
    else if (level === 'view') viewCount += 1
    else noneCount += 1
  }

  const total = MODULE_CATALOG.length
  if (total === 0 || noneCount === total) return 'No Access'
  if (editCount === total) return 'Full Access'
  if (viewCount === total) return 'View Only'
  return 'Partial Access'
}

function accessStatusClass(status: AccessStatusLabel): string {
  switch (status) {
    case 'Full Access':
      return 'border-emerald-600 bg-emerald-50 text-emerald-800'
    case 'View Only':
      return 'border-sky-600 bg-sky-50 text-sky-800'
    case 'Partial Access':
      return 'border-amber-600 bg-amber-50 text-amber-900'
    default:
      return 'border-stone-400 bg-stone-100 text-stone-600'
  }
}

function SortableHead({
  label,
  columnKey,
  sortKey,
  sortDir,
  onSort,
  align = 'center',
  className,
}: {
  label: string
  columnKey: ModuleAccessSortKey
  sortKey: ModuleAccessSortKey
  sortDir: 'asc' | 'desc'
  onSort: (key: ModuleAccessSortKey) => void
  align?: 'left' | 'center'
  className?: string
}) {
  const active = sortKey === columnKey
  const Icon = active ? (sortDir === 'asc' ? ArrowUp : ArrowDown) : ArrowUpDown
  const justify = align === 'left' ? 'justify-start' : 'justify-center'

  return (
    <th className={cn(limsTableHeadClass, 'px-2 py-2', className)}>
      <button
        type="button"
        className={cn(
          'inline-flex w-full items-center gap-1 text-[11px] font-bold uppercase tracking-[0.14em] text-amber-200 transition-colors hover:text-amber-100',
          justify,
        )}
        onClick={() => onSort(columnKey)}
        aria-label={`Sort by ${label}${active ? `, ${sortDir === 'asc' ? 'ascending' : 'descending'}` : ''}`}
      >
        <span>{label}</span>
        <Icon className={cn('h-3.5 w-3.5 shrink-0', active ? 'text-amber-300' : 'text-amber-200/60')} />
      </button>
    </th>
  )
}

const sidebarFullscreenOverlayClass = 'lg:inset-y-0 lg:left-[268px] lg:right-0 lg:w-auto'
const sidebarFullscreenDialogClass = cn(
  limsDialogClass,
  '!flex h-[100dvh] max-h-[100dvh] w-full max-w-none translate-x-0 translate-y-0 flex-col gap-0 overflow-hidden p-0',
  'left-0 top-0',
  'lg:left-[268px] lg:w-[calc(100vw-268px)] lg:max-w-[calc(100vw-268px)]',
)

const ACCESS_ACTION_COLUMNS = [
  { key: 'all', label: 'All' },
  { key: 'none', label: 'None' },
  { key: 'view', label: 'View' },
  { key: 'edit', label: 'Edit' },
] as const

type AccessActionKey = (typeof ACCESS_ACTION_COLUMNS)[number]['key']

function accessFlags(level: ModuleAccessLevel) {
  return {
    all: level === 'edit',
    none: level === 'none',
    view: level === 'view' || level === 'edit',
    edit: level === 'edit',
  }
}

/** Toggle semantics: All = full (edit); Edit implies View; None clears access. */
function nextAccessLevel(
  current: ModuleAccessLevel,
  action: AccessActionKey,
): ModuleAccessLevel {
  const flags = accessFlags(current)
  switch (action) {
    case 'all':
      return flags.all ? 'none' : 'edit'
    case 'none':
      return 'none'
    case 'view':
      if (current === 'edit') return 'view'
      if (current === 'view') return 'none'
      return 'view'
    case 'edit':
      if (flags.edit) return 'view'
      return 'edit'
    default:
      return current
  }
}

function AccessToggle({
  pressed,
  label,
  ariaLabel,
  onClick,
  disabled = false,
}: {
  pressed: boolean
  label: string
  ariaLabel: string
  onClick: () => void
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={pressed}
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'inline-flex h-7 min-w-[2.75rem] items-center justify-center rounded-none border px-1.5 text-[10px] font-bold uppercase tracking-wide transition-colors',
        pressed
          ? 'border-amber-600 bg-amber-500 text-stone-950 shadow-sm'
          : 'border-stone-400 bg-white text-stone-600 hover:border-amber-500 hover:bg-amber-50 hover:text-stone-900',
        disabled && 'pointer-events-none opacity-45',
      )}
    >
      {label}
    </button>
  )
}

function AccessActionCells({
  level,
  name,
  onSelect,
  disabled = false,
}: {
  level: ModuleAccessLevel | null
  name: string
  onSelect: (action: AccessActionKey) => void
  disabled?: boolean
}) {
  const flags = level ? accessFlags(level) : { all: false, none: false, view: false, edit: false }

  return (
    <>
      {ACCESS_ACTION_COLUMNS.map((col) => (
        <td key={col.key} className="px-1.5 py-1.5 text-center align-middle">
          <AccessToggle
            pressed={flags[col.key]}
            label={col.label}
            ariaLabel={`${name}: ${col.label}`}
            disabled={disabled}
            onClick={() => onSelect(col.key)}
          />
        </td>
      ))}
    </>
  )
}

function sectionUniformLevel(
  modules: { key: string }[],
  levels: Record<string, ModuleAccessLevel>,
): ModuleAccessLevel | null {
  if (modules.length === 0) return null
  const first = levels[modules[0].key] ?? 'none'
  for (const m of modules) {
    if ((levels[m.key] ?? 'none') !== first) return null
  }
  return first
}

function defaultLevels(): Record<string, ModuleAccessLevel> {
  const out: Record<string, ModuleAccessLevel> = {}
  for (const m of MODULE_CATALOG) out[m.key] = 'none'
  return out
}

function usersToRows(users: TeamUser[], prevSelected: Set<string>): AccessRow[] {
  return users.map((u) => ({
    id: u.id,
    selected: prevSelected.has(u.id),
    division: u.division,
    department: u.department,
    designation: u.designation,
    userId: u.id,
    userName: u.name,
    email: u.email,
  }))
}

export default function ModuleAccessMasterPage() {
  const { user, session } = useAuth()
  const { rules, refresh: refreshGlobalRules } = useModuleAccess()

  const [rows, setRows] = useState<AccessRow[]>([])
  const [users, setUsers] = useState<TeamUser[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [jumpTo, setJumpTo] = useState('')
  const [sortKey, setSortKey] = useState<ModuleAccessSortKey>('userName')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')
  const [optionsLoading, setOptionsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  const [accessOpen, setAccessOpen] = useState(false)
  const [accessSubject, setAccessSubject] = useState<{
    subjectType: ModuleAccessSubjectType
    subjectKey: string
    subjectLabel: string
    division: string
    department: string
    designation: string
  } | null>(null)
  const [levels, setLevels] = useState<Record<string, ModuleAccessLevel>>(defaultLevels)
  const [selectedModuleKeys, setSelectedModuleKeys] = useState<Set<string>>(() => new Set())
  const [matrixLoading, setMatrixLoading] = useState(false)
  const [saving, setSaving] = useState(false)

  const sections = useMemo(() => moduleSections(), [])

  const loadUsers = useCallback(async () => {
    setOptionsLoading(true)
    setError(null)
    try {
      const {
        data: { session: latest },
      } = await supabase.auth.getSession()
      const accessToken = latest?.access_token ?? session?.access_token
      if (!accessToken) {
        setError('Session expired. Please log in again.')
        setUsers([])
        return
      }

      const opts: TeamUser[] = (await fetchTeamUsers())
        .map((u) => ({
          id: u.id,
          name: u.full_name.trim() || u.email || u.id,
          email: u.email,
          designation: u.designation,
          department: u.department_name,
          division: u.division,
        }))
        .sort((a, b) => a.name.localeCompare(b.name))

      setUsers(opts)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load users')
      setUsers([])
    } finally {
      setOptionsLoading(false)
    }
  }, [session?.access_token])

  useEffect(() => {
    void loadUsers()
  }, [loadUsers])

  // Auto-sync one Access row per User Management user
  useEffect(() => {
    setRows((prev) => {
      const selected = new Set(prev.filter((r) => r.selected).map((r) => r.userId || r.id))
      return usersToRows(users, selected)
    })
  }, [users])

  const rowsWithStatus = useMemo<AccessRowWithStatus[]>(
    () =>
      rows.map((row) => ({
        ...row,
        status: computeUserAccessStatus(row.userId, rules),
      })),
    [rows, rules],
  )

  const filteredRows = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    if (!q) return rowsWithStatus
    return rowsWithStatus.filter((row) => {
      const haystack = [
        row.userName,
        row.email,
        row.userId,
        row.division,
        row.department,
        row.designation,
        row.status,
      ]
        .join(' ')
        .toLowerCase()
      return haystack.includes(q)
    })
  }, [rowsWithStatus, searchQuery])

  const sortedRows = useMemo(() => {
    const list = [...filteredRows]
    const dir = sortDir === 'asc' ? 1 : -1
    list.sort((a, b) => {
      if (sortKey === 'status') {
        return (ACCESS_STATUS_RANK[a.status] - ACCESS_STATUS_RANK[b.status]) * dir
      }
      const av = (a[sortKey] ?? '').trim().toLowerCase()
      const bv = (b[sortKey] ?? '').trim().toLowerCase()
      return av.localeCompare(bv, undefined, { sensitivity: 'base' }) * dir
    })
    return list
  }, [filteredRows, sortKey, sortDir])

  const pageCount = Math.max(1, Math.ceil(sortedRows.length / pageSize))

  useEffect(() => {
    setPage(1)
    setJumpTo('')
  }, [searchQuery, pageSize, sortKey, sortDir])

  useEffect(() => {
    if (page > pageCount) setPage(pageCount)
  }, [page, pageCount])

  const pagedRows = useMemo(() => {
    const start = (page - 1) * pageSize
    return sortedRows.slice(start, start + pageSize)
  }, [sortedRows, page, pageSize])

  const handleSort = (key: ModuleAccessSortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortDir('asc')
    }
  }

  const selectedCount = rows.filter((r) => r.selected).length

  const allSelected =
    pagedRows.length > 0 && pagedRows.every((r) => r.selected)
  const someSelected =
    pagedRows.some((r) => r.selected) && !allSelected

  const openAccessForRow = (row: AccessRow) => {
    setError(null)
    setAccessSubject({
      subjectType: 'user',
      subjectKey: row.userId,
      subjectLabel: row.userName || row.userId,
      division: row.division.trim(),
      department: row.department.trim(),
      designation: row.designation.trim(),
    })
    setSelectedModuleKeys(new Set())
    setAccessOpen(true)
  }

  useEffect(() => {
    if (!accessOpen || !accessSubject) return
    let canceled = false
    setMatrixLoading(true)
    setLevels(defaultLevels())
    void (async () => {
      try {
        const loaded = await fetchModuleAccessRulesForSubject(
          accessSubject.subjectType,
          accessSubject.subjectKey,
        )
        if (canceled) return
        const next = defaultLevels()
        for (const m of MODULE_CATALOG) {
          const inherited = resolveLevelFromSubjectRules(m.key, loaded)
          if (inherited) next[m.key] = inherited
        }
        setLevels(next)
      } catch (err) {
        if (!canceled) {
          setError(err instanceof Error ? err.message : 'Unable to load module access')
          setLevels(defaultLevels())
        }
      } finally {
        if (!canceled) setMatrixLoading(false)
      }
    })()
    return () => {
      canceled = true
    }
  }, [accessOpen, accessSubject])

  const handleSaveAccess = async () => {
    if (!accessSubject) return
    setSaving(true)
    setError(null)
    try {
      await saveModuleAccessMatrix({
        subjectType: accessSubject.subjectType,
        subjectKey: accessSubject.subjectKey,
        subjectLabel: accessSubject.subjectLabel,
        levelsByModule: levels,
        updatedBy: user?.id ?? null,
      })
      await refreshGlobalRules()
      setMessage(`Access saved for ${accessSubject.subjectLabel}.`)
      setAccessOpen(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save module access')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className={limsPageShellClass}>
      <div className={cn(limsPanelClass)}>
        <div className="relative overflow-hidden bg-gradient-to-br from-stone-800 via-stone-900 to-stone-950 px-3 py-1.5 text-white sm:px-5 sm:py-2">
          <div className="pointer-events-none absolute inset-0 opacity-[0.18]" style={limsDarkBarGlowStyle} />
          <div className="absolute bottom-0 left-0 h-[2px] w-full bg-gradient-to-r from-amber-500 via-amber-300 to-transparent" />
          <div className="relative flex flex-wrap items-center gap-1.5 lg:flex-nowrap sm:gap-2">
            <div className="flex shrink-0 items-center gap-1.5">
              <Shield size={16} className="shrink-0 text-amber-300" aria-hidden />
              <h1 className="shrink-0 text-sm font-semibold tracking-tight text-white sm:text-base">
                Module Access
              </h1>
              <span className="hidden text-[10px] text-stone-300 sm:inline">
                {filteredRows.length}
                {searchQuery.trim() ? ` / ${rows.length}` : ''} user
                {rows.length === 1 ? '' : 's'}
              </span>
            </div>

            <div className="order-3 flex w-full min-w-0 items-center gap-1.5 sm:order-none sm:mx-1 sm:w-auto sm:max-w-none sm:flex-none">
              <div className="relative min-w-0 flex-1 sm:w-[16rem] sm:max-w-sm sm:flex-none">
                <Search
                  className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-stone-400"
                  aria-hidden
                />
                <Input
                  type="search"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search Name | Division | Department"
                  className={cn(limsDarkBarSearchClass, 'h-7 pl-8 text-xs sm:h-8')}
                  aria-label="Search module access users"
                />
              </div>
              <Select value={String(pageSize)} onValueChange={(v) => setPageSize(Number(v))}>
                <SelectTrigger
                  className={cn(limsDarkBarFieldClass, 'h-7 w-[6.5rem] shrink-0 text-xs sm:h-8 sm:w-[7.5rem]')}
                  aria-label="Rows per page"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="5">5 / Page</SelectItem>
                  <SelectItem value="10">10 / Page</SelectItem>
                  <SelectItem value="20">20 / Page</SelectItem>
                  <SelectItem value="50">50 / Page</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <Button
              type="button"
              variant="outline"
              size="sm"
              className={cn('ml-auto h-7 shrink-0 gap-1 px-2 text-xs sm:h-8 sm:gap-1.5', limsDarkBarBtnClass)}
              disabled={optionsLoading}
              onClick={() => {
                void loadUsers()
                void refreshGlobalRules()
              }}
              aria-label="Refresh users from User Management"
            >
              <RefreshCw size={14} className={optionsLoading ? 'animate-spin' : undefined} />
              Refresh
            </Button>
          </div>
        </div>
      </div>

      <div className={cn(limsPanelClass, 'space-y-3 p-4 sm:p-5')}>
        {error ? (
          <p className="border-l-2 border-destructive bg-destructive/5 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        ) : null}
        {message ? (
          <p className="border-l-2 border-emerald-600 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
            {message}
          </p>
        ) : null}

        <div className="overflow-x-auto rounded-none border-2 border-stone-500">
          <table className={cn(limsTableClass, 'min-w-[960px]')}>
            <thead>
              <tr>
                <th className={cn(limsTableHeadClass, 'w-12 px-2 py-2')}>
                  <input
                    type="checkbox"
                    className="h-4 w-4"
                    checked={allSelected}
                    ref={(el) => {
                      if (el) el.indeterminate = someSelected
                    }}
                    onChange={(e) => {
                      const checked = e.target.checked
                      const visibleIds = new Set(pagedRows.map((r) => r.id))
                      setRows((prev) =>
                        prev.map((r) =>
                          visibleIds.has(r.id) ? { ...r, selected: checked } : r,
                        ),
                      )
                    }}
                    aria-label="Select all rows on this page"
                  />
                </th>
                <SortableHead
                  label="User Name"
                  columnKey="userName"
                  sortKey={sortKey}
                  sortDir={sortDir}
                  onSort={handleSort}
                  align="left"
                />
                <SortableHead
                  label="Division"
                  columnKey="division"
                  sortKey={sortKey}
                  sortDir={sortDir}
                  onSort={handleSort}
                  align="center"
                />
                <SortableHead
                  label="Department"
                  columnKey="department"
                  sortKey={sortKey}
                  sortDir={sortDir}
                  onSort={handleSort}
                  align="center"
                />
                <SortableHead
                  label="Designation"
                  columnKey="designation"
                  sortKey={sortKey}
                  sortDir={sortDir}
                  onSort={handleSort}
                  align="center"
                />
                <SortableHead
                  label="Status"
                  columnKey="status"
                  sortKey={sortKey}
                  sortDir={sortDir}
                  onSort={handleSort}
                  align="center"
                />
                <th className={cn(limsTableHeadClass, 'w-[120px] px-2 py-2 text-center')}>Action</th>
              </tr>
            </thead>
            <tbody className={limsTableBodyToneClass}>
              {optionsLoading ? (
                <tr>
                  <td colSpan={7} className="px-3 py-8 text-center text-sm text-stone-600">
                    <span className="inline-flex items-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Loading users from User Management…
                    </span>
                  </td>
                </tr>
              ) : sortedRows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-3 py-8 text-center text-sm text-stone-600">
                    {searchQuery.trim()
                      ? 'No users match your search.'
                      : 'No users found. Add team members in User Management — rows appear here automatically.'}
                  </td>
                </tr>
              ) : (
                pagedRows.map((row) => (
                  <tr key={row.id} className="border-t border-stone-300">
                    <td className="px-2 py-2 text-center align-middle">
                      <input
                        type="checkbox"
                        className="h-4 w-4"
                        checked={row.selected}
                        onChange={(e) => {
                          const checked = e.target.checked
                          setRows((prev) =>
                            prev.map((r) => (r.id === row.id ? { ...r, selected: checked } : r)),
                          )
                        }}
                        aria-label={`Select ${row.userName}`}
                      />
                    </td>
                    <td className="px-3 py-2 text-left align-middle text-sm font-medium text-stone-900">
                      <div className="min-w-0 space-y-0.5">
                        <p className="truncate font-medium text-stone-900">
                          {row.userName.trim() || '—'}
                        </p>
                        <p
                          className="truncate text-[11px] font-normal text-stone-500"
                          title={row.email.trim() || undefined}
                        >
                          {row.email.trim() || '—'}
                        </p>
                      </div>
                    </td>
                    <td className="px-3 py-2 text-center align-middle text-sm text-stone-800">
                      {row.division.trim() || '—'}
                    </td>
                    <td className="px-3 py-2 text-center align-middle text-sm text-stone-800">
                      {row.department.trim() || '—'}
                    </td>
                    <td className="px-3 py-2 text-center align-middle text-sm text-stone-800">
                      {row.designation.trim() || '—'}
                    </td>
                    <td className="px-2 py-2 text-center align-middle">
                      <span
                        className={cn(
                          'inline-flex whitespace-nowrap border px-2 py-0.5 text-[11px] font-semibold',
                          accessStatusClass(row.status),
                        )}
                      >
                        {row.status}
                      </span>
                    </td>
                    <td className="px-2 py-1.5 text-center align-middle">
                      <Button
                        type="button"
                        size="sm"
                        className={cn('h-8 gap-1.5', limsPrimaryBtnClass)}
                        onClick={() => openAccessForRow(row)}
                        aria-label={`Open module access for ${row.userName}`}
                      >
                        <KeyRound size={14} />
                        Access
                      </Button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <ModuleAccessFooterBar
        totalCount={sortedRows.length}
        page={page}
        pageCount={pageCount}
        pageSize={pageSize}
        jumpTo={jumpTo}
        selectedCount={selectedCount}
        onPrevPage={() => setPage((p) => Math.max(1, p - 1))}
        onNextPage={() => setPage((p) => Math.min(pageCount, p + 1))}
        onJumpToChange={setJumpTo}
        onJumpToGo={() => {
          const n = Number(jumpTo)
          if (!Number.isFinite(n) || n <= 0) return
          setPage(Math.min(pageCount, Math.max(1, Math.floor(n))))
        }}
      />

      <Dialog
        open={accessOpen}
        onOpenChange={(open) => {
          setAccessOpen(open)
          if (!open) setAccessSubject(null)
          if (!open) setSelectedModuleKeys(new Set())
        }}
      >
        <DialogContent
          persistOnFocusLoss
          overlayClassName={sidebarFullscreenOverlayClass}
          className={sidebarFullscreenDialogClass}
          aria-describedby={undefined}
        >
          <div className="relative shrink-0 overflow-hidden bg-gradient-to-br from-stone-800 via-stone-900 to-stone-950 px-4 py-2.5 text-white sm:px-5 sm:py-3">
            <div className="pointer-events-none absolute inset-0 opacity-[0.18]" style={limsDarkBarGlowStyle} />
            <div className="absolute bottom-0 left-0 h-[2px] w-full bg-gradient-to-r from-amber-500 via-amber-300 to-transparent" />
            <DialogHeader className="relative pr-10 text-left">
              <DialogTitle className="truncate text-base font-semibold tracking-tight text-white sm:text-lg">
                {accessSubject
                  ? [
                      `Module Access - ${accessSubject.subjectLabel}`,
                      accessSubject.division || '—',
                      accessSubject.department || '—',
                      accessSubject.designation || '—',
                    ].join(' | ')
                  : 'Module Access'}
              </DialogTitle>
            </DialogHeader>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto bg-gradient-to-b from-stone-100/80 to-white px-4 py-4 sm:px-5">
            {matrixLoading ? (
              <div className="flex items-center gap-2 py-8 text-sm text-stone-600">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading permissions…
              </div>
            ) : (
              <div className="overflow-x-auto rounded-none border-2 border-stone-500">
                <table className={cn(limsTableClass, 'min-w-[860px]')}>
                  <thead>
                    <tr>
                      <th className={cn(limsTableHeadClass, 'w-12 px-2 py-2')} rowSpan={2}>
                        <input
                          type="checkbox"
                          className="h-4 w-4"
                          checked={
                            MODULE_CATALOG.length > 0 &&
                            MODULE_CATALOG.every((m) => selectedModuleKeys.has(m.key))
                          }
                          ref={(el) => {
                            if (!el) return
                            const some =
                              MODULE_CATALOG.some((m) => selectedModuleKeys.has(m.key)) &&
                              !MODULE_CATALOG.every((m) => selectedModuleKeys.has(m.key))
                            el.indeterminate = some
                          }}
                          onChange={(e) => {
                            const checked = e.target.checked
                            setSelectedModuleKeys(
                              checked ? new Set(MODULE_CATALOG.map((m) => m.key)) : new Set(),
                            )
                          }}
                          aria-label="Select all modules"
                        />
                      </th>
                      <th className={cn(limsTableHeadClass, 'px-3 py-2 text-left')} rowSpan={2}>
                        Module Label
                      </th>
                      <th className={cn(limsTableHeadClass, 'px-3 py-2 text-center')} rowSpan={2}>
                        Module Name
                      </th>
                      <th
                        className={cn(limsTableHeadClass, 'px-2 py-1.5 text-center')}
                        colSpan={ACCESS_ACTION_COLUMNS.length}
                      >
                        Action
                      </th>
                    </tr>
                    <tr>
                      {ACCESS_ACTION_COLUMNS.map((col) => (
                        <th
                          key={col.key}
                          className={cn(limsTableHeadClass, 'w-[4.5rem] px-1.5 py-1.5 text-center')}
                        >
                          {col.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className={limsTableBodyToneClass}>
                    {sections.map((section) => (
                      <SectionRows
                        key={section}
                        section={section}
                        levels={levels}
                        selectedKeys={selectedModuleKeys}
                        disabled={matrixLoading}
                        onToggleKey={(moduleKey, checked) => {
                          setSelectedModuleKeys((prev) => {
                            const next = new Set(prev)
                            if (checked) next.add(moduleKey)
                            else next.delete(moduleKey)
                            return next
                          })
                        }}
                        onToggleSection={(sec, checked) => {
                          const keys = MODULE_CATALOG.filter((m) => m.section === sec).map((m) => m.key)
                          setSelectedModuleKeys((prev) => {
                            const next = new Set(prev)
                            for (const k of keys) {
                              if (checked) next.add(k)
                              else next.delete(k)
                            }
                            return next
                          })
                        }}
                        onChange={(moduleKey, level) =>
                          setLevels((prev) => ({ ...prev, [moduleKey]: level }))
                        }
                        onSetSection={(sec, level) => {
                          setLevels((prev) => {
                            const next = { ...prev }
                            for (const m of MODULE_CATALOG) {
                              if (m.section === sec) next[m.key] = level
                            }
                            return next
                          })
                        }}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <DialogFooter className="shrink-0 gap-2 border-t border-stone-200 bg-stone-50 px-4 py-3 sm:justify-end">
            <Button
              type="button"
              className={cn('gap-2', limsPrimaryBtnClass)}
              disabled={saving || matrixLoading || !accessSubject}
              onClick={() => void handleSaveAccess()}
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save size={14} />}
              {saving ? 'Saving…' : 'Save Access'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function SectionRows({
  section,
  levels,
  selectedKeys,
  disabled = false,
  onToggleKey,
  onToggleSection,
  onChange,
  onSetSection,
}: {
  section: string
  levels: Record<string, ModuleAccessLevel>
  selectedKeys: Set<string>
  disabled?: boolean
  onToggleKey: (moduleKey: string, checked: boolean) => void
  onToggleSection: (section: string, checked: boolean) => void
  onChange: (moduleKey: string, level: ModuleAccessLevel) => void
  onSetSection: (section: string, level: ModuleAccessLevel) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const modules = MODULE_CATALOG.filter((m) => m.section === section)
  const allSectionSelected =
    modules.length > 0 && modules.every((m) => selectedKeys.has(m.key))
  const someSectionSelected =
    modules.some((m) => selectedKeys.has(m.key)) && !allSectionSelected
  const sectionLevel = sectionUniformLevel(modules, levels)

  return (
    <>
      <tr className="border-t border-stone-400 bg-stone-200/80">
        <td className="px-2 py-2 text-center align-middle">
          <input
            type="checkbox"
            className="h-4 w-4"
            checked={allSectionSelected}
            ref={(el) => {
              if (el) el.indeterminate = someSectionSelected
            }}
            onChange={(e) => onToggleSection(section, e.target.checked)}
            aria-label={`Select all ${section} modules`}
          />
        </td>
        <td className="px-3 py-2 text-left text-[11px] font-bold uppercase tracking-wide text-stone-800">
          <div className="flex w-full items-center gap-1.5">
            <span className="min-w-0 flex-1 truncate">
              {section}
              <span className="ml-1.5 font-medium normal-case tracking-normal text-stone-500">
                ({modules.length})
              </span>
            </span>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="ml-auto h-7 w-7 shrink-0 rounded-none border border-stone-400 bg-white/80 text-stone-800 hover:bg-amber-100 hover:text-stone-950"
              aria-expanded={expanded}
              aria-label={expanded ? `Collapse ${section}` : `Expand ${section}`}
              onClick={() => setExpanded((v) => !v)}
            >
              <List size={16} />
            </Button>
          </div>
        </td>
        <td className="px-3 py-2 text-center align-middle text-[11px] font-medium text-stone-500">
          {expanded ? 'Module path' : 'Expand list'}
        </td>
        <AccessActionCells
          level={sectionLevel}
          name={`All ${section} modules`}
          disabled={disabled}
          onSelect={(action) => {
            const base = sectionLevel ?? 'none'
            onSetSection(section, nextAccessLevel(base, action))
          }}
        />
      </tr>
      {expanded
        ? modules.map((m) => {
            const level = levels[m.key] ?? 'none'
            return (
              <tr key={m.key} className="border-t border-stone-300">
                <td className="px-2 py-2 text-center align-middle">
                  <input
                    type="checkbox"
                    className="h-4 w-4"
                    checked={selectedKeys.has(m.key)}
                    onChange={(e) => onToggleKey(m.key, e.target.checked)}
                    aria-label={`Select ${m.label}`}
                  />
                </td>
                <td className="px-3 py-2 text-left align-middle text-sm font-medium text-stone-800">
                  {m.label}
                </td>
                <td className="px-3 py-2 text-center align-middle font-mono text-[11px] text-stone-600">
                  {m.key}
                </td>
                <AccessActionCells
                  level={level}
                  name={m.label}
                  disabled={disabled}
                  onSelect={(action) => onChange(m.key, nextAccessLevel(level, action))}
                />
              </tr>
            )
          })
        : null}
    </>
  )
}
