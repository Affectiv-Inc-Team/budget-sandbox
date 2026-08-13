// admin-reset-password — lets an Intrinsic super admin or a company admin
// reset a member's password.
//
// Authorization runs in SQL: can_reset_member_password(email) is called with a
// USER-SCOPED client, so this layer adds no trust. Super admins may reset
// anyone; company admins may reset people who have access to a company they
// administer, but never another super admin.
//
// mode = "temp"  -> generate a one-time password, set it, flag the account so
//                   the user must change it at next sign-in, return it once.
// mode = "email" -> send the scanner-safe recovery email (same pipeline the
//                   login page uses).

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

function normalizeEmail(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const email = value.trim().toLowerCase()
  if (email.length > 320) return null
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null
  return email
}

// Readable but high-entropy: 3 groups of 4 from an unambiguous alphabet
// (~62 bits). Avoids 0/O/1/l/I so it can be read aloud over the phone.
function generateTempPassword(): string {
  const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789'
  const bytes = new Uint32Array(12)
  crypto.getRandomValues(bytes)
  const chars = Array.from(bytes, (b) => alphabet[b % alphabet.length])
  return `${chars.slice(0, 4).join('')}-${chars.slice(4, 8).join('')}-${chars.slice(8, 12).join('')}`
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json(405, { error: 'method not allowed' })

  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return json(401, { error: 'missing authorization header' })

  let body: { email?: unknown; mode?: unknown; company_id?: unknown }
  try {
    body = await req.json()
  } catch {
    return json(400, { error: 'invalid JSON body' })
  }

  const email = normalizeEmail(body.email)
  const mode = body.mode === 'email' ? 'email' : body.mode === 'temp' ? 'temp' : null
  const companyId =
    typeof body.company_id === 'string' && body.company_id.trim() ? body.company_id.trim() : null

  if (!email) return json(400, { error: 'A valid email is required' })
  if (!mode) return json(400, { error: 'mode must be "temp" or "email"' })

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? Deno.env.get('SUPABASE_PUBLISHABLE_KEY')!
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const { data: actorData, error: actorErr } = await userClient.auth.getUser()
  const actor = actorData?.user
  if (actorErr || !actor) return json(401, { error: 'not signed in' })

  const { data: allowed, error: permErr } = await userClient.rpc('can_reset_member_password', {
    p_email: email,
  })
  if (permErr) {
    console.error('permission check failed:', permErr.message)
    return json(500, { error: 'Unable to verify permissions' })
  }
  if (allowed !== true) {
    return json(403, { error: 'You are not allowed to reset this user’s password.' })
  }

  const adminClient = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  async function log(status: string, action: string, errorMessage: string | null) {
    try {
      await adminClient.from('invite_email_log').insert({
        email,
        company_id: companyId,
        kind: 'password_reset',
        email_action: action,
        status,
        error_message: errorMessage,
        triggered_by: actor.id,
        triggered_by_email: actor.email ?? null,
      })
    } catch (e) {
      console.error('invite_email_log insert failed:', e)
    }
  }

  if (mode === 'email') {
    const { error } = await adminClient.auth.resetPasswordForEmail(email, {
      redirectTo: REDIRECT_TO,
    })
    if (error) {
      await log('failed', 'recovery', error.message)
      return json(502, { error: `Reset email failed to send: ${error.message}` })
    }
    await log('sent', 'recovery', null)
    return json(200, { ok: true, mode: 'email' })
  }

  // mode === "temp": find the auth user, set a one-time password.
  let userId: string | null = null
  let page = 1
  while (page <= 20 && !userId) {
    const { data, error } = await adminClient.auth.admin.listUsers({ page, perPage: 200 })
    if (error) {
      console.error('listUsers failed:', error.message)
      return json(500, { error: 'Unable to look up that account' })
    }
    const match = data.users.find((u) => (u.email ?? '').toLowerCase() === email)
    if (match) userId = match.id
    if (data.users.length < 200) break
    page += 1
  }

  if (!userId) {
    await log('skipped', 'temp_password', 'no account yet')
    return json(404, {
      error: 'That person has not created an account yet — send them a setup link instead.',
    })
  }

  const tempPassword = generateTempPassword()
  const { error: updateErr } = await adminClient.auth.admin.updateUserById(userId, {
    password: tempPassword,
    email_confirm: true,
    user_metadata: { must_change_password: true },
  })

  if (updateErr) {
    await log('failed', 'temp_password', updateErr.message)
    return json(502, { error: `Could not set a temporary password: ${updateErr.message}` })
  }

  await log('sent', 'temp_password', null)
  return json(200, { ok: true, mode: 'temp', tempPassword })
})
