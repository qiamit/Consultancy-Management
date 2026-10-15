import { supabase } from '@/lib/supabaseClient'
import { isCodeDisplayLabel } from './types'
import { fetchBisModulePayload, saveBisModulePayload } from './bisModuleDataApi'
import {
  availableImportedQrCodes,
  normalizeImportedQrCodes,
  parseOslSampleRequirementsPayload,
  type OslSampleRequirementsModulePayload,
} from './oslSampleRequirementsModel'
import type { BisProjectRow } from './types'

/** Firm — IS number: year — CM/L or CM/A (unused count appended in the UI). */
function formatOslQrSourceLabel(row: BisProjectRow): string {
  const firm = (row.client?.company_name ?? '').trim() || '—'
  const isCode = isCodeDisplayLabel(row)
  const cmL = String(row.cm_l_digits ?? '').replace(/\D/g, '')
  const appNo = String(row.application_number ?? '').replace(/\D/g, '')
  const ref = cmL ? `CM/L-${cmL}` : appNo ? `CM/A-${appNo}` : ''
  const kind = (row.project_kind ?? '').trim()
  return [firm, isCode, ref || kind || null].filter(Boolean).join(' — ')
}

const OSL_MODULE_KIND = 'osl-sample-requirements' as const

const PROJECT_SELECT =
  '*, client:clients(company_name), is_code:is_codes(is_number, title, revision_year, part_no, section_no, standard_prefix, unit_of_is)'

export type OslQrSourceProject = {
  projectId: string
  label: string
  unusedCount: number
  unusedCodes: string[]
}

function payloadToRecord(payload: OslSampleRequirementsModulePayload): Record<string, unknown> {
  return {
    rows: payload.rows,
    importedQrCodes: payload.importedQrCodes,
    signatoryName: payload.signatoryName,
    signatoryDesignation: payload.signatoryDesignation,
  }
}

function digitsQr(code: string): string {
  return code.replace(/\D/g, '')
}

/** A Manak account must identify one client firm only for safe QR import. */
export async function assertManakAccountBelongsToOnlyFirm(opts: {
  clientId: string
  portalUserId: string
}): Promise<void> {
  const clientId = opts.clientId.trim()
  const portalUserId = opts.portalUserId.trim()
  if (!clientId || !portalUserId) {
    throw new Error('This firm needs its own saved Manak User ID before importing QR codes.')
  }

  const [clients, projects] = await Promise.all([
    supabase
      .from('clients')
      .select('id')
      .eq('manak_user_id', portalUserId)
      .neq('id', clientId)
      .limit(1),
    supabase
      .from('bis_projects')
      .select('id, client_id')
      .eq('portal_user_id', portalUserId)
      .limit(500),
  ])
  if (clients.error) throw clients.error
  if (projects.error) throw projects.error
  const legacyProjectOwnedElsewhere = (projects.data ?? []).some((project) => {
    const ownerId = String((project as { client_id?: string | null }).client_id ?? '').trim()
    return !ownerId || ownerId !== clientId
  })
  if ((clients.data?.length ?? 0) > 0 || legacyProjectOwnedElsewhere) {
    throw new Error(
      'This Manak User ID is assigned to another firm too. Give each company its own Manak account before importing QR codes.',
    )
  }
}

/** QR codes present in any pool or sample row owned by another firm. */
export async function collectForeignOslQrCodes(clientId: string): Promise<Set<string>> {
  const cid = clientId.trim()
  if (!cid) return new Set()

  const { data: projects, error: projectError } = await supabase
    .from('bis_projects')
    .select('id, client_id')
    .or(`client_id.neq.${cid},client_id.is.null`)
    .limit(500)
  if (projectError) throw projectError

  const ids = (Array.isArray(projects) ? projects : [])
    .map((p) => String((p as { id?: string }).id ?? '').trim())
    .filter(Boolean)
  if (ids.length === 0) return new Set()

  const { data: modules, error: moduleError } = await supabase
    .from('bis_project_module_data')
    .select('bis_project_id, payload')
    .eq('module_kind', OSL_MODULE_KIND)
    .in('bis_project_id', ids)
  if (moduleError) throw moduleError

  const foreign = new Set<string>()
  for (const raw of Array.isArray(modules) ? modules : []) {
    const row = raw as { payload?: unknown }
    if (!row.payload || typeof row.payload !== 'object' || Array.isArray(row.payload)) continue
    const parsed = parseOslSampleRequirementsPayload(row.payload as Record<string, unknown>)
    for (const code of parsed.importedQrCodes ?? []) {
      const d = digitsQr(code)
      if (d.length >= 12) foreign.add(d)
    }
    for (const sample of parsed.rows ?? []) {
      const d = digitsQr(sample.qrCode)
      if (d.length >= 12) foreign.add(d)
    }
  }
  return foreign
}

