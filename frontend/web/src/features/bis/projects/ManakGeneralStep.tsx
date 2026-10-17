import { Fragment, useEffect, useId, useState, type ReactNode } from 'react'
import { Calendar } from 'lucide-react'
import { toast } from 'sonner'
import { LimsFieldWithAdd } from '@/components/lims/LimsFieldWithAdd'
import { Input } from '@/components/ui/input'
import { limsFieldAddBtnClass } from '@/lib/limsThemeUi'
import { cn } from '@/lib/utils'
import { isValidGstin, isValidPan } from '@/lib/indiaValidators'
import { patchClient, patchSite, type ClientSiteRow } from '@/features/masters/clients/clientLinkApi'
import { updateClientCertificateDetails, type ClientCertificateFile } from '@/features/masters/clients/clientsApi'
import { CLIENT_SECTORS, COMPANY_SCALES } from '@/features/masters/clients/types'
import type { BisPrintClient } from '../print/loadBisPrintData'
import { ManakSubPanel, arrangeByLabelLength } from './ManakStepPages'
import type { BisProjectRow } from './types'

type Rec = Record<string, unknown>

/** Hide the browser's own calendar glyph; the calendar button sits on the right like Client Master. */
const dateInputClass =
  'min-w-0 border-0 bg-transparent pr-1 tabular-nums shadow-none focus-visible:ring-0 [&::-webkit-calendar-picker-indicator]:pointer-events-none [&::-webkit-calendar-picker-indicator]:absolute [&::-webkit-calendar-picker-indicator]:h-0 [&::-webkit-calendar-picker-indicator]:w-0 [&::-webkit-calendar-picker-indicator]:opacity-0'

function openDatePicker(id: string) {
  const el = document.getElementById(id)
  if (!(el instanceof HTMLInputElement) || el.disabled) return
  try {
    if (typeof el.showPicker === 'function') {
      el.showPicker()
      return
    }
  } catch {
    // showPicker is blocked outside a user gesture; fall back to focus.
  }
  el.focus()
}

const NATURE_OF_FIRM = ['Pvt. Limited', 'Public Limited', 'LLP', 'Partnership', 'Proprietorship', 'Trust / Society', 'Government']
const YES_NO = ['Yes', 'No']

const str = (v: unknown) => (typeof v === 'string' ? v.trim() : v == null ? '' : String(v).trim())

/** Legal-document names that serve as Manak's Proof of Establishment / Address Proof. */
export const ESTABLISHMENT_DOC =
  /incorporation|partnership|llp|udyam|udyog|registration of firm|establishment|msme|shop\s*&?\s*establishment/i
export const ADDRESS_DOC = /gst|address|electricity|light bill|rent|lease|property tax/i

type EditableProps = {
  value: string
  onSave: (next: string) => Promise<void>
  type?: 'text' | 'date' | 'select'
  options?: string[]
  disabled?: boolean
  title?: string
  validate?: (next: string) => string | null
  normalize?: (next: string) => string
  placeholder?: string
  prefix?: string
}

