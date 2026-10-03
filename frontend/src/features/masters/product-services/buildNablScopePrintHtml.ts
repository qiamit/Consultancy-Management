import type { NablScopeRow } from './types'
import { formatScopeNumber, formatUncertaintyDisplay } from './types'

function escapeHtml(value: string): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function cell(value: string | number | null | undefined): string {
  if (value == null || String(value).trim() === '') return '—'
  return escapeHtml(String(value))
}

function readLabName(): string {
  if (typeof window === 'undefined') return 'Laboratory'
  return window.localStorage.getItem('labSettings.labName')?.trim() || 'Quality International Research & Laboratories Pvt. Ltd.'
}

export type NablScopePrintOptions = {
  rows: NablScopeRow[]
  /** When set, shown under the title (e.g. active search filter). */
  filterNote?: string
  printedAt?: Date
}

/** A4 landscape print document for NABL Scope — all form fields as table columns. */
export function buildNablScopePrintHtml(options: NablScopePrintOptions): string {
  const { rows, filterNote } = options
  const printedAt = options.printedAt ?? new Date()
  const labName = readLabName()
  const printDate = printedAt.toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  })

  const rowsHtml = rows
    .map(
      (r) => `<tr>
  <td class="col-sno">${cell(r.s_no)}</td>
  <td class="col-discipline">${cell(r.discipline_group)}</td>
  <td class="col-materials">${cell(r.materials_products)}</td>
  <td class="col-component">${cell(r.component_parameter)}</td>
  <td class="col-method">${cell(r.test_method_specification)}</td>
  <td class="col-permanent">${cell(r.permanent_testing)}</td>
  <td class="col-status">${cell(r.scope_status)}</td>
  <td class="col-type">${cell(r.type_of_test)}</td>
  <td class="col-range">${cell(formatScopeNumber(r.range_minimum))}</td>
  <td class="col-range">${cell(formatScopeNumber(r.range_maximum))}</td>
  <td class="col-unit">${cell(r.unit)}</td>
  <td class="col-uncertainty">${escapeHtml(formatUncertaintyDisplay(r.uncertainty))}</td>
</tr>`,
    )
    .join('\n')

  const filterLine = filterNote?.trim()
    ? `<p class="meta filter-note">Filter: ${escapeHtml(filterNote.trim())}</p>`
    : ''

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>NABL Scope — Print</title>
<style>
  @page {
    size: A4 landscape;
    margin: 12mm 10mm 14mm 10mm;
  }

  * { box-sizing: border-box; }

  html, body {
    margin: 0;
    padding: 0;
    font-family: "Segoe UI", system-ui, -apple-system, Roboto, Arial, sans-serif;
    color: #0f172a;
    background: #fff;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }

  .print-sheet {
    width: 100%;
    max-width: 277mm;
    margin: 0 auto;
    padding: 0;
  }

  .print-header {
    margin-bottom: 8px;
    border-bottom: 2px solid #1e3a5f;
    padding-bottom: 6px;
  }

  .print-header h1 {
    margin: 0 0 2px;
    font-size: 15pt;
    font-weight: 700;
    color: #1e3a5f;
    letter-spacing: 0.02em;
  }

  .print-header .lab-name {
    margin: 0 0 4px;
    font-size: 11pt;
    font-weight: 600;
  }

  .meta {
    margin: 0 0 2px;
    font-size: 8.5pt;
    color: #475569;
    line-height: 1.35;
  }

  .meta.filter-note {
    font-style: italic;
  }

  .summary {
    margin: 6px 0 8px;
    font-size: 8.5pt;
    color: #334155;
  }

  table.scope-table {
    width: 100%;
    border-collapse: collapse;
    table-layout: fixed;
    font-size: 7.5pt;
    line-height: 1.25;
  }

  table.scope-table thead {
    display: table-header-group;
  }

  table.scope-table tr {
    page-break-inside: avoid;
  }

  table.scope-table th,
  table.scope-table td {
    border: 1px solid #94a3b8;
    padding: 4px 5px;
    vertical-align: top;
    word-wrap: break-word;
    overflow-wrap: anywhere;
  }

  table.scope-table th {
    background: #e2e8f0;
    color: #0f172a;
    font-weight: 700;
    text-align: center;
    font-size: 7pt;
  }

  table.scope-table td {
    text-align: left;
  }

  table.scope-table td.col-sno,
  table.scope-table td.col-range,
  table.scope-table td.col-type,
  table.scope-table td.col-permanent,
  table.scope-table td.col-status {
    text-align: center;
  }

  .col-sno { width: 4%; }
  .col-discipline { width: 10%; }
  .col-materials { width: 10%; }
  .col-component { width: 14%; }
  .col-method { width: 11%; }
  .col-permanent { width: 8%; }
  .col-status { width: 8%; }
  .col-type { width: 7%; }
  .col-range { width: 6%; }
  .col-unit { width: 5%; }
  .col-uncertainty { width: 9%; }

  .print-footer {
    margin-top: 8px;
    padding-top: 4px;
    border-top: 1px solid #cbd5e1;
    font-size: 7.5pt;
    color: #64748b;
    display: flex;
    justify-content: space-between;
    gap: 12px;
  }

  @media screen {
    body { padding: 16px; background: #f8fafc; }
    .print-sheet {
      background: #fff;
      padding: 16px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.1);
    }
  }
</style>
</head>
<body>
  <div class="print-sheet">
    <header class="print-header">
      <p class="lab-name">${escapeHtml(labName)}</p>
      <h1>NABL Accreditation Scope</h1>
      <p class="meta">Certificate TC-15442 · ISO/IEC 17025:2017 · Valid 05/02/2025 – 04/02/2029</p>
      <p class="meta">Printed: ${escapeHtml(printDate)}</p>
      ${filterLine}
    </header>

    <p class="summary">${rows.length} scope entr${rows.length === 1 ? 'y' : 'ies'}</p>

    <table class="scope-table">
      <thead>
        <tr>
          <th class="col-sno">S.No</th>
          <th class="col-discipline">Discipline / Group</th>
          <th class="col-materials">Materials or Products Tested</th>
          <th class="col-component">Component / Parameter / Test Performed</th>
          <th class="col-method">Test Method Specification</th>
          <th class="col-permanent">Permanent Testing</th>
          <th class="col-status">Status of Scope</th>
          <th class="col-type">Type of Test</th>
          <th class="col-range">Range Minimum</th>
          <th class="col-range">Range Maximum</th>
          <th class="col-unit">Unit</th>
          <th class="col-uncertainty">Uncertainty</th>
        </tr>
      </thead>
      <tbody>
        ${rowsHtml || '<tr><td colspan="12" style="text-align:center;padding:12px;">No entries</td></tr>'}
      </tbody>
    </table>

    <footer class="print-footer">
      <span>QIRLPL LIMS — NABL Scope Master</span>
      <span>Clause 7 · Process Requirements</span>
    </footer>
  </div>
</body>
</html>`
}
