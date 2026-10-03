import {
  DEFAULT_PART_C_REPORT_COLUMNS_BY_SCOPE,
  parsePartCReportColumnsByScope,
  type PartCReportColumnsByScope,
  type PartCReportColumnVisibility,
} from '@/features/sample-handling/report-preparation/partCReportColumns'

export type { PartCReportColumnVisibility, PartCReportColumnsByScope }

/** Common ISO / US paper sizes + Custom (width/height mm). */
export const PRINT_PAGE_SIZE_OPTIONS = [
  'A0',
  'A1',
  'A2',
  'A3',
  'A4',
  'A5',
  'A6',
  'B4',
  'B5',
  'Letter',
  'Legal',
  'Tabloid',
  'Executive',
  'Custom',
] as const

export type PrintPageSize = (typeof PRINT_PAGE_SIZE_OPTIONS)[number]

/** Portrait dimensions in mm for named paper sizes. */
export const PRINT_PAGE_SIZE_MM: Record<
  Exclude<PrintPageSize, 'Custom'>,
  { width: number; height: number }
> = {
  A0: { width: 841, height: 1189 },
  A1: { width: 594, height: 841 },
  A2: { width: 420, height: 594 },
  A3: { width: 297, height: 420 },
  A4: { width: 210, height: 297 },
  A5: { width: 148, height: 210 },
  A6: { width: 105, height: 148 },
  B4: { width: 250, height: 353 },
  B5: { width: 176, height: 250 },
  Letter: { width: 216, height: 279 },
  Legal: { width: 216, height: 356 },
  Tabloid: { width: 279, height: 432 },
  Executive: { width: 184, height: 267 },
}

/** CSS @page keywords that browsers understand reliably. */
const CSS_PAGE_SIZE_KEYWORDS = new Set<string>(['A3', 'A4', 'A5', 'Letter', 'Legal'])

export function parsePrintPageSize(raw: unknown): PrintPageSize {
  const value = String(raw ?? '').trim()
  if ((PRINT_PAGE_SIZE_OPTIONS as readonly string[]).includes(value)) {
    return value as PrintPageSize
  }
  return 'Letter'
}

export type PrintPageOrientation = 'portrait' | 'landscape'

export function parsePrintPageOrientation(raw: unknown): PrintPageOrientation {
  return String(raw ?? '').trim().toLowerCase() === 'landscape' ? 'landscape' : 'portrait'
}

export function resolvePrintPageSizeMm(settings: {
  pageSize: PrintPageSize
  pageOrientation?: PrintPageOrientation
  customPageWidthMm?: number
  customPageHeightMm?: number
}): { width: number; height: number } {
  let width: number
  let height: number
  if (settings.pageSize === 'Custom') {
    const w = Number(settings.customPageWidthMm)
    const h = Number(settings.customPageHeightMm)
    width = Number.isFinite(w) ? Math.min(1500, Math.max(50, w)) : 216
    height = Number.isFinite(h) ? Math.min(2000, Math.max(50, h)) : 279
  } else {
    ;({ width, height } = PRINT_PAGE_SIZE_MM[settings.pageSize])
  }
  if (settings.pageOrientation === 'landscape') {
    return { width: height, height: width }
  }
  return { width, height }
}

/** Value for CSS `@page { size: … }` */
export function cssPageSizeValue(settings: {
  pageSize: PrintPageSize
  pageOrientation?: PrintPageOrientation
  customPageWidthMm?: number
  customPageHeightMm?: number
}): string {
  const orientation = settings.pageOrientation === 'landscape' ? 'landscape' : 'portrait'
  if (settings.pageSize !== 'Custom' && CSS_PAGE_SIZE_KEYWORDS.has(settings.pageSize)) {
    return `${settings.pageSize} ${orientation}`
  }
  const { width, height } = resolvePrintPageSizeMm(settings)
  return `${width}mm ${height}mm`
}

export type PdfOutputMode = 'browser_print' | 'playwright'

/** Preset font stacks for test report / SRF print (web-safe for browser print & PDF). */
export const PRINT_FONT_FAMILY_OPTIONS: ReadonlyArray<{ label: string; value: string }> = [
  { label: 'System UI', value: 'system-ui, sans-serif' },
  { label: 'Segoe UI', value: '"Segoe UI", system-ui, sans-serif' },
  { label: 'Arial', value: 'Arial, Helvetica, sans-serif' },
  { label: 'Helvetica', value: 'Helvetica, Arial, sans-serif' },
  { label: 'Calibri', value: 'Calibri, "Segoe UI", Arial, sans-serif' },
  { label: 'Tahoma', value: 'Tahoma, Geneva, sans-serif' },
  { label: 'Verdana', value: 'Verdana, Geneva, sans-serif' },
  { label: 'Roboto', value: 'Roboto, Arial, sans-serif' },
  { label: 'Times New Roman', value: '"Times New Roman", Times, serif' },
  { label: 'Georgia', value: 'Georgia, "Times New Roman", serif' },
  { label: 'Courier New', value: '"Courier New", Courier, monospace' },
]

export function printFontFamilyOptions(currentValue?: string): Array<{ label: string; value: string }> {
  const trimmed = (currentValue ?? '').trim()
  if (!trimmed || PRINT_FONT_FAMILY_OPTIONS.some((o) => o.value === trimmed)) {
    return [...PRINT_FONT_FAMILY_OPTIONS]
  }
  const short =
    trimmed.length > 36 ? `${trimmed.slice(0, 33)}…` : trimmed
  return [...PRINT_FONT_FAMILY_OPTIONS, { label: `Custom (${short})`, value: trimmed }]
}

