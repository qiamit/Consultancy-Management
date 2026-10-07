import { supabase } from '@/lib/supabaseClient'
import { formatIsCodeLabelFromParts } from '@/features/masters/is-codes/formatIsCodeLabel'
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
  const isCode = formatIsCodeLabelFromParts(
    row.is_code?.is_number,
    row.is_code?.revision_year,
  )
  const cmL = String(row.cm_l_digits ?? '').replace(/\D/g, '')
  const appNo = String(row.application_number ?? '').replace(/\D/g, '')
  const ref = cmL ? `CM/L-${cmL}` : appNo ? `CM/A-${appNo}` : ''
  const kind = (row.project_kind ?? '').trim()
  return [firm, isCode, ref || kind || null].filter(Boolean).join(' — ')
}

const OSL_MODULE_KIND = 'osl-sample-requirements' as const

const PROJECT_SELECT =
  '*, client:clients(company_name), is_code:is_codes(is_number, title, revision_year)'

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

/**
 * QR codes already assigned to a *sample row* on Applications / Licenses of other firms.
 * Unused imported pools on other firms are ignored — those ghosts must not wipe a fresh
 * Manak / transfer import on this firm.
 */
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
    for (const sample of parsed.rows ?? []) {
      const d = digitsQr(sample.qrCode)
      if (d.length >= 12) foreign.add(d)
    }
  }
  return foreign
}

/** Drop unused imported QR codes that belong to another firm (used on their sample). */
export function scrubForeignImportedQrCodes(
  payload: OslSampleRequirementsModulePayload,
  foreignCodes: Set<string>,
): OslSampleRequirementsModulePayload {
  if (foreignCodes.size === 0) return payload
  const nextImported = normalizeImportedQrCodes(
    (payload.importedQrCodes ?? []).filter((c) => !foreignCodes.has(digitsQr(c))),
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

  const foreign = await collectForeignOslQrCodes(clientId)
  const latest = opts.getLatest ? opts.getLatest() : opts.payload
  const scrubbed = scrubForeignImportedQrCodes(latest, foreign)
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
  codes: string[]
  currentPayload: OslSampleRequirementsModulePayload
}): Promise<OslSampleRequirementsModulePayload> {
  const projectId = opts.projectId.trim()
  const claimed = normalizeImportedQrCodes(opts.codes)
  const claimedSet = new Set(claimed.map((c) => digitsQr(c)).filter((d) => d.length >= 12))
  if (!projectId || claimedSet.size === 0) {
    return {
      ...opts.currentPayload,
      importedQrCodes: normalizeImportedQrCodes([
        ...(opts.currentPayload.importedQrCodes ?? []),
        ...claimed,
      ]),
    }
  }

  const nextPayload: OslSampleRequirementsModulePayload = {
    ...opts.currentPayload,
    importedQrCodes: normalizeImportedQrCodes([
      ...(opts.currentPayload.importedQrCodes ?? []),
      ...claimed,
    ]),
  }

  const { data: modules, error } = await supabase
    .from('bis_project_module_data')
    .select('bis_project_id, payload')
    .eq('module_kind', OSL_MODULE_KIND)
    .neq('bis_project_id', projectId)
    .limit(500)
  if (error) throw error

  for (const raw of Array.isArray(modules) ? modules : []) {
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

  return nextPayload
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
