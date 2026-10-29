import { applyPrintScanFriendlyCss } from './printScanFriendlyCss'

export type BisPrintPageSize = 'A4' | 'A5' | 'Letter' | 'Legal'

export type BisPrintOrientation = 'portrait' | 'landscape'

export type BisPrintAlignHorizontal = 'left' | 'center' | 'right'

export type BisPrintAlignVertical = 'top' | 'middle' | 'bottom'

/** Active settings panel in the preview sidebar. */
export type BisDocumentPrintSettingsPanel =
  | 'letterhead-header'
  | 'letterhead-footer'
  | 'signature'
  | 'page'
  | 'print'

export type BisDocumentPrintPageSettings = {
  pageSize: BisPrintPageSize
  orientation: BisPrintOrientation
  marginTopMm: number
  marginRightMm: number
  marginBottomMm: number
  marginLeftMm: number
  alignHorizontal: BisPrintAlignHorizontal
  alignVertical: BisPrintAlignVertical
  scalePercent: number
  /** Letter head — header */
  showLetterhead: boolean
  showLetterheadFirm: boolean
  showLetterheadAddress: boolean
  showLetterheadContact: boolean
  showLetterheadPhone: boolean
  showLetterheadEmail: boolean
  showLetterheadGst: boolean
  letterheadAlign: BisPrintAlignHorizontal
  letterheadFirmUppercase: boolean
  letterheadFirmBold: boolean
  letterheadAddressItalic: boolean
  letterheadContactStacked: boolean
  letterheadCompact: boolean
  letterheadFirmColor: 'stone' | 'amber' | 'black'
  letterheadFirmSizePt: number
  letterheadAddressSizePt: number
  letterheadContactSizePt: number
  showLetterheadRule: boolean
  letterheadRuleThicknessPt: number
  letterheadBottomGapMm: number
  letterheadTopPadMm: number
  /** Letter head — footer / page frame */
  showPreparedBy: boolean
  showPageBorder: boolean
  pageBorderStyle: 'double' | 'solid'
  pageBorderThicknessPt: number
  pageBorderColor: 'black' | 'stone' | 'amber'
  pageBorderPaddingMm: number
  showPageNumber: boolean
  pageNumberAlign: BisPrintAlignHorizontal
  showPageNumberRule: boolean
  pageNumberSizePt: number
  pageNumberBottomMm: number
  /** Signature block */
  showSignatureBlock: boolean
  showSignatureImage: boolean
  showSealNote: boolean
  signatureSpaceMm: number
  /**
   * Unit of the *Pt size fields. Settings saved before the sizes were applied as real points were rendered as
   * CSS px; they carry no marker and are converted once when read (see parseBisDocumentPrintPageSettings).
   */
  sizeUnit?: 'pt'
}

export const DEFAULT_BIS_DOCUMENT_PRINT_PAGE_SETTINGS: BisDocumentPrintPageSettings = {
  pageSize: 'A4',
  orientation: 'portrait',
  marginTopMm: 5,
  marginRightMm: 8,
  marginBottomMm: 5,
  marginLeftMm: 11,
  alignHorizontal: 'left',
  alignVertical: 'top',
  scalePercent: 100,
  showLetterhead: true,
  showLetterheadFirm: true,
  showLetterheadAddress: true,
  showLetterheadContact: true,
  showLetterheadPhone: true,
  showLetterheadEmail: true,
  showLetterheadGst: true,
  letterheadAlign: 'center',
  letterheadFirmUppercase: true,
  letterheadFirmBold: true,
  letterheadAddressItalic: false,
  letterheadContactStacked: false,
  letterheadCompact: false,
  letterheadFirmColor: 'black',
  letterheadFirmSizePt: 15,
  letterheadAddressSizePt: 9.5,
  letterheadContactSizePt: 8.5,
  showLetterheadRule: true,
  letterheadRuleThicknessPt: 1.5,
  letterheadBottomGapMm: 3,
  letterheadTopPadMm: 0,
  showPreparedBy: false,
  showPageBorder: true,
  pageBorderStyle: 'double',
  pageBorderThicknessPt: 2.5,
  pageBorderColor: 'black',
  pageBorderPaddingMm: 2,
  showPageNumber: true,
  pageNumberAlign: 'right',
  showPageNumberRule: true,
  pageNumberSizePt: 9,
  pageNumberBottomMm: 2,
  showSignatureBlock: true,
  showSignatureImage: true,
  showSealNote: false,
  signatureSpaceMm: 12,
  sizeUnit: 'pt',
}

