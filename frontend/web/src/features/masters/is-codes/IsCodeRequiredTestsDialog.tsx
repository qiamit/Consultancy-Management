import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Check,
  CheckCheck,
  History,
  Lock,
  Pencil,
  Plus,
  Save,
  Sparkles,
  Trash2,
  Unlock,
  X,
} from 'lucide-react'
import { toast } from 'sonner'
import { useIsLaboratoryDirector } from '@/components/lims/LaboratoryDirectorOnly'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { SavedValueSuggestInput, uniqueSavedColumnValues } from '@/features/bis/projects/SavedValueSuggestInput'
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
  fetchStandardRevisions,
  fetchTestsFromPastChecks,
  markStandardReviewed,
  saveRequiredTests,
  setRequiredTestsLocked,
  standardRevisionText,
  type RequiredTest,
  type StandardRevision,
} from './requiredTestsApi'
import { RequiredTestsAiDialog } from './RequiredTestsAiDialog'
import { finalProductTestName, formatRequirement } from './requirementText'
import { InsertSymbolButton } from './InsertSymbolButton'
import { insertIntoInput } from './scientificSymbols'

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

let rowSeq = 0
/** A key for a row on screen that is not saved yet (select box, Up / Down). */
const newRowKey = () => `new-${Date.now().toString(36)}-${(rowSeq += 1)}`
const withKey = (t: RequiredTest): RequiredTest => (t.rowKey ? t : { ...t, rowKey: t.id ?? newRowKey() })
const rowKeyOf = (t: RequiredTest, i: number) => t.rowKey ?? t.id ?? `row-${i}`

/**
 * The entry row's starting values: those of the last added test (owner, 25 Nov 2026), except its name. Clear a field
 * and type to pick from the values the list already has.
 */
const defaultsFrom = (t: RequiredTest | undefined): RequiredTest =>
  t
    ? {
        ...emptyTest(),
        clause: t.clause,
        testMethod: t.testMethod,
        unit: t.unit,
        requirement: t.requirement,
        testedBy: t.testedBy,
        possibleInADay: t.possibleInADay,
      }
    : emptyTest()

/** The test added last: the newest saved row (created_at), else the last row. */
function lastAddedOf(list: RequiredTest[]): RequiredTest | undefined {
  let best: RequiredTest | undefined
  for (const t of list) if (!best || (t.createdAt ?? '') >= (best.createdAt ?? '')) best = t
  return best
}

/** Adds the tests that are not in the list yet; returns the new list and how many were added. */
function mergeTests(list: RequiredTest[], extra: RequiredTest[]): { next: RequiredTest[]; added: number } {
  const have = new Set(list.map(keyOf))
  const fresh = extra.filter((t) => {
    const k = keyOf(t)
    if (!t.testName.trim() || have.has(k)) return false
    have.add(k)
    return true
  })
  return { next: [...list.filter((t) => t.testName.trim() || t.clause || t.requirement), ...fresh.map(withKey)], added: fresh.length }
}

/**
 * Clause order, small to big (owner, 25 Nov 2026): 7.1 < 7.2 < 7.10 < 10.1 < 11.5 < 12.1, numbers before words
 * ("Annex B", "Table 2"), and rows without a clause last. Tests with the same clause keep their order.
 */
function compareClause(a: string, b: string): number {
  const x = a.trim()
  const y = b.trim()
  if (!x || !y) return x ? -1 : y ? 1 : 0
  return x.localeCompare(y, undefined, { numeric: true, sensitivity: 'base' })
}

/**
 * The list in clause order: when it is loaded or saved, and after "Suggest With AI" / "From Past Checks" add rows. A
 * row added by hand stays at the bottom while it is typed, and takes its place on Save.
 */
function sortByClause(list: RequiredTest[]): RequiredTest[] {
  return [...list].sort((p, q) => compareClause(p.clause, q.clause))
}

