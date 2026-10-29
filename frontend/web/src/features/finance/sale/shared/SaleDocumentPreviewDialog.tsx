import { useEffect, useMemo, useState } from 'react'
import { FileText, Printer, Save, Signature } from 'lucide-react'
import { toast } from 'sonner'
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useAuth } from '@/hooks/useAuth'
import { isLaboratoryDirector } from '@/lib/isLaboratoryDirector'
import {
  limsDarkBarGlowStyle,
  limsPrimaryBtnClass,
} from '@/lib/limsThemeUi'
import { cn } from '@/lib/utils'
import { supabase } from '@/lib/supabaseClient'
import {
  DEFAULT_LAB_DOCUMENT_TEMPLATES,
  templateForBook,
  type BookDocumentKind,
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
import { previewQuotationsWithTemplate } from '../quotation/outputQuotationDocument'
import type { QuotationRow } from '../quotation/types'

type SettingsTab = 'page' | 'print' | 'signature'

type BoolKey = {
  [K in keyof FinanceDocumentTemplate]: FinanceDocumentTemplate[K] extends boolean ? K : never
}[keyof FinanceDocumentTemplate]

function persistKind(kind: BookDocumentKind): DocumentTemplateKind {
  if (
    kind === 'purchase' ||
    kind === 'purchaseOrder' ||
    kind === 'debitNote' ||
    kind === 'salesDebitNote'
  ) {
    return 'invoice'
  }
  if (kind === 'paymentMade' || kind === 'refund') return 'paymentReceipt'
  return kind
}

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
      className="flex cursor-pointer items-center gap-2 rounded-none border border-stone-400 bg-white px-2 py-1.5 text-[11px] text-stone-800 hover:bg-stone-50"
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

function withPreviewChrome(html: string): string {
  const chrome = `<style id="preview-chrome">
html, body { width: 100% !important; min-height: 100% !important; background: #e7e5e4 !important; }
body {
  display: flex !important;
  justify-content: flex-end !important;
  align-items: flex-start !important;
  padding: 16px !important;
  box-sizing: border-box !important;
}
</style>`
  if (html.includes('</head>')) return html.replace('</head>', `${chrome}</head>`)
  return `${chrome}${html}`
}

/** Read-only document preview with left settings sidebar. Not the edit form. */
export function SaleDocumentPreviewDialog({
  open,
  onOpenChange,
  row,
  documentKind = 'quotation',
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  row: QuotationRow | null
  documentKind?: BookDocumentKind
}) {
  const { role } = useAuth()
  const canEditTemplates = isLaboratoryDirector(role)
  const storageKind = persistKind(documentKind)

  const [settingsTab, setSettingsTab] = useState<SettingsTab>('page')
  const [templates, setTemplates] = useState<LabDocumentTemplates>(DEFAULT_LAB_DOCUMENT_TEMPLATES)
  const [headerNames, setHeaderNames] = useState<string[]>(['General Letter Header'])
  const [footerNames, setFooterNames] = useState<string[]>(['General Letter Footer'])
  const [html, setHtml] = useState<string | null>(null)
  const [title, setTitle] = useState('')
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)

  const current = useMemo(
    () => templateForBook(templates, documentKind),
    [templates, documentKind],
  )

  const patchCurrent = (patch: Partial<FinanceDocumentTemplate>) => {
    setTemplates((prev) => ({
      ...prev,
      [storageKind]: { ...prev[storageKind], ...patch },
    }))
    setDirty(true)
  }

  const setBool = (key: BoolKey, value: boolean) => {
    patchCurrent({ [key]: value })
  }

  useEffect(() => {
    if (!open) return
    let cancelled = false
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
        const headers: string[] = []
        const footers: string[] = []
        if (!letterheadsResult.error) {
          for (const raw of letterheadsResult.data ?? []) {
            const { type, title: name } = letterheadFromRow(raw as Record<string, unknown>)
            const t = name.trim()
            if (!t) continue
            if (type === 'header' && !headers.includes(t)) headers.push(t)
            if (type === 'footer' && !footers.includes(t)) footers.push(t)
          }
        }
        setHeaderNames(headers.length ? headers : ['General Letter Header'])
        setFooterNames(footers.length ? footers : ['General Letter Footer'])
      } catch (err) {
        if (!cancelled) {
          toast.error(err instanceof Error ? err.message : 'Failed to load templates')
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [open])

  useEffect(() => {
    if (!open || !row) return
    let cancelled = false
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          const prepared = await previewQuotationsWithTemplate([row], documentKind, current)
          if (cancelled) return
          setHtml(withPreviewChrome(prepared.html))
          setTitle(prepared.title)
          setLoading(false)
        } catch (err) {
          if (cancelled) return
          setHtml(null)
          setLoading(false)
          toast.error(err instanceof Error ? err.message : 'Failed to preview document')
        }
      })()
    }, dirty ? 280 : 0)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [open, row, documentKind, current, dirty])

  const handleOpenChange = (next: boolean) => {
    if (!next) {
      setHtml(null)
      setTitle('')
      setDirty(false)
      setLoading(false)
      setSettingsTab('page')
    }
    onOpenChange(next)
  }

  const handleSave = () => {
    void (async () => {
      setSaving(true)
      try {
        const saved = await saveLabDocumentTemplates(templates)
        setTemplates(saved)
        setDirty(false)
        toast.success('Template settings saved.')
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Unable to save templates')
      } finally {
        setSaving(false)
      }
    })()
  }

  const sidebarBtn = (id: SettingsTab, label: string, Icon: typeof FileText) => (
    <button
      type="button"
      className={cn(
        'flex w-full items-center gap-2 rounded-none border px-2.5 py-2 text-left text-xs font-semibold',
        settingsTab === id
          ? 'border-amber-600 bg-amber-100 text-amber-950'
          : 'border-stone-400 bg-white text-stone-800 hover:bg-stone-50',
      )}
      onClick={() => setSettingsTab(id)}
    >
      <Icon size={14} className="shrink-0" aria-hidden />
      {label}
    </button>
  )

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        aria-describedby={undefined}
        className={cn(
          '!flex z-50 h-[100dvh] max-h-[100dvh] w-full max-w-none translate-x-0 translate-y-0 flex-col gap-0 overflow-hidden rounded-none border-0 bg-white p-0 shadow-none sm:rounded-none',
          'left-[var(--app-dialog-overlay-left,0px)] top-0 right-0',
          'w-[calc(100vw-var(--app-dialog-overlay-left,0px))] max-w-none',
          'border-stone-600 ring-1 ring-amber-700/20',
          '[&>button]:!rounded-none [&>button]:text-white [&>button]:opacity-100 [&>button]:hover:bg-white/10',
        )}
      >
        <div className="relative shrink-0 overflow-hidden bg-gradient-to-br from-stone-800 via-stone-900 to-stone-950 px-4 py-2.5 text-white sm:px-5 sm:py-3">
          <div className="pointer-events-none absolute inset-0 opacity-[0.18]" style={limsDarkBarGlowStyle} />
          <div className="absolute bottom-0 left-0 h-[2px] w-full bg-gradient-to-r from-amber-500 via-amber-300 to-transparent" />
          <DialogHeader className="relative pr-10 text-left">
            <DialogTitle className="text-base font-semibold tracking-tight text-white sm:text-lg">
              Preview{title.trim() ? ` — ${title.trim()}` : ''}
            </DialogTitle>
          </DialogHeader>
        </div>

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden md:flex-row">
          <aside className="flex max-h-[40dvh] w-full shrink-0 flex-col border-b-2 border-stone-500 bg-[#f7f3eb] md:max-h-none md:w-80 md:border-b-0 md:border-r-2">
            <div className="space-y-1.5 border-b border-stone-400 p-2.5">
              {sidebarBtn('page', 'Page Settings', FileText)}
              {sidebarBtn('print', 'Print Settings', Printer)}
              {sidebarBtn('signature', 'Signature Settings', Signature)}
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-2.5">
              {settingsTab === 'page' ? (
                <Tabs defaultValue="page" className="flex flex-col gap-2">
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
                        className="flex-1 rounded-none border-r border-stone-600 px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-amber-100/80 last:border-r-0 data-[state=active]:bg-amber-700 data-[state=active]:text-white data-[state=active]:shadow-none"
                      >
                        {label}
                      </TabsTrigger>
                    ))}
                  </TabsList>
                  <TabsContent value="page" className="mt-0 space-y-2 focus-visible:ring-0">
                    <div className="space-y-1">
                      <Label className="text-[10px]">Document Title</Label>
                      <Input
                        value={current.documentTitle}
                        onChange={(e) => patchCurrent({ documentTitle: e.target.value })}
                        className={cn(labFieldControlClass, '!h-8')}
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1">
                        <Label className="text-[10px]">Paper Size</Label>
                        <Select
                          value={current.paperSize}
                          onValueChange={(v) => patchCurrent({ paperSize: v as DocumentPaperSize })}
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
                    </div>
                  </TabsContent>
                  <TabsContent value="margins" className="mt-0 space-y-2 focus-visible:ring-0">
                    <div className="grid grid-cols-2 gap-2">
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
                          <Label className="text-[10px]">{label} (mm)</Label>
                          <Input
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
                  </TabsContent>
                  <TabsContent value="header" className="mt-0 space-y-2 focus-visible:ring-0">
                    <div className="space-y-1">
                      <Label className="text-[10px]">Letter Header</Label>
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
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[10px]">Letter Footer</Label>
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
                    </div>
                    <ToggleRow
                      id="pv-show-header"
                      label="Show Letter Header"
                      checked={current.showLetterHeader}
                      onCheckedChange={(v) => setBool('showLetterHeader', v)}
                    />
                    <ToggleRow
                      id="pv-show-footer"
                      label="Show Letter Footer"
                      checked={current.showLetterFooter}
                      onCheckedChange={(v) => setBool('showLetterFooter', v)}
                    />
                  </TabsContent>
                </Tabs>
              ) : null}

              {settingsTab === 'print' ? (
                <div className="space-y-2">
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <Label className="text-[10px]">Scaling (%)</Label>
                      <Input
                        type="number"
                        min={10}
                        max={400}
                        step={5}
                        className={cn(labFieldControlClass, '!h-8')}
                        value={current.pageScalingPercent}
                        onChange={(e) =>
                          patchCurrent({ pageScalingPercent: Number(e.target.value) || 100 })
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
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-stone-600">
                    Sections
                  </p>
                  <div className="grid grid-cols-1 gap-1.5">
                    {(
                      [
                        ['showClientDetails', 'Client Details'],
                        ['showDocumentMeta', 'Document Meta'],
                        ['showLineItems', 'Line Items'],
                        ['showAmountInWords', 'Amount in Words'],
                        ['showBankDetails', 'Bank Details'],
                        ['showTerms', 'Terms'],
                        ['showNotes', 'Notes'],
                        ['showBasicAmount', 'Basic Amount'],
                        ['showGstAmount', 'GST Amount'],
                        ['showGrandTotal', 'Grand Total'],
                      ] as const
                    ).map(([key, label]) => (
                      <ToggleRow
                        key={key}
                        id={`pv-print-${key}`}
                        label={label}
                        checked={current[key]}
                        onCheckedChange={(v) => setBool(key, v)}
                      />
                    ))}
                  </div>
                </div>
              ) : null}

              {settingsTab === 'signature' ? (
                <div className="space-y-2">
                  <ToggleRow
                    id="pv-show-seal"
                    label="Show Seal / Signature"
                    checked={current.showSealSign}
                    onCheckedChange={(v) => setBool('showSealSign', v)}
                  />
                  <p className="border border-stone-400 bg-white px-2.5 py-2 text-[11px] leading-relaxed text-stone-700">
                    Seal and signature image come from Lab Settings and the document&apos;s saved
                    signature. Preview is read-only — edit the document to change the signatory text
                    or uploaded seal.
                  </p>
                </div>
              ) : null}
            </div>

            <div className="shrink-0 border-t border-stone-400 bg-stone-800 p-2">
              {!canEditTemplates ? (
                <p className="mb-1.5 text-[10px] text-amber-200">Only Admin can save templates</p>
              ) : null}
              <Button
                type="button"
                size="sm"
                className={cn(limsPrimaryBtnClass, 'h-8 w-full gap-1 text-xs')}
                disabled={saving || loading || !canEditTemplates || !dirty}
                onClick={handleSave}
              >
                <Save size={13} aria-hidden />
                {saving ? 'Saving…' : dirty ? 'Save Settings' : 'Saved'}
              </Button>
            </div>
          </aside>

          <div className="min-h-0 min-w-0 flex-1 overflow-hidden bg-stone-300">
            {html ? (
              <iframe
                title={title.trim() || 'Document preview'}
                srcDoc={html}
                className="h-full w-full border-0 bg-stone-300"
              />
            ) : open && row ? (
              <p className="px-4 py-6 text-sm text-stone-700">
                {loading ? 'Updating preview…' : 'Preparing preview…'}
              </p>
            ) : (
              <p className="px-4 py-6 text-sm text-stone-700">Nothing to preview.</p>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
