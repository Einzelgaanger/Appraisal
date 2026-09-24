/**
 * Apply a single migration file by name and record it in supabase_migrations.
 *
 * Usage: node scripts/apply-one-migration.mjs 20260922120000_pool_scope_admin_monitor.sql
 */
import pg from 'pg';
import { readFileSync } from 'fs';
import { join } from 'path';
import { loadDotEnv, projectRoot } from './load-env.mjs';

loadDotEnv();

const file = process.argv[2];
if (!file) {
  console.error('Usage: node scripts/apply-one-migration.mjs <file.sql>');
  process.exit(1);
}

const { Client } = pg;
const ref = 'qnorggoycwbbxdlvbcvq';
const password = process.env.SUPABASE_DB_PASSWORD?.trim();
if (!password) {
  console.error('Missing SUPABASE_DB_PASSWORD');
  process.exit(1);
}
const encoded = encodeURIComponent(password);
const hosts = ['aws-1-eu-west-1.pooler.supabase.com', 'aws-0-eu-west-1.pooler.supabase.com'];

let client;
for (const host of hosts) {
  const c = new Client({
    connectionString: `postgresql://postgres.${ref}:${encoded}@${host}:5432/postgres`,
    ssl: { rejectUnauthorized: false },
  });
  try {
    await c.connect();
    console.log('Connected via', host);
    client = c;
    break;
  } catch (e) {
    console.log('Fail', host, e.code || e.message);
    try { await c.end(); } catch { /* ignore */ }
  }
}
if (!client) process.exit(1);

const sql = readFileSync(join(projectRoot(), 'supabase', 'migrations', file), 'utf8');
const version = file.replace(/\.sql$/, '');

await client.query('BEGIN');
try {
  await client.query(sql);
  await client.query(
    `INSERT INTO supabase_migrations.schema_migrations (version, name)
     VALUES ($1, $2) ON CONFLICT (version) DO NOTHING`,
    [version, file],
  );
  await client.query('COMMIT');
  console.log('OK', file);
} catch (err) {
  await client.query('ROLLBACK');
  console.error('FAILED', file, err.message);
  await client.end();
  process.exit(1);
}

await Promise.race([
  client.end(),
  new Promise((_, reject) => setTimeout(() => reject(new Error('end-timeout')), 4000)),
]).catch(() => {
  try { client.end(); } catch { /* ignore */ }
});
process.exit(0);
