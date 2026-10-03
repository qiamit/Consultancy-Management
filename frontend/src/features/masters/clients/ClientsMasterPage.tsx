import { useEffect, useMemo, useRef, useState } from 'react'
import { getCurrencySymbol } from '@/lib/appCurrency'
import { supabase } from '@/lib/supabaseClient'
import { useFormDialogOpenChange } from '@/lib/formDialogOpenChange'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { ClientsTableFooterBar } from './ClientsFooterBar'
import { ClientsForm } from './ClientsForm'
import { ClientsHeaderBar } from './ClientsHeaderBar'
import { ClientsTable } from './ClientsTable'
import { clientPageShellClass } from './clientsFormUi'
import { buildClientsAssistantContext } from './buildClientsAssistantContext'
import {
  DEFAULT_COUNTRY,
  DEFAULT_STATE,
  emptyClientForm,
  formatClientAddress,
  isValidEmail,
  isValidGst,
  isValidIndianPin,
  isValidMobile,
  toContinuousText,
  toProperTitleCase,
  type ClientForm as ClientFormType,
  type ClientRow,
} from './types'

const normalizeText = (value: string) => value.trim()

const formatSupabaseError = (err: unknown) => {
  if (!err || typeof err !== 'object') return 'Unknown error'
  const anyErr = err as { message?: string; details?: string; hint?: string; code?: string }
  const parts = [anyErr.message, anyErr.details, anyErr.hint, anyErr.code].filter(Boolean)
  return parts.length ? parts.join(' | ') : 'Unknown error'
}

