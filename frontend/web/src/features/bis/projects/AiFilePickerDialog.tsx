import { useState } from 'react'
import { Loader2, Search, Sparkles } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { limsDialogClass, limsPrimaryBtnClass } from '@/lib/limsThemeUi'
import { cn } from '@/lib/utils'
import { supabase } from '@/lib/supabaseClient'
import { sendQiAssistantMessage } from '@/components/qi-assistant/qiAssistantApi'
import { copyProjectFileToProject } from './bisModuleImportApi'
import type { BisProjectRow } from './types'

/** A file found by the AI search, already copied into the current application when added. */
export type PickedFile = { fileName: string; file: { id: string; file_name: string; storage_path: string } }

type Candidate = { index: number; projectId: string; id: string; file_name: string; storage_path: string; doc_kind: string; application: string }

const thCls = 'border border-stone-700 bg-stone-800 px-2 py-1.5 text-left text-[11px] font-bold uppercase tracking-[0.1em] text-amber-200'
const tdCls = 'border border-[#e7e0d4] px-2 py-1.5 align-middle text-stone-700'

/** Every uploaded document of this client's applications (signatures, photos and seals are left out). */
async function loadCandidates(row: BisProjectRow): Promise<Candidate[]> {
  const projects = row.client_id
    ? await supabase.from('bis_projects').select('id, application_number, title').eq('client_id', row.client_id).limit(200)
    : { data: [{ id: row.id, application_number: row.application_number, title: row.title }], error: null }
  if (projects.error) throw projects.error
  const list = (projects.data ?? []) as Array<{ id: string; application_number: string | null; title: string | null }>
  const names = new Map(list.map((p) => [p.id, p.id === row.id ? 'This application' : [p.application_number ? `CM/A-${p.application_number}` : '', p.title ?? ''].filter(Boolean).join(' · ') || 'Another application']))
  const files = await supabase
    .from('bis_project_files')
    .select('id, file_name, storage_path, doc_kind, bis_project_id')
    .in('bis_project_id', list.map((p) => p.id))
    .order('created_at', { ascending: false })
    .limit(500)
  if (files.error) throw files.error
  return ((files.data ?? []) as Array<{ id: string; file_name: string; storage_path: string; doc_kind: string; bis_project_id: string }>)
    .filter((f) => f.storage_path && !/signature|photo|seal/i.test(f.doc_kind))
    .map((f, index) => ({ index, projectId: f.bis_project_id, id: f.id, file_name: f.file_name, storage_path: f.storage_path, doc_kind: f.doc_kind, application: names.get(f.bis_project_id) ?? '' }))
}

function parsePicks(reply: string): Array<{ index: number; fileName: string }> {
  const fenced = reply.match(/```(?:json)?\s*([\s\S]*?)```/i)
  const text = (fenced?.[1] ?? reply).trim()
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  try {
    const payload = JSON.parse(start >= 0 && end > start ? text.slice(start, end + 1) : text) as { picks?: unknown }
    if (!Array.isArray(payload.picks)) return []
    return payload.picks.flatMap((p) => {
      const o = p && typeof p === 'object' ? (p as Record<string, unknown>) : {}
      const index = Number(o.index)
      return Number.isInteger(index) ? [{ index, fileName: String(o.fileName ?? '').trim() }] : []
    })
  } catch {
    return []
  }
}

/**
 * AI file search: describe the document needed; the AI picks matching files uploaded anywhere in this client's
 * applications, you tick which to add, and they are copied into this application.
 */
