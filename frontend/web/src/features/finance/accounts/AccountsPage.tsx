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
  addAccount,
  addBankAccount,
  listAccounts,
  listBankAccounts,
  type AccountRow,
  type BankAccountRow,
} from '../books/booksApi'

const TYPES = ['asset', 'liability', 'equity', 'income', 'expense']

export default function AccountsPage() {
  const [rows, setRows] = useState<AccountRow[]>([])
  const [name, setName] = useState('')
  const [accountType, setAccountType] = useState('asset')
  const [bankAccounts, setBankAccounts] = useState<BankAccountRow[]>([])
  const [bankAccountName, setBankAccountName] = useState('')
  const [bankName, setBankName] = useState('')
  const [bankLast4, setBankLast4] = useState('')
  const [bankIfsc, setBankIfsc] = useState('')
  const [message, setMessage] = useState<string | null>(null)

  const load = () => {
    void listAccounts()
      .then(setRows)
      .catch((err: unknown) => setMessage(err instanceof Error ? err.message : 'Accounts could not be loaded'))
    void listBankAccounts()
      .then(setBankAccounts)
      .catch((err: unknown) => setMessage(err instanceof Error ? err.message : 'Bank accounts could not be loaded'))
  }

  useEffect(() => {
    load()
  }, [])

  const save = () => {
    if (!name.trim()) return
    void addAccount(name, accountType)
      .then(() => {
        setName('')
        setMessage('Account added.')
        load()
      })
      .catch((err: unknown) => setMessage(err instanceof Error ? err.message : 'Save failed'))
  }

  const saveBankAccount = () => {
    if (!bankAccountName.trim()) return
    void addBankAccount({
      accountName: bankAccountName,
      bankName,
      accountNumberLast4: bankLast4,
      ifsc: bankIfsc,
    })
      .then(() => {
        setBankAccountName('')
        setBankName('')
        setBankLast4('')
        setBankIfsc('')
        setMessage('Bank account added.')
        load()
      })
      .catch((err: unknown) => setMessage(err instanceof Error ? err.message : 'Bank account could not be saved'))
  }

  return (
    <BookChrome title="Chart of Accounts" hint="Sale and purchase documents stay in their own books. These accounts are for the manual journal.">
      <div className={`${limsPanelClass} space-y-3`}>
        {message ? <p className="text-sm text-stone-700">{message}</p> : null}
        {rows.length === 0 ? <p className="text-sm text-stone-600">No accounts yet.</p> : (
          <div className="overflow-x-auto">
            <table className="auto-cards list-cards w-full min-w-[480px] text-sm">
              <thead>
                <tr className="border-b border-stone-300 text-left">
                  <th className="py-2 pr-3">Account</th>
                  <th className="py-2 pr-3">Type</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className="border-b border-stone-200">
                    <td className="py-2 pr-3">{row.account_name}</td>
                    <td className="py-2 pr-3 capitalize">{row.account_type}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="grid grid-cols-1 gap-3 border border-stone-300 p-3 sm:grid-cols-3">
          <div className="space-y-2">
            <Label htmlFor="account-name">Account name</Label>
            <Input id="account-name" className="min-h-10" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Type</Label>
            <Select value={accountType} onValueChange={setAccountType}>
              <SelectTrigger className="min-h-10"><SelectValue /></SelectTrigger>
              <SelectContent>
                {TYPES.map((type) => (
                  <SelectItem key={type} value={type}>{type}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-end">
            <Button type="button" className="min-h-10" onClick={save}>Add Account</Button>
          </div>
        </div>
        <section className="space-y-3 border border-stone-300 p-3">
          <div>
            <h2 className="font-semibold">Bank Accounts</h2>
            <p className="text-xs text-stone-600">Receipts can be assigned to a specific account. Only the last four account digits are stored here.</p>
          </div>
          {bankAccounts.length ? (
            <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {bankAccounts.map((account) => (
                <li key={account.id} className="border border-stone-300 p-2 text-sm">
                  <span className="font-semibold">{account.account_name}</span>
                  {account.bank_name ? <span> · {account.bank_name}</span> : null}
                  {account.account_number_last4 ? <span> · •••• {account.account_number_last4}</span> : null}
                  {account.ifsc ? <span className="block text-xs text-stone-600">{account.ifsc}</span> : null}
                </li>
              ))}
            </ul>
          ) : <p className="text-sm text-stone-600">No bank accounts configured.</p>}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <div className="space-y-2"><Label htmlFor="bank-account-label">Account name</Label><Input id="bank-account-label" className="min-h-10" value={bankAccountName} onChange={(e) => setBankAccountName(e.target.value)} /></div>
            <div className="space-y-2"><Label htmlFor="bank-name">Bank</Label><Input id="bank-name" className="min-h-10" value={bankName} onChange={(e) => setBankName(e.target.value)} /></div>
            <div className="space-y-2"><Label htmlFor="bank-last4">Account last four digits</Label><Input id="bank-last4" inputMode="numeric" maxLength={4} className="min-h-10" value={bankLast4} onChange={(e) => setBankLast4(e.target.value.replace(/\D/g, '').slice(0, 4))} /></div>
            <div className="space-y-2"><Label htmlFor="bank-ifsc">IFSC</Label><Input id="bank-ifsc" className="min-h-10 uppercase" value={bankIfsc} onChange={(e) => setBankIfsc(e.target.value.toUpperCase())} /></div>
            <div className="flex items-end"><Button type="button" className="min-h-10 w-full" onClick={saveBankAccount} disabled={!bankAccountName.trim()}>Add Bank Account</Button></div>
          </div>
        </section>
      </div>
    </BookChrome>
  )
}
