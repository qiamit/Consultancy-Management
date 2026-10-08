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
  letterheadFirmSizePt: 20,
  letterheadAddressSizePt: 12.5,
  letterheadContactSizePt: 11.5,
  showLetterheadRule: true,
  letterheadRuleThicknessPt: 2,
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
  pageNumberSizePt: 10.5,
  pageNumberBottomMm: 2,
  showSignatureBlock: true,
  showSignatureImage: true,
  showSealNote: false,
  signatureSpaceMm: 12,
}

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
    letterheadFirmSizePt: asNumber(src.letterheadFirmSizePt, d.letterheadFirmSizePt),
    letterheadAddressSizePt: asNumber(src.letterheadAddressSizePt, d.letterheadAddressSizePt),
    letterheadContactSizePt: asNumber(src.letterheadContactSizePt, d.letterheadContactSizePt),
    showLetterheadRule: asBool(src.showLetterheadRule, d.showLetterheadRule),
    letterheadRuleThicknessPt: asNumber(
      src.letterheadRuleThicknessPt,
      d.letterheadRuleThicknessPt,
    ),
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
    pageNumberSizePt: asNumber(src.pageNumberSizePt, d.pageNumberSizePt),
    pageNumberBottomMm: asNumber(src.pageNumberBottomMm, d.pageNumberBottomMm),
    showSignatureBlock: asBool(src.showSignatureBlock, d.showSignatureBlock),
    showSignatureImage: asBool(src.showSignatureImage, d.showSignatureImage),
    showSealNote: asBool(src.showSealNote, d.showSealNote),
    signatureSpaceMm: asNumber(src.signatureSpaceMm, d.signatureSpaceMm),
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
  .pd-sheet .osl-sign .pd-sign-line {
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

  const override = `<style id="bis-print-preview-override">
@page { size: ${settings.pageSize} ${settings.orientation}; margin: ${margin} !important; }
.pd-letterhead, .al-letterhead, .f1-header {
  display: ${settings.showLetterhead ? 'block' : 'none'} !important;
  text-align: ${lhAlign} !important;
  border-bottom: ${
    settings.showLetterhead && settings.showLetterheadRule
      ? `${rulePt}px solid #b45309`
      : 'none'
  } !important;
  padding-top: ${lhTopPad}mm !important;
  padding-bottom: ${settings.showLetterheadRule ? lhCompactPad : 2}px !important;
  margin-bottom: ${lhGap}mm !important;
}
.pd-firm, .al-firm {
  display: ${settings.showLetterheadFirm ? 'block' : 'none'} !important;
  font-size: ${firmPt}px !important;
  font-weight: ${settings.letterheadFirmBold ? 700 : 400} !important;
  text-transform: ${settings.letterheadFirmUppercase ? 'uppercase' : 'none'} !important;
  letter-spacing: ${settings.letterheadFirmUppercase ? '0.03em' : 'normal'} !important;
  color: ${firmColor} !important;
  margin: 0 0 ${lhLineGap}px !important;
}
.pd-firm-addr, .al-firm-addr {
  display: ${settings.showLetterheadAddress ? 'block' : 'none'} !important;
  font-size: ${addrPt}px !important;
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
  font-size: ${contactPt}px !important;
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
  font-size: ${pageNumPt}px !important;
  color: #222 !important;
  font-weight: 600 !important;
  text-align: ${pageNumAlign} !important;
  border-top: ${
    settings.showPageNumberRule ? '1.25px solid #666' : 'none'
  } !important;
  padding-top: ${settings.showPageNumberRule ? 4 : 0}px !important;
  display: ${settings.showPageNumber ? 'block' : 'none'} !important;
  background: #fff !important;
  z-index: 2 !important;
  width: auto !important;
  max-width: none !important;
  box-sizing: border-box !important;
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
.proc-points p, .ug-points p, .u2-conditions p {
  font-size: 12.5px !important;
  font-weight: 500 !important;
  line-height: 1.55 !important;
}
.pd-meta td, .pd-table th, .pd-table td {
  font-size: 12px !important;
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
.pd-sign-img, .al-sign-space .pd-sign-img {
  display: ${settings.showSignatureImage ? 'inline-block' : 'none'} !important;
  max-height: ${Math.max(6, sigMm - 1)}mm !important;
  background: transparent !important;
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
    padding: ${mt + pad}mm ${mr + pad}mm ${mb + pad}mm ${ml + pad}mm !important;
    background: #fff !important;
    box-shadow: 0 1px 3px rgba(0,0,0,0.22), 0 10px 28px rgba(0,0,0,0.16) !important;
    /* auto: long Process Description points stay readable in preview (hidden clipped them). */
    overflow: auto !important;
    position: relative !important;
    ${borderCss}
    ${alignCss}
  }
  /* Footer sits in the bottom margin strip of every page. */
  .pd-page-num {
    left: ${ml + pad}mm !important;
    right: ${mr + pad}mm !important;
    bottom: ${pageNumBottom}mm !important;
  }
  ${alignChildCss}
  .pd-sheet + .pd-sheet,
  .pd-sheet + .al-sheet,
  .al-sheet + .pd-sheet,
  .al-sheet + .al-sheet,
  .f1-sheet + .f1-sheet {
    margin-top: 0 !important;
    page-break-before: auto !important;
    break-before: auto !important;
  }
}
@media print {
  html, body {
    background: #fff !important;
    transform: none !important;
    -webkit-print-color-adjust: exact !important;
    print-color-adjust: exact !important;
  }
  /*
   * Flex sheets break browser print fragmentation — long Process Description
   * text can vanish on Print / Save-as-PDF / scan. Use block for print.
   */
  .pd-sheet, .f1-sheet, .al-sheet {
    display: block !important;
    width: auto !important;
    max-width: none !important;
    min-width: 0 !important;
    height: auto !important;
    min-height: calc(${heightMm}mm - ${mt}mm - ${mb}mm) !important;
    max-height: none !important;
    margin: 0 auto !important;
    padding: ${pad}mm ${pad}mm ${Math.max(pad + 6, 8)}mm ${pad}mm !important;
    box-shadow: none !important;
    overflow: visible !important;
    position: relative !important;
    background: #fff !important;
    color: #000 !important;
    text-align: ${textAlign} !important;
    -webkit-print-color-adjust: exact !important;
    print-color-adjust: exact !important;
    ${borderCss}
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
    font-size: 12.5px !important;
    font-weight: 500 !important;
    line-height: 1.55 !important;
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
  .pd-sheet + .pd-sheet,
  .pd-sheet + .al-sheet,
  .al-sheet + .pd-sheet,
  .al-sheet + .al-sheet,
  .f1-sheet + .f1-sheet {
    margin-top: 3mm !important;
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
    return withoutOld.replace(/<\/head>/i, `${override}</head>`)
  }
  return `${override}${withoutOld}`
}
