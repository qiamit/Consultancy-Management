/** Wait for images/fonts before print or Playwright PDF capture. */
export async function waitForPrintDocumentReady(
  doc: Document,
  timeoutMs = 10000,
): Promise<void> {
  const images = Array.from(doc.images)
  await Promise.all(
    images.map(
      (img) =>
        new Promise<void>((resolve) => {
          if (img.complete && img.naturalWidth > 0) {
            resolve()
            return
          }
          const done = () => resolve()
          img.addEventListener('load', done, { once: true })
          img.addEventListener('error', done, { once: true })
          window.setTimeout(done, timeoutMs)
        }),
    ),
  )
  await new Promise<void>((resolve) => {
    window.setTimeout(resolve, 120)
  })
}
