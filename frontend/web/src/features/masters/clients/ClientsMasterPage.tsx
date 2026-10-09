import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { searchClients, type ClientSearchRow } from '@/lib/clientsApi'
import {
  deleteClientCertificate,
  findSimilarClients,
  listClientCertificates,
  listClientContacts,
  listClientSites,
  openClientCertificate,
  saveClientContacts,
  saveClientSites,
  uploadClientCertificate,
  type ClientCertificateFile,
  type SimilarClient,
} from './clientsApi'
import { invalidateClientsCache } from '@/lib/clientsCache'
import { supabase } from '@/lib/supabaseClient'
import { useCanEditCurrentModule } from '@/features/settings/module-access/useCanEditCurrentModule'
import { useFormDialogOpenChange } from '@/lib/formDialogOpenChange'
import { useMasterUiSearchState } from '@/lib/useMasterUiSearchState'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { AuditHistoryDialog } from '@/components/lims/AuditHistoryDialog'
import { ClientsTableFooterBar } from './ClientsFooterBar'
import { ClientsForm } from './ClientsForm'
import { ClientsHeaderBar } from './ClientsHeaderBar'
import { ClientsTable, type ClientSortDir, type ClientSortKey } from './ClientsTable'
import { clientPageShellClass } from './clientsFormUi'
import { buildClientsAssistantContext } from './buildClientsAssistantContext'
import { isValidGstin, isValidIndianMobile, isValidPan } from '@/lib/indiaValidators'
import { limsDialogClass } from '@/lib/limsThemeUi'
import { cn } from '@/lib/utils'
import {
  BALANCE_TYPES,
  COMPANY_SCALES,
  COMPANY_TYPES,
  DEFAULT_COUNTRY,
  DEFAULT_STATE,
  emptyClientContacts,
  emptyClientForm,
  emptyClientSites,
  formatClientAddress,
  isValidEmail,
  isValidGst,
  isValidIndianPin,
  PAYMENT_TERMS,
  toContinuousText,
  toProperTitleCase,
  type BalanceType,
  type ClientForm as ClientFormType,
  type ClientRow,
  type CompanyScale,
  type CompanyType,
  type PaymentTerm,
} from './types'

const normalizeText = (value: string) => value.trim()

const VIEW_ONLY_MSG = 'View-only access — ask the Laboratory Director for Edit access.'

type MasterDeleteResult = {
  deleted?: string[] | null
  blocked?: { id?: string; refs?: Record<string, number> }[] | null
  storage_paths?: string[] | null
}

function formatPermanentDeleteMessage(
  data: MasterDeleteResult | null,
  nameOf: (id: string) => string,
): string {
  const deleted = Array.isArray(data?.deleted) ? data.deleted : []
  const blocked = Array.isArray(data?.blocked) ? data.blocked : []
  let msg = `Deleted ${deleted.length}.`
  if (blocked.length > 0) {
    const bits = blocked.slice(0, 5).map((b) => {
      const id = String(b.id ?? '')
      const refs = Object.entries(b.refs ?? {})
        .map(([table, n]) => `${String(table).replace(/^public\./, '')} ${n}`)
        .join(', ')
      return `${nameOf(id)} (${refs})`
    })
    msg += ` Not deleted (still used): ${bits.join('; ')} — use Archive instead.`
  }
  return msg
}

const nameCollator = new Intl.Collator(undefined, { sensitivity: 'base', numeric: true })

/** CSV columns matching every Client form field (+ id for round-trip). */
const CLIENT_CSV_HEADERS = [
  'gst_number',
  'company_type',
  'company_scale',
  'company_name',
  'address',
  'pin_code',
  'district',
  'state',
  'country',
  'contact_person_name',
  'country_code',
  'mobile',
  'email',
  'opening_balance',
  'balance_type',
  'payment_term',
  'remark',
  'id',
] as const

const CLIENT_CSV_HEADER_ALIASES: Record<(typeof CLIENT_CSV_HEADERS)[number], string[]> = {
  gst_number: ['gst_number', 'gst number', 'gst', 'gstnumber'],
  company_type: ['company_type', 'company type', 'type'],
  company_scale: ['company_scale', 'company scale', 'scale'],
  company_name: ['company_name', 'company name', 'name of the company', 'name', 'client'],
  address: ['address', 'address of the company', 'company address'],
  pin_code: ['pin_code', 'pin code', 'pincode', 'postal code', 'zip'],
  district: ['district'],
  state: ['state'],
  country: ['country'],
  contact_person_name: [
    'contact_person_name',
    'contact person name',
    'name of the contact person',
    'contact person',
    'contact',
  ],
  country_code: ['country_code', 'country code', 'dial code', 'isd'],
  mobile: ['mobile', 'mobile number', 'phone', 'phone number'],
  email: ['email', 'email id', 'email_id', 'e-mail'],
  opening_balance: ['opening_balance', 'opening balance', 'balance'],
  balance_type: ['balance_type', 'balance type', 'dr_cr', 'dr/cr'],
  payment_term: ['payment_term', 'payment term', 'payment terms'],
  remark: ['remark', 'remarks', 'note', 'notes'],
  id: ['id', 'client_id', 'uuid'],
}

