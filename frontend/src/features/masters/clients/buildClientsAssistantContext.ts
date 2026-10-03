import { formatClientContact } from './types'
import { getCurrencySymbol } from '@/lib/appCurrency'
import type { ClientRow } from './types'

/** Compact client list for QI Assistant context (token-safe). */
export function buildClientsAssistantContext(rows: ClientRow[], search: string): string {
  const lines = [
    `Module: Client Master / Client Directory`,
    `Total clients loaded: ${rows.length}`,
    search.trim() ? `Active search filter: "${search.trim()}"` : 'No search filter applied',
    '',
    'Each row includes database id (UUID). Use that exact id in lims_crud for update/delete.',
    '',
    'Clients (up to 30):',
  ]

  const slice = rows.slice(0, 30)
  if (slice.length === 0) {
    lines.push('(none)')
  } else {
    for (const r of slice) {
      lines.push(
        `- id=${r.id} | ${r.company_name} | ${r.company_type} / ${r.company_scale} | GST: ${r.gst_number ?? '-'} | ${formatClientContact(r)} | Balance: ${r.balance_type} ${getCurrencySymbol()}${r.opening_balance ?? 0} | ${r.payment_term}`,
      )
    }
    if (rows.length > 30) {
      lines.push(`… and ${rows.length - 30} more clients not listed.`)
    }
  }

  return lines.join('\n')
}
