import { PDFDocument } from 'pdf-lib'
import { supabase } from '@/lib/supabaseClient'
import { triggerPdfDownload } from '@/lib/playwrightPdfClient'
import { openPendingPrintWindow } from '../print/openPrintHtml'
import {
  BIS_PROJECT_FILES_BUCKET,
  docKindsForList,
  type BisProjectDocKind,
} from './bisProjectFilesApi'

type StoredFile = {
  file_name: string
  storage_path: string
  mime_type: string | null
}

function formatApiError(err: unknown): string {
  if (err instanceof Error && err.message.trim()) return err.message
  if (err && typeof err === 'object' && 'message' in err) {
    const msg = String((err as { message?: unknown }).message ?? '').trim()
    if (msg) return msg
  }
  return 'Something went wrong'
}

function isPdf(file: StoredFile): boolean {
  const mime = (file.mime_type ?? '').toLowerCase()
  const name = file.file_name.toLowerCase()
  return mime.includes('pdf') || name.endsWith('.pdf')
}

function isPng(file: StoredFile): boolean {
  const mime = (file.mime_type ?? '').toLowerCase()
  const name = file.file_name.toLowerCase()
  return mime.includes('png') || name.endsWith('.png')
}

function isJpeg(file: StoredFile): boolean {
  const mime = (file.mime_type ?? '').toLowerCase()
  const name = file.file_name.toLowerCase()
  return (
    mime.includes('jpeg') ||
    mime.includes('jpg') ||
    name.endsWith('.jpg') ||
    name.endsWith('.jpeg')
  )
}

async function listStoredFiles(
  projectId: string,
  docKind: BisProjectDocKind,
): Promise<StoredFile[]> {
  const kinds = docKindsForList(docKind)
  let query = supabase
    .from('bis_project_files')
    .select('file_name, storage_path, mime_type')
    .eq('bis_project_id', projectId)
    .order('created_at', { ascending: true })
  query = kinds.length === 1 ? query.eq('doc_kind', kinds[0]) : query.in('doc_kind', kinds)
  const { data, error } = await query
  if (error) throw new Error(formatApiError(error))
  return (Array.isArray(data) ? data : []) as StoredFile[]
}

async function downloadBytes(storagePath: string): Promise<Uint8Array> {
  const { data, error } = await supabase.storage
    .from(BIS_PROJECT_FILES_BUCKET)
    .download(storagePath)
  if (error) throw error
  return new Uint8Array(await data.arrayBuffer())
}

/** Merge attached module PDFs (and images) into one PDF document. */
export async function buildMergedBisModulePdf(
  projectId: string,
  docKind: BisProjectDocKind,
): Promise<Uint8Array> {
  const files = await listStoredFiles(projectId, docKind)
  if (files.length === 0) {
    throw new Error('No attached files found for this module.')
  }

  const merged = await PDFDocument.create()
  let added = 0
  const skipped: string[] = []

  for (const file of files) {
    try {
      const bytes = await downloadBytes(file.storage_path)
      if (isPdf(file)) {
        const src = await PDFDocument.load(bytes, { ignoreEncryption: true })
        const pages = await merged.copyPages(src, src.getPageIndices())
        for (const page of pages) merged.addPage(page)
        added += pages.length
        continue
      }
      if (isPng(file)) {
        const img = await merged.embedPng(bytes)
        const page = merged.addPage([img.width, img.height])
        page.drawImage(img, { x: 0, y: 0, width: img.width, height: img.height })
        added += 1
        continue
      }
      if (isJpeg(file)) {
        const img = await merged.embedJpg(bytes)
        const page = merged.addPage([img.width, img.height])
        page.drawImage(img, { x: 0, y: 0, width: img.width, height: img.height })
        added += 1
        continue
      }
      skipped.push(file.file_name)
    } catch (err) {
      skipped.push(
        `${file.file_name} (${err instanceof Error ? err.message : 'failed'})`,
      )
    }
  }

  if (added === 0) {
    const detail =
      skipped.length > 0
        ? ` Unsupported or failed: ${skipped.join(', ')}`
        : ''
    throw new Error(`Could not build a merged PDF.${detail}`)
  }

  return merged.save()
}

function blobFromPdfBytes(bytes: Uint8Array): Blob {
  return new Blob([bytes], { type: 'application/pdf' })
}

function writePdfViewerHtml(
  win: Window,
  title: string,
  blobUrl: string,
  autoPrint: boolean,
) {
  const printScript = autoPrint
    ? `<script>
  window.addEventListener('load', function () {
    setTimeout(function () {
      try {
        var f = document.getElementById('pdf-frame');
        if (f && f.contentWindow) { f.contentWindow.focus(); f.contentWindow.print(); }
        else { window.focus(); window.print(); }
      } catch (e) {
        try { window.focus(); window.print(); } catch (e2) {}
      }
    }, 500);
  });
</script>`
    : ''

  win.document.open()
  win.document.write(
    `<!doctype html><html lang="en"><head><meta charset="utf-8"/><title>${title
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')}</title>` +
      `<style>html,body{margin:0;height:100%;background:#525659}iframe{border:0;width:100%;height:100%}</style></head>` +
      `<body><iframe id="pdf-frame" title="${title
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')}" src="${blobUrl}"></iframe>${printScript}</body></html>`,
  )
  win.document.close()
}

/**
 * Opens a merged module PDF in a new tab.
 * Call from a click handler; opens the pending window synchronously first.
 */
export async function openMergedBisModulePdf(
  projectId: string,
  docKind: BisProjectDocKind,
  options: { title: string; mode: 'view' | 'print' },
): Promise<string | null> {
  const target = openPendingPrintWindow(
    options.mode === 'print'
      ? `Preparing ${options.title}…`
      : `Opening ${options.title}…`,
  )
  if (!target) return 'Popup blocked. Allow popups to view/print.'

  try {
    const bytes = await buildMergedBisModulePdf(projectId, docKind)
    const url = URL.createObjectURL(blobFromPdfBytes(bytes))
    writePdfViewerHtml(target, options.title, url, options.mode === 'print')
    window.setTimeout(() => URL.revokeObjectURL(url), 120_000)
    return null
  } catch (err) {
    try {
      target.close()
    } catch {
      /* ignore */
    }
    return err instanceof Error ? err.message : 'Failed to open merged PDF'
  }
}

export async function downloadMergedBisModulePdf(
  projectId: string,
  docKind: BisProjectDocKind,
  filename: string,
): Promise<void> {
  const bytes = await buildMergedBisModulePdf(projectId, docKind)
  triggerPdfDownload(blobFromPdfBytes(bytes), filename)
}
