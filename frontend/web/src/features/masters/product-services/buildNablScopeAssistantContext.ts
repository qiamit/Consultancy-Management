import type { NablScopeRow } from './types'

/** Compact NABL scope list for QI Assistant context (token-safe). */
export function buildNablScopeAssistantContext(rows: NablScopeRow[], search: string): string {
  const lines = [
    'Module: NABL Scope (Certificate TC-15442 · Valid 05/02/2025 – 04/02/2029)',
    `Total scope entries loaded: ${rows.length}`,
    search.trim() ? `Active search filter: "${search.trim()}"` : 'No search filter applied',
    '',
    'Table: nabl_scope',
    'Columns: s_no, discipline_group, materials_products, component_parameter, test_method_specification, permanent_testing, scope_status, type_of_test, range_minimum, range_maximum, unit, uncertainty',
    'Each row includes database id (UUID). Use that exact id in lims_crud for update/delete.',
    '',
    'Scope entries (up to 30):',
  ]

  const slice = rows.slice(0, 30)
  if (slice.length === 0) {
    lines.push('(none)')
  } else {
    for (const r of slice) {
      lines.push(
        `- id=${r.id} | S.No ${r.s_no} | ${r.discipline_group} | ${r.materials_products} | ${r.component_parameter} | ${r.test_method_specification} | ${r.permanent_testing} | status=${r.scope_status ?? '—'} | type=${r.type_of_test ?? '—'} | range=${r.range_minimum ?? '—'}-${r.range_maximum ?? '—'} | unit=${r.unit ?? '—'} | uncertainty=${r.uncertainty ?? '—'}`,
      )
    }
    if (rows.length > 30) {
      lines.push(`… and ${rows.length - 30} more entries not listed.`)
    }
  }

  return lines.join('\n')
}
