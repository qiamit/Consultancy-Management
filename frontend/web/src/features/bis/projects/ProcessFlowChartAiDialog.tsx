import { useEffect, useRef, useState } from 'react'
import { Check, ChevronDown, FilePlus2, Loader2, Send, Sparkles, X } from 'lucide-react'
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
import {
  limsDialogSidebarOverlayClass,
  limsDialogSidebarPortalClass,
  limsFieldClass,
  limsOutlineBtnClass,
  limsPrimaryBtnClass,
} from '@/lib/limsThemeUi'
import { cn } from '@/lib/utils'
import {
  generateProcessFlowSteps,
  isAiModelMissingError,
  loadProcessFlowAiSources,
  loadProcessFlowWebReference,
  readProcessFlowReferencePdf,
  type ProcessFlowAiSourceDoc,
  type ProcessFlowAiSources,
} from './generateProcessFlowChart'
import { flattenProcessFlowTree, processFlowNodeHasContent, type ProcessFlowNode } from './processFlowModel'

const STEP_COUNTS = [8, 10, 12, 14, 16, 18, 20, 24] as const

type SourceKey = 'standard' | 'manual' | 'scope' | 'web'
const SOURCE_LABELS: Record<SourceKey, string> = {
  standard: 'IS Standard',
  manual: 'Product Manual',
  scope: 'Licence Scope',
  web: 'Web Reference',
}
const TURNED_OFF = { fileName: '', text: '', problem: 'Turned Off' }

/**
 * AI draft of the Process Flow Chart: reads the IS standard and Product Manual PDFs of the project's IS code plus the
 * licence scope, shows the ordered steps to check / edit, then replaces or extends the chart (Save keeps it).
 */
