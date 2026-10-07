/** Plant Layout — canvas boxes (percent positions) for editor + print SVG. */

export type PlantLayoutShape =
  | 'rectangle'
  | 'square'
  | 'triangle'
  | 'cone'
  | 'freehand'

/** Point in local box space (0–100) or canvas percent space. */
export type PlantLayoutPoint = { x: number; y: number }

export type PlantLayoutBox = {
  id: string
  label: string
  /** Incoming material / process note (shown inside box). */
  input: string
  /** Outgoing material / process note (shown inside box). */
  output: string
  /** Percent of canvas width (0–100). */
  x: number
  /** Percent of canvas height (0–100). */
  y: number
  w: number
  h: number
  /** Soft fill tint key used by editor/print (fallback when fillHex empty). */
  tone: PlantLayoutTone
  /** Custom fill colour (#rrggbb). When set, overrides tone palette. */
  fillHex: string
  /** Display name for the selected colour (chart shade or custom). */
  colorName: string
  /** Visual outline on canvas + print. */
  shape: PlantLayoutShape
  /** Label text rotation in degrees (0–359). */
  labelDegrees: number
  /**
   * Freehand outline in local box coordinates (0–100).
   * Empty → default blob until the user draws.
   */
  freehandPoints: PlantLayoutPoint[]
}

export type PlantLayoutTone =
  | 'amber'
  | 'stone'
  | 'sky'
  | 'emerald'
  | 'rose'
  | 'violet'

export type PlantLayoutModulePayload = {
  boxes: PlantLayoutBox[]
}

/** Print / editor coordinate space used to keep Square visually square. */
const LAYOUT_VIEW_W = 1000
const LAYOUT_VIEW_H = 700

/**
 * Physical drawing frame size (mm) for Box Size inputs.
 * Aspect matches LAYOUT_VIEW (1000×700 ≈ 200×140).
 */
export const PLANT_LAYOUT_CANVAS_WIDTH_MM = 200
export const PLANT_LAYOUT_CANVAS_LENGTH_MM = 140

const TONES: PlantLayoutTone[] = ['amber', 'stone', 'sky', 'emerald', 'rose', 'violet']

export const PLANT_LAYOUT_TONES: { value: PlantLayoutTone; label: string }[] = [
  { value: 'amber', label: 'Amber' },
  { value: 'stone', label: 'Stone' },
  { value: 'sky', label: 'Sky' },
  { value: 'emerald', label: 'Emerald' },
  { value: 'rose', label: 'Rose' },
  { value: 'violet', label: 'Violet' },
]

export const PLANT_LAYOUT_SHAPES: { value: PlantLayoutShape; label: string }[] = [
  { value: 'rectangle', label: 'Rectangle' },
  { value: 'square', label: 'Square' },
  { value: 'triangle', label: 'Triangle' },
  { value: 'cone', label: 'Cone' },
  { value: 'freehand', label: 'Free Hand' },
]

const SHAPE_SET = new Set<string>(PLANT_LAYOUT_SHAPES.map((s) => s.value))

let boxSeq = 0

function nextBoxId(): string {
  boxSeq += 1
  return `pl-box-${Date.now()}-${boxSeq}`
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n))
}

function round1(n: number): number {
  return Math.round(n * 10) / 10
}

const TOUCH_EPS = 0.05

export type BoxRect = Pick<PlantLayoutBox, 'x' | 'y' | 'w' | 'h'>

export function boxArea(b: BoxRect): number {
  return Math.max(0, b.w) * Math.max(0, b.h)
}

/** Positive-area overlap only — edges may touch. */
export function boxesOverlap(a: BoxRect, b: BoxRect): boolean {
  return (
    a.x + a.w > b.x + TOUCH_EPS &&
    b.x + b.w > a.x + TOUCH_EPS &&
    a.y + a.h > b.y + TOUCH_EPS &&
    b.y + b.h > a.y + TOUCH_EPS
  )
}

/** True when inner is fully inside outer (with tiny padding). */
export function boxContains(outer: BoxRect, inner: BoxRect): boolean {
  return (
    inner.x >= outer.x - TOUCH_EPS &&
    inner.y >= outer.y - TOUCH_EPS &&
    inner.x + inner.w <= outer.x + outer.w + TOUCH_EPS &&
    inner.y + inner.h <= outer.y + outer.h + TOUCH_EPS
  )
}

