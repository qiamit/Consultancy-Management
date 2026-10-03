import { supabase } from '@/lib/supabaseClient'
import { type PrefixRow } from './testReportNumberPrefix'

/**
 * NABL mandatory ULR format (18 positions, 19 characters):
 *  1     : TC / CC / RC (counts as one position, two characters)
 *  2–6   : accreditation certificate number (5 digits)
 *  7–8   : year (YY)
 *  9     : location (0 = single site)
 * 10–17  : running serial (8 digits; hex allowed)
 * 18     : F (within accredited scope)
 *
 * @see NABL clarification on Unique Laboratory Report (ULR) Number
 */
export const NABL_ULR_POSITION_COUNT = 18
export const NABL_ULR_CHAR_LENGTH = 19
/** @deprecated Use {@link NABL_ULR_CHAR_LENGTH} for input length; positions are 18. */
export const NABL_ULR_TOTAL_LENGTH = NABL_ULR_CHAR_LENGTH

export const NABL_ULR_FIXED_PREFIX = 'TC'
export type NablUlrCabType = 'TC' | 'CC' | 'RC'
export const NABL_ULR_CERT_DIGITS = 5
export const NABL_ULR_YEAR_DIGITS = 2
export const NABL_ULR_LOCATION_DIGITS = 1
export const NABL_ULR_SERIAL_DIGITS = 8
export const NABL_ULR_LAST_CHAR = 'F'

export const DEFAULT_ULR_PREFIX = 'TC'
export const DEFAULT_CALIBRATION_ULR_CAB: NablUlrCabType = 'CC'

/** Lab Settings → Prefix's names for ULR, checked in order */
export const ULR_PREFIX_SETTING_NAMES = ['ULR Number', 'ULR', 'NABL ULR'] as const

const NABL_ULR_PATTERN = new RegExp(
  `^(TC|CC|RC)\\d{${NABL_ULR_CERT_DIGITS}}\\d{${NABL_ULR_YEAR_DIGITS}}[0-9A-F][0-9A-F]{${NABL_ULR_SERIAL_DIGITS}}${NABL_ULR_LAST_CHAR}$`,
)

const HEADER_CHAR_LENGTH =
  NABL_ULR_FIXED_PREFIX.length +
  NABL_ULR_CERT_DIGITS +
  NABL_ULR_YEAR_DIGITS +
  NABL_ULR_LOCATION_DIGITS

function normalizePrefixName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ')
}

export function pickUlrPrefixFromRows(rows: PrefixRow[]): string | null {
  const valid = rows
    .map((r) => ({ name: String(r.name ?? '').trim(), prefix: String(r.prefix ?? '').trim() }))
    .filter((r) => r.name && r.prefix)

  if (valid.length === 0) return null

  const byName = new Map(valid.map((r) => [normalizePrefixName(r.name), r.prefix]))

  for (const settingName of ULR_PREFIX_SETTING_NAMES) {
    const hit = byName.get(normalizePrefixName(settingName))
    if (hit) return hit
  }

  const fuzzy = valid.find((r) => normalizePrefixName(r.name).includes('ulr'))
  return fuzzy?.prefix ?? null
}

export async function fetchUlrPrefix(): Promise<string> {
  const { data, error } = await supabase.from('lab_prefixes').select('name, prefix').order('name')

  if (error) {
    console.warn('[fetchUlrPrefix]', error.message)
    return DEFAULT_ULR_PREFIX
  }

  return pickUlrPrefixFromRows((Array.isArray(data) ? data : []) as PrefixRow[]) ?? DEFAULT_ULR_PREFIX
}

/** Alphanumeric only, uppercase — for segments inside ULR */
export function normalizeUlrAlphanumeric(value: string): string {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, '')
}

export function sanitizeNablUlrInput(value: string): string {
  return normalizeUlrAlphanumeric(value).slice(0, NABL_ULR_CHAR_LENGTH)
}

/**
 * Parse NABL accreditation display (e.g. `CC - 3039`) into CAB type + 5-digit body.
 */
