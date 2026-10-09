import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import type { ClientCertificateFile } from './clientsApi'
import {
  CLIENT_SECTORS,
  CLIENT_STATUSES,
  CONTACT_ROLES,
  INDIA_STATES,
  SITE_ROLES,
  emptyClientContacts,
  emptyClientSites,
  type ClientContactForm,
  type ClientForm,
  type ClientSiteForm,
} from './types'

function fieldClass() {
  return 'col-span-12 min-w-0 space-y-2 sm:col-span-6'
}

export function ClientIdentitySections({
  form,
  onChange,
  clientSaved,
  certificates,
  onUploadCertificate,
  onDeleteCertificate,
  onOpenCertificate,
}: {
  form: ClientForm
  onChange: (next: ClientForm) => void
  clientSaved: boolean
  certificates: ClientCertificateFile[]
  onUploadCertificate: (certName: string, file: File) => void
  onDeleteCertificate: (row: ClientCertificateFile) => void
  onOpenCertificate: (row: ClientCertificateFile) => void
}) {
  const setSite = (index: number, patch: Partial<ClientSiteForm>) => {
    const sites = form.sites.map((site, i) => (i === index ? { ...site, ...patch } : site))
    onChange({ ...form, sites })
  }
  const setContact = (index: number, patch: Partial<ClientContactForm>) => {
    const contacts = form.contacts.map((contact, i) => (i === index ? { ...contact, ...patch } : contact))
    onChange({ ...form, contacts })
  }
  const names = Array.from(new Set(certificates.map((row) => row.cert_name)))

  return (
    <div className="space-y-5">
      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-stone-800">Statutory</h2>
        <div className="grid grid-cols-12 gap-3">
          <div className={fieldClass()}>
            <Label htmlFor="client-pan">PAN</Label>
            <Input id="client-pan" className="h-10 min-h-10" value={form.pan} onChange={(e) => onChange({ ...form, pan: e.target.value.toUpperCase(), panFromGstin: false })} />
          </div>
          <div className={fieldClass()}>
            <Label htmlFor="client-gst-state">GST state code</Label>
            <Input id="client-gst-state" className="h-10 min-h-10" value={form.gstStateCode} onChange={(e) => onChange({ ...form, gstStateCode: e.target.value })} />
          </div>
          <div className={fieldClass()}>
            <Label htmlFor="client-cin">CIN</Label>
            <Input id="client-cin" className="h-10 min-h-10" value={form.cin} onChange={(e) => onChange({ ...form, cin: e.target.value })} />
          </div>
          <div className={fieldClass()}>
            <Label htmlFor="client-llpin">LLPIN</Label>
            <Input id="client-llpin" className="h-10 min-h-10" value={form.llpin} onChange={(e) => onChange({ ...form, llpin: e.target.value })} />
          </div>
          <div className={fieldClass()}>
            <Label htmlFor="client-udyam">Udyam number</Label>
            <Input id="client-udyam" className="h-10 min-h-10" value={form.udyamNo} onChange={(e) => onChange({ ...form, udyamNo: e.target.value })} />
          </div>
          <div className={fieldClass()}>
            <Label htmlFor="client-constitution">Constitution</Label>
            <Input id="client-constitution" className="h-10 min-h-10" value={form.constitution} onChange={(e) => onChange({ ...form, constitution: e.target.value })} />
          </div>
          <div className={fieldClass()}>
            <Label>Sector</Label>
            <Select value={form.sector || 'none'} onValueChange={(v) => onChange({ ...form, sector: v === 'none' ? '' : (v as ClientForm['sector']) })}>
              <SelectTrigger className="h-10 min-h-10" aria-label="Sector">
                <SelectValue placeholder="Sector" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Not set</SelectItem>
                {CLIENT_SECTORS.map((sector) => (
                  <SelectItem key={sector} value={sector}>{sector}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className={fieldClass()}>
            <Label htmlFor="client-gst-type">GST registration type</Label>
            <Input id="client-gst-type" className="h-10 min-h-10" value={form.gstRegistrationType} onChange={(e) => onChange({ ...form, gstRegistrationType: e.target.value })} />
          </div>
          <div className={fieldClass()}>
            <Label htmlFor="client-msme-category">MSME category</Label>
            <Input id="client-msme-category" className="h-10 min-h-10" value={form.msmeCategory} onChange={(e) => onChange({ ...form, msmeCategory: e.target.value })} />
          </div>
          <div className={fieldClass()}>
            <Label htmlFor="client-udyam-date">Udyam date</Label>
            <Input id="client-udyam-date" className="h-10 min-h-10" type="date" value={form.udyamDate} onChange={(e) => onChange({ ...form, udyamDate: e.target.value })} />
          </div>
          <div className={fieldClass()}>
            <Label htmlFor="client-dpiit">Startup DPIIT number</Label>
            <Input id="client-dpiit" className="h-10 min-h-10" value={form.startupDpiitNo} onChange={(e) => onChange({ ...form, startupDpiitNo: e.target.value })} />
          </div>
          <label className="col-span-12 flex h-10 min-h-10 items-center gap-2 text-sm text-stone-800 sm:col-span-6">
            <input id="client-startup" type="checkbox" className="h-4 w-4" checked={form.isStartup} onChange={(e) => onChange({ ...form, isStartup: e.target.checked })} />
            Startup
          </label>
          <label className="col-span-12 flex h-10 min-h-10 items-center gap-2 text-sm text-stone-800 sm:col-span-6">
            <input id="client-women" type="checkbox" className="h-4 w-4" checked={form.isWomenEntrepreneur} onChange={(e) => onChange({ ...form, isWomenEntrepreneur: e.target.checked })} />
            Women entrepreneur
          </label>
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-stone-800">Sites</h2>
          <Button type="button" variant="outline" className="h-10 min-h-10" onClick={() => onChange({ ...form, sites: [...form.sites, { ...emptyClientSites()[1]!, isPrimary: false }] })}>
            Add site
          </Button>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {form.sites.map((site, index) => (
            <div key={site.id ?? `site-${index}`} className="space-y-2 border border-stone-300 p-3">
              <Label>Site role</Label>
              <Select value={site.siteRole} onValueChange={(v) => setSite(index, { siteRole: v as ClientSiteForm['siteRole'] })}>
                <SelectTrigger className="h-10 min-h-10" aria-label="Site role">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SITE_ROLES.map((role) => (
                    <SelectItem key={role} value={role}>{role}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input className="h-10 min-h-10" aria-label="Site address" placeholder="Address" value={site.address} onChange={(e) => setSite(index, { address: e.target.value })} />
              <Input className="h-10 min-h-10" aria-label="Site district" placeholder="District" value={site.district} onChange={(e) => setSite(index, { district: e.target.value })} />
              <Select value={site.state || INDIA_STATES[0]} onValueChange={(v) => setSite(index, { state: v })}>
                <SelectTrigger className="h-10 min-h-10" aria-label="Site state">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {INDIA_STATES.map((name) => (
                    <SelectItem key={name} value={name}>{name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input className="h-10 min-h-10" aria-label="Site PIN" placeholder="PIN" value={site.pinCode} onChange={(e) => setSite(index, { pinCode: e.target.value })} />
              <Button type="button" variant="outline" className="h-10 min-h-10" onClick={() => onChange({ ...form, sites: form.sites.filter((_, i) => i !== index) })}>
                Remove site
              </Button>
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-stone-800">Contacts</h2>
          <Button type="button" variant="outline" className="h-10 min-h-10" onClick={() => onChange({ ...form, contacts: [...form.contacts, { ...emptyClientContacts()[0]!, contactRole: 'Other', isPrimary: false }] })}>
            Add contact
          </Button>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {form.contacts.map((contact, index) => (
            <div key={contact.id ?? `contact-${index}`} className="space-y-2 border border-stone-300 p-3">
              <Select value={contact.contactRole} onValueChange={(v) => setContact(index, { contactRole: v as ClientContactForm['contactRole'] })}>
                <SelectTrigger className="h-10 min-h-10" aria-label="Contact role">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CONTACT_ROLES.map((role) => (
                    <SelectItem key={role} value={role}>{role}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input className="h-10 min-h-10" aria-label="Contact name" placeholder="Name" value={contact.name} onChange={(e) => setContact(index, { name: e.target.value })} />
              <Input className="h-10 min-h-10" aria-label="Designation" placeholder="Designation" value={contact.designation} onChange={(e) => setContact(index, { designation: e.target.value })} />
              <Input className="h-10 min-h-10" aria-label="Contact mobile" placeholder="Mobile" value={contact.mobile} onChange={(e) => setContact(index, { mobile: e.target.value })} />
              <Input className="h-10 min-h-10" aria-label="Contact email" placeholder="Email" value={contact.email} onChange={(e) => setContact(index, { email: e.target.value })} />
              <Button type="button" variant="outline" className="h-10 min-h-10" onClick={() => onChange({ ...form, contacts: form.contacts.filter((_, i) => i !== index) })}>
                Remove contact
              </Button>
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-stone-800">Lifecycle</h2>
        <div className="grid grid-cols-12 gap-3">
          <div className={fieldClass()}>
            <Label>Status</Label>
            <Select value={form.clientStatus} onValueChange={(v) => onChange({ ...form, clientStatus: v as ClientForm['clientStatus'] })}>
              <SelectTrigger className="h-10 min-h-10" aria-label="Client status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CLIENT_STATUSES.map((status) => (
                  <SelectItem key={status} value={status}>{status}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className={fieldClass()}>
            <Label htmlFor="client-lead">Lead source</Label>
            <Input id="client-lead" className="h-10 min-h-10" value={form.leadSource} onChange={(e) => onChange({ ...form, leadSource: e.target.value })} />
          </div>
          <div className={fieldClass()}>
            <Label htmlFor="client-referred">Referred by</Label>
            <Input id="client-referred" className="h-10 min-h-10" value={form.referredBy} onChange={(e) => onChange({ ...form, referredBy: e.target.value })} />
          </div>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-stone-800">Certificates</h2>
        <p className="text-xs text-stone-600">
          {clientSaved ? 'Files are stored once on this client.' : 'Save the client first, then upload certificates.'}
        </p>
        {names.length === 0 ? <p className="text-sm text-stone-500">No certificate files yet.</p> : null}
        {names.map((name) => (
          <div key={name} className="border border-stone-300 p-3">
            <p className="mb-2 text-sm font-medium">{name}</p>
            <ul className="space-y-2">
              {certificates.filter((row) => row.cert_name === name).map((row) => (
                <li key={row.id} className="flex flex-wrap items-center gap-2">
                  <span className="min-w-0 flex-1 truncate text-sm">{row.file_name}</span>
                  <Button type="button" variant="outline" className="h-10 min-h-10" onClick={() => onOpenCertificate(row)}>View</Button>
                  <Button type="button" variant="outline" className="h-10 min-h-10" onClick={() => onDeleteCertificate(row)}>Delete</Button>
                </li>
              ))}
            </ul>
          </div>
        ))}
        <ExtraCertificateUpload disabled={!clientSaved} onUpload={onUploadCertificate} />
      </section>
    </div>
  )
}

function ExtraCertificateUpload({
  disabled,
  onUpload,
}: {
  disabled: boolean
  onUpload: (certName: string, file: File) => void
}) {
  return (
    <form
      className="flex flex-col gap-2 sm:flex-row sm:items-end"
      onSubmit={(event) => {
        event.preventDefault()
        const formEl = event.currentTarget
        const name = String(new FormData(formEl).get('certName') ?? '').trim()
        const file = formEl.querySelector<HTMLInputElement>('input[type=file]')?.files?.[0]
        if (!name || !file) return
        onUpload(name, file)
        formEl.reset()
      }}
    >
      <Input name="certName" className="h-10 min-h-10" placeholder="New certificate name" aria-label="New certificate name" disabled={disabled} />
      <Input className="h-10 min-h-10" type="file" accept="application/pdf,image/jpeg,image/png,image/webp" aria-label="Certificate file" disabled={disabled} />
      <Button type="submit" className="h-10 min-h-10" disabled={disabled}>Add certificate</Button>
    </form>
  )
}