/** Smallest box that fully contains `box` (nesting parent), or null = canvas. */
export function findParentBox(
  box: PlantLayoutBox,
  all: PlantLayoutBox[],
): PlantLayoutBox | null {
  const candidates = all.filter(
    (o) => o.id !== box.id && boxContains(o, box) && boxArea(o) > boxArea(box) + 0.5,
  )
  if (candidates.length === 0) return null
  candidates.sort((a, b) => boxArea(a) - boxArea(b))
  return candidates[0] ?? null
}

function collideWithOthers(moving: PlantLayoutBox, all: PlantLayoutBox[]): boolean {
  return all.some((other) => {
    if (other.id === moving.id) return false
    // Nested parent/child may overlap intentionally.
    if (boxContains(other, moving) || boxContains(moving, other)) return false
    return boxesOverlap(moving, other)
  })
}

/** Clamp box into parent (or canvas) and avoid overlapping siblings. */
export function constrainBoxPlacement(
  proposed: PlantLayoutBox,
  all: PlantLayoutBox[],
  fallback: PlantLayoutBox,
): PlantLayoutBox {
  let next = normalizeBox(proposed)

  // Prefer parent from fallback position so a nested box stays nested while dragging.
  const parent =
    findParentBox({ ...fallback, id: next.id }, all) ?? findParentBox(next, all)

  if (parent) {
    const maxW = Math.max(8, parent.w - 0.4)
    const maxH = Math.max(8, parent.h - 0.4)
    const w = clamp(next.w, 8, maxW)
    const h = clamp(next.h, 8, maxH)
    const x = clamp(next.x, parent.x + 0.2, parent.x + parent.w - w - 0.2)
    const y = clamp(next.y, parent.y + 0.2, parent.y + parent.h - h - 0.2)
    next = normalizeBox({ ...next, x, y, w, h })
  } else {
    next = normalizeBox(next)
  }

  if (!collideWithOthers(next, all)) return next

  // Try axis-separated slides from proposed toward fallback.
  let xOnly = normalizeBox({ ...next, x: fallback.x })
  if (parent) {
    xOnly = normalizeBox({
      ...xOnly,
      x: clamp(xOnly.x, parent.x + 0.2, parent.x + parent.w - xOnly.w - 0.2),
    })
  }
  if (!collideWithOthers(xOnly, all)) return xOnly

  let yOnly = normalizeBox({ ...next, y: fallback.y })
  if (parent) {
    yOnly = normalizeBox({
      ...yOnly,
      y: clamp(yOnly.y, parent.y + 0.2, parent.y + parent.h - yOnly.h - 0.2),
    })
  }
  if (!collideWithOthers(yOnly, all)) return yOnly

  return normalizeBox(fallback)
}

/** Empty canvas — outer Factory Premises border only, no inner boxes. */
export function emptyPlantLayoutPayload(): PlantLayoutModulePayload {
  return { boxes: [] }
}

/** Starter rooms — typical BIS factory layout sketch. */
export function defaultPlantLayoutBoxes(): PlantLayoutBox[] {
  return [
    {
      id: nextBoxId(),
      label: 'Raw Material Store',
      input: '',
      output: '',
      x: 4,
      y: 6,
      w: 28,
      h: 22,
      tone: 'amber' as const,
      shape: 'rectangle' as const,
    },
    {
      id: nextBoxId(),
      label: 'Production Area',
      input: '',
      output: '',
      x: 36,
      y: 6,
      w: 36,
      h: 38,
      tone: 'sky' as const,
      shape: 'rectangle' as const,
    },
    {
      id: nextBoxId(),
      label: 'Testing Laboratory',
      input: '',
      output: '',
      x: 76,
      y: 6,
      w: 20,
      h: 22,
      tone: 'emerald' as const,
      shape: 'rectangle' as const,
    },
    {
      id: nextBoxId(),
      label: 'Finished Goods',
      input: '',
      output: '',
      x: 4,
      y: 34,
      w: 28,
      h: 22,
      tone: 'violet' as const,
      shape: 'rectangle' as const,
    },
    {
      id: nextBoxId(),
      label: 'Office / Admin',
      input: '',
      output: '',
      x: 76,
      y: 34,
      w: 20,
      h: 22,
      tone: 'rose' as const,
      shape: 'rectangle' as const,
    },
    {
      id: nextBoxId(),
      label: 'Utilities / DG',
      input: '',
      output: '',
      x: 36,
      y: 52,
      w: 22,
      h: 18,
      tone: 'stone' as const,
      shape: 'rectangle' as const,
    },
    {
      id: nextBoxId(),
      label: 'Dispatch / Gate',
      input: '',
      output: '',
      x: 62,
      y: 70,
      w: 34,
      h: 22,
      tone: 'amber' as const,
      shape: 'rectangle' as const,
    },
  ].map((b) => normalizeBox(b))
}

