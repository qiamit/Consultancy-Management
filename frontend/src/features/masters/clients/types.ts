export type CompanyType =
  | 'Manufacturer'
  | 'Service Provider'
  | 'Testing Laboratory'
  | 'Calibration Laboratory'
  | 'PT Provider'
  | 'Supplier'

export type CompanyScale = 'Large' | 'Medium' | 'Small' | 'Micro'

export type BalanceType = 'Cr' | 'Dr'

export type PaymentTerm = '100 % Advance' | '15 Days' | '30 Days' | '45 Days' | '60 Days'

export type ClientRow = {
  id: string
  gst_number: string | null
  company_type: CompanyType
  company_scale: CompanyScale
  company_name: string
  contact_person_name: string | null
  country_code: string | null
  mobile: string | null
  email: string | null
  address: string | null
  pin_code: string | null
  district: string | null
  state: string | null
  country: string | null
  opening_balance: number | null
  balance_type: BalanceType
  payment_term: PaymentTerm
  remark: string | null
  created_at?: string
}

export type ClientForm = {
  gstNumber: string
  companyType: CompanyType
  companyScale: CompanyScale
  companyName: string
  contactPersonName: string
  countryCode: string
  mobile: string
  email: string
  address: string
  pinCode: string
  district: string
  state: string
  country: string
  openingBalance: string
  balanceType: BalanceType
  paymentTerm: PaymentTerm
  remark: string
}

export const COMPANY_TYPES: CompanyType[] = [
  'Manufacturer',
  'Service Provider',
  'Testing Laboratory',
  'Calibration Laboratory',
  'PT Provider',
  'Supplier',
]

export const COMPANY_SCALES: CompanyScale[] = ['Large', 'Medium', 'Small', 'Micro']

export const BALANCE_TYPES: BalanceType[] = ['Cr', 'Dr']

export const PAYMENT_TERMS: PaymentTerm[] = ['100 % Advance', '15 Days', '30 Days', '45 Days', '60 Days']

export const DEFAULT_STATE = 'Chhattisgarh'
export const DEFAULT_COUNTRY = 'India'

export const INDIA_STATES = [
  'Andhra Pradesh',
  'Arunachal Pradesh',
  'Assam',
  'Bihar',
  'Chhattisgarh',
  'Goa',
  'Gujarat',
  'Haryana',
  'Himachal Pradesh',
  'Jharkhand',
  'Karnataka',
  'Kerala',
  'Madhya Pradesh',
  'Maharashtra',
  'Manipur',
  'Meghalaya',
  'Mizoram',
  'Nagaland',
  'Odisha',
  'Punjab',
  'Rajasthan',
  'Sikkim',
  'Tamil Nadu',
  'Telangana',
  'Tripura',
  'Uttar Pradesh',
  'Uttarakhand',
  'West Bengal',
  'Delhi',
  'Jammu and Kashmir',
  'Ladakh',
  'Puducherry',
]

export const WORLD_COUNTRIES = [
  'Afghanistan',
  'Australia',
  'Bangladesh',
  'Bhutan',
  'Brazil',
  'Canada',
  'China',
  'France',
  'Germany',
  'India',
  'Indonesia',
  'Italy',
  'Japan',
  'Malaysia',
  'Nepal',
  'New Zealand',
  'Pakistan',
  'Singapore',
  'South Africa',
  'Sri Lanka',
  'United Arab Emirates',
  'United Kingdom',
  'United States',
]

export const COUNTRY_CODES = [
  { value: '+91', label: '+91 (IN)' },
  { value: '+977', label: '+977 (NP)' },
  { value: '+975', label: '+975 (BT)' },
]

export const isValidGst = (value: string) => {
  const v = value.trim().toUpperCase()
  if (!v) return true
  return /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/.test(v)
}

export const isValidIndianPin = (value: string) => {
  const v = value.trim()
  if (!v) return true
  return /^[1-9][0-9]{5}$/.test(v)
}

export const isValidMobile = (value: string) => {
  const v = value.trim()
  if (!v) return true
  return /^[0-9]{10}$/.test(v)
}

export const isValidEmail = (value: string) => {
  const v = value.trim()
  if (!v) return true
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)
}

