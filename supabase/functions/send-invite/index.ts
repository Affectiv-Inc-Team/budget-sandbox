// send-invite — owner-delegated team invitation with automatic email.
//
// Two-client design keeps all authorization in SQL:
//  1. A USER-SCOPED client (anon key + the caller's Authorization header) calls
//     the create_invite RPC — the tier rule, scope rule, and membership check
//     run in Postgres AS THE CALLER. This TypeScript layer adds no trust.
//  2. A SERVICE-ROLE client sends the activation email:
//     auth.admin.inviteUserByEmail() for brand-new users (creates the auth user
//     in invited state; handle_new_user applies the pending org role set in
//     step 1; the auth-email-hook renders the existing InviteEmail template),
//     falling back to resetPasswordForEmail() when the email is already
//     registered (Recovery template) — that is also the resend path.
//
// Both links land on /reset-password, which accepts any authenticated session.

import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
}

const SITE_URL = Deno.env.get('SITE_URL') ?? 'https://budget.intrinsic.agency'
const REDIRECT_TO = `${SITE_URL}/reset-password`

function json(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }
  if (req.method !== 'POST') {
    return json(405, { error: 'method not allowed' })
  }

  const authHeader = req.headers.get('Authorization')
  if (!authHeader) {
    return json(401, { error: 'missing authorization header' })
  }

  let body: {
    company_id?: string
    email?: string
    org_role?: string
    service_line_scope?: string | null
  }
  try {
    body = await req.json()
  } catch {
    return json(400, { error: 'invalid JSON body' })
  }

  const companyId = body.company_id
  const email = body.email?.trim().toLowerCase()
  const orgRole = body.org_role
  const scope = body.service_line_scope ?? null

  if (!companyId || !email || !orgRole) {
    return json(400, { error: 'company_id, email, and org_role are required' })
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

  // 1. Create the invite AS THE CALLER — SQL enforces tier/scope/membership.
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const { data: inviteId, error: rpcError } = await userClient.rpc('create_invite', {
    p_company_id: companyId,
    p_email: email,
    p_org_role: orgRole,
    p_service_line_scope: scope,
  })

  if (rpcError) {
    // 42501 = insufficient_privilege (tier rule / membership), 22023 = bad input
    const status = rpcError.code === '42501' ? 403 : 400
    return json(status, { error: rpcError.message })
  }

  // 2. Send the activation email with the service role.
  const adminClient = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  let emailAction = 'invite'
  let emailError: string | null = null

  const { error: inviteErr } = await adminClient.auth.admin.inviteUserByEmail(email, {
    redirectTo: REDIRECT_TO,
  })

  if (inviteErr) {
    const alreadyRegistered =
      inviteErr.code === 'email_exists' ||
      /already.*(registered|exists)/i.test(inviteErr.message ?? '')

    if (alreadyRegistered) {
      // Existing account (or resend): recovery email lands on the same page.
      emailAction = 'recovery'
      const { error: recoveryErr } = await adminClient.auth.resetPasswordForEmail(email, {
        redirectTo: REDIRECT_TO,
      })
      if (recoveryErr) emailError = recoveryErr.message
    } else {
      emailError = inviteErr.message
    }
  }

  // 3. Record the outcome on the invite row (service role bypasses RLS).
  const { error: statusErr } = await adminClient
    .from('invites')
    .update(
      emailError
        ? { status: 'failed' }
        : { status: 'sent', email_sent_at: new Date().toISOString() },
    )
    .eq('id', inviteId)
  if (statusErr) console.error('invite status update failed:', statusErr.message)

  if (emailError) {
    console.error('invite email failed:', emailError)
    return json(502, {
      error: `invite recorded but the email failed to send: ${emailError}`,
      invite_id: inviteId,
    })
  }

  return json(200, { invite_id: inviteId, email_action: emailAction })
})
