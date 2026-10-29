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

  // Grow the box (height first) until its label fits, so the name is never cut on the canvas or in print.
  const grown = growBoxToFitLabel(
    plantLayoutBoxDisplayLabel({ label: String(box.label ?? '') }),
    w,
    h,
    shape,
    normalizeLabelDegrees(box.labelDegrees),
  )
  w = grown.w
  h = grown.h

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

/* ── Box label layout (shared by the editor canvas and print, so both wrap the same lines) ── */

/** Layout space of the drawing: the editor canvas and the print SVG both use 1000 × 700 units. */
export const PLANT_LAYOUT_VIEW_W = LAYOUT_VIEW_W
export const PLANT_LAYOUT_VIEW_H = LAYOUT_VIEW_H

export const PLANT_LAYOUT_LABEL_FONT = 'Arial, Helvetica, sans-serif'
const LABEL_WEIGHT = 700
const LABEL_LINE = 1.22
const LABEL_PAD_X = 9
const LABEL_PAD_Y = 7
const LABEL_MIN_SIZE = 12
const LABEL_MAX_SIZE = 17
/** Border width in layout units (≈ 0.35 mm in print). */
export const PLANT_LAYOUT_BOX_STROKE = 1.8

/** Part of the box the label may use (non-rectangular shapes are narrower) and where the label sits vertically. */
const LABEL_AREA: Record<PlantLayoutShape, { w: number; h: number; cy: number }> = {
  rectangle: { w: 1, h: 1, cy: 0.5 },
  square: { w: 1, h: 1, cy: 0.5 },
  triangle: { w: 0.48, h: 0.38, cy: 0.68 },
  cone: { w: 0.6, h: 0.5, cy: 0.56 },
  freehand: { w: 0.72, h: 0.66, cy: 0.5 },
}

const widthCache = new Map<string, number>()
let measureCtx: CanvasRenderingContext2D | null | undefined

/** Width of `text` in bold Arial at 100 units (real browser metrics; an estimate when no canvas is available). */
function textWidthAt100(text: string): number {
  const cached = widthCache.get(text)
  if (cached !== undefined) return cached
  if (measureCtx === undefined) {
    measureCtx = null
    try {
      if (typeof document !== 'undefined') {
        const ctx = document.createElement('canvas').getContext('2d')
        if (ctx) {
          ctx.font = `${LABEL_WEIGHT} 100px ${PLANT_LAYOUT_LABEL_FONT}`
          measureCtx = ctx
        }
      }
    } catch {
      measureCtx = null
    }
  }
  // A small margin keeps the text clear of the border when the print font renders a touch wider.
  const width = (measureCtx ? measureCtx.measureText(text).width : text.length * 62) * 1.04
  if (widthCache.size > 4000) widthCache.clear()
  widthCache.set(text, width)
  return width
}

function textWidth(text: string, size: number): number {
  return (textWidthAt100(text) * size) / 100
}

function wrapWords(words: string[], maxWidth: number, size: number): string[] {
  const lines: string[] = []
  let line = ''
  for (const word of words) {
    const next = line ? `${line} ${word}` : word
    if (!line || textWidth(next, size) <= maxWidth) line = next
    else {
      lines.push(line)
      line = word
    }
  }
  if (line) lines.push(line)
  return lines
}

type LabelFit = {
  lines: string[]
  size: number
  /** Box size (layout units) the label needs; larger than the box when it does not fit. */
  needW: number
  needH: number
}

function isTurnedLabel(degrees: number): boolean {
  return Math.abs(Math.round(degrees)) % 180 === 90
}

/**
 * Wraps the label to the box: starts at a size that suits the box, steps down to the minimum readable size, and
 * reports how big the box must be when even that does not fit. Turned labels (90° / 270°) run along the height.
 */