/** QR codes already assigned to a sample row under the same firm. */
export async function collectFirmUsedOslQrCodes(clientId: string): Promise<Set<string>> {
  const cid = clientId.trim()
  if (!cid) return new Set()

  const { data: projects, error: projectError } = await supabase
    .from('bis_projects')
    .select('id')
    .eq('client_id', cid)
    .limit(500)
  if (projectError) throw projectError

  const ids = (Array.isArray(projects) ? projects : [])
    .map((project) => String((project as { id?: string }).id ?? '').trim())
    .filter(Boolean)
  if (ids.length === 0) return new Set()

  const { data: modules, error: moduleError } = await supabase
    .from('bis_project_module_data')
    .select('payload')
    .eq('module_kind', OSL_MODULE_KIND)
    .in('bis_project_id', ids)
    .limit(500)
  if (moduleError) throw moduleError

  const used = new Set<string>()
  for (const raw of Array.isArray(modules) ? modules : []) {
    const payload = (raw as { payload?: unknown }).payload
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) continue
    const parsed = parseOslSampleRequirementsPayload(payload as Record<string, unknown>)
    for (const sample of parsed.rows ?? []) {
      const code = digitsQr(sample.qrCode)
      if (code.length >= 12) used.add(code)
    }
  }
  return used
}

/** Codes that must never be offered from an unused QR pool. */
export async function collectUnavailableOslQrCodes(clientId: string): Promise<Set<string>> {
  const [foreign, used] = await Promise.all([
    collectForeignOslQrCodes(clientId),
    collectFirmUsedOslQrCodes(clientId),
  ])
  return new Set([...foreign, ...used])
}

/** Drop unused imported QR codes that belong to another firm (used on their sample). */
export function scrubUnavailableImportedQrCodes(
  payload: OslSampleRequirementsModulePayload,
  unavailableCodes: Set<string>,
): OslSampleRequirementsModulePayload {
  const blocked = new Set(unavailableCodes)
  for (const row of payload.rows ?? []) {
    const usedHere = digitsQr(row.qrCode)
    if (usedHere.length >= 12) blocked.add(usedHere)
  }
  return scrubImportedQrCodes(payload, blocked)
}

function scrubImportedQrCodes(
  payload: OslSampleRequirementsModulePayload,
  unavailableCodes: Set<string>,
): OslSampleRequirementsModulePayload {
  if (unavailableCodes.size === 0) return payload
  const nextImported = normalizeImportedQrCodes(
    (payload.importedQrCodes ?? []).filter((code) => !unavailableCodes.has(digitsQr(code))),
  )
  if (nextImported.length === (payload.importedQrCodes ?? []).length) return payload
  return { ...payload, importedQrCodes: nextImported }
}

/**
 * Scrub foreign / ghost unused QR codes from a project and persist to DB.
 * Always re-applies against `getLatest()` after the network round-trip so a concurrent
 * Manak QR import is never overwritten by a stale scrub snapshot.
 */
export async function persistScrubbedOslQrPool(opts: {
  projectId: string
  clientId: string
  payload: OslSampleRequirementsModulePayload
  /** Prefer latest React state after await (avoids clobbering Manak import). */
  getLatest?: () => OslSampleRequirementsModulePayload
}): Promise<OslSampleRequirementsModulePayload> {
  const projectId = opts.projectId.trim()
  const clientId = opts.clientId.trim()
  if (!projectId || !clientId) return opts.payload

  const unavailable = await collectUnavailableOslQrCodes(clientId)
  const latest = opts.getLatest ? opts.getLatest() : opts.payload
  for (const row of latest.rows ?? []) {
    const usedHere = digitsQr(row.qrCode)
    if (usedHere.length >= 12) unavailable.add(usedHere)
  }
  const scrubbed = scrubImportedQrCodes(latest, unavailable)
  if (scrubbed === latest) return latest

  await saveBisModulePayload(projectId, OSL_MODULE_KIND, payloadToRecord(scrubbed))
  return scrubbed
}

