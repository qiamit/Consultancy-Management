import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { PASS_FAIL_PRESETS } from '@/features/portal/recordLogic'

/* Per-type options of a record column, shown as a table under the column name (like the dropdown options). */

export type ColumnSettings = Record<string, unknown>

type Setting = {
  key: string
  label: string
  help: string
  kind: 'toggle' | 'select' | 'number' | 'text' | 'date' | 'heading'
  options?: Array<[string, string]>
  placeholder?: string
  showIf?: (s: ColumnSettings) => boolean
}


const NUMBER_FORMAT: Setting[] = [
  { key: 'format', label: 'Show As', help: 'How the value is shown in the records.', kind: 'select', options: [['plain', 'Plain Number'], ['currency', 'Currency (₹)'], ['percent', 'Percentage (%)']] },
  { key: 'thousands', label: 'Thousands Separator', help: 'Shows 1,23,456.50 instead of 123456.5.', kind: 'toggle' },
]

const TYPE_SETTINGS: Record<string, { title: string; rows: Setting[] }> = {
  text: {
    title: 'Text Options',
    rows: [
      { key: 'long', label: 'Long Text', help: 'A bigger box for several lines (remarks, observations).', kind: 'toggle' },
      { key: 'max_length', label: 'Maximum Characters', help: 'Leave empty for no limit.', kind: 'number', placeholder: 'No Limit' },
      { key: 'letter_case', label: 'Letter Case', help: 'Changes the text as the customer types.', kind: 'select', options: [['', 'As Typed'], ['upper', 'CAPITAL LETTERS'], ['title', 'Title Case'], ['lower', 'small letters']] },
      { key: 'placeholder', label: 'Hint in Empty Box', help: 'Grey example text shown before typing.', kind: 'text', placeholder: 'e.g. Heat No.' },
      { key: 'default_text', label: 'Default Value', help: 'Filled in every new entry; can be changed.', kind: 'text' },
      { key: 'v', label: 'Validation', help: '', kind: 'heading' },
      { key: 'min_length', label: 'Minimum Characters', help: 'Shorter text is not accepted.', kind: 'number', placeholder: 'No Minimum' },
      { key: 'allowed_chars', label: 'Allowed Characters', help: 'Other characters are not accepted.', kind: 'select', options: [['', 'Anything'], ['letters', 'Letters Only'], ['digits', 'Digits Only'], ['alnum', 'Letters and Digits'], ['alnum_space', 'Letters, Digits and Spaces']] },
      { key: 'error_message', label: 'Message When Wrong', help: 'Shown to the customer when the value breaks a rule.', kind: 'text', placeholder: 'e.g. Enter a valid Invoice No' },
    ],
  },
  alnum: {
    title: 'Alphanumeric Options',
    rows: [
      { key: 'mask', label: 'Pattern', help: 'A = letter, 9 = digit, X = letter or digit; anything else must be typed exactly. E.g. HN-99999 or AA9999A.', kind: 'text', placeholder: 'e.g. AA-9999-X' },
      { key: 'letter_case', label: 'Letter Case', help: 'Changes the letters as the customer types.', kind: 'select', options: [['upper', 'CAPITAL LETTERS'], ['as_typed', 'As Typed'], ['lower', 'small letters']] },
      { key: 'placeholder', label: 'Hint in Empty Box', help: 'Grey example shown before typing (the pattern when empty).', kind: 'text', placeholder: 'e.g. HN-12345' },
      { key: 'default_text', label: 'Default Value', help: 'Filled in every new entry; can be changed.', kind: 'text' },
      { key: 'v', label: 'Validation', help: '', kind: 'heading' },
      { key: 'min_length', label: 'Minimum Characters', help: 'Used when there is no pattern.', kind: 'number', placeholder: 'No Minimum' },
      { key: 'max_length', label: 'Maximum Characters', help: 'Used when there is no pattern.', kind: 'number', placeholder: 'No Limit' },
      { key: 'regex', label: 'Custom Rule (Advanced)', help: 'A regular expression the whole value must match, e.g. ^[A-Z]{2}\\d{4}$. Leave empty to use the pattern.', kind: 'text', placeholder: 'Optional' },
      { key: 'error_message', label: 'Message When Wrong', help: 'Shown to the customer when the value does not match.', kind: 'text', placeholder: 'e.g. Format: HN-12345' },
    ],
  },
  number: {
    title: 'Number Options',
    rows: [
      { key: 'check_limits', label: 'Check Limits (Auto Pass / Fail)', help: 'Set Minimum / Maximum above; a value outside makes the entry Fail.', kind: 'toggle' },
      ...NUMBER_FORMAT,
      { key: 'decimals', label: 'Decimal Places', help: 'Rounds the value; leave empty to keep it as typed.', kind: 'number', placeholder: 'As Typed' },
      { key: 'no_negative', label: 'Block Negative Values', help: 'The customer cannot enter a value below zero.', kind: 'toggle' },
      { key: 'default_number', label: 'Default Value', help: 'Filled in every new entry; can be changed.', kind: 'number' },
      { key: 'v', label: 'Validation', help: '', kind: 'heading' },
      { key: 'range_min', label: 'Lowest Allowed', help: 'Values below are not accepted (different from Check Limits, which saves and marks Fail).', kind: 'number', placeholder: 'No Limit' },
      { key: 'range_max', label: 'Highest Allowed', help: 'Values above are not accepted.', kind: 'number', placeholder: 'No Limit' },
      { key: 'whole_only', label: 'Whole Numbers Only', help: 'No decimals (e.g. counts, pieces).', kind: 'toggle' },
      { key: 'error_message', label: 'Message When Wrong', help: 'Shown to the customer when the value breaks a rule.', kind: 'text', placeholder: 'e.g. Enter 0 to 100' },
    ],
  },
  formula: {
    title: 'Result Format',
    rows: NUMBER_FORMAT,
  },
  date: {
    title: 'Date Options',
    rows: [
      { key: 'date_format', label: 'Date Format', help: 'How the date is shown in the records.', kind: 'select', options: [['', 'DD/MM/YYYY'], ['dd-mm-yyyy', 'DD-MM-YYYY'], ['dd mmm yyyy', 'DD MMM YYYY'], ['mmm dd, yyyy', 'MMM DD, YYYY'], ['yyyy-mm-dd', 'YYYY-MM-DD']] },
      { key: 'include_time', label: 'Include Time', help: 'Asks for the time as well as the date.', kind: 'toggle' },
      { key: 'default_today', label: 'Today by Default', help: 'A new entry starts with today (and the time now).', kind: 'toggle' },
      { key: 'no_future', label: 'Block Future Dates', help: 'Dates after today cannot be picked.', kind: 'toggle' },
      { key: 'no_past', label: 'Block Past Dates', help: 'Dates before today cannot be picked.', kind: 'toggle' },
      { key: 'v', label: 'Validation', help: '', kind: 'heading' },
      { key: 'not_before', label: 'Not Before', help: 'Earlier dates are not accepted.', kind: 'date' },
      { key: 'not_after', label: 'Not After', help: 'Later dates are not accepted.', kind: 'date' },
      { key: 'error_message', label: 'Message When Wrong', help: 'Shown to the customer when the date breaks a rule.', kind: 'text' },
    ],
  },
  link: {
    title: 'Link Options',
    rows: [
      { key: 'section_id', label: 'Link to Entries of', help: 'The section whose entries the customer picks (traceability).', kind: 'select' },
      { key: 'single', label: 'One Entry Only', help: 'Off: the customer may pick several entries (e.g. all lots used).', kind: 'toggle' },
      { key: 'link_label', label: 'Show Entries As', help: 'What the customer sees when picking.', kind: 'select', options: [['', 'Ref No · Date'], ['ref', 'Ref No'], ['date', 'Date']] },
      { key: 'only_passed', label: 'Only Passed Entries', help: 'Hides entries that failed, so a failed lot cannot be used.', kind: 'toggle' },
      { key: 'v', label: 'Validation', help: '', kind: 'heading' },
      { key: 'min_pick', label: 'Pick at Least', help: 'Fewest entries the customer must pick (e.g. 2 lots).', kind: 'number', placeholder: 'No Minimum' },
    ],
  },
  pass_fail: {
    title: 'Pass / Fail Options',
    rows: [
      { key: 'preset', label: 'Words', help: 'Pick a pair, or choose Custom and type your own below.', kind: 'select', options: [...PASS_FAIL_PRESETS.map(([n]) => [n, n] as [string, string]), ['custom', 'Custom']] },
      { key: 'pass_label', label: 'Good Word', help: 'Shown for a good result (stored as pass).', kind: 'text', placeholder: 'Pass', showIf: (s) => s.preset === 'custom' },
      { key: 'fail_label', label: 'Bad Word', help: 'Shown for a bad result (stored as fail).', kind: 'text', placeholder: 'Fail', showIf: (s) => s.preset === 'custom' },
      { key: 'default_pf', label: 'Default', help: 'Preselected in every new entry.', kind: 'select', options: [['', 'None'], ['pass', 'Good Word'], ['fail', 'Bad Word']] },
      { key: 'no_fail_effect', label: 'Information Only', help: 'On: the bad word does not make the whole entry Fail.', kind: 'toggle' },
    ],
  },
}

