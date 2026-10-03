import { Save, Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { FileUpload } from '@/components/ui/file-upload'
import { Card, CardContent } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { EMAIL_INPUT_PATTERN } from '@/lib/validation'
import type { OptionItem } from './types'

type LaboratoryDetailsTabProps = {
  labName: string
  setLabName: (value: string) => void
  gstNumber: string
  setGstNumber: (value: string) => void
  contactPersonName: string
  setContactPersonName: (value: string) => void
  mobile: string
  setMobile: (value: string) => void
  email: string
  setEmail: (value: string) => void
  website: string
  setWebsite: (value: string) => void
  address: string
  setAddress: (value: string) => void
  pinCode: string
  setPinCode: (value: string) => void
  district: string
  setDistrict: (value: string) => void
  selectedLabType: string
  setSelectedLabType: (value: string) => void
  labTypes: OptionItem[]
  setLabTypes: React.Dispatch<React.SetStateAction<OptionItem[]>>
  selectedLabScale: string
  setSelectedLabScale: (value: string) => void
  labScales: OptionItem[]
  setLabScales: React.Dispatch<React.SetStateAction<OptionItem[]>>
  selectedDesignation: string
  setSelectedDesignation: (value: string) => void
  designations: OptionItem[]
  setDesignations: React.Dispatch<React.SetStateAction<OptionItem[]>>
  selectedCountryCode: string
  setSelectedCountryCode: (value: string) => void
  countryCodes: OptionItem[]
  setCountryCodes: React.Dispatch<React.SetStateAction<OptionItem[]>>
  selectedState: string
  setSelectedState: (value: string) => void
  states: OptionItem[]
  setStates: React.Dispatch<React.SetStateAction<OptionItem[]>>
  selectedCountry: string
  setSelectedCountry: (value: string) => void
  countries: OptionItem[]
  setCountries: React.Dispatch<React.SetStateAction<OptionItem[]>>
  companyLogoPath: string | null
  setCompanyLogoPath: (value: string | null) => void
  sealSignPath: string | null
  setSealSignPath: (value: string | null) => void
  saveLoading: boolean
  saveMessage: string | null
  onSave: () => void
}

export function LaboratoryDetailsTab(props: LaboratoryDetailsTabProps) {
  const [labTypeDialogOpen, setLabTypeDialogOpen] = React.useState(false)
  const [newLabType, setNewLabType] = React.useState('')
  const [labScaleDialogOpen, setLabScaleDialogOpen] = React.useState(false)
  const [newLabScale, setNewLabScale] = React.useState('')
  const [designationDialogOpen, setDesignationDialogOpen] = React.useState(false)
  const [newDesignation, setNewDesignation] = React.useState('')
  const [countryCodeDialogOpen, setCountryCodeDialogOpen] = React.useState(false)
  const [newCountryCode, setNewCountryCode] = React.useState('')
  const [stateDialogOpen, setStateDialogOpen] = React.useState(false)
  const [newState, setNewState] = React.useState('')
  const [countryDialogOpen, setCountryDialogOpen] = React.useState(false)
  const [newCountry, setNewCountry] = React.useState('')

  const handleAddLabType = () => {
    if (!newLabType.trim()) return
    const value = newLabType.toLowerCase().replace(/\s+/g, '-')
    props.setLabTypes((prev) => [...prev, { value, label: newLabType.trim() }])
    props.setSelectedLabType(value)
    setNewLabType('')
    setLabTypeDialogOpen(false)
  }

  const handleDeleteLabType = (value: string) => {
    props.setLabTypes((prev) => prev.filter((type) => type.value !== value))
    if (props.selectedLabType === value && props.labTypes.length > 1) {
      const next = props.labTypes.find((type) => type.value !== value)
      if (next) props.setSelectedLabType(next.value)
    }
  }

  const handleAddLabScale = () => {
    if (!newLabScale.trim()) return
    const value = newLabScale.toLowerCase().replace(/\s+/g, '-')
    props.setLabScales((prev) => [...prev, { value, label: newLabScale.trim() }])
    props.setSelectedLabScale(value)
    setNewLabScale('')
    setLabScaleDialogOpen(false)
  }

  const handleDeleteLabScale = (value: string) => {
    props.setLabScales((prev) => prev.filter((scale) => scale.value !== value))
    if (props.selectedLabScale === value && props.labScales.length > 1) {
      const next = props.labScales.find((scale) => scale.value !== value)
      if (next) props.setSelectedLabScale(next.value)
    }
  }

  const handleAddDesignation = () => {
    if (!newDesignation.trim()) return
    const value = newDesignation.toLowerCase().replace(/\s+/g, '-')
    props.setDesignations((prev) => [...prev, { value, label: newDesignation.trim() }])
    props.setSelectedDesignation(value)
    setNewDesignation('')
    setDesignationDialogOpen(false)
  }

  const handleDeleteDesignation = (value: string) => {
    props.setDesignations((prev) => prev.filter((designation) => designation.value !== value))
    if (props.selectedDesignation === value && props.designations.length > 1) {
      const next = props.designations.find((designation) => designation.value !== value)
      if (next) props.setSelectedDesignation(next.value)
    }
  }

  const handleAddCountryCode = () => {
    if (!newCountryCode.trim()) return
    const formatted = newCountryCode.startsWith('+') ? newCountryCode : `+${newCountryCode}`
    const value = formatted
    props.setCountryCodes((prev) => [...prev, { value, label: `${formatted}` }])
    props.setSelectedCountryCode(value)
    setNewCountryCode('')
    setCountryCodeDialogOpen(false)
  }

  const handleDeleteCountryCode = (value: string) => {
    props.setCountryCodes((prev) => prev.filter((code) => code.value !== value))
    if (props.selectedCountryCode === value && props.countryCodes.length > 1) {
      const next = props.countryCodes.find((code) => code.value !== value)
      if (next) props.setSelectedCountryCode(next.value)
    }
  }

  const handleAddState = () => {
    if (!newState.trim()) return
    const value = newState.toLowerCase().replace(/\s+/g, '-')
    props.setStates((prev) => [...prev, { value, label: newState.trim() }])
    props.setSelectedState(value)
    setNewState('')
    setStateDialogOpen(false)
  }

  const handleDeleteState = (value: string) => {
    props.setStates((prev) => prev.filter((state) => state.value !== value))
    if (props.selectedState === value && props.states.length > 1) {
      const next = props.states.find((state) => state.value !== value)
      if (next) props.setSelectedState(next.value)
    }
  }

  const handleAddCountry = () => {
    if (!newCountry.trim()) return
    const value = newCountry.toLowerCase().replace(/\s+/g, '-')
    props.setCountries((prev) => [...prev, { value, label: newCountry.trim() }])
    props.setSelectedCountry(value)
    setNewCountry('')
    setCountryDialogOpen(false)
  }

  const handleDeleteCountry = (value: string) => {
    props.setCountries((prev) => prev.filter((country) => country.value !== value))
    if (props.selectedCountry === value && props.countries.length > 1) {
      const next = props.countries.find((country) => country.value !== value)
      if (next) props.setSelectedCountry(next.value)
    }
  }

  return (
    <Card>
      <CardContent className="space-y-6">
        <div className="flex items-center justify-end gap-3 pt-4">
          {props.saveMessage && (
            <p className={props.saveMessage.toLowerCase().includes('saved') ? 'text-sm text-emerald-700' : 'text-sm text-destructive'}>
              {props.saveMessage}
            </p>
          )}
          <Button className="gap-2" onClick={props.onSave} disabled={props.saveLoading}>
            <Save size={16} />
            {props.saveLoading ? 'Saving…' : 'Save'}
          </Button>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:gap-6 items-end mt-4">
          <div className="min-w-0 space-y-2">
            <div className="flex items-center min-h-[20px]">
              <Label htmlFor="lab-name">Name of the Laboratory</Label>
            </div>
            <Input
              id="lab-name"
              className="w-full"
              placeholder="Enter Laboratory Name"
              value={props.labName}
              onChange={(e) => props.setLabName(e.target.value)}
            />
          </div>
          <div className="min-w-0 space-y-2">
            <div className="flex items-center min-h-[20px]">
              <Label htmlFor="lab-gst-number">GST Number</Label>
            </div>
            <Input
              id="lab-gst-number"
              className="w-full uppercase"
              placeholder="e.g. 22AAAAA0000A1Z5"
              value={props.gstNumber}
              onChange={(e) => props.setGstNumber(e.target.value.toUpperCase())}
              maxLength={15}
              autoComplete="off"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 xl:gap-6 items-end mt-4">
          <div className="min-w-0 space-y-2 xl:col-span-1">
            <div className="flex items-center justify-between gap-2 min-h-[20px]">
              <Label htmlFor="lab-type" className="shrink-0">Laboratory Type</Label>
              <Dialog open={labTypeDialogOpen} onOpenChange={setLabTypeDialogOpen}>
                <DialogTrigger asChild>
                  <button type="button" className="shrink-0 text-xs font-medium text-primary flex items-center gap-1 hover:underline whitespace-nowrap">
                    <Plus size={12} />
                    Add New Type
                  </button>
                </DialogTrigger>
                <DialogContent aria-describedby={undefined}>
                  <DialogHeader>
                    <DialogTitle>Add New Laboratory Type</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="new-lab-type">Type Name</Label>
                      <Input
                        id="new-lab-type"
                        value={newLabType}
                        onChange={(e) => setNewLabType(e.target.value)}
                        placeholder="e.g., Environmental Testing"
                      />
                    </div>
                    <div>
                      <p className="text-xs font-medium text-muted-foreground mb-2">Existing Types</p>
                      <div className="space-y-1">
                        {props.labTypes.map((type) => (
                          <div
                            key={type.value}
                            className="flex items-center justify-between rounded-md border border-border px-3 py-1 text-sm"
                          >
                            <span>{type.label}</span>
                            {props.labTypes.length > 1 && (
                              <button
                                type="button"
                                onClick={() => handleDeleteLabType(type.value)}
                                className="text-destructive hover:text-destructive/80"
                              >
                                <Trash2 size={14} />
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                  <DialogFooter>
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => {
                        setNewLabType('')
                        setLabTypeDialogOpen(false)
                      }}
                    >
                      Cancel
                    </Button>
                    <Button type="button" onClick={handleAddLabType} disabled={!newLabType.trim()}>
                      Save Type
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
            <Select value={props.selectedLabType} onValueChange={props.setSelectedLabType}>
              <SelectTrigger id="lab-type" className="w-full">
                <SelectValue placeholder="Select laboratory type" />
              </SelectTrigger>
              <SelectContent>
                {props.labTypes.map((type) => (
                  <SelectItem key={type.value} value={type.value}>
                    {type.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="min-w-0 space-y-2 xl:col-span-1">
            <div className="flex items-center justify-between gap-2 min-h-[20px]">
              <Label htmlFor="lab-scale" className="shrink-0">Laboratory Scale</Label>
              <Dialog open={labScaleDialogOpen} onOpenChange={setLabScaleDialogOpen}>
                <DialogTrigger asChild>
                  <button type="button" className="shrink-0 text-xs font-medium text-primary flex items-center gap-1 hover:underline whitespace-nowrap">
                    <Plus size={12} />
                    Add New Scale
                  </button>
                </DialogTrigger>
                <DialogContent aria-describedby={undefined}>
                  <DialogHeader>
                    <DialogTitle>Add New Laboratory Scale</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="new-lab-scale">Scale Name</Label>
                      <Input
                        id="new-lab-scale"
                        value={newLabScale}
                        onChange={(e) => setNewLabScale(e.target.value)}
                        placeholder="e.g., Mega Facility"
                      />
                    </div>
                    <div>
                      <p className="text-xs font-medium text-muted-foreground mb-2">Existing Scales</p>
                      <div className="space-y-1">
                        {props.labScales.map((scale) => (
                          <div
                            key={scale.value}
                            className="flex items-center justify-between rounded-md border border-border px-3 py-1 text-sm"
                          >
                            <span>{scale.label}</span>
                            {props.labScales.length > 1 && (
                              <button
                                type="button"
                                onClick={() => handleDeleteLabScale(scale.value)}
                                className="text-destructive hover:text-destructive/80"
                              >
                                <Trash2 size={14} />
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                  <DialogFooter>
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => {
                        setNewLabScale('')
                        setLabScaleDialogOpen(false)
                      }}
                    >
                      Cancel
                    </Button>
                    <Button type="button" onClick={handleAddLabScale} disabled={!newLabScale.trim()}>
                      Save Scale
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
            <Select value={props.selectedLabScale} onValueChange={props.setSelectedLabScale}>
              <SelectTrigger id="lab-scale" className="w-full">
                <SelectValue placeholder="Select laboratory scale" />
              </SelectTrigger>
              <SelectContent>
                {props.labScales.map((scale) => (
                  <SelectItem key={scale.value} value={scale.value}>
                    {scale.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

        </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 xl:gap-6 items-end lg:col-span-4">
            <div className="min-w-0 space-y-2">
              <div className="flex items-center min-h-[20px]">
                <Label htmlFor="contact-person">Contact Person Name</Label>
              </div>
              <Input
                id="contact-person"
                className="w-full"
                placeholder="Enter Contact Person Name"
                value={props.contactPersonName}
                onChange={(e) => props.setContactPersonName(e.target.value)}
              />
            </div>

            <div className="min-w-0 space-y-2">
              <div className="flex items-center justify-between gap-2 min-h-[20px]">
                <Label htmlFor="contact-designation" className="shrink-0">Designation</Label>
                <Dialog open={designationDialogOpen} onOpenChange={setDesignationDialogOpen}>
                  <DialogTrigger asChild>
                    <button type="button" className="shrink-0 text-xs font-medium text-primary flex items-center gap-1 hover:underline whitespace-nowrap">
                      <Plus size={12} />
                      Add New Designation
                    </button>
                  </DialogTrigger>
                  <DialogContent aria-describedby={undefined}>
                    <DialogHeader>
                      <DialogTitle>Add New Designation</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <Label htmlFor="new-designation">Designation Name</Label>
                        <Input
                          id="new-designation"
                          value={newDesignation}
                          onChange={(e) => setNewDesignation(e.target.value)}
                          placeholder="e.g., Compliance Officer"
                        />
                      </div>
                      <div>
                        <p className="text-xs font-medium text-muted-foreground mb-2">Existing Designations</p>
                        <div className="space-y-1">
                          {props.designations.map((designation) => (
                            <div
                              key={designation.value}
                              className="flex items-center justify-between rounded-md border border-border px-3 py-1 text-sm"
                            >
                              <span>{designation.label}</span>
                              {props.designations.length > 1 && (
                                <button
                                  type="button"
                                  onClick={() => handleDeleteDesignation(designation.value)}
                                  className="text-destructive hover:text-destructive/80"
                                >
                                  <Trash2 size={14} />
                                </button>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                    <DialogFooter>
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={() => {
                          setNewDesignation('')
                          setDesignationDialogOpen(false)
                        }}
                      >
                        Cancel
                      </Button>
                      <Button type="button" onClick={handleAddDesignation} disabled={!newDesignation.trim()}>
                        Save Designation
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </div>
              <Select value={props.selectedDesignation} onValueChange={props.setSelectedDesignation}>
                <SelectTrigger id="contact-designation" className="w-full">
                  <SelectValue placeholder="Select designation" />
                </SelectTrigger>
                <SelectContent>
                  {props.designations.map((designation) => (
                    <SelectItem key={designation.value} value={designation.value}>
                      {designation.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="min-w-0 space-y-2">
              <div className="flex items-center justify-between gap-2 min-h-[20px]">
                <Label htmlFor="mobile" className="shrink-0">Mobile Number</Label>
                <Dialog open={countryCodeDialogOpen} onOpenChange={setCountryCodeDialogOpen}>
                  <DialogTrigger asChild>
                    <button type="button" className="shrink-0 text-xs font-medium text-primary flex items-center gap-1 hover:underline whitespace-nowrap">
                      <Plus size={12} />
                      Manage Codes
                    </button>
                  </DialogTrigger>
                  <DialogContent aria-describedby={undefined}>
                    <DialogHeader>
                      <DialogTitle>Add Country Code</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <Label htmlFor="new-country-code">Country Code</Label>
                        <Input
                          id="new-country-code"
                          value={newCountryCode}
                          onChange={(e) => setNewCountryCode(e.target.value)}
                          placeholder="e.g., +44"
                        />
                      </div>
                      <div>
                        <p className="text-xs font-medium text-muted-foreground mb-2">Existing Codes</p>
                        <div className="space-y-1 max-h-40 overflow-auto">
                          {props.countryCodes.map((code) => (
                            <div
                              key={code.value}
                              className="flex items-center justify-between rounded-md border border-border px-3 py-1 text-sm"
                            >
                              <span>{code.label}</span>
                              {props.countryCodes.length > 1 && (
                                <button
                                  type="button"
                                  onClick={() => handleDeleteCountryCode(code.value)}
                                  className="text-destructive hover:text-destructive/80"
                                >
                                  <Trash2 size={14} />
                                </button>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                    <DialogFooter>
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={() => {
                          setNewCountryCode('')
                          setCountryCodeDialogOpen(false)
                        }}
                      >
                        Cancel
                      </Button>
                      <Button type="button" onClick={handleAddCountryCode} disabled={!newCountryCode.trim()}>
                        Save Code
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </div>
              <div className="grid w-full grid-cols-3 gap-2">
                <div>
                  <Select value={props.selectedCountryCode} onValueChange={props.setSelectedCountryCode}>
                    <SelectTrigger id="country-code" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {props.countryCodes.map((code) => (
                        <SelectItem key={code.value} value={code.value}>
                          {code.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Input
                  id="mobile"
                  type="tel"
                  placeholder="Enter Mobile Number"
                  className="col-span-2"
                  value={props.mobile}
                  onChange={(e) => props.setMobile(e.target.value)}
                  maxLength={10}
                  minLength={10}
                  pattern="\d{10}"
                  inputMode="numeric"
                  title="Enter a 10-digit mobile number"
                />
              </div>
            </div>

            <div className="min-w-0 space-y-2">
              <div className="flex items-center min-h-[20px]">
                <Label htmlFor="email">Email ID</Label>
              </div>
              <Input
                id="email"
                className="w-full"
                type="email"
                placeholder="Enter Email Address"
                pattern={EMAIL_INPUT_PATTERN}
                value={props.email}
                onChange={(e) => props.setEmail(e.target.value)}
                title="Enter a valid email address"
              />
            </div>
          </div>

        <div className="min-w-0 max-w-xl space-y-2">
          <Label htmlFor="website">Website</Label>
          <Input
            id="website"
            className="w-full"
            type="url"
            placeholder="Enter Website URL"
            value={props.website}
            onChange={(e) => props.setWebsite(e.target.value)}
            title="Enter company website"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="address">Current Address</Label>
          <Textarea
            id="address"
            placeholder="Enter Complete Address"
            rows={3}
            className="!h-auto !min-h-[88px] resize-y rounded-md border border-slate-300 bg-white focus-visible:ring-teal-600/30"
            value={props.address}
            onChange={(e) => props.setAddress(e.target.value)}
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 xl:gap-6 items-end">
          <div className="min-w-0 space-y-2">
            <div className="flex items-center min-h-[20px]">
              <Label htmlFor="pincode">PIN Code</Label>
            </div>
            <Input
              id="pincode"
              className="w-full"
              type="text"
              maxLength={6}
              placeholder="Enter 6-digit PIN code"
              value={props.pinCode}
              onChange={(e) => props.setPinCode(e.target.value)}
            />
          </div>

          <div className="min-w-0 space-y-2">
            <div className="flex items-center min-h-[20px]">
              <Label htmlFor="district">District</Label>
            </div>
            <Input
              id="district"
              className="w-full"
              placeholder="Enter district"
              value={props.district}
              onChange={(e) => props.setDistrict(e.target.value)}
            />
          </div>

          <div className="min-w-0 space-y-2">
            <div className="flex items-center justify-between gap-2 min-h-[20px]">
              <Label htmlFor="state" className="shrink-0">State</Label>
              <Dialog open={stateDialogOpen} onOpenChange={setStateDialogOpen}>
                <DialogTrigger asChild>
                  <button type="button" className="shrink-0 text-xs font-medium text-primary flex items-center gap-1 hover:underline whitespace-nowrap">
                    <Plus size={12} />
                    Add New State
                  </button>
                </DialogTrigger>
                <DialogContent aria-describedby={undefined}>
                  <DialogHeader>
                    <DialogTitle>Add New State</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="new-state">State Name</Label>
                      <Input
                        id="new-state"
                        value={newState}
                        onChange={(e) => setNewState(e.target.value)}
                        placeholder="e.g., Karnataka"
                      />
                    </div>
                    <div>
                      <p className="text-xs font-medium text-muted-foreground mb-2">Existing States</p>
                      <div className="space-y-1 max-h-40 overflow-auto">
                        {props.states.map((state) => (
                          <div
                            key={state.value}
                            className="flex items-center justify-between rounded-md border border-border px-3 py-1 text-sm"
                          >
                            <span>{state.label}</span>
                            {props.states.length > 1 && (
                              <button
                                type="button"
                                onClick={() => handleDeleteState(state.value)}
                                className="text-destructive hover:text-destructive/80"
                              >
                                <Trash2 size={14} />
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                  <DialogFooter>
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => {
                        setNewState('')
                        setStateDialogOpen(false)
                      }}
                    >
                      Cancel
                    </Button>
                    <Button type="button" onClick={handleAddState} disabled={!newState.trim()}>
                      Save State
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
            <Select value={props.selectedState} onValueChange={props.setSelectedState}>
              <SelectTrigger id="state" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {props.states.map((state) => (
                  <SelectItem key={state.value} value={state.value}>
                    {state.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="min-w-0 space-y-2">
            <div className="flex items-center justify-between gap-2 min-h-[20px]">
              <Label htmlFor="country" className="shrink-0">Country</Label>
              <Dialog open={countryDialogOpen} onOpenChange={setCountryDialogOpen}>
                <DialogTrigger asChild>
                  <button type="button" className="shrink-0 text-xs font-medium text-primary flex items-center gap-1 hover:underline whitespace-nowrap">
                    <Plus size={12} />
                    Add New Country
                  </button>
                </DialogTrigger>
                <DialogContent aria-describedby={undefined}>
                  <DialogHeader>
                    <DialogTitle>Add New Country</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="new-country">Country Name</Label>
                      <Input
                        id="new-country"
                        value={newCountry}
                        onChange={(e) => setNewCountry(e.target.value)}
                        placeholder="e.g., Sri Lanka"
                      />
                    </div>
                    <div>
                      <p className="text-xs font-medium text-muted-foreground mb-2">Existing Countries</p>
                      <div className="space-y-1 max-h-40 overflow-auto">
                        {props.countries.map((country) => (
                          <div
                            key={country.value}
                            className="flex items-center justify-between rounded-md border border-border px-3 py-1 text-sm"
                          >
                            <span>{country.label}</span>
                            {props.countries.length > 1 && (
                              <button
                                type="button"
                                onClick={() => handleDeleteCountry(country.value)}
                                className="text-destructive hover:text-destructive/80"
                              >
                                <Trash2 size={14} />
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                  <DialogFooter>
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => {
                        setNewCountry('')
                        setCountryDialogOpen(false)
                      }}
                    >
                      Cancel
                    </Button>
                    <Button type="button" onClick={handleAddCountry} disabled={!newCountry.trim()}>
                      Save Country
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
            <Select value={props.selectedCountry} onValueChange={props.setSelectedCountry}>
              <SelectTrigger id="country" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {props.countries.map((country) => (
                  <SelectItem key={country.value} value={country.value}>
                    {country.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <FileUpload
            label="Company Logo"
            accept="image/*"
            bucket="laboratory-files"
            pathPrefix="company"
            value={props.companyLogoPath ?? undefined}
            onChange={(_file, storagePath) => props.setCompanyLogoPath(storagePath)}
          />
          <FileUpload
            label="Seal & Sign"
            accept="image/*"
            bucket="laboratory-files"
            pathPrefix="company"
            value={props.sealSignPath ?? undefined}
            onChange={(_file, storagePath) => props.setSealSignPath(storagePath)}
          />
        </div>
      </CardContent>
    </Card>
  )
}

import React from 'react'
