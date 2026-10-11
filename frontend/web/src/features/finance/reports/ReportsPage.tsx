import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { limsPanelClass } from '@/lib/limsThemeUi'
import { listInvoiceAgeing } from '@/features/finance/sale/shared/invoiceBalanceApi'
import { BookChrome } from '../books/BookChrome'
import { currentFinancialYear, listFinanceReport, listProductStock, type ReportRow, type StockRow } from '../books/booksApi'

const REPORTS = [
  { id: 'gst_sales', label: 'GST Sales' },
  { id: 'gst_purchase', label: 'GST Purchase' },
  { id: 'party_sales', label: 'Party-wise Sales' },
  { id: 'party_purchase', label: 'Party-wise Purchase' },
  { id: 'hsn_sales', label: 'SAC / HSN Sales' },
  { id: 'tds_receivable', label: 'TDS Receivable' },
  { id: 'ageing', label: 'Ageing' },
  { id: 'stock', label: 'Current Stock' },
]

export default function ReportsPage() {
  const year = currentFinancialYear()
  const [report, setReport] = useState('gst_sales')
  const [from, setFrom] = useState(year.from)
  const [to, setTo] = useState(year.to)
  const [rows, setRows] = useState<ReportRow[]>([])
  const [stock, setStock] = useState<StockRow[]>([])
  const [ageing, setAgeing] = useState<Array<{ bucket: string; invoice_count: number; outstanding: number }>>([])
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    if (report === 'stock') {
      void listProductStock()
        .then((next) => {
          setStock(next)
          setMessage(null)
        })
        .catch((err: unknown) => setMessage(err instanceof Error ? err.message : 'Report could not be loaded'))
      return
    }
    if (report === 'ageing') {
      void listInvoiceAgeing()
        .then((next) => {
          setAgeing(next)
          setMessage(null)
        })
        .catch((err: unknown) => setMessage(err instanceof Error ? err.message : 'Report could not be loaded'))
      return
    }
    void listFinanceReport(report, from, to)
      .then((next) => {
        setRows(next)
        setMessage(null)
      })
      .catch((err: unknown) => setMessage(err instanceof Error ? err.message : 'Report could not be loaded'))
  }, [report, from, to])

  return (
    <BookChrome title="Reports" hint="The date range starts as this financial year, 1 April to 31 March.">
      <div className={`${limsPanelClass} space-y-3`}>
        <div className="flex flex-wrap gap-2">
          {REPORTS.map((item) => (
            <Button key={item.id} type="button" className="min-h-10" variant={report === item.id ? 'default' : 'outline'} onClick={() => setReport(item.id)}>
              {item.label}
            </Button>
          ))}
        </div>
        <div className="flex flex-wrap gap-3">
          <div className="space-y-2">
            <Label htmlFor="report-from">From</Label>
            <Input id="report-from" className="min-h-10" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="report-to">To</Label>
            <Input id="report-to" className="min-h-10" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
        </div>
        {message ? <p className="text-sm text-red-700">{message}</p> : null}
        {report === 'ageing' ? (
          ageing.length === 0 ? <p className="text-sm text-stone-600">No open invoices.</p> : (
            <ul className="space-y-1 text-sm">
              {ageing.map((row) => (
                <li key={row.bucket}>{row.bucket}: {row.invoice_count} invoices, {row.outstanding.toFixed(2)}</li>
              ))}
            </ul>
          )
        ) : null}
        {report === 'stock' ? (
          stock.length === 0 ? <p className="text-sm text-stone-600">No stock rows.</p> : (
            <ul className="space-y-1 text-sm">
              {stock.map((row) => (
                <li key={row.product_id}>{row.item_name}: {row.stock_on_hand.toFixed(2)}{row.low_stock ? ' · Low stock' : ''}</li>
              ))}
            </ul>
          )
        ) : null}
        {report !== 'ageing' && report !== 'stock' ? (
          rows.length === 0 ? <p className="text-sm text-stone-600">No rows for this report.</p> : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead>
                  <tr className="border-b border-stone-300 text-left">
                    <th className="py-2 pr-3">Party</th>
                    <th className="py-2 pr-3">Document</th>
                    <th className="py-2 pr-3 text-right">Amount</th>
                    <th className="py-2 pr-3 text-right">Tax</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, index) => (
                    <tr key={`${row.document_number}-${row.party_name}-${index}`} className="border-b border-stone-200">
                      <td className="py-2 pr-3">{row.party_name || row.label}</td>
                      <td className="py-2 pr-3">{row.document_number || '—'}</td>
                      <td className="py-2 pr-3 text-right tabular-nums">{row.amount.toFixed(2)}</td>
                      <td className="py-2 pr-3 text-right tabular-nums">{row.tax_amount.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        ) : null}
      </div>
    </BookChrome>
  )
}