export function emptyPlantLayoutBox(
  partial?: Partial<PlantLayoutBox>,
): PlantLayoutBox {
  const tone = partial?.tone ?? TONES[Math.floor(Math.random() * TONES.length)]!
  const toneColors = plantLayoutToneColors(tone)
  const toneLabel =
    PLANT_LAYOUT_TONES.find((t) => t.value === tone)?.label ?? 'Amber'
  return normalizeBox({
    id: partial?.id ?? nextBoxId(),
    label: partial?.label ?? 'New Area',
    input: partial?.input ?? '',
    output: partial?.output ?? '',
    x: partial?.x ?? 36,
    y: partial?.y ?? 36,
    w: partial?.w ?? 22,
    h: partial?.h ?? 18,
    tone,
    fillHex: partial?.fillHex ?? toneColors.fill,
    colorName: partial?.colorName ?? toneLabel,
    shape: partial?.shape ?? 'rectangle',
    labelDegrees: partial?.labelDegrees ?? 0,
    freehandPoints: partial?.freehandPoints ?? [],
  })
}

/** Normalize label rotation into 0–359 (integer degrees). */
export function normalizeLabelDegrees(raw: unknown): number {
  const n = Number(raw)
  if (!Number.isFinite(n)) return 0
  const rounded = Math.round(n)
  return ((rounded % 360) + 360) % 360
}

export function normalizeBox(box: PlantLayoutBox): PlantLayoutBox {
  const shape = parseShape(box.shape)
  let w = clamp(round1(box.w), 8, 100)
  let h = clamp(round1(box.h), 8, 100)

  if (shape === 'square') {
    // Lock visual square in 1000×700 layout space (width drives height).
    h = round1(w * (LAYOUT_VIEW_W / LAYOUT_VIEW_H))
    if (h > 100) {
      h = 100
      w = clamp(round1(h * (LAYOUT_VIEW_H / LAYOUT_VIEW_W)), 8, 100)
    }
  }

  const x = clamp(round1(box.x), 0, 100 - w)
  const y = clamp(round1(box.y), 0, 100 - h)
  const tone = TONES.includes(box.tone) ? box.tone : 'amber'
  const toneFill = plantLayoutToneColors(tone).fill
  const fillHex = normalizeHexColor(box.fillHex) || toneFill
  const colorName =
    String(box.colorName ?? '').trim() ||
    PLANT_LAYOUT_TONES.find((t) => t.value === tone)?.label ||
    'Colour'
  return {
    id: box.id || nextBoxId(),
    // Allow empty while typing — do not force "Area" on every keystroke.
    label: String(box.label ?? ''),
    input: String(box.input ?? ''),
    output: String(box.output ?? ''),
    x,
    y,
    w,
    h,
    tone,
    fillHex,
    colorName,
    shape,
    labelDegrees: normalizeLabelDegrees(box.labelDegrees),
    freehandPoints:
      shape === 'freehand' ? normalizeFreehandPoints(box.freehandPoints) : [],
  }
}

export function normalizeFreehandPoints(raw: unknown): PlantLayoutPoint[] {
  if (!Array.isArray(raw)) return []
  const pts: PlantLayoutPoint[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const rec = item as Record<string, unknown>
    const x = Number(rec.x)
    const y = Number(rec.y)
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue
    pts.push({ x: clamp(round1(x), 0, 100), y: clamp(round1(y), 0, 100) })
  }
  return pts
}

