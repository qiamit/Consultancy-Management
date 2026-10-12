import { useRef } from 'react'
import { FileSpreadsheet, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { limsOutlineBtnClass } from '@/lib/limsThemeUi'
import { cn } from '@/lib/utils'
import { importCmpfSpreadsheetRows } from './cmpfSpreadsheetImport'
import { cmpf307RowHasContent, type Cmpf307BrandRow, type Cmpf307ModulePayload } from './cmpf307Model'

const thClass = 'bg-stone-800 text-center text-[10px] font-bold uppercase tracking-[0.12em] text-amber-200'

export function Cmpf307ModuleFields({
  value,
  onChange,
  disabled = false,
}: {
  value: Cmpf307ModulePayload
  onChange: (next: Cmpf307ModulePayload) => void
  disabled?: boolean
}) {
  const fileRef = useRef<HTMLInputElement | null>(null)

  const importSpreadsheet = async (file: File) => {
    try {
      const rows = await importCmpfSpreadsheetRows<Cmpf307BrandRow>(
        file,
        [
          { key: 'brandName', aliases: ['brand name', 'brand names', 'brand trade name', 'trade mark', 'trademark', 'trade name'] },
          { key: 'ownedBy', aliases: ['owned by', 'owned by self or others', 'owner', 'ownership'] },
          { key: 'registeredStatus', aliases: ['registered status', 'registered unregistered', 'registration status', 'registered'] },
          { key: 'registrationDate', aliases: ['date of registration', 'date of registration introduction', 'registration introduction date', 'date of introduction'] },
        ],
        cmpf307RowHasContent,
      )
      if (!rows.length) {
        toast.error('No brand rows were found in the selected spreadsheet.')
        return
      }
      onChange({ ...value, rows: [...value.rows, ...rows] })
      toast.success(`Imported ${rows.length} brand row(s).`)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to import the spreadsheet.')
    } finally {
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-3 sm:p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-[11px] font-bold uppercase tracking-[0.14em] text-stone-600">CMPF-307 · Brand Names</h2>
          <p className="mt-1 text-xs text-stone-500">Import rows from an Excel workbook; imported entries are added to the current list.</p>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept=".xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv"
          className="hidden"
          disabled={disabled}
          onChange={(event) => {
            const file = event.target.files?.[0]
            if (file) void importSpreadsheet(file)
          }}
        />
        <Button type="button" variant="outline" size="sm" className={cn(limsOutlineBtnClass, 'h-8')} disabled={disabled} onClick={() => fileRef.current?.click()}>
          <FileSpreadsheet className="mr-1.5 h-4 w-4" aria-hidden /> Import Excel
        </Button>
      </div>

      <div className="min-h-0 overflow-auto border-2 border-stone-500 bg-white">
        <Table className="w-full min-w-[760px] border-collapse [&_td]:border [&_td]:border-stone-400 [&_th]:border [&_th]:border-stone-700">
          <TableHeader>
            <TableRow className="border-stone-700 hover:bg-transparent">
              <TableHead className={cn(thClass, 'w-[5%]')}>Sr.</TableHead>
              <TableHead className={cn(thClass, 'w-[35%]')}>Brand / Trade-Mark</TableHead>
              <TableHead className={cn(thClass, 'w-[18%]')}>Owned by Self / Others</TableHead>
              <TableHead className={cn(thClass, 'w-[20%]')}>Registered / Unregistered</TableHead>
              <TableHead className={cn(thClass, 'w-[18%]')}>Registration / Introduction Date</TableHead>
              <TableHead className={cn(thClass, 'w-[4%]')}>Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {value.rows.length ? value.rows.map((row, index) => (
              <TableRow key={`cmpf307-${index}-${row.brandName}`}>
                <TableCell className="text-center">{index + 1}</TableCell>
                <TableCell>{row.brandName || '—'}</TableCell>
                <TableCell>{row.ownedBy || '—'}</TableCell>
                <TableCell>{row.registeredStatus || '—'}</TableCell>
                <TableCell>{row.registrationDate || '—'}</TableCell>
                <TableCell className="text-center">
                  <Button type="button" variant="outline" size="icon" className="h-7 w-7" disabled={disabled} aria-label={`Remove brand ${row.brandName}`} onClick={() => onChange({ ...value, rows: value.rows.filter((_, rowIndex) => rowIndex !== index) })}>
                    <Trash2 className="h-4 w-4 text-red-700" aria-hidden />
                  </Button>
                </TableCell>
              </TableRow>
            )) : (
              <TableRow><TableCell colSpan={6} className="py-8 text-center text-sm text-stone-500">No brand rows yet. Import an Excel workbook to add rows.</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <label className="space-y-1 text-sm font-medium text-stone-800">
        Brand / Trade Names that will not carry the BIS Certification Mark — reasons
        <textarea
          className="min-h-20 w-full resize-y border border-stone-500 bg-stone-50 px-3 py-2 text-sm font-normal text-stone-900 outline-none focus:border-amber-600 focus:bg-white focus:ring-2 focus:ring-amber-500/20 disabled:cursor-not-allowed disabled:opacity-60"
          value={value.brandsWithoutMarkReasons}
          disabled={disabled}
          onChange={(event) => onChange({ ...value, brandsWithoutMarkReasons: event.target.value })}
        />
      </label>
    </div>
  )
}