export const emptyClientForm = (): ClientForm => ({
  gstNumber: '',
  companyType: 'Manufacturer',
  companyScale: 'Medium',
  companyName: '',
  contactPersonName: '',
  countryCode: '+91',
  mobile: '',
  email: '',
  address: '',
  pinCode: '',
  district: 'Raipur',
  state: DEFAULT_STATE,
  country: DEFAULT_COUNTRY,
  openingBalance: '',
  balanceType: 'Dr',
  paymentTerm: '100 % Advance',
  remark: '',
})

export function toContinuousText(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

const TITLE_SMALL_WORDS = new Set([
  'a',
  'an',
  'the',
  'and',
  'but',
  'or',
  'nor',
  'for',
  'of',
  'on',
  'at',
  'to',
  'from',
  'by',
  'in',
  'into',
  'onto',
  'with',
  'as',
  'over',
  'per',
  'via',
  'vs',
  'vs.',
])

function capitalizeCore(core: string): string {
  if (!core) return core
  if (/^\d+[a-z]?$/i.test(core)) return core
  return core.charAt(0).toUpperCase() + core.slice(1).toLowerCase()
}

function formatTitleSegment(segment: string, capitalize: boolean): string {
  const match = segment.match(/^([^A-Za-z0-9]*)(.*?)([^A-Za-z0-9]*)$/)
  if (!match) return capitalize ? capitalizeCore(segment) : segment.toLowerCase()
  const [, lead, core, trail] = match
  if (!core) return segment
  if (!capitalize) return `${lead}${core.toLowerCase()}${trail}`
  return `${lead}${capitalizeCore(core)}${trail}`
}

/** Proper title case — same rules as IS Code Title (small words stay lowercase mid-phrase). */
export function toProperTitleCase(raw: string): string {
  const text = raw.trim().replace(/\s+/g, ' ')
  if (!text) return ''
  const words = text.split(' ')
  return words
    .map((word, wordIndex) => {
      const parts = word.split('-')
      return parts
        .map((part, partIndex) => {
          const isFirst = wordIndex === 0 && partIndex === 0
          const isLast = wordIndex === words.length - 1 && partIndex === parts.length - 1
          const core = part.replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9]+$/g, '').toLowerCase()
          const capitalize = isFirst || isLast || !TITLE_SMALL_WORDS.has(core)
          return formatTitleSegment(part, capitalize)
        })
        .join('-')
    })
    .join(' ')
}

export function formatClientAddress(
  row: Pick<ClientRow, 'address' | 'district' | 'pin_code' | 'state' | 'country'>,
): string {
  const parts = [row.address, row.district, row.pin_code, row.state, row.country]
    .filter((part): part is string => Boolean(part?.trim()))
    .map((part) => toContinuousText(part))
  return parts.length > 0 ? parts.join(', ') : '-'
}

/** Firm name + full postal address (address, city/district, PIN, state, country) as continuous text. */
export function formatClientCustomerDetails(
  row:
    | Partial<Pick<ClientRow, 'company_name' | 'address' | 'district' | 'pin_code' | 'state' | 'country'>>
    | null
    | undefined,
  options?: { fallbackFirmName?: string | null },
): string | null {
  const firmName = (row?.company_name?.trim() || options?.fallbackFirmName?.trim() || '').trim()
  const segments: string[] = []
  if (firmName) segments.push(toContinuousText(firmName))
  for (const field of [row?.address, row?.district, row?.pin_code, row?.state, row?.country]) {
    const trimmed = field?.trim()
    if (trimmed) segments.push(toContinuousText(trimmed))
  }
  return segments.length > 0 ? segments.join(', ') : null
}

export function formatClientContact(
  row: Pick<ClientRow, 'contact_person_name' | 'email' | 'country_code' | 'mobile'>,
): string {
  const { name, email, mobile } = formatClientContactLines(row)
  const parts = [name, email, mobile].filter((part) => part.trim().length > 0)
  return parts.length > 0 ? parts.join(', ') : ''
}

export function formatClientContactLines(
  row: Pick<ClientRow, 'contact_person_name' | 'email' | 'country_code' | 'mobile'>,
): { name: string; email: string; mobile: string } {
  const phone = toContinuousText(`${row.country_code || ''} ${row.mobile || ''}`)
  return {
    name: row.contact_person_name?.trim() ? toContinuousText(row.contact_person_name) : '',
    email: row.email?.trim() ? toContinuousText(row.email) : '',
    mobile: phone || '',
  }
}
