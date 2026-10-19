import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { limsPanelClass } from '@/lib/limsThemeUi'
import { BookChrome } from '../books/BookChrome'
import { currentFinancialYear, listStatement, type StatementRow } from '../books/booksApi'

export default function StatementsPage() {
  const year = currentFinancialYear()
  const [kind, setKind] = useState<'profit_loss' | 'balance_sheet'>('profit_loss')
  const [from, setFrom] = useState(year.from)
  const [to, setTo] = useState(year.to)
  const [rows, setRows] = useState<StatementRow[]>([])
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    void listStatement(kind, from, to)
      .then((next) => {
        setRows(next)
        setMessage(null)
      })
      .catch((err: unknown) => setMessage(err instanceof Error ? err.message : 'Statement could not be loaded'))
  }, [kind, from, to])

  const profit = rows.filter((row) => row.section === 'income').reduce((sum, row) => sum + row.amount, 0)
  const expense = rows.filter((row) => row.section === 'expense').reduce((sum, row) => sum + row.amount, 0)

  return (
    <BookChrome title="Statements" hint="Profit and loss uses the date range. The balance sheet is as of the end date.">
      <div className={`${limsPanelClass} space-y-3`}>
        <div className="flex flex-wrap gap-2">
          <Button type="button" className="min-h-10" variant={kind === 'profit_loss' ? 'default' : 'outline'} onClick={() => setKind('profit_loss')}>Profit and Loss</Button>
          <Button type="button" className="min-h-10" variant={kind === 'balance_sheet' ? 'default' : 'outline'} onClick={() => setKind('balance_sheet')}>Balance Sheet</Button>
        </div>
        <div className="flex flex-wrap gap-3">
          <div className="space-y-2">
            <Label htmlFor="statement-from">From</Label>
            <Input id="statement-from" className="min-h-10" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="statement-to">To</Label>
            <Input id="statement-to" className="min-h-10" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
        </div>
        {message ? <p className="text-sm text-red-700">{message}</p> : null}
        {rows.length === 0 ? <p className="text-sm text-stone-600">No figures for this range.</p> : (
          <div className="overflow-x-auto">
            <table className="auto-cards list-cards w-full min-w-[480px] text-sm">
              <tbody>
                {rows.map((row) => (
                  <tr key={`${row.section}-${row.label}`} className="border-b border-stone-200">
                    <td className="py-2 pr-3 capitalize">{row.section}</td>
                    <td className="py-2 pr-3">{row.label}</td>
                    <td className="py-2 pr-3 text-right tabular-nums">{row.amount.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {kind === 'profit_loss' ? (
          <p className="text-sm font-medium text-stone-800">Net {profit - expense >= 0 ? 'profit' : 'loss'} {Math.abs(profit - expense).toFixed(2)}</p>
        ) : null}
      </div>
    </BookChrome>
  )
}
