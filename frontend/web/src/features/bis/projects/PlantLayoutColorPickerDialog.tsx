import { useEffect, useMemo, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import {
  limsFieldClass,
  limsOutlineBtnClass,
  limsPrimaryBtnClass,
} from '@/lib/limsThemeUi'
import { cn } from '@/lib/utils'
import {
  HUE_NAMES,
  PLANT_LAYOUT_NAMED_COLORS,
  SHADE_ROWS,
  plantLayoutNearestNamedColor,
} from './plantLayoutNamedColors'
import {
  normalizeHexColor,
  plantLayoutColorsFromHex,
} from './plantLayoutModel'

type Draft = {
  hex: string
  name: string
}

function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n))
}

function hexToHsv(hex: string): { h: number; s: number; v: number } {
  const n = normalizeHexColor(hex) || '#fef3c7'
  const r = parseInt(n.slice(1, 3), 16) / 255
  const g = parseInt(n.slice(3, 5), 16) / 255
  const b = parseInt(n.slice(5, 7), 16) / 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const d = max - min
  let h = 0
  if (d !== 0) {
    if (max === r) h = ((g - b) / d) % 6
    else if (max === g) h = (b - r) / d + 2
    else h = (r - g) / d + 4
    h *= 60
    if (h < 0) h += 360
  }
  const s = max === 0 ? 0 : d / max
  return { h, s, v: max }
}

function hsvToHex(h: number, s: number, v: number): string {
  const hh = ((h % 360) + 360) % 360
  const c = v * s
  const x = c * (1 - Math.abs(((hh / 60) % 2) - 1))
  const m = v - c
  let rp = 0
  let gp = 0
  let bp = 0
  if (hh < 60) [rp, gp, bp] = [c, x, 0]
  else if (hh < 120) [rp, gp, bp] = [x, c, 0]
  else if (hh < 180) [rp, gp, bp] = [0, c, x]
  else if (hh < 240) [rp, gp, bp] = [0, x, c]
  else if (hh < 300) [rp, gp, bp] = [x, 0, c]
  else [rp, gp, bp] = [c, 0, x]
  const to = (n: number) =>
    Math.round((n + m) * 255)
      .toString(16)
      .padStart(2, '0')
  return `#${to(rp)}${to(gp)}${to(bp)}`
}

function nameForHex(hex: string, fallbackName?: string): string {
  const nearest = plantLayoutNearestNamedColor(hex)
  if (nearest && nearest.hex === normalizeHexColor(hex)) return nearest.name
  if (nearest) return nearest.name
  return fallbackName?.trim() || normalizeHexColor(hex).toUpperCase()
}

