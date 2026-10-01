/**
 * Ensure every roster employee with an email has a Supabase Auth login (email provider)
 * so password reset works — without changing passwords on existing accounts.
 *
 *   npm run ensure:employee-auth           # report only
 *   npm run ensure:employee-auth -- --apply  # create missing + link profiles
 *
 * Requires SUPABASE_URL (or VITE_SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY in .env
 */

import { createClient } from '@supabase/supabase-js';
import { randomBytes } from 'crypto';
import { loadDotEnv } from './load-env.mjs';

loadDotEnv();

const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const apply = process.argv.includes('--apply');

if (!url || !serviceKey) {
  console.error('Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in .env');
  process.exit(1);
}

const supabase = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function listAllUsers() {
  const users = [];
  let page = 1;
  const perPage = 200;
  for (;;) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage });
    if (error) throw error;
    users.push(...data.users);
    if (data.users.length < perPage) break;
    page += 1;
  }
  return users;
}

function tempPassword() {
  return `Tmp-${randomBytes(18).toString('base64url')}!`;
}

async function main() {
  const { data: employees, error: empErr } = await supabase
    .from('employees')
    .select('id,name,email,role,department,subsidiary_id,hierarchy_level, subsidiaries(name)')
    .not('email', 'is', null);

  if (empErr) throw empErr;

  const rows = (employees || []).filter((e) => e.email && String(e.email).trim());
  const users = await listAllUsers();
  const byEmail = new Map(users.map((u) => [(u.email || '').toLowerCase(), u]));

  const { data: profileRows, error: profListErr } = await supabase
    .from('profiles')
    .select('id, employee_id, email');
  if (profListErr) throw profListErr;
  const profileByEmployee = new Map(
    (profileRows || [])
      .filter((p) => p.employee_id)
      .map((p) => [p.employee_id, p]),
  );
  const userById = new Map(users.map((u) => [u.id, u]));

  const missing = [];
  const unconfirmed = [];
  const noProfile = [];
  const loginEmailMismatch = [];

  for (const emp of rows) {
    const email = String(emp.email).trim().toLowerCase();
    const linked = profileByEmployee.get(emp.id);
    const auth =
      byEmail.get(email) ??
      (linked?.id ? userById.get(linked.id) : undefined);

    if (!auth) {
      missing.push({ name: emp.name, email, company: emp.subsidiaries?.name ?? '—' });
      continue;
    }
    const loginEmail = (auth.email || '').toLowerCase();
    if (loginEmail !== email) {
      loginEmailMismatch.push({
        name: emp.name,
        roster_email: email,
        login_email: loginEmail,
        company: emp.subsidiaries?.name ?? '—',
      });
    }
    if (!auth.email_confirmed_at) {
      unconfirmed.push({ name: emp.name, email: loginEmail, company: emp.subsidiaries?.name ?? '—' });
    }
    if (!linked?.id || linked.id !== auth.id || linked.employee_id !== emp.id) {
      noProfile.push({
        name: emp.name,
        email,
        company: emp.subsidiaries?.name ?? '—',
        profile_employee: linked?.employee_id ?? null,
      });
    }
  }

  console.log(`Roster with email: ${rows.length}`);
  console.log(`Auth users: ${users.length}`);
  console.log(`Missing auth login: ${missing.length}`);
  console.log(`Unconfirmed email (reset may fail): ${unconfirmed.length}`);
  console.log(`Profile link mismatch / missing: ${noProfile.length}`);

  if (loginEmailMismatch.length) {
    console.log('\n== Roster email differs from login (OK — reset uses login email)');
    console.table(loginEmailMismatch.slice(0, 20));
  }
  if (missing.length) {
    console.log('\n== Missing logins (need --apply to create)');
    console.table(missing.slice(0, 50));
    if (missing.length > 50) console.log(`… and ${missing.length - 50} more`);
  }
  if (unconfirmed.length) {
    console.log('\n== Unconfirmed (will confirm on --apply, passwords unchanged)');
    console.table(unconfirmed.slice(0, 30));
  }
  if (noProfile.length) {
    console.log('\n== Profile links to fix on --apply');
    console.table(noProfile.slice(0, 30));
  }

  if (!apply) {
    console.log('\nDry run. Re-run with --apply to create missing logins and fix profiles.');
    return;
  }

  let created = 0;
  let confirmed = 0;
  let profiles = 0;

  for (const emp of rows) {
    const email = String(emp.email).trim().toLowerCase();
    const linked = profileByEmployee.get(emp.id);
    let auth =
      byEmail.get(email) ??
      (linked?.id ? userById.get(linked.id) : undefined);

    if (!auth) {
      const { data, error } = await supabase.auth.admin.createUser({
        email,
        password: tempPassword(),
        email_confirm: true,
      });
      if (error) throw error;
      auth = data.user;
      byEmail.set(email, auth);
      created += 1;
      console.log(`Created login: ${email} (${emp.name}) — user must use Forgot password to set a password.`);
    } else if (!auth.email_confirmed_at) {
      const { error } = await supabase.auth.admin.updateUserById(auth.id, { email_confirm: true });
      if (error) throw error;
      confirmed += 1;
    }

    const { error: pErr } = await supabase.from('profiles').upsert(
      {
        id: auth.id,
        employee_id: emp.id,
        name: emp.name || email.split('@')[0],
        email,
        role: emp.role,
        department: emp.department,
        subsidiary_id: emp.subsidiary_id,
        hierarchy_level: emp.hierarchy_level,
        profile_completed: true,
        profile_completed_at: new Date().toISOString(),
      },
      { onConflict: 'id' },
    );
    if (pErr) throw pErr;
    profiles += 1;
  }

  console.log('\nDone.');
  console.log(`  Created: ${created}`);
  console.log(`  Email confirmed (existing): ${confirmed}`);
  console.log(`  Profiles upserted: ${profiles}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