export const TEST_REPORT_SIGNATURE_ROLE_OPTIONS = [
  'Tested By',
  'Reviewed By',
  'Authorized By',
  'Approved By',
  'Checked By',
] as const

export type TestReportSignatureRoleLabel = (typeof TEST_REPORT_SIGNATURE_ROLE_OPTIONS)[number]

export const TEST_REPORT_SIGNATURE_PART_IDS = [
  'part_a',
  'part_b',
  'part_c',
  'part_d',
] as const

export type TestReportSignatureAfterPart = (typeof TEST_REPORT_SIGNATURE_PART_IDS)[number]

export const TEST_REPORT_SIGNATURE_PART_LABELS: Record<TestReportSignatureAfterPart, string> = {
  part_a: 'Part A',
  part_b: 'Part B',
  part_c: 'Part C',
  part_d: 'Part D',
}

export const MAX_TEST_REPORT_SIGNATURES = 6

const SIGNATURE_PART_ORDER: Record<TestReportSignatureAfterPart, number> = {
  part_a: 0,
  part_b: 1,
  part_c: 2,
  part_d: 3,
}

export function defaultSignatureShowAfterParts(): TestReportSignatureAfterPart[] {
  return ['part_d']
}

export function normalizeSignatureShowAfterParts(
  raw: unknown,
  fallback: TestReportSignatureAfterPart[] = defaultSignatureShowAfterParts(),
): TestReportSignatureAfterPart[] {
  if (!Array.isArray(raw)) {
    return [...fallback]
  }
  if (raw.length === 0) {
    return []
  }
  const allowed = new Set<string>(TEST_REPORT_SIGNATURE_PART_IDS)
  const parts = raw
    .map((v) => String(v).trim())
    .filter((id): id is TestReportSignatureAfterPart => allowed.has(id))
  if (parts.length === 0) return [...fallback]
  return [...new Set(parts)].sort((a, b) => SIGNATURE_PART_ORDER[a] - SIGNATURE_PART_ORDER[b])
}

export type TestReportSignature = {
  /** Label shown above signatory, e.g. Tested By / Reviewed By */
  roleLabel: string
  /** Linked User Management profile id (optional) */
  userId: string
  name: string
  designation: string
  /** Department from User Management (auto-filled with person) */
  department: string
  /** Include this signature line on print / PDF (Select box) */
  enabled: boolean
  /** Mark as required for report issue workflow */
  required: boolean
  /** Which report parts this signature appears after (A/B/C/D) */
  showAfterParts: TestReportSignatureAfterPart[]
}

/** @page margin box for printed page numbers */
export const PAGE_NUMBER_POSITIONS = [
  'top-left',
  'top-center',
  'top-right',
  'bottom-left',
  'bottom-center',
  'bottom-right',
] as const

export type PageNumberPosition = (typeof PAGE_NUMBER_POSITIONS)[number]

export const PAGE_NUMBER_POSITION_LABELS: Record<PageNumberPosition, string> = {
  'top-left': 'Top Left',
  'top-center': 'Top Centre',
  'top-right': 'Top Right',
  'bottom-left': 'Bottom Left',
  'bottom-center': 'Bottom Centre',
  'bottom-right': 'Bottom Right',
}

export function parsePageNumberPosition(raw: unknown): PageNumberPosition {
  const value = String(raw ?? '').trim()
  if ((PAGE_NUMBER_POSITIONS as readonly string[]).includes(value)) {
    return value as PageNumberPosition
  }
  return 'bottom-center'
}

/** Printed page-number text format (`none` = hide page numbers) */
export const PAGE_NUMBER_TYPES = ['none', 'page_of', 'of', 'slash', 'number'] as const

export type PageNumberType = (typeof PAGE_NUMBER_TYPES)[number]

export const PAGE_NUMBER_TYPE_LABELS: Record<PageNumberType, string> = {
  none: 'None',
  page_of: 'Page 01 of 05',
  of: '01 of 05',
  slash: '01/05',
  number: '01',
}

export function parsePageNumberType(raw: unknown): PageNumberType {
  const value = String(raw ?? '').trim()
  if ((PAGE_NUMBER_TYPES as readonly string[]).includes(value)) {
    return value as PageNumberType
  }
  return 'page_of'
}

/** CSS `content` value for @page margin page numbers */
export function pageNumberCssContent(type: PageNumberType): string {
  switch (type) {
    case 'none':
      return '""'
    case 'of':
      return 'counter(page, decimal-leading-zero) " of " counter(pages, decimal-leading-zero)'
    case 'slash':
      return 'counter(page, decimal-leading-zero) "/" counter(pages, decimal-leading-zero)'
    case 'number':
      return 'counter(page, decimal-leading-zero)'
    case 'page_of':
    default:
      return '"Page " counter(page, decimal-leading-zero) " of " counter(pages, decimal-leading-zero)'
  }
}

export function pageNumberPreviewSample(type: PageNumberType): string {
  if (type === 'none') return ''
  return PAGE_NUMBER_TYPE_LABELS[type] ?? PAGE_NUMBER_TYPE_LABELS.page_of
}

