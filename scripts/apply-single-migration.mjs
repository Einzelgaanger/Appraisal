/** Apply one migration file by basename. Usage: node scripts/apply-single-migration.mjs 20261001140000_hr_access_group_overview.sql */
import pg from 'pg';
import { readFileSync } from 'fs';
import { join } from 'path';
import { loadDotEnv, projectRoot } from './load-env.mjs';

loadDotEnv();

const name = process.argv[2];
if (!name) {
  console.error('Usage: node scripts/apply-single-migration.mjs <filename.sql>');
  process.exit(1);
}

const ref = 'qnorggoycwbbxdlvbcvq';
const password = process.env.SUPABASE_DB_PASSWORD?.trim();
if (!password) {
  console.error('Missing SUPABASE_DB_PASSWORD');
  process.exit(1);
}

const url = `postgresql://postgres.${ref}:${encodeURIComponent(password)}@aws-1-eu-west-1.pooler.supabase.com:5432/postgres`;
const file = join(projectRoot(), 'supabase', 'migrations', name);
const sql = readFileSync(file, 'utf8');
const version = name.replace(/\.sql$/, '');

const c = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await c.connect();
await c.query('BEGIN');
try {
  await c.query(sql);
  await c.query(
    `INSERT INTO supabase_migrations.schema_migrations (version) VALUES ($1) ON CONFLICT DO NOTHING`,
    [version],
  );
  await c.query('COMMIT');
  console.log(`Applied ${name}`);
} catch (e) {
  await c.query('ROLLBACK');
  console.error(e);
  process.exit(1);
} finally {
  await c.end();
}
