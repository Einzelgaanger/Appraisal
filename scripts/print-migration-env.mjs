import { readFileSync } from 'fs';

const raw = readFileSync('.env', 'utf8');
const env = {};
for (const line of raw.split(/\r?\n/)) {
  if (!line || line.trim().startsWith('#') || !line.includes('=')) continue;
  const i = line.indexOf('=');
  const k = line.slice(0, i).trim();
  const v = line
    .slice(i + 1)
    .trim()
    .replace(/^["']|["']$/g, '');
  // last wins for duplicates
  env[k] = v;
}

const keys = [
  'VITE_SUPABASE_URL',
  'SUPABASE_ACCESS_TOKEN',
  'SUPABASE_SERVICE_ROLE_KEY',
  'SUPABASE_DB_PASSWORD',
  'VITE_SUPABASE_PUBLISHABLE_KEY',
  'DATABASE_URL',
];

for (const k of keys) {
  const v = env[k];
  if (!v) {
    console.log(`${k}=MISSING`);
    continue;
  }
  const sens = /KEY|TOKEN|PASSWORD|DATABASE_URL/i.test(k);
  console.log(sens ? `${k}=SET len=${v.length}` : `${k}=${v}`);
}
