import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-user-jwt',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

type UpdateUserBody = {
  user_id: string
  full_name?: string
  mobile?: string
  designation?: string
  department_name?: string
  division?: string
  status?: string
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

  const body = (await req.json().catch(() => null)) as UpdateUserBody | null
  if (!body?.user_id) {
    return new Response(JSON.stringify({ error: 'user_id is required' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const profilePayload: Record<string, unknown> = {}
  if (typeof body.full_name === 'string') profilePayload.full_name = body.full_name
  if (typeof body.mobile === 'string') profilePayload.mobile = body.mobile
  if (typeof body.designation === 'string') profilePayload.designation = body.designation
  if (typeof body.department_name === 'string') profilePayload.department_name = body.department_name
  if (typeof body.division === 'string') profilePayload.division = body.division
  if (typeof body.status === 'string') profilePayload.status = body.status

  if (Object.keys(profilePayload).length > 0) {
    const { error: profileError } = await admin
      .from('user_profiles')
      .upsert(
        {
          id: body.user_id,
          ...profilePayload,
        },
        { onConflict: 'id' },
      )

    if (profileError) {
      return new Response(JSON.stringify({ error: `Profile update failed: ${profileError.message}` }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
  }

  try {
    const { data: existingUser, error: getUserError } = await admin.auth.admin.getUserById(body.user_id)

    let existingMetadata: Record<string, unknown> = {}
    if (!getUserError && existingUser?.user?.user_metadata) {
      existingMetadata = existingUser.user.user_metadata as Record<string, unknown>
    }

    const authMetadataPayload: Record<string, unknown> = { ...existingMetadata }
    if (typeof body.full_name === 'string') authMetadataPayload.full_name = body.full_name
    if (typeof body.designation === 'string') authMetadataPayload.designation = body.designation
    if (typeof body.department_name === 'string') authMetadataPayload.department_name = body.department_name
    if (typeof body.division === 'string') authMetadataPayload.division = body.division
    if (typeof body.status === 'string') authMetadataPayload.status = body.status
    authMetadataPayload.updated_by = callerData.user.id

    if (typeof body.mobile === 'string') {
      authMetadataPayload.mobile = body.mobile
      delete authMetadataPayload.phone
    }

    const authUpdate: {
      user_metadata: Record<string, unknown>
      phone?: string
    } = {
      user_metadata: authMetadataPayload,
    }

    // Clear auth.users.phone so Supabase does not enforce global phone uniqueness.
    if (typeof body.mobile === 'string') {
      authUpdate.phone = ''
    }

    const { error: authError } = await admin.auth.admin.updateUserById(body.user_id, authUpdate)

    if (authError) {
      console.error(`Auth metadata update failed for user ${body.user_id}: ${authError.message}`)
      return new Response(JSON.stringify({
        ok: true,
        warning: `Profile updated but auth sync failed: ${authError.message}`,
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error(`Auth update exception for user ${body.user_id}: ${message}`)
    return new Response(JSON.stringify({
      ok: true,
      warning: `Profile updated but auth sync failed: ${message}`,
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
})
