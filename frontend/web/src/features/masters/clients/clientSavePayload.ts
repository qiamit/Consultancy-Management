/**
 * One save shape for a client, shared by the Client Master page and the quick
 * "Add New Client" dialog (Quotation / Finance / BIS / Sample Receiving), so a client
 * added from either place stores the same columns with the same rules.
 */
import { isValidIndianMobile, isValidPan } from '@/lib/indiaValidators'
import {
  emptyClientContacts,
  emptyClientSites,
  isValidEmail,
  isValidGst,
  isValidLatitude,
  isValidLongitude,
  isValidPostalCode,
  toContinuousText,
  toProperTitleCase,
  type ClientContactForm,
  type ClientForm,
  type ClientSiteForm,
} from './types'

/** Name matches below this are shared legal suffixes ("… Global Limited"), not duplicates. */
export const SIMILAR_CLIENT_WARNING_THRESHOLD = 0.5

/** Columns some older databases lack; a save drops them one at a time instead of failing. */
export const CLIENT_OPTIONAL_COLUMNS = [
  'women_entrepreneur',
  'startup_status',
  'manak_user_id',
  'city',
  'landline',
  'ceo_name',
]

export function missingColumnName(error: { message?: string } | null) {
  const message = error?.message ?? ''
  return (
    message.match(/'([a-z0-9_]+)' column/i)?.[1]
    ?? message.match(/column (?:[a-z0-9_]+\.)?([a-z0-9_]+) does not exist/i)?.[1]
    ?? message.match(/column "([a-z0-9_]+)"/i)?.[1]
    ?? null
  )
}

export function missingColumnError(error: { code?: string; message?: string } | null) {
  if (!error) return false
  return error.code === '42703' || error.code === 'PGRST204' || /does not exist|schema cache/i.test(error.message ?? '')
}

/** Same checks as the Client Master Save button. */
export function clientFormIsValid(form: ClientForm): boolean {
  return (
    form.companyName.trim().length > 0 &&
    isValidGst(form.gstNumber) &&
    isValidIndianMobile(form.mobile, form.countryCode) &&
    isValidPan(form.pan) &&
    isValidEmail(form.email) &&
    isValidPostalCode(form.pinCode, form.country) &&
    isValidLongitude(form.longitude) &&
    isValidLatitude(form.latitude)
  )
}

/** `clients` row for insert / update. */
export function buildClientRowPayload(form: ClientForm): Record<string, unknown> {
  const companyName = toProperTitleCase(form.companyName)
  // Contact Person and CEO / MD are one field: both columns carry the same name.
  const personName = (form.contactPersonName || form.ceoName).trim() || null
  return {
    // Production DB still has legacy NOT NULL `name` alongside `company_name`.
    name: companyName,
    gst_number: form.gstNumber.trim().toUpperCase() || null,
    company_type: form.companyType,
    company_scale: form.companyScale,
    company_name: companyName,
    contact_person_name: personName,
    country_code: form.countryCode || null,
    mobile: form.mobile.trim() || null,
    email: form.email.trim() || null,
    address: toContinuousText(toProperTitleCase(form.address)) || null,
    pin_code: form.pinCode.trim() || null,
    city: form.city.trim() || null,
    district: form.district.trim() || null,
    state: form.state || null,
    country: form.country || null,
    opening_balance: form.openingBalance ? Number(form.openingBalance) : 0,
    balance_type: form.balanceType,
    payment_term: form.paymentTerm,
    longitude: form.longitude.trim() || null,
    latitude: form.latitude.trim() || null,
    manak_user_id: form.manakUserId.trim() || null,
    remark: form.remark.trim() || null,
    pan: form.pan.trim().toUpperCase() || null,
    cin: form.cin.trim() || null,
    llpin: form.llpin.trim() || null,
    udyam_no: form.udyamNo.trim() || null,
    msme_category: form.msmeCategory.trim() || null,
    udyam_date: form.udyamDate || null,
    constitution: form.constitution.trim() || null,
    landline: form.landline.trim() || null,
    ceo_name: personName,
    sector: form.sector || null,
    is_startup: form.startupStatus.trim().toLowerCase() === 'yes',
    startup_status: form.startupStatus.trim() || 'No',
    startup_dpiit_no: form.startupDpiitNo.trim() || null,
    is_women_entrepreneur: form.womenEntrepreneur.trim().toLowerCase() === 'yes',
    women_entrepreneur: form.womenEntrepreneur.trim() || 'No',
    gst_registration_type: form.gstRegistrationType.trim() || null,
    gst_state_code: form.gstStateCode.trim() || null,
    client_status: form.clientStatus,
    lead_source: form.leadSource.trim() || null,
    referred_by: form.referredBy.trim() || null,
  }
}

/** Registered office / factory sites and the primary contact, as the Client Master saves them. */
export function clientSitesAndContactsForSave(form: ClientForm): {
  sites: ClientSiteForm[]
  contacts: ClientContactForm[]
} {
  const sites = (form.sites.length > 0 ? form.sites : emptyClientSites()).map((site, index) => {
    const primaryOffice = site.siteRole === 'Registered Office' && (site.isPrimary || index === 0)
    if (!primaryOffice) {
      if (site.siteRole !== 'Factory') return { ...site, isPrimary: false }
      // A factory that follows the office, or a new factory site, takes the office district / state / PIN.
      const followOffice = form.factorySameAsOffice !== false || !site.id
      return {
        ...site,
        isPrimary: false,
        address: form.factorySameAsOffice !== false ? form.address : site.address,
        district: followOffice ? form.district : site.district,
        state: followOffice ? form.state : site.state,
        pinCode: form.factorySameAsOffice !== false ? form.pinCode : site.pinCode,
        country: form.factorySameAsOffice !== false ? '' : site.country,
      }
    }
    return {
      ...site,
      isPrimary: true,
      address: form.address,
      district: form.district,
      state: form.state,
      pinCode: form.pinCode,
      gstNumber: form.gstNumber,
    }
  })
  const contacts = (form.contacts.length > 0 ? form.contacts : emptyClientContacts()).map((contact, index) => {
    if (!(contact.isPrimary || index === 0)) return { ...contact, isPrimary: false }
    return {
      ...contact,
      isPrimary: true,
      contactRole: contact.contactRole === 'Other' ? ('Primary' as const) : contact.contactRole,
      name: form.contactPersonName || form.ceoName,
      mobile: form.mobile,
      email: form.email,
    }
  })
  return { sites, contacts }
}
