import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { BookOpenText, ChevronDown, ChevronRight, Download, Library, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import {
  limsDarkBarAccentClass,
  limsDarkBarBtnClass,
  limsDarkBarClass,
  limsDarkBarGlowStyle,
  limsPageShellClass,
  limsPanelClass,
  limsTableBodyToneClass,
  limsTableClass,
  limsTableHeadClass,
} from '@/lib/limsThemeUi'
import { cn } from '@/lib/utils'
import { SyncNowControls } from './SyncNowPanel'
import { LibraryAskDialog } from '@/features/masters/is-codes/LibraryAskDialog'
import { fetchAllMissingReferences, fetchStandardsLibraryStatus, type IndexRun, type IndexRunStatus, type StandardsLibraryStatus } from './standardsLibraryApi'

const STATUS_TONE: Record<IndexRunStatus, string> = {
  done: 'bg-emerald-50 text-emerald-700',
  running: 'bg-sky-50 text-sky-700',
  failed: 'bg-red-50 text-red-700',
  stopped: 'bg-amber-50 text-amber-800',
}

const STATUS_LABEL: Record<IndexRunStatus, string> = { done: 'Done', running: 'Running', failed: 'Failed', stopped: 'Stopped' }

const num = (n: number) => n.toLocaleString('en-IN')

function formatWhen(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })
}

function minutes(run: IndexRun): string {
  if (!run.finished_at) return ''
  const m = (new Date(run.finished_at).getTime() - new Date(run.started_at).getTime()) / 60000
  return m < 1 ? 'Under 1 Min' : `${Math.round(m)} Min`
}

/** Downloads rows as an Excel sheet ("Standards Library - Files to Review - 2026-11-19.xlsx"). */
async function exportSheet(title: string, rows: Array<Record<string, string | number>>) {
  const XLSX = await import('xlsx')
  const book = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(book, XLSX.utils.json_to_sheet(rows), title.slice(0, 31))
  XLSX.writeFile(book, `Standards Library - ${title} - ${new Date().toISOString().slice(0, 10)}.xlsx`)
}

