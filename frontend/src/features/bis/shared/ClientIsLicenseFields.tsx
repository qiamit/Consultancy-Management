import { useEffect, useRef, useState } from 'react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { searchClientOptions } from '../projects/bisProjectsApi'
import { fetchLicenseOptions, searchClientIsCodeOptions, type BisLicenseOption } from './bisLookupApi'
import { RemoteLookupCombobox } from './RemoteLookupCombobox'

export type ClientIsLicenseValue = {
  clientId: string
  clientLabel: string
  isCodeId: string
  isCodeLabel: string
  bisProjectId: string
  cmLDigits: string
  projectKind: string
}

export const EMPTY_CLIENT_IS_LICENSE: ClientIsLicenseValue = {
  clientId: '',
  clientLabel: '',
  isCodeId: '',
  isCodeLabel: '',
  bisProjectId: '',
  cmLDigits: '',
  projectKind: '',
}

function licenseLabel(o: BisLicenseOption): string {
  const kind = o.projectKind ? ` · ${o.projectKind}` : ''
  return `CM/L-${o.cmLDigits}${kind}`
}

/** Client → IS code → license (CM/L) picker shared by Surveillance and Sample Failure forms. */
export function ClientIsLicenseFields({
  idPrefix,
  value,
  onChange,
  clientLabelText = 'Name of Client',
}: {
  idPrefix: string
  value: ClientIsLicenseValue
  onChange: (next: ClientIsLicenseValue) => void
  clientLabelText?: string
}) {
  const [licenses, setLicenses] = useState<BisLicenseOption[]>([])
  const [licensesLoading, setLicensesLoading] = useState(false)
  const valueRef = useRef(value)
  valueRef.current = value
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange

  const { clientId, isCodeId } = value

  useEffect(() => {
    if (!clientId || !isCodeId) {
      setLicenses([])
      return
    }
    let cancelled = false
    setLicensesLoading(true)
    void fetchLicenseOptions(clientId, isCodeId)
      .then((list) => {
        if (cancelled) return
        setLicenses(list)
        const current = valueRef.current
        if (list.length === 0) return
        if (current.bisProjectId && list.some((o) => o.id === current.bisProjectId)) return
        const byDigits = current.cmLDigits
          ? list.find((o) => o.cmLDigits === current.cmLDigits)
          : undefined
        const pick = byDigits ?? (current.cmLDigits && !current.bisProjectId ? undefined : list[0])
        if (!pick) return
        onChangeRef.current({
          ...current,
          bisProjectId: pick.id,
          cmLDigits: pick.cmLDigits,
          projectKind: pick.projectKind,
        })
      })
      .catch(() => {
        if (!cancelled) setLicenses([])
      })
      .finally(() => {
        if (!cancelled) setLicensesLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [clientId, isCodeId])

  const selectedLicenseValue = licenses.some((o) => o.id === value.bisProjectId)
    ? value.bisProjectId
    : undefined

  return (
    <>
      <div className="col-span-12 space-y-2 md:col-span-6">
        <Label htmlFor={`${idPrefix}-client`}>
          {clientLabelText} <span className="text-destructive">*</span>
        </Label>
        <RemoteLookupCombobox
          inputId={`${idPrefix}-client`}
          listId={`${idPrefix}-client-list`}
          placeholder="Search client name…"
          label={value.clientLabel}
          selectedId={value.clientId}
          search={searchClientOptions}
          onChange={({ id, label }) => {
            if (id === value.clientId && id) {
              onChange({ ...value, clientLabel: label })
              return
            }
            onChange({
              ...EMPTY_CLIENT_IS_LICENSE,
              clientId: id,
              clientLabel: label,
            })
          }}
        />
      </div>

      <div className="col-span-12 space-y-2 md:col-span-6">
        <Label htmlFor={`${idPrefix}-is-code`}>
          IS Code <span className="text-destructive">*</span>
        </Label>
        <RemoteLookupCombobox
          inputId={`${idPrefix}-is-code`}
          listId={`${idPrefix}-is-code-list`}
          placeholder={value.clientId ? 'Search IS code…' : 'Select client first…'}
          label={value.isCodeLabel}
          selectedId={value.isCodeId}
          disabled={!value.clientId}
          searchKey={value.clientId}
          search={(term) => searchClientIsCodeOptions(value.clientId, term)}
          onChange={({ id, label }) => {
            if (id === value.isCodeId && id) {
              onChange({ ...value, isCodeLabel: label })
              return
            }
            onChange({
              ...value,
              isCodeId: id,
              isCodeLabel: label,
              bisProjectId: '',
              cmLDigits: '',
              projectKind: '',
            })
          }}
        />
      </div>

      <div className="col-span-12 space-y-2 md:col-span-6">
        <Label htmlFor={`${idPrefix}-cml`}>CM/L Number</Label>
        {licenses.length > 0 ? (
          <Select
            value={selectedLicenseValue}
            onValueChange={(id) => {
              const pick = licenses.find((o) => o.id === id)
              if (!pick) return
              onChange({
                ...value,
                bisProjectId: pick.id,
                cmLDigits: pick.cmLDigits,
                projectKind: pick.projectKind,
              })
            }}
          >
            <SelectTrigger id={`${idPrefix}-cml`} aria-label="CM/L Number">
              <SelectValue placeholder="Select license" />
            </SelectTrigger>
            <SelectContent className="rounded-none border-stone-500">
              {licenses.map((o) => (
                <SelectItem key={o.id} value={o.id}>
                  {licenseLabel(o)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <div className="flex items-stretch">
            <span className="inline-flex h-8 items-center border border-r-0 border-stone-500 bg-stone-100 px-3 text-xs font-semibold text-stone-700">
              CM/L
            </span>
            <Input
              id={`${idPrefix}-cml`}
              inputMode="numeric"
              maxLength={10}
              placeholder={licensesLoading ? 'Loading…' : '0000000000'}
              className="font-mono tabular-nums"
              value={value.cmLDigits}
              onChange={(e) =>
                onChange({
                  ...value,
                  bisProjectId: '',
                  cmLDigits: e.target.value.replace(/\D/g, '').slice(0, 10),
                })
              }
            />
          </div>
        )}
        {value.isCodeId && !licensesLoading && licenses.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            No linked BIS license found for this client and IS code. Enter the CM/L number manually.
          </p>
        ) : null}
      </div>
    </>
  )
}
