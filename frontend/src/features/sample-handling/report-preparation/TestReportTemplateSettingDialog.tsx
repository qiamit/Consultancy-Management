import { useState } from 'react'
import { FileText, LayoutTemplate, PanelsTopLeft, Save, Settings2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
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
import { DEFAULT_LETTERHEAD_TEMPLATE_NAMES } from '@/features/settings/lab-settings/reportScopeTemplateTypes'
import {
  PRINT_HEADER_ALIGN_OPTIONS,
  PRINT_HEADER_IMAGE_FIT_OPTIONS,
  type PrintHeaderAlign,
  type PrintHeaderImageFit,
  type TestReportPrintSettings,
} from '@/features/settings/lab-settings/printSettingsTypes'
import {
  limsDarkBarBtnClass,
  limsDarkBarGlowStyle,
  limsDialogClass,
  limsFieldClass,
  limsPrimaryBtnClass,
  limsRegistryFormClass,
} from '@/lib/limsThemeUi'
import { cn } from '@/lib/utils'
import { REPORT_SCOPE_TITLE, type ReportScopeKind } from './reportScope'
import {
  isLetterheadNotApplicable,
  LETTERHEAD_NOT_APPLICABLE,
  type LetterheadTemplateOptions,
  type ReportPrepLetterheadsByScope,
} from './reportPrepLetterhead'
import {
  TestReportPageSettingDialog,
  TestReportPrintSettingDialog,
  type TestReportPrintSettingsControls,
} from './TestReportPreparePrintDialogs'
import { TestReportTemplateLivePreview } from './TestReportTemplateLivePreview'
import type { ReportPreparationListRow } from './buildTestReportPreparationAssistantContext'
import type { TestReportCoverDetails } from './fetchTestReportCoverDetails'
import type { ReportResultRow } from './reportResultRows'
import type { TestReportPartBDetails } from './testReportPartB'

const dialogOverlayClass = 'lg:inset-y-0 lg:left-[268px] lg:right-0 lg:w-auto'

const dialogShellClass = cn(
  limsDialogClass,
  'left-0 top-0 flex h-[100dvh] max-h-[100dvh] w-full max-w-none translate-x-0 translate-y-0 flex-col gap-0 overflow-hidden border-0 p-0',
  'lg:left-[268px] md:h-[100dvh] lg:w-[calc(100vw-268px)] lg:max-w-[calc(100vw-268px)]',
)

const nestedShellClass = cn(
  limsDialogClass,
  'left-0 top-0 flex h-[100dvh] max-h-[100dvh] w-full max-w-none translate-x-0 translate-y-0 flex-col gap-0 overflow-hidden p-0',
  'lg:left-[268px] md:h-[100dvh] lg:w-[calc(100vw-268px)] lg:max-w-[calc(100vw-268px)]',
)

const NONE = '__none__'
const NA = LETTERHEAD_NOT_APPLICABLE

type NestedPanel = 'header' | 'footer' | null

function letterheadSelectValue(value: string): string {
  const v = value.trim()
  if (isLetterheadNotApplicable(v)) return NA
  if (!v) return NONE
  return v
}

function TemplateSelect({
  id,
  label,
  value,
  options,
  defaultTemplateName,
  onChange,
  disabled,
}: {
  id: string
  label: string
  value: string
  options: string[]
  defaultTemplateName: string
  onChange: (value: string) => void
  disabled?: boolean
}) {
  return (
    <div className="space-y-1.5 min-w-0">
      <Label htmlFor={id}>{label}</Label>
      <Select
        value={letterheadSelectValue(value)}
        onValueChange={(v) => {
          if (v === NONE) {
            if (defaultTemplateName === 'None') onChange(LETTERHEAD_NOT_APPLICABLE)
            else onChange(defaultTemplateName)
          } else if (v === NA) onChange(LETTERHEAD_NOT_APPLICABLE)
          else onChange(v)
        }}
        disabled={disabled}
      >
        <SelectTrigger id={id} className="h-8 rounded-none border-stone-500 bg-stone-50 text-sm">
          <SelectValue placeholder="From Lab Settings" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NONE}>— Default: {defaultTemplateName} —</SelectItem>
          <SelectItem value={NA}>N/A</SelectItem>
          {options.map((name) => (
            <SelectItem key={name} value={name}>
              {name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}

function HeaderCheckbox({
  id,
  label,
  checked,
  disabled,
  onChange,
}: {
  id: string
  label: string
  checked: boolean
  disabled?: boolean
  onChange: (checked: boolean) => void
}) {
  return (
    <label
      htmlFor={id}
      className={`flex cursor-pointer items-start gap-2 text-sm ${disabled ? 'cursor-not-allowed opacity-50' : ''}`}
    >
      <input
        id={id}
        type="checkbox"
        className="mt-0.5 rounded-none border-stone-500 text-amber-700 focus:ring-amber-500/30"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className="text-stone-800">{label}</span>
    </label>
  )
}

function HeaderNumberField({
  id,
  label,
  value,
  min,
  max,
  disabled,
  onChange,
}: {
  id: string
  label: string
  value: number
  min: number
  max: number
  disabled?: boolean
  onChange: (n: number) => void
}) {
  return (
    <div className="space-y-1.5 min-w-0">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type="number"
        min={min}
        max={max}
        step={1}
        value={value}
        disabled={disabled}
        className={limsFieldClass}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </div>
  )
}

function patchHeaderLayout(
  prev: TestReportPrintSettings,
  partial: Partial<TestReportPrintSettings>,
): TestReportPrintSettings {
  const next = { ...prev, ...partial }
  const minTop = Math.max(18, next.headerMaxHeightMm + next.headerMarginBelowMm)
  if (next.bodyPaddingTopMm < minTop) next.bodyPaddingTopMm = minTop
  return next
}

export function TestReportTemplateSettingDialog({
  open,
  onOpenChange,
  applicableScopes,
  previewScope,
  onPreviewScopeChange,
  letterheadOptions,
  letterheadsByScope,
  onLetterheadChange,
  printSettingsControls,
  active,
  reportNumber,
  nablUlrNumber,
  draftNotes,
  coverDetails,
  partBDetails,
  resultRows,
  disabled,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  applicableScopes: ReportScopeKind[]
  previewScope: ReportScopeKind
  onPreviewScopeChange?: (scope: ReportScopeKind) => void
  letterheadOptions: LetterheadTemplateOptions
  letterheadsByScope: ReportPrepLetterheadsByScope
  onLetterheadChange: (
    scope: ReportScopeKind,
    field: 'headerName' | 'footerName' | 'watermarkName',
    value: string,
  ) => void
  printSettingsControls: TestReportPrintSettingsControls
  active: ReportPreparationListRow | null
  reportNumber: string
  nablUlrNumber: string
  draftNotes: string
  coverDetails: TestReportCoverDetails | null
  partBDetails: TestReportPartBDetails | null
  resultRows: ReportResultRow[]
  disabled?: boolean
}) {
  const [printSettingOpen, setPrintSettingOpen] = useState(false)
  const [pageSettingOpen, setPageSettingOpen] = useState(false)
  const [activePanel, setActivePanel] = useState<NestedPanel>(null)

  const { settings, setSettings, saveLoading, message, save } = printSettingsControls
  const formBusy = Boolean(disabled) || saveLoading

  const closePanel = () => setActivePanel(null)
  const patchHeader = (partial: Partial<TestReportPrintSettings>) => {
    setSettings((prev) => patchHeaderLayout(prev, partial))
  }
  const handleHeaderSave = () => {
    void (async () => {
      const ok = await save()
      if (ok) closePanel()
    })()
  }

  const scopeForPreview =
    applicableScopes.length === 0
      ? previewScope
      : applicableScopes.includes(previewScope)
        ? previewScope
        : applicableScopes[0]

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) setActivePanel(null)
        onOpenChange(next)
      }}
    >
      <DialogContent
        persistOnFocusLoss
        layer="nested"
        aria-describedby={undefined}
        overlayClassName={dialogOverlayClass}
        className={dialogShellClass}
      >
        <div className="relative shrink-0 overflow-hidden bg-gradient-to-br from-stone-800 via-stone-900 to-stone-950 px-4 py-2.5 text-white sm:px-5 sm:py-3">
          <div
            className="pointer-events-none absolute inset-0 opacity-[0.18]"
            style={limsDarkBarGlowStyle}
          />
          <div className="absolute bottom-0 left-0 h-[2px] w-full bg-gradient-to-r from-amber-500 via-amber-300 to-transparent" />
          <DialogHeader className="relative pr-10 text-left">
            <DialogTitle className="text-base font-semibold tracking-tight text-white sm:text-lg">
              Report Template
            </DialogTitle>
          </DialogHeader>
        </div>

        <div className="relative min-h-0 flex-1 overflow-hidden bg-gradient-to-b from-stone-100/90 to-stone-50">
          {applicableScopes.length > 1 && onPreviewScopeChange ? (
            <div className="absolute right-3 top-3 z-10 flex gap-1 rounded-none border border-stone-400 bg-white/95 p-1 shadow-sm">
              {applicableScopes.map((scope) => (
                <Button
                  key={scope}
                  type="button"
                  variant="outline"
                  className={cn(
                    'h-7 rounded-none px-2 text-[11px] font-semibold uppercase tracking-wide',
                    scopeForPreview === scope
                      ? 'border-amber-600 bg-amber-50 text-amber-900'
                      : 'border-stone-300 bg-white text-stone-600',
                  )}
                  onClick={() => onPreviewScopeChange(scope)}
                >
                  {REPORT_SCOPE_TITLE[scope]}
                </Button>
              ))}
            </div>
          ) : null}
          <TestReportTemplateLivePreview
            open={open}
            scope={scopeForPreview}
            printSettings={printSettingsControls.settings}
            letterheadsByScope={letterheadsByScope}
            active={active}
            reportNumber={reportNumber}
            nablUlrNumber={nablUlrNumber}
            draftNotes={draftNotes}
            coverDetails={coverDetails}
            partBDetails={partBDetails}
            resultRows={resultRows}
          />
        </div>

        <div className="relative shrink-0 border-t border-stone-700 bg-gradient-to-br from-stone-800 via-stone-900 to-stone-950 px-4 py-3 sm:px-5">
          <div className="pointer-events-none absolute inset-0 opacity-[0.18]" style={limsDarkBarGlowStyle} />
          <div className="absolute top-0 left-0 h-[2px] w-full bg-gradient-to-r from-amber-500 via-amber-300 to-transparent" />
          <div className="relative flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={disabled}
                className={cn('gap-1.5', limsDarkBarBtnClass)}
                onClick={() => setPageSettingOpen(true)}
              >
                <LayoutTemplate size={14} />
                Page Setting
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={disabled}
                className={cn('gap-1.5', limsDarkBarBtnClass)}
                onClick={() => setPrintSettingOpen(true)}
              >
                <Settings2 size={14} />
                Print Setting
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={disabled}
                className={cn('gap-1.5', limsDarkBarBtnClass)}
                onClick={() => setActivePanel('header')}
              >
                <PanelsTopLeft size={14} />
                Header Setting
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={disabled}
                className={cn('gap-1.5', limsDarkBarBtnClass)}
                onClick={() => setActivePanel('footer')}
              >
                <FileText size={14} />
                Footer Setting
              </Button>
            </div>
            <Button
              type="button"
              className={cn('h-8 shrink-0', limsPrimaryBtnClass)}
              onClick={() => onOpenChange(false)}
            >
              Done
            </Button>
          </div>
        </div>

        <TestReportPageSettingDialog
          open={pageSettingOpen}
          onOpenChange={setPageSettingOpen}
          controls={printSettingsControls}
        />
        <TestReportPrintSettingDialog
          open={printSettingOpen}
          onOpenChange={setPrintSettingOpen}
          controls={printSettingsControls}
        />

        <Dialog open={activePanel != null} onOpenChange={(next) => !next && closePanel()}>
          <DialogContent
            persistOnFocusLoss
            layer="nested"
            aria-describedby={undefined}
            overlayClassName={dialogOverlayClass}
            className={nestedShellClass}
          >
            <div className="relative shrink-0 overflow-hidden bg-gradient-to-br from-stone-800 via-stone-900 to-stone-950 px-4 py-2.5 text-white">
              <div
                className="pointer-events-none absolute inset-0 opacity-[0.18]"
                style={limsDarkBarGlowStyle}
              />
              <div className="absolute bottom-0 left-0 h-[2px] w-full bg-gradient-to-r from-amber-500 via-amber-300 to-transparent" />
              <DialogHeader className="relative pr-10 text-left">
                <DialogTitle className="text-base font-semibold tracking-tight text-white">
                  {activePanel === 'header' ? 'Header Setting' : 'Footer Setting'}
                </DialogTitle>
              </DialogHeader>
            </div>

            <div
              className={cn(
                limsRegistryFormClass,
                'min-h-0 flex-1 space-y-4 overflow-y-auto bg-gradient-to-b from-stone-100/90 to-stone-50 px-4 py-4 sm:px-5',
              )}
            >
              {activePanel === 'header' ? (
                <>
                  <div className="space-y-3 rounded-none border border-stone-500 bg-white px-3 py-3">
                    <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-amber-800">
                      Header Layout
                    </p>
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                      <HeaderCheckbox
                        id="hdr-show-print-header"
                        label="Show letterhead header"
                        checked={settings.showPrintHeader}
                        disabled={formBusy}
                        onChange={(showPrintHeader) => patchHeader({ showPrintHeader })}
                      />
                      <HeaderCheckbox
                        id="hdr-fit-page-width"
                        label="Header fit to page width"
                        checked={settings.headerFitToPageWidth}
                        disabled={formBusy || !settings.showPrintHeader}
                        onChange={(headerFitToPageWidth) => patchHeader({ headerFitToPageWidth })}
                      />
                      <HeaderCheckbox
                        id="hdr-show-watermark"
                        label="Show watermark on print / PDF"
                        checked={settings.showWatermark}
                        disabled={formBusy}
                        onChange={(showWatermark) => patchHeader({ showWatermark })}
                      />
                    </div>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                      <HeaderNumberField
                        id="hdr-max-height"
                        label="Header max height (mm)"
                        value={settings.headerMaxHeightMm}
                        min={12}
                        max={60}
                        disabled={formBusy || !settings.showPrintHeader}
                        onChange={(headerMaxHeightMm) => patchHeader({ headerMaxHeightMm })}
                      />
                      <HeaderNumberField
                        id="hdr-margin-below"
                        label="Margin below header (mm)"
                        value={settings.headerMarginBelowMm}
                        min={0}
                        max={20}
                        disabled={formBusy || !settings.showPrintHeader}
                        onChange={(headerMarginBelowMm) => patchHeader({ headerMarginBelowMm })}
                      />
                      <div className="space-y-1.5 min-w-0">
                        <Label htmlFor="hdr-align">Header alignment</Label>
                        <Select
                          value={settings.headerAlign}
                          onValueChange={(v) =>
                            patchHeader({ headerAlign: v as PrintHeaderAlign })
                          }
                          disabled={formBusy || !settings.showPrintHeader}
                        >
                          <SelectTrigger id="hdr-align">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {PRINT_HEADER_ALIGN_OPTIONS.map((opt) => (
                              <SelectItem key={opt.value} value={opt.value}>
                                {opt.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1.5 min-w-0">
                        <Label htmlFor="hdr-image-fit">Header image fit</Label>
                        <Select
                          value={settings.headerImageFit}
                          onValueChange={(v) =>
                            patchHeader({ headerImageFit: v as PrintHeaderImageFit })
                          }
                          disabled={formBusy || !settings.showPrintHeader}
                        >
                          <SelectTrigger id="hdr-image-fit">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {PRINT_HEADER_IMAGE_FIT_OPTIONS.map((opt) => (
                              <SelectItem key={opt.value} value={opt.value}>
                                {opt.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </div>

                  <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-amber-800">
                    Letterhead Templates by Scope
                  </p>
                  {applicableScopes.length === 0 ? (
                    <p className="rounded-none border border-dashed border-stone-400 bg-stone-50 px-3 py-4 text-center text-sm text-stone-500">
                      No report scopes available for this SRF yet.
                    </p>
                  ) : (
                    applicableScopes.map((scope) => {
                      const lh = letterheadsByScope[scope]
                      return (
                        <div
                          key={scope}
                          className="space-y-3 rounded-none border border-stone-500 bg-white px-3 py-3"
                        >
                          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-amber-800">
                            {REPORT_SCOPE_TITLE[scope]}
                          </p>
                          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                            <TemplateSelect
                              id={`rt-header-${scope}`}
                              label="Letter Head Upper"
                              value={lh.headerName}
                              options={letterheadOptions.headers}
                              defaultTemplateName={
                                scope === 'nabl'
                                  ? DEFAULT_LETTERHEAD_TEMPLATE_NAMES.nablHeader
                                  : DEFAULT_LETTERHEAD_TEMPLATE_NAMES.nonNablHeader
                              }
                              onChange={(value) => onLetterheadChange(scope, 'headerName', value)}
                              disabled={formBusy}
                            />
                            <TemplateSelect
                              id={`rt-footer-${scope}`}
                              label="Letter Head Lower"
                              value={lh.footerName}
                              options={letterheadOptions.footers}
                              defaultTemplateName={DEFAULT_LETTERHEAD_TEMPLATE_NAMES.footer}
                              onChange={(value) => onLetterheadChange(scope, 'footerName', value)}
                              disabled={formBusy}
                            />
                            <TemplateSelect
                              id={`rt-wm-${scope}`}
                              label="Water Mark"
                              value={lh.watermarkName}
                              options={letterheadOptions.watermarks}
                              defaultTemplateName="None"
                              onChange={(value) => onLetterheadChange(scope, 'watermarkName', value)}
                              disabled={formBusy}
                            />
                          </div>
                        </div>
                      )
                    })
                  )}
                  {message ? (
                    <p
                      className={
                        message.toLowerCase().includes('saved') ||
                        message.toLowerCase().includes('success')
                          ? 'border-l-2 border-emerald-600 bg-emerald-50 px-3 py-2 text-xs text-emerald-800'
                          : 'border-l-2 border-destructive bg-destructive/5 px-3 py-2 text-xs text-destructive'
                      }
                    >
                      {message}
                    </p>
                  ) : null}
                </>
              ) : (
                <p className="rounded-none border border-dashed border-stone-400 bg-stone-50 px-3 py-8 text-center text-sm text-stone-500">
                  Footer Setting options will appear here.
                </p>
              )}
            </div>

            <DialogFooter
              className={cn(
                'shrink-0 border-t border-stone-300 bg-stone-50 px-4 py-3',
                activePanel === 'header' ? 'sm:justify-between' : 'sm:justify-end',
              )}
            >
              {activePanel === 'header' ? (
                <>
                  <Button
                    type="button"
                    variant="outline"
                    className="rounded-none"
                    disabled={formBusy}
                    onClick={closePanel}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    className={cn('gap-2', limsPrimaryBtnClass)}
                    disabled={formBusy}
                    onClick={handleHeaderSave}
                  >
                    <Save size={14} />
                    {saveLoading ? 'Saving…' : 'Save & Close'}
                  </Button>
                </>
              ) : (
                <Button type="button" className={limsPrimaryBtnClass} onClick={closePanel}>
                  Done
                </Button>
              )}
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </DialogContent>
    </Dialog>
  )
}
