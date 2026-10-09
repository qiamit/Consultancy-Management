import { isValidGstin } from '@/lib/indiaValidators'

export type CompanyType =
  | 'Manufacturer'
  | 'Service Provider'
  | 'Testing Laboratory'
  | 'Calibration Laboratory'
  | 'PT Provider'
  | 'Supplier'
  | 'Buyer'
  | 'Vendor'
  | 'Both'
  | 'Importer'
  | 'Foreign Manufacturer'
  | 'Trader'

export type ClientStatus = 'Prospect' | 'Active' | 'Inactive' | 'Blacklisted'
export type ClientSector = '' | 'Private' | 'Public' | 'Government' | 'Cooperative' | 'Other'
export type SiteRole = 'Registered Office' | 'Factory' | 'Other'
export type ContactRole = 'Primary' | 'Signatory' | 'Top Management' | 'Technical' | 'Accounts' | 'Other'

export type ClientSiteForm = {
  id?: string
  siteRole: SiteRole
  address: string
  district: string
  state: string
  pinCode: string
  gstNumber: string
  isPrimary: boolean
}

export type ClientContactForm = {
  id?: string
  contactRole: ContactRole
  name: string
  designation: string
  mobile: string
  email: string
  isPrimary: boolean
}

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
  payment_term: string | null
  remark: string | null
  pan?: string | null
  sector?: string | null
  client_status?: string | null
  created_at?: string
  archived_at?: string | null
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
  pan: string
  cin: string
  llpin: string
  udyamNo: string
  msmeCategory: string
  udyamDate: string
  constitution: string
  sector: ClientSector
  isStartup: boolean
  startupDpiitNo: string
  isWomenEntrepreneur: boolean
  gstRegistrationType: string
  gstStateCode: string
  clientStatus: ClientStatus
  leadSource: string
  referredBy: string
  panFromGstin: boolean
  sites: ClientSiteForm[]
  contacts: ClientContactForm[]
}

export const COMPANY_TYPES: CompanyType[] = [
  'Manufacturer',
  'Service Provider',
  'Testing Laboratory',
  'Calibration Laboratory',
  'PT Provider',
  'Supplier',
  'Buyer',
  'Vendor',
  'Both',
  'Importer',
  'Foreign Manufacturer',
  'Trader',
]

export const CLIENT_STATUSES: ClientStatus[] = ['Prospect', 'Active', 'Inactive', 'Blacklisted']
export const CLIENT_SECTORS: Array<Exclude<ClientSector, ''>> = ['Private', 'Public', 'Government', 'Cooperative', 'Other']
export const SITE_ROLES: SiteRole[] = ['Registered Office', 'Factory', 'Other']
export const CONTACT_ROLES: ContactRole[] = ['Primary', 'Signatory', 'Top Management', 'Technical', 'Accounts', 'Other']

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
  'Chandigarh',
  'Puducherry',
  'Dadra and Nagar Haveli and Daman and Diu',
  'Lakshadweep',
  'Andaman and Nicobar Islands',
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

export const isValidGst = (value: string) => isValidGstin(value)

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

export function emptyClientSites(): ClientSiteForm[] {
  return [
    { siteRole: 'Registered Office', address: '', district: '', state: DEFAULT_STATE, pinCode: '', gstNumber: '', isPrimary: true },
    { siteRole: 'Factory', address: '', district: '', state: DEFAULT_STATE, pinCode: '', gstNumber: '', isPrimary: false },
  ]
}

export function emptyClientContacts(): ClientContactForm[] {
  return [{ contactRole: 'Primary', name: '', designation: '', mobile: '', email: '', isPrimary: true }]
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
  pan: '',
  cin: '',
  llpin: '',
  udyamNo: '',
  msmeCategory: '',
  udyamDate: '',
  constitution: '',
  sector: '',
  isStartup: false,
  startupDpiitNo: '',
  isWomenEntrepreneur: false,
  gstRegistrationType: '',
  gstStateCode: '',
  clientStatus: 'Active',
  leadSource: '',
  referredBy: '',
  panFromGstin: false,
  sites: emptyClientSites(),
  contacts: emptyClientContacts(),
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

/** Legal / org suffixes & acronyms that should stay fully uppercase. */
const TITLE_FORCE_UPPER = new Set([
  'LLP',
  'OPC',
  'LLC',
  'ISO',
  'BIS',
  'GST',
  'MSME',
  'SME',
  'NABL',
  'QCI',
  'DPIIT',
  'FDI',
  'SEZ',
  'IEC',
  'CIN',
  'PAN',
  'UDI',
  'UDIAM',
  'NSIC',
  'SSI',
])

function capitalizeCore(core: string): string {
  if (!core) return core
  if (/^\d+[a-z]?$/i.test(core)) return core
  // Keep intentional ALL CAPS (e.g. user typed "LLP", "ISO").
  if (core.length >= 2 && core === core.toUpperCase() && /[A-Z]/.test(core)) {
    return core
  }
  const upper = core.toUpperCase()
  if (TITLE_FORCE_UPPER.has(upper)) return upper
  return core.charAt(0).toUpperCase() + core.slice(1).toLowerCase()
}

function formatTitleSegment(segment: string, capitalize: boolean): string {
  const match = segment.match(/^([^A-Za-z0-9]*)(.*?)([^A-Za-z0-9]*)$/)
  if (!match) return capitalize ? capitalizeCore(segment) : segment.toLowerCase()
  const [, lead, core, trail] = match
  if (!core) return segment
  // Always preserve ALL CAPS / known acronyms even mid-phrase.
  if (
    (core.length >= 2 && core === core.toUpperCase() && /[A-Z]/.test(core)) ||
    TITLE_FORCE_UPPER.has(core.toUpperCase())
  ) {
    return `${lead}${capitalizeCore(core)}${trail}`
  }
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
