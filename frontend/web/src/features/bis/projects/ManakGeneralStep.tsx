import { Fragment, useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { Calendar, Download, Eye, FileText, Upload } from 'lucide-react'
import { toast } from 'sonner'
import { LimsFieldWithAdd } from '@/components/lims/LimsFieldWithAdd'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { limsFieldAddBtnClass } from '@/lib/limsThemeUi'
import { cn } from '@/lib/utils'
import { isValidGstin, isValidPan } from '@/lib/indiaValidators'
import { supabase } from '@/lib/supabaseClient'
import { patchClient, patchSite, type ClientSiteRow } from '@/features/masters/clients/clientLinkApi'
import {
  deleteClientCertificate,
  openClientCertificate,
  updateClientCertificateDetails,
  uploadClientCertificate,
  type ClientCertificateFile,
} from '@/features/masters/clients/clientsApi'
import { CLIENT_SECTORS, COMPANY_SCALES } from '@/features/masters/clients/types'
import { type BisBranchOfficeRow } from '@/features/masters/bis-branch-offices/bisBranchOfficesApi'
import type { BisPrintClient } from '../print/loadBisPrintData'
import { ManakApplicationPanel } from './ManakApplicationPanel'
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
  /incorporation|partnership|llp|registration of firm|establishment|shop\s*&?\s*establishment/i
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


/**
 * One button for a proof document kept in Client Master's Legal Documents table.
 * No file: click uploads from the computer, double-click imports a file already in this client's other legal documents.
 * File attached: click views (new tab), double-click offers delete.
 */
function ProofButton({
  doc,
  certName,
  clientId,
  disabled,
  defaultNumber,
  available = [],
  onChanged,
}: {
  doc: ClientCertificateFile | undefined
  certName: string
  clientId: string | null
  disabled?: boolean
  /** Document number written to a new row (for example the GST number already on the client). */
  defaultNumber?: string
  /** All legal documents of the client, offered for import when this proof has no file. */
  available?: ClientCertificateFile[]
  onChanged: () => void
}) {
  const fileRef = useRef<HTMLInputElement>(null)
  const timer = useRef<number | null>(null)
  const [busy, setBusy] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const hasFile = Boolean(doc?.storage_path)

  useEffect(() => () => {
    if (timer.current) window.clearTimeout(timer.current)
  }, [])

  const upload = async (file: File) => {
    if (!clientId) return
    setBusy(true)
    try {
      const today = new Date().toISOString().slice(0, 10)
      await uploadClientCertificate(clientId, {
        certName,
        documentNumber: doc?.document_number ?? defaultNumber ?? '',
        issuedOn: doc?.issued_on || today,
        file,
        existing: doc,
      })
      toast.success(`${certName} uploaded to Client Master`)
      onChanged()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setBusy(false)
    }
  }

  const view = async () => {
    if (!doc) return
    try {
      await openClientCertificate(doc)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not open the file')
    }
  }

  const remove = async () => {
    if (!doc) return
    setBusy(true)
    try {
      await deleteClientCertificate(doc)
      toast.success(`${certName} deleted`)
      setConfirmDelete(false)
      onChanged()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not delete')
    } finally {
      setBusy(false)
    }
  }

  const importFrom = async (source: ClientCertificateFile) => {
    setBusy(true)
    try {
      const { data, error } = await supabase.storage.from('client-certificates').download(source.storage_path)
      if (error || !data) throw error ?? new Error('Could not read the file')
      const file = new File([data], source.file_name || 'document', { type: source.mime_type || data.type || 'application/pdf' })
      await upload(file)
      setImportOpen(false)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Import failed')
    } finally {
      setBusy(false)
    }
  }

  const onClick = () => {
    if (disabled || busy) return
    // Wait briefly so a double-click does not also trigger the single-click action.
    if (timer.current) window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => {
      timer.current = null
      if (hasFile) void view()
      else fileRef.current?.click()
    }, 250)
  }

  const onDoubleClick = () => {
    if (disabled || busy) return
    if (timer.current) {
      window.clearTimeout(timer.current)
      timer.current = null
    }
    if (hasFile) setConfirmDelete(true)
    else setImportOpen(true)
  }

  return (
    <>
      <input
        ref={fileRef}
        type="file"
        accept="application/pdf,image/jpeg,image/png,image/webp"
        className="sr-only"
        onChange={(e) => {
          const file = e.target.files?.[0]
          e.target.value = ''
          if (file) void upload(file)
        }}
      />
      <button
        type="button"
        disabled={disabled || busy}
        onClick={onClick}
        onDoubleClick={onDoubleClick}
        title={
          hasFile
            ? `${certName}: click to view, double-click to delete`
            : `${certName} required: click to upload from computer, double-click to import from Client Master`
        }
        aria-label={hasFile ? `View ${certName}` : `Upload ${certName}`}
        className={cn(
          'inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-none border bg-white text-amber-900 transition-colors hover:bg-amber-50 disabled:opacity-50',
          hasFile ? 'border-emerald-600 text-emerald-800' : 'border-red-500 text-red-700',
        )}
      >
        {hasFile ? <FileText size={15} aria-hidden /> : <Upload size={15} aria-hidden />}
      </button>
      <Dialog open={importOpen} onOpenChange={setImportOpen}>
        <DialogContent className="max-w-md rounded-none">
          <DialogHeader>
            <DialogTitle>Import {certName}</DialogTitle>
            <DialogDescription>
              Pick a file already saved in this client's other Legal Documents. A copy is attached as {certName}.
            </DialogDescription>
          </DialogHeader>
          <ul className="max-h-64 divide-y divide-stone-200 overflow-y-auto border border-stone-300">
            {available.filter((d) => d.storage_path && d.id !== doc?.id).length === 0 ? (
              <li className="px-3 py-4 text-center text-sm text-stone-500">No other documents with a file in Client Master.</li>
            ) : (
              available
                .filter((d) => d.storage_path && d.id !== doc?.id)
                .map((d) => (
                  <li key={d.id}>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void importFrom(d)}
                      className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-amber-50 disabled:opacity-50"
                    >
                      <span className="min-w-0 truncate font-medium">{d.cert_name}</span>
                      <span className="shrink-0 truncate text-xs text-stone-500">{d.file_name}</span>
                    </button>
                  </li>
                ))
            )}
          </ul>
          <DialogFooter>
            <Button type="button" variant="outline" className="rounded-none" onClick={() => setImportOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <DialogContent className="max-w-sm rounded-none">
          <DialogHeader>
            <DialogTitle>Delete {certName}?</DialogTitle>
            <DialogDescription>
              This removes the file from Client Master as well. You can upload it again afterwards.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" className="rounded-none" onClick={() => setConfirmDelete(false)}>
              Cancel
            </Button>
            <Button type="button" className="rounded-none bg-red-700 text-white hover:bg-red-800" disabled={busy} onClick={() => void remove()}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

/** Location map actions: the Latitude button previews the map, the Longitude button downloads it as a PDF. */
function MapButton({ kind, onPreview, onPdf }: { kind: 'preview' | 'pdf'; onPreview?: () => void; onPdf?: () => void }) {
  const handler = kind === 'preview' ? onPreview : onPdf
  const Icon = kind === 'preview' ? Eye : Download
  const label = kind === 'preview' ? 'Preview location map' : 'Download location map as PDF'
  return (
    <button
      type="button"
      disabled={!handler}
      title={label}
      aria-label={label}
      className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-none border border-stone-400 bg-white text-amber-800 transition-colors hover:bg-amber-50 disabled:opacity-50"
      onClick={handler}
    >
      <Icon size={15} aria-hidden />
    </button>
  )
}

/** Google Maps logo: opens Google Maps with the firm name already in the search box. */
function GoogleMapsLink({ query }: { query: string }) {
  const name = query.trim()
  return (
    <a
      href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(name)}`}
      target="_blank"
      rel="noopener noreferrer"
      title={name ? `Open Google Maps and search “${name}”` : 'Open Google Maps'}
      aria-label="Open in Google Maps"
      className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-none border border-stone-400 bg-white transition-colors hover:bg-amber-50"
    >
      <svg width="15" height="15" viewBox="0 0 92.3 132.3" aria-hidden="true">
        <path fill="#1a73e8" d="M60.2 2.2C55.8.8 51 0 46.1 0 32 0 19.3 6.4 10.8 16.5l21.8 18.3L60.2 2.2z" />
        <path fill="#ea4335" d="M10.8 16.5C4.1 24.5 0 34.9 0 46.1c0 8.7 1.7 15.7 4.6 22l28-33.3-21.8-18.3z" />
        <path fill="#4285f4" d="M46.2 28.5c9.8 0 17.7 7.9 17.7 17.7 0 4.3-1.6 8.3-4.2 11.4 0 0 13.9-16.6 27.5-32.7-5.6-10.8-15.3-19-27-22.7L32.6 34.8c3.3-3.8 8.1-6.3 13.6-6.3" />
        <path fill="#fbbc04" d="M46.2 63.8c-9.8 0-17.7-7.9-17.7-17.7 0-4.3 1.5-8.3 4.1-11.3l-28 33.3c4.8 10.6 12.8 19.2 21 29.9l34.1-40.5c-3.3 3.9-8.1 6.3-13.5 6.3" />
        <path fill="#34a853" d="M59.1 109.2c15.4-24.1 33.3-35 33.3-63 0-7.7-1.9-14.9-5.2-21.3L25.6 98c2.6 3.4 5.3 7.3 7.9 11.3 9.3 14.5 6.7 23.1 23.2 23.1 16.5 0 13.9-8.6 23.2-23.1z" />
      </svg>
    </a>
  )
}

/** Grid layout: three label | value pairs per row. Same look as ManakFields, with editable values. */
function FieldGrid({
  items,
  fullRows = [],
  columns = 3,
  topLines = [],
  leadLines = [],
  tailLines = [],
  alignFirstLabel = false,
  alignFullRowLabel = false,
  valueWeights = {},
}: {
  items: Array<[string, ReactNode]>
  /** Label | value pairs per row (2 or 3). */
  columns?: 2 | 3
  /** Fields that take a whole row (label + one wide value), shown above the three-column grid. */
  fullRows?: Array<[string, ReactNode]>
  /** Labels shown together on one first line (equal-width columns), above the grid. */
  topLines?: string[][]
  /** Like topLines, but shown above the full-width rows. */
  leadLines?: string[][]
  /** Like topLines, but shown after the grid. */
  tailLines?: string[][]
  /** Give the first label of every line the width of a three-field line's label (a sixth of the row). */
  alignFirstLabel?: boolean
  /** Give only the full-width rows' label the same sixth-of-the-row width. */
  alignFullRowLabel?: boolean
  /** Relative width of a field's value column (default 1), for example a wider e-mail field. */
  valueWeights?: Record<string, number>
}) {
  const topTaken = [...leadLines.flat(), ...topLines.flat(), ...tailLines.flat()]
  const toGroups = (lines: string[][]) =>
    lines.map((labels) =>
      labels.map((l) => items.find(([label]) => label === l)).filter((x): x is [string, ReactNode] => Boolean(x)),
    )
  const topGroups = toGroups(topLines)
  const leadGroups = toGroups(leadLines)
  const tailGroups = toGroups(tailLines)
  const rows = arrangeByLabelLength(
    items.filter(([label]) => !topTaken.includes(label)),
    columns,
  )
  const labelCls =
    'w-[1%] whitespace-nowrap border border-[#e7e0d4] bg-[#f7f3eb] px-3 py-1.5 text-left align-middle text-sm font-bold text-stone-800'
  const valueCls = cn(
    columns === 2 ? 'w-[49%]' : 'w-[32%]',
    'border border-[#e7e0d4] px-2 py-1 align-middle text-sm text-stone-700',
  )
  const renderGroups = (groups: Array<Array<[string, ReactNode]>>, gap: boolean) =>
    groups.map((group, g) => (
      <table key={g} className={cn('w-full table-fixed border-collapse', (g > 0 || gap) && '-mt-px')}>
        <colgroup>
          {(() => {
            const n = group.length * 2
            const first = alignFirstLabel && group.length !== 3
            // Label columns weigh 1, value columns their weight (default 1); the first label may be pinned to a sixth of the row.
            const weights = Array.from({ length: n }, (_, k) => (k % 2 === 1 ? valueWeights[group[(k - 1) / 2]![0]] ?? 1 : 1))
            const total = weights.reduce((sum, w) => sum + w, 0)
            return weights.map((w, k) => {
              const width = first ? (k === 0 ? 100 / 6 : ((100 - 100 / 6) * w) / (total - weights[0]!)) : (100 * w) / total
              return <col key={k} style={{ width: `${width}%` }} />
            })
          })()}
        </colgroup>
        <tbody>
          <tr>
            {group.map(([label, node]) => (
              <Fragment key={label}>
                <th
                  scope="row"
                  className={cn(labelCls, 'w-auto whitespace-normal', group.length > 3 && 'whitespace-nowrap px-2 text-xs')}
                >
                  {label}:
                </th>
                <td className="border border-[#e7e0d4] px-2 py-1 align-middle text-sm text-stone-700">{node}</td>
              </Fragment>
            ))}
          </tr>
        </tbody>
      </table>
    ))
  return (
    <div className="manak-kv overflow-x-auto">
      {renderGroups(leadGroups, false)}
      {fullRows.length > 0 ? (
        <table
          className={cn(
            'w-full border-collapse',
            alignFirstLabel || alignFullRowLabel ? 'table-fixed' : 'table-auto',
            leadGroups.length > 0 && '-mt-px',
          )}
        >
          {alignFirstLabel || alignFullRowLabel ? (
            <colgroup>
              <col style={{ width: `${100 / 6}%` }} />
            </colgroup>
          ) : null}
          <tbody>
            {fullRows.map(([label, node]) => (
              <tr key={label}>
                <th scope="row" className={labelCls}>
                  {label}:
                </th>
                <td colSpan={columns * 2 - 1} className="border border-[#e7e0d4] px-2 py-1 align-middle text-sm text-stone-700">
                  {node}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
      {renderGroups(topGroups, fullRows.length > 0 || leadGroups.length > 0)}
      <table
        className={cn(
          'w-full table-auto border-collapse',
          (topGroups.length > 0 || fullRows.length > 0 || leadGroups.length > 0) && '-mt-px',
        )}
      >
        <tbody>
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
      {renderGroups(tailGroups, true)}
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
  projectRaw,
  branches,
  onLocationMapPreview,
  onLocationMapPdf,
  onProjectSaved,
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
  projectRaw: Rec | null
  branches: BisBranchOfficeRow[]
  onLocationMapPreview?: () => void
  onLocationMapPdf?: () => void
  onProjectSaved?: () => void
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
  const msmeDoc = certificates.find((d) => /msme|udyam|udyog/i.test(d.cert_name))
  const startupDoc = certificates.find((d) => /startup/i.test(d.cert_name))
  const womenDoc = certificates.find((d) => /women/i.test(d.cert_name))

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
    if (sameAsOffice) await patchSite(clientId, 'Factory', patch, siteId)
  }
  const factorySite = sites.find((s) => (siteId && s.id === siteId) || s.site_role === 'Factory')
  const factory = (patch: Partial<Pick<ClientSiteRow, 'address' | 'district' | 'state' | 'pin_code'>>) => async () => {
    if (!clientId) return
    await patchSite(clientId, 'Factory', patch, siteId)
  }
  const officeSite = sites.find((s) => s.is_primary) ?? sites.find((s) => s.site_role === 'Registered Office')

  const norm = (x: unknown) => str(x).toLowerCase().replace(/\s+/g, ' ')
  const officeAddr = str(officeSite?.address) || str(client?.officeAddress) || str(client?.address)
  const officeDistrict = str(officeSite?.district) || str(client?.district)
  const officeState = str(officeSite?.state) || str(client?.state)
  const officePin = str(officeSite?.pin_code) || str(client?.pinCode)
  /** Same convention as Client Master: factory is "same as office" when its address matches the office address. */
  const derivedSame =
    !factorySite ||
    (norm(factorySite.address) === norm(officeAddr) &&
      norm(factorySite.district) === norm(officeDistrict) &&
      norm(factorySite.state) === norm(officeState) &&
      norm(factorySite.pin_code) === norm(officePin))
  const [sameAsOffice, setSameAsOffice] = useState(derivedSame)
  useEffect(() => {
    if (!derivedSame) setSameAsOffice(false)
  }, [derivedSame])
  const factoryLocked = locked || sameAsOffice

  const toggleSame = async (checked: boolean) => {
    setSameAsOffice(checked)
    if (!checked || !clientId) return
    try {
      await patchSite(clientId, 'Factory', {
        address: officeAddr || null,
        district: officeDistrict || null,
        state: officeState || null,
        pin_code: officePin || null,
      }, siteId)
      toast.success('Factory address now follows the office address')
      onChanged()
    } catch (err) {
      setSameAsOffice(false)
      toast.error(err instanceof Error ? err.message : 'Could not save')
    }
  }

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

  const yesNoFlag = (
    textCol: string,
    flagCol: string,
    current: string,
    proof: { doc: ClientCertificateFile | undefined; certName: string },
  ) => (
    <div className="flex items-center gap-1">
      <div className="min-w-0 flex-1">
        {v(current, async (next) => {
          if (!clientId) return
          await done(() => patchClient(clientId, { [textCol]: next || 'No', [flagCol]: next.toLowerCase() === 'yes' }))
        }, { type: 'select', options: YES_NO })}
      </div>
      {current.toLowerCase() === 'yes' ? (
        <ProofButton doc={proof.doc} certName={proof.certName} clientId={clientId} disabled={locked} available={certificates} onChanged={onChanged} />
      ) : null}
    </div>
  )

  /** Field + proof-document button (upload / view / double-click delete) for a legal document. */
  const withProof = (node: ReactNode, doc: ClientCertificateFile | undefined, fallbackName: string, defaultNumber?: string) => (
    <div className="flex items-center gap-1">
      <div className="min-w-0 flex-1">{node}</div>
      <ProofButton doc={doc} certName={doc?.cert_name || fallbackName} clientId={clientId} disabled={locked} defaultNumber={defaultNumber} available={certificates} onChanged={onChanged} />
    </div>
  )

  const withMapActions = (node: ReactNode) => (
    <div className="flex items-center gap-1">
      <div className="min-w-0 flex-1">{node}</div>
      <MapButton kind="preview" onPreview={onLocationMapPreview} onPdf={onLocationMapPdf} />
      <MapButton kind="pdf" onPreview={onLocationMapPreview} onPdf={onLocationMapPdf} />
      <GoogleMapsLink query={str(client?.companyName)} />
    </div>
  )

  const gstValue = str(client?.gstNumber)
  const panValue = str(raw.pan)

  return (
    <div className="space-y-4">
      {locked ? (
        <p className="border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs text-amber-900">
          This application is no longer linked to Client Master (a licence number exists), so these details are read-only here.
        </p>
      ) : null}

      <ManakApplicationPanel row={row} projectRaw={projectRaw} branches={branches} onSaved={onProjectSaved} />

      <ManakSubPanel title="Registration Details">
        <FieldGrid
          columns={2}
          topLines={[['User Id', 'Sector', 'Scale']]}
          items={[
            ['User Id', v(str(raw.manak_user_id), col('manak_user_id'))],
            ['Nature of Firm', v(str(raw.constitution), col('constitution'), { type: 'select', options: NATURE_OF_FIRM })],
            [
              'Proof of Establishment of Firm',
              withProof(
                v(str(proofDoc?.cert_name), certField(proofDoc, 'cert_name'), { disabled: locked || !proofDoc, title: proofDoc ? undefined : noDoc }),
                proofDoc,
                'Certificate of Incorporation',
              ),
            ],
            ['Sector', v(str(client?.sector), col('sector'), { type: 'select', options: sectorOptions })],
            [
              'Scale',
              <div key="scale" className="flex items-center gap-1">
                <div className="min-w-0 flex-1">
                  {v(str(client?.scale), col('company_scale'), { type: 'select', options: [...COMPANY_SCALES] })}
                </div>
                {/* The MSME / Udyam certificate decides the scale; Large needs no document. */}
                {str(client?.scale) && str(client?.scale).toLowerCase() !== 'large' ? (
                  <ProofButton
                    doc={msmeDoc}
                    certName={msmeDoc?.cert_name || 'MSME Certificate'}
                    clientId={clientId}
                    disabled={locked}
                    available={certificates}
                    onChanged={onChanged}
                  />
                ) : null}
              </div>,
            ],
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
              withProof(
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
              gstDoc,
              'GST Certificate',
              gstValue,
              ),
            ],
            [
              'PAN Number',
              withProof(
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
              panDoc,
              'PAN Card',
              panValue,
              ),
            ],
            [
              'Women Entrepreneur',
              yesNoFlag('women_entrepreneur', 'is_women_entrepreneur', str(raw.women_entrepreneur) || (raw.is_women_entrepreneur ? 'Yes' : 'No'), {
                doc: womenDoc,
                certName: 'Women Entrepreneur Certificate',
              }),
            ],
            [
              'Startup',
              yesNoFlag('startup_status', 'is_startup', str(raw.startup_status) || (raw.is_startup ? 'Yes' : 'No'), {
                doc: startupDoc,
                certName: 'Startup Certificate',
              }),
            ],
          ]}
        />
      </ManakSubPanel>

      <ManakSubPanel title="Office/Firm Details">
        <FieldGrid
          columns={2}
          alignFirstLabel
          valueWeights={{ 'E-MailId': 1.7 }}
          leadLines={[['CEO Name', 'E-MailId', 'Mobile No.']]}
          topLines={[
            ['PinCode', 'City', 'District', 'State'],
            ['Country', 'Landline', 'Address Proof Type'],
          ]}
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
              withProof(
                v(str(addressDoc?.cert_name), certField(addressDoc, 'cert_name'), { disabled: locked || !addressDoc, title: addressDoc ? undefined : noDoc }),
                addressDoc,
                'GST Certificate',
              ),
            ],
          ]}
        />
      </ManakSubPanel>

      <ManakSubPanel
        title="Factory Details"
        headerExtra={
          <label className="flex cursor-pointer items-center gap-1.5 text-[11px] font-medium normal-case tracking-normal text-amber-100">
            <input
              type="checkbox"
              className="h-3.5 w-3.5 accent-amber-600"
              checked={sameAsOffice}
              disabled={locked}
              onChange={(e) => void toggleSame(e.target.checked)}
            />
            Same as Office Address
          </label>
        }
      >
        <FieldGrid
          columns={2}
          alignFullRowLabel
          valueWeights={{ Latitude: 0.8, Longitude: 1.6 }}
          topLines={[['PinCode', 'City', 'District', 'State']]}
          leadLines={[['E-MailId', 'Mobile No.']]}
          tailLines={[['Address Proof Type', 'Latitude', 'Longitude']]}
          fullRows={[
            [
              'Factory Address',
              v(str(client?.factoryAddress), async (next) => done(factory({ address: next || null })), {
                disabled: factoryLocked,
                title: sameAsOffice ? 'Same as Office Address (untick to edit separately)' : factorySite ? undefined : 'Saving creates a separate Factory site for this client',
              }),
            ],
          ]}
          items={[
            ['City', v(str(raw.city), col('city'))],
            ['District', v(str(client?.factoryDistrict), async (next) => done(factory({ district: next || null })), { disabled: factoryLocked })],
            ['State', v(str(client?.factoryState), async (next) => done(factory({ state: next || null })), { disabled: factoryLocked })],
            ['Country', v(str(client?.country), col('country'))],
            [
              'PinCode',
              v(str(client?.factoryPin), async (next) => done(factory({ pin_code: next || null })), {
                disabled: factoryLocked,
                normalize: (x) => x.replace(/[^0-9]/g, '').slice(0, 6),
                validate: (x) => (x && x.length !== 6 ? 'Enter a 6 digit PIN code' : null),
              }),
            ],
            ['E-MailId', v(str(client?.email), col('email'))],
            ['Landline', landlineCell],
            ['Mobile No.', mobileCell],
            [
              'Address Proof Type',
              withProof(
                v(str(addressDoc?.cert_name), certField(addressDoc, 'cert_name'), { disabled: locked || !addressDoc, title: addressDoc ? undefined : noDoc }),
                addressDoc,
                'GST Certificate',
              ),
            ],
            ['Latitude', v(str(client?.latitude), col('latitude'))],
            ['Longitude', withMapActions(v(str(client?.longitude), col('longitude')))],
          ]}
        />
      </ManakSubPanel>

      {children}
    </div>
  )
}
