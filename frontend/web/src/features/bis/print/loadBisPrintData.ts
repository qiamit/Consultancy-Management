import { supabase } from '@/lib/supabaseClient'
import { formatIsCodeLabel } from '@/features/masters/is-codes/formatIsCodeLabel'
import { fetchBisProjectById } from '../projects/bisProjectsApi'
import { clientDisplayName, type BisProjectRow } from '../projects/types'
import { loadCompanyPrintContext, type CompanyPrintContext } from './loadCompanyPrintContext'

export type BisPrintClient = {
  companyName: string
  contactPerson: string
  /** CEO / Managing Director (Manak "CEO Name"); falls back to the contact person. */
  ceoName: string
  /** Office city (district is a separate field). */
  city: string
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
  factoryCity: string
  factoryCountry: string
  latitude: string
  longitude: string
  topManagement: { name: string; designation: string }[]
}

export type BisPrintIsCode = {
  isNumber: string
  revisionYear: string
  partNo: string
  sectionNo: string
  title: string
  label: string
  unitOfIs: string
  productManualNumber: string
  mmfLargeScale: string
  mmfMediumScale: string
  mmfSmallScale: string
  mmfMicroScale: string
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
  /** Technical Staff module payload (used by Form 1 technical management). */
  technicalManagement?: Record<string, unknown> | null
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
  if (overlay && (overlay.name.trim() || overlay.signatureImageUrl?.trim())) {
    return {
      signatoryName: overlay.name.trim() || printData.client.contactPerson,
      signatoryDesignation: overlay.designation.trim() || designationForPerson(printData, overlay.name.trim() || printData.client.contactPerson),
      signatureImageUrl: overlay.signatureImageUrl,
    }
  }
  // No signature applied: the Authorized Signatory chosen on Step 2 signs, else the client's contact person.
  const authorized = printData.topManagement ? documentSignatoryFromTopManagement(printData.topManagement) : null
  if (authorized?.authorized && authorized.name) {
    return {
      signatoryName: authorized.name,
      signatoryDesignation: authorized.designation || designationForPerson(printData, authorized.name),
    }
  }
  const name = printData.client.contactPerson
  return {
    signatoryName: name,
    signatoryDesignation: designationForPerson(printData, name),
  }
}

/**
 * Who signs the documents. The Authorized Signatory chosen on Step 2 (Top Management) signs every document;
 * a signature image is used only when it is that person's own (its "apply on documents" box ticked).
 * Without an authorized signatory, the person whose signature is applied signs (earlier behaviour).
 */
export function documentSignatoryFromTopManagement(tm: Record<string, unknown>): {
  name: string
  designation: string
  path: string
  fileName: string
  /** True when the step 2 Authorized Signatory signs (the client's contact person stays as it is). */
  authorized: boolean
} {
  const str = (v: unknown) => (typeof v === 'string' ? v.trim() : v == null ? '' : String(v).trim())
  const norm = (v: string) => v.toLowerCase().replace(/\s+/g, ' ')
  const rows = (Array.isArray(tm.rows) ? tm.rows : []).filter(
    (item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object',
  )
  // The person whose signature image is applied on all documents.
  const appliedRow = rows.find((item) => Boolean(item.applySignatureToDocuments))
  const applied = Boolean(tm.applyAuthorizedSignatureToDocuments)
    ? {
        name: str(tm.authorizedSignatoryName),
        designation: str(tm.authorizedSignatoryDesignation),
        path: str(tm.authorizedSignatureStoragePath),
        fileName: str(tm.authorizedSignatureFileName) || 'authorized-signature',
      }
    : appliedRow
      ? {
          name: str(appliedRow.personName),
          designation: str(appliedRow.designation),
          path: str(appliedRow.signatureStoragePath),
          fileName: str(appliedRow.signatureFileName) || 'signature',
        }
      : { name: '', designation: '', path: '', fileName: 'signature' }
  const appliedResult = { ...applied, authorized: false }
  // The Authorized Signatory: a ticked Top Management row, else the separate authorized signatory fields.
  const authorizedRow = rows.find((item) => Boolean(item.isAuthorizedSignatory))
  const authorized = authorizedRow
    ? { name: str(authorizedRow.personName), designation: str(authorizedRow.designation) }
    : tm.includeAuthorizedSignatory !== false && str(tm.authorizedSignatoryName)
      ? { name: str(tm.authorizedSignatoryName), designation: str(tm.authorizedSignatoryDesignation) }
      : null
  if (!authorized?.name) return appliedResult
  const own = Boolean(applied.name) && norm(applied.name) === norm(authorized.name)
  return {
    name: authorized.name,
    designation: authorized.designation || (own ? applied.designation : ''),
    path: own ? applied.path : '',
    fileName: own ? applied.fileName : 'signature',
    authorized: true,
  }
}


/** Designation of a person by name: Top Management rows, the Authorized Signatory, Technical Staff, then client contacts. */
export function designationForPerson(printData: BisPrintData, personName: string): string {
  const key = personName.trim().toLowerCase().replace(/\s+/g, ' ')
  if (!key) return ''
  const same = (value: unknown) => text(value).toLowerCase().replace(/\s+/g, ' ') === key
  const tm = printData.topManagement ?? null
  const rows = (payload: Record<string, unknown> | null | undefined) =>
    (Array.isArray(payload?.rows) ? payload.rows : []).filter((row): row is Record<string, unknown> => Boolean(row) && typeof row === 'object')
  const fromTm = rows(tm).find((row) => same(row.personName))
  if (text(fromTm?.designation)) return text(fromTm?.designation)
  if (tm && same(tm.authorizedSignatoryName) && text(tm.authorizedSignatoryDesignation)) return text(tm.authorizedSignatoryDesignation)
  const fromStaff = rows(printData.technicalManagement).find((row) => same(row.personName))
  if (text(fromStaff?.designation)) return text(fromStaff?.designation)
  const fromClient = text(printData.client.topManagement.find((person) => same(person.name))?.designation)
  if (fromClient) return fromClient
  // A spelling difference between the client record and Top Management ("Bhalotia" / "Bhalota") still matches.
  const near = (value: unknown) => {
    const other = text(value).toLowerCase().replace(/\s+/g, ' ')
    return key.length >= 6 && other.length >= 6 && editDistance(key, other) <= 2
  }
  const nearPerson =
    rows(tm).find((row) => near(row.personName) && text(row.designation)) ??
    rows(printData.technicalManagement).find((row) => near(row.personName) && text(row.designation))
  if (nearPerson) return text(nearPerson.designation)
  return text(printData.client.topManagement.find((person) => near(person.name))?.designation)
}

/** Levenshtein distance (small names only). */
function editDistance(a: string, b: string): number {
  if (Math.abs(a.length - b.length) > 2) return 3
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j)
  for (let i = 1; i <= a.length; i++) {
    const cur = [i]
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j]! + 1, cur[j - 1]! + 1, prev[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1))
    }
    prev = cur
  }
  return prev[b.length]!
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : value == null ? '' : String(value).trim()
}