export function AiFilePickerDialog({
  open,
  onOpenChange,
  projectRow,
  title,
  onAdd,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  projectRow: BisProjectRow
  /** What the files are for (e.g. "Other Information"). */
  title: string
  onAdd: (files: PickedFile[]) => Promise<void>
}) {
  const [request, setRequest] = useState('')
  const [busy, setBusy] = useState(false)
  const [results, setResults] = useState<Array<Candidate & { fileName: string; checked: boolean }> | null>(null)

  const search = async () => {
    if (!request.trim()) return
    setBusy(true)
    setResults(null)
    try {
      const candidates = await loadCandidates(projectRow)
      if (candidates.length === 0) throw new Error('No uploaded files were found in this client’s applications.')
      const { reply } = await sendQiAssistantMessage({
        page: 'bis/declaration-file-picker',
        message: `Pick the uploaded files that match this request for the "${title}" section of a BIS licence application: "${request.trim()}".
Return ONLY JSON: { "picks": [ { "index": <file index>, "fileName": "short descriptive document name in Title Case" } ] }.
Choose at most 10 files, best match first. Return { "picks": [] } when nothing matches.`,
        context: ['Available files (index | document type | file name | application):', ...candidates.map((c) => `${c.index} | ${c.doc_kind} | ${c.file_name} | ${c.application}`)].join('\n'),
        history: [],
      })
      const picks = parsePicks(reply)
      const found = picks.flatMap((p) => {
        const c = candidates.find((x) => x.index === p.index)
        return c ? [{ ...c, fileName: p.fileName || c.file_name.replace(/\.[^.]+$/, ''), checked: true }] : []
      })
      if (found.length === 0) toast.message('No Matching File Found', { description: 'Try describing the document differently, or upload it.' })
      setResults(found)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'AI search failed')
    } finally {
      setBusy(false)
    }
  }

  const add = async () => {
    const chosen = (results ?? []).filter((r) => r.checked)
    if (chosen.length === 0) return
    setBusy(true)
    try {
      const copied: PickedFile[] = []
      for (const r of chosen) {
        const file =
          r.projectId === projectRow.id
            ? { id: r.id, file_name: r.file_name, storage_path: r.storage_path }
            : await copyProjectFileToProject(r.projectId, projectRow.id, r, 'application-declaration')
        if (file) copied.push({ fileName: r.fileName, file })
      }
      await onAdd(copied)
      toast.success(`Added ${copied.length} file${copied.length === 1 ? '' : 's'}`)
      setResults(null)
      setRequest('')
      onOpenChange(false)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not add the files')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent layer="top" aria-describedby={undefined} className={cn(limsDialogClass, 'flex max-h-[85dvh] w-[min(56rem,calc(100vw_-_var(--app-dialog-overlay-left,0px)_-_1.5rem))] max-w-4xl flex-col p-0')}>
        <DialogHeader className="bg-gradient-to-br from-stone-800 via-stone-900 to-stone-950 py-2.5 pl-4 pr-12 text-left">
          <DialogTitle className="flex items-center gap-2 text-base font-semibold tracking-tight text-white">
            <Sparkles size={16} className="text-amber-300" aria-hidden /> Find Files with AI — {title}
          </DialogTitle>
        </DialogHeader>
        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto bg-[#fffcf7] p-4">
          <div className="flex gap-2">
            <Input
              autoFocus
              aria-label="Describe the Document"
              placeholder="Describe the Document, e.g. GST Certificate, Pollution NOC, Test Report"
              className="h-9 rounded-none border-stone-400 bg-white"
              value={request}
              disabled={busy}
              onChange={(e) => setRequest(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void search()
              }}
            />
            <Button type="button" className={cn(limsPrimaryBtnClass, 'h-9 shrink-0')} disabled={busy || !request.trim()} onClick={() => void search()}>
              {busy && !results ? <Loader2 size={15} className="mr-1.5 animate-spin" aria-hidden /> : <Search size={15} className="mr-1.5" aria-hidden />}
              Search
            </Button>
          </div>
          {results && results.length > 0 ? (
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr>
                  <th className={cn(thCls, 'w-8 px-1 text-center')} aria-label="Select" />
                  <th className={thCls}>File Name (as It Will Appear)</th>
                  <th className={thCls}>Found In</th>
                </tr>
              </thead>
              <tbody>
                {results.map((r, i) => (
                  <tr key={r.id} className={i % 2 ? 'bg-[#f7f3eb]' : 'bg-[#fffcf7]'}>
                    <td className={cn(tdCls, 'px-1 text-center')}>
                      <input
                        type="checkbox"
                        className="h-4 w-4 rounded-none border-stone-500 text-amber-700"
                        aria-label={`Select ${r.file_name}`}
                        checked={r.checked}
                        onChange={(e) => setResults((prev) => prev?.map((x) => (x.id === r.id ? { ...x, checked: e.target.checked } : x)) ?? null)}
                      />
                    </td>
                    <td className={tdCls}>
                      <Input
                        aria-label="File Name"
                        className="h-8 rounded-none border-stone-400 bg-white text-sm"
                        value={r.fileName}
                        onChange={(e) => setResults((prev) => prev?.map((x) => (x.id === r.id ? { ...x, fileName: e.target.value } : x)) ?? null)}
                      />
                      <span className="mt-0.5 block truncate text-[11px] text-stone-500" title={r.file_name}>
                        {r.file_name}
                      </span>
                    </td>
                    <td className={cn(tdCls, 'text-xs')}>{r.application}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : null}
        </div>
        <DialogFooter className="border-t border-stone-200 bg-stone-50 px-4 py-3">
          <Button type="button" variant="outline" className="rounded-none" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          <Button type="button" className={cn(limsPrimaryBtnClass, 'min-w-[7rem]')} disabled={busy || !(results ?? []).some((r) => r.checked)} onClick={() => void add()}>
            {busy && results ? <Loader2 size={15} className="mr-1.5 animate-spin" aria-hidden /> : null}
            Add Selected
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
