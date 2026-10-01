import pg from 'pg';
import { loadDotEnv } from './load-env.mjs';

loadDotEnv();
const ref = 'qnorggoycwbbxdlvbcvq';
const pw = encodeURIComponent(process.env.SUPABASE_DB_PASSWORD.trim());
const c = new pg.Client({
  connectionString: `postgresql://postgres.${ref}:${pw}@aws-1-eu-west-1.pooler.supabase.com:5432/postgres`,
  ssl: { rejectUnauthorized: false },
});
await c.connect();

const fiyin = await c.query(`
  SELECT name, email, company_admin, ghc_appraisal_active
  FROM employees WHERE email ILIKE '%fiyin%' OR name ILIKE '%Fiyin%'`);
console.log('Fiyin roster');
console.table(fiyin.rows);

const bunmi = await c.query(`
  SELECT u.email, count(a.*)::int AS companies, string_agg(s.name, ' | ' ORDER BY s.name) AS which
  FROM auth.users u
  JOIN employee_access a ON a.profile_id = u.id
  JOIN employees e ON e.id = a.employee_id
  JOIN subsidiaries s ON s.id = e.subsidiary_id
  WHERE u.email ILIKE '%bunmi%'
  GROUP BY u.email`);
console.log('Bunmi access');
console.table(bunmi.rows);

await c.end();