/**
 * After Manak / transfer import: keep codes on this project and remove them from
 * unused pools on every other project (any firm) so ghosts cannot wipe them later.
 * Sample rows elsewhere are left untouched.
 */
export async function claimImportedOslQrCodes(opts: {
  projectId: string
  clientId: string
  codes: string[]
  currentPayload: OslSampleRequirementsModulePayload
}): Promise<{ payload: OslSampleRequirementsModulePayload; skippedUsedCodes: string[] }> {
  const projectId = opts.projectId.trim()
  const clientId = opts.clientId.trim()
  const claimed = normalizeImportedQrCodes(opts.codes)
  const claimedSet = new Set(claimed.map((c) => digitsQr(c)).filter((d) => d.length >= 12))
  if (!projectId || !clientId) {
    throw new Error('Save this project and set its client before importing Manak QR codes.')
  }
  const targetClientId = await fetchProjectClientId(projectId)
  if (!targetClientId || targetClientId !== clientId) {
    throw new Error('The selected project no longer matches this firm. Reload it before importing QR codes.')
  }

  const foreignCodes = await collectForeignOslQrCodes(clientId)
  if ([...claimedSet].some((code) => foreignCodes.has(code))) {
    throw new Error('One or more QR codes are already owned by another firm and cannot be imported here.')
  }

  const usedCodes = await collectFirmUsedOslQrCodes(clientId)
  for (const row of opts.currentPayload.rows ?? []) {
    const usedHere = digitsQr(row.qrCode)
    if (usedHere.length >= 12) usedCodes.add(usedHere)
  }
  const skippedUsedCodes = claimed.filter((code) => usedCodes.has(digitsQr(code)))
  const freshClaims = claimed.filter((code) => !usedCodes.has(digitsQr(code)))

  const unavailable = new Set([...foreignCodes, ...usedCodes])
  const safeCurrentPayload = scrubImportedQrCodes(opts.currentPayload, unavailable)
  const nextPayload: OslSampleRequirementsModulePayload = {
    ...safeCurrentPayload,
    importedQrCodes: normalizeImportedQrCodes([
      ...(safeCurrentPayload.importedQrCodes ?? []),
      ...freshClaims,
    ]),
  }
  if (
    freshClaims.length === 0 &&
    nextPayload.importedQrCodes.length !== (opts.currentPayload.importedQrCodes ?? []).length
  ) {
    await saveBisModulePayload(projectId, OSL_MODULE_KIND, payloadToRecord(nextPayload))
    return { payload: nextPayload, skippedUsedCodes }
  }

  // Find siblings by the same firm before saving or touching any QR pool.
  const { data: clientProjects, error: projectsError } = await supabase
    .from('bis_projects')
    .select('id')
    .eq('client_id', clientId)
    .neq('id', projectId)
    .limit(500)
  if (projectsError) throw projectsError
  const siblingIds = (Array.isArray(clientProjects) ? clientProjects : [])
    .map((row) => String((row as { id?: string }).id ?? '').trim())
    .filter(Boolean)
  let modules: unknown[] = []
  if (siblingIds.length > 0) {
    const { data, error } = await supabase
      .from('bis_project_module_data')
      .select('bis_project_id, payload')
      .eq('module_kind', OSL_MODULE_KIND)
      .in('bis_project_id', siblingIds)
      .limit(500)
    if (error) throw error
    modules = Array.isArray(data) ? data : []
  }

  await saveBisModulePayload(projectId, OSL_MODULE_KIND, payloadToRecord(nextPayload))

  for (const raw of modules) {
    const row = raw as { bis_project_id?: string; payload?: unknown }
    const otherId = String(row.bis_project_id ?? '').trim()
    if (!otherId || !row.payload || typeof row.payload !== 'object' || Array.isArray(row.payload)) {
      continue
    }
    const parsed = parseOslSampleRequirementsPayload(row.payload as Record<string, unknown>)
    const nextImported = normalizeImportedQrCodes(
      (parsed.importedQrCodes ?? []).filter((c) => !claimedSet.has(digitsQr(c))),
    )
    if (nextImported.length === (parsed.importedQrCodes ?? []).length) continue
    void saveBisModulePayload(
      otherId,
      OSL_MODULE_KIND,
      payloadToRecord({ ...parsed, importedQrCodes: nextImported }),
    ).catch(() => {
      /* non-blocking ghost cleanup */
    })
  }

  return { payload: nextPayload, skippedUsedCodes }
}

