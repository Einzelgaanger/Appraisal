/**
 * Run SQL against the linked Supabase project using the Management API.
 * Requires SUPABASE_ACCESS_TOKEN in .env
 *
 * Usage: node scripts/run-sql-file.mjs path/to/file.sql
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';

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
const file = process.argv[2];
if (!file) {
  console.error('Usage: node scripts/run-sql-file.mjs <sqlfile>');
  process.exit(1);
}

const sql = readFileSync(resolve(file), 'utf8');
const refMatch = (env.VITE_SUPABASE_URL || '').match(/https:\/\/([^.]+)\.supabase\.co/);
const ref = refMatch?.[1];
const token = env.SUPABASE_ACCESS_TOKEN;
if (!ref || !token) {
  console.error('Need VITE_SUPABASE_URL and SUPABASE_ACCESS_TOKEN');
  process.exit(1);
}

const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({ query: sql }),
});

const text = await res.text();
console.log('status', res.status);
console.log(text.slice(0, 4000));
if (!res.ok) process.exit(1);
