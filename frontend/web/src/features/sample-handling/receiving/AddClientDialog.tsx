import { useEffect, useState } from 'react'
import { invalidateClientsCache } from '@/lib/clientsCache'
import { supabase } from '@/lib/supabaseClient'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import {
  deleteClientMasterOption,
  FIRM_NAME_TAKEN,
  findSimilarClients,
  firmNameConstraintMessage,
  firmNameTaken,
  isSameFirmName,
  loadClientAddressDirectory,
  updateClientMasterOption,
  type ClientAddressDirectory,
  type SimilarClient,
} from '@/features/masters/clients/clientsApi'
import { emptyClientForm, isValidGst, toContinuousText, type ClientForm } from '@/features/masters/clients/types'
import { setClientPortalPassword } from '@/features/masters/clients/clientPortalSecretApi'
import { ClientsForm } from '@/features/masters/clients/ClientsForm'
import {
  limsDarkBarGlowStyle,
  limsDialogClass,
  limsDialogSidebarOverlayClass,
  limsDialogSidebarPortalClass,
  limsPrimaryBtnClass,
} from '@/lib/limsThemeUi'
import { cn } from '@/lib/utils'

export function useClientDialogState(open: boolean) {
  const [form, setForm] = useState<ClientForm>(emptyClientForm)
  const [states, setStates] = useState<Array<{ id: string; label: string }>>([])
  const [countries, setCountries] = useState<Array<{ id: string; label: string }>>([])
  const [districts, setDistricts] = useState<Array<{ id: string; label: string }>>([])
  const [pinCodes, setPinCodes] = useState<Array<{ id: string; label: string }>>([])
  const [countryCodes, setCountryCodes] = useState<Array<{ id: string; value: string; label: string }>>([])
  const [companyTypes, setCompanyTypes] = useState<Array<{ id: string; label: string }>>([])
  const [companyScales, setCompanyScales] = useState<Array<{ id: string; label: string }>>([])
  const [womenOptions, setWomenOptions] = useState<Array<{ id: string; label: string }>>([])
  const [startupOptions, setStartupOptions] = useState<Array<{ id: string; label: string }>>([])
  const [paymentTerms, setPaymentTerms] = useState<Array<{ id: string; label: string }>>([])
  const [addressDirectory, setAddressDirectory] = useState<ClientAddressDirectory>({
    byPin: new Map(),
    districts: [],
    states: [],
    countries: [],
  })
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
  const [womenDialogOpen, setWomenDialogOpen] = useState(false)
  const [newWomenOption, setNewWomenOption] = useState('')
  const [startupDialogOpen, setStartupDialogOpen] = useState(false)
  const [newStartupOption, setNewStartupOption] = useState('')
  const [paymentTermDialogOpen, setPaymentTermDialogOpen] = useState(false)
  const [newPaymentTerm, setNewPaymentTerm] = useState('')

  useEffect(() => {
    if (!open) return
    const load = async () => {
      const { data, error } = await supabase.from('client_master_options').select('*').order('label', { ascending: true })
      if (error) return
      const rows = Array.isArray(data) ? (data as Array<{ id: string; category: string; value: string | null; label: string }>) : []
      const by = (cat: string) => rows.filter((r) => r.category === cat)
      setStates(by('state').map((r) => ({ id: r.id, label: r.label })).sort((a, b) => a.label.localeCompare(b.label)))
      setCountries(by('country').map((r) => ({ id: r.id, label: r.label })).sort((a, b) => a.label.localeCompare(b.label)))
      setDistricts(by('district').map((r) => ({ id: r.id, label: r.label })))
      setPinCodes(by('pin_code').map((r) => ({ id: r.id, label: r.label })))
      setCountryCodes(
        by('country_code')
          .map((r) => ({ id: r.id, value: r.value ?? r.label, label: r.label }))
          .filter((x) => x.value),
      )
      setCompanyTypes(by('company_type').map((r) => ({ id: r.id, label: r.label })))
      setCompanyScales(by('company_scale').map((r) => ({ id: r.id, label: r.label })))
      setWomenOptions(by('women_entrepreneur').map((r) => ({ id: r.id, label: r.label })).sort((a, b) => a.label.localeCompare(b.label)))
      setStartupOptions(by('startup').map((r) => ({ id: r.id, label: r.label })).sort((a, b) => a.label.localeCompare(b.label)))
      setPaymentTerms(by('payment_term').map((r) => ({ id: r.id, label: r.label })))
    }
    load()
    let cancelled = false
    void loadClientAddressDirectory()
      .then((directory) => {
        if (!cancelled) setAddressDirectory(directory)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [open])
  const normalizeText = (v: string) => v.trim()

  const onAddState = async (close = true) => {
    const name = normalizeText(newStateName)
    if (!name) return
    const { data, error } = await supabase.from('client_master_options').insert({ category: 'state', label: name, value: name }).select('id').single()
    if (error) return
    const id = (data as { id: string } | null)?.id ?? `tmp-${name}`
    setStates((prev) => {
      const merged = [...prev, { id, label: name }]
      const uniq = new Map(merged.map((x) => [x.label.toLowerCase(), x]))
      return Array.from(uniq.values()).sort((a, b) => a.label.localeCompare(b.label))
    })
    setForm((prev) => ({ ...prev, state: name }))
    setNewStateName('')
    if (close) setStateDialogOpen(false)
  }
  const onAddCountry = async (close = true) => {
    const name = normalizeText(newCountryName)
    if (!name) return
    const { data, error } = await supabase.from('client_master_options').insert({ category: 'country', label: name, value: name }).select('id').single()
    if (error) return
    const id = (data as { id: string } | null)?.id ?? `tmp-${name}`
    setCountries((prev) => {
      const merged = [...prev, { id, label: name }]
      const uniq = new Map(merged.map((x) => [x.label.toLowerCase(), x]))
      return Array.from(uniq.values()).sort((a, b) => a.label.localeCompare(b.label))
    })
    setForm((prev) => ({ ...prev, country: name }))
    setNewCountryName('')
    if (close) setCountryDialogOpen(false)
  }
  const onAddDistrict = async (close = true) => {
    const name = normalizeText(newDistrictName)
    if (!name) return
    const { data, error } = await supabase.from('client_master_options').insert({ category: 'district', label: name, value: name }).select('id').single()
    if (error) return
    setDistricts((prev) => [...prev, { id: (data as { id: string })?.id ?? `tmp-${name}`, label: name }])
    setForm((prev) => ({ ...prev, district: name }))
    setNewDistrictName('')
    if (close) setDistrictDialogOpen(false)
  }
  const onAddPinCode = async (close = true) => {
    const name = newPinCode.trim().replace(/[^0-9]/g, '').slice(0, 6)
    if (!name) return
    const { data, error } = await supabase.from('client_master_options').insert({ category: 'pin_code', label: name, value: name }).select('id').single()
    if (error) return
    setPinCodes((prev) => [...prev, { id: (data as { id: string })?.id ?? `tmp-${name}`, label: name }])
    setForm((prev) => ({ ...prev, pinCode: name }))
    setNewPinCode('')
    if (close) setPinCodeDialogOpen(false)
  }
  const onAddCountryCode = async (close = true) => {
    const raw = normalizeText(newCountryCode)
    if (!raw) return
    const formatted = raw.startsWith('+') ? raw : `+${raw}`
    const { data, error } = await supabase.from('client_master_options').insert({ category: 'country_code', label: formatted, value: formatted }).select('id').single()
    if (error) return
    setCountryCodes((prev) => [...prev, { id: (data as { id: string })?.id ?? `tmp-${formatted}`, value: formatted, label: formatted }])
    setForm((prev) => ({ ...prev, countryCode: formatted }))
    setNewCountryCode('')
    if (close) setCountryCodeDialogOpen(false)
  }
  const addSimpleOption = async (category: string, label: string) => {
    const name = normalizeText(label)
    if (!name) return
    await supabase.from('client_master_options').insert({ category, label: name, value: name })
    if (category === 'company_type') {
      const { data } = await supabase.from('client_master_options').select('id').eq('category', category).eq('label', name).limit(1).single()
      setCompanyTypes((prev) => [...prev, { id: (data as { id: string })?.id ?? name, label: name }])
      setForm((prev) => ({ ...prev, companyType: name as ClientForm['companyType'] }))
    }
    if (category === 'company_scale') {
      const { data } = await supabase.from('client_master_options').select('id').eq('category', category).eq('label', name).limit(1).single()
      setCompanyScales((prev) => [...prev, { id: (data as { id: string })?.id ?? name, label: name }])
      setForm((prev) => ({ ...prev, companyScale: name as ClientForm['companyScale'] }))
    }
    if (category === 'payment_term') {
      const { data } = await supabase.from('client_master_options').select('id').eq('category', category).eq('label', name).limit(1).single()
      setPaymentTerms((prev) => [...prev, { id: (data as { id: string })?.id ?? name, label: name }])
      setForm((prev) => ({ ...prev, paymentTerm: name as ClientForm['paymentTerm'] }))
    }
    if (category === 'women_entrepreneur') {
      const { data } = await supabase.from('client_master_options').select('id').eq('category', category).eq('label', name).limit(1).single()
      setWomenOptions((prev) => [...prev, { id: (data as { id: string })?.id ?? name, label: name }])
      setForm((prev) => ({ ...prev, womenEntrepreneur: name, isWomenEntrepreneur: name.toLowerCase() === 'yes' }))
    }
    if (category === 'startup') {
      const { data } = await supabase.from('client_master_options').select('id').eq('category', category).eq('label', name).limit(1).single()
      setStartupOptions((prev) => [...prev, { id: (data as { id: string })?.id ?? name, label: name }])
      setForm((prev) => ({ ...prev, startupStatus: name, isStartup: name.toLowerCase() === 'yes' }))
    }
  }
  const onAddCompanyType = (close = true) => { void addSimpleOption('company_type', newCompanyType); setNewCompanyType(''); if (close) setCompanyTypeDialogOpen(false) }
  const onAddCompanyScale = (close = true) => { void addSimpleOption('company_scale', newCompanyScale); setNewCompanyScale(''); if (close) setCompanyScaleDialogOpen(false) }
  const onAddWomenOption = (close = true) => {
    void addSimpleOption('women_entrepreneur', newWomenOption)
    setNewWomenOption('')
    if (close) setWomenDialogOpen(false)
  }
  const onAddStartupOption = (close = true) => {
    void addSimpleOption('startup', newStartupOption)
    setNewStartupOption('')
    if (close) setStartupDialogOpen(false)
  }
  const onAddPaymentTerm = (close = true) => { void addSimpleOption('payment_term', newPaymentTerm); setNewPaymentTerm(''); if (close) setPaymentTermDialogOpen(false) }
  const labelFor = (category: string, id: string) => {
    if (category === 'state') return states.find((item) => item.id === id)?.label
    if (category === 'country') return countries.find((item) => item.id === id)?.label
    if (category === 'district') return districts.find((item) => item.id === id)?.label
    if (category === 'pin_code') return pinCodes.find((item) => item.id === id)?.label
    if (category === 'country_code') return countryCodes.find((item) => item.id === id)?.value
    if (category === 'company_type') return companyTypes.find((item) => item.id === id)?.label
    if (category === 'company_scale') return companyScales.find((item) => item.id === id)?.label
    if (category === 'women_entrepreneur') return womenOptions.find((item) => item.id === id)?.label
    if (category === 'startup') return startupOptions.find((item) => item.id === id)?.label
    if (category === 'payment_term') return paymentTerms.find((item) => item.id === id)?.label
    return undefined
  }

  const applyOptionLabel = (category: string, id: string, name: string) => {
    const sortByLabel = <T extends { label: string }>(list: T[]) => [...list].sort((a, b) => a.label.localeCompare(b.label))
    if (category === 'state') setStates((prev) => sortByLabel(prev.map((item) => (item.id === id ? { ...item, label: name } : item))))
    if (category === 'country') setCountries((prev) => sortByLabel(prev.map((item) => (item.id === id ? { ...item, label: name } : item))))
    if (category === 'district') setDistricts((prev) => sortByLabel(prev.map((item) => (item.id === id ? { ...item, label: name } : item))))
    if (category === 'pin_code') setPinCodes((prev) => sortByLabel(prev.map((item) => (item.id === id ? { ...item, label: name } : item))))
    if (category === 'country_code') setCountryCodes((prev) => prev.map((item) => (item.id === id ? { ...item, value: name, label: name } : item)))
    if (category === 'company_type') setCompanyTypes((prev) => sortByLabel(prev.map((item) => (item.id === id ? { ...item, label: name } : item))))
    if (category === 'company_scale') setCompanyScales((prev) => sortByLabel(prev.map((item) => (item.id === id ? { ...item, label: name } : item))))
    if (category === 'women_entrepreneur') setWomenOptions((prev) => sortByLabel(prev.map((item) => (item.id === id ? { ...item, label: name } : item))))
    if (category === 'startup') setStartupOptions((prev) => sortByLabel(prev.map((item) => (item.id === id ? { ...item, label: name } : item))))
    if (category === 'payment_term') setPaymentTerms((prev) => sortByLabel(prev.map((item) => (item.id === id ? { ...item, label: name } : item))))
  }

  const dropOption = (category: string, id: string) => {
    if (category === 'state') setStates((prev) => prev.filter((item) => item.id !== id))
    if (category === 'country') setCountries((prev) => prev.filter((item) => item.id !== id))
    if (category === 'district') setDistricts((prev) => prev.filter((item) => item.id !== id))
    if (category === 'pin_code') setPinCodes((prev) => prev.filter((item) => item.id !== id))
    if (category === 'country_code') setCountryCodes((prev) => prev.filter((item) => item.id !== id))
    if (category === 'company_type') setCompanyTypes((prev) => prev.filter((item) => item.id !== id))
    if (category === 'company_scale') setCompanyScales((prev) => prev.filter((item) => item.id !== id))
    if (category === 'women_entrepreneur') setWomenOptions((prev) => prev.filter((item) => item.id !== id))
    if (category === 'startup') setStartupOptions((prev) => prev.filter((item) => item.id !== id))
    if (category === 'payment_term') setPaymentTerms((prev) => prev.filter((item) => item.id !== id))
  }

  const renameOption = (category: string, id: string, rawLabel: string, clear: () => void) => {
    const oldLabel = labelFor(category, id)
    void updateClientMasterOption(id, category, rawLabel, oldLabel)
      .then((name) => {
        applyOptionLabel(category, id, name)
        setForm((prev) => {
          if (category === 'state' && prev.state === oldLabel) return { ...prev, state: name }
          if (category === 'country' && prev.country === oldLabel) return { ...prev, country: name }
          if (category === 'district' && prev.district === oldLabel) return { ...prev, district: name }
          if (category === 'pin_code' && prev.pinCode === oldLabel) return { ...prev, pinCode: name }
          if (category === 'country_code' && prev.countryCode === oldLabel) return { ...prev, countryCode: name }
          if (category === 'company_type' && prev.companyType === oldLabel) return { ...prev, companyType: name as ClientForm['companyType'] }
          if (category === 'company_scale' && prev.companyScale === oldLabel) return { ...prev, companyScale: name as ClientForm['companyScale'] }
          if (category === 'payment_term' && prev.paymentTerm === oldLabel) return { ...prev, paymentTerm: name as ClientForm['paymentTerm'] }
          if (category === 'women_entrepreneur' && prev.womenEntrepreneur === oldLabel) {
            return { ...prev, womenEntrepreneur: name, isWomenEntrepreneur: name.toLowerCase() === 'yes' }
          }
          if (category === 'startup' && prev.startupStatus === oldLabel) {
            return { ...prev, startupStatus: name, isStartup: name.toLowerCase() === 'yes' }
          }
          return prev
        })
      })
      .catch(() => {})
      .finally(clear)
  }

  const removeOption = (category: string, id: string) => {
    if (id.startsWith('default-')) {
      dropOption(category, id)
      return
    }
    if (!id || id.startsWith('db-') || id.startsWith('tmp-')) return
    void deleteClientMasterOption(id).then(() => dropOption(category, id)).catch(() => {})
  }

  const onUpdateState = (id: string) => renameOption('state', id, newStateName, () => setNewStateName(''))
  const onUpdateCountry = (id: string) => renameOption('country', id, newCountryName, () => setNewCountryName(''))
  const onUpdateDistrict = (id: string) => renameOption('district', id, newDistrictName, () => setNewDistrictName(''))
  const onUpdatePinCode = (id: string) => renameOption('pin_code', id, newPinCode, () => setNewPinCode(''))
  const onUpdateCountryCode = (id: string) => renameOption('country_code', id, newCountryCode, () => setNewCountryCode(''))
  const onUpdateCompanyType = (id: string) => renameOption('company_type', id, newCompanyType, () => setNewCompanyType(''))
  const onUpdateCompanyScale = (id: string) => renameOption('company_scale', id, newCompanyScale, () => setNewCompanyScale(''))
  const onUpdateWomenOption = (id: string) => renameOption('women_entrepreneur', id, newWomenOption, () => setNewWomenOption(''))
  const onUpdateStartupOption = (id: string) => renameOption('startup', id, newStartupOption, () => setNewStartupOption(''))
  const onUpdatePaymentTerm = (id: string) => renameOption('payment_term', id, newPaymentTerm, () => setNewPaymentTerm(''))
  const onDeleteState = (id: string) => removeOption('state', id)
  const onDeleteCountry = (id: string) => removeOption('country', id)
  const onDeleteDistrict = (id: string) => removeOption('district', id)
  const onDeletePinCode = (id: string) => removeOption('pin_code', id)
  const onDeleteCountryCode = (id: string) => removeOption('country_code', id)
  const onDeleteCompanyType = (id: string) => removeOption('company_type', id)
  const onDeleteCompanyScale = (id: string) => removeOption('company_scale', id)
  const onDeleteWomenOption = (id: string) => removeOption('women_entrepreneur', id)
  const onDeleteStartupOption = (id: string) => removeOption('startup', id)
  const onDeletePaymentTerm = (id: string) => removeOption('payment_term', id)

  return {
    form,
    setForm,
    states,
    countries,
    districts,
    pinCodes,
    addressDirectory,
    countryCodes,
    companyTypes,
    companyScales,
    womenOptions,
    startupOptions,
    paymentTerms,
    stateDialogOpen,
    setStateDialogOpen,
    newStateName,
    setNewStateName,
    onAddState,
    onUpdateState,
    onDeleteState,
    countryDialogOpen,
    setCountryDialogOpen,
    newCountryName,
    setNewCountryName,
    onAddCountry,
    onUpdateCountry,
    onDeleteCountry,
    districtDialogOpen,
    setDistrictDialogOpen,
    newDistrictName,
    setNewDistrictName,
    onAddDistrict,
    onUpdateDistrict,
    onDeleteDistrict,
    pinCodeDialogOpen,
    setPinCodeDialogOpen,
    newPinCode,
    setNewPinCode,
    onAddPinCode,
    onUpdatePinCode,
    onDeletePinCode,
    countryCodeDialogOpen,
    setCountryCodeDialogOpen,
    newCountryCode,
    setNewCountryCode,
    onAddCountryCode,
    onUpdateCountryCode,
    onDeleteCountryCode,
    companyTypeDialogOpen,
    setCompanyTypeDialogOpen,
    newCompanyType,
    setNewCompanyType,
    onAddCompanyType,
    onUpdateCompanyType,
    onDeleteCompanyType,
    companyScaleDialogOpen,
    setCompanyScaleDialogOpen,
    newCompanyScale,
    setNewCompanyScale,
    onAddCompanyScale,
    onUpdateCompanyScale,
    onDeleteCompanyScale,
    womenDialogOpen,
    setWomenDialogOpen,
    newWomenOption,
    setNewWomenOption,
    onAddWomenOption,
    onUpdateWomenOption,
    onDeleteWomenOption,
    startupDialogOpen,
    setStartupDialogOpen,
    newStartupOption,
    setNewStartupOption,
    onAddStartupOption,
    onUpdateStartupOption,
    onDeleteStartupOption,
    paymentTermDialogOpen,
    setPaymentTermDialogOpen,
    newPaymentTerm,
    setNewPaymentTerm,
    onAddPaymentTerm,
    onUpdatePaymentTerm,
    onDeletePaymentTerm,
  }
}

export function AddClientDialog({
  open,
  onOpenChange,
  onSaved,
  initialCompanyName,
  nested = false,
  title = 'Add New Client',
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSaved: (id: string) => void
  initialCompanyName?: string
  nested?: boolean
  title?: string
}) {
  const [saveLoading, setSaveLoading] = useState(false)
  const [saveMessage, setSaveMessage] = useState<string | null>(null)
  const [duplicates, setDuplicates] = useState<SimilarClient[]>([])
  const [allowDuplicate, setAllowDuplicate] = useState(false)
  const state = useClientDialogState(open)
  const { setForm } = state

  useEffect(() => {
    if (!open) return
    const name = initialCompanyName?.trim()
    if (!name) return
    setForm((prev) => ({ ...prev, companyName: name }))
  }, [open, initialCompanyName, setForm])

  const handleSave = async (force = false) => {
    setSaveMessage(null)
    setSaveLoading(true)
    try {
      const form = state.form
      const companyName = form.companyName.trim()
      if (!isValidGst(form.gstNumber)) {
        setSaveMessage('Invalid GST Number')
        return
      }
      if (await firmNameTaken(companyName)) {
        setDuplicates([])
        setSaveMessage(FIRM_NAME_TAKEN)
        return
      }
      if (!force && !allowDuplicate) {
        const hits = (await findSimilarClients(companyName, form.gstNumber)).filter((hit) => {
          if (isSameFirmName(hit.company_name ?? '', companyName)) return false
          return hit.similarity < 1
        })
        if (hits.length > 0) {
          setDuplicates(hits)
          return
        }
      }
      setDuplicates([])
      setAllowDuplicate(false)
      const payload = {
        name: companyName,
        gst_number: form.gstNumber.trim().toUpperCase() || null,
        company_type: form.companyType,
        company_scale: form.companyScale,
        company_name: companyName,
        contact_person_name: form.contactPersonName.trim() || null,
        country_code: form.countryCode || null,
        mobile: form.mobile.trim() || null,
        email: form.email.trim() || null,
        address: toContinuousText(form.address) || null,
        pin_code: form.pinCode.trim() || null,
        district: form.district.trim() || null,
        state: form.state || null,
        country: form.country || null,
        opening_balance: form.openingBalance ? Number(form.openingBalance) : 0,
        balance_type: form.balanceType,
        payment_term: form.paymentTerm,
        remark: form.remark.trim() || null,
        manak_user_id: form.manakUserId.trim() || null,
      }
      let inserted = await supabase.from('clients').insert(payload).select('id').single()
      if (inserted.error && /manak_user_id/i.test(inserted.error.message ?? '')) {
        const withoutManak: Record<string, unknown> = { ...payload }
        delete withoutManak.manak_user_id
        inserted = await supabase.from('clients').insert(withoutManak).select('id').single()
      }
      if (inserted.error) throw inserted.error
      invalidateClientsCache()
      const id = (inserted.data as { id: string } | null)?.id
      if (id) {
        if (form.manakPassword.trim()) await setClientPortalPassword(id, form.manakPassword)
        onSaved(id)
        onOpenChange(false)
        state.setForm(emptyClientForm())
      }
    } catch (err) {
      const taken = firmNameConstraintMessage(err as { code?: string; message?: string })
      setSaveMessage(taken ?? (err instanceof Error ? err.message : 'Failed to save client'))
    } finally {
      setSaveLoading(false)
    }
  }

  const canSave = state.form.companyName.trim().length > 0 && isValidGst(state.form.gstNumber) && !saveLoading

  if (!open) return null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          limsDialogClass,
          'max-w-[51.2rem] bg-white',
          'w-[min(51.2rem,calc(100vw-1.5rem))]',
        )}
        aria-describedby={undefined}
        layer={nested ? 'nested' : 'default'}
        persistOnFocusLoss
        overlayClassName={limsDialogSidebarOverlayClass}
        portalClassName={limsDialogSidebarPortalClass}
      >
        <div className="relative shrink-0 overflow-hidden bg-gradient-to-br from-stone-800 via-stone-900 to-stone-950 px-4 py-2.5 text-white sm:px-5 sm:py-3">
          <div className="pointer-events-none absolute inset-0 opacity-[0.18]" style={limsDarkBarGlowStyle} />
          <div className="absolute bottom-0 left-0 h-[2px] w-full bg-gradient-to-r from-amber-500 via-amber-300 to-transparent" />
          <DialogHeader className="relative pr-10 text-left">
            <DialogTitle className="text-base font-semibold tracking-tight text-white sm:text-lg">
              {title}
            </DialogTitle>
          </DialogHeader>
        </div>

        {duplicates.length > 0 ? (
          <div className="shrink-0 border border-amber-600 bg-amber-50 px-4 py-2 text-sm text-stone-800">
            <p className="font-medium">Possible duplicate</p>
            <ul className="mt-1">
              {duplicates.map((hit) => (
                <li key={hit.id}>{hit.company_name}</li>
              ))}
            </ul>
            <button type="button" className="mt-2 h-10 min-h-10 border border-stone-500 px-3" onClick={() => void handleSave(true)}>
              Save anyway
            </button>
          </div>
        ) : null}
        {saveMessage ? (
          <p className="shrink-0 border-l-2 border-destructive bg-destructive/5 px-4 py-2 text-sm text-destructive sm:px-5">
            {saveMessage}
          </p>
        ) : null}

        <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden bg-gradient-to-b from-stone-100/80 to-white px-3 py-3 sm:px-5 sm:py-4 md:px-6 md:py-5">
          <ClientsForm
            form={state.form}
            onChange={state.setForm}
            canSave={canSave}
            saveLoading={saveLoading}
            onSave={() => void handleSave(false)}
            hideFooter
            compact
            states={state.states}
            countries={state.countries}
            districts={state.districts}
            pinCodes={state.pinCodes}
            pinAutoFill={state.addressDirectory.byPin}
            knownPlaces={state.addressDirectory}
            countryCodes={state.countryCodes}
            companyTypes={state.companyTypes}
            companyScales={state.companyScales}
            paymentTerms={state.paymentTerms}
            stateDialogOpen={state.stateDialogOpen}
            setStateDialogOpen={state.setStateDialogOpen}
            newStateName={state.newStateName}
            setNewStateName={state.setNewStateName}
            onAddState={state.onAddState}
            onUpdateState={state.onUpdateState}
            onDeleteState={state.onDeleteState}
            countryDialogOpen={state.countryDialogOpen}
            setCountryDialogOpen={state.setCountryDialogOpen}
            newCountryName={state.newCountryName}
            setNewCountryName={state.setNewCountryName}
            onAddCountry={state.onAddCountry}
            onUpdateCountry={state.onUpdateCountry}
            onDeleteCountry={state.onDeleteCountry}
            districtDialogOpen={state.districtDialogOpen}
            setDistrictDialogOpen={state.setDistrictDialogOpen}
            newDistrictName={state.newDistrictName}
            setNewDistrictName={state.setNewDistrictName}
            onAddDistrict={state.onAddDistrict}
            onUpdateDistrict={state.onUpdateDistrict}
            onDeleteDistrict={state.onDeleteDistrict}
            pinCodeDialogOpen={state.pinCodeDialogOpen}
            setPinCodeDialogOpen={state.setPinCodeDialogOpen}
            newPinCode={state.newPinCode}
            setNewPinCode={state.setNewPinCode}
            onAddPinCode={state.onAddPinCode}
            onUpdatePinCode={state.onUpdatePinCode}
            onDeletePinCode={state.onDeletePinCode}
            countryCodeDialogOpen={state.countryCodeDialogOpen}
            setCountryCodeDialogOpen={state.setCountryCodeDialogOpen}
            newCountryCode={state.newCountryCode}
            setNewCountryCode={state.setNewCountryCode}
            onAddCountryCode={state.onAddCountryCode}
            onUpdateCountryCode={state.onUpdateCountryCode}
            onDeleteCountryCode={state.onDeleteCountryCode}
            companyTypeDialogOpen={state.companyTypeDialogOpen}
            setCompanyTypeDialogOpen={state.setCompanyTypeDialogOpen}
            newCompanyType={state.newCompanyType}
            setNewCompanyType={state.setNewCompanyType}
            onAddCompanyType={state.onAddCompanyType}
            onUpdateCompanyType={state.onUpdateCompanyType}
            onDeleteCompanyType={state.onDeleteCompanyType}
            companyScaleDialogOpen={state.companyScaleDialogOpen}
            setCompanyScaleDialogOpen={state.setCompanyScaleDialogOpen}
            newCompanyScale={state.newCompanyScale}
            setNewCompanyScale={state.setNewCompanyScale}
            onAddCompanyScale={state.onAddCompanyScale}
            onUpdateCompanyScale={state.onUpdateCompanyScale}
            onDeleteCompanyScale={state.onDeleteCompanyScale}
            womenOptions={state.womenOptions}
            startupOptions={state.startupOptions}
            womenDialogOpen={state.womenDialogOpen}
            setWomenDialogOpen={state.setWomenDialogOpen}
            newWomenOption={state.newWomenOption}
            setNewWomenOption={state.setNewWomenOption}
            onAddWomenOption={state.onAddWomenOption}
            onUpdateWomenOption={state.onUpdateWomenOption}
            onDeleteWomenOption={state.onDeleteWomenOption}
            startupDialogOpen={state.startupDialogOpen}
            setStartupDialogOpen={state.setStartupDialogOpen}
            newStartupOption={state.newStartupOption}
            setNewStartupOption={state.setNewStartupOption}
            onAddStartupOption={state.onAddStartupOption}
            onUpdateStartupOption={state.onUpdateStartupOption}
            onDeleteStartupOption={state.onDeleteStartupOption}
            paymentTermDialogOpen={state.paymentTermDialogOpen}
            setPaymentTermDialogOpen={state.setPaymentTermDialogOpen}
            newPaymentTerm={state.newPaymentTerm}
            setNewPaymentTerm={state.setNewPaymentTerm}
            onAddPaymentTerm={state.onAddPaymentTerm}
            onUpdatePaymentTerm={state.onUpdatePaymentTerm}
            onDeletePaymentTerm={state.onDeletePaymentTerm}
          />
        </div>

        <DialogFooter className="shrink-0 border-t border-stone-200 bg-stone-50 px-4 py-3 sm:justify-end sm:px-5">
          {/* Single primary action — close via header X */}
          <Button
            type="button"
            className={cn(limsPrimaryBtnClass, 'h-10 min-h-10 px-4 text-sm')}
            onClick={() => void handleSave(false)}
            disabled={!canSave || saveLoading}
          >
            {saveLoading ? 'Saving…' : 'Save & Close'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
