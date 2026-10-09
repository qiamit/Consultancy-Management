import { supabase } from '@/lib/supabaseClient'

export type BisReferenceRow = {
  id: string
  code: string
  name: string
}

function missingTable(error: { code?: string; message?: string } | null) {
  if (!error) return false
  return error.code === '42P01' || error.code === 'PGRST205' || /does not exist|schema cache/i.test(error.message ?? '')
}

async function listReference(table: 'certification_schemes' | 'bis_offices' | 'licence_statuses') {
  const { data, error } = await supabase.from(table).select('id, code, name').order('name')
  if (error) {
    if (missingTable(error)) return []
    throw error
  }
  return (Array.isArray(data) ? data : []).map((raw) => {
    const row = raw as Record<string, unknown>
    return { id: String(row.id ?? ''), code: String(row.code ?? ''), name: String(row.name ?? '') }
  })
}

export function listCertificationSchemes() {
  return listReference('certification_schemes')
}

export function listBisOffices() {
  return listReference('bis_offices')
}

export function listLicenceStatuses() {
  return listReference('licence_statuses')
}
