import { useEffect, useState, type Dispatch, type SetStateAction } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogTrigger } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { LimsFieldAddButton, LimsFieldWithAdd } from '@/components/lims/LimsFieldWithAdd'
import { ClientManageDialogContent } from '@/features/masters/clients/ClientManageDialogContent'
import { clientRegistryFormClass } from '@/features/masters/clients/clientsFormUi'
import { isValidEmail, isValidGst, isValidIndianPin, isValidLatitude, isValidLongitude, toProperTitleCase } from '@/features/masters/clients/types'
import { FilterCombobox } from '@/features/sample-handling/receiving/FilterCombobox'
import { supabase } from '@/lib/supabaseClient'
import { cn } from '@/lib/utils'
import { formatBisBranchOfficeName, type BisBranchOfficeForm } from './bisBranchOfficesApi'

type MasterOption = { id: string; category: string; label: string; value: string }

function PlusOptionField({
  label,
  inputId,
  category,
  value,
  placeholder,
  items,
  canEdit,
  normalize,
  onValueChange,
  onItemsChange,
}: {
  label: string
  inputId: string
  category: string
  value: string
  placeholder: string
  items: MasterOption[]
  canEdit: boolean
  normalize?: (raw: string) => string
  onValueChange: (value: string) => void
  onItemsChange: (next: MasterOption[]) => void
}) {
  const [open, setOpen] = useState(false)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [draft, setDraft] = useState('')
  const [error, setError] = useState<string | null>(null)
  const clean = (raw: string) => (normalize ? normalize(raw) : raw.trim())
  const query = value.trim().toLowerCase()
  const exact = items.some((item) => item.label.toLowerCase() === query)
  const options = items
    .filter((item) => !query || exact || item.label.toLowerCase().includes(query))
    .map((item) => ({ id: item.id, label: item.label }))

  const remember = async (labelText: string, id?: string) => {
    const name = clean(labelText)
    if (!name || !canEdit) return
    if (id) {
      const { error: updateError } = await supabase.from('client_master_options').update({ label: name, value: name }).eq('id', id)
      if (updateError) {
        setError(updateError.message)
        return
      }
      onItemsChange(items.map((item) => (item.id === id ? { ...item, label: name, value: name } : item)))
    } else if (!items.some((item) => item.label.toLowerCase() === name.toLowerCase())) {
      const { data, error: insertError } = await supabase
        .from('client_master_options')
        .insert({ category, label: name, value: name })
        .select('id')
        .single()
      if (insertError) {
        setError(insertError.message)
        return
      }
      onItemsChange([...items, { id: String((data as { id: string }).id), category, label: name, value: name }])
    }
    onValueChange(name)
    setDraft('')
    setError(null)
  }

  const title = label || 'Country Code'
  return (
    <div className="min-w-0 space-y-2">
      {label ? <Label htmlFor={inputId} className="text-xs">{label}</Label> : null}
      <Dialog open={dialogOpen} onOpenChange={(next) => { setDialogOpen(next); if (next) setDraft('') }}>
        <LimsFieldWithAdd addButton={<DialogTrigger asChild><LimsFieldAddButton aria-label={`Add ${label}`} /></DialogTrigger>}>
          <FilterCombobox
            value={value}
            onValueChange={(next) => onValueChange(clean(next))}
            options={options}
            onSelectOption={(option) => onValueChange(option.label)}
            open={open}
            onOpenChange={setOpen}
            placeholder={placeholder}
            listId={`${inputId}-list`}
            inputId={inputId}
            inputClassName="h-8 border-0 bg-transparent px-2 shadow-none focus-visible:ring-0"
          />
        </LimsFieldWithAdd>
        <ClientManageDialogContent
          open={dialogOpen}
          title={`Manage ${title}`}
          addLabel={`Add ${title}`}
          inputId={`new-${inputId}`}
          placeholder={placeholder}
          value={draft}
          onValueChange={setDraft}
          inlineAdd
          onInlineAdd={() => void remember(draft)}
          onSave={() => void remember(draft)}
          onUpdate={(id) => void remember(draft, id)}
          saveDisabled={!clean(draft)}
          items={items}
          canDelete={() => true}
          onDelete={(id) => {
            void supabase.from('client_master_options').delete().eq('id', id).then(() => {
              onItemsChange(items.filter((item) => item.id !== id))
            })
          }}
        />
      </Dialog>
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  )
}

