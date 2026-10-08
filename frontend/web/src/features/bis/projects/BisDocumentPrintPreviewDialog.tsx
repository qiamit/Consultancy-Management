import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { Eye, Loader2, Printer, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  limsDarkBarBtnClass,
  limsDarkBarGlowStyle,
  limsFieldClass,
  limsOutlineBtnClass,
  limsPrimaryBtnClass,
} from '@/lib/limsThemeUi'
import { cn } from '@/lib/utils'
import {
  applyBisDocumentPrintPageSettings,
  bisPrintPageSizeMm,
  BIS_DOCUMENT_PRINT_SETTINGS_PANELS,
  BIS_PRINT_PAGE_SIZE_OPTIONS,
  DEFAULT_BIS_DOCUMENT_PRINT_PAGE_SETTINGS,
  type BisDocumentPrintPageSettings,
  type BisDocumentPrintSettingsPanel,
  type BisPrintAlignHorizontal,
  type BisPrintAlignVertical,
  type BisPrintOrientation,
  type BisPrintPageSize,
} from '../print/bisDocumentPrintPageSettings'
import { openPendingPrintWindow, openPrintHtml } from '../print/openPrintHtml'
import {
  ALL_BIS_PRINT_KINDS,
  BIS_PRINT_DOCUMENT_LABEL,
  buildBisDocumentHtml,
  printKindToStorageDocKind,
  type BisPrintDocumentKind,
} from '../print/printBisDocument'
import {
  getCachedBisProjectPrintPageSettings,
  loadBisProjectPrintPageSettings,
  saveBisProjectPrintPageSettings,
  setCachedBisProjectPrintPageSettings,
  subscribeBisProjectPrintPageSettings,
} from './bisPrintPageSettingsApi'
import { buildMergedBisModulePdf } from './mergeBisProjectFilesPdf'
import type { BisProjectRow } from './types'

type PreviewSource = 'attachments' | 'generated'

/**
 * Prefer merged module uploads when present.
 * Structured form modules always use generated HTML from saved fields.
 */
function canTryAttachedFiles(kind: BisPrintDocumentKind): boolean {
  if (kind === 'technical-staff' || kind === 'osl-sample-requirements') return false
  return (ALL_BIS_PRINT_KINDS as readonly string[]).includes(kind) || kind === 'form1'
}

function clampMm(raw: string, fallback: number, max = 40): number {
  const n = Number.parseFloat(raw)
  if (!Number.isFinite(n)) return fallback
  return Math.min(max, Math.max(0, Math.round(n * 10) / 10))
}

function SettingToggle({
  id,
  label,
  checked,
  onChange,
  disabled,
}: {
  id: string
  label: string
  checked: boolean
  onChange: (next: boolean) => void
  disabled?: boolean
}) {
  return (
    <label
      htmlFor={id}
      className={cn(
        'flex cursor-pointer items-center gap-2 border border-stone-400 bg-white px-2 py-1.5 text-xs text-stone-800',
        disabled && 'pointer-events-none opacity-50',
      )}
    >
      <input
        id={id}
        type="checkbox"
        className="h-3.5 w-3.5 shrink-0 rounded-none border-stone-500 text-amber-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/30"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span>{label}</span>
    </label>
  )
}

