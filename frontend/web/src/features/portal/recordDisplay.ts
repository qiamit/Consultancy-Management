import { formatDisplayDate } from '@/features/bis/projects/types'
import type { PortalLinkOption } from './portalApi'
import { formatDateValue, formatNumberValue, passFailWords, toNumber, type RecordColumn } from './recordLogic'

/* How a record entry's values read, on the portal screen and in the printed register (same text in both). */

export const REF_LABEL: Record<string, string> = {
  raw_material: 'Lot / Heat No',
  in_process: 'Ref No',
  final_test: 'Sample / Batch No',
  batch: 'Batch No',
}

export function linkLabel(o: PortalLinkOption | undefined, col?: RecordColumn): string {
  if (!o) return '—'
  const how = String(col?.config.link_label ?? '')
  if (how === 'ref') return o.ref_no || formatDisplayDate(o.entry_date)
  if (how === 'date') return formatDisplayDate(o.entry_date)
  return [o.ref_no, formatDisplayDate(o.entry_date)].filter(Boolean).join(' · ')
}

export function cellText(col: RecordColumn, v: unknown, links: Record<string, PortalLinkOption[]>): string {
  if (v == null || v === '') return ''
  if (col.col_type === 'date') return formatDateValue(col, String(v))
  if (col.col_type === 'link') {
    const ids = Array.isArray(v) ? v.map(String) : [String(v)]
    const opts = links[col.config.section_id ?? ''] ?? []
    return ids.map((id) => linkLabel(opts.find((o) => o.id === id), col)).join(', ')
  }
  if (col.col_type === 'select' && Array.isArray(v)) return v.map(String).join(', ')
  if (col.col_type === 'pass_fail') {
    const [good, bad] = passFailWords(col.config)
    return String(v).toLowerCase() === 'fail' ? bad : String(v).toLowerCase() === 'pass' ? good : String(v)
  }
  if (typeof v === 'boolean') return v ? 'Yes' : 'No'
  const n = typeof v === 'number' ? v : (col.col_type === 'number' || col.col_type === 'spec') ? toNumber(v) : null
  return n != null ? formatNumberValue(col, n) : String(v)
}