/** Visible label for paginated preview/print sheets (CSS counters do not run on-screen). */
export function formatSheetPageNumber(
  type: PageNumberType,
  pageIndex: number,
  totalPages: number,
): string {
  if (type === 'none' || totalPages < 1 || pageIndex < 1) return ''
  const n = String(pageIndex).padStart(2, '0')
  const t = String(totalPages).padStart(2, '0')
  switch (type) {
    case 'of':
      return `${n} of ${t}`
    case 'slash':
      return `${n}/${t}`
    case 'number':
      return n
    case 'page_of':
    default:
      return `Page ${n} of ${t}`
  }
}

/** Page content border style */
export const PAGE_BORDER_TYPES = [
  'none',
  'solid',
  'dashed',
  'dotted',
  'double',
  'thick',
  'groove',
  'ridge',
  'inset',
  'outset',
] as const

export type PageBorderType = (typeof PAGE_BORDER_TYPES)[number]

export const PAGE_BORDER_TYPE_LABELS: Record<PageBorderType, string> = {
  none: 'None',
  solid: 'Solid',
  dashed: 'Dashed',
  dotted: 'Dotted',
  double: 'Double',
  thick: 'Thick solid',
  groove: 'Groove',
  ridge: 'Ridge',
  inset: 'Inset',
  outset: 'Outset',
}

export function parsePageBorderType(raw: unknown): PageBorderType {
  const value = String(raw ?? '').trim()
  if ((PAGE_BORDER_TYPES as readonly string[]).includes(value)) {
    return value as PageBorderType
  }
  return 'none'
}

/**
 * Where the page border is drawn relative to letterhead zones.
 * - full_page: whole printable area (header + body + footer)
 * - cover_header: header + body (exclude footer)
 * - cover_footer: body + footer (exclude header)
 * - exclude_header_footer: report body only
 * - sides_only: left + right edges only (full height of alignment zone)
 * - top_bottom_only: top + bottom edges only (full width)
 */
export const PAGE_BORDER_ALIGNMENTS = [
  'full_page',
  'cover_header',
  'cover_footer',
  'exclude_header_footer',
  'sides_only',
  'top_bottom_only',
] as const

export type PageBorderAlignment = (typeof PAGE_BORDER_ALIGNMENTS)[number]

export const PAGE_BORDER_ALIGNMENT_LABELS: Record<PageBorderAlignment, string> = {
  full_page: 'Full Page',
  cover_header: 'Include Header (exclude Footer)',
  cover_footer: 'Include Footer (exclude Header)',
  exclude_header_footer: 'Body Only (exclude Header & Footer)',
  sides_only: 'Left & Right Sides Only',
  top_bottom_only: 'Top & Bottom Only',
}

export function parsePageBorderAlignment(raw: unknown): PageBorderAlignment {
  const value = String(raw ?? '').trim()
  if ((PAGE_BORDER_ALIGNMENTS as readonly string[]).includes(value)) {
    return value as PageBorderAlignment
  }
  return 'exclude_header_footer'
}

export type PrintHeaderAlign = 'left' | 'center' | 'right'

export const PRINT_HEADER_ALIGN_OPTIONS: ReadonlyArray<{
  value: PrintHeaderAlign
  label: string
}> = [
  { value: 'left', label: 'Left' },
  { value: 'center', label: 'Center' },
  { value: 'right', label: 'Right' },
]

export function parsePrintHeaderAlign(raw: unknown): PrintHeaderAlign {
  const v = String(raw ?? '').trim().toLowerCase()
  if (v === 'left' || v === 'right' || v === 'center') return v
  return 'center'
}

export type PrintHeaderImageFit = 'contain' | 'cover' | 'fill'

export const PRINT_HEADER_IMAGE_FIT_OPTIONS: ReadonlyArray<{
  value: PrintHeaderImageFit
  label: string
}> = [
  { value: 'contain', label: 'Fit (keep aspect)' },
  { value: 'cover', label: 'Cover (crop edges)' },
  { value: 'fill', label: 'Stretch to fill' },
]

export function parsePrintHeaderImageFit(raw: unknown): PrintHeaderImageFit {
  const v = String(raw ?? '').trim().toLowerCase()
  if (v === 'cover' || v === 'fill' || v === 'contain') return v
  return 'contain'
}

export function pageBorderCssStyle(type: PageBorderType): string {
  switch (type) {
    case 'solid':
      return '1px solid #1c1917'
    case 'dashed':
      return '1px dashed #1c1917'
    case 'dotted':
      return '1px dotted #1c1917'
    case 'double':
      return '3px double #1c1917'
    case 'thick':
      return '2.5px solid #1c1917'
    case 'groove':
      return '3px groove #1c1917'
    case 'ridge':
      return '3px ridge #1c1917'
    case 'inset':
      return '3px inset #1c1917'
    case 'outset':
      return '3px outset #1c1917'
    case 'none':
    default:
      return 'none'
  }
}

/** Border sides for alignment modes that omit top/bottom or left/right. */
export function pageBorderCssDeclaration(
  type: PageBorderType,
  alignment: PageBorderAlignment,
): string {
  const style = pageBorderCssStyle(type)
  if (style === 'none') return 'border: none;'
  if (alignment === 'sides_only') {
    return `border-left: ${style}; border-right: ${style}; border-top: none; border-bottom: none;`
  }
  if (alignment === 'top_bottom_only') {
    return `border-top: ${style}; border-bottom: ${style}; border-left: none; border-right: none;`
  }
  return `border: ${style};`
}

