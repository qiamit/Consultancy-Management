import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { limsPanelClass } from '@/lib/limsThemeUi'
import { BookChrome } from '../books/BookChrome'
import {
  listAccounts,
  listJournals,
  nextJournalNumber,
  saveJournal,
  type AccountRow,
  type JournalRow,
} from '../books/booksApi'

export default function JournalPage() {
  const [accounts, setAccounts] = useState<AccountRow[]>([])
  const [rows, setRows] = useState<JournalRow[]>([])
  const [open, setOpen] = useState(false)
  const [number, setNumber] = useState('')
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [name, setName] = useState('')
  const [debitAccount, setDebitAccount] = useState('')
  const [creditAccount, setCreditAccount] = useState('')
  const [amount, setAmount] = useState('')
  const [message, setMessage] = useState<string | null>(null)

  const load = () => {
    void Promise.all([listAccounts(), listJournals()])
      .then(([nextAccounts, journals]) => {
        setAccounts(nextAccounts)
        setRows(journals)
      })
      .catch((err: unknown) => setMessage(err instanceof Error ? err.message : 'Journal could not be loaded'))
  }

  useEffect(() => {
    load()
  }, [])

  const start = () => {
    setName('')
    setAmount('')
    setDate(new Date().toISOString().slice(0, 10))
    setDebitAccount(accounts[0]?.id ?? '')
    setCreditAccount(accounts[1]?.id ?? accounts[0]?.id ?? '')
    setOpen(true)
    void nextJournalNumber().then(setNumber)
  }

  const save = () => {
    const value = Number(amount)
    if (!debitAccount || !creditAccount || debitAccount === creditAccount || !Number.isFinite(value) || value <= 0) {
      setMessage('Choose two different accounts and enter an amount.')
      return
    }
    void saveJournal({
      number,
      date,
      name,
      lines: [
        { account_id: debitAccount, debit: value, credit: 0 },
        { account_id: creditAccount, debit: 0, credit: value },
      ],
    })
      .then(() => {
        setOpen(false)
        setMessage('Journal saved. Debit and credit balance.')
        load()
      })
      .catch((err: unknown) => setMessage(err instanceof Error ? err.message : 'Save failed'))
  }

  return (
    <BookChrome title="Manual Journal" hint="A journal is saved only when debit equals credit. It is for adjustments.">
      <div className={`${limsPanelClass} space-y-3`}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Button type="button" className="min-h-10" onClick={start}>Add New Journal</Button>
          {message ? <p className="text-sm text-stone-700">{message}</p> : null}
        </div>
        {rows.length === 0 ? <p className="text-sm text-stone-600">No journals added yet.</p> : (
          <ul className="space-y-1 text-sm">
            {rows.map((row) => (
              <li key={row.id}>{row.journal_number} · {row.journal_date} · {row.journal_name || 'Adjustment'}</li>
            ))}
          </ul>
        )}
        {open ? (
          <div className="grid grid-cols-1 gap-3 border border-stone-300 p-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="journal-number">Journal number</Label>
              <Input id="journal-number" className="min-h-10" value={number} onChange={(e) => setNumber(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="journal-date">Date</Label>
              <Input id="journal-date" className="min-h-10" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="journal-name">Journal name</Label>
              <Input id="journal-name" className="min-h-10" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Debit account</Label>
              <Select value={debitAccount || 'none'} onValueChange={(value) => setDebitAccount(value === 'none' ? '' : value)}>
                <SelectTrigger className="min-h-10"><SelectValue placeholder="Select an account" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Select an account</SelectItem>
                  {accounts.map((row) => <SelectItem key={row.id} value={row.id}>{row.account_name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Credit account</Label>
              <Select value={creditAccount || 'none'} onValueChange={(value) => setCreditAccount(value === 'none' ? '' : value)}>
                <SelectTrigger className="min-h-10"><SelectValue placeholder="Select an account" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Select an account</SelectItem>
                  {accounts.map((row) => <SelectItem key={row.id} value={row.id}>{row.account_name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="journal-amount">Amount</Label>
              <Input id="journal-amount" className="min-h-10" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
            </div>
            <div className="flex items-end gap-2">
              <Button type="button" className="min-h-10" onClick={save}>Save Journal</Button>
              <Button type="button" variant="outline" className="min-h-10" onClick={() => setOpen(false)}>Close</Button>
            </div>
          </div>
        ) : null}
      </div>
    </BookChrome>
  )
}
