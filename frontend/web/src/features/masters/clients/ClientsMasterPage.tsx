import { useEffect, useMemo, useRef, useState } from 'react'
import { fetchAllRows } from '@/lib/fetchAllRows'
import { invalidateClientsCache } from '@/lib/clientsCache'
import { supabase } from '@/lib/supabaseClient'
import { useFormDialogOpenChange } from '@/lib/formDialogOpenChange'
import { useMasterUiSearchState } from '@/lib/useMasterUiSearchState'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { ClientsTableFooterBar } from './ClientsFooterBar'
import { ClientsForm } from './ClientsForm'
import { ClientsHeaderBar } from './ClientsHeaderBar'
import { ClientsTable, type ClientSortDir, type ClientSortKey } from './ClientsTable'
import { clientPageShellClass } from './clientsFormUi'
import { buildClientsAssistantContext } from './buildClientsAssistantContext'
import { limsDialogClass } from '@/lib/limsThemeUi'
import { cn } from '@/lib/utils'
import {
  BALANCE_TYPES,
  COMPANY_SCALES,
  COMPANY_TYPES,
  DEFAULT_COUNTRY,
  DEFAULT_STATE,
  emptyClientForm,
  formatClientAddress,
  isValidEmail,
  isValidGst,
  isValidIndianPin,
  isValidMobile,
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
    paymentTerm: row.payment_term,
    remark: row.remark ?? '',
  }
}