/**
 * Fixed-position insets (mm) for the decorative page border box.
 * Vertical alignment uses page margins (body padding) so the border sits on the
 * report-body edge and does not cut through letterhead header/footer zones.
 * Gap insets further from those edges.
 */
export function resolvePageBorderInsets(settings: {
  pageBorderType: PageBorderType
  pageBorderAlignment: PageBorderAlignment
  pageBorderGapMm: number
  headerMaxHeightMm: number
  footerMaxHeightMm: number
  bodyPaddingTopMm?: number
  bodyPaddingBottomMm?: number
  bodyPaddingLeftMm?: number
  bodyPaddingRightMm?: number
}): { topMm: number; rightMm: number; bottomMm: number; leftMm: number } | null {
  if (settings.pageBorderType === 'none') return null

  const gap = Math.max(0, Math.min(25, Number(settings.pageBorderGapMm) || 0))
  const topMargin = Math.max(
    0,
    Number(settings.bodyPaddingTopMm ?? settings.headerMaxHeightMm) || 0,
  )
  const bottomMargin = Math.max(
    0,
    Number(settings.bodyPaddingBottomMm ?? settings.footerMaxHeightMm) || 0,
  )
  const leftMargin = Math.max(0, Number(settings.bodyPaddingLeftMm) || 0)
  const rightMargin = Math.max(0, Number(settings.bodyPaddingRightMm) || 0)

  let topMm = 0
  let bottomMm = 0
  let leftMm = leftMargin
  let rightMm = rightMargin
  const alignment = settings.pageBorderAlignment

  // sides_only / top_bottom_only still use full_page vertical span by default
  const verticalMode =
    alignment === 'sides_only' || alignment === 'top_bottom_only' ? 'full_page' : alignment

  switch (verticalMode) {
    case 'cover_header':
      // Header + body; stop above footer margin
      bottomMm = bottomMargin
      break
    case 'cover_footer':
      // Body + footer; start below header margin
      topMm = topMargin
      break
    case 'exclude_header_footer':
      // Report body only — do not cut header/footer letterhead zones
      topMm = topMargin
      bottomMm = bottomMargin
      break
    case 'full_page':
    default:
      leftMm = 0
      rightMm = 0
      break
  }

  // Full-page / cover modes that reach the sheet edge still respect side margins
  // when excluding a letterhead zone on one side only is not enough — sides always
  // follow left/right page margins so the border frames the printable column.
  if (verticalMode === 'cover_header' || verticalMode === 'cover_footer') {
    leftMm = leftMargin
    rightMm = rightMargin
  }

  return {
    topMm: topMm + gap,
    rightMm: rightMm + gap,
    bottomMm: bottomMm + gap,
    leftMm: leftMm + gap,
  }
}

export type TestReportPrintSettings = {
  pageSize: PrintPageSize
  pageOrientation: PrintPageOrientation
  /** Used when pageSize is Custom (portrait sheet width). */
  customPageWidthMm: number
  /** Used when pageSize is Custom (portrait sheet height). */
  customPageHeightMm: number
  bodyPaddingTopMm: number
  bodyPaddingBottomMm: number
  bodyPaddingLeftMm: number
  bodyPaddingRightMm: number
  headerMaxHeightMm: number
  footerMaxHeightMm: number
  fontFamily: string
  baseFontSizePt: number
  titleFontSizePt: number
  lineHeight: number
  /** @deprecated Use partGapAfterAMm/B/C — kept for presets & title spacing */
  partGapMm: number
  partGapAfterAMm: number
  partGapAfterBMm: number
  partGapAfterCMm: number
  tableCellPaddingPx: number
  showPartFrames: boolean
  partBNewPage: boolean
  partCNewPage: boolean
  partDNewPage: boolean
  showWatermark: boolean
  pdfOutputMode: PdfOutputMode
  /** Which Part C table columns appear in printed / PDF report (per NABL / Non-NABL) */
  partCColumns: PartCReportColumnsByScope
  /** Show signature block at end of printed / PDF test report */
  showSignatures: boolean
  /** Signatory name + designation rows (up to {@link MAX_TEST_REPORT_SIGNATURES}) */
  signatures: TestReportSignature[]
  /** Report parts after which signatures are printed */
  signatureAfterParts: TestReportSignatureAfterPart[]
  /** Show "Page 01 of 05" on every printed page */
  showPageNumbers: boolean
  /** Format of the page number text */
  pageNumberType: PageNumberType
  /** Placement of page numbers in the page margin */
  pageNumberPosition: PageNumberPosition
  /** Outer content border style */
  pageBorderType: PageBorderType
  /** Which vertical zones the border covers */
  pageBorderAlignment: PageBorderAlignment
  /** Inset (mm) of the decorative border from the page / zone edges */
  pageBorderGapMm: number
  /** Print letterhead header block (template chosen per scope in Results section) */
  showPrintHeader: boolean
  /** Stretch letterhead to full page width (ignore side margins) */
  headerFitToPageWidth: boolean
  /** Extra gap (mm) below the header image before report body */
  headerMarginBelowMm: number
  /** Horizontal alignment of header image / fallback text */
  headerAlign: PrintHeaderAlign
  /** How the letterhead image scales inside the header zone */
  headerImageFit: PrintHeaderImageFit
  /** Print letterhead footer image */
  showPrintFooter: boolean
  /** Stretch footer letterhead to full page width (ignore side margins) */
  footerFitToPageWidth: boolean
  /** Extra gap (mm) above the footer image before page bottom edge padding */
  footerMarginAboveMm: number
  /** Horizontal alignment of footer image */
  footerAlign: PrintHeaderAlign
  /** How the letterhead image scales inside the footer zone */
  footerImageFit: PrintHeaderImageFit
  /** Show centred "** Test Report **" title above Part A */
  showReportTitle: boolean
  /** Show Terms & Conditions block from letterhead template */
  showTermsAndConditions: boolean
  /** Show Part C end marker and standard end notes */
  showPartCEndNotes: boolean
  /** Show "Section Code - …" rows in Part C table */
  showPartCSectionRows: boolean
  /** Part A starts on a new page (after title) */
  partANewPage: boolean
  /** Part C table font size (pt); falls back to base font when unset */
  tableFontSizePt: number
}

