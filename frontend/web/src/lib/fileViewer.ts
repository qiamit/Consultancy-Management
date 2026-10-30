/**
 * View buttons open the file in a new browser tab on the app's own viewer page (/view-file), which draws PDFs with
 * pdf.js. Chrome's own PDF viewer is not used, so a View never turns into a download, whatever the browser's
 * "Download PDFs" setting is. The signed link goes in the hash: it stays in the browser and never reaches a server log.
 * Download buttons keep using download links (Content-Disposition: attachment) or downloadFile below.
 */
export function fileViewHref(url: string, fileName = ''): string {
  const params = new URLSearchParams({ u: url })
  if (fileName.trim()) params.set('n', fileName.trim())
  return `/view-file#${params.toString()}`
}

/** Opens the file in a new tab on the app's viewer. */
export function openFileInNewTab(url: string | undefined, fileName = ''): boolean {
  if (!url?.trim()) return false
  window.open(fileViewHref(url, fileName), '_blank', 'noopener')
  return true
}

/**
 * Saves a file under the given name. A `download` attribute is ignored for links to another site (the storage
 * server), so the file is fetched and saved from a local blob instead.
 */
export async function downloadFile(url: string, fileName: string): Promise<void> {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`Download failed (${response.status})`)
  const blobUrl = URL.createObjectURL(await response.blob())
  const a = document.createElement('a')
  a.href = blobUrl
  a.download = fileName || 'file'
  document.body.appendChild(a)
  a.click()
  a.remove()
  window.setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000)
}
