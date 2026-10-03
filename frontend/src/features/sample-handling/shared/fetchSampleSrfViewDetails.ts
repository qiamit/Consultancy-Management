import { supabase } from '@/lib/supabaseClient'
import { formatIsCodeLabelFromParts } from '@/features/masters/is-codes/formatIsCodeLabel'
import { stripReceivingReportTypeFromCode } from '@/features/sample-handling/receiving/receivingSrfFromReference'

export const IS_CODE_FILES_BUCKET = 'is-code-files'
export const CLIENT_REFERENCES_BUCKET = 'sample-client-references'

export type IsCodeFileLink = {
  file_name: string
  url?: string
}

export async function loadIsCodeFiles(isCodeId: string): Promise<IsCodeFileLink[]> {
  const out: IsCodeFileLink[] = []
  const { data: fileRows } = await supabase
    .from('is_code_files')
    .select('file_name, storage_path')
    .eq('is_code_id', isCodeId)
    .order('created_at', { ascending: false })

  let fileList = Array.isArray(fileRows) ? fileRows : []
  if (fileList.length === 0) {
    const { data: objects } = await supabase.storage.from(IS_CODE_FILES_BUCKET).list(isCodeId, { limit: 20 })
    fileList = (Array.isArray(objects) ? objects : [])
      .map((o) => {
        const name = String((o as { name?: string }).name ?? '')
        if (!name) return null
        return { file_name: name, storage_path: `${isCodeId}/${name}` }
      })
      .filter((x): x is { file_name: string; storage_path: string } => x !== null)
  }

  for (const f of fileList) {
    const storagePath = (f as { storage_path?: string }).storage_path
    const fileName = (f as { file_name?: string }).file_name ?? 'File'
    if (!storagePath) {
      out.push({ file_name: fileName })
      continue
    }
    try {
      const { data: signed } = await supabase.storage
        .from(IS_CODE_FILES_BUCKET)
        .createSignedUrl(storagePath, 60 * 10)
      out.push({ file_name: fileName, url: signed?.signedUrl })
    } catch {
      out.push({ file_name: fileName })
    }
  }
  return out
}

