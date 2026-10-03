import { useEffect, useRef, useState } from 'react'
import { Download, ImagePlus, Star, Trash2 } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { supabase } from '@/lib/supabaseClient'
import { cn } from '@/lib/utils'
import {
  downloadSignatureObject,
  QUOTATION_SIGNATURE_BUCKET,
  removeQuotationOwnedSignature,
  resolveSignatureSignedUrl,
  saveDefaultSignatureForKind,
} from './quotationSignatureStorage'
import type { DocumentTemplateKind } from '@/features/settings/lab-settings/documentTemplateTypes'

export { QUOTATION_SIGNATURE_BUCKET } from './quotationSignatureStorage'

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

async function downloadTypedSignaturePng(text: string) {
  const canvas = document.createElement('canvas')
  const width = 640
  const height = 180
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Unable to create signature image')
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, width, height)
  ctx.fillStyle = '#1c1917'
  ctx.font = 'italic 54px "Segoe Script", "Brush Script MT", "Lucida Handwriting", cursive'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(text.trim(), width / 2, height / 2)
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))
  if (!blob) throw new Error('Unable to export signature image')
  downloadBlob(blob, `signature-${text.trim().replace(/\s+/g, '-').slice(0, 40) || 'typed'}.png`)
}

export function QuotationSignatureField({
  text,
  imagePath,
  onTextChange,
  onImagePathChange,
  className,
  documentKind = 'quotation',
  documentLabel = 'Quotation',
}: {
  text: string
  imagePath: string
  onTextChange: (value: string) => void
  onImagePathChange: (path: string) => void
  className?: string
  documentKind?: DocumentTemplateKind
  documentLabel?: string
}) {
  const fileRef = useRef<HTMLInputElement | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [defaultSaved, setDefaultSaved] = useState(false)

  useEffect(() => {
    let cancelled = false
    if (!imagePath.trim()) {
      setPreviewUrl(null)
      return
    }
    void (async () => {
      const url = await resolveSignatureSignedUrl(imagePath.trim())
      if (!cancelled) setPreviewUrl(url)
    })()
    return () => {
      cancelled = true
    }
  }, [imagePath])

  const handleUpload = async (file: File | null) => {
    if (!file) return
    if (!file.type.startsWith('image/')) {
      setError('Please choose an image file (PNG, JPG, WebP).')
      return
    }
    setBusy(true)
    setError(null)
    try {
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]+/g, '-')
      const objectPath = `draft/${Date.now()}-${safeName}`
      const { error: upErr } = await supabase.storage
        .from(QUOTATION_SIGNATURE_BUCKET)
        .upload(objectPath, file, { upsert: false, contentType: file.type })
      if (upErr) throw upErr

      if (imagePath.trim()) {
        await removeQuotationOwnedSignature(imagePath.trim())
      }
      onImagePathChange(objectPath)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to upload signature image')
    } finally {
      setBusy(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const handleDownload = async () => {
    setBusy(true)
    setError(null)
    try {
      if (imagePath.trim()) {
        const data = await downloadSignatureObject(imagePath.trim())
        const ext = imagePath.includes('.') ? imagePath.split('.').pop() : 'png'
        downloadBlob(data, `quotation-signature.${ext || 'png'}`)
        return
      }
      if (text.trim()) {
        await downloadTypedSignaturePng(text)
        return
      }
      setError('Type a signature or upload an image first.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to download signature')
    } finally {
      setBusy(false)
    }
  }

  const handleClearImage = async () => {
    if (!imagePath.trim()) return
    setBusy(true)
    setError(null)
    try {
      await removeQuotationOwnedSignature(imagePath.trim())
      onImagePathChange('')
      setPreviewUrl(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove signature image')
    } finally {
      setBusy(false)
    }
  }

  const canDownload = Boolean(imagePath.trim() || text.trim())

  const handleSetAsDefault = async () => {
    if (!text.trim() && !imagePath.trim()) {
      setError('Type a signature or upload an image first.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      await saveDefaultSignatureForKind(documentKind, text, imagePath)
      setDefaultSaved(true)
      window.setTimeout(() => setDefaultSaved(false), 2000)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save default signature')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className={cn('flex min-w-0 flex-col space-y-2', className)}>
      <Label htmlFor="quotation-signature">Signature</Label>
      <div
        className={cn(
          'flex h-10 min-w-0 items-stretch overflow-hidden rounded-none border border-stone-500 bg-stone-50',
          'focus-within:border-amber-600 focus-within:bg-white focus-within:ring-2 focus-within:ring-amber-500/20',
        )}
      >
        {previewUrl ? (
          <span className="inline-flex h-full w-10 shrink-0 items-center justify-center border-r border-stone-500 bg-white">
            <img
              src={previewUrl}
              alt="Signature preview"
              className="max-h-8 max-w-9 object-contain"
            />
          </span>
        ) : null}
        <Input
          id="quotation-signature"
          value={text}
          onChange={(e) => onTextChange(e.target.value)}
          placeholder="Type signature name"
          className={cn(
            'h-full min-w-0 flex-1 rounded-none border-0 bg-transparent px-3 shadow-none',
            'italic focus-visible:border-transparent focus-visible:bg-transparent focus-visible:ring-0',
          )}
          style={{
            fontFamily: '"Segoe Script", "Brush Script MT", "Lucida Handwriting", cursive',
          }}
          aria-label="Typed signature"
        />
        <input
          ref={fileRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          className="hidden"
          onChange={(e) => void handleUpload(e.target.files?.[0] ?? null)}
        />
        <button
          type="button"
          className="inline-flex h-full w-9 shrink-0 items-center justify-center border-l border-stone-500 bg-stone-100 text-amber-800 transition-colors hover:bg-amber-500/15 hover:text-amber-950 disabled:opacity-40"
          onClick={() => void handleSetAsDefault()}
          disabled={busy || !canDownload}
          aria-label={`Set as default signature for ${documentLabel}`}
          title={
            defaultSaved
              ? `Saved as ${documentLabel} default`
              : `Set as default for ${documentLabel}`
          }
        >
          <Star
            size={14}
            strokeWidth={2.25}
            aria-hidden
            className={defaultSaved ? 'fill-amber-500 text-amber-600' : undefined}
          />
        </button>
        <button
          type="button"
          className="inline-flex h-full w-9 shrink-0 items-center justify-center border-l border-stone-500 bg-stone-100 text-amber-800 transition-colors hover:bg-amber-500/15 hover:text-amber-950 disabled:opacity-40"
          onClick={() => fileRef.current?.click()}
          disabled={busy}
          aria-label="Upload signature image"
          title="Upload signature image"
        >
          <ImagePlus size={14} strokeWidth={2.25} aria-hidden />
        </button>
        <button
          type="button"
          className="inline-flex h-full w-9 shrink-0 items-center justify-center border-l border-stone-500 bg-stone-100 text-amber-800 transition-colors hover:bg-amber-500/15 hover:text-amber-950 disabled:opacity-40"
          onClick={() => void handleDownload()}
          disabled={busy || !canDownload}
          aria-label="Download signature image"
          title={
            imagePath.trim()
              ? 'Download signature image'
              : 'Download typed signature as image'
          }
        >
          <Download size={14} strokeWidth={2.25} aria-hidden />
        </button>
        {imagePath.trim() ? (
          <button
            type="button"
            className="inline-flex h-full w-9 shrink-0 items-center justify-center border-l border-stone-500 bg-stone-100 text-red-700 transition-colors hover:bg-red-500/10 disabled:opacity-40"
            onClick={() => void handleClearImage()}
            disabled={busy}
            aria-label="Remove signature image"
            title="Remove signature image"
          >
            <Trash2 size={14} strokeWidth={2.25} aria-hidden />
          </button>
        ) : null}
      </div>
      {error ? <p className="text-[11px] text-destructive">{error}</p> : null}
    </div>
  )
}
