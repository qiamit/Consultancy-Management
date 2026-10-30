import { PDFDocument } from 'pdf-lib'
import { loadPdfjs } from '@/lib/pdfjsLoader'
import { supabase } from '@/lib/supabaseClient'
import {
  mapPageSizeToPlaywrightFormat,
  renderPdfViaPlaywright,
} from '@/lib/playwrightPdfClient'
import { applyBisDocumentPrintPageSettings } from '../print/bisDocumentPrintPageSettings'
import { paginateHtmlForDownload } from '../print/bisPreviewPagination'
import type { BisDocumentPrintPageSettings } from '../print/bisDocumentPrintPageSettings'
import { listClientCertificates } from '@/features/masters/clients/clientsApi'
import {
  addImageAsA4Page,
  buildMergedBisProjectFilesPdf,
  detectBisPdfAssetKind,
} from './mergeBisProjectFilesPdf'

// application-details HTML already contains the generated Location Map page.
// Do not append uploaded location-map files here or the packet can duplicate it.
const APPLICATION_PACK_FILE_KINDS = ['application', 'legal'] as const

/** Exclude only the unrelated courier slip that was accidentally attached to this project. */
async function isUnrelatedCourierSlip(bytes: Uint8Array): Promise<boolean> {
  try {
    const { getDocument } = await loadPdfjs()
    const pdf = await getDocument({ data: new Uint8Array(bytes) }).promise
    const text: string[] = []
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber)
      const content = await page.getTextContent()
      text.push(content.items.flatMap((item) =>
        'str' in item ? [String(item.str ?? '')] : [],
      ).join(' '))
    }
    const normalized = text.join(' ').toLowerCase().replace(/\s+/g, ' ')
    return normalized.includes('client directory') &&
      (normalized.includes('courier slip') || normalized.includes('cut here'))
  } catch {
    // Keep a file if its contents cannot be inspected; never drop a possibly relevant attachment.
    return false
  }
}

function pdfBlob(bytes: Uint8Array): Blob {
  const ownedBytes = new Uint8Array(bytes.byteLength)
  ownedBytes.set(bytes)
  return new Blob([ownedBytes.buffer], { type: 'application/pdf' })
}

/** Build the same configured application/map pages as preview, then append its uploaded PDFs. */
export async function buildApplicationDetailsPackPdf(
  html: string,
  projectId: string,
  clientId: string | null,
  settings: BisDocumentPrintPageSettings,
  filename: string,
): Promise<Blob> {
  // Same page breaks as the preview (long sheets split onto extra pages, numbered "Page X of Y").
  const configuredHtml = await paginateHtmlForDownload(applyBisDocumentPrintPageSettings(html, settings))
  const [generatedPdf, attachedBytes, clientCertificates] = await Promise.all([
    renderPdfViaPlaywright({
      html: configuredHtml,
      filename,
      format: mapPageSizeToPlaywrightFormat(settings.pageSize),
      landscape: settings.orientation === 'landscape',
      margin: { top: '0mm', right: '0mm', bottom: '0mm', left: '0mm' },
    }),
    buildMergedBisProjectFilesPdf(projectId, APPLICATION_PACK_FILE_KINDS, {
      strict: true,
      shouldIncludeFile: async (file, bytes) => {
        const isPdf = bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 &&
          bytes[3] === 0x46 && bytes[4] === 0x2d
        if (!isPdf) return true
        const unrelated = await isUnrelatedCourierSlip(bytes)
        if (unrelated) console.info(`Excluded unrelated courier-slip attachment: ${file.file_name}`)
        return !unrelated
      },
    }),
    clientId ? listClientCertificates(clientId) : Promise.resolve([]),
  ])

  if (!attachedBytes && clientCertificates.length === 0) return generatedPdf

  const packet = await PDFDocument.load(new Uint8Array(await generatedPdf.arrayBuffer()))
  if (attachedBytes) {
    const attachments = await PDFDocument.load(attachedBytes, { ignoreEncryption: true })
    const pages = await packet.copyPages(attachments, attachments.getPageIndices())
    for (const page of pages) packet.addPage(page)
  }

  for (const certificate of clientCertificates) {
    const { data, error } = await supabase.storage
      .from('client-certificates')
      .download(certificate.storage_path)
    if (error) throw new Error(`Could not download ${certificate.cert_name}: ${error.message}`)
    const bytes = new Uint8Array(await data.arrayBuffer())
    const assetKind = detectBisPdfAssetKind(certificate, bytes)
    if (assetKind === 'pdf' && await isUnrelatedCourierSlip(bytes)) {
      console.info(`Excluded unrelated courier-slip certificate: ${certificate.cert_name}`)
      continue
    }
    if (assetKind === 'pdf') {
      const attachment = await PDFDocument.load(bytes, { ignoreEncryption: true })
      const pages = await packet.copyPages(attachment, attachment.getPageIndices())
      for (const page of pages) packet.addPage(page)
    } else if (assetKind === 'png') {
      addImageAsA4Page(packet, await packet.embedPng(bytes))
    } else if (assetKind === 'jpeg') {
      addImageAsA4Page(packet, await packet.embedJpg(bytes))
    } else {
      throw new Error(`Could not include attached certificate ${certificate.cert_name}: unsupported file type.`)
    }
  }
  return pdfBlob(await packet.save())
}
