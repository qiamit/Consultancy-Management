import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useState } from 'react'
import { Pencil, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { cn } from '@/lib/utils'
import { AiSettingsFooterBar } from './AiSettingsFooterBar'
import { deleteAiSkill, fetchAiSkills, upsertAiSkill } from './aiSettingsApi'
import { emptyAiSkillForm, type AiSkillForm, type AiSkillRow } from './types'

const GRID_TABLE =
  'w-full border-collapse [&_th]:border [&_td]:border [&_th]:border-border [&_td]:border-border'

const checkboxClass =
  'h-4 w-4 rounded border-muted-foreground/30 text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'

const fieldControlClass =
  'h-10 rounded-none border-0 border-b border-slate-300 bg-transparent px-0 shadow-none text-slate-900 placeholder:text-slate-400 focus-visible:border-teal-600 focus-visible:ring-0'

function parseKeywords(raw: string): string[] {
  return raw
    .split(',')
    .map((k) => k.trim())
    .filter(Boolean)
}

export type AiSkillsPanelHandle = {
  openCreate: () => void
}

type AiSkillsPanelProps = {
  searchQuery: string
}

export const AiSkillsPanel = forwardRef<AiSkillsPanelHandle, AiSkillsPanelProps>(function AiSkillsPanel(
  { searchQuery },
  ref,
) {
  const [rows, setRows] = useState<AiSkillRow[]>([])
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [form, setForm] = useState<AiSkillForm>(emptyAiSkillForm)
  const [saving, setSaving] = useState(false)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [jumpTo, setJumpTo] = useState('')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set())

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setRows(await fetchAiSkills())
      setSelectedIds(new Set())
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load skills')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const openCreate = useCallback(() => {
    setEditId(null)
    setForm(emptyAiSkillForm())
    setDialogOpen(true)
  }, [])

  useImperativeHandle(ref, () => ({ openCreate }), [openCreate])

  const openEdit = (row: AiSkillRow) => {
    setEditId(row.id)
    setForm({
      name: row.name,
      description: row.description ?? '',
      instructions: row.instructions,
      triggerKeywords: (row.trigger_keywords ?? []).join(', '),
      isEnabled: row.is_enabled,
      sortOrder: row.sort_order,
    })
    setDialogOpen(true)
  }

  const handleSave = () => {
    void (async () => {
      setSaving(true)
      setMessage(null)
      try {
        if (!form.name.trim()) throw new Error('Skill name is required')
        if (!form.instructions.trim()) throw new Error('Instructions are required')

        await upsertAiSkill(
          {
            name: form.name.trim(),
            description: form.description.trim() || null,
            instructions: form.instructions.trim(),
            trigger_keywords: parseKeywords(form.triggerKeywords),
            is_enabled: form.isEnabled,
            sort_order: form.sortOrder,
          },
          editId,
        )

        setMessage('Skill saved.')
        setDialogOpen(false)
        await load()
      } catch (err) {
        setMessage(err instanceof Error ? err.message : 'Unable to save skill')
      } finally {
        setSaving(false)
      }
    })()
  }

  const handleDelete = (row: AiSkillRow) => {
    if (!window.confirm(`Delete skill "${row.name}"?`)) return
    void (async () => {
      try {
        await deleteAiSkill(row.id)
        setMessage('Skill deleted.')
        await load()
      } catch (err) {
        setMessage(err instanceof Error ? err.message : 'Unable to delete skill')
      }
    })()
  }

  const toggleRow = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const handleBulkDelete = () => {
    const ids = Array.from(selectedIds)
    if (ids.length === 0) return
    if (!window.confirm(`Delete ${ids.length} selected skill${ids.length === 1 ? '' : 's'}?`)) return
    void (async () => {
      try {
        for (const id of ids) {
          await deleteAiSkill(id)
        }
        setMessage(ids.length === 1 ? 'Skill deleted.' : `${ids.length} skills deleted.`)
        await load()
      } catch (err) {
        setMessage(err instanceof Error ? err.message : 'Unable to delete selected skills')
      }
    })()
  }

  const filteredRows = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    if (!q) return rows
    return rows.filter((r) =>
      [r.name, r.description ?? '', (r.trigger_keywords ?? []).join(' '), r.is_enabled ? 'enabled' : 'disabled']
        .join(' ')
        .toLowerCase()
        .includes(q),
    )
  }, [rows, searchQuery])

  const pageCount = Math.max(1, Math.ceil(filteredRows.length / pageSize))

  useEffect(() => {
    setPage(1)
    setJumpTo('')
  }, [searchQuery, pageSize])

  useEffect(() => {
    if (page > pageCount) setPage(pageCount)
  }, [page, pageCount])

  const pagedRows = useMemo(() => {
    const start = (page - 1) * pageSize
    return filteredRows.slice(start, start + pageSize)
  }, [filteredRows, page, pageSize])

  const allPagedChecked =
    pagedRows.length > 0 && pagedRows.every((r) => selectedIds.has(r.id))
  const somePagedChecked = pagedRows.some((r) => selectedIds.has(r.id))

  const toggleAllPaged = (checked: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      for (const r of pagedRows) {
        if (checked) next.add(r.id)
        else next.delete(r.id)
      }
      return next
    })
  }

  const messageIsError =
    !!message && (message.toLowerCase().includes('unable') || message.toLowerCase().includes('required'))

  return (
    <div className="space-y-5">
      {error && <p className="text-sm text-destructive">{error}</p>}
      {message && (
        <p className={messageIsError ? 'text-sm text-destructive' : 'text-sm text-emerald-700'}>{message}</p>
      )}

      {loading ? (
        <div className="overflow-hidden rounded-none border-2 border-stone-500 bg-white shadow-sm ring-1 ring-amber-700/20 px-5 py-8 text-center shadow-sm">
          <p className="text-sm text-muted-foreground">Loading skills…</p>
        </div>
      ) : (
        <>
          {selectedIds.size > 0 ? (
            <div className="flex flex-wrap items-center justify-between gap-3 overflow-hidden rounded-none border-2 border-stone-500 bg-white px-4 py-3 shadow-sm ring-1 ring-amber-700/20">
              <p className="text-sm text-muted-foreground">
                <span className="font-medium text-foreground">{selectedIds.size}</span> selected
              </p>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="gap-1.5 text-destructive hover:bg-destructive/10 hover:text-destructive"
                onClick={handleBulkDelete}
              >
                <Trash2 size={14} />
                Delete selected
              </Button>
            </div>
          ) : null}

          <div className="overflow-hidden overflow-hidden rounded-none border-2 border-stone-500 bg-white shadow-sm ring-1 ring-amber-700/20">
            {pagedRows.length > 0 ? (
              <Table className={GRID_TABLE}>
                <TableHeader>
                  <TableRow className="bg-stone-800 hover:bg-stone-800">
                    <TableHead className="w-12 text-center text-xs sm:w-14">
                      <input
                        type="checkbox"
                        className={checkboxClass}
                        aria-label="Select all on this page"
                        checked={allPagedChecked}
                        ref={(el) => {
                          if (el) el.indeterminate = !allPagedChecked && somePagedChecked
                        }}
                        onChange={(e) => toggleAllPaged(e.target.checked)}
                      />
                    </TableHead>
                    <TableHead className="text-center text-[11px] font-bold uppercase tracking-[0.14em] text-amber-200">
                      Name
                    </TableHead>
                    <TableHead className="text-center text-[11px] font-bold uppercase tracking-[0.14em] text-amber-200">
                      Description
                    </TableHead>
                    <TableHead className="text-center text-[11px] font-bold uppercase tracking-[0.14em] text-amber-200">
                      Keywords
                    </TableHead>
                    <TableHead className="text-center text-[11px] font-bold uppercase tracking-[0.14em] text-amber-200">
                      Status
                    </TableHead>
                    <TableHead className="w-[88px] text-center text-[11px] font-bold uppercase tracking-[0.14em] text-amber-200">
                      Actions
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pagedRows.map((r) => (
                    <TableRow
                      key={r.id}
                      data-state={selectedIds.has(r.id) ? 'selected' : undefined}
                    >
                      <TableCell className="text-center align-middle">
                        <input
                          type="checkbox"
                          className={checkboxClass}
                          aria-label={`Select ${r.name}`}
                          checked={selectedIds.has(r.id)}
                          onChange={() => toggleRow(r.id)}
                        />
                      </TableCell>
                      <TableCell className="align-middle text-left font-medium">{r.name}</TableCell>
                      <TableCell className="max-w-[240px] align-middle text-center text-sm text-muted-foreground">
                        <span className="line-clamp-2">{r.description || '—'}</span>
                      </TableCell>
                      <TableCell className="align-middle text-center text-xs text-muted-foreground">
                        {(r.trigger_keywords ?? []).length > 0
                          ? (r.trigger_keywords ?? []).join(', ')
                          : '—'}
                      </TableCell>
                      <TableCell className="text-center align-middle">
                        <span
                          className={cn(
                            'inline-flex rounded-md px-2.5 py-1 text-xs font-medium',
                            r.is_enabled
                              ? 'bg-emerald-50 text-emerald-700'
                              : 'bg-muted text-muted-foreground',
                          )}
                        >
                          {r.is_enabled ? 'Enabled' : 'Disabled'}
                        </span>
                      </TableCell>
                      <TableCell className="text-center align-middle">
                        <div className="inline-flex flex-nowrap items-center justify-center gap-0.5">
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8 shrink-0 rounded-none"
                            aria-label={`Edit ${r.name}`}
                            onClick={() => openEdit(r)}
                          >
                            <Pencil size={16} />
                          </Button>
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8 shrink-0 rounded-none"
                            aria-label={`Delete ${r.name}`}
                            onClick={() => handleDelete(r)}
                          >
                            <Trash2 size={16} className="text-destructive" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <div className="p-6 text-center">
                <p className="text-sm text-muted-foreground">
                  {searchQuery.trim() ? 'No skills match your search.' : 'No skills added yet.'}
                </p>
                {!searchQuery.trim() && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    Use &quot;Add Skill&quot; to create the first skill.
                  </p>
                )}
              </div>
            )}
          </div>

          <AiSettingsFooterBar
            totalCount={filteredRows.length}
            page={page}
            pageCount={pageCount}
            pageSize={pageSize}
            jumpTo={jumpTo}
            onPageSizeChange={(size) => {
              setPageSize(size)
              setPage(1)
            }}
            onPrevPage={() => setPage((p) => Math.max(1, p - 1))}
            onNextPage={() => setPage((p) => Math.min(pageCount, p + 1))}
            onJumpToChange={setJumpTo}
            onJumpToGo={() => {
              const n = Number(jumpTo)
              if (!Number.isFinite(n) || n < 1) return
              setPage(Math.min(pageCount, Math.max(1, Math.floor(n))))
            }}
          />
        </>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent
          className="max-h-[92vh] max-w-2xl gap-0 overflow-hidden border-slate-300 bg-white p-0 shadow-2xl sm:rounded-lg [&>button]:text-white [&>button]:opacity-80 [&>button]:hover:opacity-100 [&>button]:hover:bg-white/10"
          aria-describedby={undefined}
        >
          <div className="relative bg-slate-900 px-6 py-5 text-white">
            <div className="absolute bottom-0 left-0 h-[3px] w-full bg-gradient-to-r from-amber-500 via-amber-300 to-transparent" />
            <DialogHeader className="relative pr-8 text-left">
              <p className="mb-1 font-mono text-[10px] uppercase tracking-[0.2em] text-teal-300/90">
                AI Registry · {editId ? 'Edit Entry' : 'New Entry'}
              </p>
              <DialogTitle className="text-xl font-semibold tracking-tight text-white">
                {editId ? 'Edit Skill' : 'Add Skill'}
              </DialogTitle>
            </DialogHeader>
          </div>

          <div className="max-h-[min(62vh,520px)] space-y-5 overflow-y-auto bg-[#fafbfc] px-6 py-6">
            <div className="grid grid-cols-1 gap-x-6 gap-y-5 md:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="skill-name" className="text-[12px] font-medium text-slate-600">
                  Skill Name
                </Label>
                <Input
                  id="skill-name"
                  className={fieldControlClass}
                  value={form.name}
                  onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                  placeholder="ISO Report Review"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="skill-keywords" className="text-[12px] font-medium text-slate-600">
                  Trigger Keywords
                </Label>
                <Input
                  id="skill-keywords"
                  className={fieldControlClass}
                  value={form.triggerKeywords}
                  onChange={(e) => setForm((p) => ({ ...p, triggerKeywords: e.target.value }))}
                  placeholder="Report, NABL, Certificate"
                />
              </div>
              <div className="space-y-1.5 md:col-span-2">
                <Label htmlFor="skill-desc" className="text-[12px] font-medium text-slate-600">
                  Short Description
                </Label>
                <Input
                  id="skill-desc"
                  className={fieldControlClass}
                  value={form.description}
                  onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
                  placeholder="When to Use This Skill"
                />
              </div>
              <div className="space-y-1.5 md:col-span-2">
                <Label htmlFor="skill-instructions" className="text-[12px] font-medium text-slate-600">
                  Instructions
                </Label>
                <Textarea
                  id="skill-instructions"
                  className="min-h-[180px] rounded-md border-slate-300 bg-white font-mono text-xs shadow-none focus-visible:ring-teal-600/30"
                  value={form.instructions}
                  onChange={(e) => setForm((p) => ({ ...p, instructions: e.target.value }))}
                  placeholder="Step-by-step rules the AI must follow…"
                />
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-4">
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={form.isEnabled}
                  onChange={(e) => setForm((p) => ({ ...p, isEnabled: e.target.checked }))}
                />
                Enabled
              </label>
              <div className="flex items-center gap-2 text-sm">
                <Label htmlFor="skill-order" className="shrink-0 text-[12px] font-medium text-slate-600">
                  Sort Order
                </Label>
                <Input
                  id="skill-order"
                  type="number"
                  className={`${fieldControlClass} w-20`}
                  value={form.sortOrder}
                  onChange={(e) => setForm((p) => ({ ...p, sortOrder: Number(e.target.value) || 0 }))}
                />
              </div>
            </div>
          </div>

          <DialogFooter className="gap-2 border-t border-slate-200 bg-white px-6 py-4 sm:justify-end">
            <Button
              type="button"
              className="min-w-[140px] rounded-sm bg-teal-700 text-white hover:bg-teal-800"
              onClick={handleSave}
              disabled={saving}
            >
              {saving ? 'Saving…' : 'Save & Close'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
})
