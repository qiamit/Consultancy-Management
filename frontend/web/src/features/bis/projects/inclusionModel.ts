import type { BisPrintDocumentKind } from '../print/printBisDocument'
import { parseBisNotesScope, sanitizeBisLicenseScopeNotes } from './types'

/* Change in Scope (Inclusion) on an existing licence — data kept apart from the New Application modules.
   Mirrors Manak "Application For Change in Scope (Inclusion)" (varietyInclusionForm). */

type Rec = Record<string, unknown>

/** Varieties to include (Manak "Add Varieties" rows) and the reason for an old test report. */
export const INCLUSION_DETAILS_KIND = 'inclusion-details' as BisPrintDocumentKind

/** Required Yes / No for the additional machinery and testing equipment ("Declaration by the Licensee"). */
export const INCLUSION_COMPONENTS_KIND = 'inclusion-components' as BisPrintDocumentKind

/** Uploaded supporting files; merged after the request letter into Manak's single "Any Other Document". */
export const INCLUSION_OTHER_DOCS_KIND = 'inclusion-other-documents'

/** Row flag on CMPF-305 / CMPF-306: the row is added for this inclusion (only these go in the Manak lists). */
export const INCLUSION_ADDITION_KEY = 'inclusionAddition'

export const INCLUSION_TYPES = ['With Test Report', 'Without Test Report'] as const
export type InclusionType = (typeof INCLUSION_TYPES)[number]

export type InclusionVariety = {
  /** Manak "Variety*" — the variety being included (not the sample description). */
  variety: string
  inclusionType: InclusionType
  /** Sample QR code(s) from the OSL samples, comma separated (Manak's QR Code field is multi-select). */
  qrCode: string
  /** Manak "If Test Report is Older Than 90 Days/180 Days, Reasons for Delay". */
  delayReason: string
}

const str = (v: unknown) => (typeof v === 'string' ? v.trim() : v == null ? '' : String(v).trim())

/** File category of the New Scope row attachments (kept apart from the licence's manufacturing scope files). */
export const INCLUSION_SCOPE_FILES_KIND = 'inclusion-scope'

/** New Scope varieties (Step 1 module, same layout as the application's Varieties), one per row. */
export function newScopeVarieties(details: Rec | null | undefined): string[] {
  return licenceScopeText(str(details?.newScope)).split('\n').map((v) => v.trim()).filter(Boolean)
}

/**
 * Keep Manak inclusion `rows` in sync with New Scope (Step 1).
 * Preserves inclusionType / QR / delay when the variety name still exists; drops removed names; adds new ones.
 */
export function syncInclusionVarietyRowsFromNewScope(details: Rec | null | undefined): Rec[] {
  const names = newScopeVarieties(details)
  const existing = Array.isArray(details?.rows) ? (details?.rows as Rec[]) : []
  const byName = new Map<string, Rec>()
  for (const r of existing) {
    const name = str(r?.variety)
    if (name && !byName.has(name)) byName.set(name, r)
  }
  return names.map((variety) => {
    const prev = byName.get(variety)
    if (prev && typeof prev === 'object') {
      return {
        ...prev,
        variety,
        inclusionType:
          str(prev.inclusionType) === 'Without Test Report' ? 'Without Test Report' : 'With Test Report',
        qrCode: str(prev.qrCode),
        delayReason: str(prev.delayReason) || 'Not Applicable',
      }
    }
    return {
      variety,
      inclusionType: 'With Test Report',
      qrCode: '',
      delayReason: 'Not Applicable',
    }
  })
}

/** Varieties for Manak / letter: New Scope rows (synced into `rows`), with a plain-newScope fallback. */
export function parseInclusionVarieties(payload: Rec | null | undefined): InclusionVariety[] {
  const synced = syncInclusionVarietyRowsFromNewScope(payload)
  const source = synced.length
    ? synced
    : Array.isArray(payload?.rows)
      ? (payload?.rows as Rec[])
      : []
  const fromRows: InclusionVariety[] = source
    .filter((r) => r && typeof r === 'object' && str(r.variety))
    .map((r) => ({
      variety: str(r.variety),
      inclusionType: (str(r.inclusionType) === 'Without Test Report'
        ? 'Without Test Report'
        : 'With Test Report') as InclusionType,
      qrCode: str(r.qrCode),
      delayReason: str(r.delayReason) || 'Not Applicable',
    }))
  if (fromRows.length) return fromRows
  // Legacy: New Scope filled but rows never synced.
  return newScopeVarieties(payload).map((variety) => ({
    variety,
    inclusionType: 'With Test Report' as const,
    qrCode: '',
    delayReason: 'Not Applicable',
  }))
}

/** QR codes as digits, one per entry ("100000784850, 100000784877"). */
export function inclusionQrCodes(value: string): string[] {
  return Array.from(new Set(value.split(/[\s,;/]+/).map((v) => v.replace(/\D/g, '')).filter((v) => v.length >= 6)))
}

export const isInclusionAddition = (row: Rec) => str(row[INCLUSION_ADDITION_KEY]) === 'Yes'

/** Required for Manak when any CMPF row is marked as an addition, unless set by hand. */
export function inclusionRequired(components: Rec | null | undefined, key: 'machinery' | 'equipment', additions: number): boolean {
  const map = components?.applicable && typeof components.applicable === 'object' ? (components.applicable as Rec) : {}
  const v = map[key]
  return v === 'Yes' || v === 'No' ? v === 'Yes' : additions > 0
}

/** Licence scope as Manak shows it ("Existing Scope of License"): each row as "Component - Value …", no headings. */
export function licenceScopeText(notes: string | null | undefined): string {
  const scope = parseBisNotesScope(sanitizeBisLicenseScopeNotes(String(notes ?? '')))
  if (scope.mode === 'plain') return scope.text.trim()
  return scope.rows
    .map((cells) => cells.map((c) => c.trim()).filter(Boolean).join(' - '))
    .filter(Boolean)
    .join('\n')
}
