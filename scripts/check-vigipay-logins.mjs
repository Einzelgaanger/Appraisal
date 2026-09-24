/**
 * Report the VigiPay roster and which of them can actually sign in.
 * Read-only.
 *
 * Usage: node scripts/check-vigipay-logins.mjs
 */
import { createClient } from '@supabase/supabase-js';
import { loadDotEnv } from './load-env.mjs';

loadDotEnv();

const admin = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const { data: roster, error } = await admin
  .from('employees')
  .select('id,name,email,role,department,ghc_hierarchy_level,company_admin,locked_tenant_slug,vigipay_appraisal_active,manager_id')
  .eq('locked_tenant_slug', 'vigipay')
  .order('name');
if (error) throw error;

const { data: profiles } = await admin.from('profiles').select('id,email,employee_id');
const profileByEmployee = new Map((profiles ?? []).filter((p) => p.employee_id).map((p) => [p.employee_id, p]));

const { data: listed } = await admin.auth.admin.listUsers({ perPage: 1000 });
const authByEmail = new Map((listed?.users ?? []).map((u) => [u.email?.toLowerCase(), u]));

const byId = new Map((roster ?? []).map((e) => [e.id, e]));

console.log(`VigiPay-locked employees: ${roster?.length ?? 0}`);
console.log(`total auth users in project: ${listed?.users?.length ?? 0}\n`);

let withLogin = 0;
const rows = [];
for (const e of roster ?? []) {
  const email = (e.email || '').trim().toLowerCase();
  const hasProfile = profileByEmployee.has(e.id);
  const hasAuth = email ? authByEmail.has(email) : false;
  if (hasProfile && hasAuth) withLogin += 1;
  rows.push({
    name: e.name,
    email: email || '(none)',
    level: e.ghc_hierarchy_level ?? '',
    admin: e.company_admin ? 'ADMIN' : '',
    reports: byId.get(e.manager_id)?.name ?? '',
    login: hasAuth ? (hasProfile ? 'auth+profile' : 'auth only') : hasProfile ? 'profile only' : '-',
  });
}

console.log(`can sign in today (auth user + linked profile): ${withLogin}\n`);
for (const r of rows) {
  console.log(
    `${r.name.padEnd(26)} ${r.email.padEnd(38)} L${String(r.level).padEnd(3)} ${r.admin.padEnd(6)} ${r.login.padEnd(13)} mgr=${r.reports}`,
  );
}

const domains = new Map();
for (const r of rows) {
  const d = r.email.includes('@') ? r.email.split('@')[1] : '(none)';
  domains.set(d, (domains.get(d) ?? 0) + 1);
}
console.log('\nemail domains:', Object.fromEntries(domains));