/** SVG path from freehand points (local 0–100), closed. */
export function freehandPointsToPathD(points: PlantLayoutPoint[]): string {
  if (points.length < 3) return plantLayoutShapePathD('freehand')
  const [first, ...rest] = points
  let d = `M ${first!.x.toFixed(2)} ${first!.y.toFixed(2)}`
  for (const p of rest) {
    d += ` L ${p.x.toFixed(2)} ${p.y.toFixed(2)}`
  }
  return `${d} Z`
}

/** Path for any box shape (uses drawn freehand points when present). */
export function plantLayoutBoxPathD(
  box: Pick<PlantLayoutBox, 'shape' | 'freehandPoints'>,
): string {
  if (box.shape === 'freehand' && box.freehandPoints.length >= 3) {
    return freehandPointsToPathD(box.freehandPoints)
  }
  return plantLayoutShapePathD(box.shape)
}

/**
 * Build / update a freehand box from canvas-percent stroke points.
 * Fits bounding box to the stroke and stores local 0–100 outline points.
 */
export function boxFromFreehandCanvasPoints(
  canvasPoints: PlantLayoutPoint[],
  base: PlantLayoutBox,
): PlantLayoutBox | null {
  if (canvasPoints.length < 3) return null
  const xs = canvasPoints.map((p) => p.x)
  const ys = canvasPoints.map((p) => p.y)
  let minX = Math.min(...xs)
  let maxX = Math.max(...xs)
  let minY = Math.min(...ys)
  let maxY = Math.max(...ys)
  const pad = 0.8
  minX = Math.max(0, minX - pad)
  minY = Math.max(0, minY - pad)
  maxX = Math.min(100, maxX + pad)
  maxY = Math.min(100, maxY + pad)
  let w = Math.max(round1(maxX - minX), 8)
  let h = Math.max(round1(maxY - minY), 8)
  if (minX + w > 100) minX = Math.max(0, 100 - w)
  if (minY + h > 100) minY = Math.max(0, 100 - h)
  const local = canvasPoints.map((p) => ({
    x: clamp(round1(((p.x - minX) / w) * 100), 0, 100),
    y: clamp(round1(((p.y - minY) / h) * 100), 0, 100),
  }))
  return normalizeBox({
    ...base,
    shape: 'freehand',
    x: round1(minX),
    y: round1(minY),
    w,
    h,
    freehandPoints: local,
  })
}

/** Display / print label — empty falls back to Area. */
export function plantLayoutBoxDisplayLabel(box: Pick<PlantLayoutBox, 'label'>): string {
  return box.label.trim() || 'Area'
}

/** Box size on the drawing frame (Width = horizontal, Length = vertical). */
export function plantLayoutBoxSizeMm(box: Pick<PlantLayoutBox, 'w' | 'h'>): {
  widthMm: number
  lengthMm: number
} {
  return {
    widthMm: round1((box.w / 100) * PLANT_LAYOUT_CANVAS_WIDTH_MM),
    lengthMm: round1((box.h / 100) * PLANT_LAYOUT_CANVAS_LENGTH_MM),
  }
}

/** Convert Width/Length mm into canvas percent size. */
export function plantLayoutMmToPercent(widthMm: number, lengthMm: number): {
  w: number
  h: number
} {
  const w = (clamp(widthMm, 1, PLANT_LAYOUT_CANVAS_WIDTH_MM) / PLANT_LAYOUT_CANVAS_WIDTH_MM) * 100
  const h =
    (clamp(lengthMm, 1, PLANT_LAYOUT_CANVAS_LENGTH_MM) / PLANT_LAYOUT_CANVAS_LENGTH_MM) * 100
  return { w: round1(w), h: round1(h) }
}

function str(raw: unknown): string {
  return String(raw ?? '').trim()
}

function num(raw: unknown, fallback: number): number {
  const n = Number(raw)
  return Number.isFinite(n) ? n : fallback
}

function parseTone(raw: unknown): PlantLayoutTone {
  const v = str(raw).toLowerCase()
  return (TONES as string[]).includes(v) ? (v as PlantLayoutTone) : 'amber'
}

export function parseShape(raw: unknown): PlantLayoutShape {
  const v = str(raw).toLowerCase().replace(/[\s_-]+/g, '')
  if (v === 'rect' || v === 'ractangle') return 'rectangle'
  if (v === 'trangle' || v === 'tri') return 'triangle'
  if (v === 'free' || v === 'freehanddraw') return 'freehand'
  if (SHAPE_SET.has(v)) return v as PlantLayoutShape
  return 'rectangle'
}

