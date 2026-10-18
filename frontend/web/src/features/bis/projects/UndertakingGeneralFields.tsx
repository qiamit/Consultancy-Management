import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { undertakingGeneralDefaultPoints } from '../print/undertakingGeneralHtml'
import type { UndertakingGeneralPayload } from './undertakingPayloadModels'
import { UndertakingLinesTable } from './UndertakingLinesTable'

const fields: { key: Exclude<keyof UndertakingGeneralPayload, 'lines'>; label: string; options?: string[] }[] = [
  { key: 'markingClause', label: 'Marking Clause' },
  { key: 'packagingClause', label: 'Packaging Clause' },
  { key: 'waterSupplySource', label: 'Water Supply', options: ['Own', 'Rented', 'Municipal', 'Other'] },
  { key: 'electricSupplySource', label: 'Electric Supply', options: ['Electricity Board', 'Own'] },
  { key: 'generatorBackup', label: 'Generator Backup', options: ['Yes', 'No'] },
  { key: 'machineryOwnership', label: 'Machinery & Testing Equipment', options: ['Owned by us', 'Rented'] },
  { key: 'pollutionControlArrangement', label: 'Pollution Control System', options: ['Own', 'Rented', 'Not Applicable'] },
]

export function UndertakingGeneralFields({ value, onChange, disabled, isNumber = '', onImport, onAiLines }: {
  value: UndertakingGeneralPayload
  onChange: (value: UndertakingGeneralPayload) => void
  disabled?: boolean
  isNumber?: string
  onImport?: () => void
  onAiLines?: (text: string, existing: string[], count: number) => Promise<string[]>
}) {
  return <div className="space-y-5">
    {/* Two rows: four fields, then three. Weekly holiday comes from Step 7 → Weekly Offs (no field here). */}
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-12">{fields.map(({ key, label, options }, index) => <label key={key} className={cn('grid gap-1 text-sm font-medium text-stone-700', index < 4 ? 'xl:col-span-3' : 'xl:col-span-4')}>{label}{options ? <select aria-label={label} className="h-8 min-w-0 rounded-none border border-stone-400 bg-white px-2 text-sm" value={value[key]} disabled={disabled} onChange={(event) => onChange({ ...value, [key]: event.target.value })}>{[...new Set([...options, value[key]])].map((option) => <option key={option}>{option}</option>)}</select> : <Input aria-label={label} value={value[key]} disabled={disabled} onChange={(event) => onChange({ ...value, [key]: event.target.value })} />}</label>)}</div>
    <UndertakingLinesTable lines={value.lines} defaults={undertakingGeneralDefaultPoints({ ...value, isNumber })} onChange={(lines) => onChange({ ...value, lines })} disabled={disabled} onImport={onImport} onAiLines={onAiLines} />
  </div>
}
