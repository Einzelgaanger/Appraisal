/**
 * Work out which known demo password each GHC account actually accepts.
 * Signs in to test, but never calls signOut — a global sign-out would revoke
 * everyone's live sessions.
 *
 * Usage: node scripts/verify-ghc-passwords.mjs
 */
import { createClient } from '@supabase/supabase-js';
import { loadDotEnv } from './load-env.mjs';

loadDotEnv();

const CANDIDATES = [
  'GhcDemo2026!',
  process.env.DEMO_DEFAULT_PASSWORD || 'BoomEoDemo2026!',
  'VigiPayDemo2026!',
];

const admin = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const { data: roster } = await admin
  .from('employees')
  .select('name,email,ghc_hierarchy_level,role')
  .eq('ghc_appraisal_active', true)
  .order('ghc_hierarchy_level')
  .order('name');

const results = [];
for (const e of roster ?? []) {
  const email = (e.email || '').trim().toLowerCase();
  if (!email) continue;

  let hit = null;
  let lastErr = '';
  for (const password of CANDIDATES) {
    const c = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_PUBLISHABLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { error } = await c.auth.signInWithPassword({ email, password });
    if (!error) {
      hit = password;
      break;
    }
    lastErr = error.message;
  }
  results.push({ name: e.name, email, level: e.ghc_hierarchy_level, role: e.role, password: hit, lastErr });
  console.log(`${hit ? 'OK  ' : 'FAIL'} ${e.name.padEnd(24)} ${email.padEnd(44)} ${hit ?? `(none of the known passwords — ${lastErr})`}`);
}

console.log('\n=== GHC LOGINS ===');
for (const r of results) {
  console.log(`${r.name.padEnd(22)} L${r.level}  ${r.email.padEnd(44)} ${r.password ?? 'UNKNOWN'}`);
}