export default function ClientsMasterPage() {
  const [saveLoading, setSaveLoading] = useState(false)
  const [saveMessage, setSaveMessage] = useState<string | null>(null)

  const [editingId, setEditingId] = useState<string | null>(null)

  const importInputRef = useRef<HTMLInputElement | null>(null)

  const [showForm, setShowForm] = useState(false)
  const handleFormOpenChange = useFormDialogOpenChange(setShowForm)
  const [search, setSearch] = useState('')

  const [rows, setRows] = useState<ClientRow[]>([])
  const [listLoading, setListLoading] = useState(false)
  const [listError, setListError] = useState<string | null>(null)

  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set())
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [jumpTo, setJumpTo] = useState('')

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
      const { data, error } = await supabase
        .from('clients')
        .select('*')
        .order('company_name', { ascending: true })

      if (error) throw error

      const list = (Array.isArray(data) ? (data as ClientRow[]) : [])
        .map((r) => ({
          ...r,
          company_type: (r.company_type ?? 'Manufacturer') as ClientRow['company_type'],
          company_scale: (r.company_scale ?? 'Medium') as ClientRow['company_scale'],
          balance_type: (r.balance_type ?? 'Dr') as ClientRow['balance_type'],
          payment_term: (r.payment_term ?? '100 % Advance') as ClientRow['payment_term'],
          remark: (r.remark ?? null) as ClientRow['remark'],
        }))
        .sort((a, b) => (a.company_name || '').localeCompare(b.company_name || '', undefined, { sensitivity: 'base' }))

      setRows(list)

      const districtsFromDb = Array.from(new Set(list.map((r) => r.district).filter((d): d is string => !!d && d.trim().length > 0)))
        .map((label) => ({ id: `db-district-${label}`, label }))
        .sort((a, b) => a.label.localeCompare(b.label))
      setDistricts((prev) => {
        const merged = [...prev, ...districtsFromDb]
        const uniq = new Map(merged.map((x) => [x.label.toLowerCase(), x]))
        return Array.from(uniq.values()).sort((a, b) => a.label.localeCompare(b.label))
      })

      const pinCodesFromDb = Array.from(new Set(list.map((r) => r.pin_code).filter((p): p is string => !!p && p.trim().length > 0)))
        .map((label) => ({ id: `db-pin-${label}`, label }))
        .sort((a, b) => a.label.localeCompare(b.label))
      setPinCodes((prev) => {
        const merged = [...prev, ...pinCodesFromDb]
        const uniq = new Map(merged.map((x) => [x.label.toLowerCase(), x]))
        return Array.from(uniq.values()).sort((a, b) => a.label.localeCompare(b.label))
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
        const payload = {
          ...(editingId ? { id: editingId } : null),
          gst_number: form.gstNumber.trim().toUpperCase() || null,
          company_type: form.companyType,
          company_scale: form.companyScale,
          company_name: toProperTitleCase(form.companyName),
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

        const { error } = await supabase
          .from('clients')
          .upsert(payload, { onConflict: editingId ? 'id' : 'company_name' })
        if (error) throw error

        setSaveMessage('Saved successfully.')
        setForm(emptyClientForm())
        setEditingId(null)
        setShowForm(false)
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
    setEditingId(null)
    setShowForm(true)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const handleEdit = (row: ClientRow) => {
    setSaveMessage(null)
    setEditingId(row.id)
    setForm({
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
    })
    setShowForm(true)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const handleCopy = (row: ClientRow) => {
    setSaveMessage(null)
    setEditingId(null)
    setForm({
      gstNumber: row.gst_number ?? '',
      companyType: row.company_type,
      companyScale: row.company_scale,
      companyName: `${row.company_name} - Copy`,
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
    })
    setShowForm(true)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase()
    const byName = (a: ClientRow, b: ClientRow) =>
      (a.company_name || '').localeCompare(b.company_name || '', undefined, { sensitivity: 'base' })

    if (!q) return [...rows].sort(byName)

    return rows
      .filter((r) => {
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
      .sort(byName)
  }, [rows, search])

  const pageCount = Math.max(1, Math.ceil(filteredRows.length / pageSize))

  useEffect(() => {
    setPage(1)
    setJumpTo('')
  }, [search, pageSize])

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

  const handlePrintSelected = () => {
    const exportRows = selectedRows.length > 0 ? selectedRows : filteredRows
    if (exportRows.length === 0) return
    const html = buildClientsPrintHtml(exportRows)

    // Use iframe printing to avoid popup blockers and blank about:blank windows.
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

    iframe.onload = () => {
      try {
        win.focus()
        win.print()
      } finally {
        // Give the print dialog a moment before cleanup.
        window.setTimeout(cleanup, 500)
      }
    }
  }

  const handleDeleteSelected = () => {
    void (async () => {
      if (selectedRows.length === 0) return
      const ok = window.confirm(`Delete ${selectedRows.length} selected client(s)?`)
      if (!ok) return
      setSaveMessage(null)
      setSaveLoading(true)
      try {
        const ids = selectedRows.map((r) => r.id)
        const { error } = await supabase.from('clients').delete().in('id', ids)
        if (error) throw error
        setSaveMessage('Deleted successfully.')
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

    const headers = [
      'id',
      'gst_number',
      'company_type',
      'company_scale',
      'company_name',
      'contact_person_name',
      'country_code',
      'mobile',
      'email',
      'address',
      'pin_code',
      'district',
      'state',
      'country',
      'opening_balance',
      'balance_type',
      'payment_term',
      'remark',
      'created_at',
    ]

    const lines = exportRows.map((r) => ({
      id: r.id,
      gst_number: r.gst_number ?? '',
      company_type: r.company_type,
      company_scale: r.company_scale,
      company_name: r.company_name,
      contact_person_name: r.contact_person_name ?? '',
      country_code: r.country_code ?? '',
      mobile: r.mobile ?? '',
      email: r.email ?? '',
      address: r.address ?? '',
      pin_code: r.pin_code ?? '',
      district: r.district ?? '',
      state: r.state ?? '',
      country: r.country ?? '',
      opening_balance: String(r.opening_balance ?? 0),
      balance_type: r.balance_type,
      payment_term: r.payment_term,
      remark: r.remark ?? '',
      created_at: r.created_at ?? '',
    }))

    const csv = toCsv(headers, lines)

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'clients.csv'
    a.click()
    URL.revokeObjectURL(url)
    setSaveMessage('Exported.')
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
        const records = parseCsv(text)
        if (records.length === 0) {
          setSaveMessage('No rows found in CSV.')
          return
        }

        const header = records[0].map((h) => h.trim())
        const rowsData = records.slice(1).filter((r) => r.some((c) => String(c ?? '').trim().length > 0))

        const payloads = rowsData.map((cells) => {
          const get = (key: string) => {
            const idx = header.indexOf(key)
            return idx >= 0 ? (cells[idx] ?? '') : ''
          }

          const opening = Number(get('opening_balance'))
          const balanceType = (get('balance_type') || 'Dr').trim() === 'Cr' ? 'Cr' : 'Dr'

          return {
            gst_number: normalizeText(get('gst_number')).toUpperCase() || null,
            company_type: (normalizeText(get('company_type')) || 'Manufacturer') as ClientRow['company_type'],
            company_scale: (normalizeText(get('company_scale')) || 'Medium') as ClientRow['company_scale'],
            company_name: toProperTitleCase(normalizeText(get('company_name'))),
            contact_person_name: normalizeText(get('contact_person_name')) || null,
            country_code: normalizeText(get('country_code')) || null,
            mobile: normalizeText(get('mobile')) || null,
            email: normalizeText(get('email')) || null,
            address: toProperTitleCase(normalizeText(get('address'))) || null,
            pin_code: normalizeText(get('pin_code')) || null,
            district: normalizeText(get('district')) || null,
            state: normalizeText(get('state')) || null,
            country: normalizeText(get('country')) || null,
            opening_balance: Number.isFinite(opening) ? opening : 0,
            balance_type: balanceType,
            payment_term: (normalizeText(get('payment_term')) || '100 % Advance') as ClientRow['payment_term'],
            remark: normalizeText(get('remark')) || null,
          }
        })

        const cleanPayloads = payloads.filter((p) => p.company_name.trim().length > 0)
        if (cleanPayloads.length === 0) {
          setSaveMessage('No valid rows found (company_name missing).')
          return
        }

        const { error } = await supabase.from('clients').upsert(cleanPayloads, { onConflict: 'company_name' })
        if (error) throw error

        setSaveMessage(`Imported ${cleanPayloads.length} client(s).`)
        await loadClients()
      } catch (err) {
        setSaveMessage(formatSupabaseError(err))
      } finally {
        setSaveLoading(false)
      }
    })()
  }

  return (
    <div className={clientPageShellClass}>
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

      <Dialog open={showForm} onOpenChange={handleFormOpenChange}>
        <DialogContent
          persistOnFocusLoss
          aria-describedby={undefined}
          overlayClassName="lg:inset-y-0 lg:left-[268px] lg:right-0 lg:w-auto"
          className="max-h-[92vh] w-[calc(100vw-1rem)] max-w-5xl gap-0 overflow-hidden rounded-none border-4 border-stone-700 bg-white p-0 shadow-2xl ring-2 ring-amber-700/40 sm:w-full sm:rounded-none [&>button]:!rounded-none [&>button]:opacity-100 lg:left-[calc(268px+(100vw-268px)/2)] md:top-1/2 lg:w-[min(64rem,calc(100vw-268px-2rem))] lg:max-w-[min(64rem,calc(100vw-268px-2rem))] md:!-translate-x-1/2 md:!-translate-y-1/2"
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

          <div className="max-h-[min(72vh,720px)] overflow-y-auto overflow-x-hidden bg-gradient-to-b from-stone-100/80 to-white px-4 py-4 sm:px-6 sm:py-5">
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
      />

      <ClientsTableFooterBar
        message={saveMessage}
        loading={saveLoading}
        selectedCount={selectedIds.size}
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

function buildClientsPrintHtml(rows: ClientRow[]) {
  const esc = (v: string) =>
    v
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;')

  const cards = rows
    .map((r) => {
      const address = formatClientAddress(r)
      const contactLine = [
        `Contact: ${r.contact_person_name || '-'}`,
        `Mobile: ${(`${r.country_code || ''} ${r.mobile || ''}`.trim() || '-')}`,
        `Email: ${r.email || '-'}`,
      ].join('   |   ')
      return `
        <section class="card">
          <div class="card-header">
            <div>
              <div class="title">${esc(r.company_name)}</div>
              <div class="subtitle">GST: ${esc(r.gst_number || '-')}</div>
            </div>
            <div class="badge">${esc(r.company_type)} • ${esc(r.company_scale)}</div>
          </div>
          <div class="grid">
            <div class="field span2"><div class="k">Contact / Mobile / Email</div><div class="v mono">${esc(contactLine)}</div></div>
            <div class="field span2"><div class="k">Address</div><div class="v">${esc(address)}</div></div>
            <div class="field span2"><div class="k">Remark</div><div class="v">${esc(r.remark || '-')}</div></div>
            <div class="field"><div class="k">Opening Balance</div><div class="v">${getCurrencySymbol()} ${esc(String(r.opening_balance ?? 0))} (${esc(r.balance_type)})</div></div>
            <div class="field"><div class="k">Payment Term</div><div class="v">${esc(r.payment_term)}</div></div>
          </div>
        </section>
      `
    })
    .join('')

  return `<!doctype html>
  <html>
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <title>Clients Print Preview</title>
      <style>
        :root{--fg:#0b1220;--muted:#5b6473;--border:#e7eaf0;--bg:#ffffff;--chip:#f5f7fb;--header:#0f172a;--accent:#2563eb}
        *{box-sizing:border-box}
        body{margin:24px;font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial; color:var(--fg); background:linear-gradient(180deg,#ffffff 0%, #fbfcff 100%)}
        .wrap{display:flex;flex-direction:column;gap:16px}
        .card{border:1px solid var(--border);border-radius:14px;overflow:hidden;break-inside:avoid;page-break-inside:avoid;box-shadow:0 1px 0 rgba(15,23,42,.04)}
        .card-header{display:flex;justify-content:space-between;gap:12px;align-items:flex-start;padding:14px 16px;margin-bottom:0;background:linear-gradient(90deg,#0f172a 0%, #111827 60%, #0b1220 100%);color:#fff}
        .title{font-size:18px;font-weight:700;line-height:1.2}
        .subtitle{font-size:12px;opacity:.85;margin-top:2px}
        .badge{font-size:12px;background:rgba(255,255,255,.10);border:1px solid rgba(255,255,255,.18);padding:6px 10px;border-radius:999px;white-space:nowrap}
        .grid{display:grid;grid-template-columns:1fr 1fr;gap:12px;padding:14px 16px}
        .field{border:1px solid var(--border);border-radius:12px;padding:10px 12px;background:#fff}
        .field .k{font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:.06em}
        .field .v{font-size:13px;margin-top:4px}
        .mono{font-variant-numeric:tabular-nums; white-space:nowrap}
        .span2{grid-column:span 2}
        @media print{body{margin:0;background:#fff} .card{border-radius:0; box-shadow:none; border-left:none;border-right:none} .card-header{border-bottom:1px solid var(--border)}}
      </style>
    </head>
    <body>
      <div class="wrap">${cards}</div>
      <script>
        window.addEventListener('load', function () {
          setTimeout(function () {
            try { window.focus(); window.print(); } catch (e) {}
          }, 250);
        });
      </script>
    </body>
  </html>`
}