/** Remove one unused QR code from this project's import pool, without changing sample rows. */
export async function removeUnusedOslQrCode(opts: {
  projectId: string
  code: string
  currentPayload: OslSampleRequirementsModulePayload
}): Promise<OslSampleRequirementsModulePayload> {
  const projectId = opts.projectId.trim()
  const code = digitsQr(opts.code)
  if (!projectId || code.length < 12) throw new Error('Select a valid imported QR code to remove.')

  const raw = await fetchBisModulePayload(projectId, OSL_MODULE_KIND)
  const persisted = parseOslSampleRequirementsPayload(raw)
  const current = opts.currentPayload
  if ([...(persisted.rows ?? []), ...(current.rows ?? [])].some((row) => digitsQr(row.qrCode) === code)) {
    throw new Error('This QR code is assigned to a sample row. Remove it from that row first.')
  }
  const next: OslSampleRequirementsModulePayload = {
    ...current,
    importedQrCodes: normalizeImportedQrCodes([
      ...(persisted.importedQrCodes ?? []),
      ...(current.importedQrCodes ?? []),
    ]).filter((item) => digitsQr(item) !== code),
  }
  if (next.importedQrCodes.length !== persisted.importedQrCodes.length ||
      next.importedQrCodes.some((item, index) => item !== persisted.importedQrCodes[index])) {
    await saveBisModulePayload(projectId, OSL_MODULE_KIND, payloadToRecord(next))
  }
  return next
}

async function fetchProjectClientId(projectId: string): Promise<string> {
  const { data, error } = await supabase
    .from('bis_projects')
    .select('client_id')
    .eq('id', projectId)
    .maybeSingle()
  if (error) throw error
  return String((data as { client_id?: string | null } | null)?.client_id ?? '').trim()
}