const th = 'border border-stone-700 bg-stone-800 px-2 py-1.5 text-center text-[11px] font-bold uppercase tracking-[0.08em] text-amber-200'
const td = 'border border-[#e7e0d4] px-2 py-1.5 align-middle text-sm text-stone-800'


export function ColumnTypeSettings({
  type,
  value,
  onChange,
  linkOptions = [],
}: {
  type: string
  value: ColumnSettings
  onChange: (next: ColumnSettings) => void
  linkOptions?: Array<[string, string]>
}) {
  const spec = TYPE_SETTINGS[type]
  if (!spec) return null
  const set = (k: string, v: unknown) => onChange({ ...value, [k]: v })
  const rows = spec.rows.filter((r) => !r.showIf || r.showIf(value))
  return (
    <div className="space-y-2 border border-amber-300 bg-amber-50/40 p-3 sm:col-span-2">
      <span className="text-sm font-semibold text-stone-900">{spec.title}</span>
      <div className="border border-stone-300 bg-white">
        <table className="w-full border-collapse">
          <thead>
            <tr>
              <th className={cn(th, 'w-[13rem] text-left')}>Setting</th>
              <th className={cn(th, 'w-[14rem]')}>Choice</th>
              <th className={cn(th, 'text-left')}>What It Does</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const v = value[r.key]
              const options = r.key === 'section_id' ? [['', '— Choose Section —'] as [string, string], ...linkOptions] : r.options ?? []
              if (r.kind === 'heading') {
                return (
                  <tr key={`h-${i}`}>
                    <td colSpan={3} className="border border-stone-300 bg-stone-200/70 px-2 py-1 text-[11px] font-bold uppercase tracking-[0.12em] text-stone-700">{r.label}</td>
                  </tr>
                )
              }
              let control
              if (r.kind === 'toggle') {
                const on = Boolean(v)
                control = (
                  <button
                    type="button"
                    role="switch"
                    aria-checked={on}
                    aria-label={r.label}
                    onClick={() => set(r.key, !on)}
                    className={cn('relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition-colors', on ? 'border-emerald-700 bg-emerald-600' : 'border-red-700 bg-red-500')}
                  >
                    <span className={cn('inline-block h-5 w-5 rounded-full bg-white shadow transition-transform', on ? 'translate-x-5' : 'translate-x-0.5')} />
                  </button>
                )
              } else if (r.kind === 'select') {
                control = (
                  <select aria-label={r.label} className="h-8 w-full border border-input bg-stone-50 px-2 text-sm" value={String(v ?? options[0]?.[0] ?? '')} onChange={(e) => set(r.key, e.target.value)}>
                    {options.map(([val, label]) => <option key={val} value={val}>{label}</option>)}
                  </select>
                )
              } else if (r.kind === 'date') {
                control = (
                  <Input aria-label={r.label} type="date" className="h-8 min-h-8" value={v == null ? '' : String(v)} onChange={(e) => set(r.key, e.target.value)} />
                )
              } else {
                control = (
                  <Input
                    aria-label={r.label}
                    className="h-8 min-h-8 text-center"
                    inputMode={r.kind === 'number' ? 'decimal' : undefined}
                    placeholder={r.placeholder}
                    value={v == null ? '' : String(v)}
                    onChange={(e) => set(r.key, r.kind === 'number' ? e.target.value.replace(/[^\d.-]/g, '') : e.target.value)}
                  />
                )
              }
              return (
                <tr key={r.key} className={i % 2 ? 'bg-[#f7f3eb]' : 'bg-[#fffcf7]'}>
                  <td className={cn(td, 'font-medium')}>{r.label}</td>
                  <td className={cn(td, 'text-center')}><div className="flex justify-center">{control}</div></td>
                  <td className={cn(td, 'text-xs text-stone-600')}>{r.help}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
