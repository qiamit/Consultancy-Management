import { useEffect, useState } from 'react'
import { Download, Eye, FileText } from 'lucide-react'
import { supabase } from '@/lib/supabaseClient'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import {
  limsDarkBarGlowStyle,
  limsDialogClass,
  limsDialogSidebarOverlayClass,
  limsOutlineBtnClass,
} from '@/lib/limsThemeUi'
import { cn } from '@/lib/utils'
import { formatIsCodeLabelFromParts } from './formatIsCodeLabel'
import { loadIsCodeFileLinks, type IsCodeFileLink } from './loadIsCodeFileLinks'
import type { IsCodeRow } from './types'

function formatSupabaseError(err: unknown): string {
  if (!err) return 'Unknown error'
  if (typeof err === 'string') return err
  const anyErr = err as { message?: string; details?: string; hint?: string }
  const parts = [anyErr.message, anyErr.details, anyErr.hint]
    .map((p) => (typeof p === 'string' ? p.trim() : ''))
    .filter(Boolean)
  return parts.length ? parts.join(' | ') : 'Unknown error'
}

function display(value: string | number | null | undefined): string {
  if (value == null) return '—'
  const text = String(value).trim()
  return text.length > 0 ? text : '—'
}

function DetailCard({
  label,
  value,
  className,
}: {
  label: string
  value: string
  className?: string
}) {
  return (
    <div
      className={cn(
        'min-w-0 border border-stone-400 bg-white px-3 py-2.5 shadow-sm ring-1 ring-amber-700/10',
        className,
      )}
    >
      <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-stone-500">{label}</p>
      <p className="mt-1 break-words text-sm font-semibold leading-snug text-[#1c1917]">{value}</p>
    </div>
  )
}

/**
 * Read-only IS Code details (card layout) + attached files with View/Download.
 * Centered in the main content area; sidebar stays visible.
 */
