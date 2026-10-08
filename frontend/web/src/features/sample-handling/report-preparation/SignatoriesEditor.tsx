import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  DEFAULT_TEST_REPORT_SIGNATURES,
  defaultSignatureShowAfterParts,
  MAX_TEST_REPORT_SIGNATURES,
  normalizeSignatureShowAfterParts,
  TEST_REPORT_SIGNATURE_PART_IDS,
  TEST_REPORT_SIGNATURE_PART_LABELS,
  TEST_REPORT_SIGNATURE_ROLE_OPTIONS,
  type TestReportSignature,
  type TestReportSignatureAfterPart,
} from '@/features/settings/lab-settings/printSettingsTypes'
import type { ActiveUserProfileOption } from '@/features/sample-handling/shared/fetchActiveUserProfiles'
import { limsFieldClass, limsOutlineBtnClass } from '@/lib/limsThemeUi'
import { cn } from '@/lib/utils'

export function defaultFirstSignatures(): TestReportSignature[] {
  return DEFAULT_TEST_REPORT_SIGNATURES.map((s) => ({
    ...s,
    showAfterParts: [...(s.showAfterParts ?? defaultSignatureShowAfterParts())],
  }))
}

const PART_SHORT: Record<TestReportSignatureAfterPart, string> = {
  part_a: 'A',
  part_b: 'B',
  part_c: 'C',
  part_d: 'D',
}

