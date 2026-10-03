import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-user-jwt',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function esc(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function buildEmailHtml(opts: {
  planCode: string
  plannedFrom: string
  plannedTo: string
  venue: string
  chairperson: string
  agenda: Array<{ letter: string; title: string; remarks: string }>
}): string {
  const rows = opts.agenda
    .map(
      (a) =>
        `<tr><td style="padding:6px 8px;border:1px solid #78716c;width:28px;text-align:center;font-weight:600;">${esc(a.letter)})</td><td style="padding:6px 8px;border:1px solid #78716c;">${esc(a.title)}${a.remarks ? `<div style="color:#78716c;font-size:12px;margin-top:4px;">${esc(a.remarks)}</div>` : ''}</td></tr>`,
    )
    .join('')

  return `<!doctype html>
<html><body style="font-family:Segoe UI,Arial,sans-serif;color:#1c1917;line-height:1.45;">
  <h2 style="margin:0 0 8px;">Management Review Meeting — Agenda</h2>
  <p style="margin:0 0 12px;color:#57534e;font-size:13px;">ISO/IEC 17025 Clause 8.9.2 · Plan <strong>${esc(opts.planCode)}</strong></p>
  <p style="margin:0 0 4px;font-size:13px;"><strong>Dates:</strong> ${esc(opts.plannedFrom)} – ${esc(opts.plannedTo)}</p>
  <p style="margin:0 0 4px;font-size:13px;"><strong>Venue:</strong> ${esc(opts.venue || '—')}</p>
  <p style="margin:0 0 16px;font-size:13px;"><strong>Chairperson:</strong> ${esc(opts.chairperson || '—')}</p>
  <table style="border-collapse:collapse;width:100%;font-size:13px;">
    <thead>
      <tr>
        <th style="background:#292524;color:#fde68a;text-align:left;padding:6px 8px;border:1px solid #78716c;">Ref</th>
        <th style="background:#292524;color:#fde68a;text-align:left;padding:6px 8px;border:1px solid #78716c;">Agenda point</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>
  <p style="margin-top:16px;font-size:12px;color:#78716c;">Please review the agenda before the meeting. Contact laboratory management with any questions.</p>
</body></html>`
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
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
  const resendKey = Deno.env.get('RESEND_API_KEY')
  const emailFrom = Deno.env.get('MRM_EMAIL_FROM') ?? Deno.env.get('RESEND_FROM_EMAIL') ?? ''

  if (!url || !serviceRoleKey) {
    return new Response(JSON.stringify({ error: 'Missing SUPABASE_URL or SERVICE_ROLE_KEY secret' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  if (!resendKey) {
    return new Response(
      JSON.stringify({
        error:
          'Email service not configured. Set RESEND_API_KEY (and optionally MRM_EMAIL_FROM) in Edge Function secrets. Recipients remain saved in the plan.',
      }),
      {
        status: 503,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    )
  }

  if (!emailFrom) {
    return new Response(
      JSON.stringify({
        error: 'Missing MRM_EMAIL_FROM (or RESEND_FROM_EMAIL) secret for the From address.',
      }),
      {
        status: 503,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    )
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

  let body: { planId?: string } = {}
  try {
    body = (await req.json()) as { planId?: string }
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const planId = String(body.planId ?? '').trim()
  if (!planId) {
    return new Response(JSON.stringify({ error: 'planId is required' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const { data: plan, error: planError } = await admin
    .from('mrm_plans')
    .select('*')
    .eq('id', planId)
    .maybeSingle()

  if (planError || !plan) {
    return new Response(JSON.stringify({ error: planError?.message || 'Plan not found' }), {
      status: 404,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const [{ data: agendaData, error: agendaError }, { data: recipData, error: recipError }] =
    await Promise.all([
      admin
        .from('mrm_agenda_items')
        .select('*')
        .eq('plan_id', planId)
        .eq('included', true)
        .order('sort_order', { ascending: true }),
      admin.from('mrm_plan_recipients').select('*').eq('plan_id', planId),
    ])

  if (agendaError) {
    return new Response(JSON.stringify({ error: agendaError.message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
  if (recipError) {
    return new Response(JSON.stringify({ error: recipError.message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const recipients = Array.isArray(recipData) ? recipData : []
  if (recipients.length === 0) {
    return new Response(JSON.stringify({ error: 'No recipients on this plan' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const agenda = (Array.isArray(agendaData) ? agendaData : []).map((row) => {
    const r = row as Record<string, unknown>
    return {
      letter: String(r.clause_letter ?? ''),
      title: String(r.title ?? ''),
      remarks: String(r.remarks ?? ''),
    }
  })

  const planRec = plan as Record<string, unknown>
  const html = buildEmailHtml({
    planCode: String(planRec.plan_code ?? ''),
    plannedFrom: String(planRec.planned_from ?? ''),
    plannedTo: String(planRec.planned_to ?? ''),
    venue: String(planRec.venue ?? ''),
    chairperson: String(planRec.chairperson ?? ''),
    agenda,
  })

  const subject = `MRM Agenda — ${String(planRec.plan_code ?? planId)}`

  let sent = 0
  let failed = 0
  const results: Array<{
    userId: string
    emailStatus: string
    emailError: string
    emailSentAt: string | null
  }> = []

  for (const raw of recipients) {
    const r = raw as Record<string, unknown>
    const recipientId = String(r.id ?? '')
    const userId = String(r.user_id ?? '')
    let email = String(r.email ?? '').trim()

    if (!email && userId) {
      try {
        const { data: authUser } = await admin.auth.admin.getUserById(userId)
        email = String(authUser?.user?.email ?? '').trim()
      } catch {
        // ignore lookup errors
      }
    }

    if (!email) {
      failed += 1
      const update = {
        email_status: 'skipped',
        email_error: 'No email address',
        email_sent_at: null as string | null,
      }
      await admin.from('mrm_plan_recipients').update(update).eq('id', recipientId)
      results.push({
        userId,
        emailStatus: 'skipped',
        emailError: 'No email address',
        emailSentAt: null,
      })
      continue
    }

    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${resendKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: emailFrom,
          to: [email],
          subject,
          html,
        }),
      })
      const payload = await res.json().catch(() => ({}))
      if (!res.ok) {
        const errMsg =
          typeof payload === 'object' && payload && 'message' in payload
            ? String((payload as { message?: unknown }).message)
            : `Resend error ${res.status}`
        failed += 1
        await admin
          .from('mrm_plan_recipients')
          .update({
            email,
            email_status: 'failed',
            email_error: errMsg.slice(0, 500),
            email_sent_at: null,
          })
          .eq('id', recipientId)
        results.push({
          userId,
          emailStatus: 'failed',
          emailError: errMsg.slice(0, 500),
          emailSentAt: null,
        })
        continue
      }

      const sentAt = new Date().toISOString()
      sent += 1
      await admin
        .from('mrm_plan_recipients')
        .update({
          email,
          email_status: 'sent',
          email_error: '',
          email_sent_at: sentAt,
        })
        .eq('id', recipientId)
      results.push({
        userId,
        emailStatus: 'sent',
        emailError: '',
        emailSentAt: sentAt,
      })
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : 'Send failed'
      failed += 1
      await admin
        .from('mrm_plan_recipients')
        .update({
          email,
          email_status: 'failed',
          email_error: errMsg.slice(0, 500),
          email_sent_at: null,
        })
        .eq('id', recipientId)
      results.push({
        userId,
        emailStatus: 'failed',
        emailError: errMsg.slice(0, 500),
        emailSentAt: null,
      })
    }
  }

  if (sent > 0) {
    await admin
      .from('mrm_plans')
      .update({
        status: 'communicated',
        communicated_at: new Date().toISOString(),
      })
      .eq('id', planId)
  }

  return new Response(
    JSON.stringify({
      sent,
      failed,
      recipients: results,
    }),
    {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    },
  )
})
