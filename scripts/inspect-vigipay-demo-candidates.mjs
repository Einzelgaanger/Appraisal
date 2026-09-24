/**
 * Inspect the employee + profile shape for the VigiPay people we want demo logins for.
 * Read-only.
 */
import { createClient } from '@supabase/supabase-js';
import { loadDotEnv } from './load-env.mjs';

loadDotEnv();
const admin = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const TARGETS = ['Oluseyi Oluwabusola', 'Lawal Abdulateef', 'Marcia Cole'];

const { data: emps, error } = await admin
  .from('employees')
  .select('*')
  .in('name', TARGETS);
if (error) throw error;

for (const e of emps ?? []) {
  console.log(`--- ${e.name}`);
  for (const [k, v] of Object.entries(e)) {
    if (v !== null && v !== false && v !== '') console.log(`    ${k}: ${JSON.stringify(v)}`);
  }
}

// how many people report to each target
const { data: reports } = await admin
  .from('employees')
  .select('name,manager_id')
  .eq('locked_tenant_slug', 'vigipay');
const counts = new Map();
for (const r of reports ?? []) counts.set(r.manager_id, (counts.get(r.manager_id) ?? 0) + 1);
console.log('\ndirect reports:');
for (const e of emps ?? []) console.log(`    ${e.name}: ${counts.get(e.id) ?? 0}`);

// shape of an existing working profile, for reference
const { data: sample } = await admin
  .from('profiles')
  .select('*')
  .not('employee_id', 'is', null)
  .limit(1);
console.log('\nexample profile row keys/values:');
console.log(JSON.stringify(sample?.[0] ?? {}, null, 2));
