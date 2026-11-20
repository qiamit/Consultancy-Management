import { useEffect, useState } from 'react'
import { ChevronDown, ChevronRight, Download, ExternalLink, FolderOpen, Plus, Sparkles } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { limsDarkBarGlowStyle, limsDialogClass } from '@/lib/limsThemeUi'
import { cn } from '@/lib/utils'
import { askStandards } from './isLibraryAsk'
import { StandardsAskPanel } from './StandardsAskPanel'
import {
  addReferenceLink,
  EMPTY_LIBRARY_FILES,
  loadIsLibraryFiles,
  openLibraryFile,
  searchLibraryStandards,
  type IsLibraryFiles,
  type LibraryFile,
  type LibraryStandardHit,
} from './isLibraryFiles'

const STATUS_TONE: Record<string, string> = {
  Withdrawn: 'bg-red-100 text-red-800',
  Superseded: 'bg-stone-200 text-stone-700',
  Included: 'bg-sky-100 text-sky-800',
}

type Selection = { has: (relpath: string) => boolean; toggle: (relpath: string) => void }

const act = (p: Promise<void>) => void p.catch((e: unknown) => toast.error(e instanceof Error ? e.message : String(e)))

function FileRow({ file, label, tag, sel }: { file: LibraryFile; label?: string; tag?: string; sel: Selection }) {
  const btn = 'h-7 gap-1 rounded-none px-2 text-[11px]'
  return (
    <tr className="border-b border-stone-200 last:border-b-0 hover:bg-amber-50/40">
      <td className="w-9 px-3 py-1.5 align-middle">
        <input
          type="checkbox"
          className="h-4 w-4 accent-amber-700"
          checked={sel.has(file.relpath)}
          onChange={() => sel.toggle(file.relpath)}
          aria-label={`Select ${file.name}`}
        />
      </td>
      <td className="px-2 py-1.5 align-middle text-sm text-stone-900">
        {label ? <span className="font-medium">{label}</span> : null}
        <span className={cn('break-all', label && 'block text-xs text-stone-500')}>{file.name}</span>
        {tag ? <span className="ml-1 inline-flex bg-amber-100 px-1.5 text-[10px] font-medium uppercase text-amber-800">{tag}</span> : null}
        {file.status && file.status !== 'Current' ? (
          <span
            className={cn('ml-1 inline-flex px-1.5 text-[10px] font-medium uppercase', STATUS_TONE[file.status] ?? 'bg-stone-100 text-stone-600')}
            title={file.supersededBy ? `Superseded by ${file.supersededBy}` : undefined}
          >
            {file.status}
            {file.supersededBy ? ` → ${file.supersededBy}` : ''}
          </span>
        ) : null}
      </td>
      <td className="w-16 px-2 py-1.5 text-center align-middle text-xs tabular-nums text-stone-600">{file.year || '—'}</td>
      <td className="w-16 px-2 py-1.5 text-right align-middle text-xs tabular-nums text-stone-600">{file.pages ?? '—'}</td>
      <td className="w-[11.5rem] px-3 py-1.5 align-middle">
        <div className="flex justify-end gap-1.5">
          <Button type="button" variant="outline" size="sm" className={btn} onClick={() => act(openLibraryFile(file.relpath))} aria-label={`View ${file.name}`}>
            <ExternalLink className="h-3.5 w-3.5" aria-hidden />
            View
          </Button>
          <Button type="button" variant="outline" size="sm" className={btn} onClick={() => act(openLibraryFile(file.relpath, true))} aria-label={`Download ${file.name}`}>
            <Download className="h-3.5 w-3.5" aria-hidden />
            Download
          </Button>
        </div>
      </td>
    </tr>
  )
}

