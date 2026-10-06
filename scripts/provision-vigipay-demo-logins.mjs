/**
 * Provision demo auth logins for a small set of VigiPay people so the tenant can be demoed.
 * Links each auth user to its real employee row via profiles.employee_id, which is what
 * current_employee_id() / ghc_me() resolve on, and marks the profile complete so the
 * ProfileCompletionGate does not intercept the session.
 *
 * Usage:  node scripts/provision-vigipay-demo-logins.mjs
 *         node scripts/provision-vigipay-demo-logins.mjs --revoke
 */
import { createClient } from '@supabase/supabase-js';
import { loadDotEnv } from './load-env.mjs';

loadDotEnv();

const PASSWORD = 'VigiPayDemo2026!';
const hosted = /supabase\.co/i.test(process.env.VITE_SUPABASE_URL || '');
if (hosted && !process.argv.includes('--revoke')) {
  console.error('Refusing to stamp the shared VigiPay password on the hosted project.');
  console.error('People on that password are asked to choose their own the next time they sign in.');
  process.exit(1);
}
const TARGETS = ['Oluseyi Oluwabusola', 'Lawal Abdulateef', 'Marcia Cole'];
const revoke = process.argv.includes('--revoke');

const admin = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const { data: emps, error } = await admin
  .from('employees')
  .select('id,name,email,role,department,subsidiary_id,hierarchy_level,company_admin')
  .eq('locked_tenant_slug', 'vigipay')
  .in('name', TARGETS);
if (error) throw error;

const { data: listed } = await admin.auth.admin.listUsers({ perPage: 1000 });
const authByEmail = new Map((listed?.users ?? []).map((u) => [u.email?.toLowerCase(), u]));

const results = [];

for (const emp of emps ?? []) {
  const email = (emp.email || '').trim().toLowerCase();
  if (!email) {
    console.log(`SKIP ${emp.name}: no email on the employee row`);
    continue;
  }

  if (revoke) {
    const user = authByEmail.get(email);
    if (!user) {
      console.log(`REVOKE ${email}: no auth user`);
      continue;
    }
    await admin.from('profiles').delete().eq('id', user.id);
    const { error: dErr } = await admin.auth.admin.deleteUser(user.id);
    console.log(dErr ? `REVOKE FAIL ${email}: ${dErr.message}` : `REVOKED ${email}`);
    continue;
  }

  let user = authByEmail.get(email);
  if (user) {
    const { error: pErr } = await admin.auth.admin.updateUserById(user.id, {
      password: PASSWORD,
      email_confirm: true,
    });
    if (pErr) {
      console.error(`PASSWORD FAIL ${email}: ${pErr.message}`);
      continue;
    }
    console.log(`RESET password ${email}`);
  } else {
    const { data: created, error: cErr } = await admin.auth.admin.createUser({
      email,
      password: PASSWORD,
      email_confirm: true,
      user_metadata: { name: emp.name, full_name: emp.name },
    });
    if (cErr) {
      console.error(`CREATE FAIL ${email}: ${cErr.message}`);
      continue;
    }
    user = created.user;
    console.log(`CREATED auth user ${email}`);
  }

  const profileRow = {
    id: user.id,
    employee_id: emp.id,
    email,
    name: emp.name,
    role: emp.role,
    department: emp.department,
    subsidiary_id: emp.subsidiary_id,
    hierarchy_level: emp.hierarchy_level,
    profile_completed: true,
    profile_completed_at: new Date().toISOString(),
  };
  const { error: upErr } = await admin.from('profiles').upsert(profileRow, { onConflict: 'id' });
  if (upErr) {
    console.error(`PROFILE FAIL ${email}: ${upErr.message}`);
    continue;
  }
  console.log(`LINKED profile ${email} -> employee ${emp.id}`);

  results.push({ name: emp.name, email, role: emp.role, admin: !!emp.company_admin });
}

if (!revoke) {
  console.log('\n=== VIGIPAY DEMO LOGINS ===');
  console.log(`password for all: ${PASSWORD}\n`);
  for (const r of results) {
    console.log(`${r.name.padEnd(22)} ${r.email.padEnd(45)} ${r.admin ? '[COMPANY ADMIN] ' : ''}${r.role}`);
  }
  console.log('\nSign in at /login?tenant=vigipay');
}
