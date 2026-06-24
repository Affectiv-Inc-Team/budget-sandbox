import { createClient } from '@supabase/supabase-js';
import posthog from './lib/posthog.js';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY =
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ─── Config persistence ───────────────────────────────────────────────────────
// The v2 config blob is split across rows in `companies`. Each company gets its
// own row: { id, name, archived, config: { shared, serviceLines } }.
// UI navigation state (selectedCompanyId, selectedServiceLineId) is NOT persisted
// to Supabase — it's derived client-side on load (default to first company).

/**
 * Load all companies the current user has access to.
 * Returns them shaped as a v2 config blob so FinancialTool.jsx needs no changes.
 */
export async function loadConfig() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return null;

  const { data, error } = await supabase
    .from('companies')
    .select('id, name, archived, config')
    .order('created_at', { ascending: true });

  if (error) {
    console.error('loadConfig error:', error);
    posthog.captureException(error, { endpoint: 'loadConfig', error_code: error.code });
    posthog.capture('config_load_failed', { error_message: error.message, error_code: error.code });
    return null;
  }

  if (!data || data.length === 0) return null;

  const companies = data.map(row => ({
    id: row.id,
    name: row.name,
    archived: row.archived,
    shared: row.config.shared ?? {},
    serviceLines: row.config.serviceLines ?? [],
  }));

  return {
    version: 2,
    selectedCompanyId: companies[0].id,
    selectedServiceLineId: null,
    companies,
  };
}

/**
 * Load the current user's profile row from `profiles`.
 * Returns null if not signed in or row missing.
 * Note: `role` column is Track B — will be undefined until then.
 */
export async function getProfile() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return null;
  const { data } = await supabase
    .from('profiles')
    .select('id, email, is_super_admin, role')
    .eq('id', session.user.id)
    .single();
  return data ?? null;
}

/**
 * Save the full v2 config blob back to Supabase.
 * Upserts each company row individually.
 */
export async function saveConfig(config) {
  if (!config?.companies) return false;

  const rows = config.companies.map(co => ({
    id: co.id,
    name: co.name,
    archived: co.archived ?? false,
    config: {
      shared: co.shared,
      serviceLines: co.serviceLines,
    },
  }));

  const { error } = await supabase
    .from('companies')
    .upsert(rows, { onConflict: 'id' });

  if (error) {
    console.error('saveConfig error:', error);
    posthog.captureException(error, { endpoint: 'saveConfig', error_code: error.code });
    return false;
  }

  return true;
}
