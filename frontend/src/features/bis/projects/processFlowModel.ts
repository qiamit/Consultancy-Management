/** Process Flow Chart hierarchy + Process Description (merged module). */

export type ProcessFlowNode = {
  id: string
  parentId: string | null
  label: string
  sortOrder: number
  /**
   * When true, this node sits on the same horizontal row as the previous
   * sibling (same parent). The first sibling under a parent is always vertical.
   */
  horizontalWithPrev: boolean
  /**
   * Incoming arrow source node id. When null, auto:
   * - child → parent
   * - next sibling-row → previous row (index match, else row center)
   */
  linkFromId: string | null
  /** Per-box width override (px). null = use layout boxStyle.width */
  boxWidth: number | null
  /** Per-box height override (px). null = use layout boxStyle.height */
  boxHeight: number | null
}

export type ProcessFlowModulePayload = {
  nodes: ProcessFlowNode[]
  descriptionPoints: string[]
  arrowStyle: ProcessFlowArrowStyle
  boxStyle: ProcessFlowBoxStyle
}

/** Default box size + vertical gap between stacked boxes / branches. */
export type ProcessFlowBoxStyle = {
  width: number
  height: number
  gapY: number
}

export function defaultProcessFlowBoxStyle(): ProcessFlowBoxStyle {
  return {
    width: 220,
    height: 44,
    gapY: 14,
  }
}

export function parseProcessFlowBoxStyle(raw: unknown): ProcessFlowBoxStyle {
  const base = defaultProcessFlowBoxStyle()
  if (!raw || typeof raw !== 'object') return base
  const o = raw as Record<string, unknown>
  const width = Number(o.width ?? o.boxWidth)
  const height = Number(o.height ?? o.boxHeight)
  const gapY = Number(o.gapY ?? o.gap ?? o.spacing)
  return {
    width:
      Number.isFinite(width) && width >= 80
        ? Math.min(480, Math.max(80, width))
        : base.width,
    height:
      Number.isFinite(height) && height >= 28
        ? Math.min(120, Math.max(28, height))
        : base.height,
    gapY:
      Number.isFinite(gapY) && gapY >= 0
        ? Math.min(120, Math.max(0, gapY))
        : base.gapY,
  }
}

/** Shrink text to fit a fixed box (does not change box size). */
export function fitProcessFlowFontSize(
  text: string,
  boxW: number,
  boxH: number,
): number {
  const max = 14
  const min = 8
  const sample = text.trim().length > 0 ? text.trim() : 'Type step name…'
  const availW = Math.max(32, boxW - 20)
  const byWidth = availW / (sample.length * 0.52)
  const byHeight = boxH * 0.36
  return Math.max(min, Math.min(max, byWidth, byHeight))
}

export function resolveProcessFlowBoxSize(
  node: ProcessFlowNode,
  boxStyle: ProcessFlowBoxStyle,
): { width: number; height: number } {
  return {
    width: node.boxWidth ?? boxStyle.width,
    height: node.boxHeight ?? boxStyle.height,
  }
}

export type ProcessFlowArrowDesign =
  | 'triangle'
  | 'chevron'
  | 'diamond'
  | 'circle'
  | 'bar'
  | 'none'

export const PROCESS_FLOW_ARROW_DESIGNS: {
  id: ProcessFlowArrowDesign
  label: string
}[] = [
  { id: 'triangle', label: 'Triangle' },
  { id: 'chevron', label: 'Chevron' },
  { id: 'diamond', label: 'Diamond' },
  { id: 'circle', label: 'Circle' },
  { id: 'bar', label: 'Bar' },
  { id: 'none', label: 'None' },
]

export type ProcessFlowArrowStyle = {
  color: string
  width: number
  dashed: boolean
  design: ProcessFlowArrowDesign
}

export function defaultProcessFlowArrowStyle(): ProcessFlowArrowStyle {
  return {
    color: '#78716c',
    width: 2.2,
    dashed: false,
    design: 'triangle',
  }
}

export function parseProcessFlowArrowStyle(raw: unknown): ProcessFlowArrowStyle {
  const base = defaultProcessFlowArrowStyle()
  if (!raw || typeof raw !== 'object') return base
  const o = raw as Record<string, unknown>
  const color = str(o.color || o.stroke)
  const width = Number(o.width ?? o.strokeWidth)
  const designRaw = str(o.design || o.head || o.arrowHead).toLowerCase()
  const design = (
    PROCESS_FLOW_ARROW_DESIGNS.some((d) => d.id === designRaw)
      ? designRaw
      : base.design
  ) as ProcessFlowArrowDesign
  return {
    color: color || base.color,
    width: Number.isFinite(width) && width > 0 ? Math.min(8, Math.max(1, width)) : base.width,
    dashed: Boolean(o.dashed ?? o.dash),
    design,
  }
}

