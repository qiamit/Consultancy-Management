import { supabase } from '@/lib/supabaseClient'

const LETTERHEAD_BUCKET = 'laboratory-files'

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = () => reject(reader.error ?? new Error('Unable to read image'))
    reader.readAsDataURL(blob)
  })
}

function storagePathFromUrl(url: string): string | null {
  const encoded = url.match(/\/object\/(?:sign|public)\/laboratory-files\/([^?]+)/i)
  if (encoded?.[1]) return decodeURIComponent(encoded[1])
  return null
}

/** Embed letterhead/footer so Playwright PDF does not need to fetch remote images. */
export async function embedPrintImageAsDataUrl(
  pathOrUrl: string | null | undefined,
): Promise<string | null> {
  const raw = (pathOrUrl ?? '').trim()
  if (!raw) return null
  if (raw.startsWith('data:')) return raw

  const storagePath = /^https?:\/\//i.test(raw) ? storagePathFromUrl(raw) : raw
  let blob: Blob | null = null

  if (storagePath) {
    const { data, error } = await supabase.storage.from(LETTERHEAD_BUCKET).download(storagePath)
    if (!error && data) blob = data
  }

  if (!blob && /^https?:\/\//i.test(raw)) {
    try {
      const res = await fetch(raw)
      if (res.ok) blob = await res.blob()
    } catch {
      blob = null
    }
  }

  if (!blob) return /^https?:\/\//i.test(raw) ? raw : null
  try {
    return await blobToDataUrl(blob)
  } catch {
    return /^https?:\/\//i.test(raw) ? raw : null
  }
}

/** After images paint in a print iframe, bake src into data URLs for Playwright. */
export async function inlineDocumentImagesAsDataUrls(doc: Document): Promise<void> {
  const images = Array.from(doc.images)
  await Promise.all(
    images.map(async (img) => {
      img.removeAttribute('crossorigin')
      const src = img.getAttribute('src') || img.currentSrc || img.src
      if (!src || src.startsWith('data:')) return
      const embedded = await embedPrintImageAsDataUrl(src)
      if (embedded && embedded !== src) img.setAttribute('src', embedded)
    }),
  )
}
