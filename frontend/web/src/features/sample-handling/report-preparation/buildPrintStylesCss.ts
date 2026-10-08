import {
  cssPageSizeValue,
  effectiveTableFontSizePt,
  pageBorderCssDeclaration,
  pageNumberCssContent,
  resolvePageBorderInsets,
  type PageNumberPosition,
  type TestReportPrintSettings,
} from '@/features/settings/lab-settings/printSettingsTypes'

const PAGE_MARGIN_BOXES = [
  'top-left-corner',
  'top-left',
  'top-center',
  'top-right',
  'top-right-corner',
  'bottom-left-corner',
  'bottom-left',
  'bottom-center',
  'bottom-right',
  'bottom-right-corner',
] as const

function pageNumberVerticalAlign(position: PageNumberPosition): 'top' | 'bottom' {
  return position.startsWith('top-') ? 'bottom' : 'top'
}

function buildPageMarginBoxesCss(
  position: PageNumberPosition,
  showPageNumbers: boolean,
  pageNumberContent: string,
  fontFamily: string,
  baseFontSizePt: number,
): string {
  return PAGE_MARGIN_BOXES.map((box) => {
    if (showPageNumbers && box === position) {
      return `@${box} {
      content: ${pageNumberContent};
      font-family: ${fontFamily};
      font-size: ${Math.max(8, baseFontSizePt - 1)}pt;
      color: #475569;
      vertical-align: ${pageNumberVerticalAlign(position)};
    }`
    }
    return `@${box} { content: ""; }`
  }).join('\n    ')
}

export type PrintPageMarginsMm = {
  top: number
  right: number
  bottom: number
  left: number
}

export function getTestReportPrintMargins(settings: TestReportPrintSettings): PrintPageMarginsMm {
  return {
    top: settings.bodyPaddingTopMm,
    right: settings.bodyPaddingRightMm,
    bottom: settings.bodyPaddingBottomMm,
    left: settings.bodyPaddingLeftMm,
  }
}