async function loadClient(row: BisProjectRow): Promise<BisPrintClient> {
  const fallbackName = clientDisplayName(row)
  const empty: BisPrintClient = {
    companyName: fallbackName,
    contactPerson: '',
    ceoName: '',
    city: '',
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
    factoryCity: '',
    factoryCountry: '',
    latitude: '',
    longitude: '',
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
    ceoName: text(c.ceo_name) || text(c.contact_person_name),
    city: text(c.city),
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
    factoryCity: text(c.city),
    factoryCountry: text(c.country) || 'India',
    latitude: text(c.latitude),
    longitude: text(c.longitude),
    topManagement: [],
  }
  const clientId = text(c.id) || row.client_id
  if (!clientId) return loaded
  const [sitesRes, contactsRes] = await Promise.all([
    supabase.from('client_sites').select('*').eq('client_id', clientId),
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
      loaded.factoryCity = text(factory.city) || loaded.factoryCity
      loaded.factoryCountry = text(factory.country) || loaded.factoryCountry
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
  let partNo = text(joined?.part_no)
  let sectionNo = text(joined?.section_no)
  let standardPrefix = text(joined?.standard_prefix)
  let title = text(joined?.title)
  let unitOfIs = text(joined?.unit_of_is)
  let productManualNumber = text(joined?.product_manual_number)
  let mmfLargeScale = text((joined as Record<string, unknown> | null)?.mmf_large_scale)
  let mmfMediumScale = text((joined as Record<string, unknown> | null)?.mmf_medium_scale)
  let mmfSmallScale = text((joined as Record<string, unknown> | null)?.mmf_small_scale)
  let mmfMicroScale = text((joined as Record<string, unknown> | null)?.mmf_micro_scale)

  if (row.is_code_id) {
    const { data } = await supabase
      .from('is_codes')
      .select('is_number, revision_year, part_no, section_no, standard_prefix, title, unit_of_is, product_manual_number, mmf_large_scale, mmf_medium_scale, mmf_small_scale, mmf_micro_scale')
      .eq('id', row.is_code_id)
      .maybeSingle()
    if (data) {
      const r = data as Record<string, unknown>
      isNumber = text(r.is_number) || isNumber
      revisionYear = text(r.revision_year) || revisionYear
      partNo = text(r.part_no) || partNo
      sectionNo = text(r.section_no) || sectionNo
      standardPrefix = text(r.standard_prefix) || standardPrefix
      title = text(r.title) || title
      unitOfIs = text(r.unit_of_is) || unitOfIs
      productManualNumber = text(r.product_manual_number) || productManualNumber
      mmfLargeScale = text(r.mmf_large_scale) || mmfLargeScale
      mmfMediumScale = text(r.mmf_medium_scale) || mmfMediumScale
      mmfSmallScale = text(r.mmf_small_scale) || mmfSmallScale
      mmfMicroScale = text(r.mmf_micro_scale) || mmfMicroScale
    }
  }

  const label =
    formatIsCodeLabel({
      is_number: isNumber,
      revision_year: revisionYear,
      part_no: partNo,
      section_no: sectionNo,
      standard_prefix: standardPrefix,
    }) || isNumber

  return {
    isNumber,
    revisionYear,
    partNo,
    sectionNo,
    title,
    label,
    unitOfIs,
    productManualNumber,
    mmfLargeScale,
    mmfMediumScale,
    mmfSmallScale,
    mmfMicroScale,
  }
}

/** Loads everything the Form-I / Authorization Letter builders need for one project row. */
export async function loadBisPrintData(row: BisProjectRow): Promise<BisPrintData> {
  // Re-fetch so Application Date / inspection fields match Application Details (list row can be stale).
  const freshRow = (await fetchBisProjectById(row.id).catch(() => null)) ?? row
  const [client, isCode, company, topManagement] = await Promise.all([
    loadClient(freshRow),
    loadIsCode(freshRow),
    loadCompanyPrintContext(),
    // Step 2 Top Management: who the Authorized Signatory is (signs every document).
    supabase
      .from('bis_project_module_data')
      .select('payload')
      .eq('bis_project_id', freshRow.id)
      .eq('module_kind', 'top-management')
      .maybeSingle()
      .then(({ data }) => {
        const payload = (data as { payload?: unknown } | null)?.payload
        return payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : null
      }, () => null),
  ])
  return { row: freshRow, client, isCode, company, topManagement }
}
