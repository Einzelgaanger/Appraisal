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

const { data: profiles } = await sb
  .from('profiles')
  .select('id,name,email,employee_id')
  .or('name.ilike.%Bunmi%,name.ilike.%Omotola%,name.ilike.%Fiyin%,name.ilike.%Uloma%,email.ilike.%greenhouse%')
  .limit(50);
console.log('profiles', JSON.stringify(profiles, null, 2));

const { data: fiyin } = await sb
  .from('employees')
  .select('id,name,email,ghc_appraisal_active,subsidiary_id')
  .ilike('name', '%Fiyin%');
console.log('fiyin', fiyin);
