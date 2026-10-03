import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-user-jwt',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

type ListUsersResponseItem = {
  id: string
  email: string
  full_name: string
  mobile: string
  designation: string
  department_name: string
  division: string
  status: string
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405, headers: corsHeaders })
  }

  const userJwt = req.headers.get('x-user-jwt')
  if (!userJwt) {
    return new Response(JSON.stringify({ error: 'Missing x-user-jwt header' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const url = Deno.env.get('SUPABASE_URL')
  const serviceRoleKey = Deno.env.get('SERVICE_ROLE_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!url || !serviceRoleKey) {
    return new Response(JSON.stringify({ error: 'Missing SUPABASE_URL or SERVICE_ROLE_KEY secret' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const admin = createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const { data: callerData, error: callerError } = await admin.auth.getUser(userJwt)
  if (callerError || !callerData?.user) {
    return new Response(JSON.stringify({ error: 'Invalid caller session' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const { data: callerProfile } = await admin
    .from('user_profiles')
    .select('designation')
    .eq('id', callerData.user.id)
    .maybeSingle()

  const profileDesignation = String((callerProfile as { designation?: unknown } | null)?.designation ?? '').trim()
  const metadataDesignation = String(
    ((callerData.user.user_metadata ?? {}) as { designation?: unknown }).designation ?? '',
  ).trim()
  const callerDesignation = profileDesignation || metadataDesignation
  const normalizedDesignation = callerDesignation.toLowerCase()
  if (normalizedDesignation !== 'laboratory director') {
    return new Response(JSON.stringify({ error: 'Forbidden' }), {
      status: 403,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const result: ListUsersResponseItem[] = []

  let page = 1
  const perPage = 1000
  while (true) {
    const { data: listData, error: listError } = await admin.auth.admin.listUsers({
      page,
      perPage,
    })

    if (listError) {
      return new Response(JSON.stringify({ error: listError.message }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const users = listData?.users ?? []
    if (users.length === 0) break

    const ids = users.map((u) => u.id)

    const { data: profilesData, error: profilesError } = await admin
      .from('user_profiles')
      .select('*')
      .in('id', ids)

    if (profilesError) {
      return new Response(JSON.stringify({ error: profilesError.message }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const profilesById = new Map<string, Record<string, unknown>>()
    for (const row of profilesData ?? []) {
      profilesById.set(String((row as { id?: unknown }).id ?? ''), row as Record<string, unknown>)
    }

    for (const u of users) {
      const profile = profilesById.get(u.id) ?? {}
      const metadata = (u.user_metadata ?? {}) as Record<string, unknown>

      // user_profiles is the authoritative source — metadata is fallback
      const profileFullName = String(
        (profile as { full_name?: unknown; name?: unknown }).full_name ?? (profile as { name?: unknown }).name ?? '',
      ).trim()
      const metadataFullName =
        typeof metadata.full_name === 'string' ? String(metadata.full_name).trim() : ''
      const fullName = profileFullName || metadataFullName || ''

      const profileMobile = String((profile as { mobile?: unknown }).mobile ?? '').trim()
      const metadataMobile = typeof metadata.mobile === 'string' ? String(metadata.mobile).trim() : ''
      const mobile = profileMobile || metadataMobile || ''

      const profileDesignation = String((profile as { designation?: unknown }).designation ?? '').trim()
      const metadataDesignation = typeof metadata.designation === 'string' ? String(metadata.designation).trim() : ''
      const designation = profileDesignation || metadataDesignation || ''

      const profileDepartmentName = String((profile as { department_name?: unknown }).department_name ?? '').trim()
      const metadataDepartmentName =
        typeof metadata.department_name === 'string' ? String(metadata.department_name).trim() : ''
      const departmentName = profileDepartmentName || metadataDepartmentName || ''

      const profileDivision = String((profile as { division?: unknown }).division ?? '').trim()
      const metadataDivision = typeof metadata.division === 'string' ? String(metadata.division).trim() : ''
      const division = profileDivision || metadataDivision || ''

      const profileStatus = String((profile as { status?: unknown }).status ?? '').trim()
      const metadataStatus = typeof metadata.status === 'string' ? String(metadata.status).trim() : ''
      const status = profileStatus || metadataStatus || 'Active'

      result.push({
        id: u.id,
        email: u.email ?? '',
        full_name: fullName,
        mobile,
        designation,
        department_name: departmentName,
        division,
        status,
      })
    }

    if (users.length < perPage) break
    page += 1
  }

  return new Response(JSON.stringify({ users: result }), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
})