/** Sample Receiving Form (SRF) list print — layout + letterhead/footer template names. */
export type SrfPrintSettings = {
  pageSize: PrintPageSize
  pageOrientation: PrintPageOrientation
  customPageWidthMm: number
  customPageHeightMm: number
  pdfOutputMode: PdfOutputMode
  bodyPaddingTopMm: number
  bodyPaddingBottomMm: number
  bodyPaddingHorizontalMm: number
  headerMaxHeightMm: number
  footerMaxHeightMm: number
  fontFamily: string
  baseFontSizePt: number
  showHeader: boolean
  showFooter: boolean
  /** Title of header template from Lab Settings → Letter Head. */
  headerTemplateName: string
  /** Title of footer template from Lab Settings → Letter Head. */
  footerTemplateName: string
}

export type LabPrintSettingsDocument = {
  testReport: TestReportPrintSettings
  srf: SrfPrintSettings
}

export const DEFAULT_TEST_REPORT_SIGNATURES: TestReportSignature[] = [
  {
    roleLabel: 'Tested By',
    userId: '',
    name: '',
    designation: '',
    department: '',
    enabled: true,
    required: true,
    showAfterParts: defaultSignatureShowAfterParts(),
  },
  {
    roleLabel: 'Reviewed By',
    userId: '',
    name: '',
    designation: '',
    department: '',
    enabled: true,
    required: true,
    showAfterParts: defaultSignatureShowAfterParts(),
  },
  {
    roleLabel: 'Authorized By',
    userId: '',
    name: '',
    designation: '',
    department: '',
    enabled: true,
    required: true,
    showAfterParts: defaultSignatureShowAfterParts(),
  },
]

const DEFAULT_SIGNATURE_ROLE_BY_INDEX = [
  'Tested By',
  'Reviewed By',
  'Authorized By',
  'Approved By',
  'Checked By',
] as const

function defaultSignatureRoleLabel(index: number): string {
  return DEFAULT_SIGNATURE_ROLE_BY_INDEX[index] ?? ''
}

export function defaultSignatureAfterParts(): TestReportSignatureAfterPart[] {
  return [...TEST_REPORT_SIGNATURE_PART_IDS]
}

export function parseSignatureAfterParts(raw: unknown): TestReportSignatureAfterPart[] {
  if (raw === undefined || raw === null) {
    return defaultSignatureAfterParts()
  }
  if (!Array.isArray(raw)) {
    return defaultSignatureAfterParts()
  }
  if (raw.length === 0) {
    return []
  }

  const allowed = new Set<string>(TEST_REPORT_SIGNATURE_PART_IDS)
  const parts = raw
    .map((v) => String(v).trim())
    .filter((id): id is TestReportSignatureAfterPart => allowed.has(id))

  return parts.length > 0
    ? [...new Set(parts)].sort((a, b) => SIGNATURE_PART_ORDER[a] - SIGNATURE_PART_ORDER[b])
    : []
}

export function isAllSignaturePartsSelected(parts: TestReportSignatureAfterPart[]): boolean {
  const normalized = new Set(parts)
  return TEST_REPORT_SIGNATURE_PART_IDS.every((part) => normalized.has(part))
}

/** Union of all signatory showAfterParts (kept for soft-compat with older settings). */
export function deriveSignatureAfterPartsFromSignatures(
  signatures: TestReportSignature[],
): TestReportSignatureAfterPart[] {
  const set = new Set<TestReportSignatureAfterPart>()
  for (const sig of signatures) {
    for (const part of sig.showAfterParts ?? []) {
      set.add(part)
    }
  }
  return TEST_REPORT_SIGNATURE_PART_IDS.filter((part) => set.has(part))
}

export function visibleTestReportSignatures(
  settings: Pick<TestReportPrintSettings, 'showSignatures' | 'signatures'>,
): TestReportSignature[] {
  if (!settings.showSignatures) return []
  return settings.signatures.filter(
    (s) =>
      s.enabled !== false &&
      Boolean(s.required) &&
      (s.name.trim() || s.designation.trim()),
  )
}

/** Designation line for print/preview (department is not shown on the signature line). */
export function formatSignatureDesignationLine(
  sig: Pick<TestReportSignature, 'designation' | 'department'>,
): string {
  const designation = (sig.designation ?? '').trim()
  return designation || '—'
}

