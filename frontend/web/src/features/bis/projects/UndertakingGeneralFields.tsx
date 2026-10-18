import { Input } from '@/components/ui/input'
import { undertakingGeneralDefaultPoints } from '../print/undertakingGeneralHtml'
import type { UndertakingGeneralPayload } from './undertakingPayloadModels'
import { UndertakingLinesTable } from './UndertakingLinesTable'

const fields: { key: Exclude<keyof UndertakingGeneralPayload, 'lines'>; label: string; options?: string[] }[] = [
  { key: 'weeklyOff', label: 'Weekly Holiday', options: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] },
  { key: 'markingClause', label: 'Marking Clause' },
  { key: 'packagingClause', label: 'Packaging Clause' },
  { key: 'waterSupplySource', label: 'Water Supply', options: ['Own', 'Rented', 'Municipal', 'Other'] },
  { key: 'electricSupplySource', label: 'Electric Supply', options: ['Electricity Board', 'Own'] },
  { key: 'generatorBackup', label: 'Generator Backup', options: ['Yes', 'No'] },
  { key: 'machineryOwnership', label: 'Machinery & Testing Equipment', options: ['Owned by us', 'Rented'] },
  { key: 'pollutionControlArrangement', label: 'Pollution Control System', options: ['Own', 'Rented', 'Not Applicable'] },
]

export function UndertakingGeneralFields({ value, onChange, disabled, isNumber = '' }: {
  value: UndertakingGeneralPayload
  onChange: (value: UndertakingGeneralPayload) => void
  disabled?: boolean
  isNumber?: string
}) {
  return <div className="space-y-5">
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{fields.map(({ key, label, options }) => <label key={key} className="grid gap-1 text-sm font-medium text-stone-700">{label}{options ? <select aria-label={label} className="h-8 min-w-0 rounded-none border border-stone-400 bg-white px-2 text-sm" value={value[key]} disabled={disabled} onChange={(event) => onChange({ ...value, [key]: event.target.value })}>{[...new Set([...options, value[key]])].map((option) => <option key={option}>{option}</option>)}</select> : <Input aria-label={label} value={value[key]} disabled={disabled} onChange={(event) => onChange({ ...value, [key]: event.target.value })} />}</label>)}</div>
    <UndertakingLinesTable lines={value.lines} defaults={undertakingGeneralDefaultPoints({ ...value, isNumber })} onChange={(lines) => onChange({ ...value, lines })} disabled={disabled} />
  </div>
}
