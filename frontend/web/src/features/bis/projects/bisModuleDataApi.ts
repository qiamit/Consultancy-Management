import { supabase } from '@/lib/supabaseClient'
import type { BisPrintDocumentKind } from '../print/printBisDocument'
import type { TechnicalStaffRow } from '../print/technicalStaffHtml'
import type { TopManagementRow } from '../print/topManagementHtml'

export type TopManagementModulePayload = {
  rows: TopManagementRow[]
  signatoryName: string
  signatoryDesignation: string
  /** When true, Authorized Signatory section is enabled (prints Authorization Letter too). */
  includeAuthorizedSignatory: boolean
  authorizedSignatoryName: string
  authorizedSignatoryDesignation: string
  authorizedSignatoryEmail: string
  authorizedSignatoryMobile: string
  /** Person name from Top Management table rows (Authorized By). */
  authorizedBy: string
  authorizedSignatureFileId: string
  authorizedSignatureFileName: string
  authorizedSignatureStoragePath: string
  /** When true, authorized signatory (name/designation/signature) is used on all BIS print documents. */
  applyAuthorizedSignatureToDocuments: boolean
}

export type TechnicalStaffModulePayload = {
  rows: TechnicalStaffRow[]
  signatoryName: string
  signatoryDesignation: string
}

function formatApiError(err: unknown): string {
  if (err instanceof Error && err.message.trim()) return err.message
  if (err && typeof err === 'object') {
    const e = err as { message?: unknown; details?: unknown; hint?: unknown; code?: unknown }
    const parts = [e.message, e.details, e.hint, e.code]
      .map((v) => String(v ?? '').trim())
      .filter(Boolean)
    if (parts.length > 0) return parts.join(' — ')
  }
  return 'Something went wrong'
}

export async function fetchBisModulePayload(
  projectId: string,
  moduleKind: BisPrintDocumentKind,
): Promise<Record<string, unknown> | null> {
  const { data, error } = await supabase
    .from('bis_project_module_data')
    .select('payload')
    .eq('bis_project_id', projectId)
    .eq('module_kind', moduleKind)
    .maybeSingle()
  if (error) throw new Error(formatApiError(error))
  const payload = (data as { payload?: unknown } | null)?.payload
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null
  return payload as Record<string, unknown>
}

export async function saveBisModulePayload(
  projectId: string,
  moduleKind: BisPrintDocumentKind,
  payload: Record<string, unknown>,
): Promise<void> {
  const { error } = await supabase.from('bis_project_module_data').upsert(
    {
      bis_project_id: projectId,
      module_kind: moduleKind,
      payload,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'bis_project_id,module_kind' },
  )
  if (error) throw new Error(formatApiError(error))
}

export async function copyBisModulePayload(
  sourceProjectId: string,
  targetProjectId: string,
  moduleKind: BisPrintDocumentKind,
): Promise<boolean> {
  const payload = await fetchBisModulePayload(sourceProjectId, moduleKind)
  if (!payload) return false

  // OSL QR pools must only move via explicit "Import from Application" transfer —
  // never via module Import (that was leaving ghost unused codes on other licenses).
  if (moduleKind === 'osl-sample-requirements') {
    const targetExisting = await fetchBisModulePayload(targetProjectId, moduleKind)
    const keepImported =
      targetExisting && typeof targetExisting === 'object' && !Array.isArray(targetExisting)
        ? (targetExisting as Record<string, unknown>).importedQrCodes ??
          (targetExisting as Record<string, unknown>).imported_qr_codes ??
          []
        : []
    await saveBisModulePayload(targetProjectId, moduleKind, {
      ...payload,
      importedQrCodes: Array.isArray(keepImported) ? keepImported : [],
      imported_qr_codes: undefined,
    })
    return true
  }

  await saveBisModulePayload(targetProjectId, moduleKind, payload)
  return true
}

function asRows<T extends Record<string, string>>(
  raw: unknown,
  keys: (keyof T)[],
): T[] {
  if (!Array.isArray(raw)) return []
  return raw.map((item) => {
    const row = item && typeof item === 'object' ? (item as Record<string, unknown>) : {}
    const out = {} as T
    for (const key of keys) {
      out[key] = String(row[key as string] ?? '').trim() as T[keyof T]
    }
    return out
  })
}

export function parseTopManagementPayload(
  payload: Record<string, unknown> | null,
): TopManagementModulePayload {
  return {
    rows: asRows<TopManagementRow>(payload?.rows, [
      'personName',
      'designation',
      'email',
      'mobile',
      'signatureFileId',
      'signatureFileName',
      'signatureStoragePath',
    ]).map((row, index) => {
      const raw = Array.isArray(payload?.rows) ? payload?.rows[index] : null
      const flag =
        raw && typeof raw === 'object' && !Array.isArray(raw)
          ? Boolean((raw as Record<string, unknown>).applySignatureToDocuments)
          : false
      return { ...row, applySignatureToDocuments: flag }
    }),
    signatoryName: String(payload?.signatoryName ?? '').trim(),
    signatoryDesignation: String(payload?.signatoryDesignation ?? '').trim(),
    includeAuthorizedSignatory:
      Boolean(payload?.includeAuthorizedSignatory) ||
      Boolean(String(payload?.authorizedSignatoryName ?? '').trim()) ||
      Boolean(String(payload?.authorizedSignatoryDesignation ?? '').trim()) ||
      Boolean(String(payload?.authorizedBy ?? '').trim()) ||
      Boolean(String(payload?.authorizedSignatureStoragePath ?? '').trim()) ||
      Boolean(payload?.applyAuthorizedSignatureToDocuments),
    authorizedSignatoryName: String(payload?.authorizedSignatoryName ?? '').trim(),
    authorizedSignatoryDesignation: String(
      payload?.authorizedSignatoryDesignation ?? '',
    ).trim(),
    authorizedSignatoryEmail: String(payload?.authorizedSignatoryEmail ?? '').trim(),
    authorizedSignatoryMobile: String(payload?.authorizedSignatoryMobile ?? '').trim(),
    authorizedBy: String(payload?.authorizedBy ?? '').trim(),
    authorizedSignatureFileId: String(payload?.authorizedSignatureFileId ?? '').trim(),
    authorizedSignatureFileName: String(
      payload?.authorizedSignatureFileName ?? '',
    ).trim(),
    authorizedSignatureStoragePath: String(
      payload?.authorizedSignatureStoragePath ?? '',
    ).trim(),
    applyAuthorizedSignatureToDocuments: Boolean(
      payload?.applyAuthorizedSignatureToDocuments,
    ),
  }
}