/**
 * Size fields that used to be rendered as CSS px, with the default each had then. A stored px value equal to that old
 * default maps to today's default (what the page looked like); any other value is converted px → pt (× 0.75).
 */
const LEGACY_PX_SIZE_FIELDS = {
  letterheadFirmSizePt: 20,
  letterheadAddressSizePt: 12.5,
  letterheadContactSizePt: 11.5,
  letterheadRuleThicknessPt: 2,
  pageNumberSizePt: 10.5,
} as const

function asBool(raw: unknown, fallback: boolean): boolean {
  return typeof raw === 'boolean' ? raw : fallback
}

function asNumber(raw: unknown, fallback: number): number {
  const n = typeof raw === 'number' ? raw : Number(raw)
  return Number.isFinite(n) ? n : fallback
}

function asEnum<T extends string>(raw: unknown, allowed: readonly T[], fallback: T): T {
  return typeof raw === 'string' && (allowed as readonly string[]).includes(raw)
    ? (raw as T)
    : fallback
}

/** Merge stored / partial settings with defaults (per Application / Licence). */
export function parseBisDocumentPrintPageSettings(
  raw: unknown,
): BisDocumentPrintPageSettings {
  const d = DEFAULT_BIS_DOCUMENT_PRINT_PAGE_SETTINGS
  const src =
    raw && typeof raw === 'object' && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {}
  // Saved before sizes were real points (no marker): convert those px values once.
  const legacyPx = Object.keys(src).length > 0 && src.sizeUnit !== 'pt'
  const size = (key: keyof typeof LEGACY_PX_SIZE_FIELDS): number => {
    const value = asNumber(src[key], d[key])
    if (!legacyPx || src[key] === undefined || src[key] === null) return value
    if (value === LEGACY_PX_SIZE_FIELDS[key]) return d[key]
    return Math.round(value * 0.75 * 2) / 2
  }
  return {
    pageSize: asEnum(src.pageSize, ['A4', 'A5', 'Letter', 'Legal'] as const, d.pageSize),
    orientation: asEnum(src.orientation, ['portrait', 'landscape'] as const, d.orientation),
    marginTopMm: asNumber(src.marginTopMm, d.marginTopMm),
    marginRightMm: asNumber(src.marginRightMm, d.marginRightMm),
    marginBottomMm: asNumber(src.marginBottomMm, d.marginBottomMm),
    marginLeftMm: asNumber(src.marginLeftMm, d.marginLeftMm),
    alignHorizontal: asEnum(
      src.alignHorizontal,
      ['left', 'center', 'right'] as const,
      d.alignHorizontal,
    ),
    alignVertical: asEnum(
      src.alignVertical,
      ['top', 'middle', 'bottom'] as const,
      d.alignVertical,
    ),
    scalePercent: asNumber(src.scalePercent, d.scalePercent),
    showLetterhead: asBool(src.showLetterhead, d.showLetterhead),
    showLetterheadFirm: asBool(src.showLetterheadFirm, d.showLetterheadFirm),
    showLetterheadAddress: asBool(src.showLetterheadAddress, d.showLetterheadAddress),
    showLetterheadContact: asBool(src.showLetterheadContact, d.showLetterheadContact),
    showLetterheadPhone: asBool(src.showLetterheadPhone, d.showLetterheadPhone),
    showLetterheadEmail: asBool(src.showLetterheadEmail, d.showLetterheadEmail),
    showLetterheadGst: asBool(src.showLetterheadGst, d.showLetterheadGst),
    letterheadAlign: asEnum(
      src.letterheadAlign,
      ['left', 'center', 'right'] as const,
      d.letterheadAlign,
    ),
    letterheadFirmUppercase: asBool(src.letterheadFirmUppercase, d.letterheadFirmUppercase),
    letterheadFirmBold: asBool(src.letterheadFirmBold, d.letterheadFirmBold),
    letterheadAddressItalic: asBool(src.letterheadAddressItalic, d.letterheadAddressItalic),
    letterheadContactStacked: asBool(
      src.letterheadContactStacked,
      d.letterheadContactStacked,
    ),
    letterheadCompact: asBool(src.letterheadCompact, d.letterheadCompact),
    letterheadFirmColor: asEnum(
      src.letterheadFirmColor,
      ['stone', 'amber', 'black'] as const,
      d.letterheadFirmColor,
    ),
    letterheadFirmSizePt: size('letterheadFirmSizePt'),
    letterheadAddressSizePt: size('letterheadAddressSizePt'),
    letterheadContactSizePt: size('letterheadContactSizePt'),
    showLetterheadRule: asBool(src.showLetterheadRule, d.showLetterheadRule),
    letterheadRuleThicknessPt: size('letterheadRuleThicknessPt'),
    letterheadBottomGapMm: asNumber(src.letterheadBottomGapMm, d.letterheadBottomGapMm),
    letterheadTopPadMm: asNumber(src.letterheadTopPadMm, d.letterheadTopPadMm),
    showPreparedBy: asBool(src.showPreparedBy, d.showPreparedBy),
    showPageBorder: asBool(src.showPageBorder, d.showPageBorder),
    pageBorderStyle: asEnum(
      src.pageBorderStyle,
      ['double', 'solid'] as const,
      d.pageBorderStyle,
    ),
    pageBorderThicknessPt: asNumber(src.pageBorderThicknessPt, d.pageBorderThicknessPt),
    pageBorderColor: asEnum(
      src.pageBorderColor,
      ['black', 'stone', 'amber'] as const,
      d.pageBorderColor,
    ),
    pageBorderPaddingMm: asNumber(src.pageBorderPaddingMm, d.pageBorderPaddingMm),
    showPageNumber: asBool(src.showPageNumber, d.showPageNumber),
    pageNumberAlign: asEnum(
      src.pageNumberAlign,
      ['left', 'center', 'right'] as const,
      d.pageNumberAlign,
    ),
    showPageNumberRule: asBool(src.showPageNumberRule, d.showPageNumberRule),
    pageNumberSizePt: size('pageNumberSizePt'),
    pageNumberBottomMm: asNumber(src.pageNumberBottomMm, d.pageNumberBottomMm),
    showSignatureBlock: asBool(src.showSignatureBlock, d.showSignatureBlock),
    showSignatureImage: asBool(src.showSignatureImage, d.showSignatureImage),
    showSealNote: asBool(src.showSealNote, d.showSealNote),
    signatureSpaceMm: asNumber(src.signatureSpaceMm, d.signatureSpaceMm),
    sizeUnit: 'pt',
  }
}