let nodeSeq = 0

export function nextProcessFlowNodeId(): string {
  nodeSeq += 1
  return `pf-node-${Date.now()}-${nodeSeq}`
}

function str(raw: unknown): string {
  return String(raw ?? '').trim()
}

export function emptyProcessFlowNode(
  partial?: Partial<ProcessFlowNode>,
): ProcessFlowNode {
  return {
    id: partial?.id ?? nextProcessFlowNodeId(),
    parentId: partial?.parentId ?? null,
    label: partial?.label ?? '',
    sortOrder: Number.isFinite(partial?.sortOrder) ? Number(partial?.sortOrder) : 0,
    horizontalWithPrev: Boolean(partial?.horizontalWithPrev),
    linkFromId:
      partial?.linkFromId == null || partial.linkFromId === ''
        ? null
        : String(partial.linkFromId),
    boxWidth:
      partial?.boxWidth == null || !Number.isFinite(Number(partial.boxWidth))
        ? null
        : Number(partial.boxWidth),
    boxHeight:
      partial?.boxHeight == null || !Number.isFinite(Number(partial.boxHeight))
        ? null
        : Number(partial.boxHeight),
  }
}

export function emptyProcessFlowPayload(): ProcessFlowModulePayload {
  return {
    nodes: [
      emptyProcessFlowNode({ label: 'Raw Material Receipt', sortOrder: 0 }),
      emptyProcessFlowNode({ label: 'Incoming Inspection', sortOrder: 1 }),
      emptyProcessFlowNode({ label: 'Production / Processing', sortOrder: 2 }),
      emptyProcessFlowNode({ label: 'In-process Checks', sortOrder: 3 }),
      emptyProcessFlowNode({ label: 'Finished Goods Inspection', sortOrder: 4 }),
      emptyProcessFlowNode({ label: 'Packing & Dispatch', sortOrder: 5 }),
    ],
    descriptionPoints: [''],
    arrowStyle: defaultProcessFlowArrowStyle(),
    boxStyle: defaultProcessFlowBoxStyle(),
  }
}

export function processFlowNodeHasContent(node: ProcessFlowNode): boolean {
  return node.label.trim().length > 0
}

export function parseProcessFlowPayload(
  payload: Record<string, unknown> | null,
): ProcessFlowModulePayload {
  if (!payload || typeof payload !== 'object') {
    return emptyProcessFlowPayload()
  }

  const rawNodes = Array.isArray(payload.nodes)
    ? payload.nodes
    : Array.isArray(payload.steps)
      ? payload.steps
      : Array.isArray(payload.hierarchy)
        ? payload.hierarchy
        : null

  const nodes: ProcessFlowNode[] = rawNodes
    ? rawNodes
        .filter((item): item is Record<string, unknown> => !!item && typeof item === 'object')
        .map((raw, index) =>
          emptyProcessFlowNode({
            id: str(raw.id) || nextProcessFlowNodeId(),
            parentId: raw.parentId == null || raw.parentId === '' ? null : str(raw.parentId),
            label: str(raw.label ?? raw.name ?? raw.title ?? raw.step),
            sortOrder: Number.isFinite(Number(raw.sortOrder ?? raw.order ?? index))
              ? Number(raw.sortOrder ?? raw.order ?? index)
              : index,
            horizontalWithPrev: Boolean(
              raw.horizontalWithPrev ?? raw.alignHorizontal ?? raw.horizontal,
            ),
            linkFromId:
              raw.linkFromId == null || raw.linkFromId === ''
                ? null
                : str(raw.linkFromId),
            boxWidth:
              raw.boxWidth == null || raw.boxWidth === ''
                ? null
                : Number(raw.boxWidth),
            boxHeight:
              raw.boxHeight == null || raw.boxHeight === ''
                ? null
                : Number(raw.boxHeight),
          }),
        )
    : emptyProcessFlowPayload().nodes

  const ids = new Set(nodes.map((n) => n.id))
  const cleaned = nodes.map((n) => {
    let parentId = n.parentId && !ids.has(n.parentId) ? null : n.parentId
    let linkFromId = n.linkFromId && !ids.has(n.linkFromId) ? null : n.linkFromId
    if (linkFromId === n.id) linkFromId = null
    return parentId === n.parentId && linkFromId === n.linkFromId
      ? { ...n, parentId, linkFromId }
      : { ...n, parentId, linkFromId }
  })

  const descriptionPointsRaw = Array.isArray(payload.descriptionPoints)
    ? payload.descriptionPoints.map((p) => str(p)).filter(Boolean)
    : Array.isArray(payload.points)
      ? payload.points.map((p) => str(p)).filter(Boolean)
      : []
  const descriptionPoints =
    descriptionPointsRaw.length > 0 ? descriptionPointsRaw : ['']

  return {
    nodes:
      cleaned.length > 0
        ? normalizeProcessFlowHorizontal(cleaned)
        : emptyProcessFlowPayload().nodes,
    descriptionPoints,
    arrowStyle: parseProcessFlowArrowStyle(payload.arrowStyle),
    boxStyle: parseProcessFlowBoxStyle(payload.boxStyle),
  }
}