function fitLabel(text: string, boxW: number, boxH: number, shape: PlantLayoutShape, degrees: number): LabelFit {
  const area = LABEL_AREA[shape] ?? LABEL_AREA.rectangle
  const turned = isTurnedLabel(degrees)
  const runSpan = turned ? boxH * area.h : boxW * area.w
  const crossSpan = turned ? boxW * area.w : boxH * area.h
  const runPad = turned ? LABEL_PAD_Y : LABEL_PAD_X
  const crossPad = turned ? LABEL_PAD_X : LABEL_PAD_Y
  const availRun = Math.max(1, runSpan - 2 * runPad)
  const availCross = Math.max(1, crossSpan - 2 * crossPad)
  const words = text.split(/\s+/).filter(Boolean)
  let size = clamp(Math.min(boxW, boxH) / 6.5, LABEL_MIN_SIZE, LABEL_MAX_SIZE)
  for (;;) {
    const lines = wrapWords(words, availRun, size)
    const widest = Math.max(0, ...lines.map((l) => textWidth(l, size)))
    const block = lines.length * size * LABEL_LINE
    const fits = widest <= availRun && block <= availCross
    if (fits || size <= LABEL_MIN_SIZE) {
      const needRun = Math.max(runSpan, widest + 2 * runPad) / (turned ? area.h : area.w)
      const needCross = Math.max(crossSpan, block + 2 * crossPad) / (turned ? area.w : area.h)
      return {
        lines,
        size,
        needW: fits ? boxW : turned ? needCross : needRun,
        needH: fits ? boxH : turned ? needRun : needCross,
      }
    }
    size = Math.max(LABEL_MIN_SIZE, size - 0.5)
  }
}

function ceilPct(n: number): number {
  return Math.ceil(n * 10 + 0.5) / 10
}

/**
 * Smallest growth (canvas percent) that lets the label fit: first wide enough for the longest word, then taller
 * (more lines), and wider only when the height is used up. Square boxes keep their square proportion.
 */
function growBoxToFitLabel(
  text: string,
  w: number,
  h: number,
  shape: PlantLayoutShape,
  degrees: number,
): { w: number; h: number } {
  const turned = isTurnedLabel(degrees)
  for (let i = 0; i < 24; i += 1) {
    const fit = fitLabel(text, (w / 100) * LAYOUT_VIEW_W, (h / 100) * LAYOUT_VIEW_H, shape, degrees)
    const needW = (fit.needW / LAYOUT_VIEW_W) * 100
    const needH = (fit.needH / LAYOUT_VIEW_H) * 100
    if (needW <= w + 0.01 && needH <= h + 0.01) break
    // Along the text direction only a single long word forces growth; across it, the line count does.
    const runNeed = turned ? needH : needW
    const runSize = turned ? h : w
    const crossNeed = turned ? needW : needH
    const crossSize = turned ? w : h
    let run = runSize
    let cross = crossSize
    if (runNeed > runSize + 0.01) run = Math.min(100, ceilPct(runNeed))
    else if (crossNeed > crossSize + 0.01) {
      // Height first; once it reaches the frame, widen the text run instead so the lines get fewer.
      if (crossSize >= 100) run = Math.min(100, run + 2)
      else cross = Math.min(100, ceilPct(crossNeed))
    }
    if (turned) {
      h = run
      w = cross
    } else {
      w = run
      h = cross
    }
    if (shape === 'square') {
      w = Math.min(100, Math.max(w, round1(h * (LAYOUT_VIEW_H / LAYOUT_VIEW_W))))
      h = Math.min(100, round1(w * (LAYOUT_VIEW_W / LAYOUT_VIEW_H)))
    }
    if (w >= 100 && h >= 100) break
  }
  return { w: round1(w), h: round1(h) }
}

/** Scales an absolute/relative SVG path (M L H V C Q Z) drawn in a 0–100 box into layout units. */
function scalePathD(d: string, sx: number, sy: number): string {
  const tokens = d.match(/[MLHVCQZmlhvcqz]|-?\d*\.?\d+(?:e[-+]?\d+)?/g) ?? []
  let cmd = ''
  let axis = 0
  const out: string[] = []
  for (const t of tokens) {
    if (/^[A-Za-z]$/.test(t)) {
      cmd = t.toUpperCase()
      axis = 0
      out.push(t)
      continue
    }
    const n = Number(t)
    let v: number
    if (cmd === 'H') v = n * sx
    else if (cmd === 'V') v = n * sy
    else {
      v = axis === 0 ? n * sx : n * sy
      axis = 1 - axis
    }
    out.push(v.toFixed(1))
  }
  return out.join(' ')
}

/** Everything needed to draw one box in its own layout-unit space (0…width × 0…height). */
export type PlantLayoutBoxGraphic = {
  width: number
  height: number
  colors: { fill: string; stroke: string; text: string }
  shape:
    | { kind: 'rect'; x: number; y: number; w: number; h: number; rx: number }
    | { kind: 'path'; d: string }
  label: {
    cx: number
    cy: number
    rotate: number
    size: number
    lines: Array<{ text: string; y: number }>
  }
}

