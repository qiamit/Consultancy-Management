import type { TestParameterRow } from './types'

export function formatTestParameterLabel(
  row: Pick<TestParameterRow, 'item_name' | 'is_code_label'>,
): string {
  const is = (row.is_code_label ?? '').trim()
  const name = (row.item_name ?? '').trim() || 'Test parameter'
  return is ? `${name} — ${is}` : name
}

/** List context for header QI Assistant (includes UUIDs for create/update/delete). */
export function buildTestParametersListAssistantContext(
  rows: TestParameterRow[],
  search: string,
): string {
  const lines = [
    'Module: Test Parameter Master (list view)',
    `Total test parameters loaded: ${rows.length}`,
    search.trim() ? `Active search filter: "${search.trim()}"` : 'No search filter applied',
    '',
    'Each row includes database id (UUID). Use that exact id in lims_crud for update/delete.',
    'For Q&A on one parameter with linked IS PDFs, use the sparkle Ask AI button on that row.',
    '',
    'Test parameters (up to 30):',
  ]

  const slice = rows.slice(0, 30)
  if (slice.length === 0) {
    lines.push('(none)')
  } else {
    for (const r of slice) {
      lines.push(
        `- id=${r.id} | ${formatTestParameterLabel(r)} | method="${r.test_method ?? '-'}" | clause=${r.clause_no ?? '-'} | req="${(r.specific_requirement ?? '-').slice(0, 80)}"`,
      )
    }
    if (rows.length > 30) {
      lines.push(`… and ${rows.length - 30} more test parameters not listed.`)
    }
  }

  return lines.join('\n')
}

/** Row metadata for row-level QI Assistant (includes UUID for CRUD). */
export function buildTestParameterAssistantContext(row: TestParameterRow): string {
  return [
    'Module: Test Parameter Master — single-row assistant',
    `Database id (UUID) for lims_crud update/delete: ${row.id}`,
    `IS Code: ${row.is_code_label ?? '-'}`,
    row.is_code_id ? `Linked is_code_id (for IS PDF reference): ${row.is_code_id}` : '',
    `Test parameter: ${row.item_name}`,
    `Test method: ${row.test_method ?? '-'}`,
    `Clause: ${row.clause_no ?? '-'}`,
    `Unit: ${row.unit_value ?? '-'}`,
    `Specific requirement: ${row.specific_requirement ?? '-'}`,
    `Uncertainty (MU): ${row.uncertainty_mu ?? '-'}`,
    `Department: ${row.department ?? '-'}`,
    `Designation: ${row.designation ?? '-'}`,
    `Accreditation ids: ${row.under_accreditation_ids?.length ? row.under_accreditation_ids.join(', ') : '-'}`,
    '',
    'When the user asks to change this test parameter, use id above in lims_crud (table test_parameters).',
    row.is_code_id
      ? 'Linked IS standard PDFs (if uploaded) are included for reference when answering technical questions.'
      : '',
  ]
    .filter((line) => line.length > 0)
    .join('\n')
}
