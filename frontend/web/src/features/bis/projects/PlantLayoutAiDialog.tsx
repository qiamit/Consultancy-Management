import { useEffect, useMemo, useRef, useState } from 'react'
import { Check, ChevronDown, FileText, ImagePlus, Loader2, Send, Sparkles, X } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Textarea } from '@/components/ui/textarea'
import { isVisionModelMissingError, MAX_AI_IMAGES } from '@/components/qi-assistant/qiAssistantApi'
import {
  limsDialogSidebarOverlayClass,
  limsDialogSidebarPortalClass,
  limsFieldClass,
  limsOutlineBtnClass,
  limsPrimaryBtnClass,
} from '@/lib/limsThemeUi'
import { cn } from '@/lib/utils'
import { isAiModelMissingError } from './generateProcessFlowChart'
import {
  generatePlantLayoutBoxes,
  PLANT_LAYOUT_AI_ACCEPT,
  readPlantLayoutSource,
  type PlantLayoutAiSource,
} from './generatePlantLayout'
import {
  buildPlantLayoutSvgMarkup,
  normalizeBox,
  plantLayoutBoxColors,
  plantLayoutBoxSizeMm,
  type PlantLayoutBox,
} from './plantLayoutModel'

/**
 * AI draft of the Plant Layout from a photo / sketch / PDF of the factory: a vision model reads the drawing and returns
 * the areas as boxes (percent of the premises frame); the preview shows them as they will print, then Replace or Add.
 */
