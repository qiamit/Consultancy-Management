import type { Cmpf307BrandRow } from '../print/cmpf307Html'

export type { Cmpf307BrandRow }

export type Cmpf307ModulePayload = {
  rows: Cmpf307BrandRow[]
  brandsWithoutMarkReasons: string
}

export function cmpf307RowHasContent(row: Cmpf307BrandRow): boolean {
  return Boolean(row.brandName.trim() || row.agreementFileId?.trim() || row.trademarkFileId?.trim() || (row.registrationDate.trim() && row.registrationDate !== '2026-04-01'))
}

export function emptyCmpf307BrandRow(): Cmpf307BrandRow {
  return { rowId: crypto.randomUUID(), brandName: '', ownedBy: 'Self', registeredStatus: 'Unregistered', registrationDate: '2026-04-01' }
}

export function emptyCmpf307Payload(): Cmpf307ModulePayload {
  return { rows: [emptyCmpf307BrandRow()], brandsWithoutMarkReasons: 'Not Applicable' }
}

function normalizeIntroductionDate(value: unknown): string {
  const raw = String(value ?? '').trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw
  const parts = raw.split(/[/-]/)
  if (parts.length === 3) {
    const [day, month, year] = parts
    if (year.length === 4 && day.length <= 2 && month.length <= 2) {
      const iso = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`
      if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso
    }
  }
  return '2026-04-01'
}

export function parseCmpf307Payload(payload: Record<string, unknown> | null): Cmpf307ModulePayload {
  const rows = Array.isArray(payload?.rows)
    ? payload.rows
        .filter((item): item is Record<string, unknown> => !!item && typeof item === 'object')
        .map((row) => ({
          rowId: String(row.rowId ?? row.row_id ?? crypto.randomUUID()),
          brandName: String(row.brandName ?? row.brand_name ?? row.brand ?? '').trim(),
          ownedBy: String(row.ownedBy ?? row.owned_by ?? row.owner ?? 'Self').trim() || 'Self',
          registeredStatus: String(row.registeredStatus ?? row.registered_status ?? row.registration_status ?? 'Unregistered').trim() || 'Unregistered',
          registrationDate: normalizeIntroductionDate(row.registrationDate ?? row.registration_date ?? row.date_of_registration),
          agreementFileId: String(row.agreementFileId ?? row.agreement_file_id ?? ''),
          agreementFileName: String(row.agreementFileName ?? row.agreement_file_name ?? ''),
          agreementStoragePath: String(row.agreementStoragePath ?? row.agreement_storage_path ?? ''),
          trademarkFileId: String(row.trademarkFileId ?? row.trademark_file_id ?? ''),
          trademarkFileName: String(row.trademarkFileName ?? row.trademark_file_name ?? ''),
          trademarkStoragePath: String(row.trademarkStoragePath ?? row.trademark_storage_path ?? ''),
        }))
        .filter(cmpf307RowHasContent)
    : []
  return {
    rows: rows.length ? rows : emptyCmpf307Payload().rows,
    brandsWithoutMarkReasons: String(payload?.brandsWithoutMarkReasons ?? payload?.brands_without_mark_reasons ?? '').trim() || 'Not Applicable',
  }
}
