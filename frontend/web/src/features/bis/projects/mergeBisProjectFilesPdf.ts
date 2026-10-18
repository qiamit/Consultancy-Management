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

type SupportedAssetKind = 'pdf' | 'png' | 'jpeg' | null

/** Prefer stored metadata, but inspect file signatures when storage metadata is missing or wrong. */
export function detectBisPdfAssetKind(
  file: Pick<StoredFile, 'file_name' | 'mime_type'>,
  bytes: Uint8Array,
): SupportedAssetKind {
  const mime = (file.mime_type ?? '').toLowerCase()
  const name = file.file_name.toLowerCase()
  if (
    bytes.length >= 5 &&
    bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 &&
    bytes[3] === 0x46 && bytes[4] === 0x2d
  ) return 'pdf'
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e &&
    bytes[3] === 0x47 && bytes[4] === 0x0d && bytes[5] === 0x0a &&
    bytes[6] === 0x1a && bytes[7] === 0x0a
  ) return 'png'
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'jpeg'
  }

  if (mime.includes('pdf') || name.endsWith('.pdf')) return 'pdf'
  if (mime.includes('png') || name.endsWith('.png')) return 'png'
  if (
    mime.includes('jpeg') ||
    mime.includes('jpg') ||
    name.endsWith('.jpg') ||
    name.endsWith('.jpeg')
  ) return 'jpeg'
  return null
}

async function listStoredFiles(
  projectId: string,
  docKinds: BisProjectDocKind | readonly BisProjectDocKind[],
): Promise<StoredFile[]> {
  const kinds = [...new Set(
    (Array.isArray(docKinds) ? docKinds : [docKinds]).flatMap(docKindsForList),
  )]
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

/** Merge attached PDFs (and images) across one or more stored document categories. */
export async function buildMergedBisProjectFilesPdf(
  projectId: string,
  docKinds: readonly BisProjectDocKind[],
  options: {
    ignoreUnsupported?: boolean
    strict?: boolean
    /** Restrict a shared category to the files referenced by the selected document rows. */
    storagePaths?: readonly string[]
    shouldIncludeFile?: (file: StoredFile, bytes: Uint8Array) => boolean | Promise<boolean>
  } = {},
): Promise<Uint8Array | null> {
  const stored = await listStoredFiles(projectId, docKinds)
  const requested = options.storagePaths ? new Set(options.storagePaths) : null
  const files = requested ? stored.filter((file) => requested.has(file.storage_path)) : stored
  if (options.strict && requested && requested.size !== new Set(files.map((file) => file.storage_path)).size) {
    throw new Error('One or more selected attachments are no longer available. Reopen the document editor and upload them again.')
  }
  if (files.length === 0) return null
  const merged = await PDFDocument.create()
  let added = 0
  let included = 0
  let unsupported = 0
  const skipped: string[] = []

  for (const file of files) {
    const bytes = await downloadBytes(file.storage_path)
    if (options.shouldIncludeFile && !(await options.shouldIncludeFile(file, bytes))) continue
    included += 1
    const assetKind = detectBisPdfAssetKind(file, bytes)
    if (!assetKind) {
      unsupported += 1
      skipped.push(file.file_name)
      continue
    }
    try {
      if (assetKind === 'pdf') {
        const src = await PDFDocument.load(bytes, { ignoreEncryption: true })
        const pages = await merged.copyPages(src, src.getPageIndices())
        for (const page of pages) merged.addPage(page)
        added += pages.length
        continue
      }
      if (assetKind === 'png') {
        const img = await merged.embedPng(bytes)
        const page = merged.addPage([img.width, img.height])
        page.drawImage(img, { x: 0, y: 0, width: img.width, height: img.height })
        added += 1
        continue
      }
      if (assetKind === 'jpeg') {
        const img = await merged.embedJpg(bytes)
        const page = merged.addPage([img.width, img.height])
        page.drawImage(img, { x: 0, y: 0, width: img.width, height: img.height })
        added += 1
        continue
      }
    } catch (err) {
      skipped.push(
        `${file.file_name} (${err instanceof Error ? err.message : 'failed'})`,
      )
    }
  }

  if (options.strict && skipped.length > 0) {
    throw new Error(`Could not include all attached files: ${skipped.join(', ')}`)
  }

  if (included === 0) return null

  if (added === 0 && options.ignoreUnsupported && unsupported === files.length) return null
  if (added === 0) {
    const detail =
      skipped.length > 0
        ? ` Unsupported or failed: ${skipped.join(', ')}`
        : ''
    throw new Error(`Could not build a merged PDF.${detail}`)
  }

  return merged.save()
}

/** Merge attached module PDFs (and images) into one PDF document. */
export async function buildMergedBisModulePdf(
  projectId: string,
  docKind: BisProjectDocKind,
): Promise<Uint8Array> {
  const bytes = await buildMergedBisProjectFilesPdf(projectId, [docKind])
  if (!bytes) throw new Error('No attached files found for this module.')
  return bytes
}

function blobFromPdfBytes(bytes: Uint8Array): Blob {
  const ownedBytes = new Uint8Array(bytes.byteLength)
  ownedBytes.set(bytes)
  return new Blob([ownedBytes.buffer], { type: 'application/pdf' })
}

export function writePdfViewerHtml(
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