/** SVG path in 0–100 viewBox for editor + print shapes. */
export function plantLayoutShapePathD(shape: PlantLayoutShape): string {
  switch (shape) {
    case 'triangle':
      return 'M 50 6 L 94 94 L 6 94 Z'
    case 'cone':
      return 'M 50 4 L 92 88 Q 50 98 8 88 Z'
    case 'freehand':
      return 'M 18 28 C 8 12, 38 4, 52 10 C 68 4, 92 14, 88 34 C 96 48, 90 72, 74 84 C 58 96, 36 94, 22 82 C 6 70, 8 46, 18 28 Z'
    case 'square':
    case 'rectangle':
    default:
      return 'M 3 3 H 97 V 97 H 3 Z'
  }
}

export function parsePlantLayoutPayload(
  payload: Record<string, unknown> | null,
): PlantLayoutModulePayload {
  if (!payload || !Array.isArray(payload.boxes)) {
    // First open / no saved data → empty canvas (outer border only).
    return emptyPlantLayoutPayload()
  }
  const boxes = payload.boxes
    .filter((item): item is Record<string, unknown> => !!item && typeof item === 'object')
    .map((raw) =>
      normalizeBox({
        id: str(raw.id) || nextBoxId(),
        label: str(raw.label ?? raw.name ?? raw.title) || 'Area',
        input: str(raw.input ?? raw.in),
        output: str(raw.output ?? raw.out),
        x: num(raw.x, 10),
        y: num(raw.y, 10),
        w: num(raw.w ?? raw.width, 20),
        h: num(raw.h ?? raw.height, 16),
        tone: parseTone(raw.tone ?? raw.color),
        fillHex: normalizeHexColor(
          raw.fillHex ?? raw.hex ?? raw.fill ?? raw.colorHex,
        ),
        colorName: str(raw.colorName ?? raw.fillName ?? raw.colourName),
        shape: parseShape(raw.shape ?? raw.boxShape ?? raw.type),
        labelDegrees: normalizeLabelDegrees(
          raw.labelDegrees ?? raw.textDegrees ?? raw.rotation ?? raw.rotate,
        ),
        freehandPoints: normalizeFreehandPoints(
          raw.freehandPoints ?? raw.points ?? raw.pathPoints,
        ),
      }),
    )
  return { boxes }
}

export function normalizeHexColor(raw: unknown): string {
  const s = String(raw ?? '').trim()
  const m = s.match(/^#?([0-9a-fA-F]{6})$/)
  return m ? `#${m[1]!.toLowerCase()}` : ''
}

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const n = normalizeHexColor(hex)
  if (!n) return null
  return {
    r: parseInt(n.slice(1, 3), 16),
    g: parseInt(n.slice(3, 5), 16),
    b: parseInt(n.slice(5, 7), 16),
  }
}

function rgbToHex(r: number, g: number, b: number): string {
  const c = (n: number) =>
    clamp(Math.round(n), 0, 255).toString(16).padStart(2, '0')
  return `#${c(r)}${c(g)}${c(b)}`
}

/** Derive stroke + readable text from a fill hex. */
export function plantLayoutColorsFromHex(fillHex: string): {
  fill: string
  stroke: string
  text: string
} {
  const fill = normalizeHexColor(fillHex) || '#fef3c7'
  const rgb = hexToRgb(fill) ?? { r: 254, g: 243, b: 199 }
  const stroke = rgbToHex(rgb.r * 0.45, rgb.g * 0.45, rgb.b * 0.45)
  const luma = (0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b) / 255
  const text =
    luma > 0.62 ? rgbToHex(rgb.r * 0.28, rgb.g * 0.28, rgb.b * 0.28) : '#1c1917'
  return { fill, stroke, text }
}