export function parseNablAccreditationCert(raw: string | null | undefined): {
  cab: NablUlrCabType
  digits: string
} | null {
  const t = normalizeUlrAlphanumeric(raw ?? '')
  if (!t) return null
  const m = t.match(/^(TC|CC|RC)(\d+)$/)
  if (m) {
    return {
      cab: m[1] as NablUlrCabType,
      digits: m[2]!.padStart(NABL_ULR_CERT_DIGITS, '0').slice(-NABL_ULR_CERT_DIGITS),
    }
  }
  const digitsOnly = t.replace(/\D/g, '')
  if (!digitsOnly) return null
  return {
    cab: DEFAULT_CALIBRATION_ULR_CAB,
    digits: digitsOnly.padStart(NABL_ULR_CERT_DIGITS, '0').slice(-NABL_ULR_CERT_DIGITS),
  }
}

/**
 * Lab prefix is typically TC/CC/RC + cert (5) + year (2), optionally + location (1).
 * Returns the 10-char header used before the 8-digit serial.
 */
export function normalizeNablUlrHeaderPrefix(
  prefix: string,
  fallbackCab: NablUlrCabType = 'TC',
): string {
  let p = normalizeUlrAlphanumeric(prefix)
  if (!/^(TC|CC|RC)/.test(p)) {
    p = `${fallbackCab}${p}`
  }

  const minHeaderLen =
    NABL_ULR_FIXED_PREFIX.length + NABL_ULR_CERT_DIGITS + NABL_ULR_YEAR_DIGITS
  if (p.length < minHeaderLen) {
    p = p.padEnd(minHeaderLen, '0')
  }

  if (p.length === minHeaderLen) {
    return `${p}0`
  }

  return p.slice(0, HEADER_CHAR_LENGTH)
}

/**
 * Build calibration ULR header from NABL accreditation certificate no.
 * Example: `CC - 3039` + year 2026 → `CC03039260`
 */
export function buildCalibrationUlrHeaderPrefix(
  accreditationCertificateNo: string | null | undefined,
): string {
  const parsed = parseNablAccreditationCert(accreditationCertificateNo)
  const cab = parsed?.cab ?? DEFAULT_CALIBRATION_ULR_CAB
  const digits = parsed?.digits ?? '0'.repeat(NABL_ULR_CERT_DIGITS)
  const year = String(new Date().getFullYear()).slice(-NABL_ULR_YEAR_DIGITS)
  return normalizeNablUlrHeaderPrefix(`${cab}${digits}${year}`, cab)
}

/**
 * Build a 19-character ULR: `{header}{8-digit serial}{F}`.
 * Header = TC/CC/RC + cert (5) + year (2) + location (1); serial starts at 1 each calendar year.
 */
export function formatNablUlrNumber(
  prefix: string,
  sequence: number,
  fallbackCab: NablUlrCabType = 'TC',
): string {
  const header = normalizeNablUlrHeaderPrefix(prefix, fallbackCab)
  const seq = Math.max(1, Math.floor(sequence))
  const serial = String(seq).padStart(NABL_ULR_SERIAL_DIGITS, '0').slice(-NABL_ULR_SERIAL_DIGITS)
  return `${header}${serial}${NABL_ULR_LAST_CHAR}`
}

export function matchesNablUlrStructure(ulr: string): boolean {
  const raw = normalizeUlrAlphanumeric(ulr)
  return raw.length === NABL_ULR_CHAR_LENGTH && NABL_ULR_PATTERN.test(raw)
}

/** Extract serial from stored ULR if it matches prefix + NABL structure */
export function parseNablUlrSequence(
  ulr: string,
  prefix: string,
  fallbackCab: NablUlrCabType = 'TC',
): number | null {
  const raw = normalizeUlrAlphanumeric(ulr)
  if (!matchesNablUlrStructure(raw)) return null

  const header = normalizeNablUlrHeaderPrefix(prefix, fallbackCab)
  if (!raw.startsWith(header)) return null

  const serialPart = raw.slice(HEADER_CHAR_LENGTH, -1)
  const n = parseInt(serialPart, 10)
  return Number.isFinite(n) && n >= 1 ? n : null
}

export function isValidNablUlrFormat(
  ulr: string,
  prefix: string,
  fallbackCab: NablUlrCabType = 'TC',
): boolean {
  return parseNablUlrSequence(ulr, prefix, fallbackCab) !== null
}

export function nablUlrPlaceholder(prefix?: string): string {
  if (prefix?.trim()) {
    return formatNablUlrNumber(prefix, 1)
  }
  const year = String(new Date().getFullYear()).slice(-2)
  return `${NABL_ULR_FIXED_PREFIX}${'0'.repeat(NABL_ULR_CERT_DIGITS)}${year}0${'0'.repeat(NABL_ULR_SERIAL_DIGITS - 1)}1${NABL_ULR_LAST_CHAR}`
}

