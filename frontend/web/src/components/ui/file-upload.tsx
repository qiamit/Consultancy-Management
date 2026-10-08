import * as React from 'react'
import { Upload, X, Eye } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from './button'
import { supabase } from '@/lib/supabaseClient'

interface FileUploadProps {
  label: string
  accept?: string
  value?: string
  onChange?: (file: File | null, preview: string | null) => void
  className?: string
  bucket?: string
  pathPrefix?: string
}

export function FileUpload({
  label,
  accept = 'image/*,.pdf',
  value,
  onChange,
  className,
  bucket,
  pathPrefix,
}: FileUploadProps) {
  const inputRef = React.useRef<HTMLInputElement>(null)
  const [fileUrl, setFileUrl] = React.useState<string | null>(value ?? null)
  const [preview, setPreview] = React.useState<string | null>(null)
  const objectUrlRef = React.useRef<string | null>(null)
  const valueRef = React.useRef<string | null>(value ?? null)

  React.useEffect(() => {
    valueRef.current = value ?? null
    if (!value) {
      setFileUrl(null)
      setPreview(null)
      return
    }

    if (bucket && !/^https?:\/\//i.test(value)) {
      void (async () => {
        const { data, error } = await supabase.storage
          .from(bucket)
          .createSignedUrl(value, 60 * 60)

        if (!error && data?.signedUrl) {
          setFileUrl(data.signedUrl)
          setPreview(isImage(value) ? data.signedUrl : null)
        } else {
          setFileUrl(null)
          setPreview(null)
        }
      })()
      return
    }

    setFileUrl(value)
    setPreview(isImage(value) ? value : null)
  }, [value])

  const cleanupObjectUrl = () => {
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current)
      objectUrlRef.current = null
    }
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    cleanupObjectUrl()

    if (bucket && pathPrefix) {
      void (async () => {
        const safeName = file.name.replace(/[^a-zA-Z0-9._-]+/g, '-')
        const objectPath = `${pathPrefix}/${Date.now()}-${safeName}`

        const { error: uploadError } = await supabase.storage
          .from(bucket)
          .upload(objectPath, file, { upsert: true, contentType: file.type })

        if (uploadError) {
          setFileUrl(null)
          setPreview(null)
          onChange?.(file, null)
          return
        }

        const { data } = await supabase.storage
          .from(bucket)
          .createSignedUrl(objectPath, 60 * 60)

        const signedUrl = data?.signedUrl ?? null
        setFileUrl(signedUrl)
        setPreview(file.type.startsWith('image/') ? signedUrl : null)
        onChange?.(file, objectPath)
      })()
      return
    }

    const objectUrl = URL.createObjectURL(file)
    objectUrlRef.current = objectUrl

    setFileUrl(objectUrl)
    if (file.type.startsWith('image/')) {
      setPreview(objectUrl)
    } else {
      setPreview(null)
    }
    onChange?.(file, file.type.startsWith('image/') ? objectUrl : null)
  }

  const handleClear = () => {
    cleanupObjectUrl()
    setPreview(null)
    setFileUrl(null)
    valueRef.current = null
    if (inputRef.current) {
      inputRef.current.value = ''
    }
    onChange?.(null, null)
  }

  const handleView = () => {
    if (fileUrl) {
      window.open(fileUrl, '_blank')
    }
  }

  const buttonDisabled = !fileUrl

  return (
    <div className={cn('space-y-2', className)}>
      <label className="text-sm font-medium">{label}</label>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        onChange={handleFileChange}
        className="hidden"
        id={`file-${label.replace(/\s+/g, '-')}`}
      />
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => inputRef.current?.click()}
          className="gap-2"
        >
          <Upload size={14} />
          Upload
        </Button>
        <Button type="button" variant="ghost" size="sm" disabled={buttonDisabled} onClick={handleView}>
          <Eye size={14} />
          View
        </Button>
        <Button type="button" variant="ghost" size="sm" disabled={buttonDisabled} onClick={handleClear}>
          <X size={14} />
          Delete
        </Button>
      </div>

      {preview && (
        <div className="mt-2 rounded-md border border-border p-2">
          <img src={preview} alt="Preview" className="h-24 w-auto object-contain" />
        </div>
      )}
    </div>
  )
}

function isImage(path: string) {
  return /(\.png|\.jpe?g|\.gif|\.webp|\.svg)$/i.test(path)
}