/** Children of a parent, sorted. */
export function processFlowChildren(
  nodes: ProcessFlowNode[],
  parentId: string | null,
): ProcessFlowNode[] {
  return nodes
    .filter((n) => n.parentId === parentId)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.label.localeCompare(b.label))
}

/** Group siblings into vertical rows; consecutive `horizontalWithPrev` share a row. */
export function groupProcessFlowSiblingRows(
  siblings: ProcessFlowNode[],
): ProcessFlowNode[][] {
  const rows: ProcessFlowNode[][] = []
  for (const node of siblings) {
    if (rows.length === 0 || !node.horizontalWithPrev) {
      rows.push([node])
    } else {
      rows[rows.length - 1]!.push(node)
    }
  }
  return rows
}

/** First sibling under a parent cannot be horizontal-with-prev. */
export function normalizeProcessFlowHorizontal(
  nodes: ProcessFlowNode[],
): ProcessFlowNode[] {
  const firstByParent = new Map<string | null, string>()
  for (const n of processFlowChildren(nodes, null)) {
    if (!firstByParent.has(null)) firstByParent.set(null, n.id)
  }
  const parents = new Set(nodes.map((n) => n.parentId))
  for (const parentId of parents) {
    const kids = processFlowChildren(nodes, parentId)
    if (kids[0]) firstByParent.set(parentId, kids[0].id)
  }
  return nodes.map((n) => {
    const firstId = firstByParent.get(n.parentId)
    if (n.id === firstId && n.horizontalWithPrev) {
      return { ...n, horizontalWithPrev: false }
    }
    return n
  })
}

export type ProcessFlowFlatRow = {
  node: ProcessFlowNode
  depth: number
}

/** Depth-first flat list for editor / outline. */
export function flattenProcessFlowTree(nodes: ProcessFlowNode[]): ProcessFlowFlatRow[] {
  const out: ProcessFlowFlatRow[] = []
  const walk = (parentId: string | null, depth: number) => {
    for (const node of processFlowChildren(nodes, parentId)) {
      out.push({ node, depth })
      walk(node.id, depth + 1)
    }
  }
  walk(null, 0)
  const seen = new Set(out.map((r) => r.node.id))
  for (const node of nodes) {
    if (!seen.has(node.id)) out.push({ node: { ...node, parentId: null }, depth: 0 })
  }
  return out
}

/** Sibling row containing `nodeId`, plus previous row under the same parent (for arrow targets). */
export function getProcessFlowRowContext(
  nodes: ProcessFlowNode[],
  nodeId: string,
): {
  parentId: string | null
  row: ProcessFlowNode[]
  rowIndex: number
  prevRow: ProcessFlowNode[] | null
  indexInRow: number
} | null {
  const node = nodes.find((n) => n.id === nodeId)
  if (!node) return null
  const siblings = processFlowChildren(nodes, node.parentId)
  const rows = groupProcessFlowSiblingRows(siblings)
  for (let ri = 0; ri < rows.length; ri++) {
    const row = rows[ri]!
    const indexInRow = row.findIndex((n) => n.id === nodeId)
    if (indexInRow < 0) continue
    return {
      parentId: node.parentId,
      row,
      rowIndex: ri,
      prevRow: ri > 0 ? rows[ri - 1]! : null,
      indexInRow,
    }
  }
  return null
}

/** Candidates for Arrow From (previous sibling row, or parent). */
export function processFlowArrowFromOptions(
  nodes: ProcessFlowNode[],
  nodeId: string,
): ProcessFlowNode[] {
  const ctx = getProcessFlowRowContext(nodes, nodeId)
  if (!ctx) return []
  const opts: ProcessFlowNode[] = []
  if (ctx.parentId) {
    const parent = nodes.find((n) => n.id === ctx.parentId)
    if (parent) opts.push(parent)
  }
  if (ctx.prevRow) opts.push(...ctx.prevRow)
  return opts
}

