import { useEffect, useMemo, useState } from 'react'
import { Eye, Search } from 'lucide-react'
import { toast } from 'sonner'
import { useIsLaboratoryDirector } from '@/components/lims/LaboratoryDirectorOnly'
import { LimsFieldAddButton, LimsFieldWithAdd } from '@/components/lims/LimsFieldWithAdd'
import { Button } from '@/components/ui/button'
import { Dialog, DialogTrigger } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { FilterCombobox } from '@/features/sample-handling/receiving/FilterCombobox'
import { getCurrencyCode, getCurrencySymbol } from '@/lib/appCurrency'
import { limsFieldAddBtnClass } from '@/lib/limsThemeUi'
import { formatMoneyInput, sanitizeMoneyInput } from '@/features/masters/products-services/types'
import { cn } from '@/lib/utils'
import { ClientManageDialogContent } from './ClientManageDialogContent'
import { clientRegistryFormClass } from './clientsFormUi'
import { gstinStateCode, isValidPan } from '@/lib/indiaValidators'
import { ClientIdentitySections } from './ClientIdentitySections'
import { revealClientPortalPassword } from './clientPortalSecretApi'
import type { ClientAddressDirectory, ClientCertificateFile, ClientCertificateInput } from './clientsApi'
import {
  BALANCE_TYPES,
  CLIENT_SECTORS,
  isValidEmail,
  isValidGst,
  isValidIndianPin,
  isValidLatitude,
  isValidLongitude,
  emptyClientSites,
  isValidMobile,
  toProperTitleCase,
  type BalanceType,
  type ClientForm,
  type CompanyScale,
  type CompanyType,
  type PaymentTerm,
} from './types'

function parsePastedClientCoordinates(raw: string): { latitude: string; longitude: string } | null {
  const text = raw.replace(/\u2212/g, '-').trim()
  const candidates: Array<[string, string]> = []
  const urlPatterns = [
    /@(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)/,
    /!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/,
    /[?&](?:q|query|ll)=(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)/i,
  ]
  for (const pattern of urlPatterns) {
    const match = text.match(pattern)
    if (match?.[1] && match[2]) candidates.push([match[1], match[2]])
  }

  const pair = text.match(/(-?\d+(?:\.\d+)?)\s*[,;\s/]+\s*(-?\d+(?:\.\d+)?)/)
  if (pair?.[1] && pair[2]) candidates.push([pair[1], pair[2]])

  // Some clipboard handlers remove the comma between Google's two decimal values.
  // Test possible digit boundaries and choose the split with the closest precision.
  if (/^-?\d+\.\d+-?\d+\.\d+$/.test(text)) {
    for (let index = 1; index < text.length; index += 1) {
      if (!/\d/.test(text[index - 1] ?? '') || !/\d/.test(text[index] ?? '')) continue
      const left = text.slice(0, index)
      const right = text.slice(index)
      if (/^-?\d+\.\d+$/.test(left) && /^-?\d+\.\d+$/.test(right)) {
        candidates.push([left, right])
      }
    }
  }

  const valid = candidates
    .map(([latitude, longitude]) => ({ latitude, longitude }))
    .filter(({ latitude, longitude }) => isValidLatitude(latitude) && isValidLongitude(longitude))
  if (!valid.length) return null
  const fractionDigits = (value: string) => value.split('.')[1]?.length ?? 0
  return valid.sort((a, b) => {
    const score = ({ latitude, longitude }: { latitude: string; longitude: string }) => {
      const latPrecision = fractionDigits(latitude)
      const longPrecision = fractionDigits(longitude)
      return Math.abs(latPrecision - longPrecision) * 100 + Math.abs(latPrecision - 14) + Math.abs(longPrecision - 14)
    }
    return score(a) - score(b)
  })[0] ?? null
}

