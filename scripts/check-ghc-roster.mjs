import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';

const raw = readFileSync('.env', 'utf8');
const env = {};
for (const line of raw.split(/\r?\n/)) {
  if (!line || line.startsWith('#') || !line.includes('=')) continue;
  const i = line.indexOf('=');
  const k = line.slice(0, i).trim();
  let v = line.slice(i + 1).trim();
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
  env[k] = v;
}

const sb = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const { data, error } = await sb
  .from('employees')
  .select(
    'id,name,email,ghc_appraisal_active,ghc_hierarchy_level,ghc_manager_id,ghc_secondary_manager_id,hierarchy_level,manager_id,subsidiary_id',
  )
  .or(
    [
      'name.ilike.%Bunmi%',
      'name.ilike.%Uloma%',
      'name.ilike.%Busayo%',
      'name.ilike.%Omotola%',
      'name.ilike.%Phebean%',
      'name.ilike.%Fiyin%',
      'name.ilike.%Mariam%',
      'name.ilike.%Faith Aminaho%',
      'name.ilike.%Anjola%',
      'name.ilike.%GreenHouse%',
      'ghc_appraisal_active.eq.true',
      'email.ilike.%greenhouse.capital%',
    ].join(','),
  )
  .limit(100);

console.log('query_error', error);
console.log('count', data?.length ?? 0);
console.log(JSON.stringify(data, null, 2));
