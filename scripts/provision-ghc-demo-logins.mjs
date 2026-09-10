/**
 * Provision demo auth logins for every active GHC employee missing a profile.
 * Password for all new accounts: GhcDemo2026!
 *
 * Usage: node scripts/provision-ghc-demo-logins.mjs
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

const DEMO_PASSWORD = 'GhcDemo2026!';
const env = loadEnv();
const admin = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const { data: active, error: aErr } = await admin
  .from('employees')
  .select('id,name,email')
  .eq('ghc_appraisal_active', true)
  .order('name');
if (aErr) throw aErr;

const { data: profiles } = await admin.from('profiles').select('id,email,employee_id');
const byEmployee = new Map((profiles ?? []).filter((p) => p.employee_id).map((p) => [p.employee_id, p]));

const { data: listUsers } = await admin.auth.admin.listUsers({ perPage: 1000 });
const usersByEmail = new Map((listUsers?.users ?? []).map((u) => [u.email?.toLowerCase(), u]));

const credentials = [];

for (const emp of active ?? []) {
  const email = (emp.email || '').trim().toLowerCase();
  if (!email) {
    console.log(`SKIP ${emp.name}: no email`);
    continue;
  }

  const existingProfile = byEmployee.get(emp.id);
  if (existingProfile) {
    credentials.push({
      name: emp.name,
      email: existingProfile.email || email,
      password: '(existing login — use your normal password)',
      status: 'already_linked',
    });
    continue;
  }

  let user = usersByEmail.get(email);
  if (!user) {
    const { data: created, error: cErr } = await admin.auth.admin.createUser({
      email,
      password: DEMO_PASSWORD,
      email_confirm: true,
      user_metadata: { name: emp.name, full_name: emp.name },
    });
    if (cErr) {
      console.error(`CREATE FAIL ${emp.name} ${email}:`, cErr.message);
      continue;
    }
    user = created.user;
    console.log(`CREATED auth user ${email}`);
  } else {
    const { error: pwErr } = await admin.auth.admin.updateUserById(user.id, {
      password: DEMO_PASSWORD,
      email_confirm: true,
    });
    if (pwErr) console.warn(`password update warn ${email}:`, pwErr.message);
    else console.log(`RESET password ${email}`);
  }

  const { data: existingProf } = await admin.from('profiles').select('*').eq('id', user.id).maybeSingle();
  if (existingProf) {
    const { error: uErr } = await admin
      .from('profiles')
      .update({ employee_id: emp.id, email, name: emp.name })
      .eq('id', user.id);
    if (uErr) console.error(`profile update fail ${email}:`, uErr.message);
    else console.log(`LINKED profile ${email} → ${emp.id}`);
  } else {
    const { error: iErr } = await admin.from('profiles').insert({
      id: user.id,
      email,
      name: emp.name,
      employee_id: emp.id,
    });
    if (iErr) console.error(`profile insert fail ${email}:`, iErr.message);
    else console.log(`INSERTED profile ${email} → ${emp.id}`);
  }

  credentials.push({
    name: emp.name,
    email,
    password: DEMO_PASSWORD,
    status: 'provisioned',
  });
}

console.log('\n=== GHC DEMO LOGINS ===');
for (const c of credentials) {
  console.log(`${c.name.padEnd(24)} ${c.email.padEnd(45)} ${c.password}`);
}
console.log('\nOpen: http://localhost:8080/hub?tenant=ghc&tab=survey');