/** Visible signatures that should print after a given part. */
export function signaturesForPart(
  settings: Pick<TestReportPrintSettings, 'showSignatures' | 'signatures'>,
  part: TestReportSignatureAfterPart,
): TestReportSignature[] {
  return visibleTestReportSignatures(settings).filter((s) =>
    (s.showAfterParts ?? []).includes(part),
  )
}

export function signaturesApplyAfterPart(
  settings: Pick<TestReportPrintSettings, 'showSignatures' | 'signatures' | 'signatureAfterParts'>,
  part: TestReportSignatureAfterPart,
): boolean {
  if (!settings.showSignatures) return false
  return signaturesForPart(settings, part).length > 0
}

/** Add or remove a part from every signatory's showAfterParts (Part preview toggles). */
export function mapSignaturesShowAfterPart(
  signatures: TestReportSignature[],
  part: TestReportSignatureAfterPart,
  enabled: boolean,
): TestReportSignature[] {
  return signatures.map((sig) => {
    const current = new Set(
      normalizeSignatureShowAfterParts(sig.showAfterParts, defaultSignatureShowAfterParts()),
    )
    if (enabled) current.add(part)
    else current.delete(part)
    return {
      ...sig,
      showAfterParts: TEST_REPORT_SIGNATURE_PART_IDS.filter((id) => current.has(id)),
    }
  })
}

export function effectiveTableFontSizePt(settings: TestReportPrintSettings): number {
  const table = settings.tableFontSizePt
  if (Number.isFinite(table) && table >= 8 && table <= 14) return table
  return settings.baseFontSizePt
}

export const DEFAULT_TEST_REPORT_PRINT_SETTINGS: TestReportPrintSettings = {
  pageSize: 'Letter',
  pageOrientation: 'portrait',
  customPageWidthMm: 216,
  customPageHeightMm: 279,
  bodyPaddingTopMm: 36,
  bodyPaddingBottomMm: 28,
  bodyPaddingLeftMm: 12,
  bodyPaddingRightMm: 12,
  headerMaxHeightMm: 32,
  footerMaxHeightMm: 22,
  fontFamily: 'system-ui, sans-serif',
  baseFontSizePt: 10,
  titleFontSizePt: 22,
  lineHeight: 1.4,
  partGapMm: 10,
  partGapAfterAMm: 10,
  partGapAfterBMm: 10,
  partGapAfterCMm: 10,
  tableCellPaddingPx: 6,
  showPartFrames: true,
  partBNewPage: true,
  partCNewPage: true,
  partDNewPage: true,
  showWatermark: true,
  pdfOutputMode: 'playwright',
  partCColumns: {
    nabl: { ...DEFAULT_PART_C_REPORT_COLUMNS_BY_SCOPE.nabl },
    non_nabl: { ...DEFAULT_PART_C_REPORT_COLUMNS_BY_SCOPE.non_nabl },
  },
  showSignatures: true,
  signatures: DEFAULT_TEST_REPORT_SIGNATURES.map((s) => ({
    ...s,
    showAfterParts: [...s.showAfterParts],
  })),
  signatureAfterParts: deriveSignatureAfterPartsFromSignatures(DEFAULT_TEST_REPORT_SIGNATURES),
  showPageNumbers: true,
  pageNumberType: 'page_of',
  pageNumberPosition: 'bottom-center',
  pageBorderType: 'none',
  pageBorderAlignment: 'exclude_header_footer',
  pageBorderGapMm: 0,
  showPrintHeader: true,
  headerFitToPageWidth: true,
  headerMarginBelowMm: 2,
  headerAlign: 'center',
  headerImageFit: 'contain',
  showPrintFooter: true,
  footerFitToPageWidth: true,
  footerMarginAboveMm: 2,
  footerAlign: 'center',
  footerImageFit: 'contain',
  showReportTitle: true,
  showTermsAndConditions: true,
  showPartCEndNotes: true,
  showPartCSectionRows: true,
  partANewPage: false,
  tableFontSizePt: 10,
}

export const DEFAULT_SRF_PRINT_SETTINGS: SrfPrintSettings = {
  pageSize: 'Letter',
  pageOrientation: 'portrait',
  customPageWidthMm: 216,
  customPageHeightMm: 279,
  bodyPaddingTopMm: 32,
  bodyPaddingBottomMm: 22,
  bodyPaddingHorizontalMm: 12,
  headerMaxHeightMm: 26,
  footerMaxHeightMm: 18,
  fontFamily: 'system-ui, sans-serif',
  baseFontSizePt: 10,
  showHeader: true,
  showFooter: true,
  headerTemplateName: '',
  footerTemplateName: '',
  pdfOutputMode: 'playwright',
}

export const DEFAULT_LAB_PRINT_SETTINGS: LabPrintSettingsDocument = {
  testReport: DEFAULT_TEST_REPORT_PRINT_SETTINGS,
  srf: DEFAULT_SRF_PRINT_SETTINGS,
}

function clamp(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min
  return Math.min(max, Math.max(min, n))
}

function asBool(v: unknown, fallback: boolean): boolean {
  return typeof v === 'boolean' ? v : fallback
}

