import { useEffect, useMemo, useState } from 'react'
import { FileText, Save } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  limsDarkBarBtnClass,
  limsDarkBarGlowStyle,
  limsDialogClass,
  limsPrimaryBtnClass,
} from '@/lib/limsThemeUi'
import { cn } from '@/lib/utils'
import { supabase } from '@/lib/supabaseClient'
import { TemplatesTab } from '@/features/settings/lab-settings/TemplatesTab'
import {
  DEFAULT_LAB_DOCUMENT_TEMPLATES,
  DOCUMENT_TEMPLATE_KIND_OPTIONS,
  type DocumentPageOrientation,
  type DocumentPaperSize,
  type DocumentPrintQuality,
  type DocumentTemplateKind,
  type FinanceDocumentTemplate,
  type LabDocumentTemplates,
} from '@/features/settings/lab-settings/documentTemplateTypes'
import {
  fetchLabDocumentTemplates,
  saveLabDocumentTemplates,
} from '@/features/settings/lab-settings/documentTemplatesConfig'
import { letterheadFromRow } from '@/features/settings/lab-settings/labSettingsDb'
import { labFieldControlClass } from '@/features/settings/lab-settings/labSettingsUi'
import { resolveNamedLetterheadTemplates } from '@/features/sample-handling/report-preparation/reportScopeConfig'

type NamedTemplate = { id: string; name: string; fileUrl?: string | null }

type SettingsPanel = 'page' | null

type QuotationTemplatesDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Defaults to quotation — same dialog powers all Sale document templates. */
  documentKind?: DocumentTemplateKind
}

type BoolKey = {
  [K in keyof FinanceDocumentTemplate]: FinanceDocumentTemplate[K] extends boolean ? K : never
}[keyof FinanceDocumentTemplate]

function ToggleRow({
  id,
  label,
  checked,
  onCheckedChange,
}: {
  id: string
  label: string
  checked: boolean
  onCheckedChange: (v: boolean) => void
}) {
  return (
    <label
      htmlFor={id}
      className="flex cursor-pointer items-center gap-2 rounded-none border border-stone-400 bg-white px-2.5 py-1.5 text-xs text-stone-800 hover:bg-stone-50"
    >
      <input
        id={id}
        type="checkbox"
        className="h-3.5 w-3.5 accent-amber-700"
        checked={checked}
        onChange={(e) => onCheckedChange(e.target.checked)}
      />
      <span>{label}</span>
    </label>
  )
}

