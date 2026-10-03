import { useCallback, useState, type CSSProperties } from 'react'
import type {
  PageNumberPosition,
  TestReportPrintSettings,
} from '@/features/settings/lab-settings/printSettingsTypes'
import {
  pageNumberPreviewSample,
  resolvePrintPageSizeMm,
} from '@/features/settings/lab-settings/printSettingsTypes'

function pageNumberPreviewPlacement(
  position: PageNumberPosition,
  marginLeftPx: number,
  marginRightPx: number,
): CSSProperties {
  const inset = 4
  switch (position) {
    case 'top-left':
      return { top: inset, left: marginLeftPx + inset }
    case 'top-center':
      return { top: inset, left: '50%', transform: 'translateX(-50%)' }
    case 'top-right':
      return { top: inset, right: marginRightPx + inset }
    case 'bottom-left':
      return { bottom: inset, left: marginLeftPx + inset }
    case 'bottom-center':
      return { bottom: inset, left: '50%', transform: 'translateX(-50%)' }
    case 'bottom-right':
      return { bottom: inset, right: marginRightPx + inset }
    default:
      return { bottom: inset, left: '50%', transform: 'translateX(-50%)' }
  }
}

const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n))

type DragEdge = 'top' | 'bottom' | 'left' | 'right'

export function TestReportPageMarginPreview({
  settings,
  onPatch,
  disabled,
}: {
  settings: TestReportPrintSettings
  onPatch: (partial: Partial<TestReportPrintSettings>) => void
  disabled?: boolean
}) {
  const page = resolvePrintPageSizeMm(settings)
  const previewWidth = 220
  const previewHeight = Math.round((page.height / page.width) * previewWidth)
  const pxPerMm = previewWidth / page.width

  const topMm = settings.bodyPaddingTopMm
  const bottomMm = settings.bodyPaddingBottomMm
  const leftMm = settings.bodyPaddingLeftMm
  const rightMm = settings.bodyPaddingRightMm
  const headerMm = Math.min(settings.headerMaxHeightMm, Math.max(0, topMm - 1))
  const footerMm = Math.min(settings.footerMaxHeightMm, Math.max(0, bottomMm - 1))

  const marginTopPx = topMm * pxPerMm
  const marginBottomPx = bottomMm * pxPerMm
  const marginLeftPx = leftMm * pxPerMm
  const marginRightPx = rightMm * pxPerMm
  const headerPx = headerMm * pxPerMm
  const footerPx = footerMm * pxPerMm

  const [dragging, setDragging] = useState<DragEdge | null>(null)

  const applyEdgeValue = useCallback(
    (edge: DragEdge, mm: number) => {
      if (edge === 'top') {
        const minTop = Math.max(18, settings.headerMaxHeightMm)
        onPatch({ bodyPaddingTopMm: clamp(Math.round(mm), minTop, 80) })
        return
      }
      if (edge === 'bottom') {
        const minBottom = Math.max(16, settings.footerMaxHeightMm)
        onPatch({ bodyPaddingBottomMm: clamp(Math.round(mm), minBottom, 80) })
        return
      }
      if (edge === 'left') {
        onPatch({ bodyPaddingLeftMm: clamp(Math.round(mm), 8, 25) })
        return
      }
      onPatch({ bodyPaddingRightMm: clamp(Math.round(mm), 8, 25) })
    },
    [onPatch, settings.headerMaxHeightMm, settings.footerMaxHeightMm],
  )

  const onPointerDown = (edge: DragEdge) => (e: React.PointerEvent<HTMLDivElement>) => {
    if (disabled) return
    e.preventDefault()
    const startValue =
      edge === 'top'
        ? settings.bodyPaddingTopMm
        : edge === 'bottom'
          ? settings.bodyPaddingBottomMm
          : edge === 'left'
            ? settings.bodyPaddingLeftMm
            : settings.bodyPaddingRightMm
    const startClient = edge === 'top' || edge === 'bottom' ? e.clientY : e.clientX
    setDragging(edge)

    const onMove = (ev: PointerEvent) => {
      const deltaPx =
        edge === 'top'
          ? ev.clientY - startClient
          : edge === 'bottom'
            ? startClient - ev.clientY
            : edge === 'left'
              ? ev.clientX - startClient
              : startClient - ev.clientX
      applyEdgeValue(edge, startValue + deltaPx / pxPerMm)
    }

    const onUp = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      setDragging(null)
    }

    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  const contentTop = marginTopPx
  const contentBottom = previewHeight - marginBottomPx
  const contentLeft = marginLeftPx
  const contentRight = previewWidth - marginRightPx
  const contentHeight = contentBottom - contentTop
  const contentWidth = contentRight - contentLeft

  const pageBorderBox = (() => {
    if (settings.pageBorderType === 'none') return null
    const gapPx = (settings.pageBorderGapMm || 0) * pxPerMm
    // Match print: border follows page margins (body padding), not header/footer max.
    let top = contentTop
    let bottom = contentBottom
    let left = contentLeft
    let right = contentRight
    const alignment = settings.pageBorderAlignment
    const verticalMode =
      alignment === 'sides_only' || alignment === 'top_bottom_only' ? 'full_page' : alignment
    switch (verticalMode) {
      case 'cover_header':
        top = 0
        bottom = contentBottom
        break
      case 'cover_footer':
        top = contentTop
        bottom = previewHeight
        break
      case 'exclude_header_footer':
        top = contentTop
        bottom = contentBottom
        break
      case 'full_page':
        top = 0
        bottom = previewHeight
        left = 0
        right = previewWidth
        break
      default:
        break
    }
    const height = Math.max(0, bottom - top - gapPx * 2)
    const width = Math.max(0, right - left - gapPx * 2)
    return {
      top: top + gapPx,
      left: left + gapPx,
      width,
      height,
      sidesOnly: alignment === 'sides_only',
      topBottomOnly: alignment === 'top_bottom_only',
    }
  })()

  const pageBorderCss = (() => {
    const style =
      settings.pageBorderType === 'solid'
        ? '1px solid #78716c'
        : settings.pageBorderType === 'dashed'
          ? '1px dashed #78716c'
          : settings.pageBorderType === 'dotted'
            ? '1px dotted #78716c'
            : settings.pageBorderType === 'double'
              ? '3px double #78716c'
              : settings.pageBorderType === 'thick'
                ? '2.5px solid #78716c'
                : settings.pageBorderType === 'groove'
                  ? '3px groove #78716c'
                  : settings.pageBorderType === 'ridge'
                    ? '3px ridge #78716c'
                    : settings.pageBorderType === 'inset'
                      ? '3px inset #78716c'
                      : settings.pageBorderType === 'outset'
                        ? '3px outset #78716c'
                        : undefined
    if (!style || !pageBorderBox) return undefined
    if (pageBorderBox.sidesOnly) {
      return {
        borderLeft: style,
        borderRight: style,
        borderTop: 'none',
        borderBottom: 'none',
      } as const
    }
    if (pageBorderBox.topBottomOnly) {
      return {
        borderTop: style,
        borderBottom: style,
        borderLeft: 'none',
        borderRight: 'none',
      } as const
    }
    return { border: style } as const
  })()

  const handleClass =
    'absolute z-20 bg-primary/70 hover:bg-primary shadow-none touch-none select-none'

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium text-stone-800">Report Page Preview</p>
      <div
        className="relative mx-auto rounded-md border border-border bg-white shadow-inner overflow-hidden"
        style={{ width: previewWidth, height: previewHeight }}
      >
        {/* Top / bottom margins */}
        <div
          className="absolute inset-x-0 top-0 border-b border-amber-300/70 bg-amber-100/80"
          style={{ height: marginTopPx }}
        />
        <div
          className="absolute inset-x-0 bottom-0 border-t border-amber-300/70 bg-amber-100/80"
          style={{ height: marginBottomPx }}
        />
        {/* Left / right margins */}
        <div
          className="absolute left-0 border-r border-sky-300/60 bg-sky-100/70"
          style={{ top: marginTopPx, bottom: marginBottomPx, width: marginLeftPx }}
        />
        <div
          className="absolute right-0 border-l border-sky-300/60 bg-sky-100/70"
          style={{ top: marginTopPx, bottom: marginBottomPx, width: marginRightPx }}
        />

        {/* Header max-height band (inside top margin) */}
        {headerPx > 3 ? (
          <div
            className="absolute z-[5] border border-dashed border-indigo-500/70 bg-indigo-500/10"
            style={{
              top: 0,
              left: marginLeftPx,
              width: contentWidth,
              height: headerPx,
            }}
          >
            <span className="absolute left-1 top-0.5 text-[7px] font-semibold uppercase tracking-wide text-indigo-800">
              Header max {headerMm} mm
            </span>
          </div>
        ) : null}

        {/* Footer max-height band (inside bottom margin) */}
        {footerPx > 3 ? (
          <div
            className="absolute z-[5] border border-dashed border-indigo-500/70 bg-indigo-500/10"
            style={{
              bottom: 0,
              left: marginLeftPx,
              width: contentWidth,
              height: footerPx,
            }}
          >
            <span className="absolute left-1 bottom-0.5 text-[7px] font-semibold uppercase tracking-wide text-indigo-800">
              Footer max {footerMm} mm
            </span>
          </div>
        ) : null}

        {settings.showPageNumbers && settings.pageNumberType !== 'none' ? (
          <span
            className="pointer-events-none absolute z-10 rounded bg-violet-100/90 px-1 py-0.5 text-[7px] font-medium text-violet-800"
            style={pageNumberPreviewPlacement(
              settings.pageNumberPosition,
              marginLeftPx,
              marginRightPx,
            )}
          >
            {pageNumberPreviewSample(settings.pageNumberType)}
          </span>
        ) : null}

        {/* Report body = printable content inside margins */}
        <div
          className="absolute z-[1] flex flex-col items-center justify-center border border-dashed border-emerald-500/50 bg-emerald-50/40 px-1 text-center"
          style={{
            top: contentTop,
            left: contentLeft,
            width: contentWidth,
            height: Math.max(0, contentHeight),
          }}
        >
          <span className="text-[9px] font-semibold leading-tight text-emerald-800/90">
            Report body
          </span>
          <span className="mt-0.5 text-[8px] leading-tight text-stone-500">
            Part A · B · C · D
          </span>
        </div>

        {pageBorderBox && pageBorderCss ? (
          <div
            className="pointer-events-none absolute z-[15]"
            style={{
              top: pageBorderBox.top,
              left: pageBorderBox.left,
              width: pageBorderBox.width,
              height: pageBorderBox.height,
              boxSizing: 'border-box',
              ...pageBorderCss,
            }}
            aria-hidden
          />
        ) : null}

        {/* Margin value labels */}
        <span
          className="pointer-events-none absolute left-1/2 z-[6] -translate-x-1/2 rounded bg-amber-50/95 px-1 text-[7px] font-semibold text-amber-900"
          style={{ top: Math.max(headerPx + 2, marginTopPx / 2 - 4) }}
        >
          Top margin {topMm} mm
        </span>
        <span
          className="pointer-events-none absolute left-1/2 z-[6] -translate-x-1/2 rounded bg-amber-50/95 px-1 text-[7px] font-semibold text-amber-900"
          style={{ bottom: Math.max(footerPx + 2, marginBottomPx / 2 - 4) }}
        >
          Bottom margin {bottomMm} mm
        </span>
        <span
          className="pointer-events-none absolute top-1/2 z-[6] -translate-y-1/2 -rotate-90 whitespace-nowrap text-[7px] font-semibold text-sky-900"
          style={{ left: Math.max(-2, marginLeftPx / 2 - 14) }}
        >
          L {leftMm}
        </span>
        <span
          className="pointer-events-none absolute top-1/2 z-[6] -translate-y-1/2 rotate-90 whitespace-nowrap text-[7px] font-semibold text-sky-900"
          style={{ right: Math.max(-2, marginRightPx / 2 - 14) }}
        >
          R {rightMm}
        </span>

        {!disabled ? (
          <>
            <div
              role="slider"
              aria-label="Adjust top margin"
              aria-valuenow={settings.bodyPaddingTopMm}
              className={`${handleClass} left-2 right-2 h-0.5 cursor-ns-resize rounded-none ${dragging === 'top' ? 'ring-1 ring-primary' : ''}`}
              style={{ top: contentTop - 1 }}
              onPointerDown={onPointerDown('top')}
            />
            <div
              role="slider"
              aria-label="Adjust bottom margin"
              aria-valuenow={settings.bodyPaddingBottomMm}
              className={`${handleClass} left-2 right-2 h-0.5 cursor-ns-resize rounded-none ${dragging === 'bottom' ? 'ring-1 ring-primary' : ''}`}
              style={{ top: contentBottom - 1 }}
              onPointerDown={onPointerDown('bottom')}
            />
            <div
              role="slider"
              aria-label="Adjust left margin"
              aria-valuenow={settings.bodyPaddingLeftMm}
              className={`${handleClass} top-8 bottom-8 w-0.5 cursor-ew-resize rounded-none ${dragging === 'left' ? 'ring-1 ring-primary' : ''}`}
              style={{ left: contentLeft - 1 }}
              onPointerDown={onPointerDown('left')}
            />
            <div
              role="slider"
              aria-label="Adjust right margin"
              aria-valuenow={settings.bodyPaddingRightMm}
              className={`${handleClass} top-8 bottom-8 w-0.5 cursor-ew-resize rounded-none ${dragging === 'right' ? 'ring-1 ring-primary' : ''}`}
              style={{ left: contentRight - 1 }}
              onPointerDown={onPointerDown('right')}
            />
          </>
        ) : null}
      </div>
    </div>
  )
}
