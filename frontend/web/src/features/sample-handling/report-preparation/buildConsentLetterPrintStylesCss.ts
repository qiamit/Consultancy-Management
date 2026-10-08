import type { TestReportPrintSettings } from '@/features/settings/lab-settings/printSettingsTypes'

/** Consent letter body styles. Letterhead/footer come from test-report print CSS. */
export function buildConsentLetterPrintStylesCss(_settings: TestReportPrintSettings): string {
  return `
  .print-body {
    font-family: "Times New Roman", Times, serif;
    font-size: 10pt;
    line-height: 1.35;
    color: #111;
  }
  .consent-block {
    page-break-inside: avoid;
    break-inside: avoid;
  }
  .consent-section-rule {
    display: block;
    width: 100%;
    margin: 0 0 5mm;
    padding: 0;
    border: none;
    border-top: 1px solid #111;
    height: 0;
  }
  .meta-table {
    width: 100%;
    border-collapse: collapse;
    margin: 0 0 6pt;
  }
  .meta-table td {
    vertical-align: top;
    padding: 0;
  }
  .meta-right {
    text-align: right;
    white-space: nowrap;
  }
  .client-block {
    margin: 6pt 0 8pt;
  }
  .is-spec-block {
    margin: 0 0 8pt;
  }
  .is-spec-block p {
    margin: 0 0 4pt;
  }
  .subject {
    margin: 0 0 8pt;
    text-align: justify;
  }
  .salutation {
    margin: 0 0 6pt;
  }
  .body-text {
    margin: 0 0 6pt;
    text-align: justify;
  }
  table.details {
    width: 100%;
    border-collapse: collapse;
    margin: 8pt 0 10pt;
    font-size: 9.5pt;
  }
  table.details th,
  table.details td {
    border: 1px solid #333;
    padding: 4pt 6pt;
    vertical-align: top;
  }
  table.details th {
    background: #f3f4f6;
    text-align: center;
    font-weight: 600;
  }
  table.details td.num {
    width: 10%;
    text-align: center;
  }
  table.details td.param-name {
    width: 62%;
  }
  table.details td.clause {
    width: 28%;
    text-align: center;
  }
  .credentials {
    margin: 0 0 8pt;
  }
  .credentials ol {
    margin: 4pt 0 0;
    padding-left: 18pt;
  }
  .credentials li {
    margin-bottom: 4pt;
    text-align: justify;
  }
  .closing {
    margin-top: 10pt;
    display: flex;
    justify-content: flex-end;
  }
`
}