export const BIS_PRINT_PAGE_SIZE_OPTIONS: BisPrintPageSize[] = ['A4', 'A5', 'Letter', 'Legal']

export const BIS_DOCUMENT_PRINT_SETTINGS_PANELS: {
  id: BisDocumentPrintSettingsPanel
  label: string
}[] = [
  { id: 'letterhead-header', label: 'Letter Head Header Setting' },
  { id: 'letterhead-footer', label: 'Letter Head Footer Setting' },
  { id: 'signature', label: 'Signature Setting' },
  { id: 'page', label: 'Page Setting' },
  { id: 'print', label: 'Print Setting' },
]

const PAGE_SIZE_MM: Record<BisPrintPageSize, { w: number; h: number }> = {
  A4: { w: 210, h: 297 },
  A5: { w: 148, h: 210 },
  Letter: { w: 216, h: 279 },
  Legal: { w: 216, h: 356 },
}

/** Physical page width × height in mm for the selected size + orientation. */
export function bisPrintPageSizeMm(settings: BisDocumentPrintPageSettings): {
  widthMm: number
  heightMm: number
} {
  const dim = PAGE_SIZE_MM[settings.pageSize]
  if (settings.orientation === 'landscape') {
    return { widthMm: dim.h, heightMm: dim.w }
  }
  return { widthMm: dim.w, heightMm: dim.h }
}

/** Approximate printable width for screen preview sheet (mm). */
export function bisPrintContentWidthMm(settings: BisDocumentPrintPageSettings): number {
  const { widthMm } = bisPrintPageSizeMm(settings)
  return Math.max(40, widthMm - settings.marginLeftMm - settings.marginRightMm)
}

/**
 * Injects / replaces a live override so preview + print honor the chosen page settings
 * without editing each document template.
 * Screen preview uses true physical page size (e.g. A4 210×297 mm).
 */
