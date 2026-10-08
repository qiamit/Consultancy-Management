import { useEffect, useRef, useState } from 'react'
import { Plus, RotateCcw, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
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
  limsFieldClass,
  limsOutlineBtnClass,
  limsPrimaryBtnClass,
} from '@/lib/limsThemeUi'
import { cn } from '@/lib/utils'
import { PlantLayoutColorPickerDialog } from './PlantLayoutColorPickerDialog'
import {
  boxFromFreehandCanvasPoints,
  constrainBoxPlacement,
  emptyPlantLayoutBox,
  emptyPlantLayoutPayload,
  findParentBox,
  normalizeBox,
  PLANT_LAYOUT_SHAPES,
  plantLayoutBoxColors,
  plantLayoutBoxDisplayLabel,
  plantLayoutBoxPathD,
  plantLayoutBoxSizeMm,
  plantLayoutMmToPercent,
  type PlantLayoutBox,
  type PlantLayoutModulePayload,
  type PlantLayoutPoint,
  type PlantLayoutShape,
} from './plantLayoutModel'

const NUDGE_STEP = 1
const NUDGE_STEP_FAST = 5

type DragMode = 'move' | 'resize'

type DragState = {
  id: string
  mode: DragMode
  startX: number
  startY: number
  orig: PlantLayoutBox
}

function clientToPercent(
  clientX: number,
  clientY: number,
  rect: DOMRect,
): { x: number; y: number } {
  return {
    x: ((clientX - rect.left) / Math.max(rect.width, 1)) * 100,
    y: ((clientY - rect.top) / Math.max(rect.height, 1)) * 100,
  }
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  const tag = target.tagName
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true
  return target.isContentEditable
}

