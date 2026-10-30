import { useEffect, useMemo, useRef, useState } from 'react'
import { Download, Loader2, Minus, Plus } from 'lucide-react'
import { toast } from 'sonner'
import { loadPdfjs } from '@/lib/pdfjsLoader'
import { downloadFile } from '@/lib/fileViewer'
import { limsDarkBarGlowStyle } from '@/lib/limsThemeUi'
import { cn } from '@/lib/utils'

/* Opened in a new tab by every View button (see lib/fileViewer.ts). PDFs are drawn with pdf.js, so the browser's
   own PDF handling (which may be set to download) is never involved. Pages are drawn when they scroll into view. */

type PdfDoc = Awaited<ReturnType<Awaited<ReturnType<typeof loadPdfjs>>['getDocument']>['promise']>

const IMAGE_EXT = /\.(png|jpe?g|gif|webp|bmp|svg)$/i
const OFFICE_EXT = /\.(xlsx?|xlsm|docx?|pptx?|csv|txt|zip|rar)$/i

function readHash(): { url: string; name: string } {
  const params = new URLSearchParams(window.location.hash.replace(/^#/, ''))
  const url = params.get('u') ?? ''
  let name = params.get('n') ?? ''
  if (!name && url) {
    try {
      name = decodeURIComponent(new URL(url).pathname.split('/').pop() ?? '')
    } catch {
      name = ''
    }
  }
  return { url, name: name || 'Document' }
}

function PdfPage({ pdf, pageNumber, zoom }: { pdf: PdfDoc; pageNumber: number; zoom: number }) {
  const holderRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [size, setSize] = useState<{ w: number; h: number } | null>(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    let cancelled = false
    void pdf.getPage(pageNumber).then((page) => {
      if (cancelled) return
      const viewport = page.getViewport({ scale: zoom })
      setSize({ w: viewport.width, h: viewport.height })
    })
    return () => {
      cancelled = true
    }
  }, [pdf, pageNumber, zoom])

  useEffect(() => {
    const el = holderRef.current
    if (!el) return
    const observer = new IntersectionObserver((entries) => setVisible(entries.some((e) => e.isIntersecting)), {
      rootMargin: '800px 0px',
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    if (!visible || !size) return
    let cancelled = false
    let task: { cancel: () => void; promise: Promise<unknown> } | null = null
    void pdf.getPage(pageNumber).then((page) => {
      const canvas = canvasRef.current
      if (cancelled || !canvas) return
      // Sharp on high-DPI screens: draw at device pixels, show at CSS size.
      const ratio = window.devicePixelRatio || 1
      const viewport = page.getViewport({ scale: zoom * ratio })
      canvas.width = Math.floor(viewport.width)
      canvas.height = Math.floor(viewport.height)
      task = page.render({ canvas, viewport, background: '#ffffff' })
      task.promise.catch(() => {
        /* cancelled by a zoom change */
      })
    })
    return () => {
      cancelled = true
      task?.cancel()
    }
  }, [pdf, pageNumber, zoom, visible, size])

  return (
    <div
      ref={holderRef}
      className="mx-auto bg-white shadow-md ring-1 ring-stone-300"
      style={{ width: size?.w ?? 800, height: size?.h ?? 1100, maxWidth: 'none' }}
    >
      <canvas ref={canvasRef} className="block h-full w-full" aria-label={`Page ${pageNumber}`} />
    </div>
  )
}

export default function FileViewPage() {
  const { url, name } = useMemo(() => readHash(), [])
  // Generated documents may have no extension in their name; anything that is not an image or an office file is tried as a PDF.
  const kind = IMAGE_EXT.test(name) ? 'image' : OFFICE_EXT.test(name) ? 'other' : 'pdf'
  const [pdf, setPdf] = useState<PdfDoc | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [zoom, setZoom] = useState(0)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    document.title = name
  }, [name])

  useEffect(() => {
    if (!url || kind !== 'pdf') return
    let cancelled = false
    let task: { destroy: () => Promise<void> } | null = null
    void (async () => {
      try {
        const { getDocument } = await loadPdfjs()
        const loading = getDocument({ url })
        task = loading
        const doc = await loading.promise
        if (cancelled) return
        // Fit the first page to the window width (at most 1.5x).
        const first = await doc.getPage(1)
        const base = first.getViewport({ scale: 1 })
        setZoom(Math.min(1.5, Math.max(0.5, (Math.min(window.innerWidth, 1100) - 32) / base.width)))
        setPdf(doc)
      } catch (err) {
        if (cancelled) return
        const message = err instanceof Error ? err.message : String(err)
        setError(
          /expired|400|403|404|Missing PDF|Unexpected server response/i.test(message)
            ? 'This link has expired or the file is missing. Close this tab and click View again.'
            : 'This file cannot be shown here. Use Download to open it on your computer.',
        )
      }
    })()
    return () => {
      cancelled = true
      void task?.destroy()
    }
  }, [url, kind])

  const download = async () => {
    setBusy(true)
    try {
      await downloadFile(url, name)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Download failed')
    } finally {
      setBusy(false)
    }
  }

  const btn =
    'inline-flex h-8 items-center justify-center gap-1.5 rounded-none border border-amber-500/60 bg-stone-800 px-2.5 text-xs font-medium text-amber-100 hover:bg-amber-600 hover:text-white disabled:opacity-50'

  return (
    <div className="flex h-dvh flex-col bg-stone-200">
      <header className="relative shrink-0 overflow-hidden bg-gradient-to-br from-stone-800 via-stone-900 to-stone-950 px-3 py-2 text-white sm:px-4">
        <div className="pointer-events-none absolute inset-0 opacity-[0.18]" style={limsDarkBarGlowStyle} />
        <div className="absolute bottom-0 left-0 h-[2px] w-full bg-gradient-to-r from-amber-500 via-amber-300 to-transparent" />
        <div className="relative flex min-w-0 items-center gap-2">
          <h1 className="min-w-0 flex-1 truncate text-sm font-semibold tracking-tight sm:text-base" title={name}>
            {name}
          </h1>
          {pdf ? <span className="hidden shrink-0 text-xs text-stone-300 sm:inline">{pdf.numPages} Pages</span> : null}
          {pdf ? (
            <>
              <button type="button" className={cn(btn, 'w-8 px-0')} title="Zoom Out" aria-label="Zoom Out" onClick={() => setZoom((z) => Math.max(0.4, +(z - 0.2).toFixed(2)))}>
                <Minus size={14} aria-hidden />
              </button>
              <span className="w-10 shrink-0 text-center text-xs text-stone-200">{Math.round(zoom * 100)}%</span>
              <button type="button" className={cn(btn, 'w-8 px-0')} title="Zoom In" aria-label="Zoom In" onClick={() => setZoom((z) => Math.min(3, +(z + 0.2).toFixed(2)))}>
                <Plus size={14} aria-hidden />
              </button>
            </>
          ) : null}
          {url ? (
            <button type="button" className={btn} disabled={busy} title={`Download ${name}`} onClick={() => void download()}>
              {busy ? <Loader2 size={14} className="animate-spin" aria-hidden /> : <Download size={14} aria-hidden />}
              <span className="hidden sm:inline">Download</span>
            </button>
          ) : null}
        </div>
      </header>

      <main className="min-h-0 flex-1 overflow-auto p-3 sm:p-4">
        {!url ? (
          <p className="mt-10 text-center text-sm text-stone-600">No file to show. Close this tab and click View again.</p>
        ) : kind === 'image' ? (
          <img src={url} alt={name} className="mx-auto max-w-full bg-white shadow-md ring-1 ring-stone-300" />
        ) : kind === 'other' ? (
          <p className="mt-10 text-center text-sm text-stone-700">This file type cannot be shown in the browser. Use Download to open it.</p>
        ) : error ? (
          <p className="mt-10 text-center text-sm text-red-700">{error}</p>
        ) : !pdf ? (
          <p className="mt-10 flex items-center justify-center gap-2 text-sm text-stone-600">
            <Loader2 size={16} className="animate-spin" aria-hidden /> Loading…
          </p>
        ) : (
          <div className="flex flex-col gap-3">
            {Array.from({ length: pdf.numPages }, (_, i) => (
              <PdfPage key={i + 1} pdf={pdf} pageNumber={i + 1} zoom={zoom} />
            ))}
          </div>
        )}
      </main>
    </div>
  )
}
