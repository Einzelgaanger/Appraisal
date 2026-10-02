/** One-off: keep one employee_access row per subsidiary for Bunmi's primary login. */
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

const email = 'bunmi.akinyemiju@peopleos.co';
const { rows: profileRows } = await c.query(
  `SELECT id FROM auth.users WHERE lower(email) = $1`,
  [email],
);
const profileId = profileRows[0]?.id;
if (!profileId) {
  console.error('No profile for', email);
  process.exit(1);
}

await c.query(
  `
  DELETE FROM public.employee_access a
  USING public.employees e
  WHERE a.profile_id = $1
    AND a.employee_id = e.id
    AND a.ctid NOT IN (
      SELECT DISTINCT ON (e2.subsidiary_id) a2.ctid
      FROM public.employee_access a2
      JOIN public.employees e2 ON e2.id = a2.employee_id
      WHERE a2.profile_id = $1
      ORDER BY e2.subsidiary_id, e2.hierarchy_level NULLS LAST, e2.name
    )
  `,
  [profileId],
);

const check = await c.query(
  `
  SELECT s.name, e.email, e.name
  FROM employee_access a
  JOIN employees e ON e.id = a.employee_id
  JOIN subsidiaries s ON s.id = e.subsidiary_id
  WHERE a.profile_id = $1
  ORDER BY s.name
  `,
  [profileId],
);
console.table(check.rows);
await c.end();