function EditableValue({ value, onSave, type = 'text', options, disabled, title, validate, normalize, placeholder, prefix }: EditableProps) {
  const [draft, setDraft] = useState(value)
  const [focused, setFocused] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const dateId = useId()

  useEffect(() => {
    if (!focused) setDraft(value)
  }, [value, focused])

  const commit = async (raw: string) => {
    const next = normalize ? normalize(raw) : raw.trim()
    if (next === value) {
      setError('')
      setDraft(value)
      return
    }
    const problem = validate?.(next) ?? null
    if (problem) {
      setError(problem)
      return
    }
    setBusy(true)
    try {
      await onSave(next)
      setError('')
      setDraft(next)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not save'
      setError(message)
      toast.error(message)
    } finally {
      setBusy(false)
    }
  }

  const cls = cn(
    'h-8 w-full rounded-none border-stone-300 bg-white px-2 text-sm',
    error && '!border-red-600 !bg-red-50',
    busy && 'opacity-60',
  )

  return (
    <div className="min-w-0" title={title}>
      <div className="flex items-center gap-1">
        {type === 'select' ? (
          <select
            className={cn(cls, 'border px-2')}
            value={draft}
            disabled={disabled || busy}
            onChange={(e) => {
              setDraft(e.target.value)
              void commit(e.target.value)
            }}
          >
            {draft && !(options ?? []).includes(draft) ? <option value={draft}>{draft}</option> : null}
            <option value="">—</option>
            {(options ?? []).map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
        ) : type === 'date' ? (
          <LimsFieldWithAdd
            className={cn('w-full', error && '!border-red-600 !bg-red-50', busy && 'opacity-60')}
            addButton={
              <button
                type="button"
                className={limsFieldAddBtnClass}
                aria-label="Open calendar"
                title="Pick date"
                disabled={disabled}
                onClick={() => openDatePicker(dateId)}
              >
                <Calendar size={14} strokeWidth={2.25} aria-hidden />
              </button>
            }
          >
            <Input
              id={dateId}
              type="date"
              value={draft}
              disabled={disabled}
              className={dateInputClass}
              onFocus={() => setFocused(true)}
              onChange={(e) => {
                setDraft(e.target.value)
                // Picking from the calendar saves right away; typing waits for blur.
                if (document.activeElement !== e.target) void commit(e.target.value)
              }}
              onBlur={() => {
                setFocused(false)
                void commit(draft)
              }}
            />
          </LimsFieldWithAdd>
        ) : (
          <div
            className={cn(
              'flex h-8 w-full items-center rounded-none border bg-white text-sm focus-within:border-amber-600 focus-within:ring-2 focus-within:ring-amber-500/20',
              error ? 'border-red-600 bg-red-50' : 'border-stone-300',
              busy && 'opacity-60',
              disabled && 'opacity-50',
            )}
          >
            {/* Prefix (country code) sits inside the field as part of the text. */}
            {prefix ? <span className="shrink-0 select-none pl-2 text-stone-700">{prefix}</span> : null}
            <Input
              className={cn(
                'h-full min-w-0 flex-1 rounded-none border-0 bg-transparent py-0 shadow-none focus-visible:ring-0',
                prefix ? 'pl-1.5 pr-2' : 'px-2',
              )}
              type="text"
              value={draft}
              placeholder={placeholder}
              disabled={disabled}
              onFocus={() => setFocused(true)}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={() => {
                setFocused(false)
                void commit(draft)
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
                if (e.key === 'Escape') {
                  setDraft(value)
                  setError('')
                }
              }}
            />
          </div>
        )}
      </div>
      {error ? <p className="mt-0.5 text-[11px] text-red-700">{error}</p> : null}
    </div>
  )
}

/** Grid layout: three label | value pairs per row. Same look as ManakFields, with editable values. */
function FieldGrid({
  items,
  fullRows = [],
}: {
  items: Array<[string, ReactNode]>
  /** Fields that take a whole row (label + one wide value), shown above the three-column grid. */
  fullRows?: Array<[string, ReactNode]>
}) {
  const rows = arrangeByLabelLength(items)
  const labelCls =
    'w-[1%] whitespace-nowrap border border-[#e7e0d4] bg-[#f7f3eb] px-3 py-1.5 text-left align-middle text-sm font-bold text-stone-800'
  const valueCls = 'w-[32%] border border-[#e7e0d4] px-2 py-1 align-middle text-sm text-stone-700'
  return (
    <div className="overflow-x-auto">
      <table className="w-full table-auto border-collapse">
        <tbody>
          {fullRows.map(([label, node]) => (
            <tr key={label}>
              <th scope="row" className={labelCls}>
                {label}:
              </th>
              <td colSpan={5} className="border border-[#e7e0d4] px-2 py-1 align-middle text-sm text-stone-700">
                {node}
              </td>
            </tr>
          ))}
          {rows.map((pair, i) => (
            <tr key={i}>
              {pair.map((cell, j) => (
                <Fragment key={j}>
                  <th scope="row" className={labelCls}>
                    {cell ? `${cell[0]}:` : ''}
                  </th>
                  <td className={valueCls}>{cell ? cell[1] : null}</td>
                </Fragment>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function ManakGeneralStep({
  row,
  client,
  clientRaw,
  certificates,
  sites,
  linked,
  onChanged,
  children,
}: {
  row: BisProjectRow | null
  client: BisPrintClient | undefined
  clientRaw: Rec | null
  certificates: ClientCertificateFile[]
  sites: ClientSiteRow[]
  /** True until the application becomes a licence (licence number generated). */
  linked: boolean
  onChanged: () => void
  /** Indian Standard / Varieties panels rendered below. */
  children: ReactNode
}) {
  const clientId = row?.client_id ?? null
  const raw = clientRaw ?? {}
  const locked = !linked || !clientId

  const done = async (fn: () => Promise<void>) => {
    await fn()
    onChanged()
  }
  const col = (column: string) => async (v: string) => {
    if (!clientId) return
    await done(() => patchClient(clientId, { [column]: v || null }))
  }

  const proofDoc = certificates.find((d) => ESTABLISHMENT_DOC.test(d.cert_name))
  const addressDoc = certificates.find((d) => ADDRESS_DOC.test(d.cert_name))
  const gstDoc = certificates.find((d) => /^gst/i.test(d.cert_name.trim()))
  const panDoc = certificates.find((d) => /^pan/i.test(d.cert_name.trim()))

  const certField = (doc: ClientCertificateFile | undefined, key: 'cert_name' | 'document_number' | 'issued_on') =>
    async (v: string) => {
      if (!doc) return
      await done(() =>
        updateClientCertificateDetails(doc.id, {
          certName: key === 'cert_name' ? v : doc.cert_name,
          documentNumber: key === 'document_number' ? v : doc.document_number,
          issuedOn: key === 'issued_on' ? v : doc.issued_on,
        }),
      )
    }
  const noDoc = 'Add this document in Client Master → Legal Documents'

  const siteId = row?.factory_site_id ?? null
  const office = (patch: Partial<Pick<ClientSiteRow, 'address' | 'district' | 'state' | 'pin_code'>>, clientPatch: Rec) => async () => {
    if (!clientId) return
    await patchClient(clientId, clientPatch)
    if (sites.some((s) => s.site_role === 'Registered Office' || s.is_primary)) await patchSite(clientId, 'Registered Office', patch)
  }
  const factorySite = sites.find((s) => (siteId && s.id === siteId) || s.site_role === 'Factory')
  const factory = (patch: Partial<Pick<ClientSiteRow, 'address' | 'district' | 'state' | 'pin_code'>>) => async () => {
    if (!clientId) return
    await patchSite(clientId, 'Factory', patch, siteId)
  }
  const officeSite = sites.find((s) => s.is_primary) ?? sites.find((s) => s.site_role === 'Registered Office')

  const sectorOptions = [...CLIENT_SECTORS]
  const mobile = str(raw.mobile)
  const countryCode = str(raw.country_code)

  const v = (
    value: string,
    onSave: (next: string) => Promise<void>,
    extra: Partial<EditableProps> = {},
  ) => <EditableValue value={value} onSave={onSave} disabled={locked} {...extra} />

  const landlineCell = v(str(raw.landline), col('landline'), { placeholder: '-' })
  const mobileCell = v(mobile, col('mobile'), {
    prefix: countryCode,
    normalize: (x) => x.replace(/[^0-9]/g, '').slice(0, 10),
    validate: (x) => (x && x.length !== 10 ? 'Enter a 10 digit mobile number' : null),
  })

  const yesNoFlag = (textCol: string, flagCol: string, current: string) =>
    v(current, async (next) => {
      if (!clientId) return
      await done(() => patchClient(clientId, { [textCol]: next || 'No', [flagCol]: next.toLowerCase() === 'yes' }))
    }, { type: 'select', options: YES_NO })

  const gstValue = str(client?.gstNumber)
  const panValue = str(raw.pan)

  return (
    <div className="space-y-4">
      {locked ? (
        <p className="border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs text-amber-900">
          This application is no longer linked to Client Master (a licence number exists), so these details are read-only here.
        </p>
      ) : null}

      <ManakSubPanel title="Registration Details">
        <FieldGrid
          items={[
            ['User Id', v(str(raw.manak_user_id), col('manak_user_id'))],
            ['Nature of Firm', v(str(raw.constitution), col('constitution'), { type: 'select', options: NATURE_OF_FIRM })],
            [
              'Proof of Establishment of Firm',
              v(str(proofDoc?.cert_name), certField(proofDoc, 'cert_name'), { disabled: locked || !proofDoc, title: proofDoc ? undefined : noDoc }),
            ],
            ['Sector', v(str(client?.sector), col('sector'), { type: 'select', options: sectorOptions })],
            ['Scale', v(str(client?.scale), col('company_scale'), { type: 'select', options: [...COMPANY_SCALES] })],
            [
              'Registration Number',
              v(str(proofDoc?.document_number) || str(raw.cin) || str(raw.llpin), certField(proofDoc, 'document_number'), {
                disabled: locked || !proofDoc,
                title: proofDoc ? undefined : noDoc,
              }),
            ],
            [
              'Date of Registration',
              v(str(proofDoc?.issued_on).slice(0, 10), certField(proofDoc, 'issued_on'), {
                type: 'date',
                disabled: locked || !proofDoc,
                title: proofDoc ? undefined : noDoc,
              }),
            ],
            [
              'GST Number',
              v(
                gstValue,
                async (next) => {
                  if (!clientId) return
                  await done(async () => {
                    await patchClient(clientId, { gst_number: next || null })
                    if (gstDoc) {
                      await updateClientCertificateDetails(gstDoc.id, {
                        certName: gstDoc.cert_name,
                        documentNumber: next,
                        issuedOn: gstDoc.issued_on,
                      })
                    }
                  })
                },
                {
                  normalize: (x) => x.toUpperCase().replace(/\s/g, '').slice(0, 15),
                  validate: (x) => (x && !isValidGstin(x) ? 'Invalid GST number' : null),
                },
              ),
            ],
            [
              'PAN Number',
              v(
                panValue,
                async (next) => {
                  if (!clientId) return
                  await done(async () => {
                    await patchClient(clientId, { pan: next || null })
                    if (panDoc) {
                      await updateClientCertificateDetails(panDoc.id, {
                        certName: panDoc.cert_name,
                        documentNumber: next,
                        issuedOn: panDoc.issued_on,
                      })
                    }
                  })
                },
                {
                  normalize: (x) => x.toUpperCase().replace(/\s/g, '').slice(0, 10),
                  validate: (x) => (x && !isValidPan(x) ? 'Invalid PAN' : null),
                },
              ),
            ],
            [
              'Women Entrepreneur',
              yesNoFlag('women_entrepreneur', 'is_women_entrepreneur', str(raw.women_entrepreneur) || (raw.is_women_entrepreneur ? 'Yes' : 'No')),
            ],
            ['Startup', yesNoFlag('startup_status', 'is_startup', str(raw.startup_status) || (raw.is_startup ? 'Yes' : 'No'))],
          ]}
        />
      </ManakSubPanel>

      <ManakSubPanel title="Office/Firm Details">
        <FieldGrid
          fullRows={[
            ['Firm Name', v(str(client?.companyName), col('company_name'))],
            [
              'Firm Address',
              v(str(officeSite?.address) || str(client?.officeAddress) || str(client?.address), async (next) =>
                done(office({ address: next || null }, { address: next || null })),
              ),
            ],
          ]}
          items={[
            ['CEO Name', v(str(client?.contactPerson), col('contact_person_name'))],
            ['City', v(str(raw.city), col('city'))],
            [
              'District',
              v(str(client?.district), async (next) => done(office({ district: next || null }, { district: next || null }))),
            ],
            [
              'State',
              v(str(client?.state), async (next) => done(office({ state: next || null }, { state: next || null }))),
            ],
            ['Country', v(str(client?.country), col('country'))],
            [
              'PinCode',
              v(str(client?.pinCode), async (next) => done(office({ pin_code: next || null }, { pin_code: next || null })), {
                normalize: (x) => x.replace(/[^0-9]/g, '').slice(0, 6),
                validate: (x) => (x && x.length !== 6 ? 'Enter a 6 digit PIN code' : null),
              }),
            ],
            ['E-MailId', v(str(client?.email), col('email'))],
            ['Landline', landlineCell],
            ['Mobile No.', mobileCell],
            [
              'Address Proof Type',
              v(str(addressDoc?.cert_name), certField(addressDoc, 'cert_name'), { disabled: locked || !addressDoc, title: addressDoc ? undefined : noDoc }),
            ],
          ]}
        />
      </ManakSubPanel>

      <ManakSubPanel title="Factory Details">
        <FieldGrid
          items={[
            [
              'Factory Address',
              v(str(client?.factoryAddress), async (next) => done(factory({ address: next || null })), {
                title: factorySite ? undefined : 'Saving creates a separate Factory site for this client',
              }),
            ],
            ['City', v(str(raw.city), col('city'))],
            ['District', v(str(client?.factoryDistrict), async (next) => done(factory({ district: next || null })))],
            ['State', v(str(client?.factoryState), async (next) => done(factory({ state: next || null })))],
            ['Country', v(str(client?.country), col('country'))],
            [
              'PinCode',
              v(str(client?.factoryPin), async (next) => done(factory({ pin_code: next || null })), {
                normalize: (x) => x.replace(/[^0-9]/g, '').slice(0, 6),
                validate: (x) => (x && x.length !== 6 ? 'Enter a 6 digit PIN code' : null),
              }),
            ],
            ['E-MailId', v(str(client?.email), col('email'))],
            ['Landline', landlineCell],
            ['Mobile No.', mobileCell],
            [
              'Address Proof Type',
              v(str(addressDoc?.cert_name), certField(addressDoc, 'cert_name'), { disabled: locked || !addressDoc, title: addressDoc ? undefined : noDoc }),
            ],
            ['Latitude', v(str(client?.latitude), col('latitude'))],
            ['Longitude', v(str(client?.longitude), col('longitude'))],
          ]}
        />
      </ManakSubPanel>

      {children}
    </div>
  )
}
