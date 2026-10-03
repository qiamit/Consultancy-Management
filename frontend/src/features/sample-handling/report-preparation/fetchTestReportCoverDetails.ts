import { formatClientCustomerDetails } from '@/features/masters/clients/types'
import { supabase } from '@/lib/supabaseClient'
import { isSupabaseMissingColumnError } from '@/lib/supabaseErrors'
import { formatDateDmyMmm } from '@/lib/utils'
import { RECEIVING_REPORT_TYPES } from '../types'
import { stripReceivingReportTypeFromCode } from '@/features/sample-handling/receiving/receivingSrfFromReference'
import type { ReportScopeKind } from './reportScope'
import { buildTestReportPartBDetails, type TestReportPartBDetails } from './testReportPartB'
import { resolveReferenceReportNo } from './testReportReferenceReportNo'
import { formatIsCodeLabelFromParts } from '@/features/masters/is-codes/formatIsCodeLabel'

export type { TestReportPartBDetails }

const fmt = (v: string | null | undefined) => (v && String(v).trim() ? String(v).trim() : null)
const fmtDate = (v: string | null | undefined) => formatDateDmyMmm(v)
const fmtYesNo = (v: boolean | null | undefined) =>
  v === true ? 'Yes' : v === false ? 'No' : null

/** Product IS Code Title: `IS Title as per IS Number: Revision Year` */
export function formatIsDetails(
  isNumber: string | null | undefined,
  productTitle: string | null | undefined,
): string | null {
  const number = fmt(isNumber)
  const title = fmt(productTitle)
  if (number && title) return `${title} as per ${number}`
  return number ?? title ?? null
}

const displayPart = (v: string | null | undefined) => (v && String(v).trim() ? String(v).trim() : '—')

export function formatSampleIdentificationLine(
  sampleCode: string | null | undefined,
  sampleQrCode: string | null | undefined,
  natureOfSample: string | null | undefined,
): string {
  return [
    { label: 'Sample Code', value: sampleCode },
    { label: 'QR Code / Bar Code', value: sampleQrCode },
    { label: 'Nature of Sample', value: natureOfSample },
  ]
    .map(({ label, value }) => `${label} - ${displayPart(value)}`)
    .join(' | ')
}

export function formatSampleQtyBisIoLine(
  sampleQuantity: string | null | undefined,
  bisSeal: string | null | undefined,
  ioSignature: string | null | undefined,
): string {
  return [
    { label: 'Sample Quantity', value: sampleQuantity },
    { label: 'BIS Seal', value: bisSeal },
    { label: "IO's Signature", value: ioSignature },
  ]
    .map(({ label, value }) => `${label} - ${displayPart(value)}`)
    .join(' | ')
}

export function formatReportingReferenceOtherLine(
  dateOfReporting: string | null | undefined,
  referenceReportNo: string | null | undefined,
  anyOtherInformation: string | null | undefined,
): string {
  return [
    { label: 'Date of Reporting', value: dateOfReporting },
    { label: 'Reference Report No', value: referenceReportNo },
    { label: 'Any Other Information', value: anyOtherInformation },
  ]
    .map(({ label, value }) => `${label} - ${displayPart(value)}`)
    .join(' | ')
}

/** Part A section report no: each section code with `_1` suffix (e.g. S84SBC → S84SBC_1). */
export function formatSectionReportNoFromCodes(codes: string[]): string | null {
  const parts = [...new Set(codes.map((c) => c.trim()).filter(Boolean))]
    .sort()
    .map((code) => `${code}_1`)
  return parts.length > 0 ? parts.join(', ') : null
}

export function formatSectionReportLine(
  sectionCodes: string | null | undefined,
  sectionReportNo: string | null | undefined,
  reportType: string | null | undefined,
): string {
  return [
    { label: 'Section Code', value: sectionCodes },
    { label: 'Section Report No', value: sectionReportNo },
    { label: 'Report Type', value: reportType },
  ]
    .map(({ label, value }) => `${label} - ${displayPart(value)}`)
    .join(' | ')
}

