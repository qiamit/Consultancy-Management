import { useEffect, useMemo, useState } from 'react'
import { Search } from 'lucide-react'
import { LimsFieldAddButton, LimsFieldWithAdd } from '@/components/lims/LimsFieldWithAdd'
import { Button } from '@/components/ui/button'
import { Dialog, DialogTrigger } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { ClientManageDialogContent } from '@/features/masters/clients/ClientManageDialogContent'
import { clientRegistryFormClass } from '@/features/masters/clients/clientsFormUi'
import { BALANCE_TYPES, isValidEmail, isValidGst, isValidIndianPin, toProperTitleCase } from '@/features/masters/clients/types'
import { FilterCombobox } from '@/features/sample-handling/receiving/FilterCombobox'
import { limsFieldAddBtnClass } from '@/lib/limsThemeUi'
import { supabase } from '@/lib/supabaseClient'
import { cn } from '@/lib/utils'
import { LAB_TYPES, type LaboratoryForm } from './laboratoriesApi'

type MasterOption = { id: string; category: string; label: string; value: string }

function optionsFor(rows: MasterOption[], category: string, fallback: MasterOption[]): MasterOption[] {
  const found = rows.filter((row) => row.category === category)
  const merged = [...fallback, ...found]
  const uniq = new Map(merged.map((row) => [row.label.toLowerCase(), row]))
  return Array.from(uniq.values()).sort((a, b) => a.label.localeCompare(b.label))
}

