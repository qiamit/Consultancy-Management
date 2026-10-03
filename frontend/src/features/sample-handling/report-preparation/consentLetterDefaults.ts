/** Laboratory credentials and contact fallbacks matching the consent letter template. */
export const CONSENT_LETTER_DEFAULTS = {
  labName: 'Quality International Research & Laboratories Private Limited',
  address:
    'Laboratory: #7A, Avinash Logistic Park, Siltara, Raipur, Chhattisgarh - 493111',
  contacts: '+91 99146 63040, +91 9294553040, +91 99816 33040',
  website: 'www.qipl.org',
  email: 'info@qipl.org',
  bisOslCode: '5197006',
  nablCertificateNo: 'TC-15442',
  numberPrefix: 'QI',
} as const

export function parseConsentLetterDateInput(value: string): Date | null {
  const trimmed = value.trim()
  const m = trimmed.match(/^(\d{2})-(\d{2})-(\d{4})$/)
  if (!m) return null
  const dd = Number(m[1])
  const mm = Number(m[2])
  const yyyy = Number(m[3])
  const d = new Date(yyyy, mm - 1, dd)
  if (d.getFullYear() !== yyyy || d.getMonth() !== mm - 1 || d.getDate() !== dd) return null
  return d
}

export function consentLetterDateKey(date: Date): string {
  const yy = String(date.getFullYear()).slice(-2)
  const mm = String(date.getMonth() + 1).padStart(2, '0')
  const dd = String(date.getDate()).padStart(2, '0')
  return `${yy}${mm}${dd}`
}

export function buildConsentLetterNumberPrefix(date: Date): string {
  return `${CONSENT_LETTER_DEFAULTS.numberPrefix}/${consentLetterDateKey(date)}`
}

export function formatConsentLetterSequence(sequence: number): string {
  return String(Math.max(1, sequence)).padStart(2, '0')
}

export function formatConsentLetterNumber(date: Date, sequence: number): string {
  return `${buildConsentLetterNumberPrefix(date)}-${formatConsentLetterSequence(sequence)}`
}

/** Sync fallback before DB sequence is loaded. */
export function suggestConsentLetterNumber(date = new Date()): string {
  return formatConsentLetterNumber(date, 1)
}

export function formatConsentLetterDate(date = new Date()): string {
  const dd = String(date.getDate()).padStart(2, '0')
  const mm = String(date.getMonth() + 1).padStart(2, '0')
  const yyyy = date.getFullYear()
  return `${dd}-${mm}-${yyyy}`
}

export function splitIsCodeHeaderLines(
  isNumber: string,
  revisionYear: string | null | undefined,
): { left: string; right: string } {
  const num = isNumber.trim()
  const rev = revisionYear?.trim()
  const partMatch = num.match(/^(.*?)(\s+Part\s+[\w.-]+)$/i)
  if (partMatch) {
    const right = rev ? `${partMatch[2].trim()}: ${rev}` : partMatch[2].trim()
    return { left: partMatch[1].trim(), right }
  }
  if (rev) {
    return { left: num, right: `: ${rev}` }
  }
  return { left: num, right: '' }
}

function splitAddressLines(block: string): string[] {
  return block
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
}

/** Store address lines only — company name is kept separately on consent_letters.client_name. */
export function clientAddressForStorage(addressBlock: string, companyName: string): string {
  const name = companyName.trim().toLowerCase()
  const lines = splitAddressLines(addressBlock)
  while (lines.length > 0 && name && lines[0].toLowerCase() === name) {
    lines.shift()
  }
  return lines.join('\n')
}

/** Single-line print: "Client Name - Company, address…" */
export function formatConsentLetterClientDisplayLine(
  clientName: string,
  clientAddress: string,
): string {
  const name = clientName.trim()
  const lines = splitAddressLines(clientAddress)
  while (lines.length > 0 && name && lines[0].toLowerCase() === name.toLowerCase()) {
    lines.shift()
  }
  const parts = [name, ...lines].filter(Boolean)
  if (parts.length === 0) return 'Client Name -'
  return `Client Name - ${parts.join(', ')}`
}

/** Print block: company name once, then address (handles legacy rows with duplicated name). */
export function formatConsentLetterClientBlock(clientName: string, clientAddress: string): string {
  const name = clientName.trim()
  const lines = splitAddressLines(clientAddress)
  while (lines.length > 0 && name && lines[0].toLowerCase() === name.toLowerCase()) {
    lines.shift()
  }
  if (!name) return lines.join('\n')
  if (lines.length === 0) return name
  return `${name}\n${lines.join('\n')}`
}