export function formatTestingDatesLine(
  dateOfSampleReceipt: string | null | undefined,
  dateOfTestingStarted: string | null | undefined,
  dateOfTestingCompleted: string | null | undefined,
): string {
  return [
    { label: 'Date of Sample Receipt', value: dateOfSampleReceipt },
    { label: 'Date of Testing Started', value: dateOfTestingStarted },
    { label: 'Date of Testing Completed', value: dateOfTestingCompleted },
  ]
    .map(({ label, value }) => `${label} - ${displayPart(value)}`)
    .join(' | ')
}

export function formatBatchManufacturingPartyLine(
  batchNumber: string | null | undefined,
  dateOfManufacturing: string | null | undefined,
  partyReferenceNo: string | null | undefined,
): string {
  return [
    { label: 'Batch Number', value: batchNumber },
    { label: 'Date of Manufacturing', value: dateOfManufacturing },
    { label: 'Party Reference No', value: partyReferenceNo },
  ]
    .map(({ label, value }) => `${label} - ${displayPart(value)}`)
    .join(' | ')
}

export type TestReportCoverDetails = {
  customerDetails: string | null
  customerName: string | null
  customerAddress: string | null
  isDetails: string | null
  isCode: string | null
  productTitle: string | null
  sampleCode: string | null
  sampleQrCode: string | null
  natureOfSample: string | null
  sampleIdentificationLine: string
  batchNumber: string | null
  dateOfManufacturing: string | null
  partyReferenceNo: string | null
  batchManufacturingPartyLine: string
  sampleQuantity: string | null
  bisSeal: string | null
  ioSignature: string | null
  sampleQtyBisIoLine: string
  sectionCodes: string | null
  sectionReportNo: string | null
  reportType: string | null
  sectionReportLine: string
  dateOfSampleReceipt: string | null
  dateOfTestingStarted: string | null
  dateOfTestingCompleted: string | null
  testingDatesLine: string
  dateOfReporting: string | null
  referenceReportNo: string | null
  anyOtherInformation: string | null
  reportingReferenceOtherLine: string
  /** Raw Report Issue Date (ISO). Used on digital signature stamps. */
  issuedAtIso: string | null
  sampleDescription: string | null
  declaredValue: string | null
  partB: TestReportPartBDetails
}

async function fetchTestingDateRange(sampleId: string): Promise<{
  started: string | null
  completed: string | null
}> {
  const { data: allocs } = await supabase.from('sample_allocations').select('id').eq('sample_id', sampleId)
  const allocIds = (Array.isArray(allocs) ? allocs : []).map((a: { id: string }) => a.id)
  if (allocIds.length === 0) return { started: null, completed: null }

  const { data: tas } = await supabase
    .from('test_allocations')
    .select('id')
    .in('sample_allocation_id', allocIds)
    .eq('sent_for_testing', true)
  const taIds = (Array.isArray(tas) ? tas : []).map((t: { id: string }) => t.id)
  if (taIds.length === 0) return { started: null, completed: null }

  const { data: params } = await supabase
    .from('test_allocation_parameters')
    .select('test_start_date, test_end_date')
    .in('test_allocation_id', taIds)

  let minStart: string | null = null
  let maxEnd: string | null = null
  for (const p of Array.isArray(params) ? params : []) {
    const row = p as { test_start_date?: string | null; test_end_date?: string | null }
    const start = row.test_start_date?.trim()
    const end = row.test_end_date?.trim()
    if (start && (!minStart || start < minStart)) minStart = start
    if (end && (!maxEnd || end > maxEnd)) maxEnd = end
  }
  return {
    started: minStart ? formatDateDmyMmm(minStart) : null,
    completed: maxEnd ? formatDateDmyMmm(maxEnd) : null,
  }
}

async function fetchSectionCodesList(sampleId: string): Promise<string[]> {
  const [sampleRes, testRes] = await Promise.all([
    supabase
      .from('sample_allocations')
      .select('section_code')
      .eq('sample_id', sampleId)
      .order('section_code', { ascending: true }),
    supabase
      .from('test_allocations')
      .select('section_code')
      .eq('sample_id', sampleId)
      .eq('sent_for_testing', true)
      .order('section_code', { ascending: true }),
  ])

  const fromRows = (data: unknown) =>
    (Array.isArray(data) ? data : [])
      .map((r) => String((r as { section_code?: string | null }).section_code ?? '').trim())
      .filter(Boolean)

  return [...new Set([...fromRows(sampleRes.data), ...fromRows(testRes.data)])].sort()
}

