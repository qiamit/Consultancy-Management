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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { formatPublished, toDatetimeLocal, type CmsNewsRow } from './cmsTypes'

type FormState = { title: string; content: string; image_url: string; published_date: string }
const emptyForm = (): FormState => ({
  title: '',
  content: '',
  image_url: '',
  published_date: toDatetimeLocal(new Date().toISOString()),
})

export default function CmsNewsPanel() {
  const [rows, setRows] = useState<CmsNewsRow[]>([])
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
      .from('website_news')
      .select('*')
      .order('published_date', { ascending: false })
    if (err) setError(err.message)
    else setRows((data ?? []) as CmsNewsRow[])
    setLoading(false)
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const openNew = () => {
    setEditingId(null)
    setForm(emptyForm())
    setOpen(true)
  }

  const openEdit = (row: CmsNewsRow) => {
    setEditingId(row.id)
    setForm({
      title: row.title,
      content: row.content ?? '',
      image_url: row.image_url ?? '',
      published_date: toDatetimeLocal(row.published_date),
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
      content: form.content.trim(),
      image_url: form.image_url.trim() || null,
      published_date: form.published_date ? new Date(form.published_date).toISOString() : new Date().toISOString(),
    }
    const { error: err } = editingId
      ? await supabase.from('website_news').update(payload).eq('id', editingId)
      : await supabase.from('website_news').insert(payload)
    setSaving(false)
    if (err) {
      toast.error(err.message)
      return
    }
    toast.success(editingId ? 'News updated' : 'News added')
    setOpen(false)
    void load()
  }

  const remove = async (row: CmsNewsRow) => {
    if (!window.confirm(`Delete news "${row.title}"?`)) return
    const { error: err } = await supabase.from('website_news').delete().eq('id', row.id)
    if (err) {
      toast.error(err.message)
      return
    }
    toast.success('News deleted')
    void load()
  }

  return (
    <div className="space-y-3 p-4">
      <div className="flex items-center justify-between">
        <h2 className="font-jakarta text-lg font-semibold text-foreground">News &amp; Updates</h2>
        <Button type="button" className={limsPrimaryBtnClass} onClick={openNew}>
          <Plus className="mr-1 h-4 w-4" /> Add News
        </Button>
      </div>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <div className="overflow-x-auto">
        <table className={limsTableClass}>
          <thead className={limsTableHeadClass}>
            <tr>
              <th className="px-3 py-2">Title</th>
              <th className="px-3 py-2">Content</th>
              <th className="px-3 py-2">Published</th>
              <th className="w-24 px-3 py-2">Actions</th>
            </tr>
          </thead>
          <tbody className={limsTableBodyToneClass}>
            {loading ? (
              <tr>
                <td colSpan={4} className="px-3 py-6 text-center text-sm text-muted-foreground">
                  Loading…
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-3 py-6 text-center text-sm text-muted-foreground">
                  No news yet. Click "Add News" to create one.
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={row.id}>
                  <td className="px-3 py-2 text-sm font-medium">{row.title}</td>
                  <td className="max-w-md px-3 py-2 text-sm text-muted-foreground">
                    <span className="line-clamp-2">{row.content}</span>
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-center text-sm">
                    {formatPublished(row.published_date)}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex justify-center gap-1">
                      <Button
                        type="button"
                        size="icon"
                        variant="outline"
                        className={cn(limsOutlineBtnClass, 'h-7 w-7 p-0')}
                        onClick={() => openEdit(row)}
                        aria-label="Edit news"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        type="button"
                        size="icon"
                        variant="outline"
                        className={cn(limsOutlineBtnClass, 'h-7 w-7 p-0 text-red-700')}
                        onClick={() => void remove(row)}
                        aria-label="Delete news"
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
            <DialogTitle>{editingId ? 'Edit News' : 'Add News'}</DialogTitle>
            <DialogDescription>Shown in the News section of the public website.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 p-5">
            <div className="space-y-1">
              <Label htmlFor="news-title">Title</Label>
              <Input
                id="news-title"
                className={limsFieldClass}
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="news-content">Content</Label>
              <Textarea
                id="news-content"
                rows={6}
                className="rounded-none border-stone-500 bg-stone-50"
                value={form.content}
                onChange={(e) => setForm({ ...form, content: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="news-image">Image URL (optional)</Label>
              <Input
                id="news-image"
                type="url"
                className={limsFieldClass}
                value={form.image_url}
                onChange={(e) => setForm({ ...form, image_url: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="news-date">Publish date</Label>
              <Input
                id="news-date"
                type="datetime-local"
                className={limsFieldClass}
                value={form.published_date}
                onChange={(e) => setForm({ ...form, published_date: e.target.value })}
              />
            </div>
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
