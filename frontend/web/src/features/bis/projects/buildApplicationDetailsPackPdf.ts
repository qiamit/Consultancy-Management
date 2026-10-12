import { PDFDocument } from 'pdf-lib'
import { supabase } from '@/lib/supabaseClient'
import {
  mapPageSizeToPlaywrightFormat,
  renderPdfViaPlaywright,
} from '@/lib/playwrightPdfClient'
import { applyBisDocumentPrintPageSettings } from '../print/bisDocumentPrintPageSettings'
import type { BisDocumentPrintPageSettings } from '../print/bisDocumentPrintPageSettings'
import { listClientCertificates } from '@/features/masters/clients/clientsApi'
import {
  buildMergedBisProjectFilesPdf,
  detectBisPdfAssetKind,
} from './mergeBisProjectFilesPdf'

// application-details HTML already contains the generated Location Map page.
// Do not append uploaded location-map files here or the packet can duplicate it.
const APPLICATION_PACK_FILE_KINDS = ['application', 'legal'] as const

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
  const configuredHtml = applyBisDocumentPrintPageSettings(html, settings)
  const [generatedPdf, attachedBytes, clientCertificates] = await Promise.all([
    renderPdfViaPlaywright({
      html: configuredHtml,
      filename,
      format: mapPageSizeToPlaywrightFormat(settings.pageSize),
      landscape: settings.orientation === 'landscape',
      margin: { top: '0mm', right: '0mm', bottom: '0mm', left: '0mm' },
    }),
    buildMergedBisProjectFilesPdf(projectId, APPLICATION_PACK_FILE_KINDS, {
      ignoreUnsupported: true,
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
    if (assetKind === 'pdf') {
      const attachment = await PDFDocument.load(bytes, { ignoreEncryption: true })
      const pages = await packet.copyPages(attachment, attachment.getPageIndices())
      for (const page of pages) packet.addPage(page)
    } else if (assetKind === 'png') {
      const image = await packet.embedPng(bytes)
      const page = packet.addPage([image.width, image.height])
      page.drawImage(image, { x: 0, y: 0, width: image.width, height: image.height })
    } else if (assetKind === 'jpeg') {
      const image = await packet.embedJpg(bytes)
      const page = packet.addPage([image.width, image.height])
      page.drawImage(image, { x: 0, y: 0, width: image.width, height: image.height })
    }
  }
  return pdfBlob(await packet.save())
}
