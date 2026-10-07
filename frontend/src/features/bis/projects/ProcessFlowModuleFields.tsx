import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from 'react'
import {
  ArrowDownToLine,
  ArrowRightLeft,
  ChevronDown,
  ChevronUp,
  CornerDownRight,
  FileText,
  GitBranch,
  IndentDecrease,
  IndentIncrease,
  Plus,
  Redo2,
  Settings2,
  Sparkles,
  Square,
  Trash2,
  Undo2,
  X,
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { useShowAiButtons } from '@/hooks/useShowAiAssistant'
import {
  limsDialogSidebarOverlayClass,
  limsDialogSidebarPortalClass,
  limsFieldClass,
  limsOutlineBtnClass,
  limsPrimaryBtnClass,
} from '@/lib/limsThemeUi'
import { cn } from '@/lib/utils'
import { ProcessDescriptionAiDialog } from './ProcessDescriptionAiDialog'
import {
  defaultProcessFlowArrowStyle,
  defaultProcessFlowBoxStyle,
  emptyProcessFlowNode,
  fitProcessFlowFontSize,
  flattenProcessFlowTree,
  groupProcessFlowSiblingRows,
  normalizeProcessFlowHorizontal,
  PROCESS_FLOW_ARROW_DESIGNS,
  processFlowChildren,
  processFlowNodeHasContent,
  reindexProcessFlowSiblings,
  resolveProcessFlowBoxSize,
  type ProcessFlowArrowDesign,
  type ProcessFlowArrowStyle,
  type ProcessFlowBoxStyle,
  type ProcessFlowModulePayload,
  type ProcessFlowNode,
} from './processFlowModel'

const toolBtnClass =
  'inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-none border border-transparent text-amber-950 hover:border-stone-400 hover:bg-amber-100 disabled:opacity-35'

const HISTORY_LIMIT = 80

function cloneProcessFlowPayload(
  payload: ProcessFlowModulePayload,
): ProcessFlowModulePayload {
  return JSON.parse(JSON.stringify(payload)) as ProcessFlowModulePayload
}

type FlowLineProps = {
  color: string
  width: number
  dashed: boolean
}

function flowVertLineStyle({ color, width, dashed }: FlowLineProps) {
  return {
    width,
    backgroundColor: dashed ? ('transparent' as const) : color,
    backgroundImage: dashed
      ? `repeating-linear-gradient(to bottom, ${color} 0 5px, transparent 5px 9px)`
      : undefined,
  }
}

/** Stable module-level — must NOT be defined inside ProcessFlowModuleFields (remounts kill typing). */
function ProcessFlowArrowHead({
  design,
  color,
  width,
}: {
  design: ProcessFlowArrowDesign
  color: string
  width: number
}) {
  const w = 8 + width * 1.2
  const h = 7 + width
  if (design === 'none') return null
  if (design === 'triangle') {
    return (
      <div
        className="-mt-px shrink-0"
        style={{
          width: 0,
          height: 0,
          borderLeft: `${4 + width * 0.8}px solid transparent`,
          borderRight: `${4 + width * 0.8}px solid transparent`,
          borderTop: `${6 + width}px solid ${color}`,
        }}
        aria-hidden
      />
    )
  }
  if (design === 'chevron') {
    return (
      <svg
        className="-mt-0.5 shrink-0"
        width={w}
        height={h}
        viewBox="0 0 12 10"
        aria-hidden
      >
        <path
          d="M2 1.5 L6 8 L10 1.5"
          fill="none"
          stroke={color}
          strokeWidth={1.8}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    )
  }
  if (design === 'diamond') {
    return (
      <svg
        className="-mt-px shrink-0"
        width={w}
        height={h}
        viewBox="0 0 12 12"
        aria-hidden
      >
        <path d="M6 1 L11 6 L6 11 L1 6 Z" fill={color} />
      </svg>
    )
  }
  if (design === 'circle') {
    const r = 3.5 + width * 0.4
    return (
      <div
        className="-mt-px shrink-0 rounded-full"
        style={{
          width: r * 2,
          height: r * 2,
          backgroundColor: color,
        }}
        aria-hidden
      />
    )
  }
  return (
    <div
      className="-mt-px shrink-0"
      style={{
        width: 10 + width,
        height: Math.max(2.5, width + 0.5),
        backgroundColor: color,
      }}
      aria-hidden
    />
  )
}

function ProcessFlowDownArrow({
  gapY,
  design,
  line,
}: {
  gapY: number
  design: ProcessFlowArrowDesign
  line: FlowLineProps
}) {
  return (
    <div
      className="flex shrink-0 flex-col items-center justify-end"
      style={{ height: Math.max(0, gapY) }}
      aria-hidden
    >
      <div className="flex w-full flex-1 justify-center">
        <div className="h-full" style={flowVertLineStyle(line)} />
      </div>
      <ProcessFlowArrowHead
        design={design}
        color={line.color}
        width={line.width}
      />
    </div>
  )
}

function ProcessFlowBranchConnectors({
  count,
  gapY,
  design,
  line,
  children,
}: {
  count: number
  gapY: number
  design: ProcessFlowArrowDesign
  line: FlowLineProps
  children: ReactNode
}) {
  if (count <= 1) {
    return (
      <div className="flex flex-col items-center">
        <ProcessFlowDownArrow gapY={gapY} design={design} line={line} />
        {children}
      </div>
    )
  }
  const gap = Math.max(0, gapY)
  const stemH = Math.round(gap * 0.35)
  const vert = flowVertLineStyle(line)
  return (
    <div className="flex w-max max-w-full flex-col items-center self-center">
      <div
        className="relative z-[1] shrink-0"
        style={{
          ...vert,
          height: stemH + line.width,
          marginBottom: -line.width,
        }}
        aria-hidden
      />
      <div className="relative flex items-start">
        <div
          className="pointer-events-none absolute top-0 z-0"
          style={{
            left: `calc(100% / ${count} / 2)`,
            right: `calc(100% / ${count} / 2)`,
            height: line.width,
            backgroundColor: line.dashed ? 'transparent' : line.color,
            backgroundImage: line.dashed
              ? `repeating-linear-gradient(to right, ${line.color} 0 5px, transparent 5px 9px)`
              : undefined,
          }}
          aria-hidden
        />
        {children}
      </div>
    </div>
  )
}

function ProcessFlowBranchColumn({
  count,
  gapY,
  design,
  line,
  children,
}: {
  index?: number
  count: number
  gapY: number
  design: ProcessFlowArrowDesign
  line: FlowLineProps
  children: ReactNode
}) {
  if (count <= 1) {
    return <div className="flex flex-col items-center">{children}</div>
  }
  const gap = Math.max(0, gapY)
  const dropH = Math.max(0, gap - Math.round(gap * 0.35))
  return (
    <div className="relative z-[1] flex flex-col items-center px-2 sm:px-3">
      <div
        className="flex shrink-0 flex-col items-center"
        style={{ height: dropH }}
        aria-hidden
      >
        <div className="flex-1" style={flowVertLineStyle(line)} />
        <ProcessFlowArrowHead
          design={design}
          color={line.color}
          width={line.width}
        />
      </div>
      {children}
    </div>
  )
}

export function ProcessFlowModuleFields({
  value,
  onChange,
  disabled = false,
  applicantName = '',
  isNumber = '',
  isTitle = '',
  productName = '',
  licenseScope = '',
  isCodeId = null,
}: {
  value: ProcessFlowModulePayload
  onChange: (next: ProcessFlowModulePayload) => void
  disabled?: boolean
  applicantName?: string
  isNumber?: string
  isTitle?: string
  productName?: string
  licenseScope?: string
  isCodeId?: string | null
}) {
  const showAiButtons = useShowAiButtons()
  const [selectedIds, setSelectedIds] = useState<string[]>(() => {
    const first = flattenProcessFlowTree(value.nodes)[0]?.node.id
    return first ? [first] : []
  })
  const [descriptionOpen, setDescriptionOpen] = useState(false)
  const [descriptionAiOpen, setDescriptionAiOpen] = useState(false)
  /** Adjacent settings rail — no modal windows. */
  const [settingsPanel, setSettingsPanel] = useState<'arrow' | 'box' | null>(
    null,
  )
  const [boxDraftWidth, setBoxDraftWidth] = useState('220')
  const [boxDraftHeight, setBoxDraftHeight] = useState('44')
  const [boxDraftGap, setBoxDraftGap] = useState('14')
  const [boxDraftDefaultWidth, setBoxDraftDefaultWidth] = useState('220')
  const [boxDraftDefaultHeight, setBoxDraftDefaultHeight] = useState('44')
  const [focusRequestId, setFocusRequestId] = useState<string | null>(null)
  const [historyTick, setHistoryTick] = useState(0)
  /** Local draft while typing — prevents lost keystrokes from parent re-renders. */
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingLabel, setEditingLabel] = useState('')
  const inputRefs = useRef<Map<string, HTMLInputElement>>(new Map())
  const lastClickedRef = useRef<string | null>(null)
  const pastRef = useRef<ProcessFlowModulePayload[]>([])
  const futureRef = useRef<ProcessFlowModulePayload[]>([])
  const labelHistoryArmedRef = useRef(false)
  const selectedIdsRef = useRef<string[]>(selectedIds)
  selectedIdsRef.current = selectedIds
  const valueRef = useRef(value)
  valueRef.current = value
  /** Freeze font-size while typing so layout doesn't fight the caret. */
  const editingFontSizeRef = useRef(14)

  const arrowStyle = value.arrowStyle ?? defaultProcessFlowArrowStyle()
  const boxStyle = value.boxStyle ?? defaultProcessFlowBoxStyle()
  const canUndo = pastRef.current.length > 0
  const canRedo = futureRef.current.length > 0
  void historyTick

  const flat = flattenProcessFlowTree(value.nodes)
  const primaryId =
    selectedIds.find((id) => value.nodes.some((n) => n.id === id)) ??
    flat[0]?.node.id ??
    null
  const primary = primaryId
    ? (value.nodes.find((n) => n.id === primaryId) ?? null)
    : null
  const canAlignHorizontal =
    selectedIds.length > 0 &&
    selectedIds.every((id) => {
      const n = value.nodes.find((x) => x.id === id)
      if (!n) return false
      const sibs = processFlowChildren(value.nodes, n.parentId)
      return sibs.findIndex((s) => s.id === id) > 0
    })

  useEffect(() => {
    if (!focusRequestId) return
    const id = focusRequestId
    setFocusRequestId(null)
    requestAnimationFrame(() => {
      const el = inputRefs.current.get(id)
      if (!el) return
      el.focus()
      // Only select-all for empty new steps — selecting on every nodes change breaks typing.
      if (!el.value) el.select()
    })
  }, [focusRequestId])

  // Always keep at least one valid box selected (stable when unchanged).
  useEffect(() => {
    const ids = new Set(value.nodes.map((n) => n.id))
    const firstId = flattenProcessFlowTree(value.nodes)[0]?.node.id
    setSelectedIds((prev) => {
      const kept = prev.filter((id) => ids.has(id))
      if (kept.length > 0) {
        if (
          kept.length === prev.length &&
          kept.every((id, i) => id === prev[i])
        ) {
          return prev
        }
        return kept
      }
      return firstId ? [firstId] : []
    })
    if (firstId && !lastClickedRef.current) {
      lastClickedRef.current = firstId
    }
  }, [value.nodes])

  const focusNode = (id: string) => {
    setSelectedIds([id])
    lastClickedRef.current = id
    setFocusRequestId(id)
  }

  const recordHistory = () => {
    pastRef.current = [
      ...pastRef.current,
      cloneProcessFlowPayload(valueRef.current),
    ].slice(-HISTORY_LIMIT)
    futureRef.current = []
    setHistoryTick((t) => t + 1)
  }

  const applyPayload = (
    next: ProcessFlowModulePayload,
    options?: { record?: boolean },
  ) => {
    if (options?.record !== false) recordHistory()
    valueRef.current = next
    onChange(next)
  }

  const undo = () => {
    if (disabled || pastRef.current.length === 0) return
    const prev = pastRef.current[pastRef.current.length - 1]!
    pastRef.current = pastRef.current.slice(0, -1)
    futureRef.current = [
      ...futureRef.current,
      cloneProcessFlowPayload(valueRef.current),
    ].slice(-HISTORY_LIMIT)
    labelHistoryArmedRef.current = false
    const restored = cloneProcessFlowPayload(prev)
    valueRef.current = restored
    onChange(restored)
    setHistoryTick((t) => t + 1)
  }

  const redo = () => {
    if (disabled || futureRef.current.length === 0) return
    const next = futureRef.current[futureRef.current.length - 1]!
    futureRef.current = futureRef.current.slice(0, -1)
    pastRef.current = [
      ...pastRef.current,
      cloneProcessFlowPayload(valueRef.current),
    ].slice(-HISTORY_LIMIT)
    labelHistoryArmedRef.current = false
    const restored = cloneProcessFlowPayload(next)
    valueRef.current = restored
    onChange(restored)
    setHistoryTick((t) => t + 1)
  }

  const setNodes = (nodes: ProcessFlowNode[], record = true) => {
    applyPayload(
      {
        ...valueRef.current,
        nodes: normalizeProcessFlowHorizontal(nodes),
      },
      { record },
    )
  }

  const patchNode = (id: string, patch: Partial<ProcessFlowNode>) => {
    // One history entry per typing burst (until blur).
    if (!labelHistoryArmedRef.current) {
      recordHistory()
      labelHistoryArmedRef.current = true
    }
    const current = valueRef.current
    // Label-only edits skip normalize — avoids tree reshuffles mid-typing.
    const mapped = current.nodes.map((n) =>
      n.id === id ? { ...n, ...patch } : n,
    )
    const nextNodes =
      patch.label !== undefined && Object.keys(patch).length === 1
        ? mapped
        : normalizeProcessFlowHorizontal(mapped)
    const next = { ...current, nodes: nextNodes }
    valueRef.current = next
    onChange(next)
  }

  const patchArrowStyle = (partial: Partial<ProcessFlowArrowStyle>) => {
    applyPayload({
      ...valueRef.current,
      arrowStyle: {
        ...(valueRef.current.arrowStyle ?? defaultProcessFlowArrowStyle()),
        ...partial,
      },
    })
  }

  const patchBoxStyle = (partial: Partial<ProcessFlowBoxStyle>) => {
    applyPayload({
      ...valueRef.current,
      boxStyle: {
        ...(valueRef.current.boxStyle ?? defaultProcessFlowBoxStyle()),
        ...partial,
      },
    })
  }

  /** Apply width/height to all currently selected boxes. */
  const patchSelectedBoxSize = (partial: {
    boxWidth?: number | null
    boxHeight?: number | null
  }) => {
    const ids = selectedIdsRef.current
    if (ids.length === 0) return
    const idSet = new Set(ids)
    applyPayload({
      ...valueRef.current,
      nodes: valueRef.current.nodes.map((n) =>
        idSet.has(n.id) ? { ...n, ...partial } : n,
      ),
    })
  }

  const syncBoxSettingsDrafts = () => {
    const style = valueRef.current.boxStyle ?? defaultProcessFlowBoxStyle()
    const ids = selectedIdsRef.current
    const sampleNode =
      ids.length > 0
        ? (valueRef.current.nodes.find((n) => n.id === ids[ids.length - 1]!) ??
          null)
        : null
    const sample = sampleNode
      ? resolveProcessFlowBoxSize(sampleNode, style)
      : { width: style.width, height: style.height }
    setBoxDraftWidth(String(Math.round(sample.width)))
    setBoxDraftHeight(String(Math.round(sample.height)))
    setBoxDraftGap(String(Math.round(style.gapY)))
    setBoxDraftDefaultWidth(String(Math.round(style.width)))
    setBoxDraftDefaultHeight(String(Math.round(style.height)))
  }

  const applyDraftPx = (
    raw: string,
    min: number,
    max: number,
  ): number | null => {
    const n = Number(raw)
    if (!Number.isFinite(n)) {
      toast.error('Enter a valid number in px')
      return null
    }
    return Math.min(max, Math.max(min, Math.round(n)))
  }

  const applyBoxDraftWidth = () => {
    const w = applyDraftPx(boxDraftWidth, 80, 480)
    if (w == null) return
    setBoxDraftWidth(String(w))
    patchSelectedBoxSize({ boxWidth: w })
  }

  const applyBoxDraftHeight = () => {
    const h = applyDraftPx(boxDraftHeight, 28, 120)
    if (h == null) return
    setBoxDraftHeight(String(h))
    patchSelectedBoxSize({ boxHeight: h })
  }

  const applyBoxDraftGap = () => {
    const g = applyDraftPx(boxDraftGap, 0, 120)
    if (g == null) return
    setBoxDraftGap(String(g))
    patchBoxStyle({ gapY: g })
  }

  const applyBoxDraftDefaultWidth = () => {
    const w = applyDraftPx(boxDraftDefaultWidth, 80, 480)
    if (w == null) return
    setBoxDraftDefaultWidth(String(w))
    patchBoxStyle({ width: w })
  }

  const applyBoxDraftDefaultHeight = () => {
    const h = applyDraftPx(boxDraftDefaultHeight, 28, 120)
    if (h == null) return
    setBoxDraftDefaultHeight(String(h))
    patchBoxStyle({ height: h })
  }

  const onLabelBlur = () => {
    labelHistoryArmedRef.current = false
    setEditingId(null)
  }

  const selectOnCanvas = (id: string, e: { metaKey: boolean; ctrlKey: boolean; shiftKey: boolean }) => {
    if (e.metaKey || e.ctrlKey) {
      setSelectedIds((prev) => {
        if (prev.includes(id)) {
          if (prev.length <= 1) return prev
          return prev.filter((x) => x !== id)
        }
        return [...prev, id]
      })
      lastClickedRef.current = id
      return
    }
    if (e.shiftKey && lastClickedRef.current) {
      const a = flat.findIndex((r) => r.node.id === lastClickedRef.current)
      const b = flat.findIndex((r) => r.node.id === id)
      if (a >= 0 && b >= 0) {
        const lo = Math.min(a, b)
        const hi = Math.max(a, b)
        setSelectedIds(flat.slice(lo, hi + 1).map((r) => r.node.id))
        return
      }
    }
    setSelectedIds([id])
    lastClickedRef.current = id
  }

  const addRoot = () => {
    if (disabled) return
    const roots = processFlowChildren(value.nodes, null)
    const node = emptyProcessFlowNode({
      label: '',
      sortOrder: roots.length,
    })
    setNodes([...value.nodes, node])
    focusNode(node.id)
  }

  const addChild = (parentId: string) => {
    if (disabled) return
    const kids = processFlowChildren(value.nodes, parentId)
    const node = emptyProcessFlowNode({
      parentId,
      label: '',
      sortOrder: kids.length,
      linkFromId: parentId,
    })
    setNodes([...value.nodes, node])
    focusNode(node.id)
  }

  const addSiblingAfter = (after: ProcessFlowNode, beside = false) => {
    if (disabled) return
    const siblings = processFlowChildren(value.nodes, after.parentId)
    const idx = siblings.findIndex((s) => s.id === after.id)
    const next = emptyProcessFlowNode({
      parentId: after.parentId,
      label: '',
      sortOrder: idx + 1,
      horizontalWithPrev: beside,
      linkFromId: beside ? after.linkFromId : after.id,
    })
    const reordered = value.nodes.map((n) => {
      if (n.parentId !== after.parentId) return n
      if (n.sortOrder > idx) return { ...n, sortOrder: n.sortOrder + 1 }
      return n
    })
    setNodes([...reordered, next])
    focusNode(next.id)
  }

  const toggleHorizontalAlign = (ids: string[]) => {
    if (disabled || ids.length === 0) return
    const nextFlags = ids.map((id) => {
      const n = value.nodes.find((x) => x.id === id)
      if (!n) return false
      const sibs = processFlowChildren(value.nodes, n.parentId)
      if (sibs.findIndex((s) => s.id === id) <= 0) return false
      return !n.horizontalWithPrev
    })
    // If any will turn on, turn all eligible on; else turn all off.
    const turnOn = nextFlags.some(Boolean) && !ids.every((id) => {
      const n = value.nodes.find((x) => x.id === id)
      return n?.horizontalWithPrev
    })
    let any = false
    setNodes(
      value.nodes.map((n) => {
        if (!ids.includes(n.id)) return n
        const sibs = processFlowChildren(value.nodes, n.parentId)
        if (sibs.findIndex((s) => s.id === n.id) <= 0) return n
        any = true
        return { ...n, horizontalWithPrev: turnOn }
      }),
    )
    if (!any) {
      toast.error('Select a 2nd (or later) step in a row to align horizontally.')
    }
  }

  const removeNodes = (ids: string[]) => {
    if (disabled || ids.length === 0) return
    const flatBefore = flattenProcessFlowTree(value.nodes)
    const removeIndexes = ids
      .map((id) => flatBefore.findIndex((r) => r.node.id === id))
      .filter((i) => i >= 0)
    const anchorIdx =
      removeIndexes.length > 0 ? Math.min(...removeIndexes) : 0

    const drop = new Set<string>()
    const collect = (pid: string) => {
      drop.add(pid)
      for (const c of processFlowChildren(value.nodes, pid)) collect(c.id)
    }
    for (const id of ids) collect(id)
    let next = value.nodes
      .filter((n) => !drop.has(n.id))
      .map((n) =>
        n.linkFromId && drop.has(n.linkFromId) ? { ...n, linkFromId: null } : n,
      )
    if (next.length === 0) next = [emptyProcessFlowNode({ label: '' })]
    const parents = new Set(
      ids.map((id) => value.nodes.find((n) => n.id === id)?.parentId ?? null),
    )
    for (const parentId of parents) {
      next = reindexProcessFlowSiblings(next, parentId)
    }
    setNodes(next)

    const flatAfter = flattenProcessFlowTree(next)
    // Prefer next box after deleted, else previous, else first.
    const focusTarget =
      flatAfter[Math.min(anchorIdx, flatAfter.length - 1)]?.node.id ??
      flatAfter[Math.max(0, anchorIdx - 1)]?.node.id ??
      flatAfter[0]?.node.id
    if (focusTarget) focusNode(focusTarget)
  }

  const moveSibling = (id: string, dir: -1 | 1) => {
    if (disabled) return
    const node = value.nodes.find((n) => n.id === id)
    if (!node) return
    const siblings = processFlowChildren(value.nodes, node.parentId)
    const idx = siblings.findIndex((s) => s.id === id)
    const swap = idx + dir
    if (idx < 0 || swap < 0 || swap >= siblings.length) return
    const a = siblings[idx]!
    const b = siblings[swap]!
    setNodes(
      value.nodes.map((n) => {
        if (n.id === a.id) return { ...n, sortOrder: b.sortOrder }
        if (n.id === b.id) return { ...n, sortOrder: a.sortOrder }
        return n
      }),
    )
  }

  const moveSelection = (dir: -1 | 1) => {
    // Move from outer edge so indices stay stable.
    const ordered = [...selectedIds].sort((a, b) => {
      const ia = flat.findIndex((r) => r.node.id === a)
      const ib = flat.findIndex((r) => r.node.id === b)
      return dir === -1 ? ia - ib : ib - ia
    })
    for (const id of ordered) moveSibling(id, dir)
  }

  const indentNode = (id: string) => {
    if (disabled) return
    const node = value.nodes.find((n) => n.id === id)
    if (!node) return
    const siblings = processFlowChildren(value.nodes, node.parentId)
    const idx = siblings.findIndex((s) => s.id === id)
    if (idx <= 0) return
    const newParent = siblings[idx - 1]!
    const kids = processFlowChildren(value.nodes, newParent.id)
    let next = value.nodes.map((n) =>
      n.id === id
        ? {
            ...n,
            parentId: newParent.id,
            sortOrder: kids.length,
            horizontalWithPrev: false,
            linkFromId: newParent.id,
          }
        : n,
    )
    next = reindexProcessFlowSiblings(next, node.parentId)
    setNodes(next)
  }

  const outdentNode = (id: string) => {
    if (disabled) return
    const node = value.nodes.find((n) => n.id === id)
    if (!node || !node.parentId) return
    const parent = value.nodes.find((n) => n.id === node.parentId)
    if (!parent) return
    const grandParentId = parent.parentId
    const uncleSiblings = processFlowChildren(value.nodes, grandParentId)
    const parentIdx = uncleSiblings.findIndex((s) => s.id === parent.id)
    let next = value.nodes.map((n) => {
      if (n.id === id) {
        return {
          ...n,
          parentId: grandParentId,
          sortOrder: parentIdx + 1,
          horizontalWithPrev: false,
          linkFromId: parent.id,
        }
      }
      if (n.parentId === grandParentId && n.sortOrder > parentIdx) {
        return { ...n, sortOrder: n.sortOrder + 1 }
      }
      return n
    })
    next = reindexProcessFlowSiblings(next, node.parentId)
    setNodes(next)
  }

  const setPoints = (descriptionPoints: string[], record = true) => {
    applyPayload({ ...valueRef.current, descriptionPoints }, { record })
  }

  const patchPoint = (index: number, text: string) => {
    if (!labelHistoryArmedRef.current) {
      recordHistory()
      labelHistoryArmedRef.current = true
    }
    const current = valueRef.current
    const next = {
      ...current,
      descriptionPoints: current.descriptionPoints.map((p, i) =>
        i === index ? text : p,
      ),
    }
    valueRef.current = next
    onChange(next)
  }

  const addPoint = () => {
    if (disabled) return
    setPoints([...value.descriptionPoints, ''])
  }

  const removePoint = (index: number) => {
    if (disabled) return
    if (value.descriptionPoints.length <= 1) {
      setPoints([''])
      return
    }
    setPoints(value.descriptionPoints.filter((_, i) => i !== index))
  }

  const applyAiPoints = (points: string[], mode: 'replace' | 'append') => {
    const next =
      mode === 'append' && valueRef.current.descriptionPoints.length > 0
        ? [
            ...valueRef.current.descriptionPoints.filter((p) => p.trim()),
            ...points,
          ]
        : points
    setPoints(next.length > 0 ? next : [''])
  }

  const focusFlatOffset = (fromId: string, delta: number) => {
    const idx = flat.findIndex((r) => r.node.id === fromId)
    if (idx < 0) return
    const next = flat[idx + delta]
    if (next) focusNode(next.node.id)
  }

  const onCanvasKeyDown = (e: KeyboardEvent, node: ProcessFlowNode) => {
    if (disabled) return

    if (e.key === 'Enter' && e.shiftKey) {
      e.preventDefault()
      addSiblingAfter(node, true)
      return
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      addSiblingAfter(node, false)
      return
    }
    if (e.key === 'Tab' && !e.shiftKey) {
      e.preventDefault()
      const idx = flat.findIndex((r) => r.node.id === node.id)
      if (idx >= 0 && idx < flat.length - 1) focusFlatOffset(node.id, 1)
      else addSiblingAfter(node, false)
      return
    }
    if (e.key === 'Tab' && e.shiftKey) {
      e.preventDefault()
      focusFlatOffset(node.id, -1)
      return
    }
    if ((e.key === 'Backspace' || e.key === 'Delete') && !node.label.trim()) {
      e.preventDefault()
      if (flat.length > 1) removeNodes(selectedIds.includes(node.id) ? selectedIds : [node.id])
    }
  }

  const registerInput = (id: string, el: HTMLInputElement | null) => {
    if (el) inputRefs.current.set(id, el)
    else inputRefs.current.delete(id)
  }

  const hasSelection = selectedIds.length > 0
  const toolDisabled = disabled || !hasSelection

  const lineColor = arrowStyle.color
  const lineWidth = Math.max(1.5, arrowStyle.width)
  const lineDash = arrowStyle.dashed
  const arrowDesign = arrowStyle.design ?? 'triangle'
  const flowLine: FlowLineProps = {
    color: lineColor,
    width: lineWidth,
    dashed: lineDash,
  }

  const renderNodeColumn = (node: ProcessFlowNode): ReactNode => {
    const isSelected = selectedIds.includes(node.id)
    const kids = processFlowChildren(value.nodes, node.id)
    const kidRows = groupProcessFlowSiblingRows(kids)
    const size = resolveProcessFlowBoxSize(node, boxStyle)
    const displayLabel = editingId === node.id ? editingLabel : node.label
    const fontSize =
      editingId === node.id
        ? editingFontSizeRef.current
        : fitProcessFlowFontSize(displayLabel, size.width, size.height)

    return (
      <div key={node.id} className="flex w-max flex-col items-center">
        <input
          ref={(el) => registerInput(node.id, el)}
          className={cn(
            'rounded-none border-2 bg-[#fffbeb] px-2 text-center font-bold text-[#78350f]',
            'outline-none placeholder:font-medium placeholder:text-stone-400',
            'focus:border-amber-600 focus:bg-amber-50 focus:ring-2 focus:ring-amber-500/25',
            isSelected
              ? 'border-amber-600 ring-2 ring-amber-500/30'
              : 'border-amber-800/70',
            node.horizontalWithPrev && 'border-l-[3px] border-l-sky-600',
            disabled && 'cursor-default opacity-70',
          )}
          style={{
            width: size.width,
            height: size.height,
            fontSize,
            lineHeight: 1.2,
          }}
          value={displayLabel}
          disabled={disabled}
          placeholder="Type step name…"
          onChange={(e) => {
            const nextLabel = e.target.value
            setEditingLabel(nextLabel)
            patchNode(node.id, { label: nextLabel })
          }}
          onMouseDown={(e) => {
            // Selection BEFORE focus — Ctrl/⌘ multi-select must not be wiped by onFocus.
            selectOnCanvas(node.id, e)
          }}
          onFocus={() => {
            const sizeNow = resolveProcessFlowBoxSize(node, boxStyle)
            editingFontSizeRef.current = fitProcessFlowFontSize(
              node.label.trim() || 'Type step name…',
              sizeNow.width,
              sizeNow.height,
            )
            setEditingId(node.id)
            setEditingLabel(node.label)
          }}
          onKeyDown={(e) => onCanvasKeyDown(e, node)}
          onBlur={onLabelBlur}
        />
        {kidRows.map((row, rowIndex) => (
          <ProcessFlowBranchConnectors
            key={`${node.id}-row-${rowIndex}`}
            count={row.length}
            gapY={boxStyle.gapY}
            design={arrowDesign}
            line={flowLine}
          >
            {row.map((child, childIndex) => (
              <ProcessFlowBranchColumn
                key={child.id}
                index={childIndex}
                count={row.length}
                gapY={boxStyle.gapY}
                design={arrowDesign}
                line={flowLine}
              >
                {renderNodeColumn(child)}
              </ProcessFlowBranchColumn>
            ))}
          </ProcessFlowBranchConnectors>
        ))}
      </div>
    )
  }

  const rootRows = groupProcessFlowSiblingRows(processFlowChildren(value.nodes, null))

  return (
    <>
      <div
        className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-none border border-stone-400 bg-[#fffdf8]"
        onKeyDownCapture={(e) => {
          if (disabled) return
          const mod = e.metaKey || e.ctrlKey
          if (!mod) return
          const key = e.key.toLowerCase()
          if (key === 'z' && !e.shiftKey) {
            e.preventDefault()
            undo()
            return
          }
          if (key === 'y' || (key === 'z' && e.shiftKey)) {
            e.preventDefault()
            redo()
          }
        }}
      >
        <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-stone-300 bg-[#fffcf7] px-3 py-2">
          <p className="shrink-0 text-[11px] font-bold uppercase tracking-[0.14em] text-stone-600">
            Process Flow Canvas
          </p>
          <Button
            type="button"
            variant="outline"
            className={cn(limsOutlineBtnClass, 'ml-auto h-8 gap-1.5 text-xs')}
            onClick={() => {
              if (valueRef.current.descriptionPoints.length === 0) {
                setPoints([''], false)
              }
              setDescriptionOpen(true)
            }}
          >
            <FileText className="h-3.5 w-3.5" />
            Process Description
            {value.descriptionPoints.filter((p) => p.trim()).length > 0 ? (
              <span className="rounded-none bg-amber-100 px-1.5 text-[10px] font-bold text-amber-900">
                {value.descriptionPoints.filter((p) => p.trim()).length}
              </span>
            ) : null}
          </Button>
        </div>

        <div className="flex min-h-0 flex-1 overflow-hidden">
          {/* Excel-style vertical toolbar — acts on selection only */}
          <aside className="flex w-11 shrink-0 flex-col items-center gap-0.5 overflow-y-auto border-r border-stone-300 bg-[#fffcf7] py-2">
            <button
              type="button"
              className={toolBtnClass}
              disabled={disabled || !canUndo}
              title="Undo (Ctrl/⌘Z)"
              aria-label="Undo"
              onClick={undo}
            >
              <Undo2 className="h-4 w-4" />
            </button>
            <button
              type="button"
              className={toolBtnClass}
              disabled={disabled || !canRedo}
              title="Redo (Ctrl/⌘Y)"
              aria-label="Redo"
              onClick={redo}
            >
              <Redo2 className="h-4 w-4" />
            </button>

            <div className="my-1 h-px w-7 bg-stone-300" />

            <button
              type="button"
              className={toolBtnClass}
              disabled={disabled}
              title="Add step at end"
              aria-label="Add step"
              onClick={addRoot}
            >
              <Plus className="h-4 w-4" />
            </button>
            <button
              type="button"
              className={toolBtnClass}
              disabled={toolDisabled}
              title="Add below (Enter)"
              aria-label="Add below"
              onClick={() => primary && addSiblingAfter(primary, false)}
            >
              <ArrowDownToLine className="h-4 w-4" />
            </button>
            <button
              type="button"
              className={toolBtnClass}
              disabled={toolDisabled}
              title="Add beside (Shift+Enter)"
              aria-label="Add beside"
              onClick={() => primary && addSiblingAfter(primary, true)}
            >
              <ArrowRightLeft className="h-4 w-4" />
            </button>
            <button
              type="button"
              className={toolBtnClass}
              disabled={toolDisabled}
              title="Add child"
              aria-label="Add child"
              onClick={() => primary && addChild(primary.id)}
            >
              <CornerDownRight className="h-4 w-4" />
            </button>

            <div className="my-1 h-px w-7 bg-stone-300" />

            <button
              type="button"
              className={toolBtnClass}
              disabled={toolDisabled}
              title="Move up"
              aria-label="Move up"
              onClick={() => moveSelection(-1)}
            >
              <ChevronUp className="h-4 w-4" />
            </button>
            <button
              type="button"
              className={toolBtnClass}
              disabled={toolDisabled}
              title="Move down"
              aria-label="Move down"
              onClick={() => moveSelection(1)}
            >
              <ChevronDown className="h-4 w-4" />
            </button>
            <button
              type="button"
              className={toolBtnClass}
              disabled={toolDisabled}
              title="Indent"
              aria-label="Indent"
              onClick={() => {
                for (const id of [...selectedIds].sort(
                  (a, b) =>
                    flat.findIndex((r) => r.node.id === b) -
                    flat.findIndex((r) => r.node.id === a),
                )) {
                  indentNode(id)
                }
              }}
            >
              <IndentIncrease className="h-4 w-4" />
            </button>
            <button
              type="button"
              className={toolBtnClass}
              disabled={toolDisabled}
              title="Outdent"
              aria-label="Outdent"
              onClick={() => {
                for (const id of selectedIds) outdentNode(id)
              }}
            >
              <IndentDecrease className="h-4 w-4" />
            </button>

            <div className="my-1 h-px w-7 bg-stone-300" />

            <button
              type="button"
              className={cn(
                toolBtnClass,
                primary?.horizontalWithPrev && 'border-sky-500 bg-sky-50',
              )}
              disabled={toolDisabled || !canAlignHorizontal}
              title="Align horizontal with previous"
              aria-label="Align horizontal"
              onClick={() => toggleHorizontalAlign(selectedIds)}
            >
              <GitBranch className="h-4 w-4 rotate-90" />
            </button>
            <button
              type="button"
              className={cn(toolBtnClass, 'text-red-700 hover:bg-red-50')}
              disabled={toolDisabled}
              title="Delete"
              aria-label="Delete"
              onClick={() => removeNodes(selectedIds)}
            >
              <Trash2 className="h-4 w-4" />
            </button>

            <div className="my-1 h-px w-7 bg-stone-300" />

            <button
              type="button"
              className={cn(
                toolBtnClass,
                settingsPanel === 'arrow' && 'border-amber-600 bg-amber-100',
              )}
              disabled={disabled}
              title="Arrow style settings"
              aria-label="Arrow style settings"
              aria-pressed={settingsPanel === 'arrow'}
              onClick={() =>
                setSettingsPanel((prev) => (prev === 'arrow' ? null : 'arrow'))
              }
            >
              <Settings2 className="h-4 w-4" />
            </button>
            <button
              type="button"
              className={cn(
                toolBtnClass,
                settingsPanel === 'box' && 'border-amber-600 bg-amber-100',
              )}
              disabled={disabled}
              title="Box size & spacing"
              aria-label="Box size and spacing"
              aria-pressed={settingsPanel === 'box'}
              onClick={() => {
                if (settingsPanel === 'box') {
                  setSettingsPanel(null)
                  return
                }
                syncBoxSettingsDrafts()
                setSettingsPanel('box')
              }}
            >
              <Square className="h-4 w-4" />
            </button>
          </aside>

          {settingsPanel ? (
            <aside className="flex w-[196px] shrink-0 flex-col overflow-hidden border-r border-stone-300 bg-[#fffcf7]">
              <div className="flex shrink-0 items-center gap-2 border-b border-stone-300 px-2.5 py-2">
                <p className="min-w-0 flex-1 text-[11px] font-bold uppercase tracking-[0.12em] text-stone-700">
                  {settingsPanel === 'arrow' ? 'Arrow Style' : 'Box Size'}
                </p>
                <button
                  type="button"
                  className={toolBtnClass}
                  title="Close settings"
                  aria-label="Close settings"
                  onClick={() => setSettingsPanel(null)}
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>

              <div className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain px-2.5 py-3">
                {settingsPanel === 'arrow' ? (
                  <>
                    <div className="space-y-1.5">
                      <p className="text-xs font-semibold text-stone-700">
                        Design
                      </p>
                      <div className="grid grid-cols-2 gap-1.5">
                        {PROCESS_FLOW_ARROW_DESIGNS.map((opt) => {
                          const selected = arrowDesign === opt.id
                          return (
                            <button
                              key={opt.id}
                              type="button"
                              disabled={disabled}
                              title={opt.label}
                              onClick={() =>
                                patchArrowStyle({ design: opt.id })
                              }
                              className={cn(
                                'flex h-12 flex-col items-center justify-center gap-0.5 rounded-none border bg-white px-1 py-1',
                                selected
                                  ? 'border-amber-600 bg-amber-50 ring-1 ring-amber-500/40'
                                  : 'border-stone-300 hover:border-amber-500 hover:bg-amber-50/50',
                                disabled && 'opacity-50',
                              )}
                            >
                              <div className="flex h-6 flex-col items-center justify-end">
                                <div
                                  className="h-2.5"
                                  style={{
                                    width: 2,
                                    backgroundColor: selected
                                      ? lineColor
                                      : '#a8a29e',
                                  }}
                                />
                                <ProcessFlowArrowHead
                                  design={opt.id}
                                  color={selected ? lineColor : '#a8a29e'}
                                  width={lineWidth}
                                />
                              </div>
                              <span className="text-[8px] font-bold uppercase tracking-wide text-stone-600">
                                {opt.label}
                              </span>
                            </button>
                          )
                        })}
                      </div>
                    </div>

                    <label className="flex items-center justify-between gap-2 text-xs text-stone-700">
                      <span className="font-semibold">Colour</span>
                      <input
                        type="color"
                        className="h-8 w-12 cursor-pointer rounded-none border border-stone-400 bg-white p-0.5"
                        value={arrowStyle.color}
                        disabled={disabled}
                        onChange={(e) =>
                          patchArrowStyle({ color: e.target.value })
                        }
                      />
                    </label>

                    <label className="flex flex-col gap-1 text-xs text-stone-700">
                      <span className="flex items-center justify-between font-semibold">
                        Thickness
                        <span className="font-normal text-stone-500">
                          {arrowStyle.width.toFixed(1)}px
                        </span>
                      </span>
                      <input
                        type="range"
                        min={1}
                        max={5}
                        step={0.2}
                        className="w-full accent-amber-700"
                        value={arrowStyle.width}
                        disabled={disabled}
                        onChange={(e) =>
                          patchArrowStyle({ width: Number(e.target.value) })
                        }
                      />
                    </label>

                    <label className="flex items-center justify-between gap-2 text-xs text-stone-700">
                      <span className="font-semibold">Dashed line</span>
                      <input
                        type="checkbox"
                        className="h-4 w-4 accent-amber-700"
                        checked={arrowStyle.dashed}
                        disabled={disabled}
                        onChange={(e) =>
                          patchArrowStyle({ dashed: e.target.checked })
                        }
                      />
                    </label>

                    <div className="rounded-none border border-stone-300 bg-[#fffdf8] px-2 py-3">
                      <p className="mb-2 text-[9px] font-bold uppercase tracking-wider text-stone-500">
                        Preview
                      </p>
                      <div className="flex flex-col items-center">
                        <div
                          className="h-7"
                          style={flowVertLineStyle(flowLine)}
                        />
                        <ProcessFlowArrowHead
                          design={arrowDesign}
                          color={lineColor}
                          width={lineWidth}
                        />
                      </div>
                    </div>

                    <Button
                      type="button"
                      variant="outline"
                      className={cn(limsOutlineBtnClass, 'h-8 w-full text-xs')}
                      disabled={disabled}
                      onClick={() =>
                        patchArrowStyle(defaultProcessFlowArrowStyle())
                      }
                    >
                      Reset arrow style
                    </Button>
                  </>
                ) : (
                  <>
                    <div className="flex items-end gap-1.5">
                      <label className="min-w-0 flex-1 space-y-1 text-xs text-stone-700">
                        <span className="font-semibold">Box Width</span>
                        <div className="flex items-center gap-1">
                          <input
                            type="number"
                            inputMode="numeric"
                            min={80}
                            max={480}
                            step={1}
                            className={cn(limsFieldClass, 'h-10 w-14 shrink-0 px-1.5 text-center text-sm')}
                            value={boxDraftWidth}
                            disabled={disabled || selectedIds.length === 0}
                            onChange={(e) => setBoxDraftWidth(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault()
                                applyBoxDraftWidth()
                              }
                            }}
                          />
                          <span className="shrink-0 text-[10px] text-stone-500">
                            px
                          </span>
                        </div>
                      </label>
                      <Button
                        type="button"
                        className={cn(limsPrimaryBtnClass, 'h-10 shrink-0 px-2.5 text-xs')}
                        disabled={disabled || selectedIds.length === 0}
                        onClick={applyBoxDraftWidth}
                      >
                        OK
                      </Button>
                    </div>

                    <div className="flex items-end gap-1.5">
                      <label className="min-w-0 flex-1 space-y-1 text-xs text-stone-700">
                        <span className="font-semibold">Box Height</span>
                        <div className="flex items-center gap-1">
                          <input
                            type="number"
                            inputMode="numeric"
                            min={28}
                            max={120}
                            step={1}
                            className={cn(limsFieldClass, 'h-10 w-14 shrink-0 px-1.5 text-center text-sm')}
                            value={boxDraftHeight}
                            disabled={disabled || selectedIds.length === 0}
                            onChange={(e) => setBoxDraftHeight(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault()
                                applyBoxDraftHeight()
                              }
                            }}
                          />
                          <span className="shrink-0 text-[10px] text-stone-500">
                            px
                          </span>
                        </div>
                      </label>
                      <Button
                        type="button"
                        className={cn(limsPrimaryBtnClass, 'h-10 shrink-0 px-2.5 text-xs')}
                        disabled={disabled || selectedIds.length === 0}
                        onClick={applyBoxDraftHeight}
                      >
                        OK
                      </Button>
                    </div>

                    <div className="flex items-end gap-1.5">
                      <label className="min-w-0 flex-1 space-y-1 text-xs text-stone-700">
                        <span className="font-semibold">Gap Between Boxes</span>
                        <div className="flex items-center gap-1">
                          <input
                            type="number"
                            inputMode="numeric"
                            min={0}
                            max={120}
                            step={1}
                            className={cn(limsFieldClass, 'h-10 w-14 shrink-0 px-1.5 text-center text-sm')}
                            value={boxDraftGap}
                            disabled={disabled}
                            onChange={(e) => setBoxDraftGap(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault()
                                applyBoxDraftGap()
                              }
                            }}
                          />
                          <span className="shrink-0 text-[10px] text-stone-500">
                            px
                          </span>
                        </div>
                      </label>
                      <Button
                        type="button"
                        className={cn(limsPrimaryBtnClass, 'h-10 shrink-0 px-2.5 text-xs')}
                        disabled={disabled}
                        onClick={applyBoxDraftGap}
                      >
                        OK
                      </Button>
                    </div>

                    <div className="border-t border-stone-200 pt-2.5">
                      <p className="mb-2 text-[9px] font-semibold uppercase tracking-wide text-stone-500">
                        Defaults for new boxes
                      </p>
                      <div className="space-y-2.5">
                        <div className="flex items-end gap-1.5">
                          <label className="min-w-0 flex-1 space-y-1 text-xs text-stone-700">
                            <span className="font-semibold">Default Width</span>
                            <div className="flex items-center gap-1">
                              <input
                                type="number"
                                inputMode="numeric"
                                min={80}
                                max={480}
                                step={1}
                                className={cn(limsFieldClass, 'h-10 w-14 shrink-0 px-1.5 text-center text-sm')}
                                value={boxDraftDefaultWidth}
                                disabled={disabled}
                                onChange={(e) =>
                                  setBoxDraftDefaultWidth(e.target.value)
                                }
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') {
                                    e.preventDefault()
                                    applyBoxDraftDefaultWidth()
                                  }
                                }}
                              />
                              <span className="shrink-0 text-[10px] text-stone-500">
                                px
                              </span>
                            </div>
                          </label>
                          <Button
                            type="button"
                            className={cn(
                              limsPrimaryBtnClass,
                              'h-10 shrink-0 px-2.5 text-xs',
                            )}
                            disabled={disabled}
                            onClick={applyBoxDraftDefaultWidth}
                          >
                            OK
                          </Button>
                        </div>
                        <div className="flex items-end gap-1.5">
                          <label className="min-w-0 flex-1 space-y-1 text-xs text-stone-700">
                            <span className="font-semibold">Default Height</span>
                            <div className="flex items-center gap-1">
                              <input
                                type="number"
                                inputMode="numeric"
                                min={28}
                                max={120}
                                step={1}
                                className={cn(limsFieldClass, 'h-10 w-14 shrink-0 px-1.5 text-center text-sm')}
                                value={boxDraftDefaultHeight}
                                disabled={disabled}
                                onChange={(e) =>
                                  setBoxDraftDefaultHeight(e.target.value)
                                }
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') {
                                    e.preventDefault()
                                    applyBoxDraftDefaultHeight()
                                  }
                                }}
                              />
                              <span className="shrink-0 text-[10px] text-stone-500">
                                px
                              </span>
                            </div>
                          </label>
                          <Button
                            type="button"
                            className={cn(
                              limsPrimaryBtnClass,
                              'h-10 shrink-0 px-2.5 text-xs',
                            )}
                            disabled={disabled}
                            onClick={applyBoxDraftDefaultHeight}
                          >
                            OK
                          </Button>
                        </div>
                      </div>
                    </div>

                    <Button
                      type="button"
                      variant="outline"
                      className={cn(limsOutlineBtnClass, 'h-8 w-full text-[11px]')}
                      disabled={disabled || selectedIds.length === 0}
                      onClick={() => {
                        patchSelectedBoxSize({
                          boxWidth: null,
                          boxHeight: null,
                        })
                        const style =
                          valueRef.current.boxStyle ??
                          defaultProcessFlowBoxStyle()
                        setBoxDraftWidth(String(Math.round(style.width)))
                        setBoxDraftHeight(String(Math.round(style.height)))
                      }}
                    >
                      Reset Selected to Defaults
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      className={cn(limsOutlineBtnClass, 'h-8 w-full text-[11px]')}
                      disabled={disabled}
                      onClick={() => {
                        const next = defaultProcessFlowBoxStyle()
                        patchBoxStyle(next)
                        setBoxDraftGap(String(next.gapY))
                        setBoxDraftDefaultWidth(String(next.width))
                        setBoxDraftDefaultHeight(String(next.height))
                        setBoxDraftWidth(String(next.width))
                        setBoxDraftHeight(String(next.height))
                      }}
                    >
                      Reset Defaults
                    </Button>
                  </>
                )}
              </div>
            </aside>
          ) : null}

          <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
            <div className="min-h-0 flex-1 overflow-auto overscroll-contain p-4 sm:p-6">
              <div className="mx-auto flex w-full min-w-0 max-w-5xl flex-col items-center">
                {rootRows.map((row, rowIndex) =>
                  rowIndex === 0 ? (
                    <div
                      key={`root-row-${rowIndex}`}
                      className="flex w-max max-w-full flex-wrap items-start justify-center"
                    >
                      {row.map((node, nodeIndex) => (
                        <ProcessFlowBranchColumn
                          key={node.id}
                          index={nodeIndex}
                          count={row.length}
                          gapY={boxStyle.gapY}
                          design={arrowDesign}
                          line={flowLine}
                        >
                          {renderNodeColumn(node)}
                        </ProcessFlowBranchColumn>
                      ))}
                    </div>
                  ) : (
                    <ProcessFlowBranchConnectors
                      key={`root-row-${rowIndex}`}
                      count={row.length}
                      gapY={boxStyle.gapY}
                      design={arrowDesign}
                      line={flowLine}
                    >
                      {row.map((node, nodeIndex) => (
                        <ProcessFlowBranchColumn
                          key={node.id}
                          index={nodeIndex}
                          count={row.length}
                          gapY={boxStyle.gapY}
                          design={arrowDesign}
                          line={flowLine}
                        >
                          {renderNodeColumn(node)}
                        </ProcessFlowBranchColumn>
                      ))}
                    </ProcessFlowBranchConnectors>
                  ),
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      <Dialog open={descriptionOpen} onOpenChange={setDescriptionOpen}>
        <DialogContent
          persistOnFocusLoss
          layer="stacked"
          aria-describedby={undefined}
          overlayClassName={limsDialogSidebarOverlayClass}
          portalClassName={limsDialogSidebarPortalClass}
          className={cn(
            'flex !flex-col gap-0 overflow-hidden rounded-none border-0 bg-stone-100 p-0 shadow-none sm:rounded-none',
            '!h-[100dvh] max-h-[100dvh] translate-x-0 translate-y-0',
            'left-[var(--app-dialog-overlay-left,0px)] top-0 right-0',
            'w-[calc(100vw-var(--app-dialog-overlay-left,0px))] max-w-none',
            'border-stone-600 ring-1 ring-amber-700/20',
          )}
        >
          <div className="relative shrink-0 overflow-hidden bg-gradient-to-br from-stone-800 via-stone-900 to-stone-950 px-4 py-2.5 text-white">
            <DialogHeader className="relative pr-10 text-left">
              <DialogTitle className="text-base font-semibold tracking-tight text-white">
                Process Description
              </DialogTitle>
              <p className="mt-0.5 text-xs text-stone-300">
                Points for the Process Description annex — edit, add, or generate
                with AI.
              </p>
            </DialogHeader>
          </div>

          <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden bg-gradient-to-b from-stone-100/80 to-white px-3 py-3 sm:px-4 sm:py-4">
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-none border-2 border-stone-500 bg-[#f7f3eb]">
              <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-stone-400 bg-[#fffcf7] px-3 py-2">
                <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-stone-600">
                  Description Points
                  {value.descriptionPoints.filter((p) => p.trim()).length > 0 ? (
                    <span className="ml-2 font-semibold normal-case tracking-normal text-stone-500">
                      ({value.descriptionPoints.filter((p) => p.trim()).length})
                    </span>
                  ) : null}
                </p>
                {showAiButtons ? (
                  <Button
                    type="button"
                    variant="outline"
                    disabled={disabled}
                    className={cn(limsOutlineBtnClass, 'h-8 gap-1 text-xs')}
                    aria-haspopup="dialog"
                    aria-expanded={descriptionAiOpen}
                    onClick={() => setDescriptionAiOpen(true)}
                  >
                    <Sparkles className="h-3.5 w-3.5" />
                    AI
                  </Button>
                ) : null}
              </div>

              <div className="min-h-0 flex-1 overflow-auto overscroll-contain">
                <table className="w-full min-w-[640px] border-collapse">
                  <thead className="sticky top-0 z-[1]">
                    <tr className="bg-stone-800 text-left text-[10px] font-bold uppercase tracking-[0.12em] text-amber-200">
                      <th className="w-14 border border-stone-700 px-2 py-2 text-center">
                        #
                      </th>
                      <th className="border border-stone-700 px-2 py-2">
                        Description Point
                      </th>
                      <th className="w-[7.5rem] border border-stone-700 px-2 py-2 text-center">
                        Action
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {(value.descriptionPoints.length > 0
                      ? value.descriptionPoints
                      : ['']
                    ).map((point, index, rows) => {
                      const isLast = index === rows.length - 1
                      const canRemove = rows.length > 1
                      return (
                        <tr
                          key={`pt-${index}`}
                          className={
                            index % 2 === 0 ? 'bg-[#f7f3eb]' : 'bg-[#fffcf7]'
                          }
                        >
                          <td className="border border-stone-400 px-2 py-2 text-center text-xs font-semibold text-stone-700">
                            {index + 1}
                          </td>
                          <td className="border border-stone-400 p-1.5">
                            <Textarea
                              className={cn(
                                limsFieldClass,
                                'min-h-[72px] resize-y border-stone-300 bg-white text-sm',
                              )}
                              value={point}
                              disabled={disabled}
                              placeholder="Type description point…"
                              onChange={(e) => {
                                if (value.descriptionPoints.length === 0) {
                                  setPoints([e.target.value])
                                  return
                                }
                                patchPoint(index, e.target.value)
                              }}
                              onBlur={onLabelBlur}
                            />
                          </td>
                          <td className="border border-stone-400 px-1 py-1">
                            <div className="flex flex-wrap items-center justify-center gap-1">
                              {isLast ? (
                                <Button
                                  type="button"
                                  variant="outline"
                                  disabled={disabled}
                                  className={cn(
                                    limsOutlineBtnClass,
                                    'h-7 gap-1 px-2 text-[11px]',
                                  )}
                                  onClick={addPoint}
                                >
                                  <Plus className="h-3.5 w-3.5" />
                                  Add Point
                                </Button>
                              ) : null}
                              <button
                                type="button"
                                className={cn(
                                  toolBtnClass,
                                  'text-red-700',
                                  !canRemove && 'opacity-40',
                                )}
                                disabled={disabled || !canRemove}
                                aria-label={`Remove point ${index + 1}`}
                                title={
                                  canRemove
                                    ? 'Remove point'
                                    : 'At least one row is required'
                                }
                                onClick={() => removePoint(index)}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <DialogFooter className="shrink-0 border-t border-stone-300 bg-white px-4 py-3 sm:justify-end">
            <Button
              type="button"
              className={limsPrimaryBtnClass}
              onClick={() => setDescriptionOpen(false)}
            >
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {showAiButtons ? (
        <ProcessDescriptionAiDialog
          open={descriptionAiOpen}
          onOpenChange={setDescriptionAiOpen}
          disabled={disabled}
          applicantName={applicantName}
          isNumber={isNumber}
          isTitle={isTitle}
          productName={productName}
          licenseScope={licenseScope}
          isCodeId={isCodeId}
          nodes={value.nodes}
          existingPoints={value.descriptionPoints}
          onApplyPoints={applyAiPoints}
        />
      ) : null}
    </>
  )
}