export function applyBisDocumentPrintPageSettings(
  html: string,
  settings: BisDocumentPrintPageSettings,
): string {
  const margin = `${settings.marginTopMm}mm ${settings.marginRightMm}mm ${settings.marginBottomMm}mm ${settings.marginLeftMm}mm`
  const { widthMm, heightMm } = bisPrintPageSizeMm(settings)
  const scale = Math.min(200, Math.max(50, settings.scalePercent)) / 100
  const pad = Math.min(10, Math.max(0, settings.pageBorderPaddingMm))
  const firmPt = Math.min(28, Math.max(12, settings.letterheadFirmSizePt))
  const addrPt = Math.min(16, Math.max(8, settings.letterheadAddressSizePt))
  const contactPt = Math.min(14, Math.max(8, settings.letterheadContactSizePt))
  const rulePt = Math.min(4, Math.max(0.5, settings.letterheadRuleThicknessPt))
  const lhGap = Math.min(12, Math.max(0, settings.letterheadBottomGapMm))
  const lhTopPad = Math.min(10, Math.max(0, settings.letterheadTopPadMm))
  const borderPt = Math.min(5, Math.max(0.5, settings.pageBorderThicknessPt))
  const borderColor =
    settings.pageBorderColor === 'amber'
      ? '#b45309'
      : settings.pageBorderColor === 'stone'
        ? '#57534e'
        : '#111111'
  const pageNumPt = Math.min(14, Math.max(7, settings.pageNumberSizePt))
  const pageNumBottom = Math.min(12, Math.max(0, settings.pageNumberBottomMm))
  const pageNumAlign =
    settings.pageNumberAlign === 'left'
      ? 'left'
      : settings.pageNumberAlign === 'center'
        ? 'center'
        : 'right'
  const firmColor =
    settings.letterheadFirmColor === 'amber'
      ? '#b45309'
      : settings.letterheadFirmColor === 'black'
        ? '#000000'
        : '#111111'
  const lhAlign =
    settings.letterheadAlign === 'left'
      ? 'left'
      : settings.letterheadAlign === 'right'
        ? 'right'
        : 'center'
  const lhCompactPad = settings.letterheadCompact ? 4 : 8
  const lhLineGap = settings.letterheadCompact ? 1 : 3
  const sigMm = Math.min(40, Math.max(8, settings.signatureSpaceMm))
  const mt = settings.marginTopMm
  const mr = settings.marginRightMm
  const mb = settings.marginBottomMm
  const ml = settings.marginLeftMm
  const borderCss = settings.showPageBorder
    ? `border: ${borderPt}pt ${settings.pageBorderStyle === 'solid' ? 'solid' : 'double'} ${borderColor} !important;`
    : `border: none !important;`
  /*
   * Page frame geometry (same on screen and paper): the frame is drawn inset at the page margins, never on the paper
   * edge, and content starts `pad` inside it. On screen the sheet is the whole physical page, so the frame is a
   * ::before inset at the margins and the sheet's padding is margin + frame width + pad (content size is unchanged
   * from the old frame-on-the-edge layout). On paper the printer page margins are the same margins and the sheet
   * itself carries the frame, cloned onto every page a tall block spills onto.
   */
  const bw = settings.showPageBorder ? Math.round(borderPt * (25.4 / 72) * 1000) / 1000 : 0
  const sheetPadCss = `${mt + bw + pad}mm ${mr + bw + pad}mm ${mb + bw + pad}mm ${ml + bw + pad}mm`
  const frameCss = settings.showPageBorder
    ? `
  .pd-sheet::before, .al-sheet::before, .f1-sheet::before, .f1-continuous::before {
    content: '' !important;
    display: block !important;
    position: absolute !important;
    top: ${mt}mm !important;
    right: ${mr}mm !important;
    bottom: ${mb}mm !important;
    left: ${ml}mm !important;
    ${borderCss}
    box-sizing: border-box !important;
    pointer-events: none !important;
    z-index: 3 !important;
  }`
    : ''
  const cloneCss = `
    -webkit-box-decoration-break: clone !important;
    box-decoration-break: clone !important;`
  // Form-I page counter ("Page 01 of 03") sits in the bottom page margin, which must be at least 10 mm for it.
  const f1BottomMm = Math.max(mb, 10)

  const hAlign =
    settings.alignHorizontal === 'center'
      ? 'center'
      : settings.alignHorizontal === 'right'
        ? 'flex-end'
        : 'stretch'
  const vAlign =
    settings.alignVertical === 'middle'
      ? 'center'
      : settings.alignVertical === 'bottom'
        ? 'flex-end'
        : 'flex-start'
  const textAlign =
    settings.alignHorizontal === 'center'
      ? 'center'
      : settings.alignHorizontal === 'right'
        ? 'right'
        : 'left'
  const childWidth =
    settings.alignHorizontal === 'left' ? '100%' : 'fit-content'
  const childMaxWidth = '100%'
  const alignCss = `
    display: flex !important;
    flex-direction: column !important;
    justify-content: ${vAlign} !important;
    align-items: ${hAlign} !important;
    text-align: ${textAlign} !important;
  `
  const alignChildCss = `
  .pd-sheet > *:not(.pd-page-num), .al-sheet > *:not(.pd-page-num), .f1-sheet > *:not(.pd-page-num) {
    width: ${childWidth} !important;
    max-width: ${childMaxWidth} !important;
    box-sizing: border-box !important;
  }
  .pd-sheet .pd-table, .al-sheet table, .f1-sheet table,
  .pd-sheet .pd-meta, .pd-sheet .tm-box {
    width: ${settings.alignHorizontal === 'left' ? '100%' : 'fit-content'} !important;
    max-width: 100% !important;
  }
  /* Signature block always sits on the right of the page. */
  .pd-sheet .cmpf-sign-right, .pd-sheet .ug-sign, .pd-sheet .usit-sign, .pd-sheet .osl-sign {
    width: 100% !important;
    max-width: 100% !important;
    align-self: stretch !important;
    display: flex !important;
    justify-content: flex-end !important;
    text-align: right !important;
  }
  .pd-sheet .cmpf-sign-right .pd-signatory,
  .pd-sheet .ug-sign .pd-signatory,
  .pd-sheet .usit-sign .pd-signatory,
  .pd-sheet .osl-sign .pd-signatory {
    text-align: right !important;
    margin-left: auto !important;
  }
  .pd-sheet .cmpf-sign-right .pd-sign-space,
  .pd-sheet .ug-sign .pd-sign-space,
  .pd-sheet .usit-sign .pd-sign-space,
  .pd-sheet .osl-sign .pd-sign-space {
    justify-content: flex-end !important;
  }
  .pd-sheet .cmpf-sign-right .pd-sign-line,
  .pd-sheet .ug-sign .pd-sign-line,
  .pd-sheet .usit-sign .pd-sign-line,
  .pd-sheet .osl-sign .pd-sign-line,
  .pd-sheet .cmpf311-cover-sign .pd-sign-line {
    width: 48mm !important;
    margin-left: auto !important;
    margin-right: 0 !important;
  }
  .al-sheet .al-sign-row {
    width: 100% !important;
    max-width: 100% !important;
    align-self: stretch !important;
  }
`
  const hasContinuousForm = /class=["']f1-continuous["']/.test(html)
  /* Form-I flows across pages (no fixed sheets): screen shows one long page, print fragments it. */
  const continuousScreenCss = hasContinuousForm
    ? `
  .f1-continuous {
    display: block !important;
    align-self: ${hAlign} !important;
    width: ${widthMm}mm !important;
    min-width: ${widthMm}mm !important;
    max-width: ${widthMm}mm !important;
    height: auto !important;
    min-height: 0 !important;
    max-height: none !important;
    margin: 0 auto !important;
    padding: ${sheetPadCss} !important;
    overflow: visible !important;
    position: relative !important;
    box-sizing: border-box !important;
    background: #fff !important;
    box-shadow: 0 1px 3px rgba(0,0,0,0.22), 0 10px 28px rgba(0,0,0,0.16) !important;
    text-align: ${textAlign} !important;
    border: none !important;
  }
  .f1-continuous > * { max-width: 100% !important; box-sizing: border-box !important; }
  .f1-continuous .f1-box { width: 100% !important; max-width: 100% !important; }`
    : ''
  const continuousPrintCss = hasContinuousForm
    ? `
  body.f1-print-document {
    display: block !important;
    width: auto !important;
    min-width: 0 !important;
    padding: 0 !important;
    background: #fff !important;
    transform: none !important;
  }
  .f1-continuous {
    page: bis-form1;
    display: block !important;
    width: auto !important;
    min-width: 0 !important;
    max-width: none !important;
    height: auto !important;
    min-height: 0 !important;
    max-height: none !important;
    margin: 0 !important;
    padding: ${pad}mm !important;
    overflow: visible !important;
    box-shadow: none !important;
    position: relative !important;
    ${borderCss}
    ${cloneCss}
  }
  .f1-continuous > * { break-inside: auto; page-break-inside: auto; }
  .f1-continuous .f1-box { break-inside: avoid; page-break-inside: avoid; }
  .f1-continuous + .pd-sheet { break-before: page; page-break-before: always; }`
    : ''

  const override = `<style id="bis-print-preview-override">
/* Printer page margins = Page Setting margins. Fixed sheets fill the area inside them (see the frame note above). */
@page { size: ${settings.pageSize} ${settings.orientation}; margin: ${margin} !important; }
${hasContinuousForm ? `@page bis-form1 {
  margin: ${mt}mm ${mr}mm ${f1BottomMm}mm ${ml}mm !important;
  @bottom-right {
    content: "Page " counter(page, decimal-leading-zero) " of " counter(pages, decimal-leading-zero);
    font-family: Arial, Helvetica, "Liberation Sans", sans-serif;
    font-size: 9pt;
    font-weight: 600;
    color: #111;
    vertical-align: middle;
    padding-right: ${pad}mm;
  }
}` : ''}
.pd-letterhead, .al-letterhead, .f1-header {
  display: ${settings.showLetterhead ? 'block' : 'none'} !important;
  text-align: ${lhAlign} !important;
  border-bottom: ${
    settings.showLetterhead && settings.showLetterheadRule
      ? `${rulePt}pt solid #b45309`
      : 'none'
  } !important;
  padding-top: ${lhTopPad}mm !important;
  padding-bottom: ${settings.showLetterheadRule ? lhCompactPad : 2}px !important;
  margin-bottom: ${lhGap}mm !important;
}
.pd-firm, .al-firm {
  display: ${settings.showLetterheadFirm ? 'block' : 'none'} !important;
  font-size: ${firmPt}pt !important;
  font-weight: ${settings.letterheadFirmBold ? 700 : 400} !important;
  text-transform: ${settings.letterheadFirmUppercase ? 'uppercase' : 'none'} !important;
  letter-spacing: ${settings.letterheadFirmUppercase ? '0.03em' : 'normal'} !important;
  color: ${firmColor} !important;
  margin: 0 0 ${lhLineGap}px !important;
}
.pd-firm-addr, .al-firm-addr {
  display: ${settings.showLetterheadAddress ? 'block' : 'none'} !important;
  font-size: ${addrPt}pt !important;
  font-style: ${settings.letterheadAddressItalic ? 'italic' : 'normal'} !important;
  margin: 0 0 ${lhLineGap}px !important;
}
.pd-firm-contact, .al-firm-contact {
  display: ${settings.showLetterheadContact ? 'flex' : 'none'} !important;
  flex-wrap: wrap !important;
  flex-direction: ${settings.letterheadContactStacked ? 'column' : 'row'} !important;
  align-items: ${
    lhAlign === 'left' ? 'flex-start' : lhAlign === 'right' ? 'flex-end' : 'center'
  } !important;
  justify-content: ${
    lhAlign === 'left' ? 'flex-start' : lhAlign === 'right' ? 'flex-end' : 'center'
  } !important;
  gap: ${settings.letterheadContactStacked ? '1px' : '0.15em 0.85em'} !important;
  font-size: ${contactPt}pt !important;
  margin: 0 !important;
}
.pd-lh-phone { display: ${settings.showLetterheadPhone ? 'inline' : 'none'} !important; }
.pd-lh-email { display: ${settings.showLetterheadEmail ? 'inline' : 'none'} !important; }
.pd-lh-gst { display: ${settings.showLetterheadGst ? 'inline' : 'none'} !important; }
.pd-prepared, .al-prepared, .f1-prepared {
  display: none !important;
}
.pd-sheet, .al-sheet, .f1-sheet, body > .pd-sheet {
  position: relative !important;
}
.pd-page-num {
  position: absolute !important;
  margin: 0 !important;
  font-size: ${pageNumPt}pt !important;
  color: #222 !important;
  font-weight: 600 !important;
  text-align: ${pageNumAlign} !important;
  border-top: ${
    settings.showPageNumberRule ? '1.25px solid #666' : 'none'
  } !important;
  padding-top: ${settings.showPageNumberRule ? 4 : 0}px !important;
  display: ${settings.showPageNumber ? 'block' : 'none'} !important;
  background: #fff !important;
  z-index: 4 !important;
  width: auto !important;
  max-width: none !important;
  box-sizing: border-box !important;
}
/* Beats the scan-friendly floor (loaded after this) so the Page Number pt setting applies. */
body .pd-sheet .pd-page-num, body .al-sheet .pd-page-num, body .f1-sheet .pd-page-num {
  font-size: ${pageNumPt}pt !important;
}
/* Scan-friendly body text (preview + print). */
.pd-sheet, .al-sheet, .f1-sheet {
  font-family: Arial, Helvetica, "Liberation Sans", sans-serif !important;
  color: #000 !important;
  background: #fff !important;
  font-size: 13px !important;
  line-height: 1.45 !important;
}
.pd-firm, .al-firm {
  font-family: "Times New Roman", Times, "Liberation Serif", serif !important;
  color: #000 !important;
}
.pd-firm-addr, .al-firm-addr, .pd-firm-contact, .al-firm-contact {
  color: #111 !important;
  font-weight: 500 !important;
}
.pd-body, .al-body, .pd-to-block, .al-to-block, .pd-date-block, .al-date-block,
.proc-points, .proc-points p, .proc-points strong,
.ug-points, .ug-points p, .u2-conditions, .u2-conditions p {
  color: #000 !important;
  -webkit-text-fill-color: #000 !important;
}
/* Scan-legible body text (print → seal / sign → scan). */
.pd-body, .al-body, .pd-to-block, .al-to-block, .pd-date-block, .al-date-block {
  font-size: 13.5px !important;
  font-weight: 500 !important;
  line-height: 1.55 !important;
}
.proc-points p, .ug-points p, .u2-conditions p {
  font-size: 13.5px !important;
  font-weight: 500 !important;
  line-height: 1.6 !important;
}
.pd-meta td, .pd-table th, .pd-table td {
  font-size: 12.5px !important;
  color: #000 !important;
  border-color: #000 !important;
  border-width: 1.25px !important;
}
.pd-signatory, .al-signatory, .cmpf-sign-right .pd-signatory {
  display: ${settings.showSignatureBlock ? 'inline-block' : 'none'} !important;
  line-height: 1.35 !important;
}
.al-sign-row {
  display: ${settings.showSignatureBlock ? 'flex' : 'none'} !important;
}
.pd-for, .al-for {
  margin: 0 0 1px !important;
}
.pd-sign-space, .al-sign-space {
  height: ${sigMm}mm !important;
  margin: 0 !important;
}
.pd-sign-line, .al-sign-line {
  display: block !important;
  width: 48mm !important;
  max-width: 100% !important;
  border-top: 1px solid #111 !important;
  margin: 1px 0 2px 0 !important;
  box-sizing: border-box !important;
}
.cmpf-sign-right .pd-sign-line,
.ug-sign .pd-sign-line,
.usit-sign .pd-sign-line,
.osl-sign .pd-sign-line,
.al-signatory-right .al-sign-line {
  margin-left: auto !important;
  margin-right: 0 !important;
}
/* Seal + signature stamp: sized like a real stamp and centred on the signature line, overlapping the
   "For …" and name lines the way a hand-applied stamp does (multiply keeps the text readable through it). */
