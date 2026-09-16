/**
 * Apply pending SQL migrations via direct Postgres (no Supabase CLI login).
 * Requires SUPABASE_DB_PASSWORD or DATABASE_URL in .env.
 *
 * Usage: node scripts/apply-migrations.mjs
 */
import pg from 'pg';
import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { loadDotEnv, projectRoot } from './load-env.mjs';

loadDotEnv();

const { Client } = pg;
const root = projectRoot();
const migrationsDir = join(root, 'supabase', 'migrations');

function projectRef() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
  const m = url.match(/https:\/\/([^.]+)\.supabase\.co/);
  if (m) return m[1];
  const config = join(root, 'supabase', 'config.toml');
  const hit = readFileSync(config, 'utf8').match(/^project_id\s*=\s*"([^"]+)"/m);
  if (hit) return hit[1];
  throw new Error('Could not resolve project ref');
}

function candidateUrls() {
  if (process.env.DATABASE_URL?.trim()) return [process.env.DATABASE_URL.trim()];
  const password = process.env.SUPABASE_DB_PASSWORD?.trim();
  if (!password) {
    console.error('Missing SUPABASE_DB_PASSWORD or DATABASE_URL in .env');
    process.exit(1);
  }
  const ref = projectRef();
  const encoded = encodeURIComponent(password);
  return [
    `postgresql://postgres.${ref}:${encoded}@aws-1-eu-west-1.pooler.supabase.com:5432/postgres`,
    `postgresql://postgres.${ref}:${encoded}@aws-0-eu-west-1.pooler.supabase.com:5432/postgres`,
    `postgresql://postgres:${encoded}@db.${ref}.supabase.co:5432/postgres`,
  ];
}

function migrationVersion(filename) {
  return filename.replace(/\.sql$/, '');
}

async function ensureMigrationsTable(client) {
  await client.query('CREATE SCHEMA IF NOT EXISTS supabase_migrations');
  await client.query(`
    CREATE TABLE IF NOT EXISTS supabase_migrations.schema_migrations (
      version text PRIMARY KEY,
      statements text[],
      name text
    )
  `);
}

async function appliedVersions(client) {
  const { rows } = await client.query(
    'SELECT version FROM supabase_migrations.schema_migrations ORDER BY version',
  );
  return new Set(rows.map((r) => r.version));
}

let client = null;
for (const url of candidateUrls()) {
  const c = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
  try {
    await c.connect();
    console.log('Connected to database');
    client = c;
    break;
  } catch (e) {
    console.log('Connect failed', e.code || e.message);
    try { await c.end(); } catch { /* ignore */ }
  }
}
if (!client) {
  console.error('Could not connect to Postgres (tried pooler + direct).');
  process.exit(1);
}

try {
  await ensureMigrationsTable(client);
  const done = await appliedVersions(client);

  const files = readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  const pending = files.filter((f) => !done.has(migrationVersion(f)));
  if (!pending.length) {
    console.log('No pending migrations.');
    process.exit(0);
  }

  console.log(`Pending: ${pending.length} migration(s)`);

  for (const file of pending) {
    const version = migrationVersion(file);
    const sql = readFileSync(join(migrationsDir, file), 'utf8');
    console.log(`\nApplying ${file} ...`);
    await client.query('BEGIN');
    try {
      await client.query(sql);
      await client.query(
        `INSERT INTO supabase_migrations.schema_migrations (version, name)
         VALUES ($1, $2)`,
        [version, file],
      );
      await client.query('COMMIT');
      console.log(`OK: ${file}`);
    } catch (err) {
      await client.query('ROLLBACK');
      console.error(`FAILED: ${file}`);
      throw err;
    }
  }

  console.log('\nAll pending migrations applied.');
} finally {
  await client.end();
}
