import { todayIsoDate } from './types'

export type RawMaterialSupplierRow = {
  rawMaterial: string
  supplierName: string
  bisCertificationMark: string
  testCertificate: string
  batchesPackaging: string
}

export type CertifiedReferenceMaterialRow = {
  crmName: string
  crmNumber: string
  crmType: string
  validity: string
  traceability: string
}

export type RawMaterialReferencePayload = {
  rawMaterials: RawMaterialSupplierRow[]
  certifiedReferenceMaterials: CertifiedReferenceMaterialRow[]
}

/** Conformity of Material choices (stored in `bisCertificationMark`). */
export const RAW_MATERIAL_CONFORMITY_OPTIONS = [
  'ISI Marked',
  'Test Report From BIS Recognized Lab',
  'Test Certificate from Supplier',
  'Tested In House',
  'Any Other',
]

/** Older rows stored With / Without BIS mark; "With" is the same as ISI Marked. */
export const rawMaterialConformity = (value: string): string => (value.trim() === 'With' ? 'ISI Marked' : value)

export const emptyRawMaterialSupplierRow = (): RawMaterialSupplierRow => ({
  rawMaterial: '',
  supplierName: '',
  bisCertificationMark: 'ISI Marked',
  testCertificate: 'Yes',
  batchesPackaging: 'Batch',
})

export const emptyCertifiedReferenceMaterialRow = (): CertifiedReferenceMaterialRow => ({
  crmName: '',
  crmNumber: '',
  crmType: '',
  validity: todayIsoDate(),
  traceability: '',
})

export const emptyRawMaterialReferencePayload = (): RawMaterialReferencePayload => ({
  rawMaterials: [emptyRawMaterialSupplierRow()],
  certifiedReferenceMaterials: [emptyCertifiedReferenceMaterialRow()],
})

const text = (value: unknown) => String(value ?? '').trim()

export function parseRawMaterialReferencePayload(
  raw: Record<string, unknown> | null,
): RawMaterialReferencePayload {
  if (!raw) return emptyRawMaterialReferencePayload()
  const parseRows = <T extends Record<string, string>>(
    value: unknown,
    keys: (keyof T)[],
    emptyRow: () => T,
  ): T[] => {
    if (!Array.isArray(value)) return [emptyRow()]
    const rows = value.map((item) => {
      const source = item && typeof item === 'object' ? item as Record<string, unknown> : {}
      return Object.fromEntries(keys.map((key) => [key, text(source[String(key)])])) as T
    })
    return rows.length ? rows : [emptyRow()]
  }
  return {
    rawMaterials: parseRows<RawMaterialSupplierRow>(
      raw.rawMaterials,
      ['rawMaterial', 'supplierName', 'bisCertificationMark', 'testCertificate', 'batchesPackaging'],
      emptyRawMaterialSupplierRow,
    ).map((row) => ({
      ...row,
      bisCertificationMark: rawMaterialConformity(row.bisCertificationMark) || 'ISI Marked',
      testCertificate: row.testCertificate || 'Yes',
      batchesPackaging: row.batchesPackaging || 'Batch',
    })),
    certifiedReferenceMaterials: parseRows<CertifiedReferenceMaterialRow>(
      raw.certifiedReferenceMaterials,
      ['crmName', 'crmNumber', 'crmType', 'validity', 'traceability'],
      emptyCertifiedReferenceMaterialRow,
    ),
  }
}