export function LaboratoriesForm({
  form,
  onChange,
  canEdit,
  saveLoading,
  saveMessage,
  onSave,
}: {
  form: LaboratoryForm
  onChange: (next: LaboratoryForm | ((prev: LaboratoryForm) => LaboratoryForm)) => void
  canEdit: boolean
  saveLoading: boolean
  saveMessage: string | null
  onSave: () => void
}) {
  const [rows, setRows] = useState<MasterOption[]>([])
  const [pinOpen, setPinOpen] = useState(false)
  const [districtOpen, setDistrictOpen] = useState(false)
  const [stateOpen, setStateOpen] = useState(false)
  const [codeOpen, setCodeOpen] = useState(false)
  const [pinDialog, setPinDialog] = useState(false)
  const [districtDialog, setDistrictDialog] = useState(false)
  const [stateDialog, setStateDialog] = useState(false)
  const [countryDialog, setCountryDialog] = useState(false)
  const [codeDialog, setCodeDialog] = useState(false)
  const [paymentOpen, setPaymentOpen] = useState(false)
  const [paymentDialog, setPaymentDialog] = useState(false)
  const [draft, setDraft] = useState('')
  const [optionError, setOptionError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    void supabase
      .from('client_master_options')
      .select('id, category, label, value')
      .order('label', { ascending: true })
      .then(({ data }) => {
        if (cancelled || !Array.isArray(data)) return
        setRows(
          data.map((row) => ({
            id: String((row as { id: string }).id),
            category: String((row as { category: string }).category),
            label: String((row as { label: string }).label ?? ''),
            value: String((row as { value?: string | null }).value ?? (row as { label: string }).label ?? ''),
          })),
        )
      })
    return () => {
      cancelled = true
    }
  }, [])

  const pins = optionsFor(rows, 'pin_code', [])
  const districts = optionsFor(rows, 'district', [])
  const states = optionsFor(rows, 'state', [])
  const countries = optionsFor(rows, 'country', [])
  const codes = optionsFor(rows, 'country_code', [])
  const paymentTerms = optionsFor(rows, 'payment_term', [])

  const gstError = isValidGst(form.gstNumber) ? null : 'Invalid GST Number'
  const pinError = isValidIndianPin(form.pinCode) ? null : 'Invalid PIN code'
  const emailError = isValidEmail(form.email) ? null : 'Invalid email address'
  const mobileError = form.mobile.trim() && form.countryCode.trim() === '+91' && !/^[6-9][0-9]{9}$/.test(form.mobile.trim())
    ? 'Mobile must be a 10-digit number starting with 6–9'
    : null
  const canSave = canEdit && !saveLoading && !gstError && !pinError && !emailError && !mobileError && form.name.trim().length > 0

  const pinOptions = useMemo(() => {
    const query = form.pinCode.trim()
    return pins
      .map((row) => row.label)
      .filter((label) => !query || label.includes(query))
      .map((label) => ({ id: label, label }))
  }, [pins, form.pinCode])

  const districtOptions = useMemo(() => {
    const query = form.district.trim().toLowerCase()
    return districts
      .map((row) => row.label)
      .filter((label) => !query || label.toLowerCase().includes(query))
      .map((label) => ({ id: label, label }))
  }, [districts, form.district])

  const stateOptions = useMemo(() => {
    const query = form.state.trim().toLowerCase()
    return states
      .map((row) => row.label)
      .filter((label) => !query || label.toLowerCase().includes(query))
      .map((label) => ({ id: label, label }))
  }, [states, form.state])

  const codeOptions = useMemo(
    () => codes.map((row) => ({ id: row.value || row.label, label: row.value || row.label })),
    [codes],
  )

  const paymentOptions = useMemo(() => {
    const query = form.paymentTerm.trim().toLowerCase()
    return paymentTerms
      .map((row) => row.label)
      .filter((label) => !query || label.toLowerCase().includes(query))
      .map((label) => ({ id: label, label }))
  }, [paymentTerms, form.paymentTerm])

  const addOption = (category: string, label: string, value: string, apply: (saved: string) => void) => {
    const name = label.trim()
    if (!name || !canEdit) return
    void supabase
      .from('client_master_options')
      .insert({ category, label: name, value })
      .select('id')
      .single()
      .then(({ data, error }) => {
        if (error) {
          setOptionError(error.message)
          return
        }
        const id = String((data as { id: string }).id)
        setRows((prev) => [...prev, { id, category, label: name, value }])
        apply(category === 'country_code' ? value : name)
        setDraft('')
        setOptionError(null)
      })
  }

  const applyPin = (pin: string) => {
    const next = pin.replace(/[^0-9]/g, '').slice(0, 6)
    onChange((prev) => ({ ...prev, pinCode: next }))
    if (next.length !== 6) return
    void supabase
      .from('clients')
      .select('district, state, country')
      .eq('pin_code', next)
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        if (!data) return
        const hit = data as { district?: string | null; state?: string | null; country?: string | null }
        onChange((prev) => ({
          ...prev,
          pinCode: next,
          district: hit.district || prev.district,
          state: hit.state || prev.state,
          country: hit.country || prev.country,
        }))
      })
  }

  return (
    <div className={clientRegistryFormClass}>
      <div className="space-y-5">
        {saveMessage ? <p className="border-l-2 border-destructive bg-destructive/5 px-3 py-2 text-sm text-destructive">{saveMessage}</p> : null}
        {optionError ? <p className="border-l-2 border-destructive bg-destructive/5 px-3 py-2 text-sm text-destructive">{optionError}</p> : null}
        <div className="grid grid-cols-12 gap-x-4 gap-y-3 sm:gap-y-4">
          <div className="col-span-12 min-w-0 space-y-2 sm:col-span-6 xl:col-span-4">
            <Label htmlFor="lab-gst">GST Number</Label>
            <LimsFieldWithAdd
              className={gstError ? '!border-red-600 !bg-red-50 focus-within:!border-red-600 focus-within:!ring-red-500/30' : undefined}
              addButton={
                <a className={limsFieldAddBtnClass} href="https://services.gst.gov.in/services/searchtp" target="_blank" rel="noreferrer" aria-label="Verify GST" title="Verify GST">
                  <Search size={14} strokeWidth={2.25} aria-hidden />
                </a>
              }
            >
              <Input
                id="lab-gst"
                placeholder="22AAAFQ8256C1ZK"
                value={form.gstNumber}
                onChange={(e) => onChange({ ...form, gstNumber: e.target.value.toUpperCase() })}
                aria-invalid={Boolean(gstError)}
                className="h-full border-0 bg-transparent shadow-none focus-visible:border-transparent focus-visible:bg-transparent focus-visible:ring-0"
              />
            </LimsFieldWithAdd>
            {gstError ? <p className="text-xs text-destructive">{gstError}</p> : null}
          </div>
          <div className="col-span-12 min-w-0 space-y-2 sm:col-span-6 xl:col-span-4">
            <Label htmlFor="lab-osl" className="text-xs">OSL Code</Label>
            <Input id="lab-osl" placeholder="Enter OSL Code" value={form.oslCode} onChange={(e) => onChange({ ...form, oslCode: e.target.value })} />
          </div>
          <div className="col-span-12 min-w-0 space-y-2 sm:col-span-6 xl:col-span-4">
            <Label htmlFor="lab-type" className="text-xs">Type</Label>
            <Select value={form.labType} onValueChange={(value) => onChange({ ...form, labType: value })}>
              <SelectTrigger id="lab-type" aria-label="Laboratory type"><SelectValue /></SelectTrigger>
              <SelectContent>
                {LAB_TYPES.map((type) => <SelectItem key={type} value={type}>{type}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="col-span-12 min-w-0 space-y-2">
            <Label htmlFor="lab-name" className="text-xs">Name of the Laboratory</Label>
            <Input
              id="lab-name"
              placeholder="Enter Laboratory Name"
              value={form.name}
              onChange={(e) => onChange({ ...form, name: e.target.value })}
              onBlur={() => {
                const next = toProperTitleCase(form.name)
                if (next !== form.name) onChange({ ...form, name: next })
              }}
            />
          </div>

          <div className="col-span-12 min-w-0 space-y-2">
            <Label htmlFor="lab-address" className="text-xs">Address of the Laboratory</Label>
            <Textarea
              id="lab-address"
              rows={1}
              placeholder="Enter Laboratory Address"
              value={form.address}
              onChange={(e) => onChange({ ...form, address: e.target.value })}
              onBlur={() => {
                const next = toProperTitleCase(form.address)
                if (next !== form.address) onChange({ ...form, address: next })
              }}
              className="!h-8 !min-h-8 resize-none rounded-none border border-stone-500 bg-stone-50 px-3 py-1 shadow-none focus-visible:border-amber-600 focus-visible:bg-white focus-visible:ring-2 focus-visible:ring-amber-500/20 focus-visible:ring-offset-0"
            />
          </div>

          <div className="col-span-12 min-w-0 space-y-2 sm:col-span-6 xl:col-span-3">
            <Label htmlFor="lab-pin" className="text-xs">PIN Code</Label>
            <Dialog open={pinDialog} onOpenChange={(open) => { setPinDialog(open); if (open) setDraft('') }}>
              <LimsFieldWithAdd addButton={<DialogTrigger asChild><LimsFieldAddButton aria-label="Add PIN code" /></DialogTrigger>}>
                <FilterCombobox
                  value={form.pinCode}
                  onValueChange={(value) => onChange({ ...form, pinCode: value.replace(/[^0-9]/g, '').slice(0, 6) })}
                  options={pinOptions}
                  onSelectOption={(option) => applyPin(option.label)}
                  open={pinOpen}
                  onOpenChange={setPinOpen}
                  placeholder="Type or select PIN"
                  listId="lab-pin-combobox"
                  inputId="lab-pin"
                  inputClassName="h-10"
                />
              </LimsFieldWithAdd>
              <ClientManageDialogContent
                open={pinDialog}
                title="Manage PIN Codes"
                addLabel="Add PIN Code"
                inputId="new-lab-pin"
                placeholder="6-digit PIN"
                value={draft}
                onValueChange={setDraft}
                inlineAdd
                onInlineAdd={() => addOption('pin_code', draft.replace(/[^0-9]/g, '').slice(0, 6), draft.replace(/[^0-9]/g, '').slice(0, 6), (saved) => { onChange({ ...form, pinCode: saved }) })}
                onSave={() => addOption('pin_code', draft.replace(/[^0-9]/g, '').slice(0, 6), draft.replace(/[^0-9]/g, '').slice(0, 6), (saved) => { onChange({ ...form, pinCode: saved }); setPinDialog(false) })}
                onUpdate={(id) => {
                  const value = draft.replace(/[^0-9]/g, '').slice(0, 6)
                  void supabase.from('client_master_options').update({ label: value, value }).eq('id', id).then(() => {
                    setRows((prev) => prev.map((row) => (row.id === id ? { ...row, label: value, value } : row)))
                    setPinDialog(false)
                  })
                }}
                saveDisabled={!draft.trim()}
                items={pins}
                canDelete={() => true}
                onDelete={(id) => {
                  void supabase.from('client_master_options').delete().eq('id', id).then(() => setRows((prev) => prev.filter((row) => row.id !== id)))
                }}
              />
            </Dialog>
            {pinError ? <p className="text-xs text-destructive">{pinError}</p> : null}
          </div>

          <div className="col-span-12 min-w-0 space-y-2 sm:col-span-6 xl:col-span-3">
            <Label htmlFor="lab-district" className="text-xs">District</Label>
            <Dialog open={districtDialog} onOpenChange={(open) => { setDistrictDialog(open); if (open) setDraft('') }}>
              <LimsFieldWithAdd addButton={<DialogTrigger asChild><LimsFieldAddButton aria-label="Add district" /></DialogTrigger>}>
                <FilterCombobox
                  value={form.district}
                  onValueChange={(value) => onChange({ ...form, district: value })}
                  options={districtOptions}
                  onSelectOption={(option) => onChange({ ...form, district: option.label })}
                  open={districtOpen}
                  onOpenChange={setDistrictOpen}
                  placeholder="Type or select District"
                  listId="lab-district-combobox"
                  inputId="lab-district"
                  inputClassName="h-10"
                />
              </LimsFieldWithAdd>
              <ClientManageDialogContent
                open={districtDialog}
                title="Manage Districts"
                addLabel="Add District"
                inputId="new-lab-district"
                placeholder="Enter District"
                value={draft}
                onValueChange={setDraft}
                inlineAdd
                onInlineAdd={() => addOption('district', toProperTitleCase(draft), toProperTitleCase(draft), (saved) => { onChange({ ...form, district: saved }) })}
                onSave={() => addOption('district', toProperTitleCase(draft), toProperTitleCase(draft), (saved) => { onChange({ ...form, district: saved }); setDistrictDialog(false) })}
                onUpdate={(id) => {
                  const value = toProperTitleCase(draft)
                  void supabase.from('client_master_options').update({ label: value, value }).eq('id', id).then(() => {
                    setRows((prev) => prev.map((row) => (row.id === id ? { ...row, label: value, value } : row)))
                    setDistrictDialog(false)
                  })
                }}
                saveDisabled={!draft.trim()}
                items={districts}
                canDelete={() => true}
                onDelete={(id) => {
                  void supabase.from('client_master_options').delete().eq('id', id).then(() => setRows((prev) => prev.filter((row) => row.id !== id)))
                }}
              />
            </Dialog>
          </div>

          <div className="col-span-12 min-w-0 space-y-2 sm:col-span-6 xl:col-span-3">
            <Label htmlFor="lab-state" className="text-xs">State</Label>
            <Dialog open={stateDialog} onOpenChange={(open) => { setStateDialog(open); if (open) setDraft('') }}>
              <LimsFieldWithAdd addButton={<DialogTrigger asChild><LimsFieldAddButton aria-label="Add state" /></DialogTrigger>}>
                <FilterCombobox
                  value={form.state}
                  onValueChange={(value) => onChange({ ...form, state: value })}
                  options={stateOptions}
                  onSelectOption={(option) => onChange({ ...form, state: option.label })}
                  open={stateOpen}
                  onOpenChange={setStateOpen}
                  placeholder="Type or select State"
                  listId="lab-state-combobox"
                  inputId="lab-state"
                  inputClassName="h-10"
                />
              </LimsFieldWithAdd>
              <ClientManageDialogContent
                open={stateDialog}
                title="Manage States"
                addLabel="Add State"
                inputId="new-lab-state"
                placeholder="Enter state"
                value={draft}
                onValueChange={setDraft}
                inlineAdd
                onInlineAdd={() => addOption('state', toProperTitleCase(draft), toProperTitleCase(draft), (saved) => { onChange({ ...form, state: saved }) })}
                onSave={() => addOption('state', toProperTitleCase(draft), toProperTitleCase(draft), (saved) => { onChange({ ...form, state: saved }); setStateDialog(false) })}
                onUpdate={(id) => {
                  const value = toProperTitleCase(draft)
                  void supabase.from('client_master_options').update({ label: value, value }).eq('id', id).then(() => {
                    setRows((prev) => prev.map((row) => (row.id === id ? { ...row, label: value, value } : row)))
                    setStateDialog(false)
                  })
                }}
                saveDisabled={!draft.trim()}
                items={states}
                canDelete={() => true}
                onDelete={(id) => {
                  void supabase.from('client_master_options').delete().eq('id', id).then(() => setRows((prev) => prev.filter((row) => row.id !== id)))
                }}
              />
            </Dialog>
          </div>

          <div className="col-span-12 min-w-0 space-y-2 sm:col-span-6 xl:col-span-3">
            <Label htmlFor="lab-country" className="text-xs">Country</Label>
            <Dialog open={countryDialog} onOpenChange={(open) => { setCountryDialog(open); if (open) setDraft('') }}>
              <LimsFieldWithAdd addButton={<DialogTrigger asChild><LimsFieldAddButton aria-label="Add country" /></DialogTrigger>}>
                <Select value={form.country} onValueChange={(value) => onChange({ ...form, country: value })}>
                  <SelectTrigger id="lab-country"><SelectValue placeholder="Select country" /></SelectTrigger>
                  <SelectContent>
                    {countries.map((country) => <SelectItem key={country.id} value={country.label}>{country.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </LimsFieldWithAdd>
              <ClientManageDialogContent
                open={countryDialog}
                title="Manage Countries"
                addLabel="Add Country"
                inputId="new-lab-country"
                placeholder="Enter country"
                value={draft}
                onValueChange={setDraft}
                inlineAdd
                onInlineAdd={() => addOption('country', toProperTitleCase(draft), toProperTitleCase(draft), (saved) => { onChange({ ...form, country: saved }) })}
                onSave={() => addOption('country', toProperTitleCase(draft), toProperTitleCase(draft), (saved) => { onChange({ ...form, country: saved }); setCountryDialog(false) })}
                onUpdate={(id) => {
                  const value = toProperTitleCase(draft)
                  void supabase.from('client_master_options').update({ label: value, value }).eq('id', id).then(() => {
                    setRows((prev) => prev.map((row) => (row.id === id ? { ...row, label: value, value } : row)))
                    setCountryDialog(false)
                  })
                }}
                saveDisabled={!draft.trim()}
                items={countries}
                canDelete={() => true}
                onDelete={(id) => {
                  void supabase.from('client_master_options').delete().eq('id', id).then(() => setRows((prev) => prev.filter((row) => row.id !== id)))
                }}
              />
            </Dialog>
          </div>

          <div className="col-span-12 grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-2 sm:gap-y-4 xl:grid-cols-3">
            <div className="flex min-w-0 flex-col space-y-2">
              <Label htmlFor="lab-contact">Name of the Contact Person</Label>
              <Input
                id="lab-contact"
                placeholder="Enter Contact Person Name"
                value={form.contactName}
                onChange={(e) => onChange({ ...form, contactName: e.target.value })}
                onBlur={() => {
                  const next = toProperTitleCase(form.contactName)
                  if (next !== form.contactName) onChange({ ...form, contactName: next })
                }}
                className="h-10"
              />
            </div>
            <div className="flex min-w-0 flex-col space-y-2">
              <Label>Mobile Number</Label>
              <Dialog open={codeDialog} onOpenChange={(open) => { setCodeDialog(open); if (open) setDraft('') }}>
                <LimsFieldWithAdd addButton={<DialogTrigger asChild><LimsFieldAddButton aria-label="Add country code" /></DialogTrigger>}>
                  <div className="flex h-10 gap-2">
                    <div className="w-20 shrink-0">
                      <FilterCombobox
                        value={form.countryCode}
                        onValueChange={(value) => onChange({ ...form, countryCode: value })}
                        options={codeOptions}
                        onSelectOption={(option) => onChange({ ...form, countryCode: option.id })}
                        open={codeOpen}
                        onOpenChange={setCodeOpen}
                        placeholder="+91"
                        listId="lab-country-code-combobox"
                        inputId="lab-country-code"
                        inputClassName="h-10 px-1.5 text-sm"
                      />
                    </div>
                    <Input
                      inputMode="numeric"
                      placeholder="10 Digit Mobile Number"
                      value={form.mobile}
                      onChange={(e) => onChange({ ...form, mobile: e.target.value.replace(/[^0-9]/g, '').slice(0, 10) })}
                      className="min-w-0 flex-[1_1_0%] grow"
                    />
                  </div>
                </LimsFieldWithAdd>
                <ClientManageDialogContent
                  open={codeDialog}
                  title="Manage Country Codes"
                  addLabel="Add Country Code"
                  inputId="new-lab-code"
                  placeholder="e.g., +44"
                  value={draft}
                  onValueChange={setDraft}
                  inlineAdd
                  onInlineAdd={() => {
                    const raw = draft.trim()
                    const formatted = raw.startsWith('+') ? raw : `+${raw}`
                    addOption('country_code', formatted, formatted, (saved) => { onChange({ ...form, countryCode: saved }) })
                  }}
                  onSave={() => {
                    const raw = draft.trim()
                    const formatted = raw.startsWith('+') ? raw : `+${raw}`
                    addOption('country_code', formatted, formatted, (saved) => { onChange({ ...form, countryCode: saved }); setCodeDialog(false) })
                  }}
                  onUpdate={(id) => {
                    const raw = draft.trim()
                    const formatted = raw.startsWith('+') ? raw : `+${raw}`
                    void supabase.from('client_master_options').update({ label: formatted, value: formatted }).eq('id', id).then(() => {
                      setRows((prev) => prev.map((row) => (row.id === id ? { ...row, label: formatted, value: formatted } : row)))
                      setCodeDialog(false)
                    })
                  }}
                  saveDisabled={!draft.trim()}
                  items={codes.map((row) => ({ id: row.id, label: row.value || row.label }))}
                  canDelete={() => true}
                  onDelete={(id) => {
                    void supabase.from('client_master_options').delete().eq('id', id).then(() => setRows((prev) => prev.filter((row) => row.id !== id)))
                  }}
                />
              </Dialog>
              {mobileError ? <p className="text-xs text-destructive">{mobileError}</p> : null}
            </div>
            <div className="flex min-w-0 flex-col space-y-2">
              <Label htmlFor="lab-email">Email ID</Label>
              <Input
                id="lab-email"
                type="email"
                placeholder="Enter Email ID"
                value={form.email}
                onChange={(e) => onChange({ ...form, email: e.target.value })}
                className="h-10"
              />
              {emailError ? <p className="text-xs text-destructive">{emailError}</p> : null}
            </div>
          </div>

          <div className="col-span-12 grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-2 sm:gap-y-4 xl:grid-cols-3">
            <div className="flex min-w-0 flex-col space-y-2">
              <Label htmlFor="lab-opening-balance">Opening Balance</Label>
              <div className="flex h-10 gap-2">
                <Input
                  id="lab-opening-balance"
                  inputMode="decimal"
                  placeholder="0.00"
                  value={form.openingBalance}
                  onChange={(e) => onChange({ ...form, openingBalance: e.target.value.replace(/[^0-9.]/g, '') })}
                  className="min-w-0 flex-1"
                />
                <div className="w-24 shrink-0">
                  <Select value={form.balanceType} onValueChange={(value) => onChange({ ...form, balanceType: value })}>
                    <SelectTrigger aria-label="Cr/Dr" className="h-10 rounded-none"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {BALANCE_TYPES.map((type) => <SelectItem key={type} value={type}>{type}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
            <div className="flex min-w-0 flex-col space-y-2">
              <Label htmlFor="lab-payment-term">Payment Term</Label>
              <Dialog open={paymentDialog} onOpenChange={(open) => { setPaymentDialog(open); if (open) setDraft('') }}>
                <LimsFieldWithAdd addButton={<DialogTrigger asChild><LimsFieldAddButton aria-label="Add payment term" /></DialogTrigger>}>
                  <FilterCombobox
                    value={form.paymentTerm}
                    onValueChange={(value) => onChange({ ...form, paymentTerm: value })}
                    options={paymentOptions}
                    onSelectOption={(option) => onChange({ ...form, paymentTerm: option.label })}
                    open={paymentOpen}
                    onOpenChange={setPaymentOpen}
                    placeholder="Type or select Payment Term"
                    listId="lab-payment-term-combobox"
                    inputId="lab-payment-term"
                    inputClassName="h-10"
                  />
                </LimsFieldWithAdd>
                <ClientManageDialogContent
                  open={paymentDialog}
                  title="Manage Payment Terms"
                  addLabel="Add Payment Term"
                  inputId="new-lab-payment-term"
                  placeholder="e.g., 90 Days"
                  value={draft}
                  onValueChange={setDraft}
                  inlineAdd
                  onInlineAdd={() => addOption('payment_term', draft.trim(), draft.trim(), (saved) => { onChange({ ...form, paymentTerm: saved }) })}
                  onSave={() => addOption('payment_term', draft.trim(), draft.trim(), (saved) => { onChange({ ...form, paymentTerm: saved }); setPaymentDialog(false) })}
                  onUpdate={(id) => {
                    const value = draft.trim()
                    void supabase.from('client_master_options').update({ label: value, value }).eq('id', id).then(() => {
                      setRows((prev) => prev.map((row) => (row.id === id ? { ...row, label: value, value } : row)))
                      setPaymentDialog(false)
                    })
                  }}
                  saveDisabled={!draft.trim()}
                  items={paymentTerms}
                  canDelete={() => true}
                  onDelete={(id) => {
                    void supabase.from('client_master_options').delete().eq('id', id).then(() => setRows((prev) => prev.filter((row) => row.id !== id)))
                  }}
                />
              </Dialog>
            </div>
            <div className="flex min-w-0 flex-col space-y-2">
              <Label htmlFor="lab-remark">Remark</Label>
              <Input id="lab-remark" placeholder="Enter Remark" value={form.remark} onChange={(e) => onChange({ ...form, remark: e.target.value })} className="h-10" />
            </div>
          </div>
        </div>
      </div>
      <div className="mt-3 flex justify-end border-t border-stone-200 pt-2.5">
        <Button
          type="button"
          className={cn('h-10 min-h-10 rounded-none bg-amber-700 px-4 text-sm text-white shadow-sm hover:bg-amber-800')}
          disabled={!canSave}
          onClick={onSave}
        >
          {saveLoading ? 'Saving…' : 'Save & Close'}
        </Button>
      </div>
    </div>
  )
}
