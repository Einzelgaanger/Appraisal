/**
 * Presentation fix: activate GHC for every roster person on the employee row
 * they actually log in with, and rewire ghc_manager_id links.
 *
 * Usage: node scripts/fix-ghc-presentation-roster.mjs
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

async function allEmployees() {
  const { data, error } = await sb.from('employees').select('*').limit(5000);
  if (error) throw error;
  return data ?? [];
}

function localPart(email) {
  return (email || '').trim().toLowerCase().split('@')[0] || '';
}

function pickLoginPreferred(rows, { preferSubsidiary } = {}) {
  if (!rows.length) return null;
  const scored = [...rows].sort((a, b) => {
    const aGhc = a.subsidiary_id === '22222222-2222-2222-2222-222222222222' ? 1 : 0;
    const bGhc = b.subsidiary_id === '22222222-2222-2222-2222-222222222222' ? 1 : 0;
    if (preferSubsidiary === 'eo') return aGhc - bGhc; // prefer non-GHC (login/EO)
    if (preferSubsidiary === 'ghc') return bGhc - aGhc;
    return 0;
  });
  return scored[0];
}

const { data: profiles } = await sb.from('profiles').select('id,email,employee_id,name').limit(5000);
const profileByEmployee = new Map((profiles ?? []).filter((p) => p.employee_id).map((p) => [p.employee_id, p]));

const employees = await allEmployees();

const groups = {
  bunmi: employees.filter((e) => localPart(e.email) === 'bunmi.akinyemiju' || /^bunmi akinyemiju/i.test(e.name || '')),
  uloma: employees.filter((e) => localPart(e.email) === 'uloma.herrington' || /^uloma herrington/i.test(e.name || '')),
  busayo: employees.filter((e) => localPart(e.email) === 'busayo.eniola-giwa' || /^busayo/i.test(e.name || '')),
  omotola: employees.filter((e) => localPart(e.email) === 'omotola.akinyemiju' || /^omotola akinyemiju/i.test(e.name || '')),
  phebean: employees.filter((e) => localPart(e.email) === 'phebean.falaye' || /^phebean/i.test(e.name || '')),
  fiyin: employees.filter((e) => ['fiyinfoluwa.sanwo', 'fiyin.sanwo'].includes(localPart(e.email)) || /^fiyinfoluwa/i.test(e.name || '')),
  mariam: employees.filter((e) => localPart(e.email) === 'mariam.adahunse' || /^mariam/i.test(e.name || '')),
  faith: employees.filter((e) => localPart(e.email) === 'faith.aminaho' || /^faith aminaho/i.test(e.name || '')),
  anjola: employees.filter((e) => localPart(e.email) === 'anjolaoluwa.jawando' || /^anjolaoluwa/i.test(e.name || '')),
};

// Prefer the row linked from a profile (actual login), else EO row, else any
function canonical(rows) {
  if (!rows.length) return null;
  const linked = rows.find((r) => profileByEmployee.has(r.id));
  if (linked) return linked;
  return pickLoginPreferred(rows, { preferSubsidiary: 'eo' }) || rows[0];
}

const bunmi = canonical(groups.bunmi);
const uloma = canonical(groups.uloma);
const busayo = canonical(groups.busayo);
const omotola = canonical(groups.omotola);
const phebean = canonical(groups.phebean);
const fiyin = canonical(groups.fiyin);
const mariam = canonical(groups.mariam);
const faith = canonical(groups.faith);
const anjola = canonical(groups.anjola);

console.log('Canonical IDs:');
for (const [k, v] of Object.entries({ bunmi, uloma, busayo, omotola, phebean, fiyin, mariam, faith, anjola })) {
  console.log(`  ${k}: ${v ? `${v.id} | ${v.email} | ${v.name}` : 'MISSING'}`);
}

const updates = [];

function queue(id, patch) {
  if (!id) return;
  updates.push({ id, ...patch });
}

const canonicalIds = new Set(
  [bunmi, uloma, busayo, omotola, phebean, fiyin, mariam, faith, anjola].filter(Boolean).map((r) => r.id),
);

// Activate only canonical login/preferred rows; deactivate identity duplicates
queue(bunmi?.id, {
  ghc_appraisal_active: true,
  ghc_hierarchy_level: 1,
  ghc_manager_id: null,
  ghc_secondary_manager_id: null,
});
queue(uloma?.id, {
  ghc_appraisal_active: true,
  ghc_hierarchy_level: 2,
  ghc_manager_id: bunmi?.id ?? null,
  ghc_secondary_manager_id: null,
});
for (const row of [busayo, omotola, phebean, fiyin]) {
  queue(row?.id, {
    ghc_appraisal_active: true,
    ghc_hierarchy_level: 3,
    ghc_manager_id: uloma?.id ?? null,
    ghc_secondary_manager_id: null,
  });
}
queue(mariam?.id, {
  ghc_appraisal_active: true,
  ghc_hierarchy_level: 3,
  ghc_manager_id: busayo?.id ?? null,
  ghc_secondary_manager_id: omotola?.id ?? null,
});
queue(faith?.id, {
  ghc_appraisal_active: true,
  ghc_hierarchy_level: 4,
  ghc_manager_id: phebean?.id ?? null,
  ghc_secondary_manager_id: null,
});
queue(anjola?.id, {
  ghc_appraisal_active: true,
  ghc_hierarchy_level: 4,
  ghc_manager_id: omotola?.id ?? null,
  ghc_secondary_manager_id: null,
});

for (const row of Object.values(groups).flat()) {
  if (!canonicalIds.has(row.id)) {
    queue(row.id, { ghc_appraisal_active: false });
  }
}

// Dedupe update list by id (last wins)
const byId = new Map();
for (const u of updates) byId.set(u.id, u);

let ok = 0;
let fail = 0;
for (const u of byId.values()) {
  const { id, ...patch } = u;
  const { error } = await sb.from('employees').update(patch).eq('id', id);
  if (error) {
    fail += 1;
    console.error('update failed', id, error.message);
  } else {
    ok += 1;
  }
}

console.log(`Updated ${ok} employee rows (${fail} failed)`);

const { data: active } = await sb
  .from('employees')
  .select('id,name,email,ghc_appraisal_active,ghc_hierarchy_level,ghc_manager_id')
  .eq('ghc_appraisal_active', true)
  .order('ghc_hierarchy_level');
console.log('Active GHC roster:', active?.length ?? 0);
console.log(JSON.stringify(active, null, 2));
