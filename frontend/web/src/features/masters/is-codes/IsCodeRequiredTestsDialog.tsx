import { useEffect, useState } from 'react'
import { History, Lock, Plus, Save, Sparkles, Trash2, Unlock } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import {
  limsDarkBarGlowStyle,
  limsFullscreenDialogClass,
  limsFieldClass,
  limsOutlineBtnClass,
  limsPrimaryBtnClass,
} from '@/lib/limsThemeUi'
import { cn } from '@/lib/utils'
import {
  fetchRequiredTests,
  fetchTestsFromPastChecks,
  saveRequiredTests,
  setRequiredTestsLocked,
  type RequiredTest,
} from './requiredTestsApi'
import { suggestRequiredTests } from './requiredTestsAi'
import { finalProductTestName, formatRequirement } from './requirementText'

const emptyTest = (): RequiredTest => ({
  testName: '',
  clause: '',
  testMethod: '',
  unit: '',
  requirement: '',
  appliesTo: '',
  testedBy: 'Lab',
  source: 'Manual Entry',
  possibleInADay: false,
})

const keyOf = (t: RequiredTest) => `${t.testName.trim().toLowerCase()}|${t.appliesTo.trim().toLowerCase()}`

/** Adds the tests that are not in the list yet; returns the new list and how many were added. */
function mergeTests(list: RequiredTest[], extra: RequiredTest[]): { next: RequiredTest[]; added: number } {
  const have = new Set(list.map(keyOf))
  const fresh = extra.filter((t) => {
    const k = keyOf(t)
    if (!t.testName.trim() || have.has(k)) return false
    have.add(k)
    return true
  })
  return { next: [...list.filter((t) => t.testName.trim() || t.clause || t.requirement), ...fresh], added: fresh.length }
}

/**
 * Required Tests of one IS Code: its one list of tests (public.test_parameters), reviewed once and locked. The same
 * rows feed the Factory Test Report of BIS Applications / Licences, the Customer Portal records and the AI Conformity
 * Check. Rows come from "Suggest With AI" (Product Manual + Standard from the standards index), "From Past Checks"
 * (results of earlier AI Conformity Checks) or by hand.
 */
