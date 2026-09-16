/**
 * Dump old Supabase DB (data or schema) using password from .env
 * Usage: node scripts/dump-supabase-db.mjs [--data-only] [--schema public,auth]
 */
import { readFileSync, mkdirSync } from 'fs';
import { spawnSync } from 'child_process';
import { join } from 'path';

function loadEnv() {
  const env = { ...process.env };
  for (const line of readFileSync('.env', 'utf8').split(/\r?\n/)) {
    if (!line || line.trim().startsWith('#') || !line.includes('=')) continue;
    const i = line.indexOf('=');
    const k = line.slice(0, i).trim();
    const v = line
      .slice(i + 1)
      .trim()
      .replace(/^["']|["']$/g, '');
    if (!(k in env) || !env[k]) env[k] = v;
  }
  return env;
}

const env = loadEnv();
const args = process.argv.slice(2);
const dataOnly = args.includes('--data-only');
const schemaArg = args.find((a) => a.startsWith('--schema='));
const schema = schemaArg ? schemaArg.split('=')[1] : 'public';
const refArg = args.find((a) => a.startsWith('--ref='));
const ref = refArg ? refArg.split('=')[1] : 'sgttsotrvemmgmujcuay';
const pwdArg = args.find((a) => a.startsWith('--password='));
const password = pwdArg ? pwdArg.split('=')[1] : env.SUPABASE_DB_PASSWORD;

if (!password) {
  console.error('Missing DB password (.env SUPABASE_DB_PASSWORD or --password=)');
  process.exit(1);
}

const encoded = encodeURIComponent(password);
const useDirect = args.includes('--direct');
// Prefer session pooler (IPv4). Direct db.*.supabase.co is often IPv6-only and breaks in Docker.
const dbUrl = useDirect
  ? `postgresql://postgres:${encoded}@db.${ref}.supabase.co:5432/postgres`
  : `postgresql://postgres.${ref}:${encoded}@aws-0-eu-west-1.pooler.supabase.com:5432/postgres`;

mkdirSync('tmp', { recursive: true });
const out = join(
  'tmp',
  `${ref}-${dataOnly ? 'data' : 'full'}-${schema.replace(/,/g, '-')}.sql`,
);

const cliArgs = [
  'supabase',
  'db',
  'dump',
  '--db-url',
  dbUrl,
  '-f',
  out,
  '--yes',
];
if (dataOnly) cliArgs.push('--data-only', '--use-copy');
if (schema) {
  cliArgs.push('--schema', schema);
}

console.log('Dumping', ref, dataOnly ? 'data-only' : 'schema+data', 'schemas:', schema);
console.log('Output:', out);

const r = spawnSync('npx', cliArgs, {
  stdio: 'inherit',
  shell: true,
  env: { ...process.env, SUPABASE_ACCESS_TOKEN: undefined },
});

process.exit(r.status ?? 1);
