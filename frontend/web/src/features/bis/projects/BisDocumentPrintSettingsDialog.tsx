import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
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
  limsDarkBarGlowStyle,
  limsDialogClass,
  limsFieldClass,
  limsPrimaryBtnClass,
} from '@/lib/limsThemeUi'
import { cn } from '@/lib/utils'
import {
  BIS_PRINT_PAGE_SIZE_OPTIONS,
  DEFAULT_BIS_DOCUMENT_PRINT_PAGE_SETTINGS,
  parseBisDocumentPrintPageSettings,
  type BisDocumentPrintPageSettings,
  type BisDocumentPrintSettingsPanel,
  type BisPrintAlignHorizontal,
  type BisPrintOrientation,
  type BisPrintPageSize,
} from '../print/bisDocumentPrintPageSettings'
import {
  loadBisProjectPrintPageSettings,
  saveBisProjectPrintPageSettings,
  setCachedBisProjectPrintPageSettings,
  subscribeBisProjectPrintPageSettings,
} from './bisPrintPageSettingsApi'

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

const PANEL_TITLE: Record<
  'page' | 'print' | 'letterhead-header' | 'letterhead-footer',
  string
> = {
  page: 'Page Setting',
  print: 'Print Setting',
  'letterhead-header': 'Header Setting',
  'letterhead-footer': 'Footer Setting',
}