export function parseTechnicalStaffPayload(
  payload: Record<string, unknown> | null,
): TechnicalStaffModulePayload {
  return {
    rows: asRows<TechnicalStaffRow>(payload?.rows, [
      'personName',
      'designation',
      'educationalQualification',
      'experienceYears',
      'appointmentDate',
      'appointmentReferenceNo',
      'appointmentLetterFileId',
      'appointmentLetterFileName',
      'appointmentLetterStoragePath',
      'educationCertificateFileId',
      'educationCertificateFileName',
      'educationCertificateStoragePath',
      'photoFileId',
      'photoFileName',
      'photoStoragePath',
      'signatureFileId',
      'signatureFileName',
      'signatureStoragePath',
    ]).map((row, index) => {
      const raw = Array.isArray(payload?.rows) ? payload?.rows[index] : null
      const flag =
        raw && typeof raw === 'object' && !Array.isArray(raw)
          ? Boolean((raw as Record<string, unknown>).applySignatureToDocuments)
          : false
      return { ...row, applySignatureToDocuments: flag }
    }),
    signatoryName: String(payload?.signatoryName ?? '').trim(),
    signatoryDesignation: String(payload?.signatoryDesignation ?? '').trim(),
  }
}

/** Prefer Apply-signature person, then QC-like designation, then first named row / signatory. */
export function resolveTechnicalStaffForTestedBy(
  payload: Record<string, unknown> | null,
): {
  personName: string
  designation: string
  signatureStoragePath: string
  signatureFileName: string
  applySignatureToDocuments: boolean
} | null {
  const parsed = parseTechnicalStaffPayload(payload)
  const named = parsed.rows.filter((r) => r.personName.trim())
  const applied = named.find((r) => r.applySignatureToDocuments) ?? null
  const qcLike =
    named.find((r) =>
      /quality\s*control|\bqc\b|incharge|in-charge|technical\s*staff/i.test(
        `${r.designation} ${r.personName}`,
      ),
    ) ?? null
  const person = applied ?? qcLike ?? named[0] ?? null
  if (person) {
    return {
      personName: person.personName.trim(),
      designation: person.designation.trim(),
      signatureStoragePath: person.signatureStoragePath.trim(),
      signatureFileName: person.signatureFileName.trim(),
      applySignatureToDocuments: Boolean(person.applySignatureToDocuments),
    }
  }
  if (parsed.signatoryName.trim()) {
    return {
      personName: parsed.signatoryName.trim(),
      designation: parsed.signatoryDesignation.trim(),
      signatureStoragePath: '',
      signatureFileName: '',
      applySignatureToDocuments: false,
    }
  }
  return null
}

export function emptyTopManagementPayload(): TopManagementModulePayload {
  return {
    rows: [
      {
        personName: '',
        designation: '',
        email: '',
        mobile: '',
        signatureFileId: '',
        signatureFileName: '',
        signatureStoragePath: '',
        applySignatureToDocuments: false,
      },
    ],
    signatoryName: '',
    signatoryDesignation: '',
    includeAuthorizedSignatory: false,
    authorizedSignatoryName: '',
    authorizedSignatoryDesignation: '',
    authorizedSignatoryEmail: '',
    authorizedSignatoryMobile: '',
    authorizedBy: '',
    authorizedSignatureFileId: '',
    authorizedSignatureFileName: '',
    authorizedSignatureStoragePath: '',
    applyAuthorizedSignatureToDocuments: false,
  }
}

export function emptyTechnicalStaffRow(): TechnicalStaffRow {
  return {
    personName: '',
    designation: '',
    educationalQualification: '',
    experienceYears: '',
    appointmentDate: '',
    appointmentReferenceNo: '',
    appointmentLetterFileId: '',
    appointmentLetterFileName: '',
    appointmentLetterStoragePath: '',
    educationCertificateFileId: '',
    educationCertificateFileName: '',
    educationCertificateStoragePath: '',
    photoFileId: '',
    photoFileName: '',
    photoStoragePath: '',
    signatureFileId: '',
    signatureFileName: '',
    signatureStoragePath: '',
    applySignatureToDocuments: false,
  }
}

export function emptyTechnicalStaffPayload(): TechnicalStaffModulePayload {
  return {
    rows: [emptyTechnicalStaffRow()],
    signatoryName: '',
    signatoryDesignation: '',
  }
}