function Group({
  title,
  count,
  collapsible = false,
  action,
  children,
}: {
  title: string
  count: number
  collapsible?: boolean
  action?: React.ReactNode
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(!collapsible)
  const label = (
    <>
      {collapsible ? open ? <ChevronDown className="h-3.5 w-3.5" aria-hidden /> : <ChevronRight className="h-3.5 w-3.5" aria-hidden /> : null}
      {title} <span className="font-normal text-stone-500">({count})</span>
    </>
  )
  return (
    <section className="border border-stone-300 bg-white">
      <div className={cn('flex items-center gap-2 bg-stone-100 px-3 py-1.5', open && 'border-b border-stone-300')}>
        {collapsible ? (
          <button
            type="button"
            className="flex flex-1 items-center gap-1.5 text-left text-xs font-semibold uppercase tracking-wide text-stone-700"
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
          >
            {label}
          </button>
        ) : (
          <h3 className="flex flex-1 items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-stone-700">{label}</h3>
        )}
        {action}
      </div>
      {open ? (
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b border-stone-200 text-[10px] uppercase tracking-wide text-stone-500">
              <th className="w-9 px-3 py-1" />
              <th className="px-2 py-1 text-left font-medium">File</th>
              <th className="w-16 px-2 py-1 text-center font-medium">Edition</th>
              <th className="w-16 px-2 py-1 text-right font-medium">Pages</th>
              <th className="w-[11.5rem] px-3 py-1" />
            </tr>
          </thead>
          <tbody>{children}</tbody>
        </table>
      ) : null}
    </section>
  )
}

const Empty = ({ text }: { text: string }) => (
  <tr>
    <td colSpan={5} className="px-3 py-2 text-xs text-muted-foreground">
      {text}
    </td>
  </tr>
)

/** Add Reference: type an IS number, pick the standard from the library, and it stays linked to this IS Code. */
function AddReferenceDialog({
  open,
  onOpenChange,
  isCodeId,
  have,
  onAdded,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  isCodeId: string
  have: Set<string>
  onAdded: () => void
}) {
  const [text, setText] = useState('')
  const [hits, setHits] = useState<LibraryStandardHit[]>([])
  const [busy, setBusy] = useState(false)
  const [saving, setSaving] = useState<string | null>(null)

  useEffect(() => {
    if (!open) {
      setText('')
      setHits([])
      return
    }
    const q = text.trim()
    if (!/\d{2,}/.test(q)) {
      setHits([])
      return
    }
    let cancelled = false
    setBusy(true)
    const t = window.setTimeout(() => {
      searchLibraryStandards(q)
        .then((h) => {
          if (!cancelled) setHits(h)
        })
        .catch((e: unknown) => toast.error(e instanceof Error ? e.message : String(e)))
        .finally(() => {
          if (!cancelled) setBusy(false)
        })
    }, 300)
    return () => {
      cancelled = true
      window.clearTimeout(t)
    }
  }, [open, text])

  const add = async (h: LibraryStandardHit) => {
    setSaving(h.key)
    try {
      await addReferenceLink(isCodeId, h.base, h.part)
      toast.success(`${h.key} Added to Reference Standards.`)
      onAdded()
      onOpenChange(false)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(null)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent layer="stacked" aria-describedby={undefined} className={cn(limsDialogClass, 'w-[min(36rem,calc(100vw-1.5rem))] gap-3 bg-white p-4')}>
        <DialogHeader className="text-left">
          <DialogTitle className="text-base font-semibold">Add Reference Standard</DialogTitle>
        </DialogHeader>
        <input
          autoFocus
          className="w-full border border-stone-300 px-2 py-1.5 text-sm outline-none focus:border-amber-600"
          placeholder="Type the IS Number, e.g. 1608 or IS 1608 Part 1"
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <div className="max-h-[50dvh] overflow-y-auto border border-stone-200">
          {busy ? <p className="px-3 py-2 text-xs text-muted-foreground">Searching the Library…</p> : null}
          {!busy && text.trim() && !hits.length ? <p className="px-3 py-2 text-xs text-muted-foreground">No Standard With This Number in the Library.</p> : null}
          {hits.map((h) => {
            const linked = have.has(h.key)
            return (
              <button
                key={h.key}
                type="button"
                disabled={linked || saving != null}
                className="flex w-full items-start gap-2 border-b border-stone-200 px-3 py-2 text-left last:border-b-0 hover:bg-amber-50 disabled:cursor-default disabled:opacity-60"
                onClick={() => void add(h)}
              >
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium text-stone-900">{h.key}</span>
                  <span className="block truncate text-xs text-stone-500">{h.title || h.file.name}</span>
                </span>
                <span className="shrink-0 text-xs text-stone-500">{linked ? 'Already Linked' : saving === h.key ? 'Adding…' : h.file.year}</span>
              </button>
            )
          })}
        </div>
      </DialogContent>
    </Dialog>
  )
}

function IsAskPanel({ isLabel, files, selectedCount }: { isLabel: string; files: IsLibraryFiles; selectedCount: number }) {
  return (
    <StandardsAskPanel
      intro={`Ask Anything About ${isLabel || 'This Standard'}: Requirements, Tests, Tables, Marking, Sampling … The Answer Comes Only From Its Files in the Standards Library, With Clause and Page.`}
      placeholder="Ask About This Standard…"
      flagLabel={selectedCount ? undefined : 'Also Read the Reference Standards'}
      note={selectedCount ? `Reading Only the ${selectedCount} Selected Files.` : undefined}
      ask={(question, history, flag) => askStandards({ isLabel, files, question, history, useReferences: flag || selectedCount > 0 })}
    />
  )
}

/** IS Files: the Standards Library files of one IS Code — open in a tab or download. */
export function IsLibraryFilesDialog({
  open,
  onOpenChange,
  isCodeId,
  title,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  isCodeId: string | null
  title: string
}) {
  const [files, setFiles] = useState<{ id: string; data: IsLibraryFiles; key: number } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [mode, setMode] = useState<'files' | 'ask'>('files')
  const [selected, setSelected] = useState<Set<string>>(() => new Set())
  const [addOpen, setAddOpen] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    if (!open) setMode('files')
    setSelected(new Set())
  }, [open, isCodeId])

  const sel: Selection = {
    has: (relpath) => selected.has(relpath),
    toggle: (relpath) =>
      setSelected((prev) => {
        const next = new Set(prev)
        if (next.has(relpath)) next.delete(relpath)
        else next.add(relpath)
        return next
      }),
  }

  useEffect(() => {
    if (!open || !isCodeId) return
    let cancelled = false
    setError(null)
    loadIsLibraryFiles(isCodeId)
      .then((data) => {
        if (!cancelled) setFiles({ id: isCodeId, data, key: reloadKey })
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e))
      })
    return () => {
      cancelled = true
    }
  }, [open, isCodeId, reloadKey])

  const loading = open && !!isCodeId && files?.id !== isCodeId && !error
  const f = files?.id === isCodeId ? files.data : EMPTY_LIBRARY_FILES
  const nothing = !loading && !error && !f.standards.length && !f.manuals.length && !f.amendments.length && !f.older.length
  // Ask AI reads the ticked files when some are ticked, else the Standard, its Amendments and Product Manual.
  const askFiles: IsLibraryFiles = selected.size
    ? {
        standards: [...f.standards, ...f.older].filter((x) => selected.has(x.relpath)),
        amendments: f.amendments.filter((x) => selected.has(x.relpath)),
        manuals: f.manuals.filter((x) => selected.has(x.relpath)),
        references: f.references.filter((r) => r.file && selected.has(r.file.relpath)),
        older: [],
      }
    : f
  const downloadSelected = async () => {
    for (const relpath of selected) {
      await openLibraryFile(relpath, true).catch((e: unknown) => toast.error(e instanceof Error ? e.message : String(e)))
      await new Promise((r) => window.setTimeout(r, 700))
    }
  }
  const linkedRefs = new Set(f.references.map((r) => r.key))

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        persistOnFocusLoss
        layer="stacked"
        aria-describedby={undefined}
        className={cn(
          limsDialogClass,
          'flex !flex-col gap-0 overflow-hidden p-0',
          'max-h-[min(92dvh,860px)] w-[min(52rem,calc(100vw-1.5rem))] max-w-4xl bg-white',
        )}
      >
        <div className="relative shrink-0 overflow-hidden bg-gradient-to-br from-stone-800 via-stone-900 to-stone-950 px-4 py-2.5 text-white">
          <div className="pointer-events-none absolute inset-0 opacity-[0.18]" style={limsDarkBarGlowStyle} />
          <div className="absolute bottom-0 left-0 h-[2px] w-full bg-gradient-to-r from-amber-500 via-amber-300 to-transparent" />
          <DialogHeader className="relative flex !flex-row items-center gap-3 space-y-0 pr-10 text-left">
            <DialogTitle className="min-w-0 flex-1 truncate text-base font-semibold tracking-tight text-white">
              IS Files{title ? <span className="font-normal text-stone-300"> · {title}</span> : null}
            </DialogTitle>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 shrink-0 gap-1.5 rounded-none border-amber-500/50 bg-stone-800/80 px-3 text-xs text-amber-100 hover:bg-amber-500/20 hover:text-amber-50"
              onClick={() => setMode((m) => (m === 'ask' ? 'files' : 'ask'))}
              disabled={loading || !!error || nothing}
            >
              {mode === 'ask' ? <FolderOpen className="h-4 w-4" aria-hidden /> : <Sparkles className="h-4 w-4" aria-hidden />}
              {mode === 'ask' ? 'Files' : 'Ask AI'}
            </Button>
          </DialogHeader>
        </div>

        <div className="flex min-h-0 flex-1 flex-col space-y-3 overflow-y-auto bg-gradient-to-b from-stone-100/80 to-white px-4 py-4">
          {loading ? <p className="text-sm text-muted-foreground">Loading…</p> : null}
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          {nothing ? (
            <p className="text-sm text-muted-foreground">
              No File of This IS Code in the Standards Library. Add It to the Oracle Database Folder and Sync.
            </p>
          ) : null}
          {mode === 'ask' && !loading && !error && !nothing ? (
            <IsAskPanel key={isCodeId ?? ''} isLabel={title} files={askFiles} selectedCount={selected.size} />
          ) : null}
          {mode === 'files' && !loading && !error && !nothing ? (
            <>
              <div className="flex items-center gap-2 text-xs text-stone-600">
                <span className="mr-auto">
                  {selected.size ? `${selected.size} Selected — Ask AI Reads Only These` : 'Tick Files to Download Them Together or to Ask AI About Them Only'}
                </span>
                {selected.size ? (
                  <>
                    <Button type="button" variant="outline" size="sm" className="h-7 rounded-none px-2 text-[11px]" onClick={() => setSelected(new Set())}>
                      Clear
                    </Button>
                    <Button type="button" size="sm" className="h-7 gap-1 rounded-none bg-amber-700 px-2 text-[11px] text-white hover:bg-amber-800" onClick={() => void downloadSelected()}>
                      <Download className="h-3.5 w-3.5" aria-hidden />
                      Download Selected
                    </Button>
                  </>
                ) : null}
              </div>
              <Group title="Main Standard" count={f.standards.length}>
                {f.standards.length ? f.standards.map((s) => <FileRow key={s.relpath} file={s} sel={sel} />) : <Empty text="Not in the Library." />}
              </Group>
              <Group title="Amendments" count={f.amendments.length}>
                {f.amendments.length ? f.amendments.map((s) => <FileRow key={s.relpath} file={s} sel={sel} />) : <Empty text="No Separate Amendment File." />}
              </Group>
              <Group title="Product Manual" count={f.manuals.length}>
                {f.manuals.length ? f.manuals.map((s) => <FileRow key={s.relpath} file={s} sel={sel} />) : <Empty text="Not in the Library." />}
              </Group>
              <Group
                title="Reference Standards"
                count={f.references.length}
                collapsible
                action={
                  isCodeId ? (
                    <Button type="button" variant="outline" size="sm" className="h-6 gap-1 rounded-none bg-white px-2 text-[11px]" onClick={() => setAddOpen(true)}>
                      <Plus className="h-3.5 w-3.5" aria-hidden />
                      Add Reference
                    </Button>
                  ) : null
                }
              >
                {f.references.length ? (
                  f.references.map((r) =>
                    r.file ? (
                      <FileRow key={r.key} file={r.file} label={r.key} tag={r.manual ? 'Added' : undefined} sel={sel} />
                    ) : (
                      <tr key={r.key} className="border-b border-stone-200 last:border-b-0">
                        <td className="w-9 px-3 py-1.5" />
                        <td colSpan={4} className="px-2 py-1.5 text-sm text-stone-400">
                          {r.key} — Not in the Library
                        </td>
                      </tr>
                    ),
                  )
                ) : (
                  <Empty text="None Found in the Standard's Text. Use Add Reference to Link One." />
                )}
              </Group>
              {f.older.length ? (
                <Group title="Older Editions (Superseded)" count={f.older.length}>
                  {f.older.map((s) => (
                    <FileRow key={s.relpath} file={s} sel={sel} />
                  ))}
                </Group>
              ) : null}
            </>
          ) : null}
        </div>
        {isCodeId ? (
          <AddReferenceDialog
            open={addOpen}
            onOpenChange={setAddOpen}
            isCodeId={isCodeId}
            have={linkedRefs}
            onAdded={() => setReloadKey((k) => k + 1)}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  )
}
