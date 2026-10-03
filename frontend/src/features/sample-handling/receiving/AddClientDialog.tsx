import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { DEFAULT_COUNTRY, DEFAULT_STATE, emptyClientForm, toContinuousText, type ClientForm } from '@/features/masters/clients/types'
import { ClientsForm } from '@/features/masters/clients/ClientsForm'
import { limsDarkBarGlowStyle, limsDialogClass, limsPrimaryBtnClass } from '@/lib/limsThemeUi'
import { cn } from '@/lib/utils'

function useClientDialogState(open: boolean) {
  const [form, setForm] = useState<ClientForm>(emptyClientForm)
  const [states, setStates] = useState<Array<{ id: string; label: string }>>([{ id: 'default-state', label: DEFAULT_STATE }])
  const [countries, setCountries] = useState<Array<{ id: string; label: string }>>([{ id: 'default-country', label: DEFAULT_COUNTRY }])
  const [districts, setDistricts] = useState<Array<{ id: string; label: string }>>([])
  const [pinCodes, setPinCodes] = useState<Array<{ id: string; label: string }>>([])
  const [countryCodes, setCountryCodes] = useState<Array<{ id: string; value: string; label: string }>>([{ id: 'default-code', value: '+91', label: '+91 (IN)' }])
  const [companyTypes, setCompanyTypes] = useState<Array<{ id: string; label: string }>>([])
  const [companyScales, setCompanyScales] = useState<Array<{ id: string; label: string }>>([])
  const [paymentTerms, setPaymentTerms] = useState<Array<{ id: string; label: string }>>([])
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

  useEffect(() => {
    if (!open) return
    const load = async () => {
      const { data, error } = await supabase.from('client_master_options').select('*').order('label', { ascending: true })
      if (error) return
      const rows = Array.isArray(data) ? (data as Array<{ id: string; category: string; value: string | null; label: string }>) : []
      const by = (cat: string) => rows.filter((r) => r.category === cat)
      setStates((prev) => {
        const fromDb = by('state').map((r) => ({ id: r.id, label: r.label }))
        const merged = [...prev.filter((p) => p.id.startsWith('default-')), ...fromDb]
        const uniq = new Map(merged.map((x) => [x.label.toLowerCase(), x]))
        return Array.from(uniq.values()).sort((a, b) => a.label.localeCompare(b.label))
      })
      setCountries((prev) => {
        const fromDb = by('country').map((r) => ({ id: r.id, label: r.label }))
        const merged = [...prev.filter((p) => p.id.startsWith('default-')), ...fromDb]
        const uniq = new Map(merged.map((x) => [x.label.toLowerCase(), x]))
        return Array.from(uniq.values()).sort((a, b) => a.label.localeCompare(b.label))
      })
      setDistricts(by('district').map((r) => ({ id: r.id, label: r.label })))
      setPinCodes(by('pin_code').map((r) => ({ id: r.id, label: r.label })))
      setCountryCodes((prev) => {
        const fromDb = by('country_code')
          .map((r) => ({ id: r.id, value: r.value ?? r.label, label: r.label }))
          .filter((x) => x.value)
        const merged = [...prev.filter((p) => p.id.startsWith('default-')), ...fromDb]
        const uniq = new Map(merged.map((x) => [x.value.toLowerCase(), x]))
        return Array.from(uniq.values())
      })
      setCompanyTypes(by('company_type').map((r) => ({ id: r.id, label: r.label })))
      setCompanyScales(by('company_scale').map((r) => ({ id: r.id, label: r.label })))
      setPaymentTerms(by('payment_term').map((r) => ({ id: r.id, label: r.label })))
    }
    load()
  }, [open])

  const pinAutoFill = new Map<string, { district?: string; state?: string; country?: string }>()
  const normalizeText = (v: string) => v.trim()

  const onAddState = async () => {
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
    setStateDialogOpen(false)
  }
  const onAddCountry = async () => {
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
    setCountryDialogOpen(false)
  }
  const onAddDistrict = async () => {
    const name = normalizeText(newDistrictName)
    if (!name) return
    const { data, error } = await supabase.from('client_master_options').insert({ category: 'district', label: name, value: name }).select('id').single()
    if (error) return
    setDistricts((prev) => [...prev, { id: (data as { id: string })?.id ?? `tmp-${name}`, label: name }])
    setForm((prev) => ({ ...prev, district: name }))
    setNewDistrictName('')
    setDistrictDialogOpen(false)
  }
  const onAddPinCode = async () => {
    const name = newPinCode.trim().replace(/[^0-9]/g, '').slice(0, 6)
    if (!name) return
    const { data, error } = await supabase.from('client_master_options').insert({ category: 'pin_code', label: name, value: name }).select('id').single()
    if (error) return
    setPinCodes((prev) => [...prev, { id: (data as { id: string })?.id ?? `tmp-${name}`, label: name }])
    setForm((prev) => ({ ...prev, pinCode: name }))
    setNewPinCode('')
    setPinCodeDialogOpen(false)
  }
  const onAddCountryCode = async () => {
    const raw = normalizeText(newCountryCode)
    if (!raw) return
    const formatted = raw.startsWith('+') ? raw : `+${raw}`
    const { data, error } = await supabase.from('client_master_options').insert({ category: 'country_code', label: formatted, value: formatted }).select('id').single()
    if (error) return
    setCountryCodes((prev) => [...prev, { id: (data as { id: string })?.id ?? `tmp-${formatted}`, value: formatted, label: formatted }])
    setForm((prev) => ({ ...prev, countryCode: formatted }))
    setNewCountryCode('')
    setCountryCodeDialogOpen(false)
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
  }
  const onAddCompanyType = () => { addSimpleOption('company_type', newCompanyType); setCompanyTypeDialogOpen(false); setNewCompanyType('') }
  const onAddCompanyScale = () => { addSimpleOption('company_scale', newCompanyScale); setCompanyScaleDialogOpen(false); setNewCompanyScale('') }
  const onAddPaymentTerm = () => { addSimpleOption('payment_term', newPaymentTerm); setPaymentTermDialogOpen(false); setNewPaymentTerm('') }

  const onDeleteState = () => {}
  const onDeleteCountry = () => {}
  const onDeleteDistrict = () => {}
  const onDeletePinCode = () => {}
  const onDeleteCountryCode = () => {}
  const onDeleteCompanyType = () => {}
  const onDeleteCompanyScale = () => {}
  const onDeletePaymentTerm = () => {}

  return {
    form,
    setForm,
    states,
    countries,
    districts,
    pinCodes,
    pinAutoFill,
    countryCodes,
    companyTypes,
    companyScales,
    paymentTerms,
    stateDialogOpen,
    setStateDialogOpen,
    newStateName,
    setNewStateName,
    onAddState,
    onDeleteState,
    countryDialogOpen,
    setCountryDialogOpen,
    newCountryName,
    setNewCountryName,
    onAddCountry,
    onDeleteCountry,
    districtDialogOpen,
    setDistrictDialogOpen,
    newDistrictName,
    setNewDistrictName,
    onAddDistrict,
    onDeleteDistrict,
    pinCodeDialogOpen,
    setPinCodeDialogOpen,
    newPinCode,
    setNewPinCode,
    onAddPinCode,
    onDeletePinCode,
    countryCodeDialogOpen,
    setCountryCodeDialogOpen,
    newCountryCode,
    setNewCountryCode,
    onAddCountryCode,
    onDeleteCountryCode,
    companyTypeDialogOpen,
    setCompanyTypeDialogOpen,
    newCompanyType,
    setNewCompanyType,
    onAddCompanyType,
    onDeleteCompanyType,
    companyScaleDialogOpen,
    setCompanyScaleDialogOpen,
    newCompanyScale,
    setNewCompanyScale,
    onAddCompanyScale,
    onDeleteCompanyScale,
    paymentTermDialogOpen,
    setPaymentTermDialogOpen,
    newPaymentTerm,
    setNewPaymentTerm,
    onAddPaymentTerm,
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
  const state = useClientDialogState(open)
  const { setForm } = state

  useEffect(() => {
    if (!open) return
    const name = initialCompanyName?.trim()
    if (!name) return
    setForm((prev) => ({ ...prev, companyName: name }))
  }, [open, initialCompanyName, setForm])

  const handleSave = async () => {
    setSaveMessage(null)
    setSaveLoading(true)
    try {
      const form = state.form
      const payload = {
        gst_number: form.gstNumber.trim().toUpperCase() || null,
        company_type: form.companyType,
        company_scale: form.companyScale,
        company_name: form.companyName.trim(),
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
      }
      const { data, error } = await supabase.from('clients').insert(payload).select('id').single()
      if (error) throw error
      const id = (data as { id: string } | null)?.id
      if (id) {
        onSaved(id)
        onOpenChange(false)
        state.setForm(emptyClientForm())
      }
    } catch (err) {
      setSaveMessage(err instanceof Error ? err.message : 'Failed to save client')
    } finally {
      setSaveLoading(false)
    }
  }

  const canSave = state.form.companyName.trim().length > 0 && !saveLoading

  if (!open) return null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          limsDialogClass,
          'flex w-[min(920px,92vw)] max-w-none flex-col',
          'max-h-[min(92vh,920px)]',
        )}
        aria-describedby={undefined}
        layer={nested ? 'nested' : 'default'}
        persistOnFocusLoss
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

        {saveMessage ? (
          <p className="shrink-0 border-l-2 border-destructive bg-destructive/5 px-4 py-2 text-sm text-destructive sm:px-5">
            {saveMessage}
          </p>
        ) : null}

        <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden bg-gradient-to-b from-stone-100/80 to-white px-4 py-4 sm:px-6 sm:py-5">
          <ClientsForm
            form={state.form}
            onChange={state.setForm}
            canSave={canSave}
            saveLoading={saveLoading}
            onSave={handleSave}
            hideFooter
            compact
            states={state.states}
            countries={state.countries}
            districts={state.districts}
            pinCodes={state.pinCodes}
            pinAutoFill={state.pinAutoFill}
            countryCodes={state.countryCodes}
            companyTypes={state.companyTypes}
            companyScales={state.companyScales}
            paymentTerms={state.paymentTerms}
            stateDialogOpen={state.stateDialogOpen}
            setStateDialogOpen={state.setStateDialogOpen}
            newStateName={state.newStateName}
            setNewStateName={state.setNewStateName}
            onAddState={state.onAddState}
            onDeleteState={state.onDeleteState}
            countryDialogOpen={state.countryDialogOpen}
            setCountryDialogOpen={state.setCountryDialogOpen}
            newCountryName={state.newCountryName}
            setNewCountryName={state.setNewCountryName}
            onAddCountry={state.onAddCountry}
            onDeleteCountry={state.onDeleteCountry}
            districtDialogOpen={state.districtDialogOpen}
            setDistrictDialogOpen={state.setDistrictDialogOpen}
            newDistrictName={state.newDistrictName}
            setNewDistrictName={state.setNewDistrictName}
            onAddDistrict={state.onAddDistrict}
            onDeleteDistrict={state.onDeleteDistrict}
            pinCodeDialogOpen={state.pinCodeDialogOpen}
            setPinCodeDialogOpen={state.setPinCodeDialogOpen}
            newPinCode={state.newPinCode}
            setNewPinCode={state.setNewPinCode}
            onAddPinCode={state.onAddPinCode}
            onDeletePinCode={state.onDeletePinCode}
            countryCodeDialogOpen={state.countryCodeDialogOpen}
            setCountryCodeDialogOpen={state.setCountryCodeDialogOpen}
            newCountryCode={state.newCountryCode}
            setNewCountryCode={state.setNewCountryCode}
            onAddCountryCode={state.onAddCountryCode}
            onDeleteCountryCode={state.onDeleteCountryCode}
            companyTypeDialogOpen={state.companyTypeDialogOpen}
            setCompanyTypeDialogOpen={state.setCompanyTypeDialogOpen}
            newCompanyType={state.newCompanyType}
            setNewCompanyType={state.setNewCompanyType}
            onAddCompanyType={state.onAddCompanyType}
            onDeleteCompanyType={state.onDeleteCompanyType}
            companyScaleDialogOpen={state.companyScaleDialogOpen}
            setCompanyScaleDialogOpen={state.setCompanyScaleDialogOpen}
            newCompanyScale={state.newCompanyScale}
            setNewCompanyScale={state.setNewCompanyScale}
            onAddCompanyScale={state.onAddCompanyScale}
            onDeleteCompanyScale={state.onDeleteCompanyScale}
            paymentTermDialogOpen={state.paymentTermDialogOpen}
            setPaymentTermDialogOpen={state.setPaymentTermDialogOpen}
            newPaymentTerm={state.newPaymentTerm}
            setNewPaymentTerm={state.setNewPaymentTerm}
            onAddPaymentTerm={state.onAddPaymentTerm}
            onDeletePaymentTerm={state.onDeletePaymentTerm}
          />
        </div>

        <DialogFooter className="shrink-0 border-t border-stone-200 bg-stone-50 px-4 py-3 sm:justify-end sm:px-5">
          {/* Single primary action — close via header X */}
          <Button
            type="button"
            className={cn(limsPrimaryBtnClass, 'h-9 px-4 text-sm')}
            onClick={handleSave}
            disabled={!canSave || saveLoading}
          >
            {saveLoading ? 'Saving…' : 'Save & Close'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
