import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-user-jwt',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

type ResetPasswordBody = {
  user_id?: string
  email?: string
  redirect_to?: string
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

  const body = (await req.json().catch(() => null)) as ResetPasswordBody | null
  if (!body?.email && !body?.user_id) {
    return new Response(JSON.stringify({ error: 'email or user_id is required' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  let email = String(body.email ?? '').trim()

  if (!email && body?.user_id) {
    const { data: userData, error: userError } = await admin.auth.admin.getUserById(String(body.user_id))
    if (userError || !userData?.user?.email) {
      return new Response(JSON.stringify({ error: userError?.message ?? 'Unable to resolve user email' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    email = userData.user.email
  }

  const redirectTo = typeof body?.redirect_to === 'string' ? body.redirect_to : undefined

  const { error: resetError } = await admin.auth.resetPasswordForEmail(email, {
    ...(redirectTo ? { redirectTo } : {}),
  })

  if (resetError) {
    return new Response(JSON.stringify({ error: resetError.message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
})