/** Same-client BIS projects that have unused (not-on-sample) OSL QR codes. */
export async function listOslQrSourceProjects(opts: {
  clientId: string
  excludeProjectId: string
}): Promise<OslQrSourceProject[]> {
  const clientId = opts.clientId.trim()
  const excludeId = opts.excludeProjectId.trim()
  if (!clientId) return []

  let projectQuery = supabase
    .from('bis_projects')
    .select(PROJECT_SELECT)
    .eq('client_id', clientId)
    .order('updated_at', { ascending: false })
    .limit(100)
  if (excludeId) projectQuery = projectQuery.neq('id', excludeId)

  const { data: projects, error: projectError } = await projectQuery
  if (projectError) throw projectError

  const projectRows = (Array.isArray(projects) ? projects : []) as BisProjectRow[]
  if (projectRows.length === 0) return []

  // Include the current (exclude) project too — needed to know which codes are
  // already used / held on this firm, so ghost pools on sibling apps don't show.
  const { data: allClientProjects, error: allClientError } = await supabase
    .from('bis_projects')
    .select('id, client_id, updated_at')
    .eq('client_id', clientId)
    .limit(100)
  if (allClientError) throw allClientError

  const allClientRows = (Array.isArray(allClientProjects) ? allClientProjects : []) as Array<{
    id?: string
    updated_at?: string | null
  }>
  const updatedAtById = new Map<string, number>()
  for (const p of allClientRows) {
    const id = String(p.id ?? '').trim()
    if (!id) continue
    updatedAtById.set(id, Date.parse(String(p.updated_at ?? '')) || 0)
  }
  const moduleIds =
    allClientRows.map((p) => String(p.id ?? '').trim()).filter(Boolean).length > 0
      ? allClientRows.map((p) => String(p.id ?? '').trim()).filter(Boolean)
      : projectRows.map((p) => p.id)

  const { data: modules, error: moduleError } = await supabase
    .from('bis_project_module_data')
    .select('bis_project_id, payload')
    .eq('module_kind', OSL_MODULE_KIND)
    .in('bis_project_id', moduleIds)
  if (moduleError) throw moduleError

  const payloadByProject = new Map<string, Record<string, unknown>>()
  for (const raw of Array.isArray(modules) ? modules : []) {
    const row = raw as { bis_project_id?: string; payload?: unknown }
    const id = String(row.bis_project_id ?? '').trim()
    if (!id || !row.payload || typeof row.payload !== 'object' || Array.isArray(row.payload)) {
      continue
    }
    payloadByProject.set(id, row.payload as Record<string, unknown>)
  }

  const parsedByProject = new Map<string, OslSampleRequirementsModulePayload>()
  for (const [projectId, rawPayload] of payloadByProject) {
    parsedByProject.set(projectId, parseOslSampleRequirementsPayload(rawPayload))
  }

  // Same rule as opening Sample Requirements: codes that already exist on another
  // firm must not appear as "unused" here (and get cleaned from DB).
  const foreignCodes = await collectForeignOslQrCodes(clientId)

  // Codes already assigned to any sample on this firm (any Application / License).
  const firmWideUsedOnSamples = new Set<string>()
  // code → project ids that still hold it in importedQrCodes pool
  const poolOwners = new Map<string, string[]>()
  for (const [projectId, parsed] of parsedByProject) {
    for (const row of parsed.rows ?? []) {
      const d = digitsQr(row.qrCode)
      if (d.length >= 12) firmWideUsedOnSamples.add(d)
    }
    for (const code of parsed.importedQrCodes ?? []) {
      const d = digitsQr(code)
      if (d.length < 12) continue
      if (foreignCodes.has(d)) continue
      const owners = poolOwners.get(d) ?? []
      owners.push(projectId)
      poolOwners.set(d, owners)
    }
  }

  // For duplicated pools (usually from old module Import), keep the code only on
  // the project that already uses it on a sample, else the most recently updated one.
  const canonicalOwner = new Map<string, string>()
  for (const [code, owners] of poolOwners) {
    if (owners.length === 1) {
      canonicalOwner.set(code, owners[0]!)
      continue
    }
    const usedOn = owners.find((pid) => {
      const parsed = parsedByProject.get(pid)
      return (parsed?.rows ?? []).some((r) => digitsQr(r.qrCode) === code)
    })
    if (usedOn) {
      canonicalOwner.set(code, usedOn)
      continue
    }
    let best = owners[0]!
    let bestTs = updatedAtById.get(best) ?? 0
    for (const pid of owners.slice(1)) {
      const ts = updatedAtById.get(pid) ?? 0
      if (ts >= bestTs) {
        best = pid
        bestTs = ts
      }
    }
    canonicalOwner.set(code, best)
  }

  // Persist de-dupe / ghost / foreign cleanup on sibling projects (non-blocking).
  for (const [projectId, parsed] of parsedByProject) {
    const nextImported = normalizeImportedQrCodes(
      (parsed.importedQrCodes ?? []).filter((code) => {
        const d = digitsQr(code)
        if (foreignCodes.has(d)) return false
        if (firmWideUsedOnSamples.has(d)) {
          // Keep if this project itself uses it on a sample (history); else drop ghost.
          const usedHere = (parsed.rows ?? []).some((r) => digitsQr(r.qrCode) === d)
          return usedHere
        }
        return canonicalOwner.get(d) === projectId
      }),
    )
    if (nextImported.length === (parsed.importedQrCodes ?? []).length) continue
    parsedByProject.set(projectId, { ...parsed, importedQrCodes: nextImported })
    void saveBisModulePayload(
      projectId,
      OSL_MODULE_KIND,
      payloadToRecord({ ...parsed, importedQrCodes: nextImported }),
    ).catch(() => {
      /* non-blocking cleanup */
    })
  }

  // Codes already sitting on the target project (pool or samples) — don't offer again.
  const targetHeld = new Set<string>()
  if (excludeId) {
    const targetParsed = parsedByProject.get(excludeId)
    if (targetParsed) {
      for (const code of targetParsed.importedQrCodes ?? []) {
        const d = digitsQr(code)
        if (d.length >= 12) targetHeld.add(d)
      }
      for (const row of targetParsed.rows ?? []) {
        const d = digitsQr(row.qrCode)
        if (d.length >= 12) targetHeld.add(d)
      }
    }
  }

  const out: OslQrSourceProject[] = []
  for (const project of projectRows) {
    if (String(project.client_id ?? '').trim() !== clientId) continue
    const parsed = parsedByProject.get(project.id)
    if (!parsed) continue
    const transferable = availableImportedQrCodes(parsed).filter((code) => {
      const d = digitsQr(code)
      if (foreignCodes.has(d)) return false
      if (firmWideUsedOnSamples.has(d)) return false
      if (targetHeld.has(d)) return false
      if (canonicalOwner.get(d) !== project.id) return false
      return true
    })
    if (transferable.length === 0) continue
    out.push({
      projectId: project.id,
      label: formatOslQrSourceLabel(project),
      unusedCount: transferable.length,
      unusedCodes: transferable,
    })
  }
  return out
}

