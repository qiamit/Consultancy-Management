import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import type { BisBranchOfficeRow } from '@/features/masters/bis-branch-offices/bisBranchOfficesApi'
import { ManakApplicationFields } from './ManakApplicationFields'
import { ManakSubPanel } from './ManakStepPages'
import { saveBisApplicationDetails } from './bisProjectsApi'
import { rowToBisApplicationDetailsForm, type BisApplicationDetailsForm, type BisProjectRow } from './types'

/**
 * The same "Application / Licence Details" editor used on Add / Edit Application, placed on step 1
 * (same fields, master-option "+" dialogs, branch office picker, capacity rules).
 * Changes are saved to the project automatically.
 */
export function ManakApplicationPanel({
  row,
  projectRaw,
  branches,
  onSaved,
}: {
  row: BisProjectRow | null
  projectRaw: Record<string, unknown> | null
  branches: BisBranchOfficeRow[]
  onSaved?: () => void
}) {
  const projectId = row?.id ?? null
  const merged = row ? ({ ...row, ...(projectRaw ?? {}) } as BisProjectRow) : null
  const [form, setForm] = useState<BisApplicationDetailsForm | null>(merged ? rowToBisApplicationDetailsForm(merged) : null)
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved'>('idle')
  const dirty = useRef(false)
  const timer = useRef<number | null>(null)

  // Follow the project when it reloads, unless the user has unsaved edits.
  useEffect(() => {
    if (!merged || dirty.current) return
    setForm(rowToBisApplicationDetailsForm(merged))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectRaw, row?.id])

  useEffect(() => () => {
    if (timer.current) window.clearTimeout(timer.current)
  }, [])

  if (!form || !projectId) return null

  const change = (next: BisApplicationDetailsForm) => {
    setForm(next)
    dirty.current = true
    setStatus('saving')
    if (timer.current) window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => {
      timer.current = null
      void saveBisApplicationDetails(projectId, next)
        .then(() => {
          dirty.current = false
          setStatus('saved')
          onSaved?.()
        })
        .catch((err: unknown) => {
          setStatus('idle')
          toast.error(err instanceof Error ? err.message : 'Could not save application details')
        })
    }, 700)
  }

  return (
    <ManakSubPanel
      title="Branch & Application Details"
      headerExtra={
        <span className="text-[11px] font-medium normal-case tracking-normal text-amber-100/80">
          {status === 'saving' ? 'Saving…' : status === 'saved' ? 'Saved' : ''}
        </span>
      }
    >
      <ManakApplicationFields form={form} onChange={change} branchOffices={branches} />
    </ManakSubPanel>
  )
}
