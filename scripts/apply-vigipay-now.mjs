import pg from 'pg';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { loadDotEnv, projectRoot } from './load-env.mjs';

loadDotEnv();

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
  const url = `postgresql://postgres.${ref}:${encoded}@${host}:5432/postgres`;
  const c = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
  try {
    await c.connect();
    console.log('Connected via', host);
    client = c;
    break;
  } catch (e) {
    console.log('Fail', host, e.code || e.message);
    try {
      await c.end();
    } catch {
      /* ignore */
    }
  }
}

if (!client) process.exit(1);

const root = projectRoot();
const dir = join(root, 'supabase', 'migrations');
await client.query('CREATE SCHEMA IF NOT EXISTS supabase_migrations');
await client.query(`
  CREATE TABLE IF NOT EXISTS supabase_migrations.schema_migrations (
    version text PRIMARY KEY,
    statements text[],
    name text
  )
`);
const done = new Set(
  (await client.query('SELECT version FROM supabase_migrations.schema_migrations')).rows.map((r) => r.version),
);
const files = readdirSync(dir)
  .filter((f) => f.endsWith('.sql'))
  .sort();
const target = process.argv.includes('--all-pending')
  ? files.filter((f) => !done.has(f.replace(/\.sql$/, '')))
  : files.filter((f) => f.startsWith('20260916') && !done.has(f.replace(/\.sql$/, '')));
console.log('Applying', target.length, target.join(', ') || '(none)');

for (const file of target) {
  const version = file.replace(/\.sql$/, '');
  const sql = readFileSync(join(dir, file), 'utf8');
  console.log('Applying', file, 'bytes', sql.length);
  await client.query('BEGIN');
  try {
    await client.query(sql);
    await client.query('INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES ($1, $2)', [
      version,
      file,
    ]);
    await client.query('COMMIT');
    console.log('OK', file);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('FAILED', file, err.message);
    await client.end();
    process.exit(1);
  }
}

const counts = await client.query(
  'SELECT count(*)::int AS n FROM employees WHERE coalesce(vigipay_appraisal_active, false)',
);
const admins = await client.query(
  'SELECT name, email, company_admin, locked_tenant_slug FROM employees WHERE coalesce(company_admin, false) ORDER BY name',
);
const missingMgr = await client.query(
  `SELECT name FROM employees
   WHERE coalesce(vigipay_appraisal_active, false)
     AND ghc_manager_id IS NULL AND manager_id IS NULL
   ORDER BY name`,
);
const reports = await client.query(
  `SELECT m.name AS reviewer, count(*)::int AS n
   FROM employees e
   JOIN employees m ON m.id = coalesce(e.ghc_manager_id, e.manager_id)
   WHERE coalesce(e.vigipay_appraisal_active, false)
   GROUP BY m.name
   ORDER BY n DESC, m.name`,
);
const lockCount = await client.query(
  "SELECT count(*)::int AS n FROM employees WHERE locked_tenant_slug = 'vigipay'",
);
console.log('VigiPay active', counts.rows[0].n);
console.log('Locked to vigipay', lockCount.rows[0].n);
console.log('Admins', JSON.stringify(admins.rows, null, 2));
console.log('No manager', missingMgr.rows.map((r) => r.name).join(' | '));
const emmanuel = await client.query(
  `SELECT e.name, m.name AS manager
   FROM employees e
   LEFT JOIN employees m ON m.id = coalesce(e.ghc_manager_id, e.manager_id)
   WHERE e.name ILIKE 'Emmanuel Oriahi'`,
);
const extras = await client.query(
  `SELECT name, email, role FROM employees
   WHERE name IN ('Israel Ulelu', 'Kelvin Esekhile')
   ORDER BY name`,
);
const pool = await client.query("SELECT public.ghc_member_pool(id) AS pool FROM employees WHERE locked_tenant_slug = 'vigipay' LIMIT 1");
console.log('Emmanuel manager', emmanuel.rows);
console.log('Mapping extras', extras.rows);
console.log('Sample pool', pool.rows);
await Promise.race([
  client.end(),
  new Promise((_, reject) => setTimeout(() => reject(new Error('end-timeout')), 4000)),
]).catch(() => {
  try { client.end(); } catch { /* ignore */ }
});
process.exit(0);