export function PlantLayoutAiDialog({
  open,
  onOpenChange,
  disabled = false,
  applicantName,
  productName,
  boxes,
  onApply,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  disabled?: boolean
  applicantName: string
  productName: string
  boxes: PlantLayoutBox[]
  onApply: (boxes: PlantLayoutBox[], mode: 'replace' | 'append') => void
}) {
  const [sources, setSources] = useState<Array<PlantLayoutAiSource & { on: boolean }>>([])
  const [readingFiles, setReadingFiles] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const [append, setAppend] = useState(false)
  const [instructions, setInstructions] = useState('')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<PlantLayoutBox[] | null>(null)
  const [notes, setNotes] = useState('')
  const [error, setError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const hasCanvas = boxes.length > 0
  const mode: 'replace' | 'append' = append && hasCanvas ? 'append' : 'replace'
  const picked = sources.filter((s) => s.on && s.images.length > 0)
  const pictureCount = picked.reduce((n, s) => n + s.images.length, 0)

  useEffect(() => {
    if (!open) return
    setResult(null)
    setNotes('')
    setError(null)
    setBusy(false)
  }, [open])

  const addFiles = async (files: FileList | File[] | null) => {
    const list = Array.from(files ?? [])
    if (!list.length) return
    setReadingFiles(true)
    try {
      const read = await Promise.all(list.map((f) => readPlantLayoutSource(f)))
      setSources((prev) => [...prev, ...read.map((s) => ({ ...s, on: s.images.length > 0 }))])
      const bad = read.filter((s) => s.problem)
      if (bad.length) {
        toast.warning(`${bad.length} File(s) Could Not Be Read`, {
          description: bad.map((s) => `${s.fileName}: ${s.problem}`).join(' · '),
        })
      }
    } finally {
      setReadingFiles(false)
    }
  }

  const generate = async () => {
    if (disabled || busy) return
    if (picked.length === 0) {
      setError('Add a Photo or PDF of the Factory Layout First.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      const out = await generatePlantLayoutBoxes({ applicantName, productName, sources: picked, instructions })
      setResult(out.boxes)
      setNotes(out.notes)
      if (out.picturesSkipped > 0) {
        toast.warning(`Only the First ${out.picturesSent} Pictures Were Read`, {
          description: `The AI Reads at Most ${MAX_AI_IMAGES} Pictures at a Time.`,
        })
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'AI Generation Failed'
      if (isVisionModelMissingError(msg)) {
        setError(msg)
        toast.error('No Vision AI Model Is Set Up', { description: msg })
      } else if (isAiModelMissingError(msg)) {
        const text = 'No AI Model Is Set Up. Go to Settings → AI Settings → AI Models and Add a Default Model with an API Key.'
        setError(text)
        toast.error('No AI Model Is Set Up', {
          description: 'Go to Settings → AI Settings → AI Models and Add a Default Model with an API Key.',
        })
      } else {
        setError(msg)
        toast.error(msg)
      }
    } finally {
      setBusy(false)
    }
  }

  const cleanResult = (result ?? []).map((b) => normalizeBox({ ...b, label: b.label.replace(/\s+/g, ' ').trim() || 'Area' }))
  const previewSvg = useMemo(() => (cleanResult.length ? buildPlantLayoutSvgMarkup(cleanResult) : ''), [result]) // eslint-disable-line react-hooks/exhaustive-deps

  const apply = () => {
    if (cleanResult.length === 0) return
    if (mode === 'replace' && hasCanvas && !window.confirm('Replace the Boxes on This Canvas with the AI Layout?')) return
    onApply(cleanResult, mode)
    onOpenChange(false)
    toast.success(
      mode === 'append' ? `Added ${cleanResult.length} AI Box(es)` : `Canvas Filled with ${cleanResult.length} AI Box(es)`,
      { description: 'Check the Boxes, Then Click Save.' },
    )
  }

  const thumbFor = (s: PlantLayoutAiSource) => s.images[0] ?? ''

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        persistOnFocusLoss
        layer="top"
        aria-describedby={undefined}
        overlayClassName={limsDialogSidebarOverlayClass}
        portalClassName={limsDialogSidebarPortalClass}
        className={cn(
          'flex max-h-[min(92dvh,900px)] w-[min(96vw,820px)] max-w-none flex-col gap-0 overflow-hidden rounded-none border-4 border-stone-700 bg-[#fffcf7] p-0 shadow-2xl ring-2 ring-amber-700/35',
          '[&>button]:!rounded-none [&>button]:opacity-100',
        )}
      >
        <div className="relative shrink-0 bg-gradient-to-br from-stone-800 via-stone-900 to-stone-950 px-4 py-3 text-white">
          <div
            className="pointer-events-none absolute inset-0 opacity-[0.18]"
            style={{
              backgroundImage:
                'radial-gradient(circle at 12% 20%, rgba(217,119,6,0.45), transparent 42%), radial-gradient(circle at 88% 0%, rgba(251,191,36,0.25), transparent 35%)',
            }}
          />
          <div className="absolute bottom-0 left-0 h-[2px] w-full bg-gradient-to-r from-amber-500 via-amber-300 to-transparent" />
          <DialogHeader className="relative space-y-1 pr-10 text-left">
            <DialogTitle className="flex items-center gap-2.5 text-base font-semibold tracking-tight text-white">
              <span className="flex h-8 w-8 items-center justify-center border border-amber-400/40 bg-amber-400/15">
                <Sparkles size={16} className="text-amber-200" />
              </span>
              Plant Layout AI
            </DialogTitle>
          </DialogHeader>
        </div>

        {/* Insert Mode · Select Source on one line. */}
        <div className="shrink-0 border-b border-stone-400 bg-[#fffcf7] px-4 py-3">
          <div className="grid grid-cols-1 items-end gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
            <label className="flex flex-col gap-1 text-xs text-stone-700">
              <span className="font-semibold">Insert Mode</span>
              <select
                className={cn(limsFieldClass, 'h-9')}
                value={mode}
                disabled={disabled || busy || !hasCanvas}
                onChange={(e) => setAppend(e.target.value === 'append')}
              >
                <option value="replace">Replace Canvas</option>
                <option value="append">Add to Canvas</option>
              </select>
            </label>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  className={cn(limsOutlineBtnClass, 'h-10 shrink-0 gap-1.5 px-3 text-sm')}
                  disabled={disabled || busy || readingFiles}
                  title="Choose What the AI Reads"
                >
                  {readingFiles ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
                  Select Source
                  <span className="text-xs text-stone-500">
                    ({sources.filter((s) => s.on).length}/{sources.length})
                  </span>
                  <ChevronDown className="h-4 w-4 opacity-60" aria-hidden />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="z-[110] w-80 rounded-none p-1">
                {sources.length === 0 ? (
                  <p className="px-2 py-2 text-[11px] text-stone-500">No Files Yet — Add a Photo or PDF of the Layout.</p>
                ) : null}
                {sources.map((src) => (
                  <DropdownMenuCheckboxItem
                    key={src.id}
                    className="items-start gap-2 rounded-none py-2 pl-2 pr-8 [&>span:first-child]:hidden"
                    checked={src.on}
                    onCheckedChange={(on) => {
                      // An unreadable file stays off but can still be removed.
                      if (!src.images.length) return
                      setSources((prev) => prev.map((s) => (s.id === src.id ? { ...s, on: on === true } : s)))
                    }}
                    onSelect={(e) => e.preventDefault()}
                  >
                    <span
                      aria-hidden
                      className={cn(
                        'mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center border',
                        src.on ? 'border-amber-700 bg-amber-700 text-white' : 'border-stone-400 bg-white',
                      )}
                    >
                      {src.on ? <Check className="h-3 w-3" /> : null}
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold text-stone-800">{src.fileName}</span>
                      <span className="block text-[11px] text-stone-500">
                        {src.problem
                          ? src.problem
                          : !src.on
                            ? 'Turned Off'
                            : src.kind === 'pdf'
                              ? `PDF — ${src.images.length} Page${src.images.length === 1 ? '' : 's'} Read`
                              : 'Photo'}
                      </span>
                    </span>
                    <button
                      type="button"
                      className="absolute right-1.5 top-2 inline-flex h-6 w-6 items-center justify-center text-stone-500 hover:bg-red-50 hover:text-red-700"
                      title="Remove File"
                      aria-label={`Remove ${src.fileName}`}
                      onPointerDown={(e) => e.stopPropagation()}
                      onClick={(e) => {
                        e.stopPropagation()
                        setSources((prev) => prev.filter((s) => s.id !== src.id))
                      }}
                    >
                      <X size={13} aria-hidden />
                    </button>
                  </DropdownMenuCheckboxItem>
                ))}
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="gap-2 rounded-none py-2 pl-2 text-sm font-semibold text-amber-800"
                  onSelect={() => fileInputRef.current?.click()}
                >
                  <ImagePlus className="h-4 w-4" aria-hidden />
                  Add Files (Photo or PDF)
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <input
              ref={fileInputRef}
              type="file"
              accept={PLANT_LAYOUT_AI_ACCEPT}
              multiple
              className="sr-only"
              onChange={(e) => {
                void addFiles(e.target.files)
                e.target.value = ''
              }}
            />
          </div>
        </div>

        <div
          className="min-h-0 flex-1 overflow-y-auto bg-white px-4 py-3"
          onDragOver={(e) => {
            if (busy || disabled) return
            e.preventDefault()
            setDragOver(true)
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault()
            setDragOver(false)
            if (busy || disabled) return
            void addFiles(e.dataTransfer.files)
          }}
        >
          {busy ? (
            <p className="flex items-center justify-center gap-2 py-10 text-sm text-stone-600">
              <Loader2 size={16} className="animate-spin" aria-hidden />
              Reading the Drawing and Placing the Areas…
            </p>
          ) : result ? (
            <div className="space-y-2">
              <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-amber-800/80">
                Preview — {cleanResult.length} Box{cleanResult.length === 1 ? '' : 'es'} (Rename or Remove Before Applying)
              </p>
              <div
                className="border border-stone-300 bg-[#fffdf8] [&_svg]:block [&_svg]:h-auto [&_svg]:w-full"
                // Markup is built from escaped labels by buildPlantLayoutSvgMarkup (the print renderer).
                dangerouslySetInnerHTML={{ __html: previewSvg }}
              />
              <ul className="grid grid-cols-1 gap-1 sm:grid-cols-2">
                {(result ?? []).map((box, i) => {
                  const colors = plantLayoutBoxColors(box)
                  const size = plantLayoutBoxSizeMm(box)
                  return (
                    <li key={box.id} className="flex items-center gap-1.5">
                      <span
                        aria-hidden
                        className="h-5 w-5 shrink-0 border"
                        style={{ backgroundColor: colors.fill, borderColor: colors.stroke }}
                      />
                      <input
                        className={cn(limsFieldClass, 'h-8 min-w-0 flex-1 px-2 text-sm')}
                        value={box.label}
                        disabled={disabled}
                        aria-label={`Box ${i + 1} Name`}
                        onChange={(e) =>
                          setResult((prev) => (prev ? prev.map((b) => (b.id === box.id ? { ...b, label: e.target.value } : b)) : prev))
                        }
                      />
                      <span className="w-[4.5rem] shrink-0 text-right text-[10px] tabular-nums text-stone-500" title="Width × Length (mm)">
                        {size.widthMm}×{size.lengthMm}
                      </span>
                      <button
                        type="button"
                        className="inline-flex h-8 w-8 shrink-0 items-center justify-center text-stone-500 hover:bg-red-50 hover:text-red-700"
                        title="Remove Box"
                        aria-label={`Remove Box ${i + 1}`}
                        disabled={disabled}
                        onClick={() => setResult((prev) => (prev ? prev.filter((b) => b.id !== box.id) : prev))}
                      >
                        <X size={14} aria-hidden />
                      </button>
                    </li>
                  )
                })}
              </ul>
              {notes ? <p className="text-[11px] italic text-stone-500">AI Note: {notes}</p> : null}
            </div>
          ) : sources.length ? (
            <div className="space-y-2">
              <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-stone-600">
                Files for the AI — {pictureCount} Picture{pictureCount === 1 ? '' : 's'}
              </p>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {sources.map((src) => (
                  <div
                    key={src.id}
                    className={cn(
                      'relative flex flex-col border bg-stone-50',
                      src.on ? 'border-amber-600' : 'border-stone-300 opacity-60',
                    )}
                  >
                    <div className="flex aspect-[4/3] items-center justify-center overflow-hidden bg-white">
                      {thumbFor(src) ? (
                        <img src={thumbFor(src)} alt="" className="h-full w-full object-contain" />
                      ) : (
                        <FileText className="h-8 w-8 text-stone-400" aria-hidden />
                      )}
                    </div>
                    <p className="truncate px-1.5 pt-1 text-[11px] font-semibold text-stone-800" title={src.fileName}>
                      {src.fileName}
                    </p>
                    <p className={cn('truncate px-1.5 pb-1 text-[10px]', src.problem ? 'text-red-700' : 'text-stone-500')} title={src.problem || undefined}>
                      {src.problem || (src.kind === 'pdf' ? `PDF — ${src.images.length} Page${src.images.length === 1 ? '' : 's'}` : 'Photo')}
                    </p>
                    <button
                      type="button"
                      className="absolute right-1 top-1 inline-flex h-6 w-6 items-center justify-center border border-stone-300 bg-white/90 text-stone-600 hover:bg-red-50 hover:text-red-700"
                      title="Remove File"
                      aria-label={`Remove ${src.fileName}`}
                      disabled={busy || disabled}
                      onClick={() => setSources((prev) => prev.filter((s) => s.id !== src.id))}
                    >
                      <X size={13} aria-hidden />
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  className="flex aspect-[4/3] flex-col items-center justify-center gap-1 border border-dashed border-stone-400 text-xs font-semibold text-amber-800 hover:border-amber-600 hover:bg-amber-50"
                  disabled={busy || disabled || readingFiles}
                  onClick={() => fileInputRef.current?.click()}
                >
                  {readingFiles ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden /> : <ImagePlus className="h-5 w-5" aria-hidden />}
                  Add More
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              className={cn(
                'flex w-full flex-col items-center justify-center gap-2 border-2 border-dashed px-4 py-10 text-center transition-colors',
                dragOver ? 'border-amber-600 bg-amber-50' : 'border-stone-400 hover:border-amber-600 hover:bg-amber-50/50',
              )}
              disabled={busy || disabled || readingFiles}
              onClick={() => fileInputRef.current?.click()}
            >
              {readingFiles ? (
                <Loader2 className="h-7 w-7 animate-spin text-amber-700" aria-hidden />
              ) : (
                <ImagePlus className="h-7 w-7 text-amber-700" aria-hidden />
              )}
              <span className="text-sm font-semibold text-stone-800">Add a Photo or PDF of the Factory Layout</span>
              <span className="max-w-md text-xs text-stone-500">
                A Hand-Drawn Sketch Is Fine. JPG, PNG, WEBP or PDF (HEIC Where the Browser Can Open It); Several Files
                Can Be Added. The AI Draws the Areas as Boxes in Their Drawn Positions.
              </span>
            </button>
          )}
        </div>

        {error ? <p className="border-t border-red-200 bg-red-50 px-4 py-2 text-xs text-red-800">{error}</p> : null}

        {/* Instructions, Generate and Apply on one line (they wrap only on narrow phones). */}
        <div className="shrink-0 border-t border-stone-400 bg-[#fffcf7] p-3 sm:px-4">
          <div className="flex flex-wrap items-end gap-2 sm:flex-nowrap">
            <Textarea
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              className="min-h-10 max-h-28 min-w-[10rem] flex-1 basis-full resize-none sm:basis-auto rounded-none border-stone-500 bg-stone-50 shadow-none focus-visible:border-amber-600 focus-visible:ring-amber-500/20"
              rows={1}
              disabled={busy || disabled}
              placeholder="Special Instructions (Optional)"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  void generate()
                }
              }}
              aria-label="Special Instructions for the Plant Layout"
            />
            <Button
              type="button"
              className="h-10 shrink-0 rounded-none bg-amber-700 px-3 text-white hover:bg-amber-800"
              title="Draw the Plant Layout with AI"
              disabled={busy || disabled || readingFiles || picked.length === 0}
              onClick={() => void generate()}
            >
              {busy ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
              <span className="ml-1.5 text-sm">{result ? 'Regenerate' : 'Generate'}</span>
            </Button>
            <Button
              type="button"
              className={cn(limsPrimaryBtnClass, 'h-10 shrink-0 px-4 text-sm')}
              disabled={busy || disabled || cleanResult.length === 0}
              onClick={apply}
            >
              {!hasCanvas ? 'Add to Canvas' : mode === 'append' ? 'Add to Canvas' : 'Replace Canvas'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
