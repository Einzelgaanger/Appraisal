/**
 * One-shot: DB tenant hostnames + Supabase Auth redirect allow-list + Render custom domains.
 *
 *   node scripts/setup-production-hosts.mjs           # report
 *   node scripts/setup-production-hosts.mjs --apply   # write all configured backends
 *
 * Needs in .env:
 *   SUPABASE_DB_PASSWORD        — tenant_domains upsert (always when --apply)
 *   SUPABASE_ACCESS_TOKEN       — Auth URL config (optional)
 *   RENDER_API_KEY              — custom domains (optional)
 */
import pg from 'pg';
import { spawnSync } from 'child_process';
import { readFileSync } from 'fs';
import { join } from 'path';
import { loadDotEnv, projectRoot } from './load-env.mjs';

loadDotEnv();

const APPLY = process.argv.includes('--apply');
const REF = 'qnorggoycwbbxdlvbcvq';

const SQL = readFileSync(
  join(projectRoot(), 'supabase/migrations/20260930190000_ensure_executive_vigipay_production_hosts.sql'),
  'utf8',
);

async function applyDb() {
  const password = process.env.SUPABASE_DB_PASSWORD?.trim();
  if (!password) {
    console.log('SKIP  DB — SUPABASE_DB_PASSWORD not set');
    return false;
  }
  const { Client } = pg;
  const hosts = ['aws-1-eu-west-1.pooler.supabase.com', 'aws-0-eu-west-1.pooler.supabase.com'];
  let client;
  for (const host of hosts) {
    const c = new Client({
      connectionString: `postgresql://postgres.${REF}:${encodeURIComponent(password)}@${host}:5432/postgres`,
      ssl: { rejectUnauthorized: false },
    });
    try {
      await c.connect();
      client = c;
      break;
    } catch {
      try { await c.end(); } catch { /* ignore */ }
    }
  }
  if (!client) throw new Error('Could not connect to Supabase Postgres');

  await client.query(SQL);
  const { rows } = await client.query(`
    SELECT t.slug, td.hostname, td.is_primary
    FROM public.tenant_domains td
    JOIN public.tenants t ON t.id = td.tenant_id
    WHERE td.hostname IN ('executive.vgg.tools', 'vigipay.vgg.tools', 'ghc.vgg.tools')
    ORDER BY td.hostname
  `);
  await client.end();
  console.log('OK    tenant_domains (executive + vigipay + ghc):');
  for (const r of rows) console.log(`      ${r.hostname} → ${r.slug}${r.is_primary ? ' (primary)' : ''}`);
  return true;
}

function runNode(script, extraArgs = []) {
  const args = [join(projectRoot(), 'scripts', script), ...extraArgs];
  if (APPLY) args.push('--apply');
  const r = spawnSync(process.execPath, args, { stdio: 'inherit', env: process.env });
  return r.status === 0;
}

console.log(`\n=== Production hosts setup (${APPLY ? 'APPLY' : 'dry-run'}) ===\n`);

if (APPLY) {
  try {
    await applyDb();
  } catch (e) {
    console.error('FAIL  DB:', e.message);
  }
} else {
  console.log('DRY   DB — run with --apply to upsert tenant_domains via SQL migration snippet');
}

console.log('');
if (process.env.SUPABASE_ACCESS_TOKEN?.trim()) {
  runNode('configure-auth-redirects.mjs');
} else {
  console.log('SKIP  Supabase Auth — set SUPABASE_ACCESS_TOKEN, then re-run with --apply');
  console.log('      Or paste redirect URLs manually (see docs/vgg-tools-domains.md §3)');
}

console.log('');
if (process.env.RENDER_API_KEY?.trim()) {
  runNode('render-add-custom-domains.mjs');
} else {
  console.log('SKIP  Render — set RENDER_API_KEY (+ optional RENDER_SERVICE_ID), then re-run with --apply');
  console.log('      Or add custom domains in Render → Settings → Custom Domains:');
  console.log('        • executive.vgg.tools');
  console.log('        • vigipay.vgg.tools');
}

console.log('');
