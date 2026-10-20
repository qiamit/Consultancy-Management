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
  addExpenseCategory,
  listExpenseCategories,
  listExpenses,
  nextExpenseNumber,
  saveExpense,
  type ExpenseCategory,
  type ExpenseRow,
} from '../books/booksApi'

export default function ExpensePage() {
  const [rows, setRows] = useState<ExpenseRow[]>([])
  const [categories, setCategories] = useState<ExpenseCategory[]>([])
  const [message, setMessage] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  const [number, setNumber] = useState('')
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [categoryId, setCategoryId] = useState('')
  const [amount, setAmount] = useState('')
  const [notes, setNotes] = useState('')
  const [newCategory, setNewCategory] = useState('')

  const load = () => {
    void Promise.all([listExpenses(), listExpenseCategories()])
      .then(([expenses, cats]) => {
        setRows(expenses)
        setCategories(cats)
      })
      .catch((err: unknown) => setMessage(err instanceof Error ? err.message : 'Expenses could not be loaded'))
  }

  useEffect(() => {
    load()
  }, [])

  const startNew = () => {
    setDate(new Date().toISOString().slice(0, 10))
    setAmount('')
    setNotes('')
    setCategoryId(categories[0]?.id ?? '')
    setOpen(true)
    void nextExpenseNumber().then(setNumber)
  }

  const save = () => {
    const value = Number(amount)
    if (!number.trim() || !Number.isFinite(value) || value <= 0) {
      setMessage('Enter an expense number and an amount.')
      return
    }
    void saveExpense({ number, date, categoryId, amount: value, notes })
      .then(() => {
        setOpen(false)
        setMessage('Expense saved.')
        load()
      })
      .catch((err: unknown) => setMessage(err instanceof Error ? err.message : 'Save failed'))
  }

  const addCategory = () => {
    const name = newCategory.trim()
    if (!name) return
    void addExpenseCategory(name)
      .then(async () => {
        setNewCategory('')
        const cats = await listExpenseCategories()
        setCategories(cats)
        const added = cats.find((row) => row.name.toLowerCase() === name.toLowerCase())
        if (added) setCategoryId(added.id)
      })
      .catch((err: unknown) => setMessage(err instanceof Error ? err.message : 'Category could not be added'))
  }

  return (
    <BookChrome title="Expenses" hint="Categories are shared with Lab Settings.">
      <div className={`${limsPanelClass} space-y-3`}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Button type="button" className="min-h-10" onClick={startNew}>Add New Expense</Button>
          {message ? <p className="text-sm text-stone-700">{message}</p> : null}
        </div>
        {rows.length === 0 ? (
          <p className="text-sm text-stone-600">No Expenses Added Yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="auto-cards list-cards w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b border-stone-300 text-left">
                  <th className="py-2 pr-3">Number</th>
                  <th className="py-2 pr-3">Date</th>
                  <th className="py-2 pr-3">Category</th>
                  <th className="py-2 pr-3 text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className="border-b border-stone-200">
                    <td className="py-2 pr-3">{row.expense_number}</td>
                    <td className="py-2 pr-3">{row.expense_date}</td>
                    <td className="py-2 pr-3">{row.category_name || '—'}</td>
                    <td className="py-2 pr-3 text-right tabular-nums">{row.amount.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {open ? (
          <div className="grid grid-cols-1 gap-3 border border-stone-300 p-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="expense-number">Expense Number</Label>
              <Input id="expense-number" className="min-h-10" value={number} onChange={(e) => setNumber(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="expense-date">Date</Label>
              <Input id="expense-date" className="min-h-10" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Category</Label>
              <Select value={categoryId || 'none'} onValueChange={(value) => setCategoryId(value === 'none' ? '' : value)}>
                <SelectTrigger className="min-h-10"><SelectValue placeholder="Select a Category" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No Category</SelectItem>
                  {categories.map((row) => (
                    <SelectItem key={row.id} value={row.id}>{row.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="expense-amount">Amount</Label>
              <Input id="expense-amount" className="min-h-10" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="expense-notes">Notes</Label>
              <Input id="expense-notes" className="min-h-10" value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>
            <div className="flex flex-wrap items-end gap-2 sm:col-span-2">
              <Input className="min-h-10 max-w-xs" aria-label="New Category" placeholder="New Category" value={newCategory} onChange={(e) => setNewCategory(e.target.value)} />
              <Button type="button" variant="outline" className="min-h-10" onClick={addCategory}>Add Category</Button>
            </div>
            <div className="flex gap-2 sm:col-span-2">
              <Button type="button" className="min-h-10" onClick={save}>Save Expense</Button>
              <Button type="button" variant="outline" className="min-h-10" onClick={() => setOpen(false)}>Close</Button>
            </div>
          </div>
        ) : null}
      </div>
    </BookChrome>
  )
}