function googleMapsSearchUrl(companyName: string) {
  const query = companyName.trim()
  if (!query) return 'https://www.google.com/maps'
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`
}

function MapsSearchLink({ companyName }: { companyName: string }) {
  return (
    <a
      className={limsFieldAddBtnClass}
      href={googleMapsSearchUrl(companyName)}
      target="_blank"
      rel="noreferrer"
      aria-label="Search on Google Maps"
      title="Search on Google Maps"
    >
      <Search size={14} strokeWidth={2.25} aria-hidden />
    </a>
  )
}

const EMPTY_KNOWN_PLACES: Pick<ClientAddressDirectory, 'districts' | 'states' | 'countries'> = {
  districts: [],
  states: [],
  countries: [],
}

function withSiteAddress(form: ClientForm, role: 'Registered Office' | 'Factory', address: string): ClientForm {
  const sites = form.sites.length > 0 ? form.sites.map((site) => ({ ...site })) : emptyClientSites()
  const index = sites.findIndex((site) => site.siteRole === role)
  if (index >= 0) sites[index] = { ...sites[index], address }
  else {
    sites.push({
      siteRole: role,
      address,
      district: form.district,
      state: form.state,
      pinCode: form.pinCode,
      gstNumber: form.gstNumber,
      isPrimary: role === 'Registered Office',
    })
  }
  const next = role === 'Registered Office' ? { ...form, address, sites } : { ...form, sites }
  if (role === 'Registered Office' && next.factorySameAsOffice !== false) return withSiteAddress(next, 'Factory', address)
  return next
}

function OpeningBalanceField({
  value,
  onChange,
}: {
  value: string
  onChange: (value: string) => void
}) {
  const [focused, setFocused] = useState(false)
  const displayValue = focused ? value : formatMoneyInput(value || '0')

  return (
    <div className="flex h-8 min-w-0 flex-1 overflow-hidden rounded-none border border-stone-500 bg-stone-50 focus-within:border-amber-600 focus-within:bg-white focus-within:ring-2 focus-within:ring-amber-500/20">
      <span
        className="inline-flex shrink-0 items-center border-r border-stone-500 bg-stone-100 px-2.5 text-sm font-semibold text-stone-700"
        aria-hidden
      >
        {getCurrencySymbol()}
      </span>
      <Input
        id="opening-balance"
        type="text"
        inputMode="decimal"
        value={displayValue}
        onFocus={() => setFocused(true)}
        onChange={(e) => onChange(sanitizeMoneyInput(e.target.value))}
        onBlur={(e) => {
          setFocused(false)
          onChange(formatMoneyInput(e.target.value || '0'))
        }}
        placeholder="0.00"
        className="h-full min-w-0 flex-1 rounded-none !border-0 !bg-transparent text-right tabular-nums shadow-none focus-visible:!ring-0"
        aria-label={`Opening Balance in ${getCurrencyCode()}`}
      />
    </div>
  )
}

export function ClientsForm({
  form,
  onChange,
  recordId = null,
  canSave,
  saveLoading,
  onSave,
  certificates = [],
  onUploadCertificate,
  onUpdateCertificate,
  onDeleteCertificate,
  onOpenCertificate,
  states,
  countries,
  districts,
  cities = [],
  pinCodes,
  pinAutoFill,
  knownPlaces = EMPTY_KNOWN_PLACES,
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
  cityDialogOpen = false,
  setCityDialogOpen,
  newCityName = '',
  setNewCityName,
  onAddCity,
  onUpdateCity,
  onDeleteCity,
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
  hideFooter = false,
  compact = false,
}: {
  form: ClientForm
  onChange: (next: ClientForm) => void
  /** Saved client id. View uses it. A new client has none until the first save. */
  recordId?: string | null
  canSave: boolean
  saveLoading: boolean
  onSave: () => void
  clientSaved?: boolean
  certificates?: ClientCertificateFile[]
  onUploadCertificate?: (input: ClientCertificateInput) => Promise<void>
  onUpdateCertificate?: (row: ClientCertificateFile, input: Pick<ClientCertificateInput, 'certName' | 'documentNumber' | 'issuedOn' | 'docTitle'>) => Promise<void>
  onDeleteCertificate?: (row: ClientCertificateFile) => void
  onOpenCertificate?: (row: ClientCertificateFile) => void
  hideFooter?: boolean
  /** Tighter spacing for nested dialogs (e.g. Add Client from Quotation). */
  compact?: boolean
  states: Array<{ id: string; label: string }>
  countries: Array<{ id: string; label: string }>
  districts: Array<{ id: string; label: string }>
  /** City master options. Optional: callers without city handlers get a plain text field. */
  cities?: Array<{ id: string; label: string }>
  pinCodes: Array<{ id: string; label: string }>
  pinAutoFill: Map<string, { district?: string; state?: string; country?: string }>
  /** District, state, and country names already stored on clients. The + dialog stays on master options. */
  knownPlaces?: Pick<ClientAddressDirectory, 'districts' | 'states' | 'countries'>
  countryCodes: Array<{ id: string; value: string; label: string }>
  companyTypes: Array<{ id: string; label: string }>
  companyScales: Array<{ id: string; label: string }>
  womenOptions: Array<{ id: string; label: string }>
  startupOptions: Array<{ id: string; label: string }>
  paymentTerms: Array<{ id: string; label: string }>
  stateDialogOpen: boolean
  setStateDialogOpen: (open: boolean) => void
  newStateName: string
  setNewStateName: (value: string) => void
  onAddState: (close?: boolean) => void
  onUpdateState: (id: string) => void
  onDeleteState: (id: string) => void
  countryDialogOpen: boolean
  setCountryDialogOpen: (open: boolean) => void
  newCountryName: string
  setNewCountryName: (value: string) => void
  onAddCountry: (close?: boolean) => void
  onUpdateCountry: (id: string) => void
  onDeleteCountry: (id: string) => void
  districtDialogOpen: boolean
  setDistrictDialogOpen: (open: boolean) => void
  newDistrictName: string
  setNewDistrictName: (value: string) => void
  onAddDistrict: (close?: boolean) => void
  onUpdateDistrict: (id: string) => void
  onDeleteDistrict: (id: string) => void
  cityDialogOpen?: boolean
  setCityDialogOpen?: (open: boolean) => void
  newCityName?: string
  setNewCityName?: (value: string) => void
  onAddCity?: (close?: boolean) => void
  onUpdateCity?: (id: string) => void
  onDeleteCity?: (id: string) => void
  pinCodeDialogOpen: boolean
  setPinCodeDialogOpen: (open: boolean) => void
  newPinCode: string
  setNewPinCode: (value: string) => void
  onAddPinCode: (close?: boolean) => void
  onUpdatePinCode: (id: string) => void
  onDeletePinCode: (id: string) => void
  countryCodeDialogOpen: boolean
  setCountryCodeDialogOpen: (open: boolean) => void
  newCountryCode: string
  setNewCountryCode: (value: string) => void
  onAddCountryCode: (close?: boolean) => void
  onUpdateCountryCode: (id: string) => void
  onDeleteCountryCode: (id: string) => void
  companyTypeDialogOpen: boolean
  setCompanyTypeDialogOpen: (open: boolean) => void
  newCompanyType: string
  setNewCompanyType: (value: string) => void
  onAddCompanyType: (close?: boolean) => void
  onUpdateCompanyType: (id: string) => void
  onDeleteCompanyType: (id: string) => void
  companyScaleDialogOpen: boolean
  setCompanyScaleDialogOpen: (open: boolean) => void
  newCompanyScale: string
  setNewCompanyScale: (value: string) => void
  onAddCompanyScale: (close?: boolean) => void
  onUpdateCompanyScale: (id: string) => void
  onDeleteCompanyScale: (id: string) => void
  womenDialogOpen: boolean
  setWomenDialogOpen: (open: boolean) => void
  newWomenOption: string
  setNewWomenOption: (value: string) => void
  onAddWomenOption: (close?: boolean) => void
  onUpdateWomenOption: (id: string) => void
  onDeleteWomenOption: (id: string) => void
  startupDialogOpen: boolean
  setStartupDialogOpen: (open: boolean) => void
  newStartupOption: string
  setNewStartupOption: (value: string) => void
  onAddStartupOption: (close?: boolean) => void
  onUpdateStartupOption: (id: string) => void
  onDeleteStartupOption: (id: string) => void
  paymentTermDialogOpen: boolean
  setPaymentTermDialogOpen: (open: boolean) => void
  newPaymentTerm: string
  setNewPaymentTerm: (value: string) => void
  onAddPaymentTerm: (close?: boolean) => void
  onUpdatePaymentTerm: (id: string) => void
  onDeletePaymentTerm: (id: string) => void
}) {
  const [pinOpen, setPinOpen] = useState(false)
  const [districtOpen, setDistrictOpen] = useState(false)
  const [cityOpen, setCityOpen] = useState(false)
  const [stateOpen, setStateOpen] = useState(false)
  const [countryCodeOpen, setCountryCodeOpen] = useState(false)
  const [paymentTermOpen, setPaymentTermOpen] = useState(false)
  const gstError = isValidGst(form.gstNumber) ? null : 'Invalid GST Number'
  const applyGstNumber = (raw: string) => {
    const gstNumber = raw.toUpperCase().replace(/\s/g, '').slice(0, 15)
    const derivedPan = gstNumber.length === 15 ? gstNumber.slice(2, 12) : ''
    const code = gstinStateCode(gstNumber)
    onChange({
      ...form,
      gstNumber,
      ...(derivedPan ? { pan: derivedPan, panFromGstin: true } : {}),
      ...(code && !form.gstStateCode.trim() ? { gstStateCode: code } : {}),
    })
  }
  const panError = isValidPan(form.pan) ? null : 'Invalid PAN'
  const mobileError = isValidMobile(form.mobile) ? null : 'Mobile number must be 10 digits'
  const emailError = isValidEmail(form.email) ? null : 'Invalid email address'
  const pinError = isValidIndianPin(form.pinCode) ? null : 'Invalid PIN code'
  const longitudeError = isValidLongitude(form.longitude) ? null : 'Longitude must be between -180 and 180'
  const latitudeError = isValidLatitude(form.latitude) ? null : 'Latitude must be between -90 and 90'
  const isAdmin = useIsLaboratoryDirector()
  const [changingPassword, setChangingPassword] = useState(false)
  const [revealedPassword, setRevealedPassword] = useState<string | null>(null)
  const [revealSeconds, setRevealSeconds] = useState(0)
  const passwordResetKey = `${recordId ?? 'new'}:${form.manakPasswordSet}:${form.clearManakPassword}`
  const [seenPasswordKey, setSeenPasswordKey] = useState(passwordResetKey)
  if (seenPasswordKey !== passwordResetKey) {
    setSeenPasswordKey(passwordResetKey)
    setChangingPassword(false)
    setRevealedPassword(null)
    setRevealSeconds(0)
  }
  const savedPassword = Boolean(form.manakPasswordSet) && !form.clearManakPassword
  const showSavedPassword = Boolean(recordId) && savedPassword && !changingPassword

  useEffect(() => {
    if (!revealedPassword) return
    const id = window.setInterval(() => {
      setRevealSeconds((seconds) => {
        if (seconds <= 1) {
          setRevealedPassword(null)
          return 0
        }
        return seconds - 1
      })
    }, 1000)
    return () => window.clearInterval(id)
  }, [revealedPassword])

  const blockPasswordCopy = (event: { preventDefault: () => void; metaKey?: boolean; ctrlKey?: boolean; key?: string }) => {
    if ('key' in event && event.key) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'c') event.preventDefault()
      return
    }
    event.preventDefault()
  }

  const viewPassword = () => {
    if (!recordId || !isAdmin) return
    void revealClientPortalPassword(recordId)
      .then((value) => {
        if (!value) {
          toast.error('No password saved')
          return
        }
        setRevealedPassword(value)
        setRevealSeconds(20)
      })
      .catch((err: unknown) => {
        toast.error(err instanceof Error ? err.message : 'No permission')
      })
  }

  const pinOptions = useMemo(() => {
    const all = Array.from(
      new Set(
        [...pinCodes.map((x) => x.label), ...pinAutoFill.keys()].filter((v) => String(v ?? '').trim().length > 0),
      ),
    ).sort((a, b) => a.localeCompare(b))
    const q = form.pinCode.trim()
    const filtered = q ? all.filter((p) => p.includes(q)) : all
    return filtered.map((p) => ({ id: p, label: p }))
  }, [pinCodes, pinAutoFill, form.pinCode])

  const districtOptions = useMemo(() => {
    const all = Array.from(
      new Set(
        [...districts.map((x) => x.label), ...knownPlaces.districts, ...Array.from(pinAutoFill.values(), (place) => place.district ?? '')]
          .map((v) => String(v ?? '').trim())
          .filter((v) => v.length > 0),
      ),
    ).sort((a, b) => a.localeCompare(b))
    const q = form.district.trim().toLowerCase()
    const filtered = q ? all.filter((d) => d.toLowerCase().includes(q)) : all
    return filtered.map((d) => ({ id: d, label: d }))
  }, [districts, knownPlaces.districts, pinAutoFill, form.district])

  const cityOptions = useMemo(() => {
    const all = Array.from(new Set(cities.map((x) => String(x.label ?? '').trim()).filter((v) => v.length > 0))).sort((a, b) =>
      a.localeCompare(b),
    )
    const q = form.city.trim().toLowerCase()
    const filtered = q ? all.filter((c) => c.toLowerCase().includes(q)) : all
    return filtered.map((c) => ({ id: c, label: c }))
  }, [cities, form.city])

  const stateOptions = useMemo(() => {
    const all = Array.from(
      new Set(
        [...states.map((x) => x.label), ...knownPlaces.states, ...Array.from(pinAutoFill.values(), (place) => place.state ?? '')]
          .map((v) => String(v ?? '').trim())
          .filter((v) => v.length > 0),
      ),
    ).sort((a, b) => a.localeCompare(b))
    const q = form.state.trim().toLowerCase()
    const filtered = q ? all.filter((s) => s.toLowerCase().includes(q)) : all
    return filtered.map((s) => ({ id: s, label: s }))
  }, [states, knownPlaces.states, pinAutoFill, form.state])

  const countryChoices = useMemo(() => {
    const labels = new Map<string, string>()
    for (const item of countries) {
      const label = item.label.trim()
      if (label) labels.set(label.toLowerCase(), label)
    }
    for (const name of knownPlaces.countries) {
      const label = name.trim()
      if (label && !labels.has(label.toLowerCase())) labels.set(label.toLowerCase(), label)
    }
    for (const place of pinAutoFill.values()) {
      const label = (place.country ?? '').trim()
      if (label && !labels.has(label.toLowerCase())) labels.set(label.toLowerCase(), label)
    }
    const current = form.country.trim()
    if (current && !labels.has(current.toLowerCase())) labels.set(current.toLowerCase(), current)
    return Array.from(labels.values()).sort((a, b) => a.localeCompare(b))
  }, [countries, knownPlaces.countries, pinAutoFill, form.country])

  const countryCodeOptions = useMemo(() => {
    const q = form.countryCode.trim().toLowerCase()
    return countryCodes
      .filter((c) => {
        const value = String(c.value ?? '').trim()
        const label = String(c.label ?? '').trim()
        if (!value && !label) return false
        if (!q) return true
        return value.toLowerCase().includes(q) || label.toLowerCase().includes(q)
      })
      .map((c) => ({
        id: c.value,
        label: c.value || c.label,
      }))
  }, [countryCodes, form.countryCode])

  const paymentTermOptions = useMemo(() => {
    const all = Array.from(
      new Set(paymentTerms.map((x) => x.label).filter((v) => String(v ?? '').trim().length > 0)),
    )
    const q = form.paymentTerm.trim().toLowerCase()
    const filtered = q ? all.filter((t) => t.toLowerCase().includes(q)) : all
    return filtered.map((t) => ({ id: t, label: t }))
  }, [paymentTerms, form.paymentTerm])

  const applyPinAutoFill = (pin: string) => {
    const key = pin.trim()
    const hit = key ? pinAutoFill.get(key) : undefined
    onChange({
      ...form,
      pinCode: key,
      district: hit?.district?.trim() || form.district,
      state: hit?.state?.trim() || form.state,
      country: hit?.country?.trim() || form.country,
    })
  }

  const hasDocTable = Boolean(!compact && onUploadCertificate && onUpdateCertificate && onDeleteCertificate && onOpenCertificate)

  return (
    <div className={clientRegistryFormClass}>
      <div className={cn(compact ? 'space-y-2' : 'space-y-5')}>
        <div className={cn('grid grid-cols-12', compact ? 'gap-2' : 'gap-x-4 gap-y-3 sm:gap-y-4')}>
          <div className={cn('col-span-12 grid grid-cols-1 sm:grid-cols-2', hasDocTable ? 'xl:grid-cols-4' : 'xl:grid-cols-6', compact ? 'gap-2' : 'gap-x-4 gap-y-3')}>
          {!hasDocTable ? (
            <>
          <div className={cn('min-w-0', compact ? 'space-y-1' : 'space-y-2')}>
            <Label htmlFor="gst">GST Number</Label>
            <LimsFieldWithAdd
              className={cn(
                gstError &&
                  '!border-red-600 !bg-red-50 focus-within:!border-red-600 focus-within:!ring-red-500/30',
              )}
              addButton={
                <a
                  className={limsFieldAddBtnClass}
                  href="https://services.gst.gov.in/services/searchtp"
                  target="_blank"
                  rel="noreferrer"
                  aria-label="Verify GST"
                  title="Verify GST"
                >
                  <Search size={14} strokeWidth={2.25} aria-hidden />
                </a>
              }
            >
              <Input
                id="gst"
                placeholder="22AAAFQ8256C1ZK"
                maxLength={15}
                value={form.gstNumber}
                onChange={(e) => applyGstNumber(e.target.value)}
                aria-invalid={Boolean(gstError)}
                className="h-full border-0 bg-transparent shadow-none focus-visible:border-transparent focus-visible:bg-transparent focus-visible:ring-0"
              />
              </LimsFieldWithAdd>
          </div>

          <div className={cn('min-w-0', compact ? 'space-y-1' : 'space-y-2')}>
            <Label htmlFor="client-pan">PAN</Label>
            <Input
              id="client-pan"
              maxLength={10}
              value={form.pan}
              onChange={(e) => onChange({ ...form, pan: e.target.value.toUpperCase().replace(/\s/g, '').slice(0, 10), panFromGstin: false })}
              aria-invalid={Boolean(panError)}
              className={cn(panError && '!border-red-600 !bg-red-50')}
            />
            {panError ? <p className="text-xs text-destructive">{panError}</p> : null}
          </div>
            </>
          ) : null}

          <div className={cn('min-w-0', compact ? 'space-y-1' : 'space-y-2')}>
            <Label htmlFor="client-sector">Sector</Label>
            <Select value={form.sector || 'none'} onValueChange={(v) => onChange({ ...form, sector: v === 'none' ? '' : (v as ClientForm['sector']) })}>
              <SelectTrigger id="client-sector">
                <SelectValue placeholder="Not set" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Not set</SelectItem>
                {CLIENT_SECTORS.map((sector) => (
                  <SelectItem key={sector} value={sector}>{sector}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className={cn('min-w-0', compact ? 'space-y-1' : 'space-y-2')}>
            <Label htmlFor="client-nature">Nature of Firm</Label>
            <Select value={form.constitution || 'none'} onValueChange={(v) => onChange({ ...form, constitution: v === 'none' ? '' : v })}>
              <SelectTrigger id="client-nature">
                <SelectValue placeholder="Not set" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Not set</SelectItem>
                {['Pvt. Limited', 'Public Limited', 'LLP', 'Partnership', 'Proprietorship', 'Trust / Society', 'Government'].map((n) => (
                  <SelectItem key={n} value={n}>{n}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className={cn('min-w-0', compact ? 'space-y-1' : 'space-y-2')}>
            <Label htmlFor="company-type" className="text-xs">Company Type</Label>
            <Dialog open={companyTypeDialogOpen} onOpenChange={setCompanyTypeDialogOpen}>
              <LimsFieldWithAdd
                addButton={
                  <DialogTrigger asChild>
                    <LimsFieldAddButton aria-label="Add company type" />
                  </DialogTrigger>
                }
              >
                <Select value={form.companyType} onValueChange={(v) => onChange({ ...form, companyType: v as CompanyType })}>
                  <SelectTrigger id="company-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Array.from(new Set([form.companyType, ...companyTypes.map((x) => x.label)].filter((v) => String(v ?? '').trim().length > 0))).map((t) => (
                      <SelectItem key={t} value={t}>
                        {t}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </LimsFieldWithAdd>
              <ClientManageDialogContent
                open={companyTypeDialogOpen}
                title="Manage Company Types"
                addLabel="Add Company Type"
                inputId="new-company-type"
                placeholder="e.g., Distributor"
                value={newCompanyType}
                onValueChange={setNewCompanyType}
                inlineAdd
                onInlineAdd={() => onAddCompanyType(false)}
                onSave={() => onAddCompanyType(true)}
                onUpdate={onUpdateCompanyType}
                saveDisabled={!newCompanyType.trim()}
                items={companyTypes}
                canDelete={() => true}
                onDelete={onDeleteCompanyType}
              />
            </Dialog>
          </div>

          <div className={cn('min-w-0', compact ? 'space-y-1' : 'space-y-2')}>
            <Label htmlFor="company-scale" className="text-xs">Company Scale</Label>
            <Dialog open={companyScaleDialogOpen} onOpenChange={setCompanyScaleDialogOpen}>
              <LimsFieldWithAdd
                addButton={
                  <DialogTrigger asChild>
                    <LimsFieldAddButton aria-label="Add company scale" />
                  </DialogTrigger>
                }
              >
                <Select value={form.companyScale} onValueChange={(v) => onChange({ ...form, companyScale: v as CompanyScale })}>
                  <SelectTrigger id="company-scale">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Array.from(new Set([form.companyScale, ...companyScales.map((x) => x.label)].filter((v) => String(v ?? '').trim().length > 0))).map((t) => (
                      <SelectItem key={t} value={t}>
                        {t}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </LimsFieldWithAdd>
              <ClientManageDialogContent
                open={companyScaleDialogOpen}
                title="Manage Company Scales"
                addLabel="Add Company Scale"
                inputId="new-company-scale"
                placeholder="e.g., Nano"
                value={newCompanyScale}
                onValueChange={setNewCompanyScale}
                inlineAdd
                onInlineAdd={() => onAddCompanyScale(false)}
                onSave={() => onAddCompanyScale(true)}
                onUpdate={onUpdateCompanyScale}
                saveDisabled={!newCompanyScale.trim()}
                items={companyScales}
                canDelete={() => true}
                onDelete={onDeleteCompanyScale}
              />
            </Dialog>
          </div>
          </div>

          <div className={cn('col-span-12 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5', compact ? 'gap-2' : 'gap-x-4 gap-y-3')}>
            <div className={cn('min-w-0 sm:col-span-2 xl:col-span-3', compact ? 'space-y-1' : 'space-y-2')}>
              <Label htmlFor="company-name" className="text-xs">Name of the Company</Label>
              <Input
                id="company-name"
                placeholder="Enter Company Name"
                value={form.companyName}
                onChange={(e) => onChange({ ...form, companyName: e.target.value })}
                onBlur={() => {
                  const next = toProperTitleCase(form.companyName)
                  if (next !== form.companyName) onChange({ ...form, companyName: next })
                }}
              />
            </div>
            <div className={cn('min-w-0', compact ? 'space-y-1' : 'space-y-2')}>
              <Label htmlFor="client-women">Women entrepreneur</Label>
              <Dialog open={womenDialogOpen} onOpenChange={setWomenDialogOpen}>
                <LimsFieldWithAdd
                  addButton={
                    <DialogTrigger asChild>
                      <LimsFieldAddButton aria-label="Add women entrepreneur option" />
                    </DialogTrigger>
                  }
                >
                  <Select
                    value={form.womenEntrepreneur || 'No'}
                    onValueChange={(v) => onChange({
                      ...form,
                      womenEntrepreneur: v,
                      isWomenEntrepreneur: v.trim().toLowerCase() === 'yes',
                    })}
                  >
                    <SelectTrigger id="client-women">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Array.from(new Set([form.womenEntrepreneur, ...womenOptions.map((x) => x.label)].filter((v) => String(v ?? '').trim().length > 0))).map((t) => (
                        <SelectItem key={t} value={t}>{t}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </LimsFieldWithAdd>
                <ClientManageDialogContent
                  open={womenDialogOpen}
                  title="Manage Women Entrepreneur"
                  addLabel="Add Women Entrepreneur"
                  inputId="new-women-entrepreneur"
                  placeholder="e.g., Yes"
                  value={newWomenOption}
                  onValueChange={setNewWomenOption}
                  inlineAdd
                  onInlineAdd={() => onAddWomenOption(false)}
                  onSave={() => onAddWomenOption(true)}
                  onUpdate={onUpdateWomenOption}
                  saveDisabled={!newWomenOption.trim()}
                  items={womenOptions}
                  canDelete={() => true}
                  onDelete={onDeleteWomenOption}
                />
              </Dialog>
            </div>
            <div className={cn('min-w-0', compact ? 'space-y-1' : 'space-y-2')}>
              <Label htmlFor="client-startup">Startup</Label>
              <Dialog open={startupDialogOpen} onOpenChange={setStartupDialogOpen}>
                <LimsFieldWithAdd
                  addButton={
                    <DialogTrigger asChild>
                      <LimsFieldAddButton aria-label="Add startup option" />
                    </DialogTrigger>
                  }
                >
                  <Select
                    value={form.startupStatus || 'No'}
                    onValueChange={(v) => onChange({
                      ...form,
                      startupStatus: v,
                      isStartup: v.trim().toLowerCase() === 'yes',
                    })}
                  >
                    <SelectTrigger id="client-startup">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Array.from(new Set([form.startupStatus, ...startupOptions.map((x) => x.label)].filter((v) => String(v ?? '').trim().length > 0))).map((t) => (
                        <SelectItem key={t} value={t}>{t}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </LimsFieldWithAdd>
                <ClientManageDialogContent
                  open={startupDialogOpen}
                  title="Manage Startup"
                  addLabel="Add Startup"
                  inputId="new-startup-option"
                  placeholder="e.g., Yes"
                  value={newStartupOption}
                  onValueChange={setNewStartupOption}
                  inlineAdd
                  onInlineAdd={() => onAddStartupOption(false)}
                  onSave={() => onAddStartupOption(true)}
                  onUpdate={onUpdateStartupOption}
                  saveDisabled={!newStartupOption.trim()}
                  items={startupOptions}
                  canDelete={() => true}
                  onDelete={onDeleteStartupOption}
                />
              </Dialog>
            </div>
          </div>

          <div className={cn('col-span-12 md:col-span-6', compact ? 'space-y-1' : 'space-y-2')}>
            <div className="flex h-8 items-center">
              <Label htmlFor="office-address" className="text-xs">Office Address</Label>
            </div>
            <Textarea
              id="office-address"
              rows={2}
              placeholder="Enter Office Address"
              value={form.address}
              onChange={(e) => onChange(withSiteAddress(form, 'Registered Office', e.target.value))}
              onBlur={() => {
                const next = toProperTitleCase(form.address)
                if (next !== form.address) onChange(withSiteAddress(form, 'Registered Office', next))
              }}
              className="!h-16 !min-h-16 resize-none rounded-none border border-stone-500 bg-stone-50 px-3 py-1.5 shadow-none focus-visible:border-amber-600 focus-visible:bg-white focus-visible:ring-2 focus-visible:ring-amber-500/20 focus-visible:ring-offset-0"
            />
          </div>
          <div className={cn('col-span-12 md:col-span-6', compact ? 'space-y-1' : 'space-y-2')}>
            <div className="flex h-8 items-center justify-between gap-2">
              <Label htmlFor="factory-address" className="text-xs">Factory Address</Label>
              <label className="inline-flex h-8 shrink-0 items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-stone-600">
                <input
                  type="checkbox"
                  className="h-4 w-4"
                  checked={form.factorySameAsOffice !== false}
                  onChange={(e) => {
                    if (e.target.checked) onChange(withSiteAddress({ ...form, factorySameAsOffice: true }, 'Factory', form.address))
                    else onChange({ ...form, factorySameAsOffice: false })
                  }}
                />
                Same as Office Address
              </label>
            </div>
            <Textarea
              id="factory-address"
              rows={2}
              placeholder="Enter Factory Address"
              disabled={form.factorySameAsOffice !== false}
              value={form.factorySameAsOffice !== false ? form.address : (form.sites.find((site) => site.siteRole === 'Factory')?.address ?? '')}
              onChange={(e) => onChange(withSiteAddress(form, 'Factory', e.target.value))}
              onBlur={() => {
                if (form.factorySameAsOffice !== false) return
                const current = form.sites.find((site) => site.siteRole === 'Factory')?.address ?? ''
                const next = toProperTitleCase(current)
                if (next !== current) onChange(withSiteAddress(form, 'Factory', next))
              }}
              className="!h-16 !min-h-16 resize-none rounded-none border border-stone-500 bg-stone-50 px-3 py-1.5 shadow-none focus-visible:border-amber-600 focus-visible:bg-white focus-visible:ring-2 focus-visible:ring-amber-500/20 focus-visible:ring-offset-0"
            />
          </div>

          <div className={cn('col-span-12 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5', compact ? 'gap-2' : 'gap-x-4 gap-y-3')}>
          <div className={cn('min-w-0', compact ? 'space-y-1' : 'space-y-2')}>
            <Label htmlFor="pin" className="text-xs">PIN Code</Label>
            <Dialog open={pinCodeDialogOpen} onOpenChange={setPinCodeDialogOpen}>
              <LimsFieldWithAdd
                addButton={
                  <DialogTrigger asChild>
                    <LimsFieldAddButton aria-label="Add PIN code" />
                  </DialogTrigger>
                }
              >
                <FilterCombobox
                  value={form.pinCode}
                  onValueChange={(v) => {
                    const pin = v.replace(/[^0-9]/g, '').slice(0, 6)
                    if (pin.length === 6) {
                      applyPinAutoFill(pin)
                    } else {
                      onChange({ ...form, pinCode: pin })
                    }
                  }}
                  options={pinOptions}
                  onSelectOption={(opt) => applyPinAutoFill(opt.label)}
                  open={pinOpen}
                  onOpenChange={setPinOpen}
                  placeholder="PIN Code"
                  listId="client-pin-combobox"
                  inputClassName="h-10"
                />
              </LimsFieldWithAdd>
              <ClientManageDialogContent
                open={pinCodeDialogOpen}
                title="Manage PIN Codes"
                addLabel="Add PIN Code"
                inputId="new-pin"
                placeholder="6 digit PIN"
                value={newPinCode}
                onValueChange={(v) => setNewPinCode(v.replace(/[^0-9]/g, '').slice(0, 6))}
                inputMode="numeric"
                inlineAdd
                onInlineAdd={() => onAddPinCode(false)}
                onSave={() => onAddPinCode(true)}
                onUpdate={onUpdatePinCode}
                saveDisabled={newPinCode.trim().length !== 6}
                items={pinCodes}
                canDelete={() => true}
                onDelete={onDeletePinCode}
              />
            </Dialog>
            {pinError && <p className="text-xs text-destructive">{pinError}</p>}
          </div>

          <div className={cn('min-w-0', compact ? 'space-y-1' : 'space-y-2')}>
            <Label htmlFor="client-city" className="text-xs">City</Label>
            {onAddCity && setCityDialogOpen && setNewCityName && onUpdateCity && onDeleteCity ? (
              <Dialog open={cityDialogOpen} onOpenChange={setCityDialogOpen}>
                <LimsFieldWithAdd
                  addButton={
                    <DialogTrigger asChild>
                      <LimsFieldAddButton aria-label="Add city" />
                    </DialogTrigger>
                  }
                >
                  <FilterCombobox
                    value={form.city}
                    onValueChange={(v) => onChange({ ...form, city: v })}
                    options={cityOptions}
                    onSelectOption={(opt) => onChange({ ...form, city: opt.label })}
                    open={cityOpen}
                    onOpenChange={setCityOpen}
                    placeholder="Type or select City"
                    listId="client-city-combobox"
                    inputId="client-city"
                    inputClassName="h-10"
                  />
                </LimsFieldWithAdd>
                <ClientManageDialogContent
                  open={cityDialogOpen}
                  title="Manage Cities"
                  addLabel="Add City"
                  inputId="new-city"
                  placeholder="Enter City"
                  value={newCityName}
                  onValueChange={setNewCityName}
                  inlineAdd
                  onInlineAdd={() => onAddCity(false)}
                  onSave={() => onAddCity(true)}
                  onUpdate={onUpdateCity}
                  saveDisabled={!newCityName.trim()}
                  items={cities}
                  canDelete={() => true}
                  onDelete={onDeleteCity}
                />
              </Dialog>
            ) : (
              <Input
                id="client-city"
                placeholder="City"
                value={form.city}
                onChange={(e) => onChange({ ...form, city: e.target.value })}
              />
            )}
          </div>

          <div className={cn('min-w-0', compact ? 'space-y-1' : 'space-y-2')}>
            <Label htmlFor="district" className="text-xs">District</Label>
            <Dialog open={districtDialogOpen} onOpenChange={setDistrictDialogOpen}>
              <LimsFieldWithAdd
                addButton={
                  <DialogTrigger asChild>
                    <LimsFieldAddButton aria-label="Add district" />
                  </DialogTrigger>
                }
              >
                <FilterCombobox
                  value={form.district}
                  onValueChange={(v) => onChange({ ...form, district: v })}
                  options={districtOptions}
                  onSelectOption={(opt) => onChange({ ...form, district: opt.label })}
                  open={districtOpen}
                  onOpenChange={setDistrictOpen}
                  placeholder="Type or select District"
                  listId="client-district-combobox"
                  inputId="district"
                  inputClassName="h-10"
                />
              </LimsFieldWithAdd>
              <ClientManageDialogContent
                open={districtDialogOpen}
                title="Manage Districts"
                addLabel="Add District"
                inputId="new-district"
                placeholder="Enter District"
                value={newDistrictName}
                onValueChange={setNewDistrictName}
                inlineAdd
                onInlineAdd={() => onAddDistrict(false)}
                onSave={() => onAddDistrict(true)}
                onUpdate={onUpdateDistrict}
                saveDisabled={!newDistrictName.trim()}
                items={districts}
                canDelete={() => true}
                onDelete={onDeleteDistrict}
              />
            </Dialog>
          </div>

          <div className={cn('min-w-0', compact ? 'space-y-1' : 'space-y-2')}>
            <Label htmlFor="state" className="text-xs">State</Label>
            <Dialog open={stateDialogOpen} onOpenChange={setStateDialogOpen}>
              <LimsFieldWithAdd
                addButton={
                  <DialogTrigger asChild>
                    <LimsFieldAddButton aria-label="Add state" />
                  </DialogTrigger>
                }
              >
                <FilterCombobox
                  value={form.state}
                  onValueChange={(v) => onChange({ ...form, state: v })}
                  options={stateOptions}
                  onSelectOption={(opt) => onChange({ ...form, state: opt.label })}
                  open={stateOpen}
                  onOpenChange={setStateOpen}
                  placeholder="Type or select State"
                  listId="client-state-combobox"
                  inputId="state"
                  inputClassName="h-10"
                />
              </LimsFieldWithAdd>
              <ClientManageDialogContent
                open={stateDialogOpen}
                title="Manage States"
                addLabel="Add State"
                inputId="new-state"
                placeholder="Enter state"
                value={newStateName}
                onValueChange={setNewStateName}
                inlineAdd
                onInlineAdd={() => onAddState(false)}
                onSave={() => onAddState(true)}
                onUpdate={onUpdateState}
                saveDisabled={!newStateName.trim()}
                items={states}
                canDelete={() => true}
                onDelete={onDeleteState}
              />
            </Dialog>
          </div>

          <div className={cn('min-w-0', compact ? 'space-y-1' : 'space-y-2')}>
            <Label htmlFor="country" className="text-xs">Country</Label>
            <Dialog open={countryDialogOpen} onOpenChange={setCountryDialogOpen}>
              <LimsFieldWithAdd
                addButton={
                  <DialogTrigger asChild>
                    <LimsFieldAddButton aria-label="Add country" />
                  </DialogTrigger>
                }
              >
                <Select value={form.country} onValueChange={(v) => onChange({ ...form, country: v })}>
                  <SelectTrigger id="country">
                    <SelectValue placeholder="Select country" />
                  </SelectTrigger>
                  <SelectContent>
                    {countryChoices.map((label) => (
                      <SelectItem key={label} value={label}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </LimsFieldWithAdd>
              <ClientManageDialogContent
                open={countryDialogOpen}
                title="Manage Countries"
                addLabel="Add Country"
                inputId="new-country"
                placeholder="Enter country"
                value={newCountryName}
                onValueChange={setNewCountryName}
                inlineAdd
                onInlineAdd={() => onAddCountry(false)}
                onSave={() => onAddCountry(true)}
                onUpdate={onUpdateCountry}
                saveDisabled={!newCountryName.trim()}
                items={countries}
                canDelete={() => true}
                onDelete={onDeleteCountry}
              />
            </Dialog>
          </div>
          </div>

          <div className={cn('col-span-12 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4', compact ? 'gap-2' : 'gap-x-4 gap-y-3 sm:gap-y-4')}>
            <div className={cn('flex min-w-0 flex-col', compact ? 'space-y-1' : 'space-y-2')}>
              <Label htmlFor="client-landline">Landline</Label>
              <Input
                id="client-landline"
                inputMode="tel"
                value={form.landline}
                onChange={(e) => onChange({ ...form, landline: e.target.value })}
              />
            </div>
            <div className={cn('flex min-w-0 flex-col', compact ? 'space-y-1' : 'space-y-2')}>
              <Label htmlFor="contact-person">Name of the Contact Person</Label>
              <Input
                id="contact-person"
                placeholder="Enter Contact Person Name"
                value={form.contactPersonName}
                onChange={(e) => onChange({ ...form, contactPersonName: e.target.value })}
                className="h-10"
              />
            </div>

            <div className={cn('flex min-w-0 flex-col', compact ? 'space-y-1' : 'space-y-2')}>
              <Label>Mobile Number</Label>
              <Dialog open={countryCodeDialogOpen} onOpenChange={setCountryCodeDialogOpen}>
                <LimsFieldWithAdd
                  addButton={
                    <DialogTrigger asChild>
                      <LimsFieldAddButton aria-label="Add country code" />
                    </DialogTrigger>
                  }
                >
                  <div className="flex h-10 gap-2">
                    <div className="w-20 shrink-0">
                      <FilterCombobox
                        value={form.countryCode}
                        onValueChange={(v) => onChange({ ...form, countryCode: v })}
                        options={countryCodeOptions}
                        onSelectOption={(opt) => onChange({ ...form, countryCode: opt.id })}
                        open={countryCodeOpen}
                        onOpenChange={setCountryCodeOpen}
                        placeholder="+91"
                        listId="client-country-code-combobox"
                        inputId="country-code"
                        inputClassName="h-10 px-1.5 text-sm"
                      />
                    </div>
                    <Input
                      inputMode="numeric"
                      placeholder="10 Digit Mobile Number"
                      value={form.mobile}
                      onChange={(e) =>
                        onChange({
                          ...form,
                          mobile: e.target.value.replace(/[^0-9]/g, '').slice(0, 10),
                        })
                      }
                      className="min-w-0 flex-[1_1_0%] grow"
                    />
                  </div>
                </LimsFieldWithAdd>
                <ClientManageDialogContent
                  open={countryCodeDialogOpen}
                  title="Manage Country Codes"
                  addLabel="Add Country Code"
                  inputId="new-country-code"
                  placeholder="e.g., +44"
                  value={newCountryCode}
                  onValueChange={setNewCountryCode}
                  inlineAdd
                  onInlineAdd={() => onAddCountryCode(false)}
                  onSave={() => onAddCountryCode(true)}
                  onUpdate={onUpdateCountryCode}
                  saveDisabled={!newCountryCode.trim()}
                  items={countryCodes}
                  canDelete={() => true}
                  onDelete={onDeleteCountryCode}
                  getEditValue={(c) => countryCodes.find((x) => x.id === c.id)?.value ?? c.label}
                />
              </Dialog>
              {mobileError ? <p className="text-xs text-destructive">{mobileError}</p> : null}
            </div>

            <div className={cn('flex min-w-0 flex-col', compact ? 'space-y-1' : 'space-y-2')}>
              <Label htmlFor="email">Email ID</Label>
              <Input
                id="email"
                type="email"
                placeholder="Enter Email ID"
                value={form.email}
                onChange={(e) => onChange({ ...form, email: e.target.value })}
                className="h-10"
              />
              {emailError ? <p className="text-xs text-destructive">{emailError}</p> : null}
            </div>
          </div>

          <div className={cn('col-span-12 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4', compact ? 'gap-2' : 'gap-x-4 gap-y-3 sm:gap-y-4')}>
            <div className={cn('flex min-w-0 flex-col', compact ? 'space-y-1' : 'space-y-2')}>
              <Label htmlFor="opening-balance">Opening Balance</Label>
              <div className="flex h-10 gap-2">
                <OpeningBalanceField
                  value={form.openingBalance}
                  onChange={(openingBalance) => onChange({ ...form, openingBalance })}
                />
                <div className="w-24 shrink-0">
                  <Select value={form.balanceType} onValueChange={(v) => onChange({ ...form, balanceType: v as BalanceType })}>
                    <SelectTrigger aria-label="Cr/Dr" className="h-10 rounded-none">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {BALANCE_TYPES.map((t) => (
                        <SelectItem key={t} value={t}>
                          {t}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            <div className={cn('flex min-w-0 flex-col', compact ? 'space-y-1' : 'space-y-2')}>
              <Label htmlFor="payment-term">Payment Term</Label>
              <Dialog open={paymentTermDialogOpen} onOpenChange={setPaymentTermDialogOpen}>
                <LimsFieldWithAdd
                  addButton={
                    <DialogTrigger asChild>
                      <LimsFieldAddButton aria-label="Add payment term" />
                    </DialogTrigger>
                  }
                >
                  <FilterCombobox
                    value={form.paymentTerm}
                    onValueChange={(v) => onChange({ ...form, paymentTerm: v as PaymentTerm })}
                    options={paymentTermOptions}
                    onSelectOption={(opt) => onChange({ ...form, paymentTerm: opt.label as PaymentTerm })}
                    open={paymentTermOpen}
                    onOpenChange={setPaymentTermOpen}
                    placeholder="Type or select Payment Term"
                    listId="client-payment-term-combobox"
                    inputId="payment-term"
                    inputClassName="h-10"
                  />
                </LimsFieldWithAdd>
                <ClientManageDialogContent
                  open={paymentTermDialogOpen}
                  title="Manage Payment Terms"
                  addLabel="Add Payment Term"
                  inputId="new-payment-term"
                  placeholder="e.g., 90 Days"
                  value={newPaymentTerm}
                  onValueChange={setNewPaymentTerm}
                  inlineAdd
                  onInlineAdd={() => onAddPaymentTerm(false)}
                  onSave={() => onAddPaymentTerm(true)}
                  onUpdate={onUpdatePaymentTerm}
                  saveDisabled={!newPaymentTerm.trim()}
                  items={paymentTerms}
                  canDelete={() => true}
                  onDelete={onDeletePaymentTerm}
                />
              </Dialog>
            </div>

            <div className={cn('flex min-w-0 flex-col', compact ? 'space-y-1' : 'space-y-2')}>
              <Label htmlFor="client-longitude">Longitude</Label>
              <LimsFieldWithAdd
                className={cn(longitudeError && '!border-red-600 !bg-red-50 focus-within:!border-red-600 focus-within:!ring-red-500/30')}
                addButton={<MapsSearchLink companyName={form.companyName} />}
              >
                <Input
                  id="client-longitude"
                  inputMode="decimal"
                  placeholder="Longitude"
                  value={form.longitude}
                  onChange={(e) => {
                    const coordinates = parsePastedClientCoordinates(e.target.value)
                    onChange(coordinates ? { ...form, ...coordinates } : { ...form, longitude: e.target.value.replace(/[^0-9.-]/g, '') })
                  }}
                  onPaste={(event) => {
                    const clipboard = event.clipboardData
                    const coordinates = parsePastedClientCoordinates(
                      clipboard.getData('text/plain') || clipboard.getData('text'),
                    )
                    if (!coordinates) return
                    event.preventDefault()
                    onChange({ ...form, ...coordinates })
                  }}
                  aria-invalid={Boolean(longitudeError)}
                  className="h-full border-0 bg-transparent shadow-none focus-visible:border-transparent focus-visible:bg-transparent focus-visible:ring-0"
                />
              </LimsFieldWithAdd>
              {longitudeError ? <p className="text-xs text-destructive">{longitudeError}</p> : null}
            </div>

            <div className={cn('flex min-w-0 flex-col', compact ? 'space-y-1' : 'space-y-2')}>
              <Label htmlFor="client-latitude">Latitude</Label>
              <LimsFieldWithAdd
                className={cn(latitudeError && '!border-red-600 !bg-red-50 focus-within:!border-red-600 focus-within:!ring-red-500/30')}
                addButton={<MapsSearchLink companyName={form.companyName} />}
              >
                <Input
                  id="client-latitude"
                  inputMode="decimal"
                  placeholder="Latitude"
                  value={form.latitude}
                  onChange={(e) => {
                    const coordinates = parsePastedClientCoordinates(e.target.value)
                    onChange(coordinates ? { ...form, ...coordinates } : { ...form, latitude: e.target.value.replace(/[^0-9.-]/g, '') })
                  }}
                  onPaste={(event) => {
                    const clipboard = event.clipboardData
                    const coordinates = parsePastedClientCoordinates(
                      clipboard.getData('text/plain') || clipboard.getData('text'),
                    )
                    if (!coordinates) return
                    event.preventDefault()
                    onChange({ ...form, ...coordinates })
                  }}
                  aria-invalid={Boolean(latitudeError)}
                  className="h-full border-0 bg-transparent shadow-none focus-visible:border-transparent focus-visible:bg-transparent focus-visible:ring-0"
                />
              </LimsFieldWithAdd>
              {latitudeError ? <p className="text-xs text-destructive">{latitudeError}</p> : null}
            </div>
          </div>

          <div className={cn('col-span-12 grid grid-cols-1 sm:grid-cols-2', compact ? 'gap-2' : 'gap-x-4 gap-y-3 sm:gap-y-4')}>
            <div className={cn('flex min-w-0 flex-col', compact ? 'space-y-1' : 'space-y-2')}>
              <Label htmlFor="client-manak-user">Manak Online User ID</Label>
              <Input
                id="client-manak-user"
                autoComplete="off"
                placeholder="Email ID or Other User ID"
                value={form.manakUserId}
                onChange={(e) => onChange({ ...form, manakUserId: e.target.value })}
                className="h-10"
              />
            </div>
            <div className={cn('flex min-w-0 flex-col', compact ? 'space-y-1' : 'space-y-2')}>
              <Label htmlFor="client-manak-pass">Password</Label>
              {form.clearManakPassword ? (
                <div className="flex h-10 min-w-0 items-stretch overflow-hidden border border-amber-600 bg-amber-50 text-amber-950 focus-within:ring-2 focus-within:ring-amber-500/20">
                  <p className="flex min-w-0 flex-1 items-center px-3 text-sm">
                    Will be removed on Save
                  </p>
                  <button
                    type="button"
                    className="shrink-0 border-l border-amber-600 bg-amber-100 px-3 text-sm hover:bg-amber-200"
                    onClick={() => onChange({ ...form, clearManakPassword: false, manakPassword: '' })}
                  >
                    Undo
                  </button>
                </div>
              ) : showSavedPassword ? (
                <div className="space-y-1">
                  <div className="flex h-10 min-w-0 items-stretch overflow-hidden border border-stone-500 bg-stone-50 text-foreground focus-within:border-amber-600 focus-within:ring-2 focus-within:ring-amber-500/20">
                    <Input
                      id="client-manak-pass"
                      readOnly
                      type={revealedPassword ? 'text' : 'password'}
                      value={revealedPassword ?? 'saved-encrypted'}
                      autoComplete="off"
                      spellCheck={false}
                      aria-label={revealedPassword ? 'Viewed Manak password' : 'Saved encrypted password'}
                      className="h-full min-w-0 flex-1 select-none rounded-none border-0 bg-transparent shadow-none focus-visible:ring-0"
                      onCopy={blockPasswordCopy}
                      onCut={blockPasswordCopy}
                      onKeyDown={blockPasswordCopy}
                      onContextMenu={blockPasswordCopy}
                    />
                    <div className="flex shrink-0 items-stretch">
                      <button
                        type="button"
                        disabled={!isAdmin}
                        title={isAdmin ? 'Change saved password' : 'Only an administrator can change the saved password'}
                        className="border-l border-stone-500 bg-stone-100 px-2 text-xs font-medium hover:bg-amber-500/15 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-stone-100"
                        onClick={() => {
                          setRevealedPassword(null)
                          setRevealSeconds(0)
                          setChangingPassword(true)
                          onChange({ ...form, manakPassword: '', clearManakPassword: false })
                        }}
                      >
                        Change
                      </button>
                      <button
                        type="button"
                        disabled={!isAdmin}
                        title={isAdmin ? 'Clear saved password' : 'Only an administrator can clear the saved password'}
                        className="border-l border-stone-500 bg-stone-100 px-2 text-xs font-medium hover:bg-amber-500/15 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-stone-100"
                        onClick={() => onChange({ ...form, clearManakPassword: true, manakPassword: '' })}
                      >
                        Clear
                      </button>
                      <button
                        type="button"
                        disabled={!isAdmin}
                        title={isAdmin ? 'View saved password' : 'Only an administrator can view the saved password'}
                        className="inline-flex items-center gap-1 border-l border-stone-500 bg-stone-100 px-2 text-xs font-medium hover:bg-amber-500/15 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-stone-100"
                        onClick={viewPassword}
                      >
                        <Eye className="h-3.5 w-3.5" aria-hidden />
                        View
                      </button>
                    </div>
                  </div>
                  {revealedPassword ? (
                    <p className="text-xs font-medium text-amber-900">Hides in {revealSeconds}s</p>
                  ) : null}
                </div>
              ) : (
                <Input
                  id="client-manak-pass"
                  type="password"
                  autoComplete="new-password"
                  spellCheck={false}
                  placeholder={recordId ? 'Not set' : ''}
                  value={form.manakPassword}
                  onChange={(e) => onChange({ ...form, manakPassword: e.target.value })}
                  className="h-10 select-none"
                  onCopy={blockPasswordCopy}
                  onCut={blockPasswordCopy}
                  onKeyDown={blockPasswordCopy}
                  onContextMenu={blockPasswordCopy}
                />
              )}
            </div>
          </div>
        </div>
      </div>
      {hasDocTable && onUploadCertificate && onUpdateCertificate && onDeleteCertificate && onOpenCertificate ? (
        <div className="mt-5">
          <ClientIdentitySections
            certificates={certificates}
            gstNumber={form.gstNumber}
            onGstNumberChange={applyGstNumber}
            pan={form.pan}
            onPanChange={(value) => onChange({ ...form, pan: value, panFromGstin: false })}
            onUploadCertificate={onUploadCertificate}
            onUpdateCertificate={onUpdateCertificate}
            onDeleteCertificate={onDeleteCertificate}
            onOpenCertificate={onOpenCertificate}
          />
        </div>
      ) : null}
      {!hideFooter ? (
        <div className="sticky bottom-0 z-10 -mx-3 mt-3 flex flex-wrap items-center justify-end gap-2 border-t border-stone-300 bg-white/95 px-3 py-2.5 shadow-[0_-4px_12px_rgba(28,25,23,0.08)] backdrop-blur sm:-mx-5 sm:px-5 md:-mx-6 md:px-6">
          {form.panFromGstin ? <span className="mr-auto text-xs text-stone-600">PAN from GSTIN</span> : null}
          <Button
            type="button"
            className="h-10 min-h-10 rounded-none bg-amber-700 px-4 text-sm text-white shadow-sm hover:bg-amber-800"
            onClick={onSave}
            disabled={!canSave || saveLoading}
          >
            {saveLoading ? 'Saving…' : 'Save & Close'}
          </Button>
          {!canSave && !saveLoading ? (
            <p className="basis-full text-right text-xs text-red-700" role="status">
              {!form.companyName.trim()
                ? 'Company name is required before saving.'
                : 'Correct the highlighted fields before saving.'}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
