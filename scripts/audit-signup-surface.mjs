/**
 * Prove or disprove two things about account creation:
 *   1. Can a stranger with only the public anon key create an account?
 *   2. Are the unprotected user-creating edge functions actually deployed?
 *
 * The signup probe creates a throwaway user and deletes it again. Read-only
 * otherwise. Never run this against anything but our own project.
 */
import { createClient } from '@supabase/supabase-js';
import { loadDotEnv } from './load-env.mjs';

loadDotEnv();

const URL = process.env.VITE_SUPABASE_URL;
const ANON = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
const anon = createClient(URL, ANON, { auth: { persistSession: false } });
const admin = createClient(URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

console.log('== 1. public self-signup');
// Supabase rejects example.com outright as invalid, which masks whether signup is
// actually open, so probe on a domain we own where a bounce is harmless.
const probeEmail = `zz-signup-probe-${Date.now()}@vgg.tools`;
const { data: signUpData, error: signUpError } = await anon.auth.signUp({
  email: probeEmail,
  password: `Probe-${crypto.randomUUID()}`,
});

if (signUpError) {
  console.log(`   BLOCKED: ${signUpError.message}`);
} else {
  console.log(`   OPEN — anyone can create an account with just the anon key.`);
  console.log(`   created user id: ${signUpData.user?.id}`);
  console.log(`   session issued:  ${signUpData.session ? 'YES (immediately usable)' : 'no (needs confirmation)'}`);
  if (signUpData.user?.id) {
    const { error: delError } = await admin.auth.admin.deleteUser(signUpData.user.id);
    console.log(`   cleanup: ${delError ? `FAILED ${delError.message}` : 'probe user deleted'}`);
  }
}

console.log('\n== 2. edge function deployment (probed with the public anon key)');
for (const fn of ['create-admin-user', 'bulk-create-users', 'complete-profile', 'auth-email-hook']) {
  const res = await fetch(`${URL}/functions/v1/${fn}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${ANON}`, 'Content-Type': 'application/json' },
    body: '{}',
  });
  const body = (await res.text()).slice(0, 160).replace(/\s+/g, ' ');
  const verdict = res.status === 404
    ? 'NOT DEPLOYED'
    : res.status === 401
      ? 'deployed, rejects anon key (verify_jwt on)'
      : `deployed, REACHABLE with anon key (${res.status})`;
  console.log(`   ${fn.padEnd(20)} ${String(res.status).padEnd(5)} ${verdict}`);
  console.log(`   ${''.padEnd(20)}       body: ${body}`);
}