function normalizeCsvHeaderKey(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/%/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

function resolveCsvHeaderIndex(header: string[]): Record<string, number> {
  const normalized = header.map(normalizeCsvHeaderKey)
  const map: Record<string, number> = {}
  for (const field of CLIENT_CSV_HEADERS) {
    const aliases = CLIENT_CSV_HEADER_ALIASES[field].map(normalizeCsvHeaderKey)
    const idx = normalized.findIndex((h) => aliases.includes(h) || h === field)
    if (idx >= 0) map[field] = idx
  }
  return map
}

function pickCsvEnum<T extends string>(value: string, allowed: readonly T[], fallback: T): T {
  const raw = value.trim()
  if (!raw) return fallback
  const hit = allowed.find((a) => a.toLowerCase() === raw.toLowerCase())
  if (hit) return hit
  const compact = raw.replace(/\s+/g, ' ').toLowerCase()
  const soft = allowed.find((a) => a.toLowerCase().replace(/\s+/g, ' ') === compact)
  return soft ?? fallback
}

function normalizePaymentTerm(value: string): PaymentTerm {
  const raw = value.trim()
  if (!raw) return '100 % Advance'
  const compact = raw.replace(/\s+/g, '').toLowerCase()
  if (compact === '100%advance' || compact === '100advance') return '100 % Advance'
  return pickCsvEnum(raw, PAYMENT_TERMS, '100 % Advance')
}

const formatSupabaseError = (err: unknown) => {
  if (!err || typeof err !== 'object') return 'Unknown error'
  const anyErr = err as { message?: string; details?: string; hint?: string; code?: string }
  const parts = [anyErr.message, anyErr.details, anyErr.hint, anyErr.code].filter(Boolean)
  return parts.length ? parts.join(' | ') : 'Unknown error'
}

const CLIENT_FORM_COLUMNS_LEGACY =
  'id, gst_number, company_type, company_scale, company_name, contact_person_name, country_code, mobile, email, address, pin_code, district, state, country, opening_balance, balance_type, payment_term, remark, archived_at'
const CLIENT_FORM_COLUMNS =
  `${CLIENT_FORM_COLUMNS_LEGACY}, pan, cin, llpin, udyam_no, msme_category, udyam_date, constitution, sector, is_startup, startup_dpiit_no, is_women_entrepreneur, gst_registration_type, gst_state_code, client_status, lead_source, referred_by`

function missingColumnError(error: { code?: string; message?: string } | null) {
  if (!error) return false
  return error.code === '42703' || error.code === 'PGRST204' || /does not exist|schema cache/i.test(error.message ?? '')
}

async function loadClientForForm(id: string): Promise<ClientRow> {
  const first = await supabase.from('clients').select(CLIENT_FORM_COLUMNS).eq('id', id).single()
  if (!first.error && first.data) return first.data as ClientRow
  if (!missingColumnError(first.error)) throw first.error ?? new Error('Client not found')
  const second = await supabase.from('clients').select(CLIENT_FORM_COLUMNS_LEGACY).eq('id', id).single()
  if (second.error || !second.data) throw second.error ?? new Error('Client not found')
  return second.data as ClientRow
}

function mapSearchRow(row: ClientSearchRow): ClientRow {
  return {
    id: row.id,
    gst_number: row.gst_number,
    company_type: (row.company_type ?? 'Manufacturer') as ClientRow['company_type'],
    company_scale: (row.company_scale ?? 'Medium') as ClientRow['company_scale'],
    company_name: row.company_name ?? '',
    contact_person_name: row.contact_person_name,
    country_code: row.country_code,
    mobile: row.mobile,
    email: row.email,
    address: row.address,
    pin_code: row.pin_code,
    district: row.district,
    state: row.state,
    country: row.country,
    opening_balance: row.opening_balance,
    balance_type: (row.balance_type ?? 'Dr') as ClientRow['balance_type'],
    payment_term: row.payment_term,
    remark: row.remark,
    archived_at: row.archived_at,
  }
}

function rowToClientForm(row: ClientRow): ClientFormType {
  return {
    gstNumber: row.gst_number ?? '',
    companyType: row.company_type,
    companyScale: row.company_scale,
    companyName: row.company_name ?? '',
    contactPersonName: row.contact_person_name ?? '',
    countryCode: row.country_code ?? '+91',
    mobile: row.mobile ?? '',
    email: row.email ?? '',
    address: row.address ?? '',
    pinCode: row.pin_code ?? '',
    district: row.district ?? '',
    state: row.state ?? DEFAULT_STATE,
    country: row.country ?? DEFAULT_COUNTRY,
    openingBalance: String(row.opening_balance ?? 0),
    balanceType: row.balance_type,
    paymentTerm: (row.payment_term as ClientFormType['paymentTerm']) || '100 % Advance',
    remark: row.remark ?? '',
    pan: row.pan ?? '',
    cin: String((row as { cin?: string | null }).cin ?? ''),
    llpin: String((row as { llpin?: string | null }).llpin ?? ''),
    udyamNo: String((row as { udyam_no?: string | null }).udyam_no ?? ''),
    msmeCategory: String((row as { msme_category?: string | null }).msme_category ?? ''),
    udyamDate: String((row as { udyam_date?: string | null }).udyam_date ?? '').slice(0, 10),
    constitution: String((row as { constitution?: string | null }).constitution ?? ''),
    sector: ((row.sector ?? '') as ClientFormType['sector']) || '',
    isStartup: Boolean((row as { is_startup?: boolean | null }).is_startup),
    startupDpiitNo: String((row as { startup_dpiit_no?: string | null }).startup_dpiit_no ?? ''),
    isWomenEntrepreneur: Boolean((row as { is_women_entrepreneur?: boolean | null }).is_women_entrepreneur),
    gstRegistrationType: String((row as { gst_registration_type?: string | null }).gst_registration_type ?? ''),
    gstStateCode: String((row as { gst_state_code?: string | null }).gst_state_code ?? ''),
    clientStatus: ((row.client_status as ClientFormType['clientStatus']) || 'Active'),
    leadSource: String((row as { lead_source?: string | null }).lead_source ?? ''),
    referredBy: String((row as { referred_by?: string | null }).referred_by ?? ''),
    panFromGstin: false,
    sites: emptyClientSites(),
    contacts: emptyClientContacts(),
  }
}

export default function ClientsMasterPage() {
  const { editId, setEdit } = useMasterUiSearchState()
  const [saveLoading, setSaveLoading] = useState(false)
  const [saveMessage, setSaveMessage] = useState<string | null>(null)
  const canEdit = useCanEditCurrentModule()
  const [showArchived, setShowArchived] = useState(false)

  const importInputRef = useRef<HTMLInputElement | null>(null)
  const hydratedEditRef = useRef<string | null>(null)

  const showForm = editId != null
  const editingId = editId && editId !== 'new' ? editId : null
  const handleFormOpenChange = useFormDialogOpenChange((open) => {
    if (!open) {
      hydratedEditRef.current = null
      setEdit(null)
    }
  })
  const [search, setSearch] = useState('')

  const [rows, setRows] = useState<ClientRow[]>([])
  const [total, setTotal] = useState(0)
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const loadSeq = useRef(0)
  const [listLoading, setListLoading] = useState(false)
  const [listError, setListError] = useState<string | null>(null)

  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set())
  const [historyOpen, setHistoryOpen] = useState(false)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [jumpTo, setJumpTo] = useState('')
  const [sortKey, setSortKey] = useState<ClientSortKey>('companyIdentity')
  const [sortDir, setSortDir] = useState<ClientSortDir>('asc')

  const [states, setStates] = useState<Array<{ id: string; label: string }>>(() => [{ id: 'default-state', label: DEFAULT_STATE }])
  const [countries, setCountries] = useState<Array<{ id: string; label: string }>>(() => [{ id: 'default-country', label: DEFAULT_COUNTRY }])
  const [districts, setDistricts] = useState<Array<{ id: string; label: string }>>(() => [])
  const [pinCodes, setPinCodes] = useState<Array<{ id: string; label: string }>>(() => [])
  const [countryCodes, setCountryCodes] = useState<Array<{ id: string; value: string; label: string }>>(() => [
    { id: 'default-code', value: '+91', label: '+91 (IN)' },
  ])
  const [companyTypes, setCompanyTypes] = useState<Array<{ id: string; label: string }>>(() => [])
  const [companyScales, setCompanyScales] = useState<Array<{ id: string; label: string }>>(() => [])
  const [paymentTerms, setPaymentTerms] = useState<Array<{ id: string; label: string }>>(() => [])

  const [stateDialogOpen, setStateDialogOpen] = useState(false)
  const [newStateName, setNewStateName] = useState('')

  const [countryDialogOpen, setCountryDialogOpen] = useState(false)
  const [newCountryName, setNewCountryName] = useState('')

  const [districtDialogOpen, setDistrictDialogOpen] = useState(false)
  const [newDistrictName, setNewDistrictName] = useState('')

  const [pinCodeDialogOpen, setPinCodeDialogOpen] = useState(false)
  const [newPinCode, setNewPinCode] = useState('')

  const [countryCodeDialogOpen, setCountryCodeDialogOpen] = useState(false)
  const [newCountryCode, setNewCountryCode] = useState('')

  const [companyTypeDialogOpen, setCompanyTypeDialogOpen] = useState(false)
  const [newCompanyType, setNewCompanyType] = useState('')

  const [companyScaleDialogOpen, setCompanyScaleDialogOpen] = useState(false)
  const [newCompanyScale, setNewCompanyScale] = useState('')

  const [paymentTermDialogOpen, setPaymentTermDialogOpen] = useState(false)
  const [newPaymentTerm, setNewPaymentTerm] = useState('')

  const [form, setForm] = useState<ClientFormType>(() => emptyClientForm())
  const [certificates, setCertificates] = useState<ClientCertificateFile[]>([])
  const [duplicates, setDuplicates] = useState<SimilarClient[]>([])
  const [allowDuplicateSave, setAllowDuplicateSave] = useState(false)
  const allowDuplicateRef = useRef(false)
  const [copySourceId, setCopySourceId] = useState<string | null>(null)
  const [copyName, setCopyName] = useState('')
  const [csvPreview, setCsvPreview] = useState<{ valid: Array<Record<string, unknown>>; invalid: string[][] } | null>(null)

  const gstError = useMemo(() => (isValidGst(form.gstNumber) ? null : 'Invalid GST Number'), [form.gstNumber])
  const mobileError = useMemo(
    () => (isValidIndianMobile(form.mobile, form.countryCode) ? null : 'Mobile must be a 10-digit number starting with 6–9'),
    [form.mobile, form.countryCode],
  )
  const panError = useMemo(() => (isValidPan(form.pan) ? null : 'Invalid PAN'), [form.pan])
  const emailError = useMemo(() => (isValidEmail(form.email) ? null : 'Invalid email address'), [form.email])
  const pinError = useMemo(() => (isValidIndianPin(form.pinCode) ? null : 'Invalid PIN code'), [form.pinCode])

  const canSave =
    !saveLoading &&
    !gstError &&
    !mobileError &&
    !panError &&
    !emailError &&
    !pinError &&
    form.companyName.trim().length > 0

  const pageLimit = Math.min(Math.max(pageSize, 1), 200)

  const loadClients = useCallback(async () => {
    const seq = ++loadSeq.current
    setListError(null)
    setListLoading(true)
    try {
      await supabase.auth.getSession()
      const { rows: found, total: nextTotal } = await searchClients({
        search: debouncedSearch,
        limit: pageLimit,
        offset: (page - 1) * pageLimit,
        includeArchived: showArchived,
      })
      if (seq !== loadSeq.current) return
      setTotal(nextTotal)
      setRows(found.map(mapSearchRow))
    } catch (err) {
      if (seq !== loadSeq.current) return
      setListError(err instanceof Error ? err.message : 'Unable to load clients')
    } finally {
      if (seq === loadSeq.current) setListLoading(false)
    }
  }, [debouncedSearch, page, pageLimit, showArchived])

  const loadMasterOptions = async () => {
    try {
      const { data, error } = await supabase.from('client_master_options').select('*').order('label', { ascending: true })
      if (error) throw error

      const rows = Array.isArray(data) ? (data as Array<{ id: string; category: string; value: string | null; label: string }>) : []

      const byCategory = (cat: string) => rows.filter((r) => r.category === cat)

      const stateRows = byCategory('state')
      setStates(() => {
        const base = [{ id: 'default-state', label: DEFAULT_STATE }]
        const fromDb = stateRows.map((r) => ({ id: r.id, label: r.label }))
        const merged = [...base, ...fromDb]
        const uniq = new Map(merged.map((x) => [x.label.toLowerCase(), x]))
        return Array.from(uniq.values()).sort((a, b) => a.label.localeCompare(b.label))
      })

      const countryRows = byCategory('country')
      setCountries(() => {
        const base = [{ id: 'default-country', label: DEFAULT_COUNTRY }]
        const fromDb = countryRows.map((r) => ({ id: r.id, label: r.label }))
        const merged = [...base, ...fromDb]
        const uniq = new Map(merged.map((x) => [x.label.toLowerCase(), x]))
        return Array.from(uniq.values()).sort((a, b) => a.label.localeCompare(b.label))
      })

      const districtRows = byCategory('district')
      setDistricts(() => districtRows.map((r) => ({ id: r.id, label: r.label })).sort((a, b) => a.label.localeCompare(b.label)))

      const pinRows = byCategory('pin_code')
      setPinCodes(() => pinRows.map((r) => ({ id: r.id, label: r.label })).sort((a, b) => a.label.localeCompare(b.label)))

      const codeRows = byCategory('country_code')
      setCountryCodes(() => {
        const base = [{ id: 'default-code', value: '+91', label: '+91 (IN)' }]
        const fromDb = codeRows
          .map((r) => ({ id: r.id, value: r.value ?? r.label, label: r.label }))
          .filter((r) => r.value)
        const merged = [...base, ...fromDb]
        const uniq = new Map(merged.map((x) => [x.value, x]))
        return Array.from(uniq.values())
      })

      setCompanyTypes(() => byCategory('company_type').map((r) => ({ id: r.id, label: r.label })))
      setCompanyScales(() => byCategory('company_scale').map((r) => ({ id: r.id, label: r.label })))
      setPaymentTerms(() => byCategory('payment_term').map((r) => ({ id: r.id, label: r.label })))
    } catch (err) {
      setSaveMessage((prev) => prev ?? (err instanceof Error ? err.message : 'Unable to load masters'))
    }
  }

  useEffect(() => {
    const id = window.setTimeout(() => setDebouncedSearch(search), 300)
    return () => window.clearTimeout(id)
  }, [search])

  useEffect(() => {
    void loadMasterOptions()
  }, [])

  useEffect(() => {
    void loadClients()
  }, [loadClients])

  useEffect(() => {
    if (!editId) {
      hydratedEditRef.current = null
      return
    }
    if (hydratedEditRef.current === editId) return

    if (editId === 'new') {
      setForm(emptyClientForm())
      hydratedEditRef.current = 'new'
      return
    }

    let cancelled = false
    void (async () => {
      let row: ClientRow
      try {
        row = await loadClientForForm(editId)
      } catch {
        if (!cancelled) setEdit(null)
        return
      }
      if (cancelled) return
      const base = rowToClientForm(row)
      const [sites, contacts, files] = await Promise.all([
        listClientSites(editId),
        listClientContacts(editId),
        listClientCertificates(editId),
      ])
      if (cancelled) return
      setForm({
        ...base,
        sites: sites.length > 0 ? sites : base.sites,
        contacts: contacts.length > 0 ? contacts : base.contacts,
      })
      setCertificates(files)
      hydratedEditRef.current = editId
    })()
    return () => {
      cancelled = true
    }
  }, [editId, setEdit])

  const handleAddState = () => {
    if (!canEdit) {
      setSaveMessage(VIEW_ONLY_MSG)
      return
    }
    const name = normalizeText(newStateName)
    if (!name) return
    void (async () => {
      try {
        const { data, error } = await supabase
          .from('client_master_options')
          .insert({ category: 'state', label: name, value: name })
          .select('id')
          .single()
        if (error) throw error
        const id = (data as { id: string } | null)?.id ?? `tmp-${name}`
        setStates((prev) => {
          const merged = [...prev, { id, label: name }]
          const uniq = new Map(merged.map((x) => [x.label.toLowerCase(), x]))
          return Array.from(uniq.values()).sort((a, b) => a.label.localeCompare(b.label))
        })
        setForm((prev) => ({ ...prev, state: name }))
      } catch (err) {
        setSaveMessage(err instanceof Error ? err.message : 'Unable to add state')
      } finally {
        setNewStateName('')
        setStateDialogOpen(false)
      }
    })()
  }

  const handleAddCountry = () => {
    if (!canEdit) {
      setSaveMessage(VIEW_ONLY_MSG)
      return
    }
    const name = normalizeText(newCountryName)
    if (!name) return
    void (async () => {
      try {
        const { data, error } = await supabase
          .from('client_master_options')
          .insert({ category: 'country', label: name, value: name })
          .select('id')
          .single()
        if (error) throw error
        const id = (data as { id: string } | null)?.id ?? `tmp-${name}`
        setCountries((prev) => {
          const merged = [...prev, { id, label: name }]
          const uniq = new Map(merged.map((x) => [x.label.toLowerCase(), x]))
          return Array.from(uniq.values()).sort((a, b) => a.label.localeCompare(b.label))
        })
        setForm((prev) => ({ ...prev, country: name }))
      } catch (err) {
        setSaveMessage(err instanceof Error ? err.message : 'Unable to add country')
      } finally {
        setNewCountryName('')
        setCountryDialogOpen(false)
      }
    })()
  }

  const handleAddDistrict = () => {
    if (!canEdit) {
      setSaveMessage(VIEW_ONLY_MSG)
      return
    }
    const name = normalizeText(newDistrictName)
    if (!name) return
    void (async () => {
      try {
        const { data, error } = await supabase
          .from('client_master_options')
          .insert({ category: 'district', label: name, value: name })
          .select('id')
          .single()
        if (error) throw error
        const id = (data as { id: string } | null)?.id ?? `tmp-${name}`
        setDistricts((prev) => {
          const merged = [...prev, { id, label: name }]
          const uniq = new Map(merged.map((x) => [x.label.toLowerCase(), x]))
          return Array.from(uniq.values()).sort((a, b) => a.label.localeCompare(b.label))
        })
        setForm((prev) => ({ ...prev, district: name }))
      } catch (err) {
        setSaveMessage(err instanceof Error ? err.message : 'Unable to add district')
      } finally {
        setNewDistrictName('')
        setDistrictDialogOpen(false)
      }
    })()
  }

  const handleAddPinCode = () => {
    if (!canEdit) {
      setSaveMessage(VIEW_ONLY_MSG)
      return
    }
    const name = newPinCode.trim().replace(/[^0-9]/g, '').slice(0, 6)
    if (!name) return
    void (async () => {
      try {
        const { data, error } = await supabase
          .from('client_master_options')
          .insert({ category: 'pin_code', label: name, value: name })
          .select('id')
          .single()
        if (error) throw error
        const id = (data as { id: string } | null)?.id ?? `tmp-${name}`
        setPinCodes((prev) => {
          const merged = [...prev, { id, label: name }]
          const uniq = new Map(merged.map((x) => [x.label.toLowerCase(), x]))
          return Array.from(uniq.values()).sort((a, b) => a.label.localeCompare(b.label))
        })
        setForm((prev) => ({ ...prev, pinCode: name }))
      } catch (err) {
        setSaveMessage(err instanceof Error ? err.message : 'Unable to add pin code')
      } finally {
        setNewPinCode('')
        setPinCodeDialogOpen(false)
      }
    })()
  }

  const deleteMasterOption = (id: string, category: string) => {
    if (!canEdit) {
      setSaveMessage(VIEW_ONLY_MSG)
      return
    }
    void (async () => {
      try {
        if (!id || id.startsWith('default-') || id.startsWith('db-')) return
        const { error } = await supabase.from('client_master_options').delete().eq('id', id)
        if (error) throw error

        if (category === 'state') setStates((prev) => prev.filter((x) => x.id !== id))
        if (category === 'country') setCountries((prev) => prev.filter((x) => x.id !== id))
        if (category === 'district') setDistricts((prev) => prev.filter((x) => x.id !== id))
        if (category === 'pin_code') setPinCodes((prev) => prev.filter((x) => x.id !== id))
        if (category === 'country_code') setCountryCodes((prev) => prev.filter((x) => x.id !== id))
        if (category === 'company_type') setCompanyTypes((prev) => prev.filter((x) => x.id !== id))
        if (category === 'company_scale') setCompanyScales((prev) => prev.filter((x) => x.id !== id))
        if (category === 'payment_term') setPaymentTerms((prev) => prev.filter((x) => x.id !== id))
      } catch (err) {
        setSaveMessage(err instanceof Error ? err.message : 'Unable to delete option')
      }
    })()
  }

  const CLIENT_FIELD_BY_CATEGORY: Record<string, keyof ClientRow | null> = {
    state: 'state',
    country: 'country',
    district: 'district',
    pin_code: 'pin_code',
    country_code: 'country_code',
    company_type: 'company_type',
    company_scale: 'company_scale',
    payment_term: 'payment_term',
  }

  const updateMasterOption = (id: string, category: string, rawLabel: string) => {
    if (!canEdit) {
      setSaveMessage(VIEW_ONLY_MSG)
      return
    }
    const name =
      category === 'pin_code'
        ? rawLabel.trim().replace(/[^0-9]/g, '').slice(0, 6)
        : category === 'country_code'
          ? (() => {
              const raw = normalizeText(rawLabel)
              return raw ? (raw.startsWith('+') ? raw : `+${raw}`) : ''
            })()
          : normalizeText(rawLabel)
    if (!name || !id) return

    void (async () => {
      try {
        const findOldLabel = () => {
          if (category === 'state') return states.find((x) => x.id === id)?.label
          if (category === 'country') return countries.find((x) => x.id === id)?.label
          if (category === 'district') return districts.find((x) => x.id === id)?.label
          if (category === 'pin_code') return pinCodes.find((x) => x.id === id)?.label
          if (category === 'country_code') return countryCodes.find((x) => x.id === id)?.value
          if (category === 'company_type') return companyTypes.find((x) => x.id === id)?.label
          if (category === 'company_scale') return companyScales.find((x) => x.id === id)?.label
          if (category === 'payment_term') return paymentTerms.find((x) => x.id === id)?.label
          return undefined
        }
        const oldLabel = findOldLabel()

        if (!id.startsWith('default-') && !id.startsWith('db-') && !id.startsWith('tmp-')) {
          const { error } = await supabase
            .from('client_master_options')
            .update({ label: name, value: name })
            .eq('id', id)
          if (error) throw error
        }

        const sortByLabel = <T extends { label: string }>(list: T[]) =>
          [...list].sort((a, b) => a.label.localeCompare(b.label))

        if (category === 'state') setStates((prev) => sortByLabel(prev.map((x) => (x.id === id ? { ...x, label: name } : x))))
        if (category === 'country') setCountries((prev) => sortByLabel(prev.map((x) => (x.id === id ? { ...x, label: name } : x))))
        if (category === 'district') setDistricts((prev) => sortByLabel(prev.map((x) => (x.id === id ? { ...x, label: name } : x))))
        if (category === 'pin_code') setPinCodes((prev) => sortByLabel(prev.map((x) => (x.id === id ? { ...x, label: name } : x))))
        if (category === 'country_code') {
          setCountryCodes((prev) =>
            prev.map((x) => (x.id === id ? { ...x, value: name, label: name } : x)),
          )
        }
        if (category === 'company_type') setCompanyTypes((prev) => sortByLabel(prev.map((x) => (x.id === id ? { ...x, label: name } : x))))
        if (category === 'company_scale') setCompanyScales((prev) => sortByLabel(prev.map((x) => (x.id === id ? { ...x, label: name } : x))))
        if (category === 'payment_term') setPaymentTerms((prev) => sortByLabel(prev.map((x) => (x.id === id ? { ...x, label: name } : x))))

        const clientField = CLIENT_FIELD_BY_CATEGORY[category]
        if (clientField && oldLabel && oldLabel !== name) {
          setForm((prev) => {
            if (category === 'district' && prev.district === oldLabel) return { ...prev, district: name }
            if (category === 'state' && prev.state === oldLabel) return { ...prev, state: name }
            if (category === 'country' && prev.country === oldLabel) return { ...prev, country: name }
            if (category === 'pin_code' && prev.pinCode === oldLabel) return { ...prev, pinCode: name }
            if (category === 'country_code' && prev.countryCode === oldLabel) return { ...prev, countryCode: name }
            if (category === 'company_type' && prev.companyType === oldLabel) {
              return { ...prev, companyType: name as ClientFormType['companyType'] }
            }
            if (category === 'company_scale' && prev.companyScale === oldLabel) {
              return { ...prev, companyScale: name as ClientFormType['companyScale'] }
            }
            if (category === 'payment_term' && prev.paymentTerm === oldLabel) {
              return { ...prev, paymentTerm: name as ClientFormType['paymentTerm'] }
            }
            return prev
          })

          const { error: clientErr } = await supabase
            .from('clients')
            .update({ [clientField]: name })
            .eq(clientField, oldLabel)
          if (clientErr) throw clientErr
          await loadClients()
        }
      } catch (err) {
        setSaveMessage(err instanceof Error ? err.message : 'Unable to update option')
      } finally {
        if (category === 'state') {
          setNewStateName('')
          setStateDialogOpen(false)
        }
        if (category === 'country') {
          setNewCountryName('')
          setCountryDialogOpen(false)
        }
        if (category === 'district') {
          setNewDistrictName('')
          setDistrictDialogOpen(false)
        }
        if (category === 'pin_code') {
          setNewPinCode('')
          setPinCodeDialogOpen(false)
        }
        if (category === 'country_code') {
          setNewCountryCode('')
          setCountryCodeDialogOpen(false)
        }
        if (category === 'company_type') {
          setNewCompanyType('')
          setCompanyTypeDialogOpen(false)
        }
        if (category === 'company_scale') {
          setNewCompanyScale('')
          setCompanyScaleDialogOpen(false)
        }
        if (category === 'payment_term') {
          setNewPaymentTerm('')
          setPaymentTermDialogOpen(false)
        }
      }
    })()
  }

  const pinAutoFill = useMemo(() => {
    const m = new Map<string, { district?: string; state?: string; country?: string }>()
    for (const r of rows) {
      const pin = (r.pin_code ?? '').trim()
      if (!pin) continue
      if (m.has(pin)) continue
      m.set(pin, {
        district: r.district ?? undefined,
        state: r.state ?? undefined,
        country: r.country ?? undefined,
      })
    }
    return m
  }, [rows])

  const handleAddCountryCode = () => {
    if (!canEdit) {
      setSaveMessage(VIEW_ONLY_MSG)
      return
    }
    const raw = normalizeText(newCountryCode)
    if (!raw) return
    const formatted = raw.startsWith('+') ? raw : `+${raw}`
    void (async () => {
      try {
        const label = formatted
        const { data, error } = await supabase
          .from('client_master_options')
          .insert({ category: 'country_code', label, value: formatted })
          .select('id')
          .single()
        if (error) throw error
        const id = (data as { id: string } | null)?.id ?? `tmp-${formatted}`
        setCountryCodes((prev) => {
          const merged = [...prev, { id, value: formatted, label }]
          const uniq = new Map(merged.map((x) => [x.value, x]))
          return Array.from(uniq.values())
        })
        setForm((prev) => ({ ...prev, countryCode: formatted }))
      } catch (err) {
        setSaveMessage(err instanceof Error ? err.message : 'Unable to add code')
      } finally {
        setNewCountryCode('')
        setCountryCodeDialogOpen(false)
      }
    })()
  }

  const addSimpleOption = (category: string, label: string, after: (id: string) => void) => {
    const name = normalizeText(label)
    if (!name) return
    void (async () => {
      try {
        const { data, error } = await supabase
          .from('client_master_options')
          .insert({ category, label: name, value: name })
          .select('id')
          .single()
        if (error) throw error
        const id = (data as { id: string } | null)?.id ?? `tmp-${name}`
        after(id)
      } catch (err) {
        setSaveMessage(err instanceof Error ? err.message : 'Unable to add option')
      }
    })()
  }

  const handleSave = () => {
    if (!canEdit) {
      setSaveMessage(VIEW_ONLY_MSG)
      return
    }
    void (async () => {
      setSaveMessage(null)
      setSaveLoading(true)
      try {
        const companyName = toProperTitleCase(form.companyName)
        if (!allowDuplicateSave && !allowDuplicateRef.current) {
          const hits = (await findSimilarClients(companyName, form.gstNumber)).filter((hit) => hit.id !== editingId)
          if (hits.length > 0) {
            setDuplicates(hits)
            return
          }
        }
        setDuplicates([])
        setAllowDuplicateSave(false)
        allowDuplicateRef.current = false
        const payload = {
          // Production DB still has legacy NOT NULL `name` alongside `company_name`.
          name: companyName,
          gst_number: form.gstNumber.trim().toUpperCase() || null,
          company_type: form.companyType,
          company_scale: form.companyScale,
          company_name: companyName,
          contact_person_name: form.contactPersonName.trim() || null,
          country_code: form.countryCode || null,
          mobile: form.mobile.trim() || null,
          email: form.email.trim() || null,
          address: toContinuousText(toProperTitleCase(form.address)) || null,
          pin_code: form.pinCode.trim() || null,
          district: form.district.trim() || null,
          state: form.state || null,
          country: form.country || null,
          opening_balance: form.openingBalance ? Number(form.openingBalance) : 0,
          balance_type: form.balanceType,
          payment_term: form.paymentTerm,
          remark: form.remark.trim() || null,
          pan: form.pan.trim().toUpperCase() || null,
          cin: form.cin.trim() || null,
          llpin: form.llpin.trim() || null,
          udyam_no: form.udyamNo.trim() || null,
          msme_category: form.msmeCategory.trim() || null,
          udyam_date: form.udyamDate || null,
          constitution: form.constitution.trim() || null,
          sector: form.sector || null,
          is_startup: form.isStartup,
          startup_dpiit_no: form.startupDpiitNo.trim() || null,
          is_women_entrepreneur: form.isWomenEntrepreneur,
          gst_registration_type: form.gstRegistrationType.trim() || null,
          gst_state_code: form.gstStateCode.trim() || null,
          client_status: form.clientStatus,
          lead_source: form.leadSource.trim() || null,
          referred_by: form.referredBy.trim() || null,
        }

        // Prefer insert/update over upsert — avoids 42P10 when the unique index
        // on company_name is missing on some environments.
        let savedId = editingId
        if (editingId) {
          const { data, error } = await supabase.from('clients').update(payload).eq('id', editingId).select('id')
          if (error) throw error
          if (!data || data.length === 0) {
            throw new Error('You do not have edit access for this record (view-only).')
          }
        } else {
          const { data, error } = await supabase.from('clients').insert(payload).select('id').single()
          if (error) throw error
          savedId = (data as { id: string } | null)?.id ?? null
        }
        if (savedId) {
          const sites = (form.sites.length > 0 ? form.sites : emptyClientSites()).map((site, index) => {
            const primaryOffice = site.siteRole === 'Registered Office' && (site.isPrimary || index === 0)
            if (!primaryOffice) return { ...site, isPrimary: false }
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
              contactRole: contact.contactRole === 'Other' ? 'Primary' as const : contact.contactRole,
              name: form.contactPersonName,
              mobile: form.mobile,
              email: form.email,
            }
          })
          await saveClientSites(savedId, sites)
          await saveClientContacts(savedId, contacts)
        }
        invalidateClientsCache()

        setSaveMessage('Saved successfully.')
        setForm(emptyClientForm())
        hydratedEditRef.current = null
        setEdit(null)
        await loadClients()
      } catch (err) {
        setSaveMessage(formatSupabaseError(err))
      } finally {
        setSaveLoading(false)
      }
    })()
  }

  const handleNew = () => {
    setSaveMessage(null)
    setForm(emptyClientForm())
    hydratedEditRef.current = 'new'
    setEdit('new')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const openClientById = async (id: string) => {
    return loadClientForForm(id)
  }

  const fillOpenedClient = async (id: string, mode: 'edit' | 'copy', copyLabel?: string) => {
    const full = await openClientById(id)
    const base = rowToClientForm(full)
    const [sites, contacts, files] = await Promise.all([
      listClientSites(id),
      listClientContacts(id),
      listClientCertificates(id),
    ])
    const next = {
      ...base,
      sites: sites.length > 0 ? sites.map((site) => (mode === 'copy' ? { ...site, id: undefined } : site)) : base.sites,
      contacts: contacts.length > 0 ? contacts.map((contact) => (mode === 'copy' ? { ...contact, id: undefined } : contact)) : base.contacts,
      companyName: mode === 'copy' ? (copyLabel || `${full.company_name} - Copy`) : base.companyName,
    }
    setForm(next)
    setCertificates(mode === 'copy' ? [] : files)
    hydratedEditRef.current = mode === 'copy' ? 'new' : id
    setEdit(mode === 'copy' ? 'new' : id)
  }

  const handleEdit = (row: ClientRow) => {
    setSaveMessage(null)
    setDuplicates([])
    setAllowDuplicateSave(false)
    void fillOpenedClient(row.id, 'edit').catch((err) => {
      setSaveMessage(err instanceof Error ? err.message : 'Unable to open client')
    })
  }

  const handleCopy = (row: ClientRow) => {
    setSaveMessage(null)
    setCopySourceId(row.id)
    setCopyName(`${row.company_name} - Copy`)
  }

  const confirmCopy = () => {
    const id = copySourceId
    const name = copyName.trim()
    if (!id || !name) return
    setCopySourceId(null)
    void fillOpenedClient(id, 'copy', name).catch((err) => {
      setSaveMessage(err instanceof Error ? err.message : 'Unable to copy client')
    })
  }

  const filteredRows = useMemo(() => {
    const list = [...rows]

    const dir = sortDir === 'asc' ? 1 : -1
    const cmpText = (a: string, b: string) => nameCollator.compare(a, b) * dir

    return list.sort((a, b) => {
      let primary = 0
      switch (sortKey) {
        case 'companyIdentity':
          primary = cmpText(a.company_name || '', b.company_name || '')
          break
        case 'typeScale':
          primary = cmpText(
            `${a.company_type} ${a.company_scale}`,
            `${b.company_type} ${b.company_scale}`,
          )
          break
        case 'contact':
          primary = cmpText(
            [a.contact_person_name, a.email, a.mobile].filter(Boolean).join(' '),
            [b.contact_person_name, b.email, b.mobile].filter(Boolean).join(' '),
          )
          break
        case 'address':
          primary = cmpText(formatClientAddress(a), formatClientAddress(b))
          break
        case 'balance': {
          const signed = (r: ClientRow) => {
            const amt = Number(r.opening_balance) || 0
            return String(r.balance_type).toUpperCase() === 'CR' ? -amt : amt
          }
          primary = (signed(a) - signed(b)) * dir
          break
        }
        default:
          primary = cmpText(a.company_name || '', b.company_name || '')
      }
      if (primary !== 0) return primary
      return cmpText(a.company_name || '', b.company_name || '')
    })
  }, [rows, sortKey, sortDir])

  const pageCount = Math.max(1, Math.ceil(total / pageLimit))

  useEffect(() => {
    setPage(1)
    setJumpTo('')
  }, [search, pageSize, showArchived])

  const handleSort = (key: ClientSortKey) => {
    if (sortKey === key) {
      setSortDir((prev) => (prev === 'asc' ? 'desc' : 'asc'))
      return
    }
    setSortKey(key)
    setSortDir('asc')
  }

  const pagedRows = filteredRows
  const rangeFrom = total === 0 ? 0 : (page - 1) * pageLimit + 1
  const rangeTo = total === 0 ? 0 : (page - 1) * pageLimit + pagedRows.length

  const assistantContext = useMemo(
    () => buildClientsAssistantContext(filteredRows, search),
    [filteredRows, search],
  )

  const toggleRow = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleAllOnPage = (checked: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      for (const r of pagedRows) {
        if (checked) next.add(r.id)
        else next.delete(r.id)
      }
      return next
    })
  }

  const selectedRows = useMemo(() => rows.filter((r) => selectedIds.has(r.id)), [rows, selectedIds])

  const printHtmlInIframe = (html: string) => {
    const iframe = document.createElement('iframe')
    iframe.style.position = 'fixed'
    iframe.style.right = '0'
    iframe.style.bottom = '0'
    iframe.style.width = '0'
    iframe.style.height = '0'
    iframe.style.border = '0'
    iframe.setAttribute('aria-hidden', 'true')
    document.body.appendChild(iframe)

    const cleanup = () => {
      try {
        document.body.removeChild(iframe)
      } catch {
        // ignore
      }
    }

    const doc = iframe.contentDocument
    const win = iframe.contentWindow
    if (!doc || !win) {
      cleanup()
      setSaveMessage('Unable to open print preview.')
      return
    }

    doc.open()
    doc.write(html)
    doc.close()

    const runPrint = () => {
      try {
        win.focus()
        win.print()
      } finally {
        window.setTimeout(cleanup, 800)
      }
    }

    iframe.onload = () => runPrint()
    window.setTimeout(runPrint, 400)
  }

  const handlePrintSelected = () => {
    if (selectedRows.length === 0) {
      setSaveMessage('Select at least one client to print a courier slip.')
      return
    }
    printHtmlInIframe(buildCourierSlipPrintHtml(selectedRows))
    setSaveMessage(`Print ready: ${selectedRows.length} courier slip(s) (half A4).`)
  }

  const handleArchiveSelected = () => {
    void (async () => {
      if (selectedRows.length === 0) {
        setSaveMessage('Select at least one client to archive.')
        return
      }
      const ok = window.confirm(`Archive ${selectedRows.length} selected client(s)?`)
      if (!ok) return
      setSaveMessage(null)
      setSaveLoading(true)
      try {
        const ids = selectedRows.map((r) => r.id)
        const { data, error } = await supabase
          .from('clients')
          .update({ archived_at: new Date().toISOString() })
          .in('id', ids)
          .is('archived_at', null)
          .select('id')
        if (error) throw error
        const n = Array.isArray(data) ? data.length : 0
        if (n === 0) {
          setSaveMessage('You do not have edit access (view-only).')
          return
        }
        invalidateClientsCache()
        setSaveMessage(`Archived ${n}.`)
        setSelectedIds(new Set())
        await loadClients()
      } catch (err) {
        setSaveMessage(err instanceof Error ? err.message : 'Unable to archive clients')
      } finally {
        setSaveLoading(false)
      }
    })()
  }

  const handleRestoreSelected = () => {
    void (async () => {
      if (selectedRows.length === 0) {
        setSaveMessage('Select at least one client to restore.')
        return
      }
      setSaveMessage(null)
      setSaveLoading(true)
      try {
        const ids = selectedRows.map((r) => r.id)
        const { data, error } = await supabase
          .from('clients')
          .update({ archived_at: null })
          .in('id', ids)
          .not('archived_at', 'is', null)
          .select('id')
        if (error) throw error
        const n = Array.isArray(data) ? data.length : 0
        if (n === 0) {
          setSaveMessage('You do not have edit access (view-only).')
          return
        }
        invalidateClientsCache()
        setSaveMessage(`Restored ${n}.`)
        setSelectedIds(new Set())
        await loadClients()
      } catch (err) {
        setSaveMessage(err instanceof Error ? err.message : 'Unable to restore clients')
      } finally {
        setSaveLoading(false)
      }
    })()
  }

  const handleDeleteSelected = () => {
    void (async () => {
      if (selectedRows.length === 0) {
        setSaveMessage('Select at least one client to delete.')
        return
      }
      const ok = window.confirm(
        `Permanently delete ${selectedRows.length} record(s)? Records still used elsewhere will be skipped. This cannot be undone.`,
      )
      if (!ok) return
      setSaveMessage(null)
      setSaveLoading(true)
      try {
        const ids = selectedRows.map((r) => r.id)
        const { data, error } = await supabase.rpc('delete_master_rows', { p_table: 'clients', p_ids: ids })
        if (error) throw error
        const res = (data ?? null) as MasterDeleteResult | null
        const deleted = Array.isArray(res?.deleted) ? res.deleted : []
        if (deleted.length > 0) invalidateClientsCache()
        setSaveMessage(formatPermanentDeleteMessage(res, (id) => rows.find((r) => r.id === id)?.company_name || id))
        setSelectedIds(new Set())
        await loadClients()
      } catch (err) {
        setSaveMessage(err instanceof Error ? err.message : 'Unable to delete clients')
      } finally {
        setSaveLoading(false)
      }
    })()
  }

  const handleExport = () => {
    const exportRows = pagedRows
    if (exportRows.length === 0) {
      setSaveMessage('No clients to export.')
      return
    }

    const headers = [...CLIENT_CSV_HEADERS]
    const lines = exportRows.map((r) => ({
      gst_number: r.gst_number ?? '',
      company_type: r.company_type,
      company_scale: r.company_scale,
      company_name: r.company_name,
      address: r.address ?? '',
      pin_code: r.pin_code ?? '',
      district: r.district ?? '',
      state: r.state ?? '',
      country: r.country ?? '',
      contact_person_name: r.contact_person_name ?? '',
      country_code: r.country_code ?? '',
      mobile: r.mobile ?? '',
      email: r.email ?? '',
      opening_balance: String(r.opening_balance ?? 0),
      balance_type: r.balance_type,
      payment_term: r.payment_term ?? '',
      remark: r.remark ?? '',
      id: r.id,
    }))

    const csv = `\uFEFF${toCsv(headers, lines)}`
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `clients-export-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
    const exportNote = `Exported this page (${exportRows.length} of ${total}).`
    toast(exportNote)
    setSaveMessage(exportNote)
  }

  const handleImport = () => {
    if (!canEdit) {
      setSaveMessage(VIEW_ONLY_MSG)
      return
    }
    setSaveMessage(null)
    importInputRef.current?.click()
  }

  const handleImportFile = (file: File) => {
    if (!canEdit) {
      setSaveMessage(VIEW_ONLY_MSG)
      return
    }
    void (async () => {
      setSaveMessage(null)
      setSaveLoading(true)
      try {
        const text = await file.text()
        const records = parseCsv(text.replace(/^\uFEFF/, ''))
        if (records.length < 2) {
          setSaveMessage('CSV must include a header row and at least one data row.')
          return
        }

        const header = records[0]!.map((h) => h.trim())
        const col = resolveCsvHeaderIndex(header)
        if (col.company_name == null) {
          setSaveMessage('CSV header must include company_name (or “Name of the Company”).')
          return
        }

        const rowsData = records.slice(1).filter((r) => r.some((c) => String(c ?? '').trim().length > 0))
        const get = (cells: string[], key: (typeof CLIENT_CSV_HEADERS)[number]) => {
          const idx = col[key]
          return idx == null ? '' : String(cells[idx] ?? '')
        }

        const valid: Array<Record<string, unknown>> = []
        const invalid: string[][] = []

        for (const cells of rowsData) {
          const companyName = toProperTitleCase(normalizeText(get(cells, 'company_name')))
          if (!companyName) continue

          const opening = Number(String(get(cells, 'opening_balance')).replace(/,/g, ''))
          const payload: Record<string, unknown> = {
            name: companyName,
            gst_number: normalizeText(get(cells, 'gst_number')).toUpperCase() || null,
            company_type: pickCsvEnum(get(cells, 'company_type'), COMPANY_TYPES, 'Manufacturer') as CompanyType,
            company_scale: pickCsvEnum(get(cells, 'company_scale'), COMPANY_SCALES, 'Medium') as CompanyScale,
            company_name: companyName,
            contact_person_name: toProperTitleCase(normalizeText(get(cells, 'contact_person_name'))) || null,
            country_code: normalizeText(get(cells, 'country_code')) || '+91',
            mobile: normalizeText(get(cells, 'mobile')).replace(/\s+/g, '') || null,
            email: normalizeText(get(cells, 'email')).toLowerCase() || null,
            address: toProperTitleCase(normalizeText(get(cells, 'address'))) || null,
            pin_code: normalizeText(get(cells, 'pin_code')) || null,
            district: toProperTitleCase(normalizeText(get(cells, 'district'))) || null,
            state: toProperTitleCase(normalizeText(get(cells, 'state'))) || DEFAULT_STATE,
            country: toProperTitleCase(normalizeText(get(cells, 'country'))) || DEFAULT_COUNTRY,
            opening_balance: Number.isFinite(opening) ? opening : 0,
            balance_type: pickCsvEnum(get(cells, 'balance_type'), BALANCE_TYPES, 'Dr') as BalanceType,
            payment_term: normalizePaymentTerm(get(cells, 'payment_term')),
            remark: normalizeText(get(cells, 'remark')) || null,
          }

          const problems: string[] = []
          const gst = String(payload.gst_number ?? '')
          const mobile = String(payload.mobile ?? '')
          const pin = String(payload.pin_code ?? '')
          const code = String(payload.country_code ?? '+91')
          if (gst && !isValidGstin(gst)) problems.push('Invalid GSTIN')
          if (mobile && !isValidIndianMobile(mobile, code)) problems.push('Invalid mobile')
          if (pin && !isValidIndianPin(pin)) problems.push('Invalid PIN')
          if (problems.length > 0) {
            invalid.push([...cells, problems.join('; ')])
            continue
          }

          const id = normalizeText(get(cells, 'id'))
          if (id) valid.push({ ...payload, id })
          else valid.push(payload)
        }

        if (valid.length === 0 && invalid.length === 0) {
          setSaveMessage('No valid rows found (company_name missing).')
          return
        }
        setCsvPreview({ valid, invalid })
        setSaveMessage(`${valid.length} row(s) ready. ${invalid.length} invalid row(s) held back.`)
      } catch (err) {
        setSaveMessage(formatSupabaseError(err))
      } finally {
        setSaveLoading(false)
      }
    })()
  }

  const commitCsvImport = () => {
    const preview = csvPreview
    if (!preview || preview.valid.length === 0) return
    void (async () => {
      setSaveLoading(true)
      try {
        const withId = preview.valid.filter((row) => row.id)
        const byName = preview.valid.filter((row) => !row.id)
        if (withId.length > 0) {
          const { error } = await supabase.from('clients').upsert(withId, { onConflict: 'id' })
          if (error) throw error
        }
        if (byName.length > 0) {
          const { error } = await supabase.from('clients').upsert(byName, { onConflict: 'company_name' })
          if (error) {
            if (String(error.code) === '42P10' || /ON CONFLICT/i.test(error.message ?? '')) {
              const { error: insertErr } = await supabase.from('clients').insert(byName)
              if (insertErr) throw insertErr
            } else throw error
          }
        }
        setSaveMessage(`Imported ${preview.valid.length} valid client(s). ${preview.invalid.length} invalid row(s) were not imported.`)
        setCsvPreview(null)
        invalidateClientsCache()
        await loadClients()
      } catch (err) {
        setSaveMessage(formatSupabaseError(err))
      } finally {
        setSaveLoading(false)
      }
    })()
  }

  const downloadCsvErrors = () => {
    const preview = csvPreview
    if (!preview) return
    const lines = ['row,reason', ...preview.invalid.map((cells) => `"${cells.join(' | ').replace(/"/g, '""')}"`)]
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'clients-import-errors.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div
      data-master-scroll="table"
      className={cn(
        clientPageShellClass,
        'flex h-full min-h-0 flex-col overflow-hidden !space-y-0 gap-2 sm:gap-3 md:gap-3',
      )}
    >
      <div className="shrink-0">
        <ClientsHeaderBar
          search={search}
          onSearchChange={setSearch}
          pageSize={pageSize}
          onPageSizeChange={(size) => {
            setPageSize(size)
            setPage(1)
          }}
          onNew={handleNew}
          canEdit={canEdit}
          assistantContext={assistantContext}
          onAssistantDataChanged={() => void loadClients()}
        />
      </div>

      <Dialog open={showForm} onOpenChange={handleFormOpenChange}>
        <DialogContent
          persistOnFocusLoss
          aria-describedby={undefined}
          className={cn(
            limsDialogClass,
            'max-h-[92vh] max-w-[51.2rem] bg-white',
            'w-[min(51.2rem,calc(100vw-1.5rem))]',
          )}
        >
          <div className="relative overflow-hidden bg-gradient-to-br from-stone-800 via-stone-900 to-stone-950 px-4 py-2.5 text-white sm:px-5 sm:py-3">
            <div
              className="pointer-events-none absolute inset-0 opacity-[0.18]"
              style={{
                backgroundImage:
                  'radial-gradient(circle at 12% 20%, rgba(217,119,6,0.45), transparent 42%), radial-gradient(circle at 88% 0%, rgba(251,191,36,0.25), transparent 35%)',
              }}
            />
            <div className="absolute bottom-0 left-0 h-[2px] w-full bg-gradient-to-r from-amber-500 via-amber-300 to-transparent" />
            <DialogHeader className="relative pr-10 text-left">
              <DialogTitle className="text-base font-semibold tracking-tight text-white sm:text-lg">
                {editingId ? 'Edit Client' : 'Add New Client'}
              </DialogTitle>
            </DialogHeader>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden bg-gradient-to-b from-stone-100/80 to-white px-3 py-3 sm:px-5 sm:py-4 md:px-6 md:py-5">
            {saveMessage ? (
              <p className="mb-4 border-l-2 border-destructive bg-destructive/5 px-3 py-2 text-sm text-destructive">
                {saveMessage}
              </p>
            ) : null}
            {duplicates.length > 0 ? (
              <div className="mb-4 border border-amber-600 bg-amber-50 p-3 text-sm text-stone-800">
                <p className="font-medium">Possible duplicate</p>
                <ul className="mt-2 space-y-1">
                  {duplicates.map((hit) => (
                    <li key={hit.id}>{hit.company_name} {hit.gst_number ? `(${hit.gst_number})` : ''}</li>
                  ))}
                </ul>
                <Button type="button" className="mt-3 h-10 min-h-10" onClick={() => { allowDuplicateRef.current = true; setAllowDuplicateSave(true); handleSave() }}>
                  Save anyway
                </Button>
              </div>
            ) : null}
            <ClientsForm
            form={form}
            onChange={(next) => {
              setAllowDuplicateSave(false)
              setForm(next)
            }}
            clientSaved={Boolean(editingId)}
            certificates={certificates}
            onUploadCertificate={(certName, file) => {
              if (!editingId) return
              void uploadClientCertificate(editingId, certName, file)
                .then(() => listClientCertificates(editingId))
                .then(setCertificates)
                .catch((err) => setSaveMessage(err instanceof Error ? err.message : 'Unable to upload certificate'))
            }}
            onDeleteCertificate={(row) => {
              void deleteClientCertificate(row)
                .then(() => setCertificates((prev) => prev.filter((item) => item.id !== row.id)))
                .catch((err) => setSaveMessage(err instanceof Error ? err.message : 'Unable to delete certificate'))
            }}
            onOpenCertificate={(row) => {
              void openClientCertificate(row).catch((err) => setSaveMessage(err instanceof Error ? err.message : 'Unable to open certificate'))
            }}
            states={states}
            countries={countries}
            districts={districts}
            pinCodes={pinCodes}
            pinAutoFill={pinAutoFill}
            countryCodes={countryCodes}
            companyTypes={companyTypes}
            companyScales={companyScales}
            paymentTerms={paymentTerms}
            stateDialogOpen={stateDialogOpen}
            setStateDialogOpen={setStateDialogOpen}
            newStateName={newStateName}
            setNewStateName={setNewStateName}
            onAddState={handleAddState}
            onUpdateState={(id: string) => updateMasterOption(id, 'state', newStateName)}
            onDeleteState={(id: string) => deleteMasterOption(id, 'state')}
            countryDialogOpen={countryDialogOpen}
            setCountryDialogOpen={setCountryDialogOpen}
            newCountryName={newCountryName}
            setNewCountryName={setNewCountryName}
            onAddCountry={handleAddCountry}
            onUpdateCountry={(id: string) => updateMasterOption(id, 'country', newCountryName)}
            onDeleteCountry={(id: string) => deleteMasterOption(id, 'country')}
            districtDialogOpen={districtDialogOpen}
            setDistrictDialogOpen={setDistrictDialogOpen}
            newDistrictName={newDistrictName}
            setNewDistrictName={setNewDistrictName}
            onAddDistrict={handleAddDistrict}
            onUpdateDistrict={(id: string) => updateMasterOption(id, 'district', newDistrictName)}
            onDeleteDistrict={(id: string) => deleteMasterOption(id, 'district')}
            pinCodeDialogOpen={pinCodeDialogOpen}
            setPinCodeDialogOpen={setPinCodeDialogOpen}
            newPinCode={newPinCode}
            setNewPinCode={setNewPinCode}
            onAddPinCode={handleAddPinCode}
            onUpdatePinCode={(id: string) => updateMasterOption(id, 'pin_code', newPinCode)}
            onDeletePinCode={(id: string) => deleteMasterOption(id, 'pin_code')}
            countryCodeDialogOpen={countryCodeDialogOpen}
            setCountryCodeDialogOpen={setCountryCodeDialogOpen}
            newCountryCode={newCountryCode}
            setNewCountryCode={setNewCountryCode}
            onAddCountryCode={handleAddCountryCode}
            onUpdateCountryCode={(id: string) => updateMasterOption(id, 'country_code', newCountryCode)}
            onDeleteCountryCode={(id: string) => deleteMasterOption(id, 'country_code')}
            companyTypeDialogOpen={companyTypeDialogOpen}
            setCompanyTypeDialogOpen={setCompanyTypeDialogOpen}
            newCompanyType={newCompanyType}
            setNewCompanyType={setNewCompanyType}
            onAddCompanyType={() =>
              addSimpleOption('company_type', newCompanyType, (id) => {
                setCompanyTypes((prev) => [...prev, { id, label: normalizeText(newCompanyType) }])
                setForm((prev) => ({ ...prev, companyType: normalizeText(newCompanyType) as ClientFormType['companyType'] }))
                setNewCompanyType('')
                setCompanyTypeDialogOpen(false)
              })
            }
            onUpdateCompanyType={(id: string) => updateMasterOption(id, 'company_type', newCompanyType)}
            onDeleteCompanyType={(id: string) => deleteMasterOption(id, 'company_type')}
            companyScaleDialogOpen={companyScaleDialogOpen}
            setCompanyScaleDialogOpen={setCompanyScaleDialogOpen}
            newCompanyScale={newCompanyScale}
            setNewCompanyScale={setNewCompanyScale}
            onAddCompanyScale={() =>
              addSimpleOption('company_scale', newCompanyScale, (id) => {
                setCompanyScales((prev) => [...prev, { id, label: normalizeText(newCompanyScale) }])
                setForm((prev) => ({ ...prev, companyScale: normalizeText(newCompanyScale) as ClientFormType['companyScale'] }))
                setNewCompanyScale('')
                setCompanyScaleDialogOpen(false)
              })
            }
            onUpdateCompanyScale={(id: string) => updateMasterOption(id, 'company_scale', newCompanyScale)}
            onDeleteCompanyScale={(id: string) => deleteMasterOption(id, 'company_scale')}
            paymentTermDialogOpen={paymentTermDialogOpen}
            setPaymentTermDialogOpen={setPaymentTermDialogOpen}
            newPaymentTerm={newPaymentTerm}
            setNewPaymentTerm={setNewPaymentTerm}
            onAddPaymentTerm={() =>
              addSimpleOption('payment_term', newPaymentTerm, (id) => {
                setPaymentTerms((prev) => [...prev, { id, label: normalizeText(newPaymentTerm) }])
                setForm((prev) => ({ ...prev, paymentTerm: normalizeText(newPaymentTerm) as ClientFormType['paymentTerm'] }))
                setNewPaymentTerm('')
                setPaymentTermDialogOpen(false)
              })
            }
            onUpdatePaymentTerm={(id: string) => updateMasterOption(id, 'payment_term', newPaymentTerm)}
            onDeletePaymentTerm={(id: string) => deleteMasterOption(id, 'payment_term')}
            canSave={canSave}
            saveLoading={saveLoading}
            onSave={handleSave}
          />
          </div>
        </DialogContent>
      </Dialog>

      <div className="min-h-0 flex-1 overflow-hidden">
        <ClientsTable
          rows={pagedRows}
          loading={listLoading}
          error={listError}
          searchActive={search.trim().length > 0}
          selectedIds={selectedIds}
          onToggle={toggleRow}
          onToggleAll={toggleAllOnPage}
          onEdit={handleEdit}
          onCopy={handleCopy}
          sortKey={sortKey}
          sortDir={sortDir}
          onSort={handleSort}
        />
      </div>

      <div className="shrink-0">
        <ClientsTableFooterBar
          message={saveMessage}
          loading={saveLoading}
          selectedCount={selectedIds.size}
          totalCount={total}
          rangeFrom={rangeFrom}
          rangeTo={rangeTo}
          page={page}
          pageCount={pageCount}
          onImport={handleImport}
          onExport={handleExport}
          onPrintSelected={handlePrintSelected}
          onDeleteSelected={handleDeleteSelected}
          onHistory={() => setHistoryOpen(true)}
          canEdit={canEdit}
          showArchived={showArchived}
          onToggleShowArchived={() => setShowArchived((v) => !v)}
          onArchiveSelected={handleArchiveSelected}
          onRestoreSelected={handleRestoreSelected}
          onPrevPage={() => setPage((p) => Math.max(1, p - 1))}
          onNextPage={() => setPage((p) => Math.min(pageCount, p + 1))}
          jumpTo={jumpTo}
          onJumpToChange={setJumpTo}
          onJumpToGo={() => {
            const n = Number(jumpTo)
            if (!Number.isFinite(n) || n <= 0) return
            setPage(Math.min(pageCount, Math.max(1, n)))
          }}
        />
      </div>

      <Dialog open={copySourceId != null} onOpenChange={(open) => { if (!open) setCopySourceId(null) }}>
        <DialogContent className={cn(limsDialogClass, 'w-[min(28rem,calc(100vw-1rem))]')}>
          <DialogHeader>
            <DialogTitle>Copy client</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 p-4">
            <label className="text-sm" htmlFor="copy-client-name">New company name</label>
            <Input id="copy-client-name" className="h-10 min-h-10" value={copyName} onChange={(e) => setCopyName(e.target.value)} />
            <Button type="button" className="h-10 min-h-10" onClick={confirmCopy} disabled={!copyName.trim()}>Continue</Button>
          </div>
        </DialogContent>
      </Dialog>
      <Dialog open={csvPreview != null} onOpenChange={(open) => { if (!open) setCsvPreview(null) }}>
        <DialogContent className={cn(limsDialogClass, 'w-[min(36rem,calc(100vw-1rem))]')}>
          <DialogHeader>
            <DialogTitle>Import preview</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 p-4 text-sm">
            <p>{csvPreview?.valid.length ?? 0} valid row(s) will be imported.</p>
            <p>{csvPreview?.invalid.length ?? 0} invalid row(s) will be skipped.</p>
            <div className="flex flex-wrap gap-2">
              <Button type="button" className="h-10 min-h-10" onClick={commitCsvImport} disabled={!csvPreview?.valid.length}>Import valid rows</Button>
              <Button type="button" variant="outline" className="h-10 min-h-10" onClick={downloadCsvErrors} disabled={!csvPreview?.invalid.length}>Download error CSV</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
      <AuditHistoryDialog
        open={historyOpen}
        onOpenChange={setHistoryOpen}
        table="clients"
        rowId={selectedIds.size === 1 ? [...selectedIds][0] : null}
        recordLabel={
          rows.find((row) => selectedIds.size === 1 && selectedIds.has(row.id))?.company_name ??
          'client'
        }
      />

      <input
        ref={importInputRef}
        type="file"
        accept=".csv,text/csv"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) handleImportFile(f)
          e.currentTarget.value = ''
        }}
      />
    </div>
  )
}

