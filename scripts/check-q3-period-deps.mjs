/**
 * Find rows keyed to peer_360 + 2026-Q3 that would be orphaned by re-keying
 * the pre-streamlining submissions to 2026-Q3-legacy.
 *
 * Usage: node scripts/check-q3-period-deps.mjs
 */
import pg from 'pg';
import { loadDotEnv } from './load-env.mjs';

loadDotEnv();

const { Client } = pg;
const password = process.env.SUPABASE_DB_PASSWORD?.trim();
if (!password) {
  console.error('Missing SUPABASE_DB_PASSWORD');
  process.exit(1);
}

const client = new Client({
  connectionString: `postgresql://postgres.qnorggoycwbbxdlvbcvq:${encodeURIComponent(password)}@aws-1-eu-west-1.pooler.supabase.com:5432/postgres`,
  ssl: { rejectUnauthorized: false },
});
await client.connect();

// Every table carrying a period column, so nothing period-keyed is missed.
const tables = await client.query(`
  SELECT table_name FROM information_schema.columns
  WHERE table_schema = 'public' AND column_name = 'period'
  ORDER BY table_name
`);
console.log('--- tables with a period column ---');
for (const t of tables.rows) {
  const { rows } = await client.query(
    `SELECT COUNT(*)::int AS n FROM public.${t.table_name} WHERE period = '2026-Q3'`,
  );
  console.log(`${t.table_name.padEnd(38)} 2026-Q3 rows = ${rows[0].n}`);
}

const cons = await client.query(`
  SELECT c.conname, pg_get_constraintdef(c.oid) AS def
  FROM pg_constraint c
  JOIN pg_class t ON t.oid = c.conrelid
  WHERE t.relname = 'assessment_responses' AND c.contype IN ('u', 'p')
`);
console.log('\n--- assessment_responses unique/pk constraints ---');
for (const r of cons.rows) console.log(`${r.conname}: ${r.def}`);

const releases = await client.query(`
  SELECT f.code, pr.period, pr.released_at
  FROM public.assessment_period_releases pr
  JOIN public.assessment_forms f ON f.id = pr.form_id
  ORDER BY pr.period DESC, f.code
`);
console.log('\n--- release gates on record ---');
console.table(releases.rows);

const discussions = await client.query(`
  SELECT d.form_code, e.name AS subject, d.period,
         (SELECT COUNT(*)::int FROM public.assessment_responses r
          JOIN public.assessment_forms f ON f.id = r.form_id AND f.code = 'peer_360'
          WHERE r.reviewee_id = d.subject_employee_id AND r.period = '2026-Q3' AND r.status = 'submitted'
         ) AS q3_submitted_360
  FROM public.boom_result_discussions d
  JOIN public.employees e ON e.id = d.subject_employee_id
  WHERE d.period = '2026-Q3'
  ORDER BY d.form_code, e.name
`);
console.log('\n--- 2026-Q3 result discussions ---');
console.table(discussions.rows);

const q3Forms = await client.query(`
  SELECT f.code, r.status, COUNT(*)::int AS n
  FROM public.assessment_responses r
  JOIN public.assessment_forms f ON f.id = r.form_id
  WHERE r.period = '2026-Q3'
  GROUP BY f.code, r.status
  ORDER BY f.code, r.status
`);
console.log('\n--- all 2026-Q3 assessment_responses by form ---');
console.table(q3Forms.rows);

await client.end();
process.exit(0);