function Section({
  title,
  note,
  onExport,
  children,
}: {
  title: string
  note?: ReactNode
  onExport?: () => Promise<void> | void
  children: ReactNode
}) {
  const [busy, setBusy] = useState(false)
  const [open, setOpen] = useState(false)
  const run = async () => {
    if (!onExport) return
    setBusy(true)
    try {
      await onExport()
    } catch (e) {
      window.alert(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }
  return (
    <section className={cn(limsPanelClass, 'overflow-x-auto')}>
      <div className={cn('flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2', open && 'border-b border-stone-200')}>
        <button
          type="button"
          className="flex items-center gap-1.5 text-left text-sm font-semibold"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
        >
          {open ? <ChevronDown className="h-4 w-4" aria-hidden /> : <ChevronRight className="h-4 w-4" aria-hidden />}
          <h2>{title}</h2>
        </button>
        {note && open ? <p className="text-xs text-muted-foreground">{note}</p> : null}
        {onExport ? (
          <Button type="button" variant="outline" size="sm" className="ml-auto h-7 gap-1.5 text-xs" onClick={run} disabled={busy}>
            <Download className="h-3.5 w-3.5" aria-hidden />
            {busy ? 'Exporting…' : 'Export to Excel'}
          </Button>
        ) : null}
      </div>
      {open ? children : null}
    </section>
  )
}

function Stat({ label, value, sub }: { label: string; value: ReactNode; sub?: ReactNode }) {
  return (
    <div className={cn(limsPanelClass, 'px-3 py-2')}>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-lg font-semibold">{value}</p>
      {sub ? <p className="text-xs text-muted-foreground">{sub}</p> : null}
    </div>
  )
}

function EmptyRow({ cols, text }: { cols: number; text: string }) {
  return (
    <TableRow>
      <TableCell colSpan={cols} className="py-6 text-center text-sm text-muted-foreground">
        {text}
      </TableCell>
    </TableRow>
  )
}

/**
 * Settings → Standards Library (admin only): the index of the owner's "Oracle Database" folder — last runs, files and
 * pages per category, files to review, and the Standards List numbers that have no file yet.
 */
export default function StandardsLibraryPage() {
  const [data, setData] = useState<StandardsLibraryStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  const [askOpen, setAskOpen] = useState(false)

  useEffect(() => {
    let cancelled = false
    fetchStandardsLibraryStatus()
      .then((d) => {
        if (cancelled) return
        setData(d)
        setError(null)
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Could not load the Standards Library')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [reloadKey])

  const reload = useCallback(() => {
    setLoading(true)
    setReloadKey((k) => k + 1)
  }, [])

  const runs = data?.runs ?? []
  const lastDone = runs.find((r) => r.status !== 'running' && Object.keys(r.categories ?? {}).length > 0)
  const categories = Object.entries(lastDone?.categories ?? {}).sort((a, b) => a[0].localeCompare(b[0]))
  const totals = categories.reduce(
    (t, [, c]) => ({ files: t.files + c.files, pages: t.pages + c.pages, ocr: t.ocr + c.ocr_pages }),
    { files: 0, pages: 0, ocr: 0 },
  )
  const latest = runs[0]
  const missing = data?.missing ?? []
  const listed = data?.listed ?? 0

  return (
    <div className={limsPageShellClass}>
      <div className={cn(limsPanelClass, limsDarkBarClass, 'px-3 py-3 sm:px-4')}>
        <div className="pointer-events-none absolute inset-0 opacity-90" style={limsDarkBarGlowStyle} />
        <div className={limsDarkBarAccentClass} />
        <div className="relative flex flex-wrap items-center gap-2">
          <Library className="h-5 w-5 text-amber-300" aria-hidden />
          <h1 className="mr-auto text-base font-semibold tracking-wide">Standards Library</h1>
          <Button type="button" variant="outline" className={limsDarkBarBtnClass} onClick={() => setAskOpen(true)}>
            <BookOpenText className="h-4 w-4" aria-hidden />
            Ask AI
          </Button>
          <LibraryAskDialog open={askOpen} onOpenChange={setAskOpen} />
          <SyncNowControls onFinished={reload} />
          <Button type="button" variant="outline" className={limsDarkBarBtnClass} onClick={reload}>
            <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} aria-hidden />
            Refresh
          </Button>
        </div>
      </div>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <div className="grid grid-cols-2 gap-2 lg:grid-cols-5">
        <Stat
          label="Last Run"
          value={
            latest ? (
              <span className={cn('inline-flex rounded-md px-2 py-0.5 text-sm font-medium', STATUS_TONE[latest.status])}>
                {STATUS_LABEL[latest.status]}
              </span>
            ) : (
              '—'
            )
          }
        />
        <Stat label="Files Indexed" value={num(totals.files)} />
        <Stat label="Pages" value={num(totals.pages)} />
        <Stat
          label="Standards List Coverage"
          value={listed ? `${num(listed - (data?.noStandard ?? 0))} / ${num(listed)}` : '—'}
        />
        <Stat
          label="Referenced Standards"
          value={data?.refs ? `${num(data.refsFound)} / ${num(data.refs)}` : '—'}
        />
      </div>

      <Section
        title="Categories"
        onExport={() =>
          exportSheet(
            'Categories',
            categories.map(([name, c]) => ({ Category: name, Files: c.files, Pages: c.pages, 'OCR Pages': c.ocr_pages, 'To Review': c.review })),
          )
        }
      >
        <Table className={limsTableClass}>
          <TableHeader>
            <TableRow>
              <TableHead className={limsTableHeadClass}>Category</TableHead>
              <TableHead className={cn(limsTableHeadClass, 'text-right')}>Files</TableHead>
              <TableHead className={cn(limsTableHeadClass, 'text-right')}>Pages</TableHead>
              <TableHead className={cn(limsTableHeadClass, 'text-right')}>OCR Pages</TableHead>
              <TableHead className={cn(limsTableHeadClass, 'text-right')}>To Review</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody className={limsTableBodyToneClass}>
            {categories.length === 0 ? (
              <EmptyRow cols={5} text={loading ? 'Loading…' : 'No Files Indexed Yet.'} />
            ) : (
              categories.map(([name, c]) => (
                <TableRow key={name}>
                  <TableCell className="text-sm">{name}</TableCell>
                  <TableCell className="text-right text-sm">{num(c.files)}</TableCell>
                  <TableCell className="text-right text-sm">{num(c.pages)}</TableCell>
                  <TableCell className="text-right text-sm">{num(c.ocr_pages)}</TableCell>
                  <TableCell className="text-right text-sm">{c.review ? num(c.review) : '—'}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Section>

      <Section
        title="Recent Runs"
        onExport={() =>
          exportSheet(
            'Recent Runs',
            runs.map((r) => ({
              Started: formatWhen(r.started_at),
              Minutes: minutes(r) || '',
              Where: r.host || '',
              How: r.trigger === 'app' ? 'Sync Now' : r.trigger,
              Status: STATUS_LABEL[r.status],
              New: r.added,
              Changed: r.changed,
              Moved: r.moved,
              Removed: r.removed,
              'Pages Read': r.pages,
              'OCR Pages': r.ocr_pages,
              Errors: (r.errors ?? []).map((e) => `${e.file ? `${e.file.split('/').pop()}: ` : ''}${e.error}`).join('; '),
            })),
          )
        }
      >
        <Table className={limsTableClass}>
          <TableHeader>
            <TableRow>
              <TableHead className={limsTableHeadClass}>Started</TableHead>
              <TableHead className={limsTableHeadClass}>Where</TableHead>
              <TableHead className={limsTableHeadClass}>How</TableHead>
              <TableHead className={limsTableHeadClass}>Status</TableHead>
              <TableHead className={cn(limsTableHeadClass, 'text-right')}>New</TableHead>
              <TableHead className={cn(limsTableHeadClass, 'text-right')}>Changed</TableHead>
              <TableHead className={cn(limsTableHeadClass, 'text-right')}>Moved</TableHead>
              <TableHead className={cn(limsTableHeadClass, 'text-right')}>Removed</TableHead>
              <TableHead className={cn(limsTableHeadClass, 'text-right')}>Pages Read</TableHead>
              <TableHead className={limsTableHeadClass}>Errors</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody className={limsTableBodyToneClass}>
            {runs.length === 0 ? (
              <EmptyRow cols={10} text={loading ? 'Loading…' : 'No Runs Yet.'} />
            ) : (
              runs.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="whitespace-nowrap text-xs">
                    {formatWhen(r.started_at)}
                    {minutes(r) ? <span className="text-muted-foreground"> · {minutes(r)}</span> : null}
                  </TableCell>
                  <TableCell className="text-sm">{r.host || '—'}</TableCell>
                  <TableCell className="text-sm capitalize">{r.trigger === 'app' ? 'Sync Now' : r.trigger}</TableCell>
                  <TableCell>
                    <span className={cn('inline-flex rounded-md px-2 py-0.5 text-xs font-medium', STATUS_TONE[r.status])}>
                      {STATUS_LABEL[r.status]}
                    </span>
                  </TableCell>
                  <TableCell className="text-right text-sm">{num(r.added)}</TableCell>
                  <TableCell className="text-right text-sm">{num(r.changed)}</TableCell>
                  <TableCell className="text-right text-sm">{num(r.moved)}</TableCell>
                  <TableCell className="text-right text-sm">{num(r.removed)}</TableCell>
                  <TableCell className="whitespace-nowrap text-right text-sm">
                    {num(r.pages)}
                    {r.ocr_pages ? <span className="text-xs text-muted-foreground"> ({num(r.ocr_pages)} OCR)</span> : null}
                  </TableCell>
                  <TableCell className="max-w-[22rem] text-xs">
                    {r.errors?.length
                      ? r.errors.slice(0, 3).map((e, i) => (
                          <p key={i} className="break-words">
                            {e.file ? `${e.file.split('/').pop()}: ` : ''}
                            {e.error}
                          </p>
                        ))
                      : '—'}
                    {r.errors?.length > 3 ? <p className="text-muted-foreground">+{r.errors.length - 3} More</p> : null}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Section>

      <Section
        title="Files to Review"
        onExport={() =>
          exportSheet(
            'Files to Review',
            (data?.review ?? []).map((d) => ({
              Folder: d.relpath.split('/').slice(0, -1).join(' / '),
              File: d.relpath.split('/').pop() ?? d.relpath,
              Category: d.category || '',
              Reason: d.review,
            })),
          )
        }
      >
        <Table className={limsTableClass}>
          <TableHeader>
            <TableRow>
              <TableHead className={limsTableHeadClass}>File</TableHead>
              <TableHead className={limsTableHeadClass}>Category</TableHead>
              <TableHead className={limsTableHeadClass}>Reason</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody className={limsTableBodyToneClass}>
            {(data?.review ?? []).length === 0 ? (
              <EmptyRow cols={3} text={loading ? 'Loading…' : 'Nothing to Review.'} />
            ) : (
              data!.review.map((d) => (
                <TableRow key={d.relpath}>
                  <TableCell className="break-all text-sm">{d.relpath.split('/').slice(1).join(' / ') || d.relpath}</TableCell>
                  <TableCell className="whitespace-nowrap text-xs">{d.category || '—'}</TableCell>
                  <TableCell className="text-xs">{d.review}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Section>

      <Section
        title="Listed IS Numbers Without a File"
        onExport={() =>
          exportSheet(
            'Listed Without a File',
            missing.map((m) => ({
              'S.No': m.row_no ?? '',
              'IS Number': m.is_number,
              Title: m.title || '',
              Type: m.standard_type || '',
              Missing: [!m.has_standard && 'Standard', !m.has_manual && 'Product Manual'].filter(Boolean).join(' + '),
            })),
          )
        }
        note="From Standards List.xlsx in the Folder. Without a Product Manual Here, Checks Use the One Uploaded in IS Code Master."
      >
        <Table className={limsTableClass}>
          <TableHeader>
            <TableRow>
              <TableHead className={limsTableHeadClass}>S.No</TableHead>
              <TableHead className={limsTableHeadClass}>IS Number</TableHead>
              <TableHead className={limsTableHeadClass}>Title</TableHead>
              <TableHead className={limsTableHeadClass}>Type</TableHead>
              <TableHead className={limsTableHeadClass}>Missing</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody className={limsTableBodyToneClass}>
            {missing.length === 0 ? (
              <EmptyRow cols={5} text={loading ? 'Loading…' : listed ? 'Every Listed IS Number Has a File.' : 'No Standards List Read Yet.'} />
            ) : (
              missing.map((m, i) => (
                <TableRow key={`${m.is_number}-${i}`}>
                  <TableCell className="text-xs">{m.row_no ?? '—'}</TableCell>
                  <TableCell className="whitespace-nowrap text-sm">{m.is_number}</TableCell>
                  <TableCell className="text-xs">{m.title || '—'}</TableCell>
                  <TableCell className="whitespace-nowrap text-xs">{m.standard_type || '—'}</TableCell>
                  <TableCell className="whitespace-nowrap text-xs font-medium">
                    {[!m.has_standard && 'Standard', !m.has_manual && 'Product Manual'].filter(Boolean).join(' + ')}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Section>

      <Section
        title={`Referenced Standards Not in the Library${data?.refsWithdrawn ? ` (${num(data.refsWithdrawn)} Withdrawn by BIS Left Out)` : ''}`}
        onExport={async () =>
          exportSheet(
            'Referenced Not in Library',
            (await fetchAllMissingReferences()).map((r) => ({
              'Referenced Standard': `${r.ref_base}${r.ref_part ? ` Part ${r.ref_part}` : ''}`,
              'Cited By (Standards)': r.cited_by,
              'Cited In': (r.cited_in ?? []).join(', ') + (r.cited_by > (r.cited_in ?? []).length ? ' …' : ''),
              'Library Has': r.has_number ? 'Another Part Only' : '',
            })),
          )
        }
      >
        <Table className={limsTableClass}>
          <TableHeader>
            <TableRow>
              <TableHead className={limsTableHeadClass}>Referenced Standard</TableHead>
              <TableHead className={cn(limsTableHeadClass, 'text-right')}>Cited By</TableHead>
              <TableHead className={limsTableHeadClass}>Cited In</TableHead>
              <TableHead className={limsTableHeadClass}>Library Has</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody className={limsTableBodyToneClass}>
            {(data?.refsMissing ?? []).length === 0 ? (
              <EmptyRow cols={4} text={loading ? 'Loading…' : data?.refs ? 'Every Referenced Standard Is in the Library.' : 'Not Scanned Yet.'} />
            ) : (
              data!.refsMissing.map((r) => (
                <TableRow key={`${r.ref_base}-${r.ref_part}`}>
                  <TableCell className="whitespace-nowrap text-sm">
                    {r.ref_base}
                    {r.ref_part ? ` Part ${r.ref_part}` : ''}
                  </TableCell>
                  <TableCell className="text-right text-sm">
                    {num(r.cited_by)} {r.cited_by === 1 ? 'Standard' : 'Standards'}
                  </TableCell>
                  <TableCell className="text-xs">
                    {(r.cited_in ?? []).join(', ')}
                    {r.cited_by > (r.cited_in ?? []).length ? ' …' : ''}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-xs">{r.has_number ? 'Another Part Only' : '—'}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Section>

      {data?.oldIndexDocs ? (
        <p className="text-xs text-muted-foreground">
          Old Index: {num(data.oldIndexDocs)} Documents Still Used Until the First Complete Run of the Library.
        </p>
      ) : null}
    </div>
  )
}
