import type { Cmpf307BrandRow } from '../print/cmpf307Html'

export type { Cmpf307BrandRow }

export type Cmpf307ModulePayload = {
  rows: Cmpf307BrandRow[]
  licenseValidUpTo: string
  brandNamesBeingUsed: string
  brandsWithoutMarkReasons: string
  place: string
  declarationDate: string
  signatoryName: string
  signatoryDesignation: string
}

export function cmpf307RowHasContent(row: Cmpf307BrandRow): boolean {
  return Object.values(row).some((value) => String(value ?? '').trim())
}

export function emptyCmpf307Payload(): Cmpf307ModulePayload {
  return { rows: [], licenseValidUpTo: '', brandNamesBeingUsed: '', brandsWithoutMarkReasons: '', place: '', declarationDate: new Date().toISOString().slice(0, 10), signatoryName: '', signatoryDesignation: '' }
}

export function parseCmpf307Payload(payload: Record<string, unknown> | null): Cmpf307ModulePayload {
  const rows = Array.isArray(payload?.rows)
    ? payload.rows
        .filter((item): item is Record<string, unknown> => !!item && typeof item === 'object')
        .map((row) => ({
          brandName: String(row.brandName ?? row.brand_name ?? row.brand ?? '').trim(),
          ownedBy: String(row.ownedBy ?? row.owned_by ?? row.owner ?? '').trim(),
          registeredStatus: String(row.registeredStatus ?? row.registered_status ?? row.registration_status ?? '').trim(),
          registrationDate: String(row.registrationDate ?? row.registration_date ?? row.date_of_registration ?? '').trim(),
        }))
        .filter(cmpf307RowHasContent)
    : []
  return {
    rows,
    licenseValidUpTo: String(payload?.licenseValidUpTo ?? payload?.license_valid_up_to ?? '').trim(),
    brandNamesBeingUsed: String(payload?.brandNamesBeingUsed ?? payload?.brand_names_being_used ?? '').trim(),
    brandsWithoutMarkReasons: String(payload?.brandsWithoutMarkReasons ?? payload?.brands_without_mark_reasons ?? '').trim(),
    place: String(payload?.place ?? '').trim(),
    declarationDate: String(payload?.declarationDate ?? payload?.declaration_date ?? '').trim() || new Date().toISOString().slice(0, 10),
    signatoryName: String(payload?.signatoryName ?? payload?.signatory_name ?? '').trim(),
    signatoryDesignation: String(payload?.signatoryDesignation ?? payload?.signatory_designation ?? '').trim(),
  }
}
