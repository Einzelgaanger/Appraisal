import { readFileSync } from 'fs';

function loadEnv() {
  const env = {};
  for (const line of readFileSync('.env', 'utf8').split(/\r?\n/)) {
    if (!line || line.trim().startsWith('#') || !line.includes('=')) continue;
    const i = line.indexOf('=');
    env[line.slice(0, i).trim()] = line
      .slice(i + 1)
      .trim()
      .replace(/^["']|["']$/g, '');
  }
  return env;
}

const env = loadEnv();

function status(k) {
  const v = env[k];
  if (!v) return 'EMPTY';
  return `SET len=${v.length}`;
}

const keys = [
  'SUPABASE_ACCESS_TOKEN',
  'OLD_SUPABASE_DB_PASSWORD',
  'OLD_SUPABASE_ANON_KEY',
  'OLD_SUPABASE_SERVICE_ROLE_KEY',
  'NEW_SUPABASE_PROJECT_REF',
  'NEW_SUPABASE_URL',
  'NEW_SUPABASE_DB_PASSWORD',
  'NEW_SUPABASE_ANON_KEY',
  'NEW_SUPABASE_SERVICE_ROLE_KEY',
];

for (const k of keys) console.log(`${k}=${status(k)}`);

const token = env.SUPABASE_ACCESS_TOKEN;
if (!token) {
  console.log('API_CHECK=skip (no token)');
  process.exit(0);
}

const r = await fetch('https://api.supabase.com/v1/projects', {
  headers: { Authorization: `Bearer ${token}` },
});
console.log('API_STATUS', r.status);
if (!r.ok) {
  console.log('API_BODY', (await r.text()).slice(0, 200));
  process.exit(1);
}
const projects = await r.json();
const wanted = new Set(['sgttsotrvemmgmujcuay', 'qnorggoycwbbxdlvbcvq']);
for (const p of projects) {
  if (!wanted.has(p.id) && !wanted.has(p.ref)) continue;
  console.log(
    `PROJECT ${p.id || p.ref} name=${p.name} org=${p.organization_id || p.organization_slug} status=${p.status}`,
  );
}
const refs = projects.map((p) => p.id || p.ref);
console.log('HAS_OLD', refs.includes('sgttsotrvemmgmujcuay'));
console.log('HAS_NEW', refs.includes('qnorggoycwbbxdlvbcvq'));
console.log('TOTAL_PROJECTS_VISIBLE', projects.length);