/** Effective colours for a box (custom fillHex or tone fallback). */
export function plantLayoutBoxColors(
  box: Pick<PlantLayoutBox, 'tone' | 'fillHex' | 'colorName'>,
): { fill: string; stroke: string; text: string; name: string } {
  const fromTone = plantLayoutToneColors(box.tone)
  const custom = normalizeHexColor(box.fillHex)
  const fill = custom || fromTone.fill
  const name =
    box.colorName.trim() ||
    PLANT_LAYOUT_TONES.find((t) => t.value === box.tone)?.label ||
    'Colour'
  if (!custom || custom === fromTone.fill) {
    return { ...fromTone, fill, name }
  }
  return { ...plantLayoutColorsFromHex(fill), name }
}

/** Fill / stroke colors for editor + print SVG (print-safe hex). */
export function plantLayoutToneColors(tone: PlantLayoutTone): {
  fill: string
  stroke: string
  text: string
} {
  switch (tone) {
    case 'sky':
      return { fill: '#e0f2fe', stroke: '#0369a1', text: '#0c4a6e' }
    case 'emerald':
      return { fill: '#d1fae5', stroke: '#047857', text: '#064e3b' }
    case 'rose':
      return { fill: '#ffe4e6', stroke: '#be123c', text: '#881337' }
    case 'violet':
      return { fill: '#ede9fe', stroke: '#6d28d9', text: '#4c1d95' }
    case 'stone':
      return { fill: '#f5f5f4', stroke: '#57534e', text: '#292524' }
    case 'amber':
    default:
      return { fill: '#fef3c7', stroke: '#b45309', text: '#78350f' }
  }
}

function escSvg(raw: string): string {
  return raw
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** SVG markup for print (viewBox 0 0 1000 700). */
export function buildPlantLayoutSvgMarkup(boxes: PlantLayoutBox[]): string {
  const rects = boxes
    .map((box) => {
      const c = plantLayoutBoxColors(box)
      const x = (box.x / 100) * LAYOUT_VIEW_W
      const y = (box.y / 100) * LAYOUT_VIEW_H
      const w = (box.w / 100) * LAYOUT_VIEW_W
      const h = (box.h / 100) * LAYOUT_VIEW_H
      const cx = x + w / 2
      const cy = y + h / 2
      const label = escSvg(plantLayoutBoxDisplayLabel(box))
      const fontSize = Math.max(11, Math.min(16, Math.min(w, h) / 8))
      const pathD = plantLayoutBoxPathD(box)
      const rounded =
        box.shape === 'rectangle' || box.shape === 'square'
          ? 'rx="4" ry="4"'
          : ''
      const shapeEl =
        box.shape === 'rectangle' || box.shape === 'square'
          ? `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}"
          ${rounded} fill="${c.fill}" stroke="${c.stroke}" stroke-width="2.2"/>`
          : `<path transform="translate(${x.toFixed(1)},${y.toFixed(1)}) scale(${(w / 100).toFixed(4)},${(h / 100).toFixed(4)})"
          d="${pathD}" fill="${c.fill}" stroke="${c.stroke}" stroke-width="${(2.2 * 100 / Math.min(w, h)).toFixed(2)}"
          vector-effect="non-scaling-stroke"/>`
      return `
      <g>
        ${shapeEl}
        <text x="${cx.toFixed(1)}" y="${cy.toFixed(1)}" text-anchor="middle" dominant-baseline="middle"
          transform="rotate(${box.labelDegrees} ${cx.toFixed(1)} ${cy.toFixed(1)})"
          font-family="Arial, Helvetica, sans-serif" font-size="${fontSize.toFixed(1)}"
          font-weight="700" fill="${c.text}">${label}</text>
      </g>`
    })
    .join('')

  return `
<svg class="pl-svg" viewBox="0 0 ${LAYOUT_VIEW_W} ${LAYOUT_VIEW_H}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Plant layout">
  <rect x="0" y="0" width="${LAYOUT_VIEW_W}" height="${LAYOUT_VIEW_H}" fill="#fffdf8" stroke="#78716c" stroke-width="3"/>
  <defs>
    <pattern id="plGrid" width="50" height="50" patternUnits="userSpaceOnUse">
      <path d="M 50 0 L 0 0 0 50" fill="none" stroke="#e7e5e4" stroke-width="1"/>
    </pattern>
  </defs>
  <rect x="0" y="0" width="${LAYOUT_VIEW_W}" height="${LAYOUT_VIEW_H}" fill="url(#plGrid)"/>
  ${rects}
</svg>`
}