export function IsCodeRequiredTestsDialog({
  open,
  onOpenChange,
  isCodeId,
  isLabel,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  isCodeId: string | null
  isLabel: string
}) {
  const [tests, setTests] = useState<RequiredTest[]>([])
  const [notes, setNotes] = useState('')
  const [lockedAt, setLockedAt] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [dirty, setDirty] = useState(false)
  const [aiSources, setAiSources] = useState<string[]>([])

  useEffect(() => {
    if (!open || !isCodeId) return
    let live = true
    setLoading(true)
    setDirty(false)
    setAiSources([])
    fetchRequiredTests(isCodeId)
      .then((list) => {
        if (!live) return
        setTests(list.tests)
        setNotes(list.notes)
        setLockedAt(list.lockedAt)
      })
      .catch((err: unknown) => toast.error(err instanceof Error ? err.message : 'Could Not Load the Required Tests.'))
      .finally(() => live && setLoading(false))
    return () => {
      live = false
    }
  }, [open, isCodeId])

  const locked = Boolean(lockedAt)
  const disabled = locked || loading || busy !== null

  const update = (i: number, patch: Partial<RequiredTest>) => {
    setTests((prev) => prev.map((t, k) => (k === i ? { ...t, ...patch } : t)))
    setDirty(true)
  }

  const runAi = async () => {
    if (!isCodeId) return
    try {
      const result = await suggestRequiredTests({ isCodeId, isLabel, description: '', onStep: setBusy })
      const { next, added } = mergeTests(tests, result.tests)
      setTests(next)
      setAiSources(result.sources)
      if (added) setDirty(true)
      toast.success(`AI Suggested ${result.tests.length} Tests — ${added} New Added. Review, Then Save.`, {
        description: result.model ? `AI Model: ${result.model}` : undefined,
      })
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'AI Suggestion Failed.')
    } finally {
      setBusy(null)
    }
  }

  const runPastChecks = async () => {
    if (!isCodeId) return
    setBusy('Reading Past AI Conformity Checks…')
    try {
      const past = await fetchTestsFromPastChecks(isCodeId)
      if (!past.length) {
        toast.message('No Past AI Conformity Checks for This IS Code.')
        return
      }
      const { next, added } = mergeTests(
        tests,
        past.map((p) => ({
          testName: finalProductTestName(p.testName),
          clause: p.clause,
          // No method known: the IS Code's own Standard.
          testMethod: isLabel.split(':')[0].trim(),
          unit: '',
          requirement: formatRequirement(p.requirement),
          appliesTo: '',
          testedBy: 'Lab',
          source: 'Past Checks',
          possibleInADay: false,
        })),
      )
      setTests(next)
      if (added) setDirty(true)
      toast.success(`${past.length} Tests Found in Past Checks — ${added} New Added. Review, Then Save.`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could Not Read Past Checks.')
    } finally {
      setBusy(null)
    }
  }

  const save = async () => {
    if (!isCodeId) return
    setBusy('Saving…')
    try {
      const { kept } = await saveRequiredTests(isCodeId, isLabel, tests, notes)
      const list = await fetchRequiredTests(isCodeId)
      setTests(list.tests)
      setDirty(false)
      toast.success(`Required Tests Saved — ${list.tests.length} Tests.`)
      if (kept.length) toast.message(`Still Used Elsewhere, So Not Removed: ${kept.join(', ')}`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could Not Save.')
    } finally {
      setBusy(null)
    }
  }

  const toggleLock = async () => {
    if (!isCodeId) return
    if (!locked && dirty) {
      toast.error('Save the List First, Then Lock It.')
      return
    }
    if (!locked && !tests.some((t) => t.testName.trim())) {
      toast.error('Add at Least One Test Before Locking.')
      return
    }
    setBusy(locked ? 'Unlocking…' : 'Locking…')
    try {
      await setRequiredTestsLocked(isCodeId, !locked)
      setLockedAt(locked ? null : new Date().toISOString())
      toast.success(locked ? 'List Unlocked — It Can Be Changed Now.' : 'List Locked — The Conformity Check Will Rely on It.')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could Not Change the Lock.')
    } finally {
      setBusy(null)
    }
  }

  const labTests = tests.filter((t) => t.testName.trim() && t.testedBy === 'Lab').length

  return (
    <Dialog open={open} onOpenChange={(next) => busy === null && onOpenChange(next)}>
      <DialogContent
        persistOnFocusLoss
        layer="stacked"
        aria-describedby={undefined}
        className={cn(
          // Fills the content area beside the docked sidebar (full width on phones / with the sidebar collapsed).
          '!flex h-[100dvh] max-h-[100dvh] w-full max-w-none translate-x-0 translate-y-0 flex-col gap-0 overflow-hidden rounded-none border-0 bg-white p-0 shadow-none sm:rounded-none',
          limsFullscreenDialogClass,
          'border-stone-600 ring-1 ring-amber-700/20',
          '[&>button]:!rounded-none [&>button]:text-white [&>button]:opacity-100 [&>button]:hover:bg-white/10',
        )}
      >
        <div className="relative shrink-0 overflow-hidden bg-gradient-to-br from-stone-800 via-stone-900 to-stone-950 px-4 py-2.5 text-white">
          <div className="pointer-events-none absolute inset-0 opacity-[0.18]" style={limsDarkBarGlowStyle} />
          <div className="absolute bottom-0 left-0 h-[2px] w-full bg-gradient-to-r from-amber-500 via-amber-300 to-transparent" />
          <DialogHeader className="relative pr-10 text-left">
            <DialogTitle className="flex flex-wrap items-center gap-2 text-base font-semibold tracking-tight text-white">
              Required Tests
              <span
                className={cn(
                  'border px-2 py-0.5 text-[11px] font-semibold',
                  locked ? 'border-emerald-400 bg-emerald-600/30 text-emerald-100' : 'border-amber-400 bg-amber-500/20 text-amber-100',
                )}
              >
                {locked ? 'Locked' : 'Not Locked'}
              </span>
              {dirty ? <span className="text-[11px] font-medium text-amber-200">Unsaved Changes</span> : null}
            </DialogTitle>
            <p className="mt-0.5 line-clamp-2 break-words text-xs text-stone-300">
              {isLabel} — {labTests} Laboratory {labTests === 1 ? 'Test' : 'Tests'}
            </p>
          </DialogHeader>
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden bg-gradient-to-b from-stone-100/80 to-white px-4 py-3">
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Button type="button" variant="outline" className={cn(limsOutlineBtnClass, 'gap-1.5')} disabled={disabled} onClick={() => void runAi()}>
              <Sparkles size={14} aria-hidden /> Suggest With AI
            </Button>
            <Button type="button" variant="outline" className={cn(limsOutlineBtnClass, 'gap-1.5')} disabled={disabled} onClick={() => void runPastChecks()}>
              <History size={14} aria-hidden /> From Past Checks
            </Button>
            <Button
              type="button"
              variant="outline"
              className={cn(limsOutlineBtnClass, 'gap-1.5')}
              disabled={disabled}
              onClick={() => {
                setTests((prev) => [...prev, emptyTest()])
                setDirty(true)
              }}
            >
              <Plus size={14} aria-hidden /> Add Test
            </Button>
          </div>

          {busy ? <p className="border-l-2 border-amber-600 bg-amber-50 px-3 py-1.5 text-xs text-amber-900">{busy}</p> : null}
          {locked ? (
            <p className="border-l-2 border-emerald-600 bg-emerald-50 px-3 py-1.5 text-xs text-emerald-900">
              This List Is Locked. Unlock It to Make Changes.
            </p>
          ) : null}

          <div className="min-h-0 flex-1 overflow-auto border border-stone-400 bg-white">
            <table className="w-full min-w-[60rem] border-collapse text-xs">
              <thead className="sticky top-0 z-10 bg-stone-800 text-left text-[11px] uppercase tracking-wide text-stone-100">
                <tr>
                  <th className="w-8 px-2 py-1.5">#</th>
                  <th className="px-2 py-1.5">Test Name</th>
                  <th className="w-32 px-2 py-1.5 text-center">Clause</th>
                  <th className="w-40 px-2 py-1.5 text-center">Test Method</th>
                  <th className="w-24 px-2 py-1.5 text-center">Unit</th>
                  <th className="px-2 py-1.5 text-center">Requirement</th>
                  <th className="w-28 px-2 py-1.5 text-center">Possible Test in a Day</th>
                  <th className="w-10 px-2 py-1.5" />
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={8} className="px-3 py-6 text-center text-stone-500">
                      Loading…
                    </td>
                  </tr>
                ) : tests.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-3 py-6 text-center text-stone-500">
                      No Tests Yet. Use Suggest With AI, From Past Checks or Add Test.
                    </td>
                  </tr>
                ) : (
                  tests.map((t, i) => (
                    <tr key={t.id ?? `new-${i}`} className="border-t border-stone-200 align-top odd:bg-stone-50/60">
                      <td className="px-2 py-1 text-stone-500 tabular-nums">{i + 1}</td>
                      <td className="px-1 py-1">
                        <Input className={cn(limsFieldClass, 'h-7 text-xs')} value={t.testName} disabled={disabled} onChange={(e) => update(i, { testName: e.target.value })} />
                      </td>
                      <td className="px-1 py-1">
                        <Input className={cn(limsFieldClass, 'h-7 text-center text-xs')} value={t.clause} disabled={disabled} onChange={(e) => update(i, { clause: e.target.value })} />
                      </td>
                      <td className="px-1 py-1">
                        <Input className={cn(limsFieldClass, 'h-7 text-center text-xs')} value={t.testMethod} disabled={disabled} aria-label="Test Method" onChange={(e) => update(i, { testMethod: e.target.value })} />
                      </td>
                      <td className="px-1 py-1">
                        <Input className={cn(limsFieldClass, 'h-7 text-center text-xs')} value={t.unit} disabled={disabled} aria-label="Unit" onChange={(e) => update(i, { unit: e.target.value })} />
                      </td>
                      <td className="px-1 py-1">
                        <Input className={cn(limsFieldClass, 'h-7 text-center text-xs')} value={t.requirement} disabled={disabled} onChange={(e) => update(i, { requirement: e.target.value })}
                          // "≤ 0.12 %" typed by hand becomes "0.12 % Maximum"; "8.5 - 10.5 %" becomes "8.5 % - 10.5 %".
                          onBlur={(e) => {
                            const next = formatRequirement(e.target.value, t.unit)
                            if (next !== e.target.value) update(i, { requirement: next })
                          }}
                        />
                      </td>
                      <td className="px-1 py-1 text-center align-middle">
                        <input
                          type="checkbox"
                          className="h-4 w-4 accent-amber-700"
                          checked={t.possibleInADay}
                          disabled={disabled}
                          aria-label={`${t.testName || 'Test'}: Possible Test in a Day`}
                          onChange={(e) => update(i, { possibleInADay: e.target.checked })}
                        />
                      </td>
                      <td className="px-1 py-1">
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className="h-7 w-7 rounded-none p-0 text-red-700 hover:bg-red-50"
                          disabled={disabled}
                          aria-label={`Remove ${t.testName || 'Test'}`}
                          onClick={() => {
                            setTests((prev) => prev.filter((_, k) => k !== i))
                            setDirty(true)
                          }}
                        >
                          <Trash2 size={14} />
                        </Button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="grid gap-2 md:grid-cols-[1fr_auto]">
            <div className="space-y-0.5">
              <label className="text-[11px] font-semibold text-stone-700" htmlFor="rt-notes">
                Notes
              </label>
              <Input
                id="rt-notes"
                className={limsFieldClass}
                value={notes}
                disabled={disabled}
                placeholder="E.g. Checked Against Amendment 3"
                onChange={(e) => {
                  setNotes(e.target.value)
                  setDirty(true)
                }}
              />
            </div>
            {aiSources.length ? (
              <details className="max-w-md self-end text-[11px] text-stone-600">
                <summary className="cursor-pointer font-semibold">AI Read {aiSources.length} Pages</summary>
                <p className="mt-1 leading-relaxed">{aiSources.join('; ')}</p>
              </details>
            ) : null}
          </div>
        </div>

        <DialogFooter className="shrink-0 gap-2 border-t border-stone-300 bg-stone-100 px-4 py-3 sm:justify-between">
          <Button
            type="button"
            variant="outline"
            className={cn(limsOutlineBtnClass, 'gap-1.5')}
            disabled={loading || busy !== null}
            onClick={() => void toggleLock()}
          >
            {locked ? <Unlock size={14} aria-hidden /> : <Lock size={14} aria-hidden />}
            {locked ? 'Unlock List' : 'Lock List'}
          </Button>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" className={limsOutlineBtnClass} disabled={busy !== null} onClick={() => onOpenChange(false)}>
              Close
            </Button>
            <Button type="button" className={cn(limsPrimaryBtnClass, 'gap-1.5')} disabled={disabled || !dirty} onClick={() => void save()}>
              <Save size={14} aria-hidden /> Save
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
