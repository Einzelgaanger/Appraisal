/**
 * Smoke-check expected GHC tasks for every active member (no auth needed).
 * Usage: node scripts/smoke-ghc-tasks.mjs
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
const sb = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const { data: rows, error } = await sb
  .from('employees')
  .select('id,name,email,ghc_appraisal_active,ghc_hierarchy_level,ghc_manager_id,ghc_secondary_manager_id')
  .eq('ghc_appraisal_active', true)
  .order('ghc_hierarchy_level');
if (error) throw error;

const active = rows ?? [];
console.log(`Active roster: ${active.length}`);
for (const e of active) {
  console.log(
    `  L${e.ghc_hierarchy_level} ${e.name} | mgr=${e.ghc_manager_id?.slice(0, 8) || '-'} | 2nd=${e.ghc_secondary_manager_id?.slice(0, 8) || '-'}`,
  );
}

function local(email) {
  return (email || '').split('@')[0].toLowerCase();
}

console.log('\nExpected tasks per person:');
for (const me of active) {
  const reports = active.filter(
    (e) => e.id !== me.id && (e.ghc_manager_id === me.id || e.ghc_secondary_manager_id === me.id),
  );
  const peers = active.filter((e) => e.id !== me.id && local(e.email) !== local(me.email));
  const monthly = reports.map((r) => r.name);
  const evals = reports.map((r) => r.name);
  const peer360 = peers.map((r) => r.name);
  console.log(
    `\n${me.name}: monthly=${monthly.length} eval=${evals.length} 360=${peer360.length} total=${monthly.length + evals.length + peer360.length}`,
  );
  if (monthly.length) console.log(`  monthly/eval → ${monthly.join(', ')}`);
  console.log(`  360 → ${peer360.length} peers`);
}

const bunmi = active.find((e) => local(e.email) === 'bunmi.akinyemiju');
const uloma = active.find((e) => local(e.email) === 'uloma.herrington');
const busayo = active.find((e) => local(e.email) === 'busayo.eniola-giwa');
const omotola = active.find((e) => local(e.email) === 'omotola.akinyemiju');
const mariam = active.find((e) => local(e.email) === 'mariam.adahunse');

const checks = [];
checks.push(['9 active', active.length === 9]);
checks.push(['Bunmi active login row', !!bunmi && bunmi.email.includes('peopleos')]);
checks.push(['Uloma → Bunmi', uloma?.ghc_manager_id === bunmi?.id]);
checks.push(['Busayo → Uloma', busayo?.ghc_manager_id === uloma?.id]);
checks.push(['Omotola → Uloma', omotola?.ghc_manager_id === uloma?.id]);
checks.push(['Mariam → Busayo', mariam?.ghc_manager_id === busayo?.id]);
checks.push(['Mariam 2nd → Omotola', mariam?.ghc_secondary_manager_id === omotola?.id]);
checks.push(['Bunmi has Uloma monthly', active.filter((e) => e.ghc_manager_id === bunmi?.id).length === 1]);
checks.push([
  'Uloma has 4 directs',
  active.filter((e) => e.ghc_manager_id === uloma?.id).length === 4,
]);

console.log('\nChecks:');
let failed = 0;
for (const [label, ok] of checks) {
  console.log(`  ${ok ? 'PASS' : 'FAIL'} ${label}`);
  if (!ok) failed += 1;
}
process.exit(failed ? 1 : 0);
