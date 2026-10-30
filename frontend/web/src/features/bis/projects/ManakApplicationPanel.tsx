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
  /** The edit waiting on the debounce timer, so closing the panel can still save it. */
  const pending = useRef<{ projectId: string; form: BisApplicationDetailsForm } | null>(null)
  /** Bumped per save; only the newest save may mark the form clean. */
  const saveSeq = useRef(0)

  // Follow the project when it reloads, unless the user has unsaved edits.
  useEffect(() => {
    if (!merged || dirty.current) return
    setForm(rowToBisApplicationDetailsForm(merged))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectRaw, row?.id])

  // Closing the dialog or changing step within the 700 ms debounce used to drop the last edit:
  // flush it instead of just clearing the timer.
  useEffect(() => () => {
    if (timer.current) window.clearTimeout(timer.current)
    timer.current = null
    const last = pending.current
    pending.current = null
    if (last) {
      void saveBisApplicationDetails(last.projectId, last.form).catch((err: unknown) => {
        toast.error(err instanceof Error ? err.message : 'Could not save application details')
      })
    }
  }, [])

  if (!form || !projectId) return null

  const change = (next: BisApplicationDetailsForm) => {
    setForm(next)
    dirty.current = true
    setStatus('saving')
    if (timer.current) window.clearTimeout(timer.current)
    pending.current = { projectId, form: next }
    timer.current = window.setTimeout(() => {
      timer.current = null
      pending.current = null
      const seq = ++saveSeq.current
      void saveBisApplicationDetails(projectId, next)
        .then(() => {
          // A newer edit is still waiting or saving: keep the form dirty so the reload triggered
          // by onSaved does not overwrite what the user is typing.
          if (seq !== saveSeq.current || timer.current) return
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
