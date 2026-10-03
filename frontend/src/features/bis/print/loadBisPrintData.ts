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
}

export type BisPrintIsCode = {
  isNumber: string
  revisionYear: string
  title: string
  label: string
}

export type BisPrintData = {
  row: BisProjectRow
  client: BisPrintClient
  isCode: BisPrintIsCode
  company: CompanyPrintContext
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
  }
  if (!row.client_id) return empty

  const { data, error } = await supabase.from('clients').select('*').eq('id', row.client_id).maybeSingle()
  if (error || !data) return empty
  const c = data as Record<string, unknown>
  const code = text(c.country_code)
  const mobile = text(c.mobile)
  return {
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
  }
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
