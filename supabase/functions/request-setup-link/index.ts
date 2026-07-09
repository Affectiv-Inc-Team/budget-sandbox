import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors'
import { createClient } from 'npm:@supabase/supabase-js@2'

const FALLBACK_REDIRECT = 'https://budget.intrinsic.agency/reset-password'
const ALLOWED_REDIRECT_HOSTS = new Set([
  'budget.intrinsic.agency',
  'budget-playpen.lovable.app',
  'localhost',
])

type RequestBody = {
  email?: unknown
  redirectTo?: unknown
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
  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

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

  if (isProvisionedLicensee) {
    const { error: inviteError } = await adminClient.auth.admin.inviteUserByEmail(email, {
      redirectTo,
    })

    if (!inviteError) {
      console.log('Sent pending-user invite link', { email, redirectTo })
      return jsonResponse({ ok: true })
    }

    console.warn('Invite link failed; trying recovery fallback', {
      email,
      error: inviteError.message,
    })
  }

  const { error: recoveryError } = await sendRecoveryLink(supabaseUrl, anonKey, email, redirectTo)
  if (recoveryError) {
    console.error('Recovery link failed', { email, error: recoveryError.message })
    return jsonResponse({ error: 'Unable to send setup link' }, 500)
  }

  console.log('Requested recovery/setup link', { email, redirectTo, isProvisionedLicensee })
  return jsonResponse({ ok: true })
})