export function BisBranchOfficesForm({
  form,
  onChange,
  canEdit,
  saveLoading,
  saveMessage,
  onSave,
}: {
  form: BisBranchOfficeForm
  onChange: Dispatch<SetStateAction<BisBranchOfficeForm>>
  canEdit: boolean
  saveLoading: boolean
  saveMessage: string | null
  onSave: () => void
}) {
  const [options, setOptions] = useState<MasterOption[]>([])
  const pinError = isValidIndianPin(form.pinCode) ? null : 'Invalid PIN code'
  const emailError = isValidEmail(form.email) ? null : 'Invalid email address'
  const gstError = isValidGst(form.gstNumber) ? null : 'Invalid GST number'
  const longitudeError = isValidLongitude(form.longitude) ? null : 'Longitude must be between -180 and 180'
  const latitudeError = isValidLatitude(form.latitude) ? null : 'Latitude must be between -90 and 90'
  const mobileError = form.mobile.trim() && form.countryCode.trim() === '+91' && !/^[6-9][0-9]{9}$/.test(form.mobile.trim())
    ? 'Mobile must be a 10-digit number starting with 6–9'
    : null
  const canSave = canEdit && !saveLoading && !pinError && !emailError && !mobileError && !gstError && !longitudeError && !latitudeError && form.name.trim().length > 0 && form.code.trim().length > 0

  useEffect(() => {
    let cancelled = false
    void supabase
      .from('client_master_options')
      .select('id, category, label, value')
      .in('category', ['bis_branch_code', 'bis_office_type', 'bis_region', 'pin_code', 'city', 'state', 'country', 'country_code'])
      .order('label')
      .then(({ data }) => {
        if (cancelled || !Array.isArray(data)) return
        setOptions(data.map((row) => ({
          id: String((row as { id: string }).id),
          category: String((row as { category: string }).category),
          label: String((row as { label: string }).label ?? ''),
          value: String((row as { value?: string | null }).value ?? ''),
        })))
      })
    return () => {
      cancelled = true
    }
  }, [])

  const applyPin = (pinCode: string) => {
    onChange((prev) => ({ ...prev, pinCode }))
    if (pinCode.length !== 6) return
    void supabase
      .from('clients')
      .select('district, state, country')
      .eq('pin_code', pinCode)
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        if (!data) return
        const hit = data as { district?: string | null; state?: string | null; country?: string | null }
        onChange((prev) => ({
          ...prev,
          pinCode,
          city: hit.district || prev.city,
          state: hit.state || prev.state,
          country: hit.country || prev.country || 'India',
        }))
      })
  }

  const of = (category: string) => options.filter((row) => row.category === category)
  const setCategory = (category: string, next: MasterOption[]) => {
    setOptions((prev) => [...prev.filter((row) => row.category !== category), ...next])
  }

  return (
    <div className={clientRegistryFormClass}>
      <div className="space-y-5">
        {saveMessage ? <p className="border-l-2 border-destructive bg-destructive/5 px-3 py-2 text-sm text-destructive">{saveMessage}</p> : null}
        <div className="grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-2 xl:grid-cols-12">
          <div className="xl:col-span-3">
            <PlusOptionField
              label="Branch Code"
              inputId="bis-office-code"
              category="bis_branch_code"
              value={form.code}
              placeholder="e.g. WRO"
              items={of('bis_branch_code')}
              canEdit={canEdit}
              normalize={(raw) => raw.trim().toUpperCase()}
              onValueChange={(code) => onChange({ ...form, code })}
              onItemsChange={(next) => setCategory('bis_branch_code', next)}
            />
          </div>
          <div className="xl:col-span-4">
            <PlusOptionField
              label="Office Type"
              inputId="bis-office-type"
              category="bis_office_type"
              value={form.officeType}
              placeholder="Branch Office"
              items={of('bis_office_type')}
              canEdit={canEdit}
              onValueChange={(officeType) => onChange({ ...form, officeType: officeType || 'Branch Office' })}
              onItemsChange={(next) => setCategory('bis_office_type', next)}
            />
          </div>
          <div className="xl:col-span-5">
            <PlusOptionField
              label="Region"
              inputId="bis-office-region"
              category="bis_region"
              value={form.region}
              placeholder="e.g. WRO"
              items={of('bis_region')}
              canEdit={canEdit}
              onValueChange={(region) => onChange({ ...form, region })}
              onItemsChange={(next) => setCategory('bis_region', next)}
            />
          </div>

          <div className="sm:col-span-2 xl:col-span-12">
            <div className="space-y-2">
              <Label htmlFor="bis-office-name" className="text-xs">Name of the Branch Office</Label>
              <Input
                id="bis-office-name"
                placeholder="Bureau of Indian Standards - Ahmedabad Branch Office 1"
                value={form.name}
                onChange={(e) => onChange({ ...form, name: e.target.value })}
                onBlur={() => {
                  const next = formatBisBranchOfficeName(form.name)
                  if (next !== form.name) onChange({ ...form, name: next })
                }}
              />
            </div>
          </div>

          <div className="sm:col-span-2 xl:col-span-12">
            <div className="space-y-2">
              <Label htmlFor="bis-office-address" className="text-xs">Address of the Branch Office</Label>
              <Textarea
                id="bis-office-address"
                rows={1}
                placeholder="Enter Branch Office Address"
                value={form.address}
                onChange={(e) => onChange({ ...form, address: e.target.value })}
                onBlur={() => {
                  const next = toProperTitleCase(form.address)
                  if (next !== form.address) onChange({ ...form, address: next })
                }}
                className="!h-8 !min-h-8 resize-none overflow-hidden rounded-none border border-stone-500 bg-stone-50 px-3 py-1 shadow-none focus-visible:border-amber-600 focus-visible:bg-white focus-visible:ring-2 focus-visible:ring-amber-500/20 focus-visible:ring-offset-0"
              />
            </div>
          </div>

          <div className="xl:col-span-3">
            <PlusOptionField
              label="PIN Code"
              inputId="bis-office-pin"
              category="pin_code"
              value={form.pinCode}
              placeholder="Type or select PIN"
              items={of('pin_code')}
              canEdit={canEdit}
              normalize={(raw) => raw.replace(/[^0-9]/g, '').slice(0, 6)}
              onValueChange={applyPin}
              onItemsChange={(next) => setCategory('pin_code', next)}
            />
            {pinError ? <p className="text-xs text-destructive">{pinError}</p> : null}
          </div>
          <div className="xl:col-span-3">
            <PlusOptionField
              label="City"
              inputId="bis-office-city"
              category="city"
              value={form.city}
              placeholder="Type or select City"
              items={of('city')}
              canEdit={canEdit}
              normalize={toProperTitleCase}
              onValueChange={(city) => onChange({ ...form, city })}
              onItemsChange={(next) => setCategory('city', next)}
            />
          </div>
          <div className="xl:col-span-3">
            <PlusOptionField
              label="State"
              inputId="bis-office-state"
              category="state"
              value={form.state}
              placeholder="Type or select State"
              items={of('state')}
              canEdit={canEdit}
              normalize={toProperTitleCase}
              onValueChange={(state) => onChange({ ...form, state })}
              onItemsChange={(next) => setCategory('state', next)}
            />
          </div>
          <div className="xl:col-span-3">
            <PlusOptionField
              label="Country"
              inputId="bis-office-country"
              category="country"
              value={form.country}
              placeholder="India"
              items={of('country')}
              canEdit={canEdit}
              normalize={toProperTitleCase}
              onValueChange={(country) => onChange({ ...form, country: country || 'India' })}
              onItemsChange={(next) => setCategory('country', next)}
            />
          </div>

          <div className="xl:col-span-4">
            <div className="space-y-2">
              <Label htmlFor="bis-office-contact" className="text-xs">Name of the Contact Person</Label>
              <Input
                id="bis-office-contact"
                placeholder="Enter Contact Person Name"
                value={form.contactName}
                onChange={(e) => onChange({ ...form, contactName: e.target.value })}
              />
            </div>
          </div>
          <div className="xl:col-span-4">
            <div className="space-y-2">
              <Label className="text-xs">Mobile Number</Label>
              <div className="flex h-8 gap-2">
                <div className="w-24 shrink-0">
                  <PlusOptionField
                    label=""
                    inputId="bis-office-code-dial"
                    category="country_code"
                    value={form.countryCode}
                    placeholder="+91"
                    items={of('country_code')}
                    canEdit={canEdit}
                    onValueChange={(countryCode) => onChange({ ...form, countryCode })}
                    onItemsChange={(next) => setCategory('country_code', next)}
                  />
                </div>
                <Input
                  inputMode="numeric"
                  placeholder="10 Digit Mobile Number"
                  value={form.mobile}
                  onChange={(e) => onChange({ ...form, mobile: e.target.value.replace(/[^0-9]/g, '').slice(0, 10) })}
                />
              </div>
              {mobileError ? <p className="text-xs text-destructive">{mobileError}</p> : null}
            </div>
          </div>
          <div className="xl:col-span-4">
            <div className="space-y-2">
              <Label htmlFor="bis-office-email" className="text-xs">Email ID</Label>
              <Input
                id="bis-office-email"
                type="email"
                placeholder="Enter Email ID"
                value={form.email}
                onChange={(e) => onChange({ ...form, email: e.target.value })}
              />
              {emailError ? <p className="text-xs text-destructive">{emailError}</p> : null}
            </div>
          </div>

          <div className="xl:col-span-4">
            <div className="space-y-2">
              <Label htmlFor="bis-office-gst" className="text-xs">GST Number</Label>
              <Input
                id="bis-office-gst"
                placeholder="15-character GSTIN"
                value={form.gstNumber}
                maxLength={15}
                onChange={(e) => onChange({ ...form, gstNumber: e.target.value.toUpperCase().replace(/[^0-9A-Z]/g, '').slice(0, 15) })}
              />
              {gstError ? <p className="text-xs text-destructive">{gstError}</p> : null}
            </div>
          </div>
          <div className="xl:col-span-4">
            <div className="space-y-2">
              <Label htmlFor="bis-office-longitude" className="text-xs">Longitude</Label>
              <Input
                id="bis-office-longitude"
                inputMode="decimal"
                placeholder="e.g. 77.24056"
                value={form.longitude}
                onChange={(e) => onChange({ ...form, longitude: e.target.value.replace(/[^0-9.-]/g, '') })}
              />
              {longitudeError ? <p className="text-xs text-destructive">{longitudeError}</p> : null}
            </div>
          </div>
          <div className="xl:col-span-4">
            <div className="space-y-2">
              <Label htmlFor="bis-office-latitude" className="text-xs">Latitude</Label>
              <Input
                id="bis-office-latitude"
                inputMode="decimal"
                placeholder="e.g. 28.63100"
                value={form.latitude}
                onChange={(e) => onChange({ ...form, latitude: e.target.value.replace(/[^0-9.-]/g, '') })}
              />
              {latitudeError ? <p className="text-xs text-destructive">{latitudeError}</p> : null}
            </div>
          </div>

          <div className="sm:col-span-2 xl:col-span-12">
            <div className="space-y-2">
              <Label htmlFor="bis-office-remark" className="text-xs">Remark</Label>
              <Input
                id="bis-office-remark"
                placeholder="Enter Remark"
                value={form.remark}
                onChange={(e) => onChange({ ...form, remark: e.target.value })}
              />
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
