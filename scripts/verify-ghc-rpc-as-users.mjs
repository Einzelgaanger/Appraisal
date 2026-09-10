/**
 * Call ghc_get_my_tasks as each profile-linked GHC user (service role creates a short-lived session).
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';

function loadEnv() {
  const env = {};
  for (const line of readFileSync('.env', 'utf8').split(/\r?\n/)) {
    if (!line || line.startsWith('#') || !line.includes('=')) continue;
    const i = line.indexOf('=');
    const k = line.slice(0, i).trim();
    let v = line.slice(i + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    env[k] = v;
  }
  return env;
}

const env = loadEnv();
const admin = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const { data: active } = await admin
  .from('employees')
  .select('id,name,email')
  .eq('ghc_appraisal_active', true);

const { data: profiles } = await admin.from('profiles').select('id,email,employee_id,name');

const month = new Date().toISOString().slice(0, 7);
const q = (() => {
  const d = new Date();
  const qn = Math.floor(d.getMonth() / 3) + 1;
  return `${d.getFullYear()}-Q${qn}`;
})();

console.log('Period', month, q);

for (const emp of active ?? []) {
  const profile = (profiles ?? []).find((p) => p.employee_id === emp.id);
  if (!profile) {
    console.log(`\n${emp.name}: NO PROFILE/LOGIN — skip live RPC`);
    continue;
  }

  const { data: link, error: linkErr } = await admin.auth.admin.generateLink({
    type: 'magiclink',
    email: profile.email,
  });
  if (linkErr) {
    console.log(`\n${emp.name}: generateLink failed`, linkErr.message);
    continue;
  }

  const hashed = link?.properties?.hashed_token;
  const anon = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_PUBLISHABLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  let sessionOk = false;
  if (hashed) {
    const { data: verified, error: vErr } = await anon.auth.verifyOtp({
      token_hash: hashed,
      type: 'magiclink',
    });
    if (vErr) {
      console.log(`\n${emp.name}: verifyOtp failed`, vErr.message);
    } else {
      sessionOk = !!verified.session;
    }
  }

  if (!sessionOk) {
    console.log(`\n${emp.name}: could not establish session`);
    continue;
  }

  const { data: me, error: meErr } = await anon.rpc('ghc_me');
  const { data: tasks, error: tErr } = await anon.rpc('ghc_get_my_tasks', {
    _period_month: month,
    _period_quarter: q,
  });

  const list = Array.isArray(tasks) ? tasks : [];
  const byKind = list.reduce((acc, t) => {
    acc[t.kind] = (acc[t.kind] || 0) + 1;
    return acc;
  }, {});

  console.log(`\n${emp.name} (${profile.email})`);
  console.log(`  ghc_me=${me}${meErr ? ` ERR ${meErr.message}` : ''}`);
  console.log(`  tasks=${list.length}${tErr ? ` ERR ${tErr.message}` : ''} kinds=${JSON.stringify(byKind)}`);
  if (list.length && list.length <= 12) {
    for (const t of list) console.log(`    - ${t.kind}: ${t.subject_name} [${t.status}]`);
  } else if (list.length) {
    for (const t of list.filter((x) => x.kind !== 'peer_360')) {
      console.log(`    - ${t.kind}: ${t.subject_name} [${t.status}]`);
    }
    console.log(`    - peer_360 x${byKind.peer_360 || 0}`);
  }

  await anon.auth.signOut();
}