/**
 * Move unused QR codes from a sibling application to the current payload.
 * Only allowed within the same firm (client_id).
 * Source: remaining unused codes are removed from importedQrCodes.
 * Source sample rows (already used / test-request QRs) are left unchanged.
 */
export async function transferUnusedOslQrFromProject(opts: {
  sourceProjectId: string
  expectedClientId: string
  currentPayload: OslSampleRequirementsModulePayload
}): Promise<{ codes: string[]; nextPayload: OslSampleRequirementsModulePayload }> {
  const sourceId = opts.sourceProjectId.trim()
  const expectedClientId = opts.expectedClientId.trim()
  if (!sourceId) throw new Error('Select a source application.')
  if (!expectedClientId) {
    throw new Error('This project has no client — cannot transfer QR codes.')
  }

  const sourceClientId = await fetchProjectClientId(sourceId)
  if (!sourceClientId || sourceClientId !== expectedClientId) {
    throw new Error('QR codes can only move between Applications / Licenses of the same firm.')
  }

  const raw = await fetchBisModulePayload(sourceId, OSL_MODULE_KIND)
  const source = parseOslSampleRequirementsPayload(raw)

  // Re-check firm-wide: never move a code already on another license’s sample.
  const sourceClientProjects = await supabase
    .from('bis_projects')
    .select('id')
    .eq('client_id', expectedClientId)
    .limit(100)
  if (sourceClientProjects.error) throw sourceClientProjects.error
  const siblingIds = (Array.isArray(sourceClientProjects.data) ? sourceClientProjects.data : [])
    .map((p) => String((p as { id?: string }).id ?? '').trim())
    .filter((id) => id && id !== sourceId)

  const firmWideUsed = new Set<string>()
  if (siblingIds.length > 0) {
    const { data: siblingModules, error: siblingErr } = await supabase
      .from('bis_project_module_data')
      .select('payload')
      .eq('module_kind', OSL_MODULE_KIND)
      .in('bis_project_id', siblingIds)
    if (siblingErr) throw siblingErr
    for (const rawMod of Array.isArray(siblingModules) ? siblingModules : []) {
      const payload = (rawMod as { payload?: unknown }).payload
      if (!payload || typeof payload !== 'object' || Array.isArray(payload)) continue
      const parsed = parseOslSampleRequirementsPayload(payload as Record<string, unknown>)
      for (const row of parsed.rows ?? []) {
        const d = digitsQr(row.qrCode)
        if (d.length >= 12) firmWideUsed.add(d)
      }
    }
  }

  const unused = availableImportedQrCodes(source).filter(
    (code) => !firmWideUsed.has(digitsQr(code)),
  )
  if (unused.length === 0) {
    throw new Error('No remaining unused QR codes on that application.')
  }

  const unusedSet = new Set(unused.map((c) => digitsQr(c)))
  const nextSourceImported = normalizeImportedQrCodes(
    (source.importedQrCodes ?? []).filter((c) => !unusedSet.has(digitsQr(c))),
  )
  await saveBisModulePayload(
    sourceId,
    OSL_MODULE_KIND,
    payloadToRecord({ ...source, importedQrCodes: nextSourceImported }),
  )

  const nextPayload: OslSampleRequirementsModulePayload = {
    ...opts.currentPayload,
    importedQrCodes: normalizeImportedQrCodes([
      ...(opts.currentPayload.importedQrCodes ?? []),
      ...unused,
    ]),
  }

  return { codes: unused, nextPayload }
}