function toCsv(headers: string[], rows: Array<Record<string, string>>) {
  const escape = (value: string) => {
    const v = value ?? ''
    return `"${String(v).replace(/"/g, '""')}"`
  }

  const out: string[] = []
  out.push(headers.map(escape).join(','))

  for (const r of rows) {
    out.push(headers.map((h) => escape(String(r[h] ?? ''))).join(','))
  }

  return out.join('\n')
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let inQuotes = false

  const flushCell = () => {
    row.push(cell)
    cell = ''
  }

  const flushRow = () => {
    flushCell()
    rows.push(row)
    row = []
  }

  for (let i = 0; i < text.length; i++) {
    const ch = text[i]

    if (inQuotes) {
      if (ch === '"') {
        const next = text[i + 1]
        if (next === '"') {
          cell += '"'
          i++
        } else {
          inQuotes = false
        }
      } else {
        cell += ch
      }
      continue
    }

    if (ch === '"') {
      inQuotes = true
      continue
    }

    if (ch === ',') {
      flushCell()
      continue
    }

    if (ch === '\n') {
      flushRow()
      continue
    }

    if (ch === '\r') {
      continue
    }

    cell += ch
  }

  if (cell.length > 0 || row.length > 0) {
    flushRow()
  }

  return rows.map((r) => r.map((c) => c.trim()))
}