const COVER_SAMPLE_SELECT_BASE = `
      test_report_is_code_id,
      test_report_number,
      test_report_issued_at,
      client_reference,
      sample_code,
      sample_qr_code,
      batch_number,
      date_of_manufacturing,
      sample_quantity,
      test_required,
      nature_of_sample,
      date_of_sample_receiving,
      bis_seal,
      io_signature,
      sample_description,
      sample_declaration,
      any_other_information,
      receiving_report_type,
      referenced_srf_number,
      sampling_procedure_ref,
      supporting_docs_required,
      deviation_from_methods,
      clients(company_name, address, district, pin_code, state, country)
    `

const COVER_SAMPLE_SELECT_WITH_NABL = `
      test_report_is_code_id,
      test_report_number,
      test_report_issued_at,
      client_reference,
      sample_code,
      sample_qr_code,
      batch_number,
      date_of_manufacturing,
      sample_quantity,
      test_required,
      nature_of_sample,
      date_of_sample_receiving,
      bis_seal,
      io_signature,
      sample_description,
      sample_declaration,
      any_other_information,
      receiving_report_type,
      referenced_srf_number,
      sampling_procedure_ref,
      supporting_docs_required,
      deviation_from_methods,
      test_report_nabl_required,
      clients(company_name, address, district, pin_code, state, country)
    `

async function fetchSampleRowForCover(sampleId: string): Promise<Record<string, unknown>> {
  const withNabl = await supabase
    .from('samples')
    .select(COVER_SAMPLE_SELECT_WITH_NABL)
    .eq('id', sampleId)
    .maybeSingle()

  if (!withNabl.error && withNabl.data) {
    return withNabl.data as Record<string, unknown>
  }

  if (
    withNabl.error &&
    isSupabaseMissingColumnError(withNabl.error, 'test_report_nabl_required')
  ) {
    const fallback = await supabase
      .from('samples')
      .select(COVER_SAMPLE_SELECT_BASE)
      .eq('id', sampleId)
      .maybeSingle()
    if (fallback.error) throw fallback.error
    if (!fallback.data) throw new Error('Sample not found')
    return fallback.data as Record<string, unknown>
  }

  if (withNabl.error) throw withNabl.error
  throw new Error('Sample not found')
}