export function QuotationTemplatesDialog({
  open,
  onOpenChange,
  documentKind = 'quotation',
}: QuotationTemplatesDialogProps) {
  const [templates, setTemplates] = useState<LabDocumentTemplates>(DEFAULT_LAB_DOCUMENT_TEMPLATES)
  const [headerTemplates, setHeaderTemplates] = useState<NamedTemplate[]>([])
  const [footerTemplates, setFooterTemplates] = useState<NamedTemplate[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [settingsPanel, setSettingsPanel] = useState<SettingsPanel>(null)
  const [headerPreviewUrl, setHeaderPreviewUrl] = useState<string | null>(null)
  const [footerPreviewUrl, setFooterPreviewUrl] = useState<string | null>(null)

  const current = templates[documentKind]
  const kindLabel =
    DOCUMENT_TEMPLATE_KIND_OPTIONS.find((o) => o.kind === documentKind)?.label ?? 'Document'

  const headerNames = useMemo(() => {
    const names = headerTemplates.map((t) => t.name.trim()).filter(Boolean)
    if (current.headerTemplateName && !names.includes(current.headerTemplateName)) {
      names.unshift(current.headerTemplateName)
    }
    return names.length ? names : ['General Letter Header']
  }, [headerTemplates, current.headerTemplateName])

  const footerNames = useMemo(() => {
    const names = footerTemplates.map((t) => t.name.trim()).filter(Boolean)
    if (current.footerTemplateName && !names.includes(current.footerTemplateName)) {
      names.unshift(current.footerTemplateName)
    }
    return names.length ? names : ['General Letter Footer']
  }, [footerTemplates, current.footerTemplateName])

  useEffect(() => {
    if (!open) {
      setSettingsPanel(null)
      setHeaderPreviewUrl(null)
      setFooterPreviewUrl(null)
      return
    }
    let cancelled = false
    setMessage(null)
    setLoading(true)
    void (async () => {
      try {
        const [docs, letterheadsResult] = await Promise.all([
          fetchLabDocumentTemplates(),
          supabase
            .from('lab_letterheads')
            .select('template_type, title, name, file_path, content_text, header_html, footer_html'),
        ])
        if (cancelled) return
        setTemplates(docs)

        const headers: NamedTemplate[] = []
        const footers: NamedTemplate[] = []
        if (!letterheadsResult.error) {
          const rows = (letterheadsResult.data ?? []) as Array<Record<string, unknown>>
          for (const row of rows) {
            const { type, title, fileUrl } = letterheadFromRow(row)
            const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
            if (type === 'header') headers.push({ id, name: title, fileUrl })
            else if (type === 'footer') footers.push({ id, name: title, fileUrl })
          }
        }
        setHeaderTemplates(headers)
        setFooterTemplates(footers)
      } catch (err) {
        if (!cancelled) {
          setMessage(err instanceof Error ? err.message : 'Failed to load templates')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    let cancelled = false
    void (async () => {
      try {
        const resolved = await resolveNamedLetterheadTemplates(
          current.headerTemplateName || 'General Letter Header',
          current.footerTemplateName || 'General Letter Footer',
        )
        if (cancelled) return
        setHeaderPreviewUrl(resolved.headerUrl)
        setFooterPreviewUrl(resolved.footerUrl)
      } catch {
        if (!cancelled) {
          setHeaderPreviewUrl(null)
          setFooterPreviewUrl(null)
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [open, current.headerTemplateName, current.footerTemplateName])

  const patchCurrent = (patch: Partial<FinanceDocumentTemplate>) => {
    setTemplates((prev) => ({
      ...prev,
      [documentKind]: { ...prev[documentKind], ...patch },
    }))
  }

  const setBool = (key: BoolKey, value: boolean) => {
    patchCurrent({ [key]: value })
  }

  const handleSave = () => {
    void (async () => {
      setSaving(true)
      setMessage(null)
      try {
        const saved = await saveLabDocumentTemplates(templates)
        setTemplates(saved)
        setSettingsPanel(null)
        onOpenChange(false)
      } catch (err) {
        setMessage(err instanceof Error ? err.message : 'Unable to save templates')
      } finally {
        setSaving(false)
      }
    })()
  }

  const handleSavePageSettings = () => {
    void (async () => {
      setSaving(true)
      setMessage(null)
      try {
        const saved = await saveLabDocumentTemplates(templates)
        setTemplates(saved)
        setSettingsPanel(null)
      } catch (err) {
        setMessage(err instanceof Error ? err.message : 'Unable to save templates')
      } finally {
        setSaving(false)
      }
    })()
  }

  const footerBtnClass = cn(
    limsDarkBarBtnClass,
    'h-7 gap-1 rounded-none px-2 text-[11px] sm:px-2.5 sm:text-xs',
  )

  return (
    <>
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        persistOnFocusLoss
        aria-describedby={undefined}
        overlayClassName="lg:inset-y-0 lg:left-[268px] lg:right-0 lg:w-auto"
        className={cn(
          '!flex z-50 h-[100dvh] max-h-[100dvh] w-full max-w-none translate-x-0 translate-y-0 flex-col gap-0 overflow-hidden rounded-none border-0 bg-white p-0 shadow-none sm:rounded-none',
          'left-0 top-0',
          'lg:left-[268px] lg:w-[calc(100vw-268px)] lg:max-w-[calc(100vw-268px)]',
          'border-stone-600 ring-1 ring-amber-700/20',
          '[&>button]:!rounded-none [&>button]:text-white [&>button]:opacity-100 [&>button]:hover:bg-white/10',
        )}
      >
        <div className="relative shrink-0 overflow-hidden bg-gradient-to-br from-stone-800 via-stone-900 to-stone-950 px-4 py-2.5 text-white sm:px-5">
          <div className="pointer-events-none absolute inset-0 opacity-[0.18]" style={limsDarkBarGlowStyle} />
          <div className="absolute bottom-0 left-0 h-[2px] w-full bg-gradient-to-r from-amber-500 via-amber-300 to-transparent" />
          <DialogHeader className="relative pr-10 text-left">
            <DialogTitle className="text-base font-semibold tracking-tight text-white sm:text-lg">
              {kindLabel} Templates
            </DialogTitle>
          </DialogHeader>
        </div>

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-gradient-to-b from-stone-100/80 to-white p-3 sm:p-4">
          {loading ? (
            <p className="px-2 py-6 text-sm text-stone-600">Loading templates…</p>
          ) : (
            <TemplatesTab
              templates={templates}
              onChange={setTemplates}
              headerTemplates={headerTemplates}
              footerTemplates={footerTemplates}
              documentKind={documentKind}
            />
          )}
        </div>

        <div className="relative shrink-0 overflow-hidden border-t border-stone-600 bg-gradient-to-br from-stone-800 via-stone-900 to-stone-950 px-2 py-1 text-white sm:px-3">
          <div className="pointer-events-none absolute inset-0 opacity-[0.18]" style={limsDarkBarGlowStyle} />
          <div className="relative flex min-w-0 flex-nowrap items-center justify-between gap-1.5">
            <div className="flex min-w-0 flex-nowrap items-center gap-1">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className={cn(
                  footerBtnClass,
                  settingsPanel === 'page' && 'border-amber-400/60 bg-amber-500/20 text-amber-50',
                )}
                onClick={() => setSettingsPanel('page')}
                disabled={loading}
                title="Page Setting"
              >
                <FileText className="size-3.5 shrink-0" aria-hidden />
                <span className="hidden sm:inline">Page Setting</span>
              </Button>
              {message ? (
                <p
                  className={cn(
                    'min-w-0 max-w-[10rem] truncate text-[10px] sm:max-w-[16rem] sm:text-xs',
                    message.toLowerCase().includes('saved') ? 'text-emerald-300' : 'text-red-300',
                  )}
                  title={message}
                >
                  {message}
                </p>
              ) : null}
            </div>
            <Button
              type="button"
              size="sm"
              className={cn(limsPrimaryBtnClass, 'h-7 gap-1 px-2.5 text-[11px] sm:text-xs')}
              onClick={handleSave}
              disabled={saving || loading}
            >
              <Save size={13} aria-hidden />
              {saving ? 'Saving…' : 'Save & Close'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>

      <Dialog
        open={open && settingsPanel === 'page'}
        onOpenChange={(next) => setSettingsPanel(next ? 'page' : null)}
      >
        <DialogContent
          persistOnFocusLoss
          aria-describedby={undefined}
          layer="nested"
          className={cn(
            limsDialogClass,
            'flex max-h-[90vh] w-[min(96vw,780px)] max-w-[780px] flex-col gap-0 overflow-hidden p-0',
          )}
        >
          <div className="relative shrink-0 bg-gradient-to-br from-stone-800 via-stone-900 to-stone-950 px-4 py-2.5 text-white">
            <div className="pointer-events-none absolute inset-0 opacity-[0.18]" style={limsDarkBarGlowStyle} />
            <DialogHeader className="relative pr-8 text-left">
              <DialogTitle className="text-base font-semibold text-white">Page Setting</DialogTitle>
            </DialogHeader>
          </div>
          <div className="min-h-0 flex-1 overflow-hidden bg-[#f7f3eb] p-3 sm:p-4">
            <Tabs defaultValue="page" className="flex h-full min-h-0 flex-col">
              <TabsList className="h-auto w-full shrink-0 justify-start gap-0 rounded-none border border-stone-500 bg-stone-800 p-0 text-stone-300">
                {(
                  [
                    ['page', 'Page'],
                    ['margins', 'Margins'],
                    ['header', 'Header'],
                  ] as const
                ).map(([value, label]) => (
                  <TabsTrigger
                    key={value}
                    value={value}
                    className="flex-1 rounded-none border-r border-stone-600 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-amber-100/80 last:border-r-0 data-[state=active]:bg-amber-700 data-[state=active]:text-white data-[state=active]:shadow-none"
                  >
                    {label}
                  </TabsTrigger>
                ))}
              </TabsList>

              <TabsContent
                value="page"
                className="mt-3 min-h-0 flex-1 overflow-y-auto focus-visible:ring-0"
              >
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="space-y-1 sm:col-span-2">
                    <Label className="text-[10px]">Document Title</Label>
                    <Input
                      value={current.documentTitle}
                      onChange={(e) => patchCurrent({ documentTitle: e.target.value })}
                      className={cn(labFieldControlClass, '!h-8')}
                      placeholder={kindLabel}
                      aria-label="Document title"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[10px]">Paper Size</Label>
                    <Select
                      value={current.paperSize}
                      onValueChange={(v) =>
                        patchCurrent({ paperSize: v as DocumentPaperSize })
                      }
                    >
                      <SelectTrigger className={cn(labFieldControlClass, '!h-8')}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {(['A4', 'A5', 'Letter', 'Legal'] as const).map((size) => (
                          <SelectItem key={size} value={size}>
                            {size}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[10px]">Orientation</Label>
                    <Select
                      value={current.pageOrientation}
                      onValueChange={(v) =>
                        patchCurrent({ pageOrientation: v as DocumentPageOrientation })
                      }
                    >
                      <SelectTrigger className={cn(labFieldControlClass, '!h-8')}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="portrait">Portrait</SelectItem>
                        <SelectItem value="landscape">Landscape</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="tpl-scaling" className="text-[10px]">
                      Scaling (%)
                    </Label>
                    <Input
                      id="tpl-scaling"
                      type="number"
                      min={10}
                      max={400}
                      step={5}
                      className={cn(labFieldControlClass, '!h-8')}
                      value={current.pageScalingPercent}
                      onChange={(e) =>
                        patchCurrent({
                          pageScalingPercent: Number(e.target.value) || 100,
                        })
                      }
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[10px]">Print Quality</Label>
                    <Select
                      value={current.printQuality}
                      onValueChange={(v) =>
                        patchCurrent({ printQuality: v as DocumentPrintQuality })
                      }
                    >
                      <SelectTrigger className={cn(labFieldControlClass, '!h-8')}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="draft">Draft</SelectItem>
                        <SelectItem value="normal">Normal</SelectItem>
                        <SelectItem value="high">High</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </TabsContent>

              <TabsContent
                value="margins"
                className="mt-3 min-h-0 flex-1 overflow-y-auto focus-visible:ring-0"
              >
                <div className="space-y-3">
                  <div>
                    <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-stone-600">
                      Centre on Page
                    </p>
                    <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                      <ToggleRow
                        id="tpl-centre-h"
                        label="Horizontal"
                        checked={current.centreOnPageHorizontal}
                        onCheckedChange={(v) => setBool('centreOnPageHorizontal', v)}
                      />
                      <ToggleRow
                        id="tpl-centre-v"
                        label="Vertical"
                        checked={current.centreOnPageVertical}
                        onCheckedChange={(v) => setBool('centreOnPageVertical', v)}
                      />
                    </div>
                  </div>
                  <div>
                    <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-stone-600">
                      Margins (mm)
                    </p>
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                      {(
                        [
                          ['pageMarginLeftMm', 'Left'],
                          ['pageMarginRightMm', 'Right'],
                          ['pageMarginTopMm', 'Top'],
                          ['pageMarginBottomMm', 'Bottom'],
                          ['headerMarginMm', 'Header'],
                          ['footerMarginMm', 'Footer'],
                        ] as const
                      ).map(([key, label]) => (
                        <div key={key} className="space-y-1">
                          <Label htmlFor={`tpl-${key}`} className="text-[10px]">
                            {label}
                          </Label>
                          <Input
                            id={`tpl-${key}`}
                            type="number"
                            min={0}
                            max={40}
                            className={cn(labFieldControlClass, '!h-8')}
                            value={current[key]}
                            onChange={(e) =>
                              patchCurrent({ [key]: Number(e.target.value) || 0 })
                            }
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </TabsContent>

              <TabsContent
                value="header"
                className="mt-3 min-h-0 flex-1 overflow-y-auto focus-visible:ring-0"
              >
                <div className="space-y-3">
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label className="text-[10px]">Custom Header</Label>
                      <Select
                        value={current.headerTemplateName}
                        onValueChange={(v) => patchCurrent({ headerTemplateName: v })}
                      >
                        <SelectTrigger className={cn(labFieldControlClass, '!h-8')}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {headerNames.map((name) => (
                            <SelectItem key={name} value={name}>
                              {name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <div className="flex min-h-[72px] items-center justify-center border border-dashed border-stone-400 bg-white px-2 py-2">
                        {headerPreviewUrl ? (
                          <img
                            src={headerPreviewUrl}
                            alt="Custom Header Preview"
                            className="max-h-[64px] max-w-full object-contain"
                          />
                        ) : (
                          <span className="text-[10px] text-stone-500">Header preview</span>
                        )}
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-[10px]">Custom Footer</Label>
                      <Select
                        value={current.footerTemplateName}
                        onValueChange={(v) => patchCurrent({ footerTemplateName: v })}
                      >
                        <SelectTrigger className={cn(labFieldControlClass, '!h-8')}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {footerNames.map((name) => (
                            <SelectItem key={name} value={name}>
                              {name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <div className="flex min-h-[72px] items-center justify-center border border-dashed border-stone-400 bg-white px-2 py-2">
                        {footerPreviewUrl ? (
                          <img
                            src={footerPreviewUrl}
                            alt="Custom Footer Preview"
                            className="max-h-[64px] max-w-full object-contain"
                          />
                        ) : (
                          <span className="text-[10px] text-stone-500">Footer preview</span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                    <ToggleRow
                      id="tpl-odd-even"
                      label="Different Odd & Even Pages"
                      checked={current.differentOddEvenPages}
                      onCheckedChange={(v) => setBool('differentOddEvenPages', v)}
                    />
                    <ToggleRow
                      id="tpl-first-page"
                      label="Different First Page"
                      checked={current.differentFirstPage}
                      onCheckedChange={(v) => setBool('differentFirstPage', v)}
                    />
                    <ToggleRow
                      id="tpl-scale-doc"
                      label="Scale With Document"
                      checked={current.scaleWithDocument}
                      onCheckedChange={(v) => setBool('scaleWithDocument', v)}
                    />
                    <ToggleRow
                      id="tpl-align-margin"
                      label="Align with Page Margin"
                      checked={current.alignWithPageMargin}
                      onCheckedChange={(v) => setBool('alignWithPageMargin', v)}
                    />
                  </div>
                </div>
              </TabsContent>
            </Tabs>
          </div>
          <div className="relative shrink-0 overflow-hidden border-t border-stone-600 bg-gradient-to-br from-stone-800 via-stone-900 to-stone-950 px-3 py-2 text-white">
            <div className="pointer-events-none absolute inset-0 opacity-[0.18]" style={limsDarkBarGlowStyle} />
            <div className="relative flex items-center justify-end gap-2">
              <Button
                type="button"
                size="sm"
                className={cn(limsPrimaryBtnClass, 'h-7 gap-1 px-2.5 text-[11px] sm:text-xs')}
                onClick={handleSavePageSettings}
                disabled={saving || loading}
              >
                <Save size={13} aria-hidden />
                {saving ? 'Saving…' : 'Save & Close'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