export function PlantLayoutColorPickerDialog({
  open,
  onOpenChange,
  initialHex,
  initialName,
  onConfirm,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  initialHex: string
  initialName: string
  onConfirm: (next: { fillHex: string; colorName: string }) => void
}) {
  const [draft, setDraft] = useState<Draft>({ hex: '#fef3c7', name: 'Amber' })
  const [hover, setHover] = useState<{ hex: string; name: string } | null>(null)
  const [hue, setHue] = useState(40)
  const svRef = useRef<HTMLCanvasElement | null>(null)
  const dragging = useRef(false)

  useEffect(() => {
    if (!open) return
    const hex = normalizeHexColor(initialHex) || '#fef3c7'
    const hsv = hexToHsv(hex)
    setHue(hsv.h)
    setDraft({
      hex,
      name: initialName.trim() || nameForHex(hex),
    })
    setHover(null)
  }, [open, initialHex, initialName])

  const hsv = useMemo(() => hexToHsv(draft.hex), [draft.hex])

  useEffect(() => {
    const canvas = svRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const w = canvas.width
    const h = canvas.height
    const image = ctx.createImageData(w, h)
    for (let y = 0; y < h; y += 1) {
      const v = 1 - y / (h - 1)
      for (let x = 0; x < w; x += 1) {
        const s = x / (w - 1)
        const hex = hsvToHex(hue, s, v)
        const i = (y * w + x) * 4
        image.data[i] = parseInt(hex.slice(1, 3), 16)
        image.data[i + 1] = parseInt(hex.slice(3, 5), 16)
        image.data[i + 2] = parseInt(hex.slice(5, 7), 16)
        image.data[i + 3] = 255
      }
    }
    ctx.putImageData(image, 0, 0)
  }, [hue, open])

  const pickFromSv = (clientX: number, clientY: number, commitName: boolean) => {
    const canvas = svRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const x = clamp01((clientX - rect.left) / Math.max(rect.width, 1))
    const y = clamp01((clientY - rect.top) / Math.max(rect.height, 1))
    const hex = hsvToHex(hue, x, 1 - y)
    const name = nameForHex(hex, draft.name)
    setHover({ hex, name })
    setDraft((prev) => ({
      hex,
      name: commitName ? name : prev.name,
    }))
  }

  const preview = plantLayoutColorsFromHex(draft.hex)
  const shown = hover ?? { hex: draft.hex, name: draft.name }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        layer="stacked"
        className="flex max-h-[min(92vh,720px)] w-[min(96vw,520px)] flex-col gap-0 overflow-hidden rounded-none border-stone-500 p-0"
        overlayClassName="left-0"
        portalClassName="left-0"
      >
        <DialogHeader className="border-b border-stone-300 px-4 py-3">
          <DialogTitle className="text-base font-bold text-stone-800">
            Select Colour
          </DialogTitle>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-3">
          <div className="grid gap-3 sm:grid-cols-[1fr_140px]">
            <div className="space-y-2">
              <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-stone-500">
                Colour chart
              </p>
              <div className="relative overflow-hidden rounded-none border border-stone-400">
                <canvas
                  ref={svRef}
                  width={280}
                  height={160}
                  className="h-[160px] w-full cursor-crosshair touch-none"
                  onPointerDown={(e) => {
                    dragging.current = true
                    e.currentTarget.setPointerCapture(e.pointerId)
                    pickFromSv(e.clientX, e.clientY, true)
                  }}
                  onPointerMove={(e) => {
                    if (dragging.current) {
                      pickFromSv(e.clientX, e.clientY, true)
                      return
                    }
                    const canvas = svRef.current
                    if (!canvas) return
                    const rect = canvas.getBoundingClientRect()
                    const x = clamp01((e.clientX - rect.left) / Math.max(rect.width, 1))
                    const y = clamp01((e.clientY - rect.top) / Math.max(rect.height, 1))
                    const hex = hsvToHex(hue, x, 1 - y)
                    setHover({ hex, name: nameForHex(hex) })
                  }}
                  onPointerUp={() => {
                    dragging.current = false
                  }}
                  onPointerLeave={() => {
                    if (!dragging.current) setHover(null)
                  }}
                />
                <span
                  className="pointer-events-none absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow"
                  style={{
                    left: `${hsv.s * 100}%`,
                    top: `${(1 - hsv.v) * 100}%`,
                    backgroundColor: draft.hex,
                  }}
                />
              </div>
              <label className="block space-y-1">
                <span className="text-[10px] font-medium text-stone-500">Hue</span>
                <input
                  type="range"
                  min={0}
                  max={360}
                  value={Math.round(hue)}
                  className="h-2 w-full cursor-pointer accent-amber-600"
                  style={{
                    background:
                      'linear-gradient(to right, #f00, #ff0, #0f0, #0ff, #00f, #f0f, #f00)',
                  }}
                  onChange={(e) => {
                    const nextHue = Number(e.target.value)
                    setHue(nextHue)
                    const hex = hsvToHex(nextHue, hsv.s, hsv.v)
                    setDraft({ hex, name: nameForHex(hex, draft.name) })
                  }}
                />
              </label>
            </div>

            <div className="space-y-2">
              <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-stone-500">
                Preview
              </p>
              <div
                className="flex h-[100px] items-end rounded-none border border-stone-400 p-2"
                style={{ backgroundColor: preview.fill, color: preview.text }}
              >
                <div className="w-full rounded-none border border-stone-500/40 bg-white/80 px-2 py-1 text-[11px] font-semibold text-stone-800">
                  <div className="truncate">{shown.name}</div>
                  <div className="font-mono text-[10px] uppercase text-stone-500">
                    {shown.hex}
                  </div>
                </div>
              </div>
              <div className="space-y-1">
                <label
                  className="text-[10px] font-medium text-stone-500"
                  htmlFor="pl-color-name"
                >
                  Colour name
                </label>
                <Input
                  id="pl-color-name"
                  className={cn(limsFieldClass, 'text-sm')}
                  value={draft.name}
                  onChange={(e) => setDraft((p) => ({ ...p, name: e.target.value }))}
                  placeholder="Colour name"
                />
              </div>
              <div className="space-y-1">
                <label
                  className="text-[10px] font-medium text-stone-500"
                  htmlFor="pl-color-hex"
                >
                  Hex
                </label>
                <Input
                  id="pl-color-hex"
                  className={cn(limsFieldClass, 'font-mono text-sm uppercase')}
                  value={draft.hex}
                  onChange={(e) => {
                    const hex = normalizeHexColor(e.target.value)
                    if (!hex) {
                      setDraft((p) => ({ ...p, hex: e.target.value }))
                      return
                    }
                    const next = hexToHsv(hex)
                    setHue(next.h)
                    setDraft({ hex, name: nameForHex(hex, draft.name) })
                  }}
                />
              </div>
            </div>
          </div>

          <div className="space-y-1.5">
            <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-stone-500">
              Shade chart
            </p>
            <div className="overflow-x-auto rounded-none border border-stone-300 bg-white p-2">
              <div
                className="inline-grid gap-0.5"
                style={{
                  gridTemplateColumns: `48px repeat(${HUE_NAMES.length}, minmax(18px, 1fr))`,
                }}
              >
                <div />
                {HUE_NAMES.map((hueName) => (
                  <div
                    key={hueName}
                    className="truncate px-0.5 text-center text-[8px] font-semibold text-stone-500"
                    title={hueName}
                  >
                    {hueName.split(' ')[0]}
                  </div>
                ))}
                {SHADE_ROWS.map((row) => (
                  <div key={row.shade} className="contents">
                    <div className="flex items-center text-[9px] font-semibold text-stone-500">
                      {row.shade}
                    </div>
                    {row.hexes.map((hexRaw, i) => {
                      const hex = normalizeHexColor(hexRaw)
                      const name = `${HUE_NAMES[i]!} ${row.shade}`
                      const isActive = normalizeHexColor(draft.hex) === hex
                      return (
                        <button
                          key={`${row.shade}-${hex}`}
                          type="button"
                          title={name}
                          aria-label={name}
                          className={cn(
                            'h-5 w-full border border-stone-300/80',
                            isActive && 'ring-2 ring-amber-500 ring-offset-1',
                          )}
                          style={{ backgroundColor: hex }}
                          onMouseEnter={() => setHover({ hex, name })}
                          onMouseLeave={() => setHover(null)}
                          onFocus={() => setHover({ hex, name })}
                          onBlur={() => setHover(null)}
                          onClick={() => {
                            const next = hexToHsv(hex)
                            setHue(next.h)
                            setDraft({ hex, name })
                          }}
                        />
                      )
                    })}
                  </div>
                ))}
              </div>
            </div>
            <p className="text-[10px] text-stone-500">
              Hover a shade to preview its name · click to select · OK to apply
              ({PLANT_LAYOUT_NAMED_COLORS.length} shades)
            </p>
          </div>
        </div>

        <DialogFooter className="gap-2 border-t border-stone-300 px-4 py-3 sm:justify-end">
          <Button
            type="button"
            variant="outline"
            className={limsOutlineBtnClass}
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            type="button"
            className={limsPrimaryBtnClass}
            onClick={() => {
              const hex = normalizeHexColor(draft.hex)
              if (!hex) return
              onConfirm({
                fillHex: hex,
                colorName: draft.name.trim() || nameForHex(hex),
              })
              onOpenChange(false)
            }}
          >
            OK
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