export async function fetchTestReportCoverDetails(
  sampleId: string,
  opts?: {
    applicableScopes?: ReportScopeKind[]
    nablUlrNumber?: string
    dateOfReporting?: string | null
    fallbacks?: {
      clientName?: string | null
      isCodeLabel?: string | null
    }
  },
): Promise<TestReportCoverDetails> {
  const row = await fetchSampleRowForCover(sampleId)
  const clients = row.clients as {
    company_name?: string | null
    address?: string | null
    district?: string | null
    pin_code?: string | null
    state?: string | null
    country?: string | null
  } | null

  const isCodeId = row.test_report_is_code_id as string | null
  let isNumber = opts?.fallbacks?.isCodeLabel ?? null
  let productTitleFromIs: string | null = null
  if (isCodeId) {
    const { data: isRow } = await supabase
      .from('is_codes')
      .select('is_number, revision_year, title')
      .eq('id', isCodeId)
      .maybeSingle()
    if (isRow) {
      const r = isRow as { is_number?: string; revision_year?: string | null; title?: string | null }
      isNumber =
        formatIsCodeLabelFromParts(r.is_number, r.revision_year) || r.is_number || isCodeId
      productTitleFromIs = fmt(r.title)
    }
  }

  const [sectionCodeList, testingDates] = await Promise.all([
    fetchSectionCodesList(sampleId),
    fetchTestingDateRange(sampleId),
  ])
  const sectionCodes = sectionCodeList.length > 0 ? sectionCodeList.join(', ') : null

  const sectionReportNo = formatSectionReportNoFromCodes(sectionCodeList)

  const reportType =
    fmt(row.receiving_report_type as string) ?? RECEIVING_REPORT_TYPES[0]

  const referenceReportNo = await resolveReferenceReportNo(
    reportType,
    fmt(row.referenced_srf_number as string),
  )

  const issuedAt = row.test_report_issued_at as string | null
  const dateOfReporting =
    opts?.dateOfReporting !== undefined
      ? opts.dateOfReporting
      : issuedAt
        ? fmtDate(issuedAt)
        : formatDateDmyMmm(new Date().toISOString().slice(0, 10))

  const productTitle = productTitleFromIs ?? fmt(row.test_required as string)
  const customerName =
    fmt(clients?.company_name) ?? fmt(opts?.fallbacks?.clientName) ?? null
  const customerAddressParts = [
    clients?.address,
    clients?.district,
    clients?.pin_code,
    clients?.state,
    clients?.country,
  ]
    .map((part) => fmt(part))
    .filter((part): part is string => Boolean(part))

  return {
    customerDetails: formatClientCustomerDetails(clients, {
      fallbackFirmName: opts?.fallbacks?.clientName,
    }),
    customerName,
    customerAddress: customerAddressParts.length > 0 ? customerAddressParts.join(', ') : null,
    isDetails: formatIsDetails(isNumber, productTitle),
    isCode: fmt(isNumber),
    productTitle,
    sampleCode: stripReceivingReportTypeFromCode(fmt(row.sample_code as string), reportType),
    sampleQrCode: stripReceivingReportTypeFromCode(fmt(row.sample_qr_code as string), reportType),
    natureOfSample: fmt(row.nature_of_sample as string),
    sampleIdentificationLine: formatSampleIdentificationLine(
      stripReceivingReportTypeFromCode(fmt(row.sample_code as string), reportType),
      stripReceivingReportTypeFromCode(fmt(row.sample_qr_code as string), reportType),
      fmt(row.nature_of_sample as string),
    ),
    batchNumber: fmt(row.batch_number as string),
    dateOfManufacturing: fmtDate(row.date_of_manufacturing as string) ?? '---',
    partyReferenceNo: fmt(row.client_reference as string),
    batchManufacturingPartyLine: formatBatchManufacturingPartyLine(
      fmt(row.batch_number as string),
      fmtDate(row.date_of_manufacturing as string) ?? '---',
      fmt(row.client_reference as string),
    ),
    sampleQuantity: fmt(row.sample_quantity as string),
    bisSeal: fmtYesNo(row.bis_seal as boolean | null),
    ioSignature: fmtYesNo(row.io_signature as boolean | null),
    sampleQtyBisIoLine: formatSampleQtyBisIoLine(
      fmt(row.sample_quantity as string),
      fmtYesNo(row.bis_seal as boolean | null),
      fmtYesNo(row.io_signature as boolean | null),
    ),
    sectionCodes,
    sectionReportNo,
    reportType,
    sectionReportLine: formatSectionReportLine(sectionCodes, sectionReportNo, reportType),
    dateOfSampleReceipt: fmtDate(row.date_of_sample_receiving as string),
    dateOfTestingStarted: testingDates.started,
    dateOfTestingCompleted: testingDates.completed,
    testingDatesLine: formatTestingDatesLine(
      fmtDate(row.date_of_sample_receiving as string),
      testingDates.started,
      testingDates.completed,
    ),
    dateOfReporting,
    referenceReportNo,
    anyOtherInformation: fmt(row.any_other_information as string),
    reportingReferenceOtherLine: formatReportingReferenceOtherLine(
      dateOfReporting,
      referenceReportNo,
      fmt(row.any_other_information as string),
    ),
    issuedAtIso: issuedAt,
    sampleDescription: fmt(row.sample_description as string),
    declaredValue: fmt(row.sample_declaration as string),
    partB: buildTestReportPartBDetails(
      {
        sampling_procedure_ref: row.sampling_procedure_ref as boolean | null,
        supporting_docs_required: row.supporting_docs_required as boolean | null,
        deviation_from_methods: row.deviation_from_methods as boolean | null,
        test_report_nabl_required: row.test_report_nabl_required as boolean | null,
      },
      opts?.applicableScopes,
    ),
  }
}
