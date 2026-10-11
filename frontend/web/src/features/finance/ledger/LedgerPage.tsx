import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { limsPanelClass } from '@/lib/limsThemeUi'
import { BookChrome } from '../books/BookChrome'
import { listLedger, type LedgerRow } from '../books/booksApi'

const TABS = [
  { id: 'debtors', label: 'Debtors' },
  { id: 'creditors', label: 'Creditors' },
  { id: 'both', label: 'Both' },
  { id: 'cash_bank', label: 'Cash and Bank' },
  { id: 'other', label: 'Other Accounts' },
]

export default function LedgerPage() {
  const [tab, setTab] = useState('debtors')
  const [rows, setRows] = useState<LedgerRow[]>([])
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    void listLedger(tab)
      .then((next) => {
        setRows(next)
        setMessage(null)
      })
      .catch((err: unknown) => setMessage(err instanceof Error ? err.message : 'Ledger could not be loaded'))
  }, [tab])

  return (
    <BookChrome title="Ledger" hint="Debtors follow sale outstanding. Creditors follow purchase outstanding. Other accounts stay empty until the chart of accounts is used.">
      <div className={`${limsPanelClass} space-y-3`}>
        <div className="flex flex-wrap gap-2">
          {TABS.map((item) => (
            <Button
              key={item.id}
              type="button"
              variant={tab === item.id ? 'default' : 'outline'}
              className="min-h-10"
              onClick={() => setTab(item.id)}
            >
              {item.label}
            </Button>
          ))}
        </div>
        {message ? <p className="text-sm text-red-700">{message}</p> : null}
        {rows.length === 0 ? (
          <p className="text-sm text-stone-600">No ledger rows for this tab.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b border-stone-300 text-left">
                  <th className="py-2 pr-3">Name</th>
                  <th className="py-2 pr-3">Detail</th>
                  <th className="py-2 pr-3 text-right">Balance</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={`${row.party_id}-${row.party_name}-${row.balance_side}`} className="border-b border-stone-200">
                    <td className="py-2 pr-3">{row.party_name}</td>
                    <td className="py-2 pr-3">{row.detail}</td>
                    <td className="py-2 pr-3 text-right tabular-nums">{row.balance.toFixed(2)} {row.balance_side}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </BookChrome>
  )
}
