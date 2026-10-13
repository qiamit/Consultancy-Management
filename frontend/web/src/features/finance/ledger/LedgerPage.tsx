import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { limsPanelClass } from '@/lib/limsThemeUi'
import { supabase } from '@/lib/supabaseClient'
import { BookChrome } from '../books/BookChrome'
import { listBankAccounts, listLedger, type BankAccountRow, type LedgerRow } from '../books/booksApi'

const TABS = [
  { id: 'debtors', label: 'Debtors' },
  { id: 'creditors', label: 'Creditors' },
  { id: 'both', label: 'Both' },
  { id: 'cash', label: 'Cash' },
  { id: 'bank:unassigned', label: 'Unassigned Bank' },
  { id: 'tds_receivable', label: 'TDS Receivable' },
  { id: 'other', label: 'Other Accounts' },
]

type LedgerEntry = {
  id: string
  receipt_number: string | null
  txn_date: string
  amount: number
  mode_of_payment: string | null
  payment_flow: string
  description: string | null
  bank_account_id: string | null
  client_name: string
  tds_amount: number
  tds_percent: number
  book: string
}

export default function LedgerPage() {
  const [tab, setTab] = useState('debtors')
  const [rows, setRows] = useState<LedgerRow[]>([])
  const [bankAccounts, setBankAccounts] = useState<BankAccountRow[]>([])
  const [selectedLedger, setSelectedLedger] = useState<LedgerRow | null>(null)
  const [entries, setEntries] = useState<LedgerEntry[]>([])
  const [entriesLoading, setEntriesLoading] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const navigate = useNavigate()

  useEffect(() => {
    void listBankAccounts().then(setBankAccounts).catch((err: unknown) => {
      setMessage(err instanceof Error ? err.message : 'Bank accounts could not be loaded')
    })
  }, [])

  useEffect(() => {
    void listLedger(tab)
      .then((next) => {
        setRows(next)
        setMessage(null)
      })
      .catch((err: unknown) => setMessage(err instanceof Error ? err.message : 'Ledger could not be loaded'))
  }, [tab])

  const openLedger = (row: LedgerRow) => {
    setSelectedLedger(row)
    setEntries([])
    setEntriesLoading(true)
    let query = supabase
      .from('transactions')
      .select('id, receipt_number, txn_date, amount, mode_of_payment, payment_flow, description, bank_account_id, tds_amount, tds_percent, tds_taxable_amount, extra, client:clients(company_name)')
      .order('txn_date', { ascending: false })
      .limit(500)
    if (tab === 'cash') query = query.eq('mode_of_payment', 'cash')
    else if (tab.startsWith('bank:')) {
      const bankId = tab.slice(5)
      query = bankId === 'unassigned'
        ? query.in('mode_of_payment', ['bank', 'neft_rtgs']).is('bank_account_id', null)
        : query.eq('bank_account_id', bankId)
    } else if (tab === 'tds_receivable') query = query.eq('client_id', row.party_id).eq('payment_flow', 'in')
    else if (tab === 'debtors' || tab === 'both') query = query.eq('client_id', row.party_id).eq('payment_flow', 'in')
    else if (tab === 'creditors') query = query.eq('client_id', row.party_id).eq('payment_flow', 'out')
    void (async () => {
      try {
        const { data, error } = await query
        if (error) throw error
        setEntries((data ?? []).map((raw) => {
          const row = raw as Record<string, unknown>
          const client = row.client as { company_name?: string | null } | null
          const extra = row.extra as Record<string, unknown> | null
          return {
            id: String(row.id ?? ''),
            receipt_number: typeof row.receipt_number === 'string' ? row.receipt_number : null,
            txn_date: String(row.txn_date ?? '').slice(0, 10),
            amount: Number(row.amount) || 0,
            mode_of_payment: typeof row.mode_of_payment === 'string' ? row.mode_of_payment : null,
            payment_flow: String(row.payment_flow ?? ''),
            description: typeof row.description === 'string' ? row.description : null,
            bank_account_id: typeof row.bank_account_id === 'string' ? row.bank_account_id : null,
            client_name: client?.company_name ?? '',
            tds_amount: Number(row.tds_amount) || (Number(row.tds_taxable_amount ?? row.amount) * (Number(row.tds_percent) || 0) / 100),
            tds_percent: Number(row.tds_percent) || 0,
            book: String(extra?.book ?? ''),
          }
        }))
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Ledger entries could not be loaded')
      } finally {
        setEntriesLoading(false)
      }
    })()
  }

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
          {bankAccounts.map((account) => (
            <Button key={account.id} type="button" variant={tab === `bank:${account.id}` ? 'default' : 'outline'} className="min-h-10" onClick={() => setTab(`bank:${account.id}`)}>
              {account.account_name}
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
                    <td className="py-2 pr-3"><button type="button" className="font-medium underline decoration-stone-400 underline-offset-2" onClick={() => openLedger(row)}>{row.party_name || row.party_id || 'Unnamed party'}</button></td>
                    <td className="py-2 pr-3">{row.detail}</td>
                    <td className="py-2 pr-3 text-right tabular-nums">{row.balance.toFixed(2)} {row.balance_side}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <Dialog open={selectedLedger != null} onOpenChange={(open) => { if (!open) setSelectedLedger(null) }}>
        <DialogContent className="max-h-[85vh] max-w-4xl overflow-y-auto rounded-none">
          <DialogHeader><DialogTitle>{selectedLedger?.party_name || 'Ledger'} entries</DialogTitle></DialogHeader>
          {entriesLoading ? <p className="text-sm text-stone-600">Loading entries…</p> : null}
          {!entriesLoading && !entries.length ? <p className="text-sm text-stone-600">No transaction entries for this ledger.</p> : null}
          {entries.length ? <div className="overflow-x-auto"><table className="w-full min-w-[680px] text-sm"><thead><tr className="border-b border-stone-300 text-left"><th className="py-2 pr-3">Date</th><th className="py-2 pr-3">Voucher</th><th className="py-2 pr-3">Party / Detail</th><th className="py-2 pr-3 text-right">Amount</th><th className="py-2 pr-3 text-right">TDS</th><th className="py-2 pr-3">Action</th></tr></thead><tbody>{entries.map((entry) => <tr key={entry.id} className="border-b border-stone-200"><td className="py-2 pr-3">{entry.txn_date}</td><td className="py-2 pr-3">{entry.receipt_number || '—'}</td><td className="py-2 pr-3">{entry.client_name || entry.description || entry.mode_of_payment || '—'}</td><td className="py-2 pr-3 text-right">{entry.amount.toFixed(2)} {entry.payment_flow === 'out' ? 'Cr' : 'Dr'}</td><td className="py-2 pr-3 text-right">{entry.tds_amount.toFixed(2)}</td><td className="py-2 pr-3"><Button type="button" variant="outline" size="sm" onClick={() => {
            const route = entry.payment_flow !== 'out' ? '/finance/sale/payment-receipt' : entry.book === 'refund' ? '/finance/sale/refund' : '/finance/purchase/payment'
            navigate(`${route}?edit=${encodeURIComponent(entry.id)}`)
          }}>Edit</Button></td></tr>)}</tbody></table></div> : null}
          <p className="text-xs text-stone-600">Edit opens the receipt/payment form, where module permissions apply. Changes are recorded in the finance audit log.</p>
        </DialogContent>
      </Dialog>
    </BookChrome>
  )
}