export function IsCodeDetailsDialog({
  open,
  onOpenChange,
  isCodeId,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  isCodeId: string | null
  onSaved?: () => void
}) {
  const [loading, setLoading] = useState(false)
  const [filesLoading, setFilesLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [row, setRow] = useState<IsCodeRow | null>(null)
  const [files, setFiles] = useState<IsCodeFileLink[]>([])

  useEffect(() => {
    if (!open || !isCodeId) {
      setRow(null)
      setFiles([])
      setError(null)
      return
    }

    let cancelled = false
    setLoading(true)
    setFilesLoading(true)
    setError(null)
    void (async () => {
      try {
        const { data, error: fetchError } = await supabase
          .from('is_codes')
          .select('*')
          .eq('id', isCodeId)
          .maybeSingle()
        if (cancelled) return
        if (fetchError) throw fetchError
        if (!data) {
          setError('IS Code not found.')
          setRow(null)
          setFiles([])
          setFilesLoading(false)
          return
        }
        setRow(data as IsCodeRow)
        setLoading(false)

        // Files are best-effort — never block the details view on storage/API errors.
        const fileList = await loadIsCodeFileLinks(isCodeId)
        if (!cancelled) {
          setFiles(fileList)
          setFilesLoading(false)
        }
      } catch (err) {
        if (!cancelled) {
          setError(formatSupabaseError(err))
          setRow(null)
          setFiles([])
          setLoading(false)
          setFilesLoading(false)
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [open, isCodeId])

  const title =
    row == null
      ? 'IS Code Details'
      : formatIsCodeLabelFromParts(row.is_number, row.revision_year) || 'IS Code Details'

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        persistOnFocusLoss
        aria-describedby={undefined}
        overlayClassName={limsDialogSidebarOverlayClass}
        className={cn(limsDialogClass, 'max-w-3xl bg-white')}
      >
        <div className="relative shrink-0 overflow-hidden bg-gradient-to-br from-stone-800 via-stone-900 to-stone-950 px-4 py-2.5 text-white sm:px-5 sm:py-3">
          <div
            className="pointer-events-none absolute inset-0 opacity-[0.18]"
            style={limsDarkBarGlowStyle}
          />
          <div className="absolute bottom-0 left-0 h-[2px] w-full bg-gradient-to-r from-amber-500 via-amber-300 to-transparent" />
          <DialogHeader className="relative pr-10 text-left">
            <DialogTitle className="truncate text-base font-semibold tracking-tight text-white sm:text-lg">
              {title}
            </DialogTitle>
            <p className="mt-0.5 text-xs text-stone-300">IS Code details · View only</p>
          </DialogHeader>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overflow-x-hidden bg-gradient-to-b from-stone-100/80 to-white px-4 py-4 sm:px-6 sm:py-5">
          {loading ? <p className="text-sm text-stone-600">Loading IS Code details…</p> : null}
          {error ? (
            <p className="border-l-2 border-destructive bg-destructive/5 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          ) : null}

          {!loading && !error && row ? (
            <>
              <section className="space-y-2">
                <h3 className="text-[11px] font-bold uppercase tracking-[0.14em] text-amber-900">
                  Code details
                </h3>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                  <DetailCard label="IS Number" value={display(row.is_number)} />
                  <DetailCard label="Revision Year" value={display(row.revision_year)} />
                  <DetailCard label="Reaffirmation Year" value={display(row.reaffirmation_year)} />
                  <DetailCard label="Amendment Number" value={display(row.amendment_number)} />
                  <DetailCard label="Aspect" value={display(row.aspect)} />
                  <DetailCard label="Unit of IS" value={display(row.unit_of_is)} />
                  <DetailCard label="Product Manual Number" value={display(row.product_manual_number)} />
                  <DetailCard label="Testing Charges" value={display(row.testing_charges)} />
                  <DetailCard label="Title" value={display(row.title)} className="sm:col-span-3" />
                  <DetailCard label="Remarks" value={display(row.remarks)} className="sm:col-span-3" />
                </div>
              </section>

              <section className="space-y-2">
                <h3 className="text-[11px] font-bold uppercase tracking-[0.14em] text-amber-900">
                  Marking fee & slabs
                </h3>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
                  <DetailCard label="MMF Large Scale" value={display(row.mmf_large_scale)} />
                  <DetailCard label="MMF Medium Scale" value={display(row.mmf_medium_scale)} />
                  <DetailCard label="MMF Small Scale" value={display(row.mmf_small_scale)} />
                  <DetailCard label="MMF Micro Scale" value={display(row.mmf_micro_scale)} />
                  <DetailCard
                    label="Slab 1"
                    value={`${display(row.slab_1_quantity)} / ${display(row.slab_1_rate)}`}
                  />
                  <DetailCard
                    label="Slab 2"
                    value={`${display(row.slab_2_quantity)} / ${display(row.slab_2_rate)}`}
                  />
                  <DetailCard
                    label="Slab 3"
                    value={`${display(row.slab_3_quantity)} / ${display(row.slab_3_rate)}`}
                  />
                </div>
              </section>

              <section className="space-y-2">
                <h3 className="text-[11px] font-bold uppercase tracking-[0.14em] text-amber-900">
                  IS Code files
                </h3>
                {filesLoading ? (
                  <p className="text-sm text-stone-600">Loading files…</p>
                ) : files.length === 0 ? (
                  <div className="border border-dashed border-stone-400 bg-[#fffcf7] px-3 py-6 text-center text-sm text-stone-500">
                    No files attached to this IS Code.
                  </div>
                ) : (
                  <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {files.map((file) => (
                      <li
                        key={file.file_name}
                        className="flex items-center gap-2 border border-stone-400 bg-white px-3 py-2.5 shadow-sm ring-1 ring-amber-700/10"
                      >
                        <FileText className="h-4 w-4 shrink-0 text-amber-800" aria-hidden />
                        <span
                          className="min-w-0 flex-1 truncate text-sm font-medium text-[#1c1917]"
                          title={file.file_name}
                        >
                          {file.file_name}
                        </span>
                        {file.url ? (
                          <div className="inline-flex shrink-0 items-center gap-0.5">
                            <a
                              href={file.url}
                              target="_blank"
                              rel="noreferrer"
                              className={cn(limsOutlineBtnClass, 'inline-flex h-8 w-8 items-center justify-center p-0')}
                              title={`View ${file.file_name}`}
                              aria-label={`View ${file.file_name}`}
                            >
                              <Eye size={15} aria-hidden />
                            </a>
                            <a
                              href={file.url}
                              download={file.file_name}
                              className={cn(limsOutlineBtnClass, 'inline-flex h-8 w-8 items-center justify-center p-0')}
                              title={`Download ${file.file_name}`}
                              aria-label={`Download ${file.file_name}`}
                            >
                              <Download size={15} aria-hidden />
                            </a>
                          </div>
                        ) : (
                          <span className="shrink-0 text-[11px] text-stone-500">Unavailable</span>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </>
          ) : null}
        </div>

        <DialogFooter className="shrink-0 border-t border-stone-300 bg-stone-50 px-4 py-3 sm:justify-end sm:px-6">
          <Button
            type="button"
            variant="outline"
            className={limsOutlineBtnClass}
            onClick={() => onOpenChange(false)}
          >
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