export function parseTestReportSignatures(
  raw: unknown,
  fallbackShowAfterParts: TestReportSignatureAfterPart[] = defaultSignatureShowAfterParts(),
): TestReportSignature[] {
  if (!Array.isArray(raw)) {
    return DEFAULT_TEST_REPORT_SIGNATURES.map((s) => ({ ...s }))
  }

  const fallback = normalizeSignatureShowAfterParts(fallbackShowAfterParts)

  const parsed = raw
    .filter((item) => item && typeof item === 'object')
    .map((item, index) => {
      const o = item as Record<string, unknown>
      const roleLabel =
        typeof o.roleLabel === 'string' && o.roleLabel.trim()
          ? o.roleLabel.trim()
          : defaultSignatureRoleLabel(index)
      const hasOwnParts = Array.isArray(o.showAfterParts)
      return {
        roleLabel,
        userId: typeof o.userId === 'string' ? o.userId.trim() : '',
        name: typeof o.name === 'string' ? o.name.trim() : '',
        designation: typeof o.designation === 'string' ? o.designation.trim() : '',
        department: typeof o.department === 'string' ? o.department.trim() : '',
        enabled: asBool(o.enabled, true),
        required: asBool(o.required, false),
        showAfterParts: hasOwnParts
          ? normalizeSignatureShowAfterParts(o.showAfterParts, fallback)
          : [...fallback],
      }
    })
    .slice(0, MAX_TEST_REPORT_SIGNATURES)

  return parsed.length > 0 ? parsed : DEFAULT_TEST_REPORT_SIGNATURES.map((s) => ({ ...s }))
}

export function parseTestReportPrintSettings(raw: unknown): TestReportPrintSettings {
  const d = DEFAULT_TEST_REPORT_PRINT_SETTINGS
  if (!raw || typeof raw !== 'object') return { ...d }

  const o = raw as Record<string, unknown>
  const pageSize = parsePrintPageSize(o.pageSize)
  const pdfOutputMode: PdfOutputMode =
    o.pdfOutputMode === 'playwright' || o.pdfOutputMode === 'html2pdf'
      ? 'playwright'
      : 'browser_print'

  const horizontalLegacy = clamp(Number(o.bodyPaddingHorizontalMm), 8, 25)
  const bodyPaddingLeftMm =
    o.bodyPaddingLeftMm != null && Number.isFinite(Number(o.bodyPaddingLeftMm))
      ? clamp(Number(o.bodyPaddingLeftMm), 8, 25)
      : horizontalLegacy
  const bodyPaddingRightMm =
    o.bodyPaddingRightMm != null && Number.isFinite(Number(o.bodyPaddingRightMm))
      ? clamp(Number(o.bodyPaddingRightMm), 8, 25)
      : horizontalLegacy

  const legacySignatureParts =
    o.signatureAfterParts != null
      ? parseSignatureAfterParts(o.signatureAfterParts)
      : o.signatureApplyPages != null
        ? defaultSignatureAfterParts()
        : defaultSignatureShowAfterParts()
  const signatures = parseTestReportSignatures(o.signatures, legacySignatureParts)

  return {
    pageSize,
    pageOrientation: parsePrintPageOrientation(o.pageOrientation),
    customPageWidthMm: clamp(Number(o.customPageWidthMm ?? d.customPageWidthMm), 50, 1500),
    customPageHeightMm: clamp(Number(o.customPageHeightMm ?? d.customPageHeightMm), 50, 2000),
    bodyPaddingTopMm: (() => {
      const header = clamp(Number(o.headerMaxHeightMm), 12, 60)
      const below = clamp(Number(o.headerMarginBelowMm ?? 2), 0, 20)
      return Math.max(clamp(Number(o.bodyPaddingTopMm), 18, 80), header + below)
    })(),
    bodyPaddingBottomMm: (() => {
      const footer = clamp(Number(o.footerMaxHeightMm), 10, 60)
      return Math.max(clamp(Number(o.bodyPaddingBottomMm), 16, 80), footer)
    })(),
    bodyPaddingLeftMm,
    bodyPaddingRightMm,
    headerMaxHeightMm: clamp(Number(o.headerMaxHeightMm), 12, 60),
    footerMaxHeightMm: clamp(Number(o.footerMaxHeightMm), 10, 60),
    fontFamily:
      typeof o.fontFamily === 'string' && o.fontFamily.trim()
        ? o.fontFamily.trim()
        : d.fontFamily,
    baseFontSizePt: clamp(Number(o.baseFontSizePt), 8, 14),
    titleFontSizePt: clamp(Number(o.titleFontSizePt), 14, 28),
    lineHeight: clamp(Number(o.lineHeight), 1.2, 1.65),
    partGapMm: clamp(Number(o.partGapMm), 4, 24),
    partGapAfterAMm: clamp(Number(o.partGapAfterAMm ?? o.partGapMm), 4, 24),
    partGapAfterBMm: clamp(Number(o.partGapAfterBMm ?? o.partGapMm), 4, 24),
    partGapAfterCMm: clamp(Number(o.partGapAfterCMm ?? o.partGapMm), 4, 24),
    tableCellPaddingPx: clamp(Number(o.tableCellPaddingPx), 4, 12),
    showPartFrames: asBool(o.showPartFrames, d.showPartFrames),
    partBNewPage: asBool(o.partBNewPage, d.partBNewPage),
    partCNewPage: asBool(o.partCNewPage, d.partCNewPage),
    partDNewPage: asBool(o.partDNewPage, d.partDNewPage),
    showWatermark: asBool(o.showWatermark, d.showWatermark),
    pdfOutputMode,
    partCColumns: parsePartCReportColumnsByScope(o.partCColumns),
    showSignatures: asBool(o.showSignatures, d.showSignatures),
    signatures,
    signatureAfterParts: deriveSignatureAfterPartsFromSignatures(signatures),
    showPageNumbers: asBool(o.showPageNumbers, d.showPageNumbers),
    pageNumberType: parsePageNumberType(o.pageNumberType ?? d.pageNumberType),
    pageNumberPosition: parsePageNumberPosition(o.pageNumberPosition ?? d.pageNumberPosition),
    pageBorderType: parsePageBorderType(o.pageBorderType ?? d.pageBorderType),
    pageBorderAlignment: parsePageBorderAlignment(o.pageBorderAlignment ?? d.pageBorderAlignment),
    pageBorderGapMm: clamp(Number(o.pageBorderGapMm ?? d.pageBorderGapMm), 0, 25),
    showPrintHeader: asBool(o.showPrintHeader, d.showPrintHeader),
    headerFitToPageWidth: asBool(o.headerFitToPageWidth, d.headerFitToPageWidth),
    headerMarginBelowMm: clamp(Number(o.headerMarginBelowMm ?? d.headerMarginBelowMm), 0, 20),
    headerAlign: parsePrintHeaderAlign(o.headerAlign ?? d.headerAlign),
    headerImageFit: parsePrintHeaderImageFit(o.headerImageFit ?? d.headerImageFit),
    showPrintFooter: asBool(o.showPrintFooter, d.showPrintFooter),
    footerFitToPageWidth: asBool(o.footerFitToPageWidth, d.footerFitToPageWidth),
    footerMarginAboveMm: clamp(Number(o.footerMarginAboveMm ?? d.footerMarginAboveMm), 0, 20),
    footerAlign: parsePrintHeaderAlign(o.footerAlign ?? d.footerAlign),
    footerImageFit: parsePrintHeaderImageFit(o.footerImageFit ?? d.footerImageFit),
    showReportTitle: asBool(o.showReportTitle, d.showReportTitle),
    showTermsAndConditions: asBool(o.showTermsAndConditions, d.showTermsAndConditions),
    showPartCEndNotes: asBool(o.showPartCEndNotes, d.showPartCEndNotes),
    showPartCSectionRows: asBool(o.showPartCSectionRows, d.showPartCSectionRows),
    partANewPage: asBool(o.partANewPage, d.partANewPage),
    tableFontSizePt: clamp(Number(o.tableFontSizePt ?? o.baseFontSizePt), 8, 14),
  }
}

