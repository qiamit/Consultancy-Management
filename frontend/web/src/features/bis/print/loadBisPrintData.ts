import { supabase } from '@/lib/supabaseClient'
import { formatIsCodeLabelFromParts } from '@/features/masters/is-codes/formatIsCodeLabel'
import { clientDisplayName, type BisProjectRow } from '../projects/types'
import { loadCompanyPrintContext, type CompanyPrintContext } from './loadCompanyPrintContext'

export type BisPrintClient = {
  companyName: string
  contactPerson: string
  mobile: string
  email: string
  address: string
  pinCode: string
  district: string
  state: string
  country: string
  gstNumber: string
  scale: string
  sector: string
  officeAddress: string
  factoryAddress: string
  factoryDistrict: string
  factoryState: string
  factoryPin: string
  topManagement: { name: string; designation: string }[]
}

export type BisPrintIsCode = {
  isNumber: string
  revisionYear: string
  title: string
  label: string
}

/** Authorized signatory overlay applied to all BIS print documents when enabled. */
export type BisPrintDocumentSignatory = {
  name: string
  designation: string
  signatureImageUrl?: string
}

export type BisPrintData = {
  row: BisProjectRow
  client: BisPrintClient
  isCode: BisPrintIsCode
  company: CompanyPrintContext
  /** Optional Module Edit JSON for the document kind being printed. */
  modulePayload?: Record<string, unknown> | null
  /** Top Management module payload (for signatory / authorization letter fields). */
  topManagement?: Record<string, unknown> | null
  /** When set, print builders should prefer this signatory on documents. */
  documentSignatory?: BisPrintDocumentSignatory | null
}

/** Prefer project-wide authorized signatory when the Top Management flag is on. */
export function printSignatoryDefaults(printData: BisPrintData): {
  signatoryName: string
  signatoryDesignation: string
  signatureImageUrl?: string
} {
  const overlay = printData.documentSignatory
  if (overlay?.name.trim()) {
    return {
      signatoryName: overlay.name.trim(),
      signatoryDesignation: overlay.designation.trim(),
      signatureImageUrl: overlay.signatureImageUrl,
    }
  }
  return {
    signatoryName: printData.client.contactPerson,
    signatoryDesignation: '',
  }
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : value == null ? '' : String(value).trim()
}

async function loadClient(row: BisProjectRow): Promise<BisPrintClient> {
  const fallbackName = clientDisplayName(row)
  const empty: BisPrintClient = {
    companyName: fallbackName,
    contactPerson: '',
    mobile: '',
    email: '',
    address: '',
    pinCode: '',
    district: '',
    state: '',
    country: 'India',
    gstNumber: '',
    scale: '',
    sector: '',
    officeAddress: '',
    factoryAddress: '',
    factoryDistrict: '',
    factoryState: '',
    factoryPin: '',
    topManagement: [],
  }
  if (!row.client_id) return empty

  const { data, error } = await supabase.from('clients').select('*').eq('id', row.client_id).maybeSingle()
  if (error || !data) return empty
  const c = data as Record<string, unknown>
  const code = text(c.country_code)
  const mobile = text(c.mobile)
  const loaded: BisPrintClient = {
    companyName: text(c.company_name) || fallbackName,
    contactPerson: text(c.contact_person_name),
    mobile: mobile && code && !mobile.startsWith('+') ? `${code} ${mobile}` : mobile,
    email: text(c.email),
    address: text(c.address),
    pinCode: text(c.pin_code),
    district: text(c.district),
    state: text(c.state),
    country: text(c.country) || 'India',
    gstNumber: text(c.gst_number),
    scale: text(c.company_scale),
    sector: text(c.sector),
    officeAddress: text(c.address),
    factoryAddress: text(c.address),
    factoryDistrict: text(c.district),
    factoryState: text(c.state),
    factoryPin: text(c.pin_code),
    topManagement: [],
  }
  const clientId = text(c.id) || row.client_id
  if (!clientId) return loaded
  const [sitesRes, contactsRes] = await Promise.all([
    supabase.from('client_sites').select('id, site_role, address, district, state, pin_code, is_primary').eq('client_id', clientId),
    supabase.from('client_contacts').select('name, designation, contact_role, is_primary').eq('client_id', clientId),
  ])
  if (!sitesRes.error && Array.isArray(sitesRes.data)) {
    const sites = sitesRes.data as Array<Record<string, unknown>>
    const office = sites.find((site) => site.is_primary) || sites.find((site) => site.site_role === 'Registered Office')
    const factory = sites.find((site) => site.id === row.factory_site_id) || sites.find((site) => site.site_role === 'Factory')
    if (office) loaded.officeAddress = text(office.address) || loaded.officeAddress
    if (factory) {
      loaded.factoryAddress = text(factory.address) || loaded.factoryAddress
      loaded.factoryDistrict = text(factory.district)
      loaded.factoryState = text(factory.state)
      loaded.factoryPin = text(factory.pin_code)
    }
  }
  if (!contactsRes.error && Array.isArray(contactsRes.data)) {
    const people = (contactsRes.data as Array<Record<string, unknown>>).filter((person) => {
      const role = text(person.contact_role)
      return role === 'Signatory' || role === 'Top Management'
    })
    loaded.topManagement = people.map((person) => ({
      name: text(person.name),
      designation: text(person.designation),
    })).filter((person) => person.name)
  }
  return loaded
}

async function loadIsCode(row: BisProjectRow): Promise<BisPrintIsCode> {
  const joined = row.is_code
  let isNumber = text(joined?.is_number)
  let revisionYear = text(joined?.revision_year)
  let title = text(joined?.title)

  if (row.is_code_id && (!isNumber || !title)) {
    const { data } = await supabase
      .from('is_codes')
      .select('is_number, revision_year, title')
      .eq('id', row.is_code_id)
      .maybeSingle()
    if (data) {
      const r = data as Record<string, unknown>
      isNumber = text(r.is_number) || isNumber
      revisionYear = text(r.revision_year) || revisionYear
      title = text(r.title) || title
    }
  }

  return {
    isNumber,
    revisionYear,
    title,
    label: formatIsCodeLabelFromParts(isNumber, revisionYear) || isNumber,
  }
}

/** Loads everything the Form-I / Authorization Letter builders need for one project row. */
export async function loadBisPrintData(row: BisProjectRow): Promise<BisPrintData> {
  const [client, isCode, company] = await Promise.all([
    loadClient(row),
    loadIsCode(row),
    loadCompanyPrintContext(),
  ])
  return { row, client, isCode, company }
}