async function signedClientReferenceUrl(path: string | null | undefined): Promise<string | undefined> {
  const p = (path ?? '').trim()
  if (!p) return undefined
  if (/^https?:\/\//i.test(p)) return p
  const { data } = await supabase.storage.from(CLIENT_REFERENCES_BUCKET).createSignedUrl(p, 60 * 10)
  return data?.signedUrl
}

export type SampleSrfViewDetails = {
  srfNumber: string | null
  referencedSrfNumber: string | null
  receivingReportType: string | null
  dateOfSampleReceiving: string | null
  sampleReceivingStatus: string | null
  stage: string | null
  clientName: string | null
  clientReference: string | null
  clientContact: string | null
  clientEmail: string | null
  clientPhone: string | null
  clientAddress: string | null
  isCodeLabel: string | null
  sampleCode: string | null
  sampleQrCode: string | null
  batchNumber: string | null
  dateOfManufacturing: string | null
  sampleQuantity: string | null
  shelfLife: string | null
  testRequired: string | null
  natureOfSample: string | null
  modeOfDisposal: string | null
  sampleDescription: string | null
  sampleDeclaration: string | null
  anyOtherInformation: string | null
  tentativeDateRequired: string | null
  tentativeDateByLab: string | null
  bisSeal: boolean | null
  ioSignature: boolean | null
  statementConformityRequired: boolean | null
  witnessTestRequired: boolean | null
  competentPersonAvailable: boolean | null
  equipmentAvailable: boolean | null
  canCompleteWithinTime: boolean | null
  deviationFromMethods: boolean | null
  supportingDocsRequired: boolean | null
  decisionRuleApplied: boolean | null
  testingMethodAvailable: boolean | null
  samplingProcedureRef: boolean | null
  isCodeFiles: IsCodeFileLink[]
  clientReferenceUrl?: string
}

export async function fetchSampleSrfViewDetails(
  sampleId: string,
  fallbacks?: { srfNumber?: string | null; clientName?: string | null; isCodeLabel?: string | null },
): Promise<SampleSrfViewDetails> {
  const { data, error } = await supabase
    .from('samples')
    .select(
      `
      srf_number,
      referenced_srf_number,
      receiving_report_type,
      date_of_sample_receiving,
      sample_receiving_status,
      stage,
      client_name,
      client_reference,
      test_report_is_code_id,
      sample_code,
      sample_qr_code,
      batch_number,
      date_of_manufacturing,
      sample_quantity,
      shelf_life,
      test_required,
      nature_of_sample,
      mode_of_disposal,
      sample_description,
      sample_declaration,
      any_other_information,
      tentative_date_required,
      tentative_date_by_lab,
      bis_seal,
      io_signature,
      statement_conformity_required,
      witness_test_required,
      competent_person_available,
      equipment_available,
      can_complete_within_time,
      deviation_from_methods,
      supporting_docs_required,
      decision_rule_applied,
      testing_method_available,
      sampling_procedure_ref,
      client_references_path,
      clients(company_name, contact_person_name, email, mobile, address)
    `,
    )
    .eq('id', sampleId)
    .maybeSingle()

  if (error) throw error
  if (!data) throw new Error('Sample not found')

  const row = data as Record<string, unknown>
  const clients = row.clients as {
    company_name?: string | null
    contact_person_name?: string | null
    email?: string | null
    mobile?: string | null
    address?: string | null
  } | null

  const isCodeId = row.test_report_is_code_id as string | null
  let isCodeLabel = fallbacks?.isCodeLabel ?? null
  if (isCodeId) {
    const { data: isRow } = await supabase
      .from('is_codes')
      .select('is_number, revision_year')
      .eq('id', isCodeId)
      .maybeSingle()
    if (isRow) {
      const r = isRow as { is_number?: string; revision_year?: string | null }
      isCodeLabel =
        formatIsCodeLabelFromParts(r.is_number, r.revision_year) || r.is_number || isCodeId
    }
  }

  const [isCodeFiles, clientReferenceUrl] = await Promise.all([
    isCodeId ? loadIsCodeFiles(isCodeId) : Promise.resolve([]),
    signedClientReferenceUrl(row.client_references_path as string | null),
  ])

  return {
    srfNumber: (row.srf_number as string) ?? fallbacks?.srfNumber ?? null,
    referencedSrfNumber: (row.referenced_srf_number as string) ?? null,
    receivingReportType: (row.receiving_report_type as string) ?? null,
    dateOfSampleReceiving: (row.date_of_sample_receiving as string) ?? null,
    sampleReceivingStatus: (row.sample_receiving_status as string) ?? null,
    stage: (row.stage as string) ?? null,
    clientName: clients?.company_name ?? (row.client_name as string) ?? fallbacks?.clientName ?? null,
    clientReference: (row.client_reference as string) ?? null,
    clientContact: clients?.contact_person_name ?? null,
    clientEmail: clients?.email ?? null,
    clientPhone: clients?.mobile ?? null,
    clientAddress: clients?.address ?? null,
    isCodeLabel,
    sampleCode: stripReceivingReportTypeFromCode(
      (row.sample_code as string) ?? null,
      (row.receiving_report_type as string) ?? null,
    ),
    sampleQrCode: stripReceivingReportTypeFromCode(
      (row.sample_qr_code as string) ?? null,
      (row.receiving_report_type as string) ?? null,
    ),
    batchNumber: (row.batch_number as string) ?? null,
    dateOfManufacturing: (row.date_of_manufacturing as string) ?? null,
    sampleQuantity: (row.sample_quantity as string) ?? null,
    shelfLife: (row.shelf_life as string) ?? null,
    testRequired: (row.test_required as string) ?? null,
    natureOfSample: (row.nature_of_sample as string) ?? null,
    modeOfDisposal: (row.mode_of_disposal as string) ?? null,
    sampleDescription: (row.sample_description as string) ?? null,
    sampleDeclaration: (row.sample_declaration as string) ?? null,
    anyOtherInformation: (row.any_other_information as string) ?? null,
    tentativeDateRequired: (row.tentative_date_required as string) ?? null,
    tentativeDateByLab: (row.tentative_date_by_lab as string) ?? null,
    bisSeal: (row.bis_seal as boolean) ?? null,
    ioSignature: (row.io_signature as boolean) ?? null,
    statementConformityRequired: (row.statement_conformity_required as boolean) ?? null,
    witnessTestRequired: (row.witness_test_required as boolean) ?? null,
    competentPersonAvailable: (row.competent_person_available as boolean) ?? null,
    equipmentAvailable: (row.equipment_available as boolean) ?? null,
    canCompleteWithinTime: (row.can_complete_within_time as boolean) ?? null,
    deviationFromMethods: (row.deviation_from_methods as boolean) ?? null,
    supportingDocsRequired: (row.supporting_docs_required as boolean) ?? null,
    decisionRuleApplied: (row.decision_rule_applied as boolean) ?? null,
    testingMethodAvailable: (row.testing_method_available as boolean) ?? null,
    samplingProcedureRef: (row.sampling_procedure_ref as boolean) ?? null,
    isCodeFiles,
    clientReferenceUrl,
  }
}
