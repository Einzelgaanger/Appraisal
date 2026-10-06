/**
 * One-time / repeat: create Supabase Auth users for every row in public.employees with an email,
 * set a shared demo password, upsert public.profiles (employee_id + profile_completed), and
 * grant admin to DEMO_ADMIN_EMAIL for /admin testing.
 *
 * Requirements:
 *   - SUPABASE_URL (or VITE_SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY in environment or .env
 *   - Service role key must NEVER be prefixed with VITE_ or committed.
 *
 * Run from repo root:
 *   npm run seed:demo-auth
 *
 * Optional env:
 *   DEMO_DEFAULT_PASSWORD   (default: BoomEoDemo2026!)
 *   DEMO_ADMIN_EMAIL        (default: bunmi.akinyemiju@peopleos.co) — Group CEO in seed data
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync, existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

function loadDotEnv() {
  const p = join(root, '.env');
  if (!existsSync(p)) return;
  const text = readFileSync(p, 'utf8');
  for (const line of text.split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('=');
    if (i === -1) continue;
    const key = t.slice(0, i).trim();
    let val = t.slice(i + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (process.env[key] === undefined || process.env[key] === '') {
      process.env[key] = val;
    }
  }
}

loadDotEnv();

const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const hosted = /supabase\.co/i.test(url || '');
if (hosted && !process.argv.includes('--allow-production')) {
  console.error('Refusing to stamp the shared demo password on a hosted project.');
  console.error('Shared passwords stay on the local Docker database. Point .env at 127.0.0.1 first.');
  process.exit(1);
}
const defaultPassword = process.env.DEMO_DEFAULT_PASSWORD || 'BoomEoDemo2026!';
const adminEmail = (process.env.DEMO_ADMIN_EMAIL || 'bunmi.akinyemiju@peopleos.co').trim().toLowerCase();

if (!url || !serviceKey) {
  const missing = [];
  if (!url) missing.push('SUPABASE_URL or VITE_SUPABASE_URL');
  if (!serviceKey) missing.push('SUPABASE_SERVICE_ROLE_KEY');
  console.error(`Missing: ${missing.join(', ')}.\n`);
  console.error(
    'Add to .env in the project root (same folder as package.json), save, then run again:\n' +
      '  VITE_SUPABASE_URL=https://<project-ref>.supabase.co\n' +
      '  VITE_SUPABASE_PUBLISHABLE_KEY=<anon public key>\n' +
      '  SUPABASE_SERVICE_ROLE_KEY=<service_role secret — never use VITE_ prefix>\n\n' +
      'Keys: Supabase Dashboard → Project Settings → API.',
  );
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

async function findUserIdByEmail(emailLower, cache) {
  const hit = cache.find((u) => (u.email || '').toLowerCase() === emailLower);
  return hit?.id ?? null;
}

/**
 * @returns {{ id: string, created: boolean }}
 */
async function ensureAuthUser(email, password, userCache) {
  const emailLower = email.trim().toLowerCase();
  let existingId = await findUserIdByEmail(emailLower, userCache);

  if (existingId) {
    const { error: updErr } = await supabase.auth.admin.updateUserById(existingId, {
      password,
      email_confirm: true,
    });
    if (updErr) throw updErr;
    return { id: existingId, created: false };
  }

  const { data, error } = await supabase.auth.admin.createUser({
    email: emailLower,
    password,
    email_confirm: true,
  });

  if (!error && data?.user?.id) {
    return { id: data.user.id, created: true };
  }

  const msg = error?.message || '';
  const already =
    msg.toLowerCase().includes('already') ||
    msg.toLowerCase().includes('registered') ||
    error?.status === 422;

  if (!already) {
    throw error;
  }

  userCache.length = 0;
  userCache.push(...(await listAllUsers()));
  const id = await findUserIdByEmail(emailLower, userCache);
  if (!id) {
    throw new Error(`User exists for ${emailLower} but could not be listed — check Auth users in dashboard.`);
  }

  const { error: updErr } = await supabase.auth.admin.updateUserById(id, {
    password,
    email_confirm: true,
  });
  if (updErr) throw updErr;
  return { id, created: false };
}

async function main() {
  const { data: employees, error: empErr } = await supabase
    .from('employees')
    .select('id,name,email,role,department,subsidiary_id,hierarchy_level')
    .not('email', 'is', null);

  if (empErr) throw empErr;
  const rows = (employees || []).filter((e) => e.email && String(e.email).trim());
  if (rows.length === 0) {
    console.error('No employees with email in public.employees — run DB migrations first.');
    process.exit(1);
  }

  const userCache = await listAllUsers();
  let created = 0;
  let updated = 0;
  let profiles = 0;

  for (const emp of rows) {
    const email = String(emp.email).trim();
    const { id: userId, created: wasNew } = await ensureAuthUser(email, defaultPassword, userCache);
    if (wasNew) {
      userCache.push({ id: userId, email: email.toLowerCase() });
      created += 1;
    } else {
      updated += 1;
    }

    const { error: pErr } = await supabase.from('profiles').upsert(
      {
        id: userId,
        employee_id: emp.id,
        name: emp.name || email.split('@')[0],
        email: email.toLowerCase(),
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

  const adminEmp = rows.find((e) => e.email.trim().toLowerCase() === adminEmail);
  if (!adminEmp) {
    console.warn(
      `DEMO_ADMIN_EMAIL ${adminEmail} not found in employees — skipping admin role. Set DEMO_ADMIN_EMAIL to a seeded email.`,
    );
  } else {
    const adminUserId = await findUserIdByEmail(adminEmail, userCache);
    if (adminUserId) {
      const { error: rErr } = await supabase.from('user_roles').insert({
        user_id: adminUserId,
        role: 'admin',
      });
      if (
        rErr &&
        rErr.code !== '23505' &&
        !String(rErr.message || '').toLowerCase().includes('duplicate')
      ) {
        throw rErr;
      }
    }
  }

  console.log('');
  console.log('Done.');
  console.log(`  Employees processed: ${rows.length}`);
  console.log(`  Auth users created (new): ${created}`);
  console.log(`  Auth users updated (password reset): ${updated}`);
  console.log(`  Profiles upserted: ${profiles}`);
  console.log('');
  console.log('Shared demo password (all accounts):');
  console.log(`  ${defaultPassword}`);
  console.log('');
  console.log('Admin hub access (user_roles):');
  console.log(`  ${adminEmail}`);
  console.log('');
  console.log('Users can change passwords after login (account / reset flow).');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
