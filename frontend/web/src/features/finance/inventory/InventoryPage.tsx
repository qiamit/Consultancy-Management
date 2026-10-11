import { useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { limsPanelClass } from '@/lib/limsThemeUi'
import { BookChrome } from '../books/BookChrome'
import { listProductStock, type StockRow } from '../books/booksApi'
import { InventorySettingsPanel } from './InventorySettingsPanel'

export default function InventoryPage() {
  const [tab, setTab] = useState<'items' | 'category' | 'settings'>('items')
  const [rows, setRows] = useState<StockRow[]>([])
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    void listProductStock()
      .then(setRows)
      .catch((err: unknown) => setMessage(err instanceof Error ? err.message : 'Stock could not be loaded'))
  }, [])

  const categories = useMemo(() => {
    const map = new Map<string, { count: number; stock: number }>()
    for (const row of rows) {
      const name = row.item_category || 'Uncategorised'
      const current = map.get(name) ?? { count: 0, stock: 0 }
      current.count += 1
      current.stock += row.stock_on_hand
      map.set(name, current)
    }
    return [...map.entries()]
  }, [rows])

  return (
    <BookChrome title="Inventory" hint="Items come from the Products master. Nothing is copied from another software.">
      <div className={`${limsPanelClass} space-y-3`}>
        <div className="flex flex-wrap gap-2">
          <Button type="button" className="min-h-10" variant={tab === 'items' ? 'default' : 'outline'} onClick={() => setTab('items')}>All Items</Button>
          <Button type="button" className="min-h-10" variant={tab === 'category' ? 'default' : 'outline'} onClick={() => setTab('category')}>Category</Button>
          <Button type="button" className="min-h-10" variant={tab === 'settings' ? 'default' : 'outline'} onClick={() => setTab('settings')}>Settings</Button>
        </div>
        {message ? <p className="text-sm text-red-700">{message}</p> : null}
        {tab === 'settings' ? <InventorySettingsPanel /> : null}
        {tab === 'items' && rows.length === 0 ? <p className="text-sm text-stone-600">No products in stock view yet.</p> : null}
        {tab === 'items' && rows.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b border-stone-300 text-left">
                  <th className="py-2 pr-3">Item</th>
                  <th className="py-2 pr-3">Category</th>
                  <th className="py-2 pr-3">HSN</th>
                  <th className="py-2 pr-3 text-right">Stock</th>
                  <th className="py-2 pr-3">Alert</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.product_id} className="border-b border-stone-200">
                    <td className="py-2 pr-3">{row.item_name}</td>
                    <td className="py-2 pr-3">{row.item_category || '—'}</td>
                    <td className="py-2 pr-3">{row.hsn_code || '—'}</td>
                    <td className="py-2 pr-3 text-right tabular-nums">{row.stock_on_hand.toFixed(2)}</td>
                    <td className="py-2 pr-3">{row.low_stock ? 'Low stock' : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
        {tab === 'category' && categories.length === 0 ? <p className="text-sm text-stone-600">No categories yet.</p> : null}
        {tab === 'category' && categories.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[480px] text-sm">
              <thead>
                <tr className="border-b border-stone-300 text-left">
                  <th className="py-2 pr-3">Category</th>
                  <th className="py-2 pr-3 text-right">Items</th>
                  <th className="py-2 pr-3 text-right">Stock</th>
                </tr>
              </thead>
              <tbody>
                {categories.map(([name, value]) => (
                  <tr key={name} className="border-b border-stone-200">
                    <td className="py-2 pr-3">{name}</td>
                    <td className="py-2 pr-3 text-right tabular-nums">{value.count}</td>
                    <td className="py-2 pr-3 text-right tabular-nums">{value.stock.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </div>
    </BookChrome>
  )
}