export function ProcessFlowChartAiDialog({
  open,
  onOpenChange,
  disabled = false,
  applicantName,
  isNumber,
  isTitle,
  productName,
  licenseScope,
  isCodeId,
  nodes,
  onApplySteps,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  disabled?: boolean
  applicantName: string
  isNumber: string
  isTitle: string
  productName: string
  licenseScope: string
  isCodeId?: string | null
  nodes: ProcessFlowNode[]
  onApplySteps: (nodes: ProcessFlowNode[], mode: 'replace' | 'append') => void
}) {
  const [stepCount, setStepCount] = useState<number | null>(null)
  const [append, setAppend] = useState(false)
  const [instructions, setInstructions] = useState('')
  const [busy, setBusy] = useState(false)
  const [phase, setPhase] = useState('')
  /** AI flow as chart boxes (branches included), editable before it goes into the chart. */
  const [steps, setSteps] = useState<ProcessFlowNode[] | null>(null)
  const [notes, setNotes] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [sources, setSources] = useState<ProcessFlowAiSources | null>(null)
  /** Select Source: which inputs the AI reads (all on by default). */
  const [use, setUse] = useState<Record<SourceKey, boolean>>({ standard: true, manual: true, scope: true, web: true })
  const [web, setWeb] = useState<ProcessFlowAiSourceDoc | null>(null)
  const webCacheRef = useRef<{ key: string; doc: ProcessFlowAiSourceDoc } | null>(null)
  /** Extra PDFs added under Select Source → Add Files (read once when added). */
  const [references, setReferences] = useState<Array<{ id: string; doc: ProcessFlowAiSourceDoc; on: boolean }>>([])
  const [readingFiles, setReadingFiles] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  /** PDFs are read once per IS code while the dialog stays mounted (Regenerate does not download them again). */
  const sourcesCacheRef = useRef<{ isCodeId: string; sources: ProcessFlowAiSources } | null>(null)

  const existingSteps = flattenProcessFlowTree(nodes)
    .map((r) => r.node)
    .filter(processFlowNodeHasContent)
    .map((n) => n.label.trim())
  const hasChart = existingSteps.length > 0
  const scopeGiven = licenseScope.trim().length > 0

  useEffect(() => {
    if (!open) return
    setSteps(null)
    setNotes('')
    setError(null)
    setPhase('')
    setBusy(false)
  }, [open])

  const addReferenceFiles = async (files: FileList | null) => {
    const list = Array.from(files ?? []).filter((f) => /\.pdf$/i.test(f.name) || f.type === 'application/pdf')
    if (!list.length) return
    setReadingFiles(true)
    try {
      const docs = await Promise.all(list.map((f) => readProcessFlowReferencePdf(f)))
      setReferences((prev) => [
        ...prev,
        ...docs.map((doc, i) => ({ id: `${Date.now()}-${i}-${doc.fileName}`, doc, on: Boolean(doc.text) })),
      ])
      const unreadable = docs.filter((d) => !d.text)
      if (unreadable.length) toast.warning(`${unreadable.length} File(s) Could Not Be Read`, { description: unreadable.map((d) => d.problem).join(' · ') })
      else toast.success(`${docs.length} Reference File(s) Added`)
    } finally {
      setReadingFiles(false)
    }
  }

  const generate = async () => {
    if (disabled || busy) return
    setBusy(true)
    setError(null)
    try {
      const id = (isCodeId ?? '').trim()
      let loaded = sourcesCacheRef.current?.isCodeId === id ? sourcesCacheRef.current.sources : null
      if (!loaded && (use.standard || use.manual)) {
        setPhase('Reading IS Standard and Product Manual…')
        loaded = await loadProcessFlowAiSources(id)
        // A failed download is tried again next time; a missing or scanned PDF is not.
        const transient = [loaded.standard, loaded.manual].some((d) => /could not be/i.test(d.problem))
        sourcesCacheRef.current = transient ? null : { isCodeId: id, sources: loaded }
      }
      const picked: ProcessFlowAiSources = {
        standard: use.standard && loaded ? loaded.standard : TURNED_OFF,
        manual: use.manual && loaded ? loaded.manual : TURNED_OFF,
      }
      setSources(picked)
      if ((use.standard || use.manual) && !picked.standard.text && !picked.manual.text) {
        toast.warning('IS PDFs Not Available', {
          description: 'Steps Are Based on the IS Title and Licence Scope Only — Please Check Them.',
        })
      }
      let webDoc: ProcessFlowAiSourceDoc | null = null
      if (use.web) {
        const key = (isTitle || productName).trim()
        webDoc = webCacheRef.current?.key === key ? webCacheRef.current.doc : null
        if (!webDoc) {
          setPhase('Reading Web Reference…')
          webDoc = await loadProcessFlowWebReference(key)
          if (webDoc.text) webCacheRef.current = { key, doc: webDoc }
        }
        setWeb(webDoc)
      }
      setPhase('Generating Process Steps…')
      const result = await generateProcessFlowSteps({
        applicantName,
        isNumber,
        isTitle,
        productName,
        licenseScope: use.scope ? licenseScope : '',
        isCodeId,
        sources: picked,
        references: references.filter((r) => r.on).map((r) => r.doc),
        web: webDoc,
        stepCount,
        existingSteps: append ? existingSteps : [],
        instructions,
      })
      setSteps(result.nodes)
      setNotes(result.notes)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'AI Generation Failed'
      if (isAiModelMissingError(msg)) {
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
      setPhase('')
    }
  }

  // Boxes left blank are dropped with everything under them.
  const blank = new Set((steps ?? []).filter((n) => !n.label.trim()).map((n) => n.id))
  for (let grew = true; grew; ) {
    grew = false
    for (const n of steps ?? []) if (n.parentId && blank.has(n.parentId) && !blank.has(n.id)) (blank.add(n.id), (grew = true))
  }
  const cleanSteps = (steps ?? [])
    .filter((n) => !blank.has(n.id))
    .map((n) => ({ ...n, label: n.label.replace(/\s+/g, ' ').trim(), linkFromId: n.linkFromId && blank.has(n.linkFromId) ? null : n.linkFromId }))

  /** Removes a box and everything under it; boxes fed from it are fed from its own source instead. */
  const removeStep = (id: string) =>
    setSteps((prev) => {
      if (!prev) return prev
      const gone = new Set([id])
      for (let grew = true; grew; ) {
        grew = false
        for (const n of prev) if (n.parentId && gone.has(n.parentId) && !gone.has(n.id)) (gone.add(n.id), (grew = true))
      }
      const removed = prev.find((n) => n.id === id)
      return prev
        .filter((n) => !gone.has(n.id))
        .map((n) => (n.linkFromId && gone.has(n.linkFromId) ? { ...n, linkFromId: removed?.linkFromId ?? null } : n))
    })
  const mode: 'replace' | 'append' = append && hasChart ? 'append' : 'replace'

  const apply = () => {
    if (cleanSteps.length === 0) return
    if (mode === 'replace' && hasChart && !window.confirm('Replace the Steps in This Chart with the AI Steps?')) return
    onApplySteps(cleanSteps, mode)
    onOpenChange(false)
    toast.success(
      mode === 'append' ? `Added ${cleanSteps.length} AI Step(s)` : `Chart Filled with ${cleanSteps.length} AI Step(s)`,
      { description: 'Check the Boxes, Then Click Save.' },
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        persistOnFocusLoss
        layer="top"
        aria-describedby={undefined}
        overlayClassName={limsDialogSidebarOverlayClass}
        portalClassName={limsDialogSidebarPortalClass}
        className={cn(
          'flex max-h-[min(92dvh,860px)] w-[min(96vw,720px)] max-w-none flex-col gap-0 overflow-hidden rounded-none border-4 border-stone-700 bg-[#fffcf7] p-0 shadow-2xl ring-2 ring-amber-700/35',
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
              Process Flow Chart AI
            </DialogTitle>
          </DialogHeader>
        </div>

        <div className="shrink-0 space-y-2.5 border-b border-stone-400 bg-[#fffcf7] px-4 py-3">
          {/* Number of Steps · Insert Mode · Select Source on one line. */}
          <div className="grid grid-cols-1 items-end gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
            <label className="flex flex-col gap-1 text-xs text-stone-700">
              <span className="font-semibold">Number of Steps</span>
              <select
                className={cn(limsFieldClass, 'h-9')}
                value={stepCount ?? 'auto'}
                disabled={disabled || busy}
                onChange={(e) => setStepCount(e.target.value === 'auto' ? null : Number(e.target.value))}
              >
                <option value="auto">Auto (As the Process Needs)</option>
                {STEP_COUNTS.map((n) => (
                  <option key={n} value={n}>
                    About {n} Steps
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs text-stone-700">
              <span className="font-semibold">Insert Mode</span>
              <select
                className={cn(limsFieldClass, 'h-9')}
                value={append && hasChart ? 'append' : 'replace'}
                disabled={disabled || busy || !hasChart}
                onChange={(e) => setAppend(e.target.value === 'append')}
              >
                <option value="replace">Replace Chart</option>
                <option value="append">Append to Chart</option>
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
                    ({(Object.keys(use) as SourceKey[]).filter((k) => use[k]).length + references.filter((r) => r.on).length}/
                    {Object.keys(SOURCE_LABELS).length + references.length})
                  </span>
                  <ChevronDown className="h-4 w-4 opacity-60" aria-hidden />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="z-[110] w-80 rounded-none p-1">
                {(Object.keys(SOURCE_LABELS) as SourceKey[]).map((key) => {
                  const doc = key === 'standard' ? sources?.standard : key === 'manual' ? sources?.manual : key === 'web' ? web : null
                  const detail =
                    key === 'scope'
                      ? scopeGiven
                        ? 'From the Application Notes'
                        : 'Not Entered — the AI Uses the IS Title Only'
                      : doc && doc.problem !== TURNED_OFF.problem
                        ? doc.text
                          ? doc.fileName
                          : doc.problem
                        : key === 'web'
                          ? 'Wikipedia Articles on This Product, Read When You Click Generate'
                          : 'Read When You Click Generate'
                  return (
                    <DropdownMenuCheckboxItem
                      key={key}
                      className="items-start gap-2 rounded-none py-2 pl-2 [&>span:first-child]:hidden"
                      checked={use[key]}
                      onCheckedChange={(on) => setUse((prev) => ({ ...prev, [key]: on === true }))}
                      onSelect={(e) => e.preventDefault()}
                    >
                      <span
                        aria-hidden
                        className={cn(
                          'mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center border',
                          use[key] ? 'border-amber-700 bg-amber-700 text-white' : 'border-stone-400 bg-white',
                        )}
                      >
                        {use[key] ? <Check className="h-3 w-3" /> : null}
                      </span>
                      <span className="min-w-0">
                        <span className="block text-sm font-semibold text-stone-800">{SOURCE_LABELS[key]}</span>
                        <span className="block text-[11px] text-stone-500">{use[key] ? detail : 'Turned Off'}</span>
                      </span>
                    </DropdownMenuCheckboxItem>
                  )
                })}
                {references.map((ref) => (
                  <DropdownMenuCheckboxItem
                    key={ref.id}
                    className="items-start gap-2 rounded-none py-2 pl-2 pr-8 [&>span:first-child]:hidden"
                    checked={ref.on}
                    onCheckedChange={(on) => {
                      // An unreadable file stays off but can still be removed.
                      if (!ref.doc.text) return
                      setReferences((prev) => prev.map((r) => (r.id === ref.id ? { ...r, on: on === true } : r)))
                    }}
                    onSelect={(e) => e.preventDefault()}
                  >
                    <span
                      aria-hidden
                      className={cn(
                        'mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center border',
                        ref.on ? 'border-amber-700 bg-amber-700 text-white' : 'border-stone-400 bg-white',
                      )}
                    >
                      {ref.on ? <Check className="h-3 w-3" /> : null}
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold text-stone-800">{ref.doc.fileName}</span>
                      <span className="block text-[11px] text-stone-500">
                        {ref.doc.text ? (ref.on ? 'Reference File' : 'Turned Off') : ref.doc.problem}
                      </span>
                    </span>
                    <button
                      type="button"
                      className="absolute right-1.5 top-2 inline-flex h-6 w-6 items-center justify-center text-stone-500 hover:bg-red-50 hover:text-red-700"
                      title="Remove File"
                      aria-label={`Remove ${ref.doc.fileName}`}
                      onPointerDown={(e) => e.stopPropagation()}
                      onClick={(e) => {
                        e.stopPropagation()
                        setReferences((prev) => prev.filter((r) => r.id !== ref.id))
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
                  <FilePlus2 className="h-4 w-4" aria-hidden />
                  Add Files (PDF)
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <input
              ref={fileInputRef}
              type="file"
              accept="application/pdf,.pdf"
              multiple
              className="sr-only"
              onChange={(e) => {
                void addReferenceFiles(e.target.files)
                e.target.value = ''
              }}
            />
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto bg-white px-4 py-3">
          {busy ? (
            <p className="flex items-center justify-center gap-2 py-8 text-sm text-stone-600">
              <Loader2 size={16} className="animate-spin" aria-hidden />
              {phase || 'Working…'}
            </p>
          ) : steps ? (
            <div className="space-y-2">
              <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-amber-800/80">
                Preview — {cleanSteps.length} Step{cleanSteps.length === 1 ? '' : 's'} (Edit or Remove Before Applying)
              </p>
              {sources && ((use.standard && !sources.standard.text) || (use.manual && !sources.manual.text)) ? (
                <p className="border border-amber-300 bg-amber-50 px-2 py-1.5 text-[11px] text-amber-900">
                  {(!use.standard || !sources.standard.text) && (!use.manual || !sources.manual.text)
                    ? 'No IS PDF Could Be Read: These Steps Come from the IS Title and Licence Scope. Check Them Carefully.'
                    : 'One IS PDF Could Not Be Read: Check the Steps Against the Standard.'}
                </p>
              ) : null}
              <ol className="space-y-1">
                {flattenProcessFlowTree(steps).map(({ node, depth }, i) => (
                  <li key={node.id} className="flex items-center gap-1.5" style={{ paddingLeft: depth * 18 }}>
                    <span
                      className={cn('w-6 shrink-0 text-right text-xs font-semibold', node.horizontalWithPrev ? 'text-sky-700' : 'text-stone-500')}
                      title={node.horizontalWithPrev ? 'Branch (Beside the Box Above)' : undefined}
                    >
                      {node.horizontalWithPrev ? '⇄' : `${i + 1}.`}
                    </span>
                    <input
                      className={cn(limsFieldClass, 'h-8 min-w-0 flex-1 text-sm', node.horizontalWithPrev && 'border-l-[3px] border-l-sky-600')}
                      value={node.label}
                      disabled={disabled}
                      aria-label={`Step ${i + 1}`}
                      onChange={(e) =>
                        setSteps((prev) => (prev ? prev.map((n) => (n.id === node.id ? { ...n, label: e.target.value } : n)) : prev))
                      }
                    />
                    <button
                      type="button"
                      className="inline-flex h-8 w-8 shrink-0 items-center justify-center text-stone-500 hover:bg-red-50 hover:text-red-700"
                      title="Remove Step"
                      aria-label={`Remove Step ${i + 1}`}
                      disabled={disabled}
                      onClick={() => removeStep(node.id)}
                    >
                      <X size={14} aria-hidden />
                    </button>
                  </li>
                ))}
              </ol>
              {notes ? <p className="text-[11px] italic text-stone-500">AI Note: {notes}</p> : null}
            </div>
          ) : (
            <p className="py-6 text-center text-xs text-stone-500">
              Click Generate: the AI Reads the IS Standard, the Product Manual and the Licence Scope, and Drafts the
              Process Steps in Order.
            </p>
          )}
        </div>

        {error ? (
          <p className="border-t border-red-200 bg-red-50 px-4 py-2 text-xs text-red-800">{error}</p>
        ) : null}

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
              aria-label="Special Instructions for the Process Flow"
            />
            <Button
              type="button"
              className="h-10 shrink-0 rounded-none bg-amber-700 px-3 text-white hover:bg-amber-800"
              title="Generate the Process Steps with AI"
              disabled={busy || disabled}
              onClick={() => void generate()}
            >
              {busy ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
              <span className="ml-1.5 text-sm">{steps ? 'Regenerate' : 'Generate'}</span>
            </Button>
            <Button
              type="button"
              className={cn(limsPrimaryBtnClass, 'h-10 shrink-0 px-4 text-sm')}
              disabled={busy || disabled || cleanSteps.length === 0}
              onClick={apply}
            >
              {!hasChart ? 'Add to Chart' : mode === 'append' ? 'Append to Chart' : 'Replace Chart'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