export function BisDocumentPrintPreviewDialog({
  open,
  onOpenChange,
  row,
  kind,
  /** When set, skip uploads/default builder and show this generated HTML. */
  generatedHtml = null,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  row: BisProjectRow | null
  kind: BisPrintDocumentKind | null
  generatedHtml?: string | null
}) {
  const [settings, setSettings] = useState<BisDocumentPrintPageSettings>(
    DEFAULT_BIS_DOCUMENT_PRINT_PAGE_SETTINGS,
  )
  const [activePanel, setActivePanel] =
    useState<BisDocumentPrintSettingsPanel>('page')
  /** Centered settings form over preview (no blur). */
  const [settingsFormOpen, setSettingsFormOpen] = useState(false)
  /** Drag offset from the centered default position. */
  const [settingsFormOffset, setSettingsFormOffset] = useState({ x: 0, y: 0 })
  const [settingsFormDragging, setSettingsFormDragging] = useState(false)
  const settingsDragRef = useRef<{
    pointerId: number
    startX: number
    startY: number
    originX: number
    originY: number
  } | null>(null)
  const [baseHtml, setBaseHtml] = useState<string | null>(null)
  const [pdfUrl, setPdfUrl] = useState<string | null>(null)
  const [previewSource, setPreviewSource] = useState<PreviewSource | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [printing, setPrinting] = useState(false)
  const pdfUrlRef = useRef<string | null>(null)
  const pdfFrameRef = useRef<HTMLIFrameElement | null>(null)
  /** Skip persisting until project settings have been loaded into state. */
  const settingsReadyRef = useRef(false)
  const settingsProjectIdRef = useRef<string | null>(null)
  const lastSavedSettingsJsonRef = useRef('')
  const pendingSaveRef = useRef<BisDocumentPrintPageSettings | null>(null)
  const projectId = row?.id ?? null

  const title = kind ? BIS_PRINT_DOCUMENT_LABEL[kind] : 'Document'
  const mergePdfMode = previewSource === 'attachments' && Boolean(pdfUrl)

  const revokePdfUrl = () => {
    if (pdfUrlRef.current) {
      URL.revokeObjectURL(pdfUrlRef.current)
      pdfUrlRef.current = null
    }
    setPdfUrl(null)
  }

  useEffect(() => {
    if (!open) {
      // Flush any unsaved Page & Print Settings so other modules keep them.
      const pid = settingsProjectIdRef.current
      const pending = pendingSaveRef.current
      if (pid && pending) {
        void saveBisProjectPrintPageSettings(pid, pending).catch(() => {})
      }
      pendingSaveRef.current = null
      setBaseHtml(null)
      revokePdfUrl()
      setPreviewSource(null)
      setError(null)
      setLoading(false)
      setPrinting(false)
      setActivePanel('page')
      setSettingsFormOpen(false)
      setSettingsFormOffset({ x: 0, y: 0 })
      setSettingsFormDragging(false)
      settingsDragRef.current = null
      settingsReadyRef.current = false
      settingsProjectIdRef.current = null
      lastSavedSettingsJsonRef.current = ''
      return
    }
    if (!kind) return
    if (!generatedHtml && !row) return

    let cancelled = false
    setLoading(true)
    setError(null)
    setBaseHtml(null)
    setPreviewSource(null)
    revokePdfUrl()

    // Load shared Page & Print Settings for this Application / Licence.
    settingsReadyRef.current = false
    const markSettingsLoaded = (next: BisDocumentPrintPageSettings) => {
      setSettings(next)
      settingsReadyRef.current = true
      settingsProjectIdRef.current = projectId
      lastSavedSettingsJsonRef.current = JSON.stringify(next)
    }
    if (projectId) {
      const cached = getCachedBisProjectPrintPageSettings(projectId)
      if (cached) markSettingsLoaded(cached)
      void (async () => {
        try {
          const loaded = await loadBisProjectPrintPageSettings(projectId)
          if (cancelled) return
          markSettingsLoaded(loaded)
        } catch {
          if (!cancelled) markSettingsLoaded(DEFAULT_BIS_DOCUMENT_PRINT_PAGE_SETTINGS)
        }
      })()
    } else {
      markSettingsLoaded(DEFAULT_BIS_DOCUMENT_PRINT_PAGE_SETTINGS)
    }

    void (async () => {
      try {
        if (generatedHtml?.trim()) {
          if (cancelled) return
          setBaseHtml(generatedHtml)
          setPreviewSource('generated')
          return
        }

        if (!row) {
          throw new Error('Project is required for preview.')
        }

        // 1) Prefer attached module files when present.
        if (canTryAttachedFiles(kind)) {
          try {
            const bytes = await buildMergedBisModulePdf(row.id, printKindToStorageDocKind(kind))
            if (cancelled) return
            const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }))
            pdfUrlRef.current = url
            setPdfUrl(url)
            setPreviewSource('attachments')
            return
          } catch {
            // No uploads / merge failed → fall through to generated document HTML.
          }
        }

        // 2) Generated document from module coding / saved fields.
        const html = await buildBisDocumentHtml(row, kind)
        if (cancelled) return
        setBaseHtml(html)
        setPreviewSource('generated')
      } catch (err) {
        if (!cancelled) {
          const msg = err instanceof Error ? err.message : 'Unable to build preview'
          // Never leave the user with a generic "PDF not attached" for coded modules.
          if (row && /no attached files/i.test(msg)) {
            try {
              const html = await buildBisDocumentHtml(row, kind)
              if (!cancelled) {
                setBaseHtml(html)
                setPreviewSource('generated')
                setError(null)
                return
              }
            } catch (htmlErr) {
              setError(htmlErr instanceof Error ? htmlErr.message : msg)
              return
            }
          }
          setError(msg)
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [open, row, kind, generatedHtml, projectId])

  // Keep every module preview on the same live settings for this Application / Licence.
  useEffect(() => {
    if (!open || !projectId) return
    return subscribeBisProjectPrintPageSettings((id, next) => {
      if (id !== projectId) return
      setSettings((prev) => {
        if (JSON.stringify(prev) === JSON.stringify(next)) return prev
        return next
      })
    })
  }, [open, projectId])

  // Persist settings for the whole Application / Licence (all modules share them).
  useEffect(() => {
    if (!open || !projectId) return
    if (!settingsReadyRef.current || settingsProjectIdRef.current !== projectId) return
    const json = JSON.stringify(settings)
    if (json === lastSavedSettingsJsonRef.current) {
      pendingSaveRef.current = null
      return
    }

    // Immediate shared cache so Appointment Letter / other modules see Top Management settings.
    setCachedBisProjectPrintPageSettings(projectId, settings)
    pendingSaveRef.current = settings

    const timer = window.setTimeout(() => {
      const toSave = pendingSaveRef.current
      if (!toSave) return
      void saveBisProjectPrintPageSettings(projectId, toSave)
        .then(() => {
          lastSavedSettingsJsonRef.current = JSON.stringify(toSave)
          if (pendingSaveRef.current === toSave) pendingSaveRef.current = null
        })
        .catch(() => {
          /* keep preview working even if persist fails */
        })
    }, 400)
    return () => window.clearTimeout(timer)
  }, [open, projectId, settings])

  useEffect(() => {
    return () => {
      if (pdfUrlRef.current) {
        URL.revokeObjectURL(pdfUrlRef.current)
        pdfUrlRef.current = null
      }
    }
  }, [])

  useEffect(() => {
    if (!settingsFormOpen) {
      setSettingsFormOffset({ x: 0, y: 0 })
      setSettingsFormDragging(false)
      settingsDragRef.current = null
    }
  }, [settingsFormOpen])

  const previewHtml = useMemo(() => {
    if (!baseHtml) return null
    return applyBisDocumentPrintPageSettings(baseHtml, settings)
  }, [baseHtml, settings])

  const hasPreview = Boolean(pdfUrl || previewHtml)

  const setMargin =
    (key: keyof Pick<
      BisDocumentPrintPageSettings,
      'marginTopMm' | 'marginRightMm' | 'marginBottomMm' | 'marginLeftMm'
    >) =>
    (raw: string) => {
      setSettings((prev) => ({ ...prev, [key]: clampMm(raw, prev[key]) }))
    }

  const onSettingsFormDragStart = (e: ReactPointerEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement | null)?.closest('button')) return
    e.preventDefault()
    e.currentTarget.setPointerCapture(e.pointerId)
    settingsDragRef.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      originX: settingsFormOffset.x,
      originY: settingsFormOffset.y,
    }
    setSettingsFormDragging(true)
  }

  const onSettingsFormDragMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const drag = settingsDragRef.current
    if (!drag || drag.pointerId !== e.pointerId) return
    setSettingsFormOffset({
      x: drag.originX + (e.clientX - drag.startX),
      y: drag.originY + (e.clientY - drag.startY),
    })
  }

  const onSettingsFormDragEnd = (e: ReactPointerEvent<HTMLDivElement>) => {
    const drag = settingsDragRef.current
    if (!drag || drag.pointerId !== e.pointerId) return
    settingsDragRef.current = null
    setSettingsFormDragging(false)
    try {
      e.currentTarget.releasePointerCapture(e.pointerId)
    } catch {
      /* already released */
    }
  }

  const handlePrint = () => {
    setPrinting(true)
    setError(null)
    try {
      if (pdfUrl) {
        const target = openPendingPrintWindow(`Printing ${title}…`)
        if (!target) {
          setError('Popup blocked. Allow popups to print.')
          return
        }
        target.document.open()
        target.document.write(
          `<!doctype html><html lang="en"><head><meta charset="utf-8"/><title>${title}</title>` +
            `<style>html,body{margin:0;height:100%;background:#525659}iframe{border:0;width:100%;height:100%}</style></head>` +
            `<body><iframe id="pdf-frame" src="${pdfUrl}"></iframe>` +
            `<script>window.addEventListener('load',function(){setTimeout(function(){try{var f=document.getElementById('pdf-frame');if(f&&f.contentWindow){f.contentWindow.focus();f.contentWindow.print()}else{window.print()}}catch(e){try{window.print()}catch(e2){}}},600)});</script>` +
            `</body></html>`,
        )
        target.document.close()
        return
      }
      if (previewHtml) {
        const msg = openPrintHtml(previewHtml, { autoPrint: true })
        if (msg) setError(msg)
      }
    } finally {
      setPrinting(false)
    }
  }

  const scale = Math.min(200, Math.max(50, settings.scalePercent)) / 100
  const pageSizeMm = bisPrintPageSizeMm(settings)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        persistOnFocusLoss
        layer="stacked"
        aria-describedby={undefined}
        showCloseButton
        className={cn(
          '!flex h-[100dvh] max-h-[100dvh] translate-x-0 translate-y-0 flex-col gap-0 overflow-hidden rounded-none border-0 bg-stone-100 p-0 shadow-none sm:rounded-none',
          'left-[var(--app-dialog-overlay-left,0px)] top-0 right-0',
          'w-[calc(100vw-var(--app-dialog-overlay-left,0px))] max-w-none',
          'border-stone-600 ring-1 ring-amber-700/20',
        )}
      >
        <div className="relative shrink-0 overflow-hidden bg-gradient-to-br from-stone-800 via-stone-900 to-stone-950 px-3 py-2.5 text-white sm:px-4">
          <div
            className="pointer-events-none absolute inset-0 opacity-[0.18]"
            style={limsDarkBarGlowStyle}
          />
          <div className="absolute bottom-0 left-0 h-[2px] w-full bg-gradient-to-r from-amber-500 via-amber-300 to-transparent" />
          <DialogHeader className="relative pr-10 text-left">
            <DialogTitle className="flex flex-wrap items-center gap-2 text-base font-semibold tracking-tight text-white">
              <Eye size={18} aria-hidden />
              Preview — {title}
              {previewSource === 'attachments' ? (
                <span className="rounded-none border border-amber-400/50 bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-100">
                  Attached files
                </span>
              ) : null}
              {previewSource === 'generated' ? (
                <span className="rounded-none border border-stone-400/50 bg-stone-800/60 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-stone-200">
                  Generated document
                </span>
              ) : null}
            </DialogTitle>
          </DialogHeader>
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-2 p-2 sm:flex-row sm:gap-3 sm:p-3">
          <aside className="flex max-h-full shrink-0 flex-col gap-3 overflow-y-auto rounded-none border border-stone-400 bg-[#fffcf7] p-2 sm:w-[15.5rem] sm:p-3">
            <div className="space-y-1">
              <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-stone-600">
                Page &amp; Print Settings
              </p>
              <p className="text-[10px] leading-snug text-stone-500">
                Applies to all modules in this Application / Licence.
              </p>
            </div>

            {mergePdfMode ? (
              <p className="text-[11px] leading-snug text-stone-600">
                Showing uploaded / attached files for this module. Print uses the browser PDF
                dialog.
              </p>
            ) : null}

            <div className="space-y-1.5">
              {BIS_DOCUMENT_PRINT_SETTINGS_PANELS.map((panel) => {
                const active = settingsFormOpen && activePanel === panel.id
                return (
                  <Button
                    key={panel.id}
                    type="button"
                    variant="outline"
                    className={cn(
                      limsOutlineBtnClass,
                      'h-auto w-full justify-start whitespace-normal px-2.5 py-2 text-left text-[11px] font-semibold leading-snug',
                      active &&
                        'border-amber-700 bg-amber-100 text-amber-950 ring-1 ring-amber-600/40',
                    )}
                    onClick={() => {
                      setActivePanel(panel.id)
                      setSettingsFormOpen(true)
                    }}
                  >
                    {panel.label}
                  </Button>
                )
              })}
            </div>

            <Button
              type="button"
              variant="outline"
              className={cn(limsOutlineBtnClass, 'mt-auto w-full')}
              onClick={() => setSettings(DEFAULT_BIS_DOCUMENT_PRINT_PAGE_SETTINGS)}
            >
              Reset Defaults
            </Button>
          </aside>

          <div className="relative min-h-0 min-w-0 flex-1 overflow-hidden rounded-none border border-stone-400 bg-stone-300">
            <div className="h-full min-h-0 overflow-auto">
              {loading ? (
                <div className="flex h-full min-h-[16rem] items-center justify-center gap-2 text-sm text-stone-700">
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                  Preparing preview…
                </div>
              ) : error && !hasPreview ? (
                <div className="flex h-full min-h-[16rem] items-center justify-center p-4 text-sm text-red-700">
                  {error}
                </div>
              ) : pdfUrl ? (
                <div
                  className="h-full min-h-[16rem] w-full origin-top-left bg-[#525659]"
                  style={{
                    transform: `scale(${scale})`,
                    width: `${100 / scale}%`,
                    height: `${100 / scale}%`,
                  }}
                >
                  <iframe
                    ref={pdfFrameRef}
                    title={`Preview ${title}`}
                    src={pdfUrl}
                    className="h-full w-full border-0"
                  />
                </div>
              ) : previewHtml ? (
                <iframe
                  title={`Preview ${title}`}
                  srcDoc={previewHtml}
                  className="h-full min-h-[16rem] w-full border-0 bg-[#a8a29e]"
                />
              ) : null}
            </div>

            {/* Centered settings form over preview — no blur / no dim overlay. */}
            {settingsFormOpen ? (
              <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center p-3 sm:p-4">
                <div
                  role="dialog"
                  aria-modal="true"
                  aria-label={
                    BIS_DOCUMENT_PRINT_SETTINGS_PANELS.find((p) => p.id === activePanel)
                      ?.label ?? 'Settings'
                  }
                  className={cn(
                    'pointer-events-auto flex max-h-[min(92%,44rem)] flex-col overflow-hidden rounded-none border-4 border-stone-700 bg-[#fffcf7] shadow-2xl ring-2 ring-amber-700/30',
                    activePanel === 'letterhead-header' ||
                      activePanel === 'letterhead-footer'
                      ? 'w-[min(42rem,calc(100%-1rem))]'
                      : 'w-[min(22rem,calc(100%-1rem))]',
                    settingsFormDragging && 'select-none',
                  )}
                  style={{
                    transform: `translate(${settingsFormOffset.x}px, ${settingsFormOffset.y}px)`,
                  }}
                >
                  <div
                    className={cn(
                      'flex shrink-0 touch-none items-center justify-between gap-2 border-b border-stone-300 bg-stone-800 px-3 py-2 text-white',
                      settingsFormDragging ? 'cursor-grabbing' : 'cursor-grab',
                    )}
                    onPointerDown={onSettingsFormDragStart}
                    onPointerMove={onSettingsFormDragMove}
                    onPointerUp={onSettingsFormDragEnd}
                    onPointerCancel={onSettingsFormDragEnd}
                    title="Drag to move"
                  >
                    <p className="text-[11px] font-bold uppercase tracking-[0.14em]">
                      {BIS_DOCUMENT_PRINT_SETTINGS_PANELS.find((p) => p.id === activePanel)
                        ?.label ?? 'Settings'}
                    </p>
                    <button
                      type="button"
                      className="flex h-7 w-7 cursor-pointer items-center justify-center border border-red-600 bg-red-600 text-white hover:bg-red-700"
                      aria-label="Close settings"
                      onClick={() => setSettingsFormOpen(false)}
                    >
                      <X className="h-3.5 w-3.5" strokeWidth={2.75} aria-hidden />
                    </button>
                  </div>

                  <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
                    {mergePdfMode && activePanel !== 'print' ? (
                      <p className="text-[11px] leading-snug text-stone-600">
                        These options apply to generated documents. Attached PDF preview only
                        supports Print Setting (screen scale).
                      </p>
                    ) : null}

                    {!mergePdfMode && activePanel === 'letterhead-header' ? (
                      <div className="space-y-3">
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                          <div>
                            <p className="mb-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-stone-500">
                              Visibility
                            </p>
                            <div className="space-y-2">
                              <SettingToggle
                                id="bis-lh-show"
                                label="Show letter head block"
                                checked={settings.showLetterhead}
                                onChange={(checked) =>
                                  setSettings((prev) => ({ ...prev, showLetterhead: checked }))
                                }
                              />
                              <SettingToggle
                                id="bis-lh-firm"
                                label="Show firm / company name"
                                checked={settings.showLetterheadFirm}
                                disabled={!settings.showLetterhead}
                                onChange={(checked) =>
                                  setSettings((prev) => ({
                                    ...prev,
                                    showLetterheadFirm: checked,
                                  }))
                                }
                              />
                              <SettingToggle
                                id="bis-lh-addr"
                                label="Show factory address"
                                checked={settings.showLetterheadAddress}
                                disabled={!settings.showLetterhead}
                                onChange={(checked) =>
                                  setSettings((prev) => ({
                                    ...prev,
                                    showLetterheadAddress: checked,
                                  }))
                                }
                              />
                              <SettingToggle
                                id="bis-lh-contact"
                                label="Show contact line"
                                checked={settings.showLetterheadContact}
                                disabled={!settings.showLetterhead}
                                onChange={(checked) =>
                                  setSettings((prev) => ({
                                    ...prev,
                                    showLetterheadContact: checked,
                                  }))
                                }
                              />
                            </div>
                          </div>

                          <div>
                            <p className="mb-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-stone-500">
                              Contact parts
                            </p>
                            <div className="space-y-2">
                              <SettingToggle
                                id="bis-lh-phone"
                                label="Show Tel"
                                checked={settings.showLetterheadPhone}
                                disabled={
                                  !settings.showLetterhead || !settings.showLetterheadContact
                                }
                                onChange={(checked) =>
                                  setSettings((prev) => ({
                                    ...prev,
                                    showLetterheadPhone: checked,
                                  }))
                                }
                              />
                              <SettingToggle
                                id="bis-lh-email"
                                label="Show Email"
                                checked={settings.showLetterheadEmail}
                                disabled={
                                  !settings.showLetterhead || !settings.showLetterheadContact
                                }
                                onChange={(checked) =>
                                  setSettings((prev) => ({
                                    ...prev,
                                    showLetterheadEmail: checked,
                                  }))
                                }
                              />
                              <SettingToggle
                                id="bis-lh-gst"
                                label="Show GSTIN"
                                checked={settings.showLetterheadGst}
                                disabled={
                                  !settings.showLetterhead || !settings.showLetterheadContact
                                }
                                onChange={(checked) =>
                                  setSettings((prev) => ({
                                    ...prev,
                                    showLetterheadGst: checked,
                                  }))
                                }
                              />
                              <SettingToggle
                                id="bis-lh-stack"
                                label="Stack contact (one per line)"
                                checked={settings.letterheadContactStacked}
                                disabled={
                                  !settings.showLetterhead || !settings.showLetterheadContact
                                }
                                onChange={(checked) =>
                                  setSettings((prev) => ({
                                    ...prev,
                                    letterheadContactStacked: checked,
                                  }))
                                }
                              />
                            </div>
                          </div>
                        </div>

                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                          <div>
                            <p className="mb-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-stone-500">
                              Layout
                            </p>
                            <div className="space-y-2">
                              <div className="space-y-1">
                                <Label htmlFor="bis-lh-align" className="text-xs text-stone-700">
                                  Letter head align
                                </Label>
                                <Select
                                  value={settings.letterheadAlign || 'center'}
                                  disabled={!settings.showLetterhead}
                                  onValueChange={(v) =>
                                    setSettings((prev) => ({
                                      ...prev,
                                      letterheadAlign: v as BisPrintAlignHorizontal,
                                    }))
                                  }
                                >
                                  <SelectTrigger id="bis-lh-align" className={limsFieldClass}>
                                    <SelectValue placeholder="Center" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="left">Left</SelectItem>
                                    <SelectItem value="center">Center</SelectItem>
                                    <SelectItem value="right">Right</SelectItem>
                                  </SelectContent>
                                </Select>
                              </div>
                              <div className="grid grid-cols-2 gap-2">
                                <div className="space-y-1">
                                  <Label htmlFor="bis-lh-top-pad" className="text-xs text-stone-700">
                                    Top pad (mm)
                                  </Label>
                                  <Input
                                    id="bis-lh-top-pad"
                                    type="number"
                                    min={0}
                                    max={10}
                                    step={0.5}
                                    className={cn(limsFieldClass, 'tabular-nums')}
                                    value={settings.letterheadTopPadMm}
                                    disabled={!settings.showLetterhead}
                                    onChange={(e) =>
                                      setSettings((prev) => ({
                                        ...prev,
                                        letterheadTopPadMm: clampMm(
                                          e.target.value,
                                          prev.letterheadTopPadMm,
                                          10,
                                        ),
                                      }))
                                    }
                                  />
                                </div>
                                <div className="space-y-1">
                                  <Label htmlFor="bis-lh-gap" className="text-xs text-stone-700">
                                    Below gap (mm)
                                  </Label>
                                  <Input
                                    id="bis-lh-gap"
                                    type="number"
                                    min={0}
                                    max={12}
                                    step={0.5}
                                    className={cn(limsFieldClass, 'tabular-nums')}
                                    value={settings.letterheadBottomGapMm}
                                    disabled={!settings.showLetterhead}
                                    onChange={(e) =>
                                      setSettings((prev) => ({
                                        ...prev,
                                        letterheadBottomGapMm: clampMm(
                                          e.target.value,
                                          prev.letterheadBottomGapMm,
                                          12,
                                        ),
                                      }))
                                    }
                                  />
                                </div>
                              </div>
                              <SettingToggle
                                id="bis-lh-compact"
                                label="Compact letter head spacing"
                                checked={settings.letterheadCompact}
                                disabled={!settings.showLetterhead}
                                onChange={(checked) =>
                                  setSettings((prev) => ({
                                    ...prev,
                                    letterheadCompact: checked,
                                  }))
                                }
                              />
                            </div>
                          </div>

                          <div>
                            <p className="mb-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-stone-500">
                              Firm name style
                            </p>
                            <div className="space-y-2">
                              <SettingToggle
                                id="bis-lh-upper"
                                label="UPPERCASE firm name"
                                checked={settings.letterheadFirmUppercase}
                                disabled={!settings.showLetterhead || !settings.showLetterheadFirm}
                                onChange={(checked) =>
                                  setSettings((prev) => ({
                                    ...prev,
                                    letterheadFirmUppercase: checked,
                                  }))
                                }
                              />
                              <SettingToggle
                                id="bis-lh-bold"
                                label="Bold firm name"
                                checked={settings.letterheadFirmBold}
                                disabled={!settings.showLetterhead || !settings.showLetterheadFirm}
                                onChange={(checked) =>
                                  setSettings((prev) => ({
                                    ...prev,
                                    letterheadFirmBold: checked,
                                  }))
                                }
                              />
                              <SettingToggle
                                id="bis-lh-addr-italic"
                                label="Italic address"
                                checked={settings.letterheadAddressItalic}
                                disabled={
                                  !settings.showLetterhead || !settings.showLetterheadAddress
                                }
                                onChange={(checked) =>
                                  setSettings((prev) => ({
                                    ...prev,
                                    letterheadAddressItalic: checked,
                                  }))
                                }
                              />
                              <div className="space-y-1">
                                <Label htmlFor="bis-lh-firm-color" className="text-xs text-stone-700">
                                  Firm name color
                                </Label>
                                <Select
                                  value={settings.letterheadFirmColor || 'stone'}
                                  disabled={
                                    !settings.showLetterhead || !settings.showLetterheadFirm
                                  }
                                  onValueChange={(v) =>
                                    setSettings((prev) => ({
                                      ...prev,
                                      letterheadFirmColor: v as 'stone' | 'amber' | 'black',
                                    }))
                                  }
                                >
                                  <SelectTrigger id="bis-lh-firm-color" className={limsFieldClass}>
                                    <SelectValue placeholder="Stone" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="stone">Stone (dark)</SelectItem>
                                    <SelectItem value="amber">Amber</SelectItem>
                                    <SelectItem value="black">Black</SelectItem>
                                  </SelectContent>
                                </Select>
                              </div>
                            </div>
                          </div>
                        </div>

                        <div>
                          <p className="mb-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-stone-500">
                            Font sizes
                          </p>
                          <div className="grid grid-cols-3 gap-2">
                            <div className="space-y-1">
                              <Label htmlFor="bis-lh-firm-size" className="text-xs text-stone-700">
                                Firm pt
                              </Label>
                              <Input
                                id="bis-lh-firm-size"
                                type="number"
                                min={12}
                                max={28}
                                step={1}
                                className={cn(limsFieldClass, 'tabular-nums')}
                                value={settings.letterheadFirmSizePt}
                                disabled={!settings.showLetterhead || !settings.showLetterheadFirm}
                                onChange={(e) => {
                                  const n = Number.parseInt(e.target.value, 10)
                                  setSettings((prev) => ({
                                    ...prev,
                                    letterheadFirmSizePt: Number.isFinite(n)
                                      ? Math.min(28, Math.max(12, n))
                                      : prev.letterheadFirmSizePt,
                                  }))
                                }}
                              />
                            </div>
                            <div className="space-y-1">
                              <Label htmlFor="bis-lh-addr-size" className="text-xs text-stone-700">
                                Address pt
                              </Label>
                              <Input
                                id="bis-lh-addr-size"
                                type="number"
                                min={8}
                                max={16}
                                step={0.5}
                                className={cn(limsFieldClass, 'tabular-nums')}
                                value={settings.letterheadAddressSizePt}
                                disabled={
                                  !settings.showLetterhead || !settings.showLetterheadAddress
                                }
                                onChange={(e) => {
                                  const n = Number.parseFloat(e.target.value)
                                  setSettings((prev) => ({
                                    ...prev,
                                    letterheadAddressSizePt: Number.isFinite(n)
                                      ? Math.min(16, Math.max(8, n))
                                      : prev.letterheadAddressSizePt,
                                  }))
                                }}
                              />
                            </div>
                            <div className="space-y-1">
                              <Label
                                htmlFor="bis-lh-contact-size"
                                className="text-xs text-stone-700"
                              >
                                Contact pt
                              </Label>
                              <Input
                                id="bis-lh-contact-size"
                                type="number"
                                min={8}
                                max={14}
                                step={0.5}
                                className={cn(limsFieldClass, 'tabular-nums')}
                                value={settings.letterheadContactSizePt}
                                disabled={
                                  !settings.showLetterhead || !settings.showLetterheadContact
                                }
                                onChange={(e) => {
                                  const n = Number.parseFloat(e.target.value)
                                  setSettings((prev) => ({
                                    ...prev,
                                    letterheadContactSizePt: Number.isFinite(n)
                                      ? Math.min(14, Math.max(8, n))
                                      : prev.letterheadContactSizePt,
                                  }))
                                }}
                              />
                            </div>
                          </div>
                        </div>

                        <div>
                          <p className="mb-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-stone-500">
                            Separator line
                          </p>
                          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                            <SettingToggle
                              id="bis-lh-rule"
                              label="Show amber rule under letter head"
                              checked={settings.showLetterheadRule}
                              disabled={!settings.showLetterhead}
                              onChange={(checked) =>
                                setSettings((prev) => ({
                                  ...prev,
                                  showLetterheadRule: checked,
                                }))
                              }
                            />
                            <div className="space-y-1">
                              <Label htmlFor="bis-lh-rule-pt" className="text-xs text-stone-700">
                                Rule thickness (pt)
                              </Label>
                              <Input
                                id="bis-lh-rule-pt"
                                type="number"
                                min={0.5}
                                max={4}
                                step={0.5}
                                className={cn(limsFieldClass, 'tabular-nums')}
                                value={settings.letterheadRuleThicknessPt}
                                disabled={
                                  !settings.showLetterhead || !settings.showLetterheadRule
                                }
                                onChange={(e) => {
                                  const n = Number.parseFloat(e.target.value)
                                  setSettings((prev) => ({
                                    ...prev,
                                    letterheadRuleThicknessPt: Number.isFinite(n)
                                      ? Math.min(4, Math.max(0.5, n))
                                      : prev.letterheadRuleThicknessPt,
                                  }))
                                }}
                              />
                            </div>
                          </div>
                        </div>
                      </div>
                    ) : null}

                    {!mergePdfMode && activePanel === 'letterhead-footer' ? (
                      <div className="space-y-3">
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                          <div>
                            <p className="mb-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-stone-500">
                              Page frame
                            </p>
                            <div className="space-y-2">
                              <SettingToggle
                                id="bis-lf-border"
                                label="Show page border"
                                checked={settings.showPageBorder}
                                onChange={(checked) =>
                                  setSettings((prev) => ({ ...prev, showPageBorder: checked }))
                                }
                              />
                              <div className="space-y-1">
                                <Label htmlFor="bis-lf-border-style" className="text-xs text-stone-700">
                                  Border style
                                </Label>
                                <Select
                                  value={settings.pageBorderStyle || 'double'}
                                  disabled={!settings.showPageBorder}
                                  onValueChange={(v) =>
                                    setSettings((prev) => ({
                                      ...prev,
                                      pageBorderStyle: v as 'double' | 'solid',
                                    }))
                                  }
                                >
                                  <SelectTrigger id="bis-lf-border-style" className={limsFieldClass}>
                                    <SelectValue placeholder="Double" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="double">Double line</SelectItem>
                                    <SelectItem value="solid">Single line</SelectItem>
                                  </SelectContent>
                                </Select>
                              </div>
                              <div className="space-y-1">
                                <Label htmlFor="bis-lf-border-color" className="text-xs text-stone-700">
                                  Border color
                                </Label>
                                <Select
                                  value={settings.pageBorderColor || 'black'}
                                  disabled={!settings.showPageBorder}
                                  onValueChange={(v) =>
                                    setSettings((prev) => ({
                                      ...prev,
                                      pageBorderColor: v as 'black' | 'stone' | 'amber',
                                    }))
                                  }
                                >
                                  <SelectTrigger id="bis-lf-border-color" className={limsFieldClass}>
                                    <SelectValue placeholder="Black" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="black">Black</SelectItem>
                                    <SelectItem value="stone">Stone</SelectItem>
                                    <SelectItem value="amber">Amber</SelectItem>
                                  </SelectContent>
                                </Select>
                              </div>
                              <div className="grid grid-cols-2 gap-2">
                                <div className="space-y-1">
                                  <Label htmlFor="bis-lf-border-pt" className="text-xs text-stone-700">
                                    Thickness (pt)
                                  </Label>
                                  <Input
                                    id="bis-lf-border-pt"
                                    type="number"
                                    min={0.5}
                                    max={5}
                                    step={0.5}
                                    className={cn(limsFieldClass, 'tabular-nums')}
                                    value={settings.pageBorderThicknessPt}
                                    disabled={!settings.showPageBorder}
                                    onChange={(e) => {
                                      const n = Number.parseFloat(e.target.value)
                                      setSettings((prev) => ({
                                        ...prev,
                                        pageBorderThicknessPt: Number.isFinite(n)
                                          ? Math.min(5, Math.max(0.5, n))
                                          : prev.pageBorderThicknessPt,
                                      }))
                                    }}
                                  />
                                </div>
                                <div className="space-y-1">
                                  <Label htmlFor="bis-lf-pad" className="text-xs text-stone-700">
                                    Padding (mm)
                                  </Label>
                                  <Input
                                    id="bis-lf-pad"
                                    type="number"
                                    min={0}
                                    max={10}
                                    step={0.5}
                                    className={cn(limsFieldClass, 'tabular-nums')}
                                    value={settings.pageBorderPaddingMm}
                                    disabled={!settings.showPageBorder}
                                    onChange={(e) =>
                                      setSettings((prev) => ({
                                        ...prev,
                                        pageBorderPaddingMm: clampMm(
                                          e.target.value,
                                          prev.pageBorderPaddingMm,
                                          10,
                                        ),
                                      }))
                                    }
                                  />
                                </div>
                              </div>
                            </div>
                          </div>

                          <div>
                            <p className="mb-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-stone-500">
                              Page number footer
                            </p>
                            <div className="space-y-2">
                              <SettingToggle
                                id="bis-lf-pagenum"
                                label="Show Page N of M"
                                checked={settings.showPageNumber}
                                onChange={(checked) =>
                                  setSettings((prev) => ({ ...prev, showPageNumber: checked }))
                                }
                              />
                              <SettingToggle
                                id="bis-lf-pagenum-rule"
                                label="Show line above page number"
                                checked={settings.showPageNumberRule}
                                disabled={!settings.showPageNumber}
                                onChange={(checked) =>
                                  setSettings((prev) => ({
                                    ...prev,
                                    showPageNumberRule: checked,
                                  }))
                                }
                              />
                              <div className="space-y-1">
                                <Label htmlFor="bis-lf-pagenum-align" className="text-xs text-stone-700">
                                  Page number align
                                </Label>
                                <Select
                                  value={settings.pageNumberAlign || 'right'}
                                  disabled={!settings.showPageNumber}
                                  onValueChange={(v) =>
                                    setSettings((prev) => ({
                                      ...prev,
                                      pageNumberAlign: v as BisPrintAlignHorizontal,
                                    }))
                                  }
                                >
                                  <SelectTrigger id="bis-lf-pagenum-align" className={limsFieldClass}>
                                    <SelectValue placeholder="Right" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="left">Left</SelectItem>
                                    <SelectItem value="center">Center</SelectItem>
                                    <SelectItem value="right">Right</SelectItem>
                                  </SelectContent>
                                </Select>
                              </div>
                              <div className="grid grid-cols-2 gap-2">
                                <div className="space-y-1">
                                  <Label htmlFor="bis-lf-pagenum-pt" className="text-xs text-stone-700">
                                    Font size (pt)
                                  </Label>
                                  <Input
                                    id="bis-lf-pagenum-pt"
                                    type="number"
                                    min={7}
                                    max={14}
                                    step={0.5}
                                    className={cn(limsFieldClass, 'tabular-nums')}
                                    value={settings.pageNumberSizePt}
                                    disabled={!settings.showPageNumber}
                                    onChange={(e) => {
                                      const n = Number.parseFloat(e.target.value)
                                      setSettings((prev) => ({
                                        ...prev,
                                        pageNumberSizePt: Number.isFinite(n)
                                          ? Math.min(14, Math.max(7, n))
                                          : prev.pageNumberSizePt,
                                      }))
                                    }}
                                  />
                                </div>
                                <div className="space-y-1">
                                  <Label
                                    htmlFor="bis-lf-pagenum-bottom"
                                    className="text-xs text-stone-700"
                                  >
                                    Bottom inset (mm)
                                  </Label>
                                  <Input
                                    id="bis-lf-pagenum-bottom"
                                    type="number"
                                    min={0}
                                    max={12}
                                    step={0.5}
                                    className={cn(limsFieldClass, 'tabular-nums')}
                                    value={settings.pageNumberBottomMm}
                                    disabled={!settings.showPageNumber}
                                    onChange={(e) =>
                                      setSettings((prev) => ({
                                        ...prev,
                                        pageNumberBottomMm: clampMm(
                                          e.target.value,
                                          prev.pageNumberBottomMm,
                                          12,
                                        ),
                                      }))
                                    }
                                  />
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>

                        <p className="text-[11px] leading-snug text-stone-600">
                          Page number footer stays at the bottom of every page. Border settings apply
                          to the page frame on screen and print.
                        </p>
                      </div>
                    ) : null}

                    {!mergePdfMode && activePanel === 'signature' ? (
                      <div className="space-y-2">
                        <SettingToggle
                          id="bis-sig-block"
                          label="Show signature block"
                          checked={settings.showSignatureBlock}
                          onChange={(checked) =>
                            setSettings((prev) => ({
                              ...prev,
                              showSignatureBlock: checked,
                            }))
                          }
                        />
                        <SettingToggle
                          id="bis-sig-img"
                          label="Show signature image"
                          checked={settings.showSignatureImage}
                          disabled={!settings.showSignatureBlock}
                          onChange={(checked) =>
                            setSettings((prev) => ({
                              ...prev,
                              showSignatureImage: checked,
                            }))
                          }
                        />
                        <div className="space-y-1">
                          <Label htmlFor="bis-sig-space" className="text-xs text-stone-700">
                            Signature space (mm)
                          </Label>
                          <Input
                            id="bis-sig-space"
                            type="number"
                            min={8}
                            max={40}
                            step={1}
                            className={cn(limsFieldClass, 'tabular-nums')}
                            value={settings.signatureSpaceMm}
                            disabled={!settings.showSignatureBlock}
                            onChange={(e) =>
                              setSettings((prev) => ({
                                ...prev,
                                signatureSpaceMm: clampMm(
                                  e.target.value,
                                  prev.signatureSpaceMm,
                                ),
                              }))
                            }
                          />
                        </div>
                      </div>
                    ) : null}

                    {!mergePdfMode && activePanel === 'page' ? (
                      <div className="space-y-2">
                        <div className="space-y-1">
                          <Label htmlFor="bis-preview-page-size" className="text-xs text-stone-700">
                            Page Size
                          </Label>
                          <Select
                            value={settings.pageSize}
                            onValueChange={(v) =>
                              setSettings((prev) => ({
                                ...prev,
                                pageSize: v as BisPrintPageSize,
                              }))
                            }
                          >
                            <SelectTrigger id="bis-preview-page-size" className={limsFieldClass}>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {BIS_PRINT_PAGE_SIZE_OPTIONS.map((size) => (
                                <SelectItem key={size} value={size}>
                                  {size}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        <div className="space-y-1">
                          <Label
                            htmlFor="bis-preview-orientation"
                            className="text-xs text-stone-700"
                          >
                            Orientation
                          </Label>
                          <Select
                            value={settings.orientation}
                            onValueChange={(v) =>
                              setSettings((prev) => ({
                                ...prev,
                                orientation: v as BisPrintOrientation,
                              }))
                            }
                          >
                            <SelectTrigger
                              id="bis-preview-orientation"
                              className={limsFieldClass}
                            >
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="portrait">Portrait</SelectItem>
                              <SelectItem value="landscape">Landscape</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>

                        <div className="space-y-1">
                          <Label htmlFor="bis-preview-align-h" className="text-xs text-stone-700">
                            Horizontal Align
                          </Label>
                          <Select
                            value={settings.alignHorizontal}
                            onValueChange={(v) =>
                              setSettings((prev) => ({
                                ...prev,
                                alignHorizontal: v as BisPrintAlignHorizontal,
                              }))
                            }
                          >
                            <SelectTrigger id="bis-preview-align-h" className={limsFieldClass}>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="left">Left</SelectItem>
                              <SelectItem value="center">Center</SelectItem>
                              <SelectItem value="right">Right</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>

                        <div className="space-y-1">
                          <Label htmlFor="bis-preview-align-v" className="text-xs text-stone-700">
                            Vertical Align
                          </Label>
                          <Select
                            value={settings.alignVertical}
                            onValueChange={(v) =>
                              setSettings((prev) => ({
                                ...prev,
                                alignVertical: v as BisPrintAlignVertical,
                              }))
                            }
                          >
                            <SelectTrigger id="bis-preview-align-v" className={limsFieldClass}>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="top">Top</SelectItem>
                              <SelectItem value="middle">Middle</SelectItem>
                              <SelectItem value="bottom">Bottom</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>

                        <div className="grid grid-cols-2 gap-2">
                          {(
                            [
                              ['marginTopMm', 'Top mm', 'bis-preview-mt'],
                              ['marginRightMm', 'Right mm', 'bis-preview-mr'],
                              ['marginBottomMm', 'Bottom mm', 'bis-preview-mb'],
                              ['marginLeftMm', 'Left mm', 'bis-preview-ml'],
                            ] as const
                          ).map(([key, fieldLabel, id]) => (
                            <div key={key} className="space-y-1">
                              <Label htmlFor={id} className="text-xs text-stone-700">
                                {fieldLabel}
                              </Label>
                              <Input
                                id={id}
                                type="number"
                                min={0}
                                max={40}
                                step={0.5}
                                className={cn(limsFieldClass, 'tabular-nums')}
                                value={settings[key]}
                                onChange={(e) => setMargin(key)(e.target.value)}
                              />
                            </div>
                          ))}
                        </div>

                        <p className="border border-stone-400 bg-white px-2 py-1.5 text-[11px] tabular-nums text-stone-700">
                          Actual preview size:{' '}
                          <strong>
                            {pageSizeMm.widthMm} × {pageSizeMm.heightMm} mm
                          </strong>
                        </p>
                      </div>
                    ) : null}

                    {activePanel === 'print' ? (
                      <div className="space-y-2">
                        <div className="space-y-1">
                          <Label htmlFor="bis-preview-scale" className="text-xs text-stone-700">
                            Screen Scale %
                          </Label>
                          <Input
                            id="bis-preview-scale"
                            type="number"
                            min={50}
                            max={200}
                            step={5}
                            className={cn(limsFieldClass, 'tabular-nums')}
                            value={settings.scalePercent}
                            onChange={(e) => {
                              const n = Number.parseInt(e.target.value, 10)
                              setSettings((prev) => ({
                                ...prev,
                                scalePercent: Number.isFinite(n)
                                  ? Math.min(200, Math.max(50, n))
                                  : prev.scalePercent,
                              }))
                            }}
                          />
                        </div>
                        {!mergePdfMode ? (
                          <p className="text-[11px] leading-snug text-stone-600">
                            Scale affects screen preview only. Print uses page size and margins
                            from Page Setting.
                          </p>
                        ) : null}
                      </div>
                    ) : null}
                  </div>

                  <div className="shrink-0 border-t border-stone-300 bg-stone-50 px-3 py-2">
                    <Button
                      type="button"
                      className={cn(limsPrimaryBtnClass, 'h-8 w-full text-sm')}
                      onClick={() => setSettingsFormOpen(false)}
                    >
                      Done
                    </Button>
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        </div>

        <div className="relative shrink-0 overflow-hidden bg-gradient-to-br from-stone-800 via-stone-900 to-stone-950 px-3 py-2 text-white sm:px-4">
          <div
            className="pointer-events-none absolute inset-0 opacity-[0.18]"
            style={limsDarkBarGlowStyle}
          />
          <div className="absolute top-0 left-0 h-[2px] w-full bg-gradient-to-r from-amber-500 via-amber-300 to-transparent" />
          <div className="relative flex flex-wrap items-center justify-end gap-2">
            {error ? <p className="mr-auto text-xs text-red-300">{error}</p> : null}
            <Button
              type="button"
              variant="outline"
              className={limsDarkBarBtnClass}
              onClick={() => onOpenChange(false)}
            >
              Close
            </Button>
            <Button
              type="button"
              className={cn(limsPrimaryBtnClass, 'min-w-[7.5rem]')}
              disabled={!hasPreview || loading || printing}
              onClick={handlePrint}
            >
              <Printer className="mr-1.5 h-3.5 w-3.5" aria-hidden />
              {printing ? 'Printing…' : 'Print'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
