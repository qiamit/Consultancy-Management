import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, Save, Settings2 } from 'lucide-react'
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
import {
  DEFAULT_TEST_REPORT_PRINT_SETTINGS,
  DEFAULT_TEST_REPORT_SIGNATURES,
  MAX_TEST_REPORT_SIGNATURES,
  PAGE_BORDER_ALIGNMENT_LABELS,
  PAGE_BORDER_ALIGNMENTS,
  PAGE_BORDER_TYPE_LABELS,
  PAGE_BORDER_TYPES,
  PAGE_NUMBER_POSITION_LABELS,
  PAGE_NUMBER_POSITIONS,
  PAGE_NUMBER_TYPE_LABELS,
  PAGE_NUMBER_TYPES,
  PRINT_HEADER_ALIGN_OPTIONS,
  PRINT_HEADER_IMAGE_FIT_OPTIONS,
  printFontFamilyOptions,
  defaultSignatureShowAfterParts,
  deriveSignatureAfterPartsFromSignatures,
  mapSignaturesShowAfterPart,
  signaturesApplyAfterPart,
  type PageBorderAlignment,
  type PageBorderType,
  type PageNumberPosition,
  type PageNumberType,
  type PrintHeaderAlign,
  type PrintHeaderImageFit,
  type PdfOutputMode,
  type PrintPageOrientation,
  type PrintPageSize,
  parseTestReportPrintSettings,
  type TestReportPrintSettings,
  type TestReportSignature,
} from '@/features/settings/lab-settings/printSettingsTypes'
import { DEFAULT_LETTERHEAD_TEMPLATE_NAMES } from '@/features/settings/lab-settings/reportScopeTemplateTypes'
import {
  fetchActiveUserProfiles,
  type ActiveUserProfileOption,
} from '@/features/sample-handling/shared/fetchActiveUserProfiles'
import {
  DEFAULT_PART_C_REPORT_COLUMNS_BY_SCOPE,
  parsePartCReportColumnsByScope,
  partCColumnsForScope,
} from './partCReportColumns'
import { TestReportPageMarginPreview } from './TestReportPageMarginPreview'
import { SignaturePrintPreview } from './SignaturePrintPreview'
import { defaultFirstSignatures, SignatoriesEditor } from './SignatoriesEditor'
import {
  fetchTestReportPrintSettings,
  saveTestReportPrintSettings,
} from '@/features/settings/lab-settings/printSettingsConfig'
import {
  limsDarkBarBtnClass,
  limsDarkBarGlowStyle,
  limsDialogClass,
  limsFieldClass,
  limsOutlineBtnClass,
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
import { PartAPrintPreview } from './PartAPrintPreview'
import { PartBPrintPreview } from './PartBPrintPreview'
import { PartCPrintPreview } from './PartCPrintPreview'

type PrintSettingSectionId =
  | 'common'
  | 'header'
  | 'footer'
  | 'partA'
  | 'partB'
  | 'partC'
  | 'partD'
  | 'signature'

const PRINT_SETTING_SECTIONS: {
  id: PrintSettingSectionId
  title: string
}[] = [
  {
    id: 'common',
    title: 'Common Setting',
  },
  {
    id: 'header',
    title: 'Header Setting',
  },
  {
    id: 'footer',
    title: 'Footer Setting',
  },
  {
    id: 'partA',
    title: 'Part A Setting',
  },
  {
    id: 'partB',
    title: 'Part B Setting',
  },
  {
    id: 'partC',
    title: 'Part C Setting',
  },
  {
    id: 'partD',
    title: 'Part D Setting',
  },
  {
    id: 'signature',
    title: 'Signature Setting',
  },
]

function CheckboxRow({
  id,
  label,
  hint,
  checked,
  disabled,
  onChange,
}: {
  id: string
  label: string
  hint?: string
  checked: boolean
  disabled?: boolean
  onChange: (checked: boolean) => void
}) {
  return (
    <label
      htmlFor={id}
      className={`flex items-start gap-2 cursor-pointer text-sm ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
    >
      <input
        id={id}
        type="checkbox"
        className="mt-0.5 rounded-none border-stone-500 text-amber-700 focus:ring-amber-500/30"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className="text-stone-800">
        {label}
        {hint ? <span className="mt-0.5 block text-xs font-normal text-stone-500">{hint}</span> : null}
      </span>
    </label>
  )
}

function resetPrintSettings(): TestReportPrintSettings {
  const signatures = DEFAULT_TEST_REPORT_SIGNATURES.map((s) => ({
    ...s,
    showAfterParts: [...(s.showAfterParts ?? defaultSignatureShowAfterParts())],
  }))
  return {
    ...DEFAULT_TEST_REPORT_PRINT_SETTINGS,
    partCColumns: {
      nabl: { ...DEFAULT_PART_C_REPORT_COLUMNS_BY_SCOPE.nabl },
      non_nabl: { ...DEFAULT_PART_C_REPORT_COLUMNS_BY_SCOPE.non_nabl },
    },
    signatures,
    signatureAfterParts: deriveSignatureAfterPartsFromSignatures(signatures),
  }
}

function NumberField({
  id,
  label,
  hint,
  value,
  min,
  max,
  onChange,
  disabled,
}: {
  id: string
  label: string
  hint?: string
  value: number
  min: number
  max: number
  onChange: (n: number) => void
  disabled?: boolean
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      {hint ? <p className="text-xs text-stone-500">{hint}</p> : null}
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

function useTestReportPrintSettingsState(prepareOpen: boolean) {
  const [settings, setSettings] = useState<TestReportPrintSettings>(DEFAULT_TEST_REPORT_PRINT_SETTINGS)
  const [loading, setLoading] = useState(false)
  const [saveLoading, setSaveLoading] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const settingsRef = useRef(settings)
  const loadGenerationRef = useRef(0)

  settingsRef.current = settings

  const setSettingsAndRef: typeof setSettings = (update) => {
    setSettings((prev) => {
      const next = typeof update === 'function' ? update(prev) : update
      settingsRef.current = next
      return next
    })
  }

  useEffect(() => {
    if (!prepareOpen) return

    const generation = ++loadGenerationRef.current
    let cancelled = false
    setMessage(null)
    setLoading(true)

    void fetchTestReportPrintSettings()
      .then((loaded) => {
        if (cancelled || generation !== loadGenerationRef.current) return
        const normalized = parseTestReportPrintSettings(loaded)
        settingsRef.current = normalized
        setSettings(normalized)
      })
      .catch((err) => {
        if (cancelled || generation !== loadGenerationRef.current) return
        setMessage(err instanceof Error ? err.message : 'Unable to load print settings')
      })
      .finally(() => {
        if (cancelled || generation !== loadGenerationRef.current) return
        setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [prepareOpen])

  const save = async (opts?: {
    successMessage?: string
    /** When provided, save this snapshot instead of whatever is in state/ref. */
    snapshot?: TestReportPrintSettings
  }): Promise<boolean> => {
    setSaveLoading(true)
    setMessage(null)
    // Ignore in-flight loads so they cannot overwrite a successful save.
    loadGenerationRef.current += 1
    const toSave = parseTestReportPrintSettings(opts?.snapshot ?? settingsRef.current)
    try {
      await saveTestReportPrintSettings(toSave)
      settingsRef.current = toSave
      setSettings(toSave)
      setMessage(opts?.successMessage ?? 'Saved successfully.')
      return true
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Unable to save print settings')
      return false
    } finally {
      setSaveLoading(false)
    }
  }

  const reloadFromLabDefault = async (): Promise<boolean> => {
    setLoading(true)
    setMessage(null)
    const generation = ++loadGenerationRef.current
    try {
      const loaded = parseTestReportPrintSettings(await fetchTestReportPrintSettings())
      if (generation !== loadGenerationRef.current) return false
      settingsRef.current = loaded
      setSettings(loaded)
      setMessage('Restored saved lab default.')
      return true
    } catch (err) {
      if (generation !== loadGenerationRef.current) return false
      setMessage(err instanceof Error ? err.message : 'Unable to load lab default settings')
      return false
    } finally {
      if (generation === loadGenerationRef.current) setLoading(false)
    }
  }

  const resetToFactory = () => {
    const next = resetPrintSettings()
    settingsRef.current = next
    setSettings(next)
    setMessage('Factory defaults applied in this dialog. Click Set as Default or Save to persist.')
  }

  return {
    settings,
    setSettings: setSettingsAndRef,
    loading,
    saveLoading,
    message,
    setMessage,
    save,
    reloadFromLabDefault,
    resetToFactory,
  }
}

export type TestReportPrintSettingsControls = ReturnType<typeof useTestReportPrintSettingsState>

function PrintSettingsDefaultActions({
  disabled,
  onResetToLabDefault,
  onResetToFactory,
  onSetAsDefault,
}: {
  disabled?: boolean
  onResetToLabDefault: () => void
  onResetToFactory: () => void
  onSetAsDefault: () => void
}) {
  return (
    <div className="flex flex-wrap gap-2">
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={disabled}
        className={limsDarkBarBtnClass}
        onClick={onResetToLabDefault}
        title="Reload the last settings saved as lab default"
      >
        Reset to Default
      </Button>
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={disabled}
        className={limsDarkBarBtnClass}
        onClick={onSetAsDefault}
        title="Save current settings as the lab default (persists after refresh)"
      >
        Set as Default
      </Button>
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={disabled}
        className={limsDarkBarBtnClass}
        onClick={onResetToFactory}
        title="Apply built-in factory values in this dialog only"
      >
        Factory Reset
      </Button>
    </div>
  )
}

export function useTestReportPrintSettingsForPrepare(prepareOpen: boolean) {
  return useTestReportPrintSettingsState(prepareOpen)
}

export function TestReportPrintSettingDialog({
  open,
  onOpenChange,
  controls,
  applicableScopes,
  letterheadOptions,
  letterheadsByScope,
  onLetterheadChange,
  onPersistLetterheadDefaults,
  onReloadLetterheadDefaults,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  controls: TestReportPrintSettingsControls
  applicableScopes?: ReportScopeKind[]
  letterheadOptions?: LetterheadTemplateOptions
  letterheadsByScope?: ReportPrepLetterheadsByScope
  onLetterheadChange?: (
    scope: ReportScopeKind,
    field: 'headerName' | 'footerName' | 'watermarkName',
    value: string,
  ) => void
  onPersistLetterheadDefaults?: () => Promise<void>
  onReloadLetterheadDefaults?: () => Promise<void>
}) {
  const {
    settings,
    setSettings,
    loading,
    saveLoading,
    message,
    setMessage,
    save,
    reloadFromLabDefault,
    resetToFactory,
  } = controls
  const [activeSection, setActiveSection] = useState<PrintSettingSectionId | null>(null)
  const [partAPreviewScope, setPartAPreviewScope] = useState<ReportScopeKind>('nabl')
  const [partCPreviewScope, setPartCPreviewScope] = useState<ReportScopeKind>('nabl')
  const [users, setUsers] = useState<ActiveUserProfileOption[]>([])
  const [usersLoading, setUsersLoading] = useState(false)
  const [usersError, setUsersError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) {
      setActiveSection(null)
      setPartAPreviewScope('nabl')
    }
  }, [open])

  useEffect(() => {
    if (!open || activeSection !== 'signature') return
    setUsersError(null)
    setUsersLoading(true)
    void fetchActiveUserProfiles()
      .then((list) => {
        setUsers(list)
        setSettings((prev) => {
          let changed = false
          const signatures = prev.signatures.map((sig) => {
            if (!sig.userId.trim()) return sig
            const user = list.find((u) => u.id === sig.userId)
            if (!user) return sig
            const nextDept = user.departmentName ?? ''
            const nextDesig = user.designation ?? ''
            if (
              (sig.department || '') === nextDept &&
              (sig.designation || '') === nextDesig &&
              (sig.name || '') === (user.name || sig.name)
            ) {
              return sig
            }
            changed = true
            return {
              ...sig,
              name: user.name || sig.name,
              designation: nextDesig || sig.designation,
              department: nextDept,
            }
          })
          return changed ? { ...prev, signatures } : prev
        })
      })
      .catch((err) => {
        setUsers([])
        setUsersError(err instanceof Error ? err.message : 'Unable to load users')
      })
      .finally(() => setUsersLoading(false))
  }, [open, activeSection, setSettings])

  const patch = (partial: Partial<TestReportPrintSettings>) =>
    setSettings((prev) => {
      const next = { ...prev, ...partial }
      const minTop = Math.max(18, next.headerMaxHeightMm + next.headerMarginBelowMm)
      if (next.bodyPaddingTopMm < minTop) next.bodyPaddingTopMm = minTop
      const minBottom = Math.max(16, next.footerMaxHeightMm + next.footerMarginAboveMm)
      if (next.bodyPaddingBottomMm < minBottom) next.bodyPaddingBottomMm = minBottom
      return next
    })

  const handleSave = () => {
    void (async () => {
      const ok = await save()
      if (ok && onPersistLetterheadDefaults) {
        try {
          await onPersistLetterheadDefaults()
        } catch {
          /* print settings already saved */
        }
      }
      if (ok) onOpenChange(false)
    })()
  }

  const persistAllDefaults = async (successMessage: string) => {
    const ok = await save({ successMessage })
    if (!ok) return
    if (!onPersistLetterheadDefaults) return
    try {
      await onPersistLetterheadDefaults()
    } catch (err) {
      setMessage(
        err instanceof Error
          ? `Print settings saved, but letterhead defaults failed: ${err.message}`
          : 'Print settings saved, but letterhead defaults failed to save.',
      )
    }
  }

  const reloadAllDefaults = async () => {
    const ok = await reloadFromLabDefault()
    if (!ok || !onReloadLetterheadDefaults) return
    try {
      await onReloadLetterheadDefaults()
    } catch {
      /* print settings restored */
    }
  }

  const showLetterheadTemplates =
    Boolean(applicableScopes?.length) &&
    Boolean(letterheadOptions) &&
    Boolean(letterheadsByScope) &&
    Boolean(onLetterheadChange)

  const letterheadNone = '__none__'
  const letterheadNa = LETTERHEAD_NOT_APPLICABLE
  const letterheadSelectValue = (value: string) => {
    const v = value.trim()
    if (isLetterheadNotApplicable(v)) return letterheadNa
    if (!v) return letterheadNone
    return v
  }

  const updateSignature = (index: number, partial: Partial<TestReportSignature>) => {
    setSettings((prev) => {
      const signatures = prev.signatures.map((sig, i) =>
        i === index ? { ...sig, ...partial } : sig,
      )
      return {
        ...prev,
        signatures,
        signatureAfterParts: deriveSignatureAfterPartsFromSignatures(signatures),
      }
    })
  }

  const selectSignatureUser = (index: number, userId: string) => {
    if (!userId || userId === '__none__') {
      updateSignature(index, { userId: '', name: '', designation: '', department: '' })
      return
    }
    const user = users.find((u) => u.id === userId)
    updateSignature(index, {
      userId,
      name: user?.name ?? '',
      designation: user?.designation ?? '',
      department: user?.departmentName ?? '',
    })
  }

  const addSignature = () => {
    if (settings.signatures.length >= MAX_TEST_REPORT_SIGNATURES) return
    const signatures = [...settings.signatures, { ...EMPTY_SIGNATURE }]
    patch({
      signatures,
      signatureAfterParts: deriveSignatureAfterPartsFromSignatures(signatures),
    })
  }

  const removeSignature = (index: number) => {
    const signatures =
      settings.signatures.length <= 1
        ? [{ ...EMPTY_SIGNATURE, roleLabel: 'Tested By' }]
        : settings.signatures.filter((_, i) => i !== index)
    patch({
      signatures,
      signatureAfterParts: deriveSignatureAfterPartsFromSignatures(signatures),
    })
  }

  const setPartHasSignature = (
    part: 'part_a' | 'part_b' | 'part_c' | 'part_d',
    enabled: boolean,
  ) => {
    setSettings((prev) => {
      const signatures = mapSignaturesShowAfterPart(prev.signatures, part, enabled)
      return {
        ...prev,
        showSignatures: enabled ? true : prev.showSignatures,
        signatures,
        signatureAfterParts: deriveSignatureAfterPartsFromSignatures(signatures),
      }
    })
  }

  const activeMeta = PRINT_SETTING_SECTIONS.find((s) => s.id === activeSection)

  const renderLetterheadFields = (
    fields: Array<'headerName' | 'footerName' | 'watermarkName'>,
  ) => {
    if (!showLetterheadTemplates || !applicableScopes || !letterheadOptions || !letterheadsByScope || !onLetterheadChange) {
      return (
        <p className="text-xs text-stone-500">
          Letterhead templates appear when this dialog is opened with report-scope letterhead
          options (e.g. from Test Report Prepare).
        </p>
      )
    }
    return (
      <div className="space-y-3">
        {applicableScopes.map((scope) => {
          const lh = letterheadsByScope[scope]
          const fieldDefs = (
            [
              {
                id: `print-lh-header-${scope}`,
                label: 'Letter Head Upper',
                field: 'headerName' as const,
                value: lh.headerName,
                options: letterheadOptions.headers,
                defaultName:
                  scope === 'nabl'
                    ? DEFAULT_LETTERHEAD_TEMPLATE_NAMES.nablHeader
                    : DEFAULT_LETTERHEAD_TEMPLATE_NAMES.nonNablHeader,
              },
              {
                id: `print-lh-footer-${scope}`,
                label: 'Letter Head Lower',
                field: 'footerName' as const,
                value: lh.footerName,
                options: letterheadOptions.footers,
                defaultName: DEFAULT_LETTERHEAD_TEMPLATE_NAMES.footer,
              },
              {
                id: `print-lh-wm-${scope}`,
                label: 'Water Mark',
                field: 'watermarkName' as const,
                value: lh.watermarkName,
                options: letterheadOptions.watermarks,
                defaultName: 'None',
              },
            ] as const
          ).filter((f) => fields.includes(f.field))

          if (fieldDefs.length === 0) return null

          return (
            <div
              key={scope}
              className="space-y-3 rounded-none border border-stone-500 bg-white px-3 py-3"
            >
              <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-amber-800">
                {REPORT_SCOPE_TITLE[scope]}
              </p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {fieldDefs.map((field) => (
                  <div key={field.id} className="space-y-1.5 min-w-0">
                    <Label htmlFor={field.id}>{field.label}</Label>
                    <Select
                      value={letterheadSelectValue(field.value)}
                      onValueChange={(v) => {
                        if (v === letterheadNone) {
                          // Apply concrete default template (e.g. General Letter Footer), not blank.
                          if (field.defaultName === 'None') {
                            onLetterheadChange(scope, field.field, LETTERHEAD_NOT_APPLICABLE)
                          } else {
                            onLetterheadChange(scope, field.field, field.defaultName)
                          }
                        } else if (v === letterheadNa)
                          onLetterheadChange(scope, field.field, LETTERHEAD_NOT_APPLICABLE)
                        else onLetterheadChange(scope, field.field, v)
                      }}
                      disabled={saveLoading}
                    >
                      <SelectTrigger id={field.id}>
                        <SelectValue placeholder="From Lab Settings" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={letterheadNone}>
                          — Default: {field.defaultName} —
                        </SelectItem>
                        <SelectItem value={letterheadNa}>N/A</SelectItem>
                        {field.options.map((name) => (
                          <SelectItem key={name} value={name}>
                            {name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ))}
              </div>
            </div>
          )
        })}
      </div>
    )
  }

  const renderSectionBody = () => {
    if (!activeSection) return null

    switch (activeSection) {
      case 'common':
        return (
          <div className="space-y-5">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label>PDF download method</Label>
                <Select
                  value={settings.pdfOutputMode}
                  onValueChange={(v) => patch({ pdfOutputMode: v as PdfOutputMode })}
                  disabled={saveLoading}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="browser_print">
                      Browser print dialog (recommended for letterhead)
                    </SelectItem>
                    <SelectItem value="playwright">Download PDF file</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="prep-font-family">Font family</Label>
                <Select
                  value={settings.fontFamily}
                  onValueChange={(fontFamily) => patch({ fontFamily })}
                  disabled={saveLoading}
                >
                  <SelectTrigger id="prep-font-family">
                    <SelectValue placeholder="Select font" />
                  </SelectTrigger>
                  <SelectContent>
                    {printFontFamilyOptions(settings.fontFamily).map((opt) => (
                      <SelectItem key={opt.value} value={opt.value} style={{ fontFamily: opt.value }}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <NumberField
                id="prep-font-size"
                label="Base font size (pt)"
                value={settings.baseFontSizePt}
                min={8}
                max={14}
                disabled={saveLoading}
                onChange={(baseFontSizePt) => patch({ baseFontSizePt })}
              />
            </div>
            <div className="space-y-2">
              <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-amber-800">
                Content on print
              </p>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <CheckboxRow
                  id="prep-show-title"
                  label='Show "** Test Report **" title'
                  checked={settings.showReportTitle}
                  disabled={saveLoading}
                  onChange={(showReportTitle) => patch({ showReportTitle })}
                />
                <CheckboxRow
                  id="prep-show-terms"
                  label="Show Terms & Conditions"
                  checked={settings.showTermsAndConditions}
                  disabled={saveLoading}
                  onChange={(showTermsAndConditions) => patch({ showTermsAndConditions })}
                />
              </div>
            </div>
          </div>
        )

      case 'header':
        return (
          <div className="space-y-5">
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <CheckboxRow
                id="prep-show-header"
                label="Show letterhead header"
                checked={settings.showPrintHeader}
                disabled={saveLoading}
                onChange={(showPrintHeader) => patch({ showPrintHeader })}
              />
              <CheckboxRow
                id="prep-show-watermark"
                label="Show watermark on print / PDF"
                checked={settings.showWatermark}
                disabled={saveLoading}
                onChange={(showWatermark) => patch({ showWatermark })}
              />
              <CheckboxRow
                id="prep-header-fit"
                label="Header fit to page width"
                checked={settings.headerFitToPageWidth}
                disabled={saveLoading || !settings.showPrintHeader}
                onChange={(headerFitToPageWidth) => patch({ headerFitToPageWidth })}
              />
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <NumberField
                id="prep-header-max-h"
                label="Header max height (mm)"
                value={settings.headerMaxHeightMm}
                min={20}
                max={80}
                disabled={saveLoading || !settings.showPrintHeader}
                onChange={(headerMaxHeightMm) => patch({ headerMaxHeightMm })}
              />
              <NumberField
                id="prep-header-margin-below"
                label="Margin below header (mm)"
                value={settings.headerMarginBelowMm}
                min={0}
                max={30}
                disabled={saveLoading || !settings.showPrintHeader}
                onChange={(headerMarginBelowMm) => patch({ headerMarginBelowMm })}
              />
              <div className="space-y-1.5">
                <Label htmlFor="prep-header-align">Header alignment</Label>
                <Select
                  value={settings.headerAlign}
                  onValueChange={(v) => patch({ headerAlign: v as PrintHeaderAlign })}
                  disabled={saveLoading || !settings.showPrintHeader}
                >
                  <SelectTrigger id="prep-header-align">
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
              <div className="space-y-1.5">
                <Label htmlFor="prep-header-image-fit">Header image fit</Label>
                <Select
                  value={settings.headerImageFit}
                  onValueChange={(v) => patch({ headerImageFit: v as PrintHeaderImageFit })}
                  disabled={saveLoading || !settings.showPrintHeader}
                >
                  <SelectTrigger id="prep-header-image-fit">
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
            <div className="space-y-3 border-t border-stone-400 pt-4">
              <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-amber-800">
                Letterhead templates (header &amp; watermark)
              </p>
              {renderLetterheadFields(['headerName', 'watermarkName'])}
            </div>
          </div>
        )

      case 'footer':
        return (
          <div className="space-y-5">
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <CheckboxRow
                id="prep-show-footer"
                label="Show letterhead footer"
                checked={settings.showPrintFooter}
                disabled={saveLoading}
                onChange={(showPrintFooter) => patch({ showPrintFooter })}
              />
              <CheckboxRow
                id="prep-footer-fit"
                label="Footer fit to page width"
                checked={settings.footerFitToPageWidth}
                disabled={saveLoading || !settings.showPrintFooter}
                onChange={(footerFitToPageWidth) => patch({ footerFitToPageWidth })}
              />
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <NumberField
                id="prep-footer-max-h"
                label="Footer max height (mm)"
                value={settings.footerMaxHeightMm}
                min={14}
                max={60}
                disabled={saveLoading || !settings.showPrintFooter}
                onChange={(footerMaxHeightMm) => patch({ footerMaxHeightMm })}
              />
              <NumberField
                id="prep-footer-margin-above"
                label="Margin above footer (mm)"
                value={settings.footerMarginAboveMm}
                min={0}
                max={30}
                disabled={saveLoading || !settings.showPrintFooter}
                onChange={(footerMarginAboveMm) => patch({ footerMarginAboveMm })}
              />
              <div className="space-y-1.5">
                <Label htmlFor="prep-footer-align">Footer alignment</Label>
                <Select
                  value={settings.footerAlign}
                  onValueChange={(v) => patch({ footerAlign: v as PrintHeaderAlign })}
                  disabled={saveLoading || !settings.showPrintFooter}
                >
                  <SelectTrigger id="prep-footer-align">
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
              <div className="space-y-1.5">
                <Label htmlFor="prep-footer-image-fit">Footer image fit</Label>
                <Select
                  value={settings.footerImageFit}
                  onValueChange={(v) => patch({ footerImageFit: v as PrintHeaderImageFit })}
                  disabled={saveLoading || !settings.showPrintFooter}
                >
                  <SelectTrigger id="prep-footer-image-fit">
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
            <div className="space-y-3 border-t border-stone-400 pt-4">
              <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-amber-800">
                Letterhead templates (footer)
              </p>
              {renderLetterheadFields(['footerName'])}
            </div>
          </div>
        )

      case 'partA':
        return (
          <div className="space-y-5">
            <PartAPrintPreview
              fontSizePt={settings.baseFontSizePt}
              startsOnNewPage={settings.partANewPage}
              onStartsOnNewPageChange={(partANewPage) => patch({ partANewPage })}
              afterPartA={
                signaturesApplyAfterPart(settings, 'part_a') ? 'signature' : 'part_b'
              }
              onAfterPartAChange={(afterPartA) => {
                setPartHasSignature('part_a', afterPartA === 'signature')
              }}
              gapAfterAMm={settings.partGapAfterAMm}
              disabled={saveLoading}
              scope={partAPreviewScope}
            />
          </div>
        )

      case 'partB':
        return (
          <div className="space-y-5">
            <PartBPrintPreview
              fontSizePt={settings.baseFontSizePt}
              startsOnNewPage={settings.partBNewPage}
              onStartsOnNewPageChange={(partBNewPage) => patch({ partBNewPage })}
              afterPartB={
                signaturesApplyAfterPart(settings, 'part_b') ? 'signature' : 'part_c'
              }
              onAfterPartBChange={(afterPartB) => {
                setPartHasSignature('part_b', afterPartB === 'signature')
              }}
              gapAfterBMm={settings.partGapAfterBMm}
              disabled={saveLoading}
            />
          </div>
        )

      case 'partC':
        return (
          <div className="space-y-5">
            <PartCPrintPreview
              fontSizePt={settings.tableFontSizePt || settings.baseFontSizePt}
              scope={partCPreviewScope}
              startsOnNewPage={settings.partCNewPage}
              onStartsOnNewPageChange={(partCNewPage) => patch({ partCNewPage })}
              columns={partCColumnsForScope(settings.partCColumns, partCPreviewScope)}
              onColumnsChange={(nextCols) => {
                setSettings((prev) => {
                  const current = parsePartCReportColumnsByScope(prev.partCColumns)
                  return {
                    ...prev,
                    partCColumns: {
                      ...current,
                      [partCPreviewScope]: nextCols,
                    },
                  }
                })
              }}
              showEndNotes={settings.showPartCEndNotes}
              onShowEndNotesChange={(showPartCEndNotes) => patch({ showPartCEndNotes })}
              showSectionRows={settings.showPartCSectionRows}
              onShowSectionRowsChange={(showPartCSectionRows) =>
                patch({ showPartCSectionRows })
              }
              afterPartC={
                signaturesApplyAfterPart(settings, 'part_c') ? 'signature' : 'part_d'
              }
              onAfterPartCChange={(afterPartC) => {
                setPartHasSignature('part_c', afterPartC === 'signature')
              }}
              gapAfterCMm={settings.partGapAfterCMm}
              disabled={saveLoading}
            />
          </div>
        )

      case 'partD':
        return (
          <div className="space-y-5">
            <CheckboxRow
              id="prep-part-d-new"
              label="Part D starts on new page"
              checked={settings.partDNewPage}
              disabled={saveLoading}
              onChange={(partDNewPage) => patch({ partDNewPage })}
            />
          </div>
        )

      case 'signature':
        return (
          <div className="space-y-5">
            <SignaturePrintPreview settings={settings} />

            <label className="flex cursor-pointer items-center gap-2 text-sm text-stone-800">
              <input
                type="checkbox"
                className="rounded-none border-stone-500 text-amber-700 focus:ring-amber-500/30"
                checked={settings.showSignatures}
                disabled={saveLoading}
                onChange={(e) => patch({ showSignatures: e.target.checked })}
              />
              Show signatures on printed / PDF test report
            </label>

            <div className="space-y-3">
              <SignatoriesEditor
                idPrefix="print-sig"
                signatures={settings.signatures}
                users={users}
                usersLoading={usersLoading}
                usersError={usersError}
                disabled={saveLoading}
                onChange={updateSignature}
                onSelectUser={selectSignatureUser}
                onAdd={() => {
                  if (settings.signatures.length === 0) {
                    const signatures = defaultFirstSignatures()
                    patch({
                      signatures,
                      signatureAfterParts: deriveSignatureAfterPartsFromSignatures(signatures),
                    })
                    return
                  }
                  addSignature()
                }}
                onRemove={removeSignature}
              />
            </div>
          </div>
        )

      default:
        return null
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        persistOnFocusLoss
        layer="nested"
        aria-describedby={undefined}
        overlayClassName="lg:inset-y-0 lg:left-[268px] lg:right-0 lg:w-auto"
        className={cn(
          limsDialogClass,
          'left-0 top-0 flex h-[100dvh] max-h-[100dvh] w-full max-w-none translate-x-0 translate-y-0 flex-col gap-0 overflow-hidden p-0',
          'lg:left-[268px] md:h-[100dvh] lg:w-[calc(100vw-268px)] lg:max-w-[calc(100vw-268px)]',
        )}
      >
        <div className="relative shrink-0 overflow-hidden bg-gradient-to-br from-stone-800 via-stone-900 to-stone-950 px-4 py-2.5 text-white">
          <div className="pointer-events-none absolute inset-0 opacity-[0.18]" style={limsDarkBarGlowStyle} />
          <div className="absolute bottom-0 left-0 h-[2px] w-full bg-gradient-to-r from-amber-500 via-amber-300 to-transparent" />
          <DialogHeader className="relative pr-10 text-left">
            <DialogTitle className="text-base font-semibold tracking-tight text-white">
              {activeMeta ? `Print Setting — ${activeMeta.title}` : 'Print Setting'}
            </DialogTitle>
          </DialogHeader>
        </div>

        <div
          className={cn(
            limsRegistryFormClass,
            'min-h-0 flex-1 space-y-5 overflow-y-auto bg-gradient-to-b from-stone-100/90 to-stone-50 px-4 py-4 sm:px-5',
          )}
        >
          {loading ? (
            <p className="text-sm text-stone-600">Loading print settings…</p>
          ) : activeSection == null ? (
            <div className="overflow-hidden border-2 border-stone-500 bg-white shadow-sm ring-1 ring-amber-700/15">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="bg-stone-800 text-left text-[11px] font-bold uppercase tracking-[0.14em] text-amber-200">
                    <th className="w-14 border border-stone-500 px-3 py-2.5">#</th>
                    <th className="border border-stone-500 px-3 py-2.5">Setting</th>
                    <th className="w-36 border border-stone-500 px-3 py-2.5 text-right">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {PRINT_SETTING_SECTIONS.map((section, index) => (
                    <tr
                      key={section.id}
                      className="odd:bg-stone-50 even:bg-white"
                    >
                      <td className="border border-stone-400 px-3 py-2.5 font-semibold text-stone-700">
                        {index + 1}
                      </td>
                      <td className="border border-stone-400 px-3 py-2.5 font-medium text-stone-900">
                        {section.title}
                      </td>
                      <td className="border border-stone-400 px-3 py-2 text-right">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className={cn('gap-1.5', limsOutlineBtnClass)}
                          onClick={() => setActiveSection(section.id)}
                        >
                          <Settings2 size={14} />
                          Setting
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className={cn('gap-1.5', limsOutlineBtnClass)}
                  onClick={() => setActiveSection(null)}
                >
                  <ArrowLeft size={14} />
                  Setting List
                </Button>
                {activeSection === 'partA' ? (
                  <>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className={cn(
                        limsOutlineBtnClass,
                        partAPreviewScope === 'nabl' &&
                          'border-amber-600 bg-amber-50 text-amber-900 hover:bg-amber-100 hover:text-amber-950',
                      )}
                      onClick={() => setPartAPreviewScope('nabl')}
                    >
                      Part A for Accredited
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className={cn(
                        limsOutlineBtnClass,
                        partAPreviewScope === 'non_nabl' &&
                          'border-amber-600 bg-amber-50 text-amber-900 hover:bg-amber-100 hover:text-amber-950',
                      )}
                      onClick={() => setPartAPreviewScope('non_nabl')}
                    >
                      Part A for Non Accredited
                    </Button>
                  </>
                ) : null}
                {activeSection === 'partC' ? (
                  <>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className={cn(
                        limsOutlineBtnClass,
                        partCPreviewScope === 'nabl' &&
                          'border-amber-600 bg-amber-50 text-amber-900 hover:bg-amber-100 hover:text-amber-950',
                      )}
                      onClick={() => setPartCPreviewScope('nabl')}
                    >
                      Part C for Accredited
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className={cn(
                        limsOutlineBtnClass,
                        partCPreviewScope === 'non_nabl' &&
                          'border-amber-600 bg-amber-50 text-amber-900 hover:bg-amber-100 hover:text-amber-950',
                      )}
                      onClick={() => setPartCPreviewScope('non_nabl')}
                    >
                      Part C for Non Accredited
                    </Button>
                  </>
                ) : null}
              </div>
              {renderSectionBody()}
            </div>
          )}

          {message ? (
            <p
              className={
                message.toLowerCase().includes('saved')
                  ? 'border-l-2 border-emerald-700 bg-emerald-50 px-3 py-2 text-sm text-emerald-800'
                  : 'border-l-2 border-destructive bg-destructive/5 px-3 py-2 text-sm text-destructive'
              }
            >
              {message}
            </p>
          ) : null}
        </div>

        <div className="relative shrink-0 border-t border-stone-700 bg-gradient-to-br from-stone-800 via-stone-900 to-stone-950 px-4 py-3">
          <div className="pointer-events-none absolute inset-0 opacity-[0.18]" style={limsDarkBarGlowStyle} />
          <DialogFooter className="relative gap-2 sm:justify-between">
            <PrintSettingsDefaultActions
              disabled={saveLoading || loading}
              onResetToLabDefault={() => {
                void reloadAllDefaults()
              }}
              onResetToFactory={resetToFactory}
              onSetAsDefault={() => {
                void persistAllDefaults(
                  'Saved as lab default (including letterheads). Settings will persist after refresh.',
                )
              }}
            />
            <Button
              type="button"
              className={cn('gap-2', limsPrimaryBtnClass)}
              onClick={handleSave}
              disabled={loading || saveLoading}
            >
              <Save size={16} />
              {saveLoading ? 'Saving…' : 'Save & Close'}
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  )
}

const EMPTY_SIGNATURE: TestReportSignature = {
  roleLabel: '',
  userId: '',
  name: '',
  designation: '',
  department: '',
  enabled: true,
  required: false,
  showAfterParts: defaultSignatureShowAfterParts(),
}

export function TestReportSignatureSettingDialog({
  open,
  onOpenChange,
  controls,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  controls: TestReportPrintSettingsControls
}) {
  const {
    settings,
    setSettings,
    loading,
    saveLoading,
    message,
    save,
    reloadFromLabDefault,
    resetToFactory,
  } = controls
  const [users, setUsers] = useState<ActiveUserProfileOption[]>([])
  const [usersLoading, setUsersLoading] = useState(false)
  const [usersError, setUsersError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setUsersError(null)
    setUsersLoading(true)
    void fetchActiveUserProfiles()
      .then((list) => {
        setUsers(list)
        setSettings((prev) => {
          let changed = false
          const signatures = prev.signatures.map((sig) => {
            if (!sig.userId.trim()) return sig
            const user = list.find((u) => u.id === sig.userId)
            if (!user) return sig
            const nextDept = user.departmentName ?? ''
            const nextDesig = user.designation ?? ''
            if (
              (sig.department || '') === nextDept &&
              (sig.designation || '') === nextDesig &&
              (sig.name || '') === (user.name || sig.name)
            ) {
              return sig
            }
            changed = true
            return {
              ...sig,
              name: user.name || sig.name,
              designation: nextDesig || sig.designation,
              department: nextDept,
            }
          })
          return changed ? { ...prev, signatures } : prev
        })
      })
      .catch((err) => {
        setUsers([])
        setUsersError(err instanceof Error ? err.message : 'Unable to load users')
      })
      .finally(() => setUsersLoading(false))
  }, [open, setSettings])

  const patch = (partial: Partial<TestReportPrintSettings>) =>
    setSettings((prev) => ({ ...prev, ...partial }))

  const updateSignature = (index: number, partial: Partial<TestReportSignature>) => {
    setSettings((prev) => {
      const signatures = prev.signatures.map((sig, i) =>
        i === index ? { ...sig, ...partial } : sig,
      )
      return {
        ...prev,
        signatures,
        signatureAfterParts: deriveSignatureAfterPartsFromSignatures(signatures),
      }
    })
  }

  const selectSignatureUser = (index: number, userId: string) => {
    if (!userId || userId === '__none__') {
      updateSignature(index, { userId: '', name: '', designation: '', department: '' })
      return
    }
    const user = users.find((u) => u.id === userId)
    updateSignature(index, {
      userId,
      name: user?.name ?? '',
      designation: user?.designation ?? '',
      department: user?.departmentName ?? '',
    })
  }

  const addSignature = () => {
    if (settings.signatures.length >= MAX_TEST_REPORT_SIGNATURES) return
    const signatures = [...settings.signatures, { ...EMPTY_SIGNATURE }]
    patch({
      signatures,
      signatureAfterParts: deriveSignatureAfterPartsFromSignatures(signatures),
    })
  }

  const removeSignature = (index: number) => {
    const signatures =
      settings.signatures.length <= 1
        ? [{ ...EMPTY_SIGNATURE, roleLabel: 'Tested By' }]
        : settings.signatures.filter((_, i) => i !== index)
    patch({
      signatures,
      signatureAfterParts: deriveSignatureAfterPartsFromSignatures(signatures),
    })
  }

  const setPartHasSignature = (
    part: 'part_a' | 'part_b' | 'part_c' | 'part_d',
    enabled: boolean,
  ) => {
    setSettings((prev) => {
      const signatures = mapSignaturesShowAfterPart(prev.signatures, part, enabled)
      return {
        ...prev,
        showSignatures: enabled ? true : prev.showSignatures,
        signatures,
        signatureAfterParts: deriveSignatureAfterPartsFromSignatures(signatures),
      }
    })
  }

  const handleSave = () => {
    void (async () => {
      const ok = await save()
      if (ok) onOpenChange(false)
    })()
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        persistOnFocusLoss
        layer="nested"
        aria-describedby={undefined}
        overlayClassName="lg:inset-y-0 lg:left-[268px] lg:right-0 lg:w-auto"
        className={cn(
          limsDialogClass,
          'flex max-h-[90vh] max-w-2xl flex-col',
          'lg:left-[calc(268px+(100vw-268px)/2)] md:top-1/2 md:-translate-x-1/2 md:-translate-y-1/2',
        )}
      >
        <div className="relative shrink-0 overflow-hidden bg-gradient-to-br from-stone-800 via-stone-900 to-stone-950 px-4 py-2.5 text-white">
          <div className="pointer-events-none absolute inset-0 opacity-[0.18]" style={limsDarkBarGlowStyle} />
          <div className="absolute bottom-0 left-0 h-[2px] w-full bg-gradient-to-r from-amber-500 via-amber-300 to-transparent" />
          <DialogHeader className="relative pr-10 text-left">
            <DialogTitle className="text-base font-semibold tracking-tight text-white">
              Report Signatures
            </DialogTitle>
          </DialogHeader>
        </div>

        <div
          className={cn(
            limsRegistryFormClass,
            'min-h-0 flex-1 space-y-5 overflow-y-auto bg-gradient-to-b from-stone-100/90 to-stone-50 px-4 py-4 sm:px-5',
          )}
        >
          {loading ? (
            <p className="text-sm text-stone-600">Loading signature settings…</p>
          ) : (
            <div className="space-y-5">
              <SignaturePrintPreview settings={settings} />

              <label className="flex cursor-pointer items-center gap-2 text-sm text-stone-800">
                <input
                  type="checkbox"
                  className="rounded-none border-stone-500 text-amber-700 focus:ring-amber-500/30"
                  checked={settings.showSignatures}
                  disabled={saveLoading}
                  onChange={(e) => patch({ showSignatures: e.target.checked })}
                />
                Show signatures on printed / PDF test report
              </label>

              <div className="space-y-3">
                <SignatoriesEditor
                  idPrefix="prep-sig"
                  signatures={settings.signatures}
                  users={users}
                  usersLoading={usersLoading}
                  usersError={usersError}
                  disabled={saveLoading}
                  onChange={updateSignature}
                  onSelectUser={selectSignatureUser}
                  onAdd={() => {
                    if (settings.signatures.length === 0) {
                      const signatures = defaultFirstSignatures()
                      patch({
                        signatures,
                        signatureAfterParts: deriveSignatureAfterPartsFromSignatures(signatures),
                      })
                      return
                    }
                    addSignature()
                  }}
                  onRemove={removeSignature}
                />
              </div>
            </div>
          )}

          {message ? (
            <p
              className={
                message.toLowerCase().includes('saved')
                  ? 'border-l-2 border-emerald-700 bg-emerald-50 px-3 py-2 text-sm text-emerald-800'
                  : 'border-l-2 border-destructive bg-destructive/5 px-3 py-2 text-sm text-destructive'
              }
            >
              {message}
            </p>
          ) : null}
        </div>

        <div className="relative shrink-0 border-t border-stone-700 bg-gradient-to-br from-stone-800 via-stone-900 to-stone-950 px-4 py-3">
          <div className="pointer-events-none absolute inset-0 opacity-[0.18]" style={limsDarkBarGlowStyle} />
          <DialogFooter className="relative gap-2 sm:justify-between">
            <PrintSettingsDefaultActions
              disabled={saveLoading || loading}
              onResetToLabDefault={() => {
                void reloadFromLabDefault()
              }}
              onResetToFactory={resetToFactory}
              onSetAsDefault={() => {
                void save({ successMessage: 'Saved as lab default. Settings will persist after refresh.' })
              }}
            />
            <Button
              type="button"
              className={cn('gap-2', limsPrimaryBtnClass)}
              onClick={handleSave}
              disabled={loading || saveLoading}
            >
              <Save size={16} />
              {saveLoading ? 'Saving…' : 'Save & Close'}
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  )
}

export function TestReportPageSettingDialog({
  open,
  onOpenChange,
  controls,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  controls: TestReportPrintSettingsControls
}) {
  const {
    settings,
    setSettings,
    loading,
    saveLoading,
    message,
    save,
    reloadFromLabDefault,
    resetToFactory,
  } = controls

  const patch = (partial: Partial<TestReportPrintSettings>) =>
    setSettings((prev) => ({ ...prev, ...partial }))

  const handleSave = () => {
    void (async () => {
      const ok = await save()
      if (ok) onOpenChange(false)
    })()
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        persistOnFocusLoss
        layer="nested"
        aria-describedby={undefined}
        overlayClassName="lg:inset-y-0 lg:left-[268px] lg:right-0 lg:w-auto"
        className={cn(
          limsDialogClass,
          'left-0 top-0 flex h-[100dvh] max-h-[100dvh] w-full max-w-none translate-x-0 translate-y-0 flex-col gap-0 overflow-hidden p-0',
          'lg:left-[268px] md:h-[100dvh] lg:w-[calc(100vw-268px)] lg:max-w-[calc(100vw-268px)]',
        )}
      >
        <div className="relative shrink-0 overflow-hidden bg-gradient-to-br from-stone-800 via-stone-900 to-stone-950 px-4 py-2.5 text-white">
          <div className="pointer-events-none absolute inset-0 opacity-[0.18]" style={limsDarkBarGlowStyle} />
          <div className="absolute bottom-0 left-0 h-[2px] w-full bg-gradient-to-r from-amber-500 via-amber-300 to-transparent" />
          <DialogHeader className="relative pr-10 text-left">
            <DialogTitle className="text-base font-semibold tracking-tight text-white">
              Page Setting
            </DialogTitle>
          </DialogHeader>
        </div>

        <div
          className={cn(
            limsRegistryFormClass,
            'min-h-0 flex-1 space-y-5 overflow-y-auto bg-gradient-to-b from-stone-100/90 to-stone-50 px-4 py-4 sm:px-5',
          )}
        >
          {loading ? (
            <p className="text-sm text-stone-600">Loading page settings…</p>
          ) : (
            <div className="space-y-5">
              <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[240px_1fr]">
                <TestReportPageMarginPreview
                  settings={settings}
                  onPatch={patch}
                  disabled={saveLoading}
                />
                <div className="min-w-0 space-y-4">
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label>Page size</Label>
                      <Select
                        value={settings.pageSize}
                        onValueChange={(v) => patch({ pageSize: v as PrintPageSize })}
                        disabled={saveLoading}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="A0">A0</SelectItem>
                          <SelectItem value="A1">A1</SelectItem>
                          <SelectItem value="A2">A2</SelectItem>
                          <SelectItem value="A3">A3</SelectItem>
                          <SelectItem value="A4">A4</SelectItem>
                          <SelectItem value="A5">A5</SelectItem>
                          <SelectItem value="A6">A6</SelectItem>
                          <SelectItem value="B4">B4</SelectItem>
                          <SelectItem value="B5">B5</SelectItem>
                          <SelectItem value="Letter">Letter</SelectItem>
                          <SelectItem value="Legal">Legal</SelectItem>
                          <SelectItem value="Tabloid">Tabloid</SelectItem>
                          <SelectItem value="Executive">Executive</SelectItem>
                          <SelectItem value="Custom">Custom</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label>Orientation</Label>
                      <Select
                        value={settings.pageOrientation}
                        onValueChange={(v) =>
                          patch({ pageOrientation: v as PrintPageOrientation })
                        }
                        disabled={saveLoading}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="portrait">Portrait</SelectItem>
                          <SelectItem value="landscape">Landscape</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  {settings.pageSize === 'Custom' ? (
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <NumberField
                        id="prep-custom-page-width"
                        label="Custom width (mm)"
                        value={settings.customPageWidthMm}
                        min={50}
                        max={1500}
                        disabled={saveLoading}
                        onChange={(n) => patch({ customPageWidthMm: n })}
                      />
                      <NumberField
                        id="prep-custom-page-height"
                        label="Custom height (mm)"
                        value={settings.customPageHeightMm}
                        min={50}
                        max={2000}
                        disabled={saveLoading}
                        onChange={(n) => patch({ customPageHeightMm: n })}
                      />
                    </div>
                  ) : null}

                  <div className="space-y-3">
                    <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-amber-800">
                      Page Margins
                    </p>
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                      <NumberField
                        id="prep-hdr-max"
                        label="Header max height"
                        value={settings.headerMaxHeightMm}
                        min={12}
                        max={60}
                        disabled={saveLoading}
                        onChange={(headerMaxHeightMm) =>
                          patch({
                            headerMaxHeightMm,
                            bodyPaddingTopMm: Math.max(
                              settings.bodyPaddingTopMm,
                              headerMaxHeightMm,
                            ),
                          })
                        }
                      />
                      <NumberField
                        id="prep-ftr-max"
                        label="Footer max height"
                        value={settings.footerMaxHeightMm}
                        min={10}
                        max={60}
                        disabled={saveLoading}
                        onChange={(footerMaxHeightMm) =>
                          patch({
                            footerMaxHeightMm,
                            bodyPaddingBottomMm: Math.max(
                              settings.bodyPaddingBottomMm,
                              footerMaxHeightMm,
                            ),
                          })
                        }
                      />
                      <NumberField
                        id="prep-margin-top"
                        label="Top margin"
                        value={settings.bodyPaddingTopMm}
                        min={Math.max(18, settings.headerMaxHeightMm)}
                        max={80}
                        disabled={saveLoading}
                        onChange={(bodyPaddingTopMm) =>
                          patch({
                            bodyPaddingTopMm: Math.max(
                              bodyPaddingTopMm,
                              settings.headerMaxHeightMm,
                            ),
                          })
                        }
                      />
                      <NumberField
                        id="prep-margin-bottom"
                        label="Bottom margin"
                        value={settings.bodyPaddingBottomMm}
                        min={Math.max(16, settings.footerMaxHeightMm)}
                        max={80}
                        disabled={saveLoading}
                        onChange={(bodyPaddingBottomMm) =>
                          patch({
                            bodyPaddingBottomMm: Math.max(
                              bodyPaddingBottomMm,
                              settings.footerMaxHeightMm,
                            ),
                          })
                        }
                      />
                      <NumberField
                        id="prep-margin-left"
                        label="Left margin"
                        value={settings.bodyPaddingLeftMm}
                        min={8}
                        max={25}
                        disabled={saveLoading}
                        onChange={(bodyPaddingLeftMm) => patch({ bodyPaddingLeftMm })}
                      />
                      <NumberField
                        id="prep-margin-right"
                        label="Right margin"
                        value={settings.bodyPaddingRightMm}
                        min={8}
                        max={25}
                        disabled={saveLoading}
                        onChange={(bodyPaddingRightMm) => patch({ bodyPaddingRightMm })}
                      />
                    </div>
                  </div>

                  <div className="space-y-3 border-t border-stone-400 pt-4">
                    <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-amber-800">
                      Page numbering
                    </p>
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <div className="space-y-1.5">
                        <Label htmlFor="prep-page-number-type">Type</Label>
                        <Select
                          value={
                            settings.showPageNumbers ? settings.pageNumberType : 'none'
                          }
                          onValueChange={(value) => {
                            const pageNumberType = value as PageNumberType
                            if (pageNumberType === 'none') {
                              patch({ showPageNumbers: false, pageNumberType: 'none' })
                              return
                            }
                            patch({ showPageNumbers: true, pageNumberType })
                          }}
                          disabled={saveLoading}
                        >
                          <SelectTrigger id="prep-page-number-type">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {PAGE_NUMBER_TYPES.map((type) => (
                              <SelectItem key={type} value={type}>
                                {PAGE_NUMBER_TYPE_LABELS[type]}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="prep-page-number-position">Alignment</Label>
                        <Select
                          value={settings.pageNumberPosition}
                          onValueChange={(value) =>
                            patch({ pageNumberPosition: value as PageNumberPosition })
                          }
                          disabled={saveLoading || !settings.showPageNumbers}
                        >
                          <SelectTrigger id="prep-page-number-position">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {PAGE_NUMBER_POSITIONS.map((position) => (
                              <SelectItem key={position} value={position}>
                                {PAGE_NUMBER_POSITION_LABELS[position]}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-3 border-t border-stone-400 pt-4">
                    <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-amber-800">
                      Border Settings
                    </p>
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <div className="space-y-1.5">
                        <Label htmlFor="prep-page-border-type">Type</Label>
                        <Select
                          value={settings.pageBorderType}
                          onValueChange={(value) =>
                            patch({ pageBorderType: value as PageBorderType })
                          }
                          disabled={saveLoading}
                        >
                          <SelectTrigger id="prep-page-border-type">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {PAGE_BORDER_TYPES.map((type) => (
                              <SelectItem key={type} value={type}>
                                {PAGE_BORDER_TYPE_LABELS[type]}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="prep-page-border-alignment">Alignment</Label>
                        <Select
                          value={settings.pageBorderAlignment}
                          onValueChange={(value) =>
                            patch({ pageBorderAlignment: value as PageBorderAlignment })
                          }
                          disabled={saveLoading || settings.pageBorderType === 'none'}
                        >
                          <SelectTrigger id="prep-page-border-alignment">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {PAGE_BORDER_ALIGNMENTS.map((alignment) => (
                              <SelectItem key={alignment} value={alignment}>
                                {PAGE_BORDER_ALIGNMENT_LABELS[alignment]}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <NumberField
                        id="prep-page-border-gap"
                        label="Gap from page edge (mm)"
                        value={settings.pageBorderGapMm}
                        min={0}
                        max={25}
                        disabled={saveLoading || settings.pageBorderType === 'none'}
                        onChange={(pageBorderGapMm) => patch({ pageBorderGapMm })}
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {message ? (
            <p
              className={
                message.toLowerCase().includes('saved')
                  ? 'border-l-2 border-emerald-700 bg-emerald-50 px-3 py-2 text-sm text-emerald-800'
                  : 'border-l-2 border-destructive bg-destructive/5 px-3 py-2 text-sm text-destructive'
              }
            >
              {message}
            </p>
          ) : null}
        </div>

        <div className="relative shrink-0 border-t border-stone-700 bg-gradient-to-br from-stone-800 via-stone-900 to-stone-950 px-4 py-3">
          <div className="pointer-events-none absolute inset-0 opacity-[0.18]" style={limsDarkBarGlowStyle} />
          <DialogFooter className="relative gap-2 sm:justify-between">
            <PrintSettingsDefaultActions
              disabled={saveLoading || loading}
              onResetToLabDefault={() => {
                void reloadFromLabDefault()
              }}
              onResetToFactory={resetToFactory}
              onSetAsDefault={() => {
                void save({ successMessage: 'Saved as lab default. Settings will persist after refresh.' })
              }}
            />
            <Button
              type="button"
              className={cn('gap-2', limsPrimaryBtnClass)}
              onClick={handleSave}
              disabled={loading || saveLoading}
            >
              <Save size={16} />
              {saveLoading ? 'Saving…' : 'Save & Close'}
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  )
}
