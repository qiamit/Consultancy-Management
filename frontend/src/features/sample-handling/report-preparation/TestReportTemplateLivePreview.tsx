import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { TestReportPrintSettings } from '@/features/settings/lab-settings/printSettingsTypes'
import { resolvePrintPageSizeMm } from '@/features/settings/lab-settings/printSettingsTypes'
import type { ReportPreparationListRow } from './buildTestReportPreparationAssistantContext'
import { buildLiveTestReportHtml } from './buildLiveTestReportHtml'
import type { TestReportCoverDetails } from './fetchTestReportCoverDetails'
import type { ReportPrepLetterheadsByScope } from './reportPrepLetterhead'
import { filterReportRowsByScope, type ReportResultRow } from './reportResultRows'
import { type ReportScopeKind } from './reportScope'
import type { TestReportPartBDetails } from './testReportPartB'
import { paginateTestReportPreview } from './paginateTestReportPreview'
import {
  buildLivePreviewSrcDocCss,
  injectCssIntoHtml,
} from './testReportSheetCss'

/** CSS px at 96dpi — iframe width matches real paper; height grows with full report. */
const CSS_PX_PER_MM = 96 / 25.4

function pageSizeCssPx(settings: TestReportPrintSettings): { width: number; height: number } {
  const page = resolvePrintPageSizeMm(settings)
  return {
    width: Math.round(page.width * CSS_PX_PER_MM),
    height: Math.round(page.height * CSS_PX_PER_MM),
  }
}

export function TestReportTemplateLivePreview({
  open,
  scope,
  printSettings,
  letterheadsByScope,
  active,
  reportNumber,
  nablUlrNumber,
  draftNotes,
  coverDetails,
  partBDetails,
  resultRows,
}: {
  open: boolean
  scope: ReportScopeKind
  printSettings: TestReportPrintSettings
  letterheadsByScope: ReportPrepLetterheadsByScope
  active: ReportPreparationListRow | null
  reportNumber: string
  nablUlrNumber: string
  draftNotes: string
  coverDetails: TestReportCoverDetails | null
  partBDetails: TestReportPartBDetails | null
  resultRows: ReportResultRow[]
}) {
  const [html, setHtml] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [scale, setScale] = useState(1)
  const [contentHeightPx, setContentHeightPx] = useState(0)
  const shellRef = useRef<HTMLDivElement>(null)
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const pagePx = useMemo(() => pageSizeCssPx(printSettings), [printSettings])

  const scopedRows = useMemo(
    () => filterReportRowsByScope(resultRows, scope),
    [resultRows, scope],
  )

  const letterheads = letterheadsByScope[scope]
  const settingsKey = useMemo(() => JSON.stringify(printSettings), [printSettings])
  const letterheadKey = `${letterheads.headerName}|${letterheads.footerName}|${letterheads.watermarkName}`

  const measureContentHeight = useCallback(() => {
    const iframe = iframeRef.current
    const doc = iframe?.contentDocument
    if (!doc) return
    const body = doc.body
    const root = doc.documentElement
    if (!body || !root) return
    const measured = Math.max(body.scrollHeight, root.scrollHeight, body.offsetHeight, pagePx.height)
    setContentHeightPx(measured)
  }, [pagePx.height])

  const paginateAndMeasure = useCallback(async () => {
    const iframe = iframeRef.current
    const doc = iframe?.contentDocument
    if (!doc) return
    try {
      // Fonts/images must settle before measuring page breaks — otherwise rows
      // grow after pagination and hide under the letterhead footer.
      const fonts = doc.fonts?.ready
      if (fonts) await fonts
      await paginateTestReportPreview(doc, printSettings)
    } catch {
      // keep unpaginated document if measurement fails
    }
    measureContentHeight()
  }, [measureContentHeight, printSettings])

  useEffect(() => {
    if (!open) return
    let cancelled = false

    void (async () => {
      if (!active) {
        setHtml('')
        setContentHeightPx(0)
        setError('Open a test report to preview the template.')
        return
      }
      if (scopedRows.length === 0) {
        setHtml('')
        setContentHeightPx(0)
        setError('No parameters for this report scope.')
        return
      }
      setError(null)
      try {
        const built = await buildLiveTestReportHtml({
          scope,
          printSettings,
          letterheadsByScope,
          active,
          reportNumber,
          nablUlrNumber,
          draftNotes,
          coverDetails,
          partBDetails,
          resultRows,
        })
        if (cancelled) return
        setContentHeightPx(pagePx.height)
        setHtml(injectCssIntoHtml(built, buildLivePreviewSrcDocCss(printSettings)))
      } catch (e) {
        if (!cancelled) {
          setHtml('')
          setContentHeightPx(0)
          setError(e instanceof Error ? e.message : 'Unable to build preview')
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [
    open,
    scope,
    settingsKey,
    letterheadKey,
    active,
    reportNumber,
    nablUlrNumber,
    draftNotes,
    coverDetails,
    partBDetails,
    scopedRows,
    resultRows,
    letterheadsByScope,
    letterheads.headerName,
    letterheads.footerName,
    letterheads.watermarkName,
    printSettings,
    pagePx.height,
  ])

  useLayoutEffect(() => {
    const el = shellRef.current
    if (!el) return

    const updateScale = () => {
      const pad = 24
      const availW = Math.max(0, el.clientWidth - pad)
      if (availW < 8 || pagePx.width < 1) return
      // Fit page width; full report scrolls vertically.
      setScale(Math.min(1, availW / pagePx.width))
    }

    updateScale()
    const ro = new ResizeObserver(updateScale)
    ro.observe(el)
    return () => ro.disconnect()
  }, [open, html, pagePx.width])

  useEffect(() => {
    if (!html) return
    // Single delayed pass after layout — early 50ms pass used to lock bad breaks
    // via `.preview-sheets` early-return before fonts finished loading.
    const t = window.setTimeout(() => {
      void paginateAndMeasure()
    }, 120)
    return () => {
      window.clearTimeout(t)
    }
  }, [html, paginateAndMeasure])

  const iframeHeight = Math.max(contentHeightPx || pagePx.height, pagePx.height)

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div
        ref={shellRef}
        className="flex min-h-0 flex-1 justify-center overflow-auto p-3"
      >
        {error ? (
          <p className="self-center rounded-none border border-dashed border-stone-400 bg-white px-4 py-10 text-center text-sm text-stone-500">
            {error}
          </p>
        ) : html ? (
          <div
            className="shrink-0 border border-stone-500 bg-stone-200 shadow-md"
            style={{
              width: pagePx.width * scale,
              height: iframeHeight * scale,
            }}
          >
            <iframe
              ref={iframeRef}
              title="Report template preview"
              className="block border-0 bg-white"
              srcDoc={html}
              sandbox="allow-same-origin"
              onLoad={() => {
                void paginateAndMeasure()
              }}
              style={{
                width: pagePx.width,
                height: iframeHeight,
                transform: `scale(${scale})`,
                transformOrigin: 'top left',
              }}
            />
          </div>
        ) : (
          <p className="self-center rounded-none border border-dashed border-stone-400 bg-white px-4 py-10 text-center text-sm text-stone-500">
            Configure Page, Print, Footer, and Signature settings to see the preview.
          </p>
        )}
      </div>
    </div>
  )
}