export function BisDocumentPrintSettingsDialog({
  open,
  onOpenChange,
  projectId,
  panel,
  disabled = false,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  projectId: string | null | undefined
  panel: Extract<
    BisDocumentPrintSettingsPanel,
    'page' | 'print' | 'letterhead-header' | 'letterhead-footer'
  >
  disabled?: boolean
}) {
  const [settings, setSettings] = useState<BisDocumentPrintPageSettings>(
    DEFAULT_BIS_DOCUMENT_PRINT_PAGE_SETTINGS,
  )
  const [, setLoading] = useState(false)
  const [, setSaving] = useState(false)
  const readyRef = useRef(false)
  const lastSavedJsonRef = useRef('')
  const pendingRef = useRef<BisDocumentPrintPageSettings | null>(null)
  const pid = (projectId ?? '').trim()

  useEffect(() => {
    if (!open || !pid) return
    let cancelled = false
    readyRef.current = false
    setLoading(true)
    void loadBisProjectPrintPageSettings(pid)
      .then((next) => {
        if (cancelled) return
        setSettings(next)
        lastSavedJsonRef.current = JSON.stringify(next)
        readyRef.current = true
      })
      .catch((err) => {
        if (cancelled) return
        toast.error(err instanceof Error ? err.message : 'Could not load print settings.')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [open, pid])

  useEffect(() => {
    if (!open || !pid) return
    return subscribeBisProjectPrintPageSettings((id, next) => {
      if (id !== pid) return
      setSettings(next)
      lastSavedJsonRef.current = JSON.stringify(next)
    })
  }, [open, pid])

  useEffect(() => {
    if (!open || !pid || !readyRef.current || disabled) return
    const json = JSON.stringify(settings)
    if (json === lastSavedJsonRef.current) return
    pendingRef.current = settings
    setCachedBisProjectPrintPageSettings(pid, settings)
    const timer = window.setTimeout(() => {
      const pending = pendingRef.current
      if (!pending) return
      setSaving(true)
      void saveBisProjectPrintPageSettings(pid, pending)
        .then(() => {
          lastSavedJsonRef.current = JSON.stringify(pending)
          pendingRef.current = null
        })
        .catch((err) => {
          toast.error(err instanceof Error ? err.message : 'Could not save print settings.')
        })
        .finally(() => setSaving(false))
    }, 450)
    return () => window.clearTimeout(timer)
  }, [settings, open, pid, disabled])

  useEffect(() => {
    if (open) return
    const pending = pendingRef.current
    if (pid && pending) {
      void saveBisProjectPrintPageSettings(pid, pending).catch(() => {})
    }
    pendingRef.current = null
    readyRef.current = false
  }, [open, pid])

  const title = PANEL_TITLE[panel]
  const wide = panel === 'letterhead-header' || panel === 'letterhead-footer'

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        persistOnFocusLoss
        layer="overlay"
        aria-describedby={undefined}
        className={cn(
          limsDialogClass,
          wide
            ? 'w-[min(42rem,calc(100vw-1.5rem))] max-w-[42rem]'
            : 'w-[min(24rem,calc(100vw-1.5rem))] max-w-sm',
        )}
      >
        <div className="relative shrink-0 overflow-hidden bg-gradient-to-br from-stone-800 via-stone-900 to-stone-950 px-4 py-2.5 text-white">
          <div
            className="pointer-events-none absolute inset-0 opacity-[0.18]"
            style={limsDarkBarGlowStyle}
          />
          <div className="absolute bottom-0 left-0 h-[2px] w-full bg-gradient-to-r from-amber-500 via-amber-300 to-transparent" />
          <DialogHeader className="relative pr-10 text-left">
            <DialogTitle className="text-base font-semibold tracking-tight text-white">
              {title}
            </DialogTitle>
          </DialogHeader>
        </div>

        <div className="max-h-[min(70vh,36rem)] space-y-3 overflow-y-auto px-4 py-4">
          {panel === 'letterhead-header' ? (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <SettingToggle
                  id="ftr-lh-show"
                  label="Show letter head block"
                  checked={settings.showLetterhead}
                  disabled={disabled || !pid}
                  onChange={(checked) =>
                    setSettings((prev) => ({ ...prev, showLetterhead: checked }))
                  }
                />
                <SettingToggle
                  id="ftr-lh-firm"
                  label="Show firm / company name"
                  checked={settings.showLetterheadFirm}
                  disabled={disabled || !pid || !settings.showLetterhead}
                  onChange={(checked) =>
                    setSettings((prev) => ({ ...prev, showLetterheadFirm: checked }))
                  }
                />
                <SettingToggle
                  id="ftr-lh-addr"
                  label="Show factory address"
                  checked={settings.showLetterheadAddress}
                  disabled={disabled || !pid || !settings.showLetterhead}
                  onChange={(checked) =>
                    setSettings((prev) => ({ ...prev, showLetterheadAddress: checked }))
                  }
                />
                <SettingToggle
                  id="ftr-lh-contact"
                  label="Show contact line"
                  checked={settings.showLetterheadContact}
                  disabled={disabled || !pid || !settings.showLetterhead}
                  onChange={(checked) =>
                    setSettings((prev) => ({ ...prev, showLetterheadContact: checked }))
                  }
                />
              </div>
              <div className="space-y-2">
                <SettingToggle
                  id="ftr-lh-phone"
                  label="Show Tel"
                  checked={settings.showLetterheadPhone}
                  disabled={
                    disabled || !pid || !settings.showLetterhead || !settings.showLetterheadContact
                  }
                  onChange={(checked) =>
                    setSettings((prev) => ({ ...prev, showLetterheadPhone: checked }))
                  }
                />
                <SettingToggle
                  id="ftr-lh-email"
                  label="Show Email"
                  checked={settings.showLetterheadEmail}
                  disabled={
                    disabled || !pid || !settings.showLetterhead || !settings.showLetterheadContact
                  }
                  onChange={(checked) =>
                    setSettings((prev) => ({ ...prev, showLetterheadEmail: checked }))
                  }
                />
                <SettingToggle
                  id="ftr-lh-gst"
                  label="Show GSTIN"
                  checked={settings.showLetterheadGst}
                  disabled={
                    disabled || !pid || !settings.showLetterhead || !settings.showLetterheadContact
                  }
                  onChange={(checked) =>
                    setSettings((prev) => ({ ...prev, showLetterheadGst: checked }))
                  }
                />
                <div className="space-y-1">
                  <Label className="text-xs text-stone-700">Letter head align</Label>
                  <Select
                    value={settings.letterheadAlign}
                    disabled={disabled || !pid || !settings.showLetterhead}
                    onValueChange={(v) =>
                      setSettings((prev) => ({
                        ...prev,
                        letterheadAlign: v as BisPrintAlignHorizontal,
                      }))
                    }
                  >
                    <SelectTrigger className={limsFieldClass}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="left">Left</SelectItem>
                      <SelectItem value="center">Center</SelectItem>
                      <SelectItem value="right">Right</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          ) : null}

          {panel === 'letterhead-footer' ? (
            <div className="space-y-2">
              <SettingToggle
                id="ftr-lf-border"
                label="Show page border"
                checked={settings.showPageBorder}
                disabled={disabled || !pid}
                onChange={(checked) =>
                  setSettings((prev) => ({ ...prev, showPageBorder: checked }))
                }
              />
              <SettingToggle
                id="ftr-lf-pagenum"
                label="Show page number"
                checked={settings.showPageNumber}
                disabled={disabled || !pid}
                onChange={(checked) =>
                  setSettings((prev) => ({ ...prev, showPageNumber: checked }))
                }
              />
              <SettingToggle
                id="ftr-lf-pagenum-rule"
                label="Show line above page number"
                checked={settings.showPageNumberRule}
                disabled={disabled || !pid || !settings.showPageNumber}
                onChange={(checked) =>
                  setSettings((prev) => ({ ...prev, showPageNumberRule: checked }))
                }
              />
              <div className="space-y-1">
                <Label className="text-xs text-stone-700">Page number align</Label>
                <Select
                  value={settings.pageNumberAlign}
                  disabled={disabled || !pid || !settings.showPageNumber}
                  onValueChange={(v) =>
                    setSettings((prev) => ({
                      ...prev,
                      pageNumberAlign: v as BisPrintAlignHorizontal,
                    }))
                  }
                >
                  <SelectTrigger className={limsFieldClass}>
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
                <Label className="text-xs text-stone-700">Page number bottom (mm)</Label>
                <Input
                  type="number"
                  min={0}
                  max={12}
                  step={0.5}
                  className={cn(limsFieldClass, 'tabular-nums')}
                  disabled={disabled || !pid || !settings.showPageNumber}
                  value={settings.pageNumberBottomMm}
                  onChange={(e) => {
                    const n = Number.parseFloat(e.target.value)
                    setSettings((prev) => ({
                      ...prev,
                      pageNumberBottomMm: Number.isFinite(n)
                        ? Math.min(12, Math.max(0, n))
                        : prev.pageNumberBottomMm,
                    }))
                  }}
                />
              </div>
            </div>
          ) : null}

          {panel === 'page' ? (
            <div className="space-y-2">
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="text-xs text-stone-700">Page Size</Label>
                  <Select
                    value={settings.pageSize}
                    disabled={disabled || !pid}
                    onValueChange={(v) =>
                      setSettings((prev) => ({ ...prev, pageSize: v as BisPrintPageSize }))
                    }
                  >
                    <SelectTrigger className={limsFieldClass}>
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
                  <Label className="text-xs text-stone-700">Orientation</Label>
                  <Select
                    value={settings.orientation}
                    disabled={disabled || !pid}
                    onValueChange={(v) =>
                      setSettings((prev) => ({
                        ...prev,
                        orientation: v as BisPrintOrientation,
                      }))
                    }
                  >
                    <SelectTrigger className={limsFieldClass}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="portrait">Portrait</SelectItem>
                      <SelectItem value="landscape">Landscape</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {(
                  [
                    ['marginTopMm', 'Top mm'],
                    ['marginRightMm', 'Right mm'],
                    ['marginBottomMm', 'Bottom mm'],
                    ['marginLeftMm', 'Left mm'],
                  ] as const
                ).map(([key, label]) => (
                  <div key={key} className="space-y-1">
                    <Label className="text-xs text-stone-700">{label}</Label>
                    <Input
                      type="number"
                      min={0}
                      max={40}
                      step={0.5}
                      className={cn(limsFieldClass, 'tabular-nums')}
                      disabled={disabled || !pid}
                      value={settings[key]}
                      onChange={(e) => {
                        const n = Number.parseFloat(e.target.value)
                        setSettings((prev) => ({
                          ...prev,
                          [key]: Number.isFinite(n)
                            ? Math.min(40, Math.max(0, n))
                            : prev[key],
                        }))
                      }}
                    />
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {panel === 'print' ? (
            <div className="space-y-2">
              <div className="space-y-1">
                <Label className="text-xs text-stone-700">Screen Scale %</Label>
                <Input
                  type="number"
                  min={50}
                  max={200}
                  step={5}
                  className={cn(limsFieldClass, 'tabular-nums')}
                  disabled={disabled || !pid}
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
              <p className="text-[11px] leading-snug text-stone-600">
                Scale affects screen preview only. Print uses page size and margins from Page
                Setting.
              </p>
              <Button
                type="button"
                variant="outline"
                className="h-8 w-full text-xs"
                disabled={disabled || !pid}
                onClick={() =>
                  setSettings(parseBisDocumentPrintPageSettings(DEFAULT_BIS_DOCUMENT_PRINT_PAGE_SETTINGS))
                }
              >
                Reset Defaults
              </Button>
            </div>
          ) : null}
        </div>

        <DialogFooter className="border-t border-stone-300 bg-stone-50 px-4 py-3">
          <Button
            type="button"
            className={cn(limsPrimaryBtnClass, 'h-8')}
            onClick={() => onOpenChange(false)}
          >
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
