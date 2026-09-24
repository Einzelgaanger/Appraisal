/**
 * Report the GHC roster and which of them can actually sign in.
 * Read-only — never signs in or out, so live sessions are untouched.
 *
 * Usage: node scripts/check-ghc-logins.mjs
 */
import { createClient } from '@supabase/supabase-js';
import { loadDotEnv } from './load-env.mjs';

loadDotEnv();

const admin = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const { data: roster, error } = await admin
  .from('employees')
  .select('id,name,email,role,department,ghc_hierarchy_level,ghc_manager_id,company_admin,locked_tenant_slug')
  .eq('ghc_appraisal_active', true)
  .order('ghc_hierarchy_level')
  .order('name');
if (error) throw error;

const { data: profiles } = await admin.from('profiles').select('id,email,employee_id,profile_completed');
const profileByEmployee = new Map((profiles ?? []).filter((p) => p.employee_id).map((p) => [p.employee_id, p]));

const { data: listed } = await admin.auth.admin.listUsers({ perPage: 1000 });
const authByEmail = new Map((listed?.users ?? []).map((u) => [u.email?.toLowerCase(), u]));

const { data: adminRoles } = await admin.from('user_roles').select('user_id,role').eq('role', 'admin');
const adminUserIds = new Set((adminRoles ?? []).map((r) => r.user_id));

const byId = new Map((roster ?? []).map((e) => [e.id, e]));

console.log(`GHC-active employees: ${roster?.length ?? 0}\n`);

for (const e of roster ?? []) {
  const email = (e.email || '').trim().toLowerCase();
  const user = email ? authByEmail.get(email) : null;
  const prof = profileByEmployee.get(e.id);
  const canSignIn = Boolean(user && prof);
  const flags = [
    e.company_admin ? 'company_admin' : null,
    user && adminUserIds.has(user.id) ? 'platform_admin' : null,
    prof?.profile_completed ? null : 'profile_incomplete',
    e.locked_tenant_slug ? `locked=${e.locked_tenant_slug}` : null,
  ].filter(Boolean);

  console.log(`${canSignIn ? 'OK ' : '-- '} ${(e.name || '').padEnd(26)} ${(email || '(no email)').padEnd(44)} L${e.ghc_hierarchy_level ?? '?'}`);
  console.log(`      role=${e.role ?? ''} | mgr=${byId.get(e.ghc_manager_id)?.name ?? '(none)'}${flags.length ? ` | ${flags.join(', ')}` : ''}`);
  if (user) {
    console.log(`      auth created ${user.created_at?.slice(0, 10)} | last sign-in ${user.last_sign_in_at?.slice(0, 16) ?? 'never'}`);
  } else {
    console.log('      no auth user — cannot sign in');
  }
}