/** Plain-text outline for AI context. */
export function processFlowOutlineText(nodes: ProcessFlowNode[]): string {
  return flattenProcessFlowTree(nodes)
    .filter((r) => processFlowNodeHasContent(r.node))
    .map((r) => {
      const mark = r.node.horizontalWithPrev ? ' ↔' : ''
      return `${'  '.repeat(r.depth)}- ${r.node.label.trim()}${mark}`
    })
    .join('\n')
}

export function reindexProcessFlowSiblings(
  nodes: ProcessFlowNode[],
  parentId: string | null,
): ProcessFlowNode[] {
  const siblings = processFlowChildren(nodes, parentId)
  const order = new Map(siblings.map((n, i) => [n.id, i]))
  return normalizeProcessFlowHorizontal(
    nodes.map((n) =>
      n.parentId === parentId && order.has(n.id)
        ? { ...n, sortOrder: order.get(n.id)! }
        : n,
    ),
  )
}

function escSvg(raw: string): string {
  return raw
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

const SVG_GAP_X = 28

type SubtreeSize = { w: number; h: number }

function measureProcessFlowSubtree(
  nodes: ProcessFlowNode[],
  node: ProcessFlowNode,
  labeledOnly: boolean,
  boxStyle: ProcessFlowBoxStyle,
): SubtreeSize {
  const kids = processFlowChildren(nodes, node.id).filter(
    (k) => !labeledOnly || processFlowNodeHasContent(k),
  )
  const self = resolveProcessFlowBoxSize(node, boxStyle)
  const gapY = boxStyle.gapY
  if (kids.length === 0) return { w: self.width, h: self.height }

  const rows = groupProcessFlowSiblingRows(kids)
  let kidsW = 0
  let kidsH = 0
  for (let ri = 0; ri < rows.length; ri++) {
    const row = rows[ri]!
    const sizes = row.map((k) =>
      measureProcessFlowSubtree(nodes, k, labeledOnly, boxStyle),
    )
    const rowW =
      sizes.reduce((s, z) => s + z.w, 0) + Math.max(0, sizes.length - 1) * SVG_GAP_X
    const rowH = Math.max(...sizes.map((z) => z.h))
    kidsW = Math.max(kidsW, rowW)
    kidsH += rowH + (ri > 0 ? gapY : 0)
  }
  return {
    w: Math.max(self.width, kidsW),
    h: self.height + gapY + kidsH,
  }
}

type PlacedBox = {
  id: string
  x: number
  y: number
  w: number
  h: number
  cx: number
  cy: number
  label: string
  parentId: string | null
  linkFromId: string | null
}

function placeProcessFlowSubtree(
  nodes: ProcessFlowNode[],
  node: ProcessFlowNode,
  centerX: number,
  topY: number,
  labeledOnly: boolean,
  boxStyle: ProcessFlowBoxStyle,
  out: PlacedBox[],
): SubtreeSize {
  const size = measureProcessFlowSubtree(nodes, node, labeledOnly, boxStyle)
  const box = resolveProcessFlowBoxSize(node, boxStyle)
  const gapY = boxStyle.gapY
  const x = centerX - box.width / 2
  const y = topY
  out.push({
    id: node.id,
    x,
    y,
    w: box.width,
    h: box.height,
    cx: centerX,
    cy: y + box.height / 2,
    label: node.label.trim(),
    parentId: node.parentId,
    linkFromId: node.linkFromId,
  })

  const kids = processFlowChildren(nodes, node.id).filter(
    (k) => !labeledOnly || processFlowNodeHasContent(k),
  )
  if (kids.length === 0) return size

  const rows = groupProcessFlowSiblingRows(kids)
  let yCursor = topY + box.height + gapY
  for (let ri = 0; ri < rows.length; ri++) {
    const row = rows[ri]!
    const sizes = row.map((k) =>
      measureProcessFlowSubtree(nodes, k, labeledOnly, boxStyle),
    )
    const rowW =
      sizes.reduce((s, z) => s + z.w, 0) + Math.max(0, sizes.length - 1) * SVG_GAP_X
    const rowH = Math.max(...sizes.map((z) => z.h))

    const anchors = row.map((child) =>
      child.linkFromId ? out.find((p) => p.id === child.linkFromId) : null,
    )
    const hasAnchor = anchors.some(Boolean)

    if (hasAnchor) {
      for (let i = 0; i < row.length; i++) {
        const child = row[i]!
        const childSize = sizes[i]!
        const anchor = anchors[i]
        const childCx = anchor
          ? anchor.cx
          : centerX -
            rowW / 2 +
            childSize.w / 2 +
            sizes.slice(0, i).reduce((s, z) => s + z.w + SVG_GAP_X, 0)
        placeProcessFlowSubtree(
          nodes,
          child,
          childCx,
          yCursor,
          labeledOnly,
          boxStyle,
          out,
        )
      }
    } else {
      let xCursor = centerX - rowW / 2
      for (let i = 0; i < row.length; i++) {
        const child = row[i]!
        const childSize = sizes[i]!
        placeProcessFlowSubtree(
          nodes,
          child,
          xCursor + childSize.w / 2,
          yCursor,
          labeledOnly,
          boxStyle,
          out,
        )
        xCursor += childSize.w + SVG_GAP_X
      }
    }
    yCursor += rowH + gapY
  }
  return size
}

function resolveArrowFrom(
  node: ProcessFlowNode,
  placed: PlacedBox[],
  prevRow: ProcessFlowNode[] | null,
  indexInRow: number,
): PlacedBox | null {
  const byId = new Map(placed.map((p) => [p.id, p]))
  if (node.linkFromId) {
    const explicit = byId.get(node.linkFromId)
    if (explicit) return explicit
  }
  if (node.parentId) {
    const parent = byId.get(node.parentId)
    // Only use parent as arrow when this is the first child-row under parent
    // (no previous sibling row). Otherwise prefer previous sibling row.
    if (!prevRow && parent) return parent
  }
  if (prevRow && prevRow.length > 0) {
    const match = prevRow[Math.min(indexInRow, prevRow.length - 1)]!
    return byId.get(match.id) ?? null
  }
  if (node.parentId) return byId.get(node.parentId) ?? null
  return null
}

/**
 * SVG process flow chart from hierarchy (supports horizontal rows + arrow linkFrom).
 */
export function buildProcessFlowSvgMarkup(
  nodes: ProcessFlowNode[],
  arrowStyle: ProcessFlowArrowStyle = defaultProcessFlowArrowStyle(),
  boxStyle: ProcessFlowBoxStyle = defaultProcessFlowBoxStyle(),
): string {
  const printNodes = prepareProcessFlowPrintNodes(nodes)
  if (printNodes.length === 0) return ''

  const roots = processFlowChildren(printNodes, null)
  if (roots.length === 0) return ''

  const gapY = boxStyle.gapY
  const placed: PlacedBox[] = []
  const rows = groupProcessFlowSiblingRows(roots)
  const rowSizes = rows.map((row) =>
    row.map((n) => measureProcessFlowSubtree(printNodes, n, true, boxStyle)),
  )
  const contentW = Math.max(
    ...rowSizes.map(
      (sizes) =>
        sizes.reduce((s, z) => s + z.w, 0) + Math.max(0, sizes.length - 1) * SVG_GAP_X,
    ),
    boxStyle.width,
  )
  const padX = 48
  const padY = 40
  // Size to content (do not force 1000px — that stretched single-column charts in print).
  const width = Math.max(contentW + padX * 2, boxStyle.width + padX * 2)
  const centerX0 = width / 2

  let yCursor = padY
  let totalH = padY
  for (let ri = 0; ri < rows.length; ri++) {
    const row = rows[ri]!
    const sizes = rowSizes[ri]!
    const rowW =
      sizes.reduce((s, z) => s + z.w, 0) + Math.max(0, sizes.length - 1) * SVG_GAP_X
    const rowH = Math.max(...sizes.map((z) => z.h))
    const anchors = row.map((n) =>
      n.linkFromId ? placed.find((p) => p.id === n.linkFromId) : null,
    )
    const hasAnchor = anchors.some(Boolean)

    if (hasAnchor) {
      for (let i = 0; i < row.length; i++) {
        const node = row[i]!
        const childSize = sizes[i]!
        const anchor = anchors[i]
        const childCx = anchor
          ? anchor.cx
          : centerX0 -
            rowW / 2 +
            childSize.w / 2 +
            sizes.slice(0, i).reduce((s, z) => s + z.w + SVG_GAP_X, 0)
        placeProcessFlowSubtree(
          printNodes,
          node,
          childCx,
          yCursor,
          true,
          boxStyle,
          placed,
        )
      }
    } else {
      let xCursor = centerX0 - rowW / 2
      for (let i = 0; i < row.length; i++) {
        const node = row[i]!
        const childSize = sizes[i]!
        placeProcessFlowSubtree(
          printNodes,
          node,
          xCursor + childSize.w / 2,
          yCursor,
          true,
          boxStyle,
          placed,
        )
        xCursor += childSize.w + SVG_GAP_X
      }
    }
    yCursor += rowH + gapY
    totalH = yCursor
  }
  const height = totalH + padY - gapY

  const boxes = placed
    .map((p) => {
      const label = escSvg(p.label)
      const fs = fitProcessFlowFontSize(p.label, p.w, p.h)
      return `
      <g>
        <rect x="${p.x}" y="${p.y}" width="${p.w}" height="${p.h}" rx="4" ry="4"
          fill="#fffbeb" stroke="#b45309" stroke-width="2"/>
        <text x="${p.cx}" y="${p.cy}" text-anchor="middle" dominant-baseline="middle"
          font-family="Arial, Helvetica, sans-serif" font-size="${fs}" font-weight="700"
          fill="#78350f">${label}</text>
      </g>`
    })
    .join('')

  const arrows: string[] = []
  const drawn = new Set<string>()

  const arrowColor = escSvg(arrowStyle.color || '#78716c')
  const arrowWidth = arrowStyle.width
  const dashAttr = arrowStyle.dashed ? ' stroke-dasharray="6 4"' : ''
  const design = arrowStyle.design || 'triangle'
  const useMarker = design !== 'none'
  const markerEnd = useMarker ? ' marker-end="url(#pfArrow)"' : ''

  const markerMarkup = (() => {
    switch (design) {
      case 'chevron':
        return `<marker id="pfArrow" markerWidth="12" markerHeight="12" refX="9" refY="5" orient="auto" markerUnits="strokeWidth">
          <path d="M1,1 L9,5 L1,9" fill="none" stroke="${arrowColor}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
        </marker>`
      case 'diamond':
        return `<marker id="pfArrow" markerWidth="12" markerHeight="12" refX="9" refY="5" orient="auto">
          <path d="M1,5 L5,1 L9,5 L5,9 Z" fill="${arrowColor}"/>
        </marker>`
      case 'circle':
        return `<marker id="pfArrow" markerWidth="10" markerHeight="10" refX="7" refY="5" orient="auto">
          <circle cx="5" cy="5" r="3.2" fill="${arrowColor}"/>
        </marker>`
      case 'bar':
        return `<marker id="pfArrow" markerWidth="8" markerHeight="12" refX="4" refY="6" orient="auto">
          <rect x="2" y="1" width="3" height="10" fill="${arrowColor}"/>
        </marker>`
      case 'none':
        return ''
      case 'triangle':
      default:
        return `<marker id="pfArrow" markerWidth="10" markerHeight="10" refX="8" refY="4" orient="auto">
          <path d="M0,0 L8,4 L0,8 Z" fill="${arrowColor}"/>
        </marker>`
    }
  })()

  const emitArrow = (from: PlacedBox, to: PlacedBox) => {
    const key = `${from.id}->${to.id}`
    if (drawn.has(key)) return
    drawn.add(key)
    arrows.push(
      `<line x1="${from.cx}" y1="${from.y + from.h}" x2="${to.cx}" y2="${to.y}" stroke="${arrowColor}" stroke-width="${arrowWidth}" stroke-linecap="round"${dashAttr}${markerEnd}/>`,
    )
  }

  const walkArrows = (parentId: string | null) => {
    const siblings = processFlowChildren(printNodes, parentId)
    const sibRows = groupProcessFlowSiblingRows(siblings)
    for (let ri = 0; ri < sibRows.length; ri++) {
      const row = sibRows[ri]!
      const prevRow = ri > 0 ? sibRows[ri - 1]! : null
      for (let i = 0; i < row.length; i++) {
        const node = row[i]!
        const to = placed.find((p) => p.id === node.id)
        if (!to) continue
        const from = resolveArrowFrom(node, placed, prevRow, i)
        if (from && from.id !== to.id) emitArrow(from, to)
        walkArrows(node.id)
      }
    }
  }
  walkArrows(null)

  return `
<svg class="pfc-svg" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Process flow chart" preserveAspectRatio="xMidYMin meet">
  <defs>
    ${markerMarkup}
  </defs>
  <rect x="0" y="0" width="${width}" height="${height}" fill="#fffdf8" stroke="#78716c" stroke-width="2"/>
  ${arrows.join('\n')}
  ${boxes}
</svg>`
}

function prepareProcessFlowPrintNodes(nodes: ProcessFlowNode[]): ProcessFlowNode[] {
  const working = nodes.filter(processFlowNodeHasContent)
  if (working.length === 0) return []
  const byId = new Map(nodes.map((n) => [n.id, n]))
  const labeledIds = new Set(working.map((n) => n.id))

  const nearestLabeledParent = (parentId: string | null): string | null => {
    let p = parentId
    while (p) {
      if (labeledIds.has(p)) return p
      p = byId.get(p)?.parentId ?? null
    }
    return null
  }

  return normalizeProcessFlowHorizontal(
    working.map((n) => {
      const parentId = nearestLabeledParent(n.parentId)
      let linkFromId =
        n.linkFromId && labeledIds.has(n.linkFromId) ? n.linkFromId : null
      if (linkFromId === n.id) linkFromId = null
      return { ...n, parentId, linkFromId }
    }),
  )
}

function processFlowArrowHeadHtml(
  design: ProcessFlowArrowDesign,
  color: string,
  width: number,
): string {
  const c = escSvg(color)
  const w = Math.max(1.5, width)
  switch (design) {
    case 'chevron':
      return `<span class="pfc-ah pfc-ah-chevron" style="border-left-color:${c};border-bottom-color:${c};width:${8 + w}px;height:${8 + w}px"></span>`
    case 'diamond':
      return `<span class="pfc-ah pfc-ah-diamond" style="background:${c};width:${7 + w}px;height:${7 + w}px"></span>`
    case 'circle':
      return `<span class="pfc-ah pfc-ah-circle" style="background:${c};width:${6 + w}px;height:${6 + w}px"></span>`
    case 'bar':
      return `<span class="pfc-ah pfc-ah-bar" style="background:${c};width:${3 + w * 0.5}px;height:${10 + w}px"></span>`
    case 'none':
      return ''
    case 'triangle':
    default:
      return `<span class="pfc-ah pfc-ah-triangle" style="border-top-color:${c};border-width:${6 + w}px ${5 + w * 0.5}px 0"></span>`
  }
}

/**
 * HTML flowchart matching Process Flow Canvas (flex rows / branches) — for print/preview.
 * Scales to fit the print chart area (no scrollbars).
 */
export function buildProcessFlowHtmlMarkup(
  nodes: ProcessFlowNode[],
  arrowStyle: ProcessFlowArrowStyle = defaultProcessFlowArrowStyle(),
  boxStyle: ProcessFlowBoxStyle = defaultProcessFlowBoxStyle(),
): string {
  const printNodes = prepareProcessFlowPrintNodes(nodes)
  if (printNodes.length === 0) return ''

  const color = arrowStyle.color || '#78716c'
  const lineW = Math.max(1.5, arrowStyle.width || 2.2)
  const dashed = Boolean(arrowStyle.dashed)
  const design = arrowStyle.design || 'triangle'
  const gapY = Math.max(0, boxStyle.gapY)
  const lineStyle = dashed
    ? `width:${lineW}px;background-image:repeating-linear-gradient(to bottom,${escSvg(color)} 0 5px,transparent 5px 9px);background-color:transparent;`
    : `width:${lineW}px;background:${escSvg(color)};`
  const hLineStyle = dashed
    ? `height:${lineW}px;background-image:repeating-linear-gradient(to right,${escSvg(color)} 0 5px,transparent 5px 9px);background-color:transparent;`
    : `height:${lineW}px;background:${escSvg(color)};`
  const head = processFlowArrowHeadHtml(design, color, lineW)

  const renderDownArrow = () => `
    <div class="pfc-down" style="height:${gapY}px">
      <div class="pfc-vline" style="${lineStyle}"></div>
      ${head}
    </div>`

  const renderNode = (node: ProcessFlowNode): string => {
    const size = resolveProcessFlowBoxSize(node, boxStyle)
    const fs = fitProcessFlowFontSize(node.label, size.width, size.height)
    const kids = processFlowChildren(printNodes, node.id)
    const kidRows = groupProcessFlowSiblingRows(kids)
    const branches = kidRows
      .map((row) => {
        const count = row.length
        if (count <= 1) {
          return `<div class="pfc-branch-single">${renderDownArrow()}${row
            .map((c) => renderNode(c))
            .join('')}</div>`
        }
        const stemH = Math.round(gapY * 0.35)
        const dropH = Math.max(0, gapY - stemH)
        const cols = row
          .map(
            (child) => `
          <div class="pfc-branch-col">
            <div class="pfc-drop" style="height:${dropH}px">
              <div class="pfc-vline" style="${lineStyle}"></div>
              ${head}
            </div>
            ${renderNode(child)}
          </div>`,
          )
          .join('')
        return `
        <div class="pfc-branch-multi">
          <div class="pfc-stem" style="${lineStyle}height:${stemH + lineW}px;margin-bottom:-${lineW}px"></div>
          <div class="pfc-fork-row">
            <div class="pfc-hline" style="${hLineStyle}left:calc(100% / ${count} / 2);right:calc(100% / ${count} / 2)"></div>
            ${cols}
          </div>
        </div>`
      })
      .join('')

    return `
      <div class="pfc-node">
        <div class="pfc-box" style="width:${size.width}px;height:${size.height}px;font-size:${fs}px">${escSvg(node.label.trim())}</div>
        ${branches}
      </div>`
  }

  const roots = processFlowChildren(printNodes, null)
  const rootRows = groupProcessFlowSiblingRows(roots)
  const body = rootRows
    .map((row, ri) => {
      const rowHtml = `<div class="pfc-root-row">${row.map((n) => renderNode(n)).join('')}</div>`
      if (ri === 0) return rowHtml
      if (row.length === 1) {
        return `<div class="pfc-branch-single">${renderDownArrow()}${rowHtml}</div>`
      }
      return rowHtml
    })
    .join('')

  // Natural pixel size (approx HTML flex layout).
  const HTML_COL_GAP = 20 // .pfc-branch-col horizontal padding pair
  let natW = boxStyle.width
  let natH = 0
  for (let ri = 0; ri < rootRows.length; ri++) {
    const row = rootRows[ri]!
    const sizes = row.map((n) =>
      measureProcessFlowSubtree(printNodes, n, true, boxStyle),
    )
    const colGap = Math.max(SVG_GAP_X, HTML_COL_GAP)
    const rowW =
      sizes.reduce((s, z) => s + z.w, 0) + Math.max(0, sizes.length - 1) * colGap
    const rowH = Math.max(...sizes.map((z) => z.h), boxStyle.height)
    natW = Math.max(natW, rowW)
    natH += rowH + (ri > 0 ? gapY : 0)
  }
  natW = Math.ceil(natW + 16)
  natH = Math.ceil(natH + 16)

  // Fit inside A4 content chart area (~170mm × ~125mm @ 96dpi).
  const MAX_W = 640
  const MAX_H = 470
  const scale = Math.min(1, MAX_W / natW, MAX_H / natH)
  const fitW = Math.ceil(natW * scale)
  const fitH = Math.ceil(natH * scale)

  return `<div class="pfc-fit" style="width:${fitW}px;height:${fitH}px">
  <div class="pfc-scale" style="width:${natW}px;height:${natH}px;transform:scale(${scale.toFixed(4)});transform-origin:top left">
    <div class="pfc-canvas" role="img" aria-label="Process flow chart">${body}</div>
  </div>
</div>
<script>(function(){
  function fitPfc(){
    var fit=document.querySelector(".pfc-fit");
    var scaleEl=document.querySelector(".pfc-scale");
    var canvas=document.querySelector(".pfc-canvas");
    var wrap=document.querySelector(".pfc-drawing-wrap");
    if(!fit||!scaleEl||!canvas) return;
    var natW=Math.max(canvas.scrollWidth,canvas.offsetWidth,1);
    var natH=Math.max(canvas.scrollHeight,canvas.offsetHeight,1);
    var maxW=Math.min(640,(wrap?wrap.clientWidth:640)-16);
    if(!(maxW>40)) maxW=640;
    var maxH=470;
    var s=Math.min(1,maxW/natW,maxH/natH);
    scaleEl.style.width=natW+"px";
    scaleEl.style.height=natH+"px";
    scaleEl.style.transform="scale("+s+")";
    scaleEl.style.transformOrigin="top left";
    fit.style.width=Math.ceil(natW*s)+"px";
    fit.style.height=Math.ceil(natH*s)+"px";
  }
  if(document.readyState==="loading") document.addEventListener("DOMContentLoaded",fitPfc);
  else fitPfc();
  window.addEventListener("load",fitPfc);
})();</script>`
}

/** Preferred print markup: HTML canvas (matches module). SVG kept as fallback. */
export function buildProcessFlowPrintMarkup(
  nodes: ProcessFlowNode[],
  arrowStyle: ProcessFlowArrowStyle = defaultProcessFlowArrowStyle(),
  boxStyle: ProcessFlowBoxStyle = defaultProcessFlowBoxStyle(),
): string {
  const html = buildProcessFlowHtmlMarkup(nodes, arrowStyle, boxStyle)
  if (html) return html
  return buildProcessFlowSvgMarkup(nodes, arrowStyle, boxStyle)
}
