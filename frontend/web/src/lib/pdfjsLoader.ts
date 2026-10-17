/**
 * Loads pdf.js with its worker configured.
 * The worker URL is built with `new URL(..., import.meta.url)` instead of a `?url` import: in dev, Vite serves a
 * `.mjs?url` import that resolves outside the project root (for example a symlinked node_modules) as raw JavaScript,
 * which leaves workerSrc undefined and makes pdf.js fail with "Invalid `workerSrc` type". The URL form works in dev and in builds.
 */
export async function loadPdfjs() {
  const pdfjs = await import('pdfjs-dist')
  pdfjs.GlobalWorkerOptions.workerSrc = new URL('../../node_modules/pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).href
  return pdfjs
}