.pd-sign-space, .al-sign-space {
  position: relative !important;
  overflow: visible !important;
}
.pd-sign-img, .al-sign-space .pd-sign-img {
  display: ${settings.showSignatureImage ? 'block' : 'none'} !important;
  position: absolute !important;
  right: 24mm !important;
  bottom: -7mm !important;
  transform: translateX(50%) !important;
  width: auto !important;
  height: ${sigMm + 13}mm !important;
  max-height: none !important;
  max-width: 58mm !important;
  object-fit: contain !important;
  z-index: 2 !important;
  pointer-events: none;
  background: transparent !important;
  mix-blend-mode: multiply;
}
.cmpf307-sign-image, .c306-cont-sign-image {
  position: relative !important;
  z-index: 2 !important;
  max-height: 25mm !important;
  max-width: 58mm !important;
  margin: -7mm 0 -7mm auto !important;
  mix-blend-mode: multiply;
}
.pd-seal-note, .al-seal-note {
  display: ${settings.showSealNote ? 'block' : 'none'} !important;
}
@media screen {
  html {
    background: #a8a29e !important;
  }
  body {
    margin: 0 !important;
    padding: 12mm 10mm 20mm !important;
    background: #a8a29e !important;
    display: flex !important;
    flex-direction: column !important;
    align-items: center !important;
    gap: 3mm !important;
    width: max-content !important;
    min-width: 100% !important;
    box-sizing: border-box !important;
    transform: scale(${scale});
    transform-origin: top center;
  }
  /* True physical page size matching Page Setting (size / orientation / margins). */
  .pd-sheet, .f1-sheet, .al-sheet, body > .pd-sheet {
    width: ${widthMm}mm !important;
    max-width: ${widthMm}mm !important;
    min-width: ${widthMm}mm !important;
    height: ${heightMm}mm !important;
    min-height: ${heightMm}mm !important;
    max-height: ${heightMm}mm !important;
    margin: 0 !important;
    box-sizing: border-box !important;
    padding: ${sheetPadCss} !important;
    background: #fff !important;
    box-shadow: 0 1px 3px rgba(0,0,0,0.22), 0 10px 28px rgba(0,0,0,0.16) !important;
    /* auto: long Process Description points stay readable in preview (hidden clipped them). */
    overflow: auto !important;
    position: relative !important;
    /* The frame is the ::before inset at the margins, not the sheet edge (= the paper edge). */
    border: none !important;
    ${alignCss}
  }
  ${frameCss}
  /* Page number sits inside the frame, Page Number Bottom mm above its inner edge. */
  .pd-page-num {
    left: ${ml + bw + pad}mm !important;
    right: ${mr + bw + pad}mm !important;
    bottom: ${mb + bw + pageNumBottom}mm !important;
  }
  ${alignChildCss}
  ${continuousScreenCss}
  .pd-sheet + .pd-sheet,
  .pd-sheet + .al-sheet,
  .al-sheet + .pd-sheet,
  .al-sheet + .al-sheet,
  .f1-sheet + .f1-sheet {
    margin-top: 0 !important;
    page-break-before: auto !important;
    break-before: auto !important;
  }
  /* Sheets wrapped in a section (merged documents) are not spaced by the body's flex gap: keep a 3 mm gap there too. */
  :not(body) > .pd-sheet + .pd-sheet,
  :not(body) > .pd-sheet + .al-sheet,
  :not(body) > .al-sheet + .pd-sheet,
  :not(body) > .al-sheet + .al-sheet,
  :not(body) > .f1-sheet + .f1-sheet {
    margin-top: 3mm !important;
  }
}
@media print {
  html, body {
    background: #fff !important;
    transform: none !important;
    -webkit-print-color-adjust: exact !important;
    print-color-adjust: exact !important;
  }
  .pd-sheet::before, .al-sheet::before, .f1-sheet::before, .f1-continuous::before {
    content: none !important;
    display: none !important;
  }
  /*
   * Flex sheets break browser print fragmentation — long Process Description
   * text can vanish on Print / Save-as-PDF / scan. Use block for print.
   * The sheet fills the area inside the printer margins and carries the frame itself; box-decoration-break: clone
   * repeats frame + inner padding on every page an unsplittable tall block runs onto (never up to the paper edge).
   */
  .pd-sheet, .f1-sheet, .al-sheet {
    display: block !important;
    width: auto !important;
    max-width: none !important;
    min-width: 0 !important;
    height: auto !important;
    /* Fills the page inside the margins; 1 mm slack: an exact fit can overflow by a sub-pixel and add a blank page. */
    min-height: calc(${heightMm - mt - mb}mm - 1mm) !important;
    max-height: none !important;
    margin: 0 auto !important;
    padding: ${pad}mm !important;
    box-sizing: border-box !important;
    box-shadow: none !important;
    overflow: visible !important;
    position: relative !important;
    background: #fff !important;
    color: #000 !important;
    text-align: ${textAlign} !important;
    -webkit-print-color-adjust: exact !important;
    print-color-adjust: exact !important;
    ${borderCss}
    ${cloneCss}
  }
  .pd-sheet *, .al-sheet *, .f1-sheet * {
    color: #000 !important;
    -webkit-text-fill-color: #000 !important;
  }
  .pd-firm-addr, .al-firm-addr, .pd-firm-contact, .al-firm-contact,
  .pd-note, .pd-seal-note, .al-seal-note, .pd-page-num {
    color: #111 !important;
    -webkit-text-fill-color: #111 !important;
  }
  .proc-points p, .ug-points p, .u2-conditions p, .pd-body, .al-body {
    font-size: 13.5px !important;
    font-weight: 500 !important;
    line-height: 1.6 !important;
    color: #000 !important;
    -webkit-text-fill-color: #000 !important;
  }
  .pd-page-num {
    left: ${pad}mm !important;
    right: ${pad}mm !important;
    bottom: ${pageNumBottom}mm !important;
    background: #fff !important;
  }
  ${alignChildCss}
  ${continuousPrintCss}
  .pd-sheet + .pd-sheet,
  .pd-sheet + .al-sheet,
  .al-sheet + .pd-sheet,
  .al-sheet + .al-sheet,
  .f1-sheet + .f1-sheet {
    /* The 3 mm gap is a screen-only separator. In print each sheet starts a new physical page, and a margin here would push
       the sheet past the page height so its absolutely positioned page number spilled onto an extra, nearly empty PDF page. */
    margin-top: 0 !important;
    page-break-before: always;
    break-before: page;
  }
}
</style>`

  const withoutOld = html.replace(
    /<style id="bis-print-preview-override">[\s\S]*?<\/style>/i,
    '',
  )
  if (/<\/head>/i.test(withoutOld)) {
    return applyPrintScanFriendlyCss(withoutOld.replace(/<\/head>/i, `${override}</head>`))
  }
  return applyPrintScanFriendlyCss(`${override}${withoutOld}`)
}