export function buildPrintStylesCss(settings: TestReportPrintSettings): string {
  const {
    bodyPaddingTopMm,
    bodyPaddingBottomMm,
    bodyPaddingLeftMm,
    bodyPaddingRightMm,
    headerMaxHeightMm,
    footerMaxHeightMm,
    fontFamily,
    baseFontSizePt,
    titleFontSizePt,
    lineHeight,
    partGapMm,
    partGapAfterAMm,
    partGapAfterBMm,
    partGapAfterCMm,
    tableCellPaddingPx,
    showPartFrames,
    partBNewPage,
    partCNewPage,
    partDNewPage,
    partANewPage,
    showPageNumbers,
    pageNumberPosition,
    pageNumberType,
    pageBorderType,
    pageBorderAlignment,
    pageBorderGapMm,
    headerFitToPageWidth,
    headerMarginBelowMm,
    headerAlign,
    headerImageFit,
    footerFitToPageWidth,
    footerMarginAboveMm,
    footerAlign,
    footerImageFit,
  } = settings

  const tableFontSizePt = effectiveTableFontSizePt(settings)
  const pageSizeCss = cssPageSizeValue(settings)
  const pageNumbersEnabled = showPageNumbers && pageNumberType !== 'none'
  const pageNumberContent = pageNumbersEnabled ? pageNumberCssContent(pageNumberType) : '""'

  const pageBorderInsets = resolvePageBorderInsets({
    pageBorderType,
    pageBorderAlignment,
    pageBorderGapMm,
    headerMaxHeightMm,
    footerMaxHeightMm,
    bodyPaddingTopMm: settings.bodyPaddingTopMm,
    bodyPaddingBottomMm: settings.bodyPaddingBottomMm,
    bodyPaddingLeftMm: settings.bodyPaddingLeftMm,
    bodyPaddingRightMm: settings.bodyPaddingRightMm,
  })
  const pageBorderCss =
    pageBorderInsets == null
      ? ''
      : `
  .print-page-border {
    position: fixed;
    left: ${pageBorderInsets.leftMm}mm;
    right: ${pageBorderInsets.rightMm}mm;
    top: ${pageBorderInsets.topMm}mm;
    bottom: ${pageBorderInsets.bottomMm}mm;
    ${pageBorderCssDeclaration(pageBorderType, pageBorderAlignment)}
    box-sizing: border-box;
    pointer-events: none;
    z-index: 45;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }`

  const partFrameBorder = showPartFrames ? '2px solid #2563eb' : '1.5px solid #60a5fa'
  const innerBorder = '1px solid #93c5fd'
  const partFrameBg = showPartFrames
    ? 'linear-gradient(180deg, #eff6ff 0%, #ffffff 28px)'
    : '#ffffff'
  const cellPad = `${tableCellPaddingPx}px`
  const headerImgMaxMm = Math.min(headerMaxHeightMm, Math.max(12, bodyPaddingTopMm - 6))
  const footerImgMaxMm = Math.min(footerMaxHeightMm, Math.max(10, bodyPaddingBottomMm - 6))
  const headerSidePadL = headerFitToPageWidth ? 0 : bodyPaddingLeftMm
  const headerSidePadR = headerFitToPageWidth ? 0 : bodyPaddingRightMm
  const footerSidePadL = footerFitToPageWidth ? 0 : bodyPaddingLeftMm
  const footerSidePadR = footerFitToPageWidth ? 0 : bodyPaddingRightMm
  const headerImgMargin =
    headerAlign === 'left' ? '0 auto 0 0' : headerAlign === 'right' ? '0 0 0 auto' : '0 auto'
  const footerImgMargin =
    footerAlign === 'left' ? '0 auto 0 0' : footerAlign === 'right' ? '0 0 0 auto' : '0 auto'
  const headerObjectPosition =
    headerAlign === 'left' ? 'top left' : headerAlign === 'right' ? 'top right' : 'top center'
  const footerObjectPosition =
    footerAlign === 'left'
      ? 'bottom left'
      : footerAlign === 'right'
        ? 'bottom right'
        : 'bottom center'
  const headerFallbackAlign =
    headerAlign === 'left' ? 'left' : headerAlign === 'right' ? 'right' : 'center'

  const partBreakRules = [
    partANewPage ? '.report-part.part-a' : null,
    partBNewPage ? '.report-part.part-b' : null,
    partCNewPage ? '.report-part.part-c' : null,
    partDNewPage ? '.report-part.part-d' : null,
  ]
    .filter(Boolean)
    .map((sel) => `${sel}{break-before:page;page-break-before:always}`)
    .join('\n    ')

  const pageMarginBoxes = buildPageMarginBoxesCss(
    pageNumberPosition,
    pageNumbersEnabled,
    pageNumberContent,
    fontFamily,
    baseFontSizePt,
  )

  return `
  @page {
    size: ${pageSizeCss};
    margin: ${bodyPaddingTopMm}mm ${bodyPaddingRightMm}mm ${bodyPaddingBottomMm}mm ${bodyPaddingLeftMm}mm;
    ${pageMarginBoxes}
  }

  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; width: 100%; }
  body {
    font-family: ${fontFamily};
    font-size: ${baseFontSizePt}pt;
    line-height: ${lineHeight};
    color: #0f172a;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  ${pageBorderCss}

  /* Fixed letterhead + footer on every printed page (Chrome / Edge). */
  .print-header {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    z-index: 1000;
    background: #fff;
    padding: 2mm ${headerSidePadR}mm ${headerMarginBelowMm}mm ${headerSidePadL}mm;
    max-height: ${bodyPaddingTopMm}mm;
    overflow: hidden;
  }
  .print-header img {
    display: block;
    width: 100%;
    max-width: 100%;
    max-height: ${headerImgMaxMm}mm;
    height: ${headerImageFit === 'fill' ? `${headerImgMaxMm}mm` : 'auto'};
    margin: ${headerImgMargin};
    object-fit: ${headerImageFit};
    object-position: ${headerObjectPosition};
  }
  .print-header.fallback {
    text-align: ${headerFallbackAlign};
    font-size: 12px;
    font-weight: 600;
    padding: 4mm 0;
  }

  .print-footer {
    position: fixed;
    bottom: 0;
    left: 0;
    right: 0;
    z-index: 1000;
    background: #fff;
    padding: ${footerMarginAboveMm}mm ${footerSidePadR}mm 2mm ${footerSidePadL}mm;
    max-height: ${bodyPaddingBottomMm}mm;
    overflow: hidden;
  }
  .print-footer img {
    display: block;
    width: 100%;
    max-width: 100%;
    max-height: ${footerImgMaxMm}mm;
    height: ${footerImageFit === 'fill' ? `${footerImgMaxMm}mm` : 'auto'};
    margin: ${footerImgMargin};
    object-fit: ${footerImageFit};
    object-position: ${footerObjectPosition};
  }

  .print-body {
    position: relative;
    z-index: 1;
    padding: ${bodyPaddingTopMm}mm ${bodyPaddingRightMm}mm ${bodyPaddingBottomMm}mm ${bodyPaddingLeftMm}mm;
  }

  .report-title-block {
    text-align: center;
    margin: 0 0 ${partGapMm}px;
  }
  .report-title-block h1 {
    display: inline-block;
    font-size: ${Math.max(22, titleFontSizePt)}pt;
    font-weight: 700;
    margin: 0;
    padding: 0 0 4px;
    letter-spacing: 0.04em;
    line-height: 1.25;
    border-bottom: 2px solid #1c1917;
  }

  .report-part {
    break-inside: auto;
    page-break-inside: auto;
  }
  .report-part.part-a {
    margin-bottom: ${partGapAfterAMm}px;
  }
  .report-part.part-b {
    margin-bottom: ${partGapAfterBMm}px;
  }
  .report-part.part-c {
    margin-bottom: ${partGapAfterCMm}px;
  }
  .report-part.part-d {
    margin-bottom: 0;
  }
  .part-heading {
    font-size: ${Math.max(9, baseFontSizePt - 1)}pt;
    font-weight: 700;
    margin: 0 0 8px;
    padding-bottom: 4px;
    text-align: left;
    color: #1d4ed8;
    border-bottom: 2px solid #3b82f6;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    break-after: avoid;
    page-break-after: avoid;
  }

  .part-frame {
    display: block;
    width: 100%;
    border: ${partFrameBorder};
    background: ${partFrameBg};
    box-shadow: inset 0 0 0 1px rgba(37, 99, 235, 0.12);
    overflow: visible;
    break-inside: auto;
    page-break-inside: auto;
    -webkit-box-decoration-break: clone;
    box-decoration-break: clone;
  }

  .part-c-frame {
    padding: 0;
    overflow: visible;
  }
  .part-c-heading {
    margin: 0;
    padding: 8px 12px;
    border-bottom: ${innerBorder};
    break-after: avoid;
    page-break-after: avoid;
  }
  .part-c-table-area {
    break-before: avoid;
    page-break-before: avoid;
  }

  .part-c-table {
    width: 100%;
    border-collapse: collapse;
    border-spacing: 0;
    table-layout: fixed;
    font-family: "Times New Roman", Times, serif;
    font-size: ${tableFontSizePt}pt;
    color: #000;
    line-height: 1.25;
    margin: 0;
    border: 1px solid #000;
  }
  .part-c-col-sr { width: 8mm; max-width: 10mm; }
  .part-c-col-name { width: 25%; }
  .part-c-col-unit { width: 7%; }
  .part-c-col-spec { width: auto; }
  .part-c-col-observed { width: 15%; }
  .part-c-col-uncertainty { width: 10%; }
  .part-c-col-remark { width: 10%; }
  .part-c-col-other { width: 10%; }
  .part-c-table thead {
    display: table-header-group;
    break-inside: avoid;
    page-break-inside: avoid;
  }
  .part-c-table tbody {
    display: table-row-group;
  }
  .part-c-table th,
  .part-c-table td {
    border: 1px solid #000;
    padding: 3px 6px;
    vertical-align: middle;
    text-align: center;
    font-weight: 700;
    word-break: normal;
    overflow-wrap: break-word;
    break-inside: avoid;
    page-break-inside: avoid;
  }
  .part-c-table tr.part-c-title th {
    text-align: left;
    font-weight: 700;
    text-transform: none;
    letter-spacing: 0.02em;
    padding: 5px 8px;
    background: #fff;
  }
  .part-c-table tr.part-c-col-heads th {
    background: #fff;
    font-weight: 700;
    text-align: center;
    vertical-align: middle;
    text-transform: none;
    line-height: 1.2;
    white-space: normal;
    font-size: ${Math.max(8, baseFontSizePt - 1)}pt;
  }
  .part-c-table tr.part-c-col-heads th.part-c-h-sr {
    text-transform: none;
    line-height: 1.15;
    white-space: nowrap;
    width: 8mm;
    max-width: 10mm;
    padding-left: 2px;
    padding-right: 2px;
  }
  .part-c-table td.c {
    text-align: center;
    vertical-align: middle;
  }
  .part-c-table td.l {
    text-align: left;
    vertical-align: middle;
    break-inside: avoid;
    page-break-inside: avoid;
  }
  .part-c-table td.l .name,
  .part-c-table td.l .sub {
    display: inline;
    break-inside: avoid;
    page-break-inside: avoid;
  }
  .part-c-table td.l .name {
    font-weight: 700;
  }
  .part-c-table tr {
    break-inside: avoid;
    page-break-inside: avoid;
  }
  .part-c-table tr.section-code td {
    background: #fff;
    font-weight: 700;
    text-align: left;
    vertical-align: middle;
    padding: 4px 8px;
    break-after: avoid;
    page-break-after: avoid;
  }
  .part-c-end-notes {
    border: 1px solid #000;
    border-top: none;
    padding: 10px 12px;
    background: #fff;
    font-family: "Times New Roman", Times, serif;
    font-size: ${Math.max(8, baseFontSizePt - 1)}pt;
    color: #000;
    break-inside: avoid;
    page-break-inside: avoid;
    break-before: avoid;
    page-break-before: avoid;
  }
  .end-marker {
    text-align: center;
    font-weight: 700;
    margin: 0 0 6px;
    font-size: ${Math.max(8, baseFontSizePt - 1)}pt;
    letter-spacing: 0.04em;
  }
  .end-notes-body { text-align: justify; line-height: 1.45; margin: 0; }
  td.c { text-align: center; }
  td.l { text-align: left; }
  td.strong { font-weight: 700; }

  .part-a-table {
    width: 100%;
    border-collapse: collapse;
    table-layout: fixed;
    font-family: "Times New Roman", Times, serif;
    font-size: ${baseFontSizePt}pt;
    color: #000;
    line-height: 1.25;
    border: 1px solid #000;
  }
  .part-a-col-k { width: 24%; }
  .part-a-col-c { width: 2%; }
  .part-a-col-v { width: 24%; }
  .part-a-table th,
  .part-a-table td {
    border-top: 1px solid #000;
    border-bottom: 1px solid #000;
    border-left: none;
    border-right: none;
    padding: 3px 6px;
    vertical-align: top;
    word-break: break-word;
  }
  .part-a-table th:first-child,
  .part-a-table td:first-child {
    border-left: 1px solid #000;
  }
  .part-a-table th:last-child,
  .part-a-table td:last-child {
    border-right: 1px solid #000;
  }
  .part-a-table td.part-a-v + td.part-a-k {
    border-left: 1px solid #000;
  }
  .part-a-table th {
    text-align: left;
    font-weight: 700;
    text-transform: none;
    letter-spacing: 0.02em;
    padding: 5px 8px;
  }
  .part-a-k {
    font-weight: 700;
    white-space: nowrap;
    word-break: keep-all;
    overflow-wrap: normal;
  }
  .part-a-c {
    text-align: center;
    padding-left: 0;
    padding-right: 0;
    font-weight: 700;
  }
  .part-a-v {
    font-weight: 700;
  }
  .part-a-table thead {
    display: table-header-group;
  }
  .part-a-table tr {
    break-inside: avoid;
    page-break-inside: avoid;
  }

  .part-b-table {
    width: 100%;
    border-collapse: collapse;
    table-layout: fixed;
    font-family: "Times New Roman", Times, serif;
    font-size: ${baseFontSizePt}pt;
    color: #000;
    line-height: 1.25;
    border: 1px solid #000;
  }
  .part-b-col-k { width: 72%; }
  .part-b-col-c { width: 3%; }
  .part-b-col-v { width: 25%; }
  .part-b-table th,
  .part-b-table td {
    border: 1px solid #000;
    padding: 4px 8px;
    vertical-align: middle;
    word-break: break-word;
  }
  .part-b-table th {
    text-align: left;
    font-weight: 700;
    text-transform: none;
    letter-spacing: 0.02em;
    padding: 5px 8px;
  }
  .part-b-k {
    font-weight: 700;
    text-align: left;
  }
  .part-b-c {
    text-align: center;
    padding-left: 0;
    padding-right: 0;
    font-weight: 700;
  }
  .part-b-v {
    font-weight: 700;
  }
  .part-b-table thead {
    display: table-header-group;
  }
  .part-b-table tr {
    break-inside: avoid;
    page-break-inside: avoid;
  }

  .name { font-weight: 700; line-height: 1.35; }
  .sub { color: #000; font-weight: 400; font-size: ${Math.max(8, baseFontSizePt - 1)}pt; margin-top: 2px; line-height: 1.3; }

  .part-d-table {
    width: 100%;
    border-collapse: collapse;
    table-layout: fixed;
    font-family: "Times New Roman", Times, serif;
    font-size: ${baseFontSizePt}pt;
    color: #000;
    line-height: 1.35;
    border: 1px solid #000;
  }
  .part-d-table th,
  .part-d-table td {
    border: 1px solid #000;
    padding: 5px 8px;
    vertical-align: top;
    word-break: break-word;
  }
  .part-d-table th {
    text-align: left;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.02em;
  }
  .part-d-table .part-d-line {
    font-weight: 700;
    white-space: pre-wrap;
    min-height: 1.5em;
  }
  .part-d-table thead {
    display: table-header-group;
  }
  .part-d-table tr {
    break-inside: avoid;
    page-break-inside: avoid;
  }

  .report-signatures {
    margin-top: ${partGapAfterCMm}px;
    break-inside: avoid;
    page-break-inside: avoid;
  }
  .report-signatures-flow {
    break-inside: avoid;
    page-break-inside: avoid;
  }
  .report-signatures-grid {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-start;
    gap: 24px 16px;
  }
  .report-signatures-count-1 {
    justify-content: flex-end;
  }
  .report-signatures-count-2,
  .report-signatures-count-3,
  .report-signatures-count-many {
    justify-content: space-between;
  }
  .report-signatures-count-4 {
    justify-content: space-between;
    flex-wrap: nowrap;
  }
  .report-signatures-center-pair {
    display: flex;
    flex: 1 1 auto;
    justify-content: center;
    align-items: flex-start;
    gap: 24px;
  }
  .report-signature-cell {
    flex: 0 1 auto;
    box-sizing: border-box;
    width: 10.75rem;
    max-width: 190px;
    min-width: 8.25rem;
    padding: 5px 6px 6px;
    border: none;
    background: transparent;
    text-align: center;
    color: #000;
    font-family: "Times New Roman", Times, serif;
  }
  .report-signature-role {
    font-family: "Times New Roman", Times, serif;
    font-size: ${Math.max(8, baseFontSizePt - 1)}pt;
    font-weight: 700;
    font-style: normal;
    letter-spacing: 0.02em;
    color: #000;
    margin-bottom: 0;
  }
  .report-signature-line {
    display: block;
    width: 8.5rem;
    max-width: 100%;
    border-top: 1px solid #000;
    margin: 7mm auto 4px;
  }
  .report-signature-name {
    font-family: "Times New Roman", Times, serif;
    font-style: italic;
    font-weight: 700;
    font-size: ${Math.max(11, baseFontSizePt + 1)}pt;
    line-height: 1.15;
    color: #000;
  }
  .report-signature-designation {
    margin-top: 2px;
    font-family: "Times New Roman", Times, serif;
    font-style: italic;
    font-size: ${Math.max(8, baseFontSizePt - 1)}pt;
    color: #000;
    line-height: ${lineHeight};
  }

  .terms {
    margin-top: ${partGapMm}px;
    font-size: ${baseFontSizePt}pt;
    border: ${innerBorder};
    padding: 10px 12px;
    break-inside: avoid;
    line-height: ${lineHeight};
  }
  .terms h3 { font-size: ${Math.max(9, baseFontSizePt - 1)}pt; margin: 0 0 6px; font-weight: 700; }
  .terms-body { white-space: pre-wrap; }

  @media print {
    ${partBreakRules}
    /* @page margins apply on every sheet — do not pad .print-body (page 1 only bug). */
    .print-body {
      padding: 0;
    }
    .print-header,
    .print-footer {
      position: fixed;
    }
    .report-part.part-c {
      break-inside: auto;
      page-break-inside: auto;
    }
    .part-c-table thead {
      display: table-header-group;
    }
    .part-c-table tr {
      break-inside: avoid;
      page-break-inside: avoid;
    }
    .part-c-table th,
    .part-c-table td {
      break-inside: avoid;
      page-break-inside: avoid;
    }
    .part-c-table tr.section-code {
      break-after: avoid;
      page-break-after: avoid;
    }
    .part-c-end-notes {
      border: 1px solid #000;
      border-top: none;
      break-inside: avoid;
      page-break-inside: avoid;
      break-before: avoid;
      page-break-before: avoid;
    }
    .report-part,
    .part-frame:not(.part-c-frame) {
      break-inside: auto;
      page-break-inside: auto;
      -webkit-box-decoration-break: clone;
      box-decoration-break: clone;
    }
    .part-heading:not(.part-c-heading) {
      break-after: avoid;
      page-break-after: avoid;
    }
    .report-signatures-flow {
      break-inside: avoid;
      page-break-inside: avoid;
    }
  }
`
}

export function buildWatermarkStyleCss(
  settings: TestReportPrintSettings,
  template: { watermarkUrl: string | null; watermarkText: string },
  escapeHtml: (s: string) => string,
): string {
  if (!settings.showWatermark) return ''

  const inset = `${settings.bodyPaddingTopMm}mm ${settings.bodyPaddingRightMm}mm ${settings.bodyPaddingBottomMm}mm ${settings.bodyPaddingLeftMm}mm`

  if (template.watermarkUrl) {
    return `.print-body::before{content:'';position:fixed;inset:${inset};background:url('${escapeHtml(template.watermarkUrl)}') center/42% no-repeat;opacity:.07;pointer-events:none;z-index:0}`
  }
  if (template.watermarkText) {
    return `.print-body::before{content:'${escapeHtml(template.watermarkText)}';position:fixed;inset:${inset};display:flex;align-items:center;justify-content:center;font-size:48px;color:#94a3b8;opacity:.1;transform:rotate(-25deg);pointer-events:none;z-index:0}`
  }
  return ''
}