export function parseSrfPrintSettings(raw: unknown): SrfPrintSettings {
  const d = DEFAULT_SRF_PRINT_SETTINGS
  if (!raw || typeof raw !== 'object') return { ...d }

  const o = raw as Record<string, unknown>
  const pageSize = parsePrintPageSize(o.pageSize)
  const pdfOutputMode: PdfOutputMode =
    o.pdfOutputMode === 'playwright' || o.pdfOutputMode === 'html2pdf'
      ? 'playwright'
      : 'browser_print'

  return {
    pageSize,
    pageOrientation: parsePrintPageOrientation(o.pageOrientation),
    customPageWidthMm: clamp(Number(o.customPageWidthMm ?? d.customPageWidthMm), 50, 1500),
    customPageHeightMm: clamp(Number(o.customPageHeightMm ?? d.customPageHeightMm), 50, 2000),
    bodyPaddingTopMm: clamp(Number(o.bodyPaddingTopMm), 18, 50),
    bodyPaddingBottomMm: clamp(Number(o.bodyPaddingBottomMm), 16, 45),
    bodyPaddingHorizontalMm: clamp(Number(o.bodyPaddingHorizontalMm), 8, 25),
    headerMaxHeightMm: clamp(Number(o.headerMaxHeightMm), 12, 40),
    footerMaxHeightMm: clamp(Number(o.footerMaxHeightMm), 10, 35),
    fontFamily:
      typeof o.fontFamily === 'string' && o.fontFamily.trim()
        ? o.fontFamily.trim()
        : d.fontFamily,
    baseFontSizePt: clamp(Number(o.baseFontSizePt), 8, 14),
    showHeader: asBool(o.showHeader, d.showHeader),
    showFooter: asBool(o.showFooter, d.showFooter),
    headerTemplateName:
      typeof o.headerTemplateName === 'string' ? o.headerTemplateName.trim() : d.headerTemplateName,
    footerTemplateName:
      typeof o.footerTemplateName === 'string' ? o.footerTemplateName.trim() : d.footerTemplateName,
    pdfOutputMode,
  }
}

/** Supports legacy flat test-report JSON and nested `{ testReport, srf }`. */
export function parseLabPrintSettings(raw: unknown): LabPrintSettingsDocument {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_LAB_PRINT_SETTINGS }

  const o = raw as Record<string, unknown>
  if ('testReport' in o || 'srf' in o) {
    return {
      testReport: parseTestReportPrintSettings(o.testReport),
      srf: parseSrfPrintSettings(o.srf),
    }
  }

  return {
    testReport: parseTestReportPrintSettings(raw),
    srf: { ...DEFAULT_SRF_PRINT_SETTINGS },
  }
}

export function labPrintSettingsToJson(doc: LabPrintSettingsDocument): LabPrintSettingsDocument {
  return {
    testReport: parseTestReportPrintSettings(doc.testReport),
    srf: parseSrfPrintSettings(doc.srf),
  }
}
