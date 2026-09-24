/**
 * Apply a SQL file to the NEW Supabase project via pg + pooler.
 * Usage: node scripts/apply-sql-pg.mjs path/to/file.sql [markVersion]
 */
import { readFileSync } from 'fs';
import pg from 'pg';

function loadEnv() {
  const env = { ...process.env };
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
const file = process.argv[2];
const markVersion = process.argv[3];
if (!file) {
  console.error('Usage: node scripts/apply-sql-pg.mjs <sqlfile> [version]');
  process.exit(1);
}

const sql = readFileSync(file, 'utf8');
const ref = env.NEW_SUPABASE_PROJECT_REF || 'qnorggoycwbbxdlvbcvq';
const pwd = env.SUPABASE_DB_PASSWORD || env.NEW_SUPABASE_DB_PASSWORD;
if (!pwd) {
  console.error('Missing SUPABASE_DB_PASSWORD');
  process.exit(1);
}

const client = new pg.Client({
  host: 'aws-1-eu-west-1.pooler.supabase.com',
  port: 5432,
  user: `postgres.${ref}`,
  password: pwd,
  database: 'postgres',
  ssl: { rejectUnauthorized: false },
});

await client.connect();
try {
  console.log('Applying', file);
  await client.query(sql);
  if (markVersion) {
    await client.query(
      `insert into supabase_migrations.schema_migrations (version) values ($1) on conflict do nothing`,
      [markVersion],
    );
    console.log('Marked migration', markVersion);
  }
  console.log('OK');
} finally {
  await client.end();
}