/** Puts a row before the first row with a later clause and leaves the others where they are (a hand-made order). */
function insertByClause(list: RequiredTest[], row: RequiredTest): RequiredTest[] {
  const at = list.findIndex((t) => compareClause(row.clause, t.clause) < 0)
  return at < 0 ? [...list, row] : [...list.slice(0, at), row, ...list.slice(at)]
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
  selection,
  onListChange,
  onRevisedChange,
  readOnly = false,
  layer = 'stacked',
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  isCodeId: string | null
  isLabel: string
  /** Factory Test Report: a tick per saved test puts it on the report. */
  selection?: {
    selectedIds: Set<string>
    onToggle: (test: RequiredTest, checked: boolean) => void
    onToggleMany: (tests: RequiredTest[], checked: boolean) => void
  }
  /** After loading and after saving: the list in order, and the saved tests whose fields changed. */
  onListChange?: (tests: RequiredTest[], changed: RequiredTest[]) => void
  /** The "Standard Revised — Review" flag of this list changed (loaded, reviewed, unlocked). */
  onRevisedChange?: (isCodeId: string, revised: boolean) => void
  readOnly?: boolean
  layer?: 'stacked' | 'overlay'
}) {
  const [tests, setTests] = useState<RequiredTest[]>([])
  const [notes, setNotes] = useState('')
  const [lockedAt, setLockedAt] = useState<string | null>(null)
  const [revision, setRevision] = useState<StandardRevision | null>(null)
  const isAdmin = useIsLaboratoryDirector()
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [dirty, setDirty] = useState(false)
  const [aiSources, setAiSources] = useState<string[]>([])
  /**
   * Owner, 25 Nov 2026: a blank entry row above the first test with "+", and Edit / Delete on the tests below (the
   * pattern of the other module tables). `draft` is that entry row; `editingIndex` the one test open for editing.
   */
  const [draft, setDraft] = useState<RequiredTest>(emptyTest)
  const [editingIndex, setEditingIndex] = useState<number | null>(null)
  /** Rows moved Up / Down by hand: keep that order (saved with the list) instead of the default clause order. */
  const [customOrder, setCustomOrder] = useState(false)
  /** The select box of each row (Delete Selected). */
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(() => new Set())
  /** The field "Insert Symbol" writes into: the last one typed in, else the entry row's Requirement. */
  const lastFieldRef = useRef<HTMLInputElement | null>(null)
  const draftRequirementRef = useRef<HTMLInputElement | null>(null)
  /** The saved list as loaded, to tell which tests a save changed. */
  const savedRef = useRef(new Map<string, string>())
  const snapshot = (list: RequiredTest[]) =>
    new Map(list.filter((t) => t.id).map((t) => [t.id!, JSON.stringify([t.testName, t.clause, t.testMethod, t.unit, t.requirement])]))

  /** "Standard Revised — Review": did the library get a new edition / amendment of the own Standard since the lock? */
  const loadRevision = async (id: string, stillOpen: () => boolean = () => true) => {
    const [r] = await fetchStandardRevisions([id])
    if (!stillOpen()) return
    setRevision(r ?? null)
    onRevisedChange?.(id, Boolean(r?.revised))
  }

  const markReviewed = async () => {
    if (!isCodeId) return
    setBusy('Marking the Revised Standard as Reviewed…')
    try {
      await markStandardReviewed(isCodeId)
      toast.success('Marked as Reviewed — the List Now Follows the Standard in the Library.')
      await loadRevision(isCodeId)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could Not Mark It as Reviewed.')
    } finally {
      setBusy(null)
    }
  }

  useEffect(() => {
    if (!open || !isCodeId) return
    let live = true
    setLoading(true)
    setDirty(false)
    setAiSources([])
    setDraft(emptyTest())
    setEditingIndex(null)
    setSelectedKeys(new Set())
    fetchRequiredTests(isCodeId)
      .then((list) => {
        if (!live) return
        const shown = list.customOrder ? list.tests : sortByClause(list.tests)
        setTests(shown)
        setCustomOrder(list.customOrder)
        setDraft(defaultsFrom(lastAddedOf(list.tests)))
        setNotes(list.notes)
        setLockedAt(list.lockedAt)
        savedRef.current = snapshot(list.tests)
        onListChange?.(shown, [])
        setRevision(null)
        if (list.lockedAt) void loadRevision(isCodeId, () => live)
      })
      .catch((err: unknown) => toast.error(err instanceof Error ? err.message : 'Could Not Load the Required Tests.'))
      .finally(() => live && setLoading(false))
    return () => {
      live = false
    }
  }, [open, isCodeId])

  const locked = Boolean(lockedAt)
  const disabled = readOnly || locked || loading || busy !== null

  const update = (i: number, patch: Partial<RequiredTest>) => {
    setTests((prev) => prev.map((t, k) => (k === i ? { ...t, ...patch } : t)))
    setDirty(true)
  }

  const updateDraft = (patch: Partial<RequiredTest>) => {
    setDraft((prev) => ({ ...prev, ...patch }))
    setDirty(true)
  }

  /** The entry row as a test, with its requirement in the usual form ("≤ 0.12 %" → "0.12 % Maximum"). */
  const draftTest = (): RequiredTest | null =>
    draft.testName.trim() ? { ...draft, requirement: formatRequirement(draft.requirement, draft.unit) } : null

  /** "+": the entry row joins the list in its clause place, and the entry row is blank again. */
  const addDraft = () => {
    const row = draftTest()
    if (!row) {
      toast.error('Enter the Test Name First.')
      return
    }
    if (tests.some((t) => keyOf(t) === keyOf(row))) {
      toast.error(`${row.testName.trim()} Is Already in the List.`)
      return
    }
    const added = { ...row, rowKey: newRowKey() }
    setTests((prev) => insertByClause(prev, added))
    setDraft(defaultsFrom(added))
    setEditingIndex(null)
    setDirty(true)
  }

  /** Edit opens a test's fields; the second click (✓) closes them and the test moves to its clause place. */
  const toggleEdit = (i: number) => {
    if (editingIndex === i) {
      setEditingIndex(null)
      if (!customOrder) setTests((prev) => sortByClause(prev))
    } else {
      setEditingIndex(i)
    }
  }

  /** Up / Down (in place of the serial number): the list keeps this hand-made order from now on. */
  const moveRow = (i: number, dir: -1 | 1) => {
    const j = i + dir
    if (j < 0 || j >= tests.length) return
    setTests((prev) => {
      const next = [...prev]
      ;[next[i], next[j]] = [next[j], next[i]]
      return next
    })
    setEditingIndex((e) => (e === i ? j : e === j ? i : e))
    setCustomOrder(true)
    setDirty(true)
  }

  /** The Clause header: back to the default clause order. */
  const sortNow = () => {
    const next = sortByClause(tests)
    const changed = next.some((t, k) => t !== tests[k])
    setTests(next)
    setEditingIndex(null)
    if (changed || customOrder) setDirty(true)
    setCustomOrder(false)
  }

  /** New rows from AI / Past Checks: in clause order, or slotted in by clause when the list is arranged by hand. */
  const placeNew = (next: RequiredTest[], added: number) => {
    if (!customOrder) return sortByClause(next)
    const kept = next.slice(0, next.length - added)
    return next.slice(next.length - added).reduce((acc, r) => insertByClause(acc, r), kept)
  }

  const toggleSelected = (key: string, checked: boolean) =>
    setSelectedKeys((prev) => {
      const next = new Set(prev)
      if (checked) next.add(key)
      else next.delete(key)
      return next
    })

  const deleteSelected = () => {
    const n = selectedKeys.size
    if (!n) return
    setTests((prev) => prev.filter((t, i) => !selectedKeys.has(rowKeyOf(t, i))))
    setSelectedKeys(new Set())
    setEditingIndex(null)
    setDirty(true)
    toast.success(`${n} ${n === 1 ? 'Test' : 'Tests'} Removed. Click Save to Keep the Change.`)
  }

  const insertSymbol = (symbol: string) => {
    let el = lastFieldRef.current
    if (!el || !el.isConnected || el.readOnly || el.disabled) el = draftRequirementRef.current
    if (!el || el.disabled) return
    lastFieldRef.current = el
    insertIntoInput(el, symbol)
  }

  /**
   * "Suggest With AI" opens its own window (owner, 25 Nov 2026): instructions by text or voice, the sources, the steps,
   * and the tests found. The ticked ones join the list here, in clause order (or slotted in by clause).
   */
  const [aiOpen, setAiOpen] = useState(false)
  const addFromAi = (found: RequiredTest[], sources: string[], model?: string) => {
    const { next, added } = mergeTests(tests, found)
    setTests(placeNew(next, added))
    setAiSources(sources)
    if (added) setDirty(true)
    toast.success(`${added} ${added === 1 ? 'Test' : 'Tests'} Added From AI. Review, Then Save.`, {
      description: model ? `AI Model: ${model}` : undefined,
    })
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
      setTests(placeNew(next, added))
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
      // A filled entry row not yet added with "+" is saved too.
      const pending = draftTest()
      const list0 = pending && !tests.some((t) => keyOf(t) === keyOf(pending)) ? insertByClause(tests, pending) : tests
      const { kept } = await saveRequiredTests(isCodeId, isLabel, list0, notes, customOrder)
      const list = await fetchRequiredTests(isCodeId)
      const before = savedRef.current
      const after = snapshot(list.tests)
      savedRef.current = after
      const shown = customOrder ? list.tests : sortByClause(list.tests)
      setTests(shown)
      setDraft(defaultsFrom(lastAddedOf(list.tests)))
      setEditingIndex(null)
      setSelectedKeys(new Set())
      setDirty(false)
      onListChange?.(shown, list.tests.filter((t) => t.id && before.has(t.id) && before.get(t.id) !== after.get(t.id)))
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
      if (locked) {
        setRevision(null)
        onRevisedChange?.(isCodeId, false)
      } else {
        void loadRevision(isCodeId)
      }
      toast.success(locked ? 'List Unlocked — It Can Be Changed Now.' : 'List Locked — The Conformity Check Will Rely on It.')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could Not Change the Lock.')
    } finally {
      setBusy(null)
    }
  }

  const saved = tests.filter((t) => t.id)
  const ticked = selection ? saved.filter((t) => selection.selectedIds.has(t.id!)) : []

  // Header buttons show only their icon (owner, 25 Nov 2026: "label hata kar only button"); the name is the tooltip.
  const iconBtnClass = cn(limsOutlineBtnClass, 'w-10 px-0')
  // Every value in the table is centred, except Test Name, which starts at the left (owner, 25 Nov 2026).
  const cellInputClass = cn(limsFieldClass, 'h-7 text-center text-xs')
  const suggestions = {
    testName: uniqueSavedColumnValues(tests.map((t) => t.testName)),
    clause: uniqueSavedColumnValues(tests.map((t) => t.clause)),
    testMethod: uniqueSavedColumnValues(tests.map((t) => t.testMethod)),
    unit: uniqueSavedColumnValues(tests.map((t) => t.unit)),
    requirement: uniqueSavedColumnValues(tests.map((t) => t.requirement)),
  }
  const addOnEnter = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.defaultPrevented) {
      e.preventDefault()
      addDraft()
    }
  }
  const allKeys = tests.map(rowKeyOf)
  const allSelected = allKeys.length > 0 && allKeys.every((k) => selectedKeys.has(k))

  return (
    <Dialog open={open} onOpenChange={(next) => busy === null && onOpenChange(next)}>
      <DialogContent
        persistOnFocusLoss
        layer={layer}
        aria-describedby={undefined}
        // The ✕ sits with the header buttons (the raised header hid the corner one; owner, 25 Nov 2026).
        showCloseButton={false}
        className={cn(
          // Fills the content area beside the docked sidebar (full width on phones / with the sidebar collapsed).
          '!flex h-[100dvh] max-h-[100dvh] w-full max-w-none translate-x-0 translate-y-0 flex-col gap-0 overflow-hidden rounded-none border-0 bg-white p-0 shadow-none sm:rounded-none',
          limsFullscreenDialogClass,
          'border-stone-600 ring-1 ring-amber-700/20',
          '[&>button]:!rounded-none [&>button]:text-white [&>button]:opacity-100 [&>button]:hover:bg-white/10',
        )}
      >
        <div className="relative z-20 shrink-0 bg-gradient-to-br from-stone-800 via-stone-900 to-stone-950 px-4 py-2.5 text-white">
          <div className="pointer-events-none absolute inset-0 opacity-[0.18]" style={limsDarkBarGlowStyle} />
          <div className="absolute bottom-0 left-0 h-[2px] w-full bg-gradient-to-r from-amber-500 via-amber-300 to-transparent" />
          {/* One line: the title (with the IS) on the left, the icon buttons on the right. The lock state and Unsaved
              Changes are in the footer beside Lock List (owner, 25 Nov 2026). */}
          <div className="relative flex flex-wrap items-center gap-x-4 gap-y-2">
            <DialogHeader className="min-w-0 flex-1 text-left">
              <DialogTitle className="truncate text-base font-semibold tracking-tight text-white max-sm:whitespace-normal max-sm:text-sm">{/* Phones: wraps so the IS stays readable beside the buttons. */}
                Required Tests{isLabel ? ` — ${isLabel}` : ''}
              </DialogTitle>
            </DialogHeader>
            <div className="flex flex-wrap items-center justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                className={iconBtnClass}
                disabled={disabled}
                title="Suggest With AI"
                aria-label="Suggest With AI"
                onClick={() => setAiOpen(true)}
              >
                <Sparkles size={16} aria-hidden />
              </Button>
              <Button
                type="button"
                variant="outline"
                className={iconBtnClass}
                disabled={disabled}
                title="From Past Checks"
                aria-label="From Past Checks"
                onClick={() => void runPastChecks()}
              >
                <History size={16} aria-hidden />
              </Button>
              <InsertSymbolButton disabled={disabled} onInsert={insertSymbol} />
              <Button
                type="button"
                variant="outline"
                className={cn(iconBtnClass, 'ml-1 hover:!bg-red-500/20 hover:!text-red-600')}
                disabled={busy !== null}
                title="Close"
                aria-label="Close"
                onClick={() => onOpenChange(false)}
              >
                <X size={18} strokeWidth={2.4} aria-hidden />
              </Button>
            </div>
          </div>
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden bg-gradient-to-b from-stone-100/80 to-white px-4 py-3">
          {busy ? <p className="border-l-2 border-amber-600 bg-amber-50 px-3 py-1.5 text-xs text-amber-900">{busy}</p> : null}
          {locked && revision?.revised ? (
            <div className="flex flex-wrap items-center gap-2 border-l-2 border-red-600 bg-red-50 px-3 py-2 text-xs text-red-900">
              <AlertTriangle size={15} className="shrink-0" aria-hidden />
              <p className="min-w-0 flex-1">
                <span className="font-semibold">Standard Revised — Review.</span> {standardRevisionText(revision)} Check These Tests
                Against the Revised Standard: Unlock the List to Change It, or Mark It Reviewed if Nothing Changes.
              </p>
              {isAdmin ? (
                <Button
                  type="button"
                  variant="outline"
                  className={cn(limsOutlineBtnClass, 'h-7 gap-1.5 text-xs')}
                  disabled={readOnly || busy !== null}
                  onClick={() => void markReviewed()}
                >
                  <CheckCheck size={14} aria-hidden /> Mark Reviewed
                </Button>
              ) : (
                <span className="text-[11px] text-red-800">An Admin Marks It Reviewed.</span>
              )}
            </div>
          ) : null}
          {/* No "This List Is Locked" banner (owner, 25 Nov 2026: "isko bhi remove kar do"): the Locked badge beside
              Unlock List in the footer says it. */}

          <div
            className="min-h-0 flex-1 overflow-auto border border-stone-400 bg-white"
            onFocusCapture={(e) => {
              const el = e.target
              if (el instanceof HTMLInputElement && el.type === 'text' && !el.readOnly) lastFieldRef.current = el
            }}
          >
            {/* Phones: rt-table turns every test into a card (index.css). */}
            <table className="rt-table w-full min-w-[60rem] border-collapse text-xs max-sm:min-w-0">
              <thead className="sticky top-0 z-10 bg-stone-800 text-[11px] uppercase tracking-wide text-stone-100">
                <tr>
                  <th className="w-8 px-2 py-1.5 text-center">
                    {selection ? (
                      <input
                        type="checkbox"
                        className="h-4 w-4 accent-amber-600"
                        aria-label="Select All Tests for This Report"
                        disabled={readOnly || !saved.length}
                        checked={saved.length > 0 && ticked.length === saved.length}
                        onChange={(e) => selection.onToggleMany(saved, e.target.checked)}
                      />
                    ) : (
                      <input
                        type="checkbox"
                        className="h-4 w-4 accent-amber-600"
                        aria-label="Select All Tests"
                        disabled={disabled || !tests.length}
                        checked={allSelected}
                        onChange={(e) => setSelectedKeys(e.target.checked ? new Set(allKeys) : new Set())}
                      />
                    )}
                  </th>
                  <th className="w-16 px-2 py-1.5 text-center" title="Move a Test Up or Down">Move</th>
                  <th className="px-2 py-1.5 pl-4 text-left">Test Name</th>
                  <th className="w-32 px-2 py-1.5 text-center">
                    <button
                      type="button"
                      className="inline-flex items-center gap-1 uppercase tracking-wide disabled:opacity-60"
                      title="Sort by Clause, Small to Big"
                      disabled={disabled}
                      onClick={sortNow}
                    >
                      Clause <ArrowUpDown size={12} aria-hidden />
                    </button>
                  </th>
                  <th className="w-40 px-2 py-1.5 text-center">Test Method</th>
                  <th className="w-24 px-2 py-1.5 text-center">Unit</th>
                  <th className="px-2 py-1.5 text-center">Requirement</th>
                  <th className="w-24 px-2 py-1.5 text-center" title="Possible Test in a Day">PT in a Day</th>
                  <th className="w-20 px-2 py-1.5 text-center">Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={9} className="px-3 py-6 text-center text-stone-500">
                      Loading…
                    </td>
                  </tr>
                ) : (
                  <>
                    {/* The entry row: it starts with the last added test's values; clear a field and type to pick a value
                        the list already has. "+" or Enter adds the test in its clause place. */}
                    {!readOnly && !locked ? (
                      <tr className="rt-new border-t border-stone-300 bg-amber-50/70 align-middle">
                        <td />
                        <td className="px-2 py-1 text-center text-[10px] font-semibold uppercase text-amber-800">New</td>
                        <td className="px-1 py-1">
                          <SavedValueSuggestInput
                            className={cn(cellInputClass, '!text-left')}
                            value={draft.testName}
                            suggestions={suggestions.testName}
                            placeholder="Test Name"
                            ariaLabel="New Test Name"
                            disabled={disabled}
                            onChange={(v) => updateDraft({ testName: v })}
                            onKeyDown={addOnEnter}
                          />
                        </td>
                        <td className="px-1 py-1" data-label="Clause">
                          <SavedValueSuggestInput
                            className={cellInputClass}
                            value={draft.clause}
                            suggestions={suggestions.clause}
                            placeholder="Clause"
                            ariaLabel="New Test Clause"
                            disabled={disabled}
                            onChange={(v) => updateDraft({ clause: v })}
                            onKeyDown={addOnEnter}
                          />
                        </td>
                        <td className="px-1 py-1" data-label="Test Method">
                          <SavedValueSuggestInput
                            className={cellInputClass}
                            value={draft.testMethod}
                            suggestions={suggestions.testMethod}
                            placeholder="Test Method"
                            ariaLabel="New Test Method"
                            disabled={disabled}
                            onChange={(v) => updateDraft({ testMethod: v })}
                            onKeyDown={addOnEnter}
                          />
                        </td>
                        <td className="px-1 py-1" data-label="Unit">
                          <SavedValueSuggestInput
                            className={cellInputClass}
                            value={draft.unit}
                            suggestions={suggestions.unit}
                            placeholder="Unit"
                            ariaLabel="New Test Unit"
                            disabled={disabled}
                            onChange={(v) => updateDraft({ unit: v })}
                            onKeyDown={addOnEnter}
                          />
                        </td>
                        <td className="px-1 py-1" data-label="Requirement">
                          <SavedValueSuggestInput
                            inputRef={draftRequirementRef}
                            className={cellInputClass}
                            value={draft.requirement}
                            suggestions={suggestions.requirement}
                            placeholder="Requirement"
                            ariaLabel="New Test Requirement"
                            disabled={disabled}
                            onChange={(v) => updateDraft({ requirement: v })}
                            onBlur={(e) => {
                              const next = formatRequirement(e.target.value, draft.unit)
                              if (next !== e.target.value) updateDraft({ requirement: next })
                            }}
                            onKeyDown={addOnEnter}
                          />
                        </td>
                        <td className="px-1 py-1 text-center" data-label="PT in a Day">
                          <input
                            type="checkbox"
                            className="h-4 w-4 accent-amber-700"
                            checked={draft.possibleInADay}
                            disabled={disabled}
                            aria-label="New Test: Possible Test in a Day"
                            onChange={(e) => updateDraft({ possibleInADay: e.target.checked })}
                          />
                        </td>
                        <td className="px-1 py-1">
                          <div className="flex items-center justify-center">
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              className="h-7 w-7 rounded-none p-0 text-amber-800 hover:bg-amber-100"
                              disabled={disabled || !draft.testName.trim()}
                              title="Add Test"
                              aria-label="Add Test"
                              onClick={addDraft}
                            >
                              <Plus size={15} />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ) : null}
                    {tests.length === 0 ? (
                      <tr>
                        <td colSpan={9} className="px-3 py-6 text-center text-stone-500">
                          {readOnly || locked
                            ? 'No Tests Yet.'
                            : 'No Tests Yet. Fill the New Row Above and Click +, or Use Suggest With AI or From Past Checks.'}
                        </td>
                      </tr>
                    ) : (
                      tests.map((t, i) => {
                        const key = rowKeyOf(t, i)
                        const editing = editingIndex === i
                        const fieldClass = cn(cellInputClass, !editing && 'cursor-default focus-visible:ring-0')
                        const doneOnEnter = (e: KeyboardEvent<HTMLInputElement>) => {
                          if (editing && e.key === 'Enter') {
                            e.preventDefault()
                            toggleEdit(i)
                          }
                        }
                        return (
                          <tr
                            key={key}
                            className={cn(
                              'border-t border-stone-200 align-middle odd:bg-stone-50/60',
                              (editing || (!selection && selectedKeys.has(key))) && '!bg-amber-50/70',
                            )}
                          >
                            <td className="px-2 py-1 text-center">
                              {selection ? (
                                <input
                                  type="checkbox"
                                  className="h-4 w-4 accent-amber-700"
                                  aria-label={`Select ${t.testName || 'Test'} for This Report`}
                                  title={t.id ? undefined : 'Save the List First'}
                                  disabled={readOnly || !t.id}
                                  checked={Boolean(t.id && selection.selectedIds.has(t.id))}
                                  onChange={(e) => selection.onToggle(t, e.target.checked)}
                                />
                              ) : (
                                <input
                                  type="checkbox"
                                  className="h-4 w-4 accent-amber-700"
                                  aria-label={`Select ${t.testName || 'Test'}`}
                                  disabled={disabled}
                                  checked={selectedKeys.has(key)}
                                  onChange={(e) => toggleSelected(key, e.target.checked)}
                                />
                              )}
                            </td>
                            <td className="px-1 py-1">
                              <div className="flex items-center justify-center gap-0.5">
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="ghost"
                                  className="h-6 w-6 rounded-none p-0 text-stone-700 hover:bg-stone-100"
                                  disabled={disabled || i === 0}
                                  title="Move Up"
                                  aria-label={`Move ${t.testName || 'Test'} Up`}
                                  onClick={() => moveRow(i, -1)}
                                >
                                  <ArrowUp size={13} />
                                </Button>
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="ghost"
                                  className="h-6 w-6 rounded-none p-0 text-stone-700 hover:bg-stone-100"
                                  disabled={disabled || i === tests.length - 1}
                                  title="Move Down"
                                  aria-label={`Move ${t.testName || 'Test'} Down`}
                                  onClick={() => moveRow(i, 1)}
                                >
                                  <ArrowDown size={13} />
                                </Button>
                              </div>
                            </td>
                            <td className="px-1 py-1">
                              <Input className={cn(fieldClass, '!text-left')} value={t.testName} readOnly={!editing} disabled={disabled} aria-label="Test Name" onKeyDown={doneOnEnter} onChange={(e) => update(i, { testName: e.target.value })} />
                            </td>
                            <td className="px-1 py-1" data-label="Clause">
                              <Input className={fieldClass} value={t.clause} readOnly={!editing} disabled={disabled} aria-label="Clause" onKeyDown={doneOnEnter} onChange={(e) => update(i, { clause: e.target.value })} />
                            </td>
                            <td className="px-1 py-1" data-label="Test Method">
                              <Input className={fieldClass} value={t.testMethod} readOnly={!editing} disabled={disabled} aria-label="Test Method" onKeyDown={doneOnEnter} onChange={(e) => update(i, { testMethod: e.target.value })} />
                            </td>
                            <td className="px-1 py-1" data-label="Unit">
                              <Input className={fieldClass} value={t.unit} readOnly={!editing} disabled={disabled} aria-label="Unit" onKeyDown={doneOnEnter} onChange={(e) => update(i, { unit: e.target.value })} />
                            </td>
                            <td className="px-1 py-1" data-label="Requirement">
                              <Input
                                className={fieldClass}
                                value={t.requirement}
                                readOnly={!editing}
                                disabled={disabled}
                                aria-label="Requirement"
                                onKeyDown={doneOnEnter}
                                onChange={(e) => update(i, { requirement: e.target.value })}
                                // "≤ 0.12 %" typed by hand becomes "0.12 % Maximum"; "8.5 - 10.5 %" becomes "8.5 % - 10.5 %".
                                onBlur={(e) => {
                                  if (!editing) return
                                  const next = formatRequirement(e.target.value, t.unit)
                                  if (next !== e.target.value) update(i, { requirement: next })
                                }}
                              />
                            </td>
                            <td className="px-1 py-1 text-center" data-label="PT in a Day">
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
                              <div className="flex items-center justify-center gap-0.5">
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="ghost"
                                  className="h-7 w-7 rounded-none p-0 text-stone-700 hover:bg-stone-100"
                                  disabled={disabled}
                                  title={editing ? 'Done Editing' : 'Edit Test'}
                                  aria-label={editing ? `Done Editing ${t.testName || 'Test'}` : `Edit ${t.testName || 'Test'}`}
                                  onClick={() => toggleEdit(i)}
                                >
                                  {editing ? <Check size={14} /> : <Pencil size={14} />}
                                </Button>
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="ghost"
                                  className="h-7 w-7 rounded-none p-0 text-red-700 hover:bg-red-50"
                                  disabled={disabled}
                                  title="Delete Test"
                                  aria-label={`Remove ${t.testName || 'Test'}`}
                                  onClick={() => {
                                    setTests((prev) => prev.filter((_, k) => k !== i))
                                    toggleSelected(key, false)
                                    setEditingIndex(null)
                                    setDirty(true)
                                  }}
                                >
                                  <Trash2 size={14} />
                                </Button>
                              </div>
                            </td>
                          </tr>
                        )
                      })
                    )}
                  </>
                )}
              </tbody>
            </table>
          </div>

          {/* The Notes field was removed (owner, 25 Nov 2026: "isko remove karo"); a list's saved notes are kept as they are. */}
          {aiSources.length ? (
            <details className="max-w-md text-[11px] text-stone-600">
              <summary className="cursor-pointer font-semibold">AI Read {aiSources.length} Pages</summary>
              <p className="mt-1 leading-relaxed">{aiSources.join('; ')}</p>
            </details>
          ) : null}
        </div>

        <DialogFooter className="shrink-0 gap-2 border-t border-stone-300 bg-stone-100 px-4 py-3 sm:justify-between">
          {/* The lock state and reminders sit beside Lock List (owner, 25 Nov 2026: "ek hi jagah"). */}
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              className={cn(limsOutlineBtnClass, 'gap-1.5')}
              disabled={readOnly || loading || busy !== null}
              onClick={() => void toggleLock()}
            >
              {locked ? <Unlock size={14} aria-hidden /> : <Lock size={14} aria-hidden />}
              {locked ? 'Unlock List' : 'Lock List'}
            </Button>
            <span
              className={cn(
                'border px-2 py-0.5 text-[11px] font-semibold',
                locked ? 'border-emerald-600 bg-emerald-50 text-emerald-800' : 'border-amber-500 bg-amber-50 text-amber-800',
              )}
            >
              {locked ? 'Locked' : 'Not Locked'}
            </span>
            {locked && revision?.revised ? (
              <span className="border border-red-500 bg-red-50 px-2 py-0.5 text-[11px] font-semibold text-red-800">Standard Revised — Review</span>
            ) : null}
            {dirty ? <span className="text-[11px] font-semibold text-amber-800">Unsaved Changes</span> : null}
            {selection ? (
              <span className="text-[11px] text-stone-600">
                {ticked.length} of {saved.length} Selected for This Report{dirty ? ' — Save to Select New Tests' : ''}
              </span>
            ) : null}
            {!selection && selectedKeys.size ? (
              <Button
                type="button"
                variant="outline"
                className={cn(limsOutlineBtnClass, 'gap-1.5 text-red-700')}
                disabled={disabled}
                onClick={deleteSelected}
              >
                <Trash2 size={14} aria-hidden /> Delete Selected ({selectedKeys.size})
              </Button>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" className={limsOutlineBtnClass} disabled={busy !== null} onClick={() => onOpenChange(false)}>
              Close
            </Button>
            <Button type="button" className={cn(limsPrimaryBtnClass, 'gap-1.5')} disabled={disabled || !dirty} onClick={() => void save()}>
              <Save size={14} aria-hidden /> Save
            </Button>
          </div>
        </DialogFooter>
        <RequiredTestsAiDialog
          open={aiOpen}
          onOpenChange={setAiOpen}
          isCodeId={isCodeId}
          isLabel={isLabel}
          existingKey={(t) => tests.some((x) => keyOf(x) === keyOf(t))}
          listNames={tests.map((t) => t.testName).filter(Boolean)}
          onAdd={addFromAi}
        />
      </DialogContent>
    </Dialog>
  )
}
