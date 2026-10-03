import type { IsCodeRow } from './types'
import { formatIsCodeLabel } from './formatIsCodeLabel'

export { formatIsCodeLabel, formatIsCodeLabelFromParts, normalizeIsCodeLabel } from './formatIsCodeLabel'


/** List context for header QI Assistant (includes UUIDs for create/update/delete). */
export function buildIsCodesListAssistantContext(rows: IsCodeRow[], search: string): string {
  const lines = [
    'Module: IS Code Master (list view)',
    `Total IS codes loaded: ${rows.length}`,
    search.trim() ? `Active search filter: "${search.trim()}"` : 'No search filter applied',
    '',
    'Each row includes database id (UUID). Use that exact id in lims_crud for update/delete.',
    'For PDF Q&A on one standard, use the sparkle Ask AI button on that row.',
    '',
    'IS codes (up to 30):',
  ]

  const slice = rows.slice(0, 30)
  if (slice.length === 0) {
    lines.push('(none)')
  } else {
    for (const r of slice) {
      lines.push(
        `- id=${r.id} | ${formatIsCodeLabel(r)} | title="${r.title}" | ${r.aspect} | Charges: Rs ${Number(r.testing_charges ?? 0).toFixed(2)}`,
      )
    }
    if (rows.length > 30) {
      lines.push(`… and ${rows.length - 30} more IS codes not listed.`)
    }
  }

  return lines.join('\n')
}

/** Row metadata for row-level assistant (includes UUID for CRUD). */
export function buildIsCodeAssistantContext(row: IsCodeRow): string {
  return [
    'Module: IS Code Master — single-row assistant (NotebookLM-style + data edits)',
    `Database id (UUID) for lims_crud update/delete: ${row.id}`,
    `IS: ${formatIsCodeLabel(row)}`,
    `Title: ${row.title}`,
    `Aspect: ${row.aspect}`,
    `Reaffirmation year: ${row.reaffirmation_year ?? '-'}`,
    `Amendment: ${row.amendment_number ?? '-'}`,
    `Testing charges: Rs ${Number(row.testing_charges ?? 0).toFixed(2)}`,
    `Remarks: ${row.remarks ?? '-'}`,
    '',
    'When the user asks to change this IS code, use id above in lims_crud (table is_codes).',
    'Uploaded PDF files for this IS code are read from storage on each question.',
  ].join('\n')
}
