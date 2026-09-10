/**
 * Deactivate non-canonical duplicate GHC identity rows so tasks don't double-count.
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

const keepActive = new Set([
  '70f7d288-cdc2-4df3-bd62-2ab60a982600', // Bunmi login
  'a1111111-1111-4111-8111-111111111102', // Uloma
  'a1111111-1111-4111-8111-111111111103', // Busayo
  '2024984c-63f6-4fe7-a418-367df51b4501', // Omotola login
  'a1111111-1111-4111-8111-111111111105', // Phebean
  'a1111111-1111-4111-8111-111111111106', // Fiyin
  'a1111111-1111-4111-8111-111111111107', // Mariam
  'a1111111-1111-4111-8111-111111111108', // Faith
  'a1111111-1111-4111-8111-111111111109', // Anjola
]);

const deactivate = [
  'a1111111-1111-4111-8111-111111111101', // Bunmi seed duplicate
  'a1111111-1111-4111-8111-111111111104', // Omotola seed duplicate
];

for (const id of deactivate) {
  const { error } = await sb.from('employees').update({ ghc_appraisal_active: false }).eq('id', id);
  console.log(id, error?.message || 'deactivated');
}

// Ensure Mariam dual reporting
const { error: mariamErr } = await sb
  .from('employees')
  .update({
    ghc_appraisal_active: true,
    ghc_hierarchy_level: 3,
    ghc_manager_id: 'a1111111-1111-4111-8111-111111111103', // Busayo
    ghc_secondary_manager_id: '2024984c-63f6-4fe7-a418-367df51b4501', // Omotola login
  })
  .eq('id', 'a1111111-1111-4111-8111-111111111107');
console.log('mariam dual', mariamErr?.message || 'ok');

const { data } = await sb
  .from('employees')
  .select('id,name,email,ghc_appraisal_active,ghc_hierarchy_level,ghc_manager_id,ghc_secondary_manager_id')
  .eq('ghc_appraisal_active', true)
  .order('ghc_hierarchy_level');

console.log('Active count', data?.length);
console.log(JSON.stringify(data, null, 2));

const unexpected = (data || []).filter((r) => !keepActive.has(r.id));
if (unexpected.length) {
  console.log('Unexpected active rows:', unexpected.map((r) => r.email));
}
