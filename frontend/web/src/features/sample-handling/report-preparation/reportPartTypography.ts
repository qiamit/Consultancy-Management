/** Shared typography for Part A–D report tables (screen + print preview). */
export const REPORT_PART_FONT_FAMILY = '"Times New Roman", Times, serif'
export const REPORT_PART_FONT_SIZE = '11pt'
export const REPORT_PART_FONT_WEIGHT_BOLD = 700

/** Inline style block shared by Part A–D screen tables. */
export function reportPartTableBaseCss(tableClass: string): string {
  return `
    .${tableClass} {
      width: 100%;
      border-collapse: collapse;
      table-layout: fixed;
      font-family: ${REPORT_PART_FONT_FAMILY};
      font-size: ${REPORT_PART_FONT_SIZE};
      font-weight: ${REPORT_PART_FONT_WEIGHT_BOLD};
      color: #000;
      line-height: 1.25;
      border: 1px solid #000;
    }
    .${tableClass} th,
    .${tableClass} td {
      border: 1px solid #000;
      padding: 3px 6px;
      vertical-align: top;
      word-break: break-word;
      font-family: inherit;
      font-size: inherit;
      font-weight: ${REPORT_PART_FONT_WEIGHT_BOLD};
      color: #000;
    }
    .${tableClass} th {
      text-align: left;
      text-transform: uppercase;
      letter-spacing: 0.02em;
      padding: 5px 8px;
    }
    .${tableClass} input,
    .${tableClass} textarea,
    .${tableClass} button {
      font-family: inherit !important;
      font-size: inherit !important;
      font-weight: ${REPORT_PART_FONT_WEIGHT_BOLD} !important;
      color: inherit !important;
    }
  `
}