export default function ClientsMasterPage() {
  const { editId, setEdit } = useMasterUiSearchState()
  const [saveLoading, setSaveLoading] = useState(false)
  const [saveMessage, setSaveMessage] = useState<string | null>(null)

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
  const [listLoading, setListLoading] = useState(false)
  const [listError, setListError] = useState<string | null>(null)

  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set())
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

  const gstError = useMemo(() => (isValidGst(form.gstNumber) ? null : 'Invalid GST Number'), [form.gstNumber])
  const mobileError = useMemo(() => (isValidMobile(form.mobile) ? null : 'Mobile number must be 10 digits'), [form.mobile])
  const emailError = useMemo(() => (isValidEmail(form.email) ? null : 'Invalid email address'), [form.email])
  const pinError = useMemo(() => (isValidIndianPin(form.pinCode) ? null : 'Invalid PIN code'), [form.pinCode])

  const canSave =
    !saveLoading &&
    !gstError &&
    !mobileError &&
    !emailError &&
    !pinError &&
    form.companyName.trim().length > 0

  const loadClients = async () => {
    setListError(null)
    setListLoading(true)
    try {
      await supabase.auth.getSession()
      const data = await fetchAllRows<ClientRow>(
        (from, to) =>
          supabase
            .from('clients')
            .select('*')
            .order('company_name', { ascending: true })
            .order('id', { ascending: true })
            .range(from, to),
        {
          concurrency: 4,
          count: () => supabase.from('clients').select('id', { count: 'exact', head: true }),
        },
      )

      const list = (Array.isArray(data) ? (data as ClientRow[]) : [])
        .map((r) => ({
          ...r,
          company_type: (r.company_type ?? 'Manufacturer') as ClientRow['company_type'],
          company_scale: (r.company_scale ?? 'Medium') as ClientRow['company_scale'],
          balance_type: (r.balance_type ?? 'Dr') as ClientRow['balance_type'],
          payment_term: (r.payment_term ?? '100 % Advance') as ClientRow['payment_term'],
          remark: (r.remark ?? null) as ClientRow['remark'],
        }))

      setRows(list)

      const districtsFromDb = Array.from(new Set(list.map((r) => r.district).filter((d): d is string => !!d && d.trim().length > 0)))
        .map((label) => ({ id: `db-district-${label}`, label }))
        .sort((a, b) => nameCollator.compare(a.label, b.label))
      setDistricts((prev) => {
        const merged = [...prev, ...districtsFromDb]
        const uniq = new Map(merged.map((x) => [x.label.toLowerCase(), x]))
        return Array.from(uniq.values()).sort((a, b) => nameCollator.compare(a.label, b.label))
      })

      const pinCodesFromDb = Array.from(new Set(list.map((r) => r.pin_code).filter((p): p is string => !!p && p.trim().length > 0)))
        .map((label) => ({ id: `db-pin-${label}`, label }))
        .sort((a, b) => nameCollator.compare(a.label, b.label))
      setPinCodes((prev) => {
        const merged = [...prev, ...pinCodesFromDb]
        const uniq = new Map(merged.map((x) => [x.label.toLowerCase(), x]))
        return Array.from(uniq.values()).sort((a, b) => nameCollator.compare(a.label, b.label))
      })
    } catch (err) {
      setListError(err instanceof Error ? err.message : 'Unable to load clients')
    } finally {
      setListLoading(false)
    }
  }

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
    void loadClients()
    void loadMasterOptions()
  }, [])

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

    const fromPage = rows.find((r) => r.id === editId)
    if (fromPage) {
      setForm(rowToClientForm(fromPage))
      hydratedEditRef.current = editId
      return
    }

    if (!listLoading) setEdit(null)
  }, [editId, rows, listLoading, setEdit])

  const handleAddState = () => {
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
    void (async () => {
      setSaveMessage(null)
      setSaveLoading(true)
      try {
        const companyName = toProperTitleCase(form.companyName)
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
        }

        // Prefer insert/update over upsert — avoids 42P10 when the unique index
        // on company_name is missing on some environments.
        if (editingId) {
          const { data, error } = await supabase.from('clients').update(payload).eq('id', editingId).select('id')
          if (error) throw error
          if (!data || data.length === 0) {
            throw new Error('You do not have edit access for this record (view-only).')
          }
        } else {
          const { error } = await supabase.from('clients').insert(payload)
          if (error) throw error
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

  const handleEdit = (row: ClientRow) => {
    setSaveMessage(null)
    setForm(rowToClientForm(row))
    hydratedEditRef.current = row.id
    setEdit(row.id)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const handleCopy = (row: ClientRow) => {
    setSaveMessage(null)
    setForm({ ...rowToClientForm(row), companyName: `${row.company_name} - Copy` })
    hydratedEditRef.current = 'new'
    setEdit('new')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase()
    const list = !q
      ? [...rows]
      : rows.filter((r) => {
          const blob = [
            r.company_name,
            r.gst_number ?? '',
            r.company_type,
            r.company_scale,
            r.contact_person_name ?? '',
            r.country_code ?? '',
            r.mobile ?? '',
            r.email ?? '',
            r.address ?? '',
            r.pin_code ?? '',
            r.district ?? '',
            r.state ?? '',
            r.country ?? '',
            String(r.opening_balance ?? ''),
            r.balance_type,
            r.payment_term,
            r.remark ?? '',
          ]
            .join(' ')
            .toLowerCase()

          return blob.includes(q)
        })

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
  }, [rows, search, sortKey, sortDir])

  const pageCount = Math.max(1, Math.ceil(filteredRows.length / pageSize))

  useEffect(() => {
    setPage(1)
    setJumpTo('')
  }, [search, pageSize, sortKey, sortDir])

  const handleSort = (key: ClientSortKey) => {
    if (sortKey === key) {
      setSortDir((prev) => (prev === 'asc' ? 'desc' : 'asc'))
      return
    }
    setSortKey(key)
    setSortDir('asc')
  }

  const pagedRows = useMemo(() => {
    const start = (page - 1) * pageSize
    return filteredRows.slice(start, start + pageSize)
  }, [filteredRows, page, pageSize])

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

  const handleDeleteSelected = () => {
    void (async () => {
      if (selectedRows.length === 0) {
        setSaveMessage('Select at least one client to delete.')
        return
      }
      const preview = selectedRows
        .slice(0, 5)
        .map((r) => `• ${r.company_name}`)
        .join('\n')
      const more =
        selectedRows.length > 5 ? `\n…and ${selectedRows.length - 5} more` : ''
      const ok = window.confirm(
        `Delete ${selectedRows.length} selected client(s)?\n\n${preview}${more}\n\nThis cannot be undone.`,
      )
      if (!ok) return
      setSaveMessage(null)
      setSaveLoading(true)
      try {
        const ids = selectedRows.map((r) => r.id)
        const { data, error } = await supabase.from('clients').delete().in('id', ids).select('id')
        if (error) throw error
        const deleted = Array.isArray(data) ? data.length : 0
        if (deleted === 0) {
          setSaveMessage('Delete not allowed — only Laboratory Director/Admin can delete.')
          return
        }
        invalidateClientsCache()
        setSaveMessage(
          deleted < ids.length ? `Deleted ${deleted} of ${ids.length}.` : `Deleted ${ids.length} client(s).`,
        )
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
    const exportRows = selectedRows.length > 0 ? selectedRows : filteredRows
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
      payment_term: r.payment_term,
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
    setSaveMessage(
      `Exported ${exportRows.length} client(s) with all form fields${
        selectedRows.length > 0 ? ' (selection)' : ' (current filter)'
      }.`,
    )
  }

  const handleImport = () => {
    setSaveMessage(null)
    importInputRef.current?.click()
  }

  const handleImportFile = (file: File) => {
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

        const withId: Array<Record<string, unknown>> = []
        const byName: Array<Record<string, unknown>> = []

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

          const id = normalizeText(get(cells, 'id'))
          if (id) {
            withId.push({ ...payload, id })
          } else {
            byName.push(payload)
          }
        }

        const total = withId.length + byName.length
        if (total === 0) {
          setSaveMessage('No valid rows found (company_name missing).')
          return
        }

        if (withId.length > 0) {
          const { error } = await supabase.from('clients').upsert(withId, { onConflict: 'id' })
          if (error) throw error
          invalidateClientsCache()
        }
        if (byName.length > 0) {
          const { error } = await supabase
            .from('clients')
            .upsert(byName, { onConflict: 'company_name' })
          // 42P10 = missing unique constraint for ON CONFLICT — fall back to insert.
          if (error) {
            if (String(error.code) === '42P10' || /ON CONFLICT/i.test(error.message ?? '')) {
              const { error: insertErr } = await supabase.from('clients').insert(byName)
              if (insertErr) throw insertErr
            } else {
              throw error
            }
          }
        }

        setSaveMessage(`Imported ${total} client(s) with all form fields.`)
        invalidateClientsCache()
        await loadClients()
      } catch (err) {
        setSaveMessage(formatSupabaseError(err))
      } finally {
        setSaveLoading(false)
      }
    })()
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
            <ClientsForm
            form={form}
            onChange={setForm}
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
          totalCount={rows.length}
          visibleCount={filteredRows.length}
          page={page}
          pageCount={pageCount}
          onImport={handleImport}
          onExport={handleExport}
          onPrintSelected={handlePrintSelected}
          onDeleteSelected={handleDeleteSelected}
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