/** Ids of boxes that have other boxes drawn inside them (their label goes to the top so children do not hide it). */
export function plantLayoutContainerIds(boxes: PlantLayoutBox[]): Set<string> {
  const ids = new Set<string>()
  for (const box of boxes) {
    const parent = findParentBox(box, boxes)
    if (parent) ids.add(parent.id)
  }
  return ids
}

/**
 * Box drawing in layout units, used by the editor canvas (one SVG per box) and by print (translated into the page
 * SVG), so the label wraps, centres and sits the same way in both. `labelText` overrides the shown text (placeholder);
 * `labelAtTop` puts the label at the top centre (a box with other boxes inside it).
 */
export function plantLayoutBoxGraphic(
  box: PlantLayoutBox,
  labelText?: string,
  labelAtTop = false,
): PlantLayoutBoxGraphic {
  const width = (box.w / 100) * LAYOUT_VIEW_W
  const height = (box.h / 100) * LAYOUT_VIEW_H
  const colors = plantLayoutBoxColors(box)
  const s = PLANT_LAYOUT_BOX_STROKE
  const shape: PlantLayoutBoxGraphic['shape'] =
    box.shape === 'rectangle' || box.shape === 'square'
      ? { kind: 'rect', x: s / 2, y: s / 2, w: width - s, h: height - s, rx: Math.min(6, width / 10, height / 10) }
      : { kind: 'path', d: scalePathD(plantLayoutBoxPathD(box), width / 100, height / 100) }
  const area = LABEL_AREA[box.shape] ?? LABEL_AREA.rectangle
  const turned = isTurnedLabel(box.labelDegrees)
  const fit = fitLabel(labelText ?? plantLayoutBoxDisplayLabel(box), width, height, box.shape, box.labelDegrees)
  const lineH = fit.size * LABEL_LINE
  const cx = width / 2
  const blockH = fit.lines.length * lineH
  const atTop = labelAtTop && !turned && (box.shape === 'rectangle' || box.shape === 'square')
  const cy = atTop ? LABEL_PAD_Y + blockH / 2 : turned ? height / 2 : height * area.cy
  const top = cy - blockH / 2
  return {
    width,
    height,
    colors: { fill: colors.fill, stroke: colors.stroke, text: colors.text },
    shape,
    label: {
      cx,
      cy,
      rotate: box.labelDegrees,
      size: fit.size,
      // Explicit baselines (≈ 0.35 em below each line's middle) instead of dominant-baseline, which print engines vary on.
      lines: fit.lines.map((text, i) => ({ text, y: top + (i + 0.5) * lineH + fit.size * 0.35 })),
    },
  }
}

export const PLANT_LAYOUT_LABEL_WEIGHT = LABEL_WEIGHT

function escSvg(raw: string): string {
  return raw
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** SVG markup for print (viewBox 0 0 1000 700). */
export function buildPlantLayoutSvgMarkup(boxes: PlantLayoutBox[]): string {
  const containers = plantLayoutContainerIds(boxes)
  const rects = boxes
    .map((box) => {
      const g = plantLayoutBoxGraphic(box, undefined, containers.has(box.id))
      const x = (box.x / 100) * LAYOUT_VIEW_W
      const y = (box.y / 100) * LAYOUT_VIEW_H
      const paint = `fill="${g.colors.fill}" stroke="${g.colors.stroke}" stroke-width="${PLANT_LAYOUT_BOX_STROKE}" stroke-linejoin="round"`
      const shapeEl =
        g.shape.kind === 'rect'
          ? `<rect x="${g.shape.x.toFixed(1)}" y="${g.shape.y.toFixed(1)}" width="${g.shape.w.toFixed(1)}" height="${g.shape.h.toFixed(1)}" rx="${g.shape.rx.toFixed(1)}" ry="${g.shape.rx.toFixed(1)}" ${paint}/>`
          : `<path d="${g.shape.d}" ${paint}/>`
      const { cx, cy, rotate, size, lines } = g.label
      const tspans = lines
        .map((l) => `<tspan x="${cx.toFixed(1)}" y="${l.y.toFixed(1)}">${escSvg(l.text)}</tspan>`)
        .join('')
      return `
      <g transform="translate(${x.toFixed(1)} ${y.toFixed(1)})">
        ${shapeEl}
        <text text-anchor="middle"${rotate ? ` transform="rotate(${rotate} ${cx.toFixed(1)} ${cy.toFixed(1)})"` : ''}
          font-family="${PLANT_LAYOUT_LABEL_FONT}" font-size="${size.toFixed(1)}"
          font-weight="${LABEL_WEIGHT}" fill="${g.colors.text}">${tspans}</text>
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
