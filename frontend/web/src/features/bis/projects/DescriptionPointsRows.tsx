import { useState } from 'react'
import { Check, Pencil, Plus, Trash2, X } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'

/* Process Description points, edited like the other Step 3 tables: a blank first row with "+",
   then the saved points with Edit / Delete in their own row. Points live in the Process Flow Chart
   payload (`descriptionPoints`), which the Process Description document prints from. */

const thCls =
  'border border-stone-700 bg-stone-800 px-2 py-1.5 text-left text-[11px] font-bold uppercase tracking-[0.1em] text-amber-200'
const tdCls = 'border border-[#e7e0d4] px-2 py-1.5 align-middle text-stone-700'
const iconBtn =
  'h-7 w-7 rounded-none border border-stone-400 bg-white/70 p-0 text-amber-800 hover:border-amber-600 hover:bg-amber-50'
const textCls = 'min-h-[56px] resize-y rounded-none border-stone-400 bg-white px-2 py-1.5 text-sm'

export function DescriptionPointsRows({
  points,
  apply,
  disabled = false,
}: {
  points: string[]
  /** Applies a change to the point list: saved straight away (Step 3) or into an open form (module editor). */
  apply: (mutate: (points: string[]) => string[]) => Promise<void> | void
  disabled?: boolean
}) {
  const [draft, setDraft] = useState('')
  const [editIndex, setEditIndex] = useState<number | null>(null)
  const [editDraft, setEditDraft] = useState('')
  const [saving, setSaving] = useState(false)
  const busy = saving || disabled

  const run = async (fn: () => Promise<void>, ok: string) => {
    setSaving(true)
    try {
      await fn()
      toast.success(ok)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not save')
    } finally {
      setSaving(false)
    }
  }

  const add = () => {
    const text = draft.trim()
    if (!text) {
      toast.error('Description Point Is Required.')
      return
    }
    void run(async () => {
      await apply((list) => [...list, text])
      setDraft('')
    }, 'Point added')
  }

  const saveEdit = () => {
    if (editIndex == null) return
    const text = editDraft.trim()
    if (!text) {
      toast.error('Description Point Is Required.')
      return
    }
    void run(async () => {
      await apply((list) => list.map((p, i) => (i === editIndex ? text : p)))
      setEditIndex(null)
    }, 'Point updated')
  }

  const remove = (indexes: number[]) => {
    if (indexes.length === 0) return
    void run(async () => {
      await apply((list) => list.filter((_, i) => !indexes.includes(i)))
      setEditIndex(null)
    }, indexes.length > 1 ? 'Points deleted' : 'Point deleted')
  }

  return (
    <div className="space-y-2">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr>
              <th className={cn(thCls, 'w-12 text-center')}>#</th>
              <th className={thCls}>
                Description Point<span className="text-red-400">*</span>
              </th>
              <th className={cn(thCls, 'w-24 text-center')}>Action</th>
            </tr>
          </thead>
          <tbody>
            <tr className="bg-[#fffcf7]">
              <td className={cn(tdCls, 'text-center text-xs text-stone-400')}>{points.length + 1}</td>
              <td className={tdCls}>
                <Textarea
                  className={textCls}
                  placeholder="Type Description Point…"
                  value={draft}
                  disabled={busy}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) add()
                  }}
                />
              </td>
              <td className={cn(tdCls, 'text-center')}>
                <Button
                  type="button"
                  size="sm"
                  disabled={busy}
                  className="h-7 w-7 rounded-none bg-amber-700 p-0 text-white hover:bg-amber-800"
                  onClick={add}
                  title="Add Point"
                  aria-label="Add Point"
                >
                  <Plus className="h-4 w-4" aria-hidden />
                </Button>
              </td>
            </tr>
            {points.length === 0 ? (
              <tr>
                <td colSpan={3} className={cn(tdCls, 'py-3 text-center text-stone-500')}>
                  No description points yet.
                </td>
              </tr>
            ) : (
              points.map((point, index) => {
                const editing = editIndex === index
                return (
                  <tr key={index} className={index % 2 ? 'bg-[#f7f3eb]' : 'bg-[#fffcf7]'}>
                    <td className={cn(tdCls, 'text-center text-xs font-semibold')}>{index + 1}</td>
                    <td className={cn(tdCls, 'leading-relaxed')}>
                      {editing ? (
                        <Textarea className={textCls} value={editDraft} onChange={(e) => setEditDraft(e.target.value)} />
                      ) : (
                        point
                      )}
                    </td>
                    <td className={cn(tdCls, 'text-center')}>
                      <span className="inline-flex gap-1">
                        {editing ? (
                          <>
                            <Button type="button" variant="ghost" className={iconBtn} disabled={busy} title="Save" onClick={saveEdit}>
                              <Check size={14} />
                            </Button>
                            <Button type="button" variant="ghost" className={iconBtn} title="Cancel" onClick={() => setEditIndex(null)}>
                              <X size={14} />
                            </Button>
                          </>
                        ) : (
                          <>
                            <Button
                              type="button"
                              variant="ghost"
                              className={iconBtn}
                              title="Edit Row"
                              onClick={() => {
                                setEditIndex(index)
                                setEditDraft(point)
                              }}
                            >
                              <Pencil size={13} />
                            </Button>
                            <Button type="button" variant="ghost" className={iconBtn} disabled={busy} title="Delete Row" onClick={() => remove([index])}>
                              <Trash2 size={13} />
                            </Button>
                          </>
                        )}
                      </span>
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
