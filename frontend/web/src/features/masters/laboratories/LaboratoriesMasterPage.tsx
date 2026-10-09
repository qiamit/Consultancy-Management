import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  LAB_TYPES,
  emptyLaboratoryForm,
  listLaboratories,
  saveLaboratory,
  type LaboratoryForm,
  type LaboratoryRow,
} from './laboratoriesApi'

export default function LaboratoriesMasterPage() {
  const [rows, setRows] = useState<LaboratoryRow[]>([])
  const [form, setForm] = useState<LaboratoryForm>(emptyLaboratoryForm())
  const [editingId, setEditingId] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const reload = () => {
    void listLaboratories()
      .then(setRows)
      .catch((err: unknown) => setMessage(err instanceof Error ? err.message : 'Unable to load laboratories'))
  }

  useEffect(() => {
    reload()
  }, [])

  const onSave = () => {
    if (!form.name.trim()) {
      setMessage('Name is required')
      return
    }
    setLoading(true)
    setMessage(null)
    void saveLaboratory(form, editingId)
      .then(() => {
        setForm(emptyLaboratoryForm())
        setEditingId(null)
        setMessage('Saved')
        reload()
      })
      .catch((err: unknown) => setMessage(err instanceof Error ? err.message : 'Save failed'))
      .finally(() => setLoading(false))
  }

  return (
    <div className="space-y-4 p-3 sm:p-4">
      <h1 className="text-lg font-semibold text-stone-900">Laboratory Master</h1>
      {message ? <p className="text-sm text-stone-700">{message}</p> : null}
      <div className="grid grid-cols-12 gap-3 border border-stone-300 p-3">
        <div className="col-span-12 space-y-2 sm:col-span-6">
          <Label htmlFor="lab-name">Name</Label>
          <Input id="lab-name" className="h-10 min-h-10" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </div>
        <div className="col-span-12 space-y-2 sm:col-span-6">
          <Label>Type</Label>
          <Select value={form.labType} onValueChange={(v) => setForm({ ...form, labType: v })}>
            <SelectTrigger className="h-10 min-h-10" aria-label="Laboratory type">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {LAB_TYPES.map((type) => (
                <SelectItem key={type} value={type}>{type}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="col-span-12 space-y-2 sm:col-span-4">
          <Label htmlFor="lab-osl">OSL code</Label>
          <Input id="lab-osl" className="h-10 min-h-10" value={form.oslCode} onChange={(e) => setForm({ ...form, oslCode: e.target.value })} />
        </div>
        <div className="col-span-12 space-y-2 sm:col-span-4">
          <Label htmlFor="lab-from">Recognised from</Label>
          <Input id="lab-from" type="date" className="h-10 min-h-10" value={form.recognisedFrom} onChange={(e) => setForm({ ...form, recognisedFrom: e.target.value })} />
        </div>
        <div className="col-span-12 space-y-2 sm:col-span-4">
          <Label htmlFor="lab-upto">Recognised up to</Label>
          <Input id="lab-upto" type="date" className="h-10 min-h-10" value={form.recognisedUpto} onChange={(e) => setForm({ ...form, recognisedUpto: e.target.value })} />
        </div>
        <div className="col-span-12 space-y-2">
          <Label htmlFor="lab-address">Address</Label>
          <Input id="lab-address" className="h-10 min-h-10" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
        </div>
        <div className="col-span-12 flex gap-2">
          <Button type="button" className="h-10 min-h-10" disabled={loading} onClick={onSave}>
            {editingId ? 'Update' : 'Add laboratory'}
          </Button>
          {editingId ? (
            <Button type="button" variant="outline" className="h-10 min-h-10" onClick={() => { setEditingId(null); setForm(emptyLaboratoryForm()) }}>
              Cancel
            </Button>
          ) : null}
        </div>
      </div>
      <div className="overflow-x-auto border border-stone-300">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="bg-stone-100">
            <tr>
              <th className="px-2 py-2">Name</th>
              <th className="px-2 py-2">Type</th>
              <th className="px-2 py-2">OSL</th>
              <th className="px-2 py-2">Valid to</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-t border-stone-200">
                <td className="px-2 py-2">{row.name}</td>
                <td className="px-2 py-2">{row.lab_type}</td>
                <td className="px-2 py-2">{row.osl_code || '—'}</td>
                <td className="px-2 py-2">
                  <button
                    type="button"
                    className="h-10 min-h-10 underline"
                    onClick={() => {
                      setEditingId(row.id)
                      setForm({
                        name: row.name,
                        labType: row.lab_type,
                        oslCode: row.osl_code ?? '',
                        recognisedFrom: row.recognised_from ?? '',
                        recognisedUpto: row.recognised_upto ?? '',
                        address: row.address ?? '',
                        state: row.state ?? '',
                        contactName: row.contact_name ?? '',
                        email: row.email ?? '',
                        mobile: row.mobile ?? '',
                      })
                    }}
                  >
                    {row.recognised_upto || 'Edit'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
