import { useCallback, useEffect, useState } from 'react'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabaseClient'
import {
  limsDialogClass,
  limsFieldClass,
  limsOutlineBtnClass,
  limsPrimaryBtnClass,
  limsTableBodyToneClass,
  limsTableClass,
  limsTableHeadClass,
} from '@/lib/limsThemeUi'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import type { CmsServiceRow } from './cmsTypes'

type FormState = { title: string; description: string; icon_name: string; is_active: boolean }
const emptyForm: FormState = { title: '', description: '', icon_name: '', is_active: true }

export default function CmsServicesPanel() {
  const [rows, setRows] = useState<CmsServiceRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<FormState>(emptyForm)
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    const { data, error: err } = await supabase
      .from('website_services')
      .select('*')
      .order('created_at', { ascending: true })
    if (err) setError(err.message)
    else setRows((data ?? []) as CmsServiceRow[])
    setLoading(false)
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const openNew = () => {
    setEditingId(null)
    setForm(emptyForm)
    setOpen(true)
  }

  const openEdit = (row: CmsServiceRow) => {
    setEditingId(row.id)
    setForm({
      title: row.title,
      description: row.description ?? '',
      icon_name: row.icon_name ?? '',
      is_active: row.is_active,
    })
    setOpen(true)
  }

  const save = async () => {
    if (!form.title.trim()) {
      toast.error('Title is required')
      return
    }
    setSaving(true)
    const payload = {
      title: form.title.trim(),
      description: form.description.trim(),
      icon_name: form.icon_name.trim() || null,
      is_active: form.is_active,
    }
    const { error: err } = editingId
      ? await supabase.from('website_services').update(payload).eq('id', editingId)
      : await supabase.from('website_services').insert(payload)
    setSaving(false)
    if (err) {
      toast.error(err.message)
      return
    }
    toast.success(editingId ? 'Service updated' : 'Service added')
    setOpen(false)
    void load()
  }

  const remove = async (row: CmsServiceRow) => {
    if (!window.confirm(`Delete service "${row.title}"?`)) return
    const { error: err } = await supabase.from('website_services').delete().eq('id', row.id)
    if (err) {
      toast.error(err.message)
      return
    }
    toast.success('Service deleted')
    void load()
  }

  return (
    <div className="space-y-3 p-4">
      <div className="flex items-center justify-between">
        <h2 className="font-jakarta text-lg font-semibold text-foreground">Services</h2>
        <Button type="button" className={limsPrimaryBtnClass} onClick={openNew}>
          <Plus className="mr-1 h-4 w-4" /> Add Service
        </Button>
      </div>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <div className="overflow-x-auto">
        <table className={limsTableClass}>
          <thead className={limsTableHeadClass}>
            <tr>
              <th className="px-3 py-2">Title</th>
              <th className="px-3 py-2">Description</th>
              <th className="px-3 py-2">Icon</th>
              <th className="px-3 py-2">Status</th>
              <th className="w-24 px-3 py-2">Actions</th>
            </tr>
          </thead>
          <tbody className={limsTableBodyToneClass}>
            {loading ? (
              <tr>
                <td colSpan={5} className="px-3 py-6 text-center text-sm text-muted-foreground">
                  Loading…
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-3 py-6 text-center text-sm text-muted-foreground">
                  No services yet. Click "Add Service" to create one.
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={row.id}>
                  <td className="px-3 py-2 text-sm font-medium">{row.title}</td>
                  <td className="max-w-md px-3 py-2 text-sm text-muted-foreground">
                    <span className="line-clamp-2">{row.description}</span>
                  </td>
                  <td className="px-3 py-2 text-center text-sm">{row.icon_name || '—'}</td>
                  <td className="px-3 py-2 text-center">
                    <Badge
                      variant="outline"
                      className={cn(
                        'rounded-none',
                        row.is_active ? 'border-emerald-600 text-emerald-700' : 'border-stone-400 text-stone-500',
                      )}
                    >
                      {row.is_active ? 'Active' : 'Inactive'}
                    </Badge>
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex justify-center gap-1">
                      <Button
                        type="button"
                        size="icon"
                        variant="outline"
                        className={cn(limsOutlineBtnClass, 'h-7 w-7 p-0')}
                        onClick={() => openEdit(row)}
                        aria-label="Edit service"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        type="button"
                        size="icon"
                        variant="outline"
                        className={cn(limsOutlineBtnClass, 'h-7 w-7 p-0 text-red-700')}
                        onClick={() => void remove(row)}
                        aria-label="Delete service"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className={cn(limsDialogClass, 'max-w-lg')}>
          <DialogHeader className="border-b border-stone-300 bg-stone-100 px-5 py-3">
            <DialogTitle>{editingId ? 'Edit Service' : 'Add Service'}</DialogTitle>
            <DialogDescription>Shown in the Services section of the public website.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 p-5">
            <div className="space-y-1">
              <Label htmlFor="svc-title">Title</Label>
              <Input
                id="svc-title"
                className={limsFieldClass}
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="svc-desc">Description</Label>
              <Textarea
                id="svc-desc"
                rows={5}
                className="rounded-none border-stone-500 bg-stone-50"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="svc-icon">Icon name (optional)</Label>
              <Input
                id="svc-icon"
                className={limsFieldClass}
                placeholder="e.g. shield-check"
                value={form.icon_name}
                onChange={(e) => setForm({ ...form, icon_name: e.target.value })}
              />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.is_active}
                onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
              />
              Active (visible on website)
            </label>
          </div>
          <DialogFooter className="border-t border-stone-300 bg-stone-100 px-5 py-3">
            <Button type="button" variant="outline" className={limsOutlineBtnClass} onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="button" className={limsPrimaryBtnClass} disabled={saving} onClick={() => void save()}>
              {saving ? 'Saving…' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
