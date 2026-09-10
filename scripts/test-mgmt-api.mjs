import { readFileSync } from 'fs';

const env = {};
for (const line of readFileSync('.env', 'utf8').split(/\r?\n/)) {
  if (!line || line.startsWith('#') || !line.includes('=')) continue;
  const i = line.indexOf('=');
  const k = line.slice(0, i).trim();
  let v = line.slice(i + 1).trim();
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
  env[k] = v;
}

const ref = 'sgttsotrvemmgmujcuay';
const token = env.SUPABASE_ACCESS_TOKEN;

const endpoints = [
  `https://api.supabase.com/v1/projects/${ref}`,
  `https://api.supabase.com/v1/projects/${ref}/database/query`,
];

for (const url of endpoints) {
  const res = await fetch(url, {
    method: url.endsWith('/query') ? 'POST' : 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      apikey: token,
    },
    body: url.endsWith('/query') ? JSON.stringify({ query: 'select 1 as ok' }) : undefined,
  });
  console.log(url, res.status, (await res.text()).slice(0, 300));
}