/** Half-A4 courier address slips — cut along the dashed line to stick on parcels. */
function buildCourierSlipPrintHtml(rows: ClientRow[]) {
  const esc = (v: string) =>
    v
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;')

  const slipHtml = (r: ClientRow) => {
    const address = formatClientAddress(r)
    const mobile = `${r.country_code || '+91'} ${r.mobile || ''}`.trim()
    return `
      <article class="slip">
        <div class="cut">✂ Cut here — half A4 courier slip</div>
        <p class="to">TO</p>
        <h1 class="name">${esc(r.company_name)}</h1>
        ${r.contact_person_name?.trim() ? `<p class="attn">Attn: ${esc(r.contact_person_name)}</p>` : ''}
        <p class="addr">${esc(address || '—')}</p>
        <div class="meta">
          <div><span class="k">Mobile</span><span class="v">${esc(mobile || '—')}</span></div>
          <div><span class="k">Email</span><span class="v">${esc(r.email || '—')}</span></div>
          <div><span class="k">GST</span><span class="v">${esc(r.gst_number || '—')}</span></div>
          <div><span class="k">Type</span><span class="v">${esc(r.company_type)} · ${esc(r.company_scale)}</span></div>
        </div>
        <p class="foot">Q Engineering · Client Directory</p>
      </article>`
  }

  const pages: string[] = []
  for (let i = 0; i < rows.length; i += 2) {
    const top = rows[i]!
    const bottom = rows[i + 1]
    pages.push(`
      <section class="sheet">
        ${slipHtml(top)}
        ${bottom ? slipHtml(bottom) : '<article class="slip empty"></article>'}
      </section>`)
  }

  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>Courier Slips</title>
    <style>
      @page { size: A4 portrait; margin: 0; }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        color: #1c1917;
        font-family: "Courier New", Courier, ui-monospace, monospace;
        background: #fff;
      }
      .sheet {
        width: 210mm;
        height: 297mm;
        page-break-after: always;
        break-after: page;
      }
      .sheet:last-child { page-break-after: auto; }
      .slip {
        height: 148.5mm;
        padding: 10mm 12mm 8mm;
        border-bottom: 1px dashed #78716c;
        position: relative;
        overflow: hidden;
      }
      .slip.empty { border-bottom: 0; }
      .cut {
        position: absolute;
        top: 3mm;
        right: 8mm;
        font-size: 9px;
        letter-spacing: 0.04em;
        color: #78716c;
        text-transform: uppercase;
      }
      .to {
        margin: 4mm 0 2mm;
        font-size: 11px;
        font-weight: 700;
        letter-spacing: 0.18em;
        color: #57534e;
      }
      .name {
        margin: 0 0 2mm;
        font-size: 20px;
        line-height: 1.2;
        font-weight: 700;
        text-transform: uppercase;
      }
      .attn {
        margin: 0 0 3mm;
        font-size: 13px;
        font-weight: 600;
      }
      .addr {
        margin: 0 0 5mm;
        font-size: 13px;
        line-height: 1.45;
        white-space: pre-wrap;
        max-width: 170mm;
      }
      .meta {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 2.5mm 6mm;
        border-top: 1px solid #d6d3d1;
        padding-top: 4mm;
      }
      .meta .k {
        display: block;
        font-size: 9px;
        letter-spacing: 0.12em;
        text-transform: uppercase;
        color: #78716c;
      }
      .meta .v {
        display: block;
        margin-top: 1mm;
        font-size: 12px;
        font-weight: 600;
        word-break: break-word;
      }
      .foot {
        position: absolute;
        left: 12mm;
        bottom: 5mm;
        margin: 0;
        font-size: 9px;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: #a8a29e;
      }
      @media screen {
        body { background: #e7e5e4; padding: 12px; }
        .sheet {
          margin: 0 auto 16px;
          background: #fff;
          box-shadow: 0 2px 12px rgba(0,0,0,.12);
        }
      }
    </style>
  </head>
  <body>
    ${pages.join('')}
  </body>
</html>`
}
