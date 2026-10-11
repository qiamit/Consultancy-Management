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
import { addAccount, listAccounts, type AccountRow } from '../books/booksApi'

const TYPES = ['asset', 'liability', 'equity', 'income', 'expense']

export default function AccountsPage() {
  const [rows, setRows] = useState<AccountRow[]>([])
  const [name, setName] = useState('')
  const [accountType, setAccountType] = useState('asset')
  const [message, setMessage] = useState<string | null>(null)

  const load = () => {
    void listAccounts()
      .then(setRows)
      .catch((err: unknown) => setMessage(err instanceof Error ? err.message : 'Accounts could not be loaded'))
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

  return (
    <BookChrome title="Chart of Accounts" hint="Sale and purchase documents stay in their own books. These accounts are for the manual journal.">
      <div className={`${limsPanelClass} space-y-3`}>
        {message ? <p className="text-sm text-stone-700">{message}</p> : null}
        {rows.length === 0 ? <p className="text-sm text-stone-600">No accounts yet.</p> : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[480px] text-sm">
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
      </div>
    </BookChrome>
  )
}