export async function fetchNextNablUlrNumber(excludeSampleId?: string): Promise<{
  prefix: string
  ulr: string
  sequence: number
}> {
  const prefix = await fetchUlrPrefix()

  let query = supabase
    .from('samples')
    .select('id, test_report_nabl_ulr_number')
    .not('test_report_nabl_ulr_number', 'is', null)

  if (excludeSampleId) {
    query = query.neq('id', excludeSampleId)
  }

  const { data, error } = await query
  if (error) {
    console.warn('[fetchNextNablUlrNumber]', error.message)
    return { prefix, ulr: formatNablUlrNumber(prefix, 1), sequence: 1 }
  }

  let maxSeq = 0
  for (const row of Array.isArray(data) ? data : []) {
    const num = row.test_report_nabl_ulr_number as string | null
    if (!num?.trim()) continue
    const parsed = parseNablUlrSequence(num, prefix)
    if (parsed !== null && parsed > maxSeq) maxSeq = parsed
  }

  const sequence = maxSeq + 1
  return {
    prefix,
    ulr: formatNablUlrNumber(prefix, sequence),
    sequence,
  }
}

/**
 * Next ULR for Calibration Certificates (NABL CC scope).
 * Uses Lab Settings ULR prefix when set; otherwise builds from accreditation cert (CC-xxxx).
 * Serial is lab-wide across test-report ULRs + calibration certificate drafts for the same header year.
 */
export async function fetchNextCalibrationNablUlrNumber(opts?: {
  accreditationCertificateNo?: string | null
  excludeJobId?: string
}): Promise<{ prefix: string; ulr: string; sequence: number }> {
  const settingPrefix = await fetchUlrPrefix()
  const fromAccreditation = buildCalibrationUlrHeaderPrefix(opts?.accreditationCertificateNo)
  const parsedAcc = parseNablAccreditationCert(opts?.accreditationCertificateNo)
  const cab: NablUlrCabType = parsedAcc?.cab ?? DEFAULT_CALIBRATION_ULR_CAB

  // Prefer an explicit Lab Settings ULR prefix when it is not just the bare testing default.
  const useSettings =
    settingPrefix.trim().length > 0 &&
    normalizeUlrAlphanumeric(settingPrefix) !== DEFAULT_ULR_PREFIX

  const prefix = useSettings ? settingPrefix : fromAccreditation
  const fallbackCab = useSettings ? 'TC' : cab

  const [samplesRes, jobsRes] = await Promise.all([
    supabase
      .from('samples')
      .select('test_report_nabl_ulr_number')
      .not('test_report_nabl_ulr_number', 'is', null),
    (() => {
      let q = supabase
        .from('calibration_jobs')
        .select('id, certificate_draft')
        .neq('certificate_draft', '{}')
        .limit(500)
      if (opts?.excludeJobId) q = q.neq('id', opts.excludeJobId)
      return q
    })(),
  ])

  if (samplesRes.error) {
    console.warn('[fetchNextCalibrationNablUlrNumber] samples', samplesRes.error.message)
  }
  if (jobsRes.error) {
    console.warn('[fetchNextCalibrationNablUlrNumber] jobs', jobsRes.error.message)
  }

  let maxSeq = 0
  const consider = (raw: string | null | undefined) => {
    if (!raw?.trim()) return
    const parsed = parseNablUlrSequence(raw, prefix, fallbackCab)
    if (parsed !== null && parsed > maxSeq) maxSeq = parsed
  }

  for (const row of Array.isArray(samplesRes.data) ? samplesRes.data : []) {
    consider(row.test_report_nabl_ulr_number as string | null)
  }
  for (const row of Array.isArray(jobsRes.data) ? jobsRes.data : []) {
    const draft = (row as { certificate_draft?: unknown }).certificate_draft
    if (!draft || typeof draft !== 'object') continue
    const num = String(
      (draft as Record<string, unknown>).ulrNumber ??
        (draft as Record<string, unknown>).ulr_number ??
        '',
    ).trim()
    consider(num)
  }

  const sequence = maxSeq + 1
  return {
    prefix,
    ulr: formatNablUlrNumber(prefix, sequence, fallbackCab),
    sequence,
  }
}
