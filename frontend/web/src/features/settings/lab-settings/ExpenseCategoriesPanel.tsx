import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { addExpenseCategory, listExpenseCategories, type ExpenseCategory } from '@/features/finance/books/booksApi'

export function ExpenseCategoriesPanel() {
  const [rows, setRows] = useState<ExpenseCategory[]>([])
  const [name, setName] = useState('')
  const [message, setMessage] = useState<string | null>(null)

  const load = () => {
    void listExpenseCategories()
      .then(setRows)
      .catch((err: unknown) => setMessage(err instanceof Error ? err.message : 'Categories could not be loaded'))
  }

  useEffect(() => {
    load()
  }, [])

  const add = () => {
    const next = name.trim()
    if (!next) return
    void addExpenseCategory(next)
      .then(() => {
        setName('')
        setMessage(`Added ${next}.`)
        load()
      })
      .catch((err: unknown) => setMessage(err instanceof Error ? err.message : 'Category could not be added'))
  }

  return (
    <section className="space-y-3 border border-stone-300 p-3">
      <h3 className="text-sm font-semibold text-stone-800">Expense Categories</h3>
      <p className="text-xs text-stone-600">Salary, Travel, Taxes, Rent and Other are seeded. Add more here or on the expense form.</p>
      {rows.length === 0 ? <p className="text-sm text-stone-600">No Categories Yet.</p> : (
        <ul className="flex flex-wrap gap-2">
          {rows.map((row) => (
            <li key={row.id} className="border border-stone-300 px-2 py-1 text-sm">{row.name}</li>
          ))}
        </ul>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <Input className="min-h-10 max-w-xs" aria-label="New Expense Category" value={name} onChange={(e) => setName(e.target.value)} />
        <Button type="button" className="min-h-10" onClick={add}>Add Category</Button>
      </div>
      {message ? <p className="text-sm text-stone-700">{message}</p> : null}
    </section>
  )
}