export function PlantLayoutModuleFields({
  value,
  onChange,
  disabled = false,
}: {
  value: PlantLayoutModulePayload
  onChange: (next: PlantLayoutModulePayload) => void
  disabled?: boolean
}) {
  const canvasRef = useRef<HTMLDivElement | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [drag, setDrag] = useState<DragState | null>(null)
  const [colorPickerOpen, setColorPickerOpen] = useState(false)
  /** Freehand draw mode — stroke points in canvas percent space. */
  const [freehandDraw, setFreehandDraw] = useState<{
    boxId: string
    points: PlantLayoutPoint[]
    stroking: boolean
  } | null>(null)
  const freehandDrawRef = useRef(freehandDraw)
  freehandDrawRef.current = freehandDraw

  const boxes = value.boxes
  const selected = boxes.find((b) => b.id === selectedId) ?? null
  const selectedIdRef = useRef(selectedId)
  const boxesRef = useRef(boxes)
  selectedIdRef.current = selectedId
  boxesRef.current = boxes

  const setBoxes = (next: PlantLayoutBox[]) => {
    onChange({ boxes: next.map(normalizeBox) })
  }

  const placeBox = (id: string, proposed: PlantLayoutBox, fallback: PlantLayoutBox) => {
    const others = boxesRef.current
    const resolved = constrainBoxPlacement(proposed, others, fallback)
    onChange({
      boxes: others.map((b) => (b.id === id ? resolved : b)),
    })
  }

  const patchLabel = (id: string, label: string) => {
    onChange({
      boxes: boxesRef.current.map((b) =>
        b.id === id ? normalizeBox({ ...b, label }) : b,
      ),
    })
  }

  const startFreehandDraw = (boxId: string) => {
    setDrag(null)
    setEditingId(null)
    setSelectedId(boxId)
    setFreehandDraw({ boxId, points: [], stroking: false })
    toast.message('Draw freehand outline on the canvas, then release')
  }

  const cancelFreehandDraw = () => {
    setFreehandDraw(null)
  }

  const finalizeFreehandDraw = (points: PlantLayoutPoint[], boxId: string) => {
    const box = boxesRef.current.find((b) => b.id === boxId)
    if (!box) {
      setFreehandDraw(null)
      return
    }
    const built = boxFromFreehandCanvasPoints(points, box)
    if (!built) {
      toast.error('Draw a larger freehand shape')
      setFreehandDraw({ boxId, points: [], stroking: false })
      return
    }
    const resolved = constrainBoxPlacement(built, boxesRef.current, box)
    onChange({
      boxes: boxesRef.current.map((b) => (b.id === boxId ? resolved : b)),
    })
    setFreehandDraw(null)
    setSelectedId(boxId)
    toast.success('Freehand shape applied')
  }

  const patchShape = (id: string, shape: PlantLayoutShape) => {
    const box = boxesRef.current.find((b) => b.id === id)
    if (!box) return
    const next = normalizeBox({
      ...box,
      shape,
      freehandPoints: shape === 'freehand' ? box.freehandPoints : [],
    })
    placeBox(id, next, box)
    if (shape === 'freehand' && next.freehandPoints.length < 3) {
      startFreehandDraw(id)
    } else if (shape !== 'freehand') {
      setFreehandDraw(null)
    }
  }

  const patchLabelDegrees = (id: string, degrees: number) => {
    onChange({
      boxes: boxesRef.current.map((b) =>
        b.id === id ? normalizeBox({ ...b, labelDegrees: degrees }) : b,
      ),
    })
  }

  const patchColour = (
    id: string,
    next: { fillHex: string; colorName: string },
  ) => {
    onChange({
      boxes: boxesRef.current.map((b) =>
        b.id === id
          ? normalizeBox({
              ...b,
              fillHex: next.fillHex,
              colorName: next.colorName,
            })
          : b,
      ),
    })
  }

  const patchSizeMm = (
    id: string,
    next: { widthMm?: number; lengthMm?: number },
  ) => {
    const box = boxesRef.current.find((b) => b.id === id)
    if (!box) return
    const current = plantLayoutBoxSizeMm(box)
    const widthMm = next.widthMm ?? current.widthMm
    const lengthMm = next.lengthMm ?? current.lengthMm
    const size = plantLayoutMmToPercent(widthMm, lengthMm)
    placeBox(
      id,
      normalizeBox({
        ...box,
        w: size.w,
        // Square: normalizeBox locks height from width aspect.
        h: box.shape === 'square' ? box.h : size.h,
      }),
      box,
    )
  }

  const nudgeSelected = (dx: number, dy: number) => {
    const id = selectedIdRef.current
    if (!id || disabled) return
    const box = boxesRef.current.find((b) => b.id === id)
    if (!box) return
    placeBox(id, { ...box, x: box.x + dx, y: box.y + dy }, box)
  }

  const addBox = () => {
    if (disabled) return
    const parent = selected
    let box = emptyPlantLayoutBox({
      label: '',
      x: 30 + (boxes.length % 4) * 3,
      y: 30 + (boxes.length % 3) * 3,
      w: parent ? Math.max(12, parent.w * 0.4) : 18,
      h: parent ? Math.max(10, parent.h * 0.35) : 14,
    })
    if (parent) {
      box = normalizeBox({
        ...box,
        x: parent.x + parent.w * 0.3,
        y: parent.y + parent.h * 0.3,
      })
      box = constrainBoxPlacement(box, boxes, box)
      toast.success(`Box added inside “${plantLayoutBoxDisplayLabel(parent)}”`)
    } else {
      box = constrainBoxPlacement(box, boxes, box)
      toast.success('Box added')
    }
    setBoxes([...boxes, box])
    setSelectedId(box.id)
    setEditingId(box.id)
  }

  const deleteSelected = () => {
    if (!selected || disabled) return
    const cleaned = boxes.filter(
      (b) =>
        b.id !== selected.id &&
        !(
          b.x >= selected.x &&
          b.y >= selected.y &&
          b.x + b.w <= selected.x + selected.w &&
          b.y + b.h <= selected.y + selected.h &&
          b.w * b.h < selected.w * selected.h
        ),
    )
    setBoxes(cleaned.length > 0 ? cleaned : [])
    setSelectedId(cleaned[0]?.id ?? null)
    setEditingId(null)
  }

  /** Clear all inner boxes — keep only outer Factory Premises border. */
  const resetDefaults = () => {
    if (disabled) return
    onChange(emptyPlantLayoutPayload())
    setSelectedId(null)
    setEditingId(null)
    toast.message('Canvas cleared — outer border only')
  }

  useEffect(() => {
    if (!drag || disabled) return

    const onMove = (e: PointerEvent) => {
      const el = canvasRef.current
      if (!el) return
      const rect = el.getBoundingClientRect()
      const cur = clientToPercent(e.clientX, e.clientY, rect)
      const dx = cur.x - drag.startX
      const dy = cur.y - drag.startY
      const o = drag.orig

      if (drag.mode === 'move') {
        placeBox(drag.id, { ...o, x: o.x + dx, y: o.y + dy }, o)
        return
      }
      if (o.shape === 'square') {
        placeBox(drag.id, { ...o, w: o.w + dx, h: o.h }, o)
        return
      }
      placeBox(drag.id, { ...o, w: o.w + dx, h: o.h + dy }, o)
    }

    const onUp = () => setDrag(null)

    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drag, disabled])

  useEffect(() => {
    if (disabled) return

    const onKeyDown = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target)) return
      const id = selectedIdRef.current
      if (!id) return

      const step = e.shiftKey ? NUDGE_STEP_FAST : NUDGE_STEP
      if (e.key === 'ArrowLeft') {
        e.preventDefault()
        nudgeSelected(-step, 0)
        return
      }
      if (e.key === 'ArrowRight') {
        e.preventDefault()
        nudgeSelected(step, 0)
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        nudgeSelected(0, -step)
        return
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        nudgeSelected(0, step)
        return
      }
      if (e.key === 'Enter') {
        e.preventDefault()
        setEditingId(id)
        return
      }
      if (e.key === 'Escape' && freehandDrawRef.current) {
        e.preventDefault()
        setFreehandDraw(null)
        toast.message('Freehand drawing cancelled')
        return
      }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault()
        const box = boxesRef.current.find((b) => b.id === id)
        if (!box) return
        const cleaned = boxesRef.current.filter(
          (b) =>
            b.id !== id &&
            !(
              b.x >= box.x &&
              b.y >= box.y &&
              b.x + b.w <= box.x + box.w &&
              b.y + b.h <= box.y + box.h &&
              b.w * b.h < box.w * box.h
            ),
        )
        setBoxes(cleaned)
        setSelectedId(cleaned[0]?.id ?? null)
        setEditingId(null)
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [disabled])

  useEffect(() => {
    if (!freehandDraw?.stroking || disabled) return

    const onMove = (e: PointerEvent) => {
      const el = canvasRef.current
      const draw = freehandDrawRef.current
      if (!el || !draw?.stroking) return
      const rect = el.getBoundingClientRect()
      const p = clientToPercent(e.clientX, e.clientY, rect)
      setFreehandDraw((prev) => {
        if (!prev?.stroking) return prev
        const last = prev.points[prev.points.length - 1]
        if (last && Math.hypot(last.x - p.x, last.y - p.y) < 0.35) return prev
        return { ...prev, points: [...prev.points, p] }
      })
    }

    const onUp = () => {
      const draw = freehandDrawRef.current
      if (!draw?.stroking) return
      finalizeFreehandDraw(draw.points, draw.boxId)
    }

    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [freehandDraw?.stroking, disabled])

  const startDrag = (
    e: React.PointerEvent,
    box: PlantLayoutBox,
    mode: DragMode,
  ) => {
    if (disabled || freehandDraw) return
    e.preventDefault()
    e.stopPropagation()
    const el = canvasRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const start = clientToPercent(e.clientX, e.clientY, rect)
    setSelectedId(box.id)
    setEditingId(null)
    setDrag({
      id: box.id,
      mode,
      startX: start.x,
      startY: start.y,
      orig: { ...box },
    })
  }

  const selectedParent = selected ? findParentBox(selected, boxes) : null

  const selectedColors = selected ? plantLayoutBoxColors(selected) : null

  return (
    <>
    <div className="flex min-h-0 flex-1 flex-col gap-2 lg:flex-row">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-2">
        <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-stone-600">
          Plant Layout Canvas
        </p>

        <div
          ref={canvasRef}
          tabIndex={0}
          className={cn(
            'relative min-h-[min(58vh,520px)] flex-1 overflow-hidden rounded-none border-2 border-stone-600 bg-[#fffdf8]',
            'shadow-[inset_0_0_0_1px_rgba(180,83,9,0.15)] outline-none',
            disabled ? 'opacity-70' : freehandDraw ? 'cursor-crosshair' : 'cursor-crosshair',
            freehandDraw && 'ring-2 ring-amber-500 ring-inset',
          )}
          style={{
            backgroundImage:
              'linear-gradient(to right, rgba(168,162,158,0.22) 1px, transparent 1px), linear-gradient(to bottom, rgba(168,162,158,0.22) 1px, transparent 1px)',
            backgroundSize: '28px 28px',
          }}
          onPointerDown={(e) => {
            if (disabled) return
            if (freehandDraw) {
              e.preventDefault()
              const el = canvasRef.current
              if (!el) return
              const rect = el.getBoundingClientRect()
              const p = clientToPercent(e.clientX, e.clientY, rect)
              setFreehandDraw({
                boxId: freehandDraw.boxId,
                points: [p],
                stroking: true,
              })
              return
            }
            setSelectedId(null)
            setEditingId(null)
          }}
        >
          <div className="pointer-events-none absolute left-2 top-2 z-10 border border-amber-600/40 bg-stone-900/85 px-2 py-1 text-[10px] font-bold uppercase tracking-[0.16em] text-amber-100">
            Factory Premises
          </div>

          {freehandDraw ? (
            <div className="pointer-events-none absolute left-1/2 top-2 z-30 -translate-x-1/2 border border-amber-700 bg-amber-50 px-2 py-1 text-[11px] font-semibold text-amber-950">
              Freehand draw mode — drag to outline · Esc to cancel
            </div>
          ) : null}

          {boxes.map((box) => {
            const colors = plantLayoutBoxColors(box)
            const isSelected = box.id === selectedId
            const isEditing = box.id === editingId
            const parent = findParentBox(box, boxes)
            const isRect =
              box.shape === 'rectangle' || box.shape === 'square'
            const dimForDraw =
              !!freehandDraw && freehandDraw.boxId === box.id
            return (
              <div
                key={box.id}
                className={cn(
                  'absolute flex items-center justify-center px-1 text-center',
                  isSelected ? 'z-20' : parent ? 'z-[15]' : 'z-10',
                  freehandDraw
                    ? 'pointer-events-none opacity-40'
                    : disabled
                      ? 'cursor-default'
                      : 'cursor-grab active:cursor-grabbing',
                  dimForDraw && 'opacity-25',
                )}
                style={{
                  left: `${box.x}%`,
                  top: `${box.y}%`,
                  width: `${box.w}%`,
                  height: `${box.h}%`,
                  color: colors.text,
                }}
                onPointerDown={(e) => {
                  if (freehandDraw || isEditing) {
                    e.stopPropagation()
                    return
                  }
                  startDrag(e, box, 'move')
                }}
                onDoubleClick={(e) => {
                  if (freehandDraw) return
                  e.stopPropagation()
                  setSelectedId(box.id)
                  setEditingId(box.id)
                }}
                title={plantLayoutBoxDisplayLabel(box)}
              >
                <svg
                  className="pointer-events-none absolute inset-0 h-full w-full"
                  viewBox="0 0 100 100"
                  preserveAspectRatio="none"
                  aria-hidden
                >
                  {isRect ? (
                    <rect
                      x="2"
                      y="2"
                      width="96"
                      height="96"
                      rx="3"
                      ry="3"
                      fill={colors.fill}
                      stroke={colors.stroke}
                      strokeWidth={isSelected ? 3.2 : 2.2}
                      vectorEffect="non-scaling-stroke"
                    />
                  ) : (
                    <path
                      d={plantLayoutBoxPathD(box)}
                      fill={colors.fill}
                      stroke={colors.stroke}
                      strokeWidth={isSelected ? 3.2 : 2.2}
                      vectorEffect="non-scaling-stroke"
                    />
                  )}
                </svg>

                {isSelected ? (
                  <span className="pointer-events-none absolute inset-0 ring-2 ring-amber-500 ring-offset-1" />
                ) : null}

                <div className="relative z-10 flex max-h-full w-full items-center justify-center px-1">
                  {isEditing ? (
                    <input
                      autoFocus
                      className="h-7 w-[92%] rounded-none border border-amber-700/50 bg-white/95 px-1 text-center text-xs font-bold text-stone-900 outline-none focus:ring-1 focus:ring-amber-500"
                      value={box.label}
                      disabled={disabled}
                      placeholder="Box name"
                      onChange={(e) => patchLabel(box.id, e.target.value)}
                      onPointerDown={(e) => e.stopPropagation()}
                      onBlur={() => setEditingId(null)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault()
                          setEditingId(null)
                          canvasRef.current?.focus()
                        }
                        e.stopPropagation()
                      }}
                    />
                  ) : (
                    <span
                      className={cn(
                        'line-clamp-3 px-1 text-[11px] font-bold leading-tight sm:text-xs',
                        !box.label.trim() && 'opacity-45',
                      )}
                      style={{
                        transform:
                          box.labelDegrees !== 0
                            ? `rotate(${box.labelDegrees}deg)`
                            : undefined,
                        transformOrigin: 'center center',
                      }}
                    >
                      {box.label.trim() ? box.label : 'Box name'}
                    </span>
                  )}
                </div>

                {isSelected && !disabled && !freehandDraw ? (
                  <button
                    type="button"
                    className="absolute bottom-0 right-0 z-20 h-3.5 w-3.5 cursor-se-resize border border-amber-800 bg-amber-500"
                    aria-label="Resize box"
                    onPointerDown={(e) => startDrag(e, box, 'resize')}
                  />
                ) : null}
              </div>
            )
          })}

          {freehandDraw && freehandDraw.points.length > 0 ? (
            <svg
              className="pointer-events-none absolute inset-0 z-40 h-full w-full"
              viewBox="0 0 100 100"
              preserveAspectRatio="none"
              aria-hidden
            >
              <polyline
                points={freehandDraw.points
                  .map((p) => `${p.x},${p.y}`)
                  .join(' ')}
                fill="none"
                stroke="#b45309"
                strokeWidth="1.2"
                vectorEffect="non-scaling-stroke"
              />
              {freehandDraw.points.length >= 3 ? (
                <polygon
                  points={freehandDraw.points
                    .map((p) => `${p.x},${p.y}`)
                    .join(' ')}
                  fill="rgba(254, 243, 199, 0.35)"
                  stroke="#b45309"
                  strokeWidth="1.2"
                  vectorEffect="non-scaling-stroke"
                />
              ) : null}
            </svg>
          ) : null}

          {boxes.length === 0 && !freehandDraw ? (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm text-stone-500">
              Outer border only — use Add Box in the right panel.
            </div>
          ) : null}
        </div>

      </div>

      <aside className="w-full shrink-0 space-y-3 rounded-none border border-stone-400 bg-[#fffcf7] p-3 lg:w-[260px]">
        <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-stone-600">
          Tools
        </p>

        <div className="flex items-center gap-1.5">
          <Button
            type="button"
            size="sm"
            className={cn(limsPrimaryBtnClass, 'h-8 w-8 shrink-0 p-0')}
            disabled={disabled}
            onClick={addBox}
            title={
              selected
                ? `Add box inside “${plantLayoutBoxDisplayLabel(selected)}”`
                : 'Add box on canvas'
            }
            aria-label="Add Box"
          >
            <Plus size={16} aria-hidden />
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className={cn(limsOutlineBtnClass, 'h-8 w-8 shrink-0 p-0 text-red-700')}
            disabled={disabled || !selected}
            onClick={deleteSelected}
            title="Delete selected box"
            aria-label="Delete"
          >
            <Trash2 size={16} aria-hidden />
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className={cn(limsOutlineBtnClass, 'h-8 w-8 shrink-0 p-0')}
            disabled={disabled}
            onClick={resetDefaults}
            title="Defaults — clear all boxes, outer border only"
            aria-label="Defaults"
          >
            <RotateCcw size={16} aria-hidden />
          </Button>
        </div>

        <div className="border-t border-stone-300 pt-3">
          <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.14em] text-stone-600">
            Box Setting
          </p>

          {selected ? (
            <div className="space-y-2">
              <div className="space-y-1">
                <label
                  className="text-[11px] font-semibold text-stone-700"
                  htmlFor="pl-box-name-setting"
                >
                  Box Name
                </label>
                <Input
                  id="pl-box-name-setting"
                  className={cn(limsFieldClass, 'text-sm')}
                  value={selected.label}
                  disabled={disabled}
                  placeholder="Box name"
                  onChange={(e) => patchLabel(selected.id, e.target.value)}
                />
              </div>

              <div className="space-y-1">
                <label
                  className="text-[11px] font-semibold text-stone-700"
                  htmlFor="pl-box-shape-setting"
                >
                  Box Shape
                </label>
                <Select
                  value={selected.shape}
                  onValueChange={(v) => patchShape(selected.id, v as PlantLayoutShape)}
                  disabled={disabled}
                >
                  <SelectTrigger
                    id="pl-box-shape-setting"
                    className={cn(limsFieldClass, 'text-sm')}
                    aria-label="Box Shape"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="rounded-none border-stone-500">
                    {PLANT_LAYOUT_SHAPES.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {selected.shape === 'freehand' ? (
                  <div className="flex gap-1">
                    {freehandDraw?.boxId === selected.id ? (
                      <Button
                        type="button"
                        variant="outline"
                        className={cn(limsOutlineBtnClass, 'h-8 flex-1 text-xs')}
                        onClick={cancelFreehandDraw}
                      >
                        Cancel Draw
                      </Button>
                    ) : (
                      <Button
                        type="button"
                        variant="outline"
                        disabled={disabled}
                        className={cn(limsOutlineBtnClass, 'h-8 flex-1 text-xs')}
                        onClick={() => startFreehandDraw(selected.id)}
                      >
                        {selected.freehandPoints.length >= 3
                          ? 'Redraw Freehand'
                          : 'Draw Freehand'}
                      </Button>
                    )}
                  </div>
                ) : null}
              </div>

              <div className="space-y-1">
                <p className="text-[11px] font-semibold text-stone-700">Box Colour</p>
                <button
                  type="button"
                  disabled={disabled}
                  className={cn(
                    limsFieldClass,
                    'flex h-8 w-full items-center gap-2 px-2 text-left',
                    'disabled:cursor-not-allowed disabled:opacity-50',
                  )}
                  aria-label="Box Colour"
                  onClick={() => setColorPickerOpen(true)}
                >
                  <span
                    className="h-5 w-5 shrink-0 border border-stone-400"
                    style={{
                      backgroundColor: selectedColors?.fill,
                      boxShadow: selectedColors
                        ? `inset 0 0 0 2px ${selectedColors.stroke}`
                        : undefined,
                    }}
                    aria-hidden
                  />
                  <span className="min-w-0 flex-1 truncate text-sm font-medium text-stone-700">
                    {selectedColors?.name}
                  </span>
                  <span className="text-[10px] text-stone-400">▾</span>
                </button>
              </div>

              {selectedParent ? (
                <div className="rounded-none border border-stone-300 bg-white px-2 py-1.5 text-[11px] text-stone-600">
                  Inside: {plantLayoutBoxDisplayLabel(selectedParent)}
                </div>
              ) : null}

              <div className="space-y-1">
                <p className="text-[11px] font-semibold text-stone-700">Box Size</p>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <label
                      className="text-[10px] font-medium text-stone-500"
                      htmlFor="pl-box-width-mm"
                    >
                      Width (mm)
                    </label>
                    <Input
                      id="pl-box-width-mm"
                      type="number"
                      min={1}
                      step={0.5}
                      inputMode="decimal"
                      className={cn(limsFieldClass, 'text-sm tabular-nums')}
                      value={plantLayoutBoxSizeMm(selected).widthMm}
                      disabled={disabled}
                      onChange={(e) => {
                        const n = Number(e.target.value)
                        if (!Number.isFinite(n) || n <= 0) return
                        patchSizeMm(selected.id, { widthMm: n })
                      }}
                    />
                  </div>
                  <div className="space-y-1">
                    <label
                      className="text-[10px] font-medium text-stone-500"
                      htmlFor="pl-box-length-mm"
                    >
                      Length (mm)
                    </label>
                    <Input
                      id="pl-box-length-mm"
                      type="number"
                      min={1}
                      step={0.5}
                      inputMode="decimal"
                      className={cn(limsFieldClass, 'text-sm tabular-nums')}
                      value={plantLayoutBoxSizeMm(selected).lengthMm}
                      disabled={disabled || selected.shape === 'square'}
                      title={
                        selected.shape === 'square'
                          ? 'Length follows Width for Square'
                          : undefined
                      }
                      onChange={(e) => {
                        const n = Number(e.target.value)
                        if (!Number.isFinite(n) || n <= 0) return
                        patchSizeMm(selected.id, { lengthMm: n })
                      }}
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-1">
                <label
                  className="text-[11px] font-semibold text-stone-700"
                  htmlFor="pl-box-text-degrees"
                >
                  Text Degree
                </label>
                <Input
                  id="pl-box-text-degrees"
                  type="number"
                  min={0}
                  max={359}
                  step={1}
                  inputMode="numeric"
                  className={cn(limsFieldClass, 'text-sm tabular-nums')}
                  value={selected.labelDegrees}
                  disabled={disabled}
                  onChange={(e) => {
                    const n = Number(e.target.value)
                    if (!Number.isFinite(n)) return
                    patchLabelDegrees(selected.id, n)
                  }}
                />
                <div className="grid grid-cols-4 gap-1">
                  {[0, 90, 180, 270].map((deg) => (
                    <Button
                      key={deg}
                      type="button"
                      variant="outline"
                      disabled={disabled}
                      className={cn(
                        limsOutlineBtnClass,
                        'h-7 px-0 text-[10px] tabular-nums',
                        selected.labelDegrees === deg &&
                          'border-amber-600 bg-amber-50 text-amber-900',
                      )}
                      onClick={() => patchLabelDegrees(selected.id, deg)}
                    >
                      {deg}°
                    </Button>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <p className="text-xs leading-relaxed text-stone-500">
              Select a box on the canvas to see its settings here.
            </p>
          )}
        </div>

      </aside>
    </div>

    {selected ? (
      <PlantLayoutColorPickerDialog
        open={colorPickerOpen}
        onOpenChange={setColorPickerOpen}
        initialHex={selected.fillHex}
        initialName={selected.colorName}
        onConfirm={(next) => patchColour(selected.id, next)}
      />
    ) : null}
    </>
  )
}
