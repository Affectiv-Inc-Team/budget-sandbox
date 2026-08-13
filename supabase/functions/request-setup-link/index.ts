import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors'
import { createClient } from 'npm:@supabase/supabase-js@2'

const FALLBACK_REDIRECT = 'https://budget.intrinsic.agency/reset-password'
const ALLOWED_REDIRECT_HOSTS = new Set([
  'budget.intrinsic.agency',
  'budget-playpen.lovable.app',
  'id-preview--7db2dc1b-e5a4-491b-8649-4765fdf3cf96.lovable.app',
  'localhost',
])

type RequestBody = {
  email?: unknown
  redirectTo?: unknown
  companyId?: unknown
}

type LogEntry = {
  email: string
  company_id: string | null
  kind: string
  email_action?: string | null
  status: string
  error_message?: string | null
  triggered_by?: string | null
  triggered_by_email?: string | null
}

// Best-effort audit row — never block or fail the send because logging failed.
async function logAttempt(admin: ReturnType<typeof createClient>, entry: LogEntry) {
  try {
    const { error } = await admin.from('invite_email_log').insert(entry)
    if (error) console.error('invite_email_log insert failed', error.message)
  } catch (e) {
    console.error('invite_email_log insert threw', e)
  }
}

function jsonResponse(body: Record<string, unknown>, status = 200) {
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

function retryAfterSeconds(message: string): number | null {
  const match = message.match(/after\s+(\d+)\s+seconds?/i)
  return match ? Number(match[1]) : null
}

function safeRedirect(value: unknown): string {
  if (typeof value !== 'string') return FALLBACK_REDIRECT

  try {
    const url = new URL(value)
    const isLocalhost = url.hostname === 'localhost'
    const isAllowedHost = ALLOWED_REDIRECT_HOSTS.has(url.hostname)
    const isHttps = url.protocol === 'https:'
    const isLocalDev = isLocalhost && url.protocol === 'http:'

    if ((isHttps || isLocalDev) && isAllowedHost && url.pathname === '/reset-password') {
      return url.toString()
    }
  } catch {
    // Fall through to the safe production URL.
  }

  return FALLBACK_REDIRECT
}

async function sendRecoveryLink(
  supabaseUrl: string,
  anonKey: string,
  email: string,
  redirectTo: string,
) {
  const publicClient = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  return publicClient.auth.resetPasswordForEmail(email, { redirectTo })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405)
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? Deno.env.get('SUPABASE_PUBLISHABLE_KEY')

  if (!supabaseUrl || !serviceRoleKey || !anonKey) {
    console.error('Missing setup-link environment variables')
    return jsonResponse({ error: 'Server configuration error' }, 500)
  }

  let body: RequestBody
  try {
    body = await req.json()
  } catch {
    return jsonResponse({ error: 'Invalid request body' }, 400)
  }

  const email = normalizeEmail(body.email)
  if (!email) {
    return jsonResponse({ error: 'A valid email is required' }, 400)
  }

  const redirectTo = safeRedirect(body.redirectTo)
  const companyId = typeof body.companyId === 'string' && body.companyId.trim() ? body.companyId.trim() : null
  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  // Who triggered this resend (the signed-in admin, if any).
  let actorId: string | null = null
  let actorEmail: string | null = null
  const authHeader = req.headers.get('Authorization')
  if (authHeader) {
    try {
      const token = authHeader.replace(/^Bearer\s+/i, '')
      const { data: userData } = await adminClient.auth.getUser(token)
      actorId = userData?.user?.id ?? null
      actorEmail = userData?.user?.email ?? null
    } catch {
      // Anonymous / self-service request from the login page.
    }
  }
  const base = {
    email,
    company_id: companyId,
    kind: 'resend',
    triggered_by: actorId,
    triggered_by_email: actorEmail ?? (actorId ? null : 'self-service'),
  }

  const { data: licenseeRows, error: licenseeError } = await adminClient
    .from('licensees')
    .select('id, name')
    .ilike('name', email)
    .limit(1)

  if (licenseeError) {
    console.error('Failed to check provisioned licensee', { error: licenseeError.message })
    return jsonResponse({ error: 'Unable to send setup link' }, 500)
  }

  const isProvisionedLicensee = (licenseeRows ?? []).some(
    (row) => typeof row.name === 'string' && row.name.trim().toLowerCase() === email,
  )

  if (!isProvisionedLicensee) {
    console.warn('Setup link requested for unassigned email', { email, redirectTo })
    await logAttempt(adminClient, { ...base, status: 'skipped', error_message: 'not provisioned' })
    return jsonResponse({ ok: false, reason: 'not_provisioned' })
  }

  const { error: inviteError } = await adminClient.auth.admin.inviteUserByEmail(email, {
    redirectTo,
  })

  if (!inviteError) {
    console.log('Sent pending-user invite link', { email, redirectTo })
    await logAttempt(adminClient, { ...base, email_action: 'invite', status: 'sent' })
    return jsonResponse({ ok: true })
  }

  console.warn('Invite link failed; trying recovery fallback', {
    email,
    error: inviteError.message,
  })

  const { error: recoveryError } = await sendRecoveryLink(supabaseUrl, anonKey, email, redirectTo)
  if (recoveryError) {
    const waitSeconds = retryAfterSeconds(recoveryError.message)
    if (waitSeconds !== null) {
      console.warn('Setup email rate limited', { email, waitSeconds })
      await logAttempt(adminClient, {
        ...base,
        email_action: 'recovery',
        status: 'skipped',
        error_message: `rate limited; retry after ${waitSeconds} seconds`,
      })
      return jsonResponse({
        ok: false,
        reason: 'rate_limited',
        retryAfterSeconds: waitSeconds,
      })
    }

    console.error('Recovery link failed', { email, error: recoveryError.message })
    await logAttempt(adminClient, {
      ...base, email_action: 'recovery', status: 'failed', error_message: recoveryError.message,
    })
    return jsonResponse({ error: 'Unable to send setup link' }, 500)
  }

  console.log('Requested recovery/setup link', { email, redirectTo, isProvisionedLicensee })
  await logAttempt(adminClient, { ...base, email_action: 'recovery', status: 'sent' })
  return jsonResponse({ ok: true, emailAction: 'recovery' })
})