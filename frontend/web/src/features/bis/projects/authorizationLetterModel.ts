import { todayIsoDate } from './types'
import type { DeclarationFile } from './manakDeclarationFiles'

type Payload = Record<string, unknown> | null | undefined
const str = (value: unknown) => typeof value === 'string' ? value.trim() : ''

export type AuthorizationPerson = {
  key: string
  name: string
  designation: string
  signature: DeclarationFile | null
}

export type AuthorizationLetterSettings = {
  selectionVersion: 1
  authorizedPersonKey: string
  authorizedByKey: string
  letterDate: string
  includePersonSignature: boolean
  includeBySignature: boolean
  includeFirmSeal: boolean
  sealFile: DeclarationFile | null
}

/** Names alone are ambiguous; preserve the management entry identity across row reordering. */
export function authorizationPersonKey(row: Record<string, unknown>): string {
  return JSON.stringify(['personName', 'designation', 'email', 'mobile'].map((field) => str(row[field]).toLowerCase()))
}

export function authorizationPeople(tm: Payload): AuthorizationPerson[] {
  const rows = Array.isArray(tm?.rows) ? tm.rows : []
  const people: AuthorizationPerson[] = []
  for (const entry of rows) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue
    const row = entry as Record<string, unknown>
    const name = str(row.personName)
    if (!name) continue
    const key = authorizationPersonKey(row)
    if (people.some((person) => person.key === key)) continue
    const legacyName = str(tm?.authorizedSignatoryName).toLowerCase()
    const legacyDesignation = str(tm?.authorizedSignatoryDesignation).toLowerCase()
    const legacyMatches = rows.filter((item) => item && typeof item === 'object' && str((item as Record<string, unknown>).personName).toLowerCase() === legacyName && (!legacyDesignation || str((item as Record<string, unknown>).designation).toLowerCase() === legacyDesignation))
    const legacySignature = legacyMatches.length === 1 && name.toLowerCase() === legacyName && (!legacyDesignation || str(row.designation).toLowerCase() === legacyDesignation)
    const path = str(row.signatureStoragePath) || (legacySignature ? str(tm?.authorizedSignatureStoragePath) : '')
    people.push({
      key, name, designation: str(row.designation),
      signature: path ? {
        id: str(row.signatureFileId) || (legacySignature ? str(tm?.authorizedSignatureFileId) : ''),
        fileName: str(row.signatureFileName) || (legacySignature ? str(tm?.authorizedSignatureFileName) : '') || 'Signature.png',
        storagePath: path,
      } : null,
    })
  }
  return people
}

export function authorizationLetterSettings(raw: Payload, tm: Payload): AuthorizationLetterSettings {
  const people = authorizationPeople(tm)
  const findUnique = (name: string) => {
    const matches = people.filter((person) => person.name.toLowerCase() === name.toLowerCase())
    return matches.length === 1 ? matches[0].key : ''
  }
  const selectedRows = Array.isArray(tm?.rows) ? tm.rows.filter((row) => row && typeof row === 'object' && (row as Record<string, unknown>).isAuthorizedSignatory) : []
  const defaultPerson = selectedRows.length === 1 ? authorizationPersonKey(selectedRows[0] as Record<string, unknown>) : findUnique(str(tm?.authorizedSignatoryName))
  const stored = raw?.selectionVersion === 1
  const seal = raw?.sealFile && typeof raw.sealFile === 'object' ? raw.sealFile as Record<string, unknown> : null
  return {
    selectionVersion: 1,
    authorizedPersonKey: stored ? str(raw.authorizedPersonKey) : defaultPerson,
    authorizedByKey: stored ? str(raw.authorizedByKey) : findUnique(str(tm?.authorizedBy) || str(tm?.signatoryName)),
    letterDate: str(raw?.letterDate) || todayIsoDate(),
    includePersonSignature: raw?.includePersonSignature !== false,
    includeBySignature: raw?.includeBySignature !== false,
    // Management signature images already contain the seal where required.
    includeFirmSeal: false,
    sealFile: seal && str(seal.id) && str(seal.storagePath) ? { id: str(seal.id), fileName: str(seal.fileName) || 'Firm Seal.png', storagePath: str(seal.storagePath) } : null,
  }
}

export function authorizationLetterSelectionError(settings: AuthorizationLetterSettings, tm: Payload): string | null {
  const people = authorizationPeople(tm)
  if (!people.some((person) => person.key === settings.authorizedPersonKey)) return 'Select the Authorized Person from Top Management.'
  if (!people.some((person) => person.key === settings.authorizedByKey)) return 'Select Authorized By from Top Management.'
  if (!/^\d{4}-\d{2}-\d{2}$/.test(settings.letterDate)) return 'Enter the letter date.'
  for (const [key, include] of [[settings.authorizedPersonKey, settings.includePersonSignature], [settings.authorizedByKey, settings.includeBySignature]] as const) {
    const person = people.find((item) => item.key === key)
    if (include && /\.pdf$/i.test(person?.signature?.storagePath ?? '')) return `Upload a PNG, JPG or WebP signature for ${person?.name}, or turn off Include Signature.`
  }
  if (settings.includeFirmSeal && !settings.sealFile) return 'Upload the firm seal or turn off Include Firm Seal.'
  return null
}

export function authorizationLetterSources(raw: Payload, tm: Payload) {
  const settings = authorizationLetterSettings(raw, tm)
  const people = authorizationPeople(tm)
  return {
    settings,
    person: people.find((person) => person.key === settings.authorizedPersonKey),
    authorizer: people.find((person) => person.key === settings.authorizedByKey),
  }
}
