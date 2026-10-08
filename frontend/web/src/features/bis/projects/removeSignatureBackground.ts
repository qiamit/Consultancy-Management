/**
 * Remove near-white background from a signature/stamp image before upload.
 * PDFs are returned unchanged. Output is always PNG with transparency.
 */
export async function removeSignatureImageBackground(file: File): Promise<File> {
  const name = file.name.toLowerCase()
  if (file.type === 'application/pdf' || name.endsWith('.pdf')) return file

  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(file)
  } catch {
    return file
  }

  const canvas = document.createElement('canvas')
  canvas.width = bitmap.width
  canvas.height = bitmap.height
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) {
    bitmap.close()
    return file
  }

  ctx.drawImage(bitmap, 0, 0)
  bitmap.close()

  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
  const d = imageData.data
  const hard = 248
  const soft = 220

  for (let i = 0; i < d.length; i += 4) {
    const r = d[i]
    const g = d[i + 1]
    const b = d[i + 2]
    const minC = Math.min(r, g, b)
    const maxC = Math.max(r, g, b)
    // Near-white / light gray paper background → transparent
    if (minC >= hard && maxC - minC <= 18) {
      d[i + 3] = 0
      continue
    }
    if (minC > soft && maxC - minC <= 28) {
      const t = (minC - soft) / (255 - soft)
      d[i + 3] = Math.round(d[i + 3] * (1 - t))
    }
  }

  ctx.putImageData(imageData, 0, 0)

  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve, 'image/png')
  })
  if (!blob) return file

  const base = file.name.replace(/\.[^.]+$/, '').trim() || 'signature'
  return new File([blob], `${base}.png`, { type: 'image/png' })
}
