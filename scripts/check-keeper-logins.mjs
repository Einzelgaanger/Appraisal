/**
 * Before deleting the legacy @peopleos.co duplicates, confirm the corporate account
 * we are keeping can actually be signed into — otherwise the cleanup locks someone out.
 *
 * Signs in to test but never calls signOut: a global sign-out would revoke everyone's
 * live sessions.
 */
import { createClient } from '@supabase/supabase-js';
import { loadDotEnv } from './load-env.mjs';

loadDotEnv();

const CANDIDATES = [
  process.env.DEMO_DEFAULT_PASSWORD || 'BoomEoDemo2026!',
  'GhcDemo2026!',
  'VigiPayDemo2026!',
];

// The corporate address we intend to keep for each of the four remaining duplicates.
const KEEPERS = [
  'omotola.akinyemiju@venturegardengroup.com',
  'adeosun.ayomide@venturegardengroup.com',
  'uche.ukonu@venturegardengroup.com',
  'kunmi.demuren@venturegardengroup.com',
];

const results = [];

for (const email of KEEPERS) {
  let working = null;
  for (const password of CANDIDATES) {
    const client = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_PUBLISHABLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data, error } = await client.auth.signInWithPassword({ email, password });
    if (!error && data.session) { working = password; break; }
  }
  results.push({ keeper: email, working_password: working ?? 'NONE OF THE KNOWN PASSWORDS' });
}

console.table(results);
