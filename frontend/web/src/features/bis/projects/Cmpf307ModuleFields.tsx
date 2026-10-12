import { useRef } from 'react'
import { FileSpreadsheet, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { limsOutlineBtnClass } from '@/lib/limsThemeUi'
import { cn } from '@/lib/utils'
import { importCmpfSpreadsheetRows } from './cmpfSpreadsheetImport'
import { cmpf307RowHasContent, type Cmpf307BrandRow, type Cmpf307ModulePayload } from './cmpf307Model'

const inputClass = 'h-9 w-full border border-stone-400 bg-white px-2 text-sm text-stone-900 outline-none focus:border-amber-600 focus:ring-2 focus:ring-amber-500/20 disabled:opacity-60'
const labelClass = 'flex flex-col gap-1 text-xs font-semibold text-stone-700'
const headers = ['Sr. No.', 'Brand Name / Trade Mark(s) to be marked on BIS Standard Mark product (include actual design depiction)', 'Owned by Self / Others', 'Registered / Unregistered', 'Date of Introduction', 'Action']

export function Cmpf307ModuleFields({ value, onChange, disabled = false }: {
  value: Cmpf307ModulePayload
  onChange: (next: Cmpf307ModulePayload) => void
  disabled?: boolean
}) {
  const fileRef = useRef<HTMLInputElement | null>(null)
  const updateRow = (index: number, patch: Partial<Cmpf307BrandRow>) => onChange({
    ...value,
    rows: value.rows.map((row, rowIndex) => rowIndex === index ? { ...row, ...patch } : row),
  })

  const importSpreadsheet = async (file: File) => {
    try {
      const rows = await importCmpfSpreadsheetRows<Cmpf307BrandRow>(file, [
        { key: 'brandName', aliases: ['brand name', 'brand names', 'brand trade name', 'trade mark', 'trademark', 'trade name'] },
        { key: 'ownedBy', aliases: ['owned by', 'owned by self or others', 'owner', 'ownership'] },
        { key: 'registeredStatus', aliases: ['registered status', 'registered unregistered', 'registration status', 'registered'] },
        { key: 'registrationDate', aliases: ['date of registration', 'date of registration introduction', 'registration introduction date', 'date of introduction'] },
      ], cmpf307RowHasContent)
      if (!rows.length) { toast.error('No brand rows were found in the selected spreadsheet.'); return }
      const existing = value.rows.filter(cmpf307RowHasContent)
      onChange({ ...value, rows: [...existing, ...rows] })
      toast.success(`Imported ${rows.length} brand row(s).`)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to import the spreadsheet.')
    } finally { if (fileRef.current) fileRef.current.value = '' }
  }

  return <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-3 sm:p-5">
    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-stone-300 pb-3">
      <h2 className="text-sm font-bold uppercase tracking-wide text-stone-800">Annex G · CMPF-307</h2>
      <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv" className="hidden" disabled={disabled} onChange={(e) => { const file = e.target.files?.[0]; if (file) void importSpreadsheet(file) }} />
      <Button type="button" variant="outline" size="sm" className={cn(limsOutlineBtnClass, 'h-8')} disabled={disabled} onClick={() => fileRef.current?.click()}><FileSpreadsheet className="mr-1.5 h-4 w-4" aria-hidden />Import Excel</Button>
    </div>

    <section className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="text-sm font-bold text-stone-800">5. Brand names / trade marks to be marked on BIS Standard Mark product</h3><Button type="button" variant="outline" size="sm" disabled={disabled} className={cn(limsOutlineBtnClass, 'h-8')} onClick={() => onChange({ ...value, rows: [...value.rows, { brandName: '', ownedBy: '', registeredStatus: '', registrationDate: '' }] })}><Plus className="mr-1 h-4 w-4" aria-hidden />Add Brand</Button></div>
      <div className="overflow-x-auto border border-stone-400 bg-white"><table className="w-full min-w-[900px] table-fixed border-collapse text-xs"><thead><tr>{headers.map((header, i) => <th key={header} className={cn('border border-stone-700 bg-stone-800 px-2 py-2 font-bold text-amber-200', i === 0 || i === 5 ? 'w-[7%]' : i === 1 ? 'w-[39%]' : 'w-[16%]')}>{header}</th>)}</tr></thead><tbody>
        {value.rows.map((row, index) => <tr key={`cmpf307-${index}`} className="odd:bg-stone-50"> <td className="border border-stone-300 p-2 text-center">{index + 1}</td>
          <td className="border border-stone-300 p-1"><textarea aria-label={`Brand name or trade mark row ${index + 1}`} className={cn(inputClass, 'h-14 resize-y')} value={row.brandName} disabled={disabled} onChange={(e) => updateRow(index, { brandName: e.target.value })} /></td>
          <td className="border border-stone-300 p-1"><input aria-label={`Owner row ${index + 1}`} className={inputClass} value={row.ownedBy} disabled={disabled} onChange={(e) => updateRow(index, { ownedBy: e.target.value })} placeholder="Self / Others" /></td>
          <td className="border border-stone-300 p-1"><input aria-label={`Registration status row ${index + 1}`} className={inputClass} value={row.registeredStatus} disabled={disabled} onChange={(e) => updateRow(index, { registeredStatus: e.target.value })} placeholder="Registered / Unregistered" /></td>
          <td className="border border-stone-300 p-1"><input aria-label={`Date of introduction row ${index + 1}`} className={inputClass} value={row.registrationDate} disabled={disabled} onChange={(e) => updateRow(index, { registrationDate: e.target.value })} /></td>
          <td className="border border-stone-300 p-1 text-center"><Button type="button" variant="outline" size="icon" aria-label={`Delete brand row ${index + 1}`} className="h-8 w-8" disabled={disabled || value.rows.length === 1} onClick={() => onChange({ ...value, rows: value.rows.filter((_, rowIndex) => rowIndex !== index) })}><Trash2 className="h-4 w-4 text-red-700" aria-hidden /></Button></td>
        </tr>)}
      </tbody></table></div>
    </section>

    <label className={labelClass}>6. Other Brand Names / Trade Marks used for the same product without BIS Standard Mark — give reasons<textarea className={cn(inputClass, 'min-h-20 resize-y py-2')} value={value.brandsWithoutMarkReasons} disabled={disabled} onChange={(e) => onChange({ ...value, brandsWithoutMarkReasons: e.target.value })} /></label>
  </div>
}
