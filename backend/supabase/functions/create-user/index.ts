import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-user-jwt',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

type CreateUserBody = {
  email: string
  password: string
  full_name: string
  mobile: string
  designation: string
  department_name?: string
  division?: string
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

  const body = (await req.json().catch(() => null)) as CreateUserBody | null
  if (!body?.email || !body?.password) {
    return new Response(JSON.stringify({ error: 'email and password are required' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const mobileRaw = body.mobile ?? ''

  // Mobile is stored only in user_profiles + user_metadata (not auth.users.phone).
  // Supabase Auth enforces globally unique phone numbers; email remains the only unique login identifier.
  const { data, error } = await admin.auth.admin.createUser({
    email: body.email,
    password: body.password,
    email_confirm: true,
    user_metadata: {
      full_name: body.full_name ?? '',
      mobile: mobileRaw,
      designation: body.designation ?? '',
      department_name: body.department_name ?? '',
      division: body.division ?? '',
      status: body.status ?? 'Active',
      created_by: callerData.user.id,
    },
  })

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const userId = data.user?.id
  if (userId) {
    const { error: profileError } = await admin
      .from('user_profiles')
      .upsert(
        {
          id: userId,
          email: body.email,
          full_name: body.full_name ?? '',
          mobile: mobileRaw,
          designation: body.designation ?? '',
          department_name: body.department_name ?? '',
          division: body.division ?? '',
          status: body.status ?? 'Active',
        },
        { onConflict: 'id' },
      )

    if (profileError) {
      return new Response(JSON.stringify({ error: profileError.message }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
  }

  return new Response(JSON.stringify({ user: data.user }), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
})