export function SignatoriesEditor({
  idPrefix,
  signatures,
  users,
  usersLoading,
  usersError,
  disabled,
  onChange,
  onSelectUser,
  onAdd,
  onRemove,
}: {
  idPrefix: string
  signatures: TestReportSignature[]
  users: ActiveUserProfileOption[]
  usersLoading?: boolean
  usersError?: string | null
  disabled?: boolean
  onChange: (index: number, partial: Partial<TestReportSignature>) => void
  onSelectUser: (index: number, userId: string) => void
  onAdd: () => void
  onRemove: (index: number) => void
}) {
  const canAdd = signatures.length < MAX_TEST_REPORT_SIGNATURES

  const toggleShowAfterPart = (
    index: number,
    sig: TestReportSignature,
    part: TestReportSignatureAfterPart,
    checked: boolean,
  ) => {
    const current = new Set(
      normalizeSignatureShowAfterParts(sig.showAfterParts, defaultSignatureShowAfterParts()),
    )
    if (checked) current.add(part)
    else current.delete(part)
    onChange(index, {
      showAfterParts: TEST_REPORT_SIGNATURE_PART_IDS.filter((id) => current.has(id)),
    })
  }

  return (
    <div className="space-y-3">
      <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-amber-800">
        Signatories
      </p>

      {usersLoading ? (
        <p className="text-xs text-stone-500">Loading users from User Management…</p>
      ) : null}
      {usersError ? (
        <p className="border-l-2 border-destructive bg-destructive/5 px-3 py-2 text-xs text-destructive">
          {usersError}
        </p>
      ) : null}
      {!usersLoading && !usersError && users.length === 0 ? (
        <p className="text-xs text-stone-500">
          No active users found in User Management. Add users under Settings → User Management.
        </p>
      ) : null}

      <div className="overflow-x-auto border-2 border-stone-500 bg-white shadow-sm ring-1 ring-amber-700/15">
        <table className="w-full min-w-[980px] border-collapse text-sm">
          <thead>
            <tr className="bg-stone-800 text-left text-[11px] font-bold uppercase tracking-[0.12em] text-amber-200">
              <th className="w-12 border-b border-stone-600 px-2 py-2 text-center">Select</th>
              <th className="border-b border-stone-600 px-2 py-2">Role Label</th>
              <th className="border-b border-stone-600 px-2 py-2">Person Name</th>
              <th className="border-b border-stone-600 px-2 py-2 text-center">Designation</th>
              <th className="border-b border-stone-600 px-2 py-2 text-center">Department</th>
              <th className="border-b border-stone-600 px-2 py-2 text-center">Show after</th>
              <th className="w-24 border-b border-stone-600 px-2 py-2 text-center">Required</th>
              <th className="w-14 border-b border-stone-600 px-2 py-2 text-center">Action</th>
            </tr>
          </thead>
          <tbody>
            {signatures.map((sig, index) => {
              const showAfter = new Set(
                normalizeSignatureShowAfterParts(
                  sig.showAfterParts,
                  defaultSignatureShowAfterParts(),
                ),
              )
              return (
                <tr
                  key={index}
                  className={cn(
                    'border-b border-stone-300 bg-white align-middle',
                    sig.enabled === false && 'bg-stone-100/80 opacity-70',
                  )}
                >
                  <td className="px-2 py-2 text-center">
                    <input
                      id={`${idPrefix}-enabled-${index}`}
                      type="checkbox"
                      className="size-4 rounded-none border-stone-500 text-amber-700 focus:ring-amber-500/30"
                      checked={sig.enabled !== false}
                      disabled={disabled}
                      onChange={(e) => onChange(index, { enabled: e.target.checked })}
                      aria-label={`Include signature ${index + 1} on print`}
                      title="Include on print"
                    />
                  </td>
                  <td className="px-2 py-2">
                    <Select
                      value={sig.roleLabel || undefined}
                      onValueChange={(roleLabel) => onChange(index, { roleLabel })}
                      disabled={disabled}
                    >
                      <SelectTrigger id={`${idPrefix}-role-${index}`} className="h-8 min-w-[8rem]">
                        <SelectValue placeholder="Select role" />
                      </SelectTrigger>
                      <SelectContent>
                        {TEST_REPORT_SIGNATURE_ROLE_OPTIONS.map((role) => (
                          <SelectItem key={role} value={role}>
                            {role}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </td>
                  <td className="px-2 py-2">
                    <Select
                      value={sig.userId || undefined}
                      onValueChange={(userId) => onSelectUser(index, userId)}
                      disabled={disabled || usersLoading || users.length === 0}
                    >
                      <SelectTrigger id={`${idPrefix}-user-${index}`} className="h-8 min-w-[10rem]">
                        <SelectValue
                          placeholder={
                            usersLoading
                              ? 'Loading…'
                              : users.length === 0
                                ? 'No users'
                                : 'Select person'
                          }
                        />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">— None —</SelectItem>
                        {sig.userId &&
                        sig.name &&
                        !users.some((u) => u.id === sig.userId) ? (
                          <SelectItem value={sig.userId}>{sig.name}</SelectItem>
                        ) : null}
                        {users.map((user) => (
                          <SelectItem key={user.id} value={user.id}>
                            {user.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </td>
                  <td className="px-2 py-2 text-center">
                    <Input
                      id={`${idPrefix}-designation-${index}`}
                      value={sig.designation}
                      disabled
                      readOnly
                      className={cn(limsFieldClass, 'h-8 text-center')}
                      placeholder="Auto from User Management"
                    />
                  </td>
                  <td className="px-2 py-2 text-center">
                    <Input
                      id={`${idPrefix}-department-${index}`}
                      value={sig.department}
                      disabled
                      readOnly
                      className={cn(limsFieldClass, 'h-8 text-center')}
                      placeholder="Auto from User Management"
                    />
                  </td>
                  <td className="px-2 py-2">
                    <div className="flex flex-wrap items-center justify-center gap-1">
                      {TEST_REPORT_SIGNATURE_PART_IDS.map((part) => {
                        const checked = showAfter.has(part)
                        return (
                          <label
                            key={part}
                            className={cn(
                              'inline-flex cursor-pointer items-center gap-0.5 border px-1.5 py-0.5 text-[10px] font-semibold',
                              checked
                                ? 'border-amber-600/50 bg-amber-50 text-stone-900'
                                : 'border-stone-400 bg-white text-stone-600',
                              disabled && 'cursor-not-allowed opacity-50',
                            )}
                            title={`Show after ${TEST_REPORT_SIGNATURE_PART_LABELS[part]}`}
                          >
                            <input
                              type="checkbox"
                              className="sr-only"
                              checked={checked}
                              disabled={disabled}
                              onChange={(e) =>
                                toggleShowAfterPart(index, sig, part, e.target.checked)
                              }
                              aria-label={`Show signature ${index + 1} after ${TEST_REPORT_SIGNATURE_PART_LABELS[part]}`}
                            />
                            {PART_SHORT[part]}
                          </label>
                        )
                      })}
                    </div>
                  </td>
                  <td className="px-2 py-2 text-center">
                    <input
                      id={`${idPrefix}-required-${index}`}
                      type="checkbox"
                      className="size-4 rounded-none border-stone-500 text-amber-700 focus:ring-amber-500/30"
                      checked={Boolean(sig.required)}
                      disabled={disabled}
                      onChange={(e) => onChange(index, { required: e.target.checked })}
                      aria-label={`Required on signature line ${index + 1}`}
                      title="Show on signature line (Required)"
                    />
                  </td>
                  <td className="px-2 py-2 text-center">
                    <button
                      type="button"
                      className="inline-flex size-8 items-center justify-center rounded-none border border-stone-400 bg-white text-base leading-none transition-colors hover:border-red-500 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-40"
                      disabled={disabled}
                      onClick={() => onRemove(index)}
                      aria-label={`Delete signature ${index + 1}`}
                      title="Delete"
                    >
                      <span aria-hidden>🗑️</span>
                    </button>
                  </td>
                </tr>
              )
            })}

            <tr className="bg-stone-50">
              <td colSpan={7} className="px-2 py-2 text-xs text-stone-500">
                {signatures.length === 0
                  ? 'No signatories yet — click + to add.'
                  : `${signatures.filter((s) => s.enabled !== false && s.required).length} required & selected for print · tick A/B/C/D under Show after`}
              </td>
              <td className="px-2 py-2 text-center">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className={cn('size-8 rounded-none p-0', limsOutlineBtnClass)}
                  disabled={disabled || !canAdd}
                  onClick={onAdd}
                  aria-label="Add signature"
                  title={
                    canAdd
                      ? 'Add signature'
                      : `Maximum ${MAX_TEST_REPORT_SIGNATURES} signatures`
                  }
                >
                  <Plus size={16} />
                </Button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  )
